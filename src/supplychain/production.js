/**
 * Production concentration (§21: "Where is the world's production?").
 *
 * THE CENTRAL HONESTY PROBLEM, stated first because everything here depends on
 * it: this project has no production data.
 *
 * Firm-level and facility-level output is company-confidential. USGS Mineral
 * Commodity Summaries publish national mineral production but only as PDF and
 * spreadsheets with no API. FAOSTAT publishes crop and livestock production but
 * its API requires a key and its bulk download is a 34 MB archive. None of that
 * is integrated.
 *
 * What we do have is EXPORTS, from UN Comtrade. So this module computes export
 * concentration and labels it, everywhere and unavoidably, as a PROXY for
 * production. The distinction is not pedantic:
 *
 *   - A re-export hub shows up as a producer. The Netherlands is Europe's
 *     largest exporter of many goods it does not make; Singapore and Hong Kong
 *     re-export at enormous scale. A naive reading of this map would call
 *     Rotterdam a factory.
 *   - Domestic consumption is invisible. A country that produces enormously and
 *     consumes it all exports nothing and vanishes from the map. That is the
 *     single largest distortion for food and energy.
 *   - Value is not volume. A country exporting small quantities of high-value
 *     goods outranks one shipping bulk commodities.
 *
 * `productionProxy()` therefore returns `basis: 'EXPORT_VALUE_PROXY'` and a
 * limitations list naming all three, and the UI renders them next to the map.
 * A caller cannot obtain the numbers without the caveats.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

import { DataClass, createProvenance } from './provenance.js';
import { herfindahlIndex, concentrationRatio } from './centrality.js';

/**
 * Economies whose export figures are dominated by re-export rather than
 * domestic production.
 *
 * This list is deliberately short and conservative: it names the entrepôts
 * whose re-export role is a documented, uncontroversial feature of their
 * economies, so the UI can flag them individually rather than leaving the
 * reader to spot the distortion. It is NOT a correction — we do not subtract an
 * estimated re-export share, because we have no basis for such an estimate.
 * It is a flag.
 */
export const REEXPORT_HUBS = Object.freeze(
  new Map([
    [
      'NLD',
      'Rotterdam is Europe’s largest transshipment port; much of what the Netherlands exports was produced elsewhere.',
    ],
    [
      'SGP',
      'Singapore is a global entrepôt; a large share of its exports is re-exported rather than produced domestically.',
    ],
    [
      'HKG',
      'Hong Kong re-exports the majority of the goods it ships, predominantly from mainland China.',
    ],
    [
      'BEL',
      'Antwerp handles substantial transit trade for the wider European hinterland.',
    ],
    [
      'ARE',
      'Jebel Ali is a major re-export hub for the Gulf, South Asia and East Africa.',
    ],
    ['PAN', 'Colon Free Zone re-exports across Latin America.'],
  ]),
);

/**
 * Which requested reporters a capped page may have cost us.
 *
 * The preview endpoint truncates at a fixed row count without saying so, but
 * truncation alone is not evidence of loss: most of a page is breakdown slices
 * (partner2, mode of transport, customs procedure) that canonical filtering
 * discards anyway. Turkey's 2023 HS 8542 exports fill all 500 rows across 133
 * partner2 values and the single canonical total is still among them, so
 * warning on truncation alone reported an exact figure as understated.
 *
 * The rule this encodes:
 *
 *   truncated page + reporter has no canonical total  -> AT RISK, narrow and retry
 *   truncated page + reporter has its total           -> fine, the rest was noise
 *   complete page  + reporter has no canonical total  -> it did not report; an
 *                                                        absence in the source,
 *                                                        not one we created
 *
 * @param {object} input
 * @param {number[]} input.requested reporter codes asked for
 * @param {Iterable<number>} input.returned reporter codes with a canonical total
 * @param {boolean} input.truncated whether the page hit the row cap
 * @returns {number[]} requested reporters whose total may have been cut off
 */
export function reportersAtRisk({ requested, returned, truncated }) {
  if (!Array.isArray(requested))
    throw new TypeError('requested must be an array');
  if (!truncated) return [];
  const present = new Set(returned);
  return requested.filter((code) => !present.has(code));
}

/**
 * Compute a production-concentration view from trade export rows.
 *
 * @param {object} input
 * @param {Array<object>} input.rows normalized Comtrade rows (exports)
 * @param {(code:number)=>object} input.interpret area interpreter
 * @param {(code:number)=>{iso3:string|null,name:string,lat:number,lon:number}|null} input.resolve
 * @param {string} input.commodityLabel
 * @param {number} input.period
 * @param {string} input.retrievedAt
 * @param {string[]} [input.incompleteReporters] reporters whose page was capped
 * @param {number} [input.unretrievedReporterCount] reporters whose call failed
 * @returns {Readonly<object>}
 */
export function productionProxy({
  rows,
  interpret,
  resolve,
  commodityLabel,
  period,
  retrievedAt,
  incompleteReporters = [],
  unretrievedReporterCount = 0,
}) {
  if (!Array.isArray(rows)) throw new TypeError('rows must be an array');
  if (typeof interpret !== 'function' || typeof resolve !== 'function') {
    throw new TypeError('interpret and resolve functions are required');
  }

  const producers = [];
  const unplaceable = [];
  let total = 0;

  for (const row of rows) {
    // These are exports BY each reporter to the World, so the reporter is the
    // producer candidate and partner 0 is the row we want.
    if (row.partnerCode !== 0) continue;
    const area = interpret(row.reporterCode);
    const place = resolve(row.reporterCode);
    total += row.valueUsd;
    const entry = {
      code: row.reporterCode,
      name: place?.name ?? area.name,
      iso3: place?.iso3 ?? null,
      lat: place?.lat ?? null,
      lon: place?.lon ?? null,
      valueUsd: row.valueUsd,
      netWeightKg: row.netWeightKg,
      isReported: row.isReported,
      reexportHub: place?.iso3 ? (REEXPORT_HUBS.get(place.iso3) ?? null) : null,
    };
    if (place) producers.push(entry);
    else unplaceable.push(entry);
  }

  producers.sort((a, b) => b.valueUsd - a.valueUsd);
  const shares = producers.map((p) => p.valueUsd);
  const hhi = herfindahlIndex(shares);
  const cr4 = concentrationRatio(shares, 4);

  const withShare = producers.map((p) => ({
    ...p,
    share: total > 0 ? p.valueUsd / total : null,
  }));

  const flaggedHubs = withShare.filter(
    (p) => p.reexportHub !== null && p.share > 0.01,
  );

  return Object.freeze({
    basis: 'EXPORT_VALUE_PROXY',
    commodityLabel,
    period,
    producers: Object.freeze(withShare),
    unplaceable: Object.freeze(unplaceable),
    totalUsd: total,
    concentration: Object.freeze({ hhi, cr4 }),
    /** Entrepôts in the top ranks whose export figures overstate production. */
    reexportFlags: Object.freeze(
      flaggedHubs.map((p) => ({
        iso3: p.iso3,
        name: p.name,
        note: p.reexportHub,
      })),
    ),
    /** Reporters whose upstream page hit the row cap, so their rows are partial. */
    incompleteReporters: Object.freeze([...incompleteReporters]),
    /** Reporters whose upstream call failed outright and were never retrieved. */
    unretrievedReporterCount,
    provenance: createProvenance({
      dataClass: DataClass.INFERRED,
      source: 'UN Comtrade',
      dataset: `production proxy: exports of ${commodityLabel}, ${period}`,
      license:
        'UN Comtrade terms of use. Source: UN Comtrade (comtradeplus.un.org)',
      method:
        'Export value to World, by reporter, used as a PROXY for production. ' +
        'No production data is used: none is available to this project ' +
        'without a key or a bulk download.',
      retrievedAt,
      observedAt: `${period}-12-31`,
      updateFrequency: 'annual, published with a 1-2 year lag',
      confidence: 0.55,
      limitations: [
        'THIS IS EXPORTS, NOT PRODUCTION. The two differ, sometimes enormously.',
        'Re-export hubs appear as producers. The Netherlands, Singapore and ' +
          'Hong Kong ship large volumes of goods made elsewhere.',
        'Domestic consumption is invisible. A country that produces heavily ' +
          'and consumes its own output exports little and appears small here ' +
          '— the largest distortion for food and energy.',
        'Value is not volume. High-value low-tonnage exporters outrank bulk ' +
          'shippers on this measure.',
        'Only Comtrade reporters appear. Taiwan does not report, so it is ' +
          'absent from this map entirely despite being a major producer of ' +
          'several commodities this application tracks.',
        ...(incompleteReporters.length > 0
          ? [
              `INCOMPLETE for ${incompleteReporters.length} reporter(s) ` +
                `(${incompleteReporters.join(', ')}): the upstream returned a ` +
                'capped page, so their totals may understate the true figure.',
            ]
          : []),
        ...(unretrievedReporterCount > 0
          ? [
              `INCOMPLETE: ${unretrievedReporterCount} reporter(s) could not ` +
                'be retrieved at all (upstream failure), so this ranking is ' +
                'missing them entirely. A missing country here is an absent ' +
                'measurement, not a zero.',
            ]
          : []),
      ],
    }),
  });
}

/**
 * Structural indicators that describe a country's productive economy.
 *
 * These come from the World Bank and are real measurements, unlike the export
 * proxy above. They do not give per-commodity production, but they do say
 * whether an economy manufactures, extracts, or neither — which is the context
 * that stops the export map being read naively.
 */
export const PRODUCTION_INDICATORS = Object.freeze([
  Object.freeze({
    code: 'NV.IND.MANF.ZS',
    label: 'Manufacturing, value added',
    unit: '% of GDP',
    reads: 'How much of the economy actually makes things.',
  }),
  Object.freeze({
    code: 'TX.VAL.TECH.MF.ZS',
    label: 'High-technology exports',
    unit: '% of manufactured exports',
    reads: 'Whether manufacturing is advanced or basic.',
  }),
  Object.freeze({
    code: 'TX.VAL.MMTL.ZS.UN',
    label: 'Ores and metals exports',
    unit: '% of merchandise exports',
    reads: 'Extractive rather than manufacturing economies.',
  }),
  Object.freeze({
    code: 'TX.VAL.FUEL.ZS.UN',
    label: 'Fuel exports',
    unit: '% of merchandise exports',
    reads: 'Energy-export dependence.',
  }),
  Object.freeze({
    code: 'AG.PRD.FOOD.XD',
    label: 'Food production index',
    unit: '2014-2016 = 100',
    reads: 'The one genuine production series available here.',
  }),
]);

/**
 * Classify an economy's productive structure from its indicators.
 *
 * Deliberately coarse — four buckets, wide thresholds. A finer classification
 * would imply a precision the inputs do not support, and the thresholds are
 * conventional round numbers rather than derived from anything.
 *
 * @param {Record<string, number|null>} values indicator code -> latest value
 * @returns {{structure:string, basis:string, confident:boolean}}
 */
export function classifyStructure(values) {
  const manufacturing = values['NV.IND.MANF.ZS'];
  const ores = values['TX.VAL.MMTL.ZS.UN'];
  const fuel = values['TX.VAL.FUEL.ZS.UN'];
  const highTech = values['TX.VAL.TECH.MF.ZS'];

  const known = [manufacturing, ores, fuel].filter(
    (v) => typeof v === 'number' && Number.isFinite(v),
  );
  if (known.length === 0) {
    return {
      structure: 'UNKNOWN',
      basis: 'No structural indicators available for this economy.',
      confident: false,
    };
  }

  if (typeof fuel === 'number' && fuel >= 40) {
    return {
      structure: 'ENERGY_EXPORTER',
      basis: `Fuel is ${fuel.toFixed(0)}% of merchandise exports.`,
      confident: true,
    };
  }
  if (typeof ores === 'number' && ores >= 25) {
    return {
      structure: 'RESOURCE_EXPORTER',
      basis: `Ores and metals are ${ores.toFixed(0)}% of merchandise exports.`,
      confident: true,
    };
  }
  if (typeof manufacturing === 'number' && manufacturing >= 15) {
    const advanced = typeof highTech === 'number' && highTech >= 20;
    return {
      structure: advanced ? 'ADVANCED_MANUFACTURING' : 'MANUFACTURING',
      basis:
        `Manufacturing is ${manufacturing.toFixed(0)}% of GDP` +
        (advanced
          ? `, high-tech ${highTech.toFixed(0)}% of manufactured exports.`
          : '.'),
      confident: true,
    };
  }
  return {
    structure: 'SERVICES_OR_MIXED',
    basis:
      typeof manufacturing === 'number'
        ? `Manufacturing is only ${manufacturing.toFixed(0)}% of GDP and no ` +
          'extractive sector dominates.'
        : 'No dominant manufacturing or extractive signal.',
    // Residual bucket: everything that did not match above lands here, which
    // is a weaker claim than the positive classifications.
    confident: false,
  };
}
