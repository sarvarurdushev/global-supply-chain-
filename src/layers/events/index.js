import * as Cesium from 'cesium';
import {
  createGdacsSource,
  linkEventsToNodes,
  alertRank,
} from '../../supplychain/sources/gdacs.js';
import { haversineKm } from '../../supplychain/geo.js';
import { MAJOR_PORTS } from '../../supplychain/reference/ports.js';
import { CHOKEPOINTS } from '../../supplychain/reference/chokepoints.js';

/**
 * Supply-chain event layer (§15).
 *
 * Live natural-hazard events from GDACS, linked to the ports and chokepoints
 * near them.
 *
 * Unlike the trade and chokepoint layers, this one polls: GDACS is a live feed
 * and the whole point is currency. It is therefore the only supply-chain layer
 * that legitimately carries a LIVE badge.
 *
 * The visual encoding is alert level, which is GDACS's own modelled estimate of
 * humanitarian impact. Nothing here encodes supply-chain impact, because
 * nothing in the data supports that — proximity to a port is exposure, not
 * disruption, and the entity card says so.
 */

/** Alert-level colours, matching GDACS's own convention. */
const ALERT_COLOURS = Object.freeze({
  Red: Cesium.Color.fromCssColorString('#ff4d4f'),
  Orange: Cesium.Color.fromCssColorString('#ffb800'),
  Green: Cesium.Color.fromCssColorString('#52c41a'),
});
const UNKNOWN_COLOUR = Cesium.Color.fromCssColorString('#8c8c8c');

/** Ring radius by alert level, in metres. Severity reads as size and colour. */
const RADIUS_M = Object.freeze({
  Red: 260_000,
  Orange: 180_000,
  Green: 110_000,
});

/** How close infrastructure must be to count as exposed. */
export const EXPOSURE_RADIUS_KM = 500;

function colourFor(event) {
  return ALERT_COLOURS[event.alertLevel] ?? UNKNOWN_COLOUR;
}

/**
 * The infrastructure an event is checked against.
 *
 * Built once: 417 ports plus 9 chokepoints is small enough to scan per event,
 * and rebuilding it per refresh would be wasted work on static data.
 */
function exposureNodes() {
  return [
    ...MAJOR_PORTS.map((p) => ({
      id: p.id,
      name: p.name,
      lat: p.lat,
      lon: p.lon,
      kind: 'port',
    })),
    ...CHOKEPOINTS.map((c) => ({
      id: c.id,
      name: c.name,
      lat: c.lat,
      lon: c.lon,
      kind: 'chokepoint',
    })),
  ];
}

/**
 * Create the event layer.
 *
 * @param {object} [deps]
 * @param {object} [deps.source] a GDACS source; one is created if omitted
 * @param {(reason:string)=>void} [deps.governorRequestRender]
 * @param {Function} [deps.registerEntityContext]
 * @param {Function} [deps.removeEntityContextsForLayer]
 * @param {(event:object)=>void} [deps.onSelect]
 * @returns {object} layer
 */
export function createEventsLayer({
  source = null,
  governorRequestRender = () => {},
  registerEntityContext = null,
  removeEntityContextsForLayer = null,
  onSelect = null,
} = {}) {
  const feed = source ?? createGdacsSource();
  const nodes = exposureNodes();

  let _viewer = null;
  let _dataSource = null;
  let _handler = null;
  let _enabled = false;
  let _request = null;
  let _events = [];
  let _provenance = null;
  let _lastUpdate = null;
  let _error = null;

  function render() {
    if (!_dataSource) return;
    _dataSource.entities.removeAll();
    if (removeEntityContextsForLayer)
      removeEntityContextsForLayer('supply-events');

    for (const event of _events) {
      const colour = colourFor(event);
      const radius = RADIUS_M[event.alertLevel] ?? 90_000;
      const entity = _dataSource.entities.add(
        new Cesium.Entity({
          id: `supply-event:${event.id}`,
          position: Cesium.Cartesian3.fromDegrees(event.lon, event.lat),
          ellipse: {
            semiMajorAxis: radius,
            semiMinorAxis: radius,
            material: new Cesium.ColorMaterialProperty(colour.withAlpha(0.22)),
            outline: true,
            outlineColor: colour.withAlpha(0.95),
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: `${event.eventLabel}${event.country ? ` · ${event.country}` : ''}`,
            font: '500 12px "Inter", sans-serif',
            fillColor: colour,
            outlineColor: Cesium.Color.BLACK.withAlpha(0.85),
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -12),
            // Only the more serious events keep a label at global zoom;
            // otherwise a hundred wildfire markers bury everything else.
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
              0,
              alertRank(event.alertLevel) >= 1 ? 30_000_000 : 8_000_000,
            ),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: {
            eventId: event.id,
            eventType: event.eventLabel,
            alertLevel: event.alertLevel,
            severityText: event.severityText,
            country: event.country,
            nearbyCount: event.nearbyCount,
            proximityCaveat: event.proximityCaveat,
          },
        }),
      );
      if (registerEntityContext) {
        registerEntityContext(entity, {
          layerId: 'supply-events',
          dataSource: 'GDACS',
          label: event.name,
        });
      }
    }
    _lastUpdate = Date.now();
    governorRequestRender('supply-events:rendered');
  }

  function attachPicking(viewer) {
    if (!onSelect || _handler) return;
    _handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    _handler.setInputAction((movement) => {
      if (!_enabled) return;
      const picked = viewer.scene.pick(movement.position);
      const id = picked?.id?.id;
      if (typeof id === 'string' && id.startsWith('supply-event:')) {
        const event = _events.find((e) => `supply-event:${e.id}` === id);
        if (event) onSelect(event);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  const layer = {
    id: 'supply-events',
    name: 'Supply Chain Events',
    icon: '⚠',
    source: 'GDACS · LIVE',
    // GDACS re-issues episodes continuously; five minutes matches the proxy TTL.
    updateInterval: 300_000,

    init(viewer) {
      if (_viewer) throw new Error('Event layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource('supply-events');
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      attachPicking(viewer);
    },

    enable() {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      governorRequestRender('supply-events:enable');
    },

    disable() {
      _request?.abort();
      _request = null;
      _enabled = false;
      if (_dataSource) _dataSource.show = false;
      governorRequestRender('supply-events:disable');
    },

    /**
     * Refresh from GDACS.
     *
     * Follows the inherited abort discipline: cancel the previous request,
     * re-check liveness after every await, and only commit once the whole
     * snapshot validates.
     */
    async update() {
      if (!_enabled || !_dataSource) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const { events, provenance } = await feed.getEvents({
          signal: request.signal,
        });
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        _events = linkEventsToNodes({
          events,
          nodes,
          distanceKm: haversineKm,
          radiusKm: EXPOSURE_RADIUS_KM,
        });
        _provenance = provenance;
        _error = null;
        render();
        return true;
      } catch (error) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        _error = error?.message || 'GDACS unavailable';
        // A failed refresh must not clear events already on screen; the honest
        // state is "stale", which getStats() reports.
        return false;
      } finally {
        if (_request === request) _request = null;
      }
    },

    /** Events with at least one port or chokepoint inside the exposure radius. */
    exposedEvents() {
      return _events.filter((e) => e.nearbyCount > 0);
    },

    /** The provenance of the current snapshot, for the console panel. */
    getProvenance() {
      return _provenance;
    },

    destroy(viewer = _viewer) {
      _request?.abort();
      _request = null;
      if (_handler) {
        _handler.destroy();
        _handler = null;
      }
      if (removeEntityContextsForLayer)
        removeEntityContextsForLayer('supply-events');
      if (_dataSource && viewer) viewer.dataSources.remove(_dataSource, true);
      _dataSource = null;
      _viewer = null;
      _enabled = false;
      _events = [];
      _provenance = null;
      _lastUpdate = null;
      _error = null;
    },

    getAnalystRecords(maxCount = 200) {
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 200;
      return _events.slice(0, limit).map((event, index) => ({
        index,
        id: event.id,
        type: event.eventLabel,
        name: event.name,
        alertLevel: event.alertLevel,
        severity: event.severityText,
        country: event.country,
        lat: event.lat,
        lon: event.lon,
        nearbyInfrastructure: event.nearby.map((n) => ({
          name: n.name,
          kind: n.kind,
          distanceKm: Math.round(n.distanceKm),
        })),
        // Carried into the analyst snapshot so a spoken answer cannot turn
        // proximity into impact.
        proximityCaveat: event.proximityCaveat,
      }));
    },

    getStats() {
      return {
        count: _events.length,
        lastUpdate: _lastUpdate,
        error: _error,
        source: 'GDACS',
        exposed: _events.filter((e) => e.nearbyCount > 0).length,
      };
    },
  };
  return layer;
}
