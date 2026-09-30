/**
 * Nepal's official health-facility list, as distributed before the earthquake.
 *
 *   SOURCE   HDX `nepal-health-facilities-cod` (OCHA Nepal): the Department of
 *            Health Services / WHO facility layer, npl_hltfac_DoH_WHO
 *   RAW      240 KB zip: shapefile + ESRI metadata
 *   READER   zip -> .shp points + .dbf attributes (src/nepal/io)
 *   VALIDATE inside Nepal; facility type from a known vocabulary (typos
 *            repaired, place names in the type field refused); exact
 *            duplicates (same type, VDC and position) removed and counted
 *   PROCESS  each facility gets a service tier; positions shared by several
 *            facilities are flagged as approximate
 *   ARTEFACT data/processed/nepal-2010-health-facilities-dohs.json
 *   ANALYSIS pipelines/analyse/health-access.mjs, as the national cross-check
 *
 * THE DATE IS 2010, NOT 2015. HDX dates the dataset 2015-01-01, but the ESRI
 * metadata inside the archive records the file's creation — a projection from
 * Nepal Modified UTM (Everest 1830) to WGS 84 — on 2010-09-21. It is therefore
 * the facility list as compiled by 2010: the most recent OFFICIAL
 * pre-earthquake inventory found, and five years older than the event. The
 * artefact says so in its own header.
 *
 * NEARLY HALF THE ROWS ARE DUPLICATES. Of 8,975 records, 4,268 repeat an
 * earlier record's type, VDC and position exactly — twelve "Hospital" rows in
 * Triyuga municipality are one point. Read naively the file claims 145
 * hospitals; deduplicated it holds 67, plus 9 zonal, 7 central and 7 private.
 * Once duplicates are removed no two facilities share a position. How close
 * each position is to the building is not documented; the access analysis
 * measures it against OpenStreetMap's 2015 positions rather than assuming.
 */

import { DataClass, Redistribution, createDatasetRecord, createLineage } from '../../src/nepal/registry.js';
import { Issue, createQualityLog, formatQualitySummary } from '../../src/nepal/quality.js';
import { readDbf } from '../../src/nepal/io/dbf.js';
import { readShp } from '../../src/nepal/io/shapefile.js';
import { listZipEntries, readZipEntry } from '../../src/nepal/io/zip.js';
import { normaliseFacilityType } from '../../src/nepal/access/facilities.js';
import { buildArtefact } from '../lib/artefact.mjs';
import { fetchRaw, formatBytes, writeProcessed, writeRegistry, writeReport } from '../lib/io.mjs';

const SOURCE_URL =
  'https://data.humdata.org/dataset/67f46fa4-35c1-467f-8e8d-7c10d3d1b055/resource/0a299d32-829b-46d0-9abf-a2daa2553d9a/download/npl-hltfac-doh-who-wgs84.zip';
const HDX_PAGE = 'https://data.humdata.org/dataset/nepal-health-facilities-cod';
const RETRIEVED_AT = '2026-09-29';
const NEPAL_BBOX = [80.0, 26.3, 88.3, 30.5];

export async function ingestHealthFacilitiesDohs({ force = false } = {}) {
  const record = createDatasetRecord({
    id: 'dohs-who-nepal-health-facilities',
    datasetName: 'Nepal health facilities (npl_hltfac_DoH_WHO_wgs84)',
    publisher:
      'Department of Health Services (Government of Nepal) and WHO, with the Survey Department of Nepal; distributed by OCHA Nepal as a Common Operational Dataset on HDX',
    sourceUrl: SOURCE_URL,
    license:
      'HumanitarianResponse.info legacy Terms of Use, as carried by HDX for datasets migrated from the COD registry: download and copying for non-commercial use without any right to resell; compilations and derivative works must credit the source',
    redistribution: Redistribution.NON_COMMERCIAL,
    retrievedAt: RETRIEVED_AT,
    originalFormat: 'ESRI Shapefile (points, WGS 84) in a zip, with ESRI XML metadata',
    temporalCoverage:
      'Compiled by 2010: file created 2010-09-21 according to its embedded metadata. HDX lists a dataset date of 2015-01-01. Pre-earthquake.',
    geographicCoverage: 'Nepal, national',
    coordinateSystem: 'EPSG:4326',
    description:
      'Point locations of government health facilities by type (hospital, primary health centre, health post, sub health post and administrative health offices), with district and Village Development Committee. No facility names, no identifiers (the ID field is 0 throughout), no services and no capacity.',
    dataClass: DataClass.OFFICIAL,
    attribution:
      'Department of Health Services, Government of Nepal / WHO; Survey Department of Nepal; distributed by OCHA Nepal via HDX',
    discoveredVia: HDX_PAGE,
    retrievalNote:
      'Licence text read from HDX’s legacy HumanitarianResponse.info licence page as indexed on 2026-09-29; the page itself returns HTTP 403 to this environment and the Wayback Machine is blocked by its egress policy.',
    fields: ['HF_TYPE', 'DIST_NAME', 'VDC_NAME1', 'VDC_CODE1', 'geometry'],
    limitations: [
      'Five years older than the earthquake. Facilities opened or closed between 2010 and April 2015 are not reflected.',
      'Positional accuracy is not documented. 4,268 of 8,975 rows are exact duplicates and are removed (and 11 have no usable type); the remaining positions are checked against OpenStreetMap in the access analysis rather than assumed exact.',
      'No names, no identifiers, no services, no staffing, no bed counts. Nothing about capacity can be said from this source, and nothing is.',
      'Government facilities only; private clinics and NGO facilities are largely absent.',
    ],
  });

  const raw = await fetchRaw('npl-hltfac-doh-who-wgs84.zip', SOURCE_URL, { force });
  const entries = listZipEntries(raw.bytes);
  const read = async (suffix) => {
    const entry = entries.find((item) => item.name.toLowerCase().endsWith(suffix));
    if (!entry) throw new Error(`The archive has no ${suffix} member.`);
    return readZipEntry(raw.bytes, entry);
  };
  const shp = readShp(await read('.shp'));
  const dbf = readDbf(await read('.dbf'));
  const metadata = new TextDecoder().decode(await read('.shp.xml'));
  const created = metadata.match(/<CreaDate>(\d{8})<\/CreaDate>/)?.[1] ?? null;
  const rows = dbf.rows ?? dbf.records ?? [];
  if (rows.length !== shp.geometries.length) {
    throw new Error(`Attribute rows (${rows.length}) and points (${shp.geometries.length}) disagree.`);
  }

  const log = createQualityLog(record.id);
  const seen = new Set();
  const kept = [];
  const repaired = {};
  let duplicates = 0;
  rows.forEach((row, i) => {
    log.readRecord();
    const geometry = shp.geometries[i];
    const [lon, lat] = geometry?.coordinates ?? [];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      log.drop(Issue.MISSING_COORDINATE, `row ${i}: no point`, i);
      return;
    }
    if (lon < NEPAL_BBOX[0] || lon > NEPAL_BBOX[2] || lat < NEPAL_BBOX[1] || lat > NEPAL_BBOX[3]) {
      log.drop(Issue.OUT_OF_STUDY_AREA, `row ${i}: ${lon},${lat} is outside Nepal`, i);
      return;
    }
    const type = normaliseFacilityType(row.HF_TYPE);
    if (!type.ok) {
      log.drop(type.issue === 'missing' ? Issue.MISSING_VALUE : Issue.UNEXPECTED_CATEGORY, `row ${i}: type "${row.HF_TYPE}"`, i);
      return;
    }
    if (type.repairedFrom) {
      repaired[type.repairedFrom] = type.type;
      log.repair(`row ${i}: "${type.repairedFrom}" read as "${type.type}"`, i);
    }
    const position = [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
    const dedupe = `${type.type}|${row.VDC_CODE1}|${position.join(',')}`;
    if (seen.has(dedupe)) {
      duplicates += 1;
      log.drop(Issue.DUPLICATE_RECORD, `row ${i}: same type, VDC and position as an earlier row`, i);
      return;
    }
    seen.add(dedupe);
    log.keptRecord();
    kept.push({
      type: type.type,
      tier: type.tier,
      district: String(row.DIST_NAME ?? '').trim() || null,
      vdc: String(row.VDC_NAME1 ?? '').trim() || null,
      vdcCode: String(row.VDC_CODE1 ?? '').trim() || null,
      lon: position[0],
      lat: position[1],
    });
  });

  /* How many kept facilities share their exact position with another. */
  const atPosition = new Map();
  for (const facility of kept) {
    const k = `${facility.lon},${facility.lat}`;
    atPosition.set(k, (atPosition.get(k) ?? 0) + 1);
  }
  const facilities = kept.map((facility, index) => ({ id: `dohs-${index}`, ...facility }));

  const byType = {};
  const byTier = {};
  for (const facility of facilities) {
    byType[facility.type] = (byType[facility.type] ?? 0) + 1;
    byTier[facility.tier] = (byTier[facility.tier] ?? 0) + 1;
  }
  const approximate = [...atPosition.values()].filter((n) => n > 1).reduce((sum, n) => sum + n, 0);
  const quality = log.summary();
  const validation = {
    metadataCreationDate: created ? `${created.slice(0, 4)}-${created.slice(4, 6)}-${created.slice(6, 8)}` : null,
    recordsRead: rows.length,
    facilitiesKept: facilities.length,
    exactDuplicatesRemoved: duplicates,
    byType,
    byTier,
    typeRepairs: repaired,
    positionsDistinct: atPosition.size,
    facilitiesOnSharedPositions: approximate,
    shareOnSharedPositionsPercent: Number(((approximate / facilities.length) * 100).toFixed(1)),
    sha256: raw.sha256,
  };

  const lineage = createLineage(record.id, [
    { step: 'SOURCE', detail: `${HDX_PAGE} → ${SOURCE_URL}` },
    { step: 'RAW', detail: `${formatBytes(raw.bytes.length)} zip, sha256 ${raw.sha256}` },
    { step: 'VALIDATE', detail: 'position inside Nepal; type from the known vocabulary; exact duplicates removed' },
    { step: 'PROCESS', detail: 'service tier assigned; shared positions flagged approximate' },
  ]);
  const artefact = buildArtefact({
    record,
    lineage,
    quality,
    dataClass: DataClass.OFFICIAL,
    validation,
    data: { facilities },
  });
  await writeRegistry(record);
  const written = await writeProcessed('nepal-2010-health-facilities-dohs.json', artefact);
  await writeReport(`${record.id}.quality.txt`, `${record.datasetName}\n\n${formatQualitySummary(quality)}\n\n${JSON.stringify(validation, null, 1)}`);
  return { validation, written };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { validation, written } = await ingestHealthFacilitiesDohs({ force: process.argv.includes('--force') });
  console.log(JSON.stringify(validation, null, 1));
  console.log(`${written.path} ${formatBytes(written.bytes)}`);
}
