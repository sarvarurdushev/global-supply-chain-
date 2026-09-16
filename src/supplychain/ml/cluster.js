/**
 * Clustering countries by trade structure.
 *
 * §26: "Cluster countries based on trade structure, economic indicators,
 * commodity dependency, logistics connectivity."
 *
 * Two properties matter more than the algorithm choice:
 *
 *  1. DETERMINISM. k-means depends on its initialisation, so an un-seeded run
 *     gives a different answer each time. An academic result that changes when
 *     you reload the page is not a result. This implementation takes an explicit
 *     seed and uses a small deterministic PRNG.
 *  2. STANDARDISATION. Features here have wildly different scales — GDP in
 *     trillions, trade share in percent. Without standardisation, Euclidean
 *     distance is decided entirely by whichever feature has the largest
 *     magnitude, and "clustering by trade structure" silently becomes
 *     "clustering by GDP". Standardisation is applied by default.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

import { DataClass, createProvenance } from '../provenance.js';

/**
 * mulberry32 — a small, fast, well-distributed 32-bit PRNG.
 * Used only to make initialisation reproducible, not for anything sensitive.
 * @param {number} seed
 * @returns {() => number}
 */
export function createRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assertMatrix(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new TypeError('rows must be a non-empty array');
  }
  const width = rows[0].length;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== width) {
      throw new TypeError('every row must have the same number of features');
    }
    for (const v of row) {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new TypeError('features must be finite numbers');
      }
    }
  }
  return width;
}

/**
 * Standardise each feature to zero mean and unit variance (z-scores).
 *
 * A feature with zero variance is left at zero rather than dividing by zero: it
 * carries no information and must not dominate or corrupt the distance.
 *
 * @param {number[][]} rows
 * @returns {{matrix:number[][], means:number[], stdDevs:number[], constantFeatures:number[]}}
 */
export function standardise(rows) {
  const width = assertMatrix(rows);
  const means = [];
  const stdDevs = [];
  const constantFeatures = [];
  for (let f = 0; f < width; f += 1) {
    const column = rows.map((r) => r[f]);
    const mean = column.reduce((a, b) => a + b, 0) / column.length;
    const variance =
      column.reduce((sum, v) => sum + (v - mean) ** 2, 0) / column.length;
    const sd = Math.sqrt(variance);
    means.push(mean);
    stdDevs.push(sd);
    if (sd === 0) constantFeatures.push(f);
  }
  const matrix = rows.map((row) =>
    row.map((v, f) => (stdDevs[f] === 0 ? 0 : (v - means[f]) / stdDevs[f])),
  );
  return { matrix, means, stdDevs, constantFeatures };
}

function squaredDistance(a, b) {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += (a[i] - b[i]) ** 2;
  return total;
}

/**
 * k-means++ initialisation: spread the initial centroids out by choosing each
 * with probability proportional to its squared distance from the nearest
 * already-chosen centroid. Converges far more reliably than random seeding.
 *
 * @param {number[][]} matrix
 * @param {number} k
 * @param {() => number} random
 * @returns {number[][]}
 */
function initialiseCentroids(matrix, k, random) {
  const centroids = [matrix[Math.floor(random() * matrix.length)]];
  while (centroids.length < k) {
    const distances = matrix.map((point) =>
      Math.min(...centroids.map((c) => squaredDistance(point, c))),
    );
    const total = distances.reduce((a, b) => a + b, 0);
    if (total === 0) {
      // Every remaining point coincides with a centroid; nothing to spread.
      centroids.push(matrix[centroids.length % matrix.length]);
      continue;
    }
    let target = random() * total;
    let index = 0;
    while (index < distances.length - 1 && target > distances[index]) {
      target -= distances[index];
      index += 1;
    }
    centroids.push(matrix[index]);
  }
  return centroids.map((c) => [...c]);
}

/**
 * k-means clustering.
 *
 * @param {number[][]} rows one row per observation
 * @param {number} k
 * @param {object} [options]
 * @param {number} [options.seed=42]
 * @param {number} [options.maxIterations=100]
 * @param {boolean} [options.standardise=true]
 * @returns {{assignments:number[], centroids:number[][], inertia:number, iterations:number, converged:boolean}}
 */
export function kMeans(rows, k, options = {}) {
  assertMatrix(rows);
  const {
    seed = 42,
    maxIterations = 100,
    standardise: shouldStandardise = true,
  } = options;
  if (!Number.isInteger(k) || k < 1) {
    throw new RangeError('k must be a positive integer');
  }
  if (k > rows.length) {
    throw new RangeError(
      `k (${k}) cannot exceed the number of observations (${rows.length})`,
    );
  }

  const prepared = shouldStandardise
    ? standardise(rows)
    : { matrix: rows.map((r) => [...r]) };
  const matrix = prepared.matrix;
  const random = createRandom(seed);
  let centroids = initialiseCentroids(matrix, k, random);
  let assignments = new Array(matrix.length).fill(-1);
  let iterations = 0;
  let converged = false;

  for (; iterations < maxIterations; iterations += 1) {
    let moved = false;
    for (let i = 0; i < matrix.length; i += 1) {
      let best = 0;
      let bestDistance = Infinity;
      for (let c = 0; c < centroids.length; c += 1) {
        const d = squaredDistance(matrix[i], centroids[c]);
        if (d < bestDistance) {
          bestDistance = d;
          best = c;
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best;
        moved = true;
      }
    }
    if (!moved) {
      converged = true;
      break;
    }
    const width = matrix[0].length;
    const sums = Array.from({ length: k }, () => new Array(width).fill(0));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < matrix.length; i += 1) {
      counts[assignments[i]] += 1;
      for (let f = 0; f < width; f += 1)
        sums[assignments[i]][f] += matrix[i][f];
    }
    centroids = centroids.map((current, c) =>
      // An empty cluster keeps its previous centroid rather than becoming NaN.
      counts[c] === 0 ? current : sums[c].map((s) => s / counts[c]),
    );
  }

  let inertia = 0;
  for (let i = 0; i < matrix.length; i += 1) {
    inertia += squaredDistance(matrix[i], centroids[assignments[i]]);
  }

  return { assignments, centroids, inertia, iterations, converged, matrix };
}

/**
 * Mean silhouette score, in [-1, 1].
 *
 * Reported because it is the honest check on whether a clustering found real
 * structure. k-means will always return k clusters; the silhouette says whether
 * they mean anything. Roughly: above 0.5 is reasonable structure, 0.25-0.5 is
 * weak, below 0.25 means the clusters are largely arbitrary.
 *
 * @param {number[][]} matrix
 * @param {number[]} assignments
 * @returns {number|null} null when fewer than two clusters are populated
 */
export function silhouetteScore(matrix, assignments) {
  const clusters = new Map();
  for (let i = 0; i < assignments.length; i += 1) {
    if (!clusters.has(assignments[i])) clusters.set(assignments[i], []);
    clusters.get(assignments[i]).push(i);
  }
  if (clusters.size < 2) return null;

  let total = 0;
  for (let i = 0; i < matrix.length; i += 1) {
    const own = clusters.get(assignments[i]);
    // A singleton cluster has no within-cluster distance; silhouette is 0.
    if (own.length <= 1) continue;
    let a = 0;
    for (const j of own) {
      if (j !== i) a += Math.sqrt(squaredDistance(matrix[i], matrix[j]));
    }
    a /= own.length - 1;

    let b = Infinity;
    for (const [label, members] of clusters) {
      if (label === assignments[i]) continue;
      let mean = 0;
      for (const j of members)
        mean += Math.sqrt(squaredDistance(matrix[i], matrix[j]));
      mean /= members.length;
      if (mean < b) b = mean;
    }
    total += (b - a) / Math.max(a, b);
  }
  return total / matrix.length;
}

/**
 * Cluster countries, with the diagnostics needed to judge the result.
 *
 * @param {object} input
 * @param {Array<{id:string, name?:string, features:number[]}>} input.observations
 * @param {string[]} input.featureNames
 * @param {number} [input.k=4]
 * @param {number} [input.seed=42]
 * @returns {Readonly<object>}
 */
export function clusterCountries({
  observations,
  featureNames,
  k = 4,
  seed = 42,
}) {
  if (!Array.isArray(observations) || observations.length === 0) {
    throw new TypeError('observations must be a non-empty array');
  }
  if (!Array.isArray(featureNames) || featureNames.length === 0) {
    throw new TypeError(
      'featureNames is required — unlabelled features are unusable',
    );
  }
  for (const o of observations) {
    if (o.features.length !== featureNames.length) {
      throw new TypeError(
        `${o.id}: expected ${featureNames.length} features, got ${o.features.length}`,
      );
    }
  }
  if (observations.length < k) {
    return Object.freeze({
      assessable: false,
      reason:
        `${observations.length} observations cannot be split into ${k} clusters. ` +
        'PUBLIC DATA INSUFFICIENT.',
      clusters: Object.freeze([]),
      provenance: clusterProvenance({ k, featureNames, silhouette: null }),
    });
  }

  const rows = observations.map((o) => o.features);
  const result = kMeans(rows, k, { seed });
  const silhouette = silhouetteScore(result.matrix, result.assignments);
  const { means, stdDevs, constantFeatures } = standardise(rows);

  const clusters = [];
  for (let c = 0; c < k; c += 1) {
    const members = observations.filter((_, i) => result.assignments[i] === c);
    clusters.push(
      Object.freeze({
        label: c,
        size: members.length,
        members: Object.freeze(
          members.map((m) => ({ id: m.id, name: m.name ?? m.id })),
        ),
        // Centroids are reported in ORIGINAL units, not z-scores, so they can
        // be read without mentally undoing the standardisation.
        centroid: Object.freeze(
          Object.fromEntries(
            featureNames.map((name, f) => [
              name,
              result.centroids[c][f] * (stdDevs[f] || 0) + means[f],
            ]),
          ),
        ),
      }),
    );
  }

  const limitations = [];
  if (constantFeatures.length > 0) {
    limitations.push(
      `Feature(s) ${constantFeatures.map((f) => featureNames[f]).join(', ')} have ` +
        'zero variance and contribute nothing to the clustering.',
    );
  }
  if (!result.converged) {
    limitations.push(
      `k-means did not converge within ${result.iterations} iterations; the ` +
        'assignment is the last reached, not a stable optimum.',
    );
  }

  return Object.freeze({
    assessable: true,
    reason: null,
    k,
    seed,
    featureNames: Object.freeze([...featureNames]),
    clusters: Object.freeze(clusters),
    inertia: result.inertia,
    converged: result.converged,
    iterations: result.iterations,
    silhouette,
    silhouetteInterpretation: interpretSilhouette(silhouette),
    provenance: clusterProvenance({
      k,
      featureNames,
      silhouette,
      extraLimitations: limitations,
    }),
  });
}

function interpretSilhouette(score) {
  if (score === null)
    return 'Not computable — fewer than two populated clusters.';
  if (score >= 0.5) return 'Reasonable structure.';
  if (score >= 0.25)
    return 'Weak structure; the clusters may not be meaningful.';
  return 'No substantial structure. Treat these clusters as arbitrary.';
}

function clusterProvenance({
  k,
  featureNames,
  silhouette,
  extraLimitations = [],
}) {
  const limitations = [
    'MODEL OUTPUT. Clusters are a description of the supplied features, not a ' +
      'discovered fact about the world.',
    'k is chosen by the caller. k-means returns k clusters whether or not k ' +
      'clusters exist; read the silhouette score before trusting them.',
    'Features are standardised to zero mean and unit variance. Without that, ' +
      'Euclidean distance would be dominated by whichever feature has the ' +
      'largest magnitude (typically GDP).',
    'Euclidean distance assumes features are independent and equally important. ' +
      'Trade indicators are correlated, so correlated features are effectively ' +
      'weighted more heavily.',
    'Deterministic for a given seed. A different seed can produce a different ' +
      'partition, which is a property of k-means, not a bug.',
  ];
  if (silhouette !== null && silhouette < 0.25) {
    limitations.push(
      `The silhouette score (${silhouette.toFixed(3)}) indicates no substantial ` +
        'structure. These clusters should not be presented as meaningful groups.',
    );
  }
  return createProvenance({
    dataClass: DataClass.INFERRED,
    source: 'Global Supply Chain Eye clustering module',
    dataset: `kmeans:k=${k}:${featureNames.join('|')}`,
    license: 'MIT (model output)',
    method:
      `k-means (k=${k}) with k-means++ initialisation on z-standardised ` +
      'features, seeded for reproducibility. Quality reported by mean silhouette.',
    confidence:
      silhouette === null
        ? 0.3
        : Math.max(0.3, Math.min(0.8, 0.4 + silhouette)),
    limitations: [...limitations, ...extraLimitations],
  });
}
