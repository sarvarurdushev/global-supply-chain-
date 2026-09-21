#!/usr/bin/env node
/**
 * The road of ANY class beneath each observed blockage, as at 2015-04-24.
 *
 *   SOURCE   Overpass attic query at 2015-04-24T00:00:00Z (ODbL)
 *   RAW      one JSON response, a union of small boxes around each blockage
 *   READER   src/nepal/io/overpass.js
 *   VALIDATE highway tag present, >=2 resolved positions, ids deduplicated
 *   PROCESS  every highway class kept, including track and residential
 *   ARTEFACT data/processed/nepal-2015-osm-blockage-context.json
 *   ANALYSIS diagnostic for §5.8: WHY a blockage matches no routable edge
 *
 * WHY THIS EXISTS. Matching the 184 observed blockages against the strategic
 * road network attaches only a fifth of them. That number on its own is
 * ambiguous between two very different explanations: the blockages were on
 * roads BELOW tertiary class, which this project deliberately excludes from
 * routing, or they were on roads OpenStreetMap had not mapped at all in April
 * 2015. Those say opposite things about the analysis, so the difference is
 * measured rather than guessed.
 *
 * The query is a union of small boxes around each blockage rather than a
 * regional download, because every residential street and track in Kathmandu
 * is not wanted here — only what lies beneath the markers.
 */

import { DataClass, Redistribution, createDatasetRecord, createLineage } from '../../src/nepal/registry.js';
import { Issue, createQualityLog, formatQualitySummary } from '../../src/nepal/quality.js';
import { overpassBaseTimestamp, parseOverpassWays } from '../../src/nepal/io/overpass.js';
import { buildArtefact } from '../lib/artefact.mjs';
import { PROCESSED, fetchRaw, formatBytes, writeProcessed, writeRegistry, writeReport } from '../lib/io.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ENDPOINT = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';
const BASELINE_INSTANT = '2015-04-24T00:00:00Z';
const RETRIEVED_AT = '2026-09-21';

/**
 * Half-width of the box around each blockage, in degrees.
 *
 * About 600 m at this latitude: wide enough that a marker offset from the
 * road it describes still catches it, narrow enough that the query returns
 * the road beneath the blockage rather than the settlement around it.
 */
const BOX_DEGREES = 0.006;

/** Midpoint of a line, or the point itself. */
function anchorOf(geometry) {
  if (geometry.type === 'Point') return geometry.coordinates;
  const coordinates = geometry.coordinates;
  return coordinates[Math.floor(coordinates.length / 2)];
}

export async function ingestBlockageContext({ force = false } = {}) {
  const nga = JSON.parse(
    await readFile(path.join(PROCESSED, 'nepal-2015-nga-infrastructure-damage.json'), 'utf8'),
  );
  const anchors = [
    ...nga.data.blockedRoads.features.map((feature) => anchorOf(feature.geometry)),
    ...nga.data.bridgesOut.features.map((feature) => anchorOf(feature.geometry)),
  ];
  const boxes = anchors.map(([lon, lat]) => [
    (lat - BOX_DEGREES).toFixed(4),
    (lon - BOX_DEGREES).toFixed(4),
    (lat + BOX_DEGREES).toFixed(4),
    (lon + BOX_DEGREES).toFixed(4),
  ]);
  const query =
    `[out:json][timeout:600][date:"${BASELINE_INSTANT}"];(` +
    boxes.map((box) => `way["highway"](${box.join(',')});`).join('') +
    ');out geom;';
  const url = `${ENDPOINT}?data=${encodeURIComponent(query)}`;

  const record = createDatasetRecord({
    id: 'osm-nepal-2015-blockage-context',
    datasetName: 'OpenStreetMap roads of every class beneath the observed blockages, as at 2015-04-24',
    publisher: 'OpenStreetMap contributors, served by the Overpass API',
    sourceUrl: 'https://www.openstreetmap.org/',
    license: 'Open Database License (ODbL) 1.0',
    redistribution: Redistribution.SHARE_ALIKE,
    retrievedAt: RETRIEVED_AT,
    originalFormat: 'Overpass API JSON (way geometry)',
    temporalCoverage: 'Database state at 2015-04-24T00:00:00Z',
    geographicCoverage: `${boxes.length} boxes of +/-${BOX_DEGREES} degrees around each observed blockage`,
    coordinateSystem: 'EPSG:4326',
    description:
      'Every tagged highway, including track, path, residential and unclassified, within about 600 m of each NGA blocked-road or bridge-out feature, as OpenStreetMap held it the day before the earthquake. Used only to diagnose why a blockage attaches to no routable edge.',
    dataClass: DataClass.OBSERVED,
    attribution: '© OpenStreetMap contributors, ODbL',
    fields: ['osmId', 'coordinates', 'highway', 'name', 'ref', 'surface', 'bridge', 'tunnel'],
    limitations: [
      'This is a DIAGNOSTIC layer, not a routable network. It covers only the immediate surroundings of the observed blockages and has no connectivity beyond them.',
      'A blockage with no road of any class beneath it means OpenStreetMap had mapped no road there in April 2015. It does not mean no road existed.',
      'Box half-width is a chosen 600 m; a marker offset further than that from its road will be reported as having no road beneath it.',
    ],
  });

  const raw = await fetchRaw('osm-blockage-context-2015.json', url, { force });
  const text = new TextDecoder().decode(raw.bytes);
  if (!text.trimStart().startsWith('{')) {
    throw new Error(`Overpass returned a non-JSON body: ${text.slice(0, 160).replace(/\s+/g, ' ')}`);
  }
  const payload = JSON.parse(text);
  const log = createQualityLog(record.id);
  const parsed = parseOverpassWays(payload, {
    onIssue: (issue) => {
      log.readRecord();
      log.drop(
        issue.reason.startsWith('duplicate') ? Issue.DUPLICATE_RECORD : Issue.INVALID_GEOMETRY,
        `way ${issue.id}: ${issue.reason}`,
        issue.id,
      );
    },
  });
  for (let i = 0; i < parsed.kept; i += 1) {
    log.readRecord();
    log.keptRecord();
  }
  const quality = log.summary();

  const byClass = {};
  for (const segment of parsed.segments) {
    byClass[segment.tags.highway] = (byClass[segment.tags.highway] ?? 0) + 1;
  }

  const artefact = buildArtefact({
    record,
    quality,
    dataClass: DataClass.OBSERVED,
    validation: {
      instant: BASELINE_INSTANT,
      overpassBaseTimestamp: overpassBaseTimestamp(payload),
      boxes: boxes.length,
      boxHalfWidthDegrees: BOX_DEGREES,
      ways: parsed.segments.length,
      byHighwayClass: byClass,
      strategicClassesPresent: Object.keys(byClass).filter((name) =>
        ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'].some((klass) => name.startsWith(klass)),
      ),
      note:
        'Every highway class is kept here, unlike the routable network. The class breakdown is the point: it says what kind of road the observed blockages actually sat on.',
    },
    lineage: createLineage(record.id, [
      { step: 'SOURCE', detail: `Overpass attic query at ${BASELINE_INSTANT}, union of ${boxes.length} boxes` },
      { step: 'RAW', detail: `${formatBytes(raw.bytes.length)}, sha256 ${raw.sha256.slice(0, 16)}` },
      { step: 'READER', detail: 'src/nepal/io/overpass.js' },
      { step: 'VALIDATE', detail: 'highway tag present; at least two resolved positions; way ids deduplicated' },
      { step: 'PROCESS', detail: 'no class filter applied; coordinates rounded to 6 decimals' },
      { step: 'ARTEFACT', detail: 'data/processed/nepal-2015-osm-blockage-context.json' },
    ]),
    data: { instant: BASELINE_INSTANT, boxHalfWidthDegrees: BOX_DEGREES, segments: parsed.segments },
  });

  const written = await writeProcessed('nepal-2015-osm-blockage-context.json', artefact);
  await writeRegistry(record);
  await writeReport(`${record.id}.quality.txt`, formatQualitySummary(quality));
  return { record, quality, validation: artefact.validation, written };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await ingestBlockageContext({ force: process.argv.includes('--force') });
  console.log(formatQualitySummary(result.quality));
  console.log(`${result.validation.ways} ways, ${formatBytes(result.written.bytes)}`);
  console.log(`classes: ${JSON.stringify(result.validation.byHighwayClass)}`);
}
