import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INFRA_STATE,
  STATE_BASIS,
  affectedCities,
  economicApportionment,
  facilityExposure,
  humanImpactBands,
  pointInRing,
  roadExposure,
  segmentLengthKm,
} from './impact.js';
import { AVAILABILITY } from './catalogue.js';

/** The real Gorkha PAGER bands. */
const EXPOSURE = {
  bands: [
    { mmi: 4, label: 'IV', population: 10_720_626, insideShakeMap: false },
    { mmi: 5, label: 'V', population: 84_253_151, insideShakeMap: false },
    { mmi: 6, label: 'VI', population: 40_899_271, insideShakeMap: true },
    { mmi: 7, label: 'VII', population: 3_556_392, insideShakeMap: true },
    { mmi: 8, label: 'VIII', population: 2_884_736, insideShakeMap: true },
    { mmi: 9, label: 'IX', population: 11_711, insideShakeMap: true },
    { mmi: 10, label: 'X+', population: 0, insideShakeMap: true },
  ],
  sourceUrl: 'https://example.test/pager.xml',
};

const SQUARE = [
  [85.0, 28.0],
  [85.5, 28.0],
  [85.5, 28.5],
  [85.0, 28.5],
];

test('human impact is placed, and never a single headline number', () => {
  /*
   * §6: "Do not simply display '10,000 people affected'. Instead, show it
   * geographically." Every band carries its own footprint and label.
   */
  const human = humanImpactBands({
    exposure: EXPOSURE,
    contours: { bands: [{ mmi: 8, lines: [[[85, 28]]] }] },
  });
  assert.ok(human.bands.length >= 6);
  // Ordered worst-first, which is the reading order.
  assert.equal(human.bands[0].label, 'IX');
  const eight = human.bands.find((band) => band.label === 'VIII');
  assert.equal(eight.population, 2_884_736);
  assert.ok(eight.footprint, 'a band with a contour carries its shape');
  assert.equal(eight.intensityName, 'Severe');
  // A band with no population is not a row.
  assert.ok(!human.bands.some((band) => band.population === 0));
});

test('measured and extrapolated exposure are kept apart', () => {
  /*
   * The tens of millions at MMI IV and V are outside the measured footprint.
   * Summing them into one total would make the biggest number the loosest,
   * unmarked.
   */
  const human = humanImpactBands({ exposure: EXPOSURE });
  assert.equal(human.measuredPopulation, 40_899_271 + 3_556_392 + 2_884_736 + 11_711);
  assert.equal(human.extrapolatedPopulation, 10_720_626 + 84_253_151);
  const five = human.bands.find((band) => band.label === 'V');
  assert.equal(five.availability, AVAILABILITY.ESTIMATED);
  assert.match(five.caveat, /extrapolated/);
});

test('every band repeats that exposure is not casualties', () => {
  // Repeated per band rather than once at the top, because a band is what
  // gets screenshotted.
  const human = humanImpactBands({ exposure: EXPOSURE });
  for (const band of human.bands) {
    assert.match(band.caveat, /exposure, not casualties|extrapolated/i);
  }
  assert.equal(humanImpactBands({ exposure: null }), null);
  assert.equal(humanImpactBands({ exposure: { bands: [] } }), null);
});

test('cities are filtered to damaging intensity and keep null populations null', () => {
  const ranked = affectedCities({
    cityIntensities: {
      cities: [
        { name: 'Kathmandu', mmi: 7.89, latitude: 27.7, longitude: 85.32, population: 1_442_271 },
        { name: 'Bhaktapur', mmi: 7.54, latitude: 27.67, longitude: 85.43, population: null },
        { name: 'Faraway', mmi: 4.2, latitude: 20, longitude: 80, population: 900 },
      ],
      sourceUrl: 'u',
    },
    minMmi: 6,
  });
  assert.equal(ranked.cities.length, 2, 'MMI 4.2 is felt but not damaging');
  assert.equal(ranked.withPopulation, 1);
  const bhaktapur = ranked.cities.find((city) => city.name === 'Bhaktapur');
  assert.equal(bhaktapur.population, null);
  assert.ok(bhaktapur.populationNote, 'and it says why');
  assert.equal(ranked.cities[0].band.label, 'VIII');
  assert.equal(affectedCities({ cityIntensities: { cities: [] } }), null);
});

/* ------------------------------------------------------------------ *
 * Exposure is not damage
 * ------------------------------------------------------------------ */

test('an exposed road is AT_RISK and MODELLED, never reported as closed', () => {
  /*
   * The distinction the whole module turns on. A reader must not be able to
   * take a risk map for a damage assessment.
   */
  const out = roadExposure({
    segments: [
      { osmId: 'w/1', coordinates: [[85.1, 28.1], [85.2, 28.2]], tags: { name: 'Inside' } },
      { osmId: 'w/2', coordinates: [[80.0, 20.0], [80.1, 20.1]], tags: { name: 'Far away' } },
    ],
    hazardZones: [{ ring: SQUARE, value: 0.4, label: 'High' }],
  });
  const inside = out.segments.find((item) => item.name === 'Inside');
  const outside = out.segments.find((item) => item.name === 'Far away');
  assert.equal(inside.state, INFRA_STATE.AT_RISK);
  assert.equal(inside.basis, STATE_BASIS.MODELLED);
  assert.notEqual(inside.state, INFRA_STATE.CLOSED);
  assert.match(inside.caveat, /exposure to failure, not a report that it failed/);
  assert.equal(outside.state, INFRA_STATE.OPERATIONAL);
  // And an unexposed road is not declared safe either.
  assert.match(outside.caveat, /not a survey confirming it stayed open/);
  assert.equal(out.basis, STATE_BASIS.MODELLED);
});

test('a road clipping the corner of a zone counts as exposed', () => {
  /*
   * Any-point rather than midpoint sampling. A corridor that clips a
   * high-hazard slope is exactly the case that closes a road, and midpoint
   * testing misses it.
   */
  const out = roadExposure({
    segments: [
      {
        osmId: 'w/1',
        // Starts far outside, ends just inside the square's corner.
        coordinates: [[84.0, 27.0], [84.5, 27.5], [85.05, 28.05]],
        tags: { name: 'Clipper' },
      },
    ],
    hazardZones: [{ ring: SQUARE, value: 0.4 }],
  });
  assert.equal(out.segments[0].state, INFRA_STATE.AT_RISK);
});

test('a zone below the risk threshold does not mark a road', () => {
  const out = roadExposure({
    segments: [{ osmId: 'w/1', coordinates: [[85.1, 28.1], [85.2, 28.2]] }],
    hazardZones: [{ ring: SQUARE, value: 0.01 }],
    riskThreshold: 0.1,
  });
  assert.equal(out.segments[0].state, INFRA_STATE.OPERATIONAL);
  assert.equal(out.atRisk.length, 0);
});

test('the worst intersecting zone wins, and lengths accumulate', () => {
  const out = roadExposure({
    segments: [{ osmId: 'w/1', coordinates: [[85.1, 28.1], [85.2, 28.2]] }],
    hazardZones: [
      { ring: SQUARE, value: 0.2, label: 'Moderate' },
      { ring: SQUARE, value: 0.6, label: 'Very high' },
    ],
  });
  assert.equal(out.segments[0].hazardLabel, 'Very high');
  assert.ok(out.atRiskLengthKm > 0);
  assert.equal(out.atRiskLengthKm, out.totalLengthKm);
  assert.equal(out.zonesConsidered, 2);
});

test('a facility keeps an unrecorded capacity null rather than guessing', () => {
  const out = facilityExposure({
    facilities: [
      { id: 'h1', name: 'Hospital', lat: 28.1, lon: 85.1, kind: 'hospital', capacity: 200 },
      { id: 's1', name: 'School', lat: 28.2, lon: 85.2, kind: 'shelter' },
      { id: 'x1', name: 'Off map', lat: 10, lon: 10, kind: 'hospital' },
    ],
    hazardZones: [{ ring: SQUARE, value: 0.5 }],
  });
  assert.equal(out.atRisk.length, 2);
  assert.equal(out.withCapacity, 1);
  const school = out.facilities.find((item) => item.name === 'School');
  assert.equal(school.capacity, null);
  assert.ok(school.capacityNote);
  assert.equal(out.facilities.find((i) => i.name === 'Off map').state, INFRA_STATE.OPERATIONAL);
});

/* ------------------------------------------------------------------ *
 * Economic (§9)
 * ------------------------------------------------------------------ */

test('economic loss is apportioned spatially and labelled as an apportionment', () => {
  const human = humanImpactBands({ exposure: EXPOSURE });
  const econ = economicApportionment({
    nationalTotalUsd: 7e9,
    totalSource: 'Government of Nepal PDNA 2015',
    human,
  });
  assert.equal(econ.nationalTotalUsd, 7e9);
  assert.ok(econ.slices.length >= 4);
  // The shares sum to the whole, or the map loses money.
  const total = econ.slices.reduce((sum, slice) => sum + slice.apportionedUsd, 0);
  assert.ok(Math.abs(total - 7e9) < 1);
  assert.ok(Math.abs(econ.slices.reduce((s, x) => s + x.shareOfTotal, 0) - 1) < 1e-9);
  // Only the measured bands are apportioned across.
  assert.ok(econ.slices.every((slice) => slice.mmi >= 6));
  assert.match(econ.caveat, /AN APPORTIONMENT, NOT AN ASSESSMENT/);
  assert.match(econ.sensitivity, /sensitive to the intensity exponent/);
  assert.ok(econ.method?.length > 30);
  assert.ok(econ.wouldNeed?.length > 20);
  for (const slice of econ.slices) {
    assert.equal(slice.availability, AVAILABILITY.ESTIMATED);
  }
});

test('with no national total there is nothing to apportion', () => {
  // A map of zeroes looks like a finding.
  const human = humanImpactBands({ exposure: EXPOSURE });
  assert.equal(economicApportionment({ nationalTotalUsd: null, human }), null);
  assert.equal(economicApportionment({ nationalTotalUsd: 0, human }), null);
  assert.equal(economicApportionment({ nationalTotalUsd: 7e9, human: null }), null);
});

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

test('point-in-ring handles edges, outside and degenerate rings', () => {
  assert.equal(pointInRing(85.25, 28.25, SQUARE), true);
  assert.equal(pointInRing(86, 28.25, SQUARE), false);
  assert.equal(pointInRing(85.25, 29, SQUARE), false);
  assert.equal(pointInRing(0, 0, [[0, 0], [1, 1]]), false, 'two points is not a ring');
  assert.equal(pointInRing(0, 0, null), false);
});

test('segment length is great-circle, not planar', () => {
  // London to Paris is about 344 km; a planar approximation over-reads.
  const km = segmentLengthKm([[-0.1278, 51.5074], [2.3522, 48.8566]]);
  assert.ok(km > 330 && km < 355, `got ${km}`);
  assert.equal(segmentLengthKm([[0, 0]]), 0);
});
