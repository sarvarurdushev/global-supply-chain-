import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSUMED_SPEEDS,
  ROUTE_PURPOSE,
  aidCorridors,
  buildRoadGraph,
  evacuationScenarios,
  formatHours,
  nearestNode,
  routeAlternatives,
  solveRoute,
} from './response.js';

/** Two parallel routes between the same pair of endpoints. */
const SEGMENTS = [
  { osmId: 'w/1', coordinates: [[85.0, 28.0], [85.1, 28.05]], tags: { name: 'Main Road', highway: 'trunk' } },
  { osmId: 'w/2', coordinates: [[85.1, 28.05], [85.2, 28.1]], tags: { name: 'Main Road', highway: 'trunk' } },
  { osmId: 'w/3', coordinates: [[85.0, 28.0], [85.05, 27.9]], tags: { name: 'South Bypass', highway: 'secondary' } },
  { osmId: 'w/4', coordinates: [[85.05, 27.9], [85.2, 28.1]], tags: { name: 'South Bypass', highway: 'secondary' } },
];
const BASE = { lat: 28.0, lon: 85.0, label: 'Rescue base' };
const VILLAGE = { lat: 28.1, lon: 85.2, label: 'Affected village' };

const graph = () => buildRoadGraph({ segments: SEGMENTS });
const edgesNamed = (g, name) => g.edges().filter((e) => e.name === name).map((e) => e.id);

test('the graph is undirected, because a closure blocks both ways', () => {
  /*
   * A directed-only graph solves aid arriving and silently fails evacuation
   * leaving, which run in opposite directions over the same roads.
   */
  const g = graph();
  assert.equal(g.nodeCount, 4);
  assert.equal(g.edgeCount, SEGMENTS.length * 2);
  const out = solveRoute({ graph: g, from: BASE, to: VILLAGE });
  const back = solveRoute({ graph: g, from: VILLAGE, to: BASE });
  assert.equal(out.ok, true);
  assert.equal(back.ok, true);
  assert.ok(Math.abs(out.distanceKm - back.distanceKm) < 0.01);
});

test('a solved route returns drawable geometry, not just a cost', () => {
  // §14: the answer is a line on the map.
  const route = solveRoute({ graph: graph(), from: BASE, to: VILLAGE });
  assert.ok(route.coordinates.length >= 3);
  assert.ok(route.coordinates.every((point) => Array.isArray(point) && point.length === 2));
  assert.ok(route.distanceKm > 0);
  assert.ok(route.travelHours > 0);
  assert.deepEqual([...route.roads], ['Main Road']);
  assert.equal(route.purpose, ROUTE_PURPOSE.RESCUE);
});

test('a route states the speed it assumed', () => {
  /*
   * No open source publishes post-disaster road speeds, so the assumption
   * carries the travel time and belongs in the output rather than in a
   * constant nobody reads.
   */
  const route = solveRoute({
    graph: graph(),
    from: BASE,
    to: VILLAGE,
    speedKmh: ASSUMED_SPEEDS.MOUNTAIN,
  });
  assert.equal(route.speedKmh, 15);
  assert.match(route.speedAssumption, /stated assumption, not a measurement/);
  // Halving the speed doubles the time, so the field is actually used.
  const slow = solveRoute({ graph: graph(), from: BASE, to: VILLAGE, speedKmh: 7.5 });
  assert.ok(Math.abs(slow.travelHours - route.travelHours * 2) < 0.01);
});

test('blocking the main road produces a real second-best path', () => {
  /*
   * Route B is a genuine alternative through the mapped network, not a curve
   * drawn beside Route A.
   */
  const g = graph();
  const result = routeAlternatives({
    graph: g,
    from: BASE,
    to: VILLAGE,
    blockedEdges: edgesNamed(g, 'Main Road'),
  });
  assert.equal(result.verdict, 'DETOUR');
  assert.deepEqual([...result.after.roads], ['South Bypass']);
  assert.ok(result.additionalKm > 5);
  assert.ok(result.additionalHours > 0);
  assert.match(result.finding, /adds \d+ km/);
});

test('severance is reported as severance, not as an empty result', () => {
  /*
   * "No alternative exists" is the most important finding this function can
   * produce, so it must not look like a failure to compute one.
   */
  const g = graph();
  const result = routeAlternatives({
    graph: g,
    from: BASE,
    to: VILLAGE,
    blockedEdges: g.edges().map((e) => e.id),
  });
  assert.equal(result.verdict, 'SEVERED');
  assert.match(result.finding, /severed/);
  assert.match(result.finding, /air access or clearing the route/);
  assert.equal(result.additionalKm, null);
  assert.equal(result.after.reason, 'NO_PATH');
});

test('closures that change nothing are reported as unaffected', () => {
  const g = graph();
  const result = routeAlternatives({
    graph: g,
    from: BASE,
    to: VILLAGE,
    blockedEdges: edgesNamed(g, 'South Bypass'),
  });
  assert.equal(result.verdict, 'UNAFFECTED');
  assert.match(result.finding, /equivalent path remains/);
});

test('an endpoint off the mapped network is a coverage statement, not a finding', () => {
  /*
   * Distinct from NO_PATH: this says the road data does not reach here, which
   * is about OSM coverage rather than about the disaster.
   */
  const route = solveRoute({
    graph: graph(),
    from: BASE,
    to: { lat: 0, lon: 0, label: 'Null Island' },
  });
  assert.equal(route.ok, false);
  assert.equal(route.reason, 'ENDPOINT_OFF_NETWORK');
  assert.match(route.detail, /No mapped road within 25 km/);
});

test('nearestNode refuses a point beyond its radius', () => {
  const g = graph();
  assert.ok(nearestNode(g, { lat: 28.0, lon: 85.0 }));
  assert.equal(nearestNode(g, { lat: 0, lon: 0 }), null);
  assert.equal(nearestNode(g, { lat: 28.9, lon: 85.0 }, 5), null);
});

/* ------------------------------------------------------------------ *
 * §15 evacuation scenarios
 * ------------------------------------------------------------------ */

test('scenarios show how the feasible answer changes as roads close', () => {
  const g = graph();
  const out = evacuationScenarios({
    graph: g,
    origin: BASE,
    safeZones: [
      { lat: 28.1, lon: 85.2, label: 'Village high ground', capacity: 400 },
      { lat: 27.9, lon: 85.05, label: 'South shelter' },
    ],
    scenarios: [
      { id: 'a', name: 'Scenario A — open', blockedEdges: [] },
      { id: 'b', name: 'Scenario B — main blocked', blockedEdges: edgesNamed(g, 'Main Road') },
      { id: 'c', name: 'Scenario C — all blocked', blockedEdges: g.edges().map((e) => e.id) },
    ],
  });
  assert.equal(out.scenarios.length, 3);
  assert.equal(out.comparison[0].reachable, 2);
  assert.equal(out.comparison[2].reachable, 0);
  // The zero case is a finding about the scenario, not a routing error.
  assert.match(out.scenarios[2].finding, /scenario’s finding, not a routing failure/);
  assert.equal(out.scenarios[2].best, null);
  // Capacity is summed only over reachable zones that published one.
  assert.equal(out.scenarios[0].reachableCapacity, 400);
  assert.equal(out.scenarios[2].reachableCapacity, null);
  assert.match(out.caveat, /MODELLED hazard exposure, not reported road damage/);
});

test('reachable zones are ordered by the time the panel displays', () => {
  // Sorting by distance while showing time invites a misread.
  const out = evacuationScenarios({
    graph: graph(),
    origin: BASE,
    safeZones: [
      { lat: 28.1, lon: 85.2, label: 'Far' },
      { lat: 27.9, lon: 85.05, label: 'Near' },
    ],
    scenarios: [{ id: 'a', name: 'A', blockedEdges: [] }],
  });
  const reachable = out.scenarios[0].options.filter((o) => o.reachable);
  const hours = reachable.map((o) => o.route.travelHours);
  assert.equal(out.scenarios[0].best.zone.label, 'Near');
  assert.ok(Math.min(...hours) === out.scenarios[0].best.route.travelHours);
});

test('evacuation routes use walking speed, not driving speed', () => {
  const out = evacuationScenarios({
    graph: graph(),
    origin: BASE,
    safeZones: [{ lat: 28.1, lon: 85.2, label: 'High ground' }],
    scenarios: [{ id: 'a', name: 'A', blockedEdges: [] }],
  });
  assert.equal(out.scenarios[0].best.route.speedKmh, ASSUMED_SPEEDS.FOOT);
  assert.equal(out.scenarios[0].best.route.purpose, ROUTE_PURPOSE.EVACUATION);
});

/* ------------------------------------------------------------------ *
 * §16 humanitarian logistics
 * ------------------------------------------------------------------ */

test('aid corridors solve Need → Supply → Route → Destination', () => {
  const out = aidCorridors({
    graph: graph(),
    supplyPoints: [{ lat: 28.0, lon: 85.0, label: 'Depot' }],
    demandPoints: [
      { lat: 28.1, lon: 85.2, label: 'Village', people: 12_000 },
      { lat: 0, lon: 0, label: 'Unreachable' },
    ],
  });
  assert.equal(out.servableCount, 1);
  assert.equal(out.totalDemand, 2);
  const village = out.corridors.find((item) => item.demand.label === 'Village');
  assert.ok(village.servable);
  assert.ok(village.best.coordinates.length > 2);
  assert.match(village.finding, /Servable from Depot/);
  assert.match(village.requirementNote, /12,000 people/);
  // Tonnage is not published and is not invented.
  assert.match(village.requirementNote, /not published and is not estimated here/);
  const unreachable = out.unservable[0];
  assert.match(unreachable.finding, /Air access or a cleared route/);
  assert.match(unreachable.requirementNote, /not recorded/);
});

test('hours are formatted for a person, not as a decimal', () => {
  assert.equal(formatHours(0.5), '30 minutes');
  assert.equal(formatHours(2), '2 hours');
  assert.equal(formatHours(3.5), '3 h 30 min');
  assert.equal(formatHours(14.4), '14 hours');
  assert.equal(formatHours(null), 'an unknown time');
  assert.equal(formatHours(NaN), 'an unknown time');
});

test('a degenerate network yields no route rather than a bad one', () => {
  const g = buildRoadGraph({
    segments: [
      { osmId: 'w/1', coordinates: [[85, 28]] },
      { osmId: 'w/2', coordinates: [[85, 28], [85, 28]] },
      { osmId: 'w/3', coordinates: [] },
      null,
    ],
  });
  assert.equal(g.edgeCount, 0);
  // No orphan nodes either: a dropped segment must not leave its endpoints.
  assert.equal(g.nodeCount, 0);
  const route = solveRoute({ graph: g, from: BASE, to: VILLAGE });
  assert.equal(route.ok, false);
  assert.equal(route.reason, 'ENDPOINT_OFF_NETWORK');
});

test('two endpoints that snap to one node cannot report a zero-km route', () => {
  /*
   * The bug this pins down: with a sparse network both ends resolved to the
   * same node, shortestPath returned a trivial zero-cost path, and a village
   * 22 km away was reported as reachable in no time at all.
   */
  /*
   * One long edge, and two query points that are both nearest to the same
   * end of it — which is what a sparse rural network looks like when two
   * villages share the only mapped junction for miles.
   */
  const g = buildRoadGraph({
    segments: [
      { osmId: 'w/1', coordinates: [[85.0, 28.0], [86.0, 28.0]], tags: { name: 'Long road' } },
    ],
  });
  assert.equal(g.nodeCount, 2);
  const route = solveRoute({
    graph: g,
    from: { lat: 28.02, lon: 85.02, label: 'Village A' },
    to: { lat: 28.04, lon: 85.04, label: 'Village B' },
  });
  assert.equal(route.ok, false);
  assert.equal(route.reason, 'ENDPOINTS_INDISTINGUISHABLE');
  assert.match(route.detail, /too sparse/);
});
