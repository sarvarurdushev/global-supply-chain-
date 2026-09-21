import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COPERNICUS_GRADES,
  SEVERITY_SCHEMES,
  UNOSAT_CLASSES,
  UNOSAT_PUBLISHED_COUNTS,
  attributeToDistricts,
  compareDamageProducts,
  composition,
  copernicusByAoi,
  damageByIntensity,
  damageConcentration,
  damageGrid,
  reproduceUnosatCounts,
  severityRankStability,
  severityScore,
  tally,
} from './damage.js';

const point = (lon, lat, damageClass) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { damageClass },
});

test('the published counts are reproduced class by class, and a difference is reported', () => {
  const features = [];
  for (const [name, count] of Object.entries(UNOSAT_PUBLISHED_COUNTS)) {
    for (let i = 0; i < count; i += 1) features.push(point(85 + i * 1e-5, 27.5, name));
  }
  const exact = reproduceUnosatCounts(features);
  assert.equal(exact.reproduced, true);
  assert.equal(exact.total, 4583);
  assert.deepEqual(exact.differences, []);

  // Remove one Destroyed record: the report must name the class and the size.
  const short = reproduceUnosatCounts(features.slice(1));
  assert.equal(short.reproduced, false);
  assert.equal(short.differences.length, 1);
  assert.equal(short.differences[0].class, 'Destroyed');
  assert.equal(short.differences[0].difference, -1);
});

test('composition sums to a hundred and keeps one decimal', () => {
  const shares = composition({ a: 1, b: 1, c: 2 }).shares;
  assert.deepEqual(shares, { a: 25, b: 25, c: 50 });
  assert.equal(composition({}).total, 0);
});

test('tally keeps the stated class order and names the unlabelled bucket', () => {
  const features = [point(85, 27, 'Destroyed'), { properties: { damageClass: null } }];
  const counts = tally(features, (f) => f.properties.damageClass, UNOSAT_CLASSES);
  assert.deepEqual(Object.keys(counts), ['Destroyed', '(unlabelled)']);
});

test('a severity score is the weighted sum, and the mean is per observation', () => {
  const counts = { Destroyed: 2, 'Severe Damage': 1 };
  const linear = SEVERITY_SCHEMES.find((s) => s.id === 'ordinal-linear');
  const score = severityScore(counts, linear.weights);
  assert.equal(score.score, 2 * 4 + 1 * 3);
  assert.equal(score.observations, 3);
  assert.ok(Math.abs(score.mean - 11 / 3) < 1e-12);
});

test('rank stability calls an ordering robust only when every scheme agrees', () => {
  /*
   * Three units whose ordering is the same however the classes are weighted:
   * each is strictly worse than the next on every class at once.
   */
  const agreeing = severityRankStability([
    { id: 'a', counts: { Destroyed: 10, 'Severe Damage': 10, 'Moderate Damage': 10, 'Possible Damage': 10 } },
    { id: 'b', counts: { Destroyed: 5, 'Severe Damage': 5, 'Moderate Damage': 5, 'Possible Damage': 5 } },
    { id: 'c', counts: { Destroyed: 1, 'Severe Damage': 1, 'Moderate Damage': 1, 'Possible Damage': 1 } },
  ]);
  assert.equal(agreeing.verdict, 'ROBUST');
  assert.equal(agreeing.worstSpearman, 1);

  /*
   * And a case the index must refuse: one unit is all light damage in bulk,
   * the other is a handful of total collapses. Which is "worse" is exactly
   * the question the weights decide, so no ranking may be published.
   */
  const disagreeing = severityRankStability([
    { id: 'bulk-light', counts: { 'Possible Damage': 100, 'Moderate Damage': 100 } },
    { id: 'few-collapsed', counts: { Destroyed: 12 } },
    { id: 'middling', counts: { 'Severe Damage': 20 } },
  ]);
  assert.equal(disagreeing.verdict, 'NOT_USABLE');
  assert.match(disagreeing.verdictMeaning, /depends on weights/);
});

test('every severity scheme states why its weights are what they are', () => {
  assert.equal(SEVERITY_SCHEMES.length, 4);
  for (const scheme of SEVERITY_SCHEMES) {
    assert.ok(scheme.rationale.length > 40, `${scheme.id} has no rationale`);
    for (const klass of UNOSAT_CLASSES) {
      assert.equal(typeof scheme.weights[klass], 'number', `${scheme.id} omits ${klass}`);
    }
  }
  // One scheme must use no interval assumption at all, or the test of the
  // others has no control.
  const weightless = SEVERITY_SCHEMES.find((s) => s.id === 'destroyed-only');
  assert.equal(weightless.weights['Severe Damage'], 0);
});

test('the grid conserves every point and reports the footprint it can defend', () => {
  const points = [
    { coordinates: [85.0, 27.5], damageClass: 'Destroyed' },
    { coordinates: [85.0001, 27.5], damageClass: 'Destroyed' },
    { coordinates: [86.0, 28.0], damageClass: 'Severe Damage' },
  ];
  const grid = damageGrid(points, { cellMetres: 1000 });
  assert.equal(grid.cells.reduce((a, c) => a + c.count, 0), 3);
  // The first two are ten metres apart and must share a cell.
  assert.equal(grid.occupiedCells, 2);
  assert.equal(grid.observedFootprintSqKm, 2);
  assert.equal(grid.cells[0].count, 2);
  assert.equal(grid.meanPerOccupiedCell, 1.5);
});

test('concentration is highest when one cell holds everything', () => {
  const spread = damageConcentration(
    damageGrid(
      Array.from({ length: 4 }, (_, i) => ({ coordinates: [85 + i * 0.05, 27.5], damageClass: 'Destroyed' })),
      { cellMetres: 1000 },
    ),
  );
  assert.equal(spread.gini, 0);
  assert.equal(spread.occupiedCells, 4);
});

test('district attribution reconciles and names what it could not place', () => {
  const square = (west, south) => ({
    district: `d${west}`,
    bbox: [west, south, west + 1, south + 1],
    geometry: {
      type: 'Polygon',
      coordinates: [[[west, south], [west + 1, south], [west + 1, south + 1], [west, south + 1], [west, south]]],
    },
  });
  const districts = [square(85, 27)];
  const result = attributeToDistricts(
    [
      { coordinates: [85.5, 27.5], damageClass: 'Destroyed' },
      { coordinates: [88, 27.5], damageClass: 'Destroyed' },
    ],
    districts,
    { fallbackKm: 2 },
  );
  assert.equal(result.ledger.contained, 1);
  assert.equal(result.ledger.unplaced, 1);
  assert.equal(result.ledger.reconciles, true);
  assert.equal(result.unplaced[0].nearestDistrict, 'd85');
  assert.ok(result.unplaced[0].nearestKm > 100);
});

test('damage by intensity separates composition from count and carries the warning', () => {
  const points = [
    { coordinates: [1, 1], damageClass: 'Destroyed' },
    { coordinates: [1, 1], damageClass: 'Severe Damage' },
    { coordinates: [2, 2], damageClass: 'Destroyed' },
    { coordinates: [2, 2], damageClass: 'Destroyed' },
    { coordinates: [9, 9], damageClass: 'Moderate Damage' },
  ];
  const result = damageByIntensity(points, (lon) => (lon === 1 ? 7 : lon === 2 ? 8 : null));
  assert.equal(result.bands.length, 2);
  assert.equal(result.outsideContours, 1);
  assert.equal(result.bands[0].destroyedShare, 50);
  assert.equal(result.bands[1].destroyedShare, 100);
  assert.match(result.selectionWarning, /NOT comparable across bands/i);
  // Counts plus outside must account for everything.
  assert.equal(result.bands.reduce((a, b) => a + b.count, 0) + result.outsideContours, 5);
});

test('Copernicus keeps ungraded records out of the rate denominator', () => {
  const records = [
    { aoi: 'A', grading: 'Completely Destroyed' },
    { aoi: 'A', grading: 'Not Affected' },
    { aoi: 'A', grading: 'Unknown' },
    { aoi: 'A', grading: 'Negligible to slight damage (EMS-98 grade 1)' },
  ];
  const result = copernicusByAoi(records);
  const a = result.aois[0];
  assert.equal(a.total, 4);
  assert.equal(a.graded, 3);
  assert.equal(a.notGraded, 1);
  assert.equal(a.damaged, 2);
  assert.equal(a.destroyed, 1);
  // One destroyed out of three graded, not out of four records.
  assert.ok(Math.abs(a.destroyedShareOfGraded - 33.3) < 0.1);
  assert.equal(a.destroyedShareOfAllRecords, 25);
});

test('the Copernicus vocabulary has no middle grade and says so', () => {
  const grades = Object.values(COPERNICUS_GRADES)
    .map((meta) => meta.emsGrade)
    .filter((grade) => grade !== null);
  assert.deepEqual([...new Set(grades)].sort(), [1, 5]);
  // Nothing in the vocabulary may claim a grade 2, 3 or 4.
  assert.equal(grades.some((grade) => grade > 1 && grade < 5), false);
});

test('the product comparison refuses to merge the vocabularies', () => {
  const result = compareDamageProducts({
    unosat: { total: 4583 },
    copernicus: { totals: { total: 41042, graded: 38589 } },
    nga: { total: 235 },
  });
  const byName = Object.fromEntries(result.products.map((p) => [p.product, p]));
  assert.equal(byName['UNOSAT damage sites'].hasDenominator, false);
  assert.equal(byName['Copernicus EMSR125 grading'].hasDenominator, true);
  assert.equal(byName['NGA infrastructure damage'].hasDenominator, false);
  assert.ok(result.whyNotMerged.length >= 4);
  assert.ok(result.whyNotMerged.some((reason) => /double-count/i.test(reason)));
});
