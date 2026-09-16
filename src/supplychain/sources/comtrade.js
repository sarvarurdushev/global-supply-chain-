/**
 * UN Comtrade public preview client.
 *
 * Portable source module: `fetchImpl` and `AbortSignal` are injected, so it runs
 * in the browser against the app's own proxy, or in Node against the upstream
 * API directly. It follows the inherited source contract from
 * each layer family's `source.js`: validate the whole snapshot before returning
 * it, and never partially commit a malformed response.
 *
 * The constraints encoded here were MEASURED, not assumed
 * (docs/DATA_AVAILABILITY_MATRIX.md §1.1):
 *
 *   - no API key is needed for /public/v1/preview/
 *   - EXACTLY ONE period per call; multiple periods return HTTP 400
 *   - HTTP 429 appears under back-to-back calls, so throttling is mandatory
 *   - reporterISO, partnerISO, cmdDesc and flowDesc come back NULL
 *   - `qty` is frequently 0 with isQtyEstimated true; `netWgt` is the usable
 *     volume field
 *   - rows carry isReported / isAggregate / legacyEstimationFlag, which must
 *     reach the provenance panel rather than being dropped
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

import { DataClass, createProvenance } from '../provenance.js';

/** Default upstream base. Callers should normally point this at their own proxy. */
export const COMTRADE_PREVIEW_BASE =
  'https://comtradeapi.un.org/public/v1/preview';

/** Trade flow directions Comtrade understands. */
export const FlowCode = Object.freeze({
  IMPORT: 'M',
  EXPORT: 'X',
  RE_IMPORT: 'RM',
  RE_EXPORT: 'RX',
});

/** The attribution string that must accompany any displayed Comtrade figure. */
export const COMTRADE_ATTRIBUTION = 'Source: UN Comtrade (comtradeplus.un.org)';

/** Thrown when Comtrade rejects a request, carrying enough detail to act on. */
export class ComtradeError extends Error {
  constructor(message, { status = null, upstreamError = null } = {}) {
    super(message);
    this.name = 'ComtradeError';
    this.status = status;
    this.upstreamError = upstreamError;
    /** Retrying immediately will fail again unless this is true. */
    this.retryable = status === 429 || (status !== null && status >= 500);
  }
}

/**
 * Coerce to a number without JavaScript's dangerous empty-ish conversions.
 *
 * `Number(null)`, `Number('')`, `Number([])` and `Number(false)` all produce 0.
 * In a trade dataset that silently converts "this figure was not reported" into
 * "this figure is zero", and a partner code of 0 happens to mean "World". Every
 * such input is rejected here instead.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function strictNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function requirePositiveInt(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer`);
  }
  return value;
}

/**
 * Build the query for one Comtrade preview call.
 *
 * Rejects a multi-period request at construction rather than letting the caller
 * discover the 400 at runtime.
 *
 * @param {object} query
 * @param {number|number[]} query.reporterCode
 * @param {number} query.period a single year (annual) or YYYYMM (monthly)
 * @param {string|string[]} query.cmdCode HS heading(s)
 * @param {string} query.flowCode a FlowCode value
 * @param {number|number[]|null} [query.partnerCode] omit for all partners
 * @param {'A'|'M'} [query.frequency='A']
 * @returns {{path:string, params:Record<string,string>}}
 */
export function buildPreviewQuery({
  reporterCode,
  period,
  cmdCode,
  flowCode,
  partnerCode = null,
  frequency = 'A',
}) {
  if (Array.isArray(period)) {
    throw new TypeError(
      'The Comtrade preview endpoint accepts exactly one period per call ' +
        '(measured: multiple periods return HTTP 400). Issue one call per ' +
        'period through a throttled batch.',
    );
  }
  requirePositiveInt(period, 'period');
  if (!Object.values(FlowCode).includes(flowCode)) {
    throw new TypeError(`Unknown flowCode: ${flowCode}`);
  }
  if (frequency !== 'A' && frequency !== 'M') {
    throw new TypeError(`Unknown frequency: ${frequency}`);
  }
  const reporters = [].concat(reporterCode);
  if (reporters.length === 0) throw new TypeError('reporterCode is required');
  for (const r of reporters) requirePositiveInt(r, 'reporterCode');
  const commodities = [].concat(cmdCode);
  if (commodities.length === 0) throw new TypeError('cmdCode is required');
  for (const c of commodities) {
    if (typeof c !== 'string' || !/^[0-9]{2,6}$|^TOTAL$/.test(c)) {
      throw new TypeError(`cmdCode must be an HS code or TOTAL: ${c}`);
    }
  }

  const params = {
    reporterCode: reporters.join(','),
    period: String(period),
    cmdCode: commodities.join(','),
    flowCode,
  };
  if (partnerCode !== null) {
    const partners = [].concat(partnerCode);
    for (const p of partners) requirePositiveInt(p, 'partnerCode');
    params.partnerCode = partners.join(',');
  }
  return { path: `/C/${frequency}/HS`, params };
}

/**
 * Normalize one Comtrade row.
 *
 * Returns null for a row that cannot be trusted, so the caller can count
 * rejections rather than silently ingesting junk.
 *
 * @param {object} row
 * @returns {object|null}
 */
export function normalizeRow(row) {
  if (!row || typeof row !== 'object') return null;

  const reporterCode = strictNumber(row.reporterCode);
  const partnerCode = strictNumber(row.partnerCode);
  const period = String(row.period ?? '');
  const cmdCode = String(row.cmdCode ?? '');
  const value = strictNumber(row.primaryValue);

  if (!Number.isInteger(reporterCode) || !Number.isInteger(partnerCode))
    return null;
  if (period === '' || cmdCode === '') return null;
  // A row with no usable value carries no information for this project. Note
  // this MUST reject null rather than coercing: Number(null) is 0, which would
  // turn a missing figure into a reported zero of trade.
  if (value === null || !Number.isFinite(value) || value < 0) return null;

  const netWgt = strictNumber(row.netWgt);
  const qty = strictNumber(row.qty);

  return Object.freeze({
    reporterCode,
    partnerCode,
    period,
    refYear: Number.isInteger(strictNumber(row.refYear))
      ? strictNumber(row.refYear)
      : null,
    cmdCode,
    flowCode: String(row.flowCode ?? ''),
    classificationCode: row.classificationCode ?? null,
    /** Trade value in current USD. */
    valueUsd: value,
    /**
     * Net weight in kg, or null. Preferred over `qty`: the measured behaviour of
     * this endpoint is that qty is often 0 with isQtyEstimated true.
     */
    netWeightKg: Number.isFinite(netWgt) && netWgt > 0 ? netWgt : null,
    quantity: Number.isFinite(qty) && qty > 0 ? qty : null,
    quantityUnit: row.qtyUnitAbbr ?? null,
    quantityEstimated: row.isQtyEstimated === true,
    /**
     * False means the row is a Comtrade-derived aggregate rather than a
     * directly reported customs line. The provenance panel shows this.
     */
    isReported: row.isReported === true,
    isAggregate: row.isAggregate === true,
    legacyEstimationFlag: row.legacyEstimationFlag ?? null,
    /**
     * Breakdown dimensions. A query can return SEVERAL rows for the same
     * reporter/partner/commodity, split by secondary partner, customs
     * procedure, mode of transport or mode of supply. Measured: a multi-reporter
     * query for HS 8542 returned 63 rows for Azerbaijan alone.
     *
     * Summing those naively multiplies the total several times over, so the
     * dimensions are carried and `isCanonicalTotal` marks the single
     * all-dimensions row.
     */
    partner2Code: strictNumber(row.partner2Code) ?? 0,
    customsCode: row.customsCode ?? null,
    motCode: strictNumber(row.motCode) ?? 0,
    mosCode: row.mosCode ?? null,
    isCanonicalTotal: isCanonicalTotal(row),
  });
}

/**
 * Whether a raw row is the all-dimensions total rather than a breakdown slice.
 *
 * C00 is "all customs procedures", motCode 0 is "all modes of transport" and
 * partner2Code 0 is "all secondary partners". A row that is not canonical is a
 * component of one that is.
 *
 * Rows that omit these fields entirely — which is what single-reporter queries
 * return — are treated as canonical, since there is nothing to disaggregate.
 *
 * @param {object} row raw Comtrade row
 * @returns {boolean}
 */
export function isCanonicalTotal(row) {
  const partner2 = strictNumber(row?.partner2Code);
  const mot = strictNumber(row?.motCode);
  const customs = row?.customsCode;
  return (
    (partner2 === null || partner2 === 0) &&
    (mot === null || mot === 0) &&
    (customs === null || customs === undefined || customs === 'C00')
  );
}

/**
 * Keep only all-dimensions total rows.
 *
 * Call this before summing or ranking anything. Returns the rows unchanged when
 * no breakdown is present, so it is safe on every query shape.
 *
 * @param {Array<object>} rows normalized rows
 * @returns {Array<object>}
 */
export function canonicalRows(rows) {
  if (!Array.isArray(rows)) throw new TypeError('rows must be an array');
  return rows.filter((row) => row.isCanonicalTotal);
}

/**
 * The preview endpoint's hard row cap, measured rather than documented.
 *
 * A request for 40 reporters of cmdCode=TOTAL returns `count: 500` with exactly
 * 500 rows; the same request for a single HS heading returns 144. The endpoint
 * is silently truncating, and the response carries no flag saying so — `count`
 * simply equals the cap. Detecting it is the whole reason this constant exists:
 * a truncated page looks exactly like a complete one, and a caller that treats
 * it as complete publishes a ranking with countries missing for no stated
 * reason.
 */
export const PREVIEW_ROW_LIMIT = 500;

/**
 * Validate and normalize a full Comtrade response.
 *
 * @param {object} payload
 * @returns {{rows:Array<object>, rejected:number, count:number, truncated:boolean}}
 */
export function normalizeResponse(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new ComtradeError('Malformed Comtrade response: not an object');
  }
  if (payload.error) {
    throw new ComtradeError(`Comtrade rejected the query: ${payload.error}`, {
      upstreamError: payload.error,
    });
  }
  if (!Array.isArray(payload.data)) {
    throw new ComtradeError(
      'Malformed Comtrade response: data is not an array',
    );
  }
  const rows = [];
  let rejected = 0;
  for (const raw of payload.data) {
    const row = normalizeRow(raw);
    if (row) rows.push(row);
    else rejected += 1;
  }
  return {
    rows,
    rejected,
    count: Number.isFinite(Number(payload.count))
      ? Number(payload.count)
      : rows.length,
    // Compared against the RAW page length, not the validated rows: dropping a
    // malformed row would otherwise hide the fact that the page was capped.
    truncated: payload.data.length >= PREVIEW_ROW_LIMIT,
  };
}

/**
 * Provenance for a Comtrade result set.
 *
 * Always HISTORICAL — `createProvenance` refuses to class UN Comtrade as LIVE.
 *
 * @param {object} input
 * @param {string} input.dataset
 * @param {string} input.retrievedAt ISO-8601
 * @param {number|null} [input.refYear]
 * @param {number} [input.rejected]
 * @param {boolean} [input.anyAggregate]
 * @param {boolean} [input.truncated]
 * @returns {object}
 */
export function comtradeProvenance({
  dataset,
  retrievedAt,
  refYear = null,
  rejected = 0,
  anyAggregate = false,
  truncated = false,
  method = 'Direct read of the public preview API, validated and normalized.',
  extraLimitations = [],
}) {
  return createProvenance({
    dataClass: DataClass.HISTORICAL,
    source: 'UN Comtrade',
    dataset,
    license: `UN Comtrade terms of use. ${COMTRADE_ATTRIBUTION}`,
    method,
    retrievedAt,
    observedAt: refYear === null ? null : `${refYear}-12-31`,
    updateFrequency: 'annual, published with a 1-2 year lag',
    limitations: comtradeLimitations({
      rejected,
      anyAggregate,
      truncated,
      extraLimitations,
    }),
  });
}

/**
 * The caveats that attach to every Comtrade figure, plus any specific to one
 * result set.
 *
 * @param {object} [input]
 * @param {number} [input.rejected]
 * @param {boolean} [input.anyAggregate]
 * @param {boolean} [input.truncated]
 * @param {string[]} [input.extraLimitations]
 * @returns {string[]}
 */
export function comtradeLimitations({
  rejected = 0,
  anyAggregate = false,
  truncated = false,
  extraLimitations = [],
} = {}) {
  const limitations = [
    'UN Comtrade annual data lags its reference period by 1-2 years. These ' +
      'figures are historical, not current.',
    'Reporter and partner figures for the same flow routinely disagree ' +
      '(mirror-statistic asymmetry) because of valuation, timing and ' +
      're-export treatment.',
    'Quantity is frequently unreported or estimated; net weight in kg is the ' +
      'volume field this project uses.',
  ];
  if (anyAggregate) {
    limitations.push(
      'This result contains rows flagged isReported=false, meaning they are ' +
        'Comtrade-derived aggregates rather than directly reported customs lines.',
    );
  }
  if (rejected > 0) {
    limitations.push(
      `${rejected} row(s) failed validation and were discarded.`,
    );
  }
  if (truncated) {
    limitations.push(
      `INCOMPLETE: the preview endpoint returned its ${PREVIEW_ROW_LIMIT}-row ` +
        'cap, so this result is a truncated page. Rows beyond the cap are ' +
        'missing and the response does not say which. Narrow the query.',
    );
  }
  return [...limitations, ...extraLimitations];
}

/**
 * Create a Comtrade source.
 *
 * @param {object} [options]
 * @param {(url:string, init:object)=>Promise<Response>} [options.fetchImpl]
 * @param {string} [options.baseUrl]
 * @param {()=>string} [options.now] ISO-8601 clock, injectable for tests
 * @returns {{getTradeFlows:Function, getTimeSeries:Function}}
 */
export function createComtradeSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  baseUrl = COMTRADE_PREVIEW_BASE,
  now = () => new Date().toISOString(),
} = {}) {
  async function request(query, { signal } = {}) {
    signal?.throwIfAborted();
    const { path, params } = buildPreviewQuery(query);
    const search = new URLSearchParams(params).toString();
    const url = `${baseUrl}${path}?${search}`;
    const response = await fetchImpl(url, { signal });
    signal?.throwIfAborted();
    if (!response.ok) {
      throw new ComtradeError(`Comtrade HTTP ${response.status}`, {
        status: response.status,
      });
    }
    const payload = await response.json();
    signal?.throwIfAborted();
    return { url, payload };
  }

  return {
    /**
     * One reporter/commodity/period/flow slice, across one or all partners.
     *
     * @param {object} query see buildPreviewQuery
     * @param {object} [options]
     * @param {AbortSignal} [options.signal]
     * @returns {Promise<{rows:Array<object>, provenance:object, rejected:number}>}
     */
    async getTradeFlows(query, { signal } = {}) {
      const { url, payload } = await request(query, { signal });
      const { rows, rejected, count, truncated } = normalizeResponse(payload);
      return {
        rows,
        rejected,
        count,
        truncated,
        provenance: comtradeProvenance({
          dataset: url,
          retrievedAt: now(),
          refYear: rows[0]?.refYear ?? null,
          rejected,
          anyAggregate: rows.some((r) => !r.isReported),
          truncated,
        }),
      };
    },

    /**
     * A multi-year series, issued as one call per period.
     *
     * The endpoint permits only one period per call, so this loops. It is
     * SEQUENTIAL by design: concurrent calls produced HTTP 429 in measurement.
     * `onProgress` lets a caller show progress rather than appearing to hang.
     *
     * A failed period does not abort the series — it is recorded in `failures`
     * so a partial series is visibly partial rather than silently short.
     *
     * @param {object} query without `period`
     * @param {number[]} periods
     * @param {object} [options]
     * @param {AbortSignal} [options.signal]
     * @param {(done:number, total:number)=>void} [options.onProgress]
     * @param {(ms:number)=>Promise<void>} [options.delay] injectable for tests
     * @param {number} [options.delayMs=1100] pause between calls
     * @returns {Promise<{series:Array<object>, failures:Array<object>, provenance:object}>}
     */
    async getTimeSeries(query, periods, options = {}) {
      const {
        signal,
        onProgress = () => {},
        delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        delayMs = 1100,
      } = options;
      if (!Array.isArray(periods) || periods.length === 0) {
        throw new TypeError('periods must be a non-empty array');
      }
      const series = [];
      const failures = [];
      let rejectedTotal = 0;
      for (let i = 0; i < periods.length; i += 1) {
        signal?.throwIfAborted();
        if (i > 0) await delay(delayMs);
        try {
          const { payload } = await request(
            { ...query, period: periods[i] },
            { signal },
          );
          const { rows, rejected } = normalizeResponse(payload);
          rejectedTotal += rejected;
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
          dataset: `${baseUrl} time series, periods ${periods.join(',')}`,
          retrievedAt: now(),
          rejected: rejectedTotal,
          anyAggregate: series.some((s) => s.rows.some((r) => !r.isReported)),
          method:
            'One preview call per period (the endpoint permits only one), ' +
            'issued sequentially with a pause to stay inside the rate limit.',
          extraLimitations,
        }),
      };
    },
  };
}
