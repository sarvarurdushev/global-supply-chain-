import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REEXPORT_HUBS,
  PRODUCTION_INDICATORS,
  productionProxy,
  classifyStructure,
  reportersAtRisk,
} from './production.js';
import { DataClass } from './provenance.js';

const PLACES = {
  410: { iso3: 'KOR', name: 'South Korea', lat: 36.4, lon: 128.1 },
  156: { iso3: 'CHN', name: 'China', lat: 32.5, lon: 106.3 },
  528: { iso3: 'NLD', name: 'Netherlands', lat: 52.4, lon: 5.6 },
  392: { iso3: 'JPN', name: 'Japan', lat: 36.5, lon: 139.0 },
};
const resolve = (code) => PLACES[code] ?? null;
const interpret = (code) => ({ name: PLACES[code]?.name ?? `area ${code}`, isAggregate: false });

const row = (reporterCode, valueUsd, extra = {}) => ({
  reporterCode,
  partnerCode: 0,
  valueUsd,
  netWeightKg: 1000,
  isReported: true,
  ...extra,
});

const base = {
  interpret,
  resolve,
  commodityLabel: 'Semiconductors',
  period: 2023,
  retrievedAt: '2026-09-16T00:00:00Z',
};

test('productionProxy ranks exporters and computes concentration', () => {
  const result = productionProxy({
    ...base,
    rows: [row(156, 300), row(410, 200), row(392, 100)],
  });
  assert.equal(result.producers.length, 3);
  assert.equal(result.producers[0].name, 'China');
  assert.equal(result.totalUsd, 600);
  assert.ok(Math.abs(result.producers[0].share - 0.5) < 1e-12);
  assert.ok(result.concentration.hhi.value > 0);
  assert.ok(result.concentration.cr4.value > 0);
});

test('productionProxy ignores rows that are not exports to World', () => {
  // Partner 0 is "all partners"; a bilateral row would double count.
  const result = productionProxy({
    ...base,
    rows: [row(156, 300), { ...row(410, 200), partnerCode: 392 }],
  });
  assert.equal(result.producers.length, 1);
  assert.equal(result.totalUsd, 300);
});

test('the basis is labelled as a proxy, never as production', () => {
  const result = productionProxy({ ...base, rows: [row(156, 100)] });
  assert.equal(result.basis, 'EXPORT_VALUE_PROXY');
  assert.equal(result.provenance.dataClass, DataClass.INFERRED);
  assert.equal(result.provenance.badge, '🟡 INFERRED');
  assert.match(result.provenance.method, /PROXY for production/);
  assert.match(result.provenance.method, /No production data is used/);
});

test('every distortion of the export proxy is disclosed', () => {
  const result = productionProxy({ ...base, rows: [row(156, 100)] });
  const limits = result.provenance.limitations;
  assert.ok(limits.some((l) => /THIS IS EXPORTS, NOT PRODUCTION/.test(l)));
  assert.ok(limits.some((l) => /Re-export hubs appear as producers/.test(l)));
  assert.ok(
    limits.some((l) => /Domestic consumption is invisible/.test(l)),
    'the largest distortion for food and energy must be named',
  );
  assert.ok(limits.some((l) => /Value is not volume/.test(l)));
  assert.ok(
    limits.some((l) => /Taiwan does not report/.test(l)),
    'the absent major producer must be named',
  );
});

test('re-export hubs in the top ranks are flagged individually', () => {
  const result = productionProxy({
    ...base,
    rows: [row(156, 500), row(528, 300), row(410, 200)],
  });
  const flagged = result.reexportFlags;
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].iso3, 'NLD');
  assert.match(flagged[0].note, /Rotterdam/);
  // The flag is a warning, not a correction: the value is left untouched.
  const netherlands = result.producers.find((p) => p.iso3 === 'NLD');
  assert.equal(netherlands.valueUsd, 300);
});

test('a re-export hub below one percent is not flagged as noise', () => {
  const result = productionProxy({
    ...base,
    rows: [row(156, 10_000), row(528, 50)],
  });
  assert.equal(result.reexportFlags.length, 0);
});

test('unplaceable reporters are kept separately, not dropped', () => {
  const result = productionProxy({
    ...base,
    rows: [row(156, 300), row(999, 100)],
  });
  assert.equal(result.producers.length, 1);
  assert.equal(result.unplaceable.length, 1);
  assert.equal(result.unplaceable[0].valueUsd, 100);
  // Unplaceable values still count toward the total, so shares stay honest.
  assert.equal(result.totalUsd, 400);
});

test('an empty result reports a concentration gap rather than zero', () => {
  const result = productionProxy({ ...base, rows: [] });
  assert.deepEqual(result.producers, []);
  assert.equal(result.concentration.hhi.value, null);
  assert.match(result.concentration.hhi.interpretation, /DATA UNAVAILABLE/);
});

test('productionProxy validates its arguments', () => {
  assert.throws(() => productionProxy({ ...base, rows: 'nope' }), TypeError);
  assert.throws(
    () => productionProxy({ ...base, rows: [], interpret: null }),
    TypeError,
  );
});

test('REEXPORT_HUBS names the documented entrepots with reasons', () => {
  for (const iso3 of ['NLD', 'SGP', 'HKG']) {
    assert.ok(REEXPORT_HUBS.has(iso3), iso3);
    assert.ok(REEXPORT_HUBS.get(iso3).length > 30, `${iso3} needs a real explanation`);
  }
  // Conservative by design: a long list would be asserting more than we know.
  assert.ok(REEXPORT_HUBS.size <= 10);
});

test('PRODUCTION_INDICATORS carry a unit and a reading', () => {
  assert.ok(PRODUCTION_INDICATORS.length >= 4);
  for (const indicator of PRODUCTION_INDICATORS) {
    assert.match(indicator.code, /^[A-Z0-9.]+$/);
    assert.ok(indicator.label.length > 0);
    assert.ok(indicator.unit.length > 0, `${indicator.code} needs a unit`);
    assert.ok(indicator.reads.length > 0, `${indicator.code} needs a reading`);
  }
});

/* ---------------- classifyStructure ---------------- */

test('classifyStructure identifies energy and resource exporters', () => {
  const energy = classifyStructure({ 'TX.VAL.FUEL.ZS.UN': 78, 'NV.IND.MANF.ZS': 8 });
  assert.equal(energy.structure, 'ENERGY_EXPORTER');
  assert.match(energy.basis, /78%/);
  assert.equal(energy.confident, true);

  const ores = classifyStructure({ 'TX.VAL.MMTL.ZS.UN': 42, 'NV.IND.MANF.ZS': 6 });
  assert.equal(ores.structure, 'RESOURCE_EXPORTER');
});

test('classifyStructure separates advanced from basic manufacturing', () => {
  const advanced = classifyStructure({
    'NV.IND.MANF.ZS': 25,
    'TX.VAL.TECH.MF.ZS': 35,
  });
  assert.equal(advanced.structure, 'ADVANCED_MANUFACTURING');
  assert.match(advanced.basis, /high-tech 35%/);

  const basic = classifyStructure({ 'NV.IND.MANF.ZS': 20, 'TX.VAL.TECH.MF.ZS': 5 });
  assert.equal(basic.structure, 'MANUFACTURING');
});

test('the residual bucket is marked as a weaker claim', () => {
  const mixed = classifyStructure({ 'NV.IND.MANF.ZS': 8, 'TX.VAL.FUEL.ZS.UN': 3 });
  assert.equal(mixed.structure, 'SERVICES_OR_MIXED');
  assert.equal(mixed.confident, false, 'the residual bucket is not a positive finding');
});

test('no indicators means UNKNOWN, not a guess', () => {
  const none = classifyStructure({});
  assert.equal(none.structure, 'UNKNOWN');
  assert.equal(none.confident, false);
  assert.match(none.basis, /No structural indicators/);

  const nulls = classifyStructure({ 'NV.IND.MANF.ZS': null, 'TX.VAL.FUEL.ZS.UN': null });
  assert.equal(nulls.structure, 'UNKNOWN');
});

test('energy dominance outranks manufacturing when both are present', () => {
  // A petrostate with some manufacturing is still classified by its exports.
  const both = classifyStructure({ 'TX.VAL.FUEL.ZS.UN': 60, 'NV.IND.MANF.ZS': 18 });
  assert.equal(both.structure, 'ENERGY_EXPORTER');
});

test('a capped upstream page is declared incomplete, not presented as whole', () => {
  const rows = [
    {
      reporterCode: 410,
      partnerCode: 0,
      valueUsd: 100,
      netWeightKg: null,
      isReported: true,
    },
  ];
  const result = productionProxy({
    rows,
    interpret: () => ({ name: 'Korea', isGroup: false }),
    resolve: () => ({ iso3: 'KOR', name: 'South Korea', lat: 37, lon: 127 }),
    commodityLabel: 'Semiconductors',
    period: 2023,
    retrievedAt: '2026-09-16T00:00:00Z',
    incompleteReporters: ['China', 'Germany'],
  });
  assert.deepEqual([...result.incompleteReporters], ['China', 'Germany']);
  const note = result.provenance.limitations.find((l) =>
    l.startsWith('INCOMPLETE for'),
  );
  assert.ok(note, 'the ranking must say which reporters are partial');
  assert.match(note, /China, Germany/);
});

test('a complete ranking claims no incompleteness', () => {
  const result = productionProxy({
    rows: [],
    interpret: () => ({ name: 'x', isGroup: false }),
    resolve: () => null,
    commodityLabel: 'Semiconductors',
    period: 2023,
    retrievedAt: '2026-09-16T00:00:00Z',
  });
  assert.equal(result.incompleteReporters.length, 0);
  assert.ok(
    !result.provenance.limitations.some((l) => l.startsWith('INCOMPLETE for')),
  );
});

test('reporters that never arrived are named as missing, not treated as zero', () => {
  const result = productionProxy({
    rows: [
      {
        reporterCode: 410,
        partnerCode: 0,
        valueUsd: 100,
        netWeightKg: null,
        isReported: true,
      },
    ],
    interpret: () => ({ name: 'Korea', isGroup: false }),
    resolve: () => ({ iso3: 'KOR', name: 'South Korea', lat: 37, lon: 127 }),
    commodityLabel: 'Semiconductors',
    period: 2023,
    retrievedAt: '2026-09-16T00:00:00Z',
    unretrievedReporterCount: 30,
  });
  assert.equal(result.unretrievedReporterCount, 30);
  const note = result.provenance.limitations.find((l) =>
    l.includes('could not'),
  );
  assert.ok(note, 'an unretrieved batch must be declared');
  assert.match(note, /absent measurement, not a zero/);
});

/* ---------------- truncation risk ----------------
 *
 * Measured against the live preview endpoint on 2026-09-16: Turkey's 2023
 * HS 8542 exports (reporter 792, partner 0) return count=500 with 500 rows
 * across 133 partner2 values — and exactly one canonical total, $33,969,993,
 * which IS in the page. Warning on truncation alone called that exact figure
 * understated.
 */

test('a complete page puts nothing at risk', () => {
  assert.deepEqual(
    reportersAtRisk({ requested: [410, 156], returned: [410], truncated: false }),
    [],
    'a reporter absent from a complete page did not report — that is the source, not us',
  );
});

test('a truncated page that still carries every total puts nothing at risk', () => {
  // The Turkey case: the page is full of breakdown slices we discard anyway.
  assert.deepEqual(
    reportersAtRisk({ requested: [792], returned: [792], truncated: true }),
    [],
  );
});

test('a truncated page missing a total puts that reporter at risk', () => {
  assert.deepEqual(
    reportersAtRisk({
      requested: [410, 156, 792],
      returned: [410],
      truncated: true,
    }),
    [156, 792],
  );
});

test('reportersAtRisk rejects a non-array request list', () => {
  assert.throws(
    () => reportersAtRisk({ requested: 410, returned: [], truncated: true }),
    /must be an array/,
  );
});
