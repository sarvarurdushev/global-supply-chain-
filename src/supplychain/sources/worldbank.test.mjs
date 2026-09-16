import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INDICATORS,
  WorldBankError,
  normalizeIndicatorResponse,
  createWorldBankSource,
} from './worldbank.js';
import { DataClass } from '../provenance.js';

/** The real response shape, captured live on 2026-09-16 for KOR GDP. */
const LIVE_PAYLOAD = [
  { page: 1, pages: 1, per_page: 200, total: 3, sourceid: '2', lastupdated: '2026-07-13' },
  [
    {
      indicator: { id: 'NY.GDP.MKTP.CD', value: 'GDP (current US$)' },
      country: { id: 'KR', value: 'Korea, Rep.' },
      countryiso3code: 'KOR',
      date: '2025',
      value: 1872374961553.15,
    },
    {
      indicator: { id: 'NY.GDP.MKTP.CD', value: 'GDP (current US$)' },
      country: { id: 'KR', value: 'Korea, Rep.' },
      countryiso3code: 'KOR',
      date: '2024',
      value: 1875388209406.8,
    },
    {
      indicator: { id: 'NY.GDP.MKTP.CD', value: 'GDP (current US$)' },
      country: { id: 'KR', value: 'Korea, Rep.' },
      countryiso3code: 'KOR',
      date: '2023',
      value: 1844800934391.54,
    },
  ],
];

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => payload };
}

test('INDICATORS carry both a code and a unit', () => {
  for (const [key, indicator] of Object.entries(INDICATORS)) {
    assert.ok(indicator.code, `${key} needs a code`);
    assert.ok(indicator.label, `${key} needs a label`);
    // Unit matters: mixing current and constant US$ produces a nonsense series.
    assert.ok(indicator.unit, `${key} needs a unit`);
    assert.ok(Object.isFrozen(indicator));
  }
  assert.equal(INDICATORS.GDP_CURRENT_USD.code, 'NY.GDP.MKTP.CD');
  assert.equal(INDICATORS.GDP_CURRENT_USD.unit, 'current US$');
});

test('normalizeIndicatorResponse handles the two-element envelope', () => {
  const { observations, pagination, dropped } = normalizeIndicatorResponse(LIVE_PAYLOAD);
  assert.equal(observations.length, 3);
  assert.equal(dropped, 0);
  // Ascending by year, because every consumer is a time series.
  assert.deepEqual(observations.map((o) => o.year), [2023, 2024, 2025]);
  assert.equal(observations[0].iso3, 'KOR');
  assert.equal(observations[0].value, 1844800934391.54);
  assert.equal(pagination.lastUpdated, '2026-07-13');
  assert.ok(Object.isFrozen(observations[0]));
});

test('null observations are dropped, never coerced to zero', () => {
  // A missing GDP figure is not a GDP of zero.
  const payload = [
    LIVE_PAYLOAD[0],
    [
      { ...LIVE_PAYLOAD[1][0], value: null },
      { ...LIVE_PAYLOAD[1][1], value: undefined },
      LIVE_PAYLOAD[1][2],
    ],
  ];
  const { observations, dropped } = normalizeIndicatorResponse(payload);
  assert.equal(observations.length, 1);
  assert.equal(dropped, 2);
  assert.equal(observations[0].value, 1844800934391.54);
});

test('normalizeIndicatorResponse rejects malformed envelopes', () => {
  assert.throws(() => normalizeIndicatorResponse(null), WorldBankError);
  assert.throws(() => normalizeIndicatorResponse([{}]), WorldBankError);
  assert.throws(() => normalizeIndicatorResponse([{}, 'nope']), WorldBankError);
  // The API reports query errors inside the metadata element.
  assert.throws(
    () => normalizeIndicatorResponse([{ message: [{ key: 'Invalid value' }] }, []]),
    /World Bank rejected the query/,
  );
});

test('rows with a non-integer date are dropped', () => {
  const payload = [LIVE_PAYLOAD[0], [{ ...LIVE_PAYLOAD[1][0], date: '2020Q1' }]];
  const { observations, dropped } = normalizeIndicatorResponse(payload);
  assert.equal(observations.length, 0);
  assert.equal(dropped, 1);
});

test('getIndicator builds a valid URL and returns provenance', async () => {
  let requested = null;
  const source = createWorldBankSource({
    fetchImpl: async (url) => {
      requested = url;
      return jsonResponse(LIVE_PAYLOAD);
    },
    now: () => '2026-09-16T00:00:00Z',
  });
  const result = await source.getIndicator({
    iso3: 'KOR',
    indicator: INDICATORS.GDP_CURRENT_USD.code,
    startYear: 2015,
    endYear: 2025,
  });
  assert.match(requested, /\/country\/KOR\/indicator\/NY\.GDP\.MKTP\.CD/);
  assert.match(requested, /date=2015%3A2025/);
  assert.match(requested, /format=json/);
  assert.equal(result.observations.length, 3);
  assert.equal(result.provenance.dataClass, DataClass.HISTORICAL);
  assert.match(result.provenance.license, /CC BY 4\.0/);
  assert.equal(result.provenance.observedAt, '2025-12-31');
});

test('World Bank data can never be classed LIVE', async () => {
  const source = createWorldBankSource({
    fetchImpl: async () => jsonResponse(LIVE_PAYLOAD),
    now: () => '2026-09-16T00:00:00Z',
  });
  const result = await source.getIndicator({
    iso3: 'KOR',
    indicator: INDICATORS.GDP_CURRENT_USD.code,
  });
  assert.notEqual(result.provenance.dataClass, DataClass.LIVE);
  assert.equal(result.provenance.badge, '🔵 HISTORICAL');
});

test('getIndicator accepts several economies at once', async () => {
  let requested = null;
  const source = createWorldBankSource({
    fetchImpl: async (url) => {
      requested = url;
      return jsonResponse(LIVE_PAYLOAD);
    },
  });
  await source.getIndicator({
    iso3: ['KOR', 'JPN', 'CHN'],
    indicator: INDICATORS.GDP_CURRENT_USD.code,
  });
  assert.match(requested, /\/country\/KOR;JPN;CHN\//);
});

test('getIndicator refuses codes that could be injected into the upstream path', async () => {
  const source = createWorldBankSource({ fetchImpl: async () => jsonResponse(LIVE_PAYLOAD) });
  await assert.rejects(
    () => source.getIndicator({ iso3: '../../admin', indicator: 'NY.GDP.MKTP.CD' }),
    TypeError,
  );
  await assert.rejects(
    () => source.getIndicator({ iso3: 'KOR', indicator: 'NY.GDP.MKTP.CD?evil=1' }),
    TypeError,
  );
  await assert.rejects(() => source.getIndicator({ iso3: [], indicator: 'X' }), TypeError);
  await assert.rejects(
    () =>
      source.getIndicator({
        iso3: 'KOR',
        indicator: 'NY.GDP.MKTP.CD',
        startYear: 2025,
        endYear: 2015,
      }),
    TypeError,
  );
});

test('getIndicator surfaces HTTP failures with retryability', async () => {
  const source = createWorldBankSource({
    fetchImpl: async () => jsonResponse({}, { ok: false, status: 503 }),
  });
  await assert.rejects(
    () => source.getIndicator({ iso3: 'KOR', indicator: 'NY.GDP.MKTP.CD' }),
    (error) => {
      assert.ok(error instanceof WorldBankError);
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

test('a truncated series says so in its limitations', async () => {
  const source = createWorldBankSource({
    fetchImpl: async () =>
      jsonResponse([{ page: 1, pages: 4, per_page: 2, total: 8 }, LIVE_PAYLOAD[1]]),
  });
  const result = await source.getIndicator({ iso3: 'KOR', indicator: 'NY.GDP.MKTP.CD' });
  assert.ok(
    result.provenance.limitations.some((l) => /series is truncated/i.test(l)),
    'a partial page must be disclosed',
  );
});

test('dropped observations are disclosed in limitations', async () => {
  const source = createWorldBankSource({
    fetchImpl: async () =>
      jsonResponse([LIVE_PAYLOAD[0], [{ ...LIVE_PAYLOAD[1][0], value: null }]]),
  });
  const result = await source.getIndicator({ iso3: 'KOR', indicator: 'NY.GDP.MKTP.CD' });
  assert.equal(result.dropped, 1);
  assert.ok(
    result.provenance.limitations.some((l) => /rather than treated as zero/.test(l)),
  );
});
