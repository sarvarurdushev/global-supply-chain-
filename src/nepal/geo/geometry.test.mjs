import test from 'node:test';
import assert from 'node:assert/strict';
import { Issue } from '../quality.js';
import {
  NEPAL_BBOX,
  geometryBbox,
  geometryKey,
  insideBbox,
  pointInPolygon,
  representativePoint,
  validateGeometry,
  validatePosition,
} from './geometry.js';

test('null island is caught as a sentinel, not accepted as a coordinate', () => {
  const check = validatePosition([0, 0]);
  assert.equal(check.ok, false);
  assert.match(check.reason, /null island/);
});

test('out-of-range and non-finite coordinates are distinguished', () => {
  assert.equal(validatePosition([200, 20]).code, Issue.INVALID_COORDINATE);
  assert.equal(validatePosition([NaN, 20]).code, Issue.MISSING_COORDINATE);
  assert.equal(validatePosition([85]).code, Issue.MISSING_COORDINATE);
  assert.equal(validatePosition([85.3, 27.7]).ok, true);
});

test('un-reprojected UTM is reported as a CRS fault, not as a bad record', () => {
  // The real NGA bounding-box corner, read as degrees. Both checks that can
  // catch it must say what is actually wrong, because "out of range" sends a
  // reader hunting for a corrupt feature instead of a missing reprojection.
  const projected = validateGeometry({ type: 'Point', coordinates: [244411, 3014211] });
  assert.equal(projected.ok, false);
  assert.equal(projected.code, Issue.INVALID_COORDINATE);
  assert.match(projected.reason, /check the CRS/);

  // In-range but outside Nepal: a valid coordinate in the wrong place.
  const elsewhere = validateGeometry({ type: 'Point', coordinates: [12.4964, 41.9028] });
  assert.equal(elsewhere.ok, false);
  assert.equal(elsewhere.code, Issue.OUT_OF_STUDY_AREA);
  assert.match(elsewhere.reason, /outside the study area/);
});

test('degenerate lines and rings are rejected', () => {
  assert.match(
    validateGeometry({ type: 'LineString', coordinates: [[85.3, 27.7]] }).reason,
    /fewer than 2 points/,
  );
  assert.match(
    validateGeometry({
      type: 'Polygon',
      coordinates: [[[85.3, 27.7], [85.4, 27.7], [85.3, 27.7]]],
    }).reason,
    /fewer than 4 positions/,
  );
  assert.match(validateGeometry(null).reason, /null geometry/);
  assert.match(
    validateGeometry({ type: 'Point', coordinates: [] }).reason,
    /no coordinates/,
  );
});

test('a valid Nepal geometry passes and reports how much it carries', () => {
  const check = validateGeometry({
    type: 'LineString',
    coordinates: [[85.3, 27.7], [85.4, 27.75], [85.5, 27.8]],
  });
  assert.equal(check.ok, true);
  assert.equal(check.positions, 3);
});

test('the duplicate key tolerates re-digitising noise but not a different place', () => {
  const a = { type: 'Point', coordinates: [85.30000001, 27.70000001] };
  const b = { type: 'Point', coordinates: [85.30000002, 27.70000002] };
  const c = { type: 'Point', coordinates: [85.31, 27.7] };
  assert.equal(geometryKey(a), geometryKey(b));
  assert.notEqual(geometryKey(a), geometryKey(c));
});

test('bbox, representative point and bbox containment', () => {
  const geometry = {
    type: 'Polygon',
    coordinates: [[[85.0, 27.6], [85.2, 27.6], [85.2, 27.8], [85.0, 27.8], [85.0, 27.6]]],
  };
  assert.deepEqual(geometryBbox(geometry), [85.0, 27.6, 85.2, 27.8]);
  const point = representativePoint(geometry);
  assert.ok(point[0] > 85.0 && point[0] < 85.2);
  assert.equal(insideBbox([85.3, 27.7], NEPAL_BBOX), true);
  assert.equal(insideBbox([12.5, 41.9], NEPAL_BBOX), false);
});

test('point-in-polygon respects holes, which a district with an enclave needs', () => {
  const donut = {
    type: 'Polygon',
    coordinates: [
      [[85.0, 27.5], [86.0, 27.5], [86.0, 28.5], [85.0, 28.5], [85.0, 27.5]],
      [[85.4, 27.9], [85.6, 27.9], [85.6, 28.1], [85.4, 28.1], [85.4, 27.9]],
    ],
  };
  assert.equal(pointInPolygon([85.2, 27.7], donut), true, 'inside the ring');
  assert.equal(pointInPolygon([85.5, 28.0], donut), false, 'inside the hole');
  assert.equal(pointInPolygon([84.0, 27.7], donut), false, 'outside entirely');
  assert.equal(pointInPolygon([85.2, 27.7], { type: 'Point', coordinates: [0, 0] }), false);
});
