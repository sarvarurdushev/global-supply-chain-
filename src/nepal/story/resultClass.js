/**
 * How firmly a figure is known, and how that reaches the screen.
 *
 * This is the product's differentiator, so it gets the most careful treatment
 * in the codebase as well as in the design. A dashboard shows numbers; this
 * shows numbers with their epistemic status attached, and the status has to be
 * legible in four places at once — the chip, the map, the legend and the
 * header band — or it is decoration.
 *
 * ONE VOCABULARY, RESOLVED. The frontend grew a five-class scheme
 * (LIVE / HISTORICAL / INFERRED / SIMULATED / UNKNOWN) before the analytical
 * stages existed. The artefacts carry a different seven, plus a gap. Two
 * vocabularies describing the same thing is how a panel ends up labelling a
 * fitted Omori parameter "historical", so the ARTEFACTS' vocabulary wins: it is
 * what twenty-two methodology records are written against and what the academic
 * work rests on. The older keys survive as aliases, so nothing that already
 * renders a badge breaks.
 *
 * WHY MAP GRAMMAR LIVES HERE AND NOT IN A STYLESHEET. The rule that matters is
 * that observed and modelled things never share a visual grammar — hard edges
 * against soft fields, discrete glyphs against continuous surfaces. If that
 * lived only in CSS it would apply to panels and not to the globe, which is
 * where it counts. Cesium reads these values.
 */

/** The canonical classes, in increasing distance from direct observation. */
export const ResultClass = Object.freeze({
  OBSERVED: 'OBSERVED',
  OFFICIAL: 'OFFICIAL',
  DESCRIPTIVE_STATISTIC: 'DESCRIPTIVE_STATISTIC',
  DERIVED: 'DERIVED',
  MODEL_FIT: 'MODEL_FIT',
  ESTIMATE: 'ESTIMATE',
  SCENARIO: 'SCENARIO',
  DATA_GAP: 'DATA_GAP',
});

/**
 * A modelled hazard field is not a result class — it is a property of a
 * dataset. The ShakeMap is an OBSERVED product of USGS and a MODEL of the
 * ground, and the interface has to say the second thing on the map. This flag
 * is carried separately so a layer can be both.
 */
export const MODELED = 'MODELED';

/** Older keys that must keep resolving. */
const ALIASES = Object.freeze({
  LIVE: ResultClass.OBSERVED,
  HISTORICAL: ResultClass.OBSERVED,
  INFERRED: ResultClass.DERIVED,
  SIMULATED: ResultClass.SCENARIO,
  UNKNOWN: ResultClass.DATA_GAP,
  /* Stage 3-5 artefacts use the canonical names already. */
});

/**
 * Presentation for each class.
 *
 * `plain` is the phrase a non-specialist reads; `means` is the sentence the
 * tooltip shows. Both are required — a badge that says only "DERIVED" teaches
 * nobody anything, and this is a teaching product.
 */
export const RESULT_CLASS_PRESENTATION = Object.freeze({
  [ResultClass.OBSERVED]: Object.freeze({
    id: ResultClass.OBSERVED,
    label: 'OBSERVED',
    plain: 'Someone recorded this',
    means:
      'Recorded by an instrument or an agency and read as published. Not computed here.',
    colour: 'var(--gx-neon)',
    token: '--gx-observed',
    glyph: '●',
    rank: 0,
  }),
  [ResultClass.OFFICIAL]: Object.freeze({
    id: ResultClass.OFFICIAL,
    label: 'OFFICIAL',
    plain: 'Published by an authority',
    means:
      'Published by an authoritative body and reported as published, including where its definition is unclear.',
    colour: 'var(--gx-cyan)',
    token: '--gx-official',
    glyph: '●',
    rank: 1,
  }),
  [ResultClass.DESCRIPTIVE_STATISTIC]: Object.freeze({
    id: ResultClass.DESCRIPTIVE_STATISTIC,
    label: 'STATISTIC',
    plain: 'Counted from observations',
    means:
      'A count, median or distribution computed directly from observations. It adds no assumptions; the same data gives the same answer.',
    colour: 'var(--gx-green)',
    token: '--gx-derived',
    glyph: '◐',
    rank: 2,
  }),
  [ResultClass.DERIVED]: Object.freeze({
    id: ResultClass.DERIVED,
    label: 'DERIVED',
    plain: 'Worked out from several datasets',
    means:
      'Computed here by combining datasets, with no free parameters. The method is attached and can be disagreed with.',
    colour: 'var(--gx-green)',
    token: '--gx-derived',
    glyph: '◐',
    rank: 3,
  }),
  [ResultClass.MODEL_FIT]: Object.freeze({
    id: ResultClass.MODEL_FIT,
    label: 'MODEL FIT',
    plain: 'A fitted model parameter',
    means:
      'A parameter of a statistical model fitted to observations. It depends on the model, the window and the data excluded, and it is NOT a measurement of the earth.',
    colour: 'var(--gx-modelfit)',
    token: '--gx-modelfit',
    glyph: '◑',
    rank: 4,
  }),
  [ResultClass.ESTIMATE]: Object.freeze({
    id: ResultClass.ESTIMATE,
    label: 'ESTIMATE',
    plain: 'Depends on an assumption',
    means:
      'Computed here, and a stated assumption changes the answer. The assumption is named beside it.',
    colour: 'var(--gx-amber)',
    token: '--gx-estimate',
    glyph: '◔',
    rank: 5,
  }),
  [ResultClass.SCENARIO]: Object.freeze({
    id: ResultClass.SCENARIO,
    label: 'SCENARIO',
    plain: 'A what-if, not what happened',
    means:
      'A hypothetical constructed to explore consequences. Never a claim about what happened.',
    colour: 'var(--gx-violet)',
    token: '--gx-scenario',
    glyph: '◌',
    rank: 6,
  }),
  [ResultClass.DATA_GAP]: Object.freeze({
    id: ResultClass.DATA_GAP,
    label: 'DATA GAP',
    plain: 'We cannot answer this',
    means:
      'Cannot be reliably computed from anything held. What dataset would answer it is stated.',
    /*
     * Desaturated, deliberately not red. A gap is not an alarm, and colouring
     * it like one would make honesty look like failure.
     */
    colour: 'var(--gx-gap)',
    token: '--gx-gap',
    glyph: '○',
    rank: 7,
  }),
});

/**
 * Resolve any vocabulary — canonical, legacy alias, or unknown — to a class.
 *
 * An unrecognised value becomes DATA_GAP rather than throwing. A panel that
 * cannot classify a figure must say so on screen, not fail to render; refusing
 * to draw would hide the very thing this module exists to surface.
 */
export function resolveResultClass(value) {
  if (typeof value !== 'string') return ResultClass.DATA_GAP;
  const key = value.trim().toUpperCase();
  if (ResultClass[key]) return ResultClass[key];
  if (ALIASES[key]) return ALIASES[key];
  return ResultClass.DATA_GAP;
}

/** Presentation for any vocabulary. Never returns undefined. */
export function presentationFor(value) {
  return RESULT_CLASS_PRESENTATION[resolveResultClass(value)];
}

/**
 * How a class draws on the map.
 *
 * The values are consumed by Cesium layers, not by CSS, which is the point:
 * the distinction has to survive onto the globe. `modeled` overrides the edge
 * and fill regardless of class, because a modelled field is soft whether it
 * came from USGS or from us.
 */
export function mapGrammarFor(value, { modeled = false } = {}) {
  const resolved = resolveResultClass(value);
  if (modeled) {
    return Object.freeze({
      resultClass: resolved,
      modeled: true,
      edge: 'none',
      /*
       * A modelled field has no edge, which is the whole point of the
       * grammar — but at 0.35 the MMI ramp did not survive blending against
       * the globe, and eight distinct intensity levels read as one mauve
       * blur. With no edge to separate them the fill IS the information, so
       * it carries more of it. Still well under the observed grammar's 0.95,
       * which is the distinction that matters.
       */
      fillAlpha: 0.55,
      outlineWidth: 0,
      dashPattern: null,
      shape: 'field',
      chip: MODELED,
    });
  }
  switch (resolved) {
    case ResultClass.OBSERVED:
    case ResultClass.OFFICIAL:
      return Object.freeze({
        resultClass: resolved,
        modeled: false,
        edge: 'hard',
        fillAlpha: 0.95,
        outlineWidth: 1,
        dashPattern: null,
        shape: 'discrete',
        chip: RESULT_CLASS_PRESENTATION[resolved].label,
      });
    case ResultClass.DESCRIPTIVE_STATISTIC:
    case ResultClass.DERIVED:
    case ResultClass.ESTIMATE:
      return Object.freeze({
        resultClass: resolved,
        modeled: false,
        edge: 'dashed',
        fillAlpha: 0.55,
        outlineWidth: 1,
        dashPattern: 0x00ff,
        shape: 'area',
        chip: RESULT_CLASS_PRESENTATION[resolved].label,
      });
    case ResultClass.MODEL_FIT:
      return Object.freeze({
        resultClass: resolved,
        modeled: false,
        edge: 'dashed',
        fillAlpha: 0.4,
        outlineWidth: 1,
        dashPattern: 0x0f0f,
        shape: 'area',
        chip: RESULT_CLASS_PRESENTATION[resolved].label,
      });
    case ResultClass.SCENARIO:
      return Object.freeze({
        resultClass: resolved,
        modeled: false,
        edge: 'dashed',
        fillAlpha: 0.45,
        outlineWidth: 2,
        dashPattern: 0x00ff,
        shape: 'area',
        chip: RESULT_CLASS_PRESENTATION[resolved].label,
      });
    default:
      return Object.freeze({
        resultClass: ResultClass.DATA_GAP,
        modeled: false,
        edge: 'dashed',
        /*
         * A GAP IS A FINDING, SO IT IS VISIBLE. At 0.18 over a dark globe the
         * 66 unsurveyed districts of Scene 12 were effectively not drawn, and
         * the scene whose whole argument is "absence of observation is not
         * absence of damage" showed an empty map. The hatch and the dashed
         * edge are what say "we cannot answer this"; invisibility says
         * "nothing here", which is the misreading the scene exists to
         * prevent. Still the faintest class, and now present.
         */
        fillAlpha: 0.38,
        outlineWidth: 1,
        dashPattern: 0xf0f0,
        shape: 'area',
        chip: RESULT_CLASS_PRESENTATION[ResultClass.DATA_GAP].label,
      });
  }
}

/**
 * A drawable, with its grammar already resolved.
 *
 * EVERY DRAWABLE IN THE PRODUCT GOES THROUGH HERE. That is the one rule this
 * module enforces: observed and modelled things never share a grammar, and it
 * is applied once, in a single place, rather than remembered at each call
 * site. It lives here rather than in `mapModel.js` because `network.js` needs
 * it too, and importing it from `mapModel.js` would be a cycle — the first
 * version of `network.js` built its drawables by hand instead and shipped
 * with no grammar on any of them, which the tests caught.
 */
export function drawable(input) {
  const grammar = mapGrammarFor(input.resultClass, {
    modeled: input.modeled === true,
  });
  return Object.freeze({
    ...input,
    grammar,
    /* Convenience for the renderer; identical information to `grammar`. */
    outlineWidth: grammar.outlineWidth,
    fillAlpha: grammar.fillAlpha,
  });
}

/**
 * Should a layer of this class be drawn under the current filter?
 *
 * The Scene 17 filter is the strongest expression of this whole module: ticking
 * only OBSERVED dims every derived, fitted and scenario layer at once, so a
 * reader sees in one gesture how much of the picture is constructed. An empty
 * filter means no filtering, not "hide everything" — an empty selection that
 * blanked the map would read as a bug.
 */
export function passesFilter(value, filter) {
  if (!filter || filter.size === 0) return true;
  return filter.has(resolveResultClass(value));
}

/** The classes a scene declares, deduplicated and ordered by firmness. */
export function summariseClasses(values) {
  const resolved = [...new Set((values ?? []).map(resolveResultClass))];
  resolved.sort(
    (a, b) =>
      RESULT_CLASS_PRESENTATION[a].rank - RESULT_CLASS_PRESENTATION[b].rank,
  );
  return Object.freeze(resolved);
}

/**
 * Whether a scene is constructed enough to need the persistent header band.
 *
 * SCENARIO gets a band across the whole header rather than a chip in a panel,
 * so that it is impossible to screenshot a route from this product without the
 * word in frame.
 */
export function needsScenarioBand(values) {
  return summariseClasses(values).includes(ResultClass.SCENARIO);
}
