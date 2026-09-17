/**
 * The investigation state machine.
 *
 * §27 is the requirement this module exists to satisfy: "Do not treat these as
 * separate pages. They should feel like one continuous investigation." So the
 * platform has ONE piece of state, not nine, and every view is a projection of
 * it:
 *
 *   case          which disaster is being investigated
 *   depth         how far down the geographic ladder the user has descended
 *   phase         where on the disaster timeline they are standing
 *   layers        which analytical layers they have turned on
 *   selection     what they last clicked
 *   scenario      which response scenario is being explored
 *
 * Changing any one of those recomputes what the map draws and what the panel
 * says. There is no "timeline page" that owns the timeline: moving the phase
 * changes the hazard footprint, the infrastructure states, the routes and the
 * population figures at whatever depth the user is already at, which is §4's
 * requirement ("When the user moves the timeline: the map should change").
 *
 * WHY DEPTH AND PHASE ARE INDEPENDENT. They answer different questions —
 * "where am I looking?" and "when am I looking?" — and a user descending to a
 * city at T+6h must not be thrown back to the country view. Coupling them was
 * the obvious first design and it made the interface feel like a slideshow.
 *
 * THE THREE QUESTIONS. §17 makes WHAT HAPPENED / WHY IT MATTERED / WHAT NOW
 * the conceptual backbone, so `chapter()` maps the current phase onto one of
 * them. It is a reading of the state rather than a separate mode, which is why
 * the user never has to choose a chapter.
 *
 * Portable: no Cesium, no Node, no browser globals. Camera moves and layer
 * toggles are emitted as intents for a host to apply.
 */

import { phasesFor, geometriesFor, hazard } from './hazards.js';

/** The §17 chapters, and which phases belong to each. */
export const CHAPTERS = Object.freeze([
  Object.freeze({
    id: 'what-happened',
    name: 'What happened',
    question: 'What happened, where, and how big was it?',
    /** Onset and immediate impact. */
    maxOffsetHours: 6,
  }),
  Object.freeze({
    id: 'why-it-mattered',
    name: 'Why it mattered',
    question:
      'Who was affected, what infrastructure failed, and what did that reach?',
    maxOffsetHours: 48,
  }),
  Object.freeze({
    id: 'what-now',
    name: 'What now',
    question:
      'Where can rescuers enter, where can people go, and what recovers?',
    maxOffsetHours: Infinity,
  }),
]);

/**
 * The analytical layer groups (§10).
 *
 * Declared here rather than in the renderer so the layer tray, the map and the
 * share link all read one list. `dependsOnPhase` marks the layers whose
 * contents change as the timeline moves — the renderer uses it to know what to
 * recompute on a phase change rather than redrawing everything.
 */
export const LAYER_GROUPS = Object.freeze([
  Object.freeze({
    id: 'geography',
    name: 'Geography',
    layers: Object.freeze([
      { id: 'country-borders', name: 'Borders', dependsOnPhase: false },
      {
        id: 'terrain-3d',
        name: 'Terrain and elevation',
        dependsOnPhase: false,
      },
      {
        id: 'admin-areas',
        name: 'Provinces and districts',
        dependsOnPhase: false,
      },
    ]),
  }),
  Object.freeze({
    id: 'hazard',
    name: 'Hazard',
    /** Populated per case from the hazard registry's geometries. */
    layers: null,
  }),
  Object.freeze({
    id: 'human',
    name: 'Human impact',
    layers: Object.freeze([
      {
        id: 'population-exposure',
        name: 'Population exposed',
        dependsOnPhase: false,
      },
      { id: 'casualties', name: 'Casualties', dependsOnPhase: true },
      { id: 'displacement', name: 'Displacement', dependsOnPhase: true },
      { id: 'shelters', name: 'Shelters', dependsOnPhase: true },
      { id: 'hospitals', name: 'Hospitals', dependsOnPhase: true },
    ]),
  }),
  Object.freeze({
    id: 'infrastructure',
    name: 'Infrastructure',
    layers: Object.freeze([
      { id: 'roads-state', name: 'Roads and bridges', dependsOnPhase: true },
      { id: 'airports-state', name: 'Airports', dependsOnPhase: true },
      { id: 'power-state', name: 'Power and telecoms', dependsOnPhase: true },
      { id: 'freight-rail', name: 'Rail corridors', dependsOnPhase: false },
    ]),
  }),
  Object.freeze({
    id: 'supply-chain',
    name: 'Supply chain',
    layers: Object.freeze([
      { id: 'supply-chain', name: 'Supply route', dependsOnPhase: true },
      { id: 'supply-ports', name: 'Ports', dependsOnPhase: false },
      {
        id: 'production-sites',
        name: 'Factories and warehouses',
        dependsOnPhase: false,
      },
      { id: 'chokepoints', name: 'Chokepoints', dependsOnPhase: false },
    ]),
  }),
  Object.freeze({
    id: 'economic',
    name: 'Economic',
    layers: Object.freeze([
      { id: 'damage-heatmap', name: 'Damage by area', dependsOnPhase: true },
      { id: 'agriculture', name: 'Agricultural areas', dependsOnPhase: false },
    ]),
  }),
  Object.freeze({
    id: 'response',
    name: 'Response',
    layers: Object.freeze([
      { id: 'rescue-routes', name: 'Rescue routes', dependsOnPhase: true },
      {
        id: 'evacuation-routes',
        name: 'Evacuation routes',
        dependsOnPhase: true,
      },
      { id: 'blocked-routes', name: 'Blocked routes', dependsOnPhase: true },
      { id: 'aid-corridors', name: 'Aid corridors', dependsOnPhase: true },
    ]),
  }),
]);

/**
 * Resolve the layer groups for one case.
 *
 * The hazard group is per-case: an earthquake offers intensity contours and a
 * rupture, a cyclone offers a track and a surge surface. `available: false`
 * marks a layer the case has no data for — it stays listed, because §2 and §5
 * both require an absence to be visible rather than hidden.
 */
export function layerGroupsFor(entry) {
  const hazardType = hazard(entry?.hazardId);
  const wired = new Set(
    geometriesFor(entry?.hazardId, { onlyWired: true }).map((geo) => geo.id),
  );
  return Object.freeze(
    LAYER_GROUPS.map((group) => {
      if (group.id !== 'hazard') {
        return Object.freeze({
          ...group,
          layers: Object.freeze(
            group.layers.map((layer) =>
              Object.freeze({ ...layer, available: true }),
            ),
          ),
        });
      }
      const layers = (hazardType?.geometries ?? []).map((geo) =>
        Object.freeze({
          id: geo.id,
          name: geo.name,
          dependsOnPhase: geo.timeVarying,
          available: wired.has(geo.id),
          answers: geo.answers,
          requiresTerrain: geo.requiresTerrain,
          /** Named so the panel can say which source is missing. */
          adapter: geo.adapter,
        }),
      );
      return Object.freeze({ ...group, layers: Object.freeze(layers) });
    }),
  );
}

/**
 * Create an investigation.
 *
 * @param {object} deps
 * @param {object} deps.case the case being investigated, from the catalogue
 * @param {(intent:object)=>void} [deps.onIntent] camera and layer intents
 * @param {(state:object)=>void} [deps.onChange]
 * @returns {object} handle
 */
export function createInvestigation({
  case: entry,
  onIntent = () => {},
  onChange = () => {},
}) {
  if (!entry?.id) throw new TypeError('an investigation requires a case');
  const ladder = Array.isArray(entry.zoomPath) ? entry.zoomPath : [];
  if (ladder.length === 0) {
    throw new TypeError(`case "${entry.id}" has no zoom path to descend`);
  }
  const phases = phasesFor(entry.hazardId);
  if (phases.length === 0) {
    throw new TypeError(`case "${entry.id}" has no timeline phases`);
  }
  const groups = layerGroupsFor(entry);

  const state = {
    /** Index into the ladder, not the rung's own `level`. */
    depthIndex: 0,
    phaseIndex: 0,
    enabledLayers: new Set(),
    selection: null,
    scenarioId: null,
    /** Set while a descent is animating, so a second one cannot interleave. */
    descending: false,
  };

  function rung() {
    return ladder[state.depthIndex];
  }
  function phase() {
    return phases[state.phaseIndex];
  }

  /** Which of the three questions the current phase belongs to. */
  function chapter() {
    const offset = phase().offsetHours;
    return (
      CHAPTERS.find((item) => offset <= item.maxOffsetHours) ??
      CHAPTERS[CHAPTERS.length - 1]
    );
  }

  function emit(intent) {
    onIntent(Object.freeze({ ...intent, at: Date.now() }));
  }

  function notify() {
    onChange(snapshot());
  }

  /**
   * Move the camera to the current rung.
   *
   * `drawBorders` is on for the country rung specifically, because §3 LEVEL 1
   * asks for the national border to be drawn and the neighbours distinguished
   * at exactly that point in the descent — not before, when it would be noise,
   * and not after, when the camera is inside the country.
   */
  function flyToRung(reason) {
    const target = rung();
    emit({
      kind: 'camera',
      reason,
      lat: target.lat,
      lon: target.lon,
      altKm: target.altKm,
      level: target.level,
      name: target.name,
      rungKind: target.kind,
      drawBorders: target.kind === 'COUNTRY' || target.kind === 'REGION',
      highlightCountry: target.kind === 'COUNTRY' ? entry.countryIso3 : null,
    });
  }

  /* ---------------- depth: where am I looking? ---------------- */

  function goToDepth(index, { reason = 'jump' } = {}) {
    const clamped = Math.max(0, Math.min(ladder.length - 1, Math.floor(index)));
    if (clamped === state.depthIndex && reason !== 'enter') return false;
    state.depthIndex = clamped;
    flyToRung(reason);
    applyPhaseLayers();
    notify();
    return true;
  }

  function deeper() {
    return goToDepth(state.depthIndex + 1, { reason: 'deeper' });
  }
  function shallower() {
    return goToDepth(state.depthIndex - 1, { reason: 'shallower' });
  }

  /**
   * Run the whole descent as a cinematic sequence (§24 scenes 3-5).
   *
   * Emits one camera intent per rung with a hold, rather than one flight to
   * the bottom: §3's "The transition should feel like Global → South Asia →
   * Nepal" is about the reader recognising each level, and a single flight
   * from orbit to a street shows them nothing on the way.
   *
   * @param {object} [options]
   * @param {number} [options.holdMs] pause at each rung
   * @param {number} [options.toDepth] stop early
   * @param {(fn:Function, ms:number)=>unknown} [options.setTimer]
   */
  function descend({
    holdMs = 2600,
    toDepth = ladder.length - 1,
    setTimer = (fn, ms) => setTimeout(fn, ms),
  } = {}) {
    if (state.descending) return false;
    const target = Math.max(0, Math.min(ladder.length - 1, toDepth));
    state.descending = true;
    const step = () => {
      if (!state.descending) return;
      if (state.depthIndex >= target) {
        state.descending = false;
        notify();
        return;
      }
      goToDepth(state.depthIndex + 1, { reason: 'descend' });
      setTimer(step, holdMs);
    };
    // The first rung is already current, so hold on it before moving.
    flyToRung('descend-start');
    notify();
    setTimer(step, holdMs);
    return true;
  }

  function stopDescent() {
    if (!state.descending) return false;
    state.descending = false;
    notify();
    return true;
  }

  /* ---------------- phase: when am I looking? ---------------- */

  /**
   * Re-emit the layer intents whose contents depend on the phase.
   *
   * This is the §4 mechanism. Moving the timeline does not switch view; it
   * tells every phase-dependent layer to recompute at the new time, at
   * whatever depth the user is standing.
   */
  function applyPhaseLayers() {
    const current = phase();
    const dependent = [];
    for (const group of groups) {
      for (const layer of group.layers ?? []) {
        if (!layer.dependsOnPhase) continue;
        if (!state.enabledLayers.has(layer.id)) continue;
        dependent.push(layer.id);
      }
    }
    if (dependent.length === 0) return;
    emit({
      kind: 'phase',
      phase: current.key,
      offsetHours: current.offsetHours,
      heading: current.heading,
      layers: Object.freeze(dependent),
      depthLevel: rung().level,
    });
  }

  function goToPhase(index) {
    const clamped = Math.max(0, Math.min(phases.length - 1, Math.floor(index)));
    if (clamped === state.phaseIndex) return false;
    state.phaseIndex = clamped;
    applyPhaseLayers();
    notify();
    return true;
  }

  function nextPhase() {
    return goToPhase(state.phaseIndex + 1);
  }
  function previousPhase() {
    return goToPhase(state.phaseIndex - 1);
  }

  /* ---------------- layers ---------------- */

  function findLayer(layerId) {
    for (const group of groups) {
      const match = (group.layers ?? []).find((layer) => layer.id === layerId);
      if (match) return { group, layer: match };
    }
    return null;
  }

  /**
   * Turn a layer on or off.
   *
   * Refuses a layer the case has no data for and says so in the return value,
   * rather than switching it on to draw nothing. A silent no-op here is how a
   * user concludes the platform is broken instead of that the data is absent.
   */
  function setLayer(layerId, enabled) {
    const found = findLayer(layerId);
    if (!found) return { ok: false, reason: `unknown layer "${layerId}"` };
    if (enabled && found.layer.available === false) {
      return {
        ok: false,
        reason: `${found.layer.name} has no data for this case`,
        adapter: found.layer.adapter ?? null,
      };
    }
    if (enabled) state.enabledLayers.add(layerId);
    else state.enabledLayers.delete(layerId);
    emit({
      kind: 'layer',
      layerId,
      enabled: Boolean(enabled),
      group: found.group.id,
      dependsOnPhase: found.layer.dependsOnPhase,
      phase: phase().key,
    });
    notify();
    return { ok: true };
  }

  /* ---------------- selection: the contextual panel (§22) ---------------- */

  /**
   * Record what the user clicked.
   *
   * The right-hand panel is a projection of this, so selecting a city, a road
   * or a hazard zone changes what the panel offers without navigating
   * anywhere. `subject` is the kind, which is what the panel switches on.
   */
  function select(subject) {
    state.selection = subject ?? null;
    if (
      subject?.latitude != null &&
      subject?.longitude != null &&
      subject.flyTo
    ) {
      emit({
        kind: 'camera',
        reason: 'selection',
        lat: subject.latitude,
        lon: subject.longitude,
        altKm: subject.altKm ?? Math.max(4, rung().altKm / 3),
        level: rung().level,
        name: subject.label ?? 'Selection',
        rungKind: 'SELECTION',
        drawBorders: false,
        highlightCountry: null,
      });
    }
    notify();
    return true;
  }

  function clearSelection() {
    if (!state.selection) return false;
    state.selection = null;
    notify();
    return true;
  }

  /* ---------------- response scenarios (§15) ---------------- */

  function setScenario(scenarioId) {
    state.scenarioId = scenarioId ?? null;
    emit({
      kind: 'scenario',
      scenarioId: state.scenarioId,
      phase: phase().key,
      depthLevel: rung().level,
    });
    notify();
    return true;
  }

  /* ---------------- reset ---------------- */

  /**
   * Back to the top of the ladder at T-0, everything off.
   *
   * Thorough on purpose: a partial reset that leaves the timeline at T+48h
   * while the camera returns to orbit is worse than none, because the user
   * pressed the button believing it worked.
   */
  function reset() {
    stopDescent();
    state.depthIndex = 0;
    state.phaseIndex = 0;
    for (const layerId of [...state.enabledLayers]) {
      emit({
        kind: 'layer',
        layerId,
        enabled: false,
        group: null,
        dependsOnPhase: false,
        phase: phase().key,
      });
    }
    state.enabledLayers.clear();
    state.selection = null;
    state.scenarioId = null;
    flyToRung('reset');
    notify();
    return true;
  }

  function snapshot() {
    const current = rung();
    const currentPhase = phase();
    return Object.freeze({
      caseId: entry.id,
      caseName: entry.name,
      hazardId: entry.hazardId,
      depth: Object.freeze({
        index: state.depthIndex,
        total: ladder.length,
        level: current.level,
        name: current.name,
        kind: current.kind,
        reveals: current.reveals,
        note: current.note,
        canGoDeeper: state.depthIndex < ladder.length - 1,
        canGoShallower: state.depthIndex > 0,
        /** The full trail, for the breadcrumb. */
        trail: Object.freeze(
          ladder.slice(0, state.depthIndex + 1).map((item) => item.name),
        ),
      }),
      phase: Object.freeze({
        index: state.phaseIndex,
        total: phases.length,
        key: currentPhase.key,
        label: currentPhase.label,
        heading: currentPhase.heading,
        offsetHours: currentPhase.offsetHours,
        canGoForward: state.phaseIndex < phases.length - 1,
        canGoBack: state.phaseIndex > 0,
      }),
      chapter: chapter(),
      enabledLayers: Object.freeze([...state.enabledLayers]),
      selection: state.selection,
      scenarioId: state.scenarioId,
      descending: state.descending,
    });
  }

  /* Emit the opening camera position so the host starts where the case does. */
  flyToRung('enter');

  return {
    /** Static structure, for the views to render controls from. */
    ladder: Object.freeze([...ladder]),
    phases: Object.freeze([...phases]),
    layerGroups: groups,
    case: entry,

    goToDepth,
    deeper,
    shallower,
    descend,
    stopDescent,

    goToPhase,
    nextPhase,
    previousPhase,

    setLayer,
    isLayerEnabled: (layerId) => state.enabledLayers.has(layerId),

    select,
    clearSelection,
    setScenario,
    reset,
    getState: snapshot,
    destroy() {
      state.descending = false;
      state.enabledLayers.clear();
      state.selection = null;
    },
  };
}
