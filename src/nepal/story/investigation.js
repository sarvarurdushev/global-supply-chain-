/**
 * The Nepal investigation state machine.
 *
 * ONE state object; every view is a projection of it. That is the rule the
 * existing `src/disaster/investigation.js` established and the reason the
 * timeline and the panel cannot disagree about what is on screen. This is the
 * same idea narrowed to the Nepal case, where the axis is the scene sequence
 * rather than a generic depth ladder.
 *
 * WHAT IS STORED AND WHAT IS DERIVED. Stored: which scene, which mode, what
 * the user selected, where the controls sit, which layers are carried, which
 * result classes are shown. Derived, always, never cached: the camera pose,
 * which layers are actually visible, which datasets to warm. Storing a derived
 * value is how two panels start disagreeing — the camera would be set by one
 * path and read by another, and a scene change would move one and not the
 * other.
 *
 * LAYERS PERSIST ACROSS SCENES. Turning infrastructure on in Scene 11 and
 * jumping to Scene 06 keeps it on, because the alternative — resetting on
 * every navigation — makes exploration feel like being corrected.
 */

import { SCENES, datasetsToWarm, scene } from './scenes.js';
import {
  ResultClass,
  passesFilter,
  resolveResultClass,
} from './resultClass.js';

export const MODE = Object.freeze({ EXPLORE: 'EXPLORE', PRESENT: 'PRESENT' });

/** Controls and their defaults. A control a scene does not declare is inert. */
export const CONTROL_DEFAULTS = Object.freeze({
  intensityThreshold: 6,
  timeCutoff: null,
  clock: 'EARTHQUAKE',
  associationTolerance: 50,
  proximityBand: 500,
  quadrant: null,
  damageClass: null,
  coverageToggle: 'observed',
  ghostNetwork: false,
  bridgeToggle: false,
});

/**
 * Create the state machine.
 *
 * @param {object} [options]
 * @param {number} [options.scene] starting scene index
 * @param {(state:object, reason:string)=>void} [options.onChange]
 */
export function createNepalInvestigation({
  scene: startScene = 0,
  mode = MODE.EXPLORE,
  onChange = () => {},
} = {}) {
  let state = {
    sceneIndex: clampScene(startScene),
    mode,
    selection: {
      district: null,
      analysisArea: null,
      origin: null,
      destination: null,
    },
    controls: { ...CONTROL_DEFAULTS },
    layers: new Set(),
    resultClassFilter: new Set(),
  };

  function clampScene(index) {
    const n = Number(index);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(SCENES.length - 1, Math.round(n)));
  }

  function emit(reason) {
    onChange(snapshot(), reason);
  }

  /**
   * Apply a scene's default selection when entering it, without overwriting a
   * choice the user already made.
   *
   * Scene 12 defaults to Sindhupalchok because that is the scene's argument;
   * but a user who picked Dolakha in Scene 07 and walked forward should keep
   * Dolakha. Defaults fill blanks, they do not correct people.
   */
  function applySceneDefaults(entry) {
    const defaults = entry?.defaultSelection;
    if (!defaults) return;
    for (const [key, value] of Object.entries(defaults)) {
      if (state.selection[key] === null || state.selection[key] === undefined) {
        state.selection = { ...state.selection, [key]: value };
      }
    }
  }

  function snapshot() {
    const entry = scene(state.sceneIndex);
    return Object.freeze({
      sceneIndex: state.sceneIndex,
      scene: entry,
      act: entry?.act ?? null,
      mode: state.mode,
      selection: Object.freeze({ ...state.selection }),
      controls: Object.freeze({ ...state.controls }),
      layers: Object.freeze([...state.layers]),
      resultClassFilter: Object.freeze([...state.resultClassFilter]),
      /* ---- derived, computed fresh every time ---- */
      camera: cameraFor(entry, state.selection),
      visibleLayers: visibleLayersFor(entry),
      datasetsToWarm: datasetsToWarm(state.sceneIndex, {
        lookahead: state.mode === MODE.PRESENT ? 2 : 1,
      }),
      deepLink: toDeepLink(),
    });
  }

  /**
   * The camera pose for a scene.
   *
   * `target` stays a NAME here rather than a coordinate: the runtime resolves
   * it against the artefacts, so the epicentre is wherever USGS put it. A
   * selected district overrides the scene's own target, which is what makes
   * Scene 07 follow the picker.
   */
  function cameraFor(entry, selection) {
    if (!entry) return null;
    const followsSelection =
      entry.camera.target === 'district' && selection.district;
    return Object.freeze({
      ...entry.camera,
      target: followsSelection
        ? `district:${selection.district}`
        : entry.camera.target,
    });
  }

  /**
   * Layers the map should draw: the scene's own, plus anything carried, minus
   * anything the result-class filter hides.
   */
  function visibleLayersFor(entry) {
    const wanted = new Set([...(entry?.layers ?? []), ...state.layers]);
    const classes = entry?.resultClasses ?? [];
    if (state.resultClassFilter.size > 0) {
      const anyPasses = classes.some((value) =>
        passesFilter(value, state.resultClassFilter),
      );
      if (!anyPasses) return Object.freeze([]);
    }
    return Object.freeze([...wanted]);
  }

  function toDeepLink() {
    const entry = scene(state.sceneIndex);
    const params = new URLSearchParams();
    if (state.selection.district)
      params.set('district', state.selection.district);
    if (state.layers.size > 0)
      params.set('layers', [...state.layers].join(','));
    if (state.resultClassFilter.size > 0) {
      params.set('classes', [...state.resultClassFilter].join(','));
    }
    if (state.mode !== MODE.EXPLORE) params.set('mode', state.mode);
    const query = params.toString();
    return `#/case/npl-2015-eq/scene/${entry?.id ?? state.sceneIndex}${query ? `?${query}` : ''}`;
  }

  return Object.freeze({
    get state() {
      return snapshot();
    },

    /** Jump to a scene by index or id. Unknown targets are ignored, not thrown. */
    goTo(target) {
      const entry =
        typeof target === 'number' ? scene(clampScene(target)) : scene(target);
      if (!entry || entry.index === state.sceneIndex) return snapshot();
      state.sceneIndex = entry.index;
      applySceneDefaults(entry);
      emit('scene');
      return snapshot();
    },

    next() {
      return this.goTo(state.sceneIndex + 1);
    },
    previous() {
      return this.goTo(state.sceneIndex - 1);
    },

    /** Cross-filter: one selection propagates to every projection. */
    select(patch) {
      state.selection = { ...state.selection, ...patch };
      emit('selection');
      return snapshot();
    },

    setControl(key, value) {
      if (!(key in CONTROL_DEFAULTS)) {
        throw new TypeError(
          `Unknown control "${key}". Known: ${Object.keys(CONTROL_DEFAULTS).join(', ')}.`,
        );
      }
      state.controls = { ...state.controls, [key]: value };
      emit('control');
      return snapshot();
    },

    toggleLayer(id, on = null) {
      const wanted = on === null ? !state.layers.has(id) : Boolean(on);
      if (wanted) state.layers.add(id);
      else state.layers.delete(id);
      emit('layers');
      return snapshot();
    },

    /**
     * The Scene 17 filter. An empty set means no filtering, not "hide all".
     */
    setResultClassFilter(values) {
      state.resultClassFilter = new Set(
        (values ?? [])
          .map(resolveResultClass)
          .filter((value) => ResultClass[value]),
      );
      emit('filter');
      return snapshot();
    },

    setMode(next) {
      if (next !== MODE.EXPLORE && next !== MODE.PRESENT) {
        throw new TypeError(`Unknown mode "${next}".`);
      }
      if (state.mode === next) return snapshot();
      state.mode = next;
      emit('mode');
      return snapshot();
    },

    /**
     * Pause presentation and take control at exactly this state.
     *
     * The single most important behaviour for presenting live: nothing about
     * the scene, selection or controls changes — only who is driving.
     */
    takeControl() {
      return this.setMode(MODE.EXPLORE);
    },

    /** Restore from a deep link. Unknown values are ignored rather than fatal. */
    applyDeepLink(hash) {
      const match = /#\/case\/npl-2015-eq\/scene\/([^?]+)(?:\?(.*))?$/.exec(
        String(hash ?? ''),
      );
      if (!match) return snapshot();
      const entry = scene(match[1]) ?? scene(Number(match[1]));
      if (entry) {
        state.sceneIndex = entry.index;
        applySceneDefaults(entry);
      }
      const params = new URLSearchParams(match[2] ?? '');
      const district = params.get('district');
      if (district) state.selection = { ...state.selection, district };
      const layers = params.get('layers');
      if (layers) state.layers = new Set(layers.split(',').filter(Boolean));
      const classes = params.get('classes');
      if (classes) {
        state.resultClassFilter = new Set(
          classes
            .split(',')
            .map(resolveResultClass)
            .filter((value) => ResultClass[value]),
        );
      }
      const linkMode = params.get('mode');
      if (linkMode === MODE.PRESENT || linkMode === MODE.EXPLORE)
        state.mode = linkMode;
      emit('deeplink');
      return snapshot();
    },
  });
}
