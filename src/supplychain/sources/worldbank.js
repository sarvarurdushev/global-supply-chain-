/**
 * World Bank Indicators API v2 client.
 *
 * The cleanest source in this project: no key, CC BY 4.0, high reliability,
 * coverage from 1960. Used for the economic context in the country profile
 * (§19) and country comparison (§20).
 *
 * The API's response shape is unusual — a two-element array whose first element
 * is pagination metadata and whose second is the data — so normalization is not
 * optional.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

import { DataClass, createProvenance } from '../provenance.js';

export const WORLD_BANK_BASE = 'https://api.worldbank.org/v2';

/** Required attribution for any displayed World Bank figure. */
export const WORLD_BANK_ATTRIBUTION =
  'Source: World Bank — data.worldbank.org (CC BY 4.0)';

/**
 * Indicators this project uses, with the exact World Bank code and unit.
 *
 * Codes are quoted from the World Bank indicator catalogue. Units matter: mixing
 * `NY.GDP.MKTP.CD` (current US$) with `NY.GDP.MKTP.KD` (constant 2015 US$)
 * produces a nonsense time series, so the unit travels with the code.
 */
export const INDICATORS = Object.freeze({
  GDP_CURRENT_USD: Object.freeze({
    code: 'NY.GDP.MKTP.CD',
    label: 'GDP (current US$)',
    unit: 'current US$',
  }),
  GDP_PER_CAPITA_USD: Object.freeze({
    code: 'NY.GDP.PCAP.CD',
    label: 'GDP per capita (current US$)',
    unit: 'current US$',
  }),
  POPULATION: Object.freeze({
    code: 'SP.POP.TOTL',
    label: 'Population, total',
    unit: 'people',
  }),
  EXPORTS_PCT_GDP: Object.freeze({
    code: 'NE.EXP.GNFS.ZS',
    label: 'Exports of goods and services (% of GDP)',
    unit: '% of GDP',
  }),
  IMPORTS_PCT_GDP: Object.freeze({
    code: 'NE.IMP.GNFS.ZS',
    label: 'Imports of goods and services (% of GDP)',
    unit: '% of GDP',
  }),
  TRADE_PCT_GDP: Object.freeze({
    code: 'NE.TRD.GNFS.ZS',
    label: 'Trade (% of GDP)',
    unit: '% of GDP',
  }),
  MANUFACTURING_PCT_GDP: Object.freeze({
    code: 'NV.IND.MANF.ZS',
    label: 'Manufacturing, value added (% of GDP)',
    unit: '% of GDP',
  }),
  HIGH_TECH_EXPORTS_PCT: Object.freeze({
    code: 'TX.VAL.TECH.MF.ZS',
    label: 'High-technology exports (% of manufactured exports)',
    unit: '% of manufactured exports',
  }),
  ENERGY_IMPORTS_PCT: Object.freeze({
    code: 'EG.IMP.CONS.ZS',
    label: 'Energy imports, net (% of energy use)',
    unit: '% of energy use',
  }),
  CONTAINER_TRAFFIC: Object.freeze({
    code: 'IS.SHP.GOOD.TU',
    label: 'Container port traffic (TEU: 20 foot equivalent units)',
    unit: 'TEU',
  }),
});

/** Thrown when the World Bank API rejects or malforms a response. */
export class WorldBankError extends Error {
  constructor(message, { status = null } = {}) {
    super(message);
    this.name = 'WorldBankError';
    this.status = status;
    this.retryable = status === 429 || (status !== null && status >= 500);
  }
}

/**
 * Normalize a World Bank v2 response.
 *
 * Observations with a null value are dropped rather than coerced to zero: a
 * missing GDP figure is not a GDP of zero, and treating it as one would corrupt
 * every downstream statistic.
 *
 * @param {unknown} payload
 * @returns {{observations:Array<object>, pagination:object, dropped:number}}
 */
export function normalizeIndicatorResponse(payload) {
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new WorldBankError(
      'Malformed World Bank response: expected [pagination, data]',
    );
  }
  const [meta, data] = payload;
  if (meta && typeof meta === 'object' && typeof meta.message !== 'undefined') {
    throw new WorldBankError(
      `World Bank rejected the query: ${JSON.stringify(meta.message)}`,
    );
  }
  if (!Array.isArray(data)) {
    throw new WorldBankError(
      'Malformed World Bank response: data is not an array',
    );
  }

  const observations = [];
  let dropped = 0;
  for (const row of data) {
    const year = Number(row?.date);
    const value = row?.value;
    if (!Number.isInteger(year) || value === null || value === undefined) {
      dropped += 1;
      continue;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      dropped += 1;
      continue;
    }
    observations.push(
      Object.freeze({
        iso3: row.countryiso3code || null,
        country: row.country?.value ?? null,
        indicatorCode: row.indicator?.id ?? null,
        indicatorLabel: row.indicator?.value ?? null,
        year,
        value: numeric,
      }),
    );
  }
  // Ascending by year: every consumer here is a time series.
  observations.sort((a, b) => a.year - b.year);
  return {
    observations,
    dropped,
    pagination: Object.freeze({
      page: Number(meta?.page) || 1,
      pages: Number(meta?.pages) || 1,
      total: Number(meta?.total) || observations.length,
      lastUpdated: meta?.lastupdated ?? null,
    }),
  };
}

/**
 * Create a World Bank source.
 *
 * @param {object} [options]
 * @param {(url:string, init:object)=>Promise<Response>} [options.fetchImpl]
 * @param {string} [options.baseUrl]
 * @param {()=>string} [options.now]
 * @returns {{getIndicator:Function}}
 */
export function createWorldBankSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  baseUrl = WORLD_BANK_BASE,
  now = () => new Date().toISOString(),
} = {}) {
  return {
    /**
     * One indicator for one or more economies.
     *
     * @param {object} query
     * @param {string|string[]} query.iso3 ISO 3166-1 alpha-3, or 'all'
     * @param {string} query.indicator a World Bank indicator code
     * @param {number} [query.startYear]
     * @param {number} [query.endYear]
     * @param {number} [query.perPage=200]
     * @param {object} [options]
     * @param {AbortSignal} [options.signal]
     * @returns {Promise<{observations:Array<object>, provenance:object, pagination:object}>}
     */
    async getIndicator(
      { iso3, indicator, startYear, endYear, perPage = 200 },
      { signal } = {},
    ) {
      if (typeof indicator !== 'string' || !/^[A-Z0-9._]+$/i.test(indicator)) {
        throw new TypeError(`Invalid indicator code: ${indicator}`);
      }
      const economies = [].concat(iso3);
      if (economies.length === 0) throw new TypeError('iso3 is required');
      for (const code of economies) {
        // Guard against interpolating arbitrary text into the upstream path.
        if (typeof code !== 'string' || !/^[A-Za-z]{2,3}$|^all$/.test(code)) {
          throw new TypeError(`Invalid economy code: ${code}`);
        }
      }

      const params = new URLSearchParams({
        format: 'json',
        per_page: String(perPage),
      });
      if (startYear !== undefined || endYear !== undefined) {
        const from = startYear ?? 1960;
        const to = endYear ?? new Date(now()).getUTCFullYear();
        if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) {
          throw new TypeError(
            'startYear/endYear must be integers with start <= end',
          );
        }
        params.set('date', `${from}:${to}`);
      }

      signal?.throwIfAborted();
      const url = `${baseUrl}/country/${economies.join(';')}/indicator/${indicator}?${params}`;
      const response = await fetchImpl(url, { signal });
      signal?.throwIfAborted();
      if (!response.ok) {
        throw new WorldBankError(`World Bank HTTP ${response.status}`, {
          status: response.status,
        });
      }
      const payload = await response.json();
      signal?.throwIfAborted();
      const { observations, pagination, dropped } =
        normalizeIndicatorResponse(payload);

      const limitations = [
        'World Bank indicators are annual and revised. A recent year may be ' +
          'provisional or absent.',
        'Coverage varies by economy and indicator; gaps are common for small ' +
          'and conflict-affected economies.',
      ];
      if (dropped > 0) {
        limitations.push(
          `${dropped} observation(s) had no value and were dropped rather ` +
            'than treated as zero.',
        );
      }
      if (pagination.pages > pagination.page) {
        limitations.push(
          `This is page ${pagination.page} of ${pagination.pages}. The series ` +
            'is truncated; raise perPage or paginate.',
        );
      }

      return {
        observations,
        pagination,
        dropped,
        provenance: createProvenance({
          dataClass: DataClass.HISTORICAL,
          source: 'World Bank',
          dataset: url,
          license: `CC BY 4.0. ${WORLD_BANK_ATTRIBUTION}`,
          method:
            'Direct read of the Indicators API v2, validated and normalized.',
          retrievedAt: now(),
          observedAt:
            observations.length > 0
              ? `${observations[observations.length - 1].year}-12-31`
              : null,
          updateFrequency: 'annual',
          limitations,
        }),
      };
    },
  };
}
