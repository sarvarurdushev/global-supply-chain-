import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installTestDom } from '../../workspace/testDom.mjs';

installTestDom();

const { ANALYSIS_ARTEFACTS, createIntelligence, headerState } = await import(
  '../../nepal/story/artefacts.js'
);
const { createNepalInvestigation, MODE } = await import('../../nepal/story/investigation.js');
const { SCENES, scene } = await import('../../nepal/story/scenes.js');
const { renderTopBar } = await import('./topBar.js');
const { renderSceneRail } = await import('./sceneRail.js');
const { renderIntelPanel } = await import('./intelPanel.js');
const { findForbiddenPhrasing } = await import('../../nepal/analysis/terminology.js');

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const parsed = {};
for (const [key, file] of Object.entries(ANALYSIS_ARTEFACTS)) {
  parsed[key] = JSON.parse(await readFile(path.join(ROOT, 'data', 'analysis', file), 'utf8'));
}
const intelligence = createIntelligence(parsed);
const header = headerState(intelligence, { loaded: 5, total: 5 });

test('the header states only real application figures', () => {
  const inv = createNepalInvestigation();
  const text = renderTopBar({ header, state: inv.state }).textContent;
  assert.match(text, /NATURAL DISASTER INTELLIGENCE/);
  assert.match(text, /CASE NPL-2015-EQ/);
  assert.match(text, /10/, 'datasets');
  assert.match(text, /23/, 'analyses — 22 until the Scene 06 quadrant record was added');
  assert.match(text, /38\/38/, 'checks');
  assert.match(text, /READY/);
  // No invented telemetry.
  assert.doesNotMatch(text, /ONLINE|LIVE FEED|UPLINK/i);
});

test('a constructed scene carries the scenario band across the whole header', () => {
  /*
   * The point is that it should be impossible to screenshot a route from this
   * product without the word SCENARIO in frame.
   */
  const inv = createNepalInvestigation();
  inv.goTo('observed-damage');
  assert.doesNotMatch(renderTopBar({ header, state: inv.state }).textContent, /SCENARIO/);
  for (const id of ['network', 'route', 'scenarios']) {
    inv.goTo(id);
    assert.match(
      renderTopBar({ header, state: inv.state }).textContent,
      /SCENARIO/,
      `${id} must carry the band`,
    );
  }
});

test('the mode switch reports and changes who is driving', () => {
  const inv = createNepalInvestigation();
  const picked = [];
  const bar = renderTopBar({
    header,
    state: inv.state,
    onMode: (mode, options) => picked.push([mode, options?.length ?? null]),
  });
  const buttons = bar.querySelectorAll('button');
  assert.deepEqual(
    buttons.map((button) => button.textContent),
    ['EXPLORE', 'PRESENT', '6 MIN'],
  );
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'true');
  buttons[1].click();
  buttons[2].click();
  assert.deepEqual(picked, [
    [MODE.PRESENT, 'full'],
    [MODE.PRESENT, 'short'],
  ]);

  /* Presenting the short run lights the short button, not PRESENT. */
  inv.setMode(MODE.PRESENT);
  const presenting = renderTopBar({ header, state: inv.state, presentLength: 'short' })
    .querySelectorAll('button')
    .map((button) => button.getAttribute('aria-pressed'));
  assert.deepEqual(presenting, ['false', 'false', 'true']);
});

test('the rail lists every scene, grouped by act, and marks where you are', () => {
  const inv = createNepalInvestigation();
  inv.goTo(9);
  const chosen = [];
  const rail = renderSceneRail({ state: inv.state, onScene: (index) => chosen.push(index) });
  const buttons = rail.querySelectorAll('button');
  assert.equal(buttons.length, SCENES.length);
  assert.equal(rail.querySelectorAll('section').length, 3);
  const current = buttons.filter((button) => button.getAttribute('aria-current') === 'step');
  assert.equal(current.length, 1);
  assert.equal(current[0].dataset.scene, '9');
  // Every scene is reachable: the rail is navigation, not a rail-road.
  buttons[0].click();
  buttons[18].click();
  assert.deepEqual(chosen, [0, 18]);
});

test('every scene renders a panel from the artefacts, with no unresolved figure', () => {
  /*
   * The failure this catches is the one the accessors exist to prevent: a
   * renamed artefact field turning a figure into a blank card. Here it would
   * surface as the error body instead, and this fails.
   */
  const inv = createNepalInvestigation();
  for (const entry of SCENES) {
    inv.goTo(entry.index);
    const node = renderIntelPanel({ intelligence, state: inv.state });
    const text = node.textContent;
    assert.doesNotMatch(text, /could not resolve a figure/, `${entry.id} failed to resolve`);
    assert.doesNotMatch(text, /not yet built/, `${entry.id} has no panel`);
    assert.match(text, /\S/);
  }
});

test('every panel states its question, its limitations and its result class', () => {
  const inv = createNepalInvestigation();
  for (const entry of SCENES) {
    inv.goTo(entry.index);
    const node = renderIntelPanel({ intelligence, state: inv.state });
    const text = node.textContent;
    assert.ok(text.includes(entry.question), `${entry.id} does not state its question`);
    for (const limitation of entry.limitations) {
      assert.ok(
        text.includes(limitation),
        `${entry.id} drops a limitation: ${limitation.slice(0, 40)}`,
      );
    }
    assert.ok(
      node.querySelectorAll('.ndi-class').length > 0,
      `${entry.id} shows no result-class chip`,
    );
  }
});

test('a figure a reader distrusts is one click from its methodology', () => {
  const inv = createNepalInvestigation();
  inv.goTo('model-vs-observed');
  const opened = [];
  const node = renderIntelPanel({
    intelligence,
    state: inv.state,
    onMethodology: (id) => opened.push(id),
  });
  const why = node.querySelectorAll('button').find((b) => b.textContent.includes('why is this here'));
  assert.ok(why, 'every panel citing an analysis must offer the record');
  why.click();
  assert.deepEqual(opened, ['damage-by-intensity']);
  assert.ok(intelligence.methodologyFor(opened[0]), 'and the record must exist');
});

test('the headline figures on screen are the artefact figures', () => {
  const inv = createNepalInvestigation();
  inv.goTo('observed-damage');
  const damage = renderIntelPanel({ intelligence, state: inv.state }).textContent;
  assert.match(damage, /4,?583/);
  assert.match(damage, /2,084/);
  assert.match(damage, /45\.5%/);

  inv.goTo('model-vs-observed');
  const model = renderIntelPanel({ intelligence, state: inv.state }).textContent;
  assert.match(model, /0\.167/, "Cramér's V");
  assert.match(model, /255\.5/, 'chi-square');

  inv.goTo('exposure');
  const exposure = renderIntelPanel({ intelligence, state: inv.state }).textContent;
  assert.match(exposure, /13\.84 million/);
  assert.match(exposure, /geographically exposed to modelled shaking/);
});

test('a control moves the figure it governs', () => {
  const inv = createNepalInvestigation();
  inv.goTo('exposure');
  const atSix = renderIntelPanel({ intelligence, state: inv.state }).textContent;
  inv.setControl('intensityThreshold', 8);
  const atEight = renderIntelPanel({ intelligence, state: inv.state }).textContent;
  assert.match(atSix, /13\.84 million/);
  assert.match(atEight, /235,000/);
  assert.notEqual(atSix, atEight, 'the threshold must drive the panel');
});

test('no panel uses forbidden terminology except to forbid it', () => {
  const inv = createNepalInvestigation();
  for (const entry of SCENES) {
    inv.goTo(entry.index);
    const text = renderIntelPanel({ intelligence, state: inv.state }).textContent;
    for (const hit of findForbiddenPhrasing(text)) {
      // The only sanctioned appearance is inside a sentence that forbids it.
      const forbidding = /\bnot\b|\bnever\b|\bnothing about\b/i.test(text);
      assert.ok(
        forbidding,
        `${entry.id} uses "${hit.phrase}" without forbidding it`,
      );
    }
  }
});

test('a panel whose figure cannot be resolved reports it instead of taking the app down', () => {
  const inv = createNepalInvestigation();
  inv.goTo('observed-damage');
  const broken = { ...intelligence, damage: null };
  const node = renderIntelPanel({ intelligence: broken, state: inv.state });
  assert.match(node.textContent, /could not resolve a figure/);
  // And the scene's own content still renders, so the failure is contained.
  assert.ok(node.textContent.includes(scene('observed-damage').question));
});

test('every panel states where its numbers came from and how they were made', async () => {
  /*
   * The product's central promise is that a figure never appears without its
   * provenance. Scenes 16 and 17 — the two most about provenance — had no
   * source line at all, because it was built from Tier 2 datasets alone and
   * their evidence lives entirely in the analysis artefacts.
   */
  const incomplete = [];
  for (const entry of SCENES) {
    const state = createNepalInvestigation({ scene: entry.index }).state;
    const panel = renderIntelPanel({ intelligence, state, onMethodology() {} });
    const problems = [];
    if (!/SOURCE/.test(panel.textContent)) problems.push('no source line');
    if (!panel.querySelector('.ndi-panel__why')) problems.push('no methodology link');
    if (panel.querySelectorAll('.ndi-class').length === 0) problems.push('no result class');
    if (problems.length > 0) incomplete.push(`${entry.index} ${entry.id}: ${problems.join(', ')}`);
  }
  assert.deepEqual(incomplete, []);
});

test('every methodology link opens a record that exists', () => {
  /*
   * A link that opens nothing is worse than no link, so the ids a scene
   * cites are checked against the artefacts rather than trusted.
   */
  const missing = [];
  for (const entry of SCENES) {
    for (const id of entry.analyses ?? []) {
      if (!intelligence.methodologyFor(id)) missing.push(`${entry.id} → ${id}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('no panel says the same thing twice', () => {
  /*
   * Seven scenes printed their caveat and then the scene's limitation,
   * verbatim, in adjacent paragraphs. A prefix match fixed the verbatim ones;
   * a screenshot pass then found six more that differed only by a subject or
   * a colon. Measured here independently of the renderer: the share of the
   * shorter statement's content words that the longer one also uses.
   */
  const STOP = new Set(
    'the a an of and or to in on is are was were be by for from with this that it its as at not no only than which who what'.split(' '),
  );
  const words = (text) =>
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\- ]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP.has(w)),
    );
  const repeated = [];
  for (const entry of SCENES) {
    const state = createNepalInvestigation({ scene: entry.index }).state;
    const panel = renderIntelPanel({ intelligence, state, onMethodology() {} });
    const pool = new Set((entry.limitations ?? []).flatMap((limit) => [...words(limit)]));
    for (const node of panel.querySelectorAll('.ndi-panel__caveat')) {
      const caveat = words(node.textContent);
      let covered = 0;
      for (const word of caveat) if (pool.has(word)) covered += 1;
      if (caveat.size >= 4 && covered / caveat.size >= 0.9)
        repeated.push(`${entry.id}: stitched from the limits — ${node.textContent.slice(0, 40)}…`);
      for (const limit of (entry.limitations ?? []).map(words)) {
        const [short, long] = caveat.size <= limit.size ? [caveat, limit] : [limit, caveat];
        let shared = 0;
        for (const word of short) if (long.has(word)) shared += 1;
        if (short.size >= 4 && shared / short.size >= 0.75)
          repeated.push(`${entry.id}: ${node.textContent.slice(0, 50)}…`);
      }
    }
  }
  assert.deepEqual(repeated, []);
});

test('the limitations are a labelled list, not a browser-default one', () => {
  const state = createNepalInvestigation({ scene: 1 }).state;
  const panel = renderIntelPanel({ intelligence, state, onMethodology() {} });
  const list = panel.querySelector('.ndi-panel__limits');
  assert.ok(list, 'the list exists');
  const label = panel.querySelector(`#${list.getAttribute('aria-labelledby')}`);
  assert.equal(label?.textContent, 'Limits');
  const children = [...list.children];
  assert.equal(children.length, state.scene.limitations.length);
  assert.ok(children.every((child) => child.tagName === 'LI'), 'a list holds only items');
});

test('a caveat with no matching limitation is kept', () => {
  /*
   * The rule is "do not say it twice", not "the body may not have caveats".
   * Named rather than counted: these four add something no limitation says —
   * cells vs districts, what an unexamined district means, where the two
   * product families were tasked, and how the four clocks may be read.
   */
  const kept = SCENES.filter((entry) => {
    const state = createNepalInvestigation({ scene: entry.index }).state;
    const panel = renderIntelPanel({ intelligence, state, onMethodology() {} });
    return panel.querySelectorAll('.ndi-panel__caveat').length > 0;
  }).map((entry) => entry.id);
  for (const id of ['overlap', 'descend', 'coverage-gap', 'four-clocks'])
    assert.ok(kept.includes(id), `${id} lost a caveat that says something new`);
});

test('a layer toggle carries the colour its layer is drawn in', async () => {
  /*
   * Scene 11 drew amber roads, orange landslides and red bridges with no key
   * anywhere on screen. The key is read from the same table the map uses.
   */
  const { renderControlStrip } = await import('./controlStrip.js');
  const { LAYER_SWATCHES } = await import('../../nepal/story/mapModel.js');
  const state = createNepalInvestigation({ scene: 11 }).state;
  const strip = renderControlStrip({ intelligence, state, on: { layer() {}, control() {} } });
  const chips = [...strip.querySelectorAll('.ndi-controls__chip')].filter((chip) =>
    chip.querySelector('.ndi-controls__swatch'),
  );
  assert.equal(chips.length, 3, 'roads, bridges and landslides each carry a key');
  for (const chip of chips) {
    const layer = chip.textContent.trim().replace(/ /g, '-');
    assert.ok(LAYER_SWATCHES[layer], `${layer} has a swatch`);
  }
});

test('a headline figure can say where it came from, in place', () => {
  /*
   * Part J: 13.84M → SOURCE / METHOD / CLASS / LIMITATION without leaving the
   * scene. Everything on the card is read from the methodology record.
   */
  const toggled = [];
  const state = createNepalInvestigation({ scene: 4 }).state;
  const closed = renderIntelPanel({
    intelligence,
    state,
    on: { provenance: (id) => toggled.push(id) },
  });
  const button = closed.querySelector('.ndi-figure__info');
  assert.ok(button, 'the headline carries an info button');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(closed.querySelector('.ndi-prov'), null, 'closed until asked');
  button.click();
  assert.deepEqual(toggled, ['exposure-population-by-intensity']);

  const open = renderIntelPanel({
    intelligence,
    state,
    on: { provenance() {} },
    provenance: 'exposure-population-by-intensity',
  });
  const card = open.querySelector('.ndi-prov');
  assert.ok(card, 'the card opens under the figure');
  const kids = open.querySelector('.ndi-panel__body').children;
  const at = kids.indexOf(card);
  assert.equal(kids[at - 1]?.getAttribute('data-analysis'), 'exposure-population-by-intensity');
  const text = card.textContent;
  assert.match(text, /Source/);
  assert.match(text, /WorldPop 2015/);
  assert.match(text, /USGS ShakeMap/);
  assert.match(text, /Method/);
  assert.match(text, /DERIVED/);
  assert.match(text, /EXPOSURE IS NOT HARM/);
  assert.equal(open.querySelector('.ndi-figure__info').getAttribute('aria-expanded'), 'true');
});

test('every headline that cites a record resolves to one', () => {
  const missing = [];
  for (const entry of SCENES) {
    const state = createNepalInvestigation({ scene: entry.index }).state;
    const panel = renderIntelPanel({ intelligence, state, on: { provenance() {} } });
    for (const node of panel.querySelectorAll('.ndi-figure__info')) {
      const id = node.getAttribute('data-provenance');
      if (!intelligence.methodologyFor(id)) missing.push(`${entry.id} → ${id}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('Scene 06 resolves its quadrant figure to the Stage 4 record, read from the artefact', () => {
  /*
   * Stage 8 showed a "no methodology record" card here. The record now comes
   * from the analysis artefact; nothing about it is written in the frontend.
   */
  const state = createNepalInvestigation({ scene: 6 }).state;
  const id = renderIntelPanel({ intelligence, state, on: { provenance() {} } })
    .querySelector('.ndi-figure__info')
    .getAttribute('data-provenance');
  assert.equal(id, 'exposure-population-intensity-quadrants');
  const record = intelligence.methodologyFor(id);
  assert.ok(record, 'the artefact carries the record');
  const card = renderIntelPanel({ intelligence, state, on: { provenance() {} }, provenance: id })
    .querySelector('.ndi-prov');
  assert.ok(card);
  const text = card.textContent;
  assert.match(text, /Population × shaking intensity quadrants/);
  assert.match(text, /WorldPop 2015/);
  assert.match(text, /USGS ShakeMap/);
  assert.match(text, /DERIVED/);
  assert.match(text, /GEOGRAPHIC EXPOSURE, NOT HARM/);
  assert.ok(text.includes(record.spatialCoverage), 'coverage comes from the record');
  assert.doesNotMatch(text, /No methodology record/);
  assert.deepEqual(findForbiddenPhrasing(text), []);
});

test('the footer link opens provenance instead of dispatching into nothing', () => {
  const toggled = [];
  const emitted = [];
  const state = createNepalInvestigation({ scene: 12 }).state;
  const panel = renderIntelPanel({
    intelligence,
    state,
    on: { provenance: (id) => toggled.push(id) },
    onMethodology: (id) => emitted.push(id),
  });
  panel.querySelector('.ndi-panel__why').click();
  assert.deepEqual(toggled, [state.scene.analyses[0]]);
  assert.deepEqual(emitted, [state.scene.analyses[0]], 'the event still fires for any listener');
  /* A statement-led scene places the card at the top of the body. */
  const open = renderIntelPanel({
    intelligence,
    state,
    on: { provenance() {} },
    provenance: state.scene.analyses[0],
  });
  assert.equal(open.querySelector('.ndi-panel__body').children[0].classList.contains('ndi-prov'), true);
});

test('Scene 09 is staged when presented: map, then statistic, then reversal', () => {
  /*
   * The three beats used to render identically — nothing read the beat's
   * `panel` — so the reveal the scene is designed around never happened.
   */
  const state = createNepalInvestigation({ scene: 9 }).state;
  const text = (focus) =>
    renderIntelPanel({ intelligence, state, on: { provenance() {} }, focus }).textContent;

  const first = text({ panel: 'lookAtTheMap' });
  assert.match(first, /Look at the map first/);
  assert.doesNotMatch(first, /Cramér/);
  assert.doesNotMatch(first, /different towns/, 'the limits would give the reversal away');

  const second = text({ panel: 'chiSquare' });
  assert.match(second, /Cramér/);
  assert.doesNotMatch(second, /Sundar Bazar/);

  const third = text({ panel: 'withinArea', mapAction: 'isolateAreas' });
  assert.match(third, /Sundar Bazar/);
  assert.match(third, /different towns/);

  /* Explore mode (no focus) is the whole scene at once. */
  assert.equal(text(null), third);
});
