import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRIES } from './countries.js';
import { MAJOR_PORTS } from './ports.js';
import {
  CHOKEPOINTS,
  CHOKEPOINT_PROVENANCE,
  chokepoint,
  chokepointsWithoutAlternative,
} from './chokepoints.js';
import { validatePoint } from '../geo.js';
import { DataClass } from '../provenance.js';
import { REPORTERS } from './comtradeAreas.js';

test('every country carries a valid position', () => {
  assert.ok(COUNTRIES.length > 150, `expected 150+ countries, got ${COUNTRIES.length}`);
  for (const country of COUNTRIES) {
    assert.match(country.iso3, /^[A-Z]{3}$/, country.name);
    assert.doesNotThrow(
      () => validatePoint({ lat: country.lat, lon: country.lon }),
      `${country.name} position`,
    );
  }
  // Codes must be unique or lookups resolve arbitrarily.
  assert.equal(new Set(COUNTRIES.map((c) => c.iso3)).size, COUNTRIES.length);
});

test('country label points land in plausible places', () => {
  // Spot-check a few against their well-known locations. These use Natural
  // Earth's cartographer-placed anchors, not computed centroids, so they should
  // sit on land in a sensible spot.
  const check = (iso3, lat, lon, tolerance = 6) => {
    const c = COUNTRIES.find((x) => x.iso3 === iso3);
    assert.ok(c, `${iso3} missing`);
    assert.ok(Math.abs(c.lat - lat) < tolerance, `${iso3} lat ${c.lat} vs ${lat}`);
    assert.ok(Math.abs(c.lon - lon) < tolerance, `${iso3} lon ${c.lon} vs ${lon}`);
  };
  check('KOR', 36.4, 128.1);
  check('JPN', 36.5, 139.0, 8);
  check('NLD', 52.4, 5.6);
  check('BRA', -10.0, -52.0, 10);
});

test('country M49 codes agree with the Comtrade reporter table', () => {
  const byIso = new Map(REPORTERS.map((r) => [r.iso3, r.code]));
  let matched = 0;
  for (const country of COUNTRIES) {
    if (country.m49 === null) continue;
    assert.equal(country.m49, byIso.get(country.iso3), country.iso3);
    matched += 1;
  }
  assert.ok(matched > 140, `expected 140+ mapped reporters, got ${matched}`);
});

test('Taiwan is present geographically but has no Comtrade reporter code', () => {
  // The gap that shapes the semiconductor analysis: Taiwan exists on the map
  // and does not report trade.
  const taiwan = COUNTRIES.find((c) => c.iso3 === 'TWN');
  assert.ok(taiwan, 'Taiwan must be in the country table');
  assert.equal(taiwan.m49, null, 'Taiwan must not carry a reporter code');
  assert.doesNotThrow(() => validatePoint({ lat: taiwan.lat, lon: taiwan.lon }));
});

test('every port carries a valid position and harbour class', () => {
  assert.ok(MAJOR_PORTS.length > 300, `expected 300+ ports, got ${MAJOR_PORTS.length}`);
  for (const port of MAJOR_PORTS) {
    assert.doesNotThrow(
      () => validatePoint({ lat: port.lat, lon: port.lon }),
      `${port.name} position`,
    );
    assert.ok(['L', 'M'].includes(port.size), `${port.name} size ${port.size}`);
    assert.ok(port.name.length > 0);
  }
  assert.equal(new Set(MAJOR_PORTS.map((p) => p.id)).size, MAJOR_PORTS.length);
});

test('major ports resolve by UN/LOCODE', () => {
  const byCode = (code) => MAJOR_PORTS.find((p) => p.unlocode === code);
  assert.equal(byCode('KRPUS')?.name, 'Busan');
  assert.equal(byCode('NLRTM')?.name, 'Rotterdam');
  assert.equal(byCode('CNSGH')?.name, 'Shanghai');
  // UN/LOCODE is 86% populated upstream, so some ports legitimately lack one.
  const withCode = MAJOR_PORTS.filter((p) => p.unlocode !== null).length;
  assert.ok(withCode / MAJOR_PORTS.length > 0.7);
});

test('port records omit the unreliable cargo facility fields', () => {
  // WPI's cargo flags are ~1% populated. Carrying them would let a caller read
  // an absent value as a negative one.
  for (const port of MAJOR_PORTS.slice(0, 20)) {
    assert.equal('loContainer' in port, false);
    assert.equal('loOilTerm' in port, false);
    assert.equal('loSolidBulk' in port, false);
    assert.equal('cranesContainer' in port, false);
  }
});

test('port rail status distinguishes unknown from absent', () => {
  for (const port of MAJOR_PORTS) {
    assert.ok(['Y', 'N', 'U'].includes(port.rail), `${port.name} rail ${port.rail}`);
  }
  // Roughly half of WPI rows are 'U'; the value must survive as unknown.
  const unknown = MAJOR_PORTS.filter((p) => p.rail === 'U').length;
  assert.ok(unknown > 0, 'unknown rail status must be represented, not coerced');
});

test('every chokepoint carries geography and a source citation', () => {
  assert.ok(CHOKEPOINTS.length >= 8, `expected 8+ chokepoints, got ${CHOKEPOINTS.length}`);
  for (const point of CHOKEPOINTS) {
    assert.doesNotThrow(
      () => validatePoint({ lat: point.lat, lon: point.lon }),
      `${point.name} position`,
    );
    assert.ok(point.connects.length >= 2, `${point.name} must connect two waters`);
    assert.ok(point.borderingCountries.length >= 1, point.name);
    assert.ok(point.significance.length > 40, `${point.name} needs a real explanation`);
    assert.ok(point.sources.length >= 1, `${point.name} needs a citation`);
  }
  assert.equal(new Set(CHOKEPOINTS.map((c) => c.id)).size, CHOKEPOINTS.length);
});

test('chokepoint quantities are null rather than remembered numbers', () => {
  // The discipline that keeps this dataset honest: we have the geography, we do
  // not have the transit volumes, and we say so rather than inventing them.
  for (const point of CHOKEPOINTS) {
    assert.equal(point.transitVolume, null, `${point.name} must not assert a volume`);
  }
  assert.ok(
    CHOKEPOINT_PROVENANCE.limitations.some((l) => /Transit volumes/.test(l)),
    'the provenance must disclose the missing quantities',
  );
});

test('chokepoint provenance is HISTORICAL and states its simplification', () => {
  assert.equal(CHOKEPOINT_PROVENANCE.dataClass, DataClass.HISTORICAL);
  assert.ok(
    CHOKEPOINT_PROVENANCE.limitations.some((l) => /single coordinate is a/.test(l)),
  );
  assert.ok(
    CHOKEPOINT_PROVENANCE.limitations.some((l) => /GEOGRAPHIC/.test(l)),
    'alternatives must be flagged as geographic only',
  );
});

test('chokepoints without a maritime alternative are identified', () => {
  const critical = chokepointsWithoutAlternative();
  const ids = critical.map((c) => c.id);
  // Hormuz, the Turkish Straits and the Danish Straits have no sea detour.
  assert.ok(ids.includes('hormuz'), 'Hormuz has no maritime alternative');
  assert.ok(ids.includes('turkish-straits'));
  assert.ok(ids.includes('danish-straits'));
  // Suez does — the Cape.
  assert.ok(!ids.includes('suez'));
  assert.ok(!ids.includes('malacca'));
  // The Cape is itself the detour, so it is not a critical chokepoint.
  assert.ok(!ids.includes('cape-of-good-hope'));
});

test('chokepoint lookup resolves by id', () => {
  assert.equal(chokepoint('suez')?.name, 'Suez Canal');
  assert.equal(chokepoint('hormuz')?.detourVia, null);
  assert.equal(chokepoint('suez')?.detourVia, 'Cape of Good Hope');
  assert.equal(chokepoint('nope'), undefined);
});

test('chokepoints bordering countries resolve to real ISO3 codes', () => {
  const known = new Set(COUNTRIES.map((c) => c.iso3));
  for (const point of CHOKEPOINTS) {
    for (const iso3 of point.borderingCountries) {
      assert.ok(known.has(iso3), `${point.name} references unknown country ${iso3}`);
    }
  }
});
