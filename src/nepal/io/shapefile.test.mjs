import test from 'node:test';
import assert from 'node:assert/strict';
import { ShapeType, readPrj, readShp } from './shapefile.js';
import { readDbf } from './dbf.js';

/** Build a .shp with the given records, so the test needs no network. */
function buildShp(shapeType, records) {
  const chunks = [];
  let recordNumber = 1;
  for (const content of records) {
    const header = new DataView(new ArrayBuffer(8));
    header.setInt32(0, recordNumber, false);
    header.setInt32(4, content.byteLength / 2, false);
    chunks.push(new Uint8Array(header.buffer), new Uint8Array(content));
    recordNumber += 1;
  }
  const body = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(100 + body);
  const head = new DataView(out.buffer);
  head.setInt32(0, 9994, false);
  head.setInt32(24, (100 + body) / 2, false);
  head.setInt32(28, 1000, true);
  head.setInt32(32, shapeType, true);
  for (let i = 0; i < 4; i += 1) head.setFloat64(36 + i * 8, [84, 27, 86, 29][i], true);
  let at = 100;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

function pointRecord(lon, lat, type = ShapeType.POINT) {
  const buffer = new ArrayBuffer(20);
  const view = new DataView(buffer);
  view.setInt32(0, type, true);
  view.setFloat64(4, lon, true);
  view.setFloat64(12, lat, true);
  return buffer;
}

function polygonRecord(rings) {
  const points = rings.reduce((n, r) => n + r.length, 0);
  const buffer = new ArrayBuffer(44 + rings.length * 4 + points * 16);
  const view = new DataView(buffer);
  view.setInt32(0, ShapeType.POLYGON, true);
  for (let i = 0; i < 4; i += 1) view.setFloat64(4 + i * 8, 0, true);
  view.setInt32(36, rings.length, true);
  view.setInt32(40, points, true);
  let start = 0;
  rings.forEach((ring, i) => {
    view.setInt32(44 + i * 4, start, true);
    start += ring.length;
  });
  let at = 44 + rings.length * 4;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      view.setFloat64(at, lon, true);
      view.setFloat64(at + 8, lat, true);
      at += 16;
    }
  }
  return buffer;
}

test('points are read as GeoJSON in lon,lat order', () => {
  const shp = readShp(buildShp(ShapeType.POINT, [pointRecord(85.324, 27.7172)]));
  assert.equal(shp.kind, 'Point');
  assert.deepEqual(shp.geometries[0], { type: 'Point', coordinates: [85.324, 27.7172] });
  assert.deepEqual(shp.bbox, [84, 27, 86, 29]);
});

test('a Z variant reads its x/y and reports that Z was present', () => {
  // The NGA layers are PolylineZ and PolygonZ whose Z is a placeholder.
  // Carrying a fake elevation into a 3D view is worse than carrying none.
  const shp = readShp(buildShp(ShapeType.POINT_Z, [pointRecord(85.3, 27.7, ShapeType.POINT_Z)]));
  assert.equal(shp.kind, 'Point');
  assert.equal(shp.hasZ, true);
  assert.equal(shp.geometries[0].coordinates.length, 2, 'no third ordinate leaks through');
});

/*
 * Shapefile winding, stated once because it is easy to get backwards and the
 * failure is silent: an OUTER ring is CLOCKWISE in a Y-up frame
 * (right, up, left, down), and a hole is counter-clockwise and belongs to the
 * outer ring that precedes it.
 */
const CLOCKWISE_OUTER = [[85.0, 27.5], [86.0, 27.5], [86.0, 28.5], [85.0, 28.5], [85.0, 27.5]];
const COUNTER_CLOCKWISE_HOLE = [[85.4, 27.9], [85.4, 28.1], [85.6, 28.1], [85.6, 27.9], [85.4, 27.9]];

test('a clockwise ring followed by a counter-clockwise ring becomes a polygon with a hole', () => {
  // Shapefile encodes holes by winding only. Read as a flat ring list, every
  // hole silently becomes an island and any area is overstated.
  const shp = readShp(
    buildShp(ShapeType.POLYGON, [polygonRecord([CLOCKWISE_OUTER, COUNTER_CLOCKWISE_HOLE])]),
  );
  assert.equal(shp.geometries[0].type, 'Polygon');
  assert.equal(shp.geometries[0].coordinates.length, 2, 'outer ring plus one hole');
});

test('two clockwise rings become a MultiPolygon, not a polygon with a hole', () => {
  const a = [[85.0, 27.5], [85.5, 27.5], [85.5, 28.0], [85.0, 28.0], [85.0, 27.5]];
  const b = [[86.0, 27.5], [86.5, 27.5], [86.5, 28.0], [86.0, 28.0], [86.0, 27.5]];
  const shp = readShp(buildShp(ShapeType.POLYGON, [polygonRecord([a, b])]));
  assert.equal(shp.geometries[0].type, 'MultiPolygon');
  assert.equal(shp.geometries[0].coordinates.length, 2);
});

test('a leading hole is kept rather than discarded', () => {
  // Malformed input: a counter-clockwise ring with no outer ring before it.
  // Dropping it would lose geometry silently, so it is promoted to a polygon.
  const shp = readShp(buildShp(ShapeType.POLYGON, [polygonRecord([COUNTER_CLOCKWISE_HOLE])]));
  assert.equal(shp.geometries[0].type, 'Polygon');
  assert.equal(shp.geometries[0].coordinates.length, 1);
});

test('a null shape is null, not an empty geometry', () => {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setInt32(0, ShapeType.NULL, true);
  const shp = readShp(buildShp(ShapeType.POINT, [buffer]));
  assert.equal(shp.geometries[0], null);
});

test('a file that is not a shapefile is refused', () => {
  assert.throws(() => readShp(new Uint8Array(200)), /Not a shapefile/);
});

test('the .prj reader answers the only question the Nepal package poses', () => {
  const utm = readPrj('PROJCS["WGS_1984_UTM_Zone_45N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984"]]]');
  assert.equal(utm.kind, 'projected');
  assert.equal(utm.zone, 45);
  assert.equal(utm.north, true);
  assert.equal(utm.epsg, 32645);

  const geographic = readPrj('GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257]]]');
  assert.equal(geographic.kind, 'geographic');
  assert.equal(geographic.epsg, 4326);

  assert.equal(readPrj('').kind, 'unknown');
  assert.equal(readPrj(null).epsg, null);
});

/** Build a tiny DBF so the attribute reader is covered too. */
function buildDbf(fields, rows) {
  const headerLength = 32 + fields.length * 32 + 1;
  const recordLength = 1 + fields.reduce((n, f) => n + f.length, 0);
  const out = new Uint8Array(headerLength + rows.length * recordLength + 1);
  const view = new DataView(out.buffer);
  out[0] = 0x03;
  view.setUint32(4, rows.length, true);
  view.setUint16(8, headerLength, true);
  view.setUint16(10, recordLength, true);
  fields.forEach((field, i) => {
    const at = 32 + i * 32;
    for (let c = 0; c < field.name.length && c < 11; c += 1) out[at + c] = field.name.charCodeAt(c);
    out[at + 11] = field.type.charCodeAt(0);
    out[at + 16] = field.length;
  });
  out[headerLength - 1] = 0x0d;
  let at = headerLength;
  for (const row of rows) {
    out[at] = row.__deleted ? 0x2a : 0x20;
    let cell = at + 1;
    for (const field of fields) {
      const text = String(row[field.name] ?? '').padEnd(field.length, ' ');
      for (let c = 0; c < field.length; c += 1) out[cell + c] = text.charCodeAt(c) & 0xff;
      cell += field.length;
    }
    at += recordLength;
  }
  out[at] = 0x1a;
  return out;
}

test('DBF decodes the field types the UNOSAT and NGA tables use', () => {
  const fields = [
    { name: 'Main_Damag', type: 'C', length: 16 },
    { name: 'SensorDate', type: 'D', length: 8 },
    { name: 'ImageID_Nu', type: 'N', length: 6 },
    { name: 'Shape_Leng', type: 'F', length: 10 },
  ];
  const { rows, fields: read } = readDbf(
    buildDbf(fields, [
      { Main_Damag: 'Destroyed', SensorDate: '20150429', ImageID_Nu: '12', Shape_Leng: '1234.5' },
      { Main_Damag: '', SensorDate: '', ImageID_Nu: '', Shape_Leng: '' },
    ]),
  );
  assert.equal(read.length, 4);
  assert.equal(rows[0].Main_Damag, 'Destroyed');
  assert.equal(rows[0].SensorDate, '2015-04-29', 'a date stays a date, not a timestamp');
  assert.equal(rows[0].ImageID_Nu, 12);
  assert.equal(rows[0].Shape_Leng, 1234.5);
  // An empty cell is null. Returning '' would make "no damage class recorded"
  // indistinguishable from a class whose name happens to be blank.
  assert.equal(rows[1].Main_Damag, null);
  assert.equal(rows[1].ImageID_Nu, null);
});

test('records deleted in place are skipped but still counted in the header', () => {
  const fields = [{ name: 'NAME', type: 'C', length: 8 }];
  const dbf = readDbf(buildDbf(fields, [{ NAME: 'keep' }, { NAME: 'gone', __deleted: true }]));
  assert.equal(dbf.recordCount, 2);
  assert.equal(dbf.rows.length, 1);
  assert.equal(dbf.rows[0].NAME, 'keep');
});

test('a truncated DBF is refused', () => {
  assert.throws(() => readDbf(new Uint8Array(8)), /shorter than its header/);
});
