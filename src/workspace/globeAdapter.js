/**
 * The workspace's view of the globe.
 *
 * Three jobs: move the camera, put it back, and report what the user clicked.
 *
 * DELIBERATELY NOT A SECOND SELECTION SYSTEM. The inherited application already
 * has one — the flights layer binds its own LEFT_CLICK, tracking layers publish
 * through `gev:awareness-subject-selected`, entity layers through
 * `gev:entity-selected`, and `src/ui/layerBindings.js` coordinates the tracking
 * params between them. Adding a competing picker would make two handlers fight
 * over one click, and the visible symptom would be selections that flicker or
 * stick.
 *
 * So this adapter LISTENS. Click-to-follow already works; what was missing was
 * anywhere sensible for the result to be shown and a reliable way to stop. This
 * supplies both, and leaves the picking to the code that already owns it.
 *
 * The one thing it does own is `resetView()`, because nothing did.
 *
 * The mapping from a published record to what the panel shows lives in
 * `selection.js`, which is portable and carries the tests.
 */

import * as Cesium from 'cesium';
import { TRACKING_PARAMS, describeSelection } from './selection.js';

/** Where the globe starts, and where Reset View returns to. */
export const HOME_VIEW = Object.freeze({
  lat: 20,
  lon: 40,
  altKm: 24000,
});

/**
 * Create the adapter.
 *
 * @param {object} deps
 * @param {object} deps.viewer Cesium viewer
 * @param {object} deps.dataManager layer manager, for clearing tracking params
 * @param {(reason:string)=>void} [deps.requestRender]
 * @returns {object}
 */
export function createGlobeAdapter({
  viewer,
  dataManager,
  requestRender = () => {},
}) {
  if (!viewer) throw new TypeError('the globe adapter requires a viewer');

  const listeners = new Set();
  let lastSelection = null;

  function publish(selection) {
    lastSelection = selection;
    for (const listener of listeners) {
      try {
        listener(selection);
      } catch {
        /* a broken listener must not break the globe */
      }
    }
  }

  const onEntitySelected = (event) => publish(describeSelection(event.detail));
  const onSubjectSelected = (event) => publish(describeSelection(event.detail));
  const onCleared = () => publish(null);

  window.addEventListener('gev:entity-selected', onEntitySelected);
  window.addEventListener('gev:awareness-subject-selected', onSubjectSelected);
  window.addEventListener('gev:entity-selection-cleared', onCleared);
  window.addEventListener('gev:awareness-subject-cleared', onCleared);

  return {
    /**
     * Fly to a place.
     *
     * Takes altitude in KILOMETRES because every caller in this workspace
     * thinks in kilometres, and the metres-versus-kilometres confusion is worth
     * one multiplication to remove.
     */
    flyTo({ lat, lon, altKm = 3000, durationSec = 1.6 }) {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, altKm * 1000),
        duration: durationSec,
      });
      requestRender('workspace:flyTo');
      return true;
    },

    /**
     * Put the camera back where it started.
     *
     * Cancels any flight in progress first: `flyTo` during an existing flight
     * queues rather than replaces on some paths, and a Reset View that visibly
     * finishes someone else's animation first does not read as a reset.
     */
    resetView() {
      viewer.trackedEntity = undefined;
      viewer.camera.cancelFlight?.();
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          HOME_VIEW.lon,
          HOME_VIEW.lat,
          HOME_VIEW.altKm * 1000,
        ),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-90),
          roll: 0,
        },
        duration: 1.4,
      });
      requestRender('workspace:resetView');
      return true;
    },

    /**
     * Release whatever the camera is following.
     *
     * Clears both halves: the Cesium-level tracked entity, and the layer params
     * the inherited coordinator uses to remember a subject across refreshes.
     * Clearing only the first lets the layer re-acquire its target on the next
     * poll, which looks exactly like the button not working.
     */
    stopTracking() {
      viewer.trackedEntity = undefined;
      for (const [layerId, key] of TRACKING_PARAMS) {
        dataManager?.setLayerParams?.(layerId, { [key]: null });
      }
      window.dispatchEvent(new CustomEvent('gev:entity-selection-cleared'));
      publish(null);
      requestRender('workspace:stopTracking');
      return true;
    },

    /** Subscribe to selections. Returns an unsubscribe. */
    onSelect(listener) {
      listeners.add(listener);
      if (lastSelection) listener(lastSelection);
      return () => listeners.delete(listener);
    },

    /** The current selection, or null. */
    getSelection: () => lastSelection,

    destroy() {
      window.removeEventListener('gev:entity-selected', onEntitySelected);
      window.removeEventListener(
        'gev:awareness-subject-selected',
        onSubjectSelected,
      );
      window.removeEventListener('gev:entity-selection-cleared', onCleared);
      window.removeEventListener('gev:awareness-subject-cleared', onCleared);
      listeners.clear();
    },
  };
}
