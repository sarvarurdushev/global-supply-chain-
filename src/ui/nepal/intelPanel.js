/**
 * The right-hand intelligence panel: one builder per scene.
 *
 * Every panel is built from the artefacts, never from a constant typed here.
 * A figure in this file that is not read through `intelligence` is a second
 * source of truth, and the whole point of Stages 0–5 was that there is one.
 *
 * EVERY PANEL ENDS THE SAME WAY. Result-class chip, source line, and a link to
 * the methodology record behind the figure. That is the contract: a reader who
 * distrusts a number must always be one click from the question it answers,
 * the data it used, how it was computed, what was checked and what it cannot
 * support. A panel that cannot offer that has no business showing a number.
 */

import { h } from '../../workspace/components.js';
import {
  RESULT_CLASS_PRESENTATION,
  presentationFor,
} from '../../nepal/story/resultClass.js';

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

/** A machine-read number with its unit. Monospace; language never is. */
export function figure(value, { unit = null, label = null } = {}) {
  return h('div', { class: 'ndi-panel__figure' }, [
    h('div', { class: 'ndi-figure' }, [
      h('span', { text: String(value) }),
      unit ? h('span', { class: 'ndi-figure__unit', text: unit }) : null,
    ]),
    label ? h('div', { class: 'ndi-panel__figure-label', text: label }) : null,
  ]);
}

/** The class chip: glyph, label, and the plain phrase a non-specialist reads. */
export function classChip(resultClass) {
  const presentation = presentationFor(resultClass);
  return h(
    'span',
    {
      class: 'ndi-class',
      style: { '--chip': presentation.colour },
      title: presentation.means,
    },
    [
      h('span', { class: 'ndi-class__glyph', text: presentation.glyph }),
      h('span', { text: presentation.label }),
      h('span', { class: 'ndi-class__plain', text: presentation.plain }),
    ],
  );
}

/** A labelled row of value pairs — the panel's workhorse. */
export function rows(entries) {
  return h(
    'dl',
    { class: 'ndi-panel__rows' },
    entries.flatMap(([label, value]) => [
      h('dt', { text: label }),
      h('dd', { text: String(value) }),
    ]),
  );
}

/** A caption that carries a caveat rather than decoration. */
export function caveat(text) {
  return h('p', { class: 'ndi-panel__caveat', text });
}

/**
 * A stated finding: one sentence that is the point of the scene.
 *
 * Set apart from the rows because it is the conclusion, not another number.
 * Several panels were building this inline with the same class; it is one
 * helper now so the styling cannot drift between them.
 */
export function statement(text) {
  return h('p', { class: 'ndi-panel__statement', text });
}

/**
 * The footer every panel gets.
 *
 * `onMethodology` opens the record; if a scene cites none, the link is absent
 * rather than dead, because a link that opens nothing is worse than no link.
 */
function footer({ resultClasses, sources, analyses, onMethodology }) {
  return h('footer', { class: 'ndi-panel__footer' }, [
    h(
      'div',
      { class: 'ndi-panel__classes' },
      (resultClasses ?? []).map((value) => classChip(value)),
    ),
    /*
     * EVERY PANEL SAYS WHERE ITS NUMBERS CAME FROM. The source line used to
     * be built from the scene's Tier 2 datasets alone, so a scene whose
     * evidence lives entirely in the analysis artefacts — 16 and 17 — showed
     * no source at all. Those are the two scenes most about provenance, and
     * they were the two with none. When a scene loads no geometry, the line
     * names the analyses it rests on instead.
     */
    sources?.length
      ? h('p', {
          class: 'ndi-panel__source',
          text: `SOURCE ${sources.join(' · ')}`,
        })
      : analyses?.length
        ? h('p', {
            class: 'ndi-panel__source',
            text: `SOURCE ${analyses.join(' · ')}`,
          })
        : null,
    analyses?.length
      ? h('button', {
          type: 'button',
          class: 'ndi-panel__why',
          text: 'why is this here?',
          onclick: () => onMethodology(analyses[0]),
        })
      : null,
  ]);
}

/* ------------------------------------------------------------------ *
 * Per-scene bodies. Each takes (intelligence, state) and returns nodes.
 * ------------------------------------------------------------------ */

const BODIES = {
  'case-card'(intel) {
    const shock = intel.seismic.mainShock;
    return [
      figure(shock.magnitude, { unit: 'Mw', label: 'moment magnitude' }),
      rows([
        [
          'Origin',
          new Date(shock.time).toISOString().replace('T', ' ').slice(0, 19) +
            ' UTC',
        ],
        ['Depth', `${shock.depthKm} km`],
        ['Location', shock.place],
        ['Catalogue id', shock.id],
      ]),
      caveat(
        'Magnitude and depth are the current USGS catalogue revision, not the figures reported on the day.',
      ),
    ];
  },

  locate(intel) {
    return [
      figure(intel.seismic.counts.total, {
        label: 'recorded events in the sequence',
      }),
      caveat(
        'District boundaries are the 2015 seventy-five-district frame, reconstructed from the current COD-AB release.',
      ),
    ];
  },

  earthquake(intel) {
    const { counts, magnitude, depth } = intel.seismic;
    return [
      figure(counts.total, { label: 'events recorded' }),
      rows([
        ['Main shock', `M${intel.seismic.mainShock.magnitude}`],
        ['Aftershocks', counts.aftershocks],
        [
          'Largest aftershock',
          `M${intel.seismic.largestEvents[1]?.magnitude ?? '—'}`,
        ],
        ['With depth', depth.withDepth],
        ['Magnitude bands', magnitude.bands.length],
      ]),
      caveat(
        'Complete only above the reporting threshold: a twenty-fold count cliff at M4.0 means smaller aftershocks happened and are not in the catalogue.',
      ),
    ];
  },

  sequence(intel) {
    const omori = intel.seismic.omori;
    const segmented = omori.segmented ?? omori;
    return [
      figure(intel.seismic.counts.aftershocks, { label: 'aftershocks' }),
      rows([
        ['Main shock', '25 Apr 2015 06:11 UTC'],
        ['Largest aftershock', '12 May 2015 07:05 UTC'],
      ]),
      caveat(
        'The decay curve is a fitted model, not a measurement of the earth. The 12 May M7.3 restarted the sequence, so a single-window fit describes neither half well.',
      ),
      segmented
        ? h('p', { class: 'ndi-panel__note', text: describeOmori(segmented) })
        : null,
    ];
  },

  shaking(intel, state) {
    const threshold =
      state?.controls?.intensityThreshold ?? intel.exposure.headlineThreshold;
    const row = intel.exposure.thresholdCurve.find(
      (entry) => entry.threshold === threshold,
    );
    return [
      figure(row?.exposedPopulationRounded ?? '—', {
        label: `people inside MMI ${row?.roman ?? threshold} or greater`,
      }),
      rows([
        ['Usable contour levels', intel.exposure.usableLevels.join(', ')],
        ['Excluded', 'MMI 3, 3.5, 4 — contours run off the model grid'],
      ]),
      caveat(
        'The ShakeMap is a model constrained by very few instruments, not a measurement grid. Intensity between stations is interpolated.',
      ),
    ];
  },

  exposure(intel, state) {
    const threshold =
      state?.controls?.intensityThreshold ?? intel.exposure.headlineThreshold;
    const statement = intel.exposure.statementFor(threshold);
    return [
      h('p', { class: 'ndi-panel__statement', text: statement ?? '—' }),
      rows(
        intel.exposure.thresholdCurve
          .filter((entry) => [6, 7, 8].includes(entry.threshold))
          .map((entry) => [
            `MMI ${entry.roman}+`,
            entry.exposedPopulationRounded,
          ]),
      ),
      caveat(
        'EXPOSURE IS NOT HARM. It counts people whose modelled cell falls inside a contour. It says nothing about injury, damage or displacement.',
      ),
    ];
  },

  /**
   * Scene 06. The figures are CELL-level; the map is DISTRICT-level.
   *
   * Both are in the artefact and both are wanted: the quadrant counts are the
   * finding, and 75 polygons are the only way to see the shape of it on a
   * globe. So the panel says which resolution each belongs to. An earlier
   * version led with "4 quadrants classified", which is a count of the
   * analysis rather than a result of it, and left the reader to assume the map
   * and the numbers were the same thing.
   */
  overlap(intel, state) {
    const quadrants = intel.exposure.quadrants;
    const byId = new Map(
      (quadrants.quadrants ?? []).map((entry) => [entry.id, entry]),
    );
    const both = byId.get('HIGH_INTENSITY_HIGH_DENSITY');
    const remote = byId.get('HIGH_INTENSITY_LOW_DENSITY');
    const parameters = quadrants.parameters ?? {};
    /* The quadrant control chooses which one the panel leads with. */
    const chosen = state?.controls?.quadrant
      ? byId.get(state.controls.quadrant)
      : null;
    const lead = chosen ?? both;
    return [
      figure(lead?.people, {
        label: chosen
          ? `people in ${chosen.label.toLowerCase()} cells`
          : 'people in cells that were both strongly shaken and densely settled',
      }),
      chosen ? statement(chosen.meaning) : null,
      rows([
        [
          'High shaking, high density',
          `${both?.people?.toLocaleString('en-GB')} (${both?.shareOfPopulationPercent}%)`,
        ],
        [
          'High shaking, low density',
          `${remote?.people?.toLocaleString('en-GB')} (${remote?.shareOfPopulationPercent}%)`,
        ],
        ['Intensity split', `MMI ${parameters.intensityThreshold}`],
        [
          'Density split',
          `${parameters.densityCutPeoplePerCell} people per cell (${parameters.densityQuantile ? `${parameters.densityQuantile * 100}th percentile` : 'quantile'} of populated cells)`,
        ],
      ]),
      statement(
        `${remote?.people?.toLocaleString('en-GB')} people met the same shaking on the thinnest ground — small absolute numbers, and often the hardest to reach.`,
      ),
      caveat(
        'The figures above count ~1 km population cells. The map colours the 75 districts by their highest modelled intensity and the share of their people inside the headline contour, which is a coarser view of the same question — district aggregation hides variation inside a district.',
      ),
    ];
  },

  descend(intel, state) {
    const district = state?.selection?.district;
    const row = intel.damage.byDistrict.find(
      (entry) => entry.district === district,
    );
    return [
      figure(row?.count ?? 0, {
        label: `observed damage points in ${district ?? '—'}`,
      }),
      rows(
        Object.entries(row?.counts ?? {}).map(([klass, count]) => [
          klass,
          count,
        ]),
      ),
      caveat(
        'Nine of seventy-five districts carry any damage observation. A district with none was not examined at this resolution.',
      ),
    ];
  },

  'observed-damage'(intel) {
    const shares = intel.damage.composition.shares;
    return [
      figure(intel.damage.reproduction.total, {
        label: 'observed damage points',
      }),
      rows(
        intel.damage.classOrder
          .slice()
          .reverse()
          .map((klass) => [
            klass,
            `${intel.damage.reproduction.observed[klass]}   ${shares[klass]}%`,
          ]),
      ),
      caveat(
        'NO DENOMINATOR. Only damaged structures are recorded and no examined-area footprint is published, so no damage rate can be computed from this source.',
      ),
    ];
  },

  'model-vs-observed'(intel) {
    const test = intel.damage.byIntensity.independenceTest;
    const within = intel.damage.byIntensity.withinAnalysisArea ?? [];
    return [
      figure(test.cramersV.toFixed(3), {
        label: "Cramér's V — a small effect",
      }),
      rows([
        ['χ²', test.statistic.toFixed(1)],
        ['df', test.df],
        [
          'p',
          test.p < 1e-10 ? `${test.p.toExponential(1)}` : test.p.toFixed(4),
        ],
        ["Cochran's rule", test.cochranSatisfied ? 'holds' : 'does NOT hold'],
      ]),
      h('p', {
        class: 'ndi-panel__statement',
        text: intel.damage.byIntensity.withinAreaVerdict,
      }),
      h(
        'dl',
        { class: 'ndi-panel__rows' },
        within.flatMap((area) => [
          h('dt', { text: area.area }),
          h('dd', {
            text: area.bands
              .map((band) => `MMI ${band.mmi}: ${band.destroyedSharePercent}%`)
              .join('  →  '),
          }),
        ]),
      ),
      caveat(
        'With 4,583 observations a trivial departure from independence is significant. Observation counts per band measure satellite tasking, not damage.',
      ),
    ];
  },

  'second-source'(intel) {
    const dose = intel.damage.copernicus.doseResponse;
    return [
      figure(intel.damage.copernicus.totals.graded, {
        label: 'structures graded, including undamaged',
      }),
      rows(
        dose.bands.map((band) => [
          `MMI ${band.mmi}`,
          `${band.destroyedRatePercent}%  (${band.destroyed} of ${band.structuresGraded})`,
        ]),
      ),
      caveat(dose.confound),
    ];
  },

  infrastructure(intel, state) {
    const geometry = intel.infrastructure.geometry;
    const tolerance = state?.controls?.associationTolerance ?? 50;
    const point = intel.infrastructure.association.roadToLandslide.curve.find(
      (entry) => entry.toleranceMetres === tolerance,
    );
    return [
      figure(geometry.blockedRoads.features, {
        label: 'blocked-road observations',
      }),
      rows([
        ['Total line geometry', `${geometry.blockedRoads.totalLengthKm} km`],
        [
          'Median feature length',
          `${geometry.blockedRoads.lengthMetres.median} m`,
        ],
        ['Bridges out', intel.infrastructure.bridges.length],
        [
          'Landslides',
          `${geometry.landslides.features} (${geometry.landslides.totalAreaHectares} ha)`,
        ],
        [
          `Associated within ${tolerance} m`,
          `${point?.features ?? '—'} (${point?.featureShare ?? '—'}%)`,
        ],
      ]),
      caveat(
        'A blocked-road feature is a short obstruction marker, not the extent of a closed route. Spatially associated with, never caused by.',
      ),
    ];
  },

  'coverage-gap'(intel) {
    const damageByDistrict = new Map(
      intel.damage.byDistrict.map((entry) => [entry.district, entry.count]),
    );
    const roads =
      intel.infrastructure.distribution.blockedRoads.byDistrict.slice(0, 5);
    return [
      h('p', {
        class: 'ndi-panel__statement',
        text: 'OBSERVATION COVERAGE IS NOT REAL-WORLD ABSENCE',
      }),
      h(
        'dl',
        { class: 'ndi-panel__rows' },
        roads.flatMap((row) => [
          h('dt', { text: row.id }),
          h('dd', {
            text: `${row.count} blocked roads · ${damageByDistrict.get(row.id) ?? 0} damage points`,
          }),
        ]),
      ),
      caveat(
        'Sindhupalchok carries the most observed road blockage and the largest mapped landslide area, and not one damage point. The two product families were tasked over different places.',
      ),
    ];
  },

  network(intel) {
    const network = intel.infrastructure.network;
    const beneath = network.blockageMatching.whatTheBlockagesSitOn;
    return [
      figure(network.baseline.ways, { label: 'ways mapped on 24 April 2015' }),
      rows([
        ['Nodes', network.baseline.nodes],
        ['Components', network.baseline.components],
        ['On a strategic road', beneath.onStrategicClassRoad],
        ['On a road below tertiary', beneath.onRoadBelowTertiary],
        ['On no mapped road', beneath.noMappedRoadWithinQueryBox],
        ['Mapping growth since', `${network.baseline.mappingGrowthSince2015}×`],
      ]),
      caveat(
        'SCENARIO. The blockages are observed; the network, the edge attachment and the assumption that a marker closes its whole edge are constructed here.',
      ),
    ];
  },

  route(intel) {
    const routes = intel.infrastructure.network.routes;
    return [
      figure(routes.outcomes.DETOUR ?? 0, { label: 'pairs detoured' }),
      rows([
        ['Unchanged', routes.outcomes.UNCHANGED ?? 0],
        ['Severed', routes.outcomes.SEVERED ?? 0],
        [
          'Unroutable on the 2015 map',
          routes.outcomes.NOT_ROUTABLE_BASELINE ?? 0,
        ],
        ['Longest detour', `${routes.detourExtraKm.maxExtraKm ?? '—'} km`],
      ]),
      caveat(routes.travelTimeNote),
    ];
  },

  'people-and-damage'(intel, state) {
    const band = state?.controls?.proximityBand ?? 500;
    const row = intel.people.proximity.rounded.find(
      (entry) => entry.withinMetres === band,
    );
    return [
      figure(row?.rounded ?? '—', {
        label: `people within ${band} m of observed damage`,
      }),
      rows(
        intel.people.proximity.rounded.map((entry) => [
          `within ${entry.withinMetres} m`,
          entry.rounded,
        ]),
      ),
      caveat(
        'Population within a stated distance of an observed damage point. Not homes lost, not displacement, not harm — this project holds no source for any of those.',
      ),
    ];
  },

  /**
   * Scene 16. The chosen clock is what the panel leads with.
   *
   * Four dates describe the same damage point and they mean different
   * things; the control picks which one the reader is being asked to hold in
   * mind, and the artefact's own wording for it comes with it.
   */
  'four-clocks'(intel, state) {
    const lags = intel.damage.timeline.lags;
    const clocks = intel.damage.timeline.clocks ?? [];
    const chosen =
      clocks.find((entry) => entry.id === state?.controls?.clock) ?? clocks[0];
    return [
      chosen ? statement(`${chosen.label} — ${chosen.meaning}`) : null,
      figure(lags.eventToAcquisition?.median ?? '—', {
        unit: 'days',
        label: 'median from earthquake to first imagery',
      }),
      rows([
        [
          'Imagery → mapping',
          `${lags.acquisitionToProduction?.median ?? '—'} days`,
        ],
        [
          'Mapping → publication',
          `${lags.productionToPublication?.median ?? '—'} days`,
        ],
        [
          'Earthquake → publication',
          `${lags.eventToPublication?.median ?? '—'} days`,
        ],
      ]),
      caveat(intel.damage.timeline.animationWarning),
    ];
  },

  'data-quality'(intel) {
    return [
      figure(intel.methodology.length, {
        label: 'methodology records behind these figures',
      }),
      h(
        'dl',
        { class: 'ndi-panel__rows' },
        Object.values(RESULT_CLASS_PRESENTATION).flatMap((entry) => [
          h('dt', {}, [classChip(entry.id)]),
          h('dd', { text: entry.means }),
        ]),
      ),
      h(
        'ul',
        { class: 'ndi-panel__gaps' },
        intel.infrastructure.dataGaps.map((gap) =>
          h('li', {}, [
            h('span', { class: 'ndi-panel__gap-name', text: gap.gap }),
            h('span', {
              class: 'ndi-panel__gap-fill',
              text: gap.couldBeFilledBy,
            }),
          ]),
        ),
      ),
    ];
  },

  scenarios(intel) {
    return [
      figure(intel.infrastructure.network.baseline.nodes, {
        label: 'junctions available to route over',
      }),
      caveat(
        'No evacuation plan, no rescue priority, no arrival time, no casualty projection. The datasets that would support them are not held, and constructing them would be invention.',
      ),
    ];
  },
};

function describeOmori(segmented) {
  const p = segmented.p ?? segmented.pValue;
  const r2 = segmented.rSquared ?? segmented.r2;
  if (p === undefined)
    return 'Omori decay fitted in segments around the 12 May aftershock.';
  return `Before 12 May the decay fits p = ${Number(p).toFixed(3)}${
    r2 === undefined ? '' : `, R² = ${Number(r2).toFixed(2)}`
  }.`;
}

/**
 * Build the panel for the current scene.
 *
 * A scene with no builder yet renders its question and its limitations rather
 * than nothing: an unbuilt panel should read as "not yet", not as an error, and
 * the limitations are real content that exists from the moment the scene does.
 */
export function renderIntelPanel({
  intelligence,
  state,
  onMethodology = () => {},
}) {
  const entry = state?.scene;
  if (!entry)
    return h('aside', { class: 'ndi-panel' }, [
      h('p', { text: 'No scene selected.' }),
    ]);

  const build = BODIES[entry.id];
  let body;
  try {
    body = build ? build(intelligence, state) : null;
  } catch (error) {
    /*
     * A panel that throws must not take the application with it. It reports
     * which figure it could not resolve, which is a far more useful failure
     * than a blank column.
     */
    body = [
      h('p', {
        class: 'ndi-panel__error',
        text: `This panel could not resolve a figure: ${error.message}`,
      }),
    ];
  }

  return h(
    'aside',
    { class: 'ndi-panel', 'aria-label': `${entry.title} intelligence` },
    [
      h('header', { class: 'ndi-panel__head' }, [
        h('h2', { class: 'ndi-panel__title', text: entry.title.toUpperCase() }),
        h('p', { class: 'ndi-panel__question', text: entry.question }),
      ]),
      h(
        'div',
        { class: 'ndi-panel__body' },
        body ?? [
          h('p', {
            class: 'ndi-panel__pending',
            text: 'This scene is not yet built.',
          }),
        ],
      ),
      h(
        'ul',
        { class: 'ndi-panel__limits' },
        entry.limitations.map((text) => h('li', { text })),
      ),
      footer({
        resultClasses: entry.resultClasses,
        sources: entry.datasets,
        analyses: entry.analyses,
        onMethodology,
      }),
    ],
  );
}

export { BODIES as PANEL_BODIES };
