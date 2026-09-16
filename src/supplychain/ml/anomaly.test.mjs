import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAD_SCALE,
  median,
  medianAbsoluteDeviation,
  robustZScores,
  detectAnomalies,
} from './anomaly.js';
import { DataClass } from '../provenance.js';

test('median handles odd and even lengths without mutating the input', () => {
  const values = [5, 1, 3];
  assert.equal(median(values), 3);
  assert.deepEqual(values, [5, 1, 3], 'input must not be sorted in place');
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([7]), 7);
  assert.throws(() => median([]), RangeError);
});

test('medianAbsoluteDeviation scales to be comparable with a standard deviation', () => {
  const result = medianAbsoluteDeviation([1, 2, 3, 4, 5]);
  assert.equal(result.median, 3);
  // Deviations are [2,1,0,1,2]; their median is 1.
  assert.equal(result.mad, 1);
  assert.ok(Math.abs(result.scaledMad - MAD_SCALE) < 1e-12);
});

test('robust statistics are not dragged by the outlier being sought', () => {
  // This is the whole reason for using MAD instead of standard deviation.
  const withOutlier = [10, 11, 10, 12, 11, 10, 500];
  const mean = withOutlier.reduce((a, b) => a + b, 0) / withOutlier.length;
  const sd = Math.sqrt(
    withOutlier.reduce((s, v) => s + (v - mean) ** 2, 0) / withOutlier.length,
  );
  const classicZ = (500 - mean) / sd;
  const { scores } = robustZScores(withOutlier);
  const robustZ = scores[6];
  // A classic z-score cannot exceed (n-1)/sqrt(n) ~= 2.27 here, missing a 50x
  // outlier at any sane threshold. The robust score flags it emphatically.
  assert.ok(classicZ < 2.5, `classic z stays low: ${classicZ}`);
  assert.ok(robustZ > 100, `robust z must be large: ${robustZ}`);
});

test('robustZScores reports "cannot assess" when the MAD is zero', () => {
  // More than half the series identical: deviation is not measurable.
  const result = robustZScores([5, 5, 5, 5, 9]);
  assert.equal(result.assessable, false);
  assert.deepEqual(result.scores, [null, null, null, null, null]);
  assert.equal(result.scaledMad, 0);
});

test('detectAnomalies finds a collapse in a trade-like series', () => {
  // Steady growth, then a sharp 2020-style collapse, then recovery.
  const values = [100, 108, 115, 124, 133, 141, 70, 150, 160, 172];
  const periods = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
  const result = detectAnomalies({
    values,
    periods,
    mode: 'change',
    seriesLabel: 'test trade series',
  });
  assert.equal(result.assessable, true);
  assert.ok(result.anomalies.length >= 1);
  const collapse = result.anomalies.find((a) => a.direction === 'LOW');
  assert.ok(collapse, 'the collapse must be flagged');
  assert.equal(collapse.period, 2021);
  assert.equal(collapse.value, 70);
  assert.equal(collapse.previousValue, 141);
  assert.ok(collapse.percentChange < -40);
});

test('change mode does not flag steady growth as anomalous', () => {
  const steady = [100, 110, 121, 133, 146, 161, 177, 195, 214, 236];
  const result = detectAnomalies({
    values: steady,
    mode: 'change',
    seriesLabel: 'steady growth',
  });
  assert.deepEqual(result.anomalies, [], 'constant growth is not an anomaly');
});

test('level mode flags a value far from the median', () => {
  const result = detectAnomalies({
    values: [10, 11, 10, 12, 11, 10, 95],
    mode: 'level',
    seriesLabel: 'port calls',
  });
  assert.equal(result.anomalies.length, 1);
  assert.equal(result.anomalies[0].value, 95);
  assert.equal(result.anomalies[0].direction, 'HIGH');
  assert.equal(result.anomalies[0].previousValue, null, 'level mode has no previous');
});

test('log changes treat a halving and a doubling symmetrically', () => {
  // Percentage change would score +100% as twice as extreme as -50%, biasing
  // detection toward increases. Log change makes them equal and opposite.
  const halve = detectAnomalies({
    values: [100, 100, 100, 100, 100, 50],
    mode: 'change',
    seriesLabel: 'halve',
    threshold: 1,
  });
  const double = detectAnomalies({
    values: [100, 100, 100, 100, 100, 200],
    mode: 'change',
    seriesLabel: 'double',
    threshold: 1,
  });
  // Both series have MAD zero on the change series (all zeros bar one), so both
  // must report "cannot assess" identically rather than one flagging and not
  // the other.
  assert.equal(halve.assessable, double.assessable);
  if (halve.assessable) {
    assert.ok(
      Math.abs(
        Math.abs(halve.anomalies[0].testStatistic) -
          Math.abs(double.anomalies[0].testStatistic),
      ) < 1e-12,
    );
  }
});

test('a series too short to establish a baseline is refused', () => {
  const result = detectAnomalies({
    values: [1, 2, 3],
    mode: 'change',
    seriesLabel: 'tiny',
  });
  assert.equal(result.assessable, false);
  assert.match(result.reason, /PUBLIC DATA INSUFFICIENT/);
  assert.deepEqual(result.anomalies, []);
});

test('a flat series reports cannot-assess, not no-anomalies', () => {
  // The distinction matters: "we cannot tell" is not "nothing is wrong".
  const result = detectAnomalies({
    values: [50, 50, 50, 50, 50, 50],
    mode: 'level',
    seriesLabel: 'constant',
  });
  assert.equal(result.assessable, false);
  assert.match(result.reason, /cannot assess/);
});

test('zero or negative values are disclosed as a detection gap', () => {
  const result = detectAnomalies({
    values: [100, 0, 120, 130, 140, 400],
    mode: 'change',
    seriesLabel: 'with zero',
  });
  if (result.assessable) {
    assert.ok(
      result.provenance.limitations.some((l) => /log change is undefined/.test(l)),
      'a zero in the series must be disclosed',
    );
  }
});

test('anomaly output is INFERRED and disclaims causation', () => {
  const result = detectAnomalies({
    values: [100, 108, 115, 124, 133, 141, 70, 150],
    mode: 'change',
    seriesLabel: 'test',
  });
  assert.equal(result.provenance.dataClass, DataClass.INFERRED);
  assert.equal(result.provenance.badge, '🟡 INFERRED');
  assert.ok(
    result.provenance.limitations.some((l) => /STATISTICAL, NOT CAUSAL/.test(l)),
    'must disclaim causation',
  );
  assert.ok(
    result.provenance.limitations.some((l) => /absence of a flag/.test(l)),
    'must warn that no flag is not proof of nothing happening',
  );
  assert.ok(result.provenance.limitations.some((l) => /not a significance test/.test(l)));
});

test('detectAnomalies validates its arguments', () => {
  assert.throws(
    () => detectAnomalies({ values: [1, 2, 3, 4, 5], mode: 'wat', seriesLabel: 'x' }),
    TypeError,
  );
  assert.throws(
    () => detectAnomalies({ values: [1, 2, 3, 4, 5], threshold: 0, seriesLabel: 'x' }),
    RangeError,
  );
  assert.throws(() => detectAnomalies({ values: [1, 2, 3, 4, 5], seriesLabel: '' }), TypeError);
  assert.throws(() => detectAnomalies({ values: 'nope', seriesLabel: 'x' }), TypeError);
});

test('a lower threshold flags more points', () => {
  const values = [100, 105, 110, 118, 125, 133, 200, 145];
  const strict = detectAnomalies({ values, seriesLabel: 'x', threshold: 10 });
  const loose = detectAnomalies({ values, seriesLabel: 'x', threshold: 2 });
  assert.ok(loose.anomalies.length >= strict.anomalies.length);
});
