/**
 * The statistical primitives Stage 5 needs, written out rather than imported.
 *
 * Three of the Stage 5 questions are association questions — does observed
 * damage concentrate where shaking was stronger, is a severity ranking stable
 * under different weights, is damage more concentrated than population — and
 * each needs a statistic with a stated null hypothesis rather than an
 * eyeballed map. There is no statistics dependency in this project and adding
 * one for four functions would be worse than writing them, so they live here,
 * beside the analyses that use them, with their assumptions in the comments.
 *
 * EVERY FUNCTION HERE RETURNS ITS OWN CAVEAT. A chi-square statistic with no
 * expected-count check is how a table with three observations in a cell gets
 * reported as significant, so `chiSquareTest` reports the minimum expected
 * count and whether Cochran's rule holds, and the caller is expected to say so.
 */

/* ------------------------------------------------------------------ *
 * Gamma, for the chi-square tail.
 * ------------------------------------------------------------------ */

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** log Γ(x) by the Lanczos approximation, good to ~15 significant figures. */
export function logGamma(x) {
  if (x < 0.5) {
    // Reflection, because the series only converges for x >= 0.5.
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const z = x - 1;
  let a = 0.99999999999980993;
  for (let i = 0; i < LANCZOS.length; i += 1) a += LANCZOS[i] / (z + i + 1);
  const t = z + LANCZOS.length - 0.5;
  return (
    0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a)
  );
}

/**
 * Regularised lower incomplete gamma P(a, x), by series expansion.
 *
 * Converges quickly for x < a + 1; the continued fraction below covers the
 * rest. Splitting at a + 1 is the standard division and is what keeps the
 * relative error near machine precision across the whole range.
 */
function lowerGammaSeries(a, x) {
  let sum = 1 / a;
  let term = sum;
  for (let n = 1; n < 1000; n += 1) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

/** Regularised upper incomplete gamma Q(a, x), by the Lentz continued fraction. */
function upperGammaContinuedFraction(a, x) {
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** Q(a, x) = 1 − P(a, x): the upper tail of the gamma distribution. */
export function upperIncompleteGamma(a, x) {
  if (!(a > 0)) throw new RangeError('upperIncompleteGamma needs a > 0');
  if (x < 0) throw new RangeError('upperIncompleteGamma needs x >= 0');
  if (x === 0) return 1;
  return x < a + 1
    ? 1 - lowerGammaSeries(a, x)
    : upperGammaContinuedFraction(a, x);
}

/** P(X > value) for a chi-square variable with `df` degrees of freedom. */
export function chiSquareUpperTail(value, df) {
  if (!(df > 0)) return null;
  if (!Number.isFinite(value) || value < 0) return null;
  return upperIncompleteGamma(df / 2, value / 2);
}

/* ------------------------------------------------------------------ *
 * Association between two categorical variables.
 * ------------------------------------------------------------------ */

/**
 * Pearson's chi-square test of independence on a contingency table.
 *
 * @param {number[][]} table rows × columns of counts
 * @returns {object} statistic, df, p, Cramér's V, and the expected-count check
 *
 * THE EXPECTED-COUNT CHECK IS NOT OPTIONAL. The chi-square statistic's
 * distribution is an approximation that degrades when expected cell counts are
 * small; Cochran's rule (no expected count below 1, at most a fifth below 5)
 * is the usual guard. This returns the verdict rather than silently producing
 * a p-value that the table cannot support, because a damage class with 95
 * observations spread over five intensity bands is exactly the case that
 * breaks it.
 */
export function chiSquareTest(table) {
  const rows = table.length;
  const cols = table[0]?.length ?? 0;
  if (rows < 2 || cols < 2) {
    return Object.freeze({
      usable: false,
      reason: 'A test of independence needs at least a 2x2 table.',
    });
  }
  const rowSums = table.map((row) => row.reduce((a, b) => a + b, 0));
  const colSums = Array.from({ length: cols }, (_, j) =>
    table.reduce((a, row) => a + row[j], 0),
  );
  const total = rowSums.reduce((a, b) => a + b, 0);
  if (total === 0) {
    return Object.freeze({ usable: false, reason: 'The table is empty.' });
  }
  let statistic = 0;
  let minExpected = Infinity;
  let cellsBelowFive = 0;
  const expected = [];
  for (let i = 0; i < rows; i += 1) {
    const expectedRow = [];
    for (let j = 0; j < cols; j += 1) {
      const e = (rowSums[i] * colSums[j]) / total;
      expectedRow.push(e);
      minExpected = Math.min(minExpected, e);
      if (e < 5) cellsBelowFive += 1;
      if (e > 0) statistic += (table[i][j] - e) ** 2 / e;
    }
    expected.push(expectedRow);
  }
  const df = (rows - 1) * (cols - 1);
  const p = chiSquareUpperTail(statistic, df);
  /*
   * Cramér's V rescales chi-square to 0..1 so the effect size can be read
   * independently of the sample size. With 4,583 observations a tiny departure
   * from independence is "significant"; V says whether it is also large.
   */
  const v = Math.sqrt(statistic / (total * Math.min(rows - 1, cols - 1)));
  const shareBelowFive = cellsBelowFive / (rows * cols);
  return Object.freeze({
    usable: true,
    statistic,
    df,
    p,
    cramersV: v,
    total,
    expected: Object.freeze(expected.map((row) => Object.freeze(row))),
    minExpected,
    cellsBelowFive,
    shareBelowFive,
    cochranSatisfied: minExpected >= 1 && shareBelowFive <= 0.2,
    cochranNote:
      minExpected >= 1 && shareBelowFive <= 0.2
        ? 'Cochran’s rule holds: no expected count below 1 and at most a fifth below 5.'
        : 'Cochran’s rule does NOT hold for this table, so the p-value is an approximation the cell counts do not support. Read the effect size, not the p-value.',
  });
}

/* ------------------------------------------------------------------ *
 * Rank association.
 * ------------------------------------------------------------------ */

/** Average ranks, ties shared — the form Spearman's rho requires. */
export function rankWithTies(values) {
  const order = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const ranks = new Array(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].value === order[i].value)
      j += 1;
    const shared = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) ranks[order[k].index] = shared;
    i = j + 1;
  }
  return ranks;
}

/** Pearson correlation. Returns null when either series has no variance. */
export function pearson(a, b) {
  const n = a.length;
  if (n !== b.length || n < 2) return null;
  const meanA = a.reduce((x, y) => x + y, 0) / n;
  const meanB = b.reduce((x, y) => x + y, 0) / n;
  let num = 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i += 1) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    sa += da * da;
    sb += db * db;
  }
  if (sa === 0 || sb === 0) return null;
  return num / Math.sqrt(sa * sb);
}

/**
 * Spearman's rank correlation.
 *
 * Used rather than Pearson wherever one of the variables is ordinal — an MMI
 * band is an ordered label, not a measured quantity, and the distance from
 * MMI VI to VII is not the same physical step as VII to VIII. Ranks are the
 * strongest thing that scale supports.
 */
export function spearman(a, b) {
  return pearson(rankWithTies(a), rankWithTies(b));
}

/* ------------------------------------------------------------------ *
 * Concentration.
 * ------------------------------------------------------------------ */

/**
 * The Gini coefficient of a set of non-negative values.
 *
 * 0 is perfectly even, 1 is everything in one unit. Used to compare how
 * concentrated observed damage is against how concentrated population is over
 * the SAME units, which is a comparison the raw counts cannot make.
 *
 * Note the denominator: this is the population-Gini form (n instead of n − 1),
 * so the maximum on n units is (n − 1)/n rather than exactly 1. With thousands
 * of cells the difference is invisible, but stating it stops the value being
 * read as a sample estimate of something.
 */
export function gini(values) {
  const sorted = values
    .filter((v) => Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return null;
  const total = sorted.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  let weighted = 0;
  for (let i = 0; i < n; i += 1) weighted += (i + 1) * sorted[i];
  return (2 * weighted) / (n * total) - (n + 1) / n;
}

/**
 * The concentration curve: what share of the total the top k units hold.
 *
 * Reported beside the Gini because a single number hides shape. "Half the
 * observed damage lies in 18 of 1,204 square kilometres" is a sentence a
 * reader can check on the map; a Gini of 0.78 is not.
 */
export function concentrationCurve(values, shares = [0.25, 0.5, 0.8, 0.9]) {
  const sorted = values
    .filter((v) => Number.isFinite(v) && v >= 0)
    .sort((a, b) => b - a);
  const total = sorted.reduce((a, b) => a + b, 0);
  if (total === 0)
    return Object.freeze({ units: 0, total: 0, points: Object.freeze([]) });
  const points = [];
  for (const share of shares) {
    let running = 0;
    let units = 0;
    for (const value of sorted) {
      running += value;
      units += 1;
      if (running >= share * total) break;
    }
    points.push(
      Object.freeze({
        share,
        units,
        unitShare: units / sorted.length,
        cumulative: running,
      }),
    );
  }
  return Object.freeze({
    units: sorted.length,
    total,
    points: Object.freeze(points),
    topUnitShare: sorted[0] / total,
  });
}
