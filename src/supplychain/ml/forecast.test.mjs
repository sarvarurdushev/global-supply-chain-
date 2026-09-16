import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_OBSERVATIONS,
  naiveForecast,
  driftForecast,
  meanForecast,
  holtForecast,
  errorMetrics,
  predictionInterval,
  backtest,
  forecast,
} from './forecast.js';
import { DataClass } from '../provenance.js';

const LINEAR = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const FLAT = [50, 51, 49, 50, 52, 48, 50, 51, 49, 50];

test('naiveForecast repeats the last observation', () => {
  assert.deepEqual(naiveForecast(LINEAR, 3).point, [100, 100, 100]);
  assert.throws(() => naiveForecast([], 1), RangeError);
  assert.throws(() => naiveForecast(LINEAR, 0), RangeError);
  assert.throws(() => naiveForecast([1, 'x'], 1), TypeError);
});

test('driftForecast extends the first-to-last slope', () => {
  const result = driftForecast(LINEAR, 3);
  assert.equal(result.drift, 10);
  assert.deepEqual(result.point, [110, 120, 130]);
  assert.throws(() => driftForecast([5], 1), RangeError);
});

test('meanForecast returns the series mean', () => {
  assert.deepEqual(meanForecast([10, 20, 30], 2).point, [20, 20]);
});

test('holtForecast tracks a clean linear trend', () => {
  const result = holtForecast(LINEAR, 3);
  assert.equal(result.method, 'holt-damped');
  assert.equal(result.point.length, 3);
  // A damped trend rises but by less than the undamped +10 per step.
  assert.ok(result.point[0] > 100, `expected > 100, got ${result.point[0]}`);
  assert.ok(result.point[0] < 115, `damping should hold it under 115, got ${result.point[0]}`);
  assert.ok(result.point[1] > result.point[0], 'should keep rising');
  assert.ok(result.alpha > 0 && result.alpha <= 1);
  assert.ok(result.beta > 0 && result.beta <= 1);
});

test('holtForecast refuses to fit a series too short to mean anything', () => {
  assert.throws(
    () => holtForecast([1, 2, 3], 2),
    /needs at least 5 observations/,
  );
  assert.throws(() => holtForecast(LINEAR, 3, { damping: 0 }), RangeError);
  assert.throws(() => holtForecast(LINEAR, 3, { damping: 1.5 }), RangeError);
});

test('damped trend flattens over a long horizon rather than exploding', () => {
  const result = holtForecast(LINEAR, 20, { damping: 0.8 });
  const firstStep = result.point[1] - result.point[0];
  const lastStep = result.point[19] - result.point[18];
  assert.ok(lastStep < firstStep, 'damping must shrink successive increments');
  assert.ok(lastStep >= 0);
});

test('errorMetrics computes MAE, RMSE, MAPE and MASE', () => {
  const metrics = errorMetrics([10, 20, 30], [12, 18, 33], [10, 20, 30]);
  // |2| + |-2| + |3| = 7, over 3.
  assert.ok(Math.abs(metrics.mae - 7 / 3) < 1e-12);
  assert.ok(Math.abs(metrics.rmse - Math.sqrt((4 + 4 + 9) / 3)) < 1e-12);
  assert.ok(metrics.mape > 0);
  // Naive scale on [10,20,30] is 10, so MASE = (7/3)/10.
  assert.ok(Math.abs(metrics.mase - 7 / 30) < 1e-12);
  assert.equal(metrics.n, 3);
});

test('MAPE is null when an actual is zero rather than silently skipped', () => {
  const metrics = errorMetrics([0, 10], [1, 11]);
  assert.equal(metrics.mape, null);
  assert.ok(metrics.mae > 0);
});

test('MASE is null when the training series is flat', () => {
  // A constant training series has zero naive scale; MASE would divide by zero.
  const metrics = errorMetrics([5, 5], [6, 4], [5, 5, 5, 5]);
  assert.equal(metrics.mase, null);
});

test('errorMetrics rejects mismatched inputs', () => {
  assert.throws(() => errorMetrics([1, 2], [1]), RangeError);
  assert.throws(() => errorMetrics([], []), RangeError);
});

test('predictionInterval widens with the horizon and states its caveat', () => {
  const interval = predictionInterval([1, -1, 2, -2, 1, -1], [100, 100, 100]);
  assert.ok(interval.sigma > 0);
  assert.ok(interval.lower[0] < 100 && interval.upper[0] > 100);
  const firstWidth = interval.upper[0] - interval.lower[0];
  const thirdWidth = interval.upper[2] - interval.lower[2];
  assert.ok(thirdWidth > firstWidth, 'uncertainty must grow with horizon');
  assert.match(interval.nominalCoverage, /9[45]%/);
  // The honesty caveat is mandatory, not decorative.
  assert.match(interval.caveat, /excludes/);
  assert.match(interval.caveat, /Real coverage is lower than nominal/);
  assert.throws(() => predictionInterval([1], [100]), RangeError);
});

test('backtest evaluates out of sample, not in sample', () => {
  const result = backtest(LINEAR, (train, h) => driftForecast(train, h), { minTrain: 3 });
  assert.ok(result.folds > 0);
  // Drift is exact on a perfectly linear series.
  assert.ok(result.metrics.mae < 1e-9, `expected near-zero error, got ${result.metrics.mae}`);
});

test('backtest counts folds a model declined to fit rather than failing', () => {
  const result = backtest(LINEAR, (train, h) => holtForecast(train, h), { minTrain: 2 });
  // Holt refuses below MIN_OBSERVATIONS, so early folds are skipped.
  assert.ok(result.skipped > 0, 'short prefixes must be skipped, not crash');
  assert.ok(result.folds > 0);
});

test('backtest with no usable fold reports null metrics', () => {
  const result = backtest([1, 2, 3], (train, h) => holtForecast(train, h), { minTrain: 2 });
  assert.equal(result.folds, 0);
  assert.equal(result.metrics, null);
});

test('forecast always returns baselines alongside the model', () => {
  const result = forecast({
    values: LINEAR,
    horizon: 3,
    unit: 'current US$',
    seriesLabel: 'test linear series',
  });
  assert.equal(result.modelFitted, true);
  assert.equal(result.baselines.length, 3);
  const methods = result.baselines.map((b) => b.method).sort();
  assert.deepEqual(methods, ['drift', 'mean', 'naive']);
  // Every baseline carries its own out-of-sample evaluation.
  for (const b of result.baselines) assert.ok(b.backtest.metrics !== undefined);
  assert.ok(result.recommended);
  assert.ok(result.model.interval);
});

test('forecast reports honestly when a baseline beats the model', () => {
  // Drift is exact on a perfectly linear series, so it should win.
  const result = forecast({
    values: LINEAR,
    horizon: 3,
    unit: 'USD',
    seriesLabel: 'linear',
  });
  assert.equal(result.recommended.method, 'drift');
  assert.equal(result.modelBeatsBaseline, false);
});

test('forecast declines to fit a short series but still extrapolates', () => {
  const result = forecast({
    values: [10, 20, 30],
    horizon: 2,
    unit: 'USD',
    seriesLabel: 'short',
  });
  assert.equal(result.modelFitted, false);
  assert.match(result.reason, /needs at least 5/);
  // Baselines are still offered: a short series deserves an honest extrapolation.
  assert.equal(result.baselines.length, 3);
  assert.ok(result.recommended);
});

test('forecast refuses entirely below two observations', () => {
  const result = forecast({ values: [42], horizon: 2, unit: 'USD', seriesLabel: 'single' });
  assert.equal(result.modelFitted, false);
  assert.match(result.reason, /PUBLIC DATA INSUFFICIENT/);
  assert.equal(result.model, null);
  assert.deepEqual(result.baselines, []);
});

test('forecast discloses when a fitted model is not validated out of sample', () => {
  const result = forecast({
    values: [10, 12, 11, 14, 13],
    horizon: 2,
    unit: 'USD',
    seriesLabel: 'just enough to fit',
  });
  assert.equal(result.observations, MIN_OBSERVATIONS);
  assert.equal(result.modelFitted, true);
  assert.match(result.reason, /NOT validated out of sample/);
  assert.equal(result.model.backtest.metrics, null);
  assert.equal(result.modelBeatsBaseline, null);
});

test('forecast output is SIMULATED with model limitations', () => {
  const result = forecast({
    values: LINEAR,
    horizon: 3,
    unit: 'USD',
    seriesLabel: 'test',
  });
  assert.equal(result.provenance.dataClass, DataClass.SIMULATED);
  assert.equal(result.provenance.badge, '🟠 SIMULATED');
  assert.ok(result.provenance.limitations.some((l) => /not an observation/i.test(l)));
  assert.ok(result.provenance.limitations.some((l) => /small sample/i.test(l)));
  assert.ok(
    result.provenance.limitations.some((l) => /Tariff changes, sanctions/.test(l)),
    'must warn that the events we study break the stability assumption',
  );
});

test('forecast requires a unit and a label', () => {
  assert.throws(
    () => forecast({ values: LINEAR, unit: '', seriesLabel: 'x' }),
    /unit is required/,
  );
  assert.throws(
    () => forecast({ values: LINEAR, unit: 'USD', seriesLabel: '' }),
    /seriesLabel is required/,
  );
});

test('a noisy flat series favours a flat baseline over a trend model', () => {
  const result = forecast({
    values: FLAT,
    horizon: 3,
    unit: 'USD',
    seriesLabel: 'flat noisy',
  });
  // On pure noise the trend model must not win — that would be reading noise
  // as signal, which is exactly what the baseline comparison exists to catch.
  assert.ok(['naive', 'mean', 'drift'].includes(result.recommended.method));
  assert.equal(result.modelBeatsBaseline, false);
});
