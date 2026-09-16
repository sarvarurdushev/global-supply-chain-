import * as Cesium from 'cesium';
import { transportMode } from '../../supplychain/chain.js';
import { greatCircleArc } from '../../supplychain/geo.js';
import { DataClass } from '../../supplychain/provenance.js';

/**
 * The staged supply-chain layer (§16).
 *
 * Draws one chain at a time — the sequence of places a commodity passes through
 * between two countries — with each leg styled by its transport mode and each
 * stop labelled with how well it is known.
 *
 * THE VISUAL GRAMMAR, which is the requirement:
 *
 *   SEA legs    solid teal, thick
 *   LAND legs   dashed amber, thinner
 *   AIR legs    dotted violet, thinnest
 *
 * Dash pattern carries the distinction and colour reinforces it, so the picture
 * survives greyscale and colour-blindness. A reader can tell a sea leg from an
 * inland hop without consulting the legend.
 *
 * WHAT IS DELIBERATELY NOT DRAWN: the five stages nothing supports — extraction,
 * processing, manufacture, inland distribution, the final consumer. They have no
 * position, so there is no honest place to put them, and a line running off to
 * an imagined mine would be the most persuasive part of the image. They appear
 * in the panel as gaps instead.
 *
 * The layer renders whatever the workspace pushes into it. Like the trade-flow
 * layer, it never builds a query of its own.
 */

/** Stage marker sizes. A country reads larger than a waypoint. */
const STOP_SIZE = Object.freeze({
  ORIGIN: 13,
  DESTINATION: 13,
  LOAD_PORT: 9,
  DISCHARGE_PORT: 9,
  SEA_TRANSIT: 7,
});

/** Great-circle segments per leg. Enough to curve without costing much. */
const ARC_SEGMENTS = 48;

/**
 * Stop colours by data class.
 *
 * Defined here rather than imported from the workspace: a layer depending on
 * the UI's presentation vocabulary is the wrong direction, and the boundary
 * checker is right to reject it. The values match
 * `workspace/taxonomy.js` DATA_CLASS_PRESENTATION, and a test holds the two in
 * agreement so they cannot drift.
 */
const STOP_COLOURS = Object.freeze({
  [DataClass.LIVE]: '#66bb6a',
  [DataClass.HISTORICAL]: '#4fc3f7',
  [DataClass.INFERRED]: '#ffb74d',
  [DataClass.SIMULATED]: '#ba68c8',
  [DataClass.UNKNOWN]: '#78909c',
});

/** The colour for a stage's data class, defaulting to the unknown grey. */
export function stopColour(dataClass) {
  return STOP_COLOURS[dataClass] ?? STOP_COLOURS[DataClass.UNKNOWN];
}

/**
 * Create the layer.
 *
 * @param {object} [deps]
 * @param {(reason:string)=>void} [deps.governorRequestRender]
 * @returns {object} layer
 */
export function createChainLayer({ governorRequestRender = () => {} } = {}) {
  let _viewer = null;
  let _dataSource = null;
  let _enabled = false;
  let _chain = null;
  let _error = null;
  let _lastUpdate = null;

  function clear() {
    _dataSource?.entities.removeAll();
  }

  function render() {
    if (!_dataSource) return;
    clear();
    if (!_chain) {
      governorRequestRender('supply-chain:cleared');
      return;
    }

    // Legs first, so stop markers sit on top of the lines rather than under.
    for (const [index, leg] of _chain.legs.entries()) {
      const mode = transportMode(leg.mode);
      const colour = Cesium.Color.fromCssColorString(mode.colour);
      const positions = greatCircleArc(leg.from, leg.to, ARC_SEGMENTS).map(
        (point) => Cesium.Cartesian3.fromDegrees(point.lon, point.lat),
      );
      _dataSource.entities.add(
        new Cesium.Entity({
          id: `chain-leg:${index}`,
          polyline: {
            positions,
            width: mode.width * 1.6,
            clampToGround: false,
            material: mode.dash
              ? new Cesium.PolylineDashMaterialProperty({
                  color: colour.withAlpha(0.9),
                  // Cesium's dash pattern is a 16-bit mask rather than an
                  // array. Long dashes for LAND, sparse dots for AIR and
                  // UNKNOWN — derived from the mode's own [on, off] so the two
                  // definitions cannot drift apart.
                  dashLength: mode.dash[0] + mode.dash[1],
                })
              : new Cesium.ColorMaterialProperty(colour.withAlpha(0.9)),
          },
          properties: {
            kind: 'chain-leg',
            mode: leg.mode,
            distanceKm: Math.round(leg.distanceKm),
            caveat: leg.caveat,
          },
        }),
      );
    }

    for (const stage of _chain.stages) {
      if (!stage.available) continue;
      const colour = Cesium.Color.fromCssColorString(
        stopColour(stage.dataClass),
      );
      _dataSource.entities.add(
        new Cesium.Entity({
          id: `chain-stop:${stage.kind}:${stage.name}`,
          position: Cesium.Cartesian3.fromDegrees(stage.lon, stage.lat),
          point: {
            pixelSize: STOP_SIZE[stage.kind] ?? 8,
            color: colour,
            outlineColor: Cesium.Color.BLACK.withAlpha(0.7),
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: stage.name,
            font: '500 12px "Inter", sans-serif',
            fillColor: colour,
            outlineColor: Cesium.Color.BLACK.withAlpha(0.85),
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -12),
            // Waypoints drop their labels first as the camera pulls back; the
            // two endpoints keep theirs, because they are the point.
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
              0,
              stage.kind === 'ORIGIN' || stage.kind === 'DESTINATION'
                ? 40_000_000
                : 12_000_000,
            ),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: {
            kind: 'chain-stop',
            stage: stage.kind,
            dataClass: stage.dataClass,
            basis: stage.basis,
            caveat: stage.caveat,
          },
        }),
      );
    }

    _lastUpdate = Date.now();
    governorRequestRender('supply-chain:rendered');
  }

  const layer = {
    id: 'supply-chain',
    name: 'Supply Chain Route',
    icon: '⛓',
    source: 'Derived · INFERRED',
    // Static once pushed. Nothing to poll.
    updateInterval: 0,

    init(viewer) {
      if (_viewer) throw new Error('Chain layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource('supply-chain');
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      // A chain pushed before the layer was initialised is still the chain the
      // caller wants drawn. The manager initialises a layer lazily on its
      // first enable, so setChain() legitimately arrives first — and an earlier
      // version silently dropped it, leaving a populated panel over an empty
      // globe.
      if (_chain) render();
    },

    enable() {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      // Same reason: render on enable if something is waiting.
      if (_chain && _lastUpdate === null) render();
      governorRequestRender('supply-chain:enable');
    },

    disable() {
      _enabled = false;
      if (_dataSource) _dataSource.show = false;
      governorRequestRender('supply-chain:disable');
    },

    /**
     * Nothing to refresh.
     *
     * Returns true because `false` means the update FAILED in this contract and
     * the manager rolls back the enable. A layer that renders pushed data has
     * not failed by having nothing new to fetch.
     */
    async update() {
      return true;
    },

    /**
     * Show a chain built by `buildSupplyChain()`.
     *
     * @param {object|null} chain pass null to clear
     */
    setChain(chain) {
      _chain = chain ?? null;
      _error = null;
      // Safe before init: render() no-ops without a data source, and init()
      // picks the pending chain up.
      render();
      return true;
    },

    getChain() {
      return _chain;
    },

    destroy(viewer = _viewer) {
      if (_dataSource && viewer && !viewer.isDestroyed?.()) {
        viewer.dataSources.remove(_dataSource, true);
      }
      _dataSource = null;
      _viewer = null;
      _enabled = false;
      _chain = null;
      _error = null;
      _lastUpdate = null;
    },

    getProvenance() {
      return _chain?.provenance ?? null;
    },

    getStats() {
      return {
        count: _chain ? _chain.stagesPlaced : 0,
        missingStages: _chain ? _chain.stagesMissing : null,
        legs: _chain ? _chain.legs.length : 0,
        enabled: _enabled,
        lastUpdate: _lastUpdate,
        error: _error,
        source: 'Derived from trade data, ports and chokepoint geography',
      };
    },

    getAnalystRecords(maxCount = 40) {
      if (!_chain) return [];
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 40;
      return _chain.stages.slice(0, limit).map((stage, index) => ({
        index,
        stage: stage.kind,
        name: stage.name,
        available: stage.available,
        dataClass: stage.dataClass,
        // Carried so a spoken answer cannot turn a nearest-port guess into a
        // shipping fact, or an absent stage into an empty one.
        basis: stage.basis ?? null,
        whyMissing: stage.because ?? null,
      }));
    },
  };
  return layer;
}
