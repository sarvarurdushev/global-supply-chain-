/**
 * OCHA district population and peak ground acceleration -> processed table.
 *
 *   SOURCE   OCHA NAAS, "Estimated Population Exposed to Nepal Earthquake
 *            shaking", published on HDX in 2015 (CC BY-IGO)
 *   RAW      CSV, 66 district rows
 *   READER   RFC 4180 parser
 *   VALIDATE population parseable, PGA in a physical range, district
 *            resolvable against the verified crosswalk
 *   PROCESS  "275,903" repaired to 275903 and the repair logged
 *   ARTEFACT data/processed/nepal-2015-ocha-district-exposure.json
 *   ANALYSIS the OFFICIAL comparator our own derived population exposure is
 *            measured against
 *
 * This dataset is OFFICIAL, not DERIVED. It is what a UN agency published in
 * 2015, and its value to the project is precisely that it was produced
 * independently of anything we compute: agreement is evidence, disagreement is
 * a finding, and merging the two would destroy both.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DataClass, Redistribution, createDatasetRecord, createLineage } from '../../src/nepal/registry.js';
import { Issue, createQualityLog, formatQualitySummary } from '../../src/nepal/quality.js';
import { parseCsv, parseNumber } from '../../src/nepal/io/csv.js';
import { resolveName } from '../../src/nepal/geo/names.js';
import { buildArtefact } from '../lib/artefact.mjs';
import { PROCESSED, fetchRaw, formatBytes, writeProcessed, writeRegistry, writeReport } from '../lib/io.mjs';
import { normaliseDistrict } from './boundaries.mjs';

const CSV_URL =
  'https://data.humdata.org/dataset/4ae4f428-f959-4413-b752-5736f19ed70d/resource/3165c3f0-eb74-4d7b-bb8e-a1ae9e9c6586/download/pga-affecteddistricts-pop.csv';
const RETRIEVED_AT = '2026-09-21';

export async function ingestOchaExposure({ force = false } = {}) {
  const record = createDatasetRecord({
    id: 'ocha-nepal-2015-district-exposure',
    datasetName: 'Estimated Population Exposed to Nepal Earthquake shaking',
    publisher: 'UN OCHA, Needs Assessment and Analysis Section',
    sourceUrl: CSV_URL,
    license: 'CC BY-IGO 3.0',
    redistribution: Redistribution.SHARE_ALIKE,
    retrievedAt: RETRIEVED_AT,
    originalFormat: 'CSV',
    temporalCoverage: '2015-04-25 event; published April 2015',
    geographicCoverage: '66 Nepali districts',
    coordinateSystem: 'n/a (tabular, keyed on district)',
    description:
      'District population against modelled peak ground acceleration and a severity class, published by OCHA days after the earthquake. Used as the official comparator for this project’s own population-exposure calculation.',
    dataClass: DataClass.OFFICIAL,
    attribution: 'UN OCHA (data.humdata.org), CC BY-IGO',
    discoveredVia: 'https://data.humdata.org/dataset/estimated-population-exposed-to-earthquake-shaking',
    fields: ['district', 'zone', 'population', 'pga_value', 'severity_class', 'ocha_pcode'],
    limitations: [
      'Peak ground acceleration, not Modified Mercalli intensity: PGA and MMI are different measures and the two must not be plotted on one scale.',
      'District population is a pre-event estimate, so "exposed" means resident in a district with that PGA, not present at the moment of shaking.',
      'Covers 66 districts, not all 75: districts OCHA judged unaffected are absent, and absence is not a zero.',
      'A district-level figure cannot say where inside a district the exposed people were.',
    ],
  });

  const raw = await fetchRaw('ocha-pga-affected-districts.csv', CSV_URL, { force });
  const { rows } = parseCsv(new TextDecoder().decode(raw.bytes));
  const log = createQualityLog(record.id);

  /* The verified crosswalk decides what a district name means here too. */
  let canonicalKeys = null;
  try {
    const file = JSON.parse(
      await readFile(path.join(PROCESSED, 'nepal-district-name-crosswalk.json'), 'utf8'),
    );
    canonicalKeys = [...new Set(file.data.entries.map((entry) => entry.joinKey).filter(Boolean))];
  } catch {
    canonicalKeys = null;
  }
  const unresolved = [];

  const districts = [];
  const seen = new Set();
  let repaired = 0;
  for (const row of rows) {
    log.readRecord();
    const name = row.district;
    if (!name) {
      log.drop(Issue.MISSING_VALUE, 'row has no district name', JSON.stringify(row).slice(0, 80));
      continue;
    }
    const key = normaliseDistrict(name);
    if (seen.has(key)) {
      log.drop(Issue.DUPLICATE_RECORD, `district "${name}" appears twice`, name);
      continue;
    }
    const population = parseNumber(row.population);
    if (population.value === null) {
      log.drop(Issue.UNPARSEABLE_NUMBER, `population "${row.population}" for ${name}`, name);
      continue;
    }
    if (population.repaired) {
      repaired += 1;
      log.repair(`population ${population.reason} for ${name}`, row.population);
    }
    const pga = parseNumber(row.pga_value);
    if (pga.value === null) {
      log.note(Issue.MISSING_VALUE, `no PGA for ${name}; stored as null`, name);
    } else if (pga.value < 0 || pga.value > 2) {
      /* PGA is expressed in g. Above ~2 g is beyond anything recorded here. */
      log.drop(Issue.INVALID_COORDINATE, `PGA ${pga.value} g is outside the physical range for ${name}`, name);
      continue;
    }
    /*
     * OCHA spells these districts its own way. Resolving them is a matched
     * transliteration with its edit distance recorded, never a hand-written
     * table, and a name that cannot be resolved unambiguously stays
     * unresolved rather than being snapped to its nearest neighbour.
     */
    const resolution = canonicalKeys
      ? resolveName(key, canonicalKeys)
      : { matched: null, distance: null, reason: 'no crosswalk available' };
    if (canonicalKeys && !resolution.matched) {
      unresolved.push({ district: name, reason: resolution.reason });
      log.note(
        Issue.UNEXPECTED_CATEGORY,
        `district "${name}" does not resolve to a boundary polygon: ${resolution.reason}`,
        name,
      );
    } else if (resolution.distance > 0) {
      log.note(
        Issue.REPAIRED,
        `district "${name}" resolved to "${resolution.matched}" (${resolution.distance} edit(s))`,
        name,
      );
    }
    seen.add(key);
    districts.push({
      district: name,
      districtKey: key,
      /** The key every downstream join must use. */
      joinKey: resolution.matched,
      joinDistance: resolution.distance,
      joinBasis: resolution.reason,
      zone: row.zone ?? null,
      population: population.value,
      pgaG: pga.value,
      severityClass: row.severity_class ?? null,
      ochaPcode: row.ocha_pcode ?? null,
      joinsToBoundary: Boolean(resolution.matched),
    });
    log.keptRecord();
  }

  const quality = log.summary();
  const totalPopulation = districts.reduce((sum, d) => sum + d.population, 0);
  const joined = districts.filter((d) => d.joinsToBoundary).length;
  const validation = {
    districtRows: districts.length,
    expectedRows: 66,
    totalPopulationAcrossListedDistricts: totalPopulation,
    thousandsSeparatorsRepaired: repaired,
    pgaRange: [
      Math.min(...districts.map((d) => d.pgaG ?? Infinity)),
      Math.max(...districts.map((d) => d.pgaG ?? -Infinity)),
    ],
    severityClasses: [...new Set(districts.map((d) => d.severityClass))],
    joinsToVerifiedBoundary: joined,
    joinedExactly: districts.filter((d) => d.joinDistance === 0).length,
    joinedByTransliteration: districts
      .filter((d) => d.joinKey && d.joinDistance > 0)
      .map((d) => `${d.district} -> ${d.joinKey} (${d.joinDistance} edit(s))`),
    unjoinable: unresolved,
    unjoinableNote:
      'Four districts have no boundary polygon to join to, for three different reasons, none of which is a spelling problem: the polygon labelled "Jajarkot" is actually Dailekh so Jajarkot is absent; Nawalparasi and Rukum were each split into two units after 2015 and no single polygon represents the 2015 district; Rupandehi is simply missing from the source file. Aggregating the post-2015 halves back into their 2015 districts is an analysis decision with its own arithmetic and is not done here.',
    populationInJoinableDistricts: districts
      .filter((d) => d.joinsToBoundary)
      .reduce((sum, d) => sum + d.population, 0),
  };

  const artefact = buildArtefact({
    record,
    quality,
    validation,
    dataClass: DataClass.OFFICIAL,
    lineage: createLineage(record.id, [
      { step: 'SOURCE', detail: `OCHA on HDX, ${CSV_URL}` },
      { step: 'RAW', detail: `CSV ${formatBytes(raw.bytes.length)}, sha256 ${raw.sha256.slice(0, 16)}` },
      { step: 'READER', detail: 'RFC 4180 parser; quoted fields containing the delimiter preserved' },
      { step: 'VALIDATE', detail: 'population parseable, PGA within 0-2 g, district unique' },
      { step: 'RESOLVE', detail: 'district names matched to the verified boundary crosswalk by bounded edit distance; ambiguous or distant names left unresolved rather than snapped to a neighbour' },
      { step: 'PROCESS', detail: `${repaired} population values carried a thousands separator and were repaired; each repair is logged` },
      { step: 'ARTEFACT', detail: 'data/processed/nepal-2015-ocha-district-exposure.json' },
    ]),
    data: { districts },
  });

  const written = await writeProcessed('nepal-2015-ocha-district-exposure.json', artefact);
  await writeRegistry(record);
  await writeReport(`${record.id}.quality.txt`, formatQualitySummary(quality));
  return { record, quality, validation, written };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await ingestOchaExposure({ force: process.argv.includes('--force') });
  console.log(formatQualitySummary(result.quality));
  console.log(JSON.stringify(result.validation, null, 1));
  console.log(`artefact ${result.written.path} (${formatBytes(result.written.bytes)})`);
}
