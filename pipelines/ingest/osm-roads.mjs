/**
 * OpenStreetMap road network, as it stood the day before the earthquake.
 *
 *   SOURCE   Overpass API attic query at 2015-04-24T00:00:00Z (ODbL)
 *   RAW      one JSON response per tile, cached in data/raw
 *   READER   src/nepal/io/overpass.js
 *   VALIDATE highway tag present, >=2 resolved positions, no duplicate way ids
 *   PROCESS  deduplicated across tiles; ten tags kept; 6-decimal coordinates
 *   ARTEFACT data/processed/nepal-2015-osm-roads.json
 *   ANALYSIS the baseline network the observed blockages are applied to
 *
 * WHY A HISTORIC SNAPSHOT AND NOT TODAY'S MAP. OpenStreetMap's Nepal coverage
 * was transformed by the response to this earthquake — the HOT activation was
 * one of the largest in the project's history. Today's network therefore
 * contains roads mapped because of the event and roads built since it.
 * Applying 2015 blockages to it would describe the disruption of a road system
 * that did not exist. The attic query returns the database as at a stated
 * instant, so the baseline is the network as mapped on 24 April 2015.
 *
 * The same query is run against the current database purely to COUNT ways, and
 * the difference is reported as a measure of how incomplete the 2015 map was.
 * That number is a limitation of this analysis, so it is measured rather than
 * asserted.
 */

import { DataClass, Redistribution, createDatasetRecord, createLineage } from '../../src/nepal/registry.js';
import { Issue, createQualityLog, formatQualitySummary } from '../../src/nepal/quality.js';
import {
  STRATEGIC_HIGHWAY_CLASSES,
  overpassBaseTimestamp,
  parseOverpassCount,
  parseOverpassWays,
  resolveNetworkComparison,
} from '../../src/nepal/io/overpass.js';
import { buildArtefact } from '../lib/artefact.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  PROCESSED,
  fetchRaw,
  formatBytes,
  writeProcessed,
  writeRegistry,
  writeReport,
} from '../lib/io.mjs';

/**
 * The Overpass instance. Chosen because it is the one reachable from this
 * environment AND carries attic data; the query is identical on any mirror.
 */
const ENDPOINT = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';

/** Midnight UTC before the 06:11 UTC earthquake on 25 April 2015. */
export const BASELINE_INSTANT = '2015-04-24T00:00:00Z';

/**
 * The study envelope: the bounding box of every observed damage feature,
 * rounded outwards and padded by roughly 20 km.
 *
 * Padding matters for routing rather than for display. An edge whose far
 * endpoint falls outside the box is clipped, and a clipped edge looks like a
 * dead end to a shortest-path search. Twenty kilometres is wider than the
 * longest single OSM way in this network, so no route is severed by the box.
 */
export const STUDY_BBOX = Object.freeze([84.2, 27.1, 86.8, 28.7]);

/** Tiles small enough that one attic query finishes inside the timeout. */
const TILE_DEGREES = 0.4;
const RETRIEVED_AT = '2026-09-21';
const HIGHWAY_FILTER = `^(${STRATEGIC_HIGHWAY_CLASSES.join('|')})$`;

function tiles(bbox = STUDY_BBOX, step = TILE_DEGREES) {
  const [west, south, east, north] = bbox;
  const list = [];
  for (let lat = south; lat < north - 1e-9; lat += step) {
    for (let lon = west; lon < east - 1e-9; lon += step) {
      list.push([
        Number(lat.toFixed(4)),
        Number(lon.toFixed(4)),
        Number(Math.min(lat + step, north).toFixed(4)),
        Number(Math.min(lon + step, east).toFixed(4)),
      ]);
    }
  }
  return list;
}

function queryUrl({ south, west, north, east, instant, form }) {
  const date = instant ? `[date:"${instant}"]` : '';
  const query =
    `[out:json][timeout:600]${date};` +
    `way["highway"~"${HIGHWAY_FILTER}"](${south},${west},${north},${east});` +
    `out ${form};`;
  return `${ENDPOINT}?data=${encodeURIComponent(query)}`;
}

/**
 * Overpass rejects a second query while one is still running, and a public
 * mirror answers that with a 504 rather than a queue. Retrying with a growing
 * pause is the documented way to use it politely; failing loudly after five
 * attempts is better than silently ingesting a partial network.
 */
async function fetchTile(name, url, { force, attempts = 5 }) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const raw = await fetchRaw(name, url, { force: force && attempt === 1 });
      const text = new TextDecoder().decode(raw.bytes);
      if (!text.trimStart().startsWith('{')) {
        throw new Error(`Overpass returned a non-JSON body: ${text.slice(0, 120).replace(/\s+/g, ' ')}`);
      }
      return { raw, payload: JSON.parse(text) };
    } catch (error) {
      lastError = error;
      /* A cached body that failed to parse is poison; the next attempt refetches. */
      force = true;
      if (attempt < attempts) {
        /* Capped, or the sixth attempt would wait nearly three minutes. */
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(60_000, 5000 * 2 ** (attempt - 1))),
        );
      }
    }
  }
  throw new Error(`Overpass tile ${name} failed after ${attempts} attempts: ${lastError?.message}`);
}

export async function ingestOsmRoads({ force = false, bbox = STUDY_BBOX } = {}) {
  const record = createDatasetRecord({
    id: 'osm-nepal-2015-roads',
    datasetName: 'OpenStreetMap strategic road network, Nepal study area, as at 2015-04-24',
    publisher: 'OpenStreetMap contributors, served by the Overpass API',
    sourceUrl: 'https://www.openstreetmap.org/',
    license: 'Open Database License (ODbL) 1.0',
    redistribution: Redistribution.SHARE_ALIKE,
    retrievedAt: RETRIEVED_AT,
    originalFormat: 'Overpass API JSON (way geometry)',
    temporalCoverage: 'Database state at 2015-04-24T00:00:00Z, the day before the earthquake',
    geographicCoverage: `Study envelope ${bbox.join(', ')} (EPSG:4326)`,
    coordinateSystem: 'EPSG:4326',
    description:
      'Motorway, trunk, primary, secondary and tertiary roads and their link roads, as mapped in OpenStreetMap immediately before the 25 April 2015 Gorkha earthquake. Retrieved with an Overpass attic query so that the network predates the post-earthquake mapping activation.',
    dataClass: DataClass.OBSERVED,
    attribution: '© OpenStreetMap contributors, ODbL',
    fields: ['osmId', 'coordinates', 'highway', 'name', 'ref', 'bridge', 'tunnel', 'surface', 'oneway', 'maxspeed', 'layer'],
    limitations: [
      'OpenStreetMap coverage of rural Nepal in April 2015 was INCOMPLETE. A road absent from this network may have existed and been unmapped, so a route this analysis cannot find is not necessarily a route that did not exist.',
      'Only motorway to tertiary classes and their links are included. Movement over tracks, paths and residential streets is invisible to this network by construction, which matters most in exactly the mountain districts where the damage was worst.',
      'OpenStreetMap records no road condition or seasonal passability. A mapped road is a road somebody drew, not a road that was open.',
      'Attic geometry reflects the node positions as they were at the stated instant; positions corrected in OpenStreetMap since 2015 are not applied here, which is correct for the baseline and means coordinates may be less accurate than today’s map.',
    ],
  });

  const log = createQualityLog(record.id);
  const seen = new Set();
  const segments = [];
  const tileList = tiles(bbox);
  const tileReports = [];
  let baseTimestamp = null;
  let rawBytes = 0;

  for (const [south, west, north, east] of tileList) {
    const name = `osm-roads-2015-${south}-${west}.json`;
    const { raw, payload } = await fetchTile(
      name,
      queryUrl({ south, west, north, east, instant: BASELINE_INSTANT, form: 'geom' }),
      { force },
    );
    rawBytes += raw.bytes.length;
    baseTimestamp ??= overpassBaseTimestamp(payload);
    const parsed = parseOverpassWays(payload, {
      seen,
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
    segments.push(...parsed.segments);
    tileReports.push({ bbox: [west, south, east, north], read: parsed.read, kept: parsed.kept, dropped: parsed.dropped });
  }

  /*
   * The coverage measurement. Counting today's ways over the same tiles costs
   * one cheap query each and turns "OSM was incomplete in 2015" from a hedge
   * into a number.
   */
  let currentWays = 0;
  let currentMeasured = true;
  try {
    for (const [south, west, north, east] of tileList) {
      const name = `osm-roads-current-count-${south}-${west}.json`;
      const { payload } = await fetchTile(
        name,
        queryUrl({ south, west, north, east, form: 'count' }),
        { force, attempts: 6 },
      );
      currentWays += parseOverpassCount(payload)?.ways ?? 0;
    }
  } catch {
    /* The baseline is the artefact; the comparison is commentary on it. */
    currentMeasured = false;
  }

  /*
   * A FAILED COMPARISON MUST NOT ERASE A SUCCESSFUL ONE.
   *
   * The comparison needs 28 extra queries to a public mirror that answers a
   * second concurrent query with a 504, and it fails on roughly half of runs.
   * The baseline network reproduces exactly every time; this figure does not.
   *
   * Overwriting a real measurement with null on a flaky run would mean the
   * artefact silently lost evidence, and a reader could not tell "never
   * measured" from "the mirror was busy that day". So a previous measurement
   * is carried forward WITH THE DATE IT WAS TAKEN, and this run records that
   * it could not re-measure. The figure is dated evidence, not a live reading.
   */
  let previousComparison = null;
  let legacyWays = 0;
  let legacyDate = null;
  try {
    const previous = JSON.parse(
      await readFile(path.join(PROCESSED, 'nepal-2015-osm-roads.json'), 'utf8'),
    );
    previousComparison = previous?.validation?.currentNetworkComparison ?? null;
    /* Artefacts written before the dated field existed. */
    legacyWays = previous?.validation?.currentWaysSameTiles ?? 0;
    legacyDate = previous?.generatedAt ?? null;
  } catch {
    /* Nothing held: this is a first run. */
  }
  const comparison = resolveNetworkComparison({
    measured: currentMeasured,
    ways: currentWays,
    today: new Date().toISOString().slice(0, 10),
    previous: previousComparison,
    legacyWays,
    legacyDate,
  });

  segments.sort((a, b) => a.osmId - b.osmId);
  const quality = log.summary();
  const byClass = {};
  let positions = 0;
  for (const segment of segments) {
    byClass[segment.tags.highway] = (byClass[segment.tags.highway] ?? 0) + 1;
    positions += segment.coordinates.length;
  }

  const validation = {
    instant: BASELINE_INSTANT,
    overpassBaseTimestamp: baseTimestamp,
    tiles: tileList.length,
    tileReports,
    ways: segments.length,
    positions,
    byHighwayClass: byClass,
    duplicateWaysAcrossTiles: quality.dropped,
    /*
     * Tiles overlap on their shared edges by construction — Overpass returns a
     * way if ANY of its nodes falls in the box — so a non-zero duplicate count
     * is the expected result and a ZERO would mean the deduplication never
     * ran.
     */
    duplicateCountIsExpected: true,
    /*
     * Kept as a dated sub-object rather than a bare number, because unlike
     * everything else in this validation block it is not a property of the
     * 2015 snapshot: today's OpenStreetMap grows, so this figure is true of
     * the date it was taken and of no other.
     */
    currentNetworkComparison: comparison,
    currentWaysSameTiles: comparison?.ways ?? null,
    mappingGrowthSince2015:
      comparison && segments.length > 0
        ? Number((comparison.ways / segments.length).toFixed(2))
        : null,
    mappingGrowthNote: comparison
      ? `OpenStreetMap held ${comparison.ways} ways of these classes over the same tiles when this was measured on ${comparison.measuredAt}, against ${segments.length} on 2015-04-24. ` +
        'The ratio is a direct measure of how much of the network was unmapped at the time, and it bounds what any connectivity result here can claim. ' +
        (comparison.carriedForward
          ? 'This run could NOT re-measure it \u2014 the comparison needs 28 extra queries to a mirror that refuses concurrent ones \u2014 so the figure is carried forward from the run that did, with its date.'
          : 'Measured on this run.')
      : 'The current-network comparison has never been measured successfully; the 2015 baseline itself is unaffected and reproduces exactly.',
  };

  const artefact = buildArtefact({
    record,
    quality,
    validation,
    dataClass: DataClass.OBSERVED,
    lineage: createLineage(record.id, [
      { step: 'SOURCE', detail: `Overpass attic query at ${BASELINE_INSTANT}, ${ENDPOINT}` },
      { step: 'RAW', detail: `${tileList.length} tile responses, ${formatBytes(rawBytes)} total` },
      { step: 'READER', detail: 'src/nepal/io/overpass.js: out geom -> {osmId, coordinates, tags}' },
      { step: 'VALIDATE', detail: 'highway tag present; at least two resolved positions; way ids deduplicated across overlapping tiles' },
      { step: 'PROCESS', detail: 'ten tags retained; coordinates rounded to 6 decimals (~0.1 m, finer than OSM node precision)' },
      { step: 'ARTEFACT', detail: 'data/processed/nepal-2015-osm-roads.json' },
    ]),
    data: { instant: BASELINE_INSTANT, bbox, segments },
  });

  const written = await writeProcessed('nepal-2015-osm-roads.json', artefact);
  await writeRegistry(record);
  await writeReport(`${record.id}.quality.txt`, formatQualitySummary(quality));
  return { record, quality, validation, written };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await ingestOsmRoads({ force: process.argv.includes('--force') });
  console.log(formatQualitySummary(result.quality));
  console.log(
    `${result.validation.ways} ways, ${result.validation.positions} positions, ` +
      `${formatBytes(result.written.bytes)}`,
  );
  console.log(result.validation.mappingGrowthNote);
}
