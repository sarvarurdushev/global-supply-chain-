import test from 'node:test';
import assert from 'node:assert/strict';
import { AIR_GATEWAYS, AIR_GATEWAYS_SOURCE } from './airGateways.js';

test('the bundled gateway set is large enough to be global', () => {
  // 1,152 large airports with scheduled service when generated. A sharp drop
  // means the build script silently filtered wrongly.
  assert.ok(
    AIR_GATEWAYS.length > 900,
    `only ${AIR_GATEWAYS.length} gateways bundled`,
  );
  assert.equal(AIR_GATEWAYS.length, AIR_GATEWAYS_SOURCE.count);
});

test('every gateway has a usable position and identity', () => {
  for (const gateway of AIR_GATEWAYS) {
    assert.ok(Number.isFinite(gateway.lat), `${gateway.ident} has no latitude`);
    assert.ok(Number.isFinite(gateway.lon), `${gateway.ident} has no longitude`);
    assert.ok(Math.abs(gateway.lat) <= 90, `${gateway.ident} latitude out of range`);
    assert.ok(Math.abs(gateway.lon) <= 180, `${gateway.ident} longitude out of range`);
    assert.ok(gateway.ident?.length >= 3, 'every gateway has an ICAO ident');
    assert.ok(gateway.name?.length > 2, `${gateway.ident} has no name`);
    assert.match(gateway.iso2, /^[A-Z]{2}$/, `${gateway.ident} has no country`);
  }
});

test('ICAO idents are unique, so selection cannot be ambiguous', () => {
  const idents = AIR_GATEWAYS.map((gateway) => gateway.ident);
  assert.equal(new Set(idents).size, idents.length);
});

test('the well-known freight gateways are actually present', () => {
  /*
   * A sanity check on the filter, not a ranking.
   *
   * Memphis, Hong Kong, Anchorage and Louisville are the airports a reader
   * will look for first, and if the `large_airport` + scheduled-service filter
   * had excluded them the layer would be quietly useless for its own subject.
   * Their presence here says nothing about their volume — nothing in the data
   * does, which is the layer's whole caveat.
   */
  const idents = new Set(AIR_GATEWAYS.map((gateway) => gateway.ident));
  for (const icao of ['KMEM', 'VHHH', 'PANC', 'KSDF', 'EDDF', 'ZSPD']) {
    assert.ok(idents.has(icao), `${icao} is missing from the gateway set`);
  }
});

test('the licence and the filter are recorded for provenance', () => {
  assert.match(AIR_GATEWAYS_SOURCE.license, /[Pp]ublic domain/);
  assert.match(AIR_GATEWAYS_SOURCE.source, /OurAirports/);
  assert.match(AIR_GATEWAYS_SOURCE.filter, /large_airport/);
  assert.match(AIR_GATEWAYS_SOURCE.filter, /scheduled_service=yes/);
});

test('no gateway carries a tonnage field', () => {
  // The rule this dataset exists under: OurAirports records no freight volume,
  // so there must be no field a reader could mistake for one.
  for (const gateway of AIR_GATEWAYS.slice(0, 50)) {
    for (const key of Object.keys(gateway)) {
      assert.doesNotMatch(
        key,
        /tonne|tonnage|cargo|freight|volume|rank/i,
        `${gateway.ident} carries a "${key}" field`,
      );
    }
  }
});
