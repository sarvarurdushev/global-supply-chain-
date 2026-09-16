import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SupplyChainProxyError,
  createTradeProxySource,
  buildFlows,
} from './tradeProxy.js';
import { AssociationClass, DataClass } from '../provenance.js';

const ROW = {
  refYear: 2023,
  period: '2023',
  reporterCode: 410,
  flowCode: 'M',
  partnerCode: 156,
  classificationCode: 'H6',
  cmdCode: '8542',
  qty: 0,
  isQtyEstimated: true,
  netWgt: 1000,
  primaryValue: 16_816_793_018,
  isReported: true,
  isAggregate: false,
};

function proxyResponse(payload, { ok = true, status = 200, cached = false } = {}) {
  return {
    ok,
    status,
    json: async () => ({
      upstream: 'UN Comtrade',
      cached,
      ageMs: 0,
      retrievedAt: '2026-09-16T00:00:00Z',
      payload,
      ...(ok ? {} : payload),
    }),
  };
}

test('getTradeFlows normalizes through the proxy and keeps provenance', async () => {
  let requested = null;
  const source = createTradeProxySource({
    fetchImpl: async (url) => {
      requested = url;
      return proxyResponse({ count: 1, error: '', data: [ROW] });
    },
  });
  const result = await source.getTradeFlows({
    reporter: 410,
    period: 2023,
    cmd: '8542',
    flow: 'M',
  });
  assert.match(requested, /^\/api\/supplychain\/trade\?/);
  assert.match(requested, /reporter=410/);
  assert.match(requested, /cmd=8542/);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].valueUsd, 16_816_793_018);
  // Trade is never live, whichever path it arrived by.
  assert.equal(result.provenance.dataClass, DataClass.HISTORICAL);
  assert.match(result.provenance.method, /proxy/);
});

test('a proxy failure surfaces its retryability', async () => {
  const source = createTradeProxySource({
    fetchImpl: async () =>
      proxyResponse({ detail: 'upstream HTTP 429', retryable: true }, {
        ok: false,
        status: 429,
      }),
  });
  await assert.rejects(
    () => source.getTradeFlows({ reporter: 410, period: 2023, cmd: '8542', flow: 'M' }),
    (error) => {
      assert.ok(error instanceof SupplyChainProxyError);
      assert.equal(error.status, 429);
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

test('malformed proxy JSON is reported, not swallowed', async () => {
  const source = createTradeProxySource({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('bad json');
      },
    }),
  });
  await assert.rejects(
    () => source.getTradeFlows({ reporter: 410, period: 2023, cmd: '8542', flow: 'M' }),
    /malformed JSON/,
  );
});

test('getTradeSeries collects per-period failures instead of aborting', async () => {
  const source = createTradeProxySource({
    fetchImpl: async (url) => {
      if (url.includes('period=2022')) {
        return proxyResponse({ detail: 'boom' }, { ok: false, status: 502 });
      }
      const year = /period=(\d+)/.exec(url)[1];
      return proxyResponse({
        count: 1,
        error: '',
        data: [{ ...ROW, period: year, refYear: Number(year) }],
      });
    },
  });
  const progress = [];
  const result = await source.getTradeSeries(
    { reporter: 410, cmd: '8542', flow: 'M', partner: 0 },
    [2021, 2022, 2023],
    { onProgress: (done, total) => progress.push([done, total]) },
  );
  assert.equal(result.series.length, 2);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].period, 2022);
  assert.deepEqual(progress, [
    [1, 3],
    [2, 3],
    [3, 3],
  ]);
  assert.ok(
    result.provenance.limitations.some((l) => /series is incomplete/.test(l)),
  );
});

test('getIndicator drops null observations and says so', async () => {
  const source = createTradeProxySource({
    fetchImpl: async () =>
      proxyResponse([
        { page: 1, pages: 1, per_page: 500, total: 2 },
        [
          {
            indicator: { id: 'NY.GDP.MKTP.CD', value: 'GDP' },
            country: { value: 'Korea' },
            countryiso3code: 'KOR',
            date: '2023',
            value: 1_844_800_934_391,
          },
          {
            indicator: { id: 'NY.GDP.MKTP.CD', value: 'GDP' },
            country: { value: 'Korea' },
            countryiso3code: 'KOR',
            date: '2022',
            value: null,
          },
        ],
      ]),
  });
  const result = await source.getIndicator({ iso3: 'KOR', indicator: 'NY.GDP.MKTP.CD' });
  assert.equal(result.observations.length, 1);
  assert.equal(result.dropped, 1);
  assert.ok(
    result.provenance.limitations.some((l) => /rather than treated as zero/.test(l)),
  );
});

/* ---------------- buildFlows ---------------- */

const POSITIONS = {
  410: { lat: 36.4, lon: 128.1 }, // Korea
  156: { lat: 32.5, lon: 106.3 }, // China
  392: { lat: 36.5, lon: 139.0 }, // Japan
};
const positionOf = (code) => POSITIONS[code] ?? null;
const interpret = (code) =>
  code === 490
    ? {
        name: 'Other Asia, nes',
        association: AssociationClass.INFERRED,
        isAggregate: true,
        caveat: 'read as Taiwan',
      }
    : {
        name: `country ${code}`,
        association: AssociationClass.VERIFIED,
        isAggregate: false,
        caveat: null,
      };

test('buildFlows orients arcs by trade direction', () => {
  const rows = [{ ...ROW, reporterCode: 410, partnerCode: 156, valueUsd: 100 }];
  const imports = buildFlows({ rows, flow: 'M', positionOf, interpret });
  // Imports arrive at the reporter, so the arc runs partner -> reporter.
  assert.deepEqual(imports.flows[0].from, POSITIONS[156]);
  assert.deepEqual(imports.flows[0].to, POSITIONS[410]);

  const exports = buildFlows({ rows, flow: 'X', positionOf, interpret });
  assert.deepEqual(exports.flows[0].from, POSITIONS[410]);
  assert.deepEqual(exports.flows[0].to, POSITIONS[156]);
});

test('buildFlows excludes the World total', () => {
  // Partner 0 is the sum of every other partner; drawing it would render one
  // arc representing all the others at once.
  const rows = [
    { ...ROW, partnerCode: 0, valueUsd: 999 },
    { ...ROW, partnerCode: 156, valueUsd: 100 },
  ];
  const result = buildFlows({ rows, flow: 'M', positionOf, interpret });
  assert.equal(result.flows.length, 1);
  assert.equal(result.flows[0].partnerCode, 156);
  assert.equal(result.total, 100);
});

test('buildFlows reports unplaceable partners rather than dropping them', () => {
  // "Other Asia, nes" has no coordinate. It is frequently the largest line, so
  // it must remain visible to the caller even though no arc can be drawn.
  const rows = [
    { ...ROW, partnerCode: 490, valueUsd: 17_283_314_290 },
    { ...ROW, partnerCode: 156, valueUsd: 16_816_793_018 },
  ];
  const result = buildFlows({ rows, flow: 'M', positionOf, interpret });
  assert.equal(result.flows.length, 1);
  assert.equal(result.unplaceable.length, 1);
  assert.equal(result.unplaceable[0].area.name, 'Other Asia, nes');
  assert.equal(result.unplaceable[0].row.valueUsd, 17_283_314_290);
  // Only placed flows contribute to the drawn total.
  assert.equal(result.total, 16_816_793_018);
});

test('buildFlows sorts by value and honours the limit', () => {
  const rows = [
    { ...ROW, partnerCode: 392, valueUsd: 50 },
    { ...ROW, partnerCode: 156, valueUsd: 500 },
  ];
  const result = buildFlows({ rows, flow: 'M', positionOf, interpret, limit: 1 });
  assert.equal(result.flows.length, 1);
  assert.equal(result.flows[0].valueUsd, 500, 'the largest flow must survive the cut');
});

test('buildFlows carries the association and caveat onto each flow', () => {
  const rows = [{ ...ROW, partnerCode: 156, valueUsd: 100 }];
  const [flow] = buildFlows({ rows, flow: 'M', positionOf, interpret }).flows;
  assert.equal(flow.association, AssociationClass.VERIFIED);
  assert.equal(flow.caveat, null);
  assert.equal(flow.isReported, true);
  assert.ok(flow.id.includes('8542'));
});
