/**
 * The nineteen scenes, as data.
 *
 * Pure and declarative on purpose. A scene says what it needs — which
 * datasets, which analyses, which layers, where the camera goes, what question
 * it answers — and the runtime decides when to load and how to draw. Three
 * things follow from that, and all three are why this is a data file rather
 * than nineteen modules:
 *
 *   THE WHOLE SEQUENCE IS TESTABLE WITHOUT CESIUM. Every dataset id resolves,
 *   every analysis id matches a real methodology record, every scene has a
 *   question and a result class, and no user-facing string trips the
 *   forbidden-phrasing rule. That is a test run, not a review.
 *
 *   ADDING A SCENE NEEDS NO NEW MODULE. The same reason `hazards.js` made
 *   hazard types data.
 *
 *   THE STORY IS READABLE IN ONE PLACE. The argument this product makes is the
 *   ORDER of these scenes, and an argument spread across nineteen files cannot
 *   be reviewed.
 *
 * `heavy` marks a dataset whose geometry is large enough to matter for frame
 * rate. No scene may declare more than three; the validator enforces it,
 * because the ceiling in Cesium is primitive count rather than payload.
 */

import { ResultClass } from './resultClass.js';
import { PROCESSED_ARTEFACTS } from './artefacts.js';

/** Datasets whose geometry is large enough to constrain what else can be drawn. */
export const HEAVY_DATASETS = Object.freeze([
  'population',
  'unosat',
  'copernicus',
  'osmRoads',
  'districts',
]);

export const MAX_HEAVY_PER_SCENE = 3;

/** The three acts, matching the existing investigation chapters. */
export const ACTS = Object.freeze([
  Object.freeze({
    id: 'I',
    name: 'What happened',
    question: 'What was the event, where, and how big?',
  }),
  Object.freeze({
    id: 'II',
    name: 'What it met',
    question: 'Who was under it, what broke, and what did we actually see?',
  }),
  Object.freeze({
    id: 'III',
    name: 'What we know',
    question: 'How firm is any of this, and what follows?',
  }),
]);

/**
 * The scenes.
 *
 * `camera.target` is a named anchor rather than a coordinate pair so the
 * choreography can be read as a descent. The runtime resolves names to
 * positions from the artefacts — the epicentre is wherever USGS put it, not
 * wherever someone once typed it.
 */
export const SCENES = Object.freeze([
  Object.freeze({
    id: 'case-card',
    index: 0,
    act: 'I',
    title: 'Case 001',
    question: 'What am I about to investigate?',
    purpose:
      'Introduce the case to someone who knows nothing about it, without showing them a map yet.',
    datasets: Object.freeze([]),
    analyses: Object.freeze([]),
    layers: Object.freeze([]),
    camera: Object.freeze({
      altKm: 20000,
      pitch: -90,
      target: 'globe',
      durationSec: 0,
    }),
    resultClasses: Object.freeze([ResultClass.OBSERVED]),
    limitations: Object.freeze([
      'Magnitude and depth are the current USGS catalogue revision, not what was reported on the day.',
    ]),
  }),
  Object.freeze({
    id: 'locate',
    index: 1,
    act: 'I',
    title: 'Locate',
    question: 'Where on Earth did this happen?',
    purpose: 'Orientation. Draw Nepal, mark the epicentre, show nothing else.',
    datasets: Object.freeze(['districts']),
    analyses: Object.freeze([]),
    layers: Object.freeze(['nepal-outline', 'epicentre']),
    camera: Object.freeze({
      altKm: 1200,
      pitch: -90,
      target: 'nepal',
      durationSec: 4.5,
    }),
    resultClasses: Object.freeze([ResultClass.OBSERVED, ResultClass.OFFICIAL]),
    limitations: Object.freeze([
      'Boundaries are the reconstructed 2015 seventy-five-district frame, not a 2015 publication.',
    ]),
  }),
  Object.freeze({
    id: 'earthquake',
    index: 2,
    act: 'I',
    title: 'The earthquake',
    question: 'Was this one earthquake, or many?',
    purpose: 'Turn a single point into a sequence of 316 recorded events.',
    datasets: Object.freeze(['seismicEvents']),
    analyses: Object.freeze([
      'seismic-magnitude-distribution',
      'seismic-depth-distribution',
      'seismic-spatial-distribution',
    ]),
    layers: Object.freeze(['seismic-events']),
    camera: Object.freeze({
      altKm: 1200,
      pitch: -90,
      target: 'epicentre',
      durationSec: 2,
    }),
    resultClasses: Object.freeze([
      ResultClass.OBSERVED,
      ResultClass.DESCRIPTIVE_STATISTIC,
    ]),
    limitations: Object.freeze([
      'The catalogue is complete only above the reporting threshold; a twenty-fold count cliff at M4.0 means smaller aftershocks happened and are absent.',
    ]),
  }),
  Object.freeze({
    id: 'sequence',
    index: 3,
    act: 'I',
    title: 'The sequence',
    question: 'How did the sequence unfold over time?',
    purpose:
      'Make time a control that drives the map, not a caption beside it.',
    datasets: Object.freeze(['seismicEvents']),
    analyses: Object.freeze(['seismic-temporal-series', 'seismic-omori-decay']),
    layers: Object.freeze(['seismic-events']),
    /*
     * The decay curve is a CHART below the map, not a layer on it. It was in
     * `layers` and nothing drew it, which would have offered the user a layer
     * toggle for something the globe has no way to show.
     */
    charts: Object.freeze(['seismic-decay']),
    camera: Object.freeze({
      altKm: 1200,
      pitch: -75,
      target: 'epicentre',
      durationSec: 2,
    }),
    controls: Object.freeze(['timeline']),
    resultClasses: Object.freeze([ResultClass.OBSERVED, ResultClass.MODEL_FIT]),
    limitations: Object.freeze([
      'The decay curve is a fitted model, not a measurement of the earth, and it changes with the window fitted: the M7.3 on 12 May restarted the sequence.',
    ]),
  }),

  /* ---------------- ACT II ---------------- */

  Object.freeze({
    id: 'shaking',
    index: 4,
    act: 'II',
    title: 'Shaking',
    question: 'How hard did the ground shake, and where?',
    purpose:
      'Move from points to a modelled field, drawn so it cannot be mistaken for an observation.',
    datasets: Object.freeze(['shakemap']),
    analyses: Object.freeze(['exposure-population-by-intensity']),
    layers: Object.freeze(['shakemap-bands']),
    camera: Object.freeze({
      altKm: 900,
      pitch: -70,
      target: 'rupture',
      durationSec: 2.5,
    }),
    controls: Object.freeze(['intensityThreshold']),
    modeled: true,
    resultClasses: Object.freeze([ResultClass.OBSERVED]),
    limitations: Object.freeze([
      'A model constrained by very few instruments, not a measurement grid.',
      'MMI 3, 3.5 and 4 are excluded entirely: their contours run off the model grid and cannot be closed.',
    ]),
  }),
  Object.freeze({
    id: 'exposure',
    index: 5,
    act: 'II',
    title: 'Who was under it',
    question: 'How many people were inside each level of modelled shaking?',
    purpose:
      'Put a modelled population under a modelled field and let the threshold be the control.',
    datasets: Object.freeze(['shakemap', 'population']),
    analyses: Object.freeze([
      'exposure-population-by-intensity',
      'exposure-threshold-sensitivity',
    ]),
    layers: Object.freeze(['shakemap-bands', 'population-density']),
    camera: Object.freeze({
      altKm: 900,
      pitch: -55,
      target: 'rupture',
      durationSec: 2,
    }),
    controls: Object.freeze(['intensityThreshold']),
    modeled: true,
    resultClasses: Object.freeze([ResultClass.DERIVED]),
    limitations: Object.freeze([
      'EXPOSURE IS NOT HARM. It counts people inside a contour; it says nothing about injury or damage.',
      'Population is a modelled 2015 residential surface, not a record of where anyone was on a Saturday morning.',
    ]),
  }),
  Object.freeze({
    id: 'overlap',
    index: 6,
    act: 'II',
    title: 'Where they overlap',
    question: 'Where did many people and strong shaking coincide?',
    purpose: 'Stop showing two maps and start showing one relationship.',
    datasets: Object.freeze(['districts']),
    analyses: Object.freeze(['exposure-by-district']),
    layers: Object.freeze(['district-bivariate']),
    camera: Object.freeze({
      altKm: 900,
      pitch: -90,
      target: 'nepal',
      durationSec: 1.8,
    }),
    controls: Object.freeze(['quadrant']),
    resultClasses: Object.freeze([ResultClass.DERIVED]),
    limitations: Object.freeze([
      'District aggregation hides variation inside a district; the quadrant thresholds are stated and adjustable.',
    ]),
  }),
  Object.freeze({
    id: 'descend',
    index: 7,
    act: 'II',
    title: 'Descend',
    question: 'What happened in one place?',
    purpose:
      'The moment the experience becomes investigative rather than descriptive.',
    datasets: Object.freeze(['districts']),
    analyses: Object.freeze(['exposure-by-district', 'damage-unosat-counts']),
    layers: Object.freeze(['district-focus']),
    camera: Object.freeze({
      altKm: 25,
      pitch: -55,
      target: 'district',
      durationSec: 5,
    }),
    controls: Object.freeze(['districtPicker']),
    defaultSelection: Object.freeze({ district: 'Gorkha' }),
    resultClasses: Object.freeze([ResultClass.OBSERVED, ResultClass.DERIVED]),
    limitations: Object.freeze([
      'Only nine of seventy-five districts carry any damage observation; the picker says so rather than hiding the other sixty-six.',
    ]),
  }),
  Object.freeze({
    id: 'observed-damage',
    index: 8,
    act: 'II',
    title: 'Observed damage',
    question: 'What did satellites actually see?',
    purpose:
      'Introduce observation as a different kind of thing from a model. Numbers before dots.',
    datasets: Object.freeze(['unosat']),
    analyses: Object.freeze([
      'damage-unosat-counts',
      'damage-severity-index',
      'damage-spatial-concentration',
    ]),
    layers: Object.freeze(['damage-points']),
    camera: Object.freeze({
      altKm: 25,
      pitch: -50,
      target: 'damage-centroid',
      durationSec: 1.5,
    }),
    controls: Object.freeze(['damageClass']),
    resultClasses: Object.freeze([
      ResultClass.OBSERVED,
      ResultClass.DESCRIPTIVE_STATISTIC,
    ]),
    limitations: Object.freeze([
      'NO DENOMINATOR. Only damaged structures are recorded and no examined-area footprint is published, so no damage rate can be computed from this source.',
      'These are remote-sensing interpretations; every record reads "Not yet field validated".',
    ]),
  }),
  Object.freeze({
    id: 'model-vs-observed',
    index: 9,
    act: 'II',
    title: 'Model versus observation',
    question:
      'Does observed damage get worse where the model says shaking was stronger?',
    purpose:
      'The analytical centrepiece. The map looks correlated; the data is more complicated, and the reveal is staged so the reader reaches that for themselves.',
    datasets: Object.freeze(['unosat', 'shakemap']),
    analyses: Object.freeze(['damage-by-intensity']),
    layers: Object.freeze(['shakemap-bands', 'damage-points']),
    camera: Object.freeze({
      altKm: 25,
      pitch: -45,
      target: 'straddling-areas',
      durationSec: 3,
    }),
    beats: Object.freeze([
      Object.freeze({
        id: 'looks-correlated',
        holdSec: 6,
        panel: 'lookAtTheMap',
      }),
      Object.freeze({ id: 'the-statistics', holdSec: 8, panel: 'chiSquare' }),
      Object.freeze({
        id: 'the-reversal',
        holdSec: 12,
        panel: 'withinArea',
        mapAction: 'isolateAreas',
      }),
    ]),
    modeled: true,
    resultClasses: Object.freeze([ResultClass.DERIVED]),
    limitations: Object.freeze([
      'Observation counts per band measure satellite tasking, not damage. Only composition within a band is read.',
      'CORRELATION IS NOT CAUSATION, and here it is not even a clean correlation: each band contains different towns.',
      'With 4,583 observations a trivial departure from independence is significant; the effect size is the figure to read.',
    ]),
  }),
  Object.freeze({
    id: 'second-source',
    index: 10,
    act: 'II',
    title: 'A second observation system',
    question:
      'What does a source with a denominator tell us that UNOSAT cannot?',
    purpose:
      'Show that "damage data" is not one thing, and why a rate and a count answer different questions.',
    datasets: Object.freeze(['copernicus']),
    analyses: Object.freeze([
      'damage-copernicus-dose-response',
      'damage-cross-source',
    ]),
    layers: Object.freeze(['copernicus-points', 'aoi-footprints']),
    camera: Object.freeze({
      altKm: 18,
      pitch: -55,
      target: 'aoi-pair',
      durationSec: 2.5,
    }),
    resultClasses: Object.freeze([ResultClass.OBSERVED, ResultClass.DERIVED]),
    limitations: Object.freeze([
      'The vocabularies are NOT interchangeable: Copernicus published only EMS-98 grades 1 and 5 for this activation, with nothing between them.',
      'No area of interest spans two intensity bands, so intensity band and town are the same variable in the dose-response.',
      'Seven towns are not Nepal, and they were graded because damage was expected.',
    ]),
  }),
  Object.freeze({
    id: 'infrastructure',
    index: 11,
    act: 'II',
    title: 'Infrastructure',
    question: 'What infrastructure was observed damaged?',
    purpose:
      'Move from buildings to the things that connect them, and measure the features before describing them.',
    datasets: Object.freeze(['nga']),
    analyses: Object.freeze([
      'infrastructure-geometry-check',
      'infrastructure-road-landslide-association',
    ]),
    layers: Object.freeze(['blocked-roads', 'bridges-out', 'landslides']),
    camera: Object.freeze({
      altKm: 60,
      pitch: -60,
      target: 'infrastructure-extent',
      durationSec: 2.5,
    }),
    controls: Object.freeze(['layerToggles', 'associationTolerance']),
    resultClasses: Object.freeze([ResultClass.OBSERVED, ResultClass.DERIVED]),
    limitations: Object.freeze([
      'A blocked-road feature is a short obstruction marker, not the extent of a closed route.',
      'SPATIALLY ASSOCIATED WITH, never caused by: neither product links a blockage to a slide.',
      'Absence of a reported blockage is not evidence a road was open.',
    ]),
  }),
  Object.freeze({
    id: 'coverage-gap',
    index: 12,
    act: 'II',
    title: 'The coverage gap',
    question: 'Does "no damage recorded" mean "no damage"?',
    purpose:
      'The strongest teaching moment in the product: Sindhupalchok has the most observed road blockage and not one damage point.',
    datasets: Object.freeze(['districts', 'nga']),
    analyses: Object.freeze([
      'damage-unosat-counts',
      'infrastructure-geometry-check',
    ]),
    layers: Object.freeze(['coverage-gap', 'blocked-roads']),
    camera: Object.freeze({
      altKm: 400,
      pitch: -80,
      target: 'coverage-contrast',
      durationSec: 3.5,
    }),
    controls: Object.freeze(['coverageToggle']),
    defaultSelection: Object.freeze({ district: 'Sindhupalchok' }),
    resultClasses: Object.freeze([ResultClass.DERIVED, ResultClass.DATA_GAP]),
    limitations: Object.freeze([
      'This scene is about the datasets, not about Nepal: a district with no observation was not examined at this resolution.',
    ]),
  }),
  Object.freeze({
    id: 'network',
    index: 13,
    act: 'II',
    title: 'The network',
    question: 'What did the observed blockages do to connectivity?',
    purpose:
      'Turn damage into consequence on the road network as it was mapped the day before the earthquake.',
    datasets: Object.freeze(['osmRoads', 'nga', 'blockageContext']),
    analyses: Object.freeze(['infrastructure-network-disruption']),
    layers: Object.freeze(['road-network', 'blocked-roads']),
    camera: Object.freeze({
      altKm: 400,
      pitch: -75,
      target: 'network-extent',
      durationSec: 2.5,
    }),
    controls: Object.freeze(['ghostNetwork']),
    resultClasses: Object.freeze([ResultClass.SCENARIO]),
    limitations: Object.freeze([
      'SCENARIO, not observation: the blockages are observed, the network and the edge attachment are constructed.',
      'Strategic road classes only. Most of the observed disruption was on roads this network cannot represent.',
      'OpenStreetMap held 3.36 times fewer ways in April 2015 than today, so an unroutable destination may be a mapping gap.',
    ]),
  }),
  Object.freeze({
    id: 'route',
    index: 14,
    act: 'II',
    title: 'A route',
    question: 'What happens to one journey?',
    purpose:
      'Make the abstraction personal: two paths, one baseline and one under the blockages.',
    datasets: Object.freeze(['osmRoads']),
    analyses: Object.freeze(['infrastructure-network-disruption']),
    layers: Object.freeze(['road-network', 'route-baseline', 'route-damaged']),
    camera: Object.freeze({
      altKm: 200,
      pitch: -60,
      target: 'route',
      durationSec: 2.5,
    }),
    controls: Object.freeze(['originDestination']),
    resultClasses: Object.freeze([ResultClass.SCENARIO]),
    limitations: Object.freeze([
      'NO TRAVEL TIME. No road speed or condition dataset for April 2015 exists in any source held.',
      'A pair that could not be routed before the blockages is a coverage gap, never a severance.',
    ]),
  }),
  Object.freeze({
    id: 'people-and-damage',
    index: 15,
    act: 'II',
    title: 'People and damage',
    question: 'How many people lived near what was observed?',
    purpose:
      'Bring population back, precisely, with the distance stated in the label.',
    datasets: Object.freeze(['unosat', 'population']),
    analyses: Object.freeze([
      'damage-population-proximity',
      'damage-population-concentration',
    ]),
    layers: Object.freeze(['damage-points', 'proximity-rings']),
    camera: Object.freeze({
      altKm: 80,
      pitch: -55,
      target: 'damage-centroid',
      durationSec: 2.5,
    }),
    controls: Object.freeze(['proximityBand']),
    resultClasses: Object.freeze([ResultClass.DERIVED]),
    limitations: Object.freeze([
      'The label is population within a stated distance of an observed damage point. Nothing about homes lost, displacement or harm.',
      'Neither endpoint is a person: it is a modelled cell centre and a digitised structure.',
    ]),
  }),
  Object.freeze({
    id: 'four-clocks',
    index: 16,
    act: 'II',
    title: 'Four clocks',
    question: 'When was any of this actually seen?',
    purpose:
      'Show that observation has its own timeline, separate from the earthquake.',
    datasets: Object.freeze([]),
    analyses: Object.freeze(['damage-observation-timeline']),
    layers: Object.freeze(['damage-points']),
    camera: Object.freeze({
      altKm: 400,
      pitch: -90,
      target: 'nepal',
      durationSec: 2,
    }),
    controls: Object.freeze(['clock']),
    resultClasses: Object.freeze([ResultClass.OBSERVED]),
    limitations: Object.freeze([
      'NONE OF THESE CLOCKS RECORDS WHEN DAMAGE OCCURRED. Cloud cover and revisit intervals drive the sequence.',
      'UNOSAT publishes no production or publication date, so its mapping lag cannot be measured at all.',
    ]),
  }),

  /* ---------------- ACT III ---------------- */

  Object.freeze({
    id: 'data-quality',
    index: 17,
    act: 'III',
    title: 'Intelligence quality',
    question: 'How firmly is any of this known, and what is missing?',
    purpose:
      'Promote the epistemics to a view. Ticking only OBSERVED dims everything constructed, in one gesture.',
    datasets: Object.freeze([]),
    analyses: Object.freeze([
      'damage-cross-source',
      'exposure-ocha-comparison',
    ]),
    layers: Object.freeze([]),
    camera: Object.freeze({
      altKm: 900,
      pitch: -90,
      target: 'nepal',
      durationSec: 3,
    }),
    controls: Object.freeze(['resultClassFilter']),
    resultClasses: Object.freeze([
      ResultClass.DATA_GAP,
      ResultClass.DESCRIPTIVE_STATISTIC,
    ]),
    limitations: Object.freeze([
      'This scene is the limitation section, promoted to a first-class view.',
    ]),
  }),
  Object.freeze({
    id: 'scenarios',
    index: 18,
    act: 'III',
    title: 'Scenarios',
    question: 'What can be explored without inventing data?',
    purpose:
      'Response exploration, fenced: only what an existing validated engine can re-run over observed inputs.',
    datasets: Object.freeze(['osmRoads']),
    analyses: Object.freeze(['infrastructure-network-disruption']),
    layers: Object.freeze(['road-network', 'route-damaged']),
    camera: Object.freeze({
      altKm: 300,
      pitch: -65,
      target: 'network-extent',
      durationSec: 2.5,
    }),
    controls: Object.freeze([
      'originDestination',
      'bridgeToggle',
      'intensityThreshold',
    ]),
    resultClasses: Object.freeze([ResultClass.SCENARIO]),
    limitations: Object.freeze([
      'No evacuation plan, no rescue priority, no arrival time, no casualty projection. The datasets that would support them are not held.',
    ]),
  }),
]);

/** A scene by id or by index. Returns null rather than throwing on a miss. */
export function scene(idOrIndex) {
  if (typeof idOrIndex === 'number') {
    return SCENES.find((entry) => entry.index === idOrIndex) ?? null;
  }
  return SCENES.find((entry) => entry.id === idOrIndex) ?? null;
}

/** The scenes of one act, in order. */
export function scenesInAct(actId) {
  return SCENES.filter((entry) => entry.act === actId);
}

/**
 * Every map layer the renderer knows how to draw.
 *
 * This exists so a scene cannot declare a layer that silently draws nothing.
 * That failure has no error and no symptom: the scene loads, the panel reads
 * correctly, and the map is simply missing the thing the scene is about.
 * `validateScenes` checks every declared layer against this list.
 */
export const MAP_LAYERS = Object.freeze([
  'epicentre',
  'nepal-outline',
  'seismic-events',
  'shakemap-bands',
  'population-density',
  'district-bivariate',
  'district-focus',
  'damage-points',
  'copernicus-points',
  'aoi-footprints',
  'blocked-roads',
  'bridges-out',
  'landslides',
  'coverage-gap',
  'road-network',
  'route-baseline',
  'route-damaged',
  'proximity-rings',
]);

/** Datasets a scene needs, plus the next scene's, for prefetching. */
export function datasetsToWarm(index, { lookahead = 1 } = {}) {
  const wanted = new Set();
  for (let i = index; i <= index + lookahead; i += 1) {
    for (const dataset of scene(i)?.datasets ?? []) wanted.add(dataset);
  }
  return [...wanted];
}

/** Heavy datasets a scene declares. */
export function heavyDatasetsOf(entry) {
  return (entry?.datasets ?? []).filter((id) => HEAVY_DATASETS.includes(id));
}

/**
 * Check the whole sequence.
 *
 * Returns problems rather than throwing, so a test can report all of them at
 * once instead of stopping at the first. Everything here is a wiring error
 * that would otherwise appear as a blank panel or a stalled frame rate.
 *
 * @param {object} [context]
 * @param {Set<string>|string[]} [context.knownAnalyses] methodology ids
 * @param {(text:string)=>Array} [context.findForbidden] phrasing checker
 */
export function validateScenes({
  knownAnalyses = null,
  findForbidden = null,
} = {}) {
  const problems = [];
  const analyses = knownAnalyses ? new Set(knownAnalyses) : null;
  const seenIds = new Set();
  const seenIndexes = new Set();

  SCENES.forEach((entry, position) => {
    const where = `scene ${entry.index} (${entry.id})`;
    if (seenIds.has(entry.id)) problems.push(`${where}: duplicate id`);
    if (seenIndexes.has(entry.index))
      problems.push(`${where}: duplicate index`);
    seenIds.add(entry.id);
    seenIndexes.add(entry.index);
    if (entry.index !== position) {
      problems.push(
        `${where}: index does not match its position (${position})`,
      );
    }
    if (!ACTS.some((act) => act.id === entry.act)) {
      problems.push(`${where}: unknown act "${entry.act}"`);
    }
    if (!entry.question?.endsWith('?')) {
      problems.push(
        `${where}: has no question. A view that cannot state its question does not ship.`,
      );
    }
    if (!entry.purpose || entry.purpose.length < 20) {
      problems.push(`${where}: has no stated purpose`);
    }
    if (!entry.resultClasses?.length) {
      problems.push(`${where}: declares no result class`);
    } else {
      for (const value of entry.resultClasses) {
        if (!ResultClass[value])
          problems.push(`${where}: unknown result class "${value}"`);
      }
    }
    if (!entry.limitations?.length) {
      problems.push(`${where}: states no limitation`);
    }
    for (const dataset of entry.datasets ?? []) {
      if (!PROCESSED_ARTEFACTS[dataset]) {
        problems.push(`${where}: unknown dataset "${dataset}"`);
      }
    }
    for (const layer of entry.layers ?? []) {
      if (!MAP_LAYERS.includes(layer)) {
        problems.push(
          `${where}: declares layer "${layer}", which is not a map layer. A layer nothing draws fails silently.`,
        );
      }
    }
    if (analyses) {
      for (const id of entry.analyses ?? []) {
        if (!analyses.has(id)) {
          problems.push(
            `${where}: cites analysis "${id}", which no methodology record matches`,
          );
        }
      }
    }
    const heavy = heavyDatasetsOf(entry);
    if (heavy.length > MAX_HEAVY_PER_SCENE) {
      problems.push(
        `${where}: declares ${heavy.length} heavy datasets (${heavy.join(', ')}); the cap is ${MAX_HEAVY_PER_SCENE}`,
      );
    }
    const camera = entry.camera;
    if (!camera || !(camera.altKm > 0))
      problems.push(`${where}: has no camera altitude`);
    else if (camera.pitch > 0 || camera.pitch < -90) {
      problems.push(
        `${where}: camera pitch ${camera.pitch} is not a downward angle`,
      );
    }
    if (findForbidden) {
      const strings = [
        entry.title,
        entry.question,
        entry.purpose,
        ...(entry.limitations ?? []),
      ];
      for (const text of strings) {
        const hits = findForbidden(text).map((rule) => rule.phrase);
        /*
         * A limitation is allowed to NAME a forbidden word in order to forbid
         * it — "never call these affected" is the sentence doing the work.
         * Anything else that trips the rule is a real violation.
         */
        const forbidding = /\bnothing about\b|\bnever\b|\bnot\b/i.test(text);
        if (hits.length > 0 && !forbidding) {
          problems.push(
            `${where}: forbidden phrasing [${hits.join(', ')}] in "${text.slice(0, 60)}"`,
          );
        }
      }
    }
  });

  return Object.freeze({
    ok: problems.length === 0,
    problems: Object.freeze(problems),
  });
}
