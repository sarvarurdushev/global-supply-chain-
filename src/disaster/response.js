/**
 * Response intelligence — rescue, evacuation and humanitarian logistics.
 *
 * §14, §15 and §16, under one instruction they share: recommendations must NOT
 * be paragraphs of text. "Do not simply write: 'People should evacuate through
 * Route B.' Draw Route B on the map."
 *
 * So every function here returns GEOMETRY plus the numbers that justify it — a
 * path as coordinates, its distance, its travel time, what it serves and what
 * it avoids. A view renders the numbers and the map renders the same path. No
 * function in this module returns advice as prose.
 *
 * HOW THE ROUTES ARE REAL. They are solved over a graph built from the actual
 * OSM road network with `shortestPath` from `supplychain/routing.js` — the same
 * router the trade-route work used, reused rather than reimplemented. Blocking
 * a node or an edge and re-solving is what produces the alternative, so Route B
 * is a genuine second-best path through real roads, not a curve drawn beside
 * Route A.
 *
 * WHAT IS MODELLED AND SAID TO BE. Which segments are blocked is exposure
 * (see impact.js), not an observed closure, so every scenario carries that
 * caveat. Travel times use a stated average speed, because no open source
 * publishes post-disaster road speeds — the assumption is in the output object
 * rather than buried in a constant.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

import { shortestPath } from '../supplychain/routing.js';
import { createGraph } from '../supplychain/graph.js';
import { haversineKm } from '../supplychain/geo.js';
import { AVAILABILITY } from './catalogue.js';
import { segmentLengthKm } from './impact.js';

/**
 * Assumed average speeds, in km/h.
 *
 * Stated rather than hidden because they carry the travel-time numbers. These
 * are deliberately pessimistic: a mountain road after an earthquake is not
 * driven at its signposted speed, and a route that claims two hours when it
 * takes six is worse than no estimate.
 */
export const ASSUMED_SPEEDS = Object.freeze({
  /** Trunk road, cleared, daylight. */
  TRUNK_CLEAR: 45,
  /** Trunk road with debris and single-lane working. */
  TRUNK_DEGRADED: 20,
  /** Mountain road, post-event. */
  MOUNTAIN: 15,
  /** On foot, carrying, over broken ground. */
  FOOT: 4,
  /** Rotary-wing, direct. */
  HELICOPTER: 180,
});

/** What a response route is for. Each draws differently on the map. */
export const ROUTE_PURPOSE = Object.freeze({
  RESCUE: 'RESCUE',
  EVACUATION: 'EVACUATION',
  AID: 'AID',
  SUPPLY: 'SUPPLY',
});

/**
 * Build a routable graph from OSM road segments.
 *
 * Nodes are segment endpoints snapped to a grid, so two roads that meet at a
 * junction share a node. The snap tolerance matters: too fine and the network
 * is a pile of disconnected stubs, too coarse and unrelated roads fuse. 50 m
 * is about the precision of OSM junction geometry in mountain terrain.
 *
 * @param {object} input
 * @param {Array<object>} input.segments `{osmId, coordinates, tags}`
 * @param {number} [input.snapMetres]
 * @returns {object} a graph `shortestPath` can traverse
 */
export function buildRoadGraph({ segments, snapMetres = 50 }) {
  const nodeById = new Map();
  const edges = [];
  const precision = snapMetres / 111_320; // degrees, near enough at these scales
  const key = (lon, lat) =>
    `n:${Math.round(lon / precision)}:${Math.round(lat / precision)}`;

  const addNode = (lon, lat) => {
    const id = key(lon, lat);
    if (!nodeById.has(id)) {
      /*
       * `position` is the field `edgeDistanceKm` falls back to and the one
       * `greatCircleHeuristic` reads, so it is not optional decoration.
       */
      nodeById.set(id, { id, position: { lat, lon }, lat, lon });
    }
    return id;
  };

  let counter = 0;
  for (const segment of segments ?? []) {
    const coords = segment?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const distanceKm = segmentLengthKm(coords);
    if (!(distanceKm > 0)) continue;
    /*
     * Validated BEFORE any node is created. An earlier version added the
     * endpoints first and then dropped the segment, which left orphan nodes in
     * a graph with no edges — and two far-apart endpoints could then snap to
     * the same orphan and report a zero-kilometre route between them.
     */
    const startKey = key(coords[0][0], coords[0][1]);
    const endKey = key(
      coords[coords.length - 1][0],
      coords[coords.length - 1][1],
    );
    // A loop that snaps to one node carries no connectivity.
    if (startKey === endKey) continue;
    const from = addNode(coords[0][0], coords[0][1]);
    const to = addNode(
      coords[coords.length - 1][0],
      coords[coords.length - 1][1],
    );
    const shared = {
      osmId: segment.osmId ?? null,
      name: segment.tags?.name ?? null,
      ref: segment.tags?.ref ?? null,
      highway: segment.tags?.highway ?? null,
      distanceKm,
      state: segment.state ?? null,
      hazardValue: segment.hazardValue ?? null,
    };
    /*
     * Both directions. A blocked road blocks both ways, and an evacuation runs
     * against the direction aid arrives on, so a directed-only graph would
     * solve one of those two and silently fail the other.
     *
     * Edge ids are sequential rather than derived from the OSM id, because a
     * single OSM way can be split into several segments and createGraph
     * rejects duplicate ids.
     */
    counter += 1;
    edges.push({
      id: `e${counter}f`,
      from,
      to,
      coordinates: coords,
      ...shared,
    });
    edges.push({
      id: `e${counter}r`,
      from: to,
      to: from,
      coordinates: [...coords].reverse(),
      ...shared,
    });
  }

  /*
   * Built with the project's own createGraph rather than a hand-rolled object.
   * An earlier version of this function invented its own interface and
   * shortestPath rejected it at `graph.hasNode` — the router's contract is
   * hasNode / node / outEdges / penaltyFor, and guessing at it wasted a cycle.
   */
  return createGraph({ nodes: [...nodeById.values()], edges });
}

/** The graph node nearest a coordinate, or null when nothing is close. */
export function nearestNode(graph, { lat, lon }, maxKm = 25) {
  let best = null;
  let bestKm = Infinity;
  for (const node of graph.nodes()) {
    const km = haversineKm({ lat, lon }, { lat: node.lat, lon: node.lon });
    if (km < bestKm) {
      bestKm = km;
      best = node;
    }
  }
  if (!best || bestKm > maxKm) return null;
  return { node: best, distanceKm: bestKm };
}

/**
 * Solve one route, with a set of edges treated as impassable.
 *
 * Returns the full drawable geometry rather than only a node list, because
 * §14's whole point is that the answer is a line on the map.
 *
 * @param {object} input
 * @param {object} input.graph
 * @param {{lat:number,lon:number,label?:string}} input.from
 * @param {{lat:number,lon:number,label?:string}} input.to
 * @param {Set<string>|Array<string>} [input.blockedEdges]
 * @param {number} [input.speedKmh]
 * @param {string} [input.purpose]
 */
export function solveRoute({
  graph,
  from,
  to,
  blockedEdges = [],
  speedKmh = ASSUMED_SPEEDS.MOUNTAIN,
  purpose = ROUTE_PURPOSE.RESCUE,
  label = null,
}) {
  const origin = nearestNode(graph, from);
  const destination = nearestNode(graph, to);
  if (!origin || !destination) {
    return Object.freeze({
      ok: false,
      /*
       * A distinct reason from "no path": the endpoint is not on the mapped
       * network at all, which is a data-coverage statement rather than a
       * finding about the disaster.
       */
      reason: 'ENDPOINT_OFF_NETWORK',
      detail: !origin
        ? `No mapped road within 25 km of ${from.label ?? 'the origin'}.`
        : `No mapped road within 25 km of ${to.label ?? 'the destination'}.`,
      purpose,
      label,
    });
  }
  if (origin.node.id === destination.node.id) {
    /*
     * Both endpoints snapped to the same graph node, so the network cannot
     * tell them apart. `shortestPath` would return a zero-cost trivial path
     * and the panel would report the destination as reachable in no time at
     * all — which is how a 22 km journey became "0 km" before this check.
     */
    return Object.freeze({
      ok: false,
      reason: 'ENDPOINTS_INDISTINGUISHABLE',
      detail: `${from.label ?? 'Origin'} and ${to.label ?? 'destination'} both resolve to the same point on the mapped network, so no route between them can be measured. The road data is too sparse here to separate them.`,
      purpose,
      label,
    });
  }
  const result = shortestPath(graph, origin.node.id, destination.node.id, {
    blockedEdges: new Set(blockedEdges),
  });
  if (!result) {
    return Object.freeze({
      ok: false,
      reason: 'NO_PATH',
      detail: `No route remains between ${from.label ?? 'origin'} and ${to.label ?? 'destination'} with these closures. On this network that is isolation, not a detour.`,
      purpose,
      label,
      blockedCount: [...blockedEdges].length,
    });
  }
  /* Stitch the per-edge geometry into one drawable line. */
  const coordinates = [];
  for (const edge of result.edges) {
    for (const point of edge.coordinates ?? []) {
      const last = coordinates[coordinates.length - 1];
      if (!last || last[0] !== point[0] || last[1] !== point[1]) {
        coordinates.push(point);
      }
    }
  }
  const distanceKm = result.edges.reduce(
    (sum, edge) => sum + (edge.distanceKm ?? 0),
    0,
  );
  const namedRoads = [
    ...new Set(
      result.edges.map((edge) => edge.name ?? edge.ref).filter(Boolean),
    ),
  ];
  return Object.freeze({
    ok: true,
    purpose,
    label,
    coordinates: Object.freeze(coordinates),
    distanceKm,
    /** Walk-in distance where the endpoint was not exactly on the network. */
    accessKm: origin.distanceKm + destination.distanceKm,
    travelHours: distanceKm / speedKmh,
    speedKmh,
    speedAssumption: `Travel time assumes ${speedKmh} km/h throughout. No open source publishes post-disaster road speeds, so this is a stated assumption, not a measurement.`,
    roads: Object.freeze(namedRoads.slice(0, 8)),
    edgeCount: result.edges.length,
    availability: AVAILABILITY.MODELLED,
  });
}

/**
 * Compare a route before and after closures (§14).
 *
 * The output is the §8/§14 shape: Route A blocked, Route B available, and the
 * cost of the difference. When there is no Route B it says so as isolation
 * rather than returning nothing, because "no alternative exists" is the most
 * important finding this function can produce.
 */
export function routeAlternatives({
  graph,
  from,
  to,
  blockedEdges,
  speedKmh = ASSUMED_SPEEDS.MOUNTAIN,
  purpose = ROUTE_PURPOSE.RESCUE,
}) {
  const before = solveRoute({
    graph,
    from,
    to,
    speedKmh,
    purpose,
    label: 'Route A — normal',
  });
  const after = solveRoute({
    graph,
    from,
    to,
    blockedEdges,
    speedKmh,
    purpose,
    label: 'Route B — with closures',
  });
  if (!before.ok) {
    return Object.freeze({
      before,
      after,
      verdict: 'NO_BASELINE',
      finding: `No route exists between these points even before closures. ${before.detail}`,
    });
  }
  if (!after.ok) {
    return Object.freeze({
      before,
      after,
      verdict: 'SEVERED',
      finding: `${from.label ?? 'The origin'} and ${to.label ?? 'the destination'} are severed on the mapped road network with these closures. There is no detour — reaching it means air access or clearing the route.`,
      additionalKm: null,
      additionalHours: null,
    });
  }
  const additionalKm = after.distanceKm - before.distanceKm;
  const additionalHours = after.travelHours - before.travelHours;
  return Object.freeze({
    before,
    after,
    verdict: additionalKm > 0.5 ? 'DETOUR' : 'UNAFFECTED',
    additionalKm,
    additionalHours,
    finding:
      additionalKm > 0.5
        ? `The detour adds ${additionalKm.toFixed(0)} km and about ${formatHours(additionalHours)} each way, over ${after.roads.length > 0 ? after.roads.slice(0, 3).join(', ') : 'unnamed roads'}.`
        : 'These closures do not change the route: an equivalent path remains.',
  });
}

/**
 * Evacuation scenarios (§15).
 *
 * Scenario A with the main road open, B with it blocked, C with more blocked —
 * each one solved rather than described, so the map shows how the feasible
 * answer changes. Every scenario returns routes to EVERY candidate safe zone,
 * because the finding is usually that the nearest one becomes unreachable and
 * a further one does not.
 *
 * @param {object} input
 * @param {object} input.graph
 * @param {{lat:number,lon:number,label:string}} input.origin the affected area
 * @param {Array<object>} input.safeZones `{lat, lon, label, capacity?}`
 * @param {Array<object>} input.scenarios `{id, name, blockedEdges, note?}`
 */
export function evacuationScenarios({ graph, origin, safeZones, scenarios }) {
  const results = (scenarios ?? []).map((scenario) => {
    const options = (safeZones ?? []).map((zone) => {
      const route = solveRoute({
        graph,
        from: origin,
        to: zone,
        blockedEdges: scenario.blockedEdges ?? [],
        speedKmh: ASSUMED_SPEEDS.FOOT,
        purpose: ROUTE_PURPOSE.EVACUATION,
        label: `To ${zone.label}`,
      });
      return Object.freeze({
        zone: Object.freeze({ ...zone }),
        route,
        reachable: route.ok,
      });
    });
    const reachable = options.filter((option) => option.reachable);
    /*
     * Ordered by travel time rather than distance: on foot over broken ground
     * they are the same ordering, but the field the panel shows is time, and
     * sorting by one while displaying the other invites a misread.
     */
    reachable.sort((a, b) => a.route.travelHours - b.route.travelHours);
    const capacityReachable = reachable
      .map((option) => option.zone.capacity)
      .filter((value) => Number.isFinite(value))
      .reduce((sum, value) => sum + value, 0);
    return Object.freeze({
      id: scenario.id,
      name: scenario.name,
      note: scenario.note ?? null,
      blockedCount: (scenario.blockedEdges ?? []).length,
      options: Object.freeze(options),
      reachableCount: reachable.length,
      totalZones: options.length,
      best: reachable[0] ?? null,
      /** Null when no reachable zone published a capacity. */
      reachableCapacity: capacityReachable > 0 ? capacityReachable : null,
      finding:
        reachable.length === 0
          ? 'No safe zone is reachable on foot in this scenario. That is the scenario’s finding, not a routing failure.'
          : `${reachable.length} of ${options.length} safe zones remain reachable. Nearest by time: ${reachable[0].zone.label}, about ${formatHours(reachable[0].route.travelHours)} on foot.`,
    });
  });
  return Object.freeze({
    origin: Object.freeze({ ...origin }),
    scenarios: Object.freeze(results),
    /*
     * The comparison across scenarios is the point of §15 — how the feasible
     * answer changes as roads close — so it is computed rather than left to
     * the reader.
     */
    comparison: Object.freeze(
      results.map((scenario) =>
        Object.freeze({
          id: scenario.id,
          name: scenario.name,
          reachable: scenario.reachableCount,
          best: scenario.best?.zone.label ?? null,
          bestHours: scenario.best?.route.travelHours ?? null,
        }),
      ),
    ),
    caveat:
      'Closures here are MODELLED hazard exposure, not reported road damage. The routes are real geometry over the mapped network; which segments are impassable is an inference.',
  });
}

/**
 * Humanitarian logistics: Need → Supply → Route → Destination (§16).
 *
 * Returns a solved chain per demand point rather than a summary, so the map
 * can draw the corridor and the panel can say what it carries and what it
 * cannot reach.
 *
 * @param {object} input
 * @param {object} input.graph
 * @param {Array<object>} input.supplyPoints `{lat, lon, label, stock?}`
 * @param {Array<object>} input.demandPoints `{lat, lon, label, people?, need?}`
 * @param {Array<string>} [input.blockedEdges]
 */
export function aidCorridors({
  graph,
  supplyPoints,
  demandPoints,
  blockedEdges = [],
}) {
  const corridors = (demandPoints ?? []).map((demand) => {
    const options = (supplyPoints ?? [])
      .map((supply) =>
        solveRoute({
          graph,
          from: supply,
          to: demand,
          blockedEdges,
          speedKmh: ASSUMED_SPEEDS.TRUNK_DEGRADED,
          purpose: ROUTE_PURPOSE.AID,
          label: `${supply.label} → ${demand.label}`,
        }),
      )
      .filter((route) => route.ok)
      .sort((a, b) => a.travelHours - b.travelHours);
    const best = options[0] ?? null;
    return Object.freeze({
      demand: Object.freeze({ ...demand }),
      /** Every servable origin, so a planner can see the second choice. */
      options: Object.freeze(options.slice(0, 4)),
      best,
      servable: Boolean(best),
      finding: best
        ? `Servable from ${best.label?.split(' → ')[0] ?? 'a supply point'} in about ${formatHours(best.travelHours)} over ${best.distanceKm.toFixed(0)} km.`
        : 'Not servable by road from any supply point in this scenario. Air access or a cleared route is required.',
      /** Declared: what the population actually needs is not in any feed. */
      requirementNote: Number.isFinite(demand.people)
        ? `${demand.people.toLocaleString()} people at this point, from the population source. Tonnage required is not published and is not estimated here.`
        : 'Population at this point is not recorded, so no requirement is stated.',
    });
  });
  const servable = corridors.filter((item) => item.servable);
  return Object.freeze({
    corridors: Object.freeze(corridors),
    servableCount: servable.length,
    totalDemand: corridors.length,
    unservable: Object.freeze(corridors.filter((item) => !item.servable)),
    availability: AVAILABILITY.MODELLED,
  });
}

/** Hours as something a person reads, not a decimal. */
export function formatHours(hours) {
  if (!Number.isFinite(hours)) return 'an unknown time';
  if (hours < 1) return `${Math.round(hours * 60)} minutes`;
  if (hours < 10) {
    const whole = Math.floor(hours);
    const minutes = Math.round((hours - whole) * 60);
    return minutes === 0 ? `${whole} hours` : `${whole} h ${minutes} min`;
  }
  return `${Math.round(hours)} hours`;
}
