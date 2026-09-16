/**
 * Supply-chain data proxy: UN Comtrade and World Bank.
 *
 * Neither upstream needs an API key, but both need a proxy anyway:
 *
 *  1. **Rate limiting.** Comtrade returns HTTP 429 on back-to-back calls
 *     (measured — docs/DATA_AVAILABILITY_MATRIX.md §1.1). A browser tab
 *     rendering a ten-year trade series would issue ten calls and be throttled
 *     part-way through. The proxy serialises upstream calls behind a minimum
 *     interval and caches aggressively, so repeated views cost nothing.
 *  2. **CORS.** Neither upstream is guaranteed to send permissive CORS headers.
 *  3. **Endpoint control.** Per docs/APPLICATION.md, upstream hosts are
 *     developer configuration and are never taken from request parameters.
 *     Every query value is validated and re-encoded before it reaches an
 *     upstream URL.
 *
 * Routes:
 *   GET /api/supplychain/trade?reporter=&period=&cmd=&flow=&partner=
 *   GET /api/supplychain/indicator?iso3=&indicator=&start=&end=
 *   GET /api/supplychain/status
 *
 * The cache is a performance cache with a TTL, not a redistribution mirror —
 * see docs/DATA_LICENSE_MATRIX.md §5.
 */

const COMTRADE_BASE = 'https://comtradeapi.un.org/public/v1/preview';
const WORLD_BANK_BASE = 'https://api.worldbank.org/v2';

/** Comtrade data is annual and revised rarely; an hour is conservative. */
const TRADE_TTL_MS = 60 * 60_000;
/** World Bank indicators are annual. */
const INDICATOR_TTL_MS = 6 * 60 * 60_000;
/** Minimum gap between upstream Comtrade calls, from the observed 429 behaviour. */
const COMTRADE_MIN_INTERVAL_MS = 1200;
/** Hard ceiling on an upstream body. The largest legitimate trade page is ~200 KB. */
const MAX_BYTES = 8 * 1024 * 1024;
/** Bound the cache so a long session cannot grow it without limit. */
const MAX_CACHE_ENTRIES = 500;

/** Flow codes Comtrade accepts. */
const FLOW_CODES = new Set(['M', 'X', 'RM', 'RX']);

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(payload);
}

/**
 * Read an upstream body with a hard byte cap, so an unbounded or malicious
 * response cannot exhaust memory.
 */
async function readCapped(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { tooLarge: true, text: '' };
  }
  const reader = response.body?.getReader();
  if (!reader) return { tooLarge: false, text: await response.text() };
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { tooLarge: true, text: '' };
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return { tooLarge: false, text };
}

/** A TTL cache with single-flight refresh and bounded size. */
function createCache(ttlMs) {
  /** @type {Map<string, {at:number, value:unknown}>} */
  const entries = new Map();
  /** @type {Map<string, Promise<unknown>>} */
  const inflight = new Map();

  return {
    get size() {
      return entries.size;
    },
    /**
     * @param {string} key
     * @param {() => Promise<unknown>} load
     * @returns {Promise<{value:unknown, cached:boolean, ageMs:number}>}
     */
    async resolve(key, load) {
      const hit = entries.get(key);
      const now = Date.now();
      if (hit && now - hit.at < ttlMs) {
        return { value: hit.value, cached: true, ageMs: now - hit.at };
      }
      // Single-flight: concurrent requests for the same key share one upstream
      // call. Without this, opening three panels at once triples the 429 risk.
      const pending = inflight.get(key);
      if (pending) return { value: await pending, cached: false, ageMs: 0 };

      const promise = (async () => {
        const value = await load();
        if (entries.size >= MAX_CACHE_ENTRIES) {
          // Oldest-insertion eviction. Map preserves insertion order.
          const oldest = entries.keys().next().value;
          if (oldest !== undefined) entries.delete(oldest);
        }
        entries.set(key, { at: Date.now(), value });
        return value;
      })();
      inflight.set(key, promise);
      try {
        return { value: await promise, cached: false, ageMs: 0 };
      } finally {
        inflight.delete(key);
      }
    },
    clear() {
      entries.clear();
      inflight.clear();
    },
  };
}

/**
 * Serialise upstream calls behind a minimum interval.
 *
 * Comtrade's limiter is short-window, so spacing calls avoids 429 entirely
 * rather than reacting to it.
 */
function createPacer(minIntervalMs) {
  let tail = Promise.resolve();
  let lastAt = 0;
  return function pace(task) {
    const run = tail.then(async () => {
      const wait = lastAt + minIntervalMs - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastAt = Date.now();
      return task();
    });
    // Keep the chain alive even when one task rejects.
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

/* ------------------------------------------------------------------ *
 * Query validation
 *
 * Every value below is checked against a strict pattern before it is placed
 * into an upstream URL. Request parameters can never select the upstream host,
 * path, or an unexpected parameter.
 * ------------------------------------------------------------------ */

function codeList(raw, { max = 20, label }) {
  if (raw === null || raw === undefined || raw === '') return null;
  const parts = String(raw).split(',');
  if (parts.length > max) throw new Error(`${label}: at most ${max} values`);
  const out = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!/^\d{1,4}$/.test(trimmed))
      throw new Error(`${label}: invalid code "${trimmed}"`);
    out.push(String(Number(trimmed)));
  }
  return out.join(',');
}

function commodityList(raw) {
  const parts = String(raw ?? '').split(',');
  if (parts.length === 0 || parts.length > 10) {
    throw new Error('cmd: between 1 and 10 values');
  }
  const out = [];
  for (const part of parts) {
    const trimmed = part.trim().toUpperCase();
    if (!/^\d{2,6}$|^TOTAL$/.test(trimmed)) {
      throw new Error(`cmd: invalid HS code "${trimmed}"`);
    }
    out.push(trimmed);
  }
  return out.join(',');
}

function period(raw) {
  const value = String(raw ?? '').trim();
  // Annual YYYY or monthly YYYYMM.
  if (!/^\d{4}$|^\d{6}$/.test(value))
    throw new Error('period: expected YYYY or YYYYMM');
  const year = Number(value.slice(0, 4));
  if (year < 1962 || year > 2100)
    throw new Error(`period: year out of range (${year})`);
  return value;
}

function economyList(raw) {
  const parts = String(raw ?? '').split(',');
  if (parts.length === 0 || parts.length > 12) {
    throw new Error('iso3: between 1 and 12 values');
  }
  const out = [];
  for (const part of parts) {
    const trimmed = part.trim().toUpperCase();
    if (!/^[A-Z]{2,3}$|^ALL$/.test(trimmed)) {
      throw new Error(`iso3: invalid economy code "${trimmed}"`);
    }
    out.push(trimmed === 'ALL' ? 'all' : trimmed);
  }
  return out.join(';');
}

function indicatorCode(raw) {
  const value = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9.]{3,40}$/.test(value))
    throw new Error('indicator: invalid code');
  return value;
}

function yearOrNull(raw, label) {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1960 || value > 2100) {
    throw new Error(`${label}: expected a year between 1960 and 2100`);
  }
  return value;
}

/**
 * Create the supply-chain proxy plugin.
 *
 * @param {object} [options]
 * @param {(url:string, init?:object)=>Promise<Response>} [options.fetchImpl]
 * @param {string} [options.comtradeBase]
 * @param {string} [options.worldBankBase]
 * @param {number} [options.minIntervalMs]
 * @returns {import('vite').Plugin}
 */
export function supplyChainProxy({
  fetchImpl = (...args) => globalThis.fetch(...args),
  comtradeBase = COMTRADE_BASE,
  worldBankBase = WORLD_BANK_BASE,
  minIntervalMs = COMTRADE_MIN_INTERVAL_MS,
} = {}) {
  const tradeCache = createCache(TRADE_TTL_MS);
  const indicatorCache = createCache(INDICATOR_TTL_MS);
  const pace = createPacer(minIntervalMs);
  const stats = {
    tradeRequests: 0,
    indicatorRequests: 0,
    upstreamCalls: 0,
    errors: 0,
  };

  async function callUpstream(url) {
    stats.upstreamCalls += 1;
    const response = await fetchImpl(url, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      const error = new Error(`upstream HTTP ${response.status}`);
      error.status = response.status;
      // 429 and 5xx are worth retrying later; 4xx is the caller's problem.
      error.retryable = response.status === 429 || response.status >= 500;
      throw error;
    }
    const { tooLarge, text } = await readCapped(response, MAX_BYTES);
    if (tooLarge) {
      const error = new Error('upstream response exceeded the size cap');
      error.status = 502;
      throw error;
    }
    try {
      return JSON.parse(text);
    } catch {
      const error = new Error('upstream returned malformed JSON');
      error.status = 502;
      throw error;
    }
  }

  function installMiddleware(server) {
    server.middlewares.use('/api/supplychain/trade', async (req, res) => {
      stats.tradeRequests += 1;
      let url;
      let key;
      try {
        const params = new URL(req.url, 'http://localhost').searchParams;
        const reporter = codeList(params.get('reporter'), {
          max: 10,
          label: 'reporter',
        });
        if (!reporter) throw new Error('reporter is required');
        const flow = String(params.get('flow') ?? 'M').toUpperCase();
        if (!FLOW_CODES.has(flow))
          throw new Error(`flow: expected one of ${[...FLOW_CODES]}`);
        const frequency = params.get('freq') === 'M' ? 'M' : 'A';
        const search = new URLSearchParams({
          reporterCode: reporter,
          period: period(params.get('period')),
          cmdCode: commodityList(params.get('cmd')),
          flowCode: flow,
        });
        const partner = codeList(params.get('partner'), {
          max: 20,
          label: 'partner',
        });
        if (partner !== null) search.set('partnerCode', partner);
        url = `${comtradeBase}/C/${frequency}/HS?${search}`;
        key = url;
      } catch (error) {
        sendJson(res, 400, { error: 'bad_request', detail: error.message });
        return;
      }

      try {
        const { value, cached, ageMs } = await tradeCache.resolve(key, () =>
          pace(() => callUpstream(url)),
        );
        sendJson(res, 200, {
          upstream: 'UN Comtrade',
          attribution: 'Source: UN Comtrade (comtradeplus.un.org)',
          cached,
          ageMs,
          retrievedAt: new Date(Date.now() - ageMs).toISOString(),
          payload: value,
        });
      } catch (error) {
        stats.errors += 1;
        sendJson(res, error.status === 429 ? 429 : 502, {
          error: 'upstream_failed',
          detail: error.message,
          retryable: Boolean(error.retryable),
        });
      }
    });

    server.middlewares.use('/api/supplychain/indicator', async (req, res) => {
      stats.indicatorRequests += 1;
      let url;
      try {
        const params = new URL(req.url, 'http://localhost').searchParams;
        const economies = economyList(params.get('iso3'));
        const indicator = indicatorCode(params.get('indicator'));
        const search = new URLSearchParams({ format: 'json', per_page: '500' });
        const start = yearOrNull(params.get('start'), 'start');
        const end = yearOrNull(params.get('end'), 'end');
        if (start !== null || end !== null) {
          const from = start ?? 1960;
          const to = end ?? new Date().getUTCFullYear();
          if (from > to) throw new Error('start must not exceed end');
          search.set('date', `${from}:${to}`);
        }
        url = `${worldBankBase}/country/${economies}/indicator/${indicator}?${search}`;
      } catch (error) {
        sendJson(res, 400, { error: 'bad_request', detail: error.message });
        return;
      }

      try {
        const { value, cached, ageMs } = await indicatorCache.resolve(url, () =>
          callUpstream(url),
        );
        sendJson(res, 200, {
          upstream: 'World Bank',
          attribution: 'Source: World Bank — data.worldbank.org (CC BY 4.0)',
          cached,
          ageMs,
          retrievedAt: new Date(Date.now() - ageMs).toISOString(),
          payload: value,
        });
      } catch (error) {
        stats.errors += 1;
        sendJson(res, 502, {
          error: 'upstream_failed',
          detail: error.message,
          retryable: Boolean(error.retryable),
        });
      }
    });

    server.middlewares.use('/api/supplychain/status', (req, res) => {
      sendJson(res, 200, {
        ...stats,
        tradeCacheEntries: tradeCache.size,
        indicatorCacheEntries: indicatorCache.size,
        tradeTtlMs: TRADE_TTL_MS,
        indicatorTtlMs: INDICATOR_TTL_MS,
        minUpstreamIntervalMs: minIntervalMs,
      });
    });
  }

  return {
    name: 'supplychain-proxy',
    configureServer: installMiddleware,
    configurePreviewServer: installMiddleware,
  };
}

// Exported for tests. Not part of the plugin's public surface.
export const __testing = Object.freeze({
  createCache,
  createPacer,
  codeList,
  commodityList,
  period,
  economyList,
  indicatorCode,
  yearOrNull,
});
