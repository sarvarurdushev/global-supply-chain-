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
 * TWO LENGTHS. The full run is every scene. SHORT keeps Act I's opening, the
 * three-beat reversal, the coverage gap and the synthesis — the argument
 * without the descent — because a nine-minute walk-through is not what fits
 * into a meeting.
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
 * The scenes a short run keeps, exactly as the design names them.
 *
 * 00, 02, 04, 05, 09, 12, 15, 17 — the event, the shaking, who was under it,
 * the reversal, the coverage gap, people and damage, and what we know. The
 * argument without the descent.
 */
export const SHORT_RUN = Object.freeze([
  'case-card',
  'earthquake',
  'shaking',
  'exposure',
  'model-vs-observed',
  'coverage-gap',
  'people-and-damage',
  'data-quality',
]);

/**
 * Build the beat list.
 *
 * @param {object} [options]
 * @param {'full'|'short'} [options.length]
 * @returns {{id:string, beats:Array<object>}}
 */
export function nepalPresentation({ length = 'full' } = {}) {
  const entries =
    length === 'short'
      ? SHORT_RUN.map((id) => scene(id)).filter(Boolean)
      : [...SCENES];

  const holdSec = DEFAULT_HOLD_SEC[length] ?? DEFAULT_HOLD_SEC.full;
  const beats = [];
  for (const entry of entries) {
    if (entry.beats?.length) {
      /*
       * A scene with its own beats contributes all of them, each holding for
       * its own time. Scene 09's reversal needs twelve seconds and its setup
       * needs six; one hold for the scene would give the punchline the same
       * weight as the preamble.
       */
      for (const beat of entry.beats) {
        beats.push(
          Object.freeze({
            id: `${entry.id}:${beat.id}`,
            sceneIndex: entry.index,
            sceneId: entry.id,
            panel: beat.panel ?? null,
            mapAction: beat.mapAction ?? null,
            holdMs: (beat.holdSec ?? holdSec) * 1000,
            /* `needs` is the demo machinery's own field name. */
            needs: entry.datasets ?? [],
            title: entry.title,
            question: entry.question,
          }),
        );
      }
      continue;
    }
    beats.push(
      Object.freeze({
        id: entry.id,
        sceneIndex: entry.index,
        sceneId: entry.id,
        panel: null,
        mapAction: null,
        holdMs: (entry.holdSec ?? holdSec) * 1000,
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

/** Total run time, in seconds. What somebody scheduling a meeting needs. */
export function runSeconds(script) {
  return (
    (script?.beats ?? []).reduce(
      (sum, beat) => sum + (beat.holdMs ?? DEFAULT_HOLD_SEC.full * 1000),
      0,
    ) / 1000
  );
}
