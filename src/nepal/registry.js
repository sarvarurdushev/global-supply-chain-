/**
 * The dataset registry: one record per external dataset, and the only place
 * the project is allowed to describe where a number came from.
 *
 * §18 of the brief calls provenance non-negotiable. The enforcement here is
 * structural rather than advisory: `createDatasetRecord` REFUSES a record that
 * is missing any field a presentation would need, so a dataset cannot be half
 * documented. A processed artefact that cannot name its source cannot be
 * written, because the pipeline builds its header from this record.
 *
 * Portable by design — no filesystem, no network. The pipeline scripts under
 * `pipelines/` do the I/O and hand the bytes in.
 */

/**
 * How firm a value is. This is the §28 vocabulary, and the five members are
 * deliberately NOT interchangeable: an instrument reading, a government's
 * published figure, our own calculation, our own calculation with assumptions,
 * and a hypothetical are five different claims about the world.
 */
export const DataClass = Object.freeze({
  /** An instrument or sensor recorded it. USGS magnitude. */
  OBSERVED: 'OBSERVED',
  /** An authoritative body published it. The PDNA loss total. */
  OFFICIAL: 'OFFICIAL',
  /** We computed it from source data, no free parameters. */
  DERIVED: 'DERIVED',
  /** We computed it, and a stated assumption changes the answer. */
  ESTIMATE: 'ESTIMATE',
  /** A hypothetical we constructed to explore response. Never a fact. */
  SCENARIO: 'SCENARIO',
});

/** Licence families that decide whether an artefact may be committed. */
export const Redistribution = Object.freeze({
  /** Public domain or an open licence with attribution only. */
  OPEN: 'OPEN',
  /** Open, but derived works inherit the licence. */
  SHARE_ALIKE: 'SHARE_ALIKE',
  /** Open for non-commercial use only. Commercial use needs permission. */
  NON_COMMERCIAL: 'NON_COMMERCIAL',
  /** May not be redistributed. Ingest locally, commit nothing. */
  NONE: 'NONE',
});

const REQUIRED = Object.freeze([
  'id',
  'datasetName',
  'publisher',
  'sourceUrl',
  'license',
  'redistribution',
  'retrievedAt',
  'originalFormat',
  'temporalCoverage',
  'geographicCoverage',
  'coordinateSystem',
  'description',
  'dataClass',
]);

/** ISO date, or an ISO instant. Rejects "2015" and "April 2015". */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/;

/**
 * Build one dataset record, or throw.
 *
 * @param {object} input
 * @param {string} input.id stable slug, used as the artefact filename stem
 * @param {string} input.datasetName the publisher's own name for it
 * @param {string} input.publisher who produced it
 * @param {string} input.sourceUrl where it was retrieved from, exactly
 * @param {string} input.license the licence as the publisher states it
 * @param {string} input.redistribution one of `Redistribution`
 * @param {string} input.retrievedAt ISO date of retrieval
 * @param {string} input.originalFormat the format as downloaded
 * @param {string} input.temporalCoverage what period the data describes
 * @param {string} input.geographicCoverage what area it covers
 * @param {string} input.coordinateSystem EPSG code or "n/a"
 * @param {string} input.description one paragraph a reader can use
 * @param {string} input.dataClass one of `DataClass`
 * @param {string[]} [input.fields] the fields we actually read
 * @param {string[]} [input.limitations] what it cannot support
 * @param {string} [input.attribution] the credit line, where one is required
 * @param {string} [input.discoveredVia] how we found it, if indirect
 * @param {string} [input.retrievalNote] anything a re-runner needs to know
 * @returns {Readonly<object>}
 */
export function createDatasetRecord(input) {
  const missing = REQUIRED.filter((key) => {
    const value = input?.[key];
    return value === undefined || value === null || String(value).trim() === '';
  });
  if (missing.length > 0) {
    throw new TypeError(
      `Dataset record is missing required provenance: ${missing.join(', ')}. ` +
        'A dataset that cannot say where it came from cannot be used.',
    );
  }
  if (!Object.values(DataClass).includes(input.dataClass)) {
    throw new TypeError(
      `Unknown dataClass "${input.dataClass}". Use one of ${Object.values(DataClass).join(', ')}.`,
    );
  }
  if (!Object.values(Redistribution).includes(input.redistribution)) {
    throw new TypeError(
      `Unknown redistribution "${input.redistribution}". Use one of ${Object.values(Redistribution).join(', ')}.`,
    );
  }
  if (!ISO_DATE.test(String(input.retrievedAt))) {
    throw new TypeError(
      `retrievedAt must be an ISO date (got "${input.retrievedAt}"). ` +
        '"2015" is not a retrieval date.',
    );
  }
  /*
   * A licence that permits nothing but says so is fine. A licence field
   * reading "Other" is not: that is what HDX returns when the real terms are
   * in a different field, and accepting it would have let this project
   * redistribute UNOSAT's CC BY-NC-SA data believing it was unencumbered.
   */
  if (/^(other|unknown|tbd|n\/a)$/i.test(String(input.license).trim())) {
    throw new TypeError(
      `license "${input.license}" is a placeholder, not a licence. ` +
        'Read the publisher’s actual terms before registering the dataset.',
    );
  }
  if (
    input.redistribution !== Redistribution.OPEN &&
    !String(input.attribution ?? '').trim()
  ) {
    throw new TypeError(
      'A share-alike, non-commercial or closed dataset must carry an attribution line.',
    );
  }
  return Object.freeze({
    ...input,
    fields: Object.freeze([...(input.fields ?? [])]),
    limitations: Object.freeze([...(input.limitations ?? [])]),
    schemaVersion: 1,
  });
}

/**
 * Whether a processed artefact derived from this dataset may be committed.
 *
 * `NONE` is the only bar. Share-alike and non-commercial are permitted but
 * they travel: the returned `notice` is written into the artefact header so
 * the obligation is visible to whoever picks the file up next, rather than
 * living only in a licence matrix nobody opens.
 */
export function commitPolicy(record) {
  if (record.redistribution === Redistribution.NONE) {
    return Object.freeze({
      mayCommit: false,
      reason: `${record.publisher} does not permit redistribution. Ingest locally; commit the script, not the data.`,
      notice: null,
    });
  }
  const encumbered =
    record.redistribution === Redistribution.SHARE_ALIKE ||
    record.redistribution === Redistribution.NON_COMMERCIAL;
  return Object.freeze({
    mayCommit: true,
    reason: encumbered
      ? `Permitted under ${record.license}, and the obligation travels with the derived file.`
      : `Permitted under ${record.license}.`,
    notice: encumbered
      ? `${record.license} — ${record.attribution}. This obligation applies to this derived file.`
      : (record.attribution ?? null),
  });
}

/**
 * The processing lineage of one artefact: the chain the brief asks us to be
 * able to draw for any number in the interface.
 *
 * Each step is `{ step, detail }`, ordered. Rendering it is the UI's job; the
 * pipeline's job is to record every transformation that touched the data,
 * including the ones that dropped records.
 */
export function createLineage(datasetId, steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new TypeError('A lineage needs at least one step.');
  }
  for (const item of steps) {
    if (!item?.step || !item?.detail) {
      throw new TypeError('Each lineage step needs a `step` and a `detail`.');
    }
  }
  return Object.freeze({
    datasetId,
    steps: Object.freeze(steps.map((item) => Object.freeze({ ...item }))),
  });
}
