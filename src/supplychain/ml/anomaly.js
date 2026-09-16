/**
 * Anomaly detection over trade and traffic series.
 *
 * Used for §26's "identify unusual trade changes, vessel traffic, route
 * behaviour, port activity, commodity flows".
 *
 * Design choice that matters: detection runs on ROBUST statistics (median and
 * median absolute deviation), not mean and standard deviation. A supply-chain
 * series contains exactly the large outliers we are hunting for, and those
 * outliers inflate the standard deviation enough to hide themselves. The mean
 * and SD of a series containing a 2020 collapse will not flag the 2020 collapse.
 *
 * An anomaly here is a STATISTICAL statement — "this value is far from the rest
 * of the series" — and never a causal one. The record says so, because the step
 * from "unusual" to "something happened" is the reader's to take, with evidence.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

import { DataClass, createProvenance } from '../provenance.js';

/**
 * Consistency constant making MAD a consistent estimator of the standard
 * deviation for normally distributed data: 1 / Phi^-1(0.75) ~= 1.4826.
 */
export const MAD_SCALE = 1.4826;

/** Default robust z-score above which a point is flagged. */
export const DEFAULT_THRESHOLD = 3.5;

function assertSeries(values) {
  if (!Array.isArray(values)) throw new TypeError('values must be an array');
  for (const v of values) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new TypeError('values must contain only finite numbers');
    }
  }
  return values;
}

/**
 * Median of a numeric array. Does not mutate the input.
 * @param {number[]} values
 * @returns {number}
 */
export function median(values) {
  assertSeries(values);
  if (values.length === 0) throw new RangeError('median of an empty series');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Median absolute deviation, scaled to be comparable with a standard deviation.
 * @param {number[]} values
 * @returns {{median:number, mad:number, scaledMad:number}}
 */
export function medianAbsoluteDeviation(values) {
  const centre = median(values);
  const mad = median(values.map((v) => Math.abs(v - centre)));
  return { median: centre, mad, scaledMad: mad * MAD_SCALE };
}

/**
 * Robust z-scores for a level series.
 *
 * Returns null scores when the MAD is zero — that happens when more than half
 * the series is identical, and every "deviation" would otherwise divide by zero
 * and report Infinity. A caller must treat that as "cannot assess", not "no
 * anomalies".
 *
 * @param {number[]} values
 * @returns {{scores:Array<number|null>, median:number, scaledMad:number, assessable:boolean}}
 */
export function robustZScores(values) {
  assertSeries(values);
  if (values.length === 0) {
    return { scores: [], median: NaN, scaledMad: NaN, assessable: false };
  }
  const { median: centre, scaledMad } = medianAbsoluteDeviation(values);
  if (scaledMad === 0) {
    return {
      scores: values.map(() => null),
      median: centre,
      scaledMad,
      assessable: false,
    };
  }
  return {
    scores: values.map((v) => (v - centre) / scaledMad),
    median: centre,
    scaledMad,
    assessable: true,
  };
}

/**
 * Detect anomalies in a series.
 *
 * Two modes:
 *   'level'  — flag values far from the series median. Right for a stationary
 *              series such as weekly vessel counts at a port.
 *   'change' — flag year-on-year LOG changes far from the median change. Right
 *              for a trending series such as trade value, where a level test
 *              would flag every recent year simply for being larger.
 *
 * Log changes are used rather than percentage changes because they are
 * symmetric: a halving and a doubling are equal and opposite, whereas -50% and
 * +100% are not, which otherwise biases detection towards flagging increases.
 *
 * @param {object} input
 * @param {number[]} input.values
 * @param {Array<number|string>} [input.periods]
 * @param {'level'|'change'} [input.mode='change']
 * @param {number} [input.threshold=DEFAULT_THRESHOLD]
 * @param {string} input.seriesLabel
 * @param {string} [input.sourceLabel]
 * @returns {Readonly<object>}
 */
export function detectAnomalies({
  values,
  periods = null,
  mode = 'change',
  threshold = DEFAULT_THRESHOLD,
  seriesLabel,
  sourceLabel = 'UN Comtrade',
}) {
  assertSeries(values);
  if (mode !== 'level' && mode !== 'change') {
    throw new TypeError(`Unknown mode: ${mode}`);
  }
  if (typeof threshold !== 'number' || !(threshold > 0)) {
    throw new RangeError('threshold must be a positive number');
  }
  if (typeof seriesLabel !== 'string' || seriesLabel === '') {
    throw new TypeError('seriesLabel is required');
  }

  // A short series has no stable notion of "typical" to deviate from.
  const minimum = mode === 'change' ? 5 : 4;
  if (values.length < minimum) {
    return Object.freeze({
      seriesLabel,
      mode,
      assessable: false,
      reason:
        `Only ${values.length} observations; at least ${minimum} are needed to ` +
        'establish a baseline. PUBLIC DATA INSUFFICIENT.',
      anomalies: Object.freeze([]),
      provenance: anomalyProvenance({
        seriesLabel,
        sourceLabel,
        mode,
        threshold,
      }),
    });
  }

  let testValues;
  let indexOffset;
  let nonPositive = false;
  if (mode === 'change') {
    testValues = [];
    for (let i = 1; i < values.length; i += 1) {
      // Log change is undefined at or below zero; such a step is skipped and
      // disclosed rather than silently dropped.
      if (values[i] <= 0 || values[i - 1] <= 0) {
        nonPositive = true;
        testValues.push(0);
      } else {
        testValues.push(Math.log(values[i] / values[i - 1]));
      }
    }
    indexOffset = 1;
  } else {
    testValues = values;
    indexOffset = 0;
  }

  const {
    scores,
    median: centre,
    scaledMad,
    assessable,
  } = robustZScores(testValues);
  if (!assessable) {
    return Object.freeze({
      seriesLabel,
      mode,
      assessable: false,
      reason:
        'The median absolute deviation is zero — more than half the series is ' +
        'identical — so deviation cannot be measured. This is "cannot assess", ' +
        'not "no anomalies".',
      anomalies: Object.freeze([]),
      provenance: anomalyProvenance({
        seriesLabel,
        sourceLabel,
        mode,
        threshold,
      }),
    });
  }

  const anomalies = [];
  for (let i = 0; i < scores.length; i += 1) {
    if (Math.abs(scores[i]) < threshold) continue;
    const index = i + indexOffset;
    anomalies.push(
      Object.freeze({
        index,
        period: periods ? (periods[index] ?? null) : null,
        value: values[index],
        previousValue: mode === 'change' ? values[index - 1] : null,
        testStatistic: testValues[i],
        robustZ: scores[i],
        direction: scores[i] > 0 ? 'HIGH' : 'LOW',
        // Percentage change is reported for readability alongside the log change
        // the test actually used.
        percentChange:
          mode === 'change' && values[index - 1] > 0
            ? ((values[index] - values[index - 1]) / values[index - 1]) * 100
            : null,
      }),
    );
  }

  const limitations = [];
  if (nonPositive) {
    limitations.push(
      'The series contains zero or negative values, where a log change is ' +
        'undefined. Those steps were tested as zero change and may be missed.',
    );
  }

  return Object.freeze({
    seriesLabel,
    mode,
    assessable: true,
    reason: null,
    threshold,
    baseline: Object.freeze({
      median: centre,
      scaledMad,
      statistic: mode === 'change' ? 'log year-on-year change' : 'level',
    }),
    anomalies: Object.freeze(anomalies),
    provenance: anomalyProvenance({
      seriesLabel,
      sourceLabel,
      mode,
      threshold,
      extraLimitations: limitations,
    }),
  });
}

function anomalyProvenance({
  seriesLabel,
  sourceLabel,
  mode,
  threshold,
  extraLimitations = [],
}) {
  return createProvenance({
    dataClass: DataClass.INFERRED,
    source: 'Global Supply Chain Eye anomaly detection',
    dataset: `anomaly:${seriesLabel}`,
    license: 'MIT (model output)',
    method:
      `Robust z-score on the ${mode === 'change' ? 'log year-on-year change' : 'level'} ` +
      `series, using median and scaled median absolute deviation (x${MAD_SCALE}), ` +
      `flagging |z| >= ${threshold}.`,
    confidence: 0.6,
    limitations: [
      'STATISTICAL, NOT CAUSAL. A flagged point is unusual relative to the rest ' +
        'of the series. It does not identify a cause, and the absence of a flag ' +
        'does not mean nothing happened.',
      'Robust statistics are used deliberately: mean and standard deviation are ' +
        'inflated by the very outliers being sought, which hides them.',
      `The threshold (${threshold}) is a convention, not a significance test. ` +
        'It does not carry a p-value.',
      'Annual trade series are short. A structural break early in the series ' +
        'shifts the baseline against which everything else is judged.',
      `Input series source: ${sourceLabel}.`,
      ...extraLimitations,
    ],
  });
}
