import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AVAILABILITY,
  CURATED_CASES,
  DIMENSIONS,
  buildCatalogue,
  caseFromGdacs,
  curatedCase,
  dataClassFor,
  genericZoomPath,
  investigability,
  severityRank,
} from './catalogue.js';
import { DataClass } from '../supplychain/provenance.js';

const gdacs = (overrides = {}) => ({
  id: 'gdacs:EQ:1',
  eventType: 'EQ',
  name: 'M6.2 offshore Chile',
  country: 'Chile',
  latitude: -30,
  longitude: -71,
  alertLevel: 'orange',
  affectedPopulation: 120_000,
  date: '2026-09-15',
  ...overrides,
});

test('every curated figure names who published it', () => {
  /*
   * The rule that separates a case from a card. A number with no attribution
   * on a casualty figure is the worst possible place for one.
   */
  for (const entry of CURATED_CASES) {
    for (const [group, figures] of Object.entries({
      confirmed: entry.confirmed,
      modelled: entry.modelled,
    })) {
      for (const [key, figure] of Object.entries(figures ?? {})) {
        if (!figure) continue;
        assert.ok(
          figure.source?.length > 10,
          `${entry.id} ${group}.${key} has no source`,
        );
        assert.ok(
          AVAILABILITY[figure.availability],
          `${entry.id} ${group}.${key} has no availability label`,
        );
      }
    }
    assert.ok(entry.magnitude?.source?.length > 5, `${entry.id} magnitude unsourced`);
  }
});

test('confirmed and modelled figures never share a field', () => {
  /*
   * A recorded death toll and a PAGER alert level are different kinds of
   * claim. Gorkha has both — 8,964 recorded, and a red alert meaning "1,000+
   * estimated" — and merging them would present a model as a count.
   */
  const gorkha = curatedCase('nepal-gorkha-2015');
  assert.equal(gorkha.confirmed.deaths.value, 8964);
  assert.equal(gorkha.confirmed.deaths.availability, 'CONFIRMED');
  assert.equal(gorkha.modelled.fatalityAlert.value, 'red');
  assert.equal(gorkha.modelled.fatalityAlert.availability, 'MODELLED');
  const confirmedKeys = Object.keys(gorkha.confirmed);
  const modelledKeys = Object.keys(gorkha.modelled);
  assert.equal(
    confirmedKeys.filter((key) => modelledKeys.includes(key)).length,
    0,
    'a field appears in both groups',
  );
});

test('a case states what it is worth investigating for', () => {
  for (const entry of CURATED_CASES) {
    assert.ok(entry.investigates?.length > 30, `${entry.id} has no question`);
    assert.ok(entry.whyThisCase?.length > 40, `${entry.id} does not justify itself`);
    assert.ok(entry.zoomPath.length >= 6, `${entry.id} has too shallow a descent`);
  }
});

test('a curated descent is authored, not derived from a bounding box', () => {
  // §18's ladder is only meaningful if the rungs are the places that matter.
  const gorkha = curatedCase('nepal-gorkha-2015');
  const names = gorkha.zoomPath.map((rung) => rung.name);
  assert.deepEqual(names.slice(0, 3), ['World', 'South Asia', 'Nepal']);
  assert.ok(names.includes('Kathmandu Valley'));
  assert.ok(names.includes('Langtang corridor'));
  // Altitudes must descend, or the camera climbs mid-investigation.
  const alts = gorkha.zoomPath.map((rung) => rung.altKm);
  assert.deepEqual(alts, [...alts].sort((a, b) => b - a));
  for (const rung of gorkha.zoomPath) {
    assert.ok(rung.reveals?.length > 20, `${rung.name} does not say what it reveals`);
  }
});

/* ------------------------------------------------------------------ *
 * Live cases
 * ------------------------------------------------------------------ */

test('a live case has no confirmed figures, and that is the finding', () => {
  /*
   * An event three hours old has a modelled alert and no confirmed anything.
   * Dressing it up to match a curated case would invent the parts that take
   * weeks to establish.
   */
  const live = caseFromGdacs(gdacs());
  assert.deepEqual(live.confirmed, {});
  assert.equal(live.modelled.alertLevel.value, 'orange');
  assert.equal(live.modelled.affectedPopulation.value, 120_000);
  assert.equal(live.dataAvailability.human, 'MODELLED');
  assert.equal(live.dataAvailability.economic, 'UNAVAILABLE');
  assert.equal(live.isLive, true);
});

test('a hazard type the registry does not model is dropped, not guessed at', () => {
  assert.equal(caseFromGdacs(gdacs({ eventType: 'XX' })), null);
  assert.equal(caseFromGdacs(gdacs({ eventType: null })), null);
  assert.equal(caseFromGdacs(null), null);
});

test('a live case with no position cannot be entered', () => {
  /*
   * A ladder with no rungs would fly the camera to nowhere and look broken,
   * so the case is listed and marked unenterable instead.
   */
  assert.equal(genericZoomPath({ latitude: null, longitude: 1 }), null);
  const { cases } = buildCatalogue({
    liveRecords: [gdacs({ latitude: null, longitude: null })],
  });
  const live = cases.find((entry) => entry.isLive);
  assert.equal(live.zoomPath, null);
  assert.equal(live.enterable, false);
});

test('a generic ladder admits that it is generic', () => {
  const path = genericZoomPath(gdacs());
  const noted = path.filter((rung) => rung.note);
  assert.ok(noted.length >= 2, 'derived rungs should say they were derived');
  assert.match(noted.map((r) => r.note).join(' '), /derived|no authored|feed position/i);
});

/* ------------------------------------------------------------------ *
 * Ordering and availability
 * ------------------------------------------------------------------ */

test('severity states the basis it ranked on', () => {
  // A single ordering over incomparable hazards is a convenience, not a
  // measurement, so it says which figure it used.
  const gorkha = severityRank(curatedCase('nepal-gorkha-2015'));
  assert.equal(gorkha.basis, 'confirmed deaths');
  const live = severityRank(caseFromGdacs(gdacs()));
  assert.equal(live.basis, 'modelled alert level');
  const bare = severityRank(caseFromGdacs(gdacs({ alertLevel: null, affectedPopulation: null })));
  assert.equal(bare.score, 0);
  assert.match(bare.basis, /no severity figure/);
});

test('a confirmed toll always outranks a modelled alert', () => {
  const confirmed = severityRank(curatedCase('nepal-gorkha-2015')).score;
  const modelled = severityRank(caseFromGdacs(gdacs({ alertLevel: 'red' }))).score;
  assert.ok(confirmed > modelled);
});

test('curated cases lead the list regardless of live severity', () => {
  /*
   * A week of green GDACS alerts would otherwise bury the only cases that can
   * carry a full investigation, and the platform would look empty.
   */
  const { cases, counts } = buildCatalogue({
    liveRecords: [gdacs({ alertLevel: 'red', affectedPopulation: 9_000_000 })],
  });
  assert.equal(counts.curated, 2);
  assert.equal(counts.live, 1);
  assert.ok(!cases[0].isLive);
  assert.ok(!cases[1].isLive);
  assert.ok(cases[2].isLive);
});

test('investigability is computed from the dimensions, not asserted', () => {
  const gorkha = investigability(curatedCase('nepal-gorkha-2015'));
  assert.equal(gorkha.total, DIMENSIONS.length);
  assert.equal(gorkha.supported, DIMENSIONS.length);
  assert.match(gorkha.summary, /Every dimension has a source/);

  const flood = investigability(curatedCase('bhote-koshi-2026'));
  assert.ok(flood.supported < flood.total, 'the flood has real gaps');
  assert.match(flood.summary, /unavailable/);
  const unavailable = flood.dimensions.filter(
    (d) => d.availability === AVAILABILITY.UNAVAILABLE,
  );
  assert.ok(unavailable.some((d) => d.id === 'human'));
});

test('filters narrow by hazard and country', () => {
  const byHazard = buildCatalogue({ hazardFilter: 'flood' });
  assert.ok(byHazard.cases.every((entry) => entry.hazardId === 'flood'));
  const byCountry = buildCatalogue({ countryFilter: 'nepal' });
  assert.equal(byCountry.cases.length, 2, 'case-insensitive country match');
  assert.equal(buildCatalogue({ hazardFilter: 'tornado' }).cases.length, 0);
});

test('availability maps onto the existing provenance vocabulary', () => {
  // One mapping rather than two that drift apart.
  assert.equal(dataClassFor(AVAILABILITY.LIVE), DataClass.LIVE);
  assert.equal(dataClassFor(AVAILABILITY.CONFIRMED), DataClass.HISTORICAL);
  assert.equal(dataClassFor(AVAILABILITY.MODELLED), DataClass.SIMULATED);
  assert.equal(dataClassFor(AVAILABILITY.ESTIMATED), DataClass.INFERRED);
  assert.equal(dataClassFor(AVAILABILITY.UNAVAILABLE), DataClass.UNKNOWN);
  assert.equal(dataClassFor('nonsense'), DataClass.UNKNOWN);
});
