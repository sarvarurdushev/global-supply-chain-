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
  assert.match(text, /22/, 'analyses');
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
  const bar = renderTopBar({ header, state: inv.state, onMode: (mode) => picked.push(mode) });
  const buttons = bar.querySelectorAll('button');
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'true');
  buttons[1].click();
  assert.deepEqual(picked, [MODE.PRESENT]);
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
  assert.match(damage, /4583/);
  assert.match(damage, /2084/);
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
