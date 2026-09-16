/**
 * Browser-side supply-chain data source.
 *
 * Talks to this application's own `/api/supplychain/*` proxy rather than to UN
 * Comtrade and the World Bank directly. The proxy exists for rate limiting,
 * CORS and endpoint control — see `server/providers/supplychain.js`.
 *
 * Reuses the normalizers from `comtrade.js` and `worldbank.js`, so a row that
 * reaches the globe has passed exactly the same validation as one fetched
 * server-side, including the strict numeric coercion that stops a null trade
 * value becoming a reported zero.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

import { normalizeResponse, comtradeProvenance } from './comtrade.js';
import { normalizeIndicatorResponse } from './worldbank.js';
import { DataClass, createProvenance } from '../provenance.js';

/** Raised when the proxy itself fails, as distinct from an upstream failure. */
export class SupplyChainProxyError extends Error {
  constructor(message, { status = null, retryable = false } = {}) {
    super(message);
    this.name = 'SupplyChainProxyError';
    this.status = status;
    this.retryable = retryable;
  }
}

/**
 * Create a source backed by the local proxy.
 *
 * @param {object} [options]
 * @param {(url:string, init?:object)=>Promise<Response>} [options.fetchImpl]
 * @param {string} [options.basePath]
 * @param {()=>string} [options.now]
 * @returns {{getTradeFlows:Function, getTradeSeries:Function, getIndicator:Function}}
 */
export function createTradeProxySource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  basePath = '/api/supplychain',
  now = () => new Date().toISOString(),
} = {}) {
  async function call(path, params, { signal } = {}) {
    signal?.throwIfAborted();
    const search = new URLSearchParams(params).toString();
    const response = await fetchImpl(`${basePath}${path}?${search}`, {
      signal,
    });
    signal?.throwIfAborted();
    let body = null;
    try {
      body = await response.json();
    } catch {
      throw new SupplyChainProxyError('Proxy returned malformed JSON', {
        status: response.status,
      });
    }
    if (!response.ok) {
      throw new SupplyChainProxyError(
        body?.detail ?? `Proxy HTTP ${response.status}`,
        { status: response.status, retryable: Boolean(body?.retryable) },
      );
    }
    signal?.throwIfAborted();
    return body;
  }

  return {
    /**
     * One reporter/commodity/period/flow slice across all or selected partners.
     *
     * @param {object} query
     * @param {number|number[]} query.reporter M49 code(s)
     * @param {number} query.period year
     * @param {string|string[]} query.cmd HS heading(s)
     * @param {'M'|'X'} query.flow
     * @param {number|number[]|null} [query.partner]
     * @param {object} [options]
     * @param {AbortSignal} [options.signal]
     */
    async getTradeFlows(
      { reporter, period, cmd, flow, partner = null },
      options = {},
    ) {
      const params = {
        reporter: [].concat(reporter).join(','),
        period: String(period),
        cmd: [].concat(cmd).join(','),
        flow,
      };
      if (partner !== null) params.partner = [].concat(partner).join(',');
      const body = await call('/trade', params, options);
      const { rows, rejected, count } = normalizeResponse(body.payload);
      return {
        rows,
        rejected,
        count,
        cached: Boolean(body.cached),
        provenance: comtradeProvenance({
          dataset: `${basePath}/trade?${new URLSearchParams(params)}`,
          retrievedAt: body.retrievedAt ?? now(),
          refYear: rows[0]?.refYear ?? null,
          rejected,
          anyAggregate: rows.some((r) => !r.isReported),
          method:
            "Read through this application's cached proxy, then validated and " +
            'normalized with the same code path used server-side.',
        }),
      };
    },

    /**
     * A multi-year series. One request per period, because the upstream permits
     * only one — but the proxy caches, so re-scrubbing a timeline is free.
     *
     * Individual period failures are collected rather than aborting the series,
     * so a partial series is visibly partial.
     *
     * @param {object} query as getTradeFlows, without `period`
     * @param {number[]} periods
     * @param {object} [options]
     * @param {AbortSignal} [options.signal]
     * @param {(done:number,total:number)=>void} [options.onProgress]
     */
    async getTradeSeries(query, periods, options = {}) {
      const { signal, onProgress = () => {} } = options;
      const series = [];
      const failures = [];
      for (let i = 0; i < periods.length; i += 1) {
        signal?.throwIfAborted();
        try {
          const { rows } = await this.getTradeFlows(
            { ...query, period: periods[i] },
            { signal },
          );
          series.push({ period: periods[i], rows });
        } catch (error) {
          if (error?.name === 'AbortError') throw error;
          failures.push({ period: periods[i], message: error.message });
        }
        onProgress(i + 1, periods.length);
      }
      const extraLimitations =
        failures.length > 0
          ? [
              `${failures.length} of ${periods.length} periods could not be ` +
                `retrieved: ${failures.map((f) => f.period).join(', ')}. This ` +
                'series is incomplete.',
            ]
          : [];
      return {
        series,
        failures,
        provenance: comtradeProvenance({
          dataset: `${basePath}/trade series ${periods.join(',')}`,
          retrievedAt: now(),
          anyAggregate: series.some((s) => s.rows.some((r) => !r.isReported)),
          method:
            'One cached proxy request per period; the upstream permits only ' +
            'one period per call.',
          extraLimitations,
        }),
      };
    },

    /**
     * A World Bank indicator for one or more economies.
     *
     * @param {object} query
     * @param {string|string[]} query.iso3
     * @param {string} query.indicator
     * @param {number} [query.start]
     * @param {number} [query.end]
     * @param {object} [options]
     */
    async getIndicator({ iso3, indicator, start, end }, options = {}) {
      const params = { iso3: [].concat(iso3).join(','), indicator };
      if (start !== undefined) params.start = String(start);
      if (end !== undefined) params.end = String(end);
      const body = await call('/indicator', params, options);
      const { observations, pagination, dropped } = normalizeIndicatorResponse(
        body.payload,
      );
      const limitations = [
        'World Bank indicators are annual and revised. A recent year may be ' +
          'provisional or absent.',
      ];
      if (dropped > 0) {
        limitations.push(
          `${dropped} observation(s) had no value and were dropped rather than ` +
            'treated as zero.',
        );
      }
      return {
        observations,
        pagination,
        dropped,
        cached: Boolean(body.cached),
        provenance: createProvenance({
          dataClass: DataClass.HISTORICAL,
          source: 'World Bank',
          dataset: `${basePath}/indicator?${new URLSearchParams(params)}`,
          license:
            'CC BY 4.0. Source: World Bank — data.worldbank.org (CC BY 4.0)',
          method:
            "Read through this application's cached proxy, then normalized.",
          retrievedAt: body.retrievedAt ?? now(),
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

/**
 * Aggregate trade rows into renderable country-to-country flows.
 *
 * Aggregate partner codes are kept separate rather than dropped: "Other Asia,
 * nes" is the single largest line in several important series, so discarding it
 * would understate the picture, while summing it with countries would
 * double-count. The caller decides how to present them, and
 * `interpretArea()` supplies the caveat.
 *
 * @param {object} input
 * @param {Array<object>} input.rows normalized Comtrade rows
 * @param {'M'|'X'} input.flow
 * @param {(code:number)=>{lat:number,lon:number}|null} input.positionOf
 * @param {(code:number)=>object} input.interpret
 * @param {number} [input.limit] keep the N largest flows
 * @returns {{flows:Array<object>, unplaceable:Array<object>, total:number}}
 */
export function buildFlows({ rows, flow, positionOf, interpret, limit = 60 }) {
  const flows = [];
  const unplaceable = [];
  let total = 0;

  for (const row of rows) {
    // The World row is the total, not a flow. Including it would draw an arc
    // representing every other arc at once.
    if (row.partnerCode === 0) continue;
    const reporterPosition = positionOf(row.reporterCode);
    const partnerPosition = positionOf(row.partnerCode);
    const area = interpret(row.partnerCode);
    if (!reporterPosition || !partnerPosition) {
      // Aggregate codes such as "Other Asia, nes" have no coordinate. They are
      // reported in the panel rather than silently dropped from the analysis.
      unplaceable.push({ row, area });
      continue;
    }
    total += row.valueUsd;
    flows.push({
      id: `${row.reporterCode}-${row.partnerCode}-${row.cmdCode}-${row.period}`,
      reporterCode: row.reporterCode,
      partnerCode: row.partnerCode,
      // Imports arrive at the reporter; exports leave it. The arc is drawn in
      // the direction goods actually move.
      from: flow === 'M' ? partnerPosition : reporterPosition,
      to: flow === 'M' ? reporterPosition : partnerPosition,
      valueUsd: row.valueUsd,
      netWeightKg: row.netWeightKg,
      isReported: row.isReported,
      partnerName: area.name,
      association: area.association,
      caveat: area.caveat ?? null,
    });
  }

  flows.sort((a, b) => b.valueUsd - a.valueUsd);
  return {
    flows: flows.slice(0, limit),
    unplaceable: unplaceable.sort((a, b) => b.row.valueUsd - a.row.valueUsd),
    total,
  };
}
