import { SCENE_APPEND_RECIPES } from '../recipes.js';
import { createScenePackRegistry } from './registry.js';
import { nepalScenePresentation } from './nepal.js';
import { supplyChainScenePresentation } from './supplyChain.js';

/** Compose the installed scene recipes and their trusted presentation rules. */
export function createDefaultScenePacks() {
  return createScenePackRegistry({
    recipes: SCENE_APPEND_RECIPES,
    // Order does not matter: minimumHoldSec takes the maximum across adapters
    // and resolveVisual folds, so each pack only ever affects its own shots.
    adapters: [nepalScenePresentation, supplyChainScenePresentation],
  });
}
