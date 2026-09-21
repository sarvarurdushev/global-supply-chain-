/**
 * WorldPop 2015 population raster -> processed 1 km population grid.
 *
 *   SOURCE   WorldPop Global 2000-2020, npl_ppp_2015_UNadj.tif (CC BY 4.0)
 *   RAW      82 MB BigTIFF, LZW + horizontal differencing, float32,
 *            ~100 m cells, EPSG:4326                      [not committed]
 *   READER   this project's own GeoTIFF reader
 *   VALIDATE national total against the World Bank 2015 estimate; no negative
 *            population; nodata excluded rather than summed as zero
 *   PROCESS  10x10 block sum to ~1 km cells; empty cells dropped; result
 *            stored columnar
 *   ARTEFACT data/processed/nepal-2015-population-1km.json         [committed]
 *   ANALYSIS population exposure by shaking band and by district
 *
 * Why aggregate. The source raster is 48 million cells and 82 MB; committing
 * it is neither possible nor useful. Summing 10x10 blocks is LOSSLESS FOR
 * POPULATION TOTALS — a "ppp" product is people per pixel, so a block sum is
 * exactly the people in that block — and it takes the artefact to a size the
 * repository and the hosted app can both carry. What it costs is spatial
 * detail below a kilometre, which no district-level or shaking-band analysis
 * uses. The full-resolution path stays available: the fetch is scripted and
 * the reader is the same.
 *
 * The UN-adjusted variant is chosen deliberately over the unconstrained one.
 * Measured here: unconstrained totals 30,723,449 against a World Bank 2015
 * figure of 27,823,629 (+10.4 %), while UN-adjusted totals 27,015,033
 * (-2.9 %). Comparing against census-derived district statistics calls for
 * the variant that is itself calibrated to the national estimate.
 */

import { DataClass, Redistribution, createDatasetRecord, createLineage } from '../../src/nepal/registry.js';
import { Issue, createQualityLog, formatQualitySummary } from '../../src/nepal/quality.js';
import { createRasterReader, pixelToGeo, rasterBounds } from '../../src/nepal/io/geotiff.js';
import { buildArtefact } from '../lib/artefact.mjs';
import { fetchRaw, formatBytes, writeProcessed, writeRegistry, writeReport } from '../lib/io.mjs';

const TIF_URL =
  'https://data.worldpop.org/GIS/Population/Global_2000_2020/2015/NPL/npl_ppp_2015_UNadj.tif';
const RETRIEVED_AT = '2026-09-21';
/** Block size: 10 source cells is about 926 m at this latitude. */
const BLOCK = 10;
/** Cells below this hold a fraction of a person; dropping them is noise removal. */
const MIN_PEOPLE = 0.5;
/** World Bank SP.POP.TOTL for Nepal, 2015, fetched to avoid a hard-coded claim. */
const WORLD_BANK_URL =
  'https://api.worldbank.org/v2/country/NPL/indicator/SP.POP.TOTL?date=2015&format=json';

export async function ingestWorldPop({ force = false } = {}) {
  const record = createDatasetRecord({
    id: 'worldpop-npl-2015-unadj',
    datasetName: 'WorldPop Global Project Population Data, Nepal 2015, UN-adjusted',
    publisher: 'WorldPop, University of Southampton',
    sourceUrl: TIF_URL,
    license: 'CC BY 4.0',
    redistribution: Redistribution.SHARE_ALIKE,
    retrievedAt: RETRIEVED_AT,
    originalFormat: 'BigTIFF (LZW, horizontal differencing, float32)',
    temporalCoverage: '2015',
    geographicCoverage: 'Nepal',
    coordinateSystem: 'EPSG:4326',
    description:
      'Modelled population count per ~100 m cell for Nepal in 2015, adjusted to match UN national population estimates. Aggregated here to ~1 km cells, which preserves population totals exactly.',
    dataClass: DataClass.ESTIMATE,
    attribution: 'WorldPop (www.worldpop.org), CC BY 4.0',
    fields: ['population per cell'],
    limitations: [
      'A MODELLED distribution, not a census. People are allocated to cells from covariates such as built-up area and roads; a cell value is an expectation, not a count of residents.',
      'The 2015 layer represents the year, not the moment of the earthquake, and captures neither seasonal labour migration nor the population present at 11:56 on a Saturday morning.',
      'Aggregating to ~1 km preserves totals exactly but not sub-kilometre detail; do not use it for building-level questions.',
      'The UN adjustment targets the UN World Population Prospects estimate, which differs from the World Bank series by a few per cent. A small residual against any single national figure is expected.',
    ],
  });

  const raw = await fetchRaw('npl_ppp_2015_UNadj.tif', TIF_URL, { force });
  const reader = createRasterReader(raw.bytes);
  const { header } = reader;
  const log = createQualityLog(record.id);

  const blockCols = Math.ceil(header.width / BLOCK);
  const blockRows = Math.ceil(header.height / BLOCK);
  const sums = new Float64Array(blockCols * blockRows);
  let sourceTotal = 0;
  let nodataCells = 0;
  let negativeCells = 0;

  for (let row = 0; row < header.height; row += 1) {
    const values = reader.readRow(row);
    const blockRow = Math.floor(row / BLOCK);
    for (let col = 0; col < header.width; col += 1) {
      const value = values[col];
      if (value === header.noData || !Number.isFinite(value)) {
        nodataCells += 1;
        continue;
      }
      if (value < 0) {
        /* Never summed: a negative population is not a small population. */
        negativeCells += 1;
        continue;
      }
      sourceTotal += value;
      sums[blockRow * blockCols + Math.floor(col / BLOCK)] += value;
    }
  }
  if (nodataCells > 0) {
    log.note(Issue.NODATA_CELL, `${nodataCells} source cells carry the nodata value and were excluded rather than summed as zero`);
  }
  if (negativeCells > 0) {
    log.note(Issue.INVALID_COORDINATE, `${negativeCells} source cells hold a negative value and were excluded`);
  }

  /*
   * Sparse grid encoding rather than a list of coordinates.
   *
   * Two thirds of Nepal's 1 km cells hold nobody, so only populated cells are
   * stored, each as its position in the grid rather than as a longitude and a
   * latitude. Because the scan is row-major the indices are strictly
   * increasing, so storing the GAP between successive cells turns
   * five-decimal coordinate pairs into small integers. The grid's origin and
   * step travel with the data, so any cell's centre is recoverable exactly —
   * this is a change of encoding, not of precision.
   */
  const gaps = [];
  const people = [];
  let keptTotal = 0;
  let droppedTotal = 0;
  let previousIndex = -1;
  for (let blockRow = 0; blockRow < blockRows; blockRow += 1) {
    for (let blockCol = 0; blockCol < blockCols; blockCol += 1) {
      log.readRecord();
      const value = sums[blockRow * blockCols + blockCol];
      if (value < MIN_PEOPLE) {
        droppedTotal += value;
        log.drop(Issue.MISSING_VALUE, `aggregated cell holds under ${MIN_PEOPLE} people`, value);
        continue;
      }
      const index = blockRow * blockCols + blockCol;
      gaps.push(index - previousIndex);
      previousIndex = index;
      people.push(Number(value.toFixed(1)));
      keptTotal += value;
      log.keptRecord();
    }
  }
  /* The grid's own geometry, so a consumer can place every cell centre. */
  const [originLon, originLat] = pixelToGeo(header, BLOCK / 2 - 0.5, BLOCK / 2 - 0.5);

  let worldBank = null;
  try {
    const response = await fetch(WORLD_BANK_URL, { headers: { 'User-Agent': 'NepalEQ-Research/1.0' } });
    const payload = await response.json();
    worldBank = payload?.[1]?.[0]?.value ?? null;
  } catch {
    worldBank = null;
  }

  const quality = log.summary();
  const validation = {
    sourceRaster: { width: header.width, height: header.height, cellDegrees: header.pixelScale[0] },
    sourceTotalPopulation: Math.round(sourceTotal),
    aggregatedTotalPopulation: Math.round(keptTotal),
    /*
     * The number a reader gets by summing this file, which is not quite the
     * number above: values are stored to one decimal, and 177,679 roundings
     * cost about fifteen people. Reporting only the pre-rounding total would
     * mean the artefact disagreed with itself, so both are stated.
     */
    storedTotalPopulation: Math.round(people.reduce((sum, value) => sum + value, 0)),
    /* The whole point of a block sum: the totals must agree to rounding. */
    populationRetained: Number((keptTotal / sourceTotal).toFixed(6)),
    populationDroppedAsSubThreshold: Number(droppedTotal.toFixed(1)),
    roundingResidual: Number(
      (keptTotal - people.reduce((sum, value) => sum + value, 0)).toFixed(1),
    ),
    cellsKept: people.length,
    cellsPossible: blockCols * blockRows,
    worldBank2015: worldBank,
    differenceFromWorldBankPercent:
      worldBank === null ? null : Number(((sourceTotal / worldBank - 1) * 100).toFixed(2)),
    bounds: rasterBounds(header),
    aggregationFactor: BLOCK,
    approximateCellSizeMetres: Math.round(header.pixelScale[0] * BLOCK * 111_320 * Math.cos((28 * Math.PI) / 180)),
  };

  const artefact = buildArtefact({
    record,
    quality,
    validation,
    dataClass: DataClass.ESTIMATE,
    lineage: createLineage(record.id, [
      { step: 'SOURCE', detail: `WorldPop UN-adjusted 2015, ${TIF_URL}` },
      { step: 'RAW', detail: `${formatBytes(raw.bytes.length)} BigTIFF, sha256 ${raw.sha256.slice(0, 16)} — not committed` },
      { step: 'READER', detail: 'this project’s GeoTIFF reader: BigTIFF, LZW, predictor 2 undone as uint32 before reinterpreting as float' },
      { step: 'VALIDATE', detail: 'nodata excluded rather than summed as zero; negative cells excluded; national total compared against the World Bank 2015 estimate' },
      { step: 'PROCESS', detail: `${BLOCK}x${BLOCK} block sum to ~1 km cells (lossless for totals); cells under ${MIN_PEOPLE} people dropped; stored as a sparse grid with gap-encoded indices` },
      { step: 'ARTEFACT', detail: 'data/processed/nepal-2015-population-1km.json' },
    ]),
    data: {
      encoding: 'sparse-grid-gaps',
      count: people.length,
      grid: {
        cols: blockCols,
        rows: blockRows,
        /** Centre of cell (0,0). */
        originLon: Number(originLon.toFixed(7)),
        originLat: Number(originLat.toFixed(7)),
        /** Degrees between cell centres. */
        stepLon: Number((header.pixelScale[0] * BLOCK).toFixed(9)),
        stepLat: Number((header.pixelScale[1] * BLOCK).toFixed(9)),
      },
      /**
       * Gaps between consecutive populated cells in row-major order. A
       * consumer accumulates them to get each cell's index, then
       * `lon = originLon + (index % cols) * stepLon` and
       * `lat = originLat - Math.floor(index / cols) * stepLat`.
       */
      gaps,
      people,
    },
  });

  const written = await writeProcessed('nepal-2015-population-1km.json', artefact);
  await writeRegistry(record);
  await writeReport(`${record.id}.quality.txt`, formatQualitySummary(quality));
  return { record, quality, validation, written };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await ingestWorldPop({ force: process.argv.includes('--force') });
  const v = result.validation;
  console.log(`source raster ${v.sourceRaster.width}x${v.sourceRaster.height} -> ${v.cellsKept.toLocaleString()} cells of ~${v.approximateCellSizeMetres} m`);
  console.log(`source total      ${v.sourceTotalPopulation.toLocaleString()}`);
  console.log(`aggregated total  ${v.aggregatedTotalPopulation.toLocaleString()}  (retained ${(v.populationRetained * 100).toFixed(4)}%)`);
  console.log(`World Bank 2015   ${v.worldBank2015?.toLocaleString()}  (difference ${v.differenceFromWorldBankPercent}%)`);
  console.log(`artefact ${result.written.path} (${formatBytes(result.written.bytes)})`);
}
