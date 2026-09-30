import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ChangeCategory,
  classifyChange,
  minMaxNormalise,
  paretoFront,
  weightedMedian,
  weightingSensitivity,
} from './analysis.js';

test('each change category is reached, in order of precedence', () => {
  const at = (baseMetres, scenarioMetres, baseFacility = 1, scenarioFacility = 1) =>
    classifyChange({ baseMetres, scenarioMetres, baseFacility, scenarioFacility }, { similarMetres: 1000 });
  assert.equal(at(Infinity, Infinity, -1, -1), ChangeCategory.NO_BASELINE_PATH);
  assert.equal(at(5000, Infinity, 1, -1), ChangeCategory.DISCONNECTED);
  assert.equal(at(5000, 5900), ChangeCategory.SIMILAR);
  assert.equal(at(5000, 6000), ChangeCategory.SIMILAR);
  assert.equal(at(5000, 9000), ChangeCategory.LONGER);
  assert.equal(at(5000, 9000, 1, 2), ChangeCategory.DIFFERENT_FACILITY);
  /* A switch to another facility at the same distance is not a loss of access. */
  assert.equal(at(5000, 5000, 1, 2), ChangeCategory.SIMILAR);
});

test('weighted median follows the weight, and can be unreachable', () => {
  assert.equal(weightedMedian([1, 2, 3], [1, 1, 1]), 2);
  assert.equal(weightedMedian([1, 2, 3], [10, 1, 1]), 1);
  assert.equal(weightedMedian([1, Infinity], [1, 3]), Infinity);
  assert.equal(weightedMedian([], []), null);
});

test('the Pareto front keeps exactly the undominated items', () => {
  const items = [
    { id: 'a', x: 3, y: 1 },
    { id: 'b', x: 1, y: 3 },
    { id: 'c', x: 2, y: 2 },
    { id: 'd', x: 1, y: 1 },
    { id: 'e', x: 3, y: 1 },
  ];
  assert.deepEqual(
    paretoFront(items, ['x', 'y']).map((item) => item.id),
    ['a', 'b', 'c', 'e'],
  );
});

test('normalisation is min-max per key and a constant key goes to zero', () => {
  const out = minMaxNormalise([{ x: 10, y: 5 }, { x: 20, y: 5 }], ['x', 'y']);
  assert.deepEqual(out.map((item) => item.normalised), [{ x: 0, y: 0 }, { x: 1, y: 0 }]);
});

test('weighting sensitivity reports the rank spread, not one ranking', () => {
  const items = [
    { id: 'hi-x', x: 10, y: 0 },
    { id: 'hi-y', x: 0, y: 10 },
    { id: 'mid', x: 6, y: 6 },
  ];
  const result = weightingSensitivity(
    items,
    ['x', 'y'],
    [
      { id: 'x-heavy', weights: { x: 3, y: 1 } },
      { id: 'y-heavy', weights: { x: 1, y: 3 } },
    ],
    { top: 2 },
  );
  const byId = Object.fromEntries(result.perItem.map((row) => [row.id, row]));
  assert.deepEqual(byId['hi-x'].ranks, { 'x-heavy': 1, 'y-heavy': 3 });
  assert.equal(byId.mid.bestRank, 2);
  assert.equal(byId.mid.worstRank, 2);
  assert.deepEqual(result.stableTop, ['mid']);
  assert.deepEqual(result.sometimesTop.sort(), ['hi-x', 'hi-y']);
});
