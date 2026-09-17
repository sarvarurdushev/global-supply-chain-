import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, createInvestigation, layerGroupsFor } from './investigation.js';
import { buildCatalogue, curatedCase } from './catalogue.js';

function build(caseId = 'nepal-gorkha-2015') {
  const entry = buildCatalogue().cases.find((item) => item.id === caseId);
  const intents = [];
  const states = [];
  const investigation = createInvestigation({
    case: entry,
    onIntent: (intent) => intents.push(intent),
    onChange: (state) => states.push(state),
  });
  /** Run every queued step of a descent synchronously. */
  const drain = (timers) => {
    let guard = 0;
    while (timers.length > 0 && guard < 100) {
      timers.shift()();
      guard += 1;
    }
  };
  return { entry, investigation, intents, states, drain };
}

test('an investigation refuses to start without a descent or a timeline', () => {
  assert.throws(() => createInvestigation({}), /requires a case/);
  assert.throws(
    () => createInvestigation({ case: { id: 'x', hazardId: 'earthquake' } }),
    /no zoom path/,
  );
  assert.throws(
    () =>
      createInvestigation({
        case: { id: 'x', hazardId: 'not-a-hazard', zoomPath: [{}, {}] },
      }),
    /no timeline phases/,
  );
});

/* ------------------------------------------------------------------ *
 * Depth and phase are independent (§18 + §4)
 * ------------------------------------------------------------------ */

test('moving the timeline does not move the camera off the current level', () => {
  /*
   * The requirement this pins down. Coupling depth to phase was the obvious
   * first design and it made the interface a slideshow: a user who had
   * descended to a city at T+6h was thrown back to the country view whenever
   * they stepped the clock.
   */
  const { investigation, intents } = build();
  investigation.goToDepth(5);
  const before = investigation.getState().depth;
  const cameraIntentsBefore = intents.filter((i) => i.kind === 'camera').length;

  investigation.goToPhase(4);
  const after = investigation.getState();
  assert.equal(after.depth.name, before.name, 'still at the same place');
  assert.equal(after.depth.index, before.index);
  assert.equal(
    intents.filter((i) => i.kind === 'camera').length,
    cameraIntentsBefore,
    'a phase change must not issue a camera move',
  );
  assert.equal(after.phase.index, 4);
});

test('descending emits one camera move per rung, not one flight to the bottom', () => {
  /*
   * §3: the transition should feel like Global → South Asia → Nepal. A single
   * flight from orbit to a street shows the reader nothing on the way.
   */
  const { investigation, intents, drain } = build();
  const timers = [];
  investigation.descend({ setTimer: (fn) => timers.push(fn), holdMs: 0 });
  drain(timers);
  const cameras = intents.filter((i) => i.kind === 'camera');
  const names = cameras.map((i) => i.name);
  assert.ok(names.includes('South Asia'));
  assert.ok(names.includes('Nepal'));
  assert.ok(names.includes('Kathmandu'));
  assert.equal(investigation.getState().depth.index, investigation.ladder.length - 1);
  assert.equal(investigation.getState().descending, false);
});

test('borders are drawn at the region and country rungs only', () => {
  /*
   * §3 LEVEL 1 asks for the national border drawn and the neighbours
   * distinguished at exactly that point: earlier it is noise, later the camera
   * is inside the country and the outline is off-screen.
   */
  const { investigation, intents, drain } = build();
  const timers = [];
  investigation.descend({ setTimer: (fn) => timers.push(fn), holdMs: 0 });
  drain(timers);
  const withBorders = intents.filter((i) => i.kind === 'camera' && i.drawBorders);
  assert.deepEqual(
    withBorders.map((i) => i.rungKind),
    ['REGION', 'COUNTRY'],
  );
  const country = withBorders.find((i) => i.rungKind === 'COUNTRY');
  assert.equal(country.highlightCountry, 'NPL');
});

test('a descent in progress cannot be started twice', () => {
  const { investigation } = build();
  const timers = [];
  assert.equal(investigation.descend({ setTimer: (fn) => timers.push(fn) }), true);
  assert.equal(investigation.descend({ setTimer: (fn) => timers.push(fn) }), false);
  assert.equal(investigation.stopDescent(), true);
  assert.equal(investigation.stopDescent(), false);
});

test('depth and phase clamp at both ends instead of running off', () => {
  const { investigation } = build();
  investigation.goToDepth(-5);
  assert.equal(investigation.getState().depth.index, 0);
  assert.equal(investigation.getState().depth.canGoShallower, false);
  investigation.goToDepth(999);
  assert.equal(
    investigation.getState().depth.index,
    investigation.ladder.length - 1,
  );
  assert.equal(investigation.getState().depth.canGoDeeper, false);
  investigation.goToPhase(-3);
  assert.equal(investigation.getState().phase.index, 0);
  investigation.goToPhase(999);
  assert.equal(
    investigation.getState().phase.index,
    investigation.phases.length - 1,
  );
});

test('the trail records the whole descent, for the breadcrumb', () => {
  const { investigation } = build();
  investigation.goToDepth(3);
  assert.deepEqual(
    [...investigation.getState().depth.trail],
    ['World', 'South Asia', 'Nepal', 'Gandaki and Bagmati Provinces'],
  );
});

/* ------------------------------------------------------------------ *
 * The three questions (§17)
 * ------------------------------------------------------------------ */

test('the chapter follows the phase rather than being chosen', () => {
  const { investigation } = build();
  investigation.goToPhase(0);
  assert.equal(investigation.getState().chapter.id, 'what-happened');
  investigation.goToPhase(3); // T+12h
  assert.equal(investigation.getState().chapter.id, 'why-it-mattered');
  investigation.goToPhase(investigation.phases.length - 1); // T+30d
  assert.equal(investigation.getState().chapter.id, 'what-now');
  for (const chapter of CHAPTERS) {
    assert.ok(chapter.question.includes('?'));
  }
});

/* ------------------------------------------------------------------ *
 * Layers (§10)
 * ------------------------------------------------------------------ */

test('the hazard layer group is built from the case’s own hazard type', () => {
  const quake = layerGroupsFor(curatedCase('nepal-gorkha-2015'));
  const quakeHazard = quake.find((group) => group.id === 'hazard');
  assert.ok(quakeHazard.layers.some((layer) => layer.id === 'mmi-contours'));

  const flood = layerGroupsFor(curatedCase('bhote-koshi-2026'));
  const floodHazard = flood.find((group) => group.id === 'hazard');
  assert.ok(floodHazard.layers.some((layer) => layer.id === 'flood-extent'));
  // And an earthquake's intensity field is not offered for a flood.
  assert.ok(!floodHazard.layers.some((layer) => layer.id === 'mmi-contours'));
});

test('a layer with no data for this case is listed but refuses to enable', () => {
  /*
   * §2 and §5 both require an absence to be visible. A silent no-op is how a
   * user concludes the platform is broken rather than that the data is absent.
   */
  const { investigation } = build('bhote-koshi-2026');
  const groups = investigation.layerGroups;
  const hazardGroup = groups.find((group) => group.id === 'hazard');
  const unavailable = hazardGroup.layers.find((layer) => layer.available === false);
  assert.ok(unavailable, 'the flood case has an unwired hazard layer');

  const result = investigation.setLayer(unavailable.id, true);
  assert.equal(result.ok, false);
  assert.match(result.reason, /no data for this case/);
  assert.ok(result.adapter, 'and it names the adapter that would supply it');
  assert.equal(investigation.isLayerEnabled(unavailable.id), false);
});

test('an unknown layer is refused by name', () => {
  const { investigation } = build();
  const result = investigation.setLayer('not-a-layer', true);
  assert.equal(result.ok, false);
  assert.match(result.reason, /unknown layer/);
});

test('stepping the phase recomputes only the enabled time-varying layers', () => {
  /*
   * §4's mechanism. A phase change must not redraw everything, and it must not
   * recompute a layer the user has not turned on.
   */
  const { investigation, intents } = build();
  investigation.setLayer('country-borders', true); // not phase-dependent
  investigation.setLayer('roads-state', true); // phase-dependent
  investigation.setLayer('shelters', true); // phase-dependent

  const before = intents.filter((i) => i.kind === 'phase').length;
  investigation.goToPhase(5);
  const phaseIntents = intents.filter((i) => i.kind === 'phase');
  assert.equal(phaseIntents.length, before + 1);
  const latest = phaseIntents.at(-1);
  assert.deepEqual([...latest.layers].sort(), ['roads-state', 'shelters']);
  assert.ok(!latest.layers.includes('country-borders'));
  assert.equal(latest.phase, investigation.getState().phase.key);
});

test('a phase change with nothing time-varying on emits no work', () => {
  const { investigation, intents } = build();
  investigation.setLayer('country-borders', true);
  const before = intents.filter((i) => i.kind === 'phase').length;
  investigation.goToPhase(2);
  assert.equal(intents.filter((i) => i.kind === 'phase').length, before);
});

/* ------------------------------------------------------------------ *
 * Selection and reset
 * ------------------------------------------------------------------ */

test('a selection can fly the camera without changing depth', () => {
  const { investigation, intents } = build();
  investigation.goToDepth(4);
  const depthBefore = investigation.getState().depth.index;
  investigation.select({
    kind: 'city',
    label: 'Bhaktapur',
    latitude: 27.673,
    longitude: 85.43,
    flyTo: true,
  });
  const camera = intents.filter((i) => i.kind === 'camera').at(-1);
  assert.equal(camera.reason, 'selection');
  assert.equal(camera.rungKind, 'SELECTION');
  assert.equal(investigation.getState().depth.index, depthBefore);
  assert.equal(investigation.getState().selection.label, 'Bhaktapur');
  assert.equal(investigation.clearSelection(), true);
  assert.equal(investigation.getState().selection, null);
});

test('a selection without flyTo does not move the camera', () => {
  const { investigation, intents } = build();
  const before = intents.filter((i) => i.kind === 'camera').length;
  investigation.select({ kind: 'road', label: 'Highway', latitude: 28, longitude: 85 });
  assert.equal(intents.filter((i) => i.kind === 'camera').length, before);
});

test('reset returns depth, phase, layers, selection and scenario together', () => {
  /*
   * A partial reset that left the timeline at T+48h while the camera returned
   * to orbit would be worse than none: the user pressed the button believing
   * it worked.
   */
  const { investigation } = build();
  investigation.goToDepth(6);
  investigation.goToPhase(5);
  investigation.setLayer('roads-state', true);
  investigation.select({ kind: 'city', label: 'X' });
  investigation.setScenario('main-road-blocked');

  investigation.reset();
  const state = investigation.getState();
  assert.equal(state.depth.index, 0);
  assert.equal(state.phase.index, 0);
  assert.deepEqual([...state.enabledLayers], []);
  assert.equal(state.selection, null);
  assert.equal(state.scenarioId, null);
  assert.equal(investigation.isLayerEnabled('roads-state'), false);
});

test('a scenario change is emitted with the phase and depth it applies at', () => {
  // §15: a scenario is only meaningful against a time and a place.
  const { investigation, intents } = build();
  investigation.goToDepth(6);
  investigation.goToPhase(3);
  investigation.setScenario('two-roads-blocked');
  const intent = intents.filter((i) => i.kind === 'scenario').at(-1);
  assert.equal(intent.scenarioId, 'two-roads-blocked');
  assert.equal(intent.phase, 'T+12h');
  assert.equal(intent.depthLevel, 6);
});
