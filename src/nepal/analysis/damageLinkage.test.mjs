import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_CLOCK,
  PROXIMITY_BANDS_METRES,
  damagePopulationQuadrants,
  daysBetween,
  normaliseObservationDate,
  observationTimeline,
  populationNearDamage,
} from './damageLinkage.js';

test('proximity bands are cumulative and carry the wording with them', () => {
  const cells = [
    { lon: 85, lat: 27, people: 100 }, // on top of the damage
    { lon: 85.02, lat: 27, people: 50 }, // about 2 km east
    { lon: 86, lat: 27, people: 999 }, // ~100 km away
  ];
  const result = populationNearDamage(cells, [{ coordinates: [85, 27] }]);
  const within = (metres) => result.bands.find((band) => band.withinMetres === metres).people;
  assert.equal(within(500), 100);
  assert.equal(within(2000), 150);
  assert.equal(within(5000), 150);
  assert.equal(result.populationBeyondFurthestBand, 999);
  assert.equal(result.populationTotalConsidered, 1149);
  // The bands must never decrease as the distance grows.
  for (let i = 1; i < result.bands.length; i += 1) {
    assert.ok(result.bands[i].people >= result.bands[i - 1].people);
  }
  assert.match(result.wording, /modelled population cells/);
  assert.ok(result.forbidden.some((phrase) => /lost their homes/.test(phrase)));
});

test('the bands start at half a cell, not at zero', () => {
  // A zero band would always read zero and be misread as "nobody was there".
  assert.equal(PROXIMITY_BANDS_METRES.includes(0), false);
  assert.equal(PROXIMITY_BANDS_METRES[0], 500);
});

test('quadrants partition the cells and cut damage at presence, not at a median', () => {
  const cells = [
    { lon: 85, lat: 27, people: 1000, damage: 5 },
    { lon: 85.1, lat: 27, people: 900, damage: 0 },
    { lon: 85.2, lat: 27, people: 10, damage: 3 },
    { lon: 85.3, lat: 27, people: 5, damage: 0 },
  ];
  const result = damagePopulationQuadrants(cells);
  const total = Object.values(result.quadrants).reduce((a, q) => a + q.cells, 0);
  assert.equal(total, 4);
  assert.equal(result.quadrants.HIGH_POPULATION_HIGH_DAMAGE.cells, 1);
  assert.equal(result.quadrants.HIGH_POPULATION_LOW_DAMAGE.cells, 1);
  assert.equal(result.quadrants.LOW_POPULATION_HIGH_DAMAGE.cells, 1);
  assert.equal(result.quadrants.LOW_POPULATION_LOW_DAMAGE.cells, 1);
  assert.equal(result.damageThreshold, 1);
  assert.match(result.damageThresholdBasis, /median damage count.*is zero/);
  assert.match(result.coverageCaveat, /NO DAMAGE POINT WAS OBSERVED/);
});

test('the population cut is the median of the cells and is stated as such', () => {
  const cells = [
    { lon: 85, lat: 27, people: 10, damage: 0 },
    { lon: 85.1, lat: 27, people: 20, damage: 0 },
    { lon: 85.2, lat: 27, people: 30, damage: 0 },
  ];
  const result = damagePopulationQuadrants(cells);
  assert.equal(result.populationThreshold, 20);
  assert.match(result.populationThresholdBasis, /independent of the damage axis/);
  // An explicit threshold overrides it, and says so.
  const explicit = damagePopulationQuadrants(cells, { populationThreshold: 25 });
  assert.equal(explicit.populationThreshold, 25);
  assert.match(explicit.populationThresholdBasis, /Supplied by the caller/);
});

test('mixed date formats parse only when unambiguous', () => {
  assert.equal(normaliseObservationDate('04/28/2015'), '2015-04-28');
  assert.equal(normaliseObservationDate('4/29/2015'), '2015-04-29');
  assert.equal(normaliseObservationDate('2015-05-03'), '2015-05-03');
  // Day-first would put 28 in the month slot; refused rather than guessed.
  assert.equal(normaliseObservationDate('28/04/2015'), null);
  assert.equal(normaliseObservationDate('not a date'), null);
  assert.equal(normaliseObservationDate(null), null);
});

test('day arithmetic is calendar days from the event', () => {
  assert.equal(daysBetween(EVENT_CLOCK.mainShock, '2015-04-25'), 0);
  assert.equal(daysBetween(EVENT_CLOCK.mainShock, '2015-05-03'), 8);
  assert.equal(daysBetween(null, '2015-05-03'), null);
});

test('the timeline keeps four clocks apart and warns against animating them', () => {
  const timeline = observationTimeline([
    { product: 'NGA roads', acquired: '04/27/2015', produced: '04/28/2015', published: '2015-05-07', count: 8 },
    { product: 'UNOSAT', acquired: '2015-05-03', produced: null, published: null, count: 1221 },
  ]);
  assert.equal(timeline.clocks.length, 4);
  assert.deepEqual(
    timeline.clocks.map((clock) => clock.id),
    ['EARTHQUAKE', 'ACQUISITION', 'PRODUCTION', 'PUBLICATION'],
  );
  // No merged "date" column exists to animate by accident.
  assert.equal('date' in timeline.rows[0], false);
  const nga = timeline.rows.find((row) => row.product === 'NGA roads');
  assert.equal(nga.daysEventToAcquisition, 2);
  assert.equal(nga.daysAcquisitionToProduction, 1);
  assert.equal(nga.daysProductionToPublication, 9);
  // A product with no production date reports null, not an inferred lag.
  const unosat = timeline.rows.find((row) => row.product === 'UNOSAT');
  assert.equal(unosat.daysAcquisitionToProduction, null);
  assert.equal(unosat.daysEventToAcquisition, 8);
  // Lags are weighted by observation count, so 1,221 records are not one row.
  assert.equal(timeline.lags.eventToAcquisition.observations, 1229);
  assert.match(timeline.animationWarning, /must not be animated/);
});
