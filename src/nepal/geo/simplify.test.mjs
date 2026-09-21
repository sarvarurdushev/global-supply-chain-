import test from 'node:test';
import assert from 'node:assert/strict';
import { countPositions, simplifyGeometry, simplifyRing } from './simplify.js';
import { pointInPolygon } from './geometry.js';

test('collinear points are removed and the shape is preserved', () => {
  const ring = [
    [85.0, 27.0], [85.1, 27.0], [85.2, 27.0], [85.3, 27.0],
    [85.3, 27.3], [85.0, 27.3], [85.0, 27.0],
  ];
  const simplified = simplifyRing(ring, 100, 27);
  assert.ok(simplified.length < ring.length, 'collinear vertices should go');
  assert.deepEqual(simplified[0], simplified[simplified.length - 1], 'ring stays closed');
});

test('a ring is never reduced below a valid ring', () => {
  const triangle = [[85, 27], [85.1, 27], [85.05, 27.1], [85, 27]];
  const simplified = simplifyRing(triangle, 1_000_000, 27);
  assert.ok(simplified.length >= 4, 'a polygon needs three positions and a closing repeat');
  const tiny = [[85, 27], [85.001, 27], [85, 27]];
  assert.equal(simplifyRing(tiny, 100_000, 27).length, tiny.length);
});

test('containment survives simplification at a sane tolerance', () => {
  // The property that actually matters: a point inside before must be inside
  // after. Simplifying past this is what put Patan in the wrong district.
  const ring = [];
  for (let angle = 0; angle <= 360; angle += 2) {
    const radians = (angle * Math.PI) / 180;
    ring.push([85 + 0.3 * Math.cos(radians), 27.5 + 0.3 * Math.sin(radians)]);
  }
  const polygon = { type: 'Polygon', coordinates: [ring] };
  const simplified = simplifyGeometry(polygon, 200, 27.5);
  assert.ok(countPositions(simplified) < countPositions(polygon));
  for (const point of [[85, 27.5], [85.1, 27.55], [84.95, 27.45]]) {
    assert.equal(pointInPolygon(point, polygon), true);
    assert.equal(pointInPolygon(point, simplified), true, `${point} left the polygon`);
  }
  assert.equal(pointInPolygon([85.5, 27.5], simplified), false, 'outside stays outside');
});

test('tolerance is metres, so latitude changes how many degrees that is', () => {
  // A circle, because it has area. The same metre tolerance covers more
  // degrees of longitude further from the equator, so it removes more.
  const circle = (lat) => {
    const ring = [];
    for (let angle = 0; angle <= 360; angle += 2) {
      const radians = (angle * Math.PI) / 180;
      ring.push([85 + 0.3 * Math.cos(radians), lat + 0.3 * Math.sin(radians)]);
    }
    return ring;
  };
  const atEquator = simplifyRing(circle(0), 500, 0).length;
  const atSixty = simplifyRing(circle(60), 500, 60).length;
  assert.ok(atSixty < atEquator, `${atSixty} should be fewer than ${atEquator}`);
});

test('a ring with no area is returned untouched rather than collapsed', () => {
  // Degenerate input: a "ring" that is really a line there and back. Douglas-
  // Peucker reduces it to two points, which is not a ring, so the guard
  // returns the original instead of emitting invalid geometry.
  const line = [];
  for (let i = 0; i <= 50; i += 1) line.push([85 + i * 0.001, 27]);
  for (let i = 50; i >= 0; i -= 1) line.push([85 + i * 0.001, 27]);
  const simplified = simplifyRing(line, 5000, 27);
  assert.equal(simplified.length, line.length, 'degenerate rings are left alone');
});

test('multipolygons and holes are simplified ring by ring', () => {
  const geometry = {
    type: 'MultiPolygon',
    coordinates: [
      [[[85, 27], [85.4, 27], [85.4, 27.4], [85, 27.4], [85, 27]],
       [[85.1, 27.1], [85.2, 27.1], [85.2, 27.2], [85.1, 27.2], [85.1, 27.1]]],
      [[[86, 28], [86.2, 28], [86.2, 28.2], [86, 28.2], [86, 28]]],
    ],
  };
  const simplified = simplifyGeometry(geometry, 50, 27.5);
  assert.equal(simplified.type, 'MultiPolygon');
  assert.equal(simplified.coordinates.length, 2);
  assert.equal(simplified.coordinates[0].length, 2, 'the hole survives');
});

test('non-polygon geometry passes through untouched', () => {
  const line = { type: 'LineString', coordinates: [[85, 27], [86, 28]] };
  assert.deepEqual(simplifyGeometry(line, 100, 27), line);
  assert.equal(simplifyGeometry(null, 100, 27), null);
});
