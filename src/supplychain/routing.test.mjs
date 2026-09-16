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
} from './graph.js';
import {
  shortestPath,
  aStarPath,
  kShortestPaths,
  routeDistanceKm,
  transshipmentCount,
  classifyAlternative,
  distanceCost,
  greatCircleHeuristic,
} from './routing.js';
import { DataClass, createProvenance } from './provenance.js';

const PROV = createProvenance({
  dataClass: DataClass.HISTORICAL,
  source: 'NGA World Port Index',
  dataset: 'world-port-index',
  license: 'US Government public domain',
  method: 'Direct API read',
});

function node(id, lat = 0, lon = 0) {
  return createNode({
    id,
    type: NodeType.PORT,
    name: id,
    position: { lat, lon },
    provenance: PROV,
  });
}

function edge(id, from, to, distanceKm, extra = {}) {
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

/**
 * A ---10--- B ---10--- D
 *  \                   /
 *   --15-- C ---10-----
 * Best A->D is A-B-D (20); the alternative A-C-D costs 25.
 */
function diamond() {
  return createGraph({
    nodes: [node('A'), node('B'), node('C'), node('D')],
    edges: [
      edge('ab', 'A', 'B', 10),
      edge('bd', 'B', 'D', 10),
      edge('ac', 'A', 'C', 15),
      edge('cd', 'C', 'D', 10),
    ],
  });
}

test('shortestPath finds the least-cost route', () => {
  const g = diamond();
  const route = shortestPath(g, 'A', 'D');
  assert.deepEqual(route.path, ['A', 'B', 'D']);
  assert.deepEqual(route.edges.map((e) => e.id), ['ab', 'bd']);
  assert.equal(route.cost, 20);
});

test('shortestPath handles trivial and impossible queries', () => {
  const g = diamond();
  assert.deepEqual(shortestPath(g, 'A', 'A'), { path: ['A'], edges: [], cost: 0 });
  assert.equal(shortestPath(g, 'A', 'NOPE'), null);
  assert.equal(shortestPath(g, 'NOPE', 'A'), null);
  // Edges are directed: there is no D -> A route.
  assert.equal(shortestPath(g, 'D', 'A'), null);
});

test('shortestPath respects blocked nodes and edges', () => {
  const g = diamond();
  const viaC = shortestPath(g, 'A', 'D', { blockedNodes: new Set(['B']) });
  assert.deepEqual(viaC.path, ['A', 'C', 'D']);
  assert.equal(viaC.cost, 25);

  const edgeBlocked = shortestPath(g, 'A', 'D', { blockedEdges: ['ab'] });
  assert.deepEqual(edgeBlocked.path, ['A', 'C', 'D']);

  assert.equal(shortestPath(g, 'A', 'D', { blockedNodes: ['A'] }), null);
  assert.equal(shortestPath(g, 'A', 'D', { blockedNodes: ['D'] }), null);
  assert.equal(
    shortestPath(g, 'A', 'D', { blockedEdges: ['ab', 'ac'] }),
    null,
  );
});

test('an edge with unknown distance is excluded rather than treated as free', () => {
  const g = createGraph({
    nodes: [
      createNode({ id: 'A', type: NodeType.COUNTRY, name: 'A', provenance: PROV }),
      createNode({ id: 'B', type: NodeType.COUNTRY, name: 'B', provenance: PROV }),
    ],
    edges: [
      createEdge({
        id: 'unknown',
        from: 'A',
        to: 'B',
        type: EdgeType.TRADE_RELATIONSHIP,
        mode: TransportMode.STATISTICAL,
        provenance: PROV,
      }),
    ],
  });
  assert.equal(distanceCost(g, g.edge('unknown')), Infinity);
  assert.equal(shortestPath(g, 'A', 'B'), null);
});

test('negative edge costs are rejected rather than silently mis-routed', () => {
  const g = diamond();
  assert.throws(
    () => shortestPath(g, 'A', 'D', { weight: () => -1 }),
    RangeError,
  );
  assert.throws(
    () => shortestPath(g, 'A', 'D', { weight: () => 'free' }),
    TypeError,
  );
});

test('a custom weight function changes the chosen route', () => {
  const g = diamond();
  // Weight by hop count: both routes are 2 hops, but ordering makes A-B-D first.
  const byHops = shortestPath(g, 'A', 'D', { weight: () => 1 });
  assert.equal(byHops.cost, 2);
  // Weight that makes B expensive should divert through C.
  const avoidB = shortestPath(g, 'A', 'D', {
    weight: (graph, e) => (e.from === 'B' || e.to === 'B' ? 1000 : 1),
  });
  assert.deepEqual(avoidB.path, ['A', 'C', 'D']);
});

test('aStarPath agrees with Dijkstra on a geographic network', () => {
  // Real coordinates so the great-circle heuristic is meaningful.
  const g = createGraph({
    nodes: [
      node('BUSAN', 35.1, 129.03),
      node('SINGAPORE', 1.28, 103.85),
      node('COLOMBO', 6.93, 79.85),
      node('SUEZ', 29.97, 32.55),
      node('ROTTERDAM', 51.9, 4.48),
      node('CAPE', -33.92, 18.42),
    ],
    edges: [
      edge('bs', 'BUSAN', 'SINGAPORE', null),
      edge('sc', 'SINGAPORE', 'COLOMBO', null),
      edge('cs', 'COLOMBO', 'SUEZ', null),
      edge('sr', 'SUEZ', 'ROTTERDAM', null),
      edge('scape', 'SINGAPORE', 'CAPE', null),
      edge('caper', 'CAPE', 'ROTTERDAM', null),
    ],
  });
  const dijkstra = shortestPath(g, 'BUSAN', 'ROTTERDAM');
  const astar = aStarPath(g, 'BUSAN', 'ROTTERDAM');
  assert.deepEqual(astar.path, dijkstra.path);
  assert.ok(Math.abs(astar.cost - dijkstra.cost) < 1e-6);
  assert.ok(astar.expanded > 0);
  // The Suez routing is shorter than the Cape of Good Hope routing.
  assert.deepEqual(dijkstra.path, ['BUSAN', 'SINGAPORE', 'COLOMBO', 'SUEZ', 'ROTTERDAM']);
});

test('aStarPath with a zero heuristic degrades to Dijkstra', () => {
  const g = diamond();
  const astar = aStarPath(g, 'A', 'D', { heuristic: () => 0 });
  const dijkstra = shortestPath(g, 'A', 'D');
  assert.deepEqual(astar.path, dijkstra.path);
  assert.equal(astar.cost, dijkstra.cost);
});

test('aStarPath handles trivial and unreachable queries', () => {
  const g = diamond();
  assert.equal(aStarPath(g, 'A', 'NOPE'), null);
  assert.equal(aStarPath(g, 'D', 'A'), null);
  const same = aStarPath(g, 'A', 'A');
  assert.deepEqual(same.path, ['A']);
  assert.equal(same.cost, 0);
});

test('greatCircleHeuristic is admissible and zero without geometry', () => {
  const g = diamond();
  // All diamond nodes sit at 0,0, so the heuristic is 0 and cannot overestimate.
  assert.equal(greatCircleHeuristic(g, 'A', 'D'), 0);
  const geo = createGraph({
    nodes: [node('X', 0, 0), node('Y', 0, 10)],
    edges: [edge('xy', 'X', 'Y', 5000)],
  });
  const h = greatCircleHeuristic(geo, 'X', 'Y');
  // True separation ~1112 km, well under the 5000 km edge cost: admissible.
  assert.ok(h > 1100 && h < 1120, `got ${h}`);
  assert.ok(h <= 5000);
  assert.equal(greatCircleHeuristic(geo, 'X', 'MISSING'), 0);
});

test('kShortestPaths returns paths in non-decreasing cost order', () => {
  const g = diamond();
  const paths = kShortestPaths(g, 'A', 'D', 3);
  assert.equal(paths.length, 2, 'only two loopless paths exist');
  assert.deepEqual(paths[0].path, ['A', 'B', 'D']);
  assert.equal(paths[0].cost, 20);
  assert.deepEqual(paths[1].path, ['A', 'C', 'D']);
  assert.equal(paths[1].cost, 25);
  for (let i = 1; i < paths.length; i += 1) {
    assert.ok(paths[i].cost >= paths[i - 1].cost);
  }
});

test('kShortestPaths finds all distinct routes in a wider network', () => {
  // Three parallel middles of increasing cost.
  const g = createGraph({
    nodes: [node('S'), node('M1'), node('M2'), node('M3'), node('T')],
    edges: [
      edge('s1', 'S', 'M1', 1),
      edge('1t', 'M1', 'T', 1),
      edge('s2', 'S', 'M2', 2),
      edge('2t', 'M2', 'T', 2),
      edge('s3', 'S', 'M3', 3),
      edge('3t', 'M3', 'T', 3),
    ],
  });
  const paths = kShortestPaths(g, 'S', 'T', 5);
  assert.equal(paths.length, 3);
  assert.deepEqual(paths.map((p) => p.cost), [2, 4, 6]);
  // Every returned path must be distinct.
  const keys = new Set(paths.map((p) => p.path.join('>')));
  assert.equal(keys.size, 3);
});

test('kShortestPaths returns loopless paths only', () => {
  const g = createGraph({
    nodes: [node('A'), node('B'), node('C')],
    edges: [
      edge('ab', 'A', 'B', 1),
      edge('bc', 'B', 'C', 1),
      edge('ba', 'B', 'A', 1),
      edge('cb', 'C', 'B', 1),
    ],
  });
  for (const route of kShortestPaths(g, 'A', 'C', 5)) {
    assert.equal(new Set(route.path).size, route.path.length, route.path.join('>'));
  }
});

test('kShortestPaths validates k and handles unreachable targets', () => {
  const g = diamond();
  assert.throws(() => kShortestPaths(g, 'A', 'D', 0), RangeError);
  assert.throws(() => kShortestPaths(g, 'A', 'D', 1.5), RangeError);
  assert.deepEqual(kShortestPaths(g, 'D', 'A', 3), []);
  assert.equal(kShortestPaths(g, 'A', 'D', 1).length, 1);
});

test('kShortestPaths works on a scenario view', () => {
  const g = diamond();
  const scenario = withScenario(g, { disabledNodes: ['B'] });
  const paths = kShortestPaths(scenario, 'A', 'D', 3);
  assert.equal(paths.length, 1);
  assert.deepEqual(paths[0].path, ['A', 'C', 'D']);
});

test('scenario penalties raise route cost without changing geography', () => {
  const g = diamond();
  const congested = withScenario(g, { nodePenalties: { B: 4 } });
  const route = shortestPath(congested, 'A', 'D');
  // A-B-D now costs 20*4 = 80, so A-C-D at 25 wins.
  assert.deepEqual(route.path, ['A', 'C', 'D']);
  // The underlying distance is unchanged — only the cost moved.
  assert.equal(routeDistanceKm(congested, route), 25);
});

test('routeDistanceKm returns null when any leg lacks a distance', () => {
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
  assert.equal(routeDistanceKm(g, { edges: [g.edge('ab')] }), null);
});

test('transshipmentCount excludes the endpoints', () => {
  assert.equal(transshipmentCount({ path: ['A', 'B'] }), 0);
  assert.equal(transshipmentCount({ path: ['A', 'B', 'C'] }), 1);
  assert.equal(transshipmentCount({ path: ['A', 'B', 'C', 'D'] }), 2);
  assert.equal(transshipmentCount({ path: ['A'] }), 0);
});

test('alternatives are labelled GEOGRAPHIC unless capacity and utilisation exist', () => {
  const g = diamond();
  const route = shortestPath(g, 'A', 'D');
  const plain = classifyAlternative(g, route);
  assert.equal(plain.kind, 'GEOGRAPHIC_ALTERNATIVE');
  assert.ok(plain.missing.length > 0);
  assert.match(plain.reason, /commercial feasibility/);

  const validated = createGraph({
    nodes: [node('A'), node('B')],
    edges: [
      edge('ab', 'A', 'B', 10, {
        capacity: 1000,
        attributes: { observedUtilisation: 0.7 },
      }),
    ],
  });
  const full = classifyAlternative(validated, shortestPath(validated, 'A', 'B'));
  assert.equal(full.kind, 'OPERATIONALLY_VALIDATED_ALTERNATIVE');
  assert.deepEqual(full.missing, []);
});

test('classifyAlternative names each missing input', () => {
  const g = createGraph({
    nodes: [node('A'), node('B')],
    edges: [edge('ab', 'A', 'B', 10, { capacity: 500 })],
  });
  const result = classifyAlternative(g, shortestPath(g, 'A', 'B'));
  assert.equal(result.kind, 'GEOGRAPHIC_ALTERNATIVE');
  assert.deepEqual(result.missing, ['ab: no observed utilisation']);
});

test('routing scales to a larger grid without loss of optimality', () => {
  // 12x12 lattice, unit edges east and south. Every monotone path costs 22.
  const size = 12;
  const nodes = [];
  const edges = [];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) nodes.push(node(`n${r}_${c}`));
  }
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (c + 1 < size) edges.push(edge(`e${r}_${c}_E`, `n${r}_${c}`, `n${r}_${c + 1}`, 1));
      if (r + 1 < size) edges.push(edge(`e${r}_${c}_S`, `n${r}_${c}`, `n${r + 1}_${c}`, 1));
    }
  }
  const g = createGraph({ nodes, edges });
  const route = shortestPath(g, 'n0_0', `n${size - 1}_${size - 1}`);
  assert.equal(route.cost, (size - 1) * 2);
  const astar = aStarPath(g, 'n0_0', `n${size - 1}_${size - 1}`, { heuristic: () => 0 });
  assert.equal(astar.cost, route.cost);
  const alternatives = kShortestPaths(g, 'n0_0', `n${size - 1}_${size - 1}`, 4);
  assert.equal(alternatives.length, 4);
  // Every monotone lattice path has identical cost.
  for (const alt of alternatives) assert.equal(alt.cost, (size - 1) * 2);
});
