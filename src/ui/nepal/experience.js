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
import { rasteriseDensity } from '../../nepal/story/densityRaster.js';
import { solveArtefactRoute, verifyRoute } from '../../nepal/story/network.js';
import { createGraphProvider } from './graphProvider.js';
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
  const once = (key, build) => {
    if (!cache.has(key)) cache.set(key, build());
    return cache.get(key);
  };
  return {
    intensityBands(shakemap) {
      if (!shakemap) return null;
      return once(
        'intensityBands',
        () => intensityBands(contoursToRings(shakemap.data.features)).bands,
      );
    },
    /*
     * The population raster. 49 ms for 177,679 cells, once — which is why the
     * design's build-time density texture was not needed. Per frame it would
     * be unacceptable, hence the cache.
     */
    densityRaster(population) {
      if (!population) return null;
      return once('densityRaster', () => rasteriseDensity(population.data));
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
  onChange = null,
  createWorker = null,
} = {}) {
  if (!mount)
    throw new TypeError('The Nepal experience needs a mount element.');

  const loader = createArtefactLoader({
    fetchImpl,
    onProgress: () => scheduleRender('load'),
  });
  const derived = createDerivedCache();
  /*
   * The road graph, for scenes 13, 14 and 18. Built at most once, in a worker
   * when one can be created. Every FIGURE those scenes report comes from the
   * Stage 5 artefact; the graph exists to draw a line, and to check that line
   * against the number the artefact already published.
   */
  const graphs = createGraphProvider({
    createWorker,
    onNote: (note) => {
      graphNote = note;
    },
  });
  let graphNote = null;
  let graphEdges = null;
  let networkGraph = null;
  let route = null;
  let routeProblems = [];
  const investigation = createNepalInvestigation({
    onChange: (_, reason) => {
      onStateChange(reason);
    },
  });

  let intelligence = null;
  let failedDatasets = new Map();
  let frame = null;
  /*
   * The fetch for the CURRENT scene's datasets, so a caller can wait for the
   * evidence rather than guess at a duration.
   *
   * This is not a test affordance. Presentation mode must not advance while a
   * scene's geometry is still in the air — an auto-advance that outruns the
   * network presents an empty map — and a test that sleeps instead of waiting
   * is a test that fails on a slow machine for no reason. Both need the same
   * handle.
   */
  let sceneReady = Promise.resolve();

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
    const copernicus = loader.ready('copernicus');
    return {
      districts: loader.ready('districts')?.data?.features ?? null,
      seismicEvents: loader.ready('seismicEvents')?.data?.events ?? null,
      unosat: loader.ready('unosat')?.data?.features ?? null,
      nga: loader.ready('nga')?.data ?? null,
      copernicusAois: copernicus?.data?.areasOfInterest?.features ?? null,
      copernicusGrading: copernicus?.data?.grading ?? null,
      intensityBands: derived.intensityBands(shakemap),
      densityRaster: derived.densityRaster(loader.ready('population')),
      graphEdges,
      route,
    };
  }

  /**
   * Build the graph and solve the scene's route pair.
   *
   * THE CHECK IS THE POINT. This is the only place the frontend runs the same
   * engine the analysis ran, so its answer is compared against the artefact's
   * published kilometres. A mismatch is surfaced in the panel rather than
   * drawn silently, because a 74 km caption over an 83 km line gives a reader
   * no way to tell which one to believe.
   */
  async function ensureNetwork(state) {
    const roads = loader.ready('osmRoads');
    if (!roads || !intelligence) return;
    if (!graphEdges) {
      const graph = await graphs.graph(roads.data.segments);
      graphEdges = [...graph.edges()];
      networkGraph = graph;
    }
    const pairs = intelligence.infrastructure.network.routes.routes ?? [];
    const wanted =
      pairs.find((pair) => pair.label === state?.selection?.routePair) ??
      pairs.find((pair) => pair.outcome === 'DETOUR') ??
      pairs[0] ??
      null;
    if (!wanted || !networkGraph) return;
    route = solveArtefactRoute(networkGraph, wanted, {
      disabledEdgeIds:
        intelligence.infrastructure.network.blockageMatching.disabledEdgeIds ??
        [],
    });
    routeProblems = verifyRoute(route);
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

    /*
     * A ROUTE THAT DISAGREES WITH ITS OWN ARTEFACT IS REPORTED, LOUDLY.
     *
     * Scene 14 is the only place the frontend runs the engine the analysis
     * ran. A 74 km caption over an 83 km line gives a reader no way to tell
     * which to believe, so a mismatch is stated rather than drawn quietly.
     * All fourteen pairs reproduce exactly, so this should never appear —
     * which is exactly why it has to be here.
     */
    if (routeProblems.length > 0) {
      slots.panel.append(
        h('p', {
          class: 'ndi-panel__error',
          text: `Route does not match its artefact — ${routeProblems.join('; ')}. The published figure is the authority; treat the drawn line as unverified.`,
        }),
      );
    }

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

  /**
   * Fly to the scene's target.
   *
   * MOST TARGETS ARE DATA-DERIVED, so the same scene resolves differently
   * before and after its datasets land: `route` is the mean of a solved path,
   * `damage-centroid` the mean of 4,500 points, `aoi-pair` a footprint's
   * centre. The first flight happens immediately — waiting would leave the
   * globe still while a scene changes — and `refocus()` corrects it once the
   * data is in, but only if the answer actually moved. Scene 14 framed the
   * country centre for exactly this reason: the route had not been solved yet
   * when the camera left.
   */
  let flewTo = null;

  function moveCamera({ durationSec = null } = {}) {
    if (!caseLayers) return;
    const state = investigation.state;
    const target = resolveTarget(state.camera?.target, {
      intelligence,
      data: sceneData(),
      selection: state.selection,
    });
    flewTo = target;
    caseLayers.flyTo({
      ...target,
      altKm: state.camera?.altKm ?? 1200,
      pitch: state.camera?.pitch ?? -90,
      durationSec: durationSec ?? state.camera?.durationSec ?? 2,
    });
  }

  /** ~1 km. Below this the correction is not worth a second flight. */
  const REFOCUS_DEGREES = 0.01;

  function refocus() {
    if (!caseLayers || !flewTo) return;
    const state = investigation.state;
    const target = resolveTarget(state.camera?.target, {
      intelligence,
      data: sceneData(),
      selection: state.selection,
    });
    const moved =
      Math.abs(target.lon - flewTo.lon) > REFOCUS_DEGREES ||
      Math.abs(target.lat - flewTo.lat) > REFOCUS_DEGREES;
    if (moved) moveCamera({ durationSec: 1.2 });
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
    /* Scenes 13, 14 and 18 need the graph as well as the file. */
    if (
      (state.scene?.layers ?? []).some(
        (layer) => layer.startsWith('road') || layer.startsWith('route'),
      )
    ) {
      try {
        await ensureNetwork(state);
      } catch (error) {
        failedDatasets.set('road network', error.message);
      }
    }
    loader.prefetch(state.datasetsToWarm);
    scheduleRender('immediate');
    refocus();
    /*
     * The data having arrived is not the map having been drawn. Ground
     * geometry is built asynchronously, so a caller that only waited for the
     * fetch would move on to an empty globe.
     */
    await caseLayers?.whenSettled?.();
  }

  function onStateChange(reason) {
    scheduleRender(reason);
    if (reason === 'scene' || reason === 'deeplink') {
      moveCamera();
      sceneReady = ensureSceneData();
    }
    /*
     * The outer mount syncs the address bar from here. It is told AFTER the
     * work above so a listener that reads `state.deepLink` sees the state the
     * screen is actually settling into, and a `deeplink` reason it caused
     * itself is reported so it can recognise and ignore its own echo.
     */
    onChange?.(investigation.state, reason);
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
      sceneReady = ensureSceneData();
      await sceneReady;
      return intelligence;
    },

    /**
     * Resolves once the current scene's datasets have settled.
     *
     * Settled, not succeeded: a dataset that failed has been dealt with (the
     * panel names it) and must not hold a caller forever.
     */
    whenSceneReady() {
      return sceneReady;
    },

    /** How the graph was built, and whether its route checks out. */
    networkStatus() {
      return Object.freeze({
        how: graphs.how,
        note: graphNote,
        edges: graphEdges?.length ?? 0,
        route: route?.pair?.label ?? null,
        problems: Object.freeze([...routeProblems]),
      });
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
