/**
 * UNOSAT / Copernicus EMSR125 / NGA damage package -> processed damage layers.
 *
 *   SOURCE    EQ20150425NPL_shp.zip, published by UNOSAT on HDX
 *      |      CC BY-NC-SA 3.0 (from HDX `license_other`, NOT the "Other"
 *      |      shown in `license_title` — see the registry record)
 *   RAW       3.68 MB zip, 29 shapefile layers, two coordinate systems
 *      |
 *   READER    zip -> .shp geometry + .dbf attributes + .prj CRS
 *      |
 *   VALIDATE  geometry non-degenerate, coordinates finite, inside Nepal after
 *             reprojection, duplicates keyed on rounded geometry
 *      |
 *   PROCESS   NGA layers reprojected EPSG:32645 -> EPSG:4326; damage classes
 *             kept in each producer's OWN vocabulary, never merged
 *      |
 *   ARTEFACT  four files under data/processed/
 *      |
 *   ANALYSIS  damage distribution, road disruption, accessibility (later)
 *
 * The one thing this script deliberately does NOT do is harmonise UNOSAT's
 * damage classes with Copernicus's grading. "Severe Damage" and "Completely
 * Destroyed" come from different interpreters reading different imagery to
 * different specifications. Merging them into one scale here would bury an
 * arguable decision inside an ingest step; it belongs in the analysis, stated
 * and defensible.
 */

import { DataClass, Redistribution, createDatasetRecord, createLineage } from '../../src/nepal/registry.js';
import { Issue, createQualityLog, formatQualitySummary } from '../../src/nepal/quality.js';
import { geometryKey, validateGeometry } from '../../src/nepal/geo/geometry.js';
import { geometryFromUtm } from '../../src/nepal/geo/crs.js';
import { readDbf } from '../../src/nepal/io/dbf.js';
import { readPrj, readShp } from '../../src/nepal/io/shapefile.js';
import { listZipEntries, readZipEntry } from '../../src/nepal/io/zip.js';
import { buildArtefact } from '../lib/artefact.mjs';
import { fetchRaw, formatBytes, writeProcessed, writeRegistry, writeReport } from '../lib/io.mjs';

const SOURCE_URL = 'https://cern.ch/unosat-maps/NP/EQ20150425NPL/EQ20150425NPL_shp.zip';
const HDX_PAGE =
  'https://data.humdata.org/dataset/geodata-of-damage-assessment-of-bhaktapur-kathmandu-valley-nepal-april-30-2015';
const RETRIEVED_AT = '2026-09-21';

/** Read one layer out of the archive: geometry, attributes and declared CRS. */
async function readLayer(zipBytes, entries, shpName) {
  const stem = shpName.slice(0, -4);
  const find = (suffix) => entries.find((entry) => entry.name === `${stem}${suffix}`);
  const shpEntry = entries.find((entry) => entry.name === shpName);
  if (!shpEntry) throw new Error(`Layer ${shpName} is not in the archive.`);
  const shp = readShp(await readZipEntry(zipBytes, shpEntry));
  const dbfEntry = find('.dbf');
  const dbf = dbfEntry ? readDbf(await readZipEntry(zipBytes, dbfEntry)) : { rows: [], fields: [] };
  const prjEntry = find('.prj');
  const prj = prjEntry
    ? readPrj(new TextDecoder().decode(await readZipEntry(zipBytes, prjEntry)))
    : { kind: 'unknown', epsg: null };
  return { shp, dbf, prj, name: shpName };
}

/**
 * Turn one layer into validated GeoJSON features.
 *
 * Reprojects when the layer's own .prj says UTM, which is how the NGA layers
 * are stored. Trusting the package's dominant CRS instead would put 179
 * blocked roads in the Gulf of Guinea.
 */
function toFeatures(layer, log, { keep }) {
  const features = [];
  const seen = new Set();
  const utm = layer.prj.kind === 'projected' && layer.prj.projection === 'UTM';
  for (let i = 0; i < layer.shp.geometries.length; i += 1) {
    log.readRecord();
    let geometry = layer.shp.geometries[i];
    const attributes = layer.dbf.rows[i] ?? {};
    if (!geometry) {
      log.drop(Issue.INVALID_GEOMETRY, `${layer.name}: null shape`, i);
      continue;
    }
    if (utm) {
      geometry = geometryFromUtm(geometry, layer.prj.zone, layer.prj.north);
    }
    const check = validateGeometry(geometry);
    if (!check.ok) {
      log.drop(check.code, `${layer.name}: ${check.reason}`, i);
      continue;
    }
    const key = geometryKey(geometry);
    if (seen.has(key)) {
      log.drop(Issue.DUPLICATE_RECORD, `${layer.name}: identical geometry already present`, i);
      continue;
    }
    seen.add(key);
    features.push({ type: 'Feature', geometry, properties: keep(attributes, log, i) });
    log.keptRecord();
  }
  return features;
}

/** Round coordinates to ~1 m so the committed artefacts stay small. */
function roundGeometry(geometry, decimals = 5) {
  const round = (value) => Number(value.toFixed(decimals));
  const walk = (coordinates) =>
    typeof coordinates[0] === 'number'
      ? [round(coordinates[0]), round(coordinates[1])]
      : coordinates.map(walk);
  return { type: geometry.type, coordinates: walk(geometry.coordinates) };
}

/**
 * Pack point features into parallel arrays with dictionaries for the repeated
 * strings. Lossless for the fields the analysis reads.
 */
function toColumnar(features) {
  const gradings = [];
  const aois = [];
  const index = (list, value) => {
    const key = value ?? '(empty)';
    let at = list.indexOf(key);
    if (at < 0) {
      at = list.length;
      list.push(key);
    }
    return at;
  };
  const lon = [];
  const lat = [];
  const grading = [];
  const aoi = [];
  for (const feature of features) {
    lon.push(feature.geometry.coordinates[0]);
    lat.push(feature.geometry.coordinates[1]);
    grading.push(index(gradings, feature.properties.grading));
    aoi.push(index(aois, feature.properties.aoiName));
  }
  return {
    encoding: 'columnar',
    count: features.length,
    gradingValues: gradings,
    aoiValues: aois,
    lon,
    lat,
    grading,
    aoi,
  };
}

function tally(features, field) {
  const counts = new Map();
  for (const feature of features) {
    const value = feature.properties[field] ?? '(empty)';
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]));
}

export async function ingestUnosatDamage({ force = false } = {}) {
  const base = {
    publisher: 'UNITAR/UNOSAT (package), with Copernicus EMS and NGA products inside it',
    sourceUrl: SOURCE_URL,
    /*
     * The licence that matters, and the reason this project checks
     * `license_other` rather than `license_title`: HDX shows "Other" in the
     * title field, and the real terms — NonCommercial and ShareAlike — are in
     * the field beside it. Registering the placeholder would have let this
     * repository redistribute NC data believing it was open.
     */
    license: 'CC BY-NC-SA 3.0 (HDX license_other for this dataset)',
    redistribution: Redistribution.NON_COMMERCIAL,
    attribution: 'UNITAR/UNOSAT; Copernicus EMS (EMSR125); U.S. NGA',
    retrievedAt: RETRIEVED_AT,
    originalFormat: 'ESRI Shapefile inside a zip archive',
    temporalCoverage: '2015-04-26 to 2015-05-08 (sensor and production dates)',
    geographicCoverage: 'Kathmandu valley, Gorkha and seven other areas of interest in central Nepal',
    discoveredVia: HDX_PAGE,
    retrievalNote:
      'One archive serves several HDX dataset pages (Sankhu, Bhaktapur); they all point at the same EQ20150425NPL_shp.zip.',
  };

  const raw = await fetchRaw('EQ20150425NPL_shp.zip', SOURCE_URL, { force });
  const entries = listZipEntries(raw.bytes);
  const shpNames = entries.filter((entry) => entry.name.endsWith('.shp')).map((entry) => entry.name);
  const outputs = [];

  /* ---------------- 1. UNOSAT damage points ---------------- */
  {
    const record = createDatasetRecord({
      ...base,
      id: 'unosat-nepal-2015-damage-sites',
      datasetName: 'UNOSAT satellite-detected damage sites, Nepal earthquake 2015',
      coordinateSystem: 'EPSG:4326 (as published)',
      description:
        'Structures identified as damaged or destroyed by UNOSAT analysts from sub-metre commercial satellite imagery acquired between 26 April and 3 May 2015, classified into four damage categories.',
      dataClass: DataClass.OBSERVED,
      fields: ['Main_Damag', 'Grouped_Da', 'SensorDate', 'Confidence', 'FieldValid', 'Settlement'],
      limitations: [
        'Every record reads "Not yet field validated": these are remote-sensing interpretations, not ground survey.',
        'Derived from sub-metre commercial imagery that cannot itself be redistributed; only the interpreted vectors are public.',
        'Coverage is the areas UNOSAT analysed, not all of Nepal. Counts must never be extrapolated nationally.',
        'Only damage visible from directly overhead is detectable; a building with intact roof and failed walls reads as undamaged.',
      ],
    });
    const log = createQualityLog(record.id);
    const layer = await readLayer(raw.bytes, entries, 'UNOSAT_Damage_Sites.shp');
    const features = toFeatures(layer, log, {
      keep: (attributes, qlog, index) => {
        if (!attributes.Main_Damag) {
          qlog.note(Issue.MISSING_VALUE, 'damage class empty; kept as null', index);
        }
        return {
          siteId: attributes.SiteID ?? null,
          damageClass: attributes.Main_Damag ?? null,
          damageGroup: attributes.Grouped_Da ?? null,
          sensorDate: attributes.SensorDate ?? null,
          confidence: attributes.Confidence ?? null,
          fieldValidated: attributes.FieldValid ?? null,
          settlement: attributes.Settlement ?? null,
        };
      },
    });
    for (const feature of features) feature.geometry = roundGeometry(feature.geometry);
    const quality = log.summary();
    const byClass = tally(features, 'damageClass');
    const validation = {
      expected: { Destroyed: 2084, 'Severe Damage': 1347, 'Moderate Damage': 1057, 'Possible Damage': 95 },
      observed: byClass,
      matchesInventory:
        byClass.Destroyed === 2084 &&
        byClass['Severe Damage'] === 1347 &&
        byClass['Moderate Damage'] === 1057 &&
        byClass['Possible Damage'] === 95,
      totalFeatures: features.length,
      bySensorDate: tally(features, 'sensorDate'),
      byConfidence: tally(features, 'confidence'),
      fieldValidatedValues: Object.keys(tally(features, 'fieldValidated')),
    };
    outputs.push({
      file: 'nepal-2015-unosat-damage-sites.json',
      artefact: buildArtefact({
        record,
        quality,
        validation,
        dataClass: DataClass.OBSERVED,
        lineage: createLineage(record.id, [
          { step: 'SOURCE', detail: `UNOSAT activation package, ${SOURCE_URL}` },
          { step: 'RAW', detail: `zip ${formatBytes(raw.bytes.length)}, sha256 ${raw.sha256.slice(0, 16)}, ${shpNames.length} layers` },
          { step: 'READER', detail: 'zip -> UNOSAT_Damage_Sites.shp + .dbf + .prj' },
          { step: 'VALIDATE', detail: 'geometry finite and inside Nepal; duplicates keyed on 1 cm-rounded geometry' },
          { step: 'PROCESS', detail: 'already EPSG:4326; coordinates rounded to 5 decimals (~1 m); damage vocabulary left exactly as published' },
          { step: 'ARTEFACT', detail: 'data/processed/nepal-2015-unosat-damage-sites.json' },
        ]),
        data: { type: 'FeatureCollection', features },
      }),
      quality,
      validation,
    });
  }

  /* ---------------- 2. NGA observed infrastructure damage ---------------- */
  {
    const record = createDatasetRecord({
      ...base,
      id: 'nga-nepal-2015-infrastructure-damage',
      datasetName: 'NGA observed infrastructure damage, Nepal earthquake 2015',
      publisher: 'U.S. National Geospatial-Intelligence Agency, distributed in the UNOSAT package',
      coordinateSystem: 'EPSG:32645 as published; reprojected to EPSG:4326',
      description:
        'Roads observed impassable, bridges observed out, and landslide extents, produced by NGA from remote sensing on 6-7 May 2015. This is observed damage per asset, not modelled exposure.',
      dataClass: DataClass.OBSERVED,
      fields: ['Damage', 'Damage_Int', 'Production', 'Remote_Sen'],
      limitations: [
        'A single-date snapshot (6-7 May 2015), not a time series: it cannot show when a road closed or reopened.',
        'Absence of a feature is not evidence a road was open; it means no closure was observed in the imagery analysed.',
        'Road closures are line segments without an OpenStreetMap identifier, so matching them to a routable network is a spatial join with its own tolerance, not a key lookup.',
      ],
    });
    const log = createQualityLog(record.id);
    const layers = [
      ['NGA_Impassable_Roads_Nepal_May_7th_2015.shp', 'blocked-road'],
      ['NGA_Bridge_Out_Nepal_May_6th_2015.shp', 'bridge-out'],
      ['NGA_Landslides_Nepal_May_7th_2015.shp', 'landslide'],
    ];
    const collections = {};
    const crsSeen = new Set();
    for (const [name, kind] of layers) {
      const layer = await readLayer(raw.bytes, entries, name);
      crsSeen.add(`${layer.prj.kind}:${layer.prj.epsg}`);
      const features = toFeatures(layer, log, {
        keep: (attributes) => ({
          kind,
          damage: attributes.Damage ?? null,
          damageCode: attributes.Damage_Int ?? null,
          producedOn: attributes.Production ?? null,
          sensedOn: attributes.Remote_Sen ?? null,
          sourceLayer: name,
        }),
      });
      for (const feature of features) feature.geometry = roundGeometry(feature.geometry);
      collections[kind] = features;
    }
    const quality = log.summary();
    const validation = {
      expected: { 'blocked-road': 179, 'bridge-out': 5, landslide: 51 },
      observed: {
        'blocked-road': collections['blocked-road'].length,
        'bridge-out': collections['bridge-out'].length,
        landslide: collections.landslide.length,
      },
      sourceCoordinateSystems: [...crsSeen],
      reprojected: 'EPSG:32645 -> EPSG:4326',
    };
    validation.matchesInventory =
      validation.observed['blocked-road'] === 179 &&
      validation.observed['bridge-out'] === 5 &&
      validation.observed.landslide === 51;
    outputs.push({
      file: 'nepal-2015-nga-infrastructure-damage.json',
      artefact: buildArtefact({
        record,
        quality,
        validation,
        dataClass: DataClass.OBSERVED,
        lineage: createLineage(record.id, [
          { step: 'SOURCE', detail: 'NGA layers inside the UNOSAT activation package' },
          { step: 'RAW', detail: `three shapefile layers, stored in ${[...crsSeen].join(', ')}` },
          { step: 'READER', detail: 'zip -> .shp + .dbf + .prj per layer' },
          { step: 'VALIDATE', detail: 'reprojected first, then checked against the Nepal envelope — the check that catches an un-reprojected layer' },
          { step: 'PROCESS', detail: 'UTM zone 45N metres -> geographic degrees; Z ordinate discarded rather than carried as a fake elevation' },
          { step: 'ARTEFACT', detail: 'data/processed/nepal-2015-nga-infrastructure-damage.json' },
        ]),
        data: {
          blockedRoads: { type: 'FeatureCollection', features: collections['blocked-road'] },
          bridgesOut: { type: 'FeatureCollection', features: collections['bridge-out'] },
          landslides: { type: 'FeatureCollection', features: collections.landslide },
        },
      }),
      quality,
      validation,
    });
  }

  /* ---------------- 3. Copernicus EMSR125 grading ---------------- */
  {
    const record = createDatasetRecord({
      ...base,
      id: 'copernicus-emsr125-grading',
      datasetName: 'Copernicus EMS EMSR125 grading points, Nepal earthquake 2015',
      publisher: 'Copernicus Emergency Management Service, distributed in the UNOSAT package',
      coordinateSystem: 'EPSG:4326',
      description:
        'Per-settlement damage grading produced by the Copernicus EMS rapid mapping activation EMSR125 for eight areas of interest, on its own five-value grading scale.',
      dataClass: DataClass.OBSERVED,
      fields: ['grading', 'src_date', 'ext_date', 'settl_type', 'nam', 'act_id'],
      limitations: [
        'Covers eight areas of interest only. A district with no AOI has no grading, which is not the same as no damage.',
        'The grading vocabulary is Copernicus’s own and is NOT interchangeable with UNOSAT’s damage classes; the two are kept separate deliberately.',
        'Some records carry an empty, "Null" or "Not Applicable" grading; these are retained and reported rather than dropped, because dropping them would overstate the proportion of graded structures.',
      ],
    });
    const log = createQualityLog(record.id);
    /*
     * Keep only the LATEST revision of each area of interest.
     *
     * The archive ships BIDUR at both v1 and v2. Reading both mixes a
     * superseded interpretation with the one that replaced it, which inflates
     * every count for that AOI and puts two different gradings on the same
     * building. Copernicus revisions supersede; they do not accumulate.
     */
    const latestVersion = (names) => {
      const best = new Map();
      for (const name of names) {
        const match = /EMSR125_(\d+[A-Z]+)_.*_v(\d+)_/.exec(name);
        if (!match) continue;
        const [, aoi, version] = match;
        const current = best.get(aoi);
        if (!current || Number(version) > current.version) {
          best.set(aoi, { name, version: Number(version) });
        }
      }
      return best;
    };
    const allGrading = shpNames.filter((name) => name.includes('crisis_information_point_grading'));
    const allAoi = shpNames.filter((name) => name.includes('area_of_interest'));
    const gradingBest = latestVersion(allGrading);
    const gradingLayers = [...gradingBest.values()].map((item) => item.name);
    const aoiLayers = [...latestVersion(allAoi).values()].map((item) => item.name);
    const supersededLayers = allGrading.filter((name) => !gradingLayers.includes(name));
    const features = [];
    for (const name of gradingLayers) {
      const layer = await readLayer(raw.bytes, entries, name);
      const aoi = /EMSR125_(\d+)([A-Z]+)_/.exec(name);
      const produced = toFeatures(layer, log, {
        keep: (attributes) => ({
          aoiCode: aoi ? `${aoi[1]}${aoi[2]}` : null,
          aoiName: aoi ? aoi[2] : null,
          grading: attributes.grading ?? null,
          settlementType: attributes.settl_type ?? null,
          name: attributes.nam ?? null,
          sourceDate: attributes.src_date ?? null,
          extractionDate: attributes.ext_date ?? null,
          activation: attributes.act_id ?? null,
          sourceLayer: name,
        }),
      });
      for (const feature of produced) feature.geometry = roundGeometry(feature.geometry);
      features.push(...produced);
    }
    for (const name of supersededLayers) {
      log.note(
        Issue.DUPLICATE_RECORD,
        `${name}: superseded by a later revision of the same AOI and not read`,
        name,
      );
    }
    const aoiFeatures = [];
    for (const name of aoiLayers) {
      const layer = await readLayer(raw.bytes, entries, name);
      const aoi = /EMSR125_(\d+)([A-Z]+)_/.exec(name);
      const produced = toFeatures(layer, log, {
        keep: () => ({ aoiCode: aoi ? `${aoi[1]}${aoi[2]}` : null, aoiName: aoi ? aoi[2] : null, sourceLayer: name }),
      });
      for (const feature of produced) feature.geometry = roundGeometry(feature.geometry, 4);
      aoiFeatures.push(...produced);
    }
    const quality = log.summary();
    const byAoi = tally(features, 'aoiName');
    const validation = {
      gradingLayersRead: gradingLayers.length,
      supersededLayersSkipped: supersededLayers,
      aoiLayersRead: aoiLayers.length,
      distinctAoIs: Object.keys(byAoi).length,
      byAoi,
      byGrading: tally(features, 'grading'),
      /*
       * The PHASE 1 inventory counted raw DBF rows: 543 / 216 / 183. This
       * pipeline deduplicates on geometry first, so "Negligible to slight
       * damage" comes back as 540. The three-record difference is three
       * grading points digitised twice at the same location, and it is
       * recorded here rather than left as an unexplained disagreement
       * between the inventory and the artefact.
       */
      kathmanduRawRowsInInventory: { 'Negligible to slight damage': 543, 'Not Affected': 216, 'Completely Destroyed': 183 },
      kathmanduObserved: tally(
        features.filter((feature) => feature.properties.aoiName === 'KATHMANDU'),
        'grading',
      ),
      kathmanduDeduplicationNote:
        'Three "Negligible to slight damage" records share a location with another record and were dropped as duplicates (543 raw rows -> 540 distinct points).',
      gradingVocabularyIsHeterogeneous:
        'Some AOIs label the same categories with an EMS-98 grade suffix ("Completely Destroyed (EMS-98 grade 5)"). The values are left exactly as published; reconciling them is an analysis decision, not an ingest one.',
    };
    outputs.push({
      file: 'nepal-2015-copernicus-grading.json',
      artefact: buildArtefact({
        record,
        quality,
        validation,
        dataClass: DataClass.OBSERVED,
        lineage: createLineage(record.id, [
          { step: 'SOURCE', detail: 'Copernicus EMS EMSR125 grading layers inside the UNOSAT package' },
          { step: 'RAW', detail: `${gradingLayers.length} grading layers (latest revision per AOI; ${supersededLayers.length} superseded layer(s) skipped), ${aoiLayers.length} area-of-interest layers` },
          { step: 'READER', detail: 'zip -> .shp + .dbf + .prj per layer' },
          { step: 'VALIDATE', detail: 'geometry checked; empty and Null gradings retained and counted' },
          { step: 'PROCESS', detail: 'AOI code parsed from the layer name; grading vocabulary left exactly as published; points packed columnar with string dictionaries' },
          { step: 'ARTEFACT', detail: 'data/processed/nepal-2015-copernicus-grading.json' },
        ]),
        data: {
          /*
           * Columnar rather than GeoJSON features. 45,000 points with six
           * repeated property names each cost 24 MB of mostly key text; the
           * same values as parallel arrays with two small dictionaries cost
           * about a twentieth of that and are losslessly reconstructable.
           * The frontend expands them once on load.
           */
          grading: toColumnar(features),
          areasOfInterest: { type: 'FeatureCollection', features: aoiFeatures },
        },
      }),
      quality,
      validation,
    });
  }

  const written = [];
  for (const output of outputs) {
    written.push({
      ...(await writeProcessed(output.file, output.artefact)),
      id: output.artefact.source.datasetId,
      validation: output.validation,
      quality: output.quality,
    });
    /*
     * `writeRegistry` files a record under `record.id`, and the artefact's
     * source block calls that same field `datasetId`. Passing the source block
     * straight through therefore wrote every record in this package to
     * `registry/undefined.json`, each overwriting the last, so only the final
     * layer's provenance survived. The id is restored explicitly.
     */
    await writeRegistry({
      id: output.artefact.source.datasetId,
      ...output.artefact.source,
      limitations: output.artefact.limitations,
    });
    await writeReport(`${output.artefact.source.datasetId}.quality.txt`, formatQualitySummary(output.quality));
  }
  return { written, layersInArchive: shpNames.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await ingestUnosatDamage({ force: process.argv.includes('--force') });
  console.log(`archive contains ${result.layersInArchive} shapefile layers\n`);
  for (const item of result.written) {
    console.log(`${item.id}  ->  ${formatBytes(item.bytes)}`);
    console.log(formatQualitySummary(item.quality).split('\n').map((l) => `  ${l}`).join('\n'));
    console.log(`  validation: ${JSON.stringify(item.validation.matchesInventory ?? item.validation.byGrading ?? item.validation)}`.slice(0, 300));
    console.log('');
  }
}
