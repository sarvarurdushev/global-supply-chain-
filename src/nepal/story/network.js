/**
 * Scenes 13 and 14: the road network and one route across it.
 *
 * NO ANALYSIS HAPPENS HERE. Every figure these scenes report — the node and
 * edge counts, the component split, the 21 matched blockages out of 184, the
 * fourteen route pairs and their outcomes — was computed by Stage 5 and is
 * read from `nepal-2015-infrastructure-analysis.json`. This module turns the
 * graph into drawables and the artefact's rows into panel language. It solves
 * a path only to DRAW one, and it checks its own answer against the number the
 * artefact already published.
 *
 * WHY THE CHECK EXISTS. The route is the one place in the product where the
 * frontend runs the same engine the analysis ran. If the line on the map is
 * 83 km and the panel says 74, one of them is wrong and a reader has no way to
 * tell which. `verifyRoute` makes that a reported discrepancy rather than a
 * quiet inconsistency. All fourteen pairs reproduce exactly.
 *
 * NO TRAVEL TIME. `solveRoute` in `disaster/response.js` can return hours from
 * an assumed speed, and this deliberately does not use it. The infrastructure
 * artefact's own data-gap list says no open source publishes April 2015 road
 * speeds or surface condition for Nepal, so an hours figure here would be a
 * number with no source. Distance is measured; time would be invented.
 */

import { shortestPath } from '../../supplychain/routing.js';
import { ResultClass, drawable } from './resultClass.js';

/** Highway classes, most strategic first. Drives what a coarse view draws. */
export const ROAD_CLASSES = Object.freeze([
  'trunk',
  'primary',
  'secondary',
  'tertiary',
]);

/** Class → colour and width. Strategic roads read first; the rest is context. */
export const ROAD_STYLE = Object.freeze({
  trunk: Object.freeze({ colour: '#4dd8ff', width: 2.5 }),
  primary: Object.freeze({ colour: '#22d97f', width: 2 }),
  secondary: Object.freeze({ colour: '#0f9d58', width: 1.5 }),
  tertiary: Object.freeze({ colour: '#0f9d58', width: 1 }),
  other: Object.freeze({ colour: '#5b6b66', width: 1 }),
});

/** A closed edge. Red, and thicker than anything around it. */
export const BLOCKED_STYLE = Object.freeze({ colour: '#ff4d4d', width: 3.5 });

/** The network as background, for a scene whose subject is a line across it. */
export const DIMMED_STYLE = Object.freeze({ colour: '#3c4a46', width: 1 });

/**
 * The mapped network, as one batch of lines.
 *
 * FORWARD EDGES ONLY. `buildRoadGraph` emits every edge twice, `…f` and `…r`,
 * with identical geometry. Drawing both doubles the work and changes nothing
 * on screen, so the reverse half is skipped — 2,727 lines rather than 5,454.
 * The disabled set contains both directions, so a forward edge is still
 * correctly marked closed.
 *
 * `kind: 'lines'` rather than `'polyline'` because the renderer batches these
 * into one PolylineCollection primitive. 2,727 entities is a different
 * performance conversation from one collection holding 2,727 polylines.
 *
 * @param {Array<object>} edges graph edges (`{id, coordinates, highway}`)
 * @param {object} [options]
 * @param {Set<string>|Array<string>} [options.disabledEdgeIds] from the artefact
 * @param {Array<string>} [options.classes] restrict to these highway classes
 */
export function networkDrawables(
  edges,
  { disabledEdgeIds = [], classes = null, dimmed = false } = {},
) {
  const blocked = new Set(disabledEdgeIds);
  const wanted = classes ? new Set(classes) : null;
  const out = [];
  for (const edge of edges ?? []) {
    if (!edge?.id?.endsWith('f')) continue;
    if (!edge.coordinates || edge.coordinates.length < 2) continue;
    const klass = edge.highway ?? 'other';
    if (wanted && !wanted.has(klass)) continue;
    const isBlocked = blocked.has(edge.id);
    /*
     * ON SCENE 14 THE NETWORK IS CONTEXT, NOT SUBJECT. Drawn at full weight
     * it buried the route completely: 2,727 lines in the same greens and
     * cyans as the route, and the answer to the scene's question was
     * invisible on screen while sitting correctly in the scene graph. Closed
     * edges keep their red either way — they are the reason the route moved.
     */
    const style = isBlocked
      ? BLOCKED_STYLE
      : dimmed
        ? DIMMED_STYLE
        : (ROAD_STYLE[klass] ?? ROAD_STYLE.other);
    out.push(
      drawable({
        id: edge.id,
        layer: 'road-network',
        kind: 'lines',
        positions: edge.coordinates,
        colour: style.colour,
        width: style.width,
        ...(dimmed && !isBlocked ? { fillOverride: 0.3 } : {}),
        /*
         * A closed edge is OBSERVED — a marker somebody recorded on the
         * ground. An open one is OFFICIAL: OpenStreetMap said a road was
         * there, which is a weaker and different claim than "somebody saw
         * this happen".
         */
        resultClass: isBlocked ? ResultClass.OBSERVED : ResultClass.OFFICIAL,
        blocked: isBlocked,
        highway: klass,
        osmId: edge.osmId ?? null,
      }),
    );
  }
  return out;
}

/**
 * Solve and draw one of the artefact's route pairs.
 *
 * The endpoints are the artefact's own NODE IDS, not coordinates, so the
 * drawn line is the same traversal the analysis measured rather than a
 * nearest-node guess that might land somewhere else.
 *
 * @param {object} graph
 * @param {object} pair a row from `results.network.routes.routes`
 * @param {object} [options]
 * @param {Set<string>|Array<string>} [options.disabledEdgeIds]
 */
export function solveArtefactRoute(graph, pair, { disabledEdgeIds = [] } = {}) {
  if (!graph || !pair?.from || !pair?.to) return null;
  const baseline = shortestPath(graph, pair.from, pair.to, {});
  const damaged = shortestPath(graph, pair.from, pair.to, {
    blockedEdges: new Set(disabledEdgeIds),
  });
  return Object.freeze({
    pair,
    baseline: pathSummary(baseline),
    damaged: pathSummary(damaged),
  });
}

function pathSummary(path) {
  if (!path) return null;
  const coordinates = [];
  for (const edge of path.edges) {
    for (const point of edge.coordinates ?? []) {
      const last = coordinates[coordinates.length - 1];
      if (!last || last[0] !== point[0] || last[1] !== point[1]) {
        coordinates.push(point);
      }
    }
  }
  return Object.freeze({
    coordinates: Object.freeze(coordinates),
    distanceKm: path.edges.reduce(
      (sum, edge) => sum + (edge.distanceKm ?? 0),
      0,
    ),
    edgeCount: path.edges.length,
    roads: Object.freeze([
      ...new Set(
        path.edges.map((edge) => edge.name ?? edge.ref).filter(Boolean),
      ),
    ]),
  });
}

/**
 * Does the drawn route agree with the figure the artefact published?
 *
 * Returns the discrepancies, empty when there are none. A tolerance of 20 m
 * covers the artefact's own two-decimal rounding and nothing else: this is a
 * check, and a check with a generous tolerance is decoration.
 */
export function verifyRoute(solved, { toleranceKm = 0.02 } = {}) {
  if (!solved) return ['no route was solved'];
  const problems = [];
  const compare = (label, mine, published) => {
    if (mine === null && published === null) return;
    if (mine === null || published === null) {
      problems.push(
        `${label}: artefact says ${published ?? 'not routable'}, the map ${mine === null ? 'found no path' : `drew ${mine.toFixed(2)} km`}`,
      );
      return;
    }
    if (Math.abs(mine - published) > toleranceKm) {
      problems.push(
        `${label}: drew ${mine.toFixed(2)} km, artefact publishes ${published} km`,
      );
    }
  };
  compare(
    'baseline',
    solved.baseline?.distanceKm ?? null,
    solved.pair.baselineKm,
  );
  compare(
    'with closures',
    solved.damaged?.distanceKm ?? null,
    solved.pair.damagedKm,
  );
  return problems;
}

/** Drawables for a solved route's two lines. */
export function routeDrawables(solved) {
  if (!solved) return { 'route-baseline': [], 'route-damaged': [] };
  const line = (summary, layer, colour, resultClass, label) =>
    summary
      ? [
          drawable({
            id: layer,
            layer,
            kind: 'polyline',
            positions: summary.coordinates,
            colour,
            width: layer === 'route-damaged' ? 5 : 3,
            resultClass,
            label,
            /* Both lines are constructed, so both carry the modelled grammar. */
            modeled: true,
            /*
             * Nearly opaque. A LINE'S grammar is its colour and width, not
             * its transparency: at the modelled fill alpha both routes were
             * present in the scene graph and invisible on the globe. Area
             * fills are where translucency carries meaning.
             */
            fillOverride: 0.95,
            distanceKm: summary.distanceKm,
          }),
        ]
      : [];
  return {
    'route-baseline': line(
      solved.baseline,
      'route-baseline',
      /*
       * Neon, not the cyan the trunk roads use: a route drawn in a road
       * class's own colour is a route nobody can find.
       */
      '#00ff9c',
      ResultClass.DERIVED,
      `Shortest mapped path, nothing closed — ${solved.baseline ? `${solved.baseline.distanceKm.toFixed(1)} km` : 'no path'}`,
    ),
    'route-damaged': line(
      solved.damaged,
      'route-damaged',
      '#a78bfa',
      ResultClass.SCENARIO,
      `Shortest mapped path with the observed closures — ${solved.damaged ? `${solved.damaged.distanceKm.toFixed(1)} km` : 'no path remains'}`,
    ),
  };
}

/** What an outcome means, in words a reader can act on. */
export const ROUTE_OUTCOME = Object.freeze({
  UNCHANGED: Object.freeze({
    label: 'Unchanged',
    plain: 'The closures did not lengthen this path on the mapped network.',
    tone: 'ok',
  }),
  DETOUR: Object.freeze({
    label: 'Detour',
    plain: 'A longer path remained after the closures.',
    tone: 'warn',
  }),
  SEVERED: Object.freeze({
    label: 'Severed',
    plain:
      'No path remained after the closures. On this network that is isolation, not a detour.',
    tone: 'bad',
  }),
  NOT_ROUTABLE_BASELINE: Object.freeze({
    label: 'Not routable to begin with',
    plain:
      'This district could not be reached on the mapped network even with nothing closed. That is a gap in what OpenStreetMap held in April 2015, not an effect of the earthquake.',
    tone: 'gap',
  }),
});

/**
 * The panel rows for one route pair.
 *
 * DISTANCE ONLY. No hours, no speed, no "reachable within". The artefact's own
 * data-gap list says no open source publishes April 2015 road speeds for
 * Nepal, so a time here would have no source behind it.
 */
export function describeRoute(pair) {
  if (!pair) return [];
  const rows = [
    ['Outcome', ROUTE_OUTCOME[pair.outcome]?.label ?? pair.outcome],
  ];
  if (pair.baselineKm !== null && pair.baselineKm !== undefined) {
    rows.push(['Shortest mapped path', `${pair.baselineKm} km`]);
  }
  if (pair.damagedKm !== null && pair.damagedKm !== undefined) {
    rows.push(['With the observed closures', `${pair.damagedKm} km`]);
  }
  if (pair.extraKm) {
    rows.push(['Added distance', `${pair.extraKm} km (${pair.extraShare}%)`]);
  }
  if (pair.destinationSnapMetres !== undefined) {
    /*
     * How far the district centroid sat from any mapped road. At 30 km this
     * is the whole story of the route rather than a footnote, so it is a row
     * and not a caption.
     */
    rows.push([
      'Destination distance from the mapped network',
      `${(pair.destinationSnapMetres / 1000).toFixed(1)} km`,
    ]);
  }
  return rows;
}
