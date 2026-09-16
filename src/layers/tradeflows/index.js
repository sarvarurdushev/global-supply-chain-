import * as Cesium from 'cesium';
import { greatCircleArc, haversineKm } from '../../supplychain/geo.js';
import { AssociationClass } from '../../supplychain/provenance.js';

/**
 * Trade-flow layer.
 *
 * Draws bilateral trade for one commodity and year as great-circle arcs, with
 * line width scaled by trade value. Follows the inherited layer contract:
 * init/enable/disable/update/destroy/getStats/getAnalystRecords.
 *
 * Two rendering decisions carry meaning rather than being cosmetic:
 *
 *  - **Arcs are raised above the surface in proportion to their length.** A flat
 *    great circle on a globe is visually ambiguous about direction and overlaps
 *    every other arc near the poles. The raised arc reads as a trajectory.
 *  - **Flows whose partner is an aggregate code are drawn in the INFERRED
 *    colour**, not the verified one. "Other Asia, nes" is frequently the largest
 *    single line in a series, and drawing it identically to China would assert
 *    a precision the data does not have.
 *
 * The layer never fetches on its own. The supply-chain console owns the query
 * and pushes results in through `setFlows()`, because the commodity, year and
 * direction are user selections rather than a polling schedule.
 */

/** Verified country-to-country flow. */
const COLOUR_VERIFIED = Cesium.Color.fromCssColorString('#00d4ff');
/** Flow whose partner is an aggregate or "nes" code — an inference. */
const COLOUR_INFERRED = Cesium.Color.fromCssColorString('#ffb800');
/** Highlight for a flow touching a disrupted node. */
const COLOUR_DISRUPTED = Cesium.Color.fromCssColorString('#ff4d4f');

/** Arc widths in pixels, for the smallest and largest flow on screen. */
const MIN_WIDTH = 1.2;
const MAX_WIDTH = 9;

/**
 * Scale a value onto a line width.
 *
 * Uses a square-root scale rather than linear. Trade value spans four orders of
 * magnitude in a typical series, so a linear scale renders everything except
 * the top two or three partners as a hairline. Square root keeps the ordering
 * honest while leaving the long tail visible.
 *
 * @param {number} value
 * @param {number} max
 * @returns {number}
 */
export function flowWidth(value, max) {
  if (!(max > 0) || !(value > 0)) return MIN_WIDTH;
  const ratio = Math.sqrt(value / max);
  return MIN_WIDTH + ratio * (MAX_WIDTH - MIN_WIDTH);
}

/**
 * Peak height of an arc above the ellipsoid, in metres.
 *
 * Proportional to the arc's ground length so short intra-regional flows stay
 * close to the surface and intercontinental flows bow clear of it.
 *
 * The factor is deliberately modest. At 0.055 x distance a 9,000 km flow peaks
 * around 500 km — roughly 8% of Earth's radius, which reads as an arc hugging
 * the globe. Larger factors make the longest flows leave the frame entirely and
 * read as spikes rather than trajectories.
 *
 * @param {number} distanceKm
 * @returns {number} metres
 */
export function arcHeight(distanceKm) {
  return Math.min(900_000, Math.max(50_000, distanceKm * 55));
}

/** Build the raised great-circle positions for one flow. */
function arcPositions(from, to, segments = 48) {
  const ground = greatCircleArc(from, to, segments);
  // Great-circle distance, not a degree approximation. sqrt(dLat^2 + dLon^2)
  // over-measures east-west spans badly away from the equator, which pinned
  // every intercontinental arc to the height cap.
  const peak = arcHeight(haversineKm(from, to));
  const positions = [];
  for (let i = 0; i < ground.length; i += 1) {
    const t = i / (ground.length - 1);
    // Parabolic profile: zero at both ends, peak at the midpoint.
    const height = peak * Math.sin(Math.PI * t);
    positions.push(
      Cesium.Cartesian3.fromDegrees(ground[i].lon, ground[i].lat, height),
    );
  }
  return positions;
}

/**
 * Create the trade-flow layer.
 *
 * @param {object} deps
 * @param {(reason:string)=>void} [deps.governorRequestRender]
 * @param {Function} [deps.registerEntityContext]
 * @param {Function} [deps.removeEntityContextsForLayer]
 * @returns {object} layer
 */
export function createTradeFlowsLayer({
  governorRequestRender = () => {},
  registerEntityContext = null,
  removeEntityContextsForLayer = null,
} = {}) {
  let _viewer = null;
  let _dataSource = null;
  let _enabled = false;
  let _flows = [];
  let _disruptedCountries = new Set();
  let _meta = null;
  let _lastUpdate = null;
  let _error = null;
  let _dirty = false;

  function render() {
    if (!_dataSource) return;
    _dataSource.entities.removeAll();
    if (removeEntityContextsForLayer)
      removeEntityContextsForLayer('trade-flows');
    if (_flows.length === 0) {
      governorRequestRender('trade-flows:cleared');
      return;
    }
    const max = _flows[0]?.valueUsd ?? 0;

    for (const flow of _flows) {
      const disrupted =
        _disruptedCountries.has(flow.reporterCode) ||
        _disruptedCountries.has(flow.partnerCode);
      const base = disrupted
        ? COLOUR_DISRUPTED
        : flow.association === AssociationClass.VERIFIED
          ? COLOUR_VERIFIED
          : COLOUR_INFERRED;
      // Larger flows read as more opaque as well as wider; the two cues
      // reinforce rather than compete.
      const alpha = 0.35 + 0.5 * Math.sqrt(flow.valueUsd / (max || 1));
      const entity = _dataSource.entities.add(
        new Cesium.Entity({
          id: `trade-flow:${flow.id}`,
          polyline: {
            positions: arcPositions(flow.from, flow.to),
            width: flowWidth(flow.valueUsd, max),
            material: new Cesium.ColorMaterialProperty(
              base.withAlpha(Math.min(0.9, alpha)),
            ),
            arcType: Cesium.ArcType.NONE,
          },
          properties: {
            partnerName: flow.partnerName,
            valueUsd: flow.valueUsd,
            netWeightKg: flow.netWeightKg,
            association: flow.association,
            isReported: flow.isReported,
            caveat: flow.caveat,
          },
        }),
      );
      if (registerEntityContext) {
        registerEntityContext(entity, {
          layerId: 'trade-flows',
          dataSource: 'UN Comtrade',
          label: flow.partnerName,
        });
      }
    }
    _lastUpdate = Date.now();
    governorRequestRender('trade-flows:rendered');
  }

  const layer = {
    id: 'trade-flows',
    name: 'Trade Flows',
    icon: '⇄',
    source: 'UN Comtrade · HISTORICAL',
    // The console drives this layer; there is no polling schedule.
    updateInterval: 0,

    init(viewer) {
      if (_viewer) throw new Error('Trade flow layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource('trade-flows');
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      _enabled = false;
      _error = null;
    },

    enable() {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      if (_dirty) {
        render();
        _dirty = false;
      }
      governorRequestRender('trade-flows:enable');
    },

    disable() {
      _enabled = false;
      if (_dataSource) _dataSource.show = false;
      governorRequestRender('trade-flows:disable');
    },

    /**
     * No network activity: the console owns acquisition.
     *
     * Returns true because in this contract `update()` reports SUCCESS, not
     * "something changed" — the manager treats false as a failed refresh and
     * rolls the enable back, leaving a populated layer permanently hidden.
     */
    async update() {
      return true;
    },

    /**
     * Replace the rendered flows.
     *
     * @param {Array<object>} flows from buildFlows()
     * @param {object} [meta] commodity, period, flow direction, provenance
     */
    setFlows(flows, meta = null) {
      _flows = Array.isArray(flows) ? [...flows] : [];
      _meta = meta;
      _error = null;
      if (_enabled) render();
      else _dirty = true;
    },

    /** Highlight flows touching disrupted countries, for the WHAT IF panel. */
    setDisruptedCountries(codes) {
      _disruptedCountries = new Set(codes ?? []);
      if (_enabled) render();
      else _dirty = true;
    },

    /** Record a failed acquisition so the HUD can show it. */
    setError(message) {
      _error = message || null;
      governorRequestRender('trade-flows:error');
    },

    clear() {
      _flows = [];
      _meta = null;
      if (_enabled) render();
      else _dirty = true;
    },

    destroy(viewer = _viewer) {
      if (removeEntityContextsForLayer)
        removeEntityContextsForLayer('trade-flows');
      if (_dataSource && viewer) {
        viewer.dataSources.remove(_dataSource, true);
      }
      _dataSource = null;
      _viewer = null;
      _enabled = false;
      _flows = [];
      _meta = null;
      _lastUpdate = null;
      _error = null;
    },

    /** Snapshot for the voice analyst query engine. */
    getAnalystRecords(maxCount = 200) {
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 200;
      return _flows.slice(0, limit).map((flow, index) => ({
        index,
        partner: flow.partnerName,
        valueUsd: flow.valueUsd,
        netWeightKg: flow.netWeightKg,
        association: flow.association,
        isReported: flow.isReported,
        commodity: _meta?.commodity ?? null,
        period: _meta?.period ?? null,
        direction: _meta?.flow === 'M' ? 'import' : 'export',
      }));
    },

    getStats() {
      return {
        count: _flows.length,
        lastUpdate: _lastUpdate,
        error: _error,
        source: 'UN Comtrade',
        // Trade data is never live; the chip must not read NOMINAL as if it were.
        status:
          _flows.length === 0 && !_error ? 'awaiting-selection' : undefined,
        commodity: _meta?.commodity ?? null,
        period: _meta?.period ?? null,
      };
    },
  };
  return layer;
}
