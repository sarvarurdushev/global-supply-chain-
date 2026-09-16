import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NodeType,
  EdgeType,
  TransportMode,
  createNode,
  createEdge,
  createGraph,
} from './graph.js';
import {
  DisruptionKind,
  DEFAULT_SPEEDS_KNOTS,
  createDisruption,
  closeNode,
  reduceNodeCapacity,
  estimateRouteHours,
  simulateDisruption,
  propagate,
  compareScenarios,
} from './disruption.js';
import { shortestPath } from './routing.js';
import { DataClass, createProvenance } from './provenance.js';

const PROV = createProvenance({
  dataClass: DataClass.HISTORICAL,
  source: 'NGA World Port Index',
  dataset: 'world-port-index',
  license: 'US Government public domain',
  method: 'Direct API read',
});

function port(id, lat, lon, country) {
  return createNode({
    id,
    type: NodeType.PORT,
    name: id,
    position: { lat, lon },
    country,
    provenance: PROV,
  });
}

function leg(id, from, to, distanceKm) {
  return createEdge({
    id,
    from,
    to,
    type: EdgeType.MARITIME_ROUTE,
    mode: TransportMode.SEA,
    distanceKm,
    provenance: PROV,
  });
}

/**
 * Asia -> Europe, either through a canal or the long way around a cape.
 * Mirrors the real structural choice the Suez/Cape decision represents.
 */
function asiaEurope() {
  return createGraph({
    nodes: [
      port('BUSAN', 35.1, 129.03, 'KOR'),
      port('SINGAPORE', 1.28, 103.85, 'SGP'),
      port('CANAL', 30.0, 32.35, 'EGY'),
      port('CAPE', -33.92, 18.42, 'ZAF'),
      port('ROTTERDAM', 51.9, 4.48, 'NLD'),
    ],
    edges: [
      leg('bs', 'BUSAN', 'SINGAPORE', 4600),
      leg('sc', 'SINGAPORE', 'CANAL', 8300),
      leg('cr', 'CANAL', 'ROTTERDAM', 6400),
      leg('scape', 'SINGAPORE', 'CAPE', 8900),
      leg('caper', 'CAPE', 'ROTTERDAM', 11500),
    ],
  });
}

test('createDisruption validates its inputs', () => {
  assert.throws(() => createDisruption({ id: '', kind: DisruptionKind.PORT_CLOSURE, label: 'x' }), TypeError);
  assert.throws(() => createDisruption({ id: 'a', kind: 'NOPE', label: 'x' }), TypeError);
  assert.throws(() => createDisruption({ id: 'a', kind: DisruptionKind.PORT_CLOSURE, label: '' }), TypeError);
  // A disruption that disrupts nothing is a bug, not an empty scenario.
  assert.throws(
    () => createDisruption({ id: 'a', kind: DisruptionKind.PORT_CLOSURE, label: 'x' }),
    /must disable or penalise/,
  );
});

test('closeNode and reduceNodeCapacity build well-formed scenarios', () => {
  const closed = closeNode('CANAL', { kind: DisruptionKind.CANAL_CLOSURE });
  assert.deepEqual(closed.disabledNodes, ['CANAL']);
  assert.ok(closed.assumptions.length > 0);

  const reduced = reduceNodeCapacity('BUSAN', 0.5);
  // Halved capacity is modelled as a doubled traversal cost.
  assert.equal(reduced.nodePenalties.BUSAN, 2);
  assert.equal(reduced.kind, DisruptionKind.CAPACITY_REDUCTION);
  assert.ok(reduced.assumptions.some((a) => /queueing/.test(a)));

  assert.throws(() => reduceNodeCapacity('X', 0), RangeError);
  assert.throws(() => reduceNodeCapacity('X', 1), RangeError);
  assert.throws(() => reduceNodeCapacity('X', 1.5), RangeError);
});

test('estimateRouteHours uses stated speeds and handling time', () => {
  const g = asiaEurope();
  const route = shortestPath(g, 'BUSAN', 'ROTTERDAM');
  const time = estimateRouteHours(g, route);
  assert.ok(time.hours > 0);
  // 19,300 km at 14 kn is ~745 h of steaming, plus 2 stops x 24 h.
  const steaming = 19300 / (DEFAULT_SPEEDS_KNOTS.SEA * 1.852);
  assert.ok(Math.abs(time.hours - (steaming + 48)) < 1, `got ${time.hours}`);
  // The assumptions must be stated, not buried.
  assert.ok(time.assumptions.some((a) => /SEA service speed assumed 14 knots/.test(a)));
  assert.ok(time.assumptions.some((a) => /handling time/.test(a)));
});

test('estimateRouteHours returns null when a leg lacks distance or a known mode', () => {
  const g = createGraph({
    nodes: [
      createNode({ id: 'A', type: NodeType.COUNTRY, name: 'A', provenance: PROV }),
      createNode({ id: 'B', type: NodeType.COUNTRY, name: 'B', provenance: PROV }),
    ],
    edges: [
      createEdge({
        id: 'ab',
        from: 'A',
        to: 'B',
        type: EdgeType.TRADE_RELATIONSHIP,
        mode: TransportMode.STATISTICAL,
        provenance: PROV,
      }),
    ],
  });
  assert.equal(estimateRouteHours(g, { path: ['A', 'B'], edges: [g.edge('ab')] }), null);
});

test('closing the canal reroutes via the cape with measured penalties', () => {
  const g = asiaEurope();
  const result = simulateDisruption(
    g,
    closeNode('CANAL', { kind: DisruptionKind.CANAL_CLOSURE }),
    'BUSAN',
    'ROTTERDAM',
  );

  assert.equal(result.reachableBefore, true);
  assert.equal(result.reachableAfter, true);
  assert.deepEqual(result.before.path, ['BUSAN', 'SINGAPORE', 'CANAL', 'ROTTERDAM']);
  assert.deepEqual(result.after.path, ['BUSAN', 'SINGAPORE', 'CAPE', 'ROTTERDAM']);

  // 25,000 km via the cape versus 19,300 km via the canal.
  assert.equal(result.before.distanceKm, 19300);
  assert.equal(result.after.distanceKm, 25000);
  assert.equal(result.delta.additionalDistanceKm, 5700);
  assert.ok(Math.abs(result.delta.distanceRatio - 25000 / 19300) < 1e-12);
  assert.ok(result.delta.additionalHours > 0);
  assert.equal(result.delta.additionalTransshipments, 0);
});

test('simulation output is always classed SIMULATED with its assumptions', () => {
  const g = asiaEurope();
  const result = simulateDisruption(g, closeNode('CANAL'), 'BUSAN', 'ROTTERDAM');
  assert.equal(result.provenance.dataClass, DataClass.SIMULATED);
  assert.equal(result.provenance.badge, '🟠 SIMULATED');
  assert.ok(
    result.provenance.limitations.some((l) => /NOT AN OBSERVATION/.test(l)),
    'must state that the scenario did not occur',
  );
  assert.ok(result.provenance.limitations.some((l) => /No economic consequence/.test(l)));
});

test('a severed pair is reported as severed, not as a zero-cost route', () => {
  const g = createGraph({
    nodes: [port('A', 0, 0, 'AAA'), port('B', 0, 10, 'BBB'), port('C', 0, 20, 'CCC')],
    edges: [leg('ab', 'A', 'B', 1000), leg('bc', 'B', 'C', 1000)],
  });
  const result = simulateDisruption(g, closeNode('B'), 'A', 'C');
  assert.equal(result.reachableBefore, true);
  assert.equal(result.reachableAfter, false);
  assert.equal(result.after, null);
  assert.equal(result.delta, null);
  // The note must not overclaim: no path in OUR data is not no path in the world.
  assert.match(result.note, /not the same as no alternative existing in the world/);
});

test('a pair with no baseline route reports a data gap', () => {
  const g = createGraph({
    nodes: [port('A', 0, 0, 'AAA'), port('B', 0, 10, 'BBB'), port('C', 0, 20, 'CCC')],
    edges: [leg('ab', 'A', 'B', 100)],
  });
  const result = simulateDisruption(g, closeNode('B'), 'A', 'C');
  assert.equal(result.reachableBefore, false);
  assert.equal(result.before, null);
  assert.match(result.note, /DATA UNAVAILABLE/);
});

test('capacity reduction raises cost without severing the route', () => {
  const g = asiaEurope();
  const result = simulateDisruption(
    g,
    reduceNodeCapacity('CANAL', 0.5),
    'BUSAN',
    'ROTTERDAM',
  );
  assert.equal(result.reachableAfter, true);
  // Doubling the cost of both canal legs makes the cape route preferable.
  assert.deepEqual(result.after.path, ['BUSAN', 'SINGAPORE', 'CAPE', 'ROTTERDAM']);
  assert.ok(result.delta.costRatio > 1);
});

test('a mild capacity reduction leaves the original route in place', () => {
  const g = asiaEurope();
  const result = simulateDisruption(
    g,
    reduceNodeCapacity('CANAL', 0.1),
    'BUSAN',
    'ROTTERDAM',
  );
  assert.deepEqual(result.after.path, ['BUSAN', 'SINGAPORE', 'CANAL', 'ROTTERDAM']);
  // Same geography, higher cost.
  assert.equal(result.delta.additionalDistanceKm, 0);
  assert.ok(result.delta.costRatio > 1);
});

test('alternatives are returned and labelled by data support', () => {
  const g = asiaEurope();
  const result = simulateDisruption(g, closeNode('CANAL'), 'BUSAN', 'ROTTERDAM', { k: 3 });
  assert.ok(result.alternatives.length >= 1);
  for (const alt of result.alternatives) {
    // Without capacity + utilisation data, nothing may claim operational validity.
    assert.equal(alt.classification.kind, 'GEOGRAPHIC_ALTERNATIVE');
    assert.ok(alt.classification.missing.length > 0);
  }
});

test('propagate tiers nodes by topological distance', () => {
  const g = createGraph({
    nodes: [
      port('A', 0, 0, 'AAA'),
      port('B', 0, 10, 'BBB'),
      port('C', 0, 20, 'CCC'),
      port('D', 0, 30, 'DDD'),
    ],
    edges: [leg('ab', 'A', 'B', 100), leg('bc', 'B', 'C', 100), leg('cd', 'C', 'D', 100)],
  });
  const result = propagate(g, closeNode('A'));
  assert.deepEqual(result.direct.map((n) => n.id), ['A']);
  assert.deepEqual(result.secondary.map((n) => n.id), ['B']);
  assert.deepEqual(result.tertiary.map((n) => n.id), ['C']);
  assert.deepEqual(result.beyond.map((n) => n.id), ['D']);
  assert.equal(result.totalReached, 4);
  assert.deepEqual(result.exposedCountries, ['AAA', 'BBB', 'CCC', 'DDD']);
});

test('propagate follows incoming edges as well as outgoing ones', () => {
  // B only has an inbound edge; a downstream-only walk would miss A.
  const g = createGraph({
    nodes: [port('A', 0, 0, 'AAA'), port('B', 0, 10, 'BBB')],
    edges: [leg('ab', 'A', 'B', 100)],
  });
  const result = propagate(g, closeNode('B'));
  assert.deepEqual(result.direct.map((n) => n.id), ['B']);
  assert.deepEqual(result.secondary.map((n) => n.id), ['A']);
});

test('propagate seeds from disabled and penalised edges too', () => {
  const g = asiaEurope();
  const viaEdge = createDisruption({
    id: 'edge-closure',
    kind: DisruptionKind.ROUTE_CLOSURE,
    label: 'Singapore-Canal leg closed',
    disabledEdges: ['sc'],
  });
  const result = propagate(g, viaEdge);
  assert.deepEqual(result.direct.map((n) => n.id).sort(), ['CANAL', 'SINGAPORE']);
});

test('propagate output is SIMULATED and warns against over-reading tiers', () => {
  const g = asiaEurope();
  const result = propagate(g, closeNode('CANAL'));
  assert.equal(result.provenance.dataClass, DataClass.SIMULATED);
  assert.ok(
    result.provenance.limitations.some((l) => /does NOT mean a node will/.test(l)),
    'must warn that tier membership is not impact',
  );
  assert.throws(() => propagate(g, closeNode('CANAL'), 0), RangeError);
});

test('compareScenarios ranks severed pairs above merely costlier ones', () => {
  const g = asiaEurope();
  const ranked = compareScenarios(
    g,
    [
      reduceNodeCapacity('CANAL', 0.1),
      closeNode('CANAL', { kind: DisruptionKind.CANAL_CLOSURE }),
      closeNode('SINGAPORE'),
    ],
    'BUSAN',
    'ROTTERDAM',
  );
  assert.equal(ranked.length, 3);
  // Closing Singapore severs the pair entirely; it must rank worst-first.
  assert.equal(ranked[0].id, 'close:SINGAPORE');
  assert.equal(ranked[0].severed, true);
  assert.equal(ranked[1].severed, false);
  // Among survivable scenarios, the costlier one ranks higher.
  assert.ok(ranked[1].costRatio >= ranked[2].costRatio);
});

test('scenario comparison never mutates the baseline graph', () => {
  const g = asiaEurope();
  const before = shortestPath(g, 'BUSAN', 'ROTTERDAM');
  compareScenarios(
    g,
    [closeNode('CANAL'), closeNode('SINGAPORE'), reduceNodeCapacity('CANAL', 0.5)],
    'BUSAN',
    'ROTTERDAM',
  );
  const after = shortestPath(g, 'BUSAN', 'ROTTERDAM');
  assert.deepEqual(after.path, before.path);
  assert.equal(after.cost, before.cost);
  assert.equal(g.nodeCount, 5);
  assert.equal(g.edgeCount, 5);
});
