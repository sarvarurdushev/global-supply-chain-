import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MMI_MEANING,
  contoursToRings,
  decodePopulationGrid,
  exposureByDistrict,
  intensityAt,
  populationByIntensity,
  thresholdSensitivity,
} from './exposure.js';

/** Nested square contours: MMI 6 outer, MMI 7 inner, both closed. */
const CONTOURS = [
  {
    properties: { mmi: 6 },
    geometry: {
      type: 'MultiLineString',
      coordinates: [[[85, 27], [86, 27], [86, 28], [85, 28], [85, 27]]],
    },
  },
  {
    properties: { mmi: 7 },
    geometry: {
      type: 'MultiLineString',
      coordinates: [[[85.4, 27.4], [85.6, 27.4], [85.6, 27.6], [85.4, 27.6], [85.4, 27.4]]],
    },
  },
  {
    /*
     * Open, and long enough to reach the closure check rather than being
     * rejected for being too short: this is what a contour running off the
     * edge of the ShakeMap grid looks like.
     */
    properties: { mmi: 5 },
    geometry: {
      type: 'MultiLineString',
      coordinates: [[[84, 26], [87, 26], [87, 29], [84.5, 29], [84.2, 28]]],
    },
  },
];

test('open contours are excluded rather than silently closed', () => {
  const rings = contoursToRings(CONTOURS);
  assert.deepEqual(rings.usableLevels, [6, 7]);
  assert.equal(rings.excluded.length, 1);
  assert.equal(rings.excluded[0].mmi, 5);
  assert.match(rings.excluded[0].reason, /not closed/);
});

test('a point takes the highest intensity containing it', () => {
  const rings = contoursToRings(CONTOURS);
  assert.equal(intensityAt(rings, 85.5, 27.5), 7, 'inside both, takes the stronger');
  assert.equal(intensityAt(rings, 85.1, 27.1), 6, 'inside the outer only');
  assert.equal(intensityAt(rings, 84.5, 27.5), null, 'outside everything');
});

test('cumulative exposure never rises as the threshold rises', () => {
  const rings = contoursToRings(CONTOURS);
  const cells = [
    { lon: 85.5, lat: 27.5, people: 100 }, // MMI 7
    { lon: 85.1, lat: 27.1, people: 50 }, // MMI 6
    { lon: 84.5, lat: 27.5, people: 25 }, // outside
  ];
  const summary = populationByIntensity(cells, rings);
  assert.equal(summary.totalPopulationConsidered, 175);
  assert.equal(summary.populationOutsideAllContours, 25);
  const atSix = summary.bands.find((b) => b.mmi === 6);
  const atSeven = summary.bands.find((b) => b.mmi === 7);
  assert.equal(atSix.populationInBand, 50);
  assert.equal(atSix.populationAtOrAbove, 150, 'MMI 6+ includes the MMI 7 people');
  assert.equal(atSeven.populationAtOrAbove, 100);

  const sensitivity = thresholdSensitivity(summary);
  for (let i = 1; i < sensitivity.length; i += 1) {
    assert.ok(
      sensitivity[i].exposedPopulation <= sensitivity[i - 1].exposedPopulation,
      'a higher threshold cannot expose more people',
    );
  }
});

test('the sparse population grid decodes to the cells it was built from', () => {
  const grid = {
    encoding: 'sparse-grid-gaps',
    count: 3,
    grid: { cols: 10, rows: 5, originLon: 85, originLat: 28, stepLon: 0.1, stepLat: 0.1 },
    gaps: [1, 2, 10],
    people: [10, 20, 30],
  };
  const cells = [...decodePopulationGrid(grid)];
  assert.equal(cells.length, 3);
  // The running index starts at -1, so the gaps 1, 2, 10 give indices 0, 2, 12.
  // index 0 -> col 0, row 0
  assert.ok(Math.abs(cells[0].lon - 85) < 1e-9);
  assert.ok(Math.abs(cells[0].lat - 28) < 1e-9);
  // index 2 -> col 2, row 0
  assert.ok(Math.abs(cells[1].lon - 85.2) < 1e-9);
  assert.ok(Math.abs(cells[1].lat - 28) < 1e-9);
  // index 12 -> col 2, row 1
  assert.ok(Math.abs(cells[2].lon - 85.2) < 1e-9);
  assert.ok(Math.abs(cells[2].lat - 27.9) < 1e-9);
  assert.equal(cells.reduce((sum, cell) => sum + cell.people, 0), 60);
});

const DISTRICTS = [
  {
    type: 'Feature',
    properties: { district: 'Inner', districtKey: 'inner', areaSqKm: 100, bbox: [85.4, 27.4, 85.6, 27.6] },
    geometry: {
      type: 'Polygon',
      coordinates: [[[85.4, 27.4], [85.6, 27.4], [85.6, 27.6], [85.4, 27.6], [85.4, 27.4]]],
    },
  },
  {
    type: 'Feature',
    properties: { district: 'Outer', districtKey: 'outer', areaSqKm: 900, bbox: [85, 27, 85.35, 27.35] },
    geometry: {
      type: 'Polygon',
      coordinates: [[[85, 27], [85.35, 27], [85.35, 27.35], [85, 27.35], [85, 27]]],
    },
  },
];

test('district totals plus the unplaced remainder equal the input, exactly', () => {
  const rings = contoursToRings(CONTOURS);
  const cells = [
    { lon: 85.5, lat: 27.5, people: 100 }, // Inner, MMI 7
    { lon: 85.1, lat: 27.1, people: 50 }, // Outer, MMI 6
    { lon: 84.0, lat: 26.0, people: 25 }, // in no district and no contour
  ];
  const result = exposureByDistrict(cells, rings, DISTRICTS, { threshold: 6 });
  assert.equal(result.exact.inDistricts, 150);
  assert.equal(result.exact.outsideAnyDistrict, 25);
  assert.equal(result.exact.total, 175, 'nothing is lost or double counted');
  assert.equal(result.totalExposed, 150);
});

test('a cell is counted once, in its strongest contour and one district', () => {
  const rings = contoursToRings(CONTOURS);
  // A point inside both contours AND inside the Inner district.
  const result = exposureByDistrict([{ lon: 85.5, lat: 27.5, people: 100 }], rings, DISTRICTS, {
    threshold: 6,
  });
  const inner = result.districts.find((row) => row.districtKey === 'inner');
  const outer = result.districts.find((row) => row.districtKey === 'outer');
  assert.equal(inner.population, 100);
  assert.equal(outer.population, 0);
  assert.equal(inner.maxMmi, 7);
  assert.equal(result.exact.total, 100);
});

test('the threshold decides what counts as exposed', () => {
  const rings = contoursToRings(CONTOURS);
  const cells = [
    { lon: 85.5, lat: 27.5, people: 100 }, // MMI 7
    { lon: 85.1, lat: 27.1, people: 50 }, // MMI 6
  ];
  assert.equal(exposureByDistrict(cells, rings, DISTRICTS, { threshold: 6 }).totalExposed, 150);
  assert.equal(exposureByDistrict(cells, rings, DISTRICTS, { threshold: 7 }).totalExposed, 100);
});

test('nearest-district fill is off by default and reports what it placed', () => {
  const rings = contoursToRings(CONTOURS);
  // Just outside the Outer district, well within a generous tolerance.
  const cells = [{ lon: 85.36, lat: 27.2, people: 40 }];

  const strict = exposureByDistrict(cells, rings, DISTRICTS, { threshold: 6 });
  assert.equal(strict.exact.outsideAnyDistrict, 40, 'no fill without a tolerance');
  assert.equal(strict.filledByNearestDistrict.people, 0);

  const filled = exposureByDistrict(cells, rings, DISTRICTS, { threshold: 6, fillToleranceKm: 20 });
  assert.equal(filled.exact.outsideAnyDistrict, 0);
  assert.equal(filled.filledByNearestDistrict.people, 40);
  assert.equal(filled.filledByNearestDistrict.cells, 1);
  const outer = filled.districts.find((row) => row.districtKey === 'outer');
  assert.equal(outer.filledPeople, 40, 'the district records how many arrived by fill');
});

test('the fill refuses a cell beyond its tolerance rather than reaching for it', () => {
  const rings = contoursToRings(CONTOURS);
  const cells = [{ lon: 88.0, lat: 27.2, people: 40 }];
  const filled = exposureByDistrict(cells, rings, DISTRICTS, { threshold: 6, fillToleranceKm: 20 });
  assert.equal(filled.exact.outsideAnyDistrict, 40);
  assert.equal(filled.filledByNearestDistrict.people, 0);
});

test('every usable intensity carries its published damage meaning', () => {
  const rings = contoursToRings(CONTOURS);
  const summary = populationByIntensity([{ lon: 85.5, lat: 27.5, people: 1 }], rings);
  for (const band of summary.bands) {
    assert.ok(band.meaning, `MMI ${band.mmi} has no meaning attached`);
    assert.equal(band.meaning, MMI_MEANING[band.mmi]);
  }
  assert.match(MMI_MEANING[6].damage, /lowest intensity at which damage occurs/);
});
