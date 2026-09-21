import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chiSquareTest,
  chiSquareUpperTail,
  concentrationCurve,
  gini,
  logGamma,
  pearson,
  rankWithTies,
  spearman,
  upperIncompleteGamma,
} from './stats.js';

test('logGamma reproduces values with closed forms', () => {
  assert.ok(Math.abs(logGamma(0.5) - Math.log(Math.sqrt(Math.PI))) < 1e-12);
  assert.ok(Math.abs(logGamma(1) - 0) < 1e-12);
  assert.ok(Math.abs(logGamma(5) - Math.log(24)) < 1e-12);
  assert.ok(Math.abs(logGamma(10) - Math.log(362880)) < 1e-9);
});

test('the chi-square tail reproduces published critical values', () => {
  // Every one of these is the 0.05 point from a standard chi-square table.
  for (const [value, df] of [
    [3.841459, 1],
    [5.991465, 2],
    [7.814728, 3],
    [11.070498, 5],
    [18.307038, 10],
  ]) {
    assert.ok(
      Math.abs(chiSquareUpperTail(value, df) - 0.05) < 1e-5,
      `df ${df} should give p = 0.05`,
    );
  }
  // And the 0.01 point, to check the other tail region.
  assert.ok(Math.abs(chiSquareUpperTail(23.209251, 10) - 0.01) < 1e-5);
});

test('the incomplete gamma agrees across the series and continued-fraction split', () => {
  /*
   * The implementation switches method at x = a + 1. If the two branches
   * disagreed the error would appear exactly at the boundary and nowhere
   * else, so the check straddles it.
   */
  for (const a of [0.5, 1, 2.5, 5]) {
    const x = a + 1;
    const below = upperIncompleteGamma(a, x - 1e-9);
    const above = upperIncompleteGamma(a, x + 1e-9);
    assert.ok(Math.abs(below - above) < 1e-9, `discontinuity at a = ${a}`);
  }
  assert.equal(upperIncompleteGamma(1, 0), 1);
});

test('chi-square on a table with a known statistic', () => {
  const result = chiSquareTest([
    [10, 20],
    [20, 10],
  ]);
  // n=60, all expected counts 15, so chi2 = 4 * (5^2/15) = 6.666...
  assert.ok(Math.abs(result.statistic - 20 / 3) < 1e-9);
  assert.equal(result.df, 1);
  assert.ok(Math.abs(result.cramersV - 1 / 3) < 1e-9);
  assert.equal(result.cochranSatisfied, true);
});

test('chi-square refuses to pretend a sparse table supports a p-value', () => {
  const result = chiSquareTest([
    [1, 0],
    [0, 1],
  ]);
  assert.equal(result.usable, true);
  assert.equal(result.cochranSatisfied, false);
  assert.match(result.cochranNote, /does NOT hold/);
  assert.equal(result.minExpected, 0.5);
});

test('chi-square rejects a table too small to test', () => {
  assert.equal(chiSquareTest([[1, 2, 3]]).usable, false);
  assert.equal(chiSquareTest([[0, 0], [0, 0]]).usable, false);
});

test('ranks share the average rank across ties', () => {
  assert.deepEqual(rankWithTies([10, 20, 30]), [1, 2, 3]);
  // Two values tied for ranks 2 and 3 both become 2.5.
  assert.deepEqual(rankWithTies([10, 20, 20, 30]), [1, 2.5, 2.5, 4]);
  assert.deepEqual(rankWithTies([5, 5, 5]), [2, 2, 2]);
});

test('correlations hit their limits and refuse a constant series', () => {
  assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  assert.equal(spearman([1, 2, 3, 4], [40, 30, 20, 10]), -1);
  assert.equal(spearman([1, 2, 3], [7, 7, 7]), null);
  assert.equal(pearson([1, 2], [1]), null);
  // Spearman sees a monotone but curved relationship as perfect; Pearson does not.
  assert.equal(spearman([1, 2, 3, 4], [1, 4, 9, 16]), 1);
  assert.ok(pearson([1, 2, 3, 4], [1, 4, 9, 16]) < 1);
});

test('the Gini coefficient reaches its bounds on n units', () => {
  assert.equal(gini([5, 5, 5, 5]), 0);
  // Everything in one of four units: (n-1)/n, not 1, on the population form.
  assert.ok(Math.abs(gini([0, 0, 0, 10]) - 0.75) < 1e-12);
  assert.equal(gini([]), null);
  assert.equal(gini([0, 0]), null);
});

test('the concentration curve counts the units holding each share', () => {
  const curve = concentrationCurve([10, 5, 3, 2], [0.5, 0.8, 1]);
  assert.equal(curve.total, 20);
  assert.equal(curve.units, 4);
  assert.equal(curve.points[0].units, 1); // 10 of 20 is already half
  assert.equal(curve.points[1].units, 3); // 10+5+3 = 18 of 20
  assert.equal(curve.points[2].units, 4);
  assert.equal(curve.topUnitShare, 0.5);
});
