/**
 * Network distance to the nearest facility, for a road network too large for
 * the object graph in `src/supplychain/`.
 *
 * The 2015 access network has hundreds of thousands of edges; answering
 * "how far is the nearest hospital from every populated cell" one origin at a
 * time would be hundreds of thousands of searches. The standard answer is to
 * run ONE search outward from every facility at once (a multi-source
 * Dijkstra): the first facility to reach a junction is its nearest, by
 * network distance, and the whole map is answered in one pass.
 *
 * Roads are treated as undirected: the network records no one-way rules for
 * April 2015 tracks and hill roads, and a rescue team drives both ways.
 * Distances are metres ALONG MAPPED ROADS — not time. No road speeds exist
 * for the date (see the Stage 5 data gaps), so nothing here is a travel time
 * and nothing downstream may call it one.
 *
 * Pure: typed arrays in, typed arrays out; no I/O.
 */

/**
 * Compressed adjacency (CSR) over an undirected edge list.
 * @param {number} nodeCount
 * @param {Array<[number, number, number]>} edges [from, to, metres, ...]
 */
export function buildCsr(nodeCount, edges) {
  const degree = new Int32Array(nodeCount + 1);
  for (const [from, to] of edges) {
    degree[from + 1] += 1;
    degree[to + 1] += 1;
  }
  const offsets = new Int32Array(nodeCount + 1);
  for (let i = 1; i <= nodeCount; i += 1)
    offsets[i] = offsets[i - 1] + degree[i];
  const fill = offsets.slice(0, nodeCount);
  const targets = new Int32Array(offsets[nodeCount]);
  const weights = new Float64Array(offsets[nodeCount]);
  const edgeOf = new Int32Array(offsets[nodeCount]);
  edges.forEach(([from, to, metres], e) => {
    targets[fill[from]] = to;
    weights[fill[from]] = metres;
    edgeOf[fill[from]] = e;
    fill[from] += 1;
    targets[fill[to]] = from;
    weights[fill[to]] = metres;
    edgeOf[fill[to]] = e;
    fill[to] += 1;
  });
  return {
    nodeCount,
    edgeCount: edges.length,
    offsets,
    targets,
    weights,
    edgeOf,
  };
}

/** A binary min-heap of (key, value) pairs on typed arrays. */
function createHeap(capacity) {
  let keys = new Float64Array(Math.max(16, capacity));
  let values = new Int32Array(keys.length);
  let size = 0;
  function grow() {
    const k = new Float64Array(keys.length * 2);
    const v = new Int32Array(keys.length * 2);
    k.set(keys);
    v.set(values);
    keys = k;
    values = v;
  }
  return {
    get size() {
      return size;
    },
    push(key, value) {
      if (size === keys.length) grow();
      let i = size;
      size += 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (keys[parent] <= key) break;
        keys[i] = keys[parent];
        values[i] = values[parent];
        i = parent;
      }
      keys[i] = key;
      values[i] = value;
    },
    /** Pops the minimum; returns its value and leaves its key in `lastKey`. */
    pop() {
      const top = values[0];
      this.lastKey = keys[0];
      size -= 1;
      const key = keys[size];
      const value = values[size];
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= size) break;
        if (child + 1 < size && keys[child + 1] < keys[child]) child += 1;
        if (keys[child] >= key) break;
        keys[i] = keys[child];
        values[i] = values[child];
        i = child;
      }
      keys[i] = key;
      values[i] = value;
      return top;
    },
    lastKey: 0,
  };
}

/**
 * Distance from every node to its nearest source, along the network.
 *
 * @param {ReturnType<typeof buildCsr>} csr
 * @param {Array<{node:number, offsetMetres?:number}>} sources a facility's
 *   junction, and the straight-line leg from the facility to it
 * @param {{disabled?: Uint8Array}} [options] edges that cannot be used
 * @returns {{dist: Float64Array, source: Int32Array, prevEdge: Int32Array}}
 *   `source[n]` is the index into `sources` of n's nearest; -1 if unreachable
 */
export function multiSourceDijkstra(csr, sources, { disabled = null } = {}) {
  const dist = new Float64Array(csr.nodeCount).fill(Infinity);
  const source = new Int32Array(csr.nodeCount).fill(-1);
  const prevEdge = new Int32Array(csr.nodeCount).fill(-1);
  const heap = createHeap(csr.nodeCount);
  sources.forEach(({ node, offsetMetres = 0 }, s) => {
    if (offsetMetres < dist[node]) {
      dist[node] = offsetMetres;
      source[node] = s;
      heap.push(offsetMetres, node);
    }
  });
  const { offsets, targets, weights, edgeOf } = csr;
  while (heap.size > 0) {
    const node = heap.pop();
    const d = heap.lastKey;
    if (d > dist[node]) continue;
    for (let k = offsets[node]; k < offsets[node + 1]; k += 1) {
      if (disabled && disabled[edgeOf[k]]) continue;
      const next = targets[k];
      const nd = d + weights[k];
      /* Ties go to the lower source index, so the result does not depend on heap order. */
      if (
        nd < dist[next] ||
        (nd === dist[next] && source[node] < source[next])
      ) {
        dist[next] = nd;
        source[next] = source[node];
        prevEdge[next] = edgeOf[k];
        heap.push(nd, next);
      }
    }
  }
  return { dist, source, prevEdge };
}

/**
 * The edges from `node` back to its nearest source, nearest-source last.
 * @param {{prevEdge: Int32Array}} result from `multiSourceDijkstra`
 * @param {Array<[number, number]>} edges the same edge list [from, to, ...]
 */
export function pathToSource(result, edges, node) {
  const path = [];
  let at = node;
  const guard = result.prevEdge.length + 1;
  while (result.prevEdge[at] !== -1) {
    const e = result.prevEdge[at];
    path.push(e);
    const [from, to] = edges[e];
    at = from === at ? to : from;
    if (path.length > guard)
      throw new Error('pathToSource: cycle in predecessor chain');
  }
  return path;
}

/**
 * A grid index over node positions, for snapping a point to its nearest
 * junction without scanning every node.
 * @param {Array<[number, number]>} nodes [lon, lat]
 * @param {number} cellDegrees
 */
export function buildNodeIndex(nodes, cellDegrees = 0.02) {
  const cells = new Map();
  nodes.forEach(([lon, lat], i) => {
    const key = `${Math.floor(lon / cellDegrees)}:${Math.floor(lat / cellDegrees)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  });
  return { nodes, cells, cellDegrees };
}

const EARTH_RADIUS_M = 6_371_008.8;
function metresBetween(lon1, lat1, lon2, lat2) {
  const toRad = Math.PI / 180;
  const dφ = (lat2 - lat1) * toRad;
  const dλ = (lon2 - lon1) * toRad;
  const h =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The nearest junction to a point within `maxMetres`, or null.
 * Searches rings of cells outward until a ring cannot hold anything nearer.
 * @param {ReturnType<typeof buildNodeIndex>} index
 */
export function snapToNode(index, lon, lat, maxMetres) {
  const { cellDegrees, cells, nodes } = index;
  const col = Math.floor(lon / cellDegrees);
  const row = Math.floor(lat / cellDegrees);
  /* A cell is at least this many metres across at these latitudes. */
  const cellMetres =
    cellDegrees *
    111_320 *
    Math.cos((Math.min(Math.abs(lat) + cellDegrees, 89) * Math.PI) / 180);
  const maxRing = Math.ceil(maxMetres / cellMetres) + 1;
  let best = null;
  let bestMetres = Infinity;
  for (let ring = 0; ring <= maxRing; ring += 1) {
    if (best !== null && (ring - 1) * cellMetres > bestMetres) break;
    for (let dc = -ring; dc <= ring; dc += 1) {
      for (let dr = -ring; dr <= ring; dr += 1) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
        for (const i of cells.get(`${col + dc}:${row + dr}`) ?? []) {
          const m = metresBetween(lon, lat, nodes[i][0], nodes[i][1]);
          if (m < bestMetres) {
            bestMetres = m;
            best = i;
          }
        }
      }
    }
  }
  return best !== null && bestMetres <= maxMetres
    ? { node: best, metres: bestMetres }
    : null;
}
