import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRasterReader,
  decodeLzw,
  geoToPixel,
  pixelToGeo,
  rasterBounds,
  readGeoTiffHeader,
  readRow,
  undoHorizontalDifferencing,
} from './geotiff.js';

/**
 * Build a classic little-endian TIFF with uncompressed float32 rows, so the
 * header, georeferencing and sample decoding are covered without a network.
 */
function buildTiff(rows, { predictor = 1, origin = [80, 30], scale = [0.001, 0.001], noData = -99999 } = {}) {
  const height = rows.length;
  const width = rows[0].length;
  const pixelBytes = width * height * 4;
  const tagCount = 14;
  const ifdAt = 8;
  const ifdBytes = 2 + tagCount * 12 + 4;
  const extrasAt = ifdAt + ifdBytes;
  const scaleAt = extrasAt;
  const tieAt = scaleAt + 24;
  const noDataAt = tieAt + 48;
  const noDataText = `${noData}\0`;
  const stripOffsetsAt = noDataAt + noDataText.length;
  const stripCountsAt = stripOffsetsAt + height * 4;
  const pixelsAt = stripCountsAt + height * 4;
  const out = new Uint8Array(pixelsAt + pixelBytes);
  const view = new DataView(out.buffer);

  out[0] = 0x49; out[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdAt, true);
  view.setUint16(ifdAt, tagCount, true);

  let entry = 0;
  const tag = (id, type, count, value) => {
    const at = ifdAt + 2 + entry * 12;
    view.setUint16(at, id, true);
    view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, count, true);
    view.setUint32(at + 8, value, true);
    entry += 1;
  };
  tag(256, 3, 1, width);
  tag(257, 3, 1, height);
  tag(258, 3, 1, 32);
  tag(259, 3, 1, 1);
  tag(273, 4, height, stripOffsetsAt);
  tag(277, 3, 1, 1);
  tag(278, 3, 1, 1);
  tag(279, 4, height, stripCountsAt);
  tag(284, 3, 1, 1);
  tag(317, 3, 1, predictor);
  tag(339, 3, 1, 3);
  tag(33550, 12, 3, scaleAt);
  tag(33922, 12, 6, tieAt);
  tag(42113, 2, noDataText.length, noDataAt);

  view.setFloat64(scaleAt, scale[0], true);
  view.setFloat64(scaleAt + 8, scale[1], true);
  view.setFloat64(tieAt + 24, origin[0], true);
  view.setFloat64(tieAt + 32, origin[1], true);
  for (let i = 0; i < noDataText.length; i += 1) out[noDataAt + i] = noDataText.charCodeAt(i);

  for (let r = 0; r < height; r += 1) {
    view.setUint32(stripOffsetsAt + r * 4, pixelsAt + r * width * 4, true);
    view.setUint32(stripCountsAt + r * 4, width * 4, true);
    for (let c = 0; c < width; c += 1) {
      view.setFloat32(pixelsAt + (r * width + c) * 4, rows[r][c], true);
    }
  }
  return out;
}

const GRID = [
  [1, 2, 3],
  [4, -99999, 6],
];

test('header, georeferencing and bounds come back as written', () => {
  const header = readGeoTiffHeader(buildTiff(GRID));
  assert.equal(header.width, 3);
  assert.equal(header.height, 2);
  assert.equal(header.bitsPerSample, 32);
  assert.equal(header.sampleFormat, 3);
  assert.equal(header.noData, -99999);
  assert.deepEqual([...header.origin], [80, 30]);
  assert.deepEqual(rasterBounds(header), [80, 30 - 2 * 0.001, 80 + 3 * 0.001, 30]);
});

test('rows decode to the values written, nodata included', () => {
  const bytes = buildTiff(GRID);
  const header = readGeoTiffHeader(bytes);
  assert.deepEqual([...readRow(bytes, header, 0)], [1, 2, 3]);
  assert.deepEqual([...readRow(bytes, header, 1)], [4, -99999, 6]);
  assert.throws(() => readRow(bytes, header, 2), /outside the raster/);
});

test('pixel and geographic coordinates round-trip through the centre', () => {
  const header = readGeoTiffHeader(buildTiff(GRID));
  const [lon, lat] = pixelToGeo(header, 0, 0);
  const [col, row] = geoToPixel(header, lon, lat);
  assert.ok(Math.abs(col - 0.5) < 1e-9);
  assert.ok(Math.abs(row - 0.5) < 1e-9);
});

test('the reader caches the strip it last decoded', () => {
  const reader = createRasterReader(buildTiff(GRID));
  assert.deepEqual([...reader.readRow(0)], [1, 2, 3]);
  assert.deepEqual([...reader.readRow(0)], [1, 2, 3]);
  assert.deepEqual([...reader.readRow(1)], [4, -99999, 6]);
  assert.throws(() => reader.readRow(-1), /outside the raster/);
});

test('horizontal differencing on 32-bit samples accumulates as unsigned integers', () => {
  /*
   * The trap in WorldPop's UN-adjusted raster. libtiff accumulates 32-bit
   * samples as uint32 even when the sample format is IEEE float, so summing
   * in floating point produces a raster of the right size and shape that is
   * quietly wrong. Here: two float32 values written as their differenced
   * uint32 representation must come back as the originals.
   */
  const header = { width: 3, height: 1, bitsPerSample: 32, little: true };
  const original = Float32Array.of(1.5, 2.5, 3.5);
  const asInts = new Uint32Array(original.buffer.slice(0));
  const differenced = new Uint32Array(3);
  differenced[0] = asInts[0];
  for (let i = 1; i < 3; i += 1) differenced[i] = (asInts[i] - asInts[i - 1]) >>> 0;
  const bytes = new Uint8Array(differenced.buffer.slice(0));

  undoHorizontalDifferencing(bytes, header, 1);
  const restored = new Float32Array(bytes.buffer.slice(0));
  assert.deepEqual([...restored], [1.5, 2.5, 3.5]);
});

test('unsupported encodings are refused loudly rather than decoded to noise', () => {
  const bytes = buildTiff(GRID);
  const view = new DataView(bytes.buffer);
  // Compression tag is the fourth entry; set it to JPEG.
  view.setUint32(8 + 2 + 3 * 12 + 8, 7, true);
  assert.throws(() => readGeoTiffHeader(bytes), /Compression 7 is not supported/);

  const bad = buildTiff(GRID, { predictor: 3 });
  assert.throws(() => readGeoTiffHeader(bad), /Predictor 3 is not supported/);
  assert.throws(() => readGeoTiffHeader(new Uint8Array(32)), /Not a TIFF/);
});

test('LZW decodes a stream produced by the TIFF variant', () => {
  // Codes are packed MSB-first, so a decoder that reads them LSB-first
  // produces output of the right length and the wrong bytes.
  //
  // Trace: Clear resets the table; 'A' emits A with nothing to extend; 'B'
  // emits B and adds "AB" at 258; code 258 emits "AB" and adds "BA" at 259.
  const codes = [256, 65, 66, 258, 257]; // Clear, A, B, AB, EOI
  let bits = '';
  for (const code of codes) bits += code.toString(2).padStart(9, '0');
  while (bits.length % 8) bits += '0';
  const bytes = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  assert.equal(new TextDecoder().decode(decodeLzw(bytes)), 'ABAB');
});
