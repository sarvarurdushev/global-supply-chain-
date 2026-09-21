/**
 * Verified district-name crosswalk for the geoBoundaries ADM2 polygons.
 *
 * Why this exists. The geoBoundaries NPL ADM2 file has exactly 75 features and
 * its total area agrees with Nepal's published land area to 0.37 %, so by
 * every cheap check it looks like the pre-2015 75-district system. It is not
 * clean:
 *
 *   - two polygons are LABELLED WRONG. The file calls Siraha "Saptari" and
 *     Parsa "Bara", so those four districts cannot be joined by name at all.
 *   - several names are transposed: "Baijura" for Bajura, "Synagja" for
 *     Syangja, "Kabherepalanchok" for Kabhrepalanchok.
 *   - the vintage is mixed. "Rukum E" and "Rukum W" are the POST-2015 split of
 *     a single 2015 district, and "Nawalapur" is half of Nawalparasi.
 *
 * A name join against OCHA's district statistics would therefore silently
 * mismatch or drop districts, and the sums would still look plausible.
 *
 *   SOURCE   each polygon's centroid, from the boundaries ingest
 *   READER   OpenStreetMap Nominatim reverse geocoding, one request per
 *            second per its usage policy
 *   VALIDATE the returned district must be inside Nepal
 *   PROCESS  compare the authoritative name against the file's label
 *   ARTEFACT data/processed/nepal-district-name-crosswalk.json
 *
 * The result is ground truth per polygon rather than a guess, and it is
 * cached in data/raw so a re-run does not hammer a free service.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DataClass, Redistribution, createDatasetRecord, createLineage } from '../../src/nepal/registry.js';
import { Issue, createQualityLog, formatQualitySummary } from '../../src/nepal/quality.js';
import { buildArtefact } from '../lib/artefact.mjs';
import { PROCESSED, RAW, formatBytes, writeProcessed, writeRegistry, writeReport } from '../lib/io.mjs';
import { normaliseDistrict } from './boundaries.mjs';

const CACHE = path.join(RAW, 'nominatim-district-lookup.json');
const RETRIEVED_AT = '2026-09-21';
const POLICY_DELAY_MS = 1200;

async function reverseGeocode(lat, lon) {
  const url =
    'https://nominatim.openstreetmap.org/reverse?format=jsonv2' +
    `&lat=${lat}&lon=${lon}&zoom=8&accept-language=en`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'NepalEQ-Research/1.0 (university disaster-analysis project)',
    },
  });
  if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
  const payload = await response.json();
  const address = payload.address ?? {};
  return {
    district: address.county ?? address.state_district ?? null,
    province: address.state ?? address.region ?? null,
    country: address.country ?? null,
  };
}

export async function ingestDistrictNames({ force = false } = {}) {
  const boundaries = JSON.parse(
    await readFile(path.join(PROCESSED, 'nepal-districts-adm2-2006.json'), 'utf8'),
  );

  let cache = {};
  if (!force) {
    try {
      cache = JSON.parse(await readFile(CACHE, 'utf8'));
    } catch {
      cache = {};
    }
  }

  const record = createDatasetRecord({
    id: 'nepal-district-name-crosswalk',
    datasetName: 'Verified district-name crosswalk for geoBoundaries NPL ADM2',
    publisher: 'This project, verified against OpenStreetMap Nominatim',
    sourceUrl: 'https://nominatim.openstreetmap.org/reverse',
    license: 'ODbL 1.0 (the verifying source); the crosswalk table itself is MIT',
    redistribution: Redistribution.SHARE_ALIKE,
    retrievedAt: RETRIEVED_AT,
    originalFormat: 'JSON (reverse-geocoding responses)',
    temporalCoverage: 'OpenStreetMap as of retrieval',
    geographicCoverage: 'Nepal, 75 district polygons',
    coordinateSystem: 'EPSG:4326',
    description:
      'For each geoBoundaries ADM2 polygon, the district OpenStreetMap places its centroid in — used to detect and correct mislabelled and misspelled district names before any statistic is joined by name.',
    dataClass: DataClass.DERIVED,
    attribution: '© OpenStreetMap contributors (via Nominatim)',
    limitations: [
      'A centroid can fall outside a strongly concave district; each correction should be read as "the polygon whose centroid lies here", not as a boundary assertion.',
      'OpenStreetMap district naming reflects the CURRENT 77-district system. Where the polygon is a post-2015 split (Rukum East/West, Nawalpur), no single 2015 district name is correct and the record says so instead of choosing one.',
    ],
  });

  const log = createQualityLog(record.id);
  const entries = [];
  let fetched = 0;

  for (const feature of boundaries.data.features) {
    log.readRecord();
    const { district: label, districtKey, shapeId, centroid } = feature.properties;
    const cacheKey = shapeId ?? `${centroid[0]},${centroid[1]}`;
    let lookup = cache[cacheKey];
    if (!lookup) {
      lookup = await reverseGeocode(centroid[1], centroid[0]);
      cache[cacheKey] = lookup;
      fetched += 1;
      await new Promise((resolve) => setTimeout(resolve, POLICY_DELAY_MS));
    }
    if (lookup.country && !/nepal/i.test(lookup.country)) {
      log.drop(Issue.OUT_OF_STUDY_AREA, `centroid of "${label}" geocodes to ${lookup.country}`, label);
      continue;
    }
    const verifiedKey = normaliseDistrict(lookup.district);
    const agrees = verifiedKey === districtKey;
    /* A post-2015 split has no single 2015 name; do not invent one. */
    const isPostSplit = /^(rukume|rukumw|nawalapur)$/.test(districtKey);
    if (!agrees && !isPostSplit && lookup.district) {
      log.note(
        Issue.UNEXPECTED_CATEGORY,
        `geoBoundaries labels this polygon "${label}" but OpenStreetMap places its centroid in "${lookup.district}"`,
        { label, verified: lookup.district, centroid },
      );
    }
    entries.push({
      shapeId,
      geoBoundariesName: label,
      geoBoundariesKey: districtKey,
      verifiedName: lookup.district ?? null,
      verifiedKey: verifiedKey || null,
      province: lookup.province ?? null,
      centroid,
      agrees,
      correction: agrees ? null : isPostSplit ? 'post-2015-split' : 'relabelled',
      /*
       * `joinKey` is what every downstream join must use. For a post-2015
       * split it stays null: aggregating two halves into a 2015 district is
       * an analysis decision with its own arithmetic, not a rename.
       */
      joinKey: isPostSplit ? null : verifiedKey || districtKey,
    });
    log.keptRecord();
  }

  await writeFile(CACHE, `${JSON.stringify(cache, null, 1)}\n`);

  const relabelled = entries.filter((entry) => entry.correction === 'relabelled');
  const splits = entries.filter((entry) => entry.correction === 'post-2015-split');
  const joinKeys = entries.map((entry) => entry.joinKey).filter(Boolean);
  const quality = log.summary();

  const validation = {
    polygons: entries.length,
    namesAgreeing: entries.filter((entry) => entry.agrees).length,
    relabelledCount: relabelled.length,
    relabelled: relabelled.map((entry) => `${entry.geoBoundariesName} -> ${entry.verifiedName}`),
    postSplitCount: splits.length,
    postSplit: splits.map((entry) => entry.geoBoundariesName),
    distinctJoinKeys: new Set(joinKeys).size,
    duplicateJoinKeys: joinKeys.filter((key, i) => joinKeys.indexOf(key) !== i),
    newlyFetched: fetched,
  };

  const artefact = buildArtefact({
    record,
    quality,
    validation,
    dataClass: DataClass.DERIVED,
    lineage: createLineage(record.id, [
      { step: 'SOURCE', detail: 'centroids of the 75 geoBoundaries ADM2 polygons' },
      { step: 'READER', detail: 'Nominatim reverse geocoding at zoom 8, one request per 1.2 s per the usage policy, cached in data/raw' },
      { step: 'VALIDATE', detail: 'the geocoded country must be Nepal' },
      { step: 'PROCESS', detail: 'file label compared against the authoritative district; post-2015 splits identified and left without a 2015 join key' },
      { step: 'ARTEFACT', detail: 'data/processed/nepal-district-name-crosswalk.json' },
    ]),
    data: { entries },
  });

  const written = await writeProcessed('nepal-district-name-crosswalk.json', artefact);
  await writeRegistry(record);
  await writeReport(`${record.id}.quality.txt`, formatQualitySummary(quality));
  return { record, quality, validation, written };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await ingestDistrictNames({ force: process.argv.includes('--force') });
  console.log(formatQualitySummary(result.quality).split('\n').slice(0, 3).join('\n'));
  const v = result.validation;
  console.log(`\npolygons ${v.polygons} | names agreeing ${v.namesAgreeing} | relabelled ${v.relabelledCount} | post-2015 splits ${v.postSplitCount}`);
  console.log(`distinct join keys ${v.distinctJoinKeys} | duplicate join keys ${JSON.stringify(v.duplicateJoinKeys)}`);
  console.log('\ncorrections:');
  for (const line of v.relabelled) console.log(`  ${line}`);
  console.log('post-2015 splits (no 2015 join key):', v.postSplit.join(', '));
  console.log(`\nartefact ${result.written.path} (${formatBytes(result.written.bytes)})`);
}
