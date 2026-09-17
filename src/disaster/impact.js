/**
 * Impact intelligence — human, infrastructure and economic.
 *
 * §6, §7 and §9, under one rule that all three share and that §6 states most
 * plainly: "Do not simply display '10,000 people affected'. Instead, show it
 * geographically."
 *
 * So nothing here returns a headline number. Every function returns a set of
 * PLACED items — a band with a footprint, a city with a coordinate, a road
 * segment with a geometry — each carrying its own availability label. A panel
 * renders them as a list and the map renders the same objects as geometry, so
 * the figure and its location are the same fact rather than two.
 *
 * THE DISTINCTION THE WHOLE MODULE TURNS ON. Exposure is computable; damage is
 * not published. Given the real OSM road network and the real USGS ground
 * failure model, "this segment crosses terrain rated high landslide hazard" is
 * a defensible modelled statement. "This segment was destroyed" is not
 * available for any past disaster as open data. The first is what this module
 * produces; the second is declared absent in timeline.js with what would
 * supply it. Conflating them would be the single most misleading thing the
 * platform could do, because a reader would take a risk map for a damage
 * assessment.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

import { AVAILABILITY } from './catalogue.js';
import { classifyIntensity } from './hazards.js';
import { haversineKm } from '../supplychain/geo.js';

/** Infrastructure states (§7: normal → damaged → recovery). */
export const INFRA_STATE = Object.freeze({
  OPERATIONAL: 'OPERATIONAL',
  /** Exposed to a hazard the model rates high. Not an observed closure. */
  AT_RISK: 'AT_RISK',
  /** Reported closed or destroyed by a cited source. */
  CLOSED: 'CLOSED',
  RECOVERING: 'RECOVERING',
  UNKNOWN: 'UNKNOWN',
});

/** How an infrastructure state was arrived at, which the map legend prints. */
export const STATE_BASIS = Object.freeze({
  OBSERVED: 'OBSERVED',
  MODELLED: 'MODELLED',
  ASSUMED: 'ASSUMED',
});

/**
 * Turn PAGER exposure bands into placed, mapped human impact.
 *
 * §6's requirement. A band is not a number in a card: it has an intensity, a
 * footprint on the map (the matching MMI contour), a population, and a
 * statement of whether it was measured or extrapolated.
 *
 * @param {object} input
 * @param {object} input.exposure from the USGS adapter
 * @param {object|null} [input.contours] MMI contour bands, to give each a shape
 * @returns {Readonly<object>}
 */
export function humanImpactBands({ exposure, contours = null }) {
  if (!exposure?.bands) return null;
  const contourByMmi = new Map(
    (contours?.bands ?? []).map((band) => [Math.round(band.mmi), band]),
  );
  const bands = exposure.bands
    .filter((band) => band.population > 0)
    .map((band) => {
      const intensity = classifyIntensity('MMI', band.mmi);
      return Object.freeze({
        id: `mmi-${band.mmi}`,
        mmi: band.mmi,
        label: band.label,
        intensityName: intensity?.name ?? null,
        colour: intensity?.colour ?? null,
        population: band.population,
        /** The footprint, where a contour exists for this band. */
        footprint: contourByMmi.get(band.mmi)?.lines ?? null,
        availability: band.insideShakeMap
          ? AVAILABILITY.MODELLED
          : AVAILABILITY.ESTIMATED,
        /*
         * The sentence that stops a reader turning exposure into casualties.
         * Repeated per band rather than once at the top, because a band is
         * what gets screenshotted.
         */
        caveat: band.insideShakeMap
          ? 'Population that experienced this shaking. Exposure, not casualties.'
          : 'Outside the measured ShakeMap footprint, so this population figure is extrapolated and looser than the bands inside it.',
        source: 'USGS PAGER',
      });
    })
    .sort((a, b) => b.mmi - a.mmi);
  if (bands.length === 0) return null;
  return Object.freeze({
    bands: Object.freeze(bands),
    /** Deliberately not a headline: the sum, with the split kept visible. */
    measuredPopulation: bands
      .filter((band) => band.availability === AVAILABILITY.MODELLED)
      .reduce((sum, band) => sum + band.population, 0),
    extrapolatedPopulation: bands
      .filter((band) => band.availability === AVAILABILITY.ESTIMATED)
      .reduce((sum, band) => sum + band.population, 0),
    sourceUrl: exposure.sourceUrl ?? null,
  });
}

/**
 * Rank cities by the shaking they actually measured.
 *
 * The LEVEL 3 reading (§3): Kathmandu at MMI 7.89 with 1,442,271 people is a
 * measured value for a named place, not a regional average. Cities with no
 * population in the product report null rather than zero.
 *
 * @param {object} input
 * @param {object} input.cityIntensities from the USGS adapter
 * @param {number} [input.minMmi] only cities above this, since MMI V is felt
 *   but not damaging and a list of a hundred of them buries the finding
 */
export function affectedCities({ cityIntensities, minMmi = 6 }) {
  const cities = (cityIntensities?.cities ?? [])
    .filter((city) => city.mmi >= minMmi)
    .map((city) =>
      Object.freeze({
        id: `city:${city.name}`,
        name: city.name,
        latitude: city.latitude,
        longitude: city.longitude,
        mmi: city.mmi,
        band: classifyIntensity('MMI', city.mmi),
        population: city.population,
        availability: AVAILABILITY.MODELLED,
        source: 'USGS PAGER exposure product',
        /** Null where the product carried no population for this place. */
        populationNote:
          city.population == null
            ? 'No population recorded for this place in the source product.'
            : null,
      }),
    );
  if (cities.length === 0) return null;
  return Object.freeze({
    cities: Object.freeze(cities),
    minMmi,
    withPopulation: cities.filter((city) => city.population != null).length,
    sourceUrl: cityIntensities?.sourceUrl ?? null,
  });
}

/**
 * Classify road segments by the hazard they are exposed to.
 *
 * §7 asks the map to show normal → damaged → recovery. This is the honest
 * version of that for a historical disaster: real OSM geometry, rated against
 * a real published hazard model, returning AT_RISK rather than CLOSED — and
 * every returned segment carries `basis: MODELLED` so the legend can say so.
 *
 * A segment is exposed when any of its points falls inside a hazard zone, not
 * when its midpoint does: a corridor clipping the corner of a high-hazard
 * slope is exactly the case that closes a road, and midpoint sampling misses
 * it.
 *
 * @param {object} input
 * @param {Array<object>} input.segments OSM lines `{osmId, coordinates, tags}`
 * @param {Array<object>} input.hazardZones `{ring, value, label}`
 * @param {number} [input.riskThreshold] zone value above which a road is AT_RISK
 * @returns {Readonly<object>}
 */
export function roadExposure({ segments, hazardZones, riskThreshold = 0.1 }) {
  const zones = (hazardZones ?? []).filter(
    (zone) => Array.isArray(zone?.ring) && zone.ring.length >= 3,
  );
  const rated = (segments ?? [])
    .filter(
      (segment) =>
        Array.isArray(segment?.coordinates) && segment.coordinates.length >= 2,
    )
    .map((segment) => {
      let worst = null;
      for (const zone of zones) {
        if (!Number.isFinite(zone.value) || zone.value < riskThreshold)
          continue;
        const hit = segment.coordinates.some(([lon, lat]) =>
          pointInRing(lon, lat, zone.ring),
        );
        if (hit && (worst === null || zone.value > worst.value)) worst = zone;
      }
      const lengthKm = segmentLengthKm(segment.coordinates);
      return Object.freeze({
        id: segment.osmId ?? `segment:${segment.coordinates[0].join(',')}`,
        name: segment.tags?.name ?? null,
        ref: segment.tags?.ref ?? null,
        coordinates: segment.coordinates,
        lengthKm,
        state: worst ? INFRA_STATE.AT_RISK : INFRA_STATE.OPERATIONAL,
        basis: STATE_BASIS.MODELLED,
        hazardValue: worst?.value ?? null,
        hazardLabel: worst?.label ?? null,
        availability: AVAILABILITY.MODELLED,
        /*
         * Said on every exposed segment, because this is the exact inference a
         * reader is most likely to over-read.
         */
        caveat: worst
          ? 'This segment crosses terrain a published hazard model rates high. That is exposure to failure, not a report that it failed.'
          : 'No modelled hazard zone intersects this segment. That is not a survey confirming it stayed open.',
        source: 'OpenStreetMap geometry × published hazard model',
      });
    });
  const atRisk = rated.filter((item) => item.state === INFRA_STATE.AT_RISK);
  return Object.freeze({
    segments: Object.freeze(rated),
    atRisk: Object.freeze(atRisk),
    atRiskLengthKm: atRisk.reduce((sum, item) => sum + item.lengthKm, 0),
    totalLengthKm: rated.reduce((sum, item) => sum + item.lengthKm, 0),
    zonesConsidered: zones.length,
    basis: STATE_BASIS.MODELLED,
  });
}

/**
 * Facilities inside a hazard footprint, with their state.
 *
 * Hospitals, schools used as shelters, airports. Real OSM locations; the state
 * is exposure, labelled, for the same reason as the roads.
 *
 * @param {object} input
 * @param {Array<object>} input.facilities `{id, name, lat, lon, kind, capacity?}`
 * @param {Array<object>} input.hazardZones
 */
export function facilityExposure({
  facilities,
  hazardZones,
  riskThreshold = 0.1,
}) {
  const zones = (hazardZones ?? []).filter(
    (zone) => Array.isArray(zone?.ring) && zone.ring.length >= 3,
  );
  const rated = (facilities ?? [])
    .filter((item) => Number.isFinite(item?.lat) && Number.isFinite(item?.lon))
    .map((item) => {
      let worst = null;
      for (const zone of zones) {
        if (!Number.isFinite(zone.value) || zone.value < riskThreshold)
          continue;
        if (
          pointInRing(item.lon, item.lat, zone.ring) &&
          (worst === null || zone.value > worst.value)
        ) {
          worst = zone;
        }
      }
      return Object.freeze({
        ...item,
        state: worst ? INFRA_STATE.AT_RISK : INFRA_STATE.OPERATIONAL,
        basis: STATE_BASIS.MODELLED,
        hazardValue: worst?.value ?? null,
        availability: AVAILABILITY.MODELLED,
        /** Null when OSM recorded no capacity — never a guess. */
        capacity: Number.isFinite(item.capacity) ? item.capacity : null,
        capacityNote: Number.isFinite(item.capacity)
          ? null
          : 'No capacity recorded in OpenStreetMap for this facility.',
      });
    });
  return Object.freeze({
    facilities: Object.freeze(rated),
    atRisk: Object.freeze(
      rated.filter((item) => item.state === INFRA_STATE.AT_RISK),
    ),
    withCapacity: rated.filter((item) => item.capacity != null).length,
    basis: STATE_BASIS.MODELLED,
  });
}

/**
 * Economic damage, made spatially meaningful (§9).
 *
 * "Avoid simply putting large numbers into dashboard cards. Make the numbers
 * spatially meaningful."
 *
 * The only honest way to do that with a national total is to say openly how it
 * is being distributed. So this apportions a cited national figure across
 * intensity bands by exposed population and LABELS THE RESULT AS AN
 * APPORTIONMENT, not a measurement. A reader gets a spatial reading of where
 * the loss concentrated, and is told in the same breath that the geography is
 * the model's, not the assessment's.
 *
 * Returns null without a national total, because apportioning nothing produces
 * a map of zeroes that looks like a finding.
 *
 * @param {object} input
 * @param {number|null} input.nationalTotalUsd
 * @param {string} input.totalSource who published the total
 * @param {object} input.human from humanImpactBands
 */
export function economicApportionment({
  nationalTotalUsd,
  totalSource,
  human,
}) {
  if (!Number.isFinite(nationalTotalUsd) || nationalTotalUsd <= 0) return null;
  const bands = (human?.bands ?? []).filter(
    (band) => band.availability === AVAILABILITY.MODELLED,
  );
  if (bands.length === 0) return null;
  /*
   * Weighted by population AND by intensity, because damage does not scale
   * linearly with either: MMI VIII destroys a far larger share of a building
   * stock than MMI VI. The exponent is a stated modelling choice, not a
   * published coefficient, which is why the result is an apportionment.
   */
  const INTENSITY_EXPONENT = 3;
  const weights = bands.map(
    (band) => band.population * Math.pow(band.mmi, INTENSITY_EXPONENT),
  );
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  if (totalWeight <= 0) return null;
  const slices = bands.map((band, index) =>
    Object.freeze({
      id: band.id,
      mmi: band.mmi,
      label: band.label,
      intensityName: band.intensityName,
      colour: band.colour,
      population: band.population,
      footprint: band.footprint,
      shareOfTotal: weights[index] / totalWeight,
      apportionedUsd: (weights[index] / totalWeight) * nationalTotalUsd,
      availability: AVAILABILITY.ESTIMATED,
    }),
  );
  return Object.freeze({
    nationalTotalUsd,
    totalSource,
    slices: Object.freeze(slices),
    method: `The cited national total distributed across measured intensity bands, weighted by exposed population times intensity to the power of ${INTENSITY_EXPONENT}.`,
    /*
     * Stated in the object rather than left to the UI, so the caveat travels
     * with the number wherever it is rendered.
     */
    caveat:
      'AN APPORTIONMENT, NOT AN ASSESSMENT. The national total is a cited figure; its distribution across these bands is this project’s model. No published assessment breaks the loss down by shaking intensity, so the geography here is illustrative of where damage concentrated, not a measurement of it.',
    /*
     * The sensitivity, stated because it is large and because a reader
     * comparing bands would otherwise take the ordering as robust. For
     * Gorkha, MMI VI holds fourteen times the population of MMI VIII, so at
     * this exponent the moderate band takes the largest share — raise the
     * exponent and the severe bands dominate instead. That the answer moves
     * this much with a modelling choice is exactly why it is not presented as
     * a measurement.
     */
    sensitivity: `The split is sensitive to the intensity exponent (${INTENSITY_EXPONENT}). Bands holding far more people at lower intensity can take the largest share at a low exponent and a much smaller one at a high exponent, so treat the ordering as indicative rather than settled.`,
    wouldNeed:
      'The post-disaster needs assessment district annexes as structured data, which would replace the apportionment with surveyed figures.',
  });
}

/* ------------------------------------------------------------------ *
 * Geometry helpers
 * ------------------------------------------------------------------ */

/**
 * Ray-casting point-in-polygon.
 *
 * Operates on [lon, lat] pairs. Deliberately does not handle the antimeridian:
 * hazard zones are regional, and a zone spanning 180° would be a data error
 * worth surfacing rather than silently accommodating.
 */
export function pointInRing(lon, lat, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Length of a polyline in kilometres. */
export function segmentLengthKm(coordinates) {
  let total = 0;
  for (let i = 1; i < coordinates.length; i += 1) {
    const [lon1, lat1] = coordinates[i - 1];
    const [lon2, lat2] = coordinates[i];
    total += haversineKm({ lat: lat1, lon: lon1 }, { lat: lat2, lon: lon2 });
  }
  return total;
}
