import * as Cesium from 'cesium';
import {
  CHOKEPOINTS,
  chokepointsWithoutAlternative,
} from '../../supplychain/reference/chokepoints.js';

/**
 * Maritime chokepoint layer (§17 of the brief).
 *
 * Nine curated straits and canals, each clickable for its dependency profile.
 *
 * The visual distinction that matters: chokepoints with **no maritime
 * alternative** (Hormuz, the Turkish Straits, the Danish Straits) are drawn in
 * the critical colour, and those with a geographic detour are not. That is a
 * property of geography, not an estimate, so it is safe to encode in colour.
 * Nothing here encodes transit volume, because we do not have it — see
 * `reference/chokepoints.js`.
 */

const COLOUR_CRITICAL = Cesium.Color.fromCssColorString('#ff4d4f');
const COLOUR_ROUTABLE = Cesium.Color.fromCssColorString('#00d4ff');
const COLOUR_DISRUPTED = Cesium.Color.fromCssColorString('#ffb800');

/** Ring radius in metres. A chokepoint is a corridor; this marks its locality. */
const RING_RADIUS_M = 140_000;

/**
 * Create the chokepoint layer.
 *
 * @param {object} [deps]
 * @param {(reason:string)=>void} [deps.governorRequestRender]
 * @param {Function} [deps.registerEntityContext]
 * @param {Function} [deps.removeEntityContextsForLayer]
 * @param {(chokepoint:object)=>void} [deps.onSelect]
 * @returns {object} layer
 */
export function createChokepointsLayer({
  governorRequestRender = () => {},
  registerEntityContext = null,
  removeEntityContextsForLayer = null,
  onSelect = null,
} = {}) {
  let _viewer = null;
  let _dataSource = null;
  let _enabled = false;
  let _handler = null;
  let _disrupted = new Set();
  let _lastUpdate = null;

  const criticalIds = new Set(chokepointsWithoutAlternative().map((c) => c.id));

  function colourFor(chokepoint) {
    if (_disrupted.has(chokepoint.id)) return COLOUR_DISRUPTED;
    return criticalIds.has(chokepoint.id) ? COLOUR_CRITICAL : COLOUR_ROUTABLE;
  }

  function render() {
    if (!_dataSource) return;
    _dataSource.entities.removeAll();
    if (removeEntityContextsForLayer)
      removeEntityContextsForLayer('chokepoints');

    for (const point of CHOKEPOINTS) {
      const colour = colourFor(point);
      const position = Cesium.Cartesian3.fromDegrees(point.lon, point.lat);
      const entity = _dataSource.entities.add(
        new Cesium.Entity({
          id: `chokepoint:${point.id}`,
          position,
          ellipse: {
            semiMajorAxis: RING_RADIUS_M,
            semiMinorAxis: RING_RADIUS_M,
            material: new Cesium.ColorMaterialProperty(colour.withAlpha(0.18)),
            outline: true,
            outlineColor: colour.withAlpha(0.9),
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: point.name,
            font: '600 13px "Inter", sans-serif',
            fillColor: colour,
            outlineColor: Cesium.Color.BLACK.withAlpha(0.85),
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -14),
            // Labels would otherwise pile up at global zoom.
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
              0,
              30_000_000,
            ),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: {
            chokepointId: point.id,
            name: point.name,
            connects: point.connects.join(' ↔ '),
            hasAlternative: point.detourVia !== null,
            detourVia: point.detourVia,
          },
        }),
      );
      if (registerEntityContext) {
        registerEntityContext(entity, {
          layerId: 'chokepoints',
          dataSource: 'Global Supply Chain Eye curated dataset',
          label: point.name,
        });
      }
    }
    _lastUpdate = Date.now();
    governorRequestRender('chokepoints:rendered');
  }

  function attachPicking(viewer) {
    if (!onSelect || _handler) return;
    _handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    _handler.setInputAction((movement) => {
      if (!_enabled) return;
      const picked = viewer.scene.pick(movement.position);
      const id = picked?.id?.id;
      if (typeof id === 'string' && id.startsWith('chokepoint:')) {
        const point = CHOKEPOINTS.find(
          (c) => c.id === id.slice('chokepoint:'.length),
        );
        if (point) onSelect(point);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  const layer = {
    id: 'chokepoints',
    name: 'Maritime Chokepoints',
    icon: '⧗',
    source: 'Curated · HISTORICAL',
    updateInterval: 0,

    init(viewer) {
      if (_viewer) throw new Error('Chokepoint layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource('chokepoints');
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      render();
      attachPicking(viewer);
    },

    enable() {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      governorRequestRender('chokepoints:enable');
    },

    disable() {
      _enabled = false;
      if (_dataSource) _dataSource.show = false;
      governorRequestRender('chokepoints:disable');
    },

    async update() {
      // Static curated geometry: nothing to refresh, but the refresh still
      // succeeded. Returning false would make the manager roll back the enable.
      return true;
    },

    /** Mark chokepoints as disrupted, for the WHAT IF panel. */
    setDisrupted(ids) {
      _disrupted = new Set(ids ?? []);
      render();
    },

    destroy(viewer = _viewer) {
      if (_handler) {
        _handler.destroy();
        _handler = null;
      }
      if (removeEntityContextsForLayer)
        removeEntityContextsForLayer('chokepoints');
      if (_dataSource && viewer) viewer.dataSources.remove(_dataSource, true);
      _dataSource = null;
      _viewer = null;
      _enabled = false;
      _disrupted = new Set();
      _lastUpdate = null;
    },

    getAnalystRecords(maxCount = 50) {
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 50;
      return CHOKEPOINTS.slice(0, limit).map((point, index) => ({
        index,
        id: point.id,
        name: point.name,
        lat: point.lat,
        lon: point.lon,
        connects: point.connects,
        borderingCountries: point.borderingCountries,
        hasMaritimeAlternative: point.detourVia !== null,
        detourVia: point.detourVia,
        // Explicitly null rather than absent: the analyst engine should be able
        // to say "we do not have that" rather than inventing a figure.
        transitVolume: null,
      }));
    },

    getStats() {
      return {
        count: CHOKEPOINTS.length,
        lastUpdate: _lastUpdate,
        error: null,
        source: 'Curated dataset',
        critical: criticalIds.size,
      };
    },
  };
  return layer;
}
