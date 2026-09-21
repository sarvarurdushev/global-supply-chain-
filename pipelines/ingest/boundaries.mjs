/**
 * Nepal administrative boundaries -> processed district polygons.
 *
 *   SOURCE   geoBoundaries gbOpen NPL ADM2 (public domain)
 *   RAW      GeoJSON, simplified geometry as published
 *   READER   JSON
 *   VALIDATE 75 districts, geometry non-degenerate, all inside Nepal
 *   PROCESS  coordinates rounded; district name normalised for joining
 *   ARTEFACT data/processed/nepal-districts-adm2-2006.json
 *   ANALYSIS the spatial frame every district-level aggregate uses
 *
 * The vintage is the point. Nepal restructured into 753 local units during
 * 2015-2017, but the 2015 earthquake was reported against the OLD 75-district
 * system, so ADM2 at its 2006 vintage is the only frame in which this event's
 * own statistics can be joined. A modern boundary file would be more current
 * and completely wrong for this purpose.
 */

import { DataClass, Redistribution, createDatasetRecord, createLineage } from '../../src/nepal/registry.js';
import { Issue, createQualityLog, formatQualitySummary } from '../../src/nepal/quality.js';
import { geometryBbox, representativePoint, validateGeometry } from '../../src/nepal/geo/geometry.js';
import { ringAreaSqMetres } from '../../src/nepal/geo/crs.js';
import { buildArtefact } from '../lib/artefact.mjs';
import { fetchRaw, formatBytes, writeProcessed, writeRegistry, writeReport } from '../lib/io.mjs';

const META_URL = 'https://www.geoboundaries.org/api/current/gbOpen/NPL/ADM2/';
const RETRIEVED_AT = '2026-09-21';

/**
 * Lowercase, strip accents and punctuation: the join key for district names.
 *
 * Two source-specific removals, both because the sources disagree on
 * decoration rather than on identity: Nominatim returns "Kanchanpur District"
 * and "Darchula District (Nepal)", and neither a trailing "district" nor a
 * parenthetical qualifier is part of the name. Without stripping them, three
 * districts that agree perfectly are recorded as relabelled and handed join
 * keys nothing else in the project uses.
 */
export function normaliseDistrict(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .replace(/\bdistricts?\b/g, ' ')
    .replace(/[^a-z]/g, '');
}

export async function ingestBoundaries({ force = false } = {}) {
  const metaRaw = await fetchRaw('geoboundaries-npl-adm2-meta.json', META_URL, { force });
  const meta = JSON.parse(new TextDecoder().decode(metaRaw.bytes));
  const geojsonUrl = meta.simplifiedGeometryGeoJSON;

  const record = createDatasetRecord({
    id: 'geoboundaries-npl-adm2',
    datasetName: `geoBoundaries gbOpen NPL ADM2 (${meta.boundaryCanonical ?? 'Districts'})`,
    publisher: 'geoBoundaries, William & Mary geoLab',
    sourceUrl: geojsonUrl,
    license: 'Public domain (geoBoundaries gbOpen, CC0-equivalent)',
    redistribution: Redistribution.OPEN,
    retrievedAt: RETRIEVED_AT,
    originalFormat: 'GeoJSON (simplified geometry)',
    temporalCoverage: `boundary vintage ${meta.boundaryYearRepresented}`,
    geographicCoverage: 'Nepal, all districts',
    coordinateSystem: 'EPSG:4326',
    description:
      'Nepal district boundaries at the 2006 vintage — the 75-district system in force when the 2015 earthquake happened and the frame its official statistics are reported against.',
    dataClass: DataClass.OFFICIAL,
    attribution: 'geoBoundaries (geoboundaries.org)',
    discoveredVia: META_URL,
    fields: ['shapeName', 'shapeISO', 'shapeID'],
    limitations: [
      'Simplified geometry: adequate for choropleths, district joins and area context, not for cadastral or boundary-dispute work.',
      'Nepal restructured into 7 provinces and 753 local units in 2015-2017. These 75 districts are the pre-restructuring system and cannot be joined to post-2017 statistics without a crosswalk.',
    ],
  });

  const raw = await fetchRaw('geoboundaries-npl-adm2.geojson', geojsonUrl, { force });
  const payload = JSON.parse(new TextDecoder().decode(raw.bytes));
  const log = createQualityLog(record.id);
  const seenNames = new Set();
  const features = [];

  for (const feature of payload.features ?? []) {
    log.readRecord();
    const name = feature?.properties?.shapeName ?? null;
    if (!name) {
      log.drop(Issue.MISSING_VALUE, 'district has no shapeName', feature?.properties?.shapeID);
      continue;
    }
    const check = validateGeometry(feature.geometry);
    if (!check.ok) {
      log.drop(check.code, `${name}: ${check.reason}`, name);
      continue;
    }
    const key = normaliseDistrict(name);
    if (seenNames.has(key)) {
      log.note(Issue.DUPLICATE_RECORD, `district name "${name}" appears more than once; kept`, name);
    }
    seenNames.add(key);

    /* Area in UTM 45N. A polygon area in square degrees is not an area. */
    const polygons =
      feature.geometry.type === 'MultiPolygon'
        ? feature.geometry.coordinates
        : [feature.geometry.coordinates];
    let areaSqKm = 0;
    for (const rings of polygons) {
      areaSqKm += ringAreaSqMetres(rings[0]) / 1e6;
      for (let h = 1; h < rings.length; h += 1) areaSqKm -= ringAreaSqMetres(rings[h]) / 1e6;
    }

    features.push({
      type: 'Feature',
      geometry: roundGeometry(feature.geometry),
      properties: {
        district: name,
        districtKey: key,
        shapeId: feature.properties.shapeID ?? null,
        areaSqKm: Number(areaSqKm.toFixed(2)),
        centroid: representativePoint(feature.geometry).map((v) => Number(v.toFixed(5))),
        bbox: geometryBbox(feature.geometry).map((v) => Number(v.toFixed(5))),
      },
    });
    log.keptRecord();
  }

  const quality = log.summary();
  const totalArea = features.reduce((sum, f) => sum + f.properties.areaSqKm, 0);
  const validation = {
    districtCount: features.length,
    expectedDistrictCount: 75,
    matchesPre2015System: features.length === 75,
    boundaryVintage: meta.boundaryYearRepresented,
    totalAreaSqKm: Number(totalArea.toFixed(0)),
    /* Nepal's published land area is about 147,181 km^2. */
    publishedAreaSqKm: 147181,
    areaAgreementPercent: Number(((totalArea / 147181 - 1) * 100).toFixed(2)),
    uniqueDistrictKeys: seenNames.size,
  };

  const artefact = buildArtefact({
    record,
    quality,
    validation,
    dataClass: DataClass.OFFICIAL,
    lineage: createLineage(record.id, [
      { step: 'SOURCE', detail: `geoBoundaries API metadata at ${META_URL}` },
      { step: 'RAW', detail: `${formatBytes(raw.bytes.length)} GeoJSON, sha256 ${raw.sha256.slice(0, 16)}` },
      { step: 'READER', detail: 'JSON.parse; already EPSG:4326' },
      { step: 'VALIDATE', detail: 'district count against the 75-district system, geometry non-degenerate, names present and unique' },
      { step: 'PROCESS', detail: 'area computed in EPSG:32645; normalised join key derived; coordinates rounded to 5 decimals' },
      { step: 'ARTEFACT', detail: 'data/processed/nepal-districts-adm2-2006.json' },
    ]),
    data: { type: 'FeatureCollection', features },
  });

  const written = await writeProcessed('nepal-districts-adm2-2006.json', artefact);
  await writeRegistry(record);
  await writeReport(`${record.id}.quality.txt`, formatQualitySummary(quality));
  return { record, quality, validation, written };
}

function roundGeometry(geometry, decimals = 5) {
  const round = (v) => Number(v.toFixed(decimals));
  const walk = (c) => (typeof c[0] === 'number' ? [round(c[0]), round(c[1])] : c.map(walk));
  return { type: geometry.type, coordinates: walk(geometry.coordinates) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await ingestBoundaries({ force: process.argv.includes('--force') });
  console.log(formatQualitySummary(result.quality));
  console.log(JSON.stringify(result.validation, null, 1));
  console.log(`artefact ${result.written.path} (${formatBytes(result.written.bytes)})`);
}
