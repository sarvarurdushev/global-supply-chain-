/**
 * Supply-chain network model.
 *
 * A directed multigraph of typed nodes and typed edges. Every edge carries its
 * own provenance, so an analysis can always answer "where did this link come
 * from" — and so that a MODELLED edge can never be mistaken for an observed one.
 *
 * The graph is immutable once built. Scenario work (disruption simulation) does
 * not mutate it; `withScenario()` returns a derived view. That keeps a simulation
 * from leaking into the baseline, which is the single easiest way to end up
 * presenting a simulated result as fact.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

import { DataClass } from './provenance.js';
import { haversineKm, validatePoint } from './geo.js';

/** @enum {string} */
export const NodeType = Object.freeze({
  COUNTRY: 'COUNTRY',
  REGION: 'REGION',
  PORT: 'PORT',
  AIRPORT: 'AIRPORT',
  CHOKEPOINT: 'CHOKEPOINT',
  RAIL_TERMINAL: 'RAIL_TERMINAL',
  ROAD_HUB: 'ROAD_HUB',
  BORDER_CROSSING: 'BORDER_CROSSING',
  INDUSTRIAL_AREA: 'INDUSTRIAL_AREA',
  RESOURCE_REGION: 'RESOURCE_REGION',
  LOGISTICS_HUB: 'LOGISTICS_HUB',
  CITY: 'CITY',
  MARKET: 'MARKET',
});

/** @enum {string} */
export const EdgeType = Object.freeze({
  MARITIME_ROUTE: 'MARITIME_ROUTE',
  AIR_ROUTE: 'AIR_ROUTE',
  ROAD_ROUTE: 'ROAD_ROUTE',
  RAIL_ROUTE: 'RAIL_ROUTE',
  PIPELINE: 'PIPELINE',
  TRADE_RELATIONSHIP: 'TRADE_RELATIONSHIP',
  SUPPLY_RELATIONSHIP: 'SUPPLY_RELATIONSHIP',
  INFERRED_LOGISTICS: 'INFERRED_LOGISTICS',
});

/** Transport modes, used for speed assumptions and mode filters. */
export const TransportMode = Object.freeze({
  SEA: 'SEA',
  AIR: 'AIR',
  ROAD: 'ROAD',
  RAIL: 'RAIL',
  PIPE: 'PIPE',
  /** Not a physical movement — a statistical trade relationship. */
  STATISTICAL: 'STATISTICAL',
});

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} is required`);
  }
  return value;
}

function requireProvenance(provenance, label) {
  if (
    !provenance ||
    typeof provenance !== 'object' ||
    !Object.values(DataClass).includes(provenance.dataClass)
  ) {
    throw new TypeError(`${label} requires a provenance record`);
  }
  return provenance;
}

/**
 * Create a node.
 *
 * @param {object} input
 * @param {string} input.id stable unique identifier
 * @param {string} input.type a NodeType value
 * @param {string} input.name display name
 * @param {{lat:number, lon:number}|null} [input.position]
 * @param {string|null} [input.country] ISO 3166-1 alpha-3 where applicable
 * @param {object} input.provenance
 * @param {object} [input.attributes] type-specific fields
 * @returns {Readonly<object>}
 */
export function createNode({
  id,
  type,
  name,
  position = null,
  country = null,
  provenance,
  attributes = {},
}) {
  requireString(id, 'node.id');
  requireString(name, 'node.name');
  if (!Object.values(NodeType).includes(type)) {
    throw new TypeError(`Unknown node type: ${type}`);
  }
  requireProvenance(provenance, `node ${id}`);
  const pos = position === null ? null : validatePoint(position);
  return Object.freeze({
    id,
    type,
    name,
    position: pos === null ? null : Object.freeze(pos),
    country,
    provenance,
    attributes: Object.freeze({ ...attributes }),
  });
}

/**
 * Create a directed edge.
 *
 * `weight` is the generic cost used by routing. What it means depends on the
 * caller's chosen weight function — distance, time or a composite — so it is not
 * interpreted here beyond requiring it to be non-negative (Dijkstra's precondition).
 *
 * @param {object} input
 * @param {string} input.id
 * @param {string} input.from source node id
 * @param {string} input.to target node id
 * @param {string} input.type an EdgeType value
 * @param {string} input.mode a TransportMode value
 * @param {number} [input.distanceKm]
 * @param {number} [input.capacity] units are caller-defined; null when unknown
 * @param {number} [input.value] trade value in USD, where the edge is a trade relationship
 * @param {number} [input.volumeKg]
 * @param {string|null} [input.commodity] HS code or commodity key
 * @param {object} input.provenance
 * @param {object} [input.attributes]
 * @returns {Readonly<object>}
 */
export function createEdge({
  id,
  from,
  to,
  type,
  mode,
  distanceKm = null,
  capacity = null,
  value = null,
  volumeKg = null,
  commodity = null,
  provenance,
  attributes = {},
}) {
  requireString(id, 'edge.id');
  requireString(from, 'edge.from');
  requireString(to, 'edge.to');
  if (!Object.values(EdgeType).includes(type)) {
    throw new TypeError(`Unknown edge type: ${type}`);
  }
  if (!Object.values(TransportMode).includes(mode)) {
    throw new TypeError(`Unknown transport mode: ${mode}`);
  }
  requireProvenance(provenance, `edge ${id}`);
  for (const [label, n] of [
    ['distanceKm', distanceKm],
    ['capacity', capacity],
    ['value', value],
    ['volumeKg', volumeKg],
  ]) {
    if (n !== null && (typeof n !== 'number' || !Number.isFinite(n) || n < 0)) {
      throw new TypeError(
        `edge.${label} must be a non-negative finite number or null`,
      );
    }
  }
  return Object.freeze({
    id,
    from,
    to,
    type,
    mode,
    distanceKm,
    capacity,
    value,
    volumeKg,
    commodity,
    provenance,
    attributes: Object.freeze({ ...attributes }),
  });
}

/**
 * Build an immutable supply-chain graph.
 *
 * Every edge endpoint must resolve to a declared node. An edge to a node that
 * does not exist is a data-integrity bug, and failing loudly at construction is
 * far better than silently dropping the edge and reporting a network that is
 * quietly less connected than the data says.
 *
 * @param {object} input
 * @param {Array<object>} input.nodes
 * @param {Array<object>} input.edges
 * @returns {object} graph
 */
export function createGraph({ nodes = [], edges = [] } = {}) {
  const nodeById = new Map();
  for (const node of nodes) {
    if (nodeById.has(node.id)) {
      throw new TypeError(`Duplicate node id: ${node.id}`);
    }
    nodeById.set(node.id, node);
  }

  const edgeById = new Map();
  const outgoing = new Map();
  const incoming = new Map();
  for (const edge of edges) {
    if (edgeById.has(edge.id)) {
      throw new TypeError(`Duplicate edge id: ${edge.id}`);
    }
    if (!nodeById.has(edge.from)) {
      throw new TypeError(
        `Edge ${edge.id} references unknown node: ${edge.from}`,
      );
    }
    if (!nodeById.has(edge.to)) {
      throw new TypeError(
        `Edge ${edge.id} references unknown node: ${edge.to}`,
      );
    }
    edgeById.set(edge.id, edge);
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    if (!incoming.has(edge.to)) incoming.set(edge.to, []);
    outgoing.get(edge.from).push(edge);
    incoming.get(edge.to).push(edge);
  }

  const EMPTY = Object.freeze([]);

  return Object.freeze({
    /** @returns {number} */
    get nodeCount() {
      return nodeById.size;
    },
    /** @returns {number} */
    get edgeCount() {
      return edgeById.size;
    },
    /** @returns {Array<object>} all nodes, in insertion order */
    nodes: () => [...nodeById.values()],
    /** @returns {Array<object>} all edges, in insertion order */
    edges: () => [...edgeById.values()],
    /** @returns {Array<string>} all node ids, in insertion order */
    nodeIds: () => [...nodeById.keys()],
    /** @param {string} id @returns {object|undefined} */
    node: (id) => nodeById.get(id),
    /** @param {string} id @returns {object|undefined} */
    edge: (id) => edgeById.get(id),
    /** @param {string} id @returns {boolean} */
    hasNode: (id) => nodeById.has(id),
    /** @param {string} id @returns {Array<object>} edges leaving `id` */
    outEdges: (id) => outgoing.get(id) ?? EMPTY,
    /** @param {string} id @returns {Array<object>} edges entering `id` */
    inEdges: (id) => incoming.get(id) ?? EMPTY,
    /** @param {string} id @returns {number} out-degree + in-degree */
    degree: (id) =>
      (outgoing.get(id)?.length ?? 0) + (incoming.get(id)?.length ?? 0),
  });
}

/**
 * Derive a scenario view of a graph.
 *
 * Disabled nodes and edges are removed from traversal; penalised edges keep
 * their identity but report a multiplied cost through `penaltyFor()`. The base
 * graph is untouched, so a baseline and a scenario can be compared side by side.
 *
 * @param {object} graph
 * @param {object} scenario
 * @param {string[]} [scenario.disabledNodes]
 * @param {string[]} [scenario.disabledEdges]
 * @param {Record<string, number>} [scenario.edgePenalties] edge id → multiplier ≥ 1
 * @param {Record<string, number>} [scenario.nodePenalties] node id → multiplier ≥ 1, applied to every edge touching the node
 * @returns {object} a graph-shaped scenario view
 */
export function withScenario(graph, scenario = {}) {
  const disabledNodes = new Set(scenario.disabledNodes ?? []);
  const disabledEdges = new Set(scenario.disabledEdges ?? []);
  const edgePenalties = scenario.edgePenalties ?? {};
  const nodePenalties = scenario.nodePenalties ?? {};

  for (const [label, table] of [
    ['edgePenalties', edgePenalties],
    ['nodePenalties', nodePenalties],
  ]) {
    for (const [key, multiplier] of Object.entries(table)) {
      if (
        typeof multiplier !== 'number' ||
        !Number.isFinite(multiplier) ||
        multiplier < 1
      ) {
        throw new RangeError(
          `${label}.${key} must be a finite multiplier >= 1 (got ${multiplier})`,
        );
      }
    }
  }
  for (const id of disabledNodes) {
    if (!graph.hasNode(id))
      throw new TypeError(`Cannot disable unknown node: ${id}`);
  }

  const liveNode = (id) => graph.hasNode(id) && !disabledNodes.has(id);
  const liveEdge = (edge) =>
    !disabledEdges.has(edge.id) && liveNode(edge.from) && liveNode(edge.to);

  const filterOut = (id) =>
    liveNode(id) ? graph.outEdges(id).filter(liveEdge) : [];
  const filterIn = (id) =>
    liveNode(id) ? graph.inEdges(id).filter(liveEdge) : [];

  return Object.freeze({
    get nodeCount() {
      return graph.nodes().filter((n) => liveNode(n.id)).length;
    },
    get edgeCount() {
      return graph.edges().filter(liveEdge).length;
    },
    nodes: () => graph.nodes().filter((n) => liveNode(n.id)),
    edges: () => graph.edges().filter(liveEdge),
    nodeIds: () => graph.nodeIds().filter(liveNode),
    node: (id) => (liveNode(id) ? graph.node(id) : undefined),
    edge: (id) => {
      const e = graph.edge(id);
      return e && liveEdge(e) ? e : undefined;
    },
    hasNode: liveNode,
    outEdges: filterOut,
    inEdges: filterIn,
    degree: (id) => filterOut(id).length + filterIn(id).length,
    /**
     * Cost multiplier for an edge under this scenario.
     * Node penalties compound with edge penalties: a congested port raises the
     * cost of every edge that touches it.
     * @param {object} edge
     * @returns {number} >= 1
     */
    penaltyFor: (edge) =>
      (edgePenalties[edge.id] ?? 1) *
      (nodePenalties[edge.from] ?? 1) *
      (nodePenalties[edge.to] ?? 1),
    /** The unmodified graph this scenario derives from. */
    baseGraph: graph,
    scenario: Object.freeze({
      disabledNodes: Object.freeze([...disabledNodes]),
      disabledEdges: Object.freeze([...disabledEdges]),
      edgePenalties: Object.freeze({ ...edgePenalties }),
      nodePenalties: Object.freeze({ ...nodePenalties }),
    }),
  });
}

/**
 * Distance for an edge, preferring the recorded value and falling back to the
 * great-circle distance between its endpoints.
 *
 * Returns null when neither is available — callers must treat that as a data
 * gap rather than substituting zero, which would make the edge look free.
 *
 * @param {object} graph
 * @param {object} edge
 * @returns {number|null} kilometres
 */
export function edgeDistanceKm(graph, edge) {
  if (typeof edge.distanceKm === 'number') return edge.distanceKm;
  const from = graph.node(edge.from);
  const to = graph.node(edge.to);
  if (!from?.position || !to?.position) return null;
  return haversineKm(from.position, to.position);
}
