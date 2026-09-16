import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EARTH_MEAN_RADIUS_KM,
  haversineKm,
  initialBearingDeg,
  pathLengthKm,
  interpolateGreatCircle,
  greatCircleArc,
  transitHours,
  validatePoint,
} from './geo.js';

const BUSAN = { lat: 35.1, lon: 129.0333 };
const ROTTERDAM = { lat: 51.9, lon: 4.4833 };
const SINGAPORE = { lat: 1.2833, lon: 103.85 };

test('validatePoint rejects malformed and out-of-range coordinates', () => {
  assert.throws(() => validatePoint(null), TypeError);
  assert.throws(() => validatePoint({ lat: 0 }), TypeError);
  assert.throws(() => validatePoint({ lat: 'a', lon: 0 }), TypeError);
  assert.throws(() => validatePoint({ lat: NaN, lon: 0 }), TypeError);
  assert.throws(() => validatePoint({ lat: 91, lon: 0 }), RangeError);
  assert.throws(() => validatePoint({ lat: -91, lon: 0 }), RangeError);
  assert.throws(() => validatePoint({ lat: 0, lon: 181 }), RangeError);
  assert.throws(() => validatePoint({ lat: 0, lon: -181 }), RangeError);
  assert.deepEqual(validatePoint({ lat: 90, lon: 180 }), { lat: 90, lon: 180 });
});

test('haversine matches known great-circle distances', () => {
  // Reference pairs with widely published great-circle distances. These check
  // the implementation against the outside world rather than against itself.
  const londonNewYork = haversineKm(
    { lat: 51.5074, lon: -0.1278 },
    { lat: 40.7128, lon: -74.006 },
  );
  assert.ok(
    Math.abs(londonNewYork - 5570) < 30,
    `London-New York: expected ~5570 km, got ${londonNewYork}`,
  );
  const sydneyLosAngeles = haversineKm(
    { lat: -33.8688, lon: 151.2093 },
    { lat: 34.0522, lon: -118.2437 },
  );
  assert.ok(
    Math.abs(sydneyLosAngeles - 12060) < 60,
    `Sydney-Los Angeles: expected ~12060 km, got ${sydneyLosAngeles}`,
  );
  // Quarter of the circumference along the equator.
  const quarter = haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 90 });
  assert.ok(Math.abs(quarter - (Math.PI / 2) * EARTH_MEAN_RADIUS_KM) < 1e-6);
  // Pole to pole is half the circumference.
  const poles = haversineKm({ lat: 90, lon: 0 }, { lat: -90, lon: 0 });
  assert.ok(Math.abs(poles - Math.PI * EARTH_MEAN_RADIUS_KM) < 1e-6);
});

test('haversine is symmetric and zero for identical points', () => {
  assert.equal(haversineKm(BUSAN, BUSAN), 0);
  assert.ok(
    Math.abs(haversineKm(BUSAN, SINGAPORE) - haversineKm(SINGAPORE, BUSAN)) < 1e-9,
  );
});

test('haversine handles the antimeridian without inflating distance', () => {
  // Two points 2 degrees apart straddling the date line must not measure 358.
  const km = haversineKm({ lat: 0, lon: 179 }, { lat: 0, lon: -179 });
  const twoDegrees = haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 2 });
  assert.ok(Math.abs(km - twoDegrees) < 1e-6, `got ${km}, expected ${twoDegrees}`);
});

test('initialBearingDeg reports compass bearings', () => {
  assert.ok(Math.abs(initialBearingDeg({ lat: 0, lon: 0 }, { lat: 10, lon: 0 })) < 1e-9);
  assert.ok(
    Math.abs(initialBearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 10 }) - 90) < 1e-9,
  );
  assert.ok(
    Math.abs(initialBearingDeg({ lat: 0, lon: 0 }, { lat: -10, lon: 0 }) - 180) < 1e-9,
  );
  const west = initialBearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: -10 });
  assert.ok(Math.abs(west - 270) < 1e-9, `got ${west}`);
});

test('pathLengthKm sums legs and handles degenerate paths', () => {
  assert.equal(pathLengthKm([]), 0);
  assert.equal(pathLengthKm([BUSAN]), 0);
  const direct = haversineKm(BUSAN, SINGAPORE);
  const viaTwo = pathLengthKm([BUSAN, SINGAPORE]);
  assert.ok(Math.abs(direct - viaTwo) < 1e-9);
  // A detour is never shorter than the direct leg (triangle inequality).
  assert.ok(pathLengthKm([BUSAN, ROTTERDAM, SINGAPORE]) >= direct);
  assert.throws(() => pathLengthKm('nope'), TypeError);
});

test('interpolateGreatCircle returns endpoints and a midpoint on the arc', () => {
  const start = interpolateGreatCircle(BUSAN, ROTTERDAM, 0);
  assert.ok(Math.abs(start.lat - BUSAN.lat) < 1e-9);
  assert.ok(Math.abs(start.lon - BUSAN.lon) < 1e-9);
  const end = interpolateGreatCircle(BUSAN, ROTTERDAM, 1);
  assert.ok(Math.abs(end.lat - ROTTERDAM.lat) < 1e-9);
  assert.ok(Math.abs(end.lon - ROTTERDAM.lon) < 1e-9);
  // The midpoint must be equidistant from both endpoints.
  const mid = interpolateGreatCircle(BUSAN, ROTTERDAM, 0.5);
  const a = haversineKm(BUSAN, mid);
  const b = haversineKm(mid, ROTTERDAM);
  assert.ok(Math.abs(a - b) < 1e-6, `${a} vs ${b}`);
});

test('interpolateGreatCircle degenerates safely for coincident points', () => {
  const same = interpolateGreatCircle(BUSAN, { ...BUSAN }, 0.5);
  assert.deepEqual(same, { lat: BUSAN.lat, lon: BUSAN.lon });
});

test('greatCircleArc samples a polyline no shorter than the direct distance', () => {
  const arc = greatCircleArc(BUSAN, ROTTERDAM, 16);
  assert.equal(arc.length, 17);
  const direct = haversineKm(BUSAN, ROTTERDAM);
  const along = pathLengthKm(arc);
  // Chords under-measure the arc slightly, so allow a small tolerance.
  assert.ok(Math.abs(along - direct) / direct < 0.001, `${along} vs ${direct}`);
});

test('greatCircleArc falls back to a sane segment count', () => {
  assert.equal(greatCircleArc(BUSAN, ROTTERDAM, 0).length, 33);
  assert.equal(greatCircleArc(BUSAN, ROTTERDAM, -5).length, 33);
  assert.equal(greatCircleArc(BUSAN, ROTTERDAM, 1.5).length, 33);
});

test('transitHours converts distance at a stated speed', () => {
  // 1852 km at 100 knots = 1000 nautical miles / 100 kn = 10 h.
  assert.ok(Math.abs(transitHours(1852, 100) - 10) < 1e-9);
  assert.ok(Math.abs(transitHours(1852, 100, 5) - 15) < 1e-9);
  assert.equal(transitHours(0, 14), 0);
});

test('transitHours rejects impossible inputs rather than returning Infinity', () => {
  assert.throws(() => transitHours(-1, 14), RangeError);
  assert.throws(() => transitHours(100, 0), RangeError);
  assert.throws(() => transitHours(100, -14), RangeError);
  assert.throws(() => transitHours(100, 14, -1), RangeError);
  assert.throws(() => transitHours('x', 14), TypeError);
});
