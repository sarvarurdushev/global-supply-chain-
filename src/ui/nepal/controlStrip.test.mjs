import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { installTestDom } from '../../workspace/testDom.mjs';

installTestDom();

const { CONTROL_WIDGETS, renderControlStrip } = await import('./controlStrip.js');
const { SCENES, scene } = await import('../../nepal/story/scenes.js');
const { ANALYSIS_ARTEFACTS, createIntelligence } = await import(
  '../../nepal/story/artefacts.js'
);
const { createNepalInvestigation } = await import(
  '../../nepal/story/investigation.js'
);

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

let cached = null;
async function realIntelligence() {
  if (cached) return cached;
  const parsed = {};
  for (const [key, file] of Object.entries(ANALYSIS_ARTEFACTS)) {
    parsed[key] = JSON.parse(
      await readFile(`${ROOT}data/analysis/${file}`, 'utf8'),
    );
  }
  cached = createIntelligence(parsed);
  return cached;
}

function recorder() {
  const calls = [];
  return {
    calls,
    on: {
      control: (key, value) => calls.push(['control', key, value]),
      select: (patch) => calls.push(['select', patch]),
      layer: (id, value) => calls.push(['layer', id, value]),
      filter: (values) => calls.push(['filter', values]),
    },
  };
}

test('every control a scene declares has a widget', () => {
  /*
   * A scene naming a control nothing builds would render a strip missing the
   * one thing that scene is meant to let you vary — and say nothing about it.
   */
  const declared = new Set(SCENES.flatMap((entry) => entry.controls ?? []));
  const missing = [...declared].filter((name) => !CONTROL_WIDGETS[name]);
  assert.deepEqual(missing, []);
  assert.ok(declared.size >= 10, `only ${declared.size} controls declared`);
  /*
   * And no widget exists for a control no scene declares. `ghostNetwork` was
   * one: a toggle for today's OpenStreetMap over April 2015's, whose data
   * this project does not hold — only a MEASURE of the growth. Both the
   * control and its widget are gone, and the figure stays in the panel as a
   * statement.
   */
  const orphans = Object.keys(CONTROL_WIDGETS).filter(
    (name) => !declared.has(name),
  );
  assert.deepEqual(orphans, []);
});

test('a scene with no controls renders no strip at all', () => {
  /*
   * The design is explicit: an empty strip beats a strip of disabled
   * controls. A greyed-out slider says the product is broken; nothing says
   * this scene is a statement.
   */
  const investigation = createNepalInvestigation({ scene: 0 });
  assert.deepEqual(scene('case-card').controls ?? [], []);
  assert.equal(
    renderControlStrip({
      state: investigation.state,
      intelligence: null,
      on: recorder().on,
    }),
    null,
  );
});

test('every scene with controls builds them from the real artefacts', async () => {
  const intelligence = await realIntelligence();
  const built = [];
  for (const entry of SCENES) {
    if (!(entry.controls?.length > 0)) continue;
    const investigation = createNepalInvestigation({ scene: entry.index });
    const strip = renderControlStrip({
      state: investigation.state,
      intelligence,
      on: recorder().on,
    });
    assert.ok(strip, `${entry.id} declares controls and built none`);
    assert.doesNotMatch(
      strip.textContent,
      /control unavailable/,
      `${entry.id}: ${strip.textContent}`,
    );
    assert.ok(
      strip.querySelectorAll('.ndi-controls__group').length > 0,
      `${entry.id} built an empty strip`,
    );
    built.push(entry.id);
  }
  /*
   * Counted from the scene list rather than typed, so adding a control to a
   * scene cannot leave this assertion behind.
   */
  const declaring = SCENES.filter((entry) => entry.controls?.length > 0);
  assert.equal(built.length, declaring.length);
  assert.equal(built.length, 15, `${built.length} scenes carry controls`);
});

test('the options come from the artefacts, not from a list somebody typed', async () => {
  const intelligence = await realIntelligence();
  const state = createNepalInvestigation({ scene: 4 }).state;
  const rec = recorder();

  /* MMI: exactly the contour levels the ShakeMap can close. */
  const mmi = CONTROL_WIDGETS.intensityThreshold(intelligence, state, rec.on);
  const offered = [...mmi.querySelectorAll('.ndi-controls__chip')].map(
    (chip) => Number(chip.dataset.value),
  );
  assert.deepEqual(offered, intelligence.exposure.usableLevels);
  /* And the excluded levels are NOT offered: their contours cannot be closed. */
  for (const excluded of [3, 3.5, 4]) {
    assert.ok(!offered.includes(excluded), `MMI ${excluded} must not be offered`);
  }

  /* Districts: the nine that carry an observation, not all seventy-five. */
  const picker = CONTROL_WIDGETS.districtPicker(
    intelligence,
    createNepalInvestigation({ scene: 7 }).state,
    rec.on,
  );
  const districts = [...picker.querySelectorAll('.ndi-controls__chip')].map(
    (chip) => chip.dataset.value,
  );
  assert.deepEqual(
    districts,
    intelligence.damage.byDistrict.map((row) => row.district),
  );
  assert.equal(districts.length, 9);
  assert.match(picker.textContent, /9 of 75 observed/);

  /* Routes: the fourteen pairs Stage 5 measured. */
  const routes = CONTROL_WIDGETS.originDestination(
    intelligence,
    createNepalInvestigation({ scene: 14 }).state,
    rec.on,
  );
  assert.equal(routes.querySelectorAll('.ndi-controls__chip').length, 14);
  assert.match(routes.textContent, /14 measured/);
});

test('a control writes to the state machine, and to the right part of it', async () => {
  const intelligence = await realIntelligence();
  const rec = recorder();
  const at = (index) => createNepalInvestigation({ scene: index }).state;

  const mmi = CONTROL_WIDGETS.intensityThreshold(intelligence, at(4), rec.on);
  mmi.querySelectorAll('.ndi-controls__chip')[2].click();
  assert.deepEqual(rec.calls.at(-1), [
    'control',
    'intensityThreshold',
    intelligence.exposure.usableLevels[2],
  ]);

  /* A district is a SELECTION, not a control: it cross-filters everything. */
  const picker = CONTROL_WIDGETS.districtPicker(intelligence, at(7), rec.on);
  picker.querySelectorAll('.ndi-controls__chip')[0].click();
  assert.deepEqual(rec.calls.at(-1), [
    'select',
    { district: intelligence.damage.byDistrict[0].district },
  ]);

  /* The class filter ticks on, and "EVERYTHING" clears it rather than hiding all. */
  const filter = CONTROL_WIDGETS.resultClassFilter(intelligence, at(17), rec.on);
  const chips = [...filter.querySelectorAll('.ndi-controls__chip')];
  chips[0].click();
  assert.equal(rec.calls.at(-1)[0], 'filter');
  assert.equal(rec.calls.at(-1)[1].length, 1);
  chips.at(-1).click();
  assert.deepEqual(rec.calls.at(-1), ['filter', []]);
});

test('scene 18 offers no way to construct a plan, and names what it cannot remove', async () => {
  /*
   * The scene's whole point is the fence. Its controls re-run an existing
   * engine over observed inputs; nothing here produces an arrival time, a
   * casualty figure or a rescue priority.
   */
  const intelligence = await realIntelligence();
  const strip = renderControlStrip({
    state: createNepalInvestigation({ scene: 18 }).state,
    intelligence,
    on: recorder().on,
  });
  const text = strip.textContent;
  assert.doesNotMatch(
    text,
    /evacuat|rescue|casualt|fatalit|arrival|priorit|optimal|recommend/i,
    text,
  );
  /* Five bridges observed, one matched: the toggle states both. */
  const bridges = intelligence.infrastructure.network.bridgesOnly;
  assert.match(
    text,
    new RegExp(`${bridges.matchedToNetwork} matched bridge of ${bridges.bridges} observed`),
  );
});

test('one broken control does not take the scene strip with it', async () => {
  /*
   * And it does not vanish quietly either: a control that silently
   * disappears is indistinguishable from a scene that never had it.
   */
  const intelligence = await realIntelligence();
  const state = {
    ...createNepalInvestigation({ scene: 4 }).state,
    scene: { ...scene('shaking'), controls: ['intensityThreshold', 'nonsense'] },
  };
  const strip = renderControlStrip({ state, intelligence, on: recorder().on });
  assert.ok(strip.querySelectorAll('.ndi-controls__group').length >= 1);
  assert.match(strip.textContent, /control unavailable: nonsense/);
});
