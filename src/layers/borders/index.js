import * as Cesium from 'cesium';
import {
  COUNTRY_BORDERS,
  BORDER_SOURCE,
  BORDER_CAVEAT,
} from '../../supplychain/reference/borders.js';
import { DataClass, createProvenance } from '../../supplychain/provenance.js';

/**
 * Country borders.
 *
 * WHY: a 3D globe with no frontiers makes geography guesswork. Without them a
 * user cannot tell which country a port belongs to, which country the camera is
 * over, or whether a route crosses a border — and every one of those is a
 * supply-chain question, not a cartographic nicety.
 *
 * HOW: one `PolylineCollection` holding every ring, built once at init and then
 * only shown or hidden. 174 countries and ~10,500 points is small enough to
 * keep resident, and rebuilding it on every enable would cost a visible hitch
 * for no benefit — the data is static.
 *
 * Deliberately understated: thin, low-contrast lines clamped to the ground.
 * Borders are there to orient the reader, and a border that competes with the
 * trade arcs for attention has failed at that. They are also drawn WITHOUT
 * labels; country naming belongs to the layer that owns country data, and two
 * label sources on one globe collide.
 *
 * What this layer is not: an authority. See BORDER_CAVEAT — the geometry is
 * simplified to about a kilometre and follows Natural Earth's editorial
 * boundary decisions, which do not match every government's position.
 */

/** Thin and cool, so borders read as background structure. */
const LINE_COLOUR = Cesium.Color.fromCssColorString('#8fa8c8').withAlpha(0.42);
const LINE_WIDTH = 1.0;

export const BORDERS_PROVENANCE = createProvenance({
  dataClass: DataClass.HISTORICAL,
  source: 'Natural Earth',
  dataset: 'ne_110m_admin_0_countries',
  license: 'Public domain. ' + BORDER_SOURCE,
  method:
    'Admin-0 polygons reduced to outlines, rounded to 2 decimal places and ' +
    'stripped of rings shorter than 4 points.',
  updateFrequency: 'static',
  confidence: 0.9,
  limitations: [
    BORDER_CAVEAT,
    'Simplified to roughly 1 km. Do not measure anything against these lines.',
    'Small islands and microstates are omitted at this resolution. Their ' +
      'absence is a rendering limit, not a statement about them.',
  ],
});

/**
 * Create the borders layer.
 *
 * @param {object} [deps]
 * @param {(reason:string)=>void} [deps.governorRequestRender]
 * @returns {object} layer
 */
export function createBordersLayer({ governorRequestRender = () => {} } = {}) {
  let _viewer = null;
  let _collection = null;
  let _enabled = false;
  let _lineCount = 0;

  function build() {
    if (!_collection) return;
    for (const country of COUNTRY_BORDERS) {
      for (const ring of country.rings) {
        // Rings are flat [lon, lat, ...]; fromDegreesArray takes exactly that,
        // which is why the generator emits them flat.
        _collection.add({
          positions: Cesium.Cartesian3.fromDegreesArray(Array.from(ring)),
          width: LINE_WIDTH,
          material: Cesium.Material.fromType('Color', { color: LINE_COLOUR }),
          // Borders belong on the terrain, not floating above it.
          clampToGround: true,
          id: `border:${country.iso3}`,
        });
        _lineCount += 1;
      }
    }
  }

  const layer = {
    id: 'country-borders',
    name: 'Country Borders',
    icon: '⬡',
    source: 'Natural Earth · REFERENCE',
    // Static geometry. Nothing to poll.
    updateInterval: 0,

    init(viewer) {
      if (_viewer) throw new Error('Borders layer is already initialized');
      _viewer = viewer;
      _collection = viewer.scene.primitives.add(
        new Cesium.PolylineCollection(),
      );
      _collection.show = false;
      build();
    },

    enable() {
      _enabled = true;
      if (_collection) _collection.show = true;
      governorRequestRender('country-borders:enable');
    },

    disable() {
      _enabled = false;
      if (_collection) _collection.show = false;
      governorRequestRender('country-borders:disable');
    },

    /**
     * Nothing to refresh.
     *
     * Returns true because in this layer contract `false` means the update
     * FAILED and the manager rolls back the enable. Static data that has
     * nothing to do has not failed.
     */
    async update() {
      return true;
    },

    destroy(viewer = _viewer) {
      if (_collection && viewer && !viewer.isDestroyed?.()) {
        viewer.scene.primitives.remove(_collection);
      }
      _collection = null;
      _viewer = null;
      _enabled = false;
      _lineCount = 0;
    },

    getProvenance() {
      return BORDERS_PROVENANCE;
    },

    getStats() {
      return {
        count: COUNTRY_BORDERS.length,
        lines: _lineCount,
        enabled: _enabled,
        error: null,
        source: 'Natural Earth 110m',
      };
    },

    getAnalystRecords(maxCount = 200) {
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 200;
      return COUNTRY_BORDERS.slice(0, limit).map((country, index) => ({
        index,
        iso3: country.iso3,
        name: country.name,
        // Deliberately not exposing geometry to the analyst snapshot: a
        // spoken answer has no use for 60 coordinate pairs.
        rings: country.rings.length,
      }));
    },
  };
  return layer;
}
