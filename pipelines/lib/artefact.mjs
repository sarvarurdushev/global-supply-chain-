/**
 * The processed-artefact envelope.
 *
 * Every artefact this pipeline writes carries its own provenance in its own
 * file. That is deliberate: a GeoJSON that travels without its source is a
 * number nobody can defend, and a registry kept only in a sibling directory
 * gets separated from the data the first time somebody copies a file.
 *
 * The shape is fixed so the frontend can render the lineage of any figure
 * without knowing which dataset it came from.
 */

import { commitPolicy } from '../../src/nepal/registry.js';

/**
 * @param {object} input
 * @param {object} input.record  a validated dataset record
 * @param {object} input.lineage from `createLineage`
 * @param {object} input.quality from `qualityLog.summary()`
 * @param {string} input.dataClass one of `DataClass`
 * @param {object} input.data the payload itself
 * @param {string[]} [input.limitations] artefact-specific caveats
 * @param {object} [input.validation] checks run against the artefact
 */
export function buildArtefact({
  record,
  lineage,
  quality,
  dataClass,
  data,
  limitations = [],
  validation = null,
}) {
  const policy = commitPolicy(record);
  if (!policy.mayCommit) {
    throw new Error(
      `Refusing to build an artefact from "${record.id}": ${policy.reason}`,
    );
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    dataClass,
    source: {
      datasetId: record.id,
      datasetName: record.datasetName,
      publisher: record.publisher,
      sourceUrl: record.sourceUrl,
      license: record.license,
      redistribution: record.redistribution,
      retrievedAt: record.retrievedAt,
      attribution: record.attribution ?? null,
      /* Carried into the file so the obligation cannot be separated from it. */
      redistributionNotice: policy.notice,
    },
    lineage: lineage.steps,
    quality,
    validation,
    limitations: [...record.limitations, ...limitations],
    data,
  };
}
