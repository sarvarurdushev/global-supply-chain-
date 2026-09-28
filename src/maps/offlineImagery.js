/**
 * The last link in the imagery chain: a technical treatment, drawn locally.
 *
 * WHY IT EXISTS. The chain was Esri → OSM → nothing, and "nothing" is a bare
 * blue ellipsoid. Every screenshot taken during Stage 7 was of that failure
 * mode, because this sandbox blocks every tile host — which is the same thing
 * a conference room with a captive portal, a blocked domain or a dead provider
 * produces. A provider outage must not be able to destroy a presentation, and
 * an unlabelled blue sphere destroys it.
 *
 * WHAT IT IS NOT. It is not satellite imagery, and it must never be mistaken
 * for any: no invented coastlines, no fake terrain shading, no colours that
 * read as land and sea. It is a graticule on the product's own dark surface —
 * visibly a fallback, and honest about being one. The country's shape comes
 * from the case's own district boundaries, which are real data already loaded,
 * drawn over this as they are over any other basemap.
 *
 * NO NETWORK. Tiles are drawn into a canvas on demand, so the treatment works
 * with the network entirely gone. That is the whole point of it.
 */

import * as Cesium from 'cesium';

/** Tiles are square and small: this is a grid, not an image. */
export const OFFLINE_TILE_SIZE = 256;

export const OFFLINE_CREDIT =
  'Offline map treatment — no imagery provider reachable. Boundaries and analytical layers are real data.';

/**
 * Paint one tile.
 *
 * Exported so the drawing can be exercised without a Cesium viewer: the thing
 * that goes wrong in a generated basemap is arithmetic — a graticule that
 * drifts, a label on the wrong parallel — and none of that needs a globe to
 * catch.
 *
 * @param {object} ctx a 2D context
 * @param {object} tile `{x, y, level}`
 * @param {object} [options]
 * @returns {{lines: number, step: number, meridians: number[], parallels: number[]}}
 *   what it drew, for tests
 */
export function paintOfflineTile(
  ctx,
  { x, y, level },
  { size = OFFLINE_TILE_SIZE } = {},
) {
  const { west, east, north, south } = tileBounds(x, y, level);
  const lonSpan = east - west;
  const latSpan = north - south;
  const px = (lon) => ((lon - west) / lonSpan) * size;
  const py = (lat) => ((north - lat) / latSpan) * size;

  /*
   * A shade above the page background rather than equal to it. At the same
   * value the globe's limb vanished into space and the country floated in
   * nothing, which cost exactly the orientation this fallback exists to keep.
   */
  ctx.fillStyle = OFFLINE_SURFACE;
  ctx.fillRect(0, 0, size, size);

  const step = graticuleStep(lonSpan);
  const meridians = gridValues(west, east, step);
  const parallels = gridValues(south, north, step);

  ctx.strokeStyle = 'rgba(34, 217, 127, 0.22)';
  ctx.lineWidth = 1;
  let lines = 0;
  for (const lon of meridians) {
    ctx.beginPath();
    ctx.moveTo(px(lon) + 0.5, 0);
    ctx.lineTo(px(lon) + 0.5, size);
    ctx.stroke();
    lines += 1;
  }
  for (const lat of parallels) {
    ctx.beginPath();
    ctx.moveTo(0, py(lat) + 0.5);
    ctx.lineTo(size, py(lat) + 0.5);
    ctx.stroke();
    lines += 1;
  }

  /*
   * The equator and the prime meridian read brighter: at a glance they are
   * the only orientation a graticule alone can offer.
   */
  ctx.strokeStyle = 'rgba(34, 217, 127, 0.45)';
  if (south < 0 && north > 0) {
    ctx.beginPath();
    ctx.moveTo(0, py(0) + 0.5);
    ctx.lineTo(size, py(0) + 0.5);
    ctx.stroke();
  }
  if (west < 0 && east > 0) {
    ctx.beginPath();
    ctx.moveTo(px(0) + 0.5, 0);
    ctx.lineTo(px(0) + 0.5, size);
    ctx.stroke();
  }

  /*
   * NO TEXT IN THE TILES. Coordinate labels were drawn into each tile, and
   * while a camera descends Cesium shows an ancestor tile magnified until
   * the finer ones arrive — so a 11px "85°E" from a level-5 tile crossed the
   * Scene 08 frame at 300px, blurred, over the damage points. Lines survive
   * magnification as a soft band; text does not. Orientation comes from the
   * graticule and from the district frame the case draws over it.
   */
  return { lines, step, meridians, parallels };
}

/** The surface colour: the panel family, one step lighter than the page. */
export const OFFLINE_SURFACE = '#0b1714';

/*
 * NESTED STEPS. Each divides the one before it, so a coarse tile's lines are
 * a subset of a fine tile's. Cesium draws neighbouring tiles at different
 * levels, and with non-nesting steps (the first version had 5 then 2) a
 * gridline could stop dead at a tile seam.
 */
const STEPS = Object.freeze([30, 10, 5, 1, 0.5, 0.1]);
/** At most this many lines per axis per tile: a grid, not a texture. */
const MAX_LINES_PER_TILE = 4;

/**
 * The finest nested step that keeps a tile under the line budget.
 *
 * The first version searched coarse-to-fine and returned the FIRST step that
 * fit — which is always 30°, so a view of Nepal drew the 30th parallel and
 * nothing else.
 */
export function graticuleStep(span) {
  for (let i = STEPS.length - 1; i >= 0; i -= 1)
    if (span / STEPS[i] <= MAX_LINES_PER_TILE) return STEPS[i];
  return STEPS[0];
}

/**
 * Multiples of `step` in [from, to), computed in whole steps.
 *
 * Integer steps, with a tolerance on the division: -179.7 / 0.1 is
 * -1796.9999999999998 in floating point, so a plain ceil() skips the -179.7
 * line, and a loop that adds 0.1 lands on -179.70000000000002 instead.
 */
export function gridValues(from, to, step) {
  const EPS = 1e-9;
  const first = Math.ceil(from / step - EPS);
  const values = [];
  for (let k = first; k * step < to - EPS; k += 1)
    values.push(Math.round(k * step * 1e6) / 1e6);
  return values;
}

/**
 * A tile's geographic bounds.
 *
 * The geographic tiling scheme is 2:1 at level 0: 2^(level+1) columns and
 * 2^level rows. Getting that backwards puts the graticule at double spacing
 * in one axis — which looks entirely plausible on screen and is wrong, which
 * is exactly why the arithmetic is its own exported function with its own
 * test rather than four lines buried in a paint routine.
 */
export function tileBounds(x, y, level) {
  const columns = 2 ** (level + 1);
  const rows = 2 ** level;
  const west = -180 + (360 / columns) * x;
  const north = 90 - (180 / rows) * y;
  return Object.freeze({
    west,
    east: west + 360 / columns,
    north,
    south: north - 180 / rows,
  });
}

/**
 * A Cesium imagery provider that never touches the network.
 *
 * Built on the documented provider surface rather than by subclassing: Cesium
 * calls `requestImage` and reads a handful of properties, and implementing
 * exactly those keeps this working across versions that reshuffle the class
 * hierarchy.
 */
export function createOfflineImagery() {
  const tilingScheme = new Cesium.GeographicTilingScheme();
  const errorEvent = new Cesium.Event();
  return {
    get tilingScheme() {
      return tilingScheme;
    },
    get rectangle() {
      return tilingScheme.rectangle;
    },
    get tileWidth() {
      return OFFLINE_TILE_SIZE;
    },
    get tileHeight() {
      return OFFLINE_TILE_SIZE;
    },
    get maximumLevel() {
      return 12;
    },
    get minimumLevel() {
      return 0;
    },
    get tileDiscardPolicy() {
      return undefined;
    },
    get errorEvent() {
      return errorEvent;
    },
    get ready() {
      return true;
    },
    get credit() {
      return new Cesium.Credit(OFFLINE_CREDIT, false);
    },
    get hasAlphaChannel() {
      return false;
    },
    get proxy() {
      return undefined;
    },
    getTileCredits() {
      return undefined;
    },
    pickFeatures() {
      return undefined;
    },
    requestImage(x, y, level) {
      const canvas = document.createElement('canvas');
      canvas.width = OFFLINE_TILE_SIZE;
      canvas.height = OFFLINE_TILE_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;
      paintOfflineTile(ctx, { x, y, level });
      return Promise.resolve(canvas);
    },
  };
}
