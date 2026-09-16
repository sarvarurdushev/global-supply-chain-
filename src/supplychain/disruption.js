/**
 * Disruption simulation and propagation.
 *
 * Everything this module produces is SIMULATED. It did not happen. The returned
 * records carry that data class so a caller cannot accidentally render a
 * simulation with the same styling as an observation.
 *
 * The engine answers §11 and §38 of the brief:
 *   BEFORE  →  route A → B → C
 *   AFTER   →  route A → D → E → C
 * plus additional distance, estimated additional time, exposed countries, and
 * direct/secondary/tertiary propagation.
 *
 * It deliberately does NOT estimate economic consequences. That needs
 * input-output or CGE modelling and elasticities beyond this project's open
 * data; see docs/LIMITATIONS.md.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

import { withScenario } from './graph.js';
import {
  shortestPath,
  kShortestPaths,
  routeDistanceKm,
  transshipmentCount,
  classifyAlternative,
  distanceCost,
} from './routing.js';
import { transitHours } from './geo.js';
import { DataClass, createProvenance } from './provenance.js';

/**
 * Kinds of disruption the simulator understands.
 *
 * Each maps onto the same two primitives — disable an element, or penalise it —
 * because that is all the network model can honestly represent. The distinction
 * between a strike and a storm is in the scenario's metadata and duration, not
 * in a different physics.
 * @enum {string}
 */
export const DisruptionKind = Object.freeze({
  PORT_CLOSURE: 'PORT_CLOSURE',
  CANAL_CLOSURE: 'CANAL_CLOSURE',
  STRAIT_DISRUPTION: 'STRAIT_DISRUPTION',
  BORDER_CLOSURE: 'BORDER_CLOSURE',
  NATURAL_DISASTER: 'NATURAL_DISASTER',
  FACILITY_OUTAGE: 'FACILITY_OUTAGE',
  ROUTE_CLOSURE: 'ROUTE_CLOSURE',
  CAPACITY_REDUCTION: 'CAPACITY_REDUCTION',
  TRADE_RESTRICTION: 'TRADE_RESTRICTION',
  CONGESTION: 'CONGESTION',
});

/**
 * Default service speeds, in knots, used to convert distance into estimated
 * time. These are MODEL ASSUMPTIONS, exposed so a reader can disagree with them.
 *
 * Sources for the ranges these sit within are recorded in
 * docs/DISRUPTION_MODEL.md. They are representative commercial service speeds,
 * not measured values for any specific vessel or flight.
 */
export const DEFAULT_SPEEDS_KNOTS = Object.freeze({
  SEA: 14,
  AIR: 450,
  ROAD: 35,
  RAIL: 25,
  PIPE: 5,
  STATISTICAL: 14,
});

/** Fixed handling time per intermediate node, in hours. A model assumption. */
export const DEFAULT_NODE_HANDLING_HOURS = 24;

/**
 * Build a disruption scenario.
 *
 * @param {object} input
 * @param {string} input.id
 * @param {string} input.kind a DisruptionKind value
 * @param {string} input.label human-readable description
 * @param {string[]} [input.disabledNodes]
 * @param {string[]} [input.disabledEdges]
 * @param {Record<string, number>} [input.nodePenalties] node id → multiplier >= 1
 * @param {Record<string, number>} [input.edgePenalties] edge id → multiplier >= 1
 * @param {string[]} [input.assumptions] model assumptions this scenario makes
 * @returns {Readonly<object>}
 */
export function createDisruption({
  id,
  kind,
  label,
  disabledNodes = [],
  disabledEdges = [],
  nodePenalties = {},
  edgePenalties = {},
  assumptions = [],
}) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError('disruption.id is required');
  }
  if (!Object.values(DisruptionKind).includes(kind)) {
    throw new TypeError(`Unknown disruption kind: ${kind}`);
  }
  if (typeof label !== 'string' || label.trim() === '') {
    throw new TypeError('disruption.label is required');
  }
  if (
    disabledNodes.length === 0 &&
    disabledEdges.length === 0 &&
    Object.keys(nodePenalties).length === 0 &&
    Object.keys(edgePenalties).length === 0
  ) {
    throw new TypeError(
      'A disruption must disable or penalise at least one node or edge',
    );
  }
  return Object.freeze({
    id,
    kind,
    label,
    disabledNodes: Object.freeze([...disabledNodes]),
    disabledEdges: Object.freeze([...disabledEdges]),
    nodePenalties: Object.freeze({ ...nodePenalties }),
    edgePenalties: Object.freeze({ ...edgePenalties }),
    assumptions: Object.freeze([...assumptions]),
  });
}

/** Convenience: close a node entirely. */
export function closeNode(
  nodeId,
  { kind = DisruptionKind.PORT_CLOSURE, label } = {},
) {
  return createDisruption({
    id: `close:${nodeId}`,
    kind,
    label: label ?? `${nodeId} unavailable`,
    disabledNodes: [nodeId],
    assumptions: [
      'The node is completely unavailable, not merely degraded.',
      'No time-to-recovery is modelled; this is a steady-state comparison.',
    ],
  });
}

/** Convenience: reduce a node's throughput by multiplying the cost of its edges. */
export function reduceNodeCapacity(nodeId, fraction, { label } = {}) {
  if (typeof fraction !== 'number' || fraction <= 0 || fraction >= 1) {
    throw new RangeError('fraction must be within (0, 1) exclusive');
  }
  // A capacity cut to (1 - fraction) of normal is modelled as a cost multiplier
  // of 1/(1 - fraction): halving capacity doubles the effective cost of using
  // the node. This is a queueing-free approximation and is stated as such.
  const multiplier = 1 / (1 - fraction);
  return createDisruption({
    id: `reduce:${nodeId}:${fraction}`,
    kind: DisruptionKind.CAPACITY_REDUCTION,
    label:
      label ?? `${nodeId} loses ${Math.round(fraction * 100)}% of capacity`,
    nodePenalties: { [nodeId]: multiplier },
    assumptions: [
      `Capacity loss of ${Math.round(fraction * 100)}% is modelled as a cost ` +
        `multiplier of ${multiplier.toFixed(2)} on every edge touching the node.`,
      'This is a linear approximation. It does not model queueing, where delay ' +
        'grows non-linearly as utilisation approaches capacity.',
    ],
  });
}

/**
 * Estimated transit time for a route, in hours.
 *
 * MODELLED. Distance / assumed service speed per mode, plus fixed handling time
 * at each intermediate node. Returns null when any leg's distance is unknown.
 *
 * @param {object} graph
 * @param {{path:string[], edges:object[]}} route
 * @param {object} [options]
 * @param {Record<string, number>} [options.speeds]
 * @param {number} [options.handlingHours]
 * @returns {{hours:number, assumptions:string[]}|null}
 */
export function estimateRouteHours(graph, route, options = {}) {
  const speeds = { ...DEFAULT_SPEEDS_KNOTS, ...(options.speeds ?? {}) };
  const handlingHours = options.handlingHours ?? DEFAULT_NODE_HANDLING_HOURS;
  let hours = 0;
  const usedModes = new Set();
  for (const edge of route.edges) {
    const km = edge.distanceKm ?? distanceOf(graph, edge);
    if (km === null) return null;
    const speed = speeds[edge.mode];
    if (!speed) return null;
    usedModes.add(edge.mode);
    hours += transitHours(km, speed, 0);
  }
  const stops = transshipmentCount(route);
  hours += stops * handlingHours;
  return {
    hours,
    assumptions: [
      ...[...usedModes].map(
        (m) => `${m} service speed assumed ${speeds[m]} knots`,
      ),
      `${handlingHours} h handling time assumed at each of ${stops} intermediate node(s)`,
    ],
  };
}

function distanceOf(graph, edge) {
  const from = graph.node(edge.from);
  const to = graph.node(edge.to);
  if (!from?.position || !to?.position) return null;
  // Reuse routing's distance helper via a one-edge route.
  return routeDistanceKm(graph, { edges: [edge] });
}

/**
 * Simulate a disruption on one origin-destination pair.
 *
 * Returns the before route, the after route, and the measured deltas. Every
 * numeric result is tagged SIMULATED.
 *
 * @param {object} graph baseline graph
 * @param {object} disruption from createDisruption()
 * @param {string} source
 * @param {string} target
 * @param {object} [options]
 * @param {number} [options.k=3] alternatives to report
 * @param {(graph:object, edge:object)=>number} [options.weight]
 * @returns {Readonly<object>}
 */
export function simulateDisruption(
  graph,
  disruption,
  source,
  target,
  options = {},
) {
  const { k = 3, weight = distanceCost } = options;
  const scenario = withScenario(graph, {
    disabledNodes: disruption.disabledNodes,
    disabledEdges: disruption.disabledEdges,
    nodePenalties: disruption.nodePenalties,
    edgePenalties: disruption.edgePenalties,
  });

  const before = shortestPath(graph, source, target, { weight });
  const after = shortestPath(scenario, source, target, { weight });

  const provenance = createProvenance({
    dataClass: DataClass.SIMULATED,
    source: 'Global Supply Chain Eye disruption engine',
    dataset: `scenario:${disruption.id}`,
    license: 'MIT (model output)',
    method:
      'Graph-based scenario. Disabled elements are removed from traversal; ' +
      'penalised elements keep identity with a multiplied traversal cost. ' +
      'Routes are re-solved with Dijkstra and compared to the baseline.',
    limitations: [
      'MODEL OUTPUT, NOT AN OBSERVATION. This scenario did not occur.',
      'Assumes flows follow least-cost paths. Real cargo follows contracts.',
      'No economic consequence is estimated.',
      ...disruption.assumptions,
    ],
  });

  if (!before) {
    return Object.freeze({
      disruption,
      provenance,
      reachableBefore: false,
      reachableAfter: Boolean(after),
      before: null,
      after: after ?? null,
      delta: null,
      alternatives: Object.freeze([]),
      note:
        'No baseline route exists between these nodes in the loaded network, ' +
        'so no disruption comparison is possible. DATA UNAVAILABLE.',
    });
  }

  const beforeKm = routeDistanceKm(graph, before);
  const beforeTime = estimateRouteHours(graph, before, options);

  if (!after) {
    return Object.freeze({
      disruption,
      provenance,
      reachableBefore: true,
      reachableAfter: false,
      before: describeRoute(graph, before, beforeKm, beforeTime),
      after: null,
      delta: null,
      alternatives: Object.freeze([]),
      note:
        'The disruption severs this origin-destination pair entirely in the ' +
        'loaded network. No alternative path exists in our data — which is not ' +
        'the same as no alternative existing in the world.',
    });
  }

  const afterKm = routeDistanceKm(scenario, after);
  const afterTime = estimateRouteHours(scenario, after, options);
  const alternatives = kShortestPaths(scenario, source, target, k, {
    weight,
  }).map((route) =>
    Object.freeze({
      ...describeRoute(
        scenario,
        route,
        routeDistanceKm(scenario, route),
        estimateRouteHours(scenario, route, options),
      ),
      classification: classifyAlternative(scenario, route),
    }),
  );

  return Object.freeze({
    disruption,
    provenance,
    reachableBefore: true,
    reachableAfter: true,
    before: describeRoute(graph, before, beforeKm, beforeTime),
    after: describeRoute(scenario, after, afterKm, afterTime),
    delta: Object.freeze({
      additionalDistanceKm:
        beforeKm === null || afterKm === null ? null : afterKm - beforeKm,
      distanceRatio:
        beforeKm === null || afterKm === null || beforeKm === 0
          ? null
          : afterKm / beforeKm,
      additionalHours:
        beforeTime && afterTime ? afterTime.hours - beforeTime.hours : null,
      additionalTransshipments:
        transshipmentCount(after) - transshipmentCount(before),
      costRatio: before.cost > 0 ? after.cost / before.cost : null,
    }),
    alternatives: Object.freeze(alternatives),
    note: null,
  });
}

function describeRoute(graph, route, distanceKm, time) {
  return Object.freeze({
    path: Object.freeze([...route.path]),
    nodeNames: Object.freeze(
      route.path.map((id) => graph.node(id)?.name ?? id),
    ),
    edgeIds: Object.freeze(route.edges.map((e) => e.id)),
    modes: Object.freeze([...new Set(route.edges.map((e) => e.mode))]),
    cost: route.cost,
    distanceKm,
    estimatedHours: time?.hours ?? null,
    timeAssumptions: Object.freeze(time?.assumptions ?? []),
    transshipments: transshipmentCount(route),
  });
}

/**
 * Propagate a disruption outward through the network.
 *
 * DIRECT    — nodes whose edges are removed or penalised by the scenario.
 * SECONDARY — nodes one hop from a directly affected node.
 * TERTIARY  — nodes two hops away.
 *
 * This is topological reach, not an impact estimate. A node appearing at
 * SECONDARY means "a path from here passes through something disrupted", not
 * "this node will suffer". That distinction is stated in the returned record
 * because it is the single easiest thing for a reader to over-interpret.
 *
 * @param {object} graph
 * @param {object} disruption
 * @param {number} [maxDepth=3]
 * @returns {Readonly<object>}
 */
export function propagate(graph, disruption, maxDepth = 3) {
  if (!Number.isInteger(maxDepth) || maxDepth < 1) {
    throw new RangeError('maxDepth must be a positive integer');
  }
  const seeds = new Set([
    ...disruption.disabledNodes,
    ...Object.keys(disruption.nodePenalties),
  ]);
  for (const edgeId of disruption.disabledEdges) {
    const edge = graph.edge(edgeId);
    if (edge) {
      seeds.add(edge.from);
      seeds.add(edge.to);
    }
  }
  for (const edgeId of Object.keys(disruption.edgePenalties)) {
    const edge = graph.edge(edgeId);
    if (edge) {
      seeds.add(edge.from);
      seeds.add(edge.to);
    }
  }

  const depthOf = new Map();
  for (const id of seeds) if (graph.hasNode(id)) depthOf.set(id, 0);

  let frontier = [...depthOf.keys()];
  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const next = [];
    for (const id of frontier) {
      const neighbours = [
        ...graph.outEdges(id).map((e) => e.to),
        ...graph.inEdges(id).map((e) => e.from),
      ];
      for (const neighbour of neighbours) {
        if (!depthOf.has(neighbour)) {
          depthOf.set(neighbour, depth);
          next.push(neighbour);
        }
      }
    }
    frontier = next;
  }

  const tiers = { DIRECT: [], SECONDARY: [], TERTIARY: [], BEYOND: [] };
  const countries = new Set();
  for (const [id, depth] of depthOf) {
    const node = graph.node(id);
    if (node?.country) countries.add(node.country);
    const tier =
      depth === 0
        ? 'DIRECT'
        : depth === 1
          ? 'SECONDARY'
          : depth === 2
            ? 'TERTIARY'
            : 'BEYOND';
    tiers[tier].push(
      Object.freeze({
        id,
        name: node?.name ?? id,
        type: node?.type ?? null,
        depth,
      }),
    );
  }

  return Object.freeze({
    disruption,
    provenance: createProvenance({
      dataClass: DataClass.SIMULATED,
      source: 'Global Supply Chain Eye disruption engine',
      dataset: `propagation:${disruption.id}`,
      license: 'MIT (model output)',
      method:
        'Breadth-first topological reach from the disrupted elements, ' +
        'following both outgoing and incoming edges.',
      limitations: [
        'Topological reach only. Tier membership does NOT mean a node will ' +
          'suffer an impact, only that it is connected within N hops.',
        'Unweighted: a hop over a trivial trade relationship counts the same ' +
          'as a hop over a dominant one.',
        'No timing. Real propagation has lead times and inventory buffers that ' +
          'this model does not represent.',
      ],
    }),
    direct: Object.freeze(tiers.DIRECT),
    secondary: Object.freeze(tiers.SECONDARY),
    tertiary: Object.freeze(tiers.TERTIARY),
    beyond: Object.freeze(tiers.BEYOND),
    exposedCountries: Object.freeze([...countries].sort()),
    totalReached: depthOf.size,
  });
}

/**
 * Compare several scenarios against one baseline for the same pair.
 * Used by the WHAT IF panel (§14) to rank scenarios by severity.
 *
 * @param {object} graph
 * @param {Array<object>} disruptions
 * @param {string} source
 * @param {string} target
 * @param {object} [options]
 * @returns {Array<object>} sorted worst-first
 */
export function compareScenarios(
  graph,
  disruptions,
  source,
  target,
  options = {},
) {
  const results = disruptions.map((disruption) => {
    const result = simulateDisruption(
      graph,
      disruption,
      source,
      target,
      options,
    );
    return Object.freeze({
      id: disruption.id,
      label: disruption.label,
      kind: disruption.kind,
      severed: result.reachableBefore && !result.reachableAfter,
      additionalDistanceKm: result.delta?.additionalDistanceKm ?? null,
      additionalHours: result.delta?.additionalHours ?? null,
      costRatio: result.delta?.costRatio ?? null,
      result,
    });
  });
  // Severed pairs are the worst outcome; otherwise rank by cost ratio.
  return results.sort((a, b) => {
    if (a.severed !== b.severed) return a.severed ? -1 : 1;
    return (b.costRatio ?? 0) - (a.costRatio ?? 0);
  });
}
