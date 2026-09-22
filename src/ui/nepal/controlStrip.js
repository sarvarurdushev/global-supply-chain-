/**
 * The bottom strip: the scene's own controls, and nothing else.
 *
 * EVERY OPTION LIST COMES FROM AN ARTEFACT. Not one of the choices below is
 * typed: the intensity levels are the ShakeMap's usable contours, the damage
 * classes are UNOSAT's own class order, the districts are the nine that carry
 * a damage observation, the tolerances are the association curve's, the bands
 * are the proximity analysis's, and the route pairs are the fourteen Stage 5
 * measured. A control offering a value the analysis never produced is a
 * control that invites the reader to invent a finding.
 *
 * A SCENE WITH NO CONTROLS RENDERS NOTHING. The design is explicit that an
 * empty strip beats a strip of disabled controls: a greyed-out slider on a
 * scene that has nothing to vary tells the reader the product is broken
 * rather than that this scene is a statement.
 *
 * WHAT IS DELIBERATELY NOT HERE. Nothing that would let somebody construct a
 * casualty figure, an arrival time or an evacuation plan. Scene 18's controls
 * re-run an existing validated engine over observed inputs and stop there.
 */

import { h } from '../../workspace/components.js';
import {
  ResultClass,
  RESULT_CLASS_PRESENTATION,
} from '../../nepal/story/resultClass.js';

/** One labelled control. */
function group(label, children) {
  return h('div', { class: 'ndi-controls__group' }, [
    h('span', { class: 'ndi-controls__label', text: label }),
    h('div', { class: 'ndi-controls__widget' }, children),
  ]);
}

/** A row of mutually exclusive buttons. */
function segmented(options, { value, onPick }) {
  return options.map((option) =>
    h('button', {
      type: 'button',
      class: `ndi-controls__chip${option.value === value ? ' is-active' : ''}`,
      'aria-pressed': option.value === value ? 'true' : 'false',
      dataset: { value: String(option.value) },
      title: option.title ?? '',
      text: option.label,
      onclick: () => onPick(option.value),
    }),
  );
}

/** A checkbox, as a chip so it matches everything else. */
function toggle(label, { on, onPick, title = null }) {
  return h('button', {
    type: 'button',
    class: `ndi-controls__chip${on ? ' is-active' : ''}`,
    'aria-pressed': on ? 'true' : 'false',
    title: title ?? '',
    text: label,
    onclick: () => onPick(!on),
  });
}

/**
 * One builder per control a scene may declare.
 *
 * Each takes the live state and the intelligence and returns an element, or
 * null when the artefact it needs has not arrived — a control that cannot
 * know its own options must not guess them.
 */
export const CONTROL_WIDGETS = Object.freeze({
  /** Scenes 02 and 03. Time drives the map; the map is not decorated by it. */
  timeline(intel, state, on) {
    /*
     * THE WINDOW IS DERIVED FROM THE ARTEFACT, NOT TYPED.
     *
     * The seismic analysis publishes the main shock's instant and a daily
     * series indexed in DAYS FROM IT — day 0 to day 356 — rather than a first
     * and last timestamp. An earlier version of this looked for
     * `temporal.first`/`temporal.last`, found neither, and silently rendered
     * no timeline on scenes 02 and 03; the test that walks every scene with
     * controls is what caught it. So the end is computed from the last day of
     * the series, which is the same fact in the form the artefact holds it.
     */
    const mainShock = intel?.seismic?.mainShock?.time;
    const daily = intel?.seismic?.temporal?.daily;
    if (!mainShock || !daily?.length) return null;
    const startMs = Date.parse(mainShock);
    if (!Number.isFinite(startMs)) return null;
    const lastDay = daily[daily.length - 1]?.day;
    if (!Number.isFinite(lastDay)) return null;
    /* Inclusive of the last day itself, hence the extra day. */
    const endMs = startMs + (lastDay + 1) * 86_400_000;
    const cutoff = state.controls.timeCutoff
      ? Date.parse(state.controls.timeCutoff)
      : endMs;
    const slider = h('input', {
      type: 'range',
      class: 'ndi-controls__range',
      min: String(startMs),
      max: String(endMs),
      value: String(cutoff),
      'aria-label': 'Show events up to',
      oninput: (event) =>
        on.control(
          'timeCutoff',
          new Date(Number(event.target.value)).toISOString(),
        ),
    });
    return group('Up to', [
      slider,
      h('span', {
        class: 'ndi-controls__readout',
        text: new Date(cutoff).toISOString().slice(0, 16).replace('T', ' '),
      }),
      /* Back to the whole sequence, because a scrubbed slider has no home key. */
      h('button', {
        type: 'button',
        class: 'ndi-controls__chip',
        text: 'ALL',
        onclick: () => on.control('timeCutoff', null),
      }),
    ]);
  },

  /** Scenes 04, 05 and 18. Only the contour levels the ShakeMap can close. */
  intensityThreshold(intel, state, on) {
    const levels = intel?.exposure?.usableLevels;
    if (!levels?.length) return null;
    return group('MMI at or above', [
      ...segmented(
        levels.map((level) => ({ value: level, label: `${level}` })),
        {
          value: state.controls.intensityThreshold,
          onPick: (value) => on.control('intensityThreshold', value),
        },
      ),
    ]);
  },

  /** Scene 06. The artefact's own four quadrants, plus "all". */
  quadrant(intel, state, on) {
    const quadrants = intel?.exposure?.quadrants?.quadrants;
    if (!quadrants?.length) return null;
    return group('Quadrant', [
      ...segmented(
        [
          { value: null, label: 'ALL' },
          ...quadrants.map((entry) => ({
            value: entry.id,
            label: entry.label,
            title: entry.meaning,
          })),
        ],
        {
          value: state.controls.quadrant,
          onPick: (value) => on.control('quadrant', value),
        },
      ),
    ]);
  },

  /**
   * Scene 07. The nine districts that carry a damage observation.
   *
   * It says nine of seventy-five rather than listing all seventy-five,
   * because the other sixty-six would offer a descent into an empty panel
   * and read as "nothing happened there".
   */
  districtPicker(intel, state, on) {
    const rows = intel?.damage?.byDistrict;
    if (!rows?.length) return null;
    return group(`District (${rows.length} of 75 observed)`, [
      ...segmented(
        rows.map((row) => ({
          value: row.district,
          label: row.district,
          title: `${row.count} observed damage points`,
        })),
        {
          value: state.selection.district,
          onPick: (value) => on.select({ district: value }),
        },
      ),
    ]);
  },

  /** Scene 08. UNOSAT's own class order, worst first as the artefact has it. */
  damageClass(intel, state, on) {
    const classes = intel?.damage?.classOrder;
    if (!classes?.length) return null;
    return group('Damage class', [
      ...segmented(
        [
          { value: null, label: 'ALL' },
          ...classes.map((name) => ({ value: name, label: name })),
        ],
        {
          value: state.controls.damageClass,
          onPick: (value) => on.control('damageClass', value),
        },
      ),
    ]);
  },

  /** Scenes 10 and 11. Which of the scene's layers are drawn. */
  layerToggles(intel, state, on) {
    const available = state.scene?.layers ?? [];
    if (available.length < 2) return null;
    return group('Layers', [
      ...available.map((layer) =>
        toggle(layer.replace(/-/g, ' '), {
          on: state.visibleLayers.includes(layer),
          onPick: (next) => on.layer(layer, next),
        }),
      ),
    ]);
  },

  /** Scenes 10 and 11. The association curve's own tolerances. */
  associationTolerance(intel, state, on) {
    const curve = intel?.infrastructure?.association?.roadToLandslide?.curve;
    if (!curve?.length) return null;
    return group('Association within', [
      ...segmented(
        curve.map((row) => ({
          value: row.toleranceMetres,
          label: `${row.toleranceMetres} m`,
          title: `${row.featureShare}% of roads`,
        })),
        {
          value: state.controls.associationTolerance,
          onPick: (value) => on.control('associationTolerance', value),
        },
      ),
    ]);
  },

  /**
   * Scene 12. What the coverage map is keyed on.
   *
   * Both labels are about the SURVEY, never about the ground: "not surveyed"
   * and "no damage" are the distinction the whole scene exists to make.
   */
  coverageToggle(intel, state, on) {
    return group('Colour districts by', [
      ...segmented(
        [
          { value: 'observed', label: 'Records held' },
          { value: 'gaps', label: 'Districts not surveyed' },
        ],
        {
          value: state.controls.coverageToggle,
          onPick: (value) => on.control('coverageToggle', value),
        },
      ),
    ]);
  },

  /** Scenes 14 and 18. The fourteen pairs Stage 5 measured, and only those. */
  originDestination(intel, state, on) {
    const pairs = intel?.infrastructure?.network?.routes?.routes;
    if (!pairs?.length) return null;
    const current =
      state.selection.routePair ??
      pairs.find((pair) => pair.outcome === 'DETOUR')?.label ??
      pairs[0].label;
    return group(`Route (${pairs.length} measured)`, [
      ...segmented(
        pairs.map((pair) => ({
          value: pair.label,
          label: pair.label.replace('Kathmandu → ', ''),
          title: `${pair.outcome}${pair.baselineKm ? ` — ${pair.baselineKm} km` : ''}`,
        })),
        {
          value: current,
          onPick: (value) => on.select({ routePair: value }),
        },
      ),
    ]);
  },

  /** Scene 15. The proximity analysis's own bands. */
  proximityBand(intel, state, on) {
    const bands = intel?.people?.proximity?.bands;
    if (!bands?.length) return null;
    return group('Within', [
      ...segmented(
        bands.map((band) => ({
          value: band.withinMetres,
          label:
            band.withinMetres >= 1000
              ? `${band.withinMetres / 1000} km`
              : `${band.withinMetres} m`,
          title: `${band.people.toLocaleString('en-GB')} people`,
        })),
        {
          value: state.controls.proximityBand,
          onPick: (value) => on.control('proximityBand', value),
        },
      ),
    ]);
  },

  /** Scene 16. The four clocks, named by the artefact's timeline. */
  clock(intel, state, on) {
    /* The artefact holds an ordered LIST of clocks, not a map of them. */
    const clocks = intel?.damage?.timeline?.clocks;
    const options = Array.isArray(clocks)
      ? clocks.map((entry) => ({
          value: entry.id,
          label: entry.label ?? entry.id,
          title: entry.meaning ?? '',
        }))
      : null;
    if (!options?.length) return null;
    return group('Clock', [
      ...segmented(options, {
        value: state.controls.clock,
        onPick: (value) => on.control('clock', value),
      }),
    ]);
  },

  /**
   * Scene 17. The filter that makes the constructed share visible at once.
   *
   * An empty selection means no filtering rather than "hide everything": a
   * blank map from an empty tick list reads as a bug.
   */
  resultClassFilter(intel, state, on) {
    const active = new Set(state.resultClassFilter);
    return group('Show only', [
      ...Object.values(ResultClass).map((id) =>
        toggle(RESULT_CLASS_PRESENTATION[id].label, {
          on: active.has(id),
          title: RESULT_CLASS_PRESENTATION[id].plain,
          onPick: (next) => {
            const wanted = new Set(active);
            if (next) wanted.add(id);
            else wanted.delete(id);
            on.filter([...wanted]);
          },
        }),
      ),
      h('button', {
        type: 'button',
        class: 'ndi-controls__chip',
        text: 'EVERYTHING',
        onclick: () => on.filter([]),
      }),
    ]);
  },

  /**
   * Scene 18. Remove the bridges and re-route.
   *
   * Only five bridges were observed and only one of them matched the mapped
   * network, so the toggle names both numbers. A control that said "remove
   * bridges" without them would imply the scenario covers the country.
   */
  bridgeToggle(intel, state, on) {
    const bridges = intel?.infrastructure?.network?.bridgesOnly;
    if (!bridges) return null;
    return group('Scenario', [
      toggle(
        `Remove the ${bridges.matchedToNetwork} matched bridge of ${bridges.bridges} observed`,
        {
          on: state.controls.bridgeToggle,
          onPick: (value) => on.control('bridgeToggle', value),
          title: `${bridges.unmatched} of the observed bridges sit on roads this network does not contain, so they cannot be removed from it.`,
        },
      ),
    ]);
  },
});

/**
 * Build the strip for the current scene.
 *
 * @param {object} input
 * @param {object} input.state investigation snapshot
 * @param {object|null} input.intelligence
 * @param {object} input.on `{control, select, layer, filter}`
 * @returns {HTMLElement|null} null when this scene has no controls
 */
export function renderControlStrip({ state, intelligence, on }) {
  const wanted = state?.scene?.controls ?? [];
  if (wanted.length === 0) return null;
  const widgets = [];
  const problems = [];
  for (const name of wanted) {
    const build = CONTROL_WIDGETS[name];
    if (!build) {
      problems.push(name);
      continue;
    }
    try {
      const element = build(intelligence, state, on);
      if (element) widgets.push(element);
    } catch (error) {
      /*
       * One broken control must not take the scene's whole strip with it, and
       * it must not fail quietly either — a control that silently vanishes is
       * indistinguishable from a scene that never had it.
       */
      problems.push(`${name} (${error.message})`);
    }
  }
  if (widgets.length === 0 && problems.length === 0) return null;
  return h('div', { class: 'ndi-controls', role: 'group' }, [
    ...widgets,
    problems.length > 0
      ? h('span', {
          class: 'ndi-controls__problem',
          text: `control unavailable: ${problems.join(', ')}`,
        })
      : null,
  ]);
}
