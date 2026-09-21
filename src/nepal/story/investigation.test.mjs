import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTROL_DEFAULTS, MODE, createNepalInvestigation } from './investigation.js';
import { SCENES, scene } from './scenes.js';
import { ResultClass } from './resultClass.js';

test('the investigation opens on the case card with the globe framed', () => {
  const inv = createNepalInvestigation();
  assert.equal(inv.state.sceneIndex, 0);
  assert.equal(inv.state.scene.id, 'case-card');
  assert.equal(inv.state.mode, MODE.EXPLORE);
  assert.equal(inv.state.camera.altKm, 20000);
});

test('navigation clamps rather than throwing at the ends', () => {
  const inv = createNepalInvestigation();
  inv.previous();
  assert.equal(inv.state.sceneIndex, 0);
  inv.goTo(SCENES.length + 10);
  assert.equal(inv.state.sceneIndex, SCENES.length - 1);
  inv.next();
  assert.equal(inv.state.sceneIndex, SCENES.length - 1);
  // An unknown id is ignored, not fatal.
  inv.goTo('no-such-scene');
  assert.equal(inv.state.sceneIndex, SCENES.length - 1);
});

test('a scene default fills a blank but never overwrites a choice', () => {
  /*
   * Scene 12 argues about Sindhupalchok, so it defaults there. But a user who
   * picked Dolakha in Scene 07 and walked forward must keep Dolakha: defaults
   * fill blanks, they do not correct people.
   */
  const fresh = createNepalInvestigation();
  fresh.goTo('coverage-gap');
  assert.equal(fresh.state.selection.district, 'Sindhupalchok');

  const chosen = createNepalInvestigation();
  chosen.select({ district: 'Dolakha' });
  chosen.goTo('coverage-gap');
  assert.equal(chosen.state.selection.district, 'Dolakha');
});

test('layers persist across scenes so exploring does not feel like being corrected', () => {
  const inv = createNepalInvestigation();
  inv.goTo('infrastructure');
  inv.toggleLayer('blocked-roads');
  assert.ok(inv.state.visibleLayers.includes('blocked-roads'));
  inv.goTo('overlap');
  assert.ok(
    inv.state.visibleLayers.includes('blocked-roads'),
    'a carried layer must survive navigation',
  );
  inv.toggleLayer('blocked-roads', false);
  assert.equal(inv.state.visibleLayers.includes('blocked-roads'), false);
});

test('the camera follows the selected district when a scene says to', () => {
  const inv = createNepalInvestigation();
  inv.goTo('descend');
  assert.equal(inv.state.camera.target, 'district:Gorkha');
  inv.select({ district: 'Dolakha' });
  assert.equal(inv.state.camera.target, 'district:Dolakha');
  // A scene whose target is not a district is unaffected by the selection.
  inv.goTo('shaking');
  assert.equal(inv.state.camera.target, 'rupture');
});

test('the result-class filter hides constructed scenes and an empty filter hides nothing', () => {
  const inv = createNepalInvestigation();
  inv.goTo('network');
  assert.ok(inv.state.visibleLayers.length > 0);
  inv.setResultClassFilter([ResultClass.OBSERVED]);
  assert.deepEqual(
    inv.state.visibleLayers,
    [],
    'a SCENARIO scene must vanish when only OBSERVED is ticked',
  );
  inv.setResultClassFilter([]);
  assert.ok(inv.state.visibleLayers.length > 0, 'an empty filter shows everything');
  // Legacy vocabulary is accepted and normalised.
  inv.setResultClassFilter(['SIMULATED']);
  assert.deepEqual(inv.state.resultClassFilter, [ResultClass.SCENARIO]);
  // Junk is dropped rather than stored.
  inv.setResultClassFilter(['not-a-class']);
  assert.deepEqual(inv.state.resultClassFilter, [ResultClass.DATA_GAP]);
});

test('an unknown control is refused with the known list', () => {
  const inv = createNepalInvestigation();
  assert.throws(() => inv.setControl('nope', 1), /Unknown control/);
  assert.throws(() => inv.setControl('nope', 1), /intensityThreshold/);
  inv.setControl('intensityThreshold', 8);
  assert.equal(inv.state.controls.intensityThreshold, 8);
  // Everything else keeps its default.
  assert.equal(inv.state.controls.proximityBand, CONTROL_DEFAULTS.proximityBand);
});

test('presentation prefetches further ahead than exploration', () => {
  const explore = createNepalInvestigation({ scene: 4 });
  const present = createNepalInvestigation({ scene: 4, mode: MODE.PRESENT });
  assert.ok(
    present.state.datasetsToWarm.length >= explore.state.datasetsToWarm.length,
    'a known sequence can be warmed further ahead',
  );
});

test('taking control changes who is driving and nothing else', () => {
  /*
   * The single most important behaviour for presenting live: pause must drop
   * into exploration at exactly this state.
   */
  const inv = createNepalInvestigation({ mode: MODE.PRESENT });
  inv.goTo('model-vs-observed');
  inv.select({ district: 'Gorkha' });
  inv.setControl('intensityThreshold', 7);
  const before = inv.state;
  inv.takeControl();
  const after = inv.state;
  assert.equal(after.mode, MODE.EXPLORE);
  assert.equal(after.sceneIndex, before.sceneIndex);
  assert.deepEqual(after.selection, before.selection);
  assert.deepEqual(after.controls, before.controls);
  assert.throws(() => inv.setMode('SOMETHING'), /Unknown mode/);
});

test('a deep link round-trips scene, selection, layers, classes and mode', () => {
  const inv = createNepalInvestigation();
  inv.goTo('model-vs-observed');
  inv.select({ district: 'Gorkha' });
  inv.toggleLayer('damage-points');
  inv.setResultClassFilter([ResultClass.DERIVED]);
  const link = inv.state.deepLink;
  assert.match(link, /#\/case\/npl-2015-eq\/scene\/model-vs-observed\?/);

  const restored = createNepalInvestigation();
  restored.applyDeepLink(link);
  assert.equal(restored.state.scene.id, 'model-vs-observed');
  assert.equal(restored.state.selection.district, 'Gorkha');
  assert.deepEqual(restored.state.layers, ['damage-points']);
  assert.deepEqual(restored.state.resultClassFilter, [ResultClass.DERIVED]);
});

test('a malformed deep link leaves the investigation where it was', () => {
  const inv = createNepalInvestigation({ scene: 5 });
  inv.applyDeepLink('not a link');
  assert.equal(inv.state.sceneIndex, 5);
  inv.applyDeepLink(null);
  assert.equal(inv.state.sceneIndex, 5);
  // A well-formed link naming an unknown scene keeps the scene but takes the rest.
  inv.applyDeepLink('#/case/npl-2015-eq/scene/ghost?district=Rasuwa');
  assert.equal(inv.state.sceneIndex, 5);
  assert.equal(inv.state.selection.district, 'Rasuwa');
});

test('changes are announced with a reason so a renderer can do the least work', () => {
  const events = [];
  const inv = createNepalInvestigation({ onChange: (_, reason) => events.push(reason) });
  inv.goTo(3);
  inv.select({ district: 'Gorkha' });
  inv.setControl('clock', 'IMAGERY');
  inv.toggleLayer('damage-points');
  inv.setResultClassFilter([ResultClass.OBSERVED]);
  inv.setMode(MODE.PRESENT);
  assert.deepEqual(events, ['scene', 'selection', 'control', 'layers', 'filter', 'mode']);
  // A no-op navigation must not announce anything.
  const quiet = events.length;
  inv.goTo(3);
  assert.equal(events.length, quiet);
});

test('every scene in the sequence can be reached and yields a camera', () => {
  const inv = createNepalInvestigation();
  for (const entry of SCENES) {
    inv.goTo(entry.index);
    const snapshot = inv.state;
    assert.equal(snapshot.scene.id, entry.id);
    assert.ok(snapshot.camera.altKm > 0, `${entry.id} has no camera`);
    assert.equal(snapshot.act, scene(entry.index).act);
    assert.ok(Array.isArray(snapshot.datasetsToWarm));
  }
});
