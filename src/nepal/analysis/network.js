/**
 * Stage 5 §5.8 — what the observed blockages did to connectivity.
 *
 * This module does NOT implement routing. The project already has a tested
 * graph, a Dijkstra, an A*, a Yen k-shortest-paths and a Brandes betweenness
 * in `src/supplychain/`, and a road-graph builder in `src/disaster/`. What is
 * missing, and what lives here, is the join: deciding which edge of a road
 * network an NGA obstruction marker belongs to, and measuring the difference
 * between the network with and without those edges.
 *
 * THE JOIN IS THE WHOLE DIFFICULTY. An obstruction marker is a 65 m line drawn
 * where an analyst saw a blockage. It carries no OpenStreetMap identifier, so
 * attaching it to an edge is a spatial guess with a tolerance, and the
 * tolerance decides the answer. Three things follow, and all three are
 * reported rather than assumed:
 *
 *   1. The match is reported as a CURVE over tolerances, not at one distance.
 *   2. A marker that matches no edge is counted and named. It usually means
 *      the blockage was on a road below tertiary class, or on a road nobody
 *      had mapped by April 2015 — which is a fact about the map, not about the
 *      blockage, and it must not vanish into a denominator.
 *   3. Disabling a whole edge for one marker is an OVER-statement of the
 *      blockage and is stated as one. `buildRoadGraph` cuts ways at junctions,
 *      so an edge has no junction in its interior: a vehicle that reaches an
 *      obstruction mid-edge cannot turn off before it, and for CONNECTIVITY
 *      the edge is indeed unusable. For LENGTH the same claim would be wrong,
 *      which is why no "kilometres of road closed" figure is produced here.
 */

import { withScenario } from '../../supplychain/graph.js';
import { shortestPath, routeDistanceKm } from '../../supplychain/routing.js';
import { betweennessCentrality } from '../../supplychain/centrality.js';
import {
  polylineToPolygonMetres,
  pointToSegmentMetres,
} from './infrastructure.js';
import { toUtm } from '../geo/crs.js';

/** Tolerances the blockage-to-edge match is reported across, in metres. */
export const SNAP_TOLERANCES_METRES = Object.freeze([25, 50, 100, 250, 500]);

/** Project a list of geographic positions into UTM 45N metres. */
function project(positions) {
  return positions.map(([lon, lat]) => {
    const { easting, northing } = toUtm(lon, lat);
    return [easting, northing];
  });
}

/** Shortest distance in metres between two projected polylines. */
function polylineDistanceMetres(a, b) {
  let best = Infinity;
  for (let i = 1; i < a.length; i += 1) {
    for (let j = 1; j < b.length; j += 1) {
      const distance = segmentDistance(a[i - 1], a[i], b[j - 1], b[j]);
      if (distance < best) best = distance;
      if (best === 0) return 0;
    }
  }
  if (a.length === 1) {
    for (let j = 1; j < b.length; j += 1) {
      best = Math.min(best, pointToSegmentMetres(a[0], b[j - 1], b[j]));
    }
  }
  return best;
}

function segmentDistance(p1, p2, q1, q2) {
  const cross = (u, v) => u[0] * v[1] - u[1] * v[0];
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1]];
  const r = sub(p2, p1);
  const s = sub(q2, q1);
  const denominator = cross(r, s);
  const qp = sub(q1, p1);
  if (denominator !== 0) {
    const t = cross(qp, s) / denominator;
    const u = cross(qp, r) / denominator;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(
    pointToSegmentMetres(p1, q1, q2),
    pointToSegmentMetres(p2, q1, q2),
    pointToSegmentMetres(q1, p1, p2),
    pointToSegmentMetres(q2, p1, p2),
  );
}

/**
 * A uniform grid index over edge bounding boxes.
 *
 * Without it, matching 179 markers against tens of thousands of edges is a
 * quadratic scan over every segment pair. The cell size is the search radius
 * so that a query reads a 3x3 block, which is the standard arrangement and
 * needs no tuning.
 */
function buildEdgeIndex(edges, cellMetres) {
  const index = new Map();
  const projected = new Map();
  for (const edge of edges) {
    const points = project(edge.coordinates ?? []);
    if (points.length === 0) continue;
    projected.set(edge.id, points);
    const cells = new Set();
    for (const [easting, northing] of points) {
      cells.add(
        `${Math.floor(easting / cellMetres)}:${Math.floor(northing / cellMetres)}`,
      );
    }
    /* A long edge must also register the cells its segments cross, not only
     * the ones its vertices land in, or a query beside its middle misses it. */
    for (let i = 1; i < points.length; i += 1) {
      const steps = Math.ceil(
        Math.hypot(
          points[i][0] - points[i - 1][0],
          points[i][1] - points[i - 1][1],
        ) / cellMetres,
      );
      for (let s = 1; s < steps; s += 1) {
        const t = s / steps;
        const easting =
          points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t;
        const northing =
          points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t;
        cells.add(
          `${Math.floor(easting / cellMetres)}:${Math.floor(northing / cellMetres)}`,
        );
      }
    }
    for (const cell of cells) {
      if (!index.has(cell)) index.set(cell, []);
      index.get(cell).push(edge.id);
    }
  }
  return { index, projected, cellMetres };
}

function candidatesNear(index, positions) {
  const found = new Set();
  for (const [easting, northing] of positions) {
    const col = Math.floor(easting / index.cellMetres);
    const row = Math.floor(northing / index.cellMetres);
    for (let dc = -1; dc <= 1; dc += 1) {
      for (let dr = -1; dr <= 1; dr += 1) {
        for (const id of index.index.get(`${col + dc}:${row + dr}`) ?? [])
          found.add(id);
      }
    }
  }
  return found;
}

/**
 * Match each observed blockage to the closest network edge.
 *
 * @param {object} graph a graph from `buildRoadGraph`
 * @param {Array<{id:string, kind:string, geometry:object}>} blockages
 * @param {object} [options]
 * @param {number[]} [options.tolerances] reported match curve, in metres
 * @returns {object} per-blockage matches, the curve, and the unmatched list
 */
export function matchBlockagesToEdges(
  graph,
  blockages,
  { tolerances = SNAP_TOLERANCES_METRES } = {},
) {
  const searchRadius = Math.max(...tolerances);
  const edges = graph.edges();
  /*
   * Only the forward direction is indexed. `buildRoadGraph` emits every edge
   * twice, once each way, over identical geometry; indexing both would double
   * the work and return the reverse twin as a second "match".
   */
  const forward = edges.filter((edge) => edge.id.endsWith('f'));
  const index = buildEdgeIndex(forward, searchRadius);
  const matches = [];
  for (const blockage of blockages) {
    const positions = project(
      blockage.geometry.type === 'Point'
        ? [blockage.geometry.coordinates]
        : blockage.geometry.coordinates,
    );
    let best = null;
    let bestDistance = Infinity;
    for (const id of candidatesNear(index, positions)) {
      const distance = polylineDistanceMetres(
        positions,
        index.projected.get(id),
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = id;
      }
    }
    matches.push({
      id: blockage.id,
      kind: blockage.kind,
      edgeId:
        Number.isFinite(bestDistance) && bestDistance <= searchRadius
          ? best
          : null,
      distanceMetres: Number.isFinite(bestDistance)
        ? Math.round(bestDistance)
        : null,
    });
  }
  const curve = tolerances.map((tolerance) => {
    const matched = matches.filter(
      (match) =>
        match.distanceMetres !== null && match.distanceMetres <= tolerance,
    );
    return Object.freeze({
      toleranceMetres: tolerance,
      matched: matched.length,
      matchedShare: Number(
        ((matched.length / matches.length) * 100).toFixed(1),
      ),
      distinctEdges: new Set(matched.map((match) => match.edgeId)).size,
    });
  });
  return Object.freeze({
    blockages: matches.length,
    matches: Object.freeze(matches.map((match) => Object.freeze(match))),
    curve: Object.freeze(curve),
    unmatchedNote:
      'A blockage that matches no edge at any tolerance sits on a road this network does not contain — below tertiary class, or unmapped in OpenStreetMap in April 2015. It is a gap in the map, not an absence of disruption, and it is excluded from the network result rather than counted as "no effect".',
  });
}

/**
 * Edge ids to disable for a chosen tolerance, both directions of each.
 *
 * Disabling only the forward twin would leave the road open one way, which is
 * not what a landslide does.
 */
export function disabledEdgesFor(matchResult, toleranceMetres) {
  const ids = new Set();
  for (const match of matchResult.matches) {
    if (
      match.edgeId &&
      match.distanceMetres !== null &&
      match.distanceMetres <= toleranceMetres
    ) {
      ids.add(match.edgeId);
      ids.add(`${match.edgeId.slice(0, -1)}r`);
    }
  }
  return [...ids];
}

/** Connected components by undirected reachability, largest first. */
export function componentProfile(graph) {
  const seen = new Set();
  const sizes = [];
  const componentOf = new Map();
  for (const start of graph.nodeIds()) {
    if (seen.has(start)) continue;
    const queue = [start];
    seen.add(start);
    const members = [];
    while (queue.length > 0) {
      const id = queue.pop();
      members.push(id);
      for (const edge of graph.outEdges(id)) {
        if (!seen.has(edge.to)) {
          seen.add(edge.to);
          queue.push(edge.to);
        }
      }
      for (const edge of graph.inEdges(id)) {
        if (!seen.has(edge.from)) {
          seen.add(edge.from);
          queue.push(edge.from);
        }
      }
    }
    const componentIndex = sizes.length;
    for (const id of members) componentOf.set(id, componentIndex);
    sizes.push(members.length);
  }
  const ordered = sizes
    .map((size, index) => ({ index, size }))
    .sort((a, b) => b.size - a.size);
  return Object.freeze({
    components: sizes.length,
    /* Sorted descending, for reporting. */
    sizes: Object.freeze(ordered.map((entry) => entry.size)),
    /* Indexed by component id, for looking up the component a node is in.
     * Keeping both is deliberate: an earlier version read the sorted array
     * with a component id and reported the wrong component's size. */
    sizeByComponent: Object.freeze([...sizes]),
    largest: ordered[0]?.size ?? 0,
    nodes: graph.nodeCount,
    componentOf,
    sizeOfNode: (id) => {
      const index = componentOf.get(id);
      return index === undefined ? null : sizes[index];
    },
    largestComponentIndex: ordered[0]?.index ?? null,
  });
}

/** The graph node nearest a position, and how far away it is. */
export function nearestNodeTo(graph, lon, lat) {
  const { easting, northing } = toUtm(lon, lat);
  let best = null;
  let bestDistance = Infinity;
  for (const node of graph.nodes()) {
    const projected = toUtm(node.lon, node.lat);
    const distance = Math.hypot(
      projected.easting - easting,
      projected.northing - northing,
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      best = node;
    }
  }
  return { node: best, distanceMetres: bestDistance };
}

/**
 * Route every origin-destination pair on the baseline and on the damaged
 * network, and classify what changed.
 *
 * THE FOUR OUTCOMES ARE KEPT APART ON PURPOSE.
 *   NOT_ROUTABLE_BASELINE — the pair could not be routed before the blockages
 *     either. That is a hole in the 2015 map, and reporting it as damage would
 *     turn a coverage gap into a finding.
 *   SEVERED — routable before, not after.
 *   DETOUR — routable both times, longer after.
 *   UNCHANGED — routable both times, same distance.
 */
export function routeImpact(baseline, damaged, pairs) {
  const rows = [];
  for (const pair of pairs) {
    const before = shortestPath(baseline, pair.from, pair.to);
    const after = before ? shortestPath(damaged, pair.from, pair.to) : null;
    let outcome;
    if (!before) outcome = 'NOT_ROUTABLE_BASELINE';
    else if (!after) outcome = 'SEVERED';
    else {
      const beforeKm = routeDistanceKm(baseline, before);
      const afterKm = routeDistanceKm(damaged, after);
      outcome = afterKm > beforeKm + 1e-6 ? 'DETOUR' : 'UNCHANGED';
      rows.push(
        Object.freeze({
          ...pair,
          outcome,
          baselineKm: Number(beforeKm.toFixed(2)),
          damagedKm: Number(afterKm.toFixed(2)),
          extraKm: Number((afterKm - beforeKm).toFixed(2)),
          extraShare: Number(
            (((afterKm - beforeKm) / beforeKm) * 100).toFixed(1),
          ),
        }),
      );
      continue;
    }
    rows.push(
      Object.freeze({
        ...pair,
        outcome,
        baselineKm: before
          ? Number(routeDistanceKm(baseline, before).toFixed(2))
          : null,
        damagedKm: null,
        extraKm: null,
        extraShare: null,
      }),
    );
  }
  const counts = rows.reduce((acc, row) => {
    acc[row.outcome] = (acc[row.outcome] ?? 0) + 1;
    return acc;
  }, {});
  const detours = rows.filter((row) => row.outcome === 'DETOUR');
  return Object.freeze({
    pairs: rows.length,
    outcomes: Object.freeze(counts),
    routes: Object.freeze(rows),
    detourExtraKm: Object.freeze({
      count: detours.length,
      totalExtraKm: Number(
        detours.reduce((a, b) => a + b.extraKm, 0).toFixed(2),
      ),
      maxExtraKm: detours.length
        ? Math.max(...detours.map((row) => row.extraKm))
        : null,
      medianExtraKm: detours.length
        ? detours.map((row) => row.extraKm).sort((a, b) => a - b)[
            Math.floor(detours.length / 2)
          ]
        : null,
    }),
    travelTimeNote:
      'NO TRAVEL TIME IS REPORTED. A detour distance is measured on the network; a detour DURATION would need road speeds, surface condition and post-earthquake traffic, none of which exists for April 2015 in any source this project holds. Multiplying kilometres by an assumed speed would produce a number that looks like evidence and is not.',
  });
}

/**
 * Betweenness before and after, and the junctions whose position in the
 * network changed most.
 *
 * `weight` is passed through to the project's own Brandes implementation
 * unchanged. On a graph of this size the unweighted (hop-count) variant is the
 * one that finishes, and what it ranks is how often a junction lies on a
 * shortest CHAIN OF ROADS between two other junctions — a topological measure
 * of how much the network depends on it, which is the question §5.8 asks.
 */
export function centralityShift(
  baseline,
  damaged,
  { weight = null, top = 15 } = {},
) {
  const beforeResult = betweennessCentrality(baseline, { weight });
  const afterResult = betweennessCentrality(damaged, { weight });
  /* The project's Brandes returns a methodology envelope, not a bare Map. */
  const before = beforeResult.values;
  const after = afterResult.values;
  const rows = [];
  for (const [id, value] of before) {
    const now = after.get(id) ?? 0;
    rows.push({ id, before: value, after: now, change: now - value });
  }
  rows.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const topBefore = [...before.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top);
  return Object.freeze({
    nodes: rows.length,
    weight: weight === null ? 'hop count' : 'distance',
    variant: beforeResult.inputs.variant,
    formula: beforeResult.formula,
    engineLimitations: beforeResult.limitations,
    mostChanged: Object.freeze(
      rows.slice(0, top).map((row) =>
        Object.freeze({
          id: row.id,
          before: Number(row.before.toFixed(6)),
          after: Number(row.after.toFixed(6)),
          change: Number(row.change.toFixed(6)),
        }),
      ),
    ),
    mostCentralBaseline: Object.freeze(
      topBefore.map(([id, value]) =>
        Object.freeze({
          id,
          betweenness: Number(value.toFixed(6)),
          node: baseline.node(id)
            ? { lon: baseline.node(id).lon, lat: baseline.node(id).lat }
            : null,
        }),
      ),
    ),
  });
}

/** Build the damaged view of a graph. A thin wrapper, kept for readability. */
export function damagedNetwork(graph, disabledEdges) {
  return withScenario(graph, { disabledEdges });
}

/** Re-exported so the pipeline does not reach past this module for geometry. */
export { polylineToPolygonMetres };
