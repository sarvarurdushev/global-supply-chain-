import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  BLOCKED_STYLE,
  DIMMED_STYLE,
  ROAD_STYLE,
  ROUTE_OUTCOME,
  describeRoute,
  networkDrawables,
  routeDrawables,
  solveArtefactRoute,
  verifyRoute,
} from './network.js';
import { buildRoadGraph } from '../../disaster/response.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = async (name) =>
  JSON.parse(await readFile(`${ROOT}data/${name}`, 'utf8'));

let cached = null;
async function realNetwork() {
  if (cached) return cached;
  const roads = await read('processed/nepal-2015-osm-roads.json');
  const infra = await read('analysis/nepal-2015-infrastructure-analysis.json');
  const graph = buildRoadGraph({ segments: roads.data.segments });
  cached = { graph, net: infra.results.network, edges: [...graph.edges()] };
  return cached;
}

test('the network draws forward edges only, and marks the closed ones', () => {
  const edges = [
    { id: 'e1f', coordinates: [[85, 27], [85.1, 27]], highway: 'trunk' },
    { id: 'e1r', coordinates: [[85.1, 27], [85, 27]], highway: 'trunk' },
    { id: 'e2f', coordinates: [[85, 28], [85.1, 28]], highway: 'tertiary' },
    { id: 'e2r', coordinates: [[85.1, 28], [85, 28]], highway: 'tertiary' },
    { id: 'e3f', coordinates: [[85, 29]], highway: 'primary' },
  ];
  const drawn = networkDrawables(edges, { disabledEdgeIds: ['e2f', 'e2r'] });
  /*
   * Both directions carry identical geometry, so drawing both doubles the
   * work and changes nothing on screen. A one-point edge is not a line.
   */
  assert.deepEqual(
    drawn.map((item) => item.id),
    ['e1f', 'e2f'],
  );
  assert.equal(drawn[0].colour, ROAD_STYLE.trunk.colour);
  assert.equal(drawn[0].blocked, false);
  assert.equal(drawn[0].grammar.chip, 'OFFICIAL', 'a mapped road is not an observation');

  assert.equal(drawn[1].colour, BLOCKED_STYLE.colour);
  assert.equal(drawn[1].blocked, true);
  assert.ok(drawn[1].width > drawn[0].width, 'a closure reads first');
  assert.equal(drawn[1].grammar.chip, 'OBSERVED', 'somebody recorded this one');

  /* A class filter thins the draw and nothing else. */
  const trunkOnly = networkDrawables(edges, { classes: ['trunk'] });
  assert.deepEqual(trunkOnly.map((item) => item.id), ['e1f']);
  assert.deepEqual(networkDrawables(null), []);
});

test('all fourteen of the artefact route figures reproduce exactly', async () => {
  /*
   * THE INTEGRITY CHECK THIS WHOLE MODULE EXISTS FOR. Scene 14 is the only
   * place the frontend runs the same engine the analysis ran, so its answer
   * must be the analysis's answer. The `disabledEdgeIds` the pipeline now
   * publishes are what make this possible without a second implementation of
   * the 25 m blockage matching.
   */
  const { graph, net } = await realNetwork();
  const disabledEdgeIds = net.blockageMatching.disabledEdgeIds;
  assert.equal(disabledEdgeIds.length, 20, 'ten edges, both directions');
  assert.equal(net.blockageMatching.distinctEdgesDisabled, 10);

  const failures = [];
  for (const pair of net.routes.routes) {
    const solved = solveArtefactRoute(graph, pair, { disabledEdgeIds });
    const problems = verifyRoute(solved);
    if (problems.length > 0) failures.push(`${pair.label}: ${problems.join('; ')}`);
  }
  assert.deepEqual(failures, []);
});

test('the detour is drawn as two lines, and the constructed one says so', async () => {
  const { graph, net } = await realNetwork();
  const detour = net.routes.routes.find((pair) => pair.outcome === 'DETOUR');
  assert.ok(detour, 'the artefact has exactly one detour pair');
  const solved = solveArtefactRoute(graph, detour, {
    disabledEdgeIds: net.blockageMatching.disabledEdgeIds,
  });
  const lines = routeDrawables(solved);

  assert.equal(lines['route-baseline'].length, 1);
  assert.equal(lines['route-damaged'].length, 1);
  const damaged = lines['route-damaged'][0];
  assert.equal(damaged.grammar.chip, 'MODELED');
  assert.ok(damaged.width > lines['route-baseline'][0].width);
  assert.ok(damaged.positions.length > 2);
  /* The label carries the distance, and only the distance. */
  assert.match(damaged.label, /83\.5 km/);
  /* `h\b` was the first pattern here and it matched "with". */
  assert.doesNotMatch(damaged.label, /hour|minute|\d\s*(h|min)\b|km\/h/i);

  assert.equal(
    Number(solved.damaged.distanceKm.toFixed(2)),
    detour.damagedKm,
  );
  assert.equal(
    Number(solved.baseline.distanceKm.toFixed(2)),
    detour.baselineKm,
  );
});

test('a mismatch between the drawn line and the artefact is reported', () => {
  /*
   * The check has to be able to fail, or it is decoration. A tolerance of
   * 20 m covers the artefact's two-decimal rounding and nothing else.
   */
  const solved = {
    pair: { baselineKm: 74.33, damagedKm: 83.49 },
    baseline: { distanceKm: 74.335 },
    damaged: { distanceKm: 91.2 },
  };
  const problems = verifyRoute(solved);
  assert.equal(problems.length, 1, 'the baseline is within rounding');
  assert.match(problems[0], /with closures: drew 91\.20 km, artefact publishes 83\.49 km/);

  /* Not routable on both sides is agreement, not a problem. */
  assert.deepEqual(
    verifyRoute({
      pair: { baselineKm: null, damagedKm: null },
      baseline: null,
      damaged: null,
    }),
    [],
  );
  /* One side missing is a problem, stated in both directions. */
  assert.match(
    verifyRoute({
      pair: { baselineKm: 10, damagedKm: null },
      baseline: null,
      damaged: null,
    })[0],
    /artefact says 10, the map found no path/,
  );
  assert.deepEqual(verifyRoute(null), ['no route was solved']);
});

test('a route is described in distance, never in time', async () => {
  const { net } = await realNetwork();
  for (const pair of net.routes.routes) {
    const rows = describeRoute(pair);
    const text = rows.flat().join(' ');
    /*
     * The infrastructure artefact's own data-gap list says no open source
     * publishes April 2015 road speeds or surface condition for Nepal. An
     * hours figure here would be a number with nothing behind it.
     */
    assert.doesNotMatch(
      text,
      /hour|minute|\bmin\b|km\/h|travel time|speed|drive|reachable within/i,
      `${pair.label} reports a time`,
    );
    assert.ok(rows.length >= 2, `${pair.label} says almost nothing`);
    assert.equal(rows[0][0], 'Outcome');
  }

  /* An unreachable district is named as a coverage gap, not as severance. */
  const gap = net.routes.routes.find(
    (pair) => pair.outcome === 'NOT_ROUTABLE_BASELINE',
  );
  assert.ok(gap);
  assert.match(
    ROUTE_OUTCOME.NOT_ROUTABLE_BASELINE.plain,
    /gap in what OpenStreetMap held/,
  );
  assert.doesNotMatch(ROUTE_OUTCOME.NOT_ROUTABLE_BASELINE.plain, /earthquake closed|cut off by/i);

  /* The 30 km snap distance is a row, because it is the whole story. */
  const rows = describeRoute(gap);
  assert.ok(
    rows.some(([label]) => /distance from the mapped network/.test(label)),
  );
  assert.deepEqual(describeRoute(null), []);
});

test('a scene that draws a route makes the network its background', () => {
  /*
   * At full weight 2,727 road lines buried the route entirely — same greens,
   * same cyans, and the answer to the scene's question was invisible while
   * sitting correctly in the scene graph.
   */
  const edges = [
    { id: 'e1f', coordinates: [[85, 27], [85.1, 27]], highway: 'trunk' },
    { id: 'e2f', coordinates: [[85, 28], [85.1, 28]], highway: 'primary' },
  ];
  const plain = networkDrawables(edges);
  const dim = networkDrawables(edges, { dimmed: true });
  assert.notEqual(dim[0].colour, plain[0].colour);
  assert.equal(dim[0].colour, dim[1].colour, 'class stops mattering in context');
  assert.ok(dim[0].fillOverride < 0.5);

  /* A closure keeps its red: it is the reason the route moved. */
  const withClosure = networkDrawables(edges, {
    dimmed: true,
    disabledEdgeIds: ['e1f'],
  });
  assert.equal(withClosure[0].colour, BLOCKED_STYLE.colour);
  assert.equal(withClosure[0].fillOverride, undefined);
  assert.ok(withClosure[0].width > withClosure[1].width);
});

test('neither route line is drawn in a road class colour', () => {
  const solved = {
    pair: { baselineKm: 1, damagedKm: 2 },
    baseline: { coordinates: [[85, 27], [85.1, 27]], distanceKm: 1 },
    damaged: { coordinates: [[85, 27], [85.2, 27]], distanceKm: 2 },
  };
  const lines = routeDrawables(solved);
  const roadColours = new Set(
    Object.values(ROAD_STYLE).map((style) => style.colour),
  );
  for (const layer of ['route-baseline', 'route-damaged']) {
    const drawn = lines[layer][0];
    assert.ok(
      !roadColours.has(drawn.colour),
      `${layer} is drawn in ${drawn.colour}, a road class colour`,
    );
  }
});
