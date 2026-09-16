/**
 * Route finding over the supply-chain graph.
 *
 * Dijkstra, A* and Yen's k-shortest-paths. All three operate on any graph-shaped
 * object, so they work identically on a baseline graph and on a scenario view
 * from `withScenario()` — which is what makes before/after disruption comparison
 * a like-for-like measurement rather than two different computations.
 *
 * IMPORTANT FRAMING (§13 of the brief): everything here computes a GEOGRAPHIC
 * alternative — a path that exists in the network. It does NOT establish that the
 * path is commercially feasible. Capacity, schedules, freight rates and carrier
 * willingness are commercial data this project does not hold. Callers must label
 * results accordingly; see `classifyAlternative()` at the end of this module.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

import { edgeDistanceKm } from './graph.js';
import { haversineKm } from './geo.js';

/** Path-key separator. Node ids never contain a newline, so this is unambiguous. */
const PATH_KEY_SEPARATOR = '\n';

/**
 * Binary min-heap keyed by numeric priority.
 *
 * A sorted-array frontier is O(n) per insert and dominates runtime once the
 * network reaches a few thousand edges, so the heap is worth its ~40 lines.
 */
class MinHeap {
  constructor() {
    this._items = [];
  }

  get size() {
    return this._items.length;
  }

  push(priority, value) {
    const items = this._items;
    items.push({ priority, value });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].priority <= items[i].priority) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop() {
    const items = this._items;
    if (items.length === 0) return undefined;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < items.length && items[l].priority < items[smallest].priority)
          smallest = l;
        if (r < items.length && items[r].priority < items[smallest].priority)
          smallest = r;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

/**
 * Default edge cost: distance in kilometres, scaled by any scenario penalty.
 *
 * Returns Infinity when the distance is unknown, which excludes the edge from
 * routing rather than treating an unknown as free.
 *
 * @param {object} graph
 * @param {object} edge
 * @returns {number}
 */
export function distanceCost(graph, edge) {
  const km = edgeDistanceKm(graph, edge);
  if (km === null) return Infinity;
  const penalty =
    typeof graph.penaltyFor === 'function' ? graph.penaltyFor(edge) : 1;
  return km * penalty;
}

function resolveCost(graph, edge, weight) {
  const cost = weight(graph, edge);
  if (typeof cost !== 'number' || Number.isNaN(cost)) {
    throw new TypeError(`Edge ${edge.id} produced a non-numeric cost`);
  }
  if (cost < 0) {
    // Dijkstra and A* both assume non-negative costs. Silently accepting a
    // negative edge would return a confidently wrong path.
    throw new RangeError(`Edge ${edge.id} has negative cost ${cost}`);
  }
  return cost;
}

/**
 * Shortest path by Dijkstra's algorithm.
 *
 * @param {object} graph
 * @param {string} source
 * @param {string} target
 * @param {object} [options]
 * @param {(graph:object, edge:object)=>number} [options.weight] edge cost
 * @param {Set<string>|string[]} [options.blockedNodes] nodes to avoid (Yen's spur handling)
 * @param {Set<string>|string[]} [options.blockedEdges] edges to avoid
 * @returns {{path:string[], edges:object[], cost:number}|null} null when unreachable
 */
export function shortestPath(graph, source, target, options = {}) {
  const {
    weight = distanceCost,
    blockedNodes = new Set(),
    blockedEdges = new Set(),
  } = options;
  const nodeBlock =
    blockedNodes instanceof Set ? blockedNodes : new Set(blockedNodes);
  const edgeBlock =
    blockedEdges instanceof Set ? blockedEdges : new Set(blockedEdges);

  if (!graph.hasNode(source) || !graph.hasNode(target)) return null;
  if (nodeBlock.has(source) || nodeBlock.has(target)) return null;
  if (source === target) return { path: [source], edges: [], cost: 0 };

  const dist = new Map([[source, 0]]);
  const prev = new Map();
  const settled = new Set();
  const heap = new MinHeap();
  heap.push(0, source);

  while (heap.size > 0) {
    const { priority, value: current } = heap.pop();
    if (settled.has(current)) continue;
    // A stale heap entry: a shorter route to this node was already settled.
    if (priority > (dist.get(current) ?? Infinity)) continue;
    settled.add(current);
    if (current === target) break;

    for (const edge of graph.outEdges(current)) {
      if (
        edgeBlock.has(edge.id) ||
        nodeBlock.has(edge.to) ||
        settled.has(edge.to)
      )
        continue;
      const cost = resolveCost(graph, edge, weight);
      if (!Number.isFinite(cost)) continue;
      const next = priority + cost;
      if (next < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, next);
        prev.set(edge.to, edge);
        heap.push(next, edge.to);
      }
    }
  }

  if (!dist.has(target) || !settled.has(target)) return null;
  return reconstruct(prev, source, target, dist.get(target));
}

function reconstruct(prev, source, target, cost) {
  const edges = [];
  let cursor = target;
  while (cursor !== source) {
    const edge = prev.get(cursor);
    if (!edge) return null;
    edges.push(edge);
    cursor = edge.from;
  }
  edges.reverse();
  return {
    path: [source, ...edges.map((e) => e.to)],
    edges,
    cost,
  };
}

/**
 * Great-circle distance from a node to the target, in kilometres.
 *
 * Returns 0 when either position is unknown — zero is the only admissible
 * fallback, since any positive guess could overestimate and break A*'s
 * optimality guarantee.
 *
 * @param {object} graph
 * @param {string} nodeId
 * @param {string} targetId
 * @returns {number}
 */
export function greatCircleHeuristic(graph, nodeId, targetId) {
  const a = graph.node(nodeId)?.position;
  const b = graph.node(targetId)?.position;
  if (!a || !b) return 0;
  return haversineKm(a, b);
}

/**
 * Shortest path by A*, using a geographic heuristic.
 *
 * The default heuristic is the great-circle distance to the target, which is
 * admissible (never overestimates) whenever the weight function is distance in
 * kilometres and every scenario penalty is >= 1. Under those conditions A*
 * returns the same optimal path as Dijkstra while expanding fewer nodes.
 *
 * With a non-distance weight function the caller MUST supply a matching
 * heuristic, or pass `heuristic: () => 0` to degrade to Dijkstra. An inadmissible
 * heuristic silently returns suboptimal paths.
 *
 * @param {object} graph
 * @param {string} source
 * @param {string} target
 * @param {object} [options]
 * @param {(graph:object, edge:object)=>number} [options.weight]
 * @param {(graph:object, nodeId:string, targetId:string)=>number} [options.heuristic]
 * @returns {{path:string[], edges:object[], cost:number, expanded:number}|null}
 */
export function aStarPath(graph, source, target, options = {}) {
  const { weight = distanceCost, heuristic = greatCircleHeuristic } = options;
  if (!graph.hasNode(source) || !graph.hasNode(target)) return null;
  if (source === target)
    return { path: [source], edges: [], cost: 0, expanded: 0 };

  const g = new Map([[source, 0]]);
  const prev = new Map();
  const settled = new Set();
  const heap = new MinHeap();
  heap.push(heuristic(graph, source, target), source);
  let expanded = 0;

  while (heap.size > 0) {
    const { value: current } = heap.pop();
    if (settled.has(current)) continue;
    settled.add(current);
    expanded += 1;
    if (current === target) {
      return {
        ...reconstruct(prev, source, target, g.get(target)),
        expanded,
      };
    }

    const base = g.get(current);
    for (const edge of graph.outEdges(current)) {
      if (settled.has(edge.to)) continue;
      const cost = resolveCost(graph, edge, weight);
      if (!Number.isFinite(cost)) continue;
      const tentative = base + cost;
      if (tentative < (g.get(edge.to) ?? Infinity)) {
        g.set(edge.to, tentative);
        prev.set(edge.to, edge);
        heap.push(tentative + heuristic(graph, edge.to, target), edge.to);
      }
    }
  }
  return null;
}

/**
 * The k shortest loopless paths, by Yen's algorithm.
 *
 * This is what answers "what alternative routes exist" (§13). Yen's yields paths
 * in non-decreasing cost order, so the second path is genuinely the best
 * alternative rather than an arbitrary other route.
 *
 * Complexity is O(k · n · (m + n log n)); k is expected to be small (3–10).
 *
 * @param {object} graph
 * @param {string} source
 * @param {string} target
 * @param {number} [k=3]
 * @param {object} [options]
 * @param {(graph:object, edge:object)=>number} [options.weight]
 * @returns {Array<{path:string[], edges:object[], cost:number}>} up to k paths
 */
export function kShortestPaths(graph, source, target, k = 3, options = {}) {
  if (!Number.isInteger(k) || k < 1) {
    throw new RangeError('k must be a positive integer');
  }
  const { weight = distanceCost } = options;
  const first = shortestPath(graph, source, target, { weight });
  if (!first) return [];

  const accepted = [first];
  /** @type {Array<{path:string[], edges:object[], cost:number}>} */
  const candidates = [];
  const seen = new Set([first.path.join(PATH_KEY_SEPARATOR)]);

  for (let i = 1; i < k; i += 1) {
    const previous = accepted[i - 1];

    for (
      let spurIndex = 0;
      spurIndex < previous.path.length - 1;
      spurIndex += 1
    ) {
      const spurNode = previous.path[spurIndex];
      const rootPath = previous.path.slice(0, spurIndex + 1);
      const rootEdges = previous.edges.slice(0, spurIndex);

      // Remove the edges that would simply reproduce an already-accepted path.
      const blockedEdges = new Set();
      for (const candidate of accepted) {
        if (
          candidate.path.length > spurIndex &&
          samePrefix(candidate.path, rootPath, spurIndex + 1)
        ) {
          const edge = candidate.edges[spurIndex];
          if (edge) blockedEdges.add(edge.id);
        }
      }
      // Remove the root path's own nodes so the spur cannot loop back into it.
      const blockedNodes = new Set(rootPath.slice(0, -1));

      const spur = shortestPath(graph, spurNode, target, {
        weight,
        blockedNodes,
        blockedEdges,
      });
      if (!spur) continue;

      const totalEdges = [...rootEdges, ...spur.edges];
      const totalPath = [...rootPath.slice(0, -1), ...spur.path];
      const key = totalPath.join(PATH_KEY_SEPARATOR);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        path: totalPath,
        edges: totalEdges,
        cost: totalEdges.reduce(
          (sum, e) => sum + resolveCost(graph, e, weight),
          0,
        ),
      });
    }

    if (candidates.length === 0) break;
    candidates.sort((a, b) => a.cost - b.cost || a.path.length - b.path.length);
    accepted.push(candidates.shift());
  }

  return accepted;
}

function samePrefix(a, b, length) {
  if (a.length < length || b.length < length) return false;
  for (let i = 0; i < length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Total great-circle distance along a path, in kilometres.
 * Returns null when any leg's distance is unknown, rather than under-reporting.
 *
 * @param {object} graph
 * @param {{edges:object[]}} route
 * @returns {number|null}
 */
export function routeDistanceKm(graph, route) {
  let total = 0;
  for (const edge of route.edges) {
    const km = edgeDistanceKm(graph, edge);
    if (km === null) return null;
    total += km;
  }
  return total;
}

/**
 * Number of transshipments on a path — intermediate nodes where cargo changes
 * vehicle. Endpoints do not count.
 *
 * @param {{path:string[]}} route
 * @returns {number}
 */
export function transshipmentCount(route) {
  return Math.max(0, route.path.length - 2);
}

/**
 * Label an alternative route by how well the data supports it.
 *
 * §13 of the brief requires this distinction to be explicit. We can almost always
 * establish that a path exists geographically. We can only call it operationally
 * validated when every edge carries capacity data AND observed utilisation —
 * which this project's public sources do not currently provide for maritime
 * routes (see docs/DATA_AVAILABILITY_MATRIX.md §3, row 6).
 *
 * @param {object} graph
 * @param {{edges:object[]}} route
 * @returns {{kind:string, reason:string, missing:string[]}}
 */
export function classifyAlternative(graph, route) {
  const missing = [];
  for (const edge of route.edges) {
    if (edge.capacity === null || edge.capacity === undefined) {
      missing.push(`${edge.id}: no capacity data`);
    }
    if (edge.attributes?.observedUtilisation === undefined) {
      missing.push(`${edge.id}: no observed utilisation`);
    }
  }
  if (missing.length === 0) {
    return Object.freeze({
      kind: 'OPERATIONALLY_VALIDATED_ALTERNATIVE',
      reason: 'Every leg carries both capacity and observed utilisation data.',
      missing: Object.freeze([]),
    });
  }
  return Object.freeze({
    kind: 'GEOGRAPHIC_ALTERNATIVE',
    reason:
      'This path exists in the network, but the data needed to establish ' +
      'commercial feasibility (capacity and observed utilisation on every leg) ' +
      'is not available.',
    missing: Object.freeze(missing),
  });
}
