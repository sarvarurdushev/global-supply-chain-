import test from 'node:test';
import assert from 'node:assert/strict';
import { supplyChainProxy, __testing } from './supplychain.js';

const {
  createCache,
  createPacer,
  codeList,
  commodityList,
  period,
  economyList,
  indicatorCode,
  yearOrNull,
} = __testing;

/* ---------------- query validation ----------------
 *
 * This is the boundary where request parameters meet an upstream URL. Per
 * docs/APPLICATION.md, endpoints are developer configuration and a request must
 * never be able to steer one.
 */

test('codeList accepts numeric codes and rejects anything else', () => {
  assert.equal(codeList('410', { label: 'reporter' }), '410');
  assert.equal(codeList('410,156', { label: 'reporter' }), '410,156');
  // Leading zeros normalise so cache keys do not fragment.
  assert.equal(codeList('0410', { label: 'reporter' }), '410');
  assert.equal(codeList(null, { label: 'reporter' }), null);
  assert.equal(codeList('', { label: 'reporter' }), null);

  assert.throws(() => codeList('410;DROP', { label: 'reporter' }), /invalid code/);
  assert.throws(() => codeList('../../etc', { label: 'reporter' }), /invalid code/);
  assert.throws(() => codeList('410&x=1', { label: 'reporter' }), /invalid code/);
  assert.throws(() => codeList('abc', { label: 'reporter' }), /invalid code/);
  assert.throws(
    () => codeList('1,2,3,4,5', { max: 3, label: 'reporter' }),
    /at most 3 values/,
  );
});

test('commodityList accepts HS codes and TOTAL only', () => {
  assert.equal(commodityList('8542'), '8542');
  assert.equal(commodityList('8542,2709'), '8542,2709');
  assert.equal(commodityList('total'), 'TOTAL');
  assert.equal(commodityList('85'), '85');
  assert.equal(commodityList('854231'), '854231');

  assert.throws(() => commodityList('8542/../secret'), /invalid HS code/);
  assert.throws(() => commodityList('chips'), /invalid HS code/);
  assert.throws(() => commodityList('8'), /invalid HS code/);
  assert.throws(() => commodityList('8542123'), /invalid HS code/);
  assert.throws(() => commodityList(Array(11).fill('8542').join(',')), /between 1 and 10/);
});

test('period accepts a year or a month and rejects the rest', () => {
  assert.equal(period('2023'), '2023');
  assert.equal(period('202306'), '202306');
  assert.throws(() => period('23'), /expected YYYY/);
  assert.throws(() => period('2023-06'), /expected YYYY/);
  assert.throws(() => period('1800'), /year out of range/);
  assert.throws(() => period(''), /expected YYYY/);
});

test('economyList joins with a semicolon and blocks path traversal', () => {
  assert.equal(economyList('KOR'), 'KOR');
  assert.equal(economyList('KOR,jpn'), 'KOR;JPN');
  assert.equal(economyList('all'), 'all');
  assert.throws(() => economyList('../../admin'), /invalid economy code/);
  assert.throws(() => economyList('KOREA'), /invalid economy code/);
  assert.throws(() => economyList(Array(13).fill('KOR').join(',')), /between 1 and 12/);
});

test('indicatorCode allows only the World Bank code alphabet', () => {
  assert.equal(indicatorCode('NY.GDP.MKTP.CD'), 'NY.GDP.MKTP.CD');
  assert.equal(indicatorCode('sp.pop.totl'), 'SP.POP.TOTL');
  assert.throws(() => indicatorCode('NY.GDP?x=1'), /invalid code/);
  assert.throws(() => indicatorCode('../secret'), /invalid code/);
  assert.throws(() => indicatorCode('AB'), /invalid code/);
});

test('yearOrNull bounds the range', () => {
  assert.equal(yearOrNull('2020', 'start'), 2020);
  assert.equal(yearOrNull(null, 'start'), null);
  assert.equal(yearOrNull('', 'start'), null);
  assert.throws(() => yearOrNull('1900', 'start'), /between 1960 and 2100/);
  assert.throws(() => yearOrNull('abc', 'start'), /between 1960 and 2100/);
});

/* ---------------- cache ---------------- */

test('cache serves within the TTL and refreshes after it', async () => {
  const cache = createCache(50);
  let calls = 0;
  const load = async () => {
    calls += 1;
    return { n: calls };
  };
  const first = await cache.resolve('k', load);
  assert.equal(first.cached, false);
  const second = await cache.resolve('k', load);
  assert.equal(second.cached, true);
  assert.equal(calls, 1, 'a cache hit must not call upstream');

  await new Promise((r) => setTimeout(r, 70));
  const third = await cache.resolve('k', load);
  assert.equal(third.cached, false);
  assert.equal(calls, 2);
});

test('cache coalesces concurrent misses into one upstream call', async () => {
  // Without this, opening several panels at once multiplies the 429 risk.
  const cache = createCache(1000);
  let calls = 0;
  const load = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 30));
    return calls;
  };
  const [a, b, c] = await Promise.all([
    cache.resolve('same', load),
    cache.resolve('same', load),
    cache.resolve('same', load),
  ]);
  assert.equal(calls, 1, 'three concurrent requests must share one call');
  assert.equal(a.value, 1);
  assert.equal(b.value, 1);
  assert.equal(c.value, 1);
});

test('a failed load does not poison the cache', async () => {
  const cache = createCache(1000);
  let attempt = 0;
  const load = async () => {
    attempt += 1;
    if (attempt === 1) throw new Error('upstream down');
    return 'ok';
  };
  await assert.rejects(() => cache.resolve('k', load), /upstream down/);
  const retry = await cache.resolve('k', load);
  assert.equal(retry.value, 'ok', 'a later attempt must be allowed through');
});

test('cache evicts oldest entries rather than growing without limit', async () => {
  const cache = createCache(10_000);
  for (let i = 0; i < 520; i += 1) {
    await cache.resolve(`key-${i}`, async () => i);
  }
  assert.ok(cache.size <= 500, `expected <= 500 entries, got ${cache.size}`);
});

/* ---------------- pacer ---------------- */

test('pacer spaces upstream calls by the minimum interval', async () => {
  const pace = createPacer(40);
  const at = [];
  const start = Date.now();
  await Promise.all([
    pace(async () => at.push(Date.now() - start)),
    pace(async () => at.push(Date.now() - start)),
    pace(async () => at.push(Date.now() - start)),
  ]);
  assert.equal(at.length, 3);
  // Comtrade 429s on back-to-back calls, so spacing is the whole point.
  assert.ok(at[1] - at[0] >= 30, `gap 1 was ${at[1] - at[0]}ms`);
  assert.ok(at[2] - at[1] >= 30, `gap 2 was ${at[2] - at[1]}ms`);
});

test('a rejected task does not stall the pacer queue', async () => {
  const pace = createPacer(5);
  await assert.rejects(() => pace(async () => { throw new Error('nope'); }));
  const after = await pace(async () => 'still running');
  assert.equal(after, 'still running');
});

/* ---------------- plugin shape ---------------- */

test('the plugin registers for both dev and preview servers', () => {
  const plugin = supplyChainProxy();
  assert.equal(plugin.name, 'supplychain-proxy');
  assert.equal(typeof plugin.configureServer, 'function');
  assert.equal(typeof plugin.configurePreviewServer, 'function');
});

test('the trade route rejects an injected commodity before any fetch', async () => {
  let fetched = false;
  const plugin = supplyChainProxy({
    fetchImpl: async () => {
      fetched = true;
      return { ok: true, headers: new Map(), json: async () => ({}) };
    },
  });
  const handlers = new Map();
  plugin.configureServer({
    middlewares: { use: (path, handler) => handlers.set(path, handler) },
  });

  const res = captureResponse();
  await handlers.get('/api/supplychain/trade')(
    { url: '/?reporter=410&period=2023&cmd=../../evil&flow=M' },
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error, 'bad_request');
  assert.equal(fetched, false, 'nothing may reach upstream after a rejection');
});

test('the trade route rejects an unknown flow code', async () => {
  const plugin = supplyChainProxy({ fetchImpl: async () => ({ ok: true }) });
  const handlers = new Map();
  plugin.configureServer({
    middlewares: { use: (path, handler) => handlers.set(path, handler) },
  });
  const res = captureResponse();
  await handlers.get('/api/supplychain/trade')(
    { url: '/?reporter=410&period=2023&cmd=8542&flow=SIDEWAYS' },
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).detail, /flow/);
});

test('the trade route accepts a production-sized reporter batch', async () => {
  // Measured against the live preview endpoint: 60 reporters returns in ~2s
  // with a short URL. The console batches at 30 and halves on truncation, so
  // this cap only has to be comfortably above that.
  let requested = null;
  const plugin = supplyChainProxy({
    fetchImpl: async (url) => {
      requested = url;
      return okResponse({ count: 0, data: [] });
    },
  });
  const handlers = new Map();
  plugin.configureServer({
    middlewares: { use: (path, handler) => handlers.set(path, handler) },
  });
  const reporters = Array.from({ length: 60 }, (_, i) => 100 + i).join(',');
  const res = captureResponse();
  await handlers.get('/api/supplychain/trade')(
    { url: `/?reporter=${reporters}&period=2023&cmd=8542&flow=X&partner=0` },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.match(requested, /reporterCode=100%2C101/);

  // 61 is still refused: the cap is a real bound, not a suggestion.
  const tooMany = captureResponse();
  await handlers.get('/api/supplychain/trade')(
    { url: `/?reporter=${reporters},999&period=2023&cmd=8542&flow=X` },
    tooMany,
  );
  assert.equal(tooMany.statusCode, 400);
  assert.match(JSON.parse(tooMany.body).detail, /at most 60 values/);
});

test('the events route serves the GDACS feed and caches it', async () => {
  let calls = 0;
  const plugin = supplyChainProxy({
    gdacsBase: 'https://example.test/api',
    fetchImpl: async (url) => {
      calls += 1;
      assert.equal(url, 'https://example.test/api/events/geteventlist/EVENTS4APP');
      return okResponse({ type: 'FeatureCollection', features: [] });
    },
  });
  const handlers = new Map();
  plugin.configureServer({
    middlewares: { use: (path, handler) => handlers.set(path, handler) },
  });

  const first = captureResponse();
  await handlers.get('/api/supplychain/events')({ url: '/' }, first);
  assert.equal(first.statusCode, 200);
  const body = JSON.parse(first.body);
  assert.equal(body.upstream, 'GDACS');
  assert.match(body.attribution, /GDACS/);
  assert.equal(body.cached, false);
  assert.deepEqual(body.payload.features, []);

  const second = captureResponse();
  await handlers.get('/api/supplychain/events')({ url: '/' }, second);
  assert.equal(JSON.parse(second.body).cached, true);
  assert.equal(calls, 1, 'a cache hit must not re-fetch the feed');
});

test('the events route reports an upstream failure rather than inventing a feed', async () => {
  const plugin = supplyChainProxy({
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  const handlers = new Map();
  plugin.configureServer({
    middlewares: { use: (path, handler) => handlers.set(path, handler) },
  });
  const res = captureResponse();
  await handlers.get('/api/supplychain/events')({ url: '/' }, res);
  assert.equal(res.statusCode, 502);
  const body = JSON.parse(res.body);
  assert.equal(body.error, 'upstream_failed');
  assert.equal(body.retryable, true, '503 is worth retrying');
});

test('a throttled call is retried once, then succeeds', async () => {
  // Measured: the production ranking issues eight batched calls and trips
  // Comtrade's burst limiter even at 1200 ms spacing. Failing the whole ranking
  // for one throttled call throws away the other seven.
  let attempts = 0;
  const plugin = supplyChainProxy({
    minIntervalMs: 0,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        return { ok: false, status: 429, headers: new Map([['retry-after', '0.01']]) };
      }
      return okResponse({ count: 1, data: [] });
    },
  });
  const handlers = new Map();
  plugin.configureServer({
    middlewares: { use: (path, handler) => handlers.set(path, handler) },
  });
  const res = captureResponse();
  await handlers.get('/api/supplychain/trade')(
    { url: '/?reporter=410&period=2023&cmd=8542&flow=X' },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(attempts, 2, 'exactly one retry');
});

test('a persistently throttled call fails rather than retrying forever', async () => {
  let attempts = 0;
  const plugin = supplyChainProxy({
    minIntervalMs: 0,
    fetchImpl: async () => {
      attempts += 1;
      return { ok: false, status: 429, headers: new Map([['retry-after', '0.01']]) };
    },
  });
  const handlers = new Map();
  plugin.configureServer({
    middlewares: { use: (path, handler) => handlers.set(path, handler) },
  });
  const res = captureResponse();
  await handlers.get('/api/supplychain/trade')(
    { url: '/?reporter=410&period=2023&cmd=8542&flow=X' },
    res,
  );
  assert.equal(attempts, 2, 'one retry, not a loop');
  assert.equal(res.statusCode, 429);
  assert.equal(JSON.parse(res.body).retryable, true);
});

test('a 500 is not retried — retrying multiplies load on a failing upstream', async () => {
  let attempts = 0;
  const plugin = supplyChainProxy({
    minIntervalMs: 0,
    fetchImpl: async () => {
      attempts += 1;
      return { ok: false, status: 500, headers: new Map() };
    },
  });
  const handlers = new Map();
  plugin.configureServer({
    middlewares: { use: (path, handler) => handlers.set(path, handler) },
  });
  const res = captureResponse();
  await handlers.get('/api/supplychain/trade')(
    { url: '/?reporter=410&period=2023&cmd=8542&flow=X' },
    res,
  );
  assert.equal(attempts, 1);
  assert.equal(res.statusCode, 502);
});

test('the status route reports cache and throttle configuration', async () => {
  const plugin = supplyChainProxy({ minIntervalMs: 1234 });
  const handlers = new Map();
  plugin.configureServer({
    middlewares: { use: (path, handler) => handlers.set(path, handler) },
  });
  const res = captureResponse();
  handlers.get('/api/supplychain/status')({ url: '/' }, res);
  const body = JSON.parse(res.body);
  assert.equal(body.minUpstreamIntervalMs, 1234);
  assert.equal(body.tradeCacheEntries, 0);
  assert.equal(body.eventCacheEntries, 0);
  assert.ok(body.tradeTtlMs > 0);
  // GDACS is a live feed, so its cache must expire far sooner than trade data.
  assert.ok(body.eventTtlMs > 0);
  assert.ok(body.eventTtlMs < body.tradeTtlMs);
});

function okResponse(payload) {
  const text = JSON.stringify(payload);
  return {
    ok: true,
    status: 200,
    headers: new Map([['content-length', String(text.length)]]),
    text: async () => text,
    body: null,
  };
}

function captureResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[key] = value;
    },
    end(payload) {
      this.body = payload;
    },
  };
}
