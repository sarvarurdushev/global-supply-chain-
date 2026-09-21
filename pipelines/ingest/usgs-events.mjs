/**
 * USGS earthquake events -> processed seismic dataset.
 *
 *   SOURCE   USGS FDSN event service (US public domain)
 *      |
 *   RAW      GeoJSON FeatureCollection, as served
 *      |
 *   READER   JSON
 *      |
 *   VALIDATE finite coordinates, inside the study area, magnitude present,
 *            timestamp parseable, no duplicate event ids
 *      |
 *   PROCESS  keep the fields the analysis uses; derive hours-since-mainshock
 *            and distance from the epicentre in UTM 45N metres
 *      |
 *   ARTEFACT data/processed/nepal-2015-seismic.json
 *      |
 *   ANALYSIS magnitude, depth and temporal distributions (a later stage)
 *
 * Nothing here computes a distribution. Ingestion produces clean records; the
 * analysis stage reads them. Mixing the two is how a "cleaning" step quietly
 * becomes a modelling step nobody documented.
 */

import { DataClass, Redistribution, createDatasetRecord, createLineage } from '../../src/nepal/registry.js';
import { Issue, createQualityLog, formatQualitySummary } from '../../src/nepal/quality.js';
import { NEPAL_BBOX, insideBbox, validatePosition } from '../../src/nepal/geo/geometry.js';
import { distanceMetres } from '../../src/nepal/geo/crs.js';
import { buildArtefact } from '../lib/artefact.mjs';
import { fetchRaw, formatBytes, writeProcessed, writeRegistry, writeReport } from '../lib/io.mjs';

/** The main shock, as USGS identifies it. */
const MAIN_EVENT_ID = 'us20002926';
/**
 * Search geometry. 300 km around the epicentre and one year forward is the
 * window used in the PHASE 1 probe that measured 316 events at M>=2.5, so the
 * artefact is comparable with the figure already recorded in the inventory.
 */
const SEARCH = Object.freeze({
  latitude: 28.147,
  longitude: 84.708,
  maxradiuskm: 300,
  starttime: '2015-04-25',
  endtime: '2016-04-25',
  minmagnitude: 2.5,
});

const RETRIEVED_AT = '2026-09-21';

export async function ingestUsgsEvents({ force = false } = {}) {
  const query =
    'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson' +
    `&starttime=${SEARCH.starttime}&endtime=${SEARCH.endtime}` +
    `&latitude=${SEARCH.latitude}&longitude=${SEARCH.longitude}` +
    `&maxradiuskm=${SEARCH.maxradiuskm}&minmagnitude=${SEARCH.minmagnitude}` +
    '&orderby=time-asc';

  const record = createDatasetRecord({
    id: 'usgs-nepal-2015-seismic',
    datasetName: 'USGS FDSN event query — Nepal 2015 sequence',
    publisher: 'U.S. Geological Survey, Earthquake Hazards Program',
    sourceUrl: query,
    license: 'US Government public domain (17 U.S.C. §105)',
    redistribution: Redistribution.OPEN,
    retrievedAt: RETRIEVED_AT,
    originalFormat: 'GeoJSON FeatureCollection',
    temporalCoverage: `${SEARCH.starttime} to ${SEARCH.endtime}`,
    geographicCoverage: `${SEARCH.maxradiuskm} km radius of ${SEARCH.latitude} N, ${SEARCH.longitude} E`,
    coordinateSystem: 'EPSG:4326',
    description:
      'Every catalogued earthquake of M2.5 or greater within 300 km of the Gorkha epicentre in the year following 25 April 2015, including the M7.8 main shock and the M7.3 of 12 May.',
    dataClass: DataClass.OBSERVED,
    attribution: 'Data courtesy of the U.S. Geological Survey',
    fields: ['id', 'time', 'longitude', 'latitude', 'depthKm', 'magnitude', 'magType', 'place'],
    limitations: [
      'Catalogue completeness falls off below about M4 in the days right after the main shock, when small events are masked by the coda of larger ones. Counts of small aftershocks are therefore a lower bound.',
      'Depths for shallow continental events carry uncertainties of several kilometres and some are fixed by the analyst rather than solved.',
    ],
  });

  const raw = await fetchRaw('usgs-nepal-2015.geojson', query, { force });
  const payload = JSON.parse(new TextDecoder().decode(raw.bytes));
  const log = createQualityLog(record.id);

  const seen = new Set();
  const events = [];
  let mainShock = null;

  for (const feature of payload.features ?? []) {
    log.readRecord();
    const id = feature?.id ?? null;
    const properties = feature?.properties ?? {};
    const coordinates = feature?.geometry?.coordinates ?? null;

    if (!id) {
      log.drop(Issue.MISSING_VALUE, 'feature has no event id', properties.place ?? '(no place)');
      continue;
    }
    if (seen.has(id)) {
      log.drop(Issue.DUPLICATE_RECORD, 'event id appears twice in one response', id);
      continue;
    }
    if (!Array.isArray(coordinates)) {
      log.drop(Issue.MISSING_COORDINATE, 'feature has no geometry', id);
      continue;
    }
    const position = [coordinates[0], coordinates[1]];
    const check = validatePosition(position);
    if (!check.ok) {
      log.drop(check.code, check.reason, id);
      continue;
    }
    if (!insideBbox(position, NEPAL_BBOX)) {
      /*
       * A 300 km radius reaches into India, Tibet and Bangladesh. Those are
       * real events, not errors, so they are NOTED and kept: clipping the
       * catalogue to a national border would distort the spatial
       * distribution of an aftershock sequence that does not respect one.
       */
      log.note(Issue.OUT_OF_STUDY_AREA, 'outside the Nepal envelope but inside the search radius; kept', id);
    }
    const magnitude = Number(properties.mag);
    if (!Number.isFinite(magnitude)) {
      log.drop(Issue.MISSING_VALUE, 'event has no magnitude', id);
      continue;
    }
    const time = Number(properties.time);
    if (!Number.isFinite(time) || time <= 0) {
      log.drop(Issue.INVALID_TIMESTAMP, 'event has no usable origin time', id);
      continue;
    }
    const depthKm = Number(coordinates[2]);
    if (!Number.isFinite(depthKm)) {
      /* Kept with an explicit null: a missing depth is not a depth of zero. */
      log.note(Issue.MISSING_VALUE, 'depth absent; stored as null rather than 0', id);
    }

    seen.add(id);
    const event = {
      id,
      time: new Date(time).toISOString(),
      timeMs: time,
      longitude: position[0],
      latitude: position[1],
      depthKm: Number.isFinite(depthKm) ? depthKm : null,
      magnitude,
      magType: properties.magType ?? null,
      place: properties.place ?? null,
      /* Present on the main shock; null on most aftershocks. */
      mmi: Number.isFinite(Number(properties.mmi)) ? Number(properties.mmi) : null,
      alert: properties.alert ?? null,
      status: properties.status ?? null,
    };
    if (id === MAIN_EVENT_ID) mainShock = event;
    events.push(event);
    log.keptRecord();
  }

  if (!mainShock) {
    throw new Error(
      `The main shock ${MAIN_EVENT_ID} is not in the response. The query window or the catalogue changed; ` +
        'do not publish a sequence that does not contain the event it is about.',
    );
  }

  /*
   * Derived per-event fields. Both are geometry, not interpretation: hours
   * from the main shock, and distance from its epicentre measured in UTM 45N
   * because a degree is not a distance.
   */
  for (const event of events) {
    event.hoursFromMainShock = Number(
      ((event.timeMs - mainShock.timeMs) / 3_600_000).toFixed(4),
    );
    event.distanceFromEpicentreKm = Number(
      (
        distanceMetres(
          mainShock.longitude,
          mainShock.latitude,
          event.longitude,
          event.latitude,
        ) / 1000
      ).toFixed(3),
    );
  }
  events.sort((a, b) => a.timeMs - b.timeMs);

  const quality = log.summary();
  const lineage = createLineage(record.id, [
    { step: 'SOURCE', detail: `USGS FDSN event service, ${SEARCH.minmagnitude}+ within ${SEARCH.maxradiuskm} km` },
    { step: 'RAW', detail: `GeoJSON FeatureCollection, ${formatBytes(raw.bytes.length)}, sha256 ${raw.sha256.slice(0, 16)}` },
    { step: 'READER', detail: 'JSON.parse; no reprojection needed (already EPSG:4326)' },
    { step: 'VALIDATE', detail: 'event id present and unique, coordinates finite and in range, magnitude finite, origin time parseable' },
    { step: 'PROCESS', detail: 'projected to EPSG:32645 to measure distance from the epicentre; hours from main shock derived' },
    { step: 'ARTEFACT', detail: 'data/processed/nepal-2015-seismic.json' },
  ]);

  /*
   * Validation of the artefact itself, not of the input: figures a reader can
   * check against the published record without running anything.
   */
  const validation = {
    mainShockMagnitude: mainShock.magnitude,
    mainShockTime: mainShock.time,
    expectedMainShock: 'M7.8 at 2015-04-25T06:11:25.950Z per the USGS event page',
    mainShockMatches:
      mainShock.magnitude === 7.8 && mainShock.time.startsWith('2015-04-25T06:11'),
    largestAftershock: events
      .filter((event) => event.id !== MAIN_EVENT_ID && event.hoursFromMainShock > 0)
      .reduce((max, event) => (event.magnitude > (max?.magnitude ?? 0) ? event : max), null),
    countAtOrAbove2_5: events.length,
  };
  if (!validation.mainShockMatches) {
    throw new Error(
      `Main shock does not match the published record: got M${mainShock.magnitude} at ${mainShock.time}.`,
    );
  }

  const artefact = buildArtefact({
    record,
    lineage,
    quality,
    dataClass: DataClass.OBSERVED,
    validation,
    limitations: [
      'Events outside Nepal are retained deliberately: an aftershock sequence does not stop at a border, and clipping would distort its spatial distribution.',
    ],
    data: {
      mainShockId: MAIN_EVENT_ID,
      search: SEARCH,
      events,
    },
  });

  const written = await writeProcessed('nepal-2015-seismic.json', artefact);
  await writeRegistry(record);
  await writeReport(`${record.id}.quality.txt`, formatQualitySummary(quality));

  return { record, quality, validation, written, count: events.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await ingestUsgsEvents({ force: process.argv.includes('--force') });
  console.log(formatQualitySummary(result.quality));
  console.log(
    `main shock M${result.validation.mainShockMagnitude} at ${result.validation.mainShockTime}`,
  );
  const largest = result.validation.largestAftershock;
  console.log(
    `largest aftershock M${largest.magnitude} at ${largest.time} (+${largest.hoursFromMainShock.toFixed(1)} h, ${largest.distanceFromEpicentreKm} km)`,
  );
  console.log(`artefact ${result.written.path} (${formatBytes(result.written.bytes)})`);
}
