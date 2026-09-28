import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFLINE_CREDIT,
  OFFLINE_TILE_SIZE,
  graticuleStep,
  gridValues,
  paintOfflineTile,
  tileBounds,
} from './offlineImagery.js';

/** A 2D context that records what was asked of it. */
function recordingContext() {
  const calls = { fillRect: [], lines: [], text: [], styles: [] };
  let current = null;
  return {
    calls,
    set fillStyle(value) {
      calls.styles.push(['fill', value]);
    },
    set strokeStyle(value) {
      calls.styles.push(['stroke', value]);
    },
    set lineWidth(value) {
      calls.styles.push(['width', value]);
    },
    set font(value) {
      calls.styles.push(['font', value]);
    },
    fillRect: (...args) => calls.fillRect.push(args),
    beginPath() {
      current = {};
    },
    moveTo(x, y) {
      current.from = [x, y];
    },
    lineTo(x, y) {
      current.to = [x, y];
    },
    stroke() {
      calls.lines.push(current);
    },
    fillText: (...args) => calls.text.push(args),
  };
}

test('a tile is painted, not fetched', () => {
  /*
   * The whole value of this provider is that it works with the network gone.
   * Nothing here may reach for one.
   */
  const ctx = recordingContext();
  const result = paintOfflineTile(ctx, { x: 1, y: 0, level: 2 });
  assert.deepEqual(
    ctx.calls.fillRect[0],
    [0, 0, OFFLINE_TILE_SIZE, OFFLINE_TILE_SIZE],
    'the surface is filled first',
  );
  assert.ok(result.lines > 0, 'a graticule was drawn');
});

test('the graticule densifies as the view descends, and never runs away', () => {
  /*
   * One step per tile, so the grid gets finer with depth. An unbounded step
   * search would draw thousands of hairlines into a level-14 tile and stall
   * the frame that needed it.
   */
  const counts = [0, 2, 4, 6, 8, 10, 12].map((level) => {
    const ctx = recordingContext();
    return paintOfflineTile(ctx, { x: 0, y: 0, level }).lines;
  });
  for (const count of counts) {
    assert.ok(count >= 1, 'every level draws something');
    assert.ok(count <= 40, `a tile drew ${count} lines`);
  }
});

test('the tiling arithmetic is geographic, 2:1 at the top', () => {
  /*
   * Cesium's GeographicTilingScheme has 2^(level+1) columns and 2^level rows.
   * Getting it backwards puts the graticule at double spacing in one axis —
   * which looks entirely plausible on screen and is wrong.
   */
  assert.deepEqual({ ...tileBounds(0, 0, 0) }, { west: -180, east: 0, north: 90, south: -90 });
  assert.deepEqual({ ...tileBounds(1, 0, 0) }, { west: 0, east: 180, north: 90, south: -90 });
  /* Two columns, one row at the top: the world is 2:1, not square. */
  assert.deepEqual({ ...tileBounds(0, 0, 1) }, { west: -180, east: -90, north: 90, south: 0 });
  assert.deepEqual({ ...tileBounds(3, 1, 1) }, { west: 90, east: 180, north: 0, south: -90 });

  /* And the whole world is covered exactly once at every level. */
  for (const level of [0, 1, 2, 5]) {
    const columns = 2 ** (level + 1);
    const rows = 2 ** level;
    assert.equal(tileBounds(0, 0, level).west, -180);
    assert.equal(tileBounds(columns - 1, 0, level).east, 180);
    assert.equal(tileBounds(0, 0, level).north, 90);
    assert.equal(tileBounds(0, rows - 1, level).south, -90);
  }

  /*
   * Nepal sits where it should. Level 4 is 32 × 16 tiles of 11.25°, so
   * 84°E 28°N is column floor(264 / 11.25) = 23, row floor(62 / 11.25) = 5.
   */
  const tile = tileBounds(23, 5, 4);
  assert.deepEqual({ ...tile }, { west: 78.75, east: 90, north: 33.75, south: 22.5 });
  assert.ok(tile.west <= 84 && 84 < tile.east, `84E not in ${tile.west}..${tile.east}`);
  assert.ok(tile.south < 28 && 28 <= tile.north, `28N not in ${tile.south}..${tile.north}`);
});

test('the equator and prime meridian are drawn brighter, where they fall', () => {
  const ctx = recordingContext();
  /* Level 1, tile (0,1): the western hemisphere's southern half. */
  paintOfflineTile(ctx, { x: 0, y: 1, level: 1 });
  const strokes = ctx.calls.styles.filter(([kind]) => kind === 'stroke').map(([, v]) => v);
  assert.ok(strokes.some((value) => value.includes('0.4')), 'an emphasis stroke was set');
});

test('a Nepal-scale tile draws degree lines, not the 30th parallel alone', () => {
  /*
   * The first step search went coarse-to-fine and returned the first fit,
   * which is always 30° — the Scene 01 view of Nepal drew one line.
   */
  const nepal = paintOfflineTile(recordingContext(), { x: 94, y: 21, level: 6 });
  assert.equal(nepal.step, 1);
  assert.ok(nepal.meridians.length >= 2 && nepal.meridians.length <= 4);
  assert.equal(graticuleStep(360), 30, 'the whole world stays coarse');
  assert.equal(graticuleStep(0.05), 0.1, 'and the finest step is a floor');
});

test('steps nest, so a line cannot stop dead at a tile seam', () => {
  const steps = [180, 90, 45, 22.5, 11.25, 5.625, 2.8125, 1.40625, 0.703125, 0.3515625, 0.17578125].map(graticuleStep);
  for (let i = 1; i < steps.length; i += 1) {
    const ratio = steps[i - 1] / steps[i];
    assert.ok(Math.abs(ratio - Math.round(ratio)) < 1e-9, `${steps[i - 1]} is not a multiple of ${steps[i]}`);
  }
});

test('grid values are whole steps, immune to floating-point drift', () => {
  /* -179.7 / 0.1 is -1796.9999999999998; a plain ceil() skips that line. */
  assert.deepEqual(gridValues(-179.7, -179.45, 0.1), [-179.7, -179.6, -179.5]);
  assert.deepEqual(gridValues(78.75, 81.5625, 1), [79, 80, 81]);
  /* Half-open: a tile's east edge belongs to the next tile. */
  assert.deepEqual(gridValues(80, 90, 5), [80, 85]);
});

test('a tile carries no text, because magnified text is a smear', () => {
  /*
   * During a descent Cesium draws an ancestor tile magnified until the finer
   * tiles land. A label baked into a level-5 tile crossed Scene 08 at 300px.
   */
  for (const tile of [
    { x: 1, y: 0, level: 2 },
    { x: 94, y: 21, level: 6 },
    { x: 380, y: 87, level: 8 },
  ]) {
    const ctx = recordingContext();
    paintOfflineTile(ctx, tile);
    assert.deepEqual(ctx.calls.text, []);
    assert.equal(ctx.calls.fillRect.length, 1, 'the surface fill, and no tick marks');
  }
});

test('the credit says what this is, and does not claim to be imagery', () => {
  /*
   * It must never be mistaken for satellite imagery — that would be the
   * fallback telling a lie the real basemap never told.
   */
  assert.match(OFFLINE_CREDIT, /offline map treatment/i);
  assert.match(OFFLINE_CREDIT, /no imagery provider reachable/i);
  assert.match(OFFLINE_CREDIT, /real data/i);
  assert.doesNotMatch(OFFLINE_CREDIT, /satellite|aerial|imagery ©|photo/i);
});
