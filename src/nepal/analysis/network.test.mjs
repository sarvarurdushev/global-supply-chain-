import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoadGraph } from '../../disaster/response.js';
import {
  SNAP_TOLERANCES_METRES,
  alternativeRoutes,
  centralityShift,
  componentProfile,
  damagedNetwork,
  disabledEdgesFor,
  matchBlockagesToEdges,
  nearestNodeTo,
  routeImpact,
} from './network.js';

/**
 * A small deliberate network.
 *
 *   A ---- B ---- C        the direct road, west to east along 27.0
 *   |             |
 *   D ---- E ---- F        a parallel road along 26.99, joined at both ends
 *
 * Blocking B-C forces the detour through D-E-F; blocking both severs C.
 */
function fixture() {
  return buildRoadGraph({
    segments: [
      { osmId: 1, coordinates: [[85.0, 27.0], [85.1, 27.0], [85.2, 27.0]], tags: { highway: 'primary' } },
      { osmId: 2, coordinates: [[85.0, 26.99], [85.1, 26.99], [85.2, 26.99]], tags: { highway: 'secondary' } },
      { osmId: 3, coordinates: [[85.0, 27.0], [85.0, 26.99]], tags: { highway: 'tertiary' } },
      { osmId: 4, coordinates: [[85.2, 27.0], [85.2, 26.99]], tags: { highway: 'tertiary' } },
    ],
  });
}

test('the fixture builds a connected graph with nodes only where roads meet', () => {
  const graph = fixture();
  /*
   * Four nodes, not six. The mid-points at 85.1 belong to one way each, so
   * they are SHAPE, not topology, and buildRoadGraph correctly leaves them
   * out. Only the four corners, where the long roads meet the connectors,
   * become nodes.
   */
  assert.equal(graph.nodeCount, 4);
  // Four undirected pieces, each emitted in both directions.
  assert.equal(graph.edgeCount, 8);
  const profile = componentProfile(graph);
  assert.equal(profile.components, 1);
  assert.equal(profile.largest, 4);
  assert.equal(profile.sizeOfNode(graph.nodeIds()[0]), 4);
});

test('a blockage attaches to the edge it lies on, and the curve is non-decreasing', () => {
  const graph = fixture();
  const blockages = [
    {
      id: 'on-the-road',
      kind: 'blocked-road',
      geometry: { type: 'LineString', coordinates: [[85.15, 27.0], [85.16, 27.0]] },
    },
    {
      /* About 220 m north of the road: inside the widest tolerance only. */
      id: 'nearby',
      kind: 'blocked-road',
      geometry: { type: 'LineString', coordinates: [[85.15, 27.002], [85.16, 27.002]] },
    },
    {
      id: 'far-away',
      kind: 'bridge-out',
      geometry: { type: 'Point', coordinates: [86.5, 28.5] },
    },
  ];
  const result = matchBlockagesToEdges(graph, blockages);
  const onRoad = result.matches.find((match) => match.id === 'on-the-road');
  /*
   * Within a metre rather than exactly zero, and that is geometry rather than
   * slop: a parallel of latitude is not a straight line in UTM, so the chord
   * from 85.0 to 85.2 sits about a metre off the parallel at its midpoint.
   * Demanding an exact zero here would be demanding a wrong projection.
   */
  assert.ok(onRoad.distanceMetres <= 2, `expected a metre or so, got ${onRoad.distanceMetres}`);
  assert.ok(onRoad.edgeId.endsWith('f'), 'only the forward twin is indexed');

  const far = result.matches.find((match) => match.id === 'far-away');
  assert.equal(far.edgeId, null);

  for (let i = 1; i < result.curve.length; i += 1) {
    assert.ok(result.curve[i].matched >= result.curve[i - 1].matched);
  }
  assert.equal(result.curve[0].toleranceMetres, SNAP_TOLERANCES_METRES[0]);
  assert.match(result.unmatchedNote, /gap in the map, not an absence of disruption/);
});

test('disabling an edge disables both directions of it', () => {
  const graph = fixture();
  const result = matchBlockagesToEdges(graph, [
    {
      id: 'b',
      kind: 'blocked-road',
      geometry: { type: 'LineString', coordinates: [[85.15, 27.0], [85.16, 27.0]] },
    },
  ]);
  const disabled = disabledEdgesFor(result, 50);
  assert.equal(disabled.length, 2);
  assert.ok(disabled.some((id) => id.endsWith('f')));
  assert.ok(disabled.some((id) => id.endsWith('r')));
});

test('a blockage on the direct road produces a detour, not a severance', () => {
  const graph = fixture();
  const matched = matchBlockagesToEdges(graph, [
    {
      id: 'b',
      kind: 'blocked-road',
      geometry: { type: 'LineString', coordinates: [[85.15, 27.0], [85.16, 27.0]] },
    },
  ]);
  const damaged = damagedNetwork(graph, disabledEdgesFor(matched, 50));
  const west = graph.nodes().find((node) => node.lon < 85.05 && node.lat > 26.995).id;
  const east = graph.nodes().find((node) => node.lon > 85.15 && node.lat > 26.995).id;
  const impact = routeImpact(graph, damaged, [{ from: west, to: east, label: 'west to east' }]);
  assert.equal(impact.outcomes.DETOUR, 1);
  const route = impact.routes[0];
  assert.ok(route.extraKm > 0, 'the detour must be longer');
  assert.ok(route.damagedKm > route.baselineKm);
  assert.match(impact.travelTimeNote, /NO TRAVEL TIME IS REPORTED/);
});

test('blocking both routes severs the pair, and disabling never adds connectivity', () => {
  const graph = fixture();
  const matched = matchBlockagesToEdges(graph, [
    { id: 'a', kind: 'blocked-road', geometry: { type: 'LineString', coordinates: [[85.15, 27.0], [85.16, 27.0]] } },
    { id: 'b', kind: 'blocked-road', geometry: { type: 'LineString', coordinates: [[85.15, 26.99], [85.16, 26.99]] } },
    { id: 'c', kind: 'blocked-road', geometry: { type: 'LineString', coordinates: [[85.2, 26.995], [85.2, 26.996]] } },
  ]);
  const damaged = damagedNetwork(graph, disabledEdgesFor(matched, 50));
  const west = graph.nodes().find((node) => node.lon < 85.05 && node.lat > 26.995).id;
  const east = graph.nodes().find((node) => node.lon > 85.15 && node.lat > 26.995).id;
  const impact = routeImpact(graph, damaged, [{ from: west, to: east, label: 'west to east' }]);
  assert.equal(impact.outcomes.SEVERED, 1);
  assert.equal(impact.routes[0].damagedKm, null);

  const before = componentProfile(graph);
  const after = componentProfile(damaged);
  assert.ok(after.components >= before.components);
  assert.ok(after.largest <= before.largest);
});

test('a pair unroutable before the blockages is reported as a coverage gap, not a severance', () => {
  const graph = buildRoadGraph({
    segments: [
      { osmId: 1, coordinates: [[85.0, 27.0], [85.1, 27.0]], tags: { highway: 'primary' } },
      /* A separate island with no connection to the first. */
      { osmId: 2, coordinates: [[86.0, 28.0], [86.1, 28.0]], tags: { highway: 'primary' } },
    ],
  });
  const island = graph.nodes().find((node) => node.lon > 85.9).id;
  const mainland = graph.nodes().find((node) => node.lon < 85.5).id;
  const impact = routeImpact(graph, damagedNetwork(graph, []), [
    { from: mainland, to: island, label: 'across the gap' },
  ]);
  assert.equal(impact.outcomes.NOT_ROUTABLE_BASELINE, 1);
  assert.equal(impact.outcomes.SEVERED, undefined);
});

test('the nearest node reports how far away it is', () => {
  const graph = fixture();
  const result = nearestNodeTo(graph, 85.0, 27.0);
  assert.ok(result.distanceMetres < 1);
  const far = nearestNodeTo(graph, 86.0, 28.0);
  assert.ok(far.distanceMetres > 100_000, 'a distant query must report the distance, not hide it');
});

test('centrality is read from the project engine envelope, not assumed to be a map', () => {
  const graph = fixture();
  const damaged = damagedNetwork(graph, []);
  const shift = centralityShift(graph, damaged, { weight: null, top: 3 });
  assert.equal(shift.nodes, graph.nodeCount);
  assert.equal(shift.mostChanged.length, 3);
  // Nothing was disabled, so nothing may have changed.
  assert.ok(shift.mostChanged.every((row) => Math.abs(row.change) < 1e-12));
  assert.ok(shift.mostCentralBaseline[0].node.lon !== undefined);
  assert.match(shift.variant, /unweighted/);
  assert.ok(shift.engineLimitations.length > 0);
});

test('alternative routes come from the existing k-shortest-paths and count what is lost', () => {
  const graph = fixture();
  const west = graph.nodes().find((node) => node.lon < 85.05 && node.lat > 26.995).id;
  const east = graph.nodes().find((node) => node.lon > 85.15 && node.lat > 26.995).id;
  const matched = matchBlockagesToEdges(graph, [
    {
      id: 'b',
      kind: 'blocked-road',
      geometry: { type: 'LineString', coordinates: [[85.15, 27.0], [85.16, 27.0]] },
    },
  ]);
  const damaged = damagedNetwork(graph, disabledEdgesFor(matched, 50));
  const result = alternativeRoutes(graph, damaged, [
    { from: west, to: east, label: 'west to east' },
  ]);
  const row = result.routes[0];
  // Two ways round the loop on the baseline; blocking the direct road leaves one.
  assert.ok(row.alternativesBaseline >= 2);
  assert.ok(row.alternativesDamaged < row.alternativesBaseline);
  assert.equal(row.lost, row.alternativesBaseline - row.alternativesDamaged);
  assert.equal(result.pairsThatLostAnAlternative, 1);
  // The detour is longer than the direct route, and both are reported.
  assert.ok(row.baselineLongestAlternativeKm > row.baselineKm);
  assert.match(result.note, /upper bound on redundancy/);
});

test('a saturated alternative-route count says so instead of reading as a finding', () => {
  /*
   * A ring of four nodes: Yen finds plenty of deviating paths, so a small k
   * saturates. The counter must then report that it measured its own cap,
   * because "no pair lost an alternative" would otherwise read as evidence
   * that redundancy survived.
   */
  const graph = buildRoadGraph({
    segments: [
      { osmId: 1, coordinates: [[85.0, 27.0], [85.1, 27.0]], tags: { highway: 'primary' } },
      { osmId: 2, coordinates: [[85.1, 27.0], [85.1, 27.1]], tags: { highway: 'primary' } },
      { osmId: 3, coordinates: [[85.1, 27.1], [85.0, 27.1]], tags: { highway: 'primary' } },
      { osmId: 4, coordinates: [[85.0, 27.1], [85.0, 27.0]], tags: { highway: 'primary' } },
    ],
  });
  const ids = graph.nodeIds();
  const result = alternativeRoutes(graph, damagedNetwork(graph, []), [
    { from: ids[0], to: ids[2], label: 'across the ring' },
  ], { k: 2 });
  assert.equal(result.saturated, true);
  assert.equal(result.pairsThatLostAnAlternative, 0);
  assert.match(result.verdict, /measured its own cap/);
  assert.match(result.verdict, /NOT that redundancy was unaffected/);
});
