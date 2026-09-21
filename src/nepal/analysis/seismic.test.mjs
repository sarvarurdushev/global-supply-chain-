import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bValueSensitivity,
  completenessMagnitude,
  depthDistribution,
  gutenbergRichter,
  largestEvents,
  leastSquares,
  magnitudeDistribution,
  omoriDecay,
  omoriSegmented,
  reportingThreshold,
  spatialDistribution,
  temporalSeries,
} from './seismic.js';

const MAIN_MS = Date.UTC(2015, 3, 25, 6, 11, 25, 950);

/** Build a synthetic catalogue with a known b-value and Omori decay. */
function synthetic() {
  const events = [
    { id: 'main', magnitude: 7.8, depthKm: 8.2, timeMs: MAIN_MS, longitude: 84.73, latitude: 28.23, distanceFromEpicentreKm: 0 },
  ];
  /* Gutenberg-Richter with b = 1: ten times fewer events per magnitude unit. */
  let id = 0;
  for (const [magnitude, count] of [[4, 1000], [5, 100], [6, 10], [7, 1]]) {
    for (let i = 0; i < count; i += 1) {
      const day = 1 + (i % 60);
      events.push({
        id: `syn-${id++}`,
        magnitude: magnitude + (i % 10) / 10,
        depthKm: 5 + (i % 40),
        timeMs: MAIN_MS + day * 86_400_000,
        longitude: 84.73 + (i % 20) / 100,
        latitude: 28.23 + (i % 15) / 100,
        distanceFromEpicentreKm: (i % 250),
      });
    }
  }
  return events;
}

test('magnitude bands partition the catalogue exactly', () => {
  const events = synthetic();
  const distribution = magnitudeDistribution(events);
  const summed = distribution.bands.reduce((sum, band) => sum + band.count, 0);
  assert.equal(summed, events.length, 'every event lands in exactly one band');
  assert.equal(distribution.max, 7.8);
  assert.ok(distribution.bands.find((b) => b.label === 'M7+').count >= 1);
});

test('a missing depth is never counted as zero', () => {
  const distribution = depthDistribution([
    { magnitude: 5, depthKm: 10, timeMs: MAIN_MS },
    { magnitude: 5, depthKm: null, timeMs: MAIN_MS },
    { magnitude: 5, depthKm: undefined, timeMs: MAIN_MS },
  ]);
  assert.equal(distribution.withDepth, 1);
  assert.equal(distribution.missingDepth, 2);
  assert.equal(distribution.bands.find((b) => b.label === '0-10 km').count, 0);
  assert.equal(distribution.bands.find((b) => b.label === '10-20 km').count, 1);
});

test('the temporal series separates events before the main shock', () => {
  const series = temporalSeries(
    [
      { timeMs: MAIN_MS - 3_600_000 },
      { timeMs: MAIN_MS + 1_800_000 },
      { timeMs: MAIN_MS + 7_200_000 },
      { timeMs: MAIN_MS + 5 * 86_400_000 },
    ],
    { mainShockMs: MAIN_MS },
  );
  assert.equal(series.beforeMainShock, 1);
  assert.equal(series.firstDayCount, 2);
  assert.equal(series.firstWeekCount, 3);
  /* The cumulative column must never decrease. */
  let previous = 0;
  for (const point of series.daily) {
    assert.ok(point.cumulative >= previous);
    previous = point.cumulative;
  }
});

test('a synthetic b = 1 catalogue is recovered as b near 1', () => {
  // The decisive test of the fit: build a catalogue with a known slope and
  // check the estimator returns it, rather than checking it returns the
  // number this project happens to produce.
  const fit = gutenbergRichter(synthetic().filter((e) => e.id !== 'main'), { mc: 4 });
  assert.ok(Math.abs(fit.bValue - 1) < 0.12, `b = ${fit.bValue}, expected near 1`);
  assert.ok(fit.rSquared > 0.97);
  assert.equal(fit.completenessMagnitude, 4);
});

test('a fit is refused rather than run through too few points', () => {
  const tiny = [
    { magnitude: 5, timeMs: MAIN_MS },
    { magnitude: 6, timeMs: MAIN_MS },
  ];
  assert.equal(gutenbergRichter(tiny, { mc: 4 }), null);
  assert.equal(omoriDecay(tiny, { mainShockMs: MAIN_MS }), null);
});

test('completeness reports the modal bin and warns that it is a lower bound', () => {
  const mc = completenessMagnitude(synthetic());
  assert.equal(typeof mc.mc, 'number');
  assert.match(mc.caveat, /under-estimate/);
});

test('a reporting cliff is distinguished from a detection taper', () => {
  // A hard cut: nothing below 4.0, plenty at 4.0.
  const cliff = Array.from({ length: 60 }, (_, i) => ({ magnitude: 4 + (i % 5) / 10 }));
  cliff.push({ magnitude: 3.9 }, { magnitude: 3.8 });
  const detected = reportingThreshold(cliff);
  assert.ok(detected, 'a 20x jump should be detected');
  assert.equal(detected.magnitude, 4);
  assert.match(detected.note, /reporting threshold/);

  // A smooth taper has no cliff to find.
  const taper = [];
  for (let m = 30; m <= 60; m += 1) {
    for (let i = 0; i < Math.round(100 * 10 ** (-(m / 10) + 3)); i += 1) taper.push({ magnitude: m / 10 });
  }
  assert.equal(reportingThreshold(taper), null);
});

test('b-value sensitivity reports a spread, not a single confident number', () => {
  const sensitivity = bValueSensitivity(synthetic().filter((e) => e.id !== 'main'), {
    cuts: [4, 4.5, 5],
  });
  assert.equal(sensitivity.fits.length, 3);
  assert.equal(sensitivity.range.length, 2);
  assert.ok(sensitivity.spread >= 0);
  assert.match(sensitivity.interpretation, /uncertainty/);
});

test('Omori segmentation separates a sequence with two main shocks', () => {
  // Two decaying sequences, the second starting on day 17. A single fit
  // across both is the wrong model, and the segmented fits should differ.
  const events = [];
  let id = 0;
  const decay = (startMs, days) => {
    for (let day = 1; day <= days; day += 1) {
      const count = Math.max(1, Math.round(50 / day));
      for (let i = 0; i < count; i += 1) {
        events.push({ id: `e${id++}`, magnitude: 4.5, timeMs: startMs + day * 86_400_000 });
      }
    }
  };
  decay(MAIN_MS, 17);
  const secondMs = MAIN_MS + 17 * 86_400_000;
  decay(secondMs, 40);
  const secondary = { id: 'second', magnitude: 7.3, time: '2015-05-12T07:05:19.730Z', timeMs: secondMs };

  const segmented = omoriSegmented(events, { mainShockMs: MAIN_MS, secondaryEvent: secondary });
  assert.ok(segmented.whole, 'the whole-window fit is retained as the evidence for splitting');
  assert.ok(segmented.beforeSecondary, 'the first window is fitted');
  assert.ok(segmented.afterSecondary, 'the second window is fitted, re-zeroed');
  assert.equal(segmented.secondary.daysFromMainShock, 17);
  // The first window is a clean 1/t decay, so it should fit better than the whole.
  assert.ok(
    segmented.beforeSecondary.rSquared > segmented.whole.rSquared,
    `before ${segmented.beforeSecondary.rSquared} should beat whole ${segmented.whole.rSquared}`,
  );
});

test('omoriSegmented degrades to a single fit when there is no secondary event', () => {
  const segmented = omoriSegmented(synthetic(), { mainShockMs: MAIN_MS, secondaryEvent: null });
  assert.equal(segmented.beforeSecondary, null);
  assert.equal(segmented.secondary, null);
});

test('spatial distribution measures extent and excludes the main shock from distances', () => {
  const spatial = spatialDistribution(synthetic(), { mainShockId: 'main' });
  assert.equal(spatial.aftershockCount, 1111);
  assert.ok(spatial.extentEastWestKm > 0);
  assert.ok(spatial.distanceFromEpicentreKm.within50km <= spatial.distanceFromEpicentreKm.within100km);
  assert.ok(spatial.distanceFromEpicentreKm.within100km <= spatial.distanceFromEpicentreKm.within200km);
});

test('largest events are ordered by magnitude and capped', () => {
  const largest = largestEvents(synthetic(), 3);
  assert.equal(largest.length, 3);
  assert.equal(largest[0].magnitude, 7.8);
  assert.ok(largest[0].magnitude >= largest[1].magnitude);
});

test('least squares recovers a known line', () => {
  const { slope, intercept, r2 } = leastSquares([[0, 1], [1, 3], [2, 5], [3, 7]]);
  assert.ok(Math.abs(slope - 2) < 1e-9);
  assert.ok(Math.abs(intercept - 1) < 1e-9);
  assert.ok(Math.abs(r2 - 1) < 1e-9);
});
