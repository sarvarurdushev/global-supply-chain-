/**
 * USGS ShakeMap intensity contours -> processed shaking field.
 *
 *   SOURCE   USGS ShakeMap product for us20002926 (US public domain)
 *   RAW      cont_mmi.json, the published MMI contour set
 *   READER   JSON (GeoJSON FeatureCollection of MultiLineStrings)
 *   VALIDATE contour value present and on the MMI scale, geometry valid
 *   PROCESS  contours ordered by intensity; nothing is interpolated
 *   ARTEFACT data/processed/nepal-2015-shakemap-contours.json
 *   ANALYSIS the shaking field every exposure calculation intersects
 *
 * These are CONTOURS — lines of equal intensity — not a filled surface. The
 * distinction matters downstream: a population-exposure calculation needs
 * areas, and turning nested contour lines into bands is a processing step
 * with its own assumptions, performed in the analysis stage where it can be
 * stated, not smuggled in here.
 */

import { DataClass, Redistribution, createDatasetRecord, createLineage } from '../../src/nepal/registry.js';
import { Issue, createQualityLog, formatQualitySummary } from '../../src/nepal/quality.js';
import { validateGeometry } from '../../src/nepal/geo/geometry.js';
import { buildArtefact } from '../lib/artefact.mjs';
import { fetchRaw, formatBytes, writeProcessed, writeRegistry, writeReport } from '../lib/io.mjs';

const EVENT_URL =
  'https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=us20002926&format=geojson';
const RETRIEVED_AT = '2026-09-21';

export async function ingestShakeMap({ force = false } = {}) {
  const eventRaw = await fetchRaw('usgs-us20002926-detail.geojson', EVENT_URL, { force });
  const event = JSON.parse(new TextDecoder().decode(eventRaw.bytes));
  const contourUrl =
    event?.properties?.products?.shakemap?.[0]?.contents?.['download/cont_mmi.json']?.url ?? null;
  if (!contourUrl) {
    throw new Error('The ShakeMap product carries no cont_mmi.json for this event.');
  }

  const record = createDatasetRecord({
    id: 'usgs-nepal-2015-shakemap-contours',
    datasetName: 'USGS ShakeMap MMI contours, Gorkha earthquake 2015',
    publisher: 'U.S. Geological Survey',
    sourceUrl: contourUrl,
    license: 'US Government public domain (17 U.S.C. §105)',
    redistribution: Redistribution.OPEN,
    retrievedAt: RETRIEVED_AT,
    originalFormat: 'GeoJSON (MultiLineString contours)',
    temporalCoverage: '2015-04-25 event; ShakeMap revised after the event',
    geographicCoverage: 'Nepal and surrounding region',
    coordinateSystem: 'EPSG:4326',
    description:
      'Contours of Modified Mercalli Intensity for the M7.8 Gorkha earthquake, as modelled by USGS ShakeMap from instrumental recordings, felt reports and ground-motion prediction equations.',
    dataClass: DataClass.OBSERVED,
    attribution: 'Data courtesy of the U.S. Geological Survey',
    fields: ['value', 'units', 'geometry'],
    limitations: [
      'ShakeMap is a model constrained by observations, not a dense measurement grid. Intensity between stations is interpolated, and Nepal had few strong-motion instruments in 2015.',
      'The product is revised after an event; this is the current revision, not what responders saw on 25 April.',
      'Contours are lines of equal intensity, not filled areas. Any "population inside MMI VIII" figure requires converting them to bands first, which is a stated analysis step.',
      'MMI is a measure of shaking severity, not of damage. A building’s fate depends on its construction.',
    ],
  });

  const raw = await fetchRaw('usgs-nepal-2015-cont_mmi.json', contourUrl, { force });
  const payload = JSON.parse(new TextDecoder().decode(raw.bytes));
  const log = createQualityLog(record.id);
  const features = [];

  for (const feature of payload.features ?? []) {
    log.readRecord();
    const value = Number(feature?.properties?.value);
    if (!Number.isFinite(value)) {
      log.drop(Issue.MISSING_VALUE, 'contour has no intensity value', JSON.stringify(feature?.properties ?? {}).slice(0, 60));
      continue;
    }
    /* MMI runs I to XII. A contour outside that is not an intensity. */
    if (value < 1 || value > 12) {
      log.drop(Issue.UNEXPECTED_CATEGORY, `contour value ${value} is outside the MMI scale`, value);
      continue;
    }
    const check = validateGeometry(feature.geometry, { bbox: [70, 20, 95, 36] });
    if (!check.ok) {
      log.drop(check.code, `MMI ${value} contour: ${check.reason}`, value);
      continue;
    }
    features.push({
      type: 'Feature',
      geometry: roundGeometry(feature.geometry),
      properties: {
        mmi: value,
        units: feature.properties.units ?? 'MMI',
        colour: feature.properties.color ?? null,
      },
    });
    log.keptRecord();
  }

  features.sort((a, b) => a.properties.mmi - b.properties.mmi);
  const quality = log.summary();
  const levels = features.map((f) => f.properties.mmi);
  const validation = {
    contourCount: features.length,
    mmiLevels: [...new Set(levels)].sort((a, b) => a - b),
    maxMmiContour: Math.max(...levels),
    eventMaxMmiReported: event?.properties?.mmi ?? null,
    contourUrl,
    note:
      'The event record reports a maximum MMI slightly above the highest contour because the reported value is the peak of the modelled grid, while contours are drawn at whole and half intensities.',
  };

  const artefact = buildArtefact({
    record,
    quality,
    validation,
    dataClass: DataClass.OBSERVED,
    lineage: createLineage(record.id, [
      { step: 'SOURCE', detail: 'ShakeMap product referenced by the USGS event record, resolved at run time rather than hard-coded' },
      { step: 'RAW', detail: `${formatBytes(raw.bytes.length)}, sha256 ${raw.sha256.slice(0, 16)}` },
      { step: 'READER', detail: 'JSON.parse; already EPSG:4326' },
      { step: 'VALIDATE', detail: 'intensity present and within MMI I-XII; geometry valid within the regional envelope' },
      { step: 'PROCESS', detail: 'ordered by intensity; coordinates rounded to 4 decimals (~10 m, far finer than the model resolution)' },
      { step: 'ARTEFACT', detail: 'data/processed/nepal-2015-shakemap-contours.json' },
    ]),
    data: { type: 'FeatureCollection', features },
  });

  const written = await writeProcessed('nepal-2015-shakemap-contours.json', artefact);
  await writeRegistry(record);
  await writeReport(`${record.id}.quality.txt`, formatQualitySummary(quality));
  return { record, quality, validation, written };
}

function roundGeometry(geometry, decimals = 4) {
  const round = (v) => Number(v.toFixed(decimals));
  const walk = (c) => (typeof c[0] === 'number' ? [round(c[0]), round(c[1])] : c.map(walk));
  return { type: geometry.type, coordinates: walk(geometry.coordinates) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await ingestShakeMap({ force: process.argv.includes('--force') });
  console.log(formatQualitySummary(result.quality));
  console.log(`MMI levels: ${result.validation.mmiLevels.join(', ')}`);
  console.log(`contours: ${result.validation.contourCount} | event peak MMI: ${result.validation.eventMaxMmiReported}`);
  console.log(`artefact ${result.written.path} (${formatBytes(result.written.bytes)})`);
}
