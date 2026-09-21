import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSOCIATION_TOLERANCES_METRES,
  blockedRoadGeometryCheck,
  deriveAssociationTolerance,
  infrastructureByArea,
  landslideGeometryCheck,
  landslideRoadAssociation,
  pointToPolygonMetres,
  pointToSegmentMetres,
  polygonAreaSqMetres,
  polylineLengthMetres,
  polylineToPolygonMetres,
  representativePosition,
  roadLandslideAssociation,
  segmentToSegmentMetres,
} from './infrastructure.js';

/** A square of the given side in degrees, anchored at (lon, lat). */
const square = (lon, lat, side) => ({
  type: 'Polygon',
  coordinates: [[
    [lon, lat],
    [lon + side, lat],
    [lon + side, lat + side],
    [lon, lat + side],
    [lon, lat],
  ]],
});

const line = (coordinates) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates } });

test('a polyline length matches the projected distance', () => {
  // One hundredth of a degree of longitude at 27 N is about 992 m.
  const length = polylineLengthMetres([[85, 27], [85.01, 27]]);
  assert.ok(Math.abs(length - 992.6) < 1, `got ${length}`);
  // A doubled-back line counts both legs.
  assert.ok(
    Math.abs(polylineLengthMetres([[85, 27], [85.01, 27], [85, 27]]) - 2 * length) < 1e-6,
  );
});

test('polygon area subtracts holes', () => {
  const solid = polygonAreaSqMetres(square(85, 27, 0.01));
  const holed = polygonAreaSqMetres({
    type: 'Polygon',
    coordinates: [
      square(85, 27, 0.01).coordinates[0],
      square(85.002, 27.002, 0.002).coordinates[0],
    ],
  });
  assert.ok(solid > holed, 'a hole must reduce the area');
  const hole = polygonAreaSqMetres(square(85.002, 27.002, 0.002));
  assert.ok(Math.abs(solid - hole - holed) < 1e-6);
});

test('segment distance is zero when segments cross and exact when parallel', () => {
  assert.equal(segmentToSegmentMetres([0, 0], [10, 10], [0, 10], [10, 0]), 0);
  assert.equal(segmentToSegmentMetres([0, 0], [10, 0], [0, 5], [10, 5]), 5);
  // Collinear but disjoint: the gap between the near endpoints.
  assert.equal(segmentToSegmentMetres([0, 0], [10, 0], [13, 0], [20, 0]), 3);
  assert.equal(pointToSegmentMetres([5, 4], [0, 0], [10, 0]), 4);
});

test('a line crossing a polygon is at distance zero; a line beside it is not', () => {
  const polygon = square(85, 27, 0.01);
  assert.equal(polylineToPolygonMetres([[84.99, 27.005], [85.02, 27.005]], polygon), 0);
  // A line entirely inside also returns zero.
  assert.equal(polylineToPolygonMetres([[85.002, 27.002], [85.004, 27.004]], polygon), 0);
  const beside = polylineToPolygonMetres([[85.02, 27.0], [85.02, 27.01]], polygon);
  assert.ok(Math.abs(beside - 992.5) < 1, `got ${beside}`);
});

test('a line crossing between two widely spaced vertices is still detected', () => {
  /*
   * The reason this is measured against SEGMENTS and not sampled vertices: a
   * road drawn with two points a kilometre apart passes straight through the
   * slide, and every vertex of it lies outside.
   */
  const polygon = square(85, 27, 0.002);
  const crossing = [[84.99, 27.001], [85.01, 27.001]];
  assert.equal(polylineToPolygonMetres(crossing, polygon), 0);
});

test('point to polygon is zero inside and the boundary distance outside', () => {
  const polygon = square(85, 27, 0.01);
  assert.equal(pointToPolygonMetres([85.005, 27.005], polygon), 0);
  assert.ok(Math.abs(pointToPolygonMetres([85.02, 27.005], polygon) - 992.6) < 1);
});

test('the blocked-road check measures what the features are before describing them', () => {
  const features = [
    line([[85, 27], [85.0005, 27]]),
    line([[85.1, 27], [85.1008, 27]]),
    line([[85.2, 27], [85.21, 27]]),
  ];
  const check = blockedRoadGeometryCheck(features);
  assert.equal(check.features, 3);
  assert.ok(check.lengthMetres.median > 0 && check.lengthMetres.median < check.lengthMetres.max);
  assert.match(check.interpretation, /OBSTRUCTION MARKER/);
  assert.match(check.interpretation, /never from the marker/);
});

test('the association tolerance is derived from both geometries and never below the floor', () => {
  const roadCheck = { vertexSpacingMetres: { median: 14 } };
  const landslideCheck = { equivalentRadiusMetres: { median: 54 } };
  const tolerance = deriveAssociationTolerance(roadCheck, landslideCheck);
  assert.equal(tolerance.headlineMetres, 50);
  assert.ok(tolerance.headlineMetres >= tolerance.geometryFloorMetres);
  assert.match(tolerance.justification, /not a runout model/);

  // A tiny landslide population must not drag the tolerance below the floor.
  const tiny = deriveAssociationTolerance(roadCheck, { equivalentRadiusMetres: { median: 3 } });
  assert.equal(tiny.headlineMetres, 25);
});

test('road-landslide association reports a curve and never claims causation', () => {
  const slide = { type: 'Feature', geometry: square(85, 27, 0.002) };
  const roads = [
    line([[85.0005, 27.0005], [85.0015, 27.0005]]), // inside the slide
    line([[85.0025, 27.001], [85.0035, 27.001]]), // about 50 m east of it
    line([[85.5, 27.5], [85.51, 27.5]]), // far away
  ];
  const result = roadLandslideAssociation(roads, [slide]);
  assert.equal(result.curve.length, ASSOCIATION_TOLERANCES_METRES.length);
  assert.equal(result.curve[0].toleranceMetres, 0);
  assert.equal(result.curve[0].features, 1);
  // The curve must be non-decreasing: a wider tolerance cannot match less.
  for (let i = 1; i < result.curve.length; i += 1) {
    assert.ok(result.curve[i].features >= result.curve[i - 1].features);
  }
  assert.equal(result.curve[result.curve.length - 1].features, 2);
  assert.match(result.causalityNote, /spatially associated with/i);
  assert.match(result.causalityNote, /no field linking/i);
});

test('the reverse association answers a different question', () => {
  const slides = [
    { type: 'Feature', geometry: square(85, 27, 0.002) },
    { type: 'Feature', geometry: square(86, 28, 0.002) },
  ];
  const roads = [line([[85.0005, 27.0005], [85.0015, 27.0005]])];
  const result = landslideRoadAssociation(slides, roads);
  assert.equal(result.landslideFeatures, 2);
  assert.equal(result.curve[0].features, 1);
  assert.equal(result.curve[result.curve.length - 1].features, 1);
});

test('the representative position of a line is its midpoint by length', () => {
  /*
   * Vertices bunched at one end: the mean of the vertices sits near the bunch,
   * the midpoint by length sits in the middle where it belongs.
   */
  const geometry = {
    type: 'LineString',
    coordinates: [[85, 27], [85.0001, 27], [85.0002, 27], [85.01, 27]],
  };
  const [lon] = representativePosition(geometry);
  assert.ok(Math.abs(lon - 85.005) < 0.0002, `got ${lon}`);
  assert.deepEqual(representativePosition({ type: 'Point', coordinates: [1, 2] }), [1, 2]);
});

test('infrastructure is grouped by district and by intensity band', () => {
  const features = [
    line([[85, 27], [85.01, 27]]),
    line([[86, 28], [86.01, 28]]),
  ];
  const result = infrastructureByArea(features, {
    districtOf: (lon) => (lon < 85.5 ? 'West' : 'East'),
    intensityOf: (lon) => (lon < 85.5 ? 8 : null),
    pointOf: (feature) => representativePosition(feature.geometry),
  });
  assert.equal(result.byDistrict.length, 2);
  assert.deepEqual(result.byIntensity.map((row) => row.id).sort(), ['MMI 8', 'outside contours']);
  assert.ok(result.byDistrict[0].lengthMetres > 900);
});

test('landslide geometry reports the characteristic size the tolerance rests on', () => {
  const features = [
    { type: 'Feature', geometry: square(85, 27, 0.001) },
    { type: 'Feature', geometry: square(86, 28, 0.003) },
  ];
  const check = landslideGeometryCheck(features);
  assert.equal(check.features, 2);
  assert.ok(check.equivalentRadiusMetres.median > 0);
  assert.ok(check.equivalentRadiusMetres.max > check.equivalentRadiusMetres.min);
  assert.ok(check.totalAreaHectares > 0);
});
