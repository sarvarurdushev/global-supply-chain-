/**
 * The Nepal case as a presentation.
 *
 * REUSES THE PACING, NOT A COPY OF IT. `createDemoPlayback` in
 * `disaster/demo.js` already owns play, pause, step, restart, "stepping by
 * hand always pauses", and the injected clock its tests need. Only two things
 * there were specific to the disaster session — how a beat is applied, and how
 * readiness is read — so those are injected from here and everything else is
 * the existing machinery. This module builds the script and says what a beat
 * does; it schedules nothing.
 *
 * A BEAT IS NOT ALWAYS A SCENE. Scene 09 is the centrepiece and it argues in
 * three moves: the map looks correlated, here is the statistic, here is the
 * reversal. Those are three beats over one scene, which is why a beat carries
 * a scene index AND an optional panel emphasis rather than being a scene index
 * alone.
 *
 * TWO LENGTHS. The full run is every scene. SHORT is the argument in the
 * order a university audience needs to hear it — see `SHORT_RUN`.
 */

import { SCENES, scene } from './scenes.js';

/**
 * How long a scene holds when it does not say, per run length.
 *
 * SET FROM THE TARGET RUNTIME, not picked. The design asks for 12–14 minutes
 * full and about 6 short, so the defaults are worked backwards from the beat
 * count: 40 s over 18 plain beats plus scene 09's own 26 s of beats lands at
 * 12.4 minutes, and 48 s over the short run's 7 plain beats lands at 6.0.
 * A first pass used 7 s and produced a 2.5-minute run — a slideshow nobody
 * could read a panel in, which is what happens when a hold is a round number
 * rather than an answer to "how long does this take to say out loud".
 */
export const DEFAULT_HOLD_SEC = Object.freeze({ full: 40, short: 48 });

/**
 * The six-minute run: the ARGUMENT, one scene per step of it.
 *
 * NEPAL → M7.8 EARTHQUAKE → SEISMIC SEQUENCE → SHAKING → POPULATION EXPOSURE
 * → OBSERVED DAMAGE → MODEL VS OBSERVATION → INFRASTRUCTURE → COVERAGE GAP →
 * NETWORK CONSEQUENCE → WHAT THE DATA CAN AND CANNOT TELL US.
 *
 * The Stage 6 short run (00, 02, 04, 05, 09, 12, 15, 17) skipped the
 * sequence, the observed damage, the infrastructure and the network — so the
 * reversal in Scene 09 arrived before the audience had seen a single damage
 * point, and the coverage gap before they had seen what the survey covered.
 * Each step now has the scene that makes it, and nothing else: no descent,
 * no second observation system, no controls to demonstrate.
 *
 * HOLDS ARE PER STEP, because the steps are not equal. Locating Nepal takes
 * a sentence; the coverage gap is the scene the whole product exists for.
 * `cue` is the step's name in the argument, shown on the presentation strip.
 */
export const SHORT_RUN = Object.freeze(
  [
    { id: 'locate', cue: 'Nepal', holdSec: 20 },
    { id: 'earthquake', cue: 'M7.8 earthquake', holdSec: 26 },
    { id: 'sequence', cue: 'Seismic sequence', holdSec: 28 },
    { id: 'shaking', cue: 'Shaking', holdSec: 28 },
    { id: 'exposure', cue: 'Population exposure', holdSec: 28 },
    { id: 'observed-damage', cue: 'Observed damage', holdSec: 30 },
    /* Its three beats carry their own holds (6 + 8 + 12 s). */
    { id: 'model-vs-observed', cue: 'Model vs observation' },
    { id: 'infrastructure', cue: 'Infrastructure', holdSec: 26 },
    { id: 'coverage-gap', cue: 'Coverage gap', holdSec: 36 },
    { id: 'route', cue: 'Network consequence', holdSec: 30 },
    {
      id: 'data-quality',
      cue: 'What the data can and cannot tell us',
      holdSec: 38,
    },
  ].map((step) => Object.freeze(step)),
);

/**
 * Build the beat list.
 *
 * @param {object} [options]
 * @param {'full'|'short'} [options.length]
 * @returns {{id:string, beats:Array<object>}}
 */
export function nepalPresentation({ length = 'full' } = {}) {
  const steps =
    length === 'short'
      ? SHORT_RUN.map((step) => ({ ...step, entry: scene(step.id) })).filter(
          (step) => step.entry,
        )
      : SCENES.map((entry) => ({ id: entry.id, entry }));

  const holdSec = DEFAULT_HOLD_SEC[length] ?? DEFAULT_HOLD_SEC.full;
  const beats = [];
  for (const step of steps) {
    const entry = step.entry;
    /*
     * THE FLIGHT IS NOT PART OF THE HOLD. The hold starts when the camera has
     * landed (see `whenSceneReady`), so a scene's flight is added once, on
     * its first beat, for `runSeconds` to count. Leaving it out made the full
     * run look 12.4 minutes when it plays nearer 13.3.
     */
    const flightSec = Number(entry.camera?.durationSec) || 0;
    if (entry.beats?.length) {
      /*
       * A scene with its own beats contributes all of them, each holding for
       * its own time. Scene 09's reversal needs twelve seconds and its setup
       * needs six; one hold for the scene would give the punchline the same
       * weight as the preamble.
       */
      entry.beats.forEach((beat, n) => {
        beats.push(
          Object.freeze({
            id: `${entry.id}:${beat.id}`,
            sceneIndex: entry.index,
            sceneId: entry.id,
            cue: step.cue ?? entry.title,
            flightMs: n === 0 ? flightSec * 1000 : 0,
            panel: beat.panel ?? null,
            mapAction: beat.mapAction ?? null,
            holdMs: (beat.holdSec ?? holdSec) * 1000,
            /* `needs` is the demo machinery's own field name. */
            needs: entry.datasets ?? [],
            title: entry.title,
            question: entry.question,
          }),
        );
      });
      continue;
    }
    beats.push(
      Object.freeze({
        id: entry.id,
        sceneIndex: entry.index,
        sceneId: entry.id,
        cue: step.cue ?? entry.title,
        flightMs: flightSec * 1000,
        panel: null,
        mapAction: null,
        holdMs: (step.holdSec ?? entry.holdSec ?? holdSec) * 1000,
        needs: entry.datasets ?? [],
        title: entry.title,
        question: entry.question,
      }),
    );
  }

  return Object.freeze({
    id: length === 'short' ? 'npl-2015-eq-short' : 'npl-2015-eq',
    length,
    beats: Object.freeze(beats),
  });
}

/**
 * Does this script visit every scene?
 *
 * The full run must, and a test asserts it: a presentation that silently
 * skips a scene means a scene nobody ever sees, which is how a broken panel
 * survives to a demo.
 */
export function scenesCovered(script) {
  return [
    ...new Set((script?.beats ?? []).map((beat) => beat.sceneIndex)),
  ].sort((a, b) => a - b);
}

/**
 * Total run time, in seconds: holds plus flights. What somebody scheduling a
 * meeting needs, and what the presentation strip counts down from.
 */
export function runSeconds(script) {
  return (
    (script?.beats ?? []).reduce(
      (sum, beat) =>
        sum +
        (beat.holdMs ?? DEFAULT_HOLD_SEC.full * 1000) +
        (beat.flightMs ?? 0),
      0,
    ) / 1000
  );
}
