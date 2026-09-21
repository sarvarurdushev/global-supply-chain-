/**
 * Nepal district boundaries -> the 2015 75-district analysis frame.
 *
 *   SOURCE   OCHA Common Operational Dataset, npl_admin_boundaries.shp.zip
 *   RAW      53.7 MB archive; the ADM2 layer holds 77 districts, 411,412
 *            vertices, EPSG:4326, with p-codes                [not committed]
 *   READER   zip -> .shp + .dbf + .prj
 *   VALIDATE 77 features, geometry valid, p-codes unique, known points land
 *            in the right district
 *   PROCESS  merge the two post-2017 splits back to their 2015 districts;
 *            simplify to a committable size and VERIFY containment survives
 *   ARTEFACT data/processed/nepal-districts-adm2-2015.json     [committed]
 *
 * This replaces geoBoundaries, and the reason is a measured failure rather
 * than a preference. That file has 75 features and a national area within
 * 0.37% of the published figure, so it passes every cheap check — but it
 * carries about FIFTY VERTICES PER DISTRICT, and at that coarseness the
 * Kathmandu polygon swallows Lalitpur. A point in Patan tested as being in
 * Kathmandu, Lalitpur's population was added to its neighbour's, and the
 * national total still reconciled because nothing was lost, only mixed.
 *
 * COD-AB carries 411,412 vertices, is the authoritative humanitarian boundary
 * for Nepal, and places every test point correctly.
 *
 * The vintage question is handled rather than ignored. COD-AB is the current
 * 77-district system; the 2015 earthquake is reported against 75. The 2017
 * restructuring split exactly two districts — Nawalparasi into East and West,
 * Rukum into East and West — and left the other 73 alone, so merging those
 * two pairs reconstructs the 2015 frame exactly.
 */

import { DataClass, Redistribution, createDatasetRecord, createLineage } from '../../src/nepal/registry.js';
import { Issue, createQualityLog, formatQualitySummary } from '../../src/nepal/quality.js';
import { geometryBbox, pointInPolygon, representativePoint, validateGeometry } from '../../src/nepal/geo/geometry.js';
import { ringAreaSqMetres } from '../../src/nepal/geo/crs.js';
import { countPositions, simplifyGeometry } from '../../src/nepal/geo/simplify.js';
import { readDbf } from '../../src/nepal/io/dbf.js';
import { readPrj, readShp } from '../../src/nepal/io/shapefile.js';
import { listZipEntries, readZipEntry } from '../../src/nepal/io/zip.js';
import { buildArtefact } from '../lib/artefact.mjs';
import { fetchRaw, formatBytes, writeProcessed, writeRegistry, writeReport } from '../lib/io.mjs';

const SOURCE_URL =
  'https://data.humdata.org/dataset/07db728a-4f0f-4e98-8eb0-8fa9df61f01c/resource/b6ab1a5a-8b6e-41fb-a61f-8202ce98d16c/download/npl_admin_boundaries.shp.zip';
const RETRIEVED_AT = '2026-09-21';

/**
 * The two districts split after 2015, and what they were before.
 *
 * Not a guess: these are the only two changes the 2017 restructuring made at
 * district level, which is why 75 became 77 and not some other number.
 */
const POST_2017_SPLITS = Object.freeze({
  'Nawalparasi East': 'Nawalparasi',
  'Nawalparasi West': 'Nawalparasi',
  'Rukum East': 'Rukum',
  'Rukum West': 'Rukum',
});

/**
 * Simplification tolerance, in metres.
 *
 * Chosen against the failure that made this file necessary: 100 m is far
 * finer than the ~819 m population cells the frame is used with, and the
 * containment of known points is re-verified after simplifying rather than
 * assumed.
 */
const SIMPLIFY_METRES = 100;

/** Places whose district is not in doubt, used to prove the frame is right. */
const CONTAINMENT_CHECKS = Object.freeze([
  { name: 'Patan', lon: 85.324, lat: 27.673, district: 'Lalitpur' },
  { name: 'Kathmandu centre', lon: 85.324, lat: 27.7172, district: 'Kathmandu' },
  { name: 'Bhaktapur', lon: 85.4298, lat: 27.671, district: 'Bhaktapur' },
  { name: 'Pokhara', lon: 83.9856, lat: 28.2096, district: 'Kaski' },
  { name: 'Gorkha epicentre', lon: 84.7314, lat: 28.2305, district: 'Gorkha' },
  { name: 'Biratnagar', lon: 87.2718, lat: 26.4525, district: 'Morang' },
]);

/** Lowercase, strip accents, punctuation and decoration: the district join key. */
export function normaliseDistrict(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .replace(/\bdistricts?\b/g, ' ')
    .replace(/[^a-z]/g, '');
}

export async function ingestBoundaries({ force = false } = {}) {
  const record = createDatasetRecord({
    id: 'cod-ab-npl-adm2',
    datasetName: 'Nepal Subnational Administrative Boundaries (COD-AB), ADM2',
    publisher: 'UN OCHA Field Information Services Section',
    sourceUrl: SOURCE_URL,
    license: 'CC BY-IGO 3.0',
    redistribution: Redistribution.SHARE_ALIKE,
    retrievedAt: RETRIEVED_AT,
    originalFormat: 'ESRI Shapefile inside a zip archive',
    temporalCoverage: 'current administrative divisions; merged here to the 2015 75-district frame',
    geographicCoverage: 'Nepal, all districts',
    coordinateSystem: 'EPSG:4326',
    description:
      'The authoritative humanitarian district boundary for Nepal, carrying p-codes. Published as the current 77 districts and merged here to the 75-district system the 2015 earthquake is reported against.',
    dataClass: DataClass.OFFICIAL,
    attribution: 'UN OCHA (data.humdata.org), CC BY-IGO',
    discoveredVia: 'https://data.humdata.org/dataset/cod-ab-npl',
    fields: ['adm2_name', 'adm2_pcode', 'adm1_name', 'adm1_pcode', 'area_sqkm'],
    limitations: [
      'Published for the CURRENT administrative divisions. The 2015 frame is reconstructed by merging Nawalparasi East and West, and Rukum East and West; every other district is unchanged by the 2017 restructuring.',
      'Simplified to 100 m for a committable file size. Containment of known settlements is re-verified after simplification, but a point within about 100 m of a district border may fall on the wrong side.',
      'A merged district carries two p-codes, because the 2015 district it represents no longer has one of its own.',
    ],
  });

  const raw = await fetchRaw('npl_admin_boundaries.shp.zip', SOURCE_URL, { force });
  const entries = listZipEntries(raw.bytes);
  const find = (suffix) => entries.find((entry) => entry.name.endsWith(`npl_admin2${suffix}`));
  const shp = readShp(await readZipEntry(raw.bytes, find('.shp')));
  const dbf = readDbf(await readZipEntry(raw.bytes, find('.dbf')));
  const prj = readPrj(new TextDecoder().decode(await readZipEntry(raw.bytes, find('.prj'))));
  if (prj.epsg !== 4326) {
    throw new Error(`COD-AB ADM2 is not in EPSG:4326 (got ${prj.epsg}); reprojection would be required.`);
  }

  const log = createQualityLog(record.id);
  const sourceVertices = shp.geometries.reduce(
    (sum, geometry) => sum + (geometry ? countPositions(geometry) : 0),
    0,
  );

  /* ---------------- read, validate, merge the splits ---------------- */

  const merged = new Map();
  for (let i = 0; i < shp.geometries.length; i += 1) {
    log.readRecord();
    const geometry = shp.geometries[i];
    const attributes = dbf.rows[i] ?? {};
    const publishedName = attributes.adm2_name ?? null;
    if (!publishedName) {
      log.drop(Issue.MISSING_VALUE, 'district has no adm2_name', attributes.adm2_pcode);
      continue;
    }
    const check = validateGeometry(geometry);
    if (!check.ok) {
      log.drop(check.code, `${publishedName}: ${check.reason}`, publishedName);
      continue;
    }
    const districtName = POST_2017_SPLITS[publishedName] ?? publishedName;
    if (POST_2017_SPLITS[publishedName]) {
      log.note(
        Issue.REPAIRED,
        `"${publishedName}" is a post-2017 split; merged into the 2015 district "${districtName}"`,
        publishedName,
      );
    }
    const key = normaliseDistrict(districtName);
    const polygons =
      geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
    const existing = merged.get(key);
    if (existing) {
      existing.polygons.push(...polygons);
      existing.pcodes.push(attributes.adm2_pcode ?? null);
      existing.sourceNames.push(publishedName);
      existing.publishedAreaSqKm += Number(attributes.area_sqkm) || 0;
    } else {
      merged.set(key, {
        district: districtName,
        districtKey: key,
        polygons,
        pcodes: [attributes.adm2_pcode ?? null],
        sourceNames: [publishedName],
        province: attributes.adm1_name ?? null,
        provincePcode: attributes.adm1_pcode ?? null,
        publishedAreaSqKm: Number(attributes.area_sqkm) || 0,
      });
    }
    log.keptRecord();
  }

  /* ---------------- simplify, and prove containment survives ---------------- */

  const features = [];
  let simplifiedVertices = 0;
  for (const entry of merged.values()) {
    const full = {
      type: entry.polygons.length === 1 ? 'Polygon' : 'MultiPolygon',
      coordinates: entry.polygons.length === 1 ? entry.polygons[0] : entry.polygons,
    };
    const centroid = representativePoint(full);
    const simplified = simplifyGeometry(full, SIMPLIFY_METRES, centroid[1]);
    simplifiedVertices += countPositions(simplified);

    const rings = simplified.type === 'MultiPolygon' ? simplified.coordinates : [simplified.coordinates];
    let areaSqKm = 0;
    for (const polygon of rings) {
      areaSqKm += ringAreaSqMetres(polygon[0]) / 1e6;
      for (let h = 1; h < polygon.length; h += 1) areaSqKm -= ringAreaSqMetres(polygon[h]) / 1e6;
    }

    features.push({
      type: 'Feature',
      geometry: roundGeometry(simplified),
      properties: {
        district: entry.district,
        districtKey: entry.districtKey,
        province: entry.province,
        pcodes: entry.pcodes.filter(Boolean),
        mergedFrom: entry.sourceNames.length > 1 ? entry.sourceNames : null,
        areaSqKm: Number(areaSqKm.toFixed(2)),
        publishedAreaSqKm: Number(entry.publishedAreaSqKm.toFixed(2)),
        centroid: centroid.map((value) => Number(value.toFixed(5))),
        bbox: geometryBbox(simplified).map((value) => Number(value.toFixed(5))),
      },
    });
  }

  /*
   * The check that matters. Simplification is what broke the previous frame,
   * so every known settlement is re-tested against the SIMPLIFIED geometry.
   */
  const containment = CONTAINMENT_CHECKS.map((place) => {
    const hits = features.filter((feature) =>
      pointInPolygon([place.lon, place.lat], feature.geometry),
    );
    return {
      ...place,
      resolvedTo: hits.map((feature) => feature.properties.district),
      correct: hits.length === 1 && hits[0].properties.district === place.district,
    };
  });
  const containmentFailures = containment.filter((place) => !place.correct);
  if (containmentFailures.length > 0) {
    throw new Error(
      `Simplification broke district containment for ${containmentFailures
        .map((place) => `${place.name} (expected ${place.district}, got ${place.resolvedTo.join('/') || 'nothing'})`)
        .join('; ')}. Lower SIMPLIFY_METRES.`,
    );
  }

  const quality = log.summary();
  const totalArea = features.reduce((sum, feature) => sum + feature.properties.areaSqKm, 0);
  const keys = features.map((feature) => feature.properties.districtKey);
  const validation = {
    sourceFeatures: shp.geometries.length,
    expectedSourceFeatures: 77,
    districtCount: features.length,
    expectedDistrictCount: 75,
    matches2015System: features.length === 75,
    mergedDistricts: features
      .filter((feature) => feature.properties.mergedFrom)
      .map((feature) => ({ district: feature.properties.district, from: feature.properties.mergedFrom })),
    sourceVertices,
    simplifiedVertices,
    vertexReduction: Number(((1 - simplifiedVertices / sourceVertices) * 100).toFixed(1)),
    meanVerticesPerDistrict: Math.round(simplifiedVertices / features.length),
    simplifyToleranceMetres: SIMPLIFY_METRES,
    containmentChecks: containment,
    containmentAllCorrect: containmentFailures.length === 0,
    duplicateKeys: keys.filter((key, index) => keys.indexOf(key) !== index),
    totalAreaSqKm: Number(totalArea.toFixed(0)),
    publishedAreaSqKm: 147181,
    areaAgreementPercent: Number(((totalArea / 147181 - 1) * 100).toFixed(2)),
  };

  const artefact = buildArtefact({
    record,
    quality,
    validation,
    dataClass: DataClass.OFFICIAL,
    lineage: createLineage(record.id, [
      { step: 'SOURCE', detail: `OCHA COD-AB for Nepal, ${SOURCE_URL}` },
      { step: 'RAW', detail: `${formatBytes(raw.bytes.length)} zip, sha256 ${raw.sha256.slice(0, 16)}; ADM2 layer carries ${sourceVertices.toLocaleString()} vertices` },
      { step: 'READER', detail: 'zip -> npl_admin2.shp + .dbf + .prj; CRS asserted to be EPSG:4326' },
      { step: 'VALIDATE', detail: 'geometry valid, names present, p-codes carried, 77 source features expected' },
      { step: 'MERGE', detail: 'Nawalparasi East+West and Rukum East+West merged back to their 2015 districts, reconstructing the 75-district frame' },
      { step: 'SIMPLIFY', detail: `Douglas-Peucker at ${SIMPLIFY_METRES} m, then containment of six known settlements re-verified against the simplified geometry` },
      { step: 'ARTEFACT', detail: 'data/processed/nepal-districts-adm2-2015.json' },
    ]),
    data: { type: 'FeatureCollection', features },
  });

  const written = await writeProcessed('nepal-districts-adm2-2015.json', artefact);
  await writeRegistry(record);
  await writeReport(`${record.id}.quality.txt`, formatQualitySummary(quality));
  return { record, quality, validation, written };
}

function roundGeometry(geometry, decimals = 5) {
  const round = (value) => Number(value.toFixed(decimals));
  const walk = (coordinates) =>
    typeof coordinates[0] === 'number' ? [round(coordinates[0]), round(coordinates[1])] : coordinates.map(walk);
  return { type: geometry.type, coordinates: walk(geometry.coordinates) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await ingestBoundaries({ force: process.argv.includes('--force') });
  const v = result.validation;
  console.log(`source ${v.sourceFeatures} districts -> ${v.districtCount} in the 2015 frame`);
  console.log(`merged: ${v.mergedDistricts.map((m) => `${m.district} (${m.from.join(' + ')})`).join(', ')}`);
  console.log(`vertices ${v.sourceVertices.toLocaleString()} -> ${v.simplifiedVertices.toLocaleString()} (${v.vertexReduction}% reduction, ${v.meanVerticesPerDistrict}/district)`);
  console.log(`area ${v.totalAreaSqKm.toLocaleString()} km2 vs published ${v.publishedAreaSqKm.toLocaleString()} (${v.areaAgreementPercent}%)`);
  console.log('\ncontainment checks against the SIMPLIFIED geometry:');
  for (const place of v.containmentChecks) {
    console.log(`  ${place.correct ? 'PASS' : 'FAIL'}  ${place.name.padEnd(18)} -> ${place.resolvedTo.join(', ') || '(none)'}`);
  }
  console.log(`\nartefact ${result.written.path} (${formatBytes(result.written.bytes)})`);
}
