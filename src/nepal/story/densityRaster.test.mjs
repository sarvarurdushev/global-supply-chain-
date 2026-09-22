import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  DENSITY_RAMP,
  densityColour,
  densityLegend,
  densityPosition,
  rasteriseDensity,
} from './densityRaster.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

async function realGrid() {
  const text = await readFile(
    `${ROOT}data/processed/nepal-2015-population-1km.json`,
    'utf8',
  );
  return JSON.parse(text);
}

/** A three-cell grid: one empty gap, then two populated cells. */
function toyGrid() {
  return {
    encoding: 'sparse-grid-gaps',
    count: 3,
    grid: {
      cols: 4,
      rows: 2,
      originLon: 80,
      originLat: 30,
      stepLon: 0.01,
      stepLat: 0.01,
    },
    /* Cells 0, 2 and 5 in row-major order. */
    gaps: [1, 2, 3],
    people: [1, 100, 10_000],
  };
}

test('the ramp is monotonic and never leaves its own ends', () => {
  assert.deepEqual(densityColour(0), [...DENSITY_RAMP[0].rgb]);
  assert.deepEqual(densityColour(1), [...DENSITY_RAMP.at(-1).rgb]);
  /* Out of range and nonsense both clamp rather than producing NaN pixels. */
  assert.deepEqual(densityColour(-5), [...DENSITY_RAMP[0].rgb]);
  assert.deepEqual(densityColour(9), [...DENSITY_RAMP.at(-1).rgb]);
  assert.deepEqual(densityColour(Number.NaN), [...DENSITY_RAMP[0].rgb]);

  let previous = -1;
  for (let i = 0; i <= 40; i += 1) {
    const [r, g, b] = densityColour(i / 40);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    assert.ok(luminance >= previous - 0.01, `ramp reverses at ${i / 40}`);
    previous = luminance;
  }
});

test('position is logarithmic, because a linear ramp would erase rural Nepal', () => {
  /*
   * These cells run from one person to tens of thousands. Linearly, every
   * rural cell is the darkest colour available and the map asserts that
   * nobody lives outside Kathmandu — which is false, and the opposite of
   * what the scene exists to show.
   */
  const scale = { maxPeople: 36_000 };
  const low = densityPosition(10, scale);
  const mid = densityPosition(600, scale);
  const high = densityPosition(30_000, scale);
  assert.ok(low > 0.2, `a 10-person cell must be visible, got ${low}`);
  assert.ok(mid > low && high > mid);
  assert.ok(high <= 1);
  /* Empty and negative are the floor, not a colour. */
  assert.equal(densityPosition(0, scale), 0);
  assert.equal(densityPosition(-3, scale), 0);
});

test('a sparse grid rasterises into exactly the cells it declares', () => {
  const raster = rasteriseDensity(toyGrid(), { alpha: 255 });
  assert.equal(raster.width, 4);
  assert.equal(raster.height, 2);
  assert.equal(raster.cellsPainted, 3);
  assert.equal(raster.maxPeople, 10_000);
  assert.equal(raster.totalPeople, 10_101);

  const alphaAt = (index) => raster.pixels[index * 4 + 3];
  assert.equal(alphaAt(0), 255, 'cell 0 is populated');
  assert.equal(alphaAt(2), 255, 'cell 2 is populated');
  assert.equal(alphaAt(5), 255, 'cell 5 is populated');
  for (const empty of [1, 3, 4, 6, 7]) {
    assert.equal(alphaAt(empty), 0, `cell ${empty} must stay transparent`);
  }
  /* A gap is a gap: an unpopulated cell is not a zero-population cell drawn dark. */
  assert.equal(raster.pixels[1 * 4], 0);

  /*
   * The grid's origin is the CENTRE of cell (0,0), so the image edge is half a
   * cell further out. Half a cell is 400 m here: invisible at country scale
   * and wrong at district scale.
   */
  assert.equal(raster.bounds.west, 80 - 0.005);
  assert.equal(raster.bounds.north, 30 + 0.005);
  assert.equal(Number(raster.bounds.east.toFixed(6)), 80.035);
  assert.equal(Number(raster.bounds.south.toFixed(6)), 29.985);
});

test('another encoding is refused rather than silently drawn wrong', () => {
  assert.throws(
    () => rasteriseDensity({ encoding: 'columnar', grid: {}, people: [] }),
    /sparse-grid-gaps/,
  );
  assert.throws(() => rasteriseDensity(null), /nothing/);
});

test('the real grid rasterises completely, and to the population it claims', async () => {
  const artefact = await realGrid();
  const raster = rasteriseDensity(artefact.data);

  assert.equal(raster.cellsPainted, artefact.data.count);
  assert.equal(raster.cellsPainted, 177_679);
  assert.equal(
    Math.round(raster.totalPeople),
    artefact.validation.storedTotalPopulation,
    'the raster covers every person the artefact stores',
  );
  /* 978 x 492 is half a million pixels — one pass, not a build step. */
  assert.equal(raster.width, 978);
  assert.equal(raster.height, 492);
  assert.equal(raster.pixels.length, 978 * 492 * 4);

  /* Nepal, and not one cell of it outside the artefact's own bounds. */
  const [west, south, east, north] = artefact.validation.bounds;
  assert.ok(raster.bounds.west >= west - 0.01, 'west');
  assert.ok(raster.bounds.east <= east + 0.01, 'east');
  assert.ok(raster.bounds.south >= south - 0.01, 'south');
  assert.ok(raster.bounds.north <= north + 0.01, 'north');
});

test('the legend is derived from the raster, so it cannot drift from it', async () => {
  const raster = rasteriseDensity((await realGrid()).data);
  const legend = densityLegend(raster, 5);
  assert.equal(legend.length, 5);
  assert.equal(legend[0].people, 0);
  assert.equal(legend.at(-1).people, Math.round(raster.maxPeople));
  for (let i = 1; i < legend.length; i += 1) {
    assert.ok(legend[i].people > legend[i - 1].people, 'stops must increase');
  }
  /* Each stop's colour is the colour the raster would paint at that position. */
  for (const stop of legend) {
    assert.deepEqual([...stop.rgb], densityColour(stop.position));
  }
});
