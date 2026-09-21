import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EPSG_UTM45N,
  STUDY_AREA_ZONE,
  distanceMetres,
  fromUtm,
  geometryFromUtm,
  ringAreaSqMetres,
  toUtm,
  utmZoneFor,
} from './crs.js';

test('geographic to UTM and back is lossless to well under a millimetre', () => {
  for (const [lon, lat] of [
    [85.324, 27.7172], // Kathmandu
    [84.708, 28.147], // Gorkha epicentre
    [85.3188, 27.6710], // Bhaktapur
  ]) {
    const utm = toUtm(lon, lat);
    const [backLon, backLat] = fromUtm(utm.easting, utm.northing);
    assert.ok(distanceMetres(lon, lat, backLon, backLat) < 0.001, `${lon},${lat}`);
  }
});

test('the UTM zone 45N constants are the ones the project measures in', () => {
  assert.equal(EPSG_UTM45N, 32645);
  assert.equal(STUDY_AREA_ZONE, 45);
  assert.equal(utmZoneFor(85.324), 45);
  assert.equal(utmZoneFor(84.708), 45);
  // Pokhara is just west of the zone boundary at 84 E.
  assert.equal(utmZoneFor(83.99), 44);
});

test('a point outside the study zone is flagged rather than silently distorted', () => {
  const inside = toUtm(85.324, 27.7172);
  assert.equal(inside.outsideZone, false);
  const outside = toUtm(83.99, 28.2);
  assert.equal(outside.outsideZone, true);
  // Still projected into zone 45 so distances inside the study area compose.
  assert.equal(outside.zone, 45);
});

test('the real NGA bounding box corner reprojects into Nepal', () => {
  // Read from NGA_Impassable_Roads_Nepal_May_7th_2015.shp, which is stored in
  // UTM 45N while the UNOSAT layers beside it are geographic. Reading it as
  // degrees would put the roads in the Gulf of Guinea.
  const [lon, lat] = fromUtm(244411.7299, 3014211.164);
  assert.ok(lon > 80 && lon < 89, `lon ${lon}`);
  assert.ok(lat > 26 && lat < 31, `lat ${lat}`);
});

test('geometry reprojection walks nested coordinates', () => {
  const line = geometryFromUtm({
    type: 'LineString',
    coordinates: [
      [334769.78, 3067000.01],
      [344769.78, 3067000.01],
    ],
  });
  assert.equal(line.type, 'LineString');
  assert.equal(line.coordinates.length, 2);
  assert.ok(Math.abs(line.coordinates[0][0] - 85.324) < 1e-5);
});

test('area is computed in metres, not square degrees', () => {
  // A ring roughly 0.1 x 0.1 degrees near Kathmandu. At 27.7 N a degree of
  // longitude is about 98.5 km and of latitude about 110.7 km, so the true
  // area is near 109 km^2 — a square-degree calculation would report 0.01.
  const ring = [
    [85.0, 27.6],
    [85.1, 27.6],
    [85.1, 27.7],
    [85.0, 27.7],
    [85.0, 27.6],
  ];
  const area = ringAreaSqMetres(ring);
  const km2 = area / 1e6;
  assert.ok(km2 > 100 && km2 < 120, `got ${km2.toFixed(1)} km2`);
});

test('non-finite input is refused rather than producing NaN coordinates', () => {
  assert.throws(() => toUtm(NaN, 27), /finite degrees/);
  assert.throws(() => fromUtm(undefined, 3), /finite metres/);
});
