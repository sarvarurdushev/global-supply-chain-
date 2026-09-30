/**
 * The director: plays a run's plan beat by beat on a stage, and lets the
 * presenter take it anywhere at any moment without breaking it.
 *
 * THREE RULES, each a failure of the Stage 7/8 presentation.
 *
 *   A SKIP IS NOT A PAUSE. NEXT and BACK move one beat immediately and the
 *   briefing keeps playing if it was playing. The old runner paused on every
 *   step, so a presenter who skipped once was presenting a slideshow.
 *
 *   A BEAT ENDS WHEN ITS WORK IS DONE, not when a timer says. Every action's
 *   animation, the camera's landing, the narration (or, with no voice, the
 *   caption's reading time) and a minimum readable hold must all finish.
 *
 *   ANY BEAT CAN BE ENTERED COLD. Jumping to beat k of a scene first puts the
 *   stage into the state beats 0..k-1 would have left it in — instantly — and
 *   then performs beat k. So NEXT, BACK, REPLAY and a jump from the scene list
 *   all land on a correct frame, and no sequence of presses can leave half a
 *   border drawn or a counter stuck at 40 %. A generation counter makes every
 *   late callback from an abandoned beat a no-op.
 *
 * The stage is injected and performs actions; the clock is injected and is
 * the only source of time. Both are fakes in the tests.
 */

import { beatLengthMs, narrationMs, readingMs } from './timeline.js';

export const STATUS = Object.freeze({
  IDLE: 'idle',
  PLAYING: 'playing',
  PAUSED: 'paused',
  FINISHED: 'finished',
});

export const SPEEDS = Object.freeze([0.75, 1, 1.25, 1.5]);

/**
 * @param {object} input
 * @param {ReadonlyArray<object>} input.plan from `planRun`
 * @param {object} input.stage performs actions (see the stage contract below)
 * @param {object} input.clock from `createClock`
 * @param {(state:object)=>void} [input.onChange]
 *
 * Stage contract — every method may return a promise:
 *   enterScene(scene, { instant })       clear the previous scene, set this one up
 *   run(action, { instant, entry })      perform one action; resolve when its animation ends
 *   caption(text|null, {instant})        show or clear the lower-third caption
 *   speak(text, { rate }) -> {done, cancel}  narration; `done` resolves when spoken
 *   cancel()                             stop every in-flight animation and utterance
 *   pause() / resume()                   narration follows the clock
 *   hasVoice                             boolean: is narration actually audible?
 */
export function createDirector({ plan, stage, clock, onChange = () => {} }) {
  if (!plan?.length)
    throw new TypeError('The director needs a plan with at least one beat.');
  let index = -1;
  let status = STATUS.IDLE;
  let generation = 0;
  let beatDone = false;
  let utterance = null;
  let beatStartedAt = 0;
  let completedBeats = 0;
  /** The scene the stage currently holds, so a natural step within a scene keeps its state. */
  let stagedScene = null;
  let stagedThrough = -1;
  /** True while a beat's actions are on stage but not finished: never build on that. */
  let partial = false;

  function state() {
    const entry = plan[index] ?? null;
    return Object.freeze({
      index,
      total: plan.length,
      status,
      speed: clock.speed,
      entry,
      sceneId: entry?.scene.id ?? null,
      beatId: entry?.beat.id ?? null,
      beatDone,
      completedBeats,
      elapsedInBeatMs: entry ? clock.now() - beatStartedAt : 0,
    });
  }

  const notify = () => onChange(state());

  /**
   * Put the stage where beat `target` starts. If the stage already holds the
   * same scene through the previous beat, nothing needs rebuilding.
   */
  async function reconcile(target, gen) {
    const entry = plan[target];
    const continuing =
      !partial &&
      stagedScene === entry.scene.id &&
      stagedThrough === entry.beatIndex - 1;
    if (continuing) return;
    /* Played into from the previous scene: the stage may animate the change. */
    const natural =
      status === STATUS.PLAYING &&
      entry.beatIndex === 0 &&
      stagedScene !== null &&
      stagedScene !== entry.scene.id;
    await stage.enterScene(entry.scene, { instant: !natural });
    if (gen !== generation) return;
    for (const beat of entry.priorBeats) {
      for (const action of beat.actions) {
        if (action.persist === false || action.type === 'audio.cue') continue;
        await stage.run(action, { instant: true, entry });
        if (gen !== generation) return;
      }
    }
    stagedScene = entry.scene.id;
    stagedThrough = entry.beatIndex - 1;
    partial = false;
  }

  async function perform(target) {
    /*
     * The index moves BEFORE anything is awaited. Three presses of NEXT in
     * the same tick must land three beats on, not re-read a stale index and
     * land one.
     */
    generation += 1;
    const gen = generation;
    index = target;
    beatDone = false;
    clock.clearTimers();
    utterance?.cancel?.();
    utterance = null;
    beatStartedAt = clock.now();
    notify();
    await stage.cancel?.();
    if (gen !== generation) return;
    await reconcile(target, gen);
    if (gen !== generation) return;

    const entry = plan[target];
    const { beat } = entry;
    beatStartedAt = clock.now();
    partial = true;
    stage.caption(beat.caption ?? null);

    /* Every action runs at its offset on the briefing clock. */
    const actionDone = beat.actions.map(
      (action) =>
        new Promise((resolve) => {
          clock.after(action.at ?? 0, () => {
            if (gen !== generation) return resolve();
            Promise.resolve(stage.run(action, { instant: false, entry })).then(
              resolve,
              resolve,
            );
          });
        }),
    );

    /*
     * Narration, or its absence. With a voice the beat waits for the words;
     * without one it waits for the caption's reading time on the same clock,
     * so pausing freezes both the same way.
     */
    const spoken = new Promise((resolve) => {
      clock.after(beat.narrationAt ?? 0, () => {
        if (gen !== generation) return resolve();
        if (beat.narration && stage.hasVoice) {
          utterance = stage.speak(beat.narration, { rate: clock.speed });
          Promise.resolve(utterance?.done).then(resolve, resolve);
          /* A voice that never reports its end must not hang the briefing. */
          clock.after(narrationMs(beat.narration) * 1.8 + 3000, resolve);
        } else {
          clock.after(readingMs(beat.caption ?? beat.narration), resolve);
        }
      });
    });

    await Promise.all([...actionDone, spoken]);
    if (gen !== generation) return;
    /* The minimum readable hold starts when the last thing has landed. */
    await clock.wait((beat.minHoldMs ?? 0) + (beat.holdMs ?? 0));
    if (gen !== generation) return;
    stagedScene = entry.scene.id;
    stagedThrough = entry.beatIndex;
    partial = false;
    beatDone = true;
    completedBeats += 1;
    notify();
    advanceIfPlaying();
  }

  function advanceIfPlaying() {
    if (status !== STATUS.PLAYING || !beatDone) return;
    if (index >= plan.length - 1) {
      status = STATUS.FINISHED;
      clock.stop();
      notify();
      return;
    }
    void perform(index + 1);
  }

  /** Jump to a beat. While paused the beat is shown whole, since nothing can play it. */
  async function jump(target) {
    const bounded = Math.max(0, Math.min(plan.length - 1, target));
    if (status === STATUS.FINISHED) status = STATUS.PAUSED;
    if (status === STATUS.PLAYING) return perform(bounded);
    generation += 1;
    const gen = generation;
    index = bounded;
    beatDone = false;
    clock.clearTimers();
    utterance?.cancel?.();
    utterance = null;
    notify();
    await stage.cancel?.();
    if (gen !== generation) return;
    await reconcile(bounded, gen);
    if (gen !== generation) return;
    const entry = plan[bounded];
    partial = true;
    stage.caption(entry.beat.caption ?? null, { instant: true });
    for (const action of entry.beat.actions) {
      if (action.persist === false || action.type === 'audio.cue') continue;
      await stage.run(action, { instant: true, entry });
      if (gen !== generation) return;
    }
    stagedScene = entry.scene.id;
    stagedThrough = entry.beatIndex;
    partial = false;
    beatDone = true;
    notify();
  }

  return Object.freeze({
    plan,
    get state() {
      return state();
    },
    /** Estimated length of the current beat in briefing time, for the progress bar. */
    currentBeatMs: () =>
      plan[index]
        ? beatLengthMs(plan[index].beat, { voiced: stage.hasVoice })
        : 0,

    play() {
      if (status === STATUS.PLAYING) return false;
      const fromEnd = status === STATUS.FINISHED;
      status = STATUS.PLAYING;
      clock.start();
      stage.resume?.();
      if (index < 0 || fromEnd) void perform(fromEnd ? 0 : Math.max(0, index));
      else if (beatDone) advanceIfPlaying();
      else notify();
      return true;
    },
    pause() {
      if (status !== STATUS.PLAYING) return false;
      status = STATUS.PAUSED;
      clock.stop();
      stage.pause?.();
      notify();
      return true;
    },
    toggle() {
      return status === STATUS.PLAYING ? this.pause() : this.play();
    },
    next() {
      if (index >= plan.length - 1) return false;
      void jump(index + 1);
      return true;
    },
    previous() {
      if (index <= 0) return false;
      void jump(index - 1);
      return true;
    },
    replay() {
      if (index < 0) return false;
      void jump(index);
      return true;
    },
    goTo(target) {
      void jump(target);
      return true;
    },
    goToScene(sceneId) {
      const target = plan.findIndex((entry) => entry.scene.id === sceneId);
      if (target < 0) return false;
      void jump(target);
      return true;
    },
    setSpeed(value) {
      if (!SPEEDS.includes(value))
        throw new RangeError(
          `speed ${value} is not one of ${SPEEDS.join(', ')}`,
        );
      clock.setSpeed(value);
      notify();
    },
    destroy() {
      generation += 1;
      clock.clearTimers();
      clock.stop();
      utterance?.cancel?.();
      void stage.cancel?.();
      status = STATUS.IDLE;
    },
  });
}
