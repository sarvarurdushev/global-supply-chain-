/**
 * The population grid, as pixels.
 *
 * WHY A RASTER AND NOT 177,679 SOMETHINGS. The WorldPop artefact holds 177,679
 * populated ~1 km cells. As entities that is a dead scene; as point primitives
 * it is a field of dots that reads as noise at the only altitude where the
 * whole country fits. It is a continuous field, so it is drawn as one: a single
 * image, clamped to the ground, painted once.
 *
 * The design planned a build-time density texture, and that was the phase's
 * one high risk — a new asset pipeline. It turned out not to be needed. The
 * grid is 978 x 492, so rasterising it in the browser is one pass over half a
 * million pixels: a few milliseconds, once, with no new artefact, no new build
 * step and nothing to keep in sync.
 *
 * THIS MODULE MAKES NO CANVAS. It returns the RGBA bytes and the geographic
 * bounds; the renderer does the `putImageData`. That keeps it pure and lets
 * the ramp be asserted exactly, which matters because a colour ramp over a
 * skewed distribution is where a density map usually starts lying.
 *
 * AMBER, NOT GREEN. Population here is an ESTIMATE — a model of where people
 * were, not a census of where they were — so it takes the estimate colour from
 * the result-class vocabulary rather than the interface green.
 */

import { decodePopulationGrid } from '../analysis/exposure.js';

/**
 * The ramp, darkest-sparsest to brightest-densest.
 *
 * Amber through to near-white, because the top of a population ramp has to
 * separate Kathmandu from its own suburbs and hue alone cannot do that at
 * three orders of magnitude.
 */
export const DENSITY_RAMP = Object.freeze([
  Object.freeze({ stop: 0, rgb: Object.freeze([74, 44, 8]) }),
  Object.freeze({ stop: 0.25, rgb: Object.freeze([148, 84, 12]) }),
  Object.freeze({ stop: 0.5, rgb: Object.freeze([214, 132, 20]) }),
  Object.freeze({ stop: 0.72, rgb: Object.freeze([255, 176, 32]) }),
  Object.freeze({ stop: 0.88, rgb: Object.freeze([255, 214, 122]) }),
  Object.freeze({ stop: 1, rgb: Object.freeze([255, 245, 214]) }),
]);

/** Sample the ramp at `t` in [0, 1]. */
export function densityColour(t) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  for (let i = 1; i < DENSITY_RAMP.length; i += 1) {
    const lower = DENSITY_RAMP[i - 1];
    const upper = DENSITY_RAMP[i];
    if (clamped > upper.stop) continue;
    const span = upper.stop - lower.stop;
    const local = span === 0 ? 0 : (clamped - lower.stop) / span;
    return [
      Math.round(lower.rgb[0] + (upper.rgb[0] - lower.rgb[0]) * local),
      Math.round(lower.rgb[1] + (upper.rgb[1] - lower.rgb[1]) * local),
      Math.round(lower.rgb[2] + (upper.rgb[2] - lower.rgb[2]) * local),
    ];
  }
  return [...DENSITY_RAMP[DENSITY_RAMP.length - 1].rgb];
}

/**
 * Where a cell's population sits on the ramp.
 *
 * LOG, AND THE REASON IS NOT AESTHETIC. These cells run from 1 person to
 * roughly 60,000. On a linear ramp every rural cell in Nepal is the darkest
 * colour on the scale and the map says "nobody lives outside Kathmandu",
 * which is both false and the opposite of what Scene 05 exists to show. A log
 * scale is the honest choice here, and the legend has to say so — which is why
 * this returns the bounds it used rather than hiding them.
 */
export function densityPosition(people, { maxPeople }) {
  if (!(people > 0)) return 0;
  const top = Math.max(2, maxPeople);
  return Math.log(people + 1) / Math.log(top + 1);
}

/**
 * Rasterise the sparse grid.
 *
 * @param {object} grid the artefact's `data` block (`sparse-grid-gaps`)
 * @param {object} [options]
 * @param {number} [options.alpha] 0-255, the fill opacity of a populated cell
 * @returns {{width:number,height:number,pixels:Uint8ClampedArray,bounds:object,
 *            maxPeople:number,cellsPainted:number,totalPeople:number}}
 */
export function rasteriseDensity(grid, { alpha = 200 } = {}) {
  if (grid?.encoding !== 'sparse-grid-gaps') {
    throw new TypeError(
      `The density raster only reads sparse-grid-gaps, not "${grid?.encoding ?? 'nothing'}".`,
    );
  }
  const { cols, rows, originLon, originLat, stepLon, stepLat } = grid.grid;
  const pixels = new Uint8ClampedArray(cols * rows * 4);

  /*
   * Two passes. The maximum has to be known before any pixel can be placed on
   * the ramp, and reading the `people` array directly is cheaper than decoding
   * twice — the gaps only matter for WHERE a cell goes, not how big it is.
   */
  let maxPeople = 0;
  let totalPeople = 0;
  for (const people of grid.people) {
    if (people > maxPeople) maxPeople = people;
    totalPeople += people;
  }

  let cellsPainted = 0;
  for (const cell of decodePopulationGrid(grid)) {
    /* Recover the integer cell from the geographic centre the decoder gives. */
    const col = Math.round((cell.lon - originLon) / stepLon);
    const row = Math.round((originLat - cell.lat) / stepLat);
    if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
    const [r, g, b] = densityColour(
      densityPosition(cell.people, { maxPeople }),
    );
    const at = (row * cols + col) * 4;
    pixels[at] = r;
    pixels[at + 1] = g;
    pixels[at + 2] = b;
    pixels[at + 3] = alpha;
    cellsPainted += 1;
  }

  /*
   * The grid's origin is the CENTRE of cell (0,0), so the image's edge is half
   * a cell further out. Getting this wrong shifts the whole layer by 400 m,
   * which is invisible at country scale and wrong at district scale — exactly
   * the error Scene 07 would surface and nobody would be able to explain.
   */
  const bounds = Object.freeze({
    west: originLon - stepLon / 2,
    north: originLat + stepLat / 2,
    east: originLon + (cols - 0.5) * stepLon,
    south: originLat - (rows - 0.5) * stepLat,
  });

  return Object.freeze({
    width: cols,
    height: rows,
    pixels,
    bounds,
    maxPeople,
    totalPeople,
    cellsPainted,
  });
}

/**
 * Legend stops for the density ramp, as people per cell.
 *
 * Derived from the same log position the pixels use, so the legend cannot
 * drift from the map. A legend computed independently of its raster is a
 * legend that is eventually wrong.
 */
export function densityLegend({ maxPeople }, steps = 5) {
  const out = [];
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    const people = Math.round(Math.exp(t * Math.log(maxPeople + 1)) - 1);
    out.push(
      Object.freeze({
        position: t,
        people: Math.max(0, people),
        rgb: Object.freeze(densityColour(t)),
      }),
    );
  }
  return Object.freeze(out);
}
