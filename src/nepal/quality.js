/**
 * The data-quality log.
 *
 * §19 asks for validation, and specifically for problems to be LOGGED rather
 * than silently ignored. The distinction this module enforces is between a
 * record that was *dropped* and a record that was *repaired*: both are edits
 * to the data, both change downstream counts, and a reader who is told only
 * the final total cannot tell which happened.
 *
 * So every ingest ends with a reconciliation that must balance:
 *
 *     read = kept + dropped
 *
 * `summary()` throws if it does not. A pipeline whose arithmetic does not add
 * up has lost records somewhere it is not admitting to, and that is exactly
 * the failure this project cannot afford.
 */

/** Issue codes, so a report can be grouped without parsing prose. */
export const Issue = Object.freeze({
  MISSING_COORDINATE: 'MISSING_COORDINATE',
  INVALID_COORDINATE: 'INVALID_COORDINATE',
  OUT_OF_STUDY_AREA: 'OUT_OF_STUDY_AREA',
  INVALID_GEOMETRY: 'INVALID_GEOMETRY',
  DUPLICATE_RECORD: 'DUPLICATE_RECORD',
  MISSING_VALUE: 'MISSING_VALUE',
  INVALID_TIMESTAMP: 'INVALID_TIMESTAMP',
  UNPARSEABLE_NUMBER: 'UNPARSEABLE_NUMBER',
  UNEXPECTED_CATEGORY: 'UNEXPECTED_CATEGORY',
  CRS_MISMATCH: 'CRS_MISMATCH',
  NODATA_CELL: 'NODATA_CELL',
  REPAIRED: 'REPAIRED',
});

/**
 * Create a logger for one dataset ingest.
 *
 * @param {string} datasetId
 * @param {object} [options]
 * @param {number} [options.sampleLimit] examples kept per issue code
 */
export function createQualityLog(datasetId, { sampleLimit = 5 } = {}) {
  const issues = new Map();
  let read = 0;
  let kept = 0;
  let dropped = 0;

  function record(code, detail, sample) {
    if (!Object.values(Issue).includes(code)) {
      throw new TypeError(`Unknown quality issue code "${code}".`);
    }
    let entry = issues.get(code);
    if (!entry) {
      entry = { code, count: 0, details: new Set(), samples: [] };
      issues.set(code, entry);
    }
    entry.count += 1;
    if (detail) entry.details.add(detail);
    if (sample !== undefined && entry.samples.length < sampleLimit) {
      entry.samples.push(sample);
    }
  }

  return {
    /** One source record was read. Call once per input record. */
    readRecord(n = 1) {
      read += n;
    },
    /** The record survived into the artefact. */
    keptRecord(n = 1) {
      kept += n;
    },
    /**
     * The record was removed. Logging the reason is mandatory — a drop
     * without a reason is indistinguishable from a bug.
     */
    drop(code, detail, sample) {
      if (!detail) throw new TypeError('Dropping a record requires a reason.');
      dropped += 1;
      record(code, detail, sample);
    },
    /**
     * The record was changed but kept. Counted separately from a drop
     * because it does not reduce the total, and separately from nothing
     * because the value in the artefact is no longer the value in the source.
     */
    repair(detail, sample) {
      if (!detail) throw new TypeError('A repair requires a description.');
      record(Issue.REPAIRED, detail, sample);
    },
    /** Something noteworthy that neither dropped nor changed a record. */
    note(code, detail, sample) {
      record(code, detail, sample);
    },
    /**
     * Close the log. Throws when `read` and `kept + dropped` disagree.
     */
    summary() {
      if (read !== kept + dropped) {
        throw new Error(
          `Quality log for "${datasetId}" does not reconcile: read ${read}, ` +
            `kept ${kept}, dropped ${dropped} (kept + dropped = ${kept + dropped}). ` +
            'Records went missing without being logged.',
        );
      }
      return Object.freeze({
        datasetId,
        read,
        kept,
        dropped,
        retention: read === 0 ? 1 : Number((kept / read).toFixed(6)),
        issues: Object.freeze(
          [...issues.values()]
            .map((entry) =>
              Object.freeze({
                code: entry.code,
                count: entry.count,
                details: Object.freeze([...entry.details]),
                samples: Object.freeze([...entry.samples]),
              }),
            )
            .sort((a, b) => b.count - a.count),
        ),
      });
    },
  };
}

/** Render a summary as the lines a report file carries. */
export function formatQualitySummary(summary) {
  const lines = [
    `${summary.datasetId}: read ${summary.read}, kept ${summary.kept}, dropped ${summary.dropped} (retention ${(summary.retention * 100).toFixed(2)}%)`,
  ];
  for (const issue of summary.issues) {
    lines.push(`  ${issue.code} x${issue.count}`);
    for (const detail of issue.details) lines.push(`    - ${detail}`);
  }
  return lines.join('\n');
}
