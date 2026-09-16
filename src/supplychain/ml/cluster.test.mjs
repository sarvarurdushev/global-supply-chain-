import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRandom,
  standardise,
  kMeans,
  silhouetteScore,
  clusterCountries,
} from './cluster.js';
import { DataClass } from '../provenance.js';

/** Three tight, well-separated groups in two dimensions. */
const SEPARATED = [
  [1, 1], [1.2, 0.9], [0.9, 1.1],
  [10, 10], [10.2, 9.9], [9.8, 10.1],
  [20, 1], [20.1, 1.2], [19.9, 0.8],
];

test('createRandom is deterministic for a given seed', () => {
  const a = createRandom(42);
  const b = createRandom(42);
  const c = createRandom(43);
  const first = [a(), a(), a()];
  const second = [b(), b(), b()];
  assert.deepEqual(first, second, 'same seed must give the same sequence');
  assert.notDeepEqual(first, [c(), c(), c()]);
  for (const v of first) assert.ok(v >= 0 && v < 1);
});

test('standardise gives each feature zero mean and unit variance', () => {
  const { matrix, means, stdDevs } = standardise([
    [1, 100],
    [2, 200],
    [3, 300],
  ]);
  assert.deepEqual(means, [2, 200]);
  for (let f = 0; f < 2; f += 1) {
    const column = matrix.map((r) => r[f]);
    const mean = column.reduce((a, b) => a + b, 0) / column.length;
    assert.ok(Math.abs(mean) < 1e-12, `feature ${f} mean should be 0`);
  }
  assert.ok(stdDevs[1] > stdDevs[0], 'raw scales differ before standardisation');
  // After standardisation both features span the same range.
  assert.ok(Math.abs(matrix[0][0] - matrix[0][1]) < 1e-12);
});

test('a zero-variance feature is neutralised rather than dividing by zero', () => {
  const { matrix, constantFeatures } = standardise([
    [1, 7],
    [2, 7],
    [3, 7],
  ]);
  assert.deepEqual(constantFeatures, [1]);
  for (const row of matrix) assert.equal(row[1], 0);
  assert.ok(matrix.every((r) => Number.isFinite(r[0]) && Number.isFinite(r[1])));
});

test('standardisation stops the largest-magnitude feature dominating', () => {
  // GDP in trillions alongside trade share in percent. GDP has an enormous
  // magnitude but only a tiny relative spread, and it is interleaved so that
  // grouping by GDP gives a DIFFERENT answer from grouping by trade share:
  //
  //   trade-share split  =  {0,1} vs {2,3}   <- the structure we care about
  //   raw GDP split      =  {0,2} vs {1,3}
  //
  // Without standardisation, Euclidean distance is decided entirely by GDP, so
  // "clustering by trade structure" silently becomes "clustering by GDP".
  const rows = [
    [1.0e12, 80],
    [1.02e12, 81],
    [1.01e12, 20],
    [1.03e12, 21],
  ];
  const sameCluster = (assignments, i, j) => assignments[i] === assignments[j];
  const isTradeSplit = (a) => sameCluster(a, 0, 1) && sameCluster(a, 2, 3);

  for (const seed of [1, 2, 3, 11, 42]) {
    const scaled = kMeans(rows, 2, { seed, standardise: true });
    assert.ok(
      isTradeSplit(scaled.assignments),
      `seed ${seed}: standardised clustering should recover the trade-share ` +
        `split, got ${scaled.assignments.join('')}`,
    );
    const unscaled = kMeans(rows, 2, { seed, standardise: false });
    assert.ok(
      !isTradeSplit(unscaled.assignments),
      `seed ${seed}: unstandardised clustering should be captured by GDP, ` +
        `got ${unscaled.assignments.join('')}`,
    );
  }
});

test('kMeans recovers well-separated groups', () => {
  const result = kMeans(SEPARATED, 3, { seed: 7 });
  assert.equal(result.converged, true);
  // Each block of three must land in one cluster.
  for (const block of [[0, 1, 2], [3, 4, 5], [6, 7, 8]]) {
    const labels = new Set(block.map((i) => result.assignments[i]));
    assert.equal(labels.size, 1, `block ${block} must share a cluster`);
  }
  assert.equal(new Set(result.assignments).size, 3);
  assert.ok(result.inertia >= 0);
});

test('kMeans is reproducible for a fixed seed', () => {
  const a = kMeans(SEPARATED, 3, { seed: 99 });
  const b = kMeans(SEPARATED, 3, { seed: 99 });
  assert.deepEqual(a.assignments, b.assignments);
  assert.deepEqual(a.centroids, b.centroids);
});

test('kMeans validates k against the data', () => {
  assert.throws(() => kMeans(SEPARATED, 0), RangeError);
  assert.throws(() => kMeans(SEPARATED, 2.5), RangeError);
  assert.throws(() => kMeans(SEPARATED, 100), /cannot exceed the number of observations/);
  assert.throws(() => kMeans([], 2), TypeError);
  assert.throws(() => kMeans([[1, 2], [3]], 1), /same number of features/);
  assert.throws(() => kMeans([[1, 'x']], 1), TypeError);
});

test('k equal to the number of points gives singleton clusters', () => {
  const result = kMeans(SEPARATED, SEPARATED.length, { seed: 3 });
  assert.ok(result.inertia < 1e-9, 'every point is its own centroid');
});

test('silhouetteScore rates separated clusters highly', () => {
  const result = kMeans(SEPARATED, 3, { seed: 7 });
  const score = silhouetteScore(result.matrix, result.assignments);
  assert.ok(score > 0.7, `expected strong structure, got ${score}`);
});

test('silhouetteScore rates an arbitrary split of one blob poorly', () => {
  const blob = Array.from({ length: 20 }, (_, i) => [
    Math.cos(i) * 0.1,
    Math.sin(i) * 0.1,
  ]);
  const result = kMeans(blob, 4, { seed: 5 });
  const score = silhouetteScore(result.matrix, result.assignments);
  assert.ok(score < 0.7, `unstructured data must not score high, got ${score}`);
});

test('silhouetteScore is null with fewer than two populated clusters', () => {
  assert.equal(silhouetteScore([[1, 1], [1, 1]], [0, 0]), null);
});

test('clusterCountries reports centroids in original units', () => {
  const result = clusterCountries({
    observations: [
      { id: 'A', name: 'Alpha', features: [1.0e12, 80] },
      { id: 'B', name: 'Bravo', features: [1.1e12, 82] },
      { id: 'C', name: 'Charlie', features: [5.0e12, 20] },
      { id: 'D', name: 'Delta', features: [5.1e12, 22] },
    ],
    featureNames: ['gdpUsd', 'tradePctGdp'],
    k: 2,
    seed: 11,
  });
  assert.equal(result.assessable, true);
  assert.equal(result.clusters.length, 2);
  const total = result.clusters.reduce((s, c) => s + c.size, 0);
  assert.equal(total, 4);
  for (const cluster of result.clusters) {
    // Centroids must be readable without undoing the z-standardisation.
    assert.ok(cluster.centroid.gdpUsd > 1e11, `centroid in original units: ${cluster.centroid.gdpUsd}`);
    assert.ok(cluster.centroid.tradePctGdp > 0 && cluster.centroid.tradePctGdp < 200);
  }
  assert.ok(result.silhouette !== null);
  assert.ok(result.silhouetteInterpretation.length > 0);
});

test('clusterCountries refuses when there are fewer observations than clusters', () => {
  const result = clusterCountries({
    observations: [{ id: 'A', features: [1, 2] }],
    featureNames: ['x', 'y'],
    k: 4,
  });
  assert.equal(result.assessable, false);
  assert.match(result.reason, /PUBLIC DATA INSUFFICIENT/);
  assert.deepEqual(result.clusters, []);
});

test('clusterCountries requires labelled features of matching length', () => {
  assert.throws(
    () => clusterCountries({ observations: [{ id: 'A', features: [1] }], featureNames: [] }),
    /featureNames is required/,
  );
  assert.throws(
    () =>
      clusterCountries({
        observations: [{ id: 'A', features: [1, 2] }, { id: 'B', features: [1] }],
        featureNames: ['x', 'y'],
        k: 1,
      }),
    /expected 2 features, got 1/,
  );
  assert.throws(() => clusterCountries({ observations: [], featureNames: ['x'] }), TypeError);
});

test('cluster output is INFERRED and warns that k-means always returns k groups', () => {
  const result = clusterCountries({
    observations: SEPARATED.map((features, i) => ({ id: `n${i}`, features })),
    featureNames: ['x', 'y'],
    k: 3,
    seed: 7,
  });
  assert.equal(result.provenance.dataClass, DataClass.INFERRED);
  assert.ok(
    result.provenance.limitations.some((l) => /whether or not k clusters exist/.test(l)),
    'must warn that k-means always returns k clusters',
  );
  assert.ok(result.provenance.limitations.some((l) => /standardised/.test(l)));
  assert.ok(result.provenance.limitations.some((l) => /different seed/.test(l)));
});

test('a meaningless clustering says so in its limitations', () => {
  const blob = Array.from({ length: 20 }, (_, i) => [
    Math.cos(i) * 0.1,
    Math.sin(i) * 0.1,
  ]);
  const result = clusterCountries({
    observations: blob.map((features, i) => ({ id: `n${i}`, features })),
    featureNames: ['x', 'y'],
    k: 5,
    seed: 5,
  });
  if (result.silhouette < 0.25) {
    assert.match(result.silhouetteInterpretation, /No substantial structure/);
    assert.ok(
      result.provenance.limitations.some((l) => /should not be presented as meaningful/.test(l)),
    );
  }
});
