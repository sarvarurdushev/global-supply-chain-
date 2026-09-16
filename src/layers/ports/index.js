import * as Cesium from 'cesium';
import { MAJOR_PORTS } from '../../supplychain/reference/ports.js';

/**
 * Major port layer (§18 of the brief).
 *
 * 417 ports from the NGA World Port Index, harbour sizes L and M.
 *
 * Point size encodes WPI's `harborSize` ordinal, which is a **physical scale**
 * classification — not container throughput. TEU throughput is commercial data
 * this project does not hold (docs/LIMITATIONS.md §4), so nothing here is
 * scaled by traffic, and the port card says so.
 *
 * Rendering uses a single PointPrimitiveCollection rather than 417 entities.
 * Entities carry per-feature overhead that is wasted here: ports are static,
 * never animate, and never need individual properties evaluated per frame.
 */

const COLOUR_LARGE = Cesium.Color.fromCssColorString('#00d4ff');
const COLOUR_MEDIUM = Cesium.Color.fromCssColorString('#7fb8cc');
const COLOUR_SELECTED = Cesium.Color.fromCssColorString('#ffb800');
const COLOUR_DISRUPTED = Cesium.Color.fromCssColorString('#ff4d4f');

/**
 * Create the port layer.
 *
 * @param {object} [deps]
 * @param {(reason:string)=>void} [deps.governorRequestRender]
 * @param {(port:object)=>void} [deps.onSelect]
 * @returns {object} layer
 */
export function createPortsLayer({
  governorRequestRender = () => {},
  onSelect = null,
} = {}) {
  let _viewer = null;
  let _points = null;
  let _labels = null;
  let _handler = null;
  let _enabled = false;
  let _selectedId = null;
  let _disrupted = new Set();
  let _lastUpdate = null;

  /** Index from primitive back to port, for picking. */
  const byPrimitive = new Map();

  function colourFor(port) {
    if (_disrupted.has(port.id)) return COLOUR_DISRUPTED;
    if (_selectedId === port.id) return COLOUR_SELECTED;
    return port.size === 'L' ? COLOUR_LARGE : COLOUR_MEDIUM;
  }

  function sizeFor(port) {
    if (_selectedId === port.id) return 14;
    return port.size === 'L' ? 8 : 5;
  }

  function build(viewer) {
    _points = viewer.scene.primitives.add(
      new Cesium.PointPrimitiveCollection(),
    );
    _labels = viewer.scene.primitives.add(new Cesium.LabelCollection());
    _points.show = false;
    _labels.show = false;

    for (const port of MAJOR_PORTS) {
      const position = Cesium.Cartesian3.fromDegrees(port.lon, port.lat);
      const primitive = _points.add({
        position,
        color: colourFor(port),
        pixelSize: sizeFor(port),
        outlineColor: Cesium.Color.BLACK.withAlpha(0.6),
        outlineWidth: 1,
        // Below this distance the globe is showing a region, not the world;
        // above it, 417 points become noise.
        translucencyByDistance: new Cesium.NearFarScalar(
          1.0e6,
          1.0,
          4.0e7,
          0.25,
        ),
      });
      byPrimitive.set(primitive, port);

      // Only large ports get a standing label, and only when reasonably close.
      if (port.size === 'L') {
        _labels.add({
          position,
          text: port.name,
          font: '500 11px "Inter", sans-serif',
          fillColor: Cesium.Color.WHITE.withAlpha(0.85),
          outlineColor: Cesium.Color.BLACK.withAlpha(0.8),
          outlineWidth: 2.5,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -9),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
            0,
            6_000_000,
          ),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
      }
    }
    _lastUpdate = Date.now();
  }

  function repaint() {
    if (!_points) return;
    for (const [primitive, port] of byPrimitive) {
      primitive.color = colourFor(port);
      primitive.pixelSize = sizeFor(port);
    }
    governorRequestRender('ports:repaint');
  }

  function attachPicking(viewer) {
    if (!onSelect || _handler) return;
    _handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    _handler.setInputAction((movement) => {
      if (!_enabled) return;
      const picked = viewer.scene.pick(movement.position);
      const port = picked?.primitive ? byPrimitive.get(picked.primitive) : null;
      if (port) {
        _selectedId = port.id;
        repaint();
        onSelect(port);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  const layer = {
    id: 'supply-ports',
    name: 'Major Ports',
    icon: '⚓',
    source: 'NGA World Port Index · HISTORICAL',
    updateInterval: 0,

    init(viewer) {
      if (_viewer) throw new Error('Port layer is already initialized');
      _viewer = viewer;
      build(viewer);
      attachPicking(viewer);
    },

    enable() {
      _enabled = true;
      if (_points) _points.show = true;
      if (_labels) _labels.show = true;
      governorRequestRender('ports:enable');
    },

    disable() {
      _enabled = false;
      if (_points) _points.show = false;
      if (_labels) _labels.show = false;
      governorRequestRender('ports:disable');
    },

    async update() {
      // Bundled static reference data: nothing to fetch, but the refresh still
      // succeeded. Returning false would make the manager roll back the enable.
      return true;
    },

    /** Select a port by id, for the console and voice actions. */
    select(portId) {
      _selectedId = portId ?? null;
      repaint();
      return MAJOR_PORTS.find((p) => p.id === portId) ?? null;
    },

    /** Mark ports as disrupted, for the WHAT IF panel. */
    setDisrupted(ids) {
      _disrupted = new Set(ids ?? []);
      repaint();
    },

    /** Find ports near a position, for "which ports serve this country". */
    findByCountry(iso2) {
      return MAJOR_PORTS.filter((p) => p.country === iso2);
    },

    destroy(viewer = _viewer) {
      if (_handler) {
        _handler.destroy();
        _handler = null;
      }
      if (viewer?.scene && !viewer.isDestroyed?.()) {
        if (_points) viewer.scene.primitives.remove(_points);
        if (_labels) viewer.scene.primitives.remove(_labels);
      }
      byPrimitive.clear();
      _points = null;
      _labels = null;
      _viewer = null;
      _enabled = false;
      _selectedId = null;
      _disrupted = new Set();
      _lastUpdate = null;
    },

    getAnalystRecords(maxCount = 500) {
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 500;
      return MAJOR_PORTS.slice(0, limit).map((port, index) => ({
        index,
        id: port.id,
        name: port.name,
        country: port.country,
        lat: port.lat,
        lon: port.lon,
        harbourSize: port.size,
        unlocode: port.unlocode,
        channelDepthFt: port.channelDepthFt,
        railConnection: port.rail === 'U' ? null : port.rail === 'Y',
        // Stated explicitly so the analyst engine reports the gap rather than
        // implying the field simply was not asked for.
        containerThroughputTeu: null,
        commoditySpecialization: null,
      }));
    },

    getStats() {
      return {
        count: MAJOR_PORTS.length,
        lastUpdate: _lastUpdate,
        error: null,
        source: 'NGA World Port Index',
      };
    },
  };
  return layer;
}
