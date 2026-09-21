import * as Cesium from 'cesium';

/**
 * Terrain and elevation, as an answer rather than an effect.
 *
 * §11 is explicit: "Do not add 3D merely because it looks impressive. Every 3D
 * visualization should answer a question." So this layer does three things and
 * declares the question for each:
 *
 *   ENABLE TERRAIN      the globe stops being a sphere with a photograph on it
 *   TILT THE CAMERA     relief is invisible looking straight down, and the
 *                       whole point of terrain is the vertical dimension
 *   EXAGGERATE          Himalayan relief at true scale is still subtle from
 *                       200 km up; a stated multiplier makes a valley legible
 *                       and the multiplier is reported, never hidden
 *
 * The questions it exists to answer, which are the brief's own examples:
 *
 *   "Why did this area flood?"          the water came from higher ground
 *   "Why was this road destroyed?"      it runs under a slope that failed
 *   "Why was this city isolated?"       one valley in, and it closed
 *
 * WHAT IT DOES NOT CLAIM. Exaggerated relief is not a measurement. Every
 * reading this layer reports carries the multiplier in use, because a reader
 * comparing two screenshots at different exaggerations would otherwise read a
 * setting as a finding.
 */

/**
 * Vertical exaggeration presets.
 *
 * 1 is truth. 2 is where a Himalayan valley becomes readable at regional
 * range. 3 is for a single slope and starts to look like a cartoon, which is
 * why it is the ceiling rather than a slider to infinity.
 */
export const EXAGGERATION = Object.freeze({
  TRUE_SCALE: 1,
  READABLE: 2,
  SLOPE_ANALYSIS: 3,
});

/** Camera pitch, in degrees below horizontal, for reading relief. */
const OBLIQUE_PITCH = -32;

/**
 * Create the terrain layer.
 *
 * @param {object} [deps]
 * @param {(reason:string)=>void} [deps.governorRequestRender]
 * @param {() => Promise<object>} [deps.terrainFactory] injectable for tests
 */
export function createTerrainLayer({
  governorRequestRender = () => {},
  terrainFactory = null,
} = {}) {
  let _viewer = null;
  let _enabled = false;
  let _terrain = null;
  /** The provider the app had before this layer replaced it. */
  let _previousProvider = null;
  let _previousExaggeration = 1;
  let _exaggeration = EXAGGERATION.READABLE;
  let _error = null;
  let _lastUpdate = null;

  async function resolveTerrain() {
    if (_terrain) return _terrain;
    if (terrainFactory) {
      _terrain = await terrainFactory();
      return _terrain;
    }
    /*
     * Cesium World Terrain needs an ion token, which this project may not
     * have. `createWorldTerrainAsync` rejects without one, and that rejection
     * is reported as a missing-credential state rather than a crash — the
     * layer simply cannot draw relief, which is a fact about the deployment.
     */
    _terrain = await Cesium.createWorldTerrainAsync();
    return _terrain;
  }

  const layer = {
    id: 'terrain-3d',
    name: 'Terrain & Elevation',
    icon: '⛰',
    source: 'Cesium World Terrain · HISTORICAL',
    updateInterval: 0,

    init(viewer) {
      if (_viewer) throw new Error('Terrain layer is already initialized');
      _viewer = viewer;
    },

    async enable() {
      _enabled = true;
      if (!_viewer) return;
      try {
        const terrain = await resolveTerrain();
        /*
         * The previous provider is kept so disabling restores exactly what the
         * app had, rather than leaving the globe on whatever this layer chose.
         */
        _previousProvider = _viewer.terrainProvider ?? null;
        _previousExaggeration = _viewer.scene?.verticalExaggeration ?? 1;
        _viewer.terrainProvider = terrain;
        if (_viewer.scene) _viewer.scene.verticalExaggeration = _exaggeration;
        /*
         * Tilt. Relief looking straight down is a colour gradient, and a
         * reader asking "why did this flood" learns nothing from it. Only if
         * the camera is currently near-nadir — a user who has already framed
         * an oblique shot keeps it.
         */
        const pitch = Cesium.Math.toDegrees(_viewer.camera.pitch);
        if (pitch < -70) {
          _viewer.camera.setView({
            destination: _viewer.camera.positionWC.clone(),
            orientation: {
              heading: _viewer.camera.heading,
              pitch: Cesium.Math.toRadians(OBLIQUE_PITCH),
              roll: 0,
            },
          });
        }
        _error = null;
        _lastUpdate = Date.now();
      } catch (error) {
        _error =
          'Terrain needs a Cesium ion token, which this deployment does not have. Relief cannot be drawn.';
        _enabled = false;
      }
      governorRequestRender('terrain:enable');
    },

    disable() {
      _enabled = false;
      if (_viewer) {
        if (_previousProvider) _viewer.terrainProvider = _previousProvider;
        if (_viewer.scene) {
          _viewer.scene.verticalExaggeration = _previousExaggeration;
        }
      }
      governorRequestRender('terrain:disable');
    },

    async update() {
      // A provider, not a feed. Nothing to poll, and nothing failed.
      return true;
    },

    /**
     * Set the vertical exaggeration.
     *
     * Clamped to the presets' range. The value is reported by `getStats` and
     * `getReading` so it travels with every claim made from the relief.
     */
    setExaggeration(value) {
      const clamped = Math.max(
        EXAGGERATION.TRUE_SCALE,
        Math.min(EXAGGERATION.SLOPE_ANALYSIS, Number(value) || 1),
      );
      _exaggeration = clamped;
      if (_enabled && _viewer?.scene) {
        _viewer.scene.verticalExaggeration = clamped;
      }
      governorRequestRender('terrain:exaggeration');
      return clamped;
    },

    /** What this layer is for, and what it is not claiming. */
    getReading() {
      return Object.freeze({
        exaggeration: _exaggeration,
        answers: Object.freeze([
          'Why did this area flood? The water came from higher ground than the map shows.',
          'Why was this road destroyed? It runs beneath a slope steep enough to fail.',
          'Why was this settlement isolated? One valley in, and it closed.',
        ]),
        caveat:
          _exaggeration === EXAGGERATION.TRUE_SCALE
            ? 'Relief is at true scale.'
            : `Relief is exaggerated ${_exaggeration}× so a valley is legible at this range. Heights on screen are not measurements at this setting.`,
        error: _error,
      });
    },

    getStats() {
      return {
        count: _enabled ? 1 : 0,
        enabled: _enabled,
        exaggeration: _exaggeration,
        lastUpdate: _lastUpdate,
        error: _error,
        source: 'Cesium World Terrain',
      };
    },

    getAnalystRecords() {
      return [
        {
          index: 0,
          layer: 'Terrain & Elevation',
          verticalExaggeration: _exaggeration,
          // Declared: this layer draws relief, it does not measure anything.
          elevationAtSelection: null,
          slopeAtSelection: null,
        },
      ];
    },

    destroy(viewer = _viewer) {
      if (viewer && !viewer.isDestroyed?.()) {
        if (_previousProvider) viewer.terrainProvider = _previousProvider;
        if (viewer.scene) {
          viewer.scene.verticalExaggeration = _previousExaggeration;
        }
      }
      _viewer = null;
      _enabled = false;
      _terrain = null;
      _previousProvider = null;
      _error = null;
      _lastUpdate = null;
    },
  };
  return layer;
}
