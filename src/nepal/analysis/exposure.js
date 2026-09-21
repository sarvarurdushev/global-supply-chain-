/**
 * Population exposure: who was inside the shaking, and how firmly we know it.
 *
 * The central calculation of the project, and the one most easily done
 * dishonestly. Three decisions govern it and all three are stated here rather
 * than buried:
 *
 * 1. WHAT "EXPOSED" MEANS. A person is counted as exposed at intensity X when
 *    the population cell they are modelled into lies inside the closed MMI X
 *    contour. That is a GEOGRAPHIC statement about modelled shaking and
 *    modelled population. It is not a statement that they were harmed, that
 *    their building failed, or even that they were at home: the earthquake
 *    struck at 11:56 on a Saturday morning.
 *
 * 2. WHY MMI AND NOT PGA. ShakeMap publishes both. MMI is used because it is
 *    what the contour product supplies as closed rings, and because its
 *    levels carry published damage descriptions that make a threshold
 *    defensible rather than arbitrary. OCHA's comparison dataset uses PGA,
 *    which is a DIFFERENT variable — the two are related but not
 *    interchangeable, and the comparison below is careful about that.
 *
 * 3. WHY A THRESHOLD AT ALL. There is no single intensity at which a person
 *    becomes "affected". Every threshold is a choice, so the analysis runs
 *    across all of them and reports the curve; any single headline number is
 *    quoted with its threshold attached.
 *
 * Pure: geometry and arrays in, numbers out.
 */

import { distanceToPolygonDegrees, pointInPolygon } from '../geo/geometry.js';
import { distanceMetres } from '../geo/crs.js';

/**
 * USGS's own damage and perception descriptions for each intensity.
 *
 * These are the justification for treating a threshold as meaningful. MMI VI
 * is where damage begins at all; VII is where it becomes general in weak
 * construction; VIII is where even well-built structures suffer.
 */
export const MMI_MEANING = Object.freeze({
  4: { roman: 'IV', perceived: 'Light', damage: 'None' },
  4.5: {
    roman: 'IV-V',
    perceived: 'Light to moderate',
    damage: 'None to very light',
  },
  5: { roman: 'V', perceived: 'Moderate', damage: 'Very light' },
  5.5: {
    roman: 'V-VI',
    perceived: 'Moderate to strong',
    damage: 'Very light to light',
  },
  6: {
    roman: 'VI',
    perceived: 'Strong',
    damage: 'Light — the lowest intensity at which damage occurs at all',
  },
  6.5: {
    roman: 'VI-VII',
    perceived: 'Strong to very strong',
    damage: 'Light to moderate',
  },
  7: {
    roman: 'VII',
    perceived: 'Very strong',
    damage: 'Moderate — general in poorly built structures',
  },
  7.5: {
    roman: 'VII-VIII',
    perceived: 'Very strong to severe',
    damage: 'Moderate to heavy',
  },
  8: {
    roman: 'VIII',
    perceived: 'Severe',
    damage: 'Heavy — considerable in ordinary buildings, partial collapse',
  },
});

/**
 * Turn MMI contour lines into rings usable for containment.
 *
 * ShakeMap publishes contours as MultiLineStrings. A closed line is a ring; an
 * open one runs off the edge of the model grid and CANNOT be closed without
 * inventing a boundary, so it is excluded and reported rather than joined up.
 * For the Gorkha ShakeMap every part at MMI 4.5 and above is closed, which is
 * why the analysis is restricted to those levels.
 */
export function contoursToRings(features, { minRingPositions = 4 } = {}) {
  const levels = new Map();
  const excluded = [];
  for (const feature of features) {
    const mmi = feature?.properties?.mmi;
    if (!Number.isFinite(mmi)) continue;
    const geometry = feature.geometry;
    const parts =
      geometry.type === 'MultiLineString'
        ? geometry.coordinates
        : [geometry.coordinates];
    const rings = [];
    for (const part of parts) {
      if (part.length < minRingPositions) {
        excluded.push({
          mmi,
          reason: 'fewer positions than a ring needs',
          positions: part.length,
        });
        continue;
      }
      const [firstLon, firstLat] = part[0];
      const [lastLon, lastLat] = part[part.length - 1];
      const closed =
        Math.abs(firstLon - lastLon) < 1e-6 &&
        Math.abs(firstLat - lastLat) < 1e-6;
      if (!closed) {
        /*
         * Not closed: the contour leaves the model grid. Closing it along the
         * grid edge would assert a shaking boundary the model does not
         * publish, so it is dropped and counted.
         */
        excluded.push({
          mmi,
          reason: 'contour is not closed; it runs beyond the ShakeMap grid',
          positions: part.length,
        });
        continue;
      }
      rings.push(part);
    }
    if (rings.length > 0) levels.set(mmi, rings);
  }
  return Object.freeze({
    levels: Object.freeze(
      [...levels.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([mmi, rings]) =>
          Object.freeze({ mmi, rings, ringCount: rings.length }),
        ),
    ),
    excluded: Object.freeze(excluded),
    usableLevels: Object.freeze([...levels.keys()].sort((a, b) => a - b)),
  });
}

/**
 * The highest intensity contour containing a point, or null outside them all.
 *
 * Tested from the highest level down so the first containment wins, which is
 * both correct for nested contours and the fast path for the vast majority of
 * cells that lie outside the strongest shaking.
 */
export function intensityAt(rings, lon, lat) {
  for (let i = rings.levels.length - 1; i >= 0; i -= 1) {
    const level = rings.levels[i];
    for (const ring of level.rings) {
      if (
        pointInPolygon([lon, lat], { type: 'Polygon', coordinates: [ring] })
      ) {
        return level.mmi;
      }
    }
  }
  return null;
}

/**
 * Decode the sparse population grid into `{lon, lat, people}` triples.
 *
 * The artefact stores gaps between populated cells in row-major order; this
 * is the inverse, and it is exact.
 */
export function* decodePopulationGrid(grid) {
  let index = -1;
  for (let i = 0; i < grid.count; i += 1) {
    index += grid.gaps[i];
    const col = index % grid.grid.cols;
    const row = Math.floor(index / grid.grid.cols);
    yield {
      lon: grid.grid.originLon + col * grid.grid.stepLon,
      lat: grid.grid.originLat - row * grid.grid.stepLat,
      people: grid.people[i],
    };
  }
}

/**
 * Population by intensity band, and cumulative population at or above each.
 *
 * The cumulative column is the one a headline quotes, and it is the reason
 * the threshold must always be quoted with it.
 */
export function populationByIntensity(cells, rings) {
  const perLevel = new Map(rings.usableLevels.map((mmi) => [mmi, 0]));
  let outside = 0;
  let total = 0;
  for (const cell of cells) {
    total += cell.people;
    const mmi = intensityAt(rings, cell.lon, cell.lat);
    if (mmi === null) outside += cell.people;
    else perLevel.set(mmi, perLevel.get(mmi) + cell.people);
  }
  const levels = rings.usableLevels;
  const bands = [];
  for (let i = 0; i < levels.length; i += 1) {
    const mmi = levels[i];
    /* At or above this level: this band plus every stronger one. */
    let cumulative = 0;
    for (let j = i; j < levels.length; j += 1)
      cumulative += perLevel.get(levels[j]);
    bands.push({
      mmi,
      meaning: MMI_MEANING[mmi] ?? null,
      populationInBand: Math.round(perLevel.get(mmi)),
      populationAtOrAbove: Math.round(cumulative),
    });
  }
  return Object.freeze({
    bands: Object.freeze(bands.map((band) => Object.freeze(band))),
    populationOutsideAllContours: Math.round(outside),
    totalPopulationConsidered: Math.round(total),
  });
}

/**
 * Population and exposure per district.
 *
 * One pass over the cells, assigning each to a district by containment and to
 * an intensity by containment, so a cell is counted once and the district
 * totals sum to the national total by construction.
 */
export function exposureByDistrict(
  cells,
  rings,
  districts,
  { threshold, fillToleranceKm = 0 },
) {
  const byKey = new Map();
  for (const feature of districts) {
    byKey.set(feature.properties.districtKey, {
      district: feature.properties.district,
      districtKey: feature.properties.districtKey,
      areaSqKm: feature.properties.areaSqKm,
      population: 0,
      exposed: 0,
      maxMmi: null,
      cells: 0,
    });
  }
  let unassigned = 0;
  let unassignedCells = 0;
  let filledPeople = 0;
  let filledCells = 0;

  for (const cell of cells) {
    const mmi = intensityAt(rings, cell.lon, cell.lat);
    let hit = null;
    for (const feature of districts) {
      /* Cheap rejection first: most districts cannot contain most cells. */
      const [west, south, east, north] = feature.properties.bbox;
      if (
        cell.lon < west ||
        cell.lon > east ||
        cell.lat < south ||
        cell.lat > north
      )
        continue;
      if (pointInPolygon([cell.lon, cell.lat], feature.geometry)) {
        hit = byKey.get(feature.properties.districtKey);
        break;
      }
    }
    if (!hit && fillToleranceKm > 0) {
      /*
       * Nearest-district attribution.
       *
       * Measured: 4,472 cells holding 1.32 million people — 4.9% of Nepal —
       * fall inside no district polygon, every one of them within 20 km of a
       * district boundary and concentrated in the Terai, where 8.6% of the
       * population of the 26-27 N band is stranded. The cause is the coarse
       * geoBoundaries geometry, about fifty vertices per district, cutting
       * across the dense southern border strip.
       *
       * These people are not in doubt: WorldPop's raster is clipped to Nepal,
       * so a populated cell in it IS in Nepal. What is in doubt is WHICH
       * district, and the nearest polygon boundary is the defensible answer.
       * The tolerance is explicit and the filled count is reported separately
       * from the strictly contained one, so a reader can take either.
       */
      let nearest = null;
      let nearestDegrees = Infinity;
      for (const feature of districts) {
        const degrees = distanceToPolygonDegrees(
          [cell.lon, cell.lat],
          feature.geometry,
        );
        if (degrees < nearestDegrees) {
          nearestDegrees = degrees;
          nearest = feature;
        }
      }
      if (nearest) {
        const km =
          distanceMetres(
            cell.lon,
            cell.lat,
            cell.lon + nearestDegrees,
            cell.lat,
          ) / 1000;
        if (km <= fillToleranceKm) {
          hit = byKey.get(nearest.properties.districtKey);
          if (hit) {
            hit.filledCells = (hit.filledCells ?? 0) + 1;
            hit.filledPeople = (hit.filledPeople ?? 0) + cell.people;
            filledPeople += cell.people;
            filledCells += 1;
          }
        }
      }
    }
    if (!hit) {
      /*
       * Still unplaced: beyond the tolerance, or no tolerance was allowed.
       * Counted, never silently dropped.
       */
      unassigned += cell.people;
      unassignedCells += 1;
      continue;
    }
    hit.population += cell.people;
    hit.cells += 1;
    if (mmi !== null) {
      if (hit.maxMmi === null || mmi > hit.maxMmi) hit.maxMmi = mmi;
      if (mmi >= threshold) hit.exposed += cell.people;
    }
  }

  const rows = [...byKey.values()]
    .map((row) => ({
      ...row,
      population: Math.round(row.population),
      exposed: Math.round(row.exposed),
      exposedPercent:
        row.population > 0
          ? Number(((row.exposed / row.population) * 100).toFixed(2))
          : 0,
      populationDensityPerSqKm:
        row.areaSqKm > 0
          ? Number((row.population / row.areaSqKm).toFixed(1))
          : null,
      /** How much of this district's population arrived by nearest-district fill. */
      filledCells: row.filledCells ?? 0,
      filledPeople: Math.round(row.filledPeople ?? 0),
    }))
    .sort((a, b) => b.exposed - a.exposed);

  /*
   * Exact totals as well as the rounded per-district ones.
   *
   * Summing 75 rounded district populations and a rounded remainder loses a
   * handful of people to rounding — five, here. That is not a defect, but a
   * reconciliation test run against the rounded figures cannot tell it apart
   * from a real leak, so the exact sums are carried and the residual is
   * reported.
   */
  const exactInDistricts = [...byKey.values()].reduce(
    (sum, row) => sum + row.population,
    0,
  );
  const exactExposed = [...byKey.values()].reduce(
    (sum, row) => sum + row.exposed,
    0,
  );
  return Object.freeze({
    threshold,
    fillToleranceKm,
    filledByNearestDistrict: Object.freeze({
      people: Math.round(filledPeople),
      cells: filledCells,
      shareOfTotalPercent:
        exactInDistricts + unassigned > 0
          ? Number(
              ((filledPeople / (exactInDistricts + unassigned)) * 100).toFixed(
                2,
              ),
            )
          : 0,
    }),
    districts: Object.freeze(rows.map((row) => Object.freeze(row))),
    totalPopulationInDistricts: Math.round(exactInDistricts),
    totalExposed: Math.round(exactExposed),
    districtsWithExposure: rows.filter((row) => row.exposed > 0).length,
    populationOutsideAnyDistrict: Math.round(unassigned),
    cellsOutsideAnyDistrict: unassignedCells,
    exact: Object.freeze({
      inDistricts: exactInDistricts,
      exposed: exactExposed,
      outsideAnyDistrict: unassigned,
      total: exactInDistricts + unassigned,
    }),
    roundingResidual: Number(
      (
        exactInDistricts +
        unassigned -
        (rows.reduce((sum, row) => sum + row.population, 0) +
          Math.round(unassigned))
      ).toFixed(2),
    ),
  });
}

/**
 * Exposure across every usable threshold.
 *
 * There is no single intensity at which a person becomes affected, so the
 * estimate is reported as a curve. A reader who wants one number takes it
 * from the row whose threshold they can defend, and the threshold travels
 * with it.
 */
export function thresholdSensitivity(intensitySummary) {
  return Object.freeze(
    intensitySummary.bands.map((band) =>
      Object.freeze({
        threshold: band.mmi,
        roman: band.meaning?.roman ?? null,
        damageAtThisIntensity: band.meaning?.damage ?? null,
        exposedPopulation: band.populationAtOrAbove,
        shareOfConsidered: Number(
          (
            (band.populationAtOrAbove /
              intensitySummary.totalPopulationConsidered) *
            100
          ).toFixed(2),
        ),
      }),
    ),
  );
}
