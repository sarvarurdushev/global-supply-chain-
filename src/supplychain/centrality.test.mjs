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
import { kShortestPaths, distanceCost } from './routing.js';
import {
  degreeCentrality,
  weightedDegree,
  betweennessCentrality,
  herfindahlIndex,
  concentrationRatio,
  alternativeRouteAvailability,
  methodology,
} from './centrality.js';
import { DataClass, createProvenance } from './provenance.js';

const PROV = createProvenance({
  dataClass: DataClass.HISTORICAL,
  source: 'UN Comtrade',
  dataset: 'preview/C/A/HS',
  license: 'UN Comtrade terms of use',
  method: 'Direct API read',
});

function node(id) {
  return createNode({ id, type: NodeType.PORT, name: id, position: { lat: 0, lon: 0 }, provenance: PROV });
}

function edge(id, from, to, distanceKm = 1, extra = {}) {
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

/** A --> B --> C : B is the only bridge, so it carries all betweenness. */
function chain() {
  return createGraph({
    nodes: [node('A'), node('B'), node('C')],
    edges: [edge('ab', 'A', 'B'), edge('bc', 'B', 'C')],
  });
}

test('degreeCentrality normalises by n-1 and reports raw degree', () => {
  const result = degreeCentrality(chain());
  assert.equal(result.metric, 'degree_centrality');
  assert.equal(result.raw.get('A'), 1);
  assert.equal(result.raw.get('B'), 2);
  assert.equal(result.raw.get('C'), 1);
  assert.equal(result.values.get('B'), 1);
  assert.equal(result.values.get('A'), 0.5);
  assert.ok(result.formula.includes('deg(v)'));
  assert.ok(result.limitations.length > 0);
});

test('degreeCentrality survives a single-node graph without dividing by zero', () => {
  const g = createGraph({ nodes: [node('A')], edges: [] });
  const result = degreeCentrality(g);
  assert.equal(result.values.get('A'), 0);
  assert.ok(Number.isFinite(result.values.get('A')));
});

test('weightedDegree sums edge weights and counts unknown ones separately', () => {
  const g = createGraph({
    nodes: [node('A'), node('B'), node('C')],
    edges: [
      edge('ab', 'A', 'B', 1, { value: 100 }),
      edge('bc', 'B', 'C', 1, { value: 50 }),
      edge('ca', 'C', 'A', 1), // value unknown
    ],
  });
  const result = weightedDegree(g);
  assert.equal(result.values.get('A'), 100);
  assert.equal(result.values.get('B'), 150);
  assert.equal(result.values.get('C'), 50);
  // The unknown edge must be visible, not silently folded into a zero.
  assert.equal(result.unknownEdges.get('A'), 1);
  assert.equal(result.unknownEdges.get('C'), 1);
  assert.equal(result.unknownEdges.get('B'), 0);
});

test('weightedDegree accepts an alternative weight accessor', () => {
  const g = createGraph({
    nodes: [node('A'), node('B')],
    edges: [edge('ab', 'A', 'B', 1, { volumeKg: 900 })],
  });
  const byVolume = weightedDegree(g, (e) => e.volumeKg);
  assert.equal(byVolume.values.get('A'), 900);
});

test('betweennessCentrality identifies the bridge node', () => {
  const result = betweennessCentrality(chain(), { normalise: false });
  // Only the pair (A,C) has a shortest path through B.
  assert.equal(result.values.get('B'), 1);
  assert.equal(result.values.get('A'), 0);
  assert.equal(result.values.get('C'), 0);
});

test('betweennessCentrality splits credit between equal-cost alternatives', () => {
  // S -> M1 -> T and S -> M2 -> T, equal cost. Each middle carries half.
  const g = createGraph({
    nodes: [node('S'), node('M1'), node('M2'), node('T')],
    edges: [
      edge('s1', 'S', 'M1'),
      edge('1t', 'M1', 'T'),
      edge('s2', 'S', 'M2'),
      edge('2t', 'M2', 'T'),
    ],
  });
  const result = betweennessCentrality(g, { normalise: false });
  assert.ok(Math.abs(result.values.get('M1') - 0.5) < 1e-12);
  assert.ok(Math.abs(result.values.get('M2') - 0.5) < 1e-12);
});

test('betweennessCentrality normalises by (n-1)(n-2)', () => {
  const result = betweennessCentrality(chain(), { normalise: true });
  // Raw 1, n = 3 -> 1 / (2 * 1) = 0.5.
  assert.ok(Math.abs(result.values.get('B') - 0.5) < 1e-12);
});

test('weighted betweenness follows edge cost, not hop count', () => {
  // Two routes S->T: a cheap two-hop and an expensive one-hop.
  const g = createGraph({
    nodes: [node('S'), node('M'), node('T')],
    edges: [
      edge('sm', 'S', 'M', 1),
      edge('mt', 'M', 'T', 1),
      edge('st', 'S', 'T', 100),
    ],
  });
  // Unweighted: the direct hop is shortest, so M carries nothing.
  const hops = betweennessCentrality(g, { normalise: false });
  assert.equal(hops.values.get('M'), 0);
  // Weighted: S-M-T costs 2 versus 100, so M carries the path.
  const weighted = betweennessCentrality(g, { weight: distanceCost, normalise: false });
  assert.equal(weighted.values.get('M'), 1);
  assert.equal(weighted.inputs.variant, 'weighted (Dijkstra)');
});

test('betweennessCentrality returns zeros for a disconnected graph', () => {
  const g = createGraph({ nodes: [node('A'), node('B')], edges: [] });
  const result = betweennessCentrality(g, { normalise: false });
  assert.equal(result.values.get('A'), 0);
  assert.equal(result.values.get('B'), 0);
});

test('herfindahlIndex matches the textbook definition', () => {
  // A monopoly scores 1.
  assert.equal(herfindahlIndex([100]).value, 1);
  // Four equal shares score 1/4.
  const four = herfindahlIndex([25, 25, 25, 25]);
  assert.ok(Math.abs(four.value - 0.25) < 1e-12);
  assert.ok(Math.abs(four.effectiveCount - 4) < 1e-9);
  // Ten equal shares score 1/10.
  const ten = herfindahlIndex(Array(10).fill(1));
  assert.ok(Math.abs(ten.value - 0.1) < 1e-12);
  // Absolute magnitudes do not matter, only shares.
  assert.ok(
    Math.abs(herfindahlIndex([2, 2]).value - herfindahlIndex([500, 500]).value) < 1e-12,
  );
});

test('herfindahlIndex interprets the conventional thresholds', () => {
  assert.equal(herfindahlIndex(Array(10).fill(1)).interpretation, 'Unconcentrated');
  assert.equal(herfindahlIndex([50, 30, 20]).interpretation, 'Highly concentrated');
  assert.equal(herfindahlIndex(Array(5).fill(1)).interpretation, 'Moderately concentrated');
});

test('herfindahlIndex reports a data gap rather than a fake zero', () => {
  const empty = herfindahlIndex([]);
  assert.equal(empty.value, null);
  assert.equal(empty.effectiveCount, null);
  assert.match(empty.interpretation, /DATA UNAVAILABLE/);
  assert.equal(herfindahlIndex([0, 0]).value, null);
  assert.equal(herfindahlIndex([-5]).value, null);
  assert.throws(() => herfindahlIndex('nope'), TypeError);
});

test('herfindahlIndex discards non-positive and non-finite shares, and says so', () => {
  const result = herfindahlIndex([50, 50, 0, -1, NaN, Infinity]);
  assert.ok(Math.abs(result.value - 0.5) < 1e-12);
  assert.equal(result.inputs.shareCount, 2);
  assert.equal(result.inputs.discarded, 4);
});

test('concentrationRatio sums the n largest shares', () => {
  const cr4 = concentrationRatio([40, 30, 20, 5, 3, 2], 4);
  // (40+30+20+5) / 100 = 0.95
  assert.ok(Math.abs(cr4.value - 0.95) < 1e-12);
  assert.equal(cr4.metric, 'cr4');
  const cr1 = concentrationRatio([40, 30, 20, 10], 1);
  assert.ok(Math.abs(cr1.value - 0.4) < 1e-12);
  // Asking for more participants than exist yields the whole total.
  assert.equal(concentrationRatio([10, 10], 9).value, 1);
  assert.equal(concentrationRatio([], 4).value, null);
  assert.throws(() => concentrationRatio([1], 0), RangeError);
});

test('HHI and CR4 can disagree, which is why both are reported', () => {
  // Four equal mid-sized participants plus a long tail.
  const shares = [20, 20, 20, 20, ...Array(20).fill(1)];
  const hhi = herfindahlIndex(shares);
  const cr4 = concentrationRatio(shares, 4);
  assert.ok(cr4.value > 0.79, `CR4 high: ${cr4.value}`);
  assert.ok(hhi.value < 0.25, `HHI not highly concentrated: ${hhi.value}`);
});

test('alternativeRouteAvailability measures single-node reroutability', () => {
  // A ---> B ---> D with a parallel A ---> C ---> D.
  const g = createGraph({
    nodes: [node('A'), node('B'), node('C'), node('D')],
    edges: [
      edge('ab', 'A', 'B', 10),
      edge('bd', 'B', 'D', 10),
      edge('ac', 'A', 'C', 15),
      edge('cd', 'C', 'D', 10),
    ],
  });
  const result = alternativeRouteAvailability(g, 'A', 'D', { kShortestPaths, withScenario });
  assert.equal(result.value, 1, 'removing B still leaves the C route');
  assert.equal(result.perNode.length, 1);
  assert.equal(result.perNode[0].removedNode, 'B');
  assert.equal(result.perNode[0].reroutable, true);
  // The alternative is 25 versus 20 baseline.
  assert.ok(Math.abs(result.perNode[0].costRatio - 1.25) < 1e-12);
});

test('alternativeRouteAvailability reports zero when a bridge has no alternative', () => {
  const result = alternativeRouteAvailability(chain(), 'A', 'C', {
    kShortestPaths,
    withScenario,
  });
  assert.equal(result.value, 0);
  assert.equal(result.perNode[0].reroutable, false);
  assert.equal(result.perNode[0].costRatio, null);
});

test('alternativeRouteAvailability reports a gap when no baseline route exists', () => {
  const g = createGraph({ nodes: [node('A'), node('B')], edges: [] });
  const result = alternativeRouteAvailability(g, 'A', 'B', { kShortestPaths, withScenario });
  assert.equal(result.value, null);
  assert.match(result.interpretation, /DATA UNAVAILABLE/);
});

test('a direct edge has no intermediate nodes to lose', () => {
  const g = createGraph({ nodes: [node('A'), node('B')], edges: [edge('ab', 'A', 'B', 5)] });
  const result = alternativeRouteAvailability(g, 'A', 'B', { kShortestPaths, withScenario });
  assert.equal(result.value, 1);
  assert.equal(result.perNode.length, 0);
});

test('every metric publishes a formula, inputs and limitations', () => {
  const g = chain();
  const results = [
    degreeCentrality(g),
    weightedDegree(g),
    betweennessCentrality(g),
    herfindahlIndex([1, 2, 3]),
    concentrationRatio([1, 2, 3], 2),
  ];
  for (const result of results) {
    assert.ok(result.metric, 'metric name');
    assert.ok(result.formula, `formula for ${result.metric}`);
    assert.ok(result.inputs, `inputs for ${result.metric}`);
    assert.ok(Array.isArray(result.limitations), `limitations for ${result.metric}`);
    assert.ok(result.limitations.length > 0, `non-empty limitations for ${result.metric}`);
    assert.ok(Object.isFrozen(result));
  }
});

test('methodology discloses shared limitations and names no composite score', () => {
  const m = methodology();
  assert.ok(m.sharedLimitations.length >= 3);
  assert.match(m.scope, /is a risk score/i);
  assert.match(m.scope, /none of these/i);
  assert.ok(!m.metrics.includes('risk_score'));
  assert.ok(Object.isFrozen(m));
});
