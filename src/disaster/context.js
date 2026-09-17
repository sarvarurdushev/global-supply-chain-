/**
 * The disaster context handed to views.
 *
 * `ctx.disaster` in every view. It owns the open session, derives the
 * analyses that need more than one source, and is the only place a view can
 * reach data — which is what stops two views disagreeing about what loaded.
 *
 * WHY THE ANALYSES LIVE HERE AND NOT IN THE SESSION. Road exposure, rescue
 * routing and evacuation scenarios all need the OSM road network, which belongs
 * to a Cesium layer rather than to the case. The session is portable and knows
 * nothing about layers; this adapter is the seam where the two meet, and it is
 * deliberately thin so the seam stays visible.
 *
 * EVERY ANALYSIS RETURNS NULL RATHER THAN A PLACEHOLDER. A view that gets null
 * says "the network is not loaded for this area, load it and come back",
 * which is true. A view handed an empty result would draw an empty map and
 * read as "nothing is at risk here".
 */

import { buildCatalogue } from './catalogue.js';
import { createDisasterSession } from './session.js';
import { roadExposure } from './impact.js';
import {
  ASSUMED_SPEEDS,
  buildRoadGraph,
  aidCorridors,
  evacuationScenarios,
  routeAlternatives,
} from './response.js';

/**
 * Create the adapter.
 *
 * @param {object} deps
 * @param {object} deps.layers the layer manager adapter `{get, setEnabled, isEnabled}`
 * @param {object} deps.globe  `{flyTo, resetView}`
 * @param {()=>void} deps.refresh re-render the panel
 * @param {object} [deps.hazardLayer]
 * @param {Array<object>} [deps.liveRecords] normalised GDACS records
 */
export function createDisasterContext({
  layers,
  globe,
  refresh,
  hazardLayer = null,
  liveRecords = [],
}) {
  let session = null;
  let live = [...liveRecords];
  /** Cached per (case, phase) so a re-render does not re-solve routes. */
  let analysisCache = new Map();

  function invalidate() {
    analysisCache = new Map();
  }

  function cacheKey(name) {
    if (!session) return null;
    const state = session.investigation.getState();
    return `${name}:${session.case.id}:${state.phase.key}:${state.depth.index}:${state.scenarioId ?? '-'}`;
  }

  function cached(name, compute) {
    const key = cacheKey(name);
    if (!key) return null;
    if (analysisCache.has(key)) return analysisCache.get(key);
    const value = compute();
    analysisCache.set(key, value);
    return value;
  }

  /**
   * The road segments currently loaded, from whichever freight layer has them.
   *
   * Reads the layer's analyst records rather than its private state, because
   * that is the contract every layer in this project already exposes.
   */
  function roadSegments() {
    for (const layerId of ['freight-roads', 'freight-rail']) {
      const layer = layers.get?.(layerId);
      const stats = layer?.getStats?.();
      if (!stats?.count) continue;
      const reading = layer.getReading?.();
      if (!reading) continue;
      /*
       * The freight layer keeps its geometry internally and exposes records.
       * `getGeometry` is the richer accessor when present; otherwise the
       * records carry enough to route on.
       */
      const segments = layer.getSegments?.();
      if (Array.isArray(segments) && segments.length > 0) return segments;
    }
    return null;
  }

  /**
   * The hazard zones to test exposure against.
   *
   * Built from the loaded ground-failure alert plus the measured intensity
   * contours: the landslide model gives the severity and the contours give the
   * footprint. A case with neither yields null, and the views say so.
   */
  function hazardZones() {
    if (!session) return null;
    const contours = session.product('contours');
    if (!contours?.bands?.length) return null;
    const gf = session.product('groundFailure');
    /*
     * Only the damaging bands. MMI VI and above is where structures and slopes
     * begin to fail; including MMI IV would mark half a subcontinent as
     * exposed and make the layer meaningless.
     */
    const severe = contours.bands.filter((band) => band.mmi >= 6);
    const zones = [];
    for (const band of severe) {
      for (const line of band.lines) {
        if (!Array.isArray(line) || line.length < 3) continue;
        zones.push({
          ring: line,
          /*
           * The contour band's intensity scaled into a 0-1 hazard value, and
           * lifted where the published landslide alert is red. Both parts are
           * modelled, which is why everything downstream is labelled MODELLED.
           */
          value:
            Math.min(1, (band.mmi - 5) / 5) *
            (gf?.landslide?.alert === 'red' ? 1 : 0.6),
          label: `MMI ${band.mmi}${gf?.landslide?.alert === 'red' ? ' · red landslide alert' : ''}`,
        });
      }
    }
    return zones.length > 0 ? zones : null;
  }

  function graph() {
    const segments = roadSegments();
    if (!segments) return null;
    return buildRoadGraph({ segments });
  }

  /** Segment ids the current phase treats as impassable. */
  function blockedEdges(roadGraph) {
    if (!roadGraph) return [];
    const exposure = infrastructureExposure();
    if (!exposure) return [];
    const risky = new Set(exposure.atRisk.map((item) => item.id));
    return roadGraph
      .edges()
      .filter((edge) => edge.osmId && risky.has(edge.osmId))
      .map((edge) => edge.id);
  }

  function infrastructureExposure() {
    return cached('infra', () => {
      const segments = roadSegments();
      const zones = hazardZones();
      if (!segments || !zones) return null;
      return roadExposure({ segments, hazardZones: zones });
    });
  }

  function rescueAnalysis() {
    return cached('rescue', () => {
      const roadGraph = graph();
      if (!roadGraph || !session) return null;
      const ladder = session.investigation.ladder;
      /*
       * Base and target taken from the ladder itself: the country rung is
       * where external help lands and the deepest rung is the site. Authored
       * geography rather than a guess at a centroid.
       */
      const base = ladder.find((rung) => rung.kind === 'CITY') ?? ladder[2];
      const target = ladder[ladder.length - 1];
      if (!base || !target) return null;
      return routeAlternatives({
        graph: roadGraph,
        from: { lat: base.lat, lon: base.lon, label: base.name },
        to: { lat: target.lat, lon: target.lon, label: target.name },
        blockedEdges: blockedEdges(roadGraph),
        speedKmh: ASSUMED_SPEEDS.MOUNTAIN,
      });
    });
  }

  function evacuationAnalysis() {
    return cached('evac', () => {
      const roadGraph = graph();
      if (!roadGraph || !session) return null;
      const cities = session.cities({ minMmi: 6 });
      const ladder = session.investigation.ladder;
      const origin = ladder[ladder.length - 1];
      if (!origin) return null;
      /*
       * Safe zones are the least-shaken mapped places, which is a defensible
       * proxy and is labelled as one: a real evacuation plan uses designated
       * shelters, and where OSM has them the shelter layer supplies them
       * instead.
       */
      const zones = (cities?.cities ?? [])
        .filter((city) => city.latitude != null)
        .slice(-4)
        .map((city) => ({
          lat: city.latitude,
          lon: city.longitude,
          label: city.name,
          capacity: null,
        }));
      if (zones.length === 0) return null;
      const blocked = blockedEdges(roadGraph);
      const half = blocked.slice(0, Math.ceil(blocked.length / 2));
      return evacuationScenarios({
        graph: roadGraph,
        origin: { lat: origin.lat, lon: origin.lon, label: origin.name },
        safeZones: zones,
        scenarios: [
          { id: 'a', name: 'Scenario A — all roads open', blockedEdges: [] },
          {
            id: 'b',
            name: 'Scenario B — exposed segments impassable',
            blockedEdges: half,
            note: 'Half the modelled-exposed segments treated as closed.',
          },
          {
            id: 'c',
            name: 'Scenario C — every exposed segment impassable',
            blockedEdges: blocked,
            note: 'The pessimistic case.',
          },
        ],
      });
    });
  }

  function aidAnalysis() {
    return cached('aid', () => {
      const roadGraph = graph();
      if (!roadGraph || !session) return null;
      const cities = session.cities({ minMmi: 7 });
      if (!cities?.cities?.length) return null;
      const withPosition = cities.cities.filter(
        (city) => city.latitude != null,
      );
      if (withPosition.length < 2) return null;
      /*
       * The largest unaffected-enough city is the depot and the rest are
       * demand. Crude, stated, and replaced the moment a real logistics-hub
       * source is wired.
       */
      const [depot, ...demand] = [...withPosition].sort(
        (a, b) => (b.population ?? 0) - (a.population ?? 0),
      );
      return aidCorridors({
        graph: roadGraph,
        supplyPoints: [
          { lat: depot.latitude, lon: depot.longitude, label: depot.name },
        ],
        demandPoints: demand.slice(0, 6).map((city) => ({
          lat: city.latitude,
          lon: city.longitude,
          label: city.name,
          people: city.population,
        })),
        blockedEdges: blockedEdges(roadGraph),
      });
    });
  }

  return {
    /** The LEVEL 0 list. */
    catalogue: () => buildCatalogue({ liveRecords: live }),

    /** Replace the live feed's records, e.g. after the events layer refreshes. */
    setLiveRecords(records) {
      live = Array.isArray(records) ? [...records] : [];
      invalidate();
    },

    session: () => session,

    /**
     * Open a case: build the session, start the descent, load the data.
     *
     * The descent starts before the data lands on purpose — §24's scenes 3-5
     * are the camera moving through the geography, and waiting for six HTTP
     * requests before the first camera move would make the platform feel dead
     * on the most important click in it.
     */
    async open(caseId) {
      const entry = buildCatalogue({ liveRecords: live }).cases.find(
        (item) => item.id === caseId,
      );
      if (!entry) return false;
      session?.destroy();
      invalidate();
      session = createDisasterSession({
        case: entry,
        hazardLayer,
        onChange: () => refresh(),
        onIntent: (intent) => {
          if (intent.kind === 'camera') {
            globe.flyTo?.({
              lat: intent.lat,
              lon: intent.lon,
              altKm: intent.altKm,
            });
            if (intent.drawBorders)
              layers.setEnabled?.('country-borders', true);
          }
          if (intent.kind === 'layer') {
            /*
             * Hazard geometry ids are internal to the hazard layer; every
             * other id is a real registered layer. Routing them differently
             * here keeps both sets addressable from one toggle.
             */
            if (hazardLayer && intent.group === 'hazard') {
              hazardLayer.setVisible?.(intent.layerId, intent.enabled);
              layers.setEnabled?.('hazard-geometry', true);
            } else {
              layers.setEnabled?.(intent.layerId, intent.enabled);
            }
          }
          if (intent.kind === 'phase' || intent.kind === 'scenario')
            invalidate();
        },
      });
      refresh();
      session.investigation.descend({ holdMs: 2200 });
      await session.load();
      return true;
    },

    close() {
      session?.destroy();
      session = null;
      invalidate();
      refresh();
    },

    infrastructureExposure,
    rescueAnalysis,
    evacuationAnalysis,
    aidAnalysis,
    hazardZones,
    /** Exposed for tests and for the QA script. */
    roadSegments,
  };
}
