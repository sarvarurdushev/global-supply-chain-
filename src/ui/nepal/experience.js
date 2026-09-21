/**
 * The Nepal investigation, composed.
 *
 * Owns the wiring and nothing else: it holds the state machine, the loader and
 * the three zones, and on every change it recomputes what should be on screen
 * and hands it to the renderers. It makes no analytical and no visual decision
 * of its own — those live in `src/nepal/story/`, which is pure and tested.
 *
 * THE MAP RENDERER IS INJECTED. `caseLayers` arrives as a dependency rather
 * than being constructed here, so the whole experience can be driven under the
 * test DOM with a recording stub and every scene transition asserted without a
 * WebGL context. That is the difference between "the component exists" and
 * "the scene works", which is the bar this stage is held to.
 *
 * TIER 2 FAILURE IS NOT FATAL. A scene whose geometry could not be fetched
 * still renders its question, its figures and its limitations; only the layer
 * is missing, and the panel says which dataset failed. The alternative — a
 * blank screen because one of ten files 404ed — would hide the analysis behind
 * a network error.
 */

import { h } from '../../workspace/components.js';
import { createArtefactLoader } from '../../nepal/story/loader.js';
import { headerState } from '../../nepal/story/artefacts.js';
import {
  createNepalInvestigation,
  MODE,
} from '../../nepal/story/investigation.js';
import {
  drawablesForScene,
  resolveTarget,
} from '../../nepal/story/mapModel.js';
import {
  contoursToRings,
  intensityBands,
} from '../../nepal/analysis/exposure.js';
import { renderTopBar } from './topBar.js';
import { renderSceneRail } from './sceneRail.js';
import { renderIntelPanel } from './intelPanel.js';

/**
 * Derive whatever a scene needs that is not simply the parsed artefact.
 *
 * The intensity bands are the only case: the ShakeMap ships contours and the
 * map needs filled areas, which is an analysis step rather than a rendering
 * one. It is computed once and cached, not per frame.
 */
function createDerivedCache() {
  const cache = new Map();
  return {
    intensityBands(shakemap) {
      if (!shakemap) return null;
      if (!cache.has('intensityBands')) {
        cache.set(
          'intensityBands',
          intensityBands(contoursToRings(shakemap.data.features)).bands,
        );
      }
      return cache.get('intensityBands');
    },
  };
}

/**
 * @param {object} input
 * @param {HTMLElement} input.mount
 * @param {object} [input.caseLayers] map renderer; omitted in tests
 * @param {typeof fetch} [input.fetchImpl]
 */
export function createNepalExperience({
  mount,
  caseLayers = null,
  fetchImpl,
} = {}) {
  if (!mount)
    throw new TypeError('The Nepal experience needs a mount element.');

  const loader = createArtefactLoader({
    fetchImpl,
    onProgress: () => scheduleRender('load'),
  });
  const derived = createDerivedCache();
  const investigation = createNepalInvestigation({
    onChange: (_, reason) => {
      onStateChange(reason);
    },
  });

  let intelligence = null;
  let failedDatasets = new Map();
  let frame = null;

  const root = h('div', { class: 'ndi' }, [
    h('div', { class: 'ndi__top' }),
    h('div', { class: 'ndi__body' }, [
      h('div', { class: 'ndi__rail' }),
      h('div', { class: 'ndi__panel' }),
    ]),
  ]);
  mount.append(root);

  const slots = {
    top: root.querySelector('.ndi__top'),
    rail: root.querySelector('.ndi__rail'),
    panel: root.querySelector('.ndi__panel'),
  };

  /** Data a scene has asked for and that has arrived. */
  function sceneData() {
    const shakemap = loader.ready('shakemap');
    return {
      districts: loader.ready('districts')?.data?.features ?? null,
      seismicEvents: loader.ready('seismicEvents')?.data?.events ?? null,
      unosat: loader.ready('unosat')?.data?.features ?? null,
      nga: loader.ready('nga')?.data ?? null,
      copernicusAois:
        loader.ready('copernicus')?.data?.areasOfInterest?.features ?? null,
      intensityBands: derived.intensityBands(shakemap),
    };
  }

  function renderNow() {
    const state = investigation.state;
    const header = intelligence
      ? headerState(intelligence, loader.progress())
      : {
          caseId: 'NPL-2015-EQ',
          datasets: 0,
          analyses: 0,
          checksLabel: '—',
          checksPassed: 0,
          checksTotal: 0,
          system: 'LOADING',
        };

    slots.top.replaceChildren(
      renderTopBar({
        header,
        state,
        onMode: (mode) => investigation.setMode(mode),
      }),
    );
    slots.rail.replaceChildren(
      renderSceneRail({ state, onScene: (index) => investigation.goTo(index) }),
    );
    slots.panel.replaceChildren(
      intelligence
        ? renderIntelPanel({
            intelligence,
            state,
            onMethodology: (id) => openMethodology(id),
          })
        : h('aside', { class: 'ndi-panel' }, [
            h('p', {
              class: 'ndi-panel__pending',
              text: 'Loading the case evidence…',
            }),
          ]),
    );

    /* The failed-dataset notice sits with the panel, naming what is missing. */
    const missing = [...failedDatasets.entries()].filter(([key]) =>
      (state.scene?.datasets ?? []).includes(key),
    );
    if (missing.length > 0) {
      slots.panel.append(
        h('p', {
          class: 'ndi-panel__error',
          text: `Layer unavailable — ${missing
            .map(([key, reason]) => `${key} (${reason})`)
            .join(', ')}. The analysis above is unaffected.`,
        }),
      );
    }

    if (caseLayers && intelligence) {
      const data = sceneData();
      caseLayers.render(drawablesForScene({ state, intelligence, data }));
    }
  }

  /**
   * Coalesce bursts of state changes into one render.
   *
   * An earlier version checked for a pending frame FIRST and returned, which
   * meant an "immediate" render was silently dropped whenever anything had
   * already scheduled one -- and since the loader schedules on every progress
   * event, that was almost always. The header sat at LOADING after the
   * evidence had arrived. Immediate is handled before the coalescing check
   * now, and it cancels the pending frame rather than racing it.
   */
  function cancelPending() {
    if (frame === null) return;
    if (
      typeof cancelAnimationFrame === 'function' &&
      typeof frame === 'number'
    ) {
      cancelAnimationFrame(frame);
    } else {
      clearTimeout(frame);
    }
    frame = null;
  }

  function scheduleRender(reason) {
    if (reason === 'immediate') {
      cancelPending();
      renderNow();
      return;
    }
    if (frame !== null) return;
    const run = () => {
      frame = null;
      renderNow();
    };
    frame =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(run)
        : setTimeout(run, 0);
  }

  function moveCamera() {
    if (!caseLayers) return;
    const state = investigation.state;
    const target = resolveTarget(state.camera?.target, {
      intelligence,
      data: sceneData(),
      selection: state.selection,
    });
    caseLayers.flyTo({
      ...target,
      altKm: state.camera?.altKm ?? 1200,
      pitch: state.camera?.pitch ?? -90,
      durationSec: state.camera?.durationSec ?? 2,
    });
  }

  async function ensureSceneData() {
    const state = investigation.state;
    const needed = state.scene?.datasets ?? [];
    await Promise.all(
      needed.map(async (key) => {
        try {
          await loader.loadProcessed(key);
          failedDatasets.delete(key);
        } catch (error) {
          failedDatasets.set(key, error.message);
        }
      }),
    );
    loader.prefetch(state.datasetsToWarm);
    scheduleRender('immediate');
  }

  function onStateChange(reason) {
    scheduleRender(reason);
    if (reason === 'scene' || reason === 'deeplink') {
      moveCamera();
      ensureSceneData();
    }
  }

  function openMethodology(id) {
    const record = intelligence?.methodologyFor(id);
    if (!record) return;
    root.dispatchEvent(
      new CustomEvent('ndi:methodology', { detail: record, bubbles: true }),
    );
  }

  /*
   * Paint the chrome before any data arrives. The alternative is an empty
   * element until Tier 1 resolves, which is a blank frame at the exact moment
   * a first impression is formed -- and it hides the fact that the case is
   * loading rather than broken.
   */
  renderNow();

  return Object.freeze({
    investigation,
    loader,
    get intelligence() {
      return intelligence;
    },
    get element() {
      return root;
    },

    /** Load Tier 1, paint, then fetch what the opening scene needs. */
    async start() {
      renderNow();
      intelligence = await loader.loadTier1();
      scheduleRender('immediate');
      moveCamera();
      await ensureSceneData();
      return intelligence;
    },

    /** Exposed for the presentation runner and for tests. */
    goTo(target) {
      return investigation.goTo(target);
    },
    setMode(mode) {
      return investigation.setMode(mode);
    },
    render: renderNow,
    MODE,

    destroy() {
      cancelPending();
      root.remove();
      caseLayers?.destroy?.();
    },
  });
}
