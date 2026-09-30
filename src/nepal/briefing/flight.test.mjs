import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flightLift, interpolateView, shortestTurn } from './flight.js';

const A = { lon: 84.73, lat: 28.23, range: 520_000, heading: 12, pitch: -58 };
const B = { lon: 85.05, lat: 27.97, range: 1_150_000, heading: 0, pitch: -72 };

test('a flight starts at its origin and lands exactly on its target', () => {
  assert.deepEqual(interpolateView(A, B, 0), { ...A });
  assert.deepEqual(interpolateView(A, B, 1), { ...B });
  assert.deepEqual(interpolateView(A, B, 1.4), { ...B });
});

test('heading turns the short way round', () => {
  assert.equal(shortestTurn(350, 10), 20);
  assert.equal(shortestTurn(10, 350), -20);
  const mid = interpolateView({ ...A, heading: 350 }, { ...A, heading: 10 }, 0.5);
  assert.ok(Math.abs(shortestTurn(0, mid.heading)) < 1e-9);
});

test('range moves evenly in log space and rises on a long move', () => {
  const inPlace = interpolateView({ ...A, range: 100_000 }, { ...A, range: 10_000_000 }, 0.5);
  assert.ok(Math.abs(inPlace.range - 1_000_000) < 1);
  assert.equal(flightLift(A, { ...A, heading: 90 }), 0);
  assert.ok(flightLift(A, B) > 0);
  const far = { ...A, lon: 70, lat: 20 };
  assert.equal(flightLift(A, far), 0.8);
});

test('every intermediate view is between its endpoints except for the lift', () => {
  for (let t = 0; t <= 1; t += 0.05) {
    const v = interpolateView(A, B, t);
    assert.ok(v.lat <= A.lat + 1e-9 && v.lat >= B.lat - 1e-9);
    assert.ok(v.pitch <= A.pitch + 1e-9 && v.pitch >= B.pitch - 1e-9);
  }
});
