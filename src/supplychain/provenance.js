/**
 * Provenance and confidence model.
 *
 * Every number, route, event, asset, commodity association and prediction that
 * this application displays must carry a provenance record. This module is the
 * one place that decides what a valid record looks like, and it refuses to build
 * an invalid one rather than defaulting a missing field.
 *
 * Portable: no Cesium, no Node, no browser globals.
 *
 * See docs/CONFIDENCE_METHODOLOGY.md for the reasoning behind the bands.
 */

/**
 * How a value came to exist. These are never merged or defaulted silently — a
 * value with no known class is UNKNOWN, not LIVE.
 * @enum {string}
 */
export const DataClass = Object.freeze({
  /** Fresh public telemetry, observed within the source's stated update period. */
  LIVE: 'LIVE',
  /** Archived or published observation. Real, but not current. */
  HISTORICAL: 'HISTORICAL',
  /** Derived from combining public datasets. Not directly observed. */
  INFERRED: 'INFERRED',
  /** Produced by a scenario or model run. Did not happen. */
  SIMULATED: 'SIMULATED',
  /** Insufficient evidence. Displayed as a gap, never as a value. */
  UNKNOWN: 'UNKNOWN',
});

/** Display badges for each data class (§23 of the brief). */
export const DATA_CLASS_BADGE = Object.freeze({
  [DataClass.LIVE]: '🟢 LIVE',
  [DataClass.HISTORICAL]: '🔵 HISTORICAL',
  [DataClass.INFERRED]: '🟡 INFERRED',
  [DataClass.SIMULATED]: '🟠 SIMULATED',
  [DataClass.UNKNOWN]: '⚪ UNKNOWN',
});

/**
 * Evidence-strength bands.
 *
 * IMPORTANT: these are methodological labels, not probabilities. "82%" does not
 * mean "correct 82 times out of 100". It means the evidence satisfies the
 * STRONG band's criteria. This distinction is stated in the UI, not only here.
 */
export const ConfidenceBand = Object.freeze({
  DOCUMENTED: 'DOCUMENTED',
  STRONG: 'STRONG',
  MODERATE: 'MODERATE',
  WEAK: 'WEAK',
  INSUFFICIENT: 'INSUFFICIENT',
});

/** Lower bound (inclusive) of each band, as a 0–1 score. */
export const CONFIDENCE_THRESHOLDS = Object.freeze({
  [ConfidenceBand.DOCUMENTED]: 0.95,
  [ConfidenceBand.STRONG]: 0.8,
  [ConfidenceBand.MODERATE]: 0.6,
  [ConfidenceBand.WEAK]: 0.4,
  [ConfidenceBand.INSUFFICIENT]: 0,
});

/**
 * Below this score an inference is not displayed as a meaningful inference.
 * §25 of the brief: "<40% — do not display as meaningful inference."
 */
export const DISPLAY_FLOOR = 0.4;

/**
 * Commodity-association classes (§6 of the brief).
 * @enum {string}
 */
export const AssociationClass = Object.freeze({
  /** Directly supported by a source that states the association. */
  VERIFIED: 'VERIFIED',
  /** Derived from multiple public datasets. */
  INFERRED: 'INFERRED',
  /** Model-generated estimate. */
  ESTIMATED: 'ESTIMATED',
  /** Insufficient evidence. */
  UNKNOWN: 'UNKNOWN',
});

/**
 * Map a 0–1 score onto its band.
 * @param {number} score
 * @returns {string} a ConfidenceBand value
 */
export function confidenceBand(score) {
  assertScore(score);
  if (score >= CONFIDENCE_THRESHOLDS[ConfidenceBand.DOCUMENTED])
    return ConfidenceBand.DOCUMENTED;
  if (score >= CONFIDENCE_THRESHOLDS[ConfidenceBand.STRONG])
    return ConfidenceBand.STRONG;
  if (score >= CONFIDENCE_THRESHOLDS[ConfidenceBand.MODERATE])
    return ConfidenceBand.MODERATE;
  if (score >= CONFIDENCE_THRESHOLDS[ConfidenceBand.WEAK])
    return ConfidenceBand.WEAK;
  return ConfidenceBand.INSUFFICIENT;
}

/** Whether a score is high enough to display as a meaningful inference. */
export function isDisplayable(score) {
  assertScore(score);
  return score >= DISPLAY_FLOOR;
}

function assertScore(score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    throw new TypeError('A confidence score must be a finite number');
  }
  if (score < 0 || score > 1) {
    throw new RangeError(`A confidence score must be within 0..1: ${score}`);
  }
  return score;
}

/**
 * Datasets that can never legitimately be LIVE.
 *
 * UN Comtrade lags 1–2 years (measured; see docs/DATA_AVAILABILITY_MATRIX.md).
 * World Bank indicators are annual. Badging either as LIVE would be a factual
 * misstatement, so the constructor refuses it rather than trusting callers.
 */
const NEVER_LIVE = Object.freeze(
  new Set(['UN Comtrade', 'World Bank', 'IMF', 'OECD', 'NGA World Port Index']),
);

/**
 * One piece of supporting evidence behind an inference.
 *
 * @param {object} input
 * @param {string} input.kind e.g. 'trade-statistic', 'port-specialization', 'vessel-route'
 * @param {string} input.detail human-readable statement of what the evidence says
 * @param {string} input.source the dataset or publication it came from
 * @param {number} input.weight relative contribution, 0–1
 * @param {boolean} [input.supports=true] false for evidence that argues against
 * @returns {Readonly<object>}
 */
export function createEvidence({
  kind,
  detail,
  source,
  weight,
  supports = true,
}) {
  requireString(kind, 'kind');
  requireString(detail, 'detail');
  requireString(source, 'source');
  assertScore(weight);
  if (typeof supports !== 'boolean') {
    throw new TypeError('evidence.supports must be a boolean');
  }
  return Object.freeze({ kind, detail, source, weight, supports });
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} is required`);
  }
  return value;
}

/**
 * Build a provenance record.
 *
 * Every field the §24 provenance panel displays is mandatory. There are no
 * defaults for source, dataset or licence: a value whose origin we cannot state
 * is a value we must not display.
 *
 * @param {object} input
 * @param {string} input.dataClass a DataClass value
 * @param {string} input.source publisher, e.g. 'UN Comtrade'
 * @param {string} input.dataset specific dataset or endpoint
 * @param {string} input.license licence or terms governing the data
 * @param {string} input.method how the value was produced
 * @param {string|null} [input.retrievedAt] ISO-8601 timestamp of retrieval
 * @param {string|null} [input.observedAt] ISO-8601 timestamp the value refers to
 * @param {string|null} [input.updateFrequency] e.g. 'annual', '60s'
 * @param {number} [input.confidence] 0–1; defaults per data class
 * @param {string[]} [input.limitations] known caveats
 * @param {Array<object>} [input.evidence] createEvidence() records
 * @returns {Readonly<object>}
 */
export function createProvenance({
  dataClass,
  source,
  dataset,
  license,
  method,
  retrievedAt = null,
  observedAt = null,
  updateFrequency = null,
  confidence,
  limitations = [],
  evidence = [],
}) {
  if (!Object.values(DataClass).includes(dataClass)) {
    throw new TypeError(`Unknown data class: ${dataClass}`);
  }
  requireString(source, 'source');
  requireString(dataset, 'dataset');
  requireString(license, 'license');
  requireString(method, 'method');

  if (dataClass === DataClass.LIVE && NEVER_LIVE.has(source)) {
    throw new TypeError(
      `${source} data lags its reference period and cannot be classed LIVE; ` +
        'use HISTORICAL.',
    );
  }
  if (
    !Array.isArray(limitations) ||
    limitations.some((l) => typeof l !== 'string')
  ) {
    throw new TypeError('limitations must be an array of strings');
  }
  if (!Array.isArray(evidence)) {
    throw new TypeError('evidence must be an array');
  }

  const score =
    confidence === undefined
      ? defaultConfidence(dataClass)
      : assertScore(confidence);

  return Object.freeze({
    dataClass,
    badge: DATA_CLASS_BADGE[dataClass],
    source,
    dataset,
    license,
    method,
    retrievedAt,
    observedAt,
    updateFrequency,
    confidence: score,
    confidenceBand: confidenceBand(score),
    displayable: score >= DISPLAY_FLOOR,
    limitations: Object.freeze([...limitations]),
    evidence: Object.freeze([...evidence]),
  });
}

/**
 * Default confidence for a data class when a caller does not supply one.
 * An observation is not automatically certain, but it starts far above an
 * inference, and UNKNOWN starts at zero.
 */
function defaultConfidence(dataClass) {
  switch (dataClass) {
    case DataClass.LIVE:
      return 0.95;
    case DataClass.HISTORICAL:
      return 0.95;
    case DataClass.INFERRED:
      return 0.6;
    case DataClass.SIMULATED:
      return 0.5;
    default:
      return 0;
  }
}

/**
 * Combine independent evidence into one confidence score.
 *
 * Model: noisy-OR over supporting evidence, then a multiplicative penalty for
 * contradicting evidence.
 *
 *   support     = 1 - Π(1 - wᵢ)   over evidence where supports === true
 *   contradict  = Π(1 - wⱼ)       over evidence where supports === false
 *   score       = support × contradict
 *
 * Noisy-OR is chosen because independent weak signals should accumulate — two
 * separate datasets each weakly indicating the same association is stronger than
 * either alone — while no amount of weak evidence can reach certainty.
 *
 * ASSUMPTION, stated because it is load-bearing: the evidence items are treated
 * as conditionally independent. They frequently are not (port specialization and
 * trade statistics both partly reflect the same underlying economy). This makes
 * the score an OPTIMISTIC bound. That caveat belongs in the provenance panel and
 * is recorded in docs/CONFIDENCE_METHODOLOGY.md.
 *
 * @param {Array<object>} evidence createEvidence() records
 * @returns {number} 0–1
 */
export function combineConfidence(evidence) {
  if (!Array.isArray(evidence)) {
    throw new TypeError('evidence must be an array');
  }
  if (evidence.length === 0) return 0;
  let support = 1;
  let contradict = 1;
  let sawSupport = false;
  for (const item of evidence) {
    assertScore(item?.weight);
    if (item.supports === false) {
      contradict *= 1 - item.weight;
    } else {
      support *= 1 - item.weight;
      sawSupport = true;
    }
  }
  if (!sawSupport) return 0;
  const score = (1 - support) * contradict;
  // Guard against floating-point drift past the valid range.
  return Math.min(1, Math.max(0, score));
}

/**
 * Classify a commodity association from its evidence.
 *
 * The rules are deliberately conservative. In particular an association is only
 * VERIFIED when some single piece of evidence directly documents it — no
 * accumulation of indirect signals is allowed to reach VERIFIED, because that is
 * precisely how "this ship contains 40,000 tons of semiconductor material" gets
 * fabricated (§6 of the brief).
 *
 * @param {Array<object>} evidence
 * @returns {{association:string, confidence:number, band:string, displayable:boolean, evidence:Array<object>}}
 */
export function classifyAssociation(evidence) {
  const score = combineConfidence(evidence);
  const directlyDocumented = evidence.some(
    (item) => item?.supports !== false && item?.kind === 'direct-documentation',
  );
  let association;
  if (
    directlyDocumented &&
    score >= CONFIDENCE_THRESHOLDS[ConfidenceBand.DOCUMENTED]
  ) {
    association = AssociationClass.VERIFIED;
  } else if (score >= CONFIDENCE_THRESHOLDS[ConfidenceBand.MODERATE]) {
    association = AssociationClass.INFERRED;
  } else if (score >= DISPLAY_FLOOR) {
    association = AssociationClass.ESTIMATED;
  } else {
    association = AssociationClass.UNKNOWN;
  }
  return Object.freeze({
    association,
    confidence: score,
    band: confidenceBand(score),
    displayable: score >= DISPLAY_FLOOR,
    evidence: Object.freeze([...evidence]),
  });
}

/**
 * Freshness of a LIVE value against its expected update period.
 *
 * Mirrors the vocabulary already used by src/data/feedState.js so supply-chain
 * layers report freshness the same way inherited layers do.
 *
 * @param {number|null} observedAtMs
 * @param {number} expectedPeriodMs
 * @param {number} [nowMs=Date.now()]
 * @returns {{state:'nominal'|'stale'|'unavailable', ageMs:number|null}}
 */
export function freshness(observedAtMs, expectedPeriodMs, nowMs = Date.now()) {
  if (observedAtMs === null || observedAtMs === undefined) {
    return Object.freeze({ state: 'unavailable', ageMs: null });
  }
  if (typeof observedAtMs !== 'number' || !Number.isFinite(observedAtMs)) {
    throw new TypeError('observedAtMs must be a finite number or null');
  }
  if (typeof expectedPeriodMs !== 'number' || expectedPeriodMs <= 0) {
    throw new TypeError('expectedPeriodMs must be a positive number');
  }
  const ageMs = nowMs - observedAtMs;
  // Three missed update periods is the threshold for stale, matching the
  // tolerance the inherited layers already apply to polling feeds.
  return Object.freeze({
    state: ageMs > expectedPeriodMs * 3 ? 'stale' : 'nominal',
    ageMs,
  });
}

/**
 * The §31 hard requirement, as a value rather than a convention.
 *
 * When data is missing, render this instead of a number. It carries the reason
 * and states what data would resolve the gap, which is more useful academically
 * than a fabricated completeness.
 *
 * @param {string} reason
 * @param {string} whatWouldBeNeeded
 * @returns {Readonly<object>}
 */
export function dataGap(reason, whatWouldBeNeeded) {
  requireString(reason, 'reason');
  requireString(whatWouldBeNeeded, 'whatWouldBeNeeded');
  return Object.freeze({
    dataGap: true,
    dataClass: DataClass.UNKNOWN,
    badge: DATA_CLASS_BADGE[DataClass.UNKNOWN],
    label: 'DATA UNAVAILABLE',
    reason,
    whatWouldBeNeeded,
  });
}
