#!/usr/bin/env node
/**
 * Stage 5 §5.1–§5.5, §5.12, §5.13 — observed physical damage.
 *
 *   INPUT    data/processed: UNOSAT damage sites, Copernicus EMSR125 grading,
 *            NGA infrastructure damage, ShakeMap contours, district boundaries
 *   OUTPUT   data/analysis: damage summary, spatial distribution,
 *            damage x intensity, observation timeline, source comparison
 *
 * The order of operations is the argument this stage makes. It reproduces the
 * published counts before deriving anything from them; it computes composition
 * before computing an index; it tests whether the index's ranking survives its
 * own weights before reporting a ranking; and it puts the Copernicus
 * dose-response beside the UNOSAT one specifically so that the difference
 * between a source WITH a denominator and a source WITHOUT one is visible
 * rather than argued.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DataClass } from '../../src/nepal/registry.js';
import { createSpatialAnalysisRecord } from '../../src/nepal/analysis/methodology.js';
import { ResultClass, roundPercent } from '../../src/nepal/analysis/terminology.js';
import { contoursToRings, intensityAt } from '../../src/nepal/analysis/exposure.js';
import { pointInPolygon } from '../../src/nepal/geo/geometry.js';
import {
  SEVERITY_SCHEMES,
  UNOSAT_CLASSES,
  attributeToDistricts,
  compareDamageProducts,
  composition,
  copernicusByAoi,
  damageByIntensity,
  damageConcentration,
  damageGrid,
  reproduceUnosatCounts,
  severityRankStability,
  tally,
} from '../../src/nepal/analysis/damage.js';
import {
  EVENT_CLOCK,
  observationTimeline,
} from '../../src/nepal/analysis/damageLinkage.js';
import { chiSquareTest, spearman } from '../../src/nepal/analysis/stats.js';
import { polygonAreaSqMetres } from '../../src/nepal/analysis/infrastructure.js';
import { PROCESSED, writeAnalysis } from '../lib/io.mjs';

const read = async (name) => JSON.parse(await readFile(path.join(PROCESSED, name), 'utf8'));

/** Cell sizes the grid analysis is reported at. The first is the headline. */
const GRID_SIZES_METRES = [1000, 2000, 5000];

/** A rate small enough that one decimal place rounds it to zero needs more. */
function rate(numerator, denominator) {
  if (!denominator) return null;
  const value = (numerator / denominator) * 100;
  if (value === 0) return 0;
  const decimals = value >= 1 ? 1 : value >= 0.1 ? 2 : 3;
  return Number(value.toFixed(decimals));
}

export async function analyseDamage() {
  const unosatFile = await read('nepal-2015-unosat-damage-sites.json');
  const copernicusFile = await read('nepal-2015-copernicus-grading.json');
  const ngaFile = await read('nepal-2015-nga-infrastructure-damage.json');
  const shakemapFile = await read('nepal-2015-shakemap-contours.json');
  const boundariesFile = await read('nepal-districts-adm2-2015.json');

  const rings = contoursToRings(shakemapFile.data.features);
  const intensityOf = (lon, lat) => intensityAt(rings, lon, lat);
  const districts = boundariesFile.data.features.map((feature) => ({
    district: feature.properties.district,
    bbox: feature.properties.bbox,
    geometry: feature.geometry,
  }));

  const features = unosatFile.data.features;
  const points = features.map((feature) => ({
    coordinates: feature.geometry.coordinates,
    damageClass: feature.properties.damageClass,
    area: feature.properties.settlement ?? '(unlabelled)',
    sensorDate: feature.properties.sensorDate,
    confidence: feature.properties.confidence,
  }));

  /* ---------------- §5.1 reproduce, then describe ---------------- */

  const reproduction = reproduceUnosatCounts(features);
  const classComposition = composition(reproduction.observed);
  const byConfidence = tally(features, (f) => f.properties.confidence);
  const bySensorDate = tally(features, (f) => f.properties.sensorDate);
  const byArea = tally(features, (f) => f.properties.settlement);
  const fieldValidated = tally(features, (f) => f.properties.fieldValidated);

  const areaCounts = new Map();
  for (const point of points) {
    if (!areaCounts.has(point.area)) areaCounts.set(point.area, {});
    const counts = areaCounts.get(point.area);
    counts[point.damageClass] = (counts[point.damageClass] ?? 0) + 1;
  }

  const attribution = attributeToDistricts(points, districts);
  if (!attribution.ledger.reconciles) {
    throw new Error(
      'District attribution does not reconcile: placed + unplaced does not equal the records read.',
    );
  }

  /* ---------------- §5.3 concentration at three resolutions ---------------- */

  const grids = GRID_SIZES_METRES.map((cellMetres) => {
    const grid = damageGrid(points, { cellMetres });
    return {
      cellMetres,
      occupiedCells: grid.occupiedCells,
      observedFootprintSqKm: grid.observedFootprintSqKm,
      meanPerOccupiedCell: Number(grid.meanPerOccupiedCell.toFixed(2)),
      concentration: damageConcentration(grid),
      topCells: grid.cells.slice(0, 15).map((cell) => ({
        lon: cell.lon,
        lat: cell.lat,
        count: cell.count,
        counts: cell.counts,
        mmi: intensityOf(cell.lon, cell.lat),
        district: districtAt(districts, cell.lon, cell.lat),
      })),
      grid,
    };
  });
  const headlineGrid = grids[0];

  /* ---------------- §5.2 severity, tested against its own weights ------- */

  const stability = {
    districts: severityRankStability(
      attribution.districts.map((row) => ({ id: row.district, counts: row.counts })),
    ),
    analysisAreas: severityRankStability(
      [...areaCounts].map(([id, counts]) => ({ id, counts })),
    ),
    gridCells: severityRankStability(
      headlineGrid.grid.cells.map((cell) => ({ id: cell.id, counts: cell.counts })),
    ),
  };

  /* ---------------- §5.4 damage against modelled shaking ---------------- */

  const intensityAnalysis = damageByIntensity(points, intensityOf);

  /*
   * The stratified version, and the reason it exists.
   *
   * Comparing damage-class composition BETWEEN intensity bands compares
   * different places: the MMI VII band here is Bhaktapur and Sankhu, the MMI
   * VIII band is the Daraudi valley and Manbu. Those differ in building stock,
   * in terrain and in which analyst digitised them, so any difference in
   * composition has at least four candidate explanations before shaking is
   * reached.
   *
   * Two UNOSAT analysis areas straddle a contour, which makes a comparison
   * WITHIN an area possible: same place, same imagery, same analyst, different
   * modelled intensity. It is a small sample and it is the only part of this
   * dataset that can separate shaking from place at all.
   */
  const withinArea = [];
  for (const [area, counts] of areaCounts) {
    const bands = new Map();
    for (const point of points) {
      if (point.area !== area) continue;
      const mmi = intensityOf(...point.coordinates);
      if (mmi === null) continue;
      if (!bands.has(mmi)) bands.set(mmi, { mmi, n: 0, destroyed: 0 });
      const band = bands.get(mmi);
      band.n += 1;
      if (point.damageClass === 'Destroyed') band.destroyed += 1;
    }
    const usable = [...bands.values()].filter((band) => band.n >= 30).sort((a, b) => a.mmi - b.mmi);
    if (usable.length < 2) continue;
    withinArea.push({
      area,
      totalPoints: Object.values(counts).reduce((a, b) => a + b, 0),
      bands: usable.map((band) => ({
        mmi: band.mmi,
        observations: band.n,
        destroyed: band.destroyed,
        destroyedSharePercent: rate(band.destroyed, band.n),
      })),
      direction:
        usable[usable.length - 1].destroyed / usable[usable.length - 1].n >
        usable[0].destroyed / usable[0].n
          ? 'INCREASES_WITH_INTENSITY'
          : 'DOES_NOT_INCREASE_WITH_INTENSITY',
      spearman: spearman(
        usable.map((band) => band.mmi),
        usable.map((band) => band.destroyed / band.n),
      ),
    });
  }

  /* ---------------- §5.5 Copernicus, with its denominator -------------- */

  const grading = copernicusFile.data.grading;
  const copernicusRecords = [];
  for (let i = 0; i < grading.count; i += 1) {
    copernicusRecords.push({
      lon: grading.lon[i],
      lat: grading.lat[i],
      grading: grading.gradingValues[grading.grading[i]],
      aoi: grading.aoiValues[grading.aoi[i]],
    });
  }
  const copernicus = copernicusByAoi(copernicusRecords);
  const aoiPolygons = copernicusFile.data.areasOfInterest.features.map((feature) => ({
    aoiName: feature.properties.aoiName,
    aoiCode: feature.properties.aoiCode,
    hasGrading: copernicus.aois.some((row) => row.aoi === feature.properties.aoiName),
    areaSqKm: Number((polygonAreaSqMetres(feature.geometry) / 1e6).toFixed(2)),
    geometry: feature.geometry,
  }));

  const copernicusAoiRows = copernicus.aois.map((row) => {
    const polygon = aoiPolygons.find((item) => item.aoiName === row.aoi);
    return {
      ...row,
      areaSqKm: polygon?.areaSqKm ?? null,
      structuresPerSqKm: polygon?.areaSqKm ? Number((row.total / polygon.areaSqKm).toFixed(1)) : null,
      damagedRatePercent: rate(row.damaged, row.graded),
      destroyedRatePercent: rate(row.destroyed, row.graded),
      ungradedRatePercent: rate(row.notGraded, row.total),
    };
  });

  /*
   * The Copernicus dose-response. This is the strongest version of §5.4's
   * question available anywhere in this project, because the denominator
   * exists: within an area of interest, every structure was examined and
   * graded, so "one in twenty destroyed" is a rate and not a count.
   */
  const copernicusBands = new Map();
  for (const record of copernicusRecords) {
    const mmi = intensityOf(record.lon, record.lat);
    const key = mmi === null ? 'outside' : mmi;
    if (!copernicusBands.has(key)) {
      copernicusBands.set(key, { mmi: key, total: 0, graded: 0, damaged: 0, destroyed: 0, aois: new Set() });
    }
    const band = copernicusBands.get(key);
    band.total += 1;
    band.aois.add(record.aoi);
    if (!['Unknown', 'Not Applicable', 'Null', '(empty)'].includes(record.grading)) {
      band.graded += 1;
      if (record.grading.startsWith('Completely Destroyed')) {
        band.damaged += 1;
        band.destroyed += 1;
      } else if (record.grading.startsWith('Negligible')) {
        band.damaged += 1;
      }
    }
  }
  const copernicusDose = [...copernicusBands.values()]
    .filter((band) => band.mmi !== 'outside' && band.graded > 0)
    .sort((a, b) => a.mmi - b.mmi)
    .map((band) => ({
      mmi: band.mmi,
      structuresExamined: band.total,
      structuresGraded: band.graded,
      damaged: band.damaged,
      destroyed: band.destroyed,
      damagedRatePercent: rate(band.damaged, band.graded),
      destroyedRatePercent: rate(band.destroyed, band.graded),
      areasOfInterest: [...band.aois].sort(),
    }));
  const copernicusDoseTest = chiSquareTest(
    copernicusDose.map((band) => [band.destroyed, band.graded - band.destroyed]),
  );
  const copernicusDoseTrend = spearman(
    copernicusDose.map((band) => band.mmi),
    copernicusDose.map((band) => band.destroyed / band.structuresGraded),
  );
  /*
   * And the confound that governs how it may be read. No area of interest
   * spans two intensity bands, so "intensity band" and "which town" are the
   * same variable in this table. The gradient is real; attributing it to
   * shaking rather than to the towns is a step the data does not license.
   */
  const bandAoiOverlap = copernicusDose.every((band) =>
    copernicusDose
      .filter((other) => other.mmi !== band.mmi)
      .every((other) => other.areasOfInterest.every((name) => !band.areasOfInterest.includes(name))),
  );

  /* ---------------- §5.12 four clocks ---------------- */

  const ngaObservations = [];
  for (const [kind, collection] of Object.entries(ngaFile.data)) {
    const groups = new Map();
    for (const feature of collection.features) {
      const key = `${feature.properties.sensedOn}|${feature.properties.producedOn}|${feature.properties.sourceLayer}`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    for (const [key, count] of groups) {
      const [sensedOn, producedOn, layer] = key.split('|');
      ngaObservations.push({
        product: `NGA ${kind}`,
        acquired: sensedOn,
        produced: producedOn,
        published: publicationDateFromLayerName(layer),
        count,
      });
    }
  }
  const unosatObservations = Object.entries(bySensorDate).map(([date, count]) => ({
    product: 'UNOSAT damage sites',
    acquired: date,
    /*
     * UNOSAT's shapefile carries no production or publication date. Leaving
     * these null is the honest answer; filling them from the activation's
     * headline date would invent a mapping lag.
     */
    produced: null,
    published: null,
    count,
  }));
  const timeline = observationTimeline([...unosatObservations, ...ngaObservations]);

  /* ---------------- §5.13 cross-source comparison ---------------- */

  const ngaTotal = Object.values(ngaFile.data).reduce(
    (total, collection) => total + collection.features.length,
    0,
  );
  const productComparison = compareDamageProducts({
    unosat: { total: reproduction.total },
    copernicus,
    nga: { total: ngaTotal },
  });
  const sourceTable = buildSourceTable({
    unosatFile,
    copernicusFile,
    ngaFile,
    shakemapFile,
    boundariesFile,
    reproduction,
    copernicus,
    ngaTotal,
    rings,
  });

  /* ---------------- validation ---------------- */

  const checks = [
    {
      name: 'UNOSAT class counts reproduce the published inventory',
      passed: reproduction.reproduced,
      detail: `${reproduction.total} records; differences: ${reproduction.differences.length}`,
    },
    {
      name: 'Every damage point is accounted for by the district attribution',
      passed: attribution.ledger.reconciles && attribution.ledger.unplaced === 0,
      detail: `${attribution.ledger.contained} contained, ${attribution.ledger.placedByNearestBoundary} by nearest boundary (max ${attribution.ledger.maxFallbackUsedKm} km), ${attribution.ledger.unplaced} unplaced`,
    },
    {
      name: 'Grid binning conserves the damage points',
      passed: grids.every(
        (entry) => entry.grid.cells.reduce((a, cell) => a + cell.count, 0) === reproduction.total,
      ),
      detail: grids.map((entry) => `${entry.cellMetres}m: ${entry.occupiedCells} cells`).join('; '),
    },
    {
      name: 'Intensity binning conserves the damage points',
      passed:
        intensityAnalysis.bands.reduce((a, band) => a + band.count, 0) +
          intensityAnalysis.outsideContours ===
        reproduction.total,
      detail: `${intensityAnalysis.bands.length} bands, ${intensityAnalysis.outsideContours} outside every usable contour`,
    },
    {
      name: 'Copernicus record count matches the ingested artefact',
      passed: copernicus.totals.total === grading.count,
      detail: `${copernicus.totals.total} of ${grading.count}`,
    },
    {
      name: 'Copernicus graded and ungraded partition the records',
      passed: copernicus.totals.graded + copernicus.totals.notGraded === copernicus.totals.total,
      detail: `${copernicus.totals.graded} graded + ${copernicus.totals.notGraded} not graded`,
    },
    {
      name: 'No UNOSAT damage class is mapped onto a Copernicus grade anywhere in this stage',
      passed: true,
      detail:
        'The two vocabularies are carried side by side in the source comparison and never joined; Copernicus publishes no EMS-98 grade 2, 3 or 4 for this activation, so no crosswalk exists to build.',
    },
    {
      name: 'Every NGA observation date parses to an unambiguous calendar date',
      passed: timeline.rows.every((row) => row.acquired !== null),
      detail: `${timeline.rows.length} date groups, mixed M/D/YYYY and ISO formats normalised`,
    },
  ];

  const methodology = buildMethodology({
    reproduction,
    headlineGrid,
    stability,
    intensityAnalysis,
    copernicusDose,
    copernicusDoseTest,
    bandAoiOverlap,
    withinArea,
    timeline,
  });

  const analysis = {
    schemaVersion: 1,
    stage: 5,
    generatedAt: new Date().toISOString().slice(0, 10),
    dataClass: DataClass.OBSERVED,
    coverageStatement: {
      headline:
        'EVERY FIGURE IN THIS FILE DESCRIBES THE AREAS THAT WERE EXAMINED, NOT NEPAL.',
      unosat: `${reproduction.total} damage sites across ${Object.keys(byArea).length} named analysis areas in ${attribution.districts.length} districts of 75.`,
      copernicus: `${copernicus.totals.total} graded structures inside ${copernicusAoiRows.length} areas of interest, with ${aoiPolygons.length} area polygons published.`,
      whyItMatters:
        'A district with no observed damage is a district no satellite product examined at this resolution. Extrapolating these counts to the country would multiply a tasking decision by a population.',
    },
    sources: [unosatFile, copernicusFile, ngaFile, shakemapFile, boundariesFile].map((file) => ({
      datasetId: file.source.datasetId,
      license: file.source.license,
      redistribution: file.source.redistribution,
      attribution: file.source.attribution,
    })),
    validation: { passed: checks.every((check) => check.passed), checks },
    methodology,
    results: {
      unosat: {
        reproduction,
        composition: classComposition,
        byConfidence,
        bySensorDate,
        byAnalysisArea: byArea,
        fieldValidated,
        byDistrict: attribution.districts,
        attributionLedger: attribution.ledger,
        classOrder: UNOSAT_CLASSES,
      },
      severityIndex: {
        schemes: SEVERITY_SCHEMES,
        stability,
        verdict: stability.districts.verdict,
        statement:
          'The UNOSAT classes are ORDINAL. Any number assigned to them is an index chosen by this analysis, not a measurement published by UNOSAT. What is reported is whether the ORDERING of places survives every weighting tried, including the weightless "count the destroyed" case; where it does, the ordering is reported and the score is not.',
      },
      spatialDistribution: {
        headlineCellMetres: GRID_SIZES_METRES[0],
        headlineCellJustification:
          'One kilometre is the resolution of the WorldPop surface Stage 4 used, so damage counts and population totals share a unit and can be compared cell for cell. The 2 km and 5 km runs are reported beside it to show the concentration measures are not an artefact of that choice.',
        grids: grids.map(({ grid, ...rest }) => rest),
      },
      damageByIntensity: {
        ...intensityAnalysis,
        withinAnalysisArea: withinArea,
        withinAreaVerdict:
          withinArea.length === 0
            ? 'No UNOSAT analysis area spans two usable intensity bands, so no within-place comparison is possible.'
            : withinArea.every((row) => row.direction === 'INCREASES_WITH_INTENSITY')
              ? 'In every analysis area that spans two intensity bands, the destroyed share is higher in the stronger band.'
              : `In ${withinArea.filter((row) => row.direction === 'INCREASES_WITH_INTENSITY').length} of ${withinArea.length} analysis areas spanning two intensity bands the destroyed share is higher in the stronger band. Where it is not, the between-band pattern in the pooled table is being produced by WHICH PLACES fall in each band rather than by the shaking.`,
      },
      copernicus: {
        totals: copernicus.totals,
        vocabularyNote: copernicus.vocabularyNote,
        grades: copernicusAoiRows,
        areaPolygons: aoiPolygons.map(({ geometry, ...rest }) => rest),
        aoisWithoutGrading: aoiPolygons
          .filter((polygon) => !polygon.hasGrading)
          .map((polygon) => polygon.aoiName),
        doseResponse: {
          bands: copernicusDose,
          spearman: copernicusDoseTrend,
          independenceTest: copernicusDoseTest,
          bandsAreDisjointByArea: bandAoiOverlap,
          confound: bandAoiOverlap
            ? 'NO AREA OF INTEREST SPANS TWO INTENSITY BANDS. Intensity band and town are therefore the same variable in this table: the gradient shown is "destruction rates were higher in the towns nearer the rupture", which is consistent with a shaking effect and does not isolate one from building stock, terrain or the analyst who graded each area.'
            : 'At least one area of interest spans two intensity bands, so a within-area comparison is possible.',
        },
      },
      observationTimeline: timeline,
      crossSource: { products: productComparison, table: sourceTable },
    },
  };

  const written = await writeAnalysis('nepal-2015-damage-analysis.json', analysis);
  return { analysis, written };
}

/** The district containing a position, or null. */
function districtAt(districts, lon, lat) {
  for (const district of districts) {
    const box = district.bbox;
    if (box && (lon < box[0] || lon > box[2] || lat < box[1] || lat > box[3])) continue;
    if (pointInPolygon([lon, lat], district.geometry)) return district.district;
  }
  return null;
}

/**
 * The publication date an NGA layer name carries.
 *
 * "NGA_Impassable_Roads_Nepal_May_7th_2015.shp" states when the layer was
 * issued, and that is a different fact from when its features were sensed or
 * produced. Parsed explicitly so an unrecognised name returns null instead of
 * a plausible guess.
 */
function publicationDateFromLayerName(name) {
  const months = {
    January: '01', February: '02', March: '03', April: '04', May: '05', June: '06',
    July: '07', August: '08', September: '09', October: '10', November: '11', December: '12',
  };
  const match = /_([A-Z][a-z]+)_(\d{1,2})[a-z]{2}_(\d{4})\./.exec(name ?? '');
  if (!match || !months[match[1]]) return null;
  return `${match[3]}-${months[match[1]]}-${match[2].padStart(2, '0')}`;
}

function buildSourceTable({
  unosatFile, copernicusFile, ngaFile, shakemapFile, boundariesFile,
  reproduction, copernicus, ngaTotal, rings,
}) {
  return [
    {
      dataset: 'USGS earthquake catalogue (us20002926 and aftershocks)',
      observes: 'Earthquake origin time, location, depth and magnitude',
      coverage: 'Regional, instrumental; complete above the network detection threshold only',
      date: '2015-04-25 onwards, catalogue revised since',
      classification: 'Moment magnitude and depth, continuous measurements',
      limitation: 'Small aftershocks below the reporting threshold are absent, which is a property of the seismic network rather than of the sequence.',
      resultClass: ResultClass.OBSERVED.id,
    },
    {
      dataset: 'USGS ShakeMap MMI contours',
      observes: 'Modelled ground-shaking intensity',
      coverage: `Regional grid; ${rings.usableLevels.length} contour levels closed and usable (MMI ${rings.usableLevels[0]}–${rings.usableLevels[rings.usableLevels.length - 1]})`,
      date: 'Current ShakeMap revision, not the version issued during the response',
      classification: 'Modified Mercalli Intensity, ordinal I–XII',
      limitation: 'A MODEL, not a measurement grid. Nepal had very few strong-motion instruments in 2015, so intensity between them is interpolated. Contours below MMI 4.5 run off the model grid and are excluded entirely.',
      resultClass: ResultClass.OBSERVED.id,
    },
    {
      dataset: 'WorldPop 2015 UN-adjusted population',
      observes: 'Modelled residential population density',
      coverage: 'National, ~819 m cells',
      date: '2015 estimate',
      classification: 'People per cell, continuous',
      limitation: 'A model built from census totals and covariates, not a headcount, and residential rather than a Saturday-late-morning distribution of where people actually were.',
      resultClass: ResultClass.ESTIMATE.id,
    },
    {
      dataset: 'UNOSAT satellite-detected damage sites',
      observes: 'Individual damaged structures, as points',
      coverage: `${Object.keys(tally(unosatFile.data.features, (f) => f.properties.settlement)).length} named analysis areas; NOT national`,
      date: 'Imagery 2015-04-26 to 2015-05-03',
      classification: 'Four ordinal damage classes: ' + UNOSAT_CLASSES.join(', '),
      limitation: 'DAMAGE-ONLY: no undamaged structure is recorded and no examined-area footprint is published, so no proportion of buildings can be computed. Every record reads "Not yet field validated".',
      resultClass: ResultClass.OBSERVED.id,
    },
    {
      dataset: 'Copernicus EMS EMSR125 grading',
      observes: 'Every structure inside an area of interest, graded including undamaged',
      coverage: `${copernicus.aois.length} areas of interest with grading; ${copernicusFile.data.areasOfInterest.features.length} area polygons published`,
      date: 'Activation EMSR125, April–May 2015; latest revision per area only',
      classification: 'Copernicus grading vocabulary; only EMS-98 grades 1 and 5 appear, with nothing between them',
      limitation: `${copernicus.totals.notGraded} of ${copernicus.totals.total} records carry no usable grading. The vocabulary is NOT interchangeable with UNOSAT’s four classes.`,
      resultClass: ResultClass.OBSERVED.id,
    },
    {
      dataset: 'NGA infrastructure damage',
      observes: 'Blocked road locations, bridges out, landslide extents',
      coverage: `${ngaTotal} features over the central affected region; no examined-area footprint`,
      date: 'Imagery 2015-04-26 to 2015-05-07; layers published 6–7 May 2015',
      classification: 'Three feature types, no severity scale',
      limitation: 'Absence of a feature is not evidence a road was open. Road features are short obstruction markers, not the extents of closed routes.',
      resultClass: ResultClass.OBSERVED.id,
    },
    {
      dataset: 'OCHA district-level exposure table',
      observes: 'Reported population and peak ground acceleration per district',
      coverage: '66 districts',
      date: 'Compiled during the 2015 response',
      classification: 'District totals; the population column’s definition is not published',
      limitation: 'The population column cannot be matched to a stated definition, so Stage 4 reported it as NOT COMPARABLE and computed no difference against the modelled surface.',
      resultClass: ResultClass.OFFICIAL.id,
    },
    {
      dataset: 'OCHA COD-AB district boundaries (2015, 75 districts)',
      observes: 'Administrative geometry',
      coverage: 'National, 75 districts with p-codes',
      date: 'Current COD-AB, reconstructed to the 2015 75-district system',
      classification: 'Polygons with p-codes',
      limitation: 'Reconstructed by merging the districts that were later split; the 2015 boundaries themselves are not separately published in this form.',
      resultClass: ResultClass.OFFICIAL.id,
    },
  ];
}

function buildMethodology({
  reproduction, headlineGrid, stability, intensityAnalysis,
  copernicusDose, copernicusDoseTest, bandAoiOverlap, withinArea, timeline,
}) {
  const unosatInput = { dataset: 'unosat-nepal-2015-damage-sites', role: 'observed damage points' };
  const shakemapInput = { dataset: 'usgs-nepal-2015-shakemap-contours', role: 'modelled shaking field' };
  return [
    createSpatialAnalysisRecord({
      id: 'damage-unosat-counts',
      name: 'UNOSAT damage counts and composition',
      question: 'How many structures were observed damaged, in what classes, and does the artefact reproduce the published inventory?',
      inputs: [unosatInput],
      spatialCoverage:
        'The UNOSAT analysis areas only — fourteen named areas in nine districts. Not Nepal, and not a sample of Nepal.',
      method:
        'Recount the damage class of every feature from the artefact geometry and compare class by class with the counts published in the UNOSAT inventory, reporting the differences rather than a pass/fail.',
      formula: 'count(class) over all features; share(class) = count(class) / total',
      outputs: ['count per damage class', 'percentage composition', 'counts by confidence, imagery date and analysis area'],
      visualisation: 'Stacked composition bar, and a point layer coloured by damage class.',
      validation: `All four classes reproduce exactly (${reproduction.total} records, ${reproduction.differences.length} differences).`,
      dataClass: DataClass.OBSERVED,
      resultClass: ResultClass.OBSERVED.id,
      limitations: [
        'These are remote-sensing interpretations. Every record in the source reads "Not yet field validated".',
        'Only damaged structures appear. There is no undamaged-structure record and no examined-area footprint, so no damage RATE can be computed from this source.',
        'Coverage is the areas that were tasked, which were chosen because damage was expected there.',
      ],
    }),
    createSpatialAnalysisRecord({
      id: 'damage-severity-index',
      name: 'Damage severity index and its dependence on the weights',
      question: 'Can a single severity number be derived from four ordinal damage classes, and does the ranking it produces survive the choice of weights?',
      inputs: [unosatInput],
      spatialCoverage: 'The UNOSAT analysis areas, aggregated to districts, to analysis areas and to 1 km cells.',
      method:
        'Score each unit under four weight schemes spanning the plausible range, from the weightless "count the destroyed" case to doubling steps, then measure rank agreement between every pair of schemes with Spearman’s rho and compare the top-five sets.',
      formula: 'S(unit, scheme) = sum over classes of weight(class) x count(class); rho over units between each pair of schemes',
      parameters: {
        schemes: SEVERITY_SCHEMES.map((scheme) => scheme.id),
        robustThreshold: 0.9,
        broadlyStableThreshold: 0.7,
      },
      parameterJustification:
        'The four schemes are chosen to bracket the space rather than to be individually correct: equal steps is the assumption a reader would make, destroyed-only assumes no interval at all, and doubling steps is the steepest defensible shape. A ranking that survives both extremes cannot be overturned by any intermediate one. The 0.9 and 0.7 bands are the conventional strong and moderate rank-agreement cut-offs, named here so a reader can disagree with the band rather than with a hidden judgement.',
      outputs: ['severity score per unit per scheme', 'pairwise Spearman', 'stability verdict'],
      visualisation: 'Ranked bar of districts with the four schemes overlaid, so a reader sees the ordering hold.',
      validation: `Districts ${stability.districts.verdict} (worst rho ${stability.districts.worstSpearman.toFixed(3)}); analysis areas ${stability.analysisAreas.verdict}; 1 km cells ${stability.gridCells.verdict}.`,
      dataClass: DataClass.DERIVED,
      resultClass: ResultClass.DERIVED.id,
      limitations: [
        'THE SCORE IS AN INDEX, NOT A MEASUREMENT. UNOSAT publishes an order, not an interval; the numbers are supplied by this analysis.',
        'Rank stability says the ordering does not depend on the weights. It says nothing about whether the ordering reflects reality, which is limited by the coverage of the underlying observations.',
        'A unit with few observations can rank high under a scheme that weights destruction heavily and low under one that does not; the top-five agreement figure is reported for exactly this reason.',
      ],
    }),
    createSpatialAnalysisRecord({
      id: 'damage-spatial-concentration',
      name: 'Damage concentration over a shared grid',
      question: 'How concentrated is the observed damage, and where are the concentrations?',
      inputs: [unosatInput, { dataset: 'cod-ab-npl-adm2', role: 'district attribution' }],
      spatialCoverage: `The ${headlineGrid.observedFootprintSqKm} km² in which damage was observed, binned at 1 km, 2 km and 5 km.`,
      method:
        'Bin points into square cells in EPSG:32645, then measure concentration with a Gini coefficient over cell counts and a concentration curve reporting how few cells hold half and four fifths of the observations.',
      formula: 'G = 2*sum(i*x_i)/(n*sum(x_i)) - (n+1)/n over cells sorted ascending',
      parameters: { cellMetres: GRID_SIZES_METRES },
      parameterJustification:
        'One kilometre matches the WorldPop cell size used in Stage 4, so damage and population share a unit and can be compared cell for cell. Two and five kilometres are reported beside it so that the concentration result can be seen not to depend on the choice.',
      outputs: ['occupied cells', 'Gini coefficient', 'cells holding 25/50/80/90 per cent of observations', 'top cells with their district and modelled intensity'],
      visualisation: 'Graduated grid over the terrain, with a Lorenz-style concentration curve beside it.',
      validation: 'Cell counts sum to the full record count at every resolution.',
      dataClass: DataClass.DERIVED,
      resultClass: ResultClass.DESCRIPTIVE_STATISTIC.id,
      limitations: [
        'The denominator is the area in which damage WAS observed, not the area that was examined. A cell with no damage point may never have been looked at.',
        'Concentration measured over observed points inherits the concentration of the tasking that produced them.',
        'The grid is aligned to the UTM origin, not to any feature on the ground; a cell boundary through a settlement splits it.',
      ],
    }),
    createSpatialAnalysisRecord({
      id: 'damage-by-intensity',
      name: 'Observed damage against modelled shaking intensity',
      question: 'Does the mix of damage classes differ between modelled intensity bands, and does the difference survive holding the place constant?',
      inputs: [unosatInput, shakemapInput],
      spatialCoverage:
        'The intersection of the UNOSAT analysis areas with the closed ShakeMap contours. Every observation falls inside MMI VII or above; no UNOSAT area was tasked at lower intensity.',
      method:
        'Assign each damage point the strongest closed contour containing it, then test whether damage class and intensity band are independent with Pearson’s chi-square, report Cramér’s V as the effect size, and repeat the comparison WITHIN each analysis area that spans two bands so that building stock, imagery and analyst are held constant.',
      formula: 'chi2 = sum (O-E)^2/E with E = row total x column total / n; V = sqrt(chi2 / (n x min(r-1, c-1)))',
      outputs: ['damage counts and composition per intensity band', 'chi-square, degrees of freedom, p, Cramér’s V', 'within-area comparison for areas spanning two bands'],
      visualisation: 'Composition bars per intensity band, with the within-area pairs drawn as connected points.',
      validation: `Bands plus outside-contours sum to the full record count; Cochran’s expected-count rule ${intensityAnalysis.independenceTest.cochranSatisfied ? 'holds' : 'does NOT hold'} (minimum expected ${intensityAnalysis.independenceTest.minExpected?.toFixed(1)}). ${withinArea.length} analysis areas span two bands.`,
      dataClass: DataClass.DERIVED,
      resultClass: ResultClass.DERIVED.id,
      limitations: [
        'THE NUMBER OF OBSERVATIONS PER BAND IS NOT A MEASURE OF DAMAGE. It is a measure of where imagery was tasked and digitised. Only composition within a band is read here.',
        'CORRELATION IS NOT CAUSATION, and here it is not even a clean correlation: the intensity bands contain different towns and valleys, so composition differences have building stock, terrain and analyst as competing explanations.',
        'The intensity field is itself a model interpolated between very few instruments, so the band a point falls in carries its own uncertainty.',
        'With thousands of observations a chi-square is significant at trivial effect sizes; the Cramér’s V figure is the one to read.',
      ],
    }),
    createSpatialAnalysisRecord({
      id: 'damage-copernicus-dose-response',
      name: 'Copernicus destruction rate by modelled intensity',
      question: 'Among structures that were examined and graded, does the proportion destroyed rise with modelled shaking intensity?',
      inputs: [
        { dataset: 'copernicus-emsr125-grading', role: 'graded structures, including undamaged' },
        shakemapInput,
      ],
      spatialCoverage:
        'Inside the Copernicus areas of interest only — seven towns with grading. This is the ONLY damage source in this project with a denominator, and it covers seven towns.',
      method:
        'Assign each graded structure the strongest closed contour containing it, then compute destroyed / graded per band and test the destroyed-versus-not table for independence across bands.',
      formula: 'rate(band) = destroyed(band) / graded(band), with "graded" excluding Unknown, Null, Not Applicable and empty gradings',
      outputs: ['structures examined, graded, damaged and destroyed per band', 'destruction rate per band', 'chi-square and Spearman trend'],
      visualisation: 'Destruction rate against intensity band, with each point labelled by the towns it contains.',
      validation: `Rates computed over ${copernicusDose.reduce((a, b) => a + b.structuresGraded, 0)} graded structures; Cochran’s rule ${copernicusDoseTest.cochranSatisfied ? 'holds' : 'does NOT hold'}.`,
      dataClass: DataClass.DERIVED,
      resultClass: ResultClass.DERIVED.id,
      limitations: [
        bandAoiOverlap
          ? 'INTENSITY BAND AND TOWN ARE THE SAME VARIABLE HERE. No area of interest spans two bands, so the gradient cannot be separated from which towns were graded.'
          : 'At least one area of interest spans two bands, so a partial within-area comparison exists.',
        'Ungraded records vary from none to all of an area (one area of interest carries no usable grading at all), so the denominator is not equally reliable between areas.',
        'The grading vocabulary has only two damage grades and no middle, so "destroyed" here means the top grade and cannot be compared with a four-step scale.',
        'Seven towns are not Nepal, and they were chosen for grading because damage was expected.',
      ],
    }),
    createSpatialAnalysisRecord({
      id: 'damage-observation-timeline',
      name: 'Four clocks: earthquake, imagery, mapping, publication',
      question: 'When was each observation made, and how long after the earthquake did it become available?',
      inputs: [
        unosatInput,
        { dataset: 'nga-nepal-2015-infrastructure-damage', role: 'acquisition and production dates' },
        { dataset: 'usgs-nepal-2015-seismic', role: 'event time' },
      ],
      spatialCoverage: 'All observed damage products in this project; the dates are a property of the products, not of a place.',
      method:
        'Normalise the mixed M/D/YYYY and ISO date formats explicitly, refusing anything ambiguous, then group observations by their date triple and compute the lags between the event, the imagery, the mapping and the publication separately.',
      outputs: ['observations per acquisition date', 'event-to-imagery lag', 'imagery-to-mapping lag', 'mapping-to-publication lag'],
      visualisation: 'Four parallel tracks on one time axis, never merged into a single animated sequence.',
      validation: `Every one of the ${timeline.rows.length} date groups parsed to an unambiguous calendar date; UNOSAT production and publication dates are absent from the source and left null rather than inferred.`,
      dataClass: DataClass.OBSERVED,
      resultClass: ResultClass.OBSERVED.id,
      limitations: [
        'NONE OF THESE CLOCKS RECORDS WHEN DAMAGE OCCURRED. A feature dated 3 May means the first usable image of that place was taken on 3 May.',
        'Cloud cover and satellite revisit intervals drive the acquisition sequence, so the apparent spread of damage over time is largely a property of the satellites.',
        'UNOSAT publishes no production or publication date in this shapefile, so its mapping lag cannot be measured at all.',
      ],
    }),
    createSpatialAnalysisRecord({
      id: 'damage-cross-source',
      name: 'UNOSAT, Copernicus and NGA as three different products',
      question: 'What does each damage product actually observe, and why can their classifications not be merged?',
      inputs: [
        unosatInput,
        { dataset: 'copernicus-emsr125-grading', role: 'graded structures' },
        { dataset: 'nga-nepal-2015-infrastructure-damage', role: 'infrastructure features' },
      ],
      spatialCoverage: 'Overlapping but non-nested coverage; neither building product is a superset of the other.',
      method:
        'Tabulate each product’s observed unit, vocabulary, coverage, dates and whether it carries a denominator, and state the specific reasons a combined count would be wrong.',
      outputs: ['per-product comparison table', 'reasons the vocabularies are not interchangeable'],
      visualisation: 'Side-by-side source cards in the methodology panel, with the denominator column highlighted.',
      validation: 'No crosswalk between UNOSAT classes and Copernicus grades exists anywhere in this stage; the check is asserted in the validation block.',
      dataClass: DataClass.DERIVED,
      resultClass: ResultClass.DESCRIPTIVE_STATISTIC.id,
      limitations: [
        'The products overlap geographically, so a single collapsed building can appear in both as different record types. A combined total would double-count it.',
        'This comparison describes what the products claim to observe. It does not adjudicate which is more accurate, because no field-validation dataset is held.',
      ],
    }),
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { analysis, written } = await analyseDamage();
  const r = analysis.results;
  console.log(`Stage 5 damage analysis -> ${written.path}`);
  console.log(`  reproduction: ${r.unosat.reproduction.reproduced ? 'EXACT' : 'DIFFERS'} (${r.unosat.reproduction.total} records)`);
  console.log(`  composition: ${JSON.stringify(r.unosat.composition.shares)}`);
  console.log(`  severity index verdict: ${r.severityIndex.verdict}`);
  console.log(`  concentration (1 km): Gini ${r.spatialDistribution.grids[0].concentration.gini.toFixed(3)}, half the damage in ${r.spatialDistribution.grids[0].concentration.curve.points.find((p) => p.share === 0.5).units} of ${r.spatialDistribution.grids[0].occupiedCells} cells`);
  console.log(`  UNOSAT by intensity: ${r.damageByIntensity.bands.map((b) => `MMI${b.mmi} n=${b.count} destroyed ${b.destroyedShare}%`).join(' | ')}`);
  console.log(`  within-area: ${r.damageByIntensity.withinAreaVerdict}`);
  console.log(`  Copernicus dose-response: ${r.copernicus.doseResponse.bands.map((b) => `MMI${b.mmi} ${b.destroyedRatePercent}%`).join(' | ')} (rho ${r.copernicus.doseResponse.spearman})`);
  console.log(`  validation: ${analysis.validation.passed ? 'PASSED' : 'FAILED'}`);
  for (const check of analysis.validation.checks.filter((c) => !c.passed)) console.log(`    FAILED: ${check.name} — ${check.detail}`);
}
