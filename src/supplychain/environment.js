/**
 * Environmental risk, joined to supply chains (§22 of the brief).
 *
 * THE RULE THIS MODULE EXISTS TO ENFORCE: a risk layer that does not answer
 * "how does this affect the supply chain?" is decoration. A heatmap of water
 * stress tells a reader nothing they can act on; water stress in a country that
 * irrigates half its farmland and exports grain is a finding.
 *
 * So every indicator here carries `affectsSupplyChain` — the mechanism by which
 * it reaches trade — and the classifier returns that mechanism alongside the
 * number. The UI renders both, always.
 *
 * WHAT THIS IS NOT. These are national aggregates from the World Bank, which is
 * the wrong resolution for most of the questions people want to ask. Water
 * stress is a river-basin property, not a country property: China's national
 * figure averages the water-rich south with the water-scarce north, and the
 * north is where the wheat is.
 *
 * That limitation used to end "WRI Aqueduct publishes it by basin and is a bulk
 * download rather than an API, so it is not integrated." The last clause was
 * wrong. Esri's Living Atlas serves Aqueduct 4.0 as a queryable feature
 * service, keyless and CC BY 4.0, and `waterBasins.js` reads it. Both
 * resolutions are shown together now, and the difference between them is the
 * finding: China withdraws 20.2% of its renewable water nationally, and 1,969%
 * in the Hebei basin. This module still produces the national reading, because
 * a national figure is the right answer to a national question — it is simply
 * no longer the only figure available, and the limitation says where to look
 * for the other one.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

import { DataClass, createProvenance } from './provenance.js';

/**
 * Keyless World Bank indicators that bear on physical supply-chain risk.
 *
 * Each was probed and returns data (verified 2026-09-16). `affectsSupplyChain`
 * is the required part: it is the sentence the UI shows next to the number.
 */
export const RISK_INDICATORS = Object.freeze([
  Object.freeze({
    code: 'ER.H2O.FWTL.ZS',
    label: 'Freshwater withdrawal',
    unit: '% of internal resources',
    reads: 'How hard a country draws on its own renewable water.',
    affectsSupplyChain:
      'Irrigated agriculture is the largest water user almost everywhere. A country withdrawing more than it renews is exporting food it cannot reliably keep producing.',
    higherIsWorse: true,
  }),
  Object.freeze({
    code: 'AG.LND.IRIG.AG.ZS',
    label: 'Irrigated farmland',
    unit: '% of agricultural land',
    reads: 'How much of its farming depends on delivered water.',
    affectsSupplyChain:
      'Irrigated land is what fails first in a drought. A high share is productive in a normal year and exposed in a bad one.',
    higherIsWorse: true,
  }),
  Object.freeze({
    code: 'ER.H2O.INTR.PC',
    label: 'Renewable water per person',
    unit: 'm³ per capita',
    reads: 'How much internal renewable water there is to go round.',
    affectsSupplyChain:
      'Below about 1,700 m³ per person a country is conventionally water-stressed; below 500 it is absolutely scarce. Agriculture competes with cities and industry for the same water.',
    higherIsWorse: false,
  }),
  Object.freeze({
    code: 'EN.CLC.MDAT.ZS',
    label: 'Population hit by drought, flood or extreme temperature',
    unit: '% of population, 1990–2009 average',
    reads: 'How much of the population has historically been affected.',
    affectsSupplyChain:
      'A record of disruption to the workforce, the farmland and the roads that move goods. It is history, not a forecast.',
    higherIsWorse: true,
  }),
  Object.freeze({
    code: 'AG.LND.AGRI.ZS',
    label: 'Agricultural land',
    unit: '% of land area',
    reads: 'How much of the country is farmed at all.',
    affectsSupplyChain:
      'Sets the scale of what is at stake: the same drought costs more where more of the country is farmland.',
    higherIsWorse: null,
  }),
]);

/**
 * Water-stress bands.
 *
 * These are the FAO / SDG indicator 6.4.2 conventional thresholds for
 * withdrawal as a share of renewable resources, not thresholds this project
 * invented. Above 100% a country is drawing down stored or imported water —
 * Egypt's figure is in the thousands because it lives on a river that rises
 * outside its borders.
 */
export const WATER_STRESS_BANDS = Object.freeze([
  Object.freeze({ max: 10, level: 'LOW', label: 'Low' }),
  Object.freeze({ max: 20, level: 'LOW_MEDIUM', label: 'Low to medium' }),
  Object.freeze({ max: 40, level: 'MEDIUM_HIGH', label: 'Medium to high' }),
  Object.freeze({ max: 80, level: 'HIGH', label: 'High' }),
  Object.freeze({ max: 100, level: 'VERY_HIGH', label: 'Very high' }),
  Object.freeze({
    max: Infinity,
    level: 'BEYOND_RENEWABLE',
    label: 'Beyond renewable supply',
  }),
]);

/**
 * Classify a freshwater-withdrawal percentage.
 *
 * @param {number|null} percent withdrawal as % of internal renewable resources
 * @returns {{level:string, label:string, basis:string}|null}
 */
export function waterStress(percent) {
  if (!Number.isFinite(percent)) return null;
  const band = WATER_STRESS_BANDS.find((entry) => percent < entry.max);
  const basis =
    percent >= 100
      ? `Withdraws ${Math.round(percent).toLocaleString()}% of its internal renewable water, so it depends on rivers rising outside its borders, on groundwater it is depleting, or on desalination.`
      : `Withdraws ${percent.toFixed(1)}% of its internal renewable water. FAO treats above 25% as stress and above 70% as severe.`;
  return Object.freeze({ level: band.level, label: band.label, basis });
}

/**
 * Renewable water per capita, against the conventional scarcity thresholds.
 *
 * The 1,700 / 1,000 / 500 m³ breakpoints are the Falkenmark indicator, which is
 * long-standing and widely cited. It is a crude measure — it ignores where in a
 * country the water is and when it arrives — and saying so is part of using it.
 *
 * @param {number|null} cubicMetres
 * @returns {{level:string, label:string, basis:string}|null}
 */
export function waterAvailability(cubicMetres) {
  if (!Number.isFinite(cubicMetres)) return null;
  const rounded = Math.round(cubicMetres).toLocaleString();
  if (cubicMetres < 500) {
    return Object.freeze({
      level: 'ABSOLUTE_SCARCITY',
      label: 'Absolute scarcity',
      basis: `${rounded} m³ per person per year, below the 500 m³ absolute-scarcity threshold.`,
    });
  }
  if (cubicMetres < 1000) {
    return Object.freeze({
      level: 'SCARCITY',
      label: 'Scarcity',
      basis: `${rounded} m³ per person per year, below the 1,000 m³ scarcity threshold.`,
    });
  }
  if (cubicMetres < 1700) {
    return Object.freeze({
      level: 'STRESS',
      label: 'Stress',
      basis: `${rounded} m³ per person per year, below the 1,700 m³ stress threshold.`,
    });
  }
  return Object.freeze({
    level: 'SUFFICIENT',
    label: 'Sufficient on this measure',
    basis: `${rounded} m³ per person per year, above the 1,700 m³ stress threshold. This is a national average and says nothing about where in the country the water is.`,
  });
}

/**
 * Build the supply-chain reading of a country's environmental indicators.
 *
 * This is the §22 requirement in code: the output is not "here is water
 * stress", it is "here is water stress, here is why it reaches trade, and here
 * is what this measure cannot tell you".
 *
 * @param {object} input
 * @param {{iso3:string,name:string}} input.country
 * @param {Record<string, number|null>} input.values indicator code -> value
 * @param {Array<object>} [input.agriculturalExports] rows with {label, valueUsd}
 * @param {string} input.retrievedAt
 * @returns {Readonly<object>}
 */
export function environmentalRisk({
  country,
  values,
  agriculturalExports = [],
  retrievedAt,
}) {
  if (!country?.iso3) {
    throw new TypeError('environmentalRisk requires a country');
  }

  const readings = RISK_INDICATORS.map((indicator) => {
    const value = values?.[indicator.code];
    return Object.freeze({
      ...indicator,
      value: Number.isFinite(value) ? value : null,
      available: Number.isFinite(value),
    });
  });

  const stress = waterStress(values?.['ER.H2O.FWTL.ZS']);
  const availability = waterAvailability(values?.['ER.H2O.INTR.PC']);
  const irrigated = values?.['AG.LND.IRIG.AG.ZS'];

  /*
   * The mechanism, assembled only from what is actually present.
   *
   * Each clause is conditional on its own input, so a country with no
   * irrigation figure gets a shorter — and still true — explanation rather
   * than a sentence with a hole in it.
   */
  const mechanism = [];
  if (
    stress &&
    ['HIGH', 'VERY_HIGH', 'BEYOND_RENEWABLE'].includes(stress.level)
  ) {
    mechanism.push(
      `${country.name} draws heavily on its water relative to what it renews.`,
    );
  }
  if (Number.isFinite(irrigated) && irrigated >= 20) {
    mechanism.push(
      `${irrigated.toFixed(0)}% of its farmland is irrigated, so that water is directly tied to crop output.`,
    );
  }
  if (agriculturalExports.length > 0) {
    const top = agriculturalExports
      .slice(0, 3)
      .map((row) => row.label)
      .join(', ');
    mechanism.push(
      `It exports ${top}, which puts that output into someone else's food supply.`,
    );
  }

  const linked = mechanism.length >= 2;

  return Object.freeze({
    country: Object.freeze({ ...country }),
    readings: Object.freeze(readings),
    waterStress: stress,
    waterAvailability: availability,
    /**
     * The supply-chain mechanism, or null when the pieces to state one are
     * absent. Null is the honest answer: a single indicator with nothing to
     * connect it to is not a supply-chain finding.
     */
    mechanism: linked ? Object.freeze([...mechanism]) : null,
    unlinkedReason: linked
      ? null
      : 'Not enough joined-up data to state a supply-chain mechanism for this country. The indicators below stand on their own.',
    provenance: createProvenance({
      dataClass: DataClass.HISTORICAL,
      source: 'World Bank',
      dataset: `environmental risk indicators for ${country.iso3}`,
      license: 'CC BY 4.0. Source: World Bank — data.worldbank.org (CC BY 4.0)',
      method:
        'Latest available value per indicator, classified against published ' +
        'FAO/SDG 6.4.2 water-stress bands and the Falkenmark per-capita ' +
        'thresholds. The supply-chain mechanism is assembled only from ' +
        'indicators that are actually present.',
      retrievedAt,
      updateFrequency: 'annual, with multi-year lags on the water series',
      confidence: 0.6,
      limitations: [
        'NATIONAL AVERAGES. Water stress is a river-basin property, not a ' +
          'country property. China’s figure averages the water-rich south ' +
          'with the water-scarce north, and the north is where the wheat is. ' +
          'The basin card on the same panel reads WRI Aqueduct 4.0 by river ' +
          'basin for exactly this reason; the two are meant to be read ' +
          'together.',
        'The disaster series is a 1990–2009 average. It is a record of what ' +
          'happened, not a forecast of what will.',
        'Withdrawal above 100% of internal renewable resources is real, not an ' +
          'error: it means a country lives on inflowing rivers, fossil ' +
          'groundwater or desalination.',
        'No causal claim is made. These indicators describe exposure; whether ' +
          'a given harvest or shipment actually fails depends on weather, ' +
          'storage and policy this project does not model.',
      ],
    }),
  });
}
