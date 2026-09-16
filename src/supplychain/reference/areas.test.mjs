import test from 'node:test';
import assert from 'node:assert/strict';
import { REPORTERS, PARTNERS } from './comtradeAreas.js';
import {
  WORLD_CODE,
  OTHER_ASIA_NES_CODE,
  reporter,
  reporterByIso3,
  partner,
  isReporter,
  isAggregatePartner,
  isDefunctArea,
  interpretArea,
  partitionPartners,
} from './areas.js';
import { AssociationClass } from '../provenance.js';

test('the generated tables are populated and well-formed', () => {
  assert.ok(REPORTERS.length > 200, `expected 200+ reporters, got ${REPORTERS.length}`);
  assert.ok(PARTNERS.length > 250, `expected 250+ partners, got ${PARTNERS.length}`);
  for (const r of REPORTERS) {
    assert.ok(Number.isInteger(r.code), `reporter code: ${r.code}`);
    assert.ok(r.name.length > 0);
    // Most reporters carry a real ISO3, but Comtrade retains defunct entities
    // (Tanganyika, Peninsula Malaysia) under placeholder codes such as "_PM".
    if (!/\(\.\.\.\d{4}\)/.test(r.name)) {
      assert.match(r.iso3, /^[A-Z]{3}$/, `current reporter iso3: ${r.name}`);
    }
  }
  // Codes must be unique, or lookups silently pick one arbitrarily.
  assert.equal(new Set(REPORTERS.map((r) => r.code)).size, REPORTERS.length);
  assert.equal(new Set(PARTNERS.map((p) => p.code)).size, PARTNERS.length);
});

test('known area codes resolve to the right countries', () => {
  assert.equal(reporter(410).iso3, 'KOR');
  assert.equal(reporter(410).name, 'Rep. of Korea');
  assert.equal(reporter(156).iso3, 'CHN');
  assert.equal(reporter(392).iso3, 'JPN');
  assert.equal(reporter(704).iso3, 'VNM');
  assert.equal(reporterByIso3('KOR').code, 410);
  assert.equal(reporterByIso3('NLD').code, 528);
  assert.equal(reporter(999999), undefined);
  assert.equal(reporterByIso3('XXX'), undefined);
});

test('Taiwan is not a Comtrade reporter but is a listed partner', () => {
  // This is the finding that shapes the whole semiconductor analysis.
  assert.equal(isReporter(158), false, 'Taiwan must not appear as a reporter');
  assert.equal(reporter(158), undefined);
  const asPartner = partner(158);
  assert.ok(asPartner, 'Taiwan must exist as a partner area');
  assert.equal(asPartner.iso3, 'TWN');
  assert.match(asPartner.name, /Taiwan/);
});

test('Other Asia, nes is interpreted as an inference with its evidence', () => {
  const area = interpretArea(OTHER_ASIA_NES_CODE);
  assert.equal(area.code, 490);
  assert.equal(area.isAggregate, true);
  // Crucially NOT verified: the data does not say "Taiwan".
  assert.equal(area.association, AssociationClass.INFERRED);
  assert.equal(area.likelyMeans, 'Taiwan');
  assert.match(area.caveat, /inference, not a statement by the data/);
  assert.ok(area.evidence.length >= 3);
  assert.ok(area.evidence.some((e) => /absent from the UN Comtrade reporter list/.test(e)));
});

test('individual countries are verified, aggregates are not', () => {
  const korea = interpretArea(410);
  assert.equal(korea.association, AssociationClass.VERIFIED);
  assert.equal(korea.isAggregate, false);
  assert.equal(korea.caveat, null);

  const world = interpretArea(WORLD_CODE);
  assert.equal(world.isAggregate, true);
  assert.equal(world.association, AssociationClass.INFERRED);
  assert.match(world.caveat, /Do not sum it alongside individual countries/);
});

test('an unrecognised code is UNKNOWN rather than silently accepted', () => {
  const unknown = interpretArea(999999);
  assert.equal(unknown.association, AssociationClass.UNKNOWN);
  assert.match(unknown.caveat, /not in the Comtrade reference table/);
  assert.equal(unknown.iso3, null);
});

test('aggregate detection covers World, Other Asia nes and grouped areas', () => {
  assert.equal(isAggregatePartner(WORLD_CODE), true);
  assert.equal(isAggregatePartner(OTHER_ASIA_NES_CODE), true);
  assert.equal(isAggregatePartner(410), false);
  assert.equal(isAggregatePartner(156), false);
  // Every ", nes" residual bucket is an aggregate.
  const nes = PARTNERS.filter((p) => /,\s*nes$/i.test(p.name));
  assert.equal(nes.length, 16, 'expected 16 "nes" residual areas');
  for (const g of nes) assert.equal(isAggregatePartner(g.code), true, g.name);
});

test('real territories with placeholder ISO codes are not aggregates', () => {
  // Kosovo (_KS) and Midway Islands (_MI) carry underscore-prefixed ISO
  // placeholders but are real areas, not residual buckets.
  const kosovo = PARTNERS.find((p) => p.iso3 === '_KS');
  const midway = PARTNERS.find((p) => p.iso3 === '_MI');
  assert.ok(kosovo && midway);
  assert.equal(isAggregatePartner(kosovo.code), false, 'Kosovo is not an aggregate');
  assert.equal(isAggregatePartner(midway.code), false, 'Midway is not an aggregate');
  assert.equal(interpretArea(kosovo.code).association, AssociationClass.VERIFIED);
});

test('partner ISO codes are not unique and must not be used as a key', () => {
  // Codes 473 (LAIA, nes) and 636 (Rest of America, nes) both carry "A79".
  const byIso = new Map();
  for (const p of PARTNERS) {
    if (!p.iso3) continue;
    byIso.set(p.iso3, (byIso.get(p.iso3) ?? 0) + 1);
  }
  const duplicated = [...byIso].filter(([, n]) => n > 1);
  assert.ok(duplicated.length > 0, 'expected duplicate partner ISO codes to exist');
});

test('defunct areas are flagged so a series cannot silently change meaning', () => {
  const tanganyika = PARTNERS.find((p) => /Tanganyika/.test(p.name));
  assert.ok(tanganyika);
  assert.equal(isDefunctArea(tanganyika.code), true);
  const area = interpretArea(tanganyika.code);
  assert.equal(area.isDefunct, true);
  assert.match(area.caveat, /no longer exists/);
  // A current country is not flagged.
  assert.equal(isDefunctArea(410), false);
  assert.equal(interpretArea(410).isDefunct, false);
});

test('partitionPartners separates countries, aggregates and the World total', () => {
  const rows = [
    { partnerCode: 0, valueUsd: 100 }, // World
    { partnerCode: 490, valueUsd: 40 }, // Other Asia, nes
    { partnerCode: 156, valueUsd: 35 }, // China
    { partnerCode: 392, valueUsd: 25 }, // Japan
  ];
  const { countries, aggregates, world } = partitionPartners(rows);
  assert.deepEqual(countries.map((r) => r.partnerCode), [156, 392]);
  assert.deepEqual(aggregates.map((r) => r.partnerCode), [490]);
  assert.equal(world.valueUsd, 100);
  // Summing countries alone must not accidentally include the World total.
  assert.equal(countries.reduce((s, r) => s + r.valueUsd, 0), 60);
});

test('partitionPartners tolerates a missing World row', () => {
  const { countries, aggregates, world } = partitionPartners([{ partnerCode: 156, valueUsd: 1 }]);
  assert.equal(world, null);
  assert.equal(countries.length, 1);
  assert.equal(aggregates.length, 0);
  assert.deepEqual(partitionPartners([]).countries, []);
});
