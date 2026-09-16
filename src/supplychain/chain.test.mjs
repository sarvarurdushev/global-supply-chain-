import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE_KINDS,
  TRANSPORT_MODES,
  nearestPort,
  buildSupplyChain,
  transportMode,
} from './chain.js';
import { DataClass } from './provenance.js';

const PORTS = Object.freeze([
  { id: 'p:rtm', name: 'Rotterdam', country: 'NL', lat: 51.95, lon: 4.13 },
  { id: 'p:pus', name: 'Busan', country: 'KR', lat: 35.1, lon: 129.05 },
  { id: 'p:sin', name: 'Singapore', country: 'SG', lat: 1.27, lon: 103.8 },
  { id: 'p:sha', name: 'Shanghai', country: 'CN', lat: 31.23, lon: 121.47 },
]);

const KOREA = { iso3: 'KOR', name: 'South Korea', lat: 36.5, lon: 127.8 };
const NETHERLANDS = { iso3: 'NLD', name: 'Netherlands', lat: 52.1, lon: 5.6 };
const NEPAL = { iso3: 'NPL', name: 'Nepal', lat: 28.2, lon: 84.1 };

const AT = '2026-09-16T00:00:00Z';

function chain(overrides = {}) {
  return buildSupplyChain({
    origin: KOREA,
    destination: NETHERLANDS,
    commodityLabel: 'Semiconductors',
    ports: PORTS,
    retrievedAt: AT,
    ...overrides,
  });
}

/* ---------------- nearestPort ---------------- */

test('nearestPort finds the closest port', () => {
  assert.equal(nearestPort(KOREA, PORTS).port.name, 'Busan');
  assert.equal(nearestPort(NETHERLANDS, PORTS).port.name, 'Rotterdam');
});

test('nearestPort reports the distance it measured', () => {
  const result = nearestPort(KOREA, PORTS);
  assert.ok(result.distanceKm > 100 && result.distanceKm < 400, `${result.distanceKm}`);
});

test('nearestPort returns null rather than guessing on bad input', () => {
  assert.equal(nearestPort(KOREA, []), null);
  assert.equal(nearestPort(KOREA, null), null);
  assert.equal(nearestPort({ lat: NaN, lon: 5 }, PORTS), null);
  assert.equal(nearestPort(undefined, PORTS), null);
});

test('a landlocked country still gets a port, which is the problem', () => {
  // Nepal has no coast. The nearest port in this set is thousands of km away in
  // another country, which is exactly why the stage carries a caveat rather
  // than being presented as Nepal's port.
  const result = nearestPort(NEPAL, PORTS);
  assert.ok(result, 'geometry always finds one');
  assert.ok(result.distanceKm > 2000, `${result.distanceKm} km away`);
});

/* ---------------- the chain ---------------- */

test('the chain covers all ten canonical stages', () => {
  const built = chain();
  const kinds = built.stages.map((stage) => stage.kind);
  for (const kind of STAGE_KINDS) {
    assert.ok(kinds.includes(kind), `stage ${kind} is missing from the chain`);
  }
});

test('the five unsupportable stages are present and marked absent', () => {
  // Requirement 42: a gap is shown, not omitted. Omitting them would make the
  // chain look complete when half of it is unknown.
  const built = chain({
    transitNodes: [{ name: 'Suez Canal', lat: 30, lon: 32.35 }],
  });
  const missing = built.stages.filter((stage) => !stage.available);
  assert.equal(missing.length, 5);
  assert.deepEqual(
    missing.map((stage) => stage.kind),
    ['EXTRACTION', 'PROCESSING', 'MANUFACTURE', 'DISTRIBUTION', 'CONSUMER'],
  );
  for (const stage of missing) {
    assert.equal(stage.dataClass, DataClass.UNKNOWN);
    assert.ok(stage.because?.length > 40, `${stage.kind} does not say why`);
    assert.ok(stage.wouldNeed?.length > 15, `${stage.kind} does not say what would fix it`);
    assert.equal(stage.lat, null);
  }
  assert.equal(built.stagesMissing, 5);
});

test('the placeable stages carry their real data class', () => {
  const built = chain();
  const byKind = Object.fromEntries(built.stages.map((s) => [s.kind, s]));
  assert.equal(byKind.ORIGIN.dataClass, DataClass.HISTORICAL);
  assert.equal(byKind.DESTINATION.dataClass, DataClass.HISTORICAL);
  // A nearest-neighbour port is an inference, not a record.
  assert.equal(byKind.LOAD_PORT.dataClass, DataClass.INFERRED);
  assert.equal(byKind.DISCHARGE_PORT.dataClass, DataClass.INFERRED);
});

test('a port stage says the port choice is geometry, not a shipping record', () => {
  const built = chain();
  const loadPort = built.stages.find((s) => s.kind === 'LOAD_PORT');
  assert.equal(loadPort.name, 'Busan');
  assert.match(loadPort.caveat, /geometry, not a shipping record/i);
  assert.match(loadPort.basis, /World Port Index/);
  assert.match(loadPort.basis, /\d+ km/);
});

test('a country stage says it is a label point, not a facility', () => {
  const built = chain();
  const origin = built.stages.find((s) => s.kind === 'ORIGIN');
  assert.match(origin.caveat, /label point, not at any facility/i);
});

test('transit nodes become simulated stages in order', () => {
  const built = chain({
    transitNodes: [
      { name: 'Strait of Malacca', lat: 2.5, lon: 101 },
      { name: 'Suez Canal', lat: 30, lon: 32.35 },
    ],
  });
  const transit = built.stages.filter((s) => s.kind === 'SEA_TRANSIT');
  assert.deepEqual(
    transit.map((s) => s.name),
    ['Strait of Malacca', 'Suez Canal'],
  );
  for (const stage of transit) {
    assert.equal(stage.dataClass, DataClass.SIMULATED);
    assert.match(stage.caveat, /geographic path/i);
  }
});

/* ---------------- legs and modes ---------------- */

test('legs only join stages that both have a position', () => {
  // A line from an unknown mine to a known port would be a fabrication with a
  // very convincing appearance.
  const built = chain();
  for (const leg of built.legs) {
    assert.ok(Number.isFinite(leg.from.lat), `${leg.from.kind} has no position`);
    assert.ok(Number.isFinite(leg.to.lat), `${leg.to.kind} has no position`);
  }
  assert.equal(built.legs.length, built.stagesPlaced - 1);
});

test('the inland hops are LAND and the sea hop is SEA', () => {
  const built = chain({
    transitNodes: [{ name: 'Suez Canal', lat: 30, lon: 32.35 }],
  });
  const modes = built.legs.map((leg) => `${leg.from.kind}->${leg.to.kind}:${leg.mode}`);
  assert.deepEqual(modes, [
    'ORIGIN->LOAD_PORT:LAND',
    'LOAD_PORT->SEA_TRANSIT:SEA',
    'SEA_TRANSIT->DISCHARGE_PORT:SEA',
    'DISCHARGE_PORT->DESTINATION:LAND',
  ]);
});

test('an inland leg is honest about not being a route', () => {
  const built = chain();
  const inland = built.legs.find((leg) => leg.mode === 'LAND');
  assert.match(inland.caveat, /NOT a road or rail route/i);
  assert.equal(
    inland.dataClass,
    DataClass.UNKNOWN,
    'a straight line where a route belongs is not a simulation, it is a gap',
  );
});

test('modes are visually distinguishable without relying on colour', () => {
  // Dash patterns survive colour-blindness and greyscale; colour reinforces.
  const sea = TRANSPORT_MODES.SEA;
  const land = TRANSPORT_MODES.LAND;
  const air = TRANSPORT_MODES.AIR;
  assert.equal(sea.dash, null, 'sea is solid');
  assert.ok(Array.isArray(land.dash));
  assert.ok(Array.isArray(air.dash));
  assert.notDeepEqual(land.dash, air.dash, 'land and air must not look alike');
  for (const mode of [sea, land, air, TRANSPORT_MODES.UNKNOWN]) {
    assert.match(mode.colour, /^#[0-9a-f]{6}$/i);
    assert.ok(mode.note.length > 20, `${mode.id} does not say what it means`);
  }
});

test('transportMode degrades to UNKNOWN rather than throwing', () => {
  assert.equal(transportMode('SEA').id, 'SEA');
  assert.equal(transportMode('TELEPORT').id, 'UNKNOWN');
  assert.equal(transportMode(undefined).id, 'UNKNOWN');
});

test('distances are summed and the sea share is reported separately', () => {
  const built = chain({
    transitNodes: [{ name: 'Suez Canal', lat: 30, lon: 32.35 }],
  });
  const sum = built.legs.reduce((total, leg) => total + leg.distanceKm, 0);
  assert.ok(Math.abs(built.totalKm - sum) < 0.001);
  assert.ok(built.seaKm > 0 && built.seaKm < built.totalKm);
});

/* ---------------- provenance ---------------- */

test('the chain provenance states that half of it is unknown', () => {
  // No transit nodes here, so sea transit is a sixth gap.
  const built = chain();
  const limitations = built.provenance.limitations.join(' ');
  assert.match(limitations, /6 of 10 stages cannot be placed/);
  assert.match(limitations, /nearest major port/i);
  assert.match(limitations, /straight lines, not routes/i);
});

test('the chain says it describes a country pair, not a shipment', () => {
  // The single most likely misreading of this picture.
  const built = chain();
  assert.match(
    built.provenance.limitations.join(' '),
    /COUNTRY PAIR, not a shipment/,
  );
});

test('the chain is classed INFERRED, never HISTORICAL', () => {
  // Two of its stages are customs records; the shape as a whole is derived.
  assert.equal(chain().provenance.dataClass, DataClass.INFERRED);
});

test('buildSupplyChain refuses a pair it cannot identify', () => {
  assert.throws(
    () => buildSupplyChain({ origin: KOREA, ports: PORTS, retrievedAt: AT }),
    /origin and a destination/,
  );
  assert.throws(
    () => buildSupplyChain({ destination: NETHERLANDS, ports: PORTS, retrievedAt: AT }),
    /origin and a destination/,
  );
});

test('a chain with no reachable ports still renders its country stages', () => {
  // Degrading to two placed stages is correct; throwing would lose the
  // countries, which are the part we actually know.
  const built = chain({ ports: [] });
  const kinds = built.stages.filter((s) => s.available).map((s) => s.kind);
  assert.deepEqual(kinds, ['ORIGIN', 'DESTINATION']);
  assert.equal(built.legs.length, 1);
});

test('sea transit appears even when no route has been computed', () => {
  // Dropping the stage would make the chain look like it has no sea leg, when
  // what it has is no route computed yet.
  const built = chain();
  const transit = built.stages.find((s) => s.kind === 'SEA_TRANSIT');
  assert.ok(transit, 'the stage must always be in the shape');
  assert.equal(transit.available, false);
  assert.match(transit.because, /No maritime route has been computed/i);
  assert.match(transit.wouldNeed, /computed path/i);
});

test('crossing more chokepoints does not make a chain look more complete', () => {
  // stagesMissing counts canonical KINDS, not entries — otherwise a chain with
  // three transit nodes would report fewer gaps than one with a single node.
  const one = chain({ transitNodes: [{ name: 'A', lat: 0, lon: 0 }] });
  const three = chain({
    transitNodes: [
      { name: 'A', lat: 0, lon: 0 },
      { name: 'B', lat: 5, lon: 5 },
      { name: 'C', lat: 10, lon: 10 },
    ],
  });
  assert.equal(one.stagesMissing, 5);
  assert.equal(three.stagesMissing, 5);
  assert.ok(three.stagesPlaced > one.stagesPlaced, 'but more entries are drawn');
});
