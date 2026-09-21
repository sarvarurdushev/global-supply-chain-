import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACTS,
  HEAVY_DATASETS,
  MAX_HEAVY_PER_SCENE,
  SCENES,
  datasetsToWarm,
  heavyDatasetsOf,
  scene,
  scenesInAct,
  validateScenes,
} from './scenes.js';
import { ANALYSIS_ARTEFACTS, PROCESSED_ARTEFACTS, createIntelligence } from './artefacts.js';
import { ResultClass, resolveResultClass } from './resultClass.js';
import { findForbiddenPhrasing } from '../analysis/terminology.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

let intelligence = null;
async function intel() {
  if (intelligence) return intelligence;
  const parsed = {};
  for (const [key, file] of Object.entries(ANALYSIS_ARTEFACTS)) {
    parsed[key] = JSON.parse(await readFile(path.join(ROOT, 'data', 'analysis', file), 'utf8'));
  }
  intelligence = createIntelligence(parsed);
  return intelligence;
}

test('the sequence is nineteen scenes across three acts, indexed from zero', () => {
  assert.equal(SCENES.length, 19);
  assert.equal(ACTS.length, 3);
  SCENES.forEach((entry, position) => assert.equal(entry.index, position));
  assert.equal(scenesInAct('I').length + scenesInAct('II').length + scenesInAct('III').length, 19);
});

test('every scene exists by id and by index, and a miss returns null', () => {
  for (const entry of SCENES) {
    assert.equal(scene(entry.id), entry);
    assert.equal(scene(entry.index), entry);
  }
  assert.equal(scene('no-such-scene'), null);
  assert.equal(scene(99), null);
});

test('every scene states a question, a purpose, a result class and a limitation', () => {
  for (const entry of SCENES) {
    assert.match(entry.question, /\?$/, `${entry.id} has no question`);
    assert.ok(entry.purpose.length > 20, `${entry.id} has no purpose`);
    assert.ok(entry.resultClasses.length > 0, `${entry.id} declares no result class`);
    assert.ok(entry.limitations.length > 0, `${entry.id} states no limitation`);
    for (const value of entry.resultClasses) {
      assert.ok(ResultClass[value], `${entry.id} uses unknown result class ${value}`);
      assert.notEqual(resolveResultClass(value), undefined);
    }
  }
});

test('every dataset a scene names is one the loader can fetch', () => {
  for (const entry of SCENES) {
    for (const dataset of entry.datasets) {
      assert.ok(
        PROCESSED_ARTEFACTS[dataset],
        `${entry.id} needs "${dataset}", which the loader does not know`,
      );
    }
  }
});

test('every analysis a scene cites matches a real methodology record', async () => {
  /*
   * The failure this catches: a scene offers a "why is this here?" link to a
   * record that does not exist, and the provenance panel opens empty — in a
   * product whose whole claim is that every figure is traceable.
   */
  const known = new Set((await intel()).methodology.map((record) => record.id));
  for (const entry of SCENES) {
    for (const id of entry.analyses) {
      assert.ok(known.has(id), `${entry.id} cites "${id}", which no methodology record matches`);
    }
  }
});

test('no scene uses forbidden terminology, except to forbid it', async () => {
  const result = validateScenes({
    knownAnalyses: new Set((await intel()).methodology.map((record) => record.id)),
    findForbidden: findForbiddenPhrasing,
  });
  assert.deepEqual(result.problems, []);
  assert.equal(result.ok, true);
});

test('the validator actually catches the problems it claims to', () => {
  // A validator nobody has seen fail is not a validator.
  const withNothingKnown = validateScenes({ knownAnalyses: new Set() });
  assert.equal(withNothingKnown.ok, false);
  assert.ok(
    withNothingKnown.problems.some((problem) => /no methodology record matches/.test(problem)),
  );
  const strict = validateScenes({
    findForbidden: () => [{ phrase: 'affected' }],
  });
  assert.equal(strict.ok, false);
  assert.ok(strict.problems.some((problem) => /forbidden phrasing/.test(problem)));
});

test('no scene declares more heavy datasets than the frame-rate cap allows', () => {
  /*
   * The ceiling in Cesium is primitive count, not payload. Three heavy layers
   * at once is the budget the performance architecture set.
   */
  for (const entry of SCENES) {
    const heavy = heavyDatasetsOf(entry);
    assert.ok(
      heavy.length <= MAX_HEAVY_PER_SCENE,
      `${entry.id} declares ${heavy.length} heavy datasets: ${heavy.join(', ')}`,
    );
  }
  // And the heavy list is not empty, or the cap would be meaningless.
  assert.ok(HEAVY_DATASETS.length >= 4);
  assert.ok(HEAVY_DATASETS.every((id) => PROCESSED_ARTEFACTS[id]));
});

test('the camera descends through the investigation rather than jumping about', () => {
  // Act I establishes, Act II descends: the deepest scene must be well below the first.
  const actOne = scenesInAct('I').map((entry) => entry.camera.altKm);
  const deepest = Math.min(...SCENES.map((entry) => entry.camera.altKm));
  assert.equal(actOne[0], 20000, 'the case card starts at globe altitude');
  assert.ok(deepest <= 25, `the deepest scene should reach street scale, got ${deepest} km`);
  for (const entry of SCENES) {
    assert.ok(entry.camera.pitch <= 0 && entry.camera.pitch >= -90, `${entry.id} pitch`);
    assert.ok(entry.camera.durationSec >= 0);
    assert.ok(entry.camera.target?.length > 0, `${entry.id} has no camera target`);
  }
});

test('prefetch warms the current scene and the next, without duplicates', () => {
  const warm = datasetsToWarm(4);
  assert.deepEqual(warm, ['shakemap', 'population']);
  // Scene 4 and 5 both want shakemap; it must appear once.
  assert.equal(new Set(warm).size, warm.length);
  // The last scene has no next, and must not throw.
  assert.doesNotThrow(() => datasetsToWarm(18));
  assert.deepEqual(datasetsToWarm(0, { lookahead: 0 }), []);
});

test('the two headline scenes are where the argument says they are', () => {
  /*
   * These two carry the product's claim, so their wiring is pinned: Scene 09
   * is the three-beat model-versus-observation reveal, Scene 12 is the
   * coverage gap. If either loses its data or its beats, the argument is gone.
   */
  const modelVsObserved = scene('model-vs-observed');
  assert.equal(modelVsObserved.index, 9);
  assert.equal(modelVsObserved.beats.length, 3);
  assert.deepEqual(
    modelVsObserved.beats.map((beat) => beat.id),
    ['looks-correlated', 'the-statistics', 'the-reversal'],
  );
  assert.ok(modelVsObserved.datasets.includes('unosat'));
  assert.ok(modelVsObserved.datasets.includes('shakemap'));
  assert.ok(modelVsObserved.analyses.includes('damage-by-intensity'));
  assert.ok(
    modelVsObserved.limitations.some((text) => /CORRELATION IS NOT CAUSATION/.test(text)),
  );

  const coverage = scene('coverage-gap');
  assert.equal(coverage.index, 12);
  assert.equal(coverage.defaultSelection.district, 'Sindhupalchok');
  assert.ok(coverage.resultClasses.includes(ResultClass.DATA_GAP));
});

test('every scenario scene is classed as a scenario, and no other scene is', () => {
  const scenarioScenes = SCENES.filter((entry) =>
    entry.resultClasses.includes(ResultClass.SCENARIO),
  ).map((entry) => entry.id);
  // The network, the route and the scenario explorer — and nothing else.
  assert.deepEqual(scenarioScenes, ['network', 'route', 'scenarios']);
  for (const id of scenarioScenes) {
    assert.ok(
      scene(id).limitations.some((text) => /SCENARIO|No evacuation|NO TRAVEL TIME|coverage gap/i.test(text)),
      `${id} must state what makes it hypothetical`,
    );
  }
});

test('the modelled hazard scenes are flagged so the map can draw them softly', () => {
  // A modelled field must never inherit the hard-edged observed grammar.
  for (const id of ['shaking', 'exposure', 'model-vs-observed']) {
    assert.equal(scene(id).modeled, true, `${id} should be flagged modelled`);
  }
  assert.notEqual(scene('observed-damage').modeled, true);
});
