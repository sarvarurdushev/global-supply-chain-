import * as Cesium from 'cesium';
import {
  FREIGHT_NETWORKS,
  SITE_KIND_LABELS,
  freightProvenance,
  freightQuery,
  normalizeFreightLines,
  normalizeFreightPoints,
  siteOutput,
} from '../../supplychain/freight.js';

/**
 * Inland freight infrastructure layers.
 *
 * One factory builds all four — freight rail, trunk roads, oil and gas
 * pipelines, and production sites — because they differ only in the OSM tags
 * they ask for and the sentences they print. That difference lives in
 * `supplychain/freight.js`; this file is the Cesium half.
 *
 * VIEWPORT-DRIVEN, LIKE THE TRAFFIC LAYER. There is no global download of the
 * world's railways: the Overpass proxy caps a query at 12° of span, and a
 * continental rail query already returns tens of thousands of ways. So these
 * layers fetch what is in view when the camera settles, and say so. A user at
 * whole-globe zoom is told to come closer rather than shown an empty map that
 * looks like an answer.
 *
 * WHY THAT IS THE HONEST DESIGN AND NOT A COMPROMISE. The question these layers
 * answer is "what connects this port to its hinterland" or "what does this
 * country dig up", and both are regional questions. A global overlay of every
 * motorway on earth would be a texture, not information.
 *
 * WHAT IS DRAWN AND WHAT IS NOT. Real surveyed geometry, in the network's own
 * colour, at one width. Nothing is scaled by importance, because nothing here
 * measures importance: OSM has no tonnage, and a thick line for a busy corridor
 * would be a number this project does not have. The panel says that in words
 * and `getAnalystRecords` returns the volume fields as explicit nulls.
 */

/**
 * Network colours.
 *
 * Distinct from the trade-flow teal and the chokepoint amber so a reader can
 * tell infrastructure from analysis at a glance, and from each other when two
 * are on at once. Defined here rather than imported from the workspace: a layer
 * depending on the UI's vocabulary is the wrong direction and the boundary
 * checker is right to reject it.
 */
const NETWORK_COLOURS = Object.freeze({
  'freight-rail': '#c6a0f6',
  'freight-roads': '#8aa8c8',
  /* Brighter than the freight roads: this is the network relief drives on. */
  'access-roads': '#7fd4b0',
  pipelines: '#e0975b',
  'production-sites': '#d98e73',
});

/** Line widths. One width per network: nothing here measures volume. */
const LINE_WIDTH = 2.2;

/**
 * Milliseconds of camera stillness before a fetch.
 *
 * Long enough that dragging across a continent issues one request rather than
 * forty, short enough that it does not feel broken.
 */
const SETTLE_MS = 700;

/**
 * Camera height above which a fetch is refused, in metres.
 *
 * Above roughly 3,000 km the view spans far more than the proxy's 12° and the
 * result would be a thin band across the middle of the screen — which reads as
 * "this is all the railway there is". Refusing and saying why is better.
 */
const MAX_FETCH_HEIGHT_M = 3_000_000;

/**
 * Create a freight infrastructure layer.
 *
 * @param {object} deps
 * @param {'rail'|'roads'|'access'|'pipelines'|'production'} deps.network
 * @param {(query:string, options?:object)=>Promise<object>} deps.fetchOverpass
 *   returns parsed Overpass JSON, or throws
 * @param {(reason:string)=>void} [deps.governorRequestRender]
 * @param {(record:object)=>void} [deps.onSelect]
 * @returns {object} layer
 */
export function createFreightLayer({
  network,
  fetchOverpass,
  governorRequestRender = () => {},
  onSelect = null,
}) {
  const definition = FREIGHT_NETWORKS[network];
  if (!definition) {
    throw new TypeError(`Unknown freight network "${network}"`);
  }
  if (typeof fetchOverpass !== 'function') {
    throw new TypeError('A freight layer requires an Overpass transport');
  }

  const colour = Cesium.Color.fromCssColorString(
    NETWORK_COLOURS[definition.id] ?? '#9fb3c8',
  );

  let _viewer = null;
  let _polylines = null;
  let _points = null;
  let _labels = null;
  let _pickHandler = null;
  let _cameraListener = null;
  let _settleTimer = null;
  let _enabled = false;
  let _lastUpdate = null;
  let _error = null;
  let _provenance = null;
  let _tooHighToFetch = false;
  let _clamped = false;
  let _loading = false;
  /** The last fetched records, for the panel and the analyst engine. */
  let _records = [];
  /** Index from primitive back to record, for picking. */
  const byPrimitive = new Map();
  /** Guards against a stale response painting over a newer one. */
  let _generation = 0;

  function clear() {
    _polylines?.removeAll();
    _points?.removeAll();
    _labels?.removeAll();
    byPrimitive.clear();
  }

  function currentBbox() {
    if (!_viewer?.camera) return null;
    const rectangle = _viewer.camera.computeViewRectangle(
      _viewer.scene?.globe?.ellipsoid,
    );
    if (!rectangle) return null;
    const degrees = (radians) => Cesium.Math.toDegrees(radians);
    return {
      south: degrees(rectangle.south),
      west: degrees(rectangle.west),
      north: degrees(rectangle.north),
      east: degrees(rectangle.east),
    };
  }

  function cameraHeight() {
    const carto = _viewer?.camera?.positionCartographic;
    return Number.isFinite(carto?.height) ? carto.height : Infinity;
  }

  function drawLines(lines) {
    for (const line of lines) {
      const positions = line.coordinates.map(([lon, lat]) =>
        Cesium.Cartesian3.fromDegrees(lon, lat),
      );
      const primitive = _polylines.add({
        positions,
        width: LINE_WIDTH,
        material: Cesium.Material.fromType('Color', {
          color: colour.withAlpha(0.82),
        }),
      });
      byPrimitive.set(primitive, line);
    }
  }

  function drawPoints(points) {
    for (const point of points) {
      const position = Cesium.Cartesian3.fromDegrees(point.lon, point.lat);
      const primitive = _points.add({
        position,
        color: colour,
        pixelSize: 7,
        outlineColor: Cesium.Color.BLACK.withAlpha(0.65),
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
      byPrimitive.set(primitive, point);
      // Only named sites get a label. An unnamed quarry's marker is the whole
      // of what is known about it, and "(unnamed)" floating over a mountain
      // is worse than nothing.
      if (point.tags.name) {
        _labels.add({
          position,
          text: point.tags.name,
          font: '500 11px "Inter", sans-serif',
          fillColor: colour,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.85),
          outlineWidth: 2.5,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -9),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
            0,
            900_000,
          ),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
      }
    }
  }

  /**
   * Fetch and draw whatever is in view.
   *
   * Resolves to false only on a real failure. An empty result is a success
   * that happens to say "nobody has mapped this here", and treating it as a
   * failure would make the manager roll back an enable the user asked for.
   */
  async function refresh() {
    if (!_viewer || !_polylines) return true;
    const generation = ++_generation;

    if (cameraHeight() > MAX_FETCH_HEIGHT_M) {
      _tooHighToFetch = true;
      _loading = false;
      clear();
      _records = [];
      _provenance = null;
      _error = null;
      governorRequestRender(`${definition.id}:too-high`);
      return true;
    }
    _tooHighToFetch = false;

    const built = freightQuery(network, currentBbox());
    if (!built) {
      // No usable view rectangle — the camera is mid-flight or looking at the
      // horizon. Not an error, and not worth a request.
      return true;
    }
    _clamped = built.bbox.clamped;
    _loading = true;
    governorRequestRender(`${definition.id}:loading`);

    try {
      const payload = await fetchOverpass(built.query);
      if (generation !== _generation) return true;
      const records =
        definition.kind === 'line'
          ? normalizeFreightLines(payload)
          : normalizeFreightPoints(payload);
      clear();
      if (definition.kind === 'line') drawLines(records);
      else drawPoints(records);
      _records = records;
      _error = null;
      _lastUpdate = Date.now();
      _provenance = freightProvenance({
        network: definition,
        bbox: built.bbox,
        count: records.length,
        clamped: _clamped,
        retrievedAt: new Date(_lastUpdate).toISOString(),
      });
      _loading = false;
      governorRequestRender(`${definition.id}:rendered`);
      return true;
    } catch (error) {
      if (generation !== _generation) return true;
      _loading = false;
      _error = error?.message ?? String(error);
      governorRequestRender(`${definition.id}:error`);
      // A failed fetch IS a failure: the manager should roll the enable back
      // rather than leave a layer switched on that is showing nothing.
      return false;
    }
  }

  function scheduleRefresh() {
    if (!_enabled) return;
    if (_settleTimer) clearTimeout(_settleTimer);
    _settleTimer = setTimeout(() => {
      _settleTimer = null;
      void refresh();
    }, SETTLE_MS);
  }

  function attachPicking(viewer) {
    if (!onSelect || _pickHandler) return;
    _pickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    _pickHandler.setInputAction((movement) => {
      if (!_enabled) return;
      const picked = viewer.scene.pick(movement.position);
      const record = picked?.primitive
        ? byPrimitive.get(picked.primitive)
        : null;
      if (record) onSelect(toContextRecord(record));
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  /**
   * One record in the shape the selection bus expects.
   *
   * `properties` is deliberately flat text: the voice payload drops nested
   * objects, so a nested `tags` here would silently disappear from a spoken
   * answer.
   */
  function toContextRecord(record) {
    const tags = record.tags ?? {};
    const output = siteOutput(tags);
    const properties = {
      network: definition.name,
      osmId: record.osmId,
    };
    if (tags.operator) properties.operator = tags.operator;
    if (tags.substance) properties.substance = tags.substance;
    if (tags.gauge) properties.gauge = `${tags.gauge} mm`;
    if (tags.electrified) properties.electrified = tags.electrified;
    if (tags.ref) properties.reference = tags.ref;
    if (record.kind) properties.siteType = SITE_KIND_LABELS[record.kind];
    if (output) properties.extractsOrProduces = output;
    // Stated, not omitted: an absent field reads as "not asked for", and the
    // whole point of these layers is that position is known and volume is not.
    properties.throughput = 'Not recorded by OpenStreetMap';
    return {
      id: record.osmId,
      layerId: definition.id,
      layerName: definition.name,
      source: 'OpenStreetMap · HISTORICAL',
      label: tags.name ?? `${definition.name} (unnamed)`,
      latitude: record.lat ?? record.coordinates?.[0]?.[1] ?? null,
      longitude: record.lon ?? record.coordinates?.[0]?.[0] ?? null,
      properties,
    };
  }

  const layer = {
    id: definition.id,
    name: definition.name,
    icon: definition.icon,
    source: 'OpenStreetMap · HISTORICAL',
    // Camera-driven rather than clock-driven. Freight infrastructure does not
    // move; the view does.
    updateInterval: 0,

    init(viewer) {
      if (_viewer) throw new Error(`${definition.id} is already initialized`);
      _viewer = viewer;
      _polylines = viewer.scene.primitives.add(new Cesium.PolylineCollection());
      _points = viewer.scene.primitives.add(
        new Cesium.PointPrimitiveCollection(),
      );
      _labels = viewer.scene.primitives.add(new Cesium.LabelCollection());
      _polylines.show = false;
      _points.show = false;
      _labels.show = false;
      attachPicking(viewer);
      _cameraListener = () => scheduleRefresh();
      viewer.camera.moveEnd.addEventListener(_cameraListener);
    },

    enable() {
      _enabled = true;
      if (_polylines) _polylines.show = true;
      if (_points) _points.show = true;
      if (_labels) _labels.show = true;
      governorRequestRender(`${definition.id}:enable`);
    },

    disable() {
      _enabled = false;
      if (_settleTimer) {
        clearTimeout(_settleTimer);
        _settleTimer = null;
      }
      if (_polylines) _polylines.show = false;
      if (_points) _points.show = false;
      if (_labels) _labels.show = false;
      governorRequestRender(`${definition.id}:disable`);
    },

    /** The manager's first call after enable, and the initial fetch. */
    update() {
      return refresh();
    },

    getProvenance() {
      return _provenance;
    },

    /**
     * The decoded segments, for analysis that needs the geometry itself.
     *
     * The disaster platform routes rescue and evacuation over this network, so
     * it needs the coordinates rather than the analyst summary. Returned as-is
     * because every record is already frozen.
     */
    getSegments() {
      return definition.kind === 'line' ? _records : [];
    },

    /**
     * Everything the panel needs to explain itself.
     *
     * Including the two states that are not errors and not data: the camera is
     * too far out to ask, and nobody has mapped this area.
     */
    getReading() {
      return Object.freeze({
        id: definition.id,
        name: definition.name,
        reads: definition.reads,
        affectsSupplyChain: definition.affectsSupplyChain,
        measures: definition.measures,
        missing: definition.missing,
        wouldNeed: definition.wouldNeed,
        count: _records.length,
        loading: _loading,
        error: _error,
        tooHighToFetch: _tooHighToFetch,
        viewTruncated: _clamped,
        provenance: _provenance,
      });
    },

    getStats() {
      return {
        count: _records.length,
        enabled: _enabled,
        lastUpdate: _lastUpdate,
        error: _error,
        loading: _loading,
        source: 'OpenStreetMap (ODbL)',
      };
    },

    getAnalystRecords(maxCount = 200) {
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 200;
      return _records.slice(0, limit).map((record, index) => {
        const tags = record.tags ?? {};
        return {
          index,
          osmId: record.osmId,
          name: tags.name ?? null,
          operator: tags.operator ?? null,
          network: definition.name,
          lat: record.lat ?? record.coordinates?.[0]?.[1] ?? null,
          lon: record.lon ?? record.coordinates?.[0]?.[0] ?? null,
          siteType: record.kind ? SITE_KIND_LABELS[record.kind] : null,
          extractsOrProduces: siteOutput(tags),
          substance: tags.substance ?? null,
          // Declared nulls, so a spoken or written answer reports the gap
          // rather than leaving a reader to assume it was simply not asked.
          annualVolume: null,
          capacity: null,
          currentUtilisation: null,
          inService: null,
        };
      });
    },

    destroy(viewer = _viewer) {
      if (_settleTimer) {
        clearTimeout(_settleTimer);
        _settleTimer = null;
      }
      if (_cameraListener && viewer?.camera && !viewer.isDestroyed?.()) {
        viewer.camera.moveEnd.removeEventListener(_cameraListener);
      }
      _cameraListener = null;
      if (_pickHandler) {
        _pickHandler.destroy();
        _pickHandler = null;
      }
      if (viewer?.scene && !viewer.isDestroyed?.()) {
        if (_polylines) viewer.scene.primitives.remove(_polylines);
        if (_points) viewer.scene.primitives.remove(_points);
        if (_labels) viewer.scene.primitives.remove(_labels);
      }
      byPrimitive.clear();
      _polylines = null;
      _points = null;
      _labels = null;
      _viewer = null;
      _enabled = false;
      _records = [];
      _provenance = null;
      _error = null;
      _lastUpdate = null;
      _loading = false;
    },
  };
  return layer;
}
