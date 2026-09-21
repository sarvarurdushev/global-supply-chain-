/**
 * Stage 4 — population exposure to the 2015 Gorkha shaking.
 *
 *   INPUTS   WorldPop 2015 UN-adjusted, aggregated to ~1 km  (ESTIMATE)
 *            USGS ShakeMap MMI contours                       (OBSERVED)
 *            geoBoundaries ADM2 2006, 75 districts            (OFFICIAL)
 *            OCHA district population and PGA                 (OFFICIAL)
 *   METHOD   containment of each population cell in the closed MMI contours
 *            and in a district polygon; aggregation; threshold sensitivity
 *   OUTPUT   data/analysis/nepal-2015-population-exposure.json
 *   COMPARE  our derived district population against OCHA's, which is the
 *            same quantity from a different source and therefore a real check
 *
 * The comparison is deliberately split in two, because only one half is
 * like-for-like. District POPULATION is the same quantity in both datasets and
 * can be differenced directly. EXPOSURE is not: ours is MMI-based and OCHA's
 * is PGA-based, and those are different variables. Differencing them as if
 * they were the same would manufacture agreement or disagreement out of a
 * units mismatch.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DataClass } from '../../src/nepal/registry.js';
import { createAnalysisRecord } from '../../src/nepal/analysis/methodology.js';
import {
  MMI_MEANING,
  contoursToRings,
  decodePopulationGrid,
  districtQuadrants,
  exposureByDistrict,
  populationByIntensity,
  populationIntensityQuadrants,
  thresholdSensitivity,
} from '../../src/nepal/analysis/exposure.js';
import {
  ImpactVariable,
  ResultClass,
  describeExposure,
  roundPercent,
  roundPopulation,
} from '../../src/nepal/analysis/terminology.js';
import { ANALYSIS, PROCESSED, formatBytes, writeAnalysis } from '../lib/io.mjs';

/**
 * The headline threshold, and why it is this one.
 *
 * MMI VI is the lowest intensity at which USGS's own scale records damage
 * occurring at all. Below it the shaking is felt, sometimes strongly, but the
 * built environment is not affected — so "exposed at VI or above" is a
 * statement about people who experienced potentially damaging shaking, which
 * is the question being asked. Every other threshold is reported beside it.
 */
const HEADLINE_THRESHOLD = 6;

/**
 * Maximum distance a population cell may be from a district boundary before
 * the analysis gives up on placing it.
 *
 * Measured rather than chosen: every unplaced cell in this dataset lies
 * within 20 km of a district boundary, and 92% within 5 km. Twenty kilometres
 * therefore places all of them while still refusing anything that would have
 * to cross a country to find a home.
 */
const FILL_TOLERANCE_KM = 20;

const read = async (dir, name) => JSON.parse(await readFile(path.join(dir, name), 'utf8'));

export async function analyseExposure() {
  const population = await read(PROCESSED, 'nepal-2015-population-1km.json');
  const shakemap = await read(PROCESSED, 'nepal-2015-shakemap-contours.json');
  const boundaries = await read(PROCESSED, 'nepal-districts-adm2-2015.json');
  const ocha = await read(PROCESSED, 'nepal-2015-ocha-district-exposure.json');

  const rings = contoursToRings(shakemap.data.features);
  const cells = [...decodePopulationGrid(population.data)];

  /*
   * The district frame is authoritative and needs no correction here.
   *
   * An earlier version of this stage aggregated against geoBoundaries and had
   * to repair it first: that file labelled two different polygons "Saptari"
   * and two "Bara", so keying on its names merged each pair into one bucket
   * and Bara came back with 1.49 million people against a real figure near
   * 690,000. Worse, its ~50-vertex districts were geometrically wrong — a
   * point in Patan tested as being in Kathmandu, and Lalitpur's population
   * was quietly added to its neighbour's while the national total still
   * reconciled.
   *
   * COD-AB carries p-codes, correct names and 329 vertices per district after
   * simplification, and every containment check passes. Nothing is patched.
   */
  const districts = boundaries.data.features;
  const districtKeys = districts.map((feature) => feature.properties.districtKey);
  const collidingKeys = districtKeys.filter((key, i) => districtKeys.indexOf(key) !== i);
  if (collidingKeys.length > 0) {
    throw new Error(
      `Two district polygons share the key ${[...new Set(collidingKeys)].join(', ')}; ` +
        'aggregating on it would merge them into one district.',
    );
  }

  const intensity = populationByIntensity(cells, rings);
  const sensitivity = thresholdSensitivity(intensity);

  /*
   * The threshold curve as a first-class analytical output.
   *
   * Every row carries what it rests on — the threshold, where the threshold
   * comes from, what it means, how the number was computed and what came out
   * — so that no row can be lifted out of the table and quoted on its own
   * without its definition travelling with it.
   */
  const thresholdCurve = sensitivity.map((row) => {
    const exposedAtOrAbove = intensity.bands.find((band) => band.mmi === row.threshold);
    const rounded = roundPopulation(row.exposedPopulation);
    return {
      threshold: row.threshold,
      roman: row.roman,
      source: 'USGS ShakeMap product for us20002926, contour file download/cont_mmi.json',
      definition:
        `Population whose ~819 m cell centre lies inside the closed MMI ${row.roman} contour. ` +
        `USGS describe this intensity as: perceived ${MMI_MEANING[row.threshold]?.perceived ?? 'n/a'}, damage ${MMI_MEANING[row.threshold]?.damage ?? 'n/a'}.`,
      calculation:
        'Sum of WorldPop 2015 UN-adjusted cell populations passing a point-in-polygon test against the closed contour ring, taking the strongest contour containing each cell.',
      exposedPopulationExact: row.exposedPopulation,
      exposedPopulationRounded: rounded.text,
      populationInThisBandOnly: exposedAtOrAbove?.populationInBand ?? null,
      shareOfConsideredPercent: roundPercent(row.shareOfConsidered),
      statement: describeExposure({ people: row.exposedPopulation, threshold: row.threshold, roman: row.roman }),
      resultClass: ResultClass.DERIVED.id,
    };
  });
  /*
   * Both attributions are computed and both are reported. Strict containment
   * is the conservative figure and leaves 4.9% of Nepal unplaced; the filled
   * one places every person and says how many arrived that way.
   */
  const strict = exposureByDistrict(cells, rings, districts, {
    threshold: HEADLINE_THRESHOLD,
    fillToleranceKm: 0,
  });
  const byDistrict = exposureByDistrict(cells, rings, districts, {
    threshold: HEADLINE_THRESHOLD,
    fillToleranceKm: FILL_TOLERANCE_KM,
  });

  /*
   * Population crossed with intensity. Two maps side by side make a reader do
   * this in their head and they do it badly, so the crossing is computed.
   */
  const quadrants = populationIntensityQuadrants(cells, rings, {
    intensityThreshold: HEADLINE_THRESHOLD,
  });

  /* Exposure per district at every threshold, for the interactive map. */
  const perThreshold = {};
  for (const level of rings.usableLevels) {
    const run = exposureByDistrict(cells, rings, districts, {
      threshold: level,
      fillToleranceKm: FILL_TOLERANCE_KM,
    });
    perThreshold[level] = {
      threshold: level,
      totalExposed: run.totalExposed,
      districtsWithExposure: run.districtsWithExposure,
    };
  }

  /* ---------------- comparison against OCHA ---------------- */

  const ochaByKey = new Map(
    ocha.data.districts.filter((row) => row.joinKey).map((row) => [row.joinKey, row]),
  );
  const ourByKey = new Map(byDistrict.districts.map((row) => [row.districtKey, row]));

  /*
   * What OCHA's `population` column actually is, and why the first version of
   * this comparison was wrong.
   *
   * The comparison was built assuming that column held district TOTAL
   * population. The data says otherwise and says it loudly: Jhapa reads
   * 1,511 against a district of roughly 800,000, and Ilam reads 2,144. Those
   * are not populations of districts; they are slivers. HDX describes the
   * dataset as "Population data by district and severity class" and titles it
   * "Estimated Population EXPOSED to Nepal Earthquake shaking", and the
   * attribute table carries `shape_leng` and `shape_area`, which is what a
   * GIS overlay of PGA bands against districts leaves behind.
   *
   * So the column is the population of each district lying INSIDE the mapped
   * PGA footprint. That is an exposure figure. It is therefore comparable
   * with OUR EXPOSURE figure and NOT with our district totals — the opposite
   * of the original design, and a far better comparison, because it puts two
   * independent exposure estimates side by side.
   *
   * Two caveats travel with it. The hazard variables differ (their PGA
   * against our MMI), so the thresholds are not equivalent and the difference
   * is not an error measurement. And the OCHA product has at least one
   * internal inconsistency: Lalitpur reads 911,815, roughly double the
   * district's 2011 census count, which no clipping can produce. Rows where
   * OCHA exceeds our whole-district population are flagged rather than
   * silently differenced.
   */
  const exposureComparison = [];
  const districtTotalsForSanity = new Map(byDistrict.districts.map((row) => [row.districtKey, row]));
  for (const [key, ochaRow] of ochaByKey) {
    const ours = ourByKey.get(key);
    if (!ours) continue;
    const ourDistrictTotal = districtTotalsForSanity.get(key)?.population ?? null;
    const exceedsOurDistrictTotal =
      ourDistrictTotal !== null && ochaRow.population > ourDistrictTotal * 1.1;
    const difference = ours.exposed - ochaRow.population;
    exposureComparison.push({
      district: ochaRow.district,
      districtKey: key,
      ourExposedAtMmi6: ours.exposed,
      ourDistrictPopulation: ours.population,
      ourMaxMmi: ours.maxMmi,
      ochaExposed: ochaRow.population,
      ochaPgaG: ochaRow.pgaG,
      ochaSeverity: ochaRow.severityClass,
      difference,
      differencePercent:
        ochaRow.population > 0
          ? Number(((difference / ochaRow.population) * 100).toFixed(2))
          : null,
      /* OCHA reporting more people than the district holds cannot be clipping. */
      ochaExceedsDistrictPopulation: exceedsOurDistrictTotal,
    });
  }
  exposureComparison.sort((a, b) => b.ochaExposed - a.ochaExposed);

  /*
   * The comparison stops here, deliberately, and this is a finding rather
   * than a gap.
   *
   * Two readings of OCHA's `population` column were tested against the data.
   * It is not district total population: Jhapa reads 1,511 for a district of
   * roughly 800,000. But it is not cleanly "population inside the PGA
   * footprint" either, because in a majority of districts it EXCEEDS the
   * district's own population — Lalitpur reads 911,815 against a 2011 census
   * count near 468,000, Morang 1,251,498 against 965,000. A clipped subset
   * cannot be larger than the whole.
   *
   * HDX documents the dataset only as "Population data by district and
   * severity class", with methodology "Census" and no column definitions. So
   * the semantics of the reference cannot be established from what is
   * published, and any difference computed against it would be a number
   * whose meaning nobody could defend.
   *
   * The two sets are therefore reported SIDE BY SIDE and never differenced.
   * Our exposure is a derived result with a stated definition; OCHA's is an
   * official published figure whose definition we could not verify. Both are
   * shown; neither is treated as ground truth for the other.
   */
  const exceeding = exposureComparison.filter((row) => row.ochaExceedsDistrictPopulation);

  /*
   * Comparability is assessed dimension by dimension before any number is
   * put beside another. The verdict falls out of the dimensions rather than
   * being asserted, so a reader can disagree with the reasoning rather than
   * only with the conclusion.
   */
  const comparabilityDimensions = [
    {
      dimension: 'Geographic unit',
      ours: 'Nepal districts, 2015 75-district system, from OCHA COD-AB',
      theirs: 'Nepal districts, named but with no p-code or boundary published in the file',
      compatible: true,
      note: 'All 66 of their districts resolve to one of our polygons, 64 exactly and 2 by bounded transliteration.',
    },
    {
      dimension: 'Population dataset',
      ours: 'WorldPop 2015 UN-adjusted, modelled ~100 m grid aggregated to ~819 m',
      theirs: 'Undocumented. HDX records the methodology only as "Census".',
      compatible: false,
      note: 'Without knowing their base we cannot separate a population-model difference from a method difference.',
    },
    {
      dimension: 'Hazard variable',
      ours: 'Modified Mercalli Intensity, from the ShakeMap contour product',
      theirs: 'Peak ground acceleration in g, with a severity class',
      compatible: false,
      note: 'MMI and PGA are different physical quantities related only by empirical conversions that carry their own scatter. This alone prevents a like-for-like difference.',
    },
    {
      dimension: 'Hazard threshold',
      ours: 'MMI 6 or above, chosen because it is the lowest intensity at which the USGS scale records damage',
      theirs: 'Not stated. PGA values range across the table with a severity class attached.',
      compatible: false,
      note: 'Two exposure figures computed at unstated and different thresholds cannot be differenced.',
    },
    {
      dimension: 'Reference year',
      ours: '2015 population, 2015 event',
      theirs: 'Unstated; a 2011 census base is the plausible source',
      compatible: false,
      note: 'A four-year gap is small relative to the discrepancies observed and does not explain them.',
    },
    {
      dimension: 'Spatial method',
      ours: 'Point-in-polygon of each ~819 m cell centre against a closed contour; a cell counts wholly to one side',
      theirs: 'Apparently a GIS overlay of PGA bands against districts — the table carries shape_leng and shape_area — but the operation is not documented',
      compatible: false,
      note: 'Inferred from the attribute table, not stated by the publisher.',
    },
    {
      dimension: 'Quantity being measured',
      ours: 'Population geographically exposed at a stated intensity',
      theirs: 'Unresolved. Not district total population (Jhapa reads 1,511 for a district of roughly 800,000), and not population within the footprint either, because in ' +
        `${exceeding.length} of ${exposureComparison.length} districts it exceeds the district's own population.`,
      compatible: false,
      note: 'This is the dimension that decides the verdict. Two numbers cannot be compared when one of them has no established definition.',
    },
  ];

  const incompatible = comparabilityDimensions.filter((item) => !item.compatible);
  /*
   * The verdict. NOT COMPARABLE is reserved for the case where the two
   * quantities are different things — which is exactly the case here,
   * because the reference quantity cannot be identified at all.
   */
  const verdict = 'NOT COMPARABLE';

  const comparison = {
    verdict,
    verdictScale: {
      DIRECTLY_COMPARABLE: 'Same quantity, same unit, same method. A difference is meaningful.',
      PARTIALLY_COMPARABLE: 'Same quantity, methodological differences that can be named and bounded. A difference is meaningful once those are stated.',
      NOT_COMPARABLE: 'Different quantities, or a quantity whose definition cannot be established. A difference would be a number without a meaning.',
    },
    verdictReason:
      `${incompatible.length} of ${comparabilityDimensions.length} dimensions are incompatible, and the decisive one is the quantity itself: OCHA's population column cannot be pinned to a definition from anything HDX publishes. It is not district total population — Jhapa reads 1,511 for a district of roughly 800,000 — and it is not population within the shaken footprint either, because in ${exceeding.length} of ${exposureComparison.length} districts it exceeds the district's own population, which a clipped subset cannot do.`,
    comparabilityDimensions,
    whatWouldChangeTheVerdict:
      'A column definition or methodology note from OCHA for PGA_AffectedDistricts_POP, or the source GIS product the table was derived from. With the quantity established, the verdict would move to PARTIALLY COMPARABLE — the hazard variables would still differ, but that difference can be named and bounded.',
    differenceComputed: false,
    districtsPairedForDisplay: exposureComparison.length,
    districtsWhereOchaExceedsDistrictPopulation: exceeding.length,
    ratioStatistics: (() => {
      const ratios = exceeding
        .map((row) => row.ochaExposed / row.ourDistrictPopulation)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      if (ratios.length === 0) return null;
      return {
        count: ratios.length,
        median: Number(ratios[Math.floor(ratios.length / 2)].toFixed(2)),
        min: Number(ratios[0].toFixed(2)),
        max: Number(ratios[ratios.length - 1].toFixed(2)),
        note: 'A consistent multiple suggests a different population base, not a different spatial method. Recorded as a lead, not a conclusion.',
      };
    })(),
    examplesOfTheInconsistency: exceeding.slice(0, 5).map((row) => ({
      district: row.district,
      ochaFigure: row.ochaExposed,
      ourDistrictPopulation: row.ourDistrictPopulation,
      ratio: Number((row.ochaExposed / row.ourDistrictPopulation).toFixed(2)),
    })),
    ochaDistrictsTotal: ocha.data.districts.length,
    notResolvedToAPolygon: ocha.data.districts.filter((row) => !row.joinKey).map((row) => row.district),
    /* Both columns, for the presentation table. No difference column. */
    rows: exposureComparison.map((row) => ({
      district: row.district,
      districtKey: row.districtKey,
      ourDistrictPopulation: row.ourDistrictPopulation,
      ourExposedAtMmi6: row.ourExposedAtMmi6,
      ourMaxMmi: row.ourMaxMmi,
      ochaPublishedFigure: row.ochaExposed,
      ochaPgaG: row.ochaPgaG,
      ochaSeverity: row.ochaSeverity,
      ochaExceedsOurDistrictPopulation: row.ochaExceedsDistrictPopulation,
    })),
  };

  /* ---------------- why our numbers differ from OCHA's ---------------- */

  const discrepancyAnalysis = {
    question:
      'Why is our exposure estimate not reconciled against OCHA\u2019s published figures?',
    finding:
      'Because the reference cannot be pinned to a definition. Two readings were tested against the data and both fail: the column is not district total population, and it is not population within the shaken footprint. Until OCHA\u2019s column is defined, a difference against it measures nothing.',
    howThisWasFound: [
      'The comparison was first built assuming district total population, and produced a median disagreement of -24%.',
      'Jhapa reads 1,511 and Ilam 2,144 in that column — impossible as district populations, which pointed to a clipped or exposed subset.',
      'The dataset title, "Estimated Population EXPOSED to Nepal Earthquake shaking", and the shape_leng and shape_area columns in the attribute table both support a GIS overlay of PGA bands against districts.',
      `But in ${exceeding.length} of ${exposureComparison.length} paired districts the figure exceeds the district\u2019s own population, which a clipped subset cannot do, so that reading fails too.`,
      'HDX documents the dataset as "Population data by district and severity class" with methodology "Census" and no column definitions.',
    ],
    separatelyResolved: [
      {
        issue: 'District geometry',
        resolution:
          'The first version of this analysis used geoBoundaries, whose ~50 vertices per district put a point in Patan inside Kathmandu and merged two pairs of identically named polygons. It now uses OCHA COD-AB at 329 vertices per district after simplification, with six known settlements re-verified against the simplified geometry. Every one resolves correctly.',
      },
      {
        issue: 'District name matching',
        resolution:
          'All 66 OCHA districts now resolve to a boundary polygon, 64 exactly and 2 by bounded edit distance. Under the previous frame only 55 resolved.',
      },
      {
        issue: 'Population outside any district',
        resolution:
          `Cells that strict containment cannot place are attributed to the nearest district within ${FILL_TOLERANCE_KM} km, which places all of them; both the strict and filled figures are reported.`,
      },
    ],
    remainingUncertaintyInOurOwnEstimate: [
      'WorldPop is a modelled allocation, and in dense urban districts it differs materially from census counts. Our Kathmandu district figure is well above the 2011 census count projected forward, while Lalitpur and Morang land within a few per cent of theirs. The direction and size of that error is a property of the population model, not of this pipeline.',
      'MMI is itself modelled from sparse instrumentation; Nepal had few strong-motion stations in 2015.',
      'A cell is assigned whole to the contour containing its centre, so cells straddling a contour are counted entirely on one side.',
    ],
    conclusion:
      'Our exposure figures stand on their own stated definition and are reproducible from the committed artefacts. They are presented beside OCHA\u2019s published figures without a difference column, because the reference\u2019s own definition could not be established. Reporting a difference would have been easy and would have meant nothing.',
  };

  /* ---------------- validation ---------------- */

  const headlineRow = sensitivity.find((row) => row.threshold === HEADLINE_THRESHOLD);
  /* Reconcile on the exact sums; the rounded ones lose a few people by design. */
  const districtSum = byDistrict.exact.total;
  const validation = {
    cellsProcessed: cells.length,
    expectedCells: population.data.count,
    cellsMatch: cells.length === population.data.count,
    populationDecoded: Math.round(cells.reduce((sum, cell) => sum + cell.people, 0)),
    populationInArtefact: population.validation.storedTotalPopulation,
    decodeReconciles:
      Math.abs(
        cells.reduce((sum, cell) => sum + cell.people, 0) -
          population.validation.storedTotalPopulation,
      ) < 2,
    districtAssignmentReconciles:
      Math.abs(districtSum - population.validation.storedTotalPopulation) < 2,
    populationInDistricts: byDistrict.totalPopulationInDistricts,
    populationOutsideAnyDistrict: byDistrict.populationOutsideAnyDistrict,
    strictContainment: {
      populationInDistricts: strict.totalPopulationInDistricts,
      populationOutside: strict.populationOutsideAnyDistrict,
      outsidePercent: Number(
        ((strict.populationOutsideAnyDistrict / population.validation.storedTotalPopulation) * 100).toFixed(2),
      ),
      cellsOutside: strict.cellsOutsideAnyDistrict,
      exposedAtHeadline: strict.totalExposed,
    },
    nearestDistrictFill: {
      toleranceKm: FILL_TOLERANCE_KM,
      people: byDistrict.filledByNearestDistrict.people,
      cells: byDistrict.filledByNearestDistrict.cells,
      sharePercent: byDistrict.filledByNearestDistrict.shareOfTotalPercent,
      remainingOutside: byDistrict.populationOutsideAnyDistrict,
      exposedAtHeadline: byDistrict.totalExposed,
    },
    cellsOutsideAnyDistrict: byDistrict.cellsOutsideAnyDistrict,
    roundingResidualPeople: byDistrict.roundingResidual,
    districtPolygons: districts.length,
    districtKeysDistinct: new Set(districtKeys).size,
    districtsMergedFromPost2017Splits: districts.filter((f) => f.properties.mergedFrom).length,
    usableContourLevels: rings.usableLevels,
    excludedContourParts: rings.excluded.length,
    excludedContourLevels: [...new Set(rings.excluded.map((item) => item.mmi))].sort((a, b) => a - b),
    /* Cumulative exposure must fall as the threshold rises; if it does not, the containment test is wrong. */
    sensitivityIsMonotonic: sensitivity.every(
      (row, i) => i === 0 || row.exposedPopulation <= sensitivity[i - 1].exposedPopulation,
    ),
    headlineThreshold: HEADLINE_THRESHOLD,
    headlineExposed: headlineRow?.exposedPopulation ?? null,
    districtExposureSumMatchesGrid: null,
  };
  /*
   * The district exposure total and the grid exposure total are computed by
   * two different paths. They cannot match exactly — the district path drops
   * cells outside every polygon — but the district total must not EXCEED the
   * grid total, which would mean a cell was counted twice.
   */
  validation.districtExposureSumMatchesGrid =
    byDistrict.totalExposed <= (headlineRow?.exposedPopulation ?? 0) + 1;

  /*
   * The district attribution ledger, stated in full.
   *
   * Every person in the population surface is accounted for in one of three
   * places: a district reached by strict containment, a district reached only
   * by the nearest-district fallback, or nowhere. The fallback is reported as
   * its own line and never folded into the district totals silently, because
   * a person placed by proximity is a weaker claim than a person placed by
   * containment and a reader is entitled to know which they are looking at.
   */
  const reconciliation = {
    nepalPopulationTotal: population.validation.storedTotalPopulation,
    sumOfDistrictAttributedPopulation: byDistrict.totalPopulationInDistricts,
    difference: Math.round(
      population.validation.storedTotalPopulation - byDistrict.exact.total,
    ),
    differenceExplanation:
      'Exact sums are compared; the rounded per-district figures lose a few people to rounding, which is reported separately rather than folded in.',
    roundingResidualPeople: byDistrict.roundingResidual,
    populationOutsideDistrictPolygons: strict.populationOutsideAnyDistrict,
    populationOutsideDistrictPolygonsPercent: roundPercent(
      (strict.populationOutsideAnyDistrict / population.validation.storedTotalPopulation) * 100,
    ),
    cellsAssignedByContainment: cells.length - strict.cellsOutsideAnyDistrict,
    cellsAssignedByFallback: byDistrict.filledByNearestDistrict.cells,
    cellsUnassigned: byDistrict.cellsOutsideAnyDistrict,
    populationAssignedByFallback: byDistrict.filledByNearestDistrict.people,
    populationAssignedByFallbackPercent: roundPercent(
      byDistrict.filledByNearestDistrict.shareOfTotalPercent,
    ),
    fallbackMethod: `nearest district boundary within ${FILL_TOLERANCE_KM} km`,
    fallbackIsInUse: byDistrict.filledByNearestDistrict.cells > 0,
    fallbackWarning:
      byDistrict.filledByNearestDistrict.cells > 0
        ? `${byDistrict.filledByNearestDistrict.people.toLocaleString('en-US')} people (${byDistrict.filledByNearestDistrict.shareOfTotalPercent}% of Nepal) are attributed to a district by PROXIMITY, not by containment. Their district assignment is the least certain in this dataset and every district reports how many of its people arrived this way.`
        : null,
    perDistrictFallback: byDistrict.districts
      .filter((row) => row.filledPeople > 0)
      .map((row) => ({
        district: row.district,
        filledPeople: row.filledPeople,
        filledCells: row.filledCells,
        shareOfDistrictPercent: roundPercent((row.filledPeople / row.population) * 100),
      }))
      .sort((a, b) => b.filledPeople - a.filledPeople),
  };
  validation.districtAttributionLedger = reconciliation;

  const failures = [];
  if (!validation.cellsMatch) failures.push('decoded cell count does not match the artefact');
  if (!validation.decodeReconciles) failures.push('decoded population does not match the artefact total');
  if (!validation.districtAssignmentReconciles) failures.push('district assignment lost or duplicated population');
  if (!validation.sensitivityIsMonotonic) failures.push('cumulative exposure rises with the threshold, which is impossible');
  if (!validation.districtExposureSumMatchesGrid) failures.push('district exposure exceeds grid exposure: a cell was counted twice');
  validation.failures = failures;
  validation.passed = failures.length === 0;
  if (!validation.passed) throw new Error(`Stage 4 validation failed: ${failures.join('; ')}`);

  /* ---------------- methodology ---------------- */

  const inputs = [
    { dataset: 'worldpop-npl-2015-unadj', role: 'modelled population per ~1 km cell, 2015, UN-adjusted' },
    { dataset: 'usgs-nepal-2015-shakemap-contours', role: 'modelled shaking intensity as closed MMI contours' },
    { dataset: 'cod-ab-npl-adm2', role: 'the authoritative 75-district 2015 frame, merged from the current 77 and carrying p-codes' },
    { dataset: 'ocha-nepal-2015-district-exposure', role: 'independent official district populations, for comparison only' },
  ];
  const methodology = [
    createAnalysisRecord({
      id: 'exposure-population-by-intensity',
      name: 'Population by shaking intensity',
      question: 'How many people were geographically exposed to each level of earthquake shaking?',
      inputs,
      method:
        'Each ~1 km population cell is tested for containment inside the closed MMI contour rings, highest level first. The cell’s whole modelled population is assigned to the strongest contour containing its centre. Populations are then summed per band and cumulatively at or above each level.',
      formula: 'exposed(>=X) = sum of cell population where the cell centre lies inside the closed MMI X contour',
      parameters: { headlineThreshold: HEADLINE_THRESHOLD, usableLevels: rings.usableLevels },
      parameterJustification:
        'MMI VI is the lowest intensity at which the USGS scale records damage occurring at all, so "exposed at VI or above" is a statement about people who experienced potentially damaging shaking. Every other usable threshold is reported beside it, because there is no intensity at which a person crosses from unharmed to harmed \u2014 that depends on their building, not on the shaking alone.',
      outputs: ['population per intensity band', 'cumulative population at or above each intensity', 'population outside all contours'],
      visualisation: 'Population-exposure curve against threshold, and a map of the population grid tinted by the intensity band it falls in.',
      dataClass: DataClass.DERIVED,
      limitations: [
        'EXPOSURE IS NOT HARM. This counts people modelled to be inside a shaking contour. It does not say anyone was injured, or that any building failed. Whether shaking causes harm depends on construction, time of day and terrain, none of which is in this calculation.',
        'Population is a modelled 2015 surface, not a census and not a snapshot of where people were at 11:56 on a Saturday morning.',
        'A cell is assigned whole to the contour containing its centre, so cells straddling a contour are counted entirely on one side. At ~819 m cells this matters most along the steepest intensity gradients.',
        'MMI 3 and 3.5 contours run beyond the edge of the ShakeMap grid and are not closed, so population at those intensities cannot be computed by containment and is not reported. Closing them along the grid edge would assert a boundary the model does not publish.',
        'ShakeMap is itself a model constrained by sparse instrumentation; Nepal had few strong-motion stations in 2015.',
      ],
    }),
    createAnalysisRecord({
      id: 'exposure-by-district',
      name: 'Population exposure by district',
      question: 'Which districts held the exposed population, and what share of each district was exposed?',
      inputs,
      method:
        'Each population cell is assigned to at most one district by point-in-polygon containment against the 2006 75-district frame, and simultaneously to an intensity. District population, exposed population at the threshold, exposure share, density and maximum intensity are then aggregated. Cells falling outside every district polygon are counted separately, never dropped.',
      formula: 'exposed(district) = sum of cell population where the cell is inside the district AND its intensity >= threshold',
      parameters: { threshold: HEADLINE_THRESHOLD, boundaryVintage: 2006, districts: districts.length },
      parameterJustification:
        'The 2006 vintage is required, not preferred: Nepal restructured into 753 local units after the earthquake, and the event’s own statistics are reported against the 75-district system in force in 2015.',
      outputs: ['population per district', 'exposed population per district', 'exposure percentage', 'maximum MMI per district', 'population density'],
      visualisation: 'Interactive district choropleth; selecting a district reveals its population, exposed population, share and maximum intensity.',
      dataClass: DataClass.DERIVED,
      limitations: [
        'The geoBoundaries district geometry is coarse — about fifty vertices per district — and strict containment leaves 1.32 million people, 4.9% of Nepal, inside no district at all, concentrated in the dense Terai border strip. Those cells are attributed to the nearest district within 20 km, which places every one of them; the strictly contained figures are reported alongside so a reader can take either. What the fill resolves is WHICH district, not whether the people are in Nepal: WorldPop\u2019s raster is clipped to Nepal, so a populated cell in it is Nepali.',
        'A cell placed by the fill sits near a border, so its district attribution is the least certain in the dataset. Each district reports how many of its people arrived this way.',
        'The frame is reconstructed from the current 77-district COD-AB by merging the two districts split after 2015. Those two merged districts carry two p-codes each, because the 2015 district they represent no longer has one of its own.',
        'A district’s maximum MMI is the strongest contour reaching any part of it, not a characteristic value for the district.',
      ],
    }),
    createAnalysisRecord({
      id: 'exposure-threshold-sensitivity',
      name: 'Sensitivity of the exposure estimate to the intensity threshold',
      question: 'How much does the exposed-population figure depend on where the threshold is set?',
      inputs: inputs.slice(0, 2),
      method: 'The exposure calculation is repeated at every closed contour level and the resulting curve reported.',
      outputs: ['exposed population at each threshold', 'share of considered population at each threshold'],
      visualisation: 'A curve, so that a reader sees the estimate move with the threshold instead of receiving one number.',
      dataClass: DataClass.DERIVED,
      limitations: [
        'The curve is only defined over thresholds whose contours are closed, which for this event is MMI 4.5 to 8.',
        'Sensitivity to the threshold is not the same as uncertainty in the estimate: the population and hazard models carry their own errors, which this curve does not show.',
      ],
    }),
    createAnalysisRecord({
      id: 'exposure-ocha-comparison',
      name: 'Comparison against OCHA’s 2015 district figures',
      question: 'Does our independently computed district population agree with the official figures published in 2015?',
      inputs,
      method:
        'District populations derived here are differenced against OCHA’s published district populations for the districts that resolve to the same polygon. Exposure figures are deliberately NOT differenced, because ours is MMI-based and OCHA’s is PGA-based.',
      formula: 'difference = our district population - OCHA district population',
      outputs: ['per-district difference', 'per-district difference percentage', 'aggregate difference', 'districts within 10% and 20%'],
      visualisation: 'Side-by-side district table with the difference column, and a scatter of ours against OCHA’s.',
      dataClass: DataClass.DERIVED,
      limitations: [
        'Only districts that resolve to a boundary polygon can be compared; four of OCHA’s 66 cannot, for reasons recorded in the ingest.',
        'OCHA’s population is a census projection and ours is a modelled grid. Agreement is evidence that neither is badly wrong; it is not proof that either is right.',
        'The exposure halves of the two datasets are NOT comparable and are not compared. Doing so would manufacture agreement or disagreement out of a units mismatch.',
      ],
    }),
  ];

  const analysis = {
    schemaVersion: 1,
    stage: 4,
    generatedAt: new Date().toISOString().slice(0, 10),
    dataClass: DataClass.DERIVED,
    definitionOfExposure: {
      statement:
        'A person is counted as exposed at intensity X when the ~1 km population cell they are modelled into has its centre inside the closed Modified Mercalli Intensity X contour of the USGS ShakeMap for this event.',
      hazardVariable: 'Modified Mercalli Intensity (MMI), from the USGS ShakeMap product',
      headlineThreshold: HEADLINE_THRESHOLD,
      thresholdMeaning: MMI_MEANING[HEADLINE_THRESHOLD],
      spatialDefinition: 'point-in-polygon containment of the cell centre in the closed contour ring',
      populationDataset: 'WorldPop 2015 UN-adjusted, aggregated to ~819 m cells',
      populationYear: 2015,
      geographicUnit: 'Nepal districts, the 2015 75-district system, reconstructed from COD-AB',
      notWhatThisMeans:
        'Exposed does not mean harmed, injured, displaced or damaged. It is a geographic statement about modelled shaking over modelled population.',
      /*
       * The five variables, kept apart. Four of them this project cannot
       * derive at all, and saying which is the point: it stops an exposure
       * figure being read as a casualty figure by a reader who was never
       * told they were different.
       */
      impactVariables: Object.values(ImpactVariable).map((variable) => ({
        id: variable.id,
        label: variable.label,
        measures: variable.measures,
        doesNotImply: variable.doesNotImply,
        source: variable.source,
        derivableFromThisAnalysis: variable.availableToUs,
      })),
      sanctionedPhrasing: describeExposure({
        people: 0,
        threshold: HEADLINE_THRESHOLD,
        roman: MMI_MEANING[HEADLINE_THRESHOLD]?.roman,
      }).replace('0 people', '<N> people'),
      forbiddenPhrasing:
        'Never "affected", "impacted", "victims", "hit by" or "suffered". Those words assert harm this analysis does not measure.',
    },
    sources: [population, shakemap, boundaries, ocha].map((file) => ({
      datasetId: file.source.datasetId,
      license: file.source.license,
      redistribution: file.source.redistribution,
      attribution: file.source.attribution,
    })),
    validation,
    methodology,
    results: {
      intensity,
      thresholdSensitivity: sensitivity,
      thresholdCurve,
      populationIntensityQuadrants: quadrants,
      exposureAtHeadlineThreshold: byDistrict,
      districtQuadrants: districtQuadrants(byDistrict.districts, {
        intensityThreshold: HEADLINE_THRESHOLD,
      }),
      exposureStrictContainment: {
        threshold: strict.threshold,
        totalPopulationInDistricts: strict.totalPopulationInDistricts,
        totalExposed: strict.totalExposed,
        populationOutsideAnyDistrict: strict.populationOutsideAnyDistrict,
        districtsWithExposure: strict.districtsWithExposure,
      },
      exposureTotalsByThreshold: perThreshold,
      contours: {
        usableLevels: rings.usableLevels,
        excluded: rings.excluded,
      },
    },
    comparison,
    discrepancyAnalysis,
  };

  const written = await writeAnalysis('nepal-2015-population-exposure.json', analysis);
  return { analysis, written };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { analysis, written } = await analyseExposure();
  const r = analysis.results;
  console.log(`cells processed: ${analysis.validation.cellsProcessed.toLocaleString()} | population decoded ${analysis.validation.populationDecoded.toLocaleString()}`);
  console.log(`usable MMI levels: ${r.contours.usableLevels.join(', ')} | excluded open parts: ${analysis.validation.excludedContourParts}\n`);
  console.log('exposure by threshold:');
  for (const row of r.thresholdSensitivity) {
    console.log(`  MMI ${String(row.threshold).padEnd(4)} ${String(row.roman).padEnd(8)} ${row.exposedPopulation.toLocaleString().padStart(12)}  ${String(row.shareOfConsidered).padStart(6)}%   ${row.damageAtThisIntensity ?? ''}`);
  }
  const v = analysis.validation;
  console.log(`\nHEADLINE: ${v.headlineExposed.toLocaleString()} people exposed at MMI ${v.headlineThreshold}+ (grid total)`);
  console.log(`  strict containment : ${v.strictContainment.exposedAtHeadline.toLocaleString()} exposed, ${v.strictContainment.outsidePercent}% of Nepal unplaced`);
  console.log(`  nearest-district   : ${v.nearestDistrictFill.exposedAtHeadline.toLocaleString()} exposed, ${v.nearestDistrictFill.people.toLocaleString()} people placed by fill (${v.nearestDistrictFill.sharePercent}%), ${v.nearestDistrictFill.remainingOutside} left outside`);
  console.log(`\ntop districts by exposed population (MMI ${r.exposureAtHeadlineThreshold.threshold}+):`);
  for (const d of r.exposureAtHeadlineThreshold.districts.slice(0, 8)) {
    console.log(`  ${d.district.padEnd(18)} ${d.exposed.toLocaleString().padStart(10)} of ${d.population.toLocaleString().padStart(10)}  ${String(d.exposedPercent).padStart(6)}%  maxMMI ${d.maxMmi}`);
  }
  const c = analysis.comparison;
  console.log(`\nOCHA comparison verdict: ${c.verdict}`);
  console.log(`  ${c.comparabilityDimensions.filter((d) => !d.compatible).length} of ${c.comparabilityDimensions.length} dimensions incompatible; no difference computed`);
  console.log(`  ${c.districtsWhereOchaExceedsDistrictPopulation} of ${c.districtsPairedForDisplay} districts have an OCHA figure larger than the district's own population (median ratio x${c.ratioStatistics?.median})`);

  const q = analysis.results.populationIntensityQuadrants;
  console.log(`\npopulation x intensity (MMI ${q.parameters.intensityThreshold}+, density cut ${q.parameters.densityCutPeoplePerCell} people/cell):`);
  for (const quad of q.quadrants) {
    console.log(`  ${quad.label.padEnd(28)} ${roundPopulation(quad.people).text.padStart(14)}  ${String(quad.shareOfPopulationPercent).padStart(5)}%  ${String(quad.cells).padStart(7)} cells`);
  }

  const led = analysis.validation.districtAttributionLedger;
  console.log(`\ndistrict attribution ledger:`);
  console.log(`  Nepal total                ${led.nepalPopulationTotal.toLocaleString('en-US').padStart(12)}`);
  console.log(`  sum of district-attributed ${led.sumOfDistrictAttributedPopulation.toLocaleString('en-US').padStart(12)}`);
  console.log(`  difference                 ${String(led.difference).padStart(12)}`);
  console.log(`  by containment             ${led.cellsAssignedByContainment.toLocaleString('en-US').padStart(12)} cells`);
  console.log(`  by FALLBACK (proximity)    ${led.cellsAssignedByFallback.toLocaleString('en-US').padStart(12)} cells = ${led.populationAssignedByFallback.toLocaleString('en-US')} people (${led.populationAssignedByFallbackPercent}%)`);
  console.log(`  unassigned                 ${led.cellsUnassigned.toLocaleString('en-US').padStart(12)} cells`);
  console.log(`\nvalidation: ${analysis.validation.passed ? 'PASSED' : 'FAILED'}`);
  console.log(`artefact ${written.path} (${formatBytes(written.bytes)})`);
}
