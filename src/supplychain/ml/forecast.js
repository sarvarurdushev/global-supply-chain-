/**
 * Forecasting, with a baseline attached to every result.
 *
 * §26 of the brief: "Always compare ML output against a simple baseline. Show:
 * MODEL / BASELINE / ERROR / CONFIDENCE INTERVAL." This module makes that
 * structural rather than advisory — `forecast()` cannot return a model result
 * without also returning the baselines it was measured against, and it refuses
 * to fit at all when the series is too short for the fit to mean anything.
 *
 * A note on ambition, because it matters academically: UN Comtrade annual data
 * gives roughly 10-30 observations per series. That is far too few for anything
 * elaborate — an LSTM on 12 annual points is not machine learning, it is
 * overfitting with extra steps. The models here are deliberately small:
 * exponential smoothing with and without trend, measured honestly against naive
 * and drift baselines. Where the baseline wins, the result says so.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

import { DataClass, createProvenance } from '../provenance.js';

/**
 * Minimum observations before a model will be fitted at all.
 *
 * Holt's method estimates level and trend; below this the parameter estimates
 * are dominated by noise and the prediction interval is meaningless.
 */
export const MIN_OBSERVATIONS = 5;

/** Minimum observations before a backtest is attempted. */
export const MIN_BACKTEST_OBSERVATIONS = 8;

function assertSeries(values, label = 'series') {
  if (!Array.isArray(values)) {
    throw new TypeError(`${label} must be an array`);
  }
  for (const v of values) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new TypeError(`${label} must contain only finite numbers`);
    }
  }
  return values;
}

function assertHorizon(horizon) {
  if (!Number.isInteger(horizon) || horizon < 1) {
    throw new RangeError('horizon must be a positive integer');
  }
  return horizon;
}

/* ------------------------------------------------------------------ *
 * Baselines
 * ------------------------------------------------------------------ */

/**
 * Naive forecast: every future value equals the last observed value.
 *
 * The standard reference point for non-seasonal series. A model that cannot
 * beat this is not adding information.
 *
 * @param {number[]} values
 * @param {number} horizon
 * @returns {{method:string, point:number[]}}
 */
export function naiveForecast(values, horizon) {
  assertSeries(values);
  assertHorizon(horizon);
  if (values.length === 0)
    throw new RangeError('naive forecast needs an observation');
  const last = values[values.length - 1];
  return { method: 'naive', point: Array(horizon).fill(last) };
}

/**
 * Drift forecast: extend the straight line from the first to the last
 * observation.
 *
 * Equivalent to a random walk with drift, and a much stronger baseline than
 * naive for a trending series such as trade value.
 *
 * @param {number[]} values
 * @param {number} horizon
 * @returns {{method:string, point:number[], drift:number}}
 */
export function driftForecast(values, horizon) {
  assertSeries(values);
  assertHorizon(horizon);
  const n = values.length;
  if (n < 2)
    throw new RangeError('drift forecast needs at least two observations');
  const slope = (values[n - 1] - values[0]) / (n - 1);
  const last = values[n - 1];
  return {
    method: 'drift',
    drift: slope,
    point: Array.from({ length: horizon }, (_, h) => last + slope * (h + 1)),
  };
}

/**
 * Mean forecast: every future value equals the series mean.
 * Included because it wins on a genuinely flat, noisy series, and a model that
 * loses to it is reading noise as signal.
 *
 * @param {number[]} values
 * @param {number} horizon
 * @returns {{method:string, point:number[]}}
 */
export function meanForecast(values, horizon) {
  assertSeries(values);
  assertHorizon(horizon);
  if (values.length === 0)
    throw new RangeError('mean forecast needs an observation');
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { method: 'mean', point: Array(horizon).fill(mean) };
}

/* ------------------------------------------------------------------ *
 * Model
 * ------------------------------------------------------------------ */

/**
 * Holt's linear-trend exponential smoothing.
 *
 *   level_t = alpha * y_t         + (1 - alpha) * (level_{t-1} + trend_{t-1})
 *   trend_t = beta  * (level_t - level_{t-1}) + (1 - beta) * trend_{t-1}
 *   yhat_{t+h} = level_t + h * phi_h * trend_t
 *
 * `damping` (phi) shrinks the trend as the horizon grows. An undamped linear
 * trend extrapolated several years out produces absurd numbers, and damped
 * trend is the better default in forecasting practice, so phi defaults below 1.
 *
 * alpha and beta are fitted by grid search minimising in-sample sum of squared
 * one-step errors. A grid is used rather than gradient descent because the
 * surface is cheap to evaluate, the parameter space is two-dimensional and
 * bounded, and a grid cannot land in a bad local optimum or fail to converge.
 *
 * @param {number[]} values
 * @param {number} horizon
 * @param {object} [options]
 * @param {number} [options.damping=0.9] phi, within (0, 1]
 * @param {number} [options.gridStep=0.05]
 * @returns {{method:string, point:number[], alpha:number, beta:number, damping:number, residuals:number[], sse:number}}
 */
export function holtForecast(values, horizon, options = {}) {
  assertSeries(values);
  assertHorizon(horizon);
  const { damping = 0.9, gridStep = 0.05 } = options;
  if (typeof damping !== 'number' || damping <= 0 || damping > 1) {
    throw new RangeError('damping must be within (0, 1]');
  }
  if (values.length < MIN_OBSERVATIONS) {
    throw new RangeError(
      `Holt's method needs at least ${MIN_OBSERVATIONS} observations; ` +
        `received ${values.length}. Use a baseline instead of pretending to fit.`,
    );
  }

  let best = null;
  for (let alpha = gridStep; alpha <= 1; alpha += gridStep) {
    for (let beta = gridStep; beta <= 1; beta += gridStep) {
      const fit = runHolt(values, alpha, beta, damping);
      if (best === null || fit.sse < best.sse) best = { ...fit, alpha, beta };
    }
  }

  const point = [];
  for (let h = 1; h <= horizon; h += 1) {
    // Damped trend: sum of phi^1..phi^h, not h * phi.
    let dampingSum = 0;
    for (let i = 1; i <= h; i += 1) dampingSum += damping ** i;
    point.push(best.level + dampingSum * best.trend);
  }

  return {
    method: 'holt-damped',
    point,
    alpha: Number(best.alpha.toFixed(4)),
    beta: Number(best.beta.toFixed(4)),
    damping,
    residuals: best.residuals,
    sse: best.sse,
  };
}

function runHolt(values, alpha, beta, damping) {
  let level = values[0];
  // Initialise the trend from the first difference — the standard choice.
  let trend = values[1] - values[0];
  const residuals = [];
  let sse = 0;
  for (let t = 1; t < values.length; t += 1) {
    const forecastValue = level + damping * trend;
    const error = values[t] - forecastValue;
    residuals.push(error);
    sse += error * error;
    const previousLevel = level;
    level = alpha * values[t] + (1 - alpha) * (level + damping * trend);
    trend = beta * (level - previousLevel) + (1 - beta) * damping * trend;
  }
  return { level, trend, residuals, sse };
}

/* ------------------------------------------------------------------ *
 * Error metrics
 * ------------------------------------------------------------------ */

/**
 * Forecast error metrics.
 *
 * MASE is the headline metric: it is scale-free, defined when actuals are zero
 * (unlike MAPE), and has a hard interpretation — **below 1 means the forecast
 * beat the in-sample naive method; at or above 1 means it did not.** MAPE is
 * reported too because it is what non-specialists read, but it is null when any
 * actual is zero rather than being silently skipped.
 *
 * @param {number[]} actual
 * @param {number[]} predicted
 * @param {number[]} [trainingSeries] required for MASE
 * @returns {{mae:number, rmse:number, mape:number|null, mase:number|null, n:number}}
 */
export function errorMetrics(actual, predicted, trainingSeries = null) {
  assertSeries(actual, 'actual');
  assertSeries(predicted, 'predicted');
  if (actual.length !== predicted.length) {
    throw new RangeError('actual and predicted must be the same length');
  }
  if (actual.length === 0)
    throw new RangeError('need at least one observation');

  const n = actual.length;
  let absSum = 0;
  let sqSum = 0;
  let pctSum = 0;
  let anyZeroActual = false;
  for (let i = 0; i < n; i += 1) {
    const error = actual[i] - predicted[i];
    absSum += Math.abs(error);
    sqSum += error * error;
    if (actual[i] === 0) anyZeroActual = true;
    else pctSum += Math.abs(error / actual[i]);
  }

  let mase = null;
  if (Array.isArray(trainingSeries) && trainingSeries.length >= 2) {
    // Scale = mean absolute one-step naive error over the TRAINING series.
    let naiveSum = 0;
    for (let i = 1; i < trainingSeries.length; i += 1) {
      naiveSum += Math.abs(trainingSeries[i] - trainingSeries[i - 1]);
    }
    const scale = naiveSum / (trainingSeries.length - 1);
    // A perfectly flat training series has zero scale; MASE is undefined there.
    if (scale > 0) mase = absSum / n / scale;
  }

  return {
    mae: absSum / n,
    rmse: Math.sqrt(sqSum / n),
    mape: anyZeroActual ? null : (pctSum / n) * 100,
    mase,
    n,
  };
}

/**
 * Prediction interval from the standard deviation of in-sample residuals.
 *
 * The interval widens with the square root of the horizon, which is the correct
 * behaviour for a random-walk-like process.
 *
 * IMPORTANT, and stated in the returned record: this interval reflects only the
 * model's residual variance. It does NOT account for parameter uncertainty,
 * model misspecification, or the possibility that the underlying trade
 * relationship changes. Real coverage will be worse than nominal — often much
 * worse over a horizon of several years.
 *
 * @param {number[]} residuals
 * @param {number[]} point
 * @param {number} [z=1.96] 1.96 for a nominal 95% interval
 * @returns {{lower:number[], upper:number[], sigma:number, nominalCoverage:string, caveat:string}}
 */
export function predictionInterval(residuals, point, z = 1.96) {
  assertSeries(residuals, 'residuals');
  assertSeries(point, 'point');
  if (residuals.length < 2) {
    throw new RangeError('a prediction interval needs at least two residuals');
  }
  const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  const variance =
    residuals.reduce((sum, r) => sum + (r - mean) ** 2, 0) /
    (residuals.length - 1);
  const sigma = Math.sqrt(variance);
  return {
    sigma,
    lower: point.map((p, h) => p - z * sigma * Math.sqrt(h + 1)),
    upper: point.map((p, h) => p + z * sigma * Math.sqrt(h + 1)),
    nominalCoverage: `${Math.round((1 - 2 * (1 - normalCdf(z))) * 100)}%`,
    caveat:
      'This interval reflects in-sample residual variance only. It excludes ' +
      'parameter uncertainty, model misspecification, and structural change in ' +
      'the underlying trade relationship. Real coverage is lower than nominal, ' +
      'increasingly so at longer horizons.',
  };
}

/** Standard normal CDF, via an Abramowitz-Stegun erf approximation. */
function normalCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p =
    d *
    t *
    (0.31938153 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - p : p;
}

/**
 * Rolling-origin backtest.
 *
 * Repeatedly fits on a prefix and predicts the next `horizon` points, so the
 * reported error is genuinely out-of-sample. This is the only honest way to
 * claim a model works; in-sample fit proves nothing.
 *
 * @param {number[]} values
 * @param {(train:number[], horizon:number)=>{point:number[]}} fit
 * @param {object} [options]
 * @param {number} [options.horizon=1]
 * @param {number} [options.minTrain=MIN_OBSERVATIONS]
 * @returns {{folds:number, metrics:object|null, skipped:number}}
 */
export function backtest(values, fit, options = {}) {
  assertSeries(values);
  const { horizon = 1, minTrain = MIN_OBSERVATIONS } = options;
  assertHorizon(horizon);

  const actuals = [];
  const predictions = [];
  let folds = 0;
  let skipped = 0;
  for (let split = minTrain; split + horizon <= values.length; split += 1) {
    const train = values.slice(0, split);
    const test = values.slice(split, split + horizon);
    let result;
    try {
      result = fit(train, horizon);
    } catch {
      // A model that refuses to fit this prefix is a skipped fold, not a
      // failure: it is the model correctly declining to guess.
      skipped += 1;
      continue;
    }
    folds += 1;
    for (let i = 0; i < horizon; i += 1) {
      actuals.push(test[i]);
      predictions.push(result.point[i]);
    }
  }
  return {
    folds,
    skipped,
    metrics: folds === 0 ? null : errorMetrics(actuals, predictions, values),
  };
}

/* ------------------------------------------------------------------ *
 * The public entry point
 * ------------------------------------------------------------------ */

/**
 * Forecast a series, always alongside its baselines.
 *
 * Returns a record that a caller cannot render without also having the baseline
 * comparison in hand, which is the point.
 *
 * When the series is too short to fit a model, this does NOT fail — it returns
 * the best baseline with `modelFitted: false` and a stated reason. A short
 * series still deserves an honest extrapolation; it just does not deserve a
 * model.
 *
 * @param {object} input
 * @param {number[]} input.values chronological observations
 * @param {Array<number|string>} [input.periods] labels for the observations
 * @param {number} [input.horizon=3]
 * @param {string} input.unit e.g. 'current US$'
 * @param {string} input.seriesLabel e.g. 'KOR exports of HS 8542'
 * @param {string} [input.sourceLabel]
 * @param {string} [input.retrievedAt]
 * @returns {Readonly<object>}
 */
export function forecast({
  values,
  periods = null,
  horizon = 3,
  unit,
  seriesLabel,
  sourceLabel = 'UN Comtrade',
  retrievedAt = null,
}) {
  assertSeries(values);
  assertHorizon(horizon);
  if (typeof unit !== 'string' || unit === '') {
    throw new TypeError(
      'unit is required — an unlabelled forecast is unusable',
    );
  }
  if (typeof seriesLabel !== 'string' || seriesLabel === '') {
    throw new TypeError('seriesLabel is required');
  }

  if (values.length < 2) {
    return Object.freeze({
      seriesLabel,
      unit,
      modelFitted: false,
      reason:
        `Only ${values.length} observation(s). No forecast is possible. ` +
        'PUBLIC DATA INSUFFICIENT.',
      observations: values.length,
      model: null,
      baselines: Object.freeze([]),
      recommended: null,
      provenance: modelProvenance({
        seriesLabel,
        sourceLabel,
        retrievedAt,
        fitted: false,
      }),
    });
  }

  // Baselines are always computed.
  const baselineFns = [
    ['naive', (v, h) => naiveForecast(v, h)],
    ['drift', (v, h) => driftForecast(v, h)],
    ['mean', (v, h) => meanForecast(v, h)],
  ];
  const baselines = baselineFns.map(([name, fn]) => {
    const point = fn(values, horizon).point;
    const bt = backtest(values, fn, {
      minTrain: Math.min(2, values.length - 1),
    });
    return Object.freeze({
      method: name,
      point: Object.freeze(point),
      backtest: bt,
    });
  });

  let model = null;
  let reason = null;
  if (values.length < MIN_OBSERVATIONS) {
    reason =
      `Only ${values.length} observations; Holt's method needs at least ` +
      `${MIN_OBSERVATIONS}. Reporting baselines only rather than fitting a ` +
      'model whose parameters would be noise.';
  } else {
    const fitted = holtForecast(values, horizon);
    const interval =
      fitted.residuals.length >= 2
        ? predictionInterval(fitted.residuals, fitted.point)
        : null;
    const bt =
      values.length >= MIN_BACKTEST_OBSERVATIONS
        ? backtest(values, (v, h) => holtForecast(v, h))
        : { folds: 0, skipped: 0, metrics: null };
    model = Object.freeze({
      method: fitted.method,
      point: Object.freeze(fitted.point),
      parameters: Object.freeze({
        alpha: fitted.alpha,
        beta: fitted.beta,
        damping: fitted.damping,
      }),
      interval: interval === null ? null : Object.freeze(interval),
      backtest: bt,
    });
    if (bt.metrics === null) {
      reason =
        `Fitted, but only ${values.length} observations — fewer than the ` +
        `${MIN_BACKTEST_OBSERVATIONS} needed for a rolling-origin backtest. ` +
        'The model is NOT validated out of sample.';
    }
  }

  // Pick the method with the lowest out-of-sample MAE, model included.
  const candidates = [
    ...baselines.map((b) => ({
      method: b.method,
      metrics: b.backtest.metrics,
    })),
    ...(model?.backtest.metrics
      ? [{ method: model.method, metrics: model.backtest.metrics }]
      : []),
  ].filter((c) => c.metrics !== null);
  candidates.sort((a, b) => a.metrics.mae - b.metrics.mae);
  const winner = candidates[0] ?? null;

  const beatsBaseline =
    model?.backtest.metrics && winner ? winner.method === model.method : null;

  return Object.freeze({
    seriesLabel,
    unit,
    periods: periods === null ? null : Object.freeze([...periods]),
    observations: values.length,
    horizon,
    modelFitted: model !== null,
    reason,
    model,
    baselines: Object.freeze(baselines),
    recommended: winner
      ? Object.freeze({
          method: winner.method,
          reason:
            'Lowest out-of-sample mean absolute error in a rolling-origin backtest.',
          metrics: winner.metrics,
        })
      : null,
    /**
     * Null when no backtest was possible. False is a meaningful, publishable
     * result: it says the simple baseline was better and should be used.
     */
    modelBeatsBaseline: beatsBaseline,
    provenance: modelProvenance({
      seriesLabel,
      sourceLabel,
      retrievedAt,
      fitted: model !== null,
      validated: Boolean(model?.backtest.metrics),
    }),
  });
}

function modelProvenance({
  seriesLabel,
  sourceLabel,
  retrievedAt,
  fitted,
  validated = false,
}) {
  const limitations = [
    'MODEL OUTPUT. A forecast is not an observation.',
    'Fitted on annual trade data, which typically gives 10-30 observations. ' +
      'That is a small sample for any time-series model.',
    'Assumes the underlying trade relationship is stable. Tariff changes, ' +
      'sanctions, conflict and technology shifts all break that assumption, ' +
      'and are precisely the events this application exists to study.',
  ];
  if (!fitted) {
    limitations.push(
      'No model was fitted; this result is a baseline extrapolation.',
    );
  }
  if (fitted && !validated) {
    limitations.push(
      'The series was too short for a rolling-origin backtest, so this model ' +
        'is NOT validated out of sample.',
    );
  }
  return createProvenance({
    dataClass: DataClass.SIMULATED,
    source: 'Global Supply Chain Eye forecasting module',
    dataset: `forecast:${seriesLabel}`,
    license: 'MIT (model output)',
    method:
      'Damped Holt linear-trend exponential smoothing, parameters fitted by ' +
      'grid search on in-sample SSE, compared against naive, drift and mean ' +
      'baselines under a rolling-origin backtest.',
    retrievedAt,
    updateFrequency: 'recomputed on demand',
    confidence: validated ? 0.6 : 0.45,
    limitations: [...limitations, `Input series source: ${sourceLabel}.`],
  });
}
