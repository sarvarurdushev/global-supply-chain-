/**
 * OpenStreetMap as it stood the day before the earthquake: health facilities,
 * airfields and heliports, and the motorable road network they sit on.
 *
 *   SOURCE   Overpass API attic queries at 2015-04-24T00:00:00Z (ODbL)
 *   RAW      one JSON response per tile and query, cached in data/raw
 *   READER   src/nepal/io/overpass.js (ways) and the facility reader below
 *   VALIDATE positions resolved and inside the envelope, no duplicate ids,
 *            a facility needs a recognised health or aeroway tag
 *   PROCESS  ways deduplicated across tiles and reduced to a junction graph;
 *            facilities reduced to a point with name, kind and source tags
 *   ARTEFACT data/processed/nepal-2015-osm-health-facilities.json
 *            data/processed/nepal-2015-osm-access-network.json
 *   ANALYSIS pipelines/analyse/health-access.mjs
 *
 * WHY A SECOND NETWORK. The Stage 2 network (osm-roads.mjs) holds only the
 * strategic classes inside 84.2–86.8°E, which is right for the corridor
 * question Stage 5 asked and wrong for access to a health facility: most
 * facilities sit on unclassified roads, tracks and town streets, and the
 * envelope stops short of Pokhara, the nearest large hospital town west of
 * Gorkha. Stage 5's network and its results are untouched; this is a separate
 * artefact for a separate question.
 *
 * WHY 2015 AND NOT TODAY. As for the roads: the post-earthquake mapping
 * activation added thousands of features. A 2026 facility list would describe
 * a health system that did not exist on the morning of 25 April 2015.
 */

import { DataClass, Redistribution, createDatasetRecord, createLineage } from '../../src/nepal/registry.js';
import { Issue, createQualityLog, formatQualitySummary } from '../../src/nepal/quality.js';
import { overpassBaseTimestamp, parseOverpassWays } from '../../src/nepal/io/overpass.js';
import { buildJunctionGraph, classifyFacility } from '../../src/nepal/access/network.js';
import { buildArtefact } from '../lib/artefact.mjs';
import { fetchRaw, formatBytes, writeProcessed, writeRegistry, writeReport } from '../lib/io.mjs';

/** The Overpass instance the Stage 2 roads came from, for the same reason. */
const ENDPOINT = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';
export const BASELINE_INSTANT = '2015-04-24T00:00:00Z';
const RETRIEVED_AT = '2026-09-29';

/**
 * The access envelope: the Stage 2 study box widened west to 83.8°E so that
 * Pokhara (83.98°E) and its hospitals are inside, and to 27.0–28.8°N so no
 * district of the damage area is clipped. A facility or road outside it does
 * not exist to the analysis, and the report says so.
 */
export const ACCESS_BBOX = Object.freeze([83.8, 27.0, 86.8, 28.8]);
const TILE_DEGREES = 0.4;

/**
 * Motorable classes plus tracks. Tracks are included because in the hill
 * districts they are how vehicles reach villages at all; paths and footways
 * are not, because this is a road-access analysis and a foot trail's
 * passability for a vehicle is exactly what it is not.
 */
export const ACCESS_HIGHWAY_CLASSES = Object.freeze([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
  'unclassified', 'residential', 'living_street', 'service', 'road', 'track',
]);

const HEALTH_AMENITIES = ['hospital', 'clinic', 'doctors', 'health_post', 'health_centre'];
const AEROWAYS = ['aerodrome', 'airstrip', 'helipad', 'heliport'];

function tiles(bbox = ACCESS_BBOX, step = TILE_DEGREES) {
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

function roadQuery([south, west, north, east]) {
  return (
    `[out:json][timeout:600][date:"${BASELINE_INSTANT}"];` +
    `way["highway"~"^(${ACCESS_HIGHWAY_CLASSES.join('|')})$"](${south},${west},${north},${east});` +
    'out geom;'
  );
}

function facilityQuery([south, west, north, east]) {
  const box = `(${south},${west},${north},${east})`;
  return (
    `[out:json][timeout:600][date:"${BASELINE_INSTANT}"];(` +
    `node["amenity"~"^(${HEALTH_AMENITIES.join('|')})$"]${box};` +
    `way["amenity"~"^(${HEALTH_AMENITIES.join('|')})$"]${box};` +
    `node["healthcare"]${box};way["healthcare"]${box};` +
    `node["aeroway"~"^(${AEROWAYS.join('|')})$"]${box};` +
    `way["aeroway"~"^(${AEROWAYS.join('|')})$"]${box};` +
    ');out center tags;'
  );
}

/**
 * One tile, politely. The public mirror answers a concurrent query with a
 * 504 or an XML error page rather than queueing it, so tiles run one at a
 * time with a growing pause, and a body that is not JSON is never cached as
 * if it were an answer.
 */
async function fetchTile(name, query, { force, attempts = 6 }) {
  const url = `${ENDPOINT}?data=${encodeURIComponent(query)}`;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const raw = await fetchRaw(name, url, { force: force && attempt === 1 });
      const text = new TextDecoder().decode(raw.bytes);
      if (!text.trimStart().startsWith('{')) {
        throw new Error(`non-JSON body: ${text.slice(0, 100).replace(/\s+/g, ' ')}`);
      }
      const payload = JSON.parse(text);
      if (payload.remark && /runtime error|timed out/i.test(payload.remark)) {
        throw new Error(`Overpass remark: ${payload.remark}`);
      }
      return { raw, payload };
    } catch (error) {
      lastError = error;
      force = true;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(90_000, 8000 * 2 ** (attempt - 1))));
      }
    }
  }
  throw new Error(`Overpass tile ${name} failed after ${attempts} attempts: ${lastError?.message}`);
}

/** A facility element, or the reason it is not one. */
export function readFacilityElement(element) {
  const tags = element?.tags ?? {};
  const lon = element?.lon ?? element?.center?.lon;
  const lat = element?.lat ?? element?.center?.lat;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return { error: 'no resolvable position' };
  const kind = classifyFacility(tags);
  if (!kind) return { error: 'no recognised health or aeroway tag' };
  return {
    facility: {
      id: `${element.type}/${element.id}`,
      kind,
      name: tags.name ?? tags['name:en'] ?? null,
      nameNe: tags['name:ne'] ?? null,
      lon: Number(lon.toFixed(6)),
      lat: Number(lat.toFixed(6)),
      tags: Object.fromEntries(
        ['amenity', 'healthcare', 'aeroway', 'operator', 'operator:type', 'emergency', 'iata', 'icao', 'ele']
          .filter((key) => tags[key] !== undefined)
          .map((key) => [key, tags[key]]),
      ),
    },
  };
}

export async function ingestOsmAccess2015({ force = false } = {}) {
  const record = createDatasetRecord({
    id: 'osm-nepal-2015-access',
    datasetName: 'OpenStreetMap health facilities, airfields and motorable roads, central Nepal, as at 2015-04-24',
    publisher: 'OpenStreetMap contributors, served by the Overpass API',
    sourceUrl: 'https://www.openstreetmap.org/',
    license: 'Open Database License (ODbL) 1.0',
    redistribution: Redistribution.SHARE_ALIKE,
    retrievedAt: RETRIEVED_AT,
    originalFormat: 'Overpass API JSON (way geometry; node and way centres with tags)',
    temporalCoverage: 'Database state at 2015-04-24T00:00:00Z, the day before the earthquake',
    geographicCoverage: `Access envelope ${ACCESS_BBOX.join(', ')} (EPSG:4326)`,
    coordinateSystem: 'EPSG:4326',
    description:
      'Every health facility (amenity hospital, clinic, doctors, health_post, health_centre, or any healthcare tag), airfield and heliport, and every motorable road including tracks, as mapped in OpenStreetMap immediately before the 25 April 2015 Gorkha earthquake. Attic queries, so nothing mapped in response to the earthquake is included.',
    dataClass: DataClass.OBSERVED,
    attribution: '© OpenStreetMap contributors, ODbL',
    fields: ['osmId', 'coordinates', 'highway', 'bridge', 'name', 'amenity', 'healthcare', 'aeroway', 'operator'],
    limitations: [
      'Coverage is uneven. The Kathmandu Valley’s health facilities had been systematically mapped before 2015; most hill districts had not. A facility absent here may have existed and been unmapped.',
      'OpenStreetMap tags describe what a mapper saw or was told. "hospital" is sometimes used for a clinic; no tag here is a statement of services, staffing or capacity, and none is used as one.',
      'Road classes are not speeds and a mapped road is not a passable road. Network distance is the only quantity this supports.',
      'Anything outside the access envelope is invisible to the analysis, including hospitals a patient might in fact have reached.',
    ],
  });

  const log = createQualityLog(record.id);
  const facilityLog = createQualityLog(`${record.id}-facilities`);
  const seenWays = new Set();
  const seenFacilities = new Set();
  const segments = [];
  const facilities = [];
  const tileList = tiles();
  let rawBytes = 0;
  let baseTimestamp = null;

  for (const tile of tileList) {
    const [south, west] = tile;
    const roads = await fetchTile(`osm-access-roads-2015-${south}-${west}.json`, roadQuery(tile), { force });
    rawBytes += roads.raw.bytes.length;
    baseTimestamp ??= overpassBaseTimestamp(roads.payload);
    const parsed = parseOverpassWays(roads.payload, {
      seen: seenWays,
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

    const found = await fetchTile(`osm-access-facilities-2015-${south}-${west}.json`, facilityQuery(tile), { force });
    rawBytes += found.raw.bytes.length;
    for (const element of found.payload.elements ?? []) {
      facilityLog.readRecord();
      const key = `${element.type}/${element.id}`;
      if (seenFacilities.has(key)) {
        facilityLog.drop(Issue.DUPLICATE_RECORD, `${key}: returned by two tiles`, key);
        continue;
      }
      const { facility, error } = readFacilityElement(element);
      if (!facility) {
        facilityLog.drop(Issue.MISSING_VALUE, `${key}: ${error}`, key);
        continue;
      }
      seenFacilities.add(key);
      facilityLog.keptRecord();
      facilities.push(facility);
    }
  }

  segments.sort((a, b) => a.osmId - b.osmId);
  facilities.sort((a, b) => a.id.localeCompare(b.id));
  const graph = buildJunctionGraph(segments);

  const byClass = {};
  for (const segment of segments) byClass[segment.tags.highway] = (byClass[segment.tags.highway] ?? 0) + 1;
  const byKind = {};
  for (const facility of facilities) byKind[facility.kind] = (byKind[facility.kind] ?? 0) + 1;

  const lineage = createLineage(record.id, [
    { step: 'SOURCE', detail: `Overpass attic queries at ${BASELINE_INSTANT}, ${tileList.length} tiles of ${TILE_DEGREES}°` },
    { step: 'RAW', detail: `${tileList.length * 2} responses, ${formatBytes(rawBytes)}, cached in data/raw` },
    { step: 'VALIDATE', detail: 'unresolved positions and duplicate ids refused; facilities need a recognised tag' },
    { step: 'PROCESS', detail: `ways reduced to a junction graph (${graph.nodes.length} nodes, ${graph.edges.length} edges); facilities to points` },
  ]);

  const roadQuality = log.summary();
  const facilityQuality = facilityLog.summary();
  const validation = {
    instant: BASELINE_INSTANT,
    overpassBaseTimestamp: baseTimestamp,
    tiles: tileList.length,
    ways: segments.length,
    waysByClass: byClass,
    graphNodes: graph.nodes.length,
    graphEdges: graph.edges.length,
    graphLengthKm: Number((graph.edges.reduce((sum, edge) => sum + edge.m, 0) / 1000).toFixed(1)),
    facilities: facilities.length,
    facilitiesByKind: byKind,
  };

  const networkArtefact = buildArtefact({
    record,
    lineage,
    quality: roadQuality,
    dataClass: DataClass.OBSERVED,
    validation,
    data: {
      bbox: ACCESS_BBOX,
      classes: ACCESS_HIGHWAY_CLASSES,
      /* Columnar: [lon, lat] per node; per edge [from, to, metres, classIndex, bridge, osmId]. */
      nodes: graph.nodes,
      edges: graph.edges.map((edge) => [edge.from, edge.to, edge.m, ACCESS_HIGHWAY_CLASSES.indexOf(edge.highway), edge.bridge ? 1 : 0, edge.osmId]),
      edgeFields: ['from', 'to', 'metres', 'classIndex', 'bridge', 'osmId'],
      /* Simplified polylines, for drawing a route; index-aligned with edges. */
      edgeShapes: graph.edges.map((edge) => edge.shape),
    },
  });
  const facilityArtefact = buildArtefact({
    record,
    lineage,
    quality: facilityQuality,
    dataClass: DataClass.OBSERVED,
    validation,
    data: { bbox: ACCESS_BBOX, facilities },
  });

  await writeRegistry(record);
  const written = [
    await writeProcessed('nepal-2015-osm-access-network.json', networkArtefact),
    await writeProcessed('nepal-2015-osm-health-facilities.json', facilityArtefact),
  ];
  await writeReport(
    `${record.id}.quality.txt`,
    [
      `${record.datasetName}`,
      `roads: ${formatQualitySummary(roadQuality)}`,
      `facilities: ${formatQualitySummary(facilityQuality)}`,
      JSON.stringify(validation, null, 1),
    ].join('\n\n'),
  );
  return { validation, written };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const force = process.argv.includes('--force');
  const { validation, written } = await ingestOsmAccess2015({ force });
  console.log(JSON.stringify(validation, null, 1));
  for (const file of written) console.log(`${file.path} ${formatBytes(file.bytes)}`);
}
