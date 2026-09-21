/**
 * Stage 3 — seismic analysis of the 2015 Gorkha sequence.
 *
 *   INPUT    data/processed/nepal-2015-seismic.json  (316 validated events)
 *   METHOD   descriptive distributions plus two standard seismological fits
 *   OUTPUT   data/analysis/nepal-2015-seismic-analysis.json
 *   VISUAL   epicentre and aftershock map, magnitude and depth histograms,
 *            a timeline driven by the real timestamps
 *
 * Every figure in the output is computed here from the validated catalogue.
 * Nothing is carried over from a publication.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DataClass } from '../../src/nepal/registry.js';
import { createAnalysisRecord } from '../../src/nepal/analysis/methodology.js';
import { ResultClass } from '../../src/nepal/analysis/terminology.js';
import {
  completenessMagnitude,
  depthDistribution,
  gutenbergRichter,
  largestEvents,
  magnitudeDistribution,
  bValueSensitivity,
  omoriSegmented,
  reportingThreshold,
  spatialDistribution,
  temporalSeries,
} from '../../src/nepal/analysis/seismic.js';
import { PROCESSED, formatBytes, writeAnalysis } from '../lib/io.mjs';

const MAY_12_EXPECTED = { magnitude: 7.3, date: '2015-05-12' };

export async function analyseSeismic() {
  const source = JSON.parse(
    await readFile(path.join(PROCESSED, 'nepal-2015-seismic.json'), 'utf8'),
  );
  const events = source.data.events;
  const mainShock = events.find((event) => event.id === source.data.mainShockId);
  if (!mainShock) throw new Error('The processed catalogue has no main shock.');

  const aftershocks = events.filter(
    (event) => event.id !== mainShock.id && event.timeMs > mainShock.timeMs,
  );
  const foreshocks = events.filter((event) => event.timeMs < mainShock.timeMs);

  const magnitude = magnitudeDistribution(events);
  const aftershockMagnitude = magnitudeDistribution(aftershocks);
  const depth = depthDistribution(events);
  const temporal = temporalSeries(events, { mainShockMs: mainShock.timeMs });
  const completeness = completenessMagnitude(aftershocks);
  const gr = gutenbergRichter(aftershocks, { mc: completeness?.mc });
  const threshold = reportingThreshold(aftershocks);
  const sensitivity = bValueSensitivity(aftershocks);
  /*
   * The largest aftershock resets the sequence, so Omori is fitted around it
   * rather than through it. Chosen as the largest event after the main shock
   * rather than named, so the same code works for another sequence.
   */
  const largestAftershock = aftershocks.reduce(
    (max, event) => (event.magnitude > (max?.magnitude ?? -Infinity) ? event : max),
    null,
  );
  const omori = omoriSegmented(aftershocks, {
    mainShockMs: mainShock.timeMs,
    secondaryEvent: largestAftershock,
  });
  const spatial = spatialDistribution(events, { mainShockId: mainShock.id });
  const largest = largestEvents(events, 10);

  /* ---------------- validation ---------------- */

  const may12 = events.find(
    (event) =>
      event.time.startsWith(MAY_12_EXPECTED.date) && event.magnitude >= 7,
  );
  const ids = events.map((event) => event.id);
  const validation = {
    eventCount: events.length,
    expectedEventCount: 316,
    eventCountMatches: events.length === 316,
    mainShock: {
      id: mainShock.id,
      magnitude: mainShock.magnitude,
      time: mainShock.time,
      longitude: mainShock.longitude,
      latitude: mainShock.latitude,
      depthKm: mainShock.depthKm,
      matchesPublished:
        mainShock.magnitude === 7.8 && mainShock.time === '2015-04-25T06:11:25.950Z',
    },
    may12Aftershock: may12
      ? {
          id: may12.id,
          magnitude: may12.magnitude,
          time: may12.time,
          hoursFromMainShock: may12.hoursFromMainShock,
          distanceFromEpicentreKm: may12.distanceFromEpicentreKm,
          matchesExpected: may12.magnitude === MAY_12_EXPECTED.magnitude,
        }
      : null,
    duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
    /*
     * Reconciliation. Every event must land in exactly one of these three
     * groups; if the arithmetic does not close, a filter has silently eaten
     * events and every distribution below is wrong.
     */
    partition: {
      foreshocks: foreshocks.length,
      mainShock: 1,
      aftershocks: aftershocks.length,
      sum: foreshocks.length + 1 + aftershocks.length,
      reconciles: foreshocks.length + 1 + aftershocks.length === events.length,
    },
    magnitudeBandsSumToTotal:
      magnitude.bands.reduce((sum, b) => sum + b.count, 0) === events.length,
    depthAccountedFor: depth.withDepth + depth.missingDepth === events.length,
  };

  const failures = [];
  if (!validation.eventCountMatches) failures.push(`event count ${events.length} != 316`);
  if (!validation.mainShock.matchesPublished) failures.push('main shock does not match the published record');
  if (!validation.may12Aftershock?.matchesExpected) failures.push('the 12 May M7.3 aftershock is missing or of the wrong magnitude');
  if (validation.duplicateIds.length > 0) failures.push(`duplicate event ids: ${validation.duplicateIds.join(', ')}`);
  if (!validation.partition.reconciles) failures.push('foreshock/main/aftershock partition does not reconcile');
  if (!validation.magnitudeBandsSumToTotal) failures.push('magnitude bands do not sum to the event count');
  if (!validation.depthAccountedFor) failures.push('depth counts do not account for every event');
  validation.failures = failures;
  validation.passed = failures.length === 0;
  if (!validation.passed) {
    throw new Error(`Stage 3 validation failed: ${failures.join('; ')}`);
  }

  /* ---------------- methodology records ---------------- */

  const inputs = [
    { dataset: 'usgs-nepal-2015-seismic', role: 'the validated event catalogue, 316 events of M2.5+ within 300 km in the year after the main shock' },
  ];
  const records = [
    createAnalysisRecord({
      id: 'seismic-magnitude-distribution',
      name: 'Magnitude distribution of the Gorkha sequence',
      question: 'How were the magnitudes of the 2015 Nepal earthquake sequence distributed?',
      inputs,
      method: 'Events counted into fixed magnitude bands; minimum, maximum, mean and median computed over the whole catalogue and over the aftershocks alone.',
      formula: 'count(M in [min, max)) per band',
      outputs: ['count per magnitude band', 'min', 'max', 'mean', 'median'],
      visualisation: 'Histogram, with the main shock marked separately from the aftershocks.',
      resultClass: ResultClass.DESCRIPTIVE_STATISTIC.id,
      dataClass: DataClass.DERIVED,
      limitations: [
        'The catalogue is complete only above its completeness magnitude; counts in the lowest band are a lower bound, not a measurement.',
        'Band edges are a presentation choice. The underlying magnitudes are continuous and the shape of the distribution depends on where the edges fall.',
      ],
    }),
    createAnalysisRecord({
      id: 'seismic-depth-distribution',
      name: 'Depth distribution of the Gorkha sequence',
      question: 'At what depths did the 2015 Nepal earthquake sequence occur?',
      inputs,
      method: 'Events counted into seismological depth bands. Events without a reported depth are counted separately and never treated as zero.',
      outputs: ['count per depth band', 'events with depth', 'events missing depth', 'min', 'max', 'mean', 'median'],
      visualisation: 'Histogram, with a stated count of events carrying no depth.',
      resultClass: ResultClass.DESCRIPTIVE_STATISTIC.id,
      dataClass: DataClass.DERIVED,
      limitations: [
        'Depths for shallow continental earthquakes carry uncertainties of several kilometres, and some are fixed by the analyst rather than solved from the data. The distribution is coarser than its decimal places suggest.',
        'A depth band boundary is a convention, not a physical interface.',
      ],
    }),
    createAnalysisRecord({
      id: 'seismic-temporal-series',
      name: 'Temporal evolution of the sequence',
      question: 'How did seismic activity evolve in the hours, days and months after the main shock?',
      inputs,
      method: 'Events bucketed by hours from the main shock for the first three days and by days thereafter, with a running cumulative count. Bucket width changes because the rate falls by orders of magnitude over the window.',
      outputs: ['events per hour for 72 hours', 'events per day', 'cumulative count', 'first-day count', 'first-week count'],
      visualisation: 'Timeline driven by the real timestamps, with the main shock and the 12 May aftershock marked.',
      resultClass: ResultClass.DESCRIPTIVE_STATISTIC.id,
      dataClass: DataClass.DERIVED,
      limitations: [
        'Small aftershocks in the hours immediately after the main shock are masked by its coda and are missing from the catalogue, so the first buckets understate the true rate most severely.',
        'The catalogue window ends one year after the main shock; the sequence did not.',
      ],
    }),
    createAnalysisRecord({
      id: 'seismic-gutenberg-richter',
      name: 'Gutenberg-Richter b-value for the aftershock sequence',
      question: 'Does the aftershock sequence follow the standard magnitude-frequency relation, and with what b-value?',
      inputs,
      method: 'Completeness magnitude estimated by maximum curvature, then least squares on log10 of the cumulative count against magnitude, restricted to events at or above it.',
      formula: 'log10 N(>=M) = a - b*M',
      parameters: { completenessMagnitude: completeness?.mc ?? null, binWidth: 0.1 },
      parameterJustification:
        'The completeness magnitude is estimated from the catalogue itself rather than chosen, by the maximum-curvature method. The 0.1 bin width matches the precision magnitudes are reported to.',
      outputs: ['b-value', 'a-value', 'R-squared', 'completeness magnitude', 'events used'],
      visualisation: 'Log-linear plot of cumulative count against magnitude with the fitted line. The plot must be labelled as a MODEL FIT, not as observed data.',
      dataClass: DataClass.DERIVED,
      resultClass: ResultClass.MODEL_FIT.id,
      limitations: [
        'Maximum curvature returns Mc = 4.0 for this catalogue, but the magnitude histogram has a cliff at exactly M4.0 — 41 events at 4.0 against 2 at 3.9 — which is the signature of a REPORTING threshold, not a detection limit. The true completeness is higher, so the b fitted at 4.0 is probably biased.',
        'Because of that, b is reported across a range of plausible completeness cuts as well as at the estimated Mc. The spread across those cuts is the honest uncertainty; a single value to three decimals is false precision.',
        'The R-squared describes the quality of the line fit, not a confidence interval on b, which is not computed here.',
        'b is a property of the catalogue as recorded, not of the crust alone.',
      ],
    }),
    createAnalysisRecord({
      id: 'seismic-omori-decay',
      name: 'Omori decay of the aftershock rate',
      question: 'How quickly did the aftershock rate decay after the main shock?',
      inputs,
      method: 'Daily aftershock counts fitted by least squares in log-log space against time since the main shock, with the offset c held fixed. Fitted three ways: across the whole window, and segmented before and after the largest aftershock, which resets the sequence.',
      formula: 'n(t) = K / (t + c)^p',
      parameters: { c: 0.1, minimumDaysFitted: 5 },
      parameterJustification:
        'c is held at 0.1 days rather than fitted: three free parameters against a few dozen daily counts would produce a number with no meaning. Holding it and reporting that is more honest than fitting it and not.',
      outputs: ['p-value', 'K', 'R-squared', 'days fitted', 'daily counts'],
      visualisation: 'Log-log plot of daily rate against time with the fitted decay curve. The observed daily counts and the fitted curve must be drawn distinguishably; they are different kinds of thing.',
      dataClass: DataClass.DERIVED,
      resultClass: ResultClass.MODEL_FIT.id,
      limitations: [
        'A single fit across the whole year returns p = 0.42 with R-squared 0.44. That is not noise: Omori describes decay from ONE main shock, and the M7.3 of 12 May restarted the sequence seventeen days in. The segmented fits are the defensible numbers and the whole-window fit is retained only as the evidence for splitting.',
        'The window after 12 May is superimposed on the continuing decay from 25 April, so re-zeroing it on the M7.3 is itself an approximation, and its fit is correspondingly poor.',
        'Daily counts at long lags are small, so the tail of any of these fits is noisy.',
        'The first day is the most incomplete part of the catalogue and also the most influential point in a log-log fit.',
      ],
    }),
    createAnalysisRecord({
      id: 'seismic-spatial-distribution',
      name: 'Spatial distribution of the sequence',
      question: 'Where did the aftershocks occur relative to the epicentre, and over what extent?',
      inputs,
      method: 'Distance from the main-shock epicentre computed for every event in EPSG:32645 metres; bounding box and east-west and north-south extents derived.',
      outputs: ['bounding box', 'extent in km', 'distance distribution', 'counts within 50/100/200 km'],
      visualisation: 'Map with magnitude-scaled markers, the main shock distinguished from aftershocks.',
      resultClass: ResultClass.DESCRIPTIVE_STATISTIC.id,
      dataClass: DataClass.DERIVED,
      limitations: [
        'Epicentres are horizontal projections of hypocentres; two events 5 km apart on the map may be 30 km apart in the rock.',
        'Location uncertainty for these events is of order kilometres and is not represented in the marker positions.',
        'The 300 km search radius is a circle drawn around the epicentre, not a tectonic boundary. Events near its edge belong to other structures.',
      ],
    }),
  ];

  const analysis = {
    schemaVersion: 1,
    stage: 3,
    generatedAt: new Date().toISOString().slice(0, 10),
    dataClass: DataClass.DERIVED,
    source: {
      datasetId: source.source.datasetId,
      sourceUrl: source.source.sourceUrl,
      license: source.source.license,
      attribution: source.source.attribution,
    },
    validation,
    methodology: records,
    /*
     * What kind of claim each result is.
     *
     * A magnitude is a measurement. A count of events per band is arithmetic
     * on measurements. A b-value is neither: it is a parameter of a model
     * fitted to those measurements, and it moves when the fitting window
     * moves. Listing them together without this distinction is how a fitted
     * parameter ends up quoted as a property of the crust.
     */
    resultClassification: {
      mainShock: ResultClass.OBSERVED.id,
      counts: ResultClass.DESCRIPTIVE_STATISTIC.id,
      magnitude: ResultClass.DESCRIPTIVE_STATISTIC.id,
      aftershockMagnitude: ResultClass.DESCRIPTIVE_STATISTIC.id,
      depth: ResultClass.DESCRIPTIVE_STATISTIC.id,
      temporal: ResultClass.DESCRIPTIVE_STATISTIC.id,
      spatial: ResultClass.DESCRIPTIVE_STATISTIC.id,
      largestEvents: ResultClass.OBSERVED.id,
      completeness: ResultClass.MODEL_FIT.id,
      reportingThreshold: ResultClass.DESCRIPTIVE_STATISTIC.id,
      gutenbergRichter: ResultClass.MODEL_FIT.id,
      bValueSensitivity: ResultClass.MODEL_FIT.id,
      omori: ResultClass.MODEL_FIT.id,
    },
    resultClassMeanings: Object.fromEntries(
      Object.values(ResultClass).map((entry) => [entry.id, entry.means]),
    ),
    results: {
      mainShock: {
        id: mainShock.id,
        magnitude: mainShock.magnitude,
        magType: mainShock.magType,
        time: mainShock.time,
        longitude: mainShock.longitude,
        latitude: mainShock.latitude,
        depthKm: mainShock.depthKm,
        place: mainShock.place,
        mmi: mainShock.mmi,
        alert: mainShock.alert,
      },
      counts: {
        total: events.length,
        foreshocksInWindow: foreshocks.length,
        aftershocks: aftershocks.length,
      },
      magnitude,
      aftershockMagnitude,
      depth,
      temporal,
      completeness,
      reportingThreshold: threshold,
      gutenbergRichter: gr,
      bValueSensitivity: sensitivity,
      omori,
      spatial,
      largestEvents: largest,
    },
  };

  const written = await writeAnalysis('nepal-2015-seismic-analysis.json', analysis);
  return { analysis, written };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { analysis, written } = await analyseSeismic();
  const r = analysis.results;
  console.log(`main shock  M${r.mainShock.magnitude} ${r.mainShock.time}`);
  console.log(`            ${r.mainShock.latitude} N ${r.mainShock.longitude} E, depth ${r.mainShock.depthKm} km`);
  console.log(`events      ${r.counts.total} total = ${r.counts.foreshocksInWindow} before + 1 main + ${r.counts.aftershocks} after`);
  console.log(`\nmagnitude bands:`);
  for (const b of r.magnitude.bands) console.log(`  ${b.label.padEnd(8)} ${String(b.count).padStart(4)}`);
  console.log(`\ndepth: median ${r.depth.median} km, range ${r.depth.min}-${r.depth.max} km, missing ${r.depth.missingDepth}`);
  console.log(`first 24 h: ${r.temporal.firstDayCount} events | first week: ${r.temporal.firstWeekCount}`);
  console.log(`\ncompleteness Mc = ${r.completeness.mc} (${r.completeness.method})`);
  console.log(`Gutenberg-Richter: b = ${r.gutenbergRichter.bValue}, a = ${r.gutenbergRichter.aValue}, R2 = ${r.gutenbergRichter.rSquared} (${r.gutenbergRichter.eventsUsed} events)`);
  console.log(`b-value sensitivity: ${r.bValueSensitivity.range[0]}-${r.bValueSensitivity.range[1]} across Mc ${r.bValueSensitivity.fits[0].completenessMagnitude}-${r.bValueSensitivity.fits[r.bValueSensitivity.fits.length - 1].completenessMagnitude} (spread ${r.bValueSensitivity.spread})`);
  if (r.reportingThreshold) console.log(`reporting threshold detected at M${r.reportingThreshold.magnitude}: ${r.reportingThreshold.ratio}x jump in counts`);
  console.log(`\nOmori, whole window:      p = ${r.omori.whole.pValue}, R2 = ${r.omori.whole.rSquared} (${r.omori.whole.daysFitted} days)  <- poor fit`);
  console.log(`Omori, before M${r.omori.secondary.magnitude} (day ${r.omori.secondary.daysFromMainShock}): p = ${r.omori.beforeSecondary.pValue}, R2 = ${r.omori.beforeSecondary.rSquared} (${r.omori.beforeSecondary.daysFitted} days)`);
  console.log(`Omori, after, re-zeroed:  p = ${r.omori.afterSecondary.pValue}, R2 = ${r.omori.afterSecondary.rSquared} (${r.omori.afterSecondary.daysFitted} days)`);
  console.log(`\nrupture extent: ${r.spatial.extentEastWestKm} km E-W x ${r.spatial.extentNorthSouthKm} km N-S`);
  console.log(`aftershocks within 100 km: ${r.spatial.distanceFromEpicentreKm.within100km} of ${r.spatial.aftershockCount}`);
  console.log(`\nlargest events:`);
  for (const e of r.largestEvents.slice(0, 5)) {
    console.log(`  M${e.magnitude} ${e.time.slice(0, 16)}  +${String(e.hoursFromMainShock.toFixed(1)).padStart(7)} h  ${String(e.distanceFromEpicentreKm).padStart(7)} km  ${e.place}`);
  }
  console.log(`\nvalidation: ${analysis.validation.passed ? 'PASSED' : 'FAILED'}`);
  console.log(`artefact ${written.path} (${formatBytes(written.bytes)})`);
}
