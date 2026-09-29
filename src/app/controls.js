import { catalogControlServices } from './catalog.js';
import { StyleManager } from '../ui/composition.js';
import { flyToAustin } from '../camera.js';
import { initCockpitCloudEffects } from '../cockpitCloudEffects.js';

/**
 * Construct the existing controls and camera presentation.
 *
 * On the case entry (`entry: 'case'`) the inherited shell does not direct the
 * opening: no fly-in to Austin, which would land 500 ms in and could cancel
 * the case's own first flight, and no restoring of live layers a previous
 * workspace session left switched on, which would draw under the case. Both
 * stay exactly as they were on `#/workspace`.
 */
export function createApplicationControls({
  entry = 'workspace',
  scene: { viewer, mapStackController, operations },
  loaderStatus,
  Controls = StyleManager,
  services,
  catalog,
  placeSearch,
  defer,
}) {
  // Initialize the style manager (post-processing, HUD, locations, share links)
  const styleManager = new Controls(viewer, {
    services: {
      ...services,
      ...operations.surface.controlServices,
      searchAndFlyTo: operations.searchAndFlyTo,
      fetchRegionalBrief: (...args) =>
        operations.requests.regional.getBrief(...args),
      ...catalogControlServices(catalog),
    },
    requestServices: operations.requests,
    mapStackController,
    placeSearch,
    restoreLocalLayers: entry !== 'case',
  });
  defer(() => styleManager.orbitController.stop());
  defer(() => styleManager.hud.destroy());
  defer(() => styleManager.dispose());
  // The previous multi-canvas weather compositor remains disabled. Cockpit
  // clouds use a separate, capped low-resolution GPU pass that never attaches
  // Cesium fog or post-process stages and is fully stopped in map mode.
  const weatherEffects = null;
  const cockpitCloudEffects = initCockpitCloudEffects(viewer, {
    weatherService: operations.requests.weather,
  });
  defer(() => cockpitCloudEffects?.destroy());

  if (entry === 'case') {
    loaderStatus.textContent =
      'Opening Case 001 — Nepal earthquake, 25 April 2015…';
  } else if (!styleManager.hasShareState) {
    // If no share link state, do default fly-to Austin
    loaderStatus.textContent = 'Flying to Austin, TX...';
    defer(flyToAustin(viewer));
  } else {
    loaderStatus.textContent = 'Restoring shared view...';
  }

  return { styleManager, weatherEffects, cockpitCloudEffects };
}
