import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NodeType,
  EdgeType,
  TransportMode,
  createNode,
  createEdge,
  createGraph,
  withScenario,
  edgeDistanceKm,
} from './graph.js';
import { DataClass, createProvenance } from './provenance.js';

const PROV = createProvenance({
  dataClass: DataClass.HISTORICAL,
  source: 'NGA World Port Index',
  dataset: 'world-port-index',
  license: 'US Government public domain',
  method: 'Direct API read',
});

function node(id, lat, lon, extra = {}) {
  return createNode({
    id,
    type: NodeType.PORT,
    name: id,
    position: { lat, lon },
    provenance: PROV,
    ...extra,
  });
}

function edge(id, from, to, distanceKm = null, extra = {}) {
  return createEdge({
    id,
    from,
    to,
    type: EdgeType.MARITIME_ROUTE,
    mode: TransportMode.SEA,
    distanceKm,
    provenance: PROV,
    ...extra,
  });
}

test('createNode validates type, name and coordinates', () => {
  assert.throws(() => createNode({ id: '', type: NodeType.PORT, name: 'x', provenance: PROV }), TypeError);
  assert.throws(() => createNode({ id: 'a', type: 'NOPE', name: 'x', provenance: PROV }), TypeError);
  assert.throws(() => createNode({ id: 'a', type: NodeType.PORT, name: '', provenance: PROV }), TypeError);
  assert.throws(
    () => createNode({ id: 'a', type: NodeType.PORT, name: 'x', position: { lat: 999, lon: 0 }, provenance: PROV }),
    RangeError,
  );
  // Provenance is mandatory: an unattributed node must not be constructible.
  assert.throws(() => createNode({ id: 'a', type: NodeType.PORT, name: 'x' }), TypeError);
  assert.throws(
    () => createNode({ id: 'a', type: NodeType.PORT, name: 'x', provenance: { dataClass: 'junk' } }),
    TypeError,
  );
});

test('createNode accepts a positionless node and freezes the result', () => {
  const n = createNode({
    id: 'KOR',
    type: NodeType.COUNTRY,
    name: 'South Korea',
    provenance: PROV,
  });
  assert.equal(n.position, null);
  assert.ok(Object.isFrozen(n));
  assert.ok(Object.isFrozen(n.attributes));
});

test('createEdge validates type, mode and numeric fields', () => {
  assert.throws(() => edge('e', 'a', 'b', -1), TypeError);
  assert.throws(
    () => createEdge({ id: 'e', from: 'a', to: 'b', type: 'NOPE', mode: TransportMode.SEA, provenance: PROV }),
    TypeError,
  );
  assert.throws(
    () => createEdge({ id: 'e', from: 'a', to: 'b', type: EdgeType.MARITIME_ROUTE, mode: 'TELEPORT', provenance: PROV }),
    TypeError,
  );
  assert.throws(() => edge('e', 'a', 'b', null, { value: -5 }), TypeError);
  assert.throws(() => edge('e', 'a', 'b', null, { volumeKg: NaN }), TypeError);
  // Provenance is mandatory on edges too.
  assert.throws(
    () => createEdge({ id: 'e', from: 'a', to: 'b', type: EdgeType.MARITIME_ROUTE, mode: TransportMode.SEA }),
    TypeError,
  );
});

test('createGraph rejects duplicate ids and dangling edge endpoints', () => {
  const a = node('A', 0, 0);
  const b = node('B', 0, 10);
  assert.throws(() => createGraph({ nodes: [a, a], edges: [] }), /Duplicate node id/);
  assert.throws(
    () => createGraph({ nodes: [a, b], edges: [edge('e', 'A', 'B'), edge('e', 'B', 'A')] }),
    /Duplicate edge id/,
  );
  // A dangling endpoint must fail loudly rather than silently dropping the edge.
  assert.throws(
    () => createGraph({ nodes: [a], edges: [edge('e', 'A', 'MISSING')] }),
    /references unknown node: MISSING/,
  );
  assert.throws(
    () => createGraph({ nodes: [a], edges: [edge('e', 'MISSING', 'A')] }),
    /references unknown node: MISSING/,
  );
});

test('createGraph indexes adjacency in both directions', () => {
  const g = createGraph({
    nodes: [node('A', 0, 0), node('B', 0, 10), node('C', 0, 20)],
    edges: [edge('ab', 'A', 'B'), edge('bc', 'B', 'C')],
  });
  assert.equal(g.nodeCount, 3);
  assert.equal(g.edgeCount, 2);
  assert.deepEqual(g.outEdges('A').map((e) => e.id), ['ab']);
  assert.deepEqual(g.inEdges('B').map((e) => e.id), ['ab']);
  assert.deepEqual(g.outEdges('C'), []);
  assert.equal(g.degree('B'), 2);
  assert.equal(g.degree('A'), 1);
  assert.equal(g.hasNode('A'), true);
  assert.equal(g.hasNode('Z'), false);
  assert.equal(g.node('A').name, 'A');
  assert.equal(g.edge('ab').id, 'ab');
});

test('an empty graph is valid', () => {
  const g = createGraph();
  assert.equal(g.nodeCount, 0);
  assert.equal(g.edgeCount, 0);
  assert.deepEqual(g.nodes(), []);
  assert.deepEqual(g.outEdges('anything'), []);
  assert.equal(g.degree('anything'), 0);
});

test('withScenario hides disabled nodes and their edges without mutating the base', () => {
  const base = createGraph({
    nodes: [node('A', 0, 0), node('B', 0, 10), node('C', 0, 20)],
    edges: [edge('ab', 'A', 'B'), edge('bc', 'B', 'C'), edge('ac', 'A', 'C')],
  });
  const scenario = withScenario(base, { disabledNodes: ['B'] });

  assert.equal(scenario.nodeCount, 2);
  assert.equal(scenario.edgeCount, 1);
  assert.equal(scenario.hasNode('B'), false);
  assert.equal(scenario.node('B'), undefined);
  assert.equal(scenario.edge('ab'), undefined);
  assert.deepEqual(scenario.outEdges('A').map((e) => e.id), ['ac']);
  assert.deepEqual(scenario.outEdges('B'), []);

  // The baseline is untouched — a simulation must never leak into observed data.
  assert.equal(base.nodeCount, 3);
  assert.equal(base.edgeCount, 3);
  assert.equal(base.hasNode('B'), true);
  assert.equal(scenario.baseGraph, base);
});

test('withScenario hides disabled edges but keeps their endpoints', () => {
  const base = createGraph({
    nodes: [node('A', 0, 0), node('B', 0, 10)],
    edges: [edge('ab', 'A', 'B')],
  });
  const scenario = withScenario(base, { disabledEdges: ['ab'] });
  assert.equal(scenario.nodeCount, 2);
  assert.equal(scenario.edgeCount, 0);
  assert.equal(scenario.hasNode('A'), true);
  assert.equal(scenario.degree('A'), 0);
});

test('scenario penalties compound and are validated', () => {
  const base = createGraph({
    nodes: [node('A', 0, 0), node('B', 0, 10)],
    edges: [edge('ab', 'A', 'B')],
  });
  const plain = withScenario(base, {});
  assert.equal(plain.penaltyFor(base.edge('ab')), 1);

  const penalised = withScenario(base, {
    edgePenalties: { ab: 2 },
    nodePenalties: { A: 3 },
  });
  assert.equal(penalised.penaltyFor(base.edge('ab')), 6);

  // A multiplier below 1 would make a disruption look beneficial.
  assert.throws(() => withScenario(base, { edgePenalties: { ab: 0.5 } }), RangeError);
  assert.throws(() => withScenario(base, { nodePenalties: { A: 0 } }), RangeError);
  assert.throws(() => withScenario(base, { edgePenalties: { ab: Infinity } }), RangeError);
  assert.throws(() => withScenario(base, { disabledNodes: ['NOPE'] }), /unknown node/);
});

test('scenarios compose over one another', () => {
  const base = createGraph({
    nodes: [node('A', 0, 0), node('B', 0, 10), node('C', 0, 20)],
    edges: [edge('ab', 'A', 'B'), edge('bc', 'B', 'C')],
  });
  const first = withScenario(base, { disabledEdges: ['ab'] });
  const second = withScenario(first, { disabledEdges: ['bc'] });
  assert.equal(second.edgeCount, 0);
  assert.equal(first.edgeCount, 1);
  assert.equal(base.edgeCount, 2);
});

test('edgeDistanceKm prefers the recorded value and falls back to geometry', () => {
  const g = createGraph({
    nodes: [node('A', 0, 0), node('B', 0, 10)],
    edges: [edge('stated', 'A', 'B', 4242), edge('derived', 'A', 'B')],
  });
  assert.equal(edgeDistanceKm(g, g.edge('stated')), 4242);
  const derived = edgeDistanceKm(g, g.edge('derived'));
  assert.ok(derived > 1100 && derived < 1120, `got ${derived}`);
});

test('edgeDistanceKm reports null rather than zero when geometry is missing', () => {
  const g = createGraph({
    nodes: [
      createNode({ id: 'KOR', type: NodeType.COUNTRY, name: 'South Korea', provenance: PROV }),
      createNode({ id: 'VNM', type: NodeType.COUNTRY, name: 'Vietnam', provenance: PROV }),
    ],
    edges: [
      createEdge({
        id: 'trade',
        from: 'KOR',
        to: 'VNM',
        type: EdgeType.TRADE_RELATIONSHIP,
        mode: TransportMode.STATISTICAL,
        provenance: PROV,
      }),
    ],
  });
  // Zero would make the edge look free to traverse; null forces callers to
  // treat it as a gap.
  assert.equal(edgeDistanceKm(g, g.edge('trade')), null);
});

test('parallel edges between the same nodes are permitted for different commodities', () => {
  const g = createGraph({
    nodes: [node('A', 0, 0), node('B', 0, 10)],
    edges: [
      edge('chips', 'A', 'B', 100, { commodity: '8542' }),
      edge('oil', 'A', 'B', 100, { commodity: '2709' }),
    ],
  });
  assert.equal(g.edgeCount, 2);
  assert.equal(g.degree('A'), 2);
  assert.deepEqual(g.outEdges('A').map((e) => e.commodity), ['8542', '2709']);
});
