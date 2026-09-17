import * as Cesium from 'cesium';
import {
  AIR_GATEWAYS,
  AIR_GATEWAYS_SOURCE,
} from '../../supplychain/reference/airGateways.js';
import { DataClass, createProvenance } from '../../supplychain/provenance.js';

/**
 * Air-freight gateways.
 *
 * 1,152 large airports with scheduled service, from OurAirports (public
 * domain), bundled rather than fetched: the source CSV is about 12 MB, this
 * subset is under 200 KB, and an airport does not move.
 *
 * WHAT THIS IS AND IS NOT. It is where scheduled air freight can physically
 * move — which matters because a high-value, low-weight supply chain
 * (semiconductors, pharmaceuticals, aircraft parts) largely flies, and because
 * a great deal of air freight travels in the belly of a scheduled passenger
 * aircraft rather than on a dedicated freighter. It is NOT a ranking of cargo
 * airports. OurAirports records position, identity and whether an airport has
 * scheduled service; it does not record tonnage, and no open global source
 * does. Memphis and Hong Kong are in here, and so is every other large airport,
 * with nothing to distinguish them, because nothing in the data distinguishes
 * them.
 *
 * So every marker is the same size. A size scale would be a claim about volume,
 * and there is no volume here to make it from. The reading says that in words.
 *
 * Rendering is a single PointPrimitiveCollection: these are static, never
 * animate and never need per-frame property evaluation.
 */

/** Violet — the air transport mode's colour in the route legend. */
const COLOUR = Cesium.Color.fromCssColorString('#b07ae0');
const COLOUR_SELECTED = Cesium.Color.fromCssColorString('#f0a830');

/**
 * Create the air-gateway layer.
 *
 * @param {object} [deps]
 * @param {(reason:string)=>void} [deps.governorRequestRender]
 * @param {(record:object)=>void} [deps.onSelect]
 * @returns {object} layer
 */
export function createAirGatewayLayer({
  governorRequestRender = () => {},
  onSelect = null,
} = {}) {
  let _viewer = null;
  let _points = null;
  let _labels = null;
  let _handler = null;
  let _enabled = false;
  let _selectedIdent = null;
  let _lastUpdate = null;

  const byPrimitive = new Map();

  function colourFor(gateway) {
    return gateway.ident === _selectedIdent ? COLOUR_SELECTED : COLOUR;
  }

  /**
   * Marker size.
   *
   * Constant, apart from the selection. This is the rule the layer exists to
   * keep: nothing here measures throughput, so nothing here is sized by it.
   */
  function sizeFor(gateway) {
    return gateway.ident === _selectedIdent ? 13 : 6;
  }

  function build(viewer) {
    _points = viewer.scene.primitives.add(
      new Cesium.PointPrimitiveCollection(),
    );
    _labels = viewer.scene.primitives.add(new Cesium.LabelCollection());
    _points.show = false;
    _labels.show = false;

    for (const gateway of AIR_GATEWAYS) {
      const position = Cesium.Cartesian3.fromDegrees(gateway.lon, gateway.lat);
      const primitive = _points.add({
        position,
        color: colourFor(gateway),
        pixelSize: sizeFor(gateway),
        outlineColor: Cesium.Color.BLACK.withAlpha(0.6),
        outlineWidth: 1,
        translucencyByDistance: new Cesium.NearFarScalar(
          1.0e6,
          1.0,
          4.0e7,
          0.3,
        ),
      });
      byPrimitive.set(primitive, gateway);

      // The IATA code, not the full name: "LHR" is readable at a glance and
      // 1,152 airport names at continental zoom is a grey smear.
      if (gateway.iata) {
        _labels.add({
          position,
          text: gateway.iata,
          font: '600 10px "JetBrains Mono", ui-monospace, monospace',
          fillColor: Cesium.Color.WHITE.withAlpha(0.85),
          outlineColor: Cesium.Color.BLACK.withAlpha(0.8),
          outlineWidth: 2.5,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -8),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
            0,
            3_000_000,
          ),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
      }
    }
    _lastUpdate = Date.now();
  }

  function repaint() {
    if (!_points) return;
    for (const [primitive, gateway] of byPrimitive) {
      primitive.color = colourFor(gateway);
      primitive.pixelSize = sizeFor(gateway);
    }
    governorRequestRender('air-cargo-hubs:repaint');
  }

  function toContextRecord(gateway) {
    return {
      id: gateway.ident,
      layerId: 'air-cargo-hubs',
      layerName: 'Air Freight Gateways',
      source: 'OurAirports · HISTORICAL',
      label: gateway.name,
      latitude: gateway.lat,
      longitude: gateway.lon,
      properties: {
        iata: gateway.iata ?? 'none assigned',
        icao: gateway.ident,
        city: gateway.city ?? 'not recorded',
        country: gateway.iso2,
        classification: 'Large airport with scheduled service (OurAirports)',
        // Stated rather than omitted, for the same reason as the ports layer:
        // a missing field reads as "not asked for".
        cargoTonnes: 'Not recorded by OurAirports',
        freighterMovements: 'Not recorded by OurAirports',
      },
    };
  }

  function attachPicking(viewer) {
    if (!onSelect || _handler) return;
    _handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    _handler.setInputAction((movement) => {
      if (!_enabled) return;
      const picked = viewer.scene.pick(movement.position);
      const gateway = picked?.primitive
        ? byPrimitive.get(picked.primitive)
        : null;
      if (gateway) {
        _selectedIdent = gateway.ident;
        repaint();
        onSelect(toContextRecord(gateway));
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  const provenance = createProvenance({
    dataClass: DataClass.HISTORICAL,
    source: AIR_GATEWAYS_SOURCE.source,
    dataset: `${AIR_GATEWAYS_SOURCE.count} large airports with scheduled service`,
    license: AIR_GATEWAYS_SOURCE.license,
    method: `Bundled from airports.csv, filtered to ${AIR_GATEWAYS_SOURCE.filter}. Coordinates rounded to about 100 m.`,
    retrievedAt: null,
    updateFrequency: 'community-maintained; rebuilt when this project rebuilds',
    confidence: 0.8,
    limitations: [
      'NOT A CARGO RANKING. OurAirports records no freight tonnage and no ' +
        'open global source does — ACI’s cargo rankings are a paid ' +
        'publication. Every marker is the same size because there is no ' +
        'volume figure here to size it by.',
      '"Large airport with scheduled service" is OurAirports’ own ' +
        'classification, not a judgement made here, and it is about runway ' +
        'and terminal scale rather than freight role.',
      'Dedicated freight airports with little or no scheduled passenger ' +
        'service may be classified below large_airport and so be absent.',
      'Bundled at build time. An airport that opened or closed since the last ' +
        'rebuild will be wrong until `node scripts/build-air-gateways.mjs` ' +
        'runs again.',
    ],
  });

  const layer = {
    id: 'air-cargo-hubs',
    name: 'Air Freight Gateways',
    icon: '🛬',
    source: 'OurAirports · HISTORICAL',
    updateInterval: 0,

    init(viewer) {
      if (_viewer) throw new Error('Air gateway layer is already initialized');
      _viewer = viewer;
      build(viewer);
      attachPicking(viewer);
    },

    enable() {
      _enabled = true;
      if (_points) _points.show = true;
      if (_labels) _labels.show = true;
      governorRequestRender('air-cargo-hubs:enable');
    },

    disable() {
      _enabled = false;
      if (_points) _points.show = false;
      if (_labels) _labels.show = false;
      governorRequestRender('air-cargo-hubs:disable');
    },

    async update() {
      // Bundled static reference data. Nothing to fetch, and the refresh still
      // succeeded — `false` would make the manager roll back the enable.
      return true;
    },

    getProvenance() {
      return provenance;
    },

    /** Gateways in one country, for the supply-chain route's air legs. */
    findByCountry(iso2) {
      return AIR_GATEWAYS.filter((gateway) => gateway.iso2 === iso2);
    },

    /** Select by ICAO ident, for the console and voice actions. */
    select(ident) {
      _selectedIdent = ident ?? null;
      repaint();
      return AIR_GATEWAYS.find((gateway) => gateway.ident === ident) ?? null;
    },

    getStats() {
      return {
        count: AIR_GATEWAYS.length,
        enabled: _enabled,
        lastUpdate: _lastUpdate,
        error: null,
        source: 'OurAirports (public domain)',
      };
    },

    getAnalystRecords(maxCount = 200) {
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 200;
      return AIR_GATEWAYS.slice(0, limit).map((gateway, index) => ({
        index,
        icao: gateway.ident,
        iata: gateway.iata,
        name: gateway.name,
        city: gateway.city,
        country: gateway.iso2,
        lat: gateway.lat,
        lon: gateway.lon,
        classification: 'large_airport, scheduled service',
        cargoTonnes: null,
        freighterMovements: null,
        runwayCount: null,
      }));
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
      _selectedIdent = null;
      _lastUpdate = null;
    },
  };
  return layer;
}
