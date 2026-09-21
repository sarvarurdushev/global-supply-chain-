/**
 * The impact vocabulary, and the rounding rules that go with it.
 *
 * Two failures this module exists to prevent, both of which are easy to commit
 * and hard to notice afterwards.
 *
 * THE FIRST is collapsing five different variables into the word "affected".
 * Exposure, damage, casualties, humanitarian need and displacement are
 * measured differently, by different people, and they do not imply one
 * another: a person can be exposed to severe shaking in a building that holds,
 * and a person can be displaced from a house that stood. "13.8 million people
 * were affected" is not a shorter way of saying our result — it is a different
 * and unsupported claim. `describe()` below will not produce it.
 *
 * THE SECOND is precision the data cannot carry. A modelled population surface
 * intersected with a modelled shaking field, on ~819 m cells, cannot support
 * "13,835,518 people". The exact integer stays in the artefact for
 * reconciliation; what reaches a reader is "13.8 million", and `round()`
 * decides that from the magnitude rather than leaving it to each call site.
 */

/**
 * The five impact variables, kept apart on purpose.
 *
 * Each carries what it measures, what it does NOT imply, and who would have
 * to publish it. The last field matters: four of the five cannot be derived
 * from anything this project holds, and saying so is the point.
 */
export const ImpactVariable = Object.freeze({
  EXPOSURE: {
    id: 'EXPOSURE',
    label: 'Geographic exposure',
    measures:
      'People whose location lies inside a modelled hazard footprint at a stated intensity.',
    doesNotImply:
      'Injury, death, building damage, displacement or need. It is a statement about where people and shaking overlap.',
    verb: 'were geographically exposed to',
    source: 'Derived here from a population surface and a hazard model.',
    availableToUs: true,
  },
  DAMAGE: {
    id: 'DAMAGE',
    label: 'Physical damage',
    measures:
      'Structures or infrastructure observed to be damaged or destroyed.',
    doesNotImply:
      'That anyone inside was harmed, or that an undamaged building was safe to occupy.',
    verb: 'were observed damaged',
    source:
      'Satellite interpretation (UNOSAT, Copernicus EMSR125) or field assessment. Never inferred from exposure.',
    availableToUs: true,
  },
  CASUALTIES: {
    id: 'CASUALTIES',
    label: 'Human casualties',
    measures: 'People killed or injured.',
    doesNotImply: 'Anything about the distribution of damage or need.',
    verb: 'were killed or injured',
    source:
      'Government and agency counts, published as national or district totals. Not derivable from exposure or damage.',
    availableToUs: false,
  },
  HUMANITARIAN_NEED: {
    id: 'HUMANITARIAN_NEED',
    label: 'Humanitarian need',
    measures: 'People assessed as requiring assistance.',
    doesNotImply:
      'That they were exposed to the strongest shaking, or that their home fell.',
    verb: 'were assessed as needing assistance',
    source:
      'Cluster assessments and needs surveys. An assessment, not a measurement.',
    availableToUs: false,
  },
  DISPLACEMENT: {
    id: 'DISPLACEMENT',
    label: 'Displacement',
    measures: 'People who left their homes and where they went.',
    doesNotImply:
      'That their house was destroyed; people leave undamaged homes for fear of aftershocks.',
    verb: 'were displaced',
    source:
      'IOM Displacement Tracking Matrix and shelter cluster site reports.',
    availableToUs: false,
  },
});

/** Words that must never be used for an exposure result, and what to say instead. */
export const FORBIDDEN_PHRASING = Object.freeze([
  {
    phrase: 'affected',
    instead: 'geographically exposed to modelled shaking of MMI X or greater',
  },
  { phrase: 'impacted', instead: 'geographically exposed' },
  { phrase: 'victims', instead: 'people exposed (exposure is not casualty)' },
  { phrase: 'hit by', instead: 'inside the modelled MMI X contour' },
  { phrase: 'suffered', instead: 'exposed to' },
]);

/**
 * How firm a number is — the §28 vocabulary, extended with the distinction the
 * seismic stage needs.
 *
 * `MODEL_FIT` is the one that was missing. A b-value is not an observation:
 * it is a parameter of a statistical model fitted to observations, and it
 * changes when the fitting window changes. Presenting it beside a magnitude,
 * which an instrument recorded, flattens that difference.
 */
export const ResultClass = Object.freeze({
  OBSERVED: {
    id: 'OBSERVED',
    label: 'Observed',
    means:
      'Recorded by an instrument or read from an agency catalogue. Not computed here.',
  },
  DESCRIPTIVE_STATISTIC: {
    id: 'DESCRIPTIVE_STATISTIC',
    label: 'Descriptive statistic',
    means:
      'A count, median or distribution computed directly from observations. It adds no assumptions; re-running it on the same catalogue gives the same answer.',
  },
  MODEL_FIT: {
    id: 'MODEL_FIT',
    label: 'Fitted model parameter',
    means:
      'A parameter of a statistical model fitted to observations. It depends on the model chosen, the window fitted and the data excluded, and it is NOT a measurement of the earth.',
  },
  DERIVED: {
    id: 'DERIVED',
    label: 'Derived',
    means: 'Computed here by combining datasets, with no free parameters.',
  },
  ESTIMATE: {
    id: 'ESTIMATE',
    label: 'Estimate',
    means: 'Computed here, and a stated assumption changes the answer.',
  },
  OFFICIAL: {
    id: 'OFFICIAL',
    label: 'Official',
    means: 'Published by an authoritative body. Reported as published.',
  },
  SCENARIO: {
    id: 'SCENARIO',
    label: 'Scenario',
    means:
      'A hypothetical constructed to explore response. Never a claim about what happened.',
  },
});

/**
 * Round a population to the precision its source can carry.
 *
 * The rule is magnitude-based rather than a fixed decimal count, because
 * "13,835,518" and "235,116" need different treatment: three significant
 * figures on a modelled population is already generous, and the fourth digit
 * of a WorldPop-derived figure is model noise.
 */
export function roundPopulation(value) {
  if (!Number.isFinite(value)) return null;
  const magnitude = Math.abs(value);
  if (magnitude >= 1e6)
    return {
      value: Number((value / 1e6).toFixed(2)),
      unit: 'million',
      text: `${(value / 1e6).toFixed(2)} million`,
    };
  if (magnitude >= 1e4)
    return {
      value: Math.round(value / 1000) * 1000,
      unit: 'people',
      text: `${(Math.round(value / 1000) * 1000).toLocaleString('en-US')}`,
    };
  if (magnitude >= 1e3)
    return {
      value: Math.round(value / 100) * 100,
      unit: 'people',
      text: `${(Math.round(value / 100) * 100).toLocaleString('en-US')}`,
    };
  return {
    value: Math.round(value),
    unit: 'people',
    text: `${Math.round(value)}`,
  };
}

/** Round a percentage to one decimal; more is noise on a modelled quantity. */
export function roundPercent(value) {
  return Number.isFinite(value) ? Number(value.toFixed(1)) : null;
}

/**
 * Build the sentence for an exposure result.
 *
 * The only sanctioned way to phrase one. It always names the variable, the
 * hazard threshold and the fact that both the population and the shaking are
 * modelled, because a sentence that omits any of those is the sentence that
 * gets quoted back as "13.8 million affected".
 */
export function describeExposure({ people, threshold, roman, exact = false }) {
  const rounded = roundPopulation(people);
  const figure = exact ? people.toLocaleString('en-US') : rounded.text;
  return (
    `${figure} people were geographically exposed to modelled shaking of ` +
    `MMI ${roman ?? threshold} or greater`
  );
}

/**
 * Check a string for language that overstates an exposure result.
 *
 * Used by the tests against the strings this project actually ships, so the
 * rule is enforced rather than merely written down.
 */
export function findForbiddenPhrasing(text) {
  const haystack = String(text ?? '').toLowerCase();
  return FORBIDDEN_PHRASING.filter((rule) =>
    new RegExp(`\\b${rule.phrase}\\b`).test(haystack),
  );
}
