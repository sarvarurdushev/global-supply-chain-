import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FlowCode,
  ComtradeError,
  buildPreviewQuery,
  normalizeRow,
  normalizeResponse,
  comtradeProvenance,
  comtradeLimitations,
  createComtradeSource,
} from './comtrade.js';
import { DataClass } from '../provenance.js';

/**
 * A real row shape, copied from a live response on 2026-09-16:
 * Korea (410) -> Viet Nam (704), HS 8542, 2023 exports.
 * Note the null description fields — that is genuinely what the API returns.
 */
const LIVE_ROW = {
  typeCode: 'C',
  freqCode: 'A',
  refYear: 2023,
  period: '2023',
  reporterCode: 410,
  reporterISO: null,
  reporterDesc: null,
  flowCode: 'X',
  flowDesc: null,
  partnerCode: 704,
  partnerISO: null,
  partnerDesc: null,
  classificationCode: 'H6',
  cmdCode: '8542',
  cmdDesc: null,
  qtyUnitCode: -1,
  qtyUnitAbbr: null,
  qty: 0.0,
  isQtyEstimated: true,
  netWgt: 1677573.63,
  grossWgt: 0.0,
  cifvalue: null,
  fobvalue: 11852014614.0,
  primaryValue: 11852014614.0,
  legacyEstimationFlag: 2,
  isReported: false,
  isAggregate: true,
};

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => payload };
}

test('buildPreviewQuery refuses a multi-period request', () => {
  // The endpoint returns HTTP 400 for this; failing early is more useful.
  assert.throws(
    () =>
      buildPreviewQuery({
        reporterCode: 410,
        period: [2022, 2023],
        cmdCode: '8542',
        flowCode: FlowCode.EXPORT,
      }),
    /exactly one period per call/,
  );
});

test('buildPreviewQuery validates codes and flow', () => {
  const base = { reporterCode: 410, period: 2023, cmdCode: '8542', flowCode: FlowCode.EXPORT };
  assert.throws(() => buildPreviewQuery({ ...base, flowCode: 'SIDEWAYS' }), TypeError);
  assert.throws(() => buildPreviewQuery({ ...base, frequency: 'W' }), TypeError);
  assert.throws(() => buildPreviewQuery({ ...base, reporterCode: [] }), TypeError);
  assert.throws(() => buildPreviewQuery({ ...base, reporterCode: -1 }), TypeError);
  assert.throws(() => buildPreviewQuery({ ...base, period: 2023.5 }), TypeError);
  // Guard against injecting arbitrary text into the upstream query.
  assert.throws(() => buildPreviewQuery({ ...base, cmdCode: '8542&evil=1' }), TypeError);
  assert.throws(() => buildPreviewQuery({ ...base, cmdCode: 'chips' }), TypeError);
  assert.throws(() => buildPreviewQuery({ ...base, partnerCode: 'all' }), TypeError);
});

test('buildPreviewQuery joins multiple reporters and commodities', () => {
  const { path, params } = buildPreviewQuery({
    reporterCode: [410, 156],
    period: 2023,
    cmdCode: ['8542', '8541'],
    flowCode: FlowCode.IMPORT,
    partnerCode: 490,
  });
  assert.equal(path, '/C/A/HS');
  assert.equal(params.reporterCode, '410,156');
  assert.equal(params.cmdCode, '8542,8541');
  assert.equal(params.partnerCode, '490');
  assert.equal(params.flowCode, 'M');
});

test('buildPreviewQuery omits partnerCode to request all partners', () => {
  const { params } = buildPreviewQuery({
    reporterCode: 410,
    period: 2023,
    cmdCode: '8542',
    flowCode: FlowCode.EXPORT,
  });
  assert.equal('partnerCode' in params, false);
});

test('buildPreviewQuery supports monthly frequency', () => {
  const { path } = buildPreviewQuery({
    reporterCode: 410,
    period: 202306,
    cmdCode: '8542',
    flowCode: FlowCode.EXPORT,
    frequency: 'M',
  });
  assert.equal(path, '/C/M/HS');
});

test('normalizeRow handles the real API row shape', () => {
  const row = normalizeRow(LIVE_ROW);
  assert.equal(row.reporterCode, 410);
  assert.equal(row.partnerCode, 704);
  assert.equal(row.cmdCode, '8542');
  assert.equal(row.valueUsd, 11852014614);
  assert.equal(row.netWeightKg, 1677573.63);
  // qty is 0 and estimated: it must not become a usable quantity.
  assert.equal(row.quantity, null);
  assert.equal(row.quantityEstimated, true);
  // The aggregate flags must survive normalization for the provenance panel.
  assert.equal(row.isReported, false);
  assert.equal(row.isAggregate, true);
  assert.equal(row.legacyEstimationFlag, 2);
  assert.ok(Object.isFrozen(row));
});

test('normalizeRow rejects rows with no usable value', () => {
  assert.equal(normalizeRow(null), null);
  assert.equal(normalizeRow('nope'), null);
  assert.equal(normalizeRow({ ...LIVE_ROW, primaryValue: null }), null);
  assert.equal(normalizeRow({ ...LIVE_ROW, primaryValue: -5 }), null);
  assert.equal(normalizeRow({ ...LIVE_ROW, primaryValue: 'lots' }), null);
  assert.equal(normalizeRow({ ...LIVE_ROW, reporterCode: 'KOR' }), null);
  assert.equal(normalizeRow({ ...LIVE_ROW, period: '' }), null);
  assert.equal(normalizeRow({ ...LIVE_ROW, cmdCode: '' }), null);
});

test('a zero net weight becomes null rather than a false measurement', () => {
  const row = normalizeRow({ ...LIVE_ROW, netWgt: 0 });
  assert.equal(row.netWeightKg, null);
});

test('normalizeResponse counts rejected rows instead of hiding them', () => {
  const result = normalizeResponse({
    count: 3,
    error: '',
    data: [LIVE_ROW, { ...LIVE_ROW, primaryValue: null }, 'garbage'],
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rejected, 2);
  assert.equal(result.count, 3);
});

test('normalizeResponse surfaces an upstream error rather than returning empty', () => {
  assert.throws(
    () => normalizeResponse({ error: 'Maximum number of periods for preview is 1' }),
    ComtradeError,
  );
  assert.throws(() => normalizeResponse(null), ComtradeError);
  assert.throws(() => normalizeResponse({ data: 'nope' }), ComtradeError);
});

test('comtradeProvenance is always HISTORICAL and states the lag', () => {
  const p = comtradeProvenance({
    dataset: 'test',
    retrievedAt: '2026-09-16T00:00:00Z',
    refYear: 2023,
  });
  assert.equal(p.dataClass, DataClass.HISTORICAL);
  assert.equal(p.badge, '🔵 HISTORICAL');
  assert.equal(p.observedAt, '2023-12-31');
  assert.ok(p.limitations.some((l) => /lags its reference period/.test(l)));
  assert.ok(p.limitations.some((l) => /mirror-statistic asymmetry/.test(l)));
  assert.match(p.license, /comtradeplus\.un\.org/);
});

test('comtradeLimitations adds caveats for aggregates and rejects', () => {
  const plain = comtradeLimitations();
  const flagged = comtradeLimitations({ rejected: 4, anyAggregate: true });
  assert.ok(flagged.length > plain.length);
  assert.ok(flagged.some((l) => /isReported=false/.test(l)));
  assert.ok(flagged.some((l) => /4 row\(s\) failed validation/.test(l)));
});

test('getTradeFlows returns normalized rows with provenance', async () => {
  let requested = null;
  const source = createComtradeSource({
    fetchImpl: async (url) => {
      requested = url;
      return jsonResponse({ count: 1, error: '', data: [LIVE_ROW] });
    },
    now: () => '2026-09-16T00:00:00Z',
  });
  const result = await source.getTradeFlows({
    reporterCode: 410,
    period: 2023,
    cmdCode: '8542',
    flowCode: FlowCode.EXPORT,
    partnerCode: 704,
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].valueUsd, 11852014614);
  assert.match(requested, /reporterCode=410/);
  assert.match(requested, /period=2023/);
  assert.equal(result.provenance.dataClass, DataClass.HISTORICAL);
  // The row is an aggregate, so the provenance must say so.
  assert.ok(result.provenance.limitations.some((l) => /isReported=false/.test(l)));
});

test('getTradeFlows raises a retryable error on 429', async () => {
  const source = createComtradeSource({
    fetchImpl: async () => jsonResponse({}, { ok: false, status: 429 }),
  });
  await assert.rejects(
    () =>
      source.getTradeFlows({
        reporterCode: 410,
        period: 2023,
        cmdCode: '8542',
        flowCode: FlowCode.EXPORT,
      }),
    (error) => {
      assert.ok(error instanceof ComtradeError);
      assert.equal(error.status, 429);
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

test('a 400 is not marked retryable', async () => {
  const source = createComtradeSource({
    fetchImpl: async () => jsonResponse({}, { ok: false, status: 400 }),
  });
  await assert.rejects(
    () =>
      source.getTradeFlows({
        reporterCode: 410,
        period: 2023,
        cmdCode: '8542',
        flowCode: FlowCode.EXPORT,
      }),
    (error) => error.retryable === false,
  );
});

test('getTimeSeries issues one sequential call per period', async () => {
  const calls = [];
  const delays = [];
  const source = createComtradeSource({
    fetchImpl: async (url) => {
      calls.push(url);
      const year = /period=(\d+)/.exec(url)[1];
      return jsonResponse({
        count: 1,
        error: '',
        data: [{ ...LIVE_ROW, period: year, refYear: Number(year) }],
      });
    },
    now: () => '2026-09-16T00:00:00Z',
  });
  const result = await source.getTimeSeries(
    { reporterCode: 410, cmdCode: '8542', flowCode: FlowCode.EXPORT, partnerCode: 704 },
    [2021, 2022, 2023],
    { delay: async (ms) => delays.push(ms) },
  );
  assert.equal(calls.length, 3);
  assert.deepEqual(result.series.map((s) => s.period), [2021, 2022, 2023]);
  // Two pauses for three calls: throttling between, not before the first.
  assert.equal(delays.length, 2);
  assert.ok(delays.every((d) => d >= 1000));
  assert.deepEqual(result.failures, []);
});

test('getTimeSeries records a failed period instead of aborting the series', async () => {
  const source = createComtradeSource({
    fetchImpl: async (url) => {
      if (url.includes('period=2022')) return jsonResponse({}, { ok: false, status: 429 });
      const year = /period=(\d+)/.exec(url)[1];
      return jsonResponse({
        count: 1,
        error: '',
        data: [{ ...LIVE_ROW, period: year, refYear: Number(year) }],
      });
    },
    now: () => '2026-09-16T00:00:00Z',
  });
  const result = await source.getTimeSeries(
    { reporterCode: 410, cmdCode: '8542', flowCode: FlowCode.EXPORT },
    [2021, 2022, 2023],
    { delay: async () => {} },
  );
  assert.equal(result.series.length, 2);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].period, 2022);
  // A partial series must be visibly partial.
  assert.ok(
    result.provenance.limitations.some((l) => /This series is incomplete/.test(l)),
  );
});

test('getTimeSeries reports progress and validates periods', async () => {
  const source = createComtradeSource({
    fetchImpl: async () => jsonResponse({ count: 0, error: '', data: [] }),
  });
  const progress = [];
  await source.getTimeSeries(
    { reporterCode: 410, cmdCode: '8542', flowCode: FlowCode.EXPORT },
    [2022, 2023],
    { delay: async () => {}, onProgress: (done, total) => progress.push([done, total]) },
  );
  assert.deepEqual(progress, [
    [1, 2],
    [2, 2],
  ]);
  await assert.rejects(
    () => source.getTimeSeries({ reporterCode: 410, cmdCode: '8542', flowCode: 'X' }, []),
    TypeError,
  );
});

test('an abort signal propagates and is not swallowed as a period failure', async () => {
  const controller = new AbortController();
  const source = createComtradeSource({
    fetchImpl: async () => {
      controller.abort();
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    },
  });
  await assert.rejects(
    () =>
      source.getTimeSeries(
        { reporterCode: 410, cmdCode: '8542', flowCode: FlowCode.EXPORT },
        [2023],
        { signal: controller.signal, delay: async () => {} },
      ),
    (error) => error.name === 'AbortError',
  );
});
