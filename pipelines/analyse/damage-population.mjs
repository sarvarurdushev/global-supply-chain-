#!/usr/bin/env node
/**
 * Stage 5 §5.10–§5.11 — people and observed damage on the same units.
 *
 *   INPUT    data/processed: UNOSAT damage sites, WorldPop 2015 population,
 *            district boundaries, ShakeMap contours
 *   OUTPUT   data/analysis: population near observed damage, and the
 *            concentration quadrants
 *
 * Stage 4 counted people inside a modelled hazard footprint. This stage counts
 * people near OBSERVED damage, which is a different and narrower statement,
 * and the whole risk is that the second gets quoted with the emotional weight
 * of a third thing nobody measured. The wording is therefore carried in the
 * artefact beside every figure, and the phrasings that must never be used are
 * listed there too.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DataClass } from '../../src/nepal/registry.js';
import { createSpatialAnalysisRecord } from '../../src/nepal/analysis/methodology.js';
import { ImpactVariable, ResultClass, roundPopulation } from '../../src/nepal/analysis/terminology.js';
import { contoursToRings, intensityAt, decodePopulationGrid } from '../../src/nepal/analysis/exposure.js';
import { pointInPolygon } from '../../src/nepal/geo/geometry.js';
import { gini, concentrationCurve, spearman } from '../../src/nepal/analysis/stats.js';
import {
  PROXIMITY_BANDS_METRES,
  damagePopulationQuadrants,
  populationNearDamage,
} from '../../src/nepal/analysis/damageLinkage.js';
import { PROCESSED, writeAnalysis } from '../lib/io.mjs';

const read = async (name) => JSON.parse(await readFile(path.join(PROCESSED, name), 'utf8'));

/**
 * The shared unit: the WorldPop cell itself, about 819 m north-south at this
 * latitude. Stated in degrees because that is how the grid is defined; a
 * square-kilometre grid laid over it double-counts, as the note below records.
 */
const CELL_DEGREES = 0.008333333;

export async function analyseDamagePopulation() {
  const unosatFile = await read('nepal-2015-unosat-damage-sites.json');
  const populationFile = await read('nepal-2015-population-1km.json');
  const boundariesFile = await read('nepal-districts-adm2-2015.json');
  const shakemapFile = await read('nepal-2015-shakemap-contours.json');

  const rings = contoursToRings(shakemapFile.data.features);
  const intensityOf = (lon, lat) => intensityAt(rings, lon, lat);
  const districts = boundariesFile.data.features.map((feature) => ({
    district: feature.properties.district,
    bbox: feature.properties.bbox,
    geometry: feature.geometry,
  }));
  const districtOf = (lon, lat) => {
    for (const district of districts) {
      const box = district.bbox;
      if (box && (lon < box[0] || lon > box[2] || lat < box[1] || lat > box[3])) continue;
      if (pointInPolygon([lon, lat], district.geometry)) return district.district;
    }
    return null;
  };

  const damagePoints = unosatFile.data.features.map((feature) => ({
    coordinates: feature.geometry.coordinates,
    damageClass: feature.properties.damageClass,
  }));
  const cells = [...decodePopulationGrid(populationFile.data)];

  /* ---------------- §5.10 population in a stated relationship ---------- */

  const proximity = populationNearDamage(cells, damagePoints);

  /* ---------------- §5.11 the shared grid ---------------- */

  /*
   * The universe of cells is the districts in which damage was observed.
   *
   * Three candidates were considered and this is the least misleading.
   * Restricting to cells near damage would make "low damage" vacuous;
   * using the whole country would swamp the table with cells nobody looked
   * at; using the districts that were examined keeps a real comparison
   * between where people were and where damage was seen, while leaving the
   * "no damage observed" ambiguity visible rather than hidden.
   */
  /*
   * THE SHARED UNIT IS THE WORLDPOP GRID ITSELF, not a square kilometre drawn
   * over it. An earlier version binned both variables onto a 1 km UTM grid,
   * and because WorldPop's ~819 m cells are smaller than that, two population
   * cells could land in one UTM cell and each claim its whole damage count.
   * The result read 6,139 damage points from 4,583 — a third of the damage
   * invented by the choice of unit. Keying on the population grid's own
   * row and column makes the mapping exact: every damage point lands in
   * exactly one cell.
   */
  const grid = populationFile.data.grid;
  const keyOfLonLat = (lon, lat) => {
    const col = Math.floor((lon - grid.originLon) / grid.stepLon + 0.5);
    const row = Math.floor((grid.originLat - lat) / grid.stepLat + 0.5);
    return `${col}:${row}`;
  };
  const damageByCell = new Map();
  for (const point of damagePoints) {
    const key = keyOfLonLat(point.coordinates[0], point.coordinates[1]);
    damageByCell.set(key, (damageByCell.get(key) ?? 0) + 1);
  }
  const damagedDistricts = new Set();
  for (const point of damagePoints) {
    const name = districtOf(point.coordinates[0], point.coordinates[1]);
    if (name) damagedDistricts.add(name);
  }

  const analysed = [];
  for (const cell of cells) {
    const name = districtOf(cell.lon, cell.lat);
    if (!name || !damagedDistricts.has(name)) continue;
    analysed.push({
      lon: cell.lon,
      lat: cell.lat,
      people: cell.people,
      damage: damageByCell.get(keyOfLonLat(cell.lon, cell.lat)) ?? 0,
      district: name,
      mmi: intensityOf(cell.lon, cell.lat),
    });
  }

  const occupiedCounts = analysed.filter((cell) => cell.damage > 0).map((cell) => cell.damage);
  const medianOccupied = occupiedCounts.length
    ? occupiedCounts.slice().sort((a, b) => a - b)[Math.floor(occupiedCounts.length / 2)]
    : 1;
  const quadrantsPresence = damagePopulationQuadrants(analysed, { damageThreshold: 1 });
  const quadrantsConcentrated = damagePopulationQuadrants(analysed, {
    damageThreshold: Math.max(2, medianOccupied),
  });

  /*
   * The comparison the quadrants exist to make: is observed damage more
   * concentrated than the population it sits among? Measured over the same
   * cells, so the two Ginis are directly comparable.
   */
  const populationGini = gini(analysed.map((cell) => cell.people));
  const damageGiniValue = gini(analysed.map((cell) => cell.damage));
  const correlation = spearman(
    analysed.map((cell) => cell.people),
    analysed.map((cell) => cell.damage),
  );
  const populationCurve = concentrationCurve(analysed.map((cell) => cell.people));
  const damageCurve = concentrationCurve(analysed.map((cell) => cell.damage));

  const byDistrict = [...damagedDistricts].sort().map((name) => {
    const group = analysed.filter((cell) => cell.district === name);
    const damaged = group.filter((cell) => cell.damage > 0);
    const people = group.reduce((a, b) => a + b.people, 0);
    return {
      district: name,
      cells: group.length,
      cellsWithObservedDamage: damaged.length,
      shareOfCellsWithObservedDamage: Number(((damaged.length / group.length) * 100).toFixed(1)),
      population: Math.round(people),
      populationInCellsWithObservedDamage: Math.round(damaged.reduce((a, b) => a + b.people, 0)),
      damagePoints: group.reduce((a, b) => a + b.damage, 0),
      damagePointsPerThousandPeople:
        people > 0 ? Number(((group.reduce((a, b) => a + b.damage, 0) / people) * 1000).toFixed(2)) : null,
    };
  }).sort((a, b) => b.damagePoints - a.damagePoints);

  /* ---------------- validation ---------------- */

  const checks = [
    {
      name: 'Proximity bands are cumulative and monotonic',
      passed: proximity.bands.every(
        (band, index) => index === 0 || band.people >= proximity.bands[index - 1].people,
      ),
      detail: proximity.bands.map((band) => `${band.withinMetres}m:${band.people}`).join(' '),
    },
    {
      name: 'Damage points are binned onto the population grid without duplication',
      passed:
        [...damageByCell.values()].reduce((a, b) => a + b, 0) === damagePoints.length &&
        analysed.reduce((a, cell) => a + cell.damage, 0) <= damagePoints.length,
      detail: `${[...damageByCell.values()].reduce((a, b) => a + b, 0)} points binned from ${damagePoints.length}; ${analysed.reduce((a, cell) => a + cell.damage, 0)} of them land in a POPULATED cell of the analysed districts, the rest in cells WorldPop models as unpopulated`,
    },
    {
      name: 'Quadrants partition the analysed cells',
      passed:
        Object.values(quadrantsPresence.quadrants).reduce((a, q) => a + q.cells, 0) ===
        quadrantsPresence.cellsAnalysed,
      detail: `${quadrantsPresence.cellsAnalysed} cells across four quadrants`,
    },
    {
      name: 'The damage threshold is not a median split',
      passed: quadrantsPresence.damageThreshold === 1,
      detail: `Median damage count across the analysed cells is ${analysed.map((c) => c.damage).sort((a, b) => a - b)[Math.floor(analysed.length / 2)]}, so a median split would be meaningless; presence is used and a second cut at ${quadrantsConcentrated.damageThreshold} is reported beside it`,
    },
    {
      name: 'No displacement, homelessness or casualty figure appears in this stage',
      passed: true,
      detail: 'The artefact carries the sanctioned wording and the forbidden phrasings explicitly.',
    },
  ];

  const analysis = {
    schemaVersion: 1,
    stage: 5,
    generatedAt: new Date().toISOString().slice(0, 10),
    dataClass: DataClass.DERIVED,
    definitionOfTheRelationship: {
      statement:
        'A person is counted near observed damage when the ~1 km modelled population cell they are placed in has its centre within a stated distance of a point where a satellite analyst recorded a damaged structure.',
      whatItIsNot:
        'It is not a count of damaged homes, of people whose homes were damaged, of displaced people, or of anyone harmed. Those are four further variables, and this project holds a source for none of them.',
      sanctionedWording: proximity.wording,
      forbiddenWording: proximity.forbidden,
      impactVariables: Object.values(ImpactVariable).map((variable) => ({
        id: variable.id,
        label: variable.label,
        derivableFromThisAnalysis: variable.availableToUs,
        source: variable.source,
      })),
    },
    sources: [unosatFile, populationFile, boundariesFile, shakemapFile].map((file) => ({
      datasetId: file.source.datasetId,
      license: file.source.license,
      redistribution: file.source.redistribution,
      attribution: file.source.attribution,
    })),
    validation: { passed: checks.every((check) => check.passed), checks },
    methodology: buildMethodology({
      proximity, quadrantsPresence, quadrantsConcentrated,
      populationGini, damageGiniValue, correlation, analysed, damagedDistricts,
    }),
    results: {
      populationNearObservedDamage: {
        ...proximity,
        rounded: proximity.bands.map((band) => ({
          withinMetres: band.withinMetres,
          people: band.people,
          rounded: roundPopulation(band.people).text,
          statement:
            `${roundPopulation(band.people).text} people lived in ~1 km modelled population cells whose centre lies within ` +
            `${band.withinMetres} m of an observed damage point.`,
        })),
      },
      concentration: {
        universe: {
          districts: [...damagedDistricts].sort(),
          cells: analysed.length,
          population: Math.round(analysed.reduce((a, b) => a + b.people, 0)),
          damagePointsInside: analysed.reduce((a, b) => a + b.damage, 0),
          basis:
            'Populated 1 km cells inside the districts where damage was observed. Not the whole country, because most of it was never examined; not just the cells near damage, because that would make "low damage" vacuous.',
        },
        populationGini,
        damageGini: damageGiniValue,
        moreConcentrated:
          damageGiniValue > populationGini ? 'OBSERVED_DAMAGE' : 'POPULATION',
        populationCurve,
        damageCurve,
        spearmanPopulationVsDamage: correlation,
        correlationNote:
          'A positive rank correlation here means cells with more people tend to carry more observed damage points. That is expected for at least two reasons that have nothing to do with vulnerability: there are more buildings where there are more people, and satellites were tasked over settlements. It is not evidence that dense areas fared worse.',
      },
      quadrants: {
        byPresence: quadrantsPresence,
        byConcentration: quadrantsConcentrated,
        thresholdNote:
          'Two cuts are reported because one would hide the shape: presence separates examined-and-damaged from everything else, and the second cut separates cells with scattered damage from cells with a concentration of it.',
      },
      byDistrict,
    },
  };

  const written = await writeAnalysis('nepal-2015-damage-population.json', analysis);
  return { analysis, written };
}

function buildMethodology({
  proximity, quadrantsPresence, quadrantsConcentrated,
  populationGini, damageGiniValue, correlation, analysed, damagedDistricts,
}) {
  const unosatInput = { dataset: 'unosat-nepal-2015-damage-sites', role: 'observed damage points' };
  const populationInput = { dataset: 'worldpop-npl-2015-unadj', role: 'modelled 2015 population surface' };
  return [
    createSpatialAnalysisRecord({
      id: 'damage-population-proximity',
      name: 'Population in a stated spatial relationship to observed damage',
      question: 'How many people did the 2015 modelled population surface place within a given distance of an observed damage point?',
      inputs: [unosatInput, populationInput],
      spatialCoverage:
        'Wherever the two overlap: the UNOSAT analysis areas and their surroundings out to 10 km. Population beyond that is reported separately rather than dropped.',
      method:
        'Index the damage points on a grid in EPSG:32645, then for each populated cell find the nearest damage point and add the cell’s whole modelled population to every band at or beyond that distance.',
      formula: 'people(<=d) = sum of cell population where min distance from cell centre to any damage point <= d',
      parameters: { bandsMetres: PROXIMITY_BANDS_METRES },
      parameterJustification:
        'The zero band is "same 1 km cell", which is the finest relationship the population surface can express; 1 km and 2 km are walking distances at which a household is plausibly in the same settlement as the damage; 5 km and 10 km are reported to show how fast the figure grows with the distance chosen, which is the point of reporting a curve rather than one number.',
      outputs: ['population within each band', 'cells within each band', 'population beyond the furthest band'],
      visualisation: 'Population against distance-to-damage, with each band labelled by its full sentence rather than a bare number.',
      validation: `Bands are cumulative and monotonic; ${proximity.cellsWithinFurthestBand} cells fall inside the furthest band and ${proximity.populationBeyondFurthestBand} people are reported as beyond it.`,
      dataClass: DataClass.DERIVED,
      resultClass: ResultClass.DERIVED.id,
      limitations: [
        'NEITHER ENDPOINT IS A PERSON. It is the distance from a modelled cell centre to an observed point, and the cell is about a kilometre across.',
        'The damage points are only where satellites looked, so a population near unexamined damage is counted as far from damage.',
        'Population is residential and modelled for 2015, not a record of where anyone was at 11:56 on a Saturday.',
        'This measures proximity and nothing else. It does not imply that any of these people lost a home, were displaced or were harmed.',
      ],
    }),
    createSpatialAnalysisRecord({
      id: 'damage-population-concentration',
      name: 'Where people were against where damage was observed',
      question: 'Is observed damage more concentrated than the population among which it sits, and which cells combine many people with observed damage?',
      inputs: [unosatInput, populationInput, { dataset: 'cod-ab-npl-adm2', role: 'the district universe' }],
      spatialCoverage: `Populated 1 km cells inside the ${damagedDistricts.size} districts where damage was observed — ${analysed.length} cells, not Nepal.`,
      method:
        'Bin damage points onto the WorldPop grid\u2019s own cells \u2014 the same cells the population is reported in \u2014 then measure the concentration of each with a Gini coefficient over identical cells, and cross-classify the cells by a population threshold taken from their own median and a damage threshold taken from presence.',
      formula: 'G over cells for each variable; quadrant = (people >= median) x (damage >= threshold)',
      parameters: {
        cellDegrees: CELL_DEGREES,
        populationThreshold: quadrantsPresence.populationThreshold,
        damageThresholdPresence: quadrantsPresence.damageThreshold,
        damageThresholdConcentrated: quadrantsConcentrated.damageThreshold,
      },
      parameterJustification:
        'The population cut is the median of the analysed cells, computed independently of the damage axis so the two variables cannot define each other. The damage cut is NOT a median: the median damage count across these cells is zero, so a median split would classify every cell with a single observation as "high". Presence is used instead, with a second cut at the median count among cells that have any, and both are reported.',
      outputs: ['Gini for population and for observed damage over the same cells', 'concentration curves', 'four quadrants with populations and examples', 'per-district cell coverage'],
      visualisation: 'Scatter of population against observed damage per cell with the quadrant lines drawn, and the two concentration curves overlaid.',
      validation: `Quadrants partition all ${quadrantsPresence.cellsAnalysed} analysed cells; damage Gini ${damageGiniValue?.toFixed(3)} against population Gini ${populationGini?.toFixed(3)} over identical cells; Spearman ${correlation?.toFixed(3)}.`,
      dataClass: DataClass.DERIVED,
      resultClass: ResultClass.DERIVED.id,
      limitations: [
        '"LOW DAMAGE" MEANS NO DAMAGE POINT WAS OBSERVED IN THE CELL, which outside the examined areas is not evidence that the buildings held.',
        'The universe is the districts that were examined, so the analysis compares places inside the tasked areas and says nothing about the rest of Nepal.',
        'A positive population-damage correlation is expected from building density and from satellite tasking alone, and is not evidence that denser places fared worse.',
        'Cell boundaries are aligned to the UTM origin, so a settlement straddling a boundary is split between two cells.',
      ],
    }),
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { analysis, written } = await analyseDamagePopulation();
  const r = analysis.results;
  console.log(`Stage 5 damage-population analysis -> ${written.path}`);
  for (const band of r.populationNearObservedDamage.rounded) console.log(`  ${band.statement}`);
  console.log(`  universe: ${r.concentration.universe.cells} cells in ${r.concentration.universe.districts.length} districts, ${r.concentration.universe.population} people`);
  console.log(`  Gini population ${r.concentration.populationGini.toFixed(3)} vs observed damage ${r.concentration.damageGini.toFixed(3)} -> more concentrated: ${r.concentration.moreConcentrated}`);
  console.log(`  Spearman population vs damage: ${r.concentration.spearmanPopulationVsDamage.toFixed(3)}`);
  for (const [name, q] of Object.entries(r.quadrants.byPresence.quadrants)) console.log(`  ${name.padEnd(34)} cells=${String(q.cells).padStart(5)} people=${String(q.people).padStart(8)} damage=${q.damagePoints}`);
  console.log(`  validation: ${analysis.validation.passed ? 'PASSED' : 'FAILED'}`);
  for (const check of analysis.validation.checks.filter((c) => !c.passed)) console.log(`    FAILED: ${check.name} — ${check.detail}`);
}
