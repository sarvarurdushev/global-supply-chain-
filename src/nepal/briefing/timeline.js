/**
 * The briefing as data: SCENE → BEAT → ACTION.
 *
 * A scene is one question. A beat is one narrated idea — one caption line,
 * one sentence of voice. An action is one visible change at an offset inside
 * its beat. Nothing here draws or schedules; the director plays a plan and
 * the stage performs actions. Keeping the story as data is what makes its
 * pacing measurable before anyone watches it: `lintTimeline` fails a beat
 * that would sit still, and `estimateRun` gives a runtime from the same
 * numbers the director will use.
 */

import { findForbiddenPhrasing } from '../analysis/terminology.js';
import {
  WORDS_PER_SECOND as SPEECH_WPS,
  estimateSentenceMs,
  lintProsody,
  sentencePlan,
  splitSentences,
} from './speech.js';
import { GLOSSARY } from './glossary.js';

export const RUNS = Object.freeze({
  THREE: 'three',
  SIX: 'six',
  FULL: 'full',
});

export const RUN_LABELS = Object.freeze({
  three: '3 MIN EXECUTIVE',
  six: '6 MIN BRIEFING',
  full: 'FULL ANALYSIS',
});

/** Every action the stage understands. Anything else is a typo. */
export const ACTION_TYPES = Object.freeze([
  'camera.fly',
  'camera.hold',
  'veil',
  'layer.show',
  'layer.hide',
  'layer.filter',
  'layer.animate',
  'annotation.draw',
  'annotation.remove',
  'annotation.clear',
  'chart.enter',
  'chart.update',
  'chart.highlight',
  'chart.exit',
  'caption.show',
  'caption.hide',
  'metric.count',
  'route.trace',
  'timeline.seek',
  'question.show',
  'title.type',
  'audio.cue',
  /* Stage 9.2: the subject dominates, a term is explained, time is on screen. */
  'focus',
  'term.show',
  'time.card',
]);

/**
 * What a beat is for in the argument, when it is not a plain result. The
 * caption wears it as a kicker, so the pattern is visible: a result, then
 * WHAT THIS MEANS, then WHAT IT CANNOT TELL US, then the NEXT QUESTION.
 */
export const BEAT_KINDS = Object.freeze({
  meaning: 'WHAT THIS MEANS',
  limit: 'WHAT IT CANNOT TELL US',
  next: 'NEXT QUESTION',
  sofar: 'SO FAR',
});

/**
 * How long an action takes when it does not say, in milliseconds of
 * briefing time. The camera's default is its own `duration`; these are the
 * reveals, which should be quick enough to keep up with a voice.
 */
const DEFAULT_DURATION = Object.freeze({
  'camera.fly': 3000,
  'layer.animate': 2500,
  'annotation.draw': 900,
  'chart.enter': 1600,
  'chart.update': 1200,
  'metric.count': 1600,
  'route.trace': 2500,
  'timeline.seek': 4000,
  'question.show': 2800,
  'title.type': 1400,
  focus: 700,
  'time.card': 500,
});

/** Speaking pace for estimates: 150 words a minute, a briefing register. */
export const WORDS_PER_SECOND = SPEECH_WPS;
/** Reading pace for captions when no voice is available. */
export const READING_WORDS_PER_SECOND = 3.2;
export const DEFAULT_MIN_HOLD_MS = 1200;

export const PACING = Object.freeze({
  /** First visible change after a beat starts. */
  firstActionMs: 500,
  /** Longest gap between two visible changes inside a beat. */
  maxGapMs: 6000,
  captionMaxWords: 16,
  captionMaxChars: 110,
  /**
   * How long the last thing a scene draws stays on screen before the scene
   * changes. A figure that lands half a second before a cut is never read.
   */
  sceneEndHoldMs: 1500,
});

/** Actions that take something away rather than put something on screen. */
const REMOVING = new Set(['annotation.remove', 'layer.hide', 'chart.exit']);

/**
 * How long the beat holds its final picture: from the moment its last
 * drawing action lands to the beat's end, at the given pace.
 */
export function finalHoldMs(beat, { voiced = true } = {}) {
  const landed = Math.max(
    0,
    ...beat.actions
      .filter(
        (action) => action.type !== 'audio.cue' && !REMOVING.has(action.type),
      )
      .map((action) => (action.at ?? 0) + actionDuration(action)),
  );
  return beatLengthMs(beat, { voiced }) - landed;
}

export function actionDuration(action) {
  if (Number.isFinite(action.duration)) return action.duration;
  return DEFAULT_DURATION[action.type] ?? 0;
}

export function wordCount(text) {
  return String(text ?? '')
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Milliseconds of narration at the briefing's pace. */
export function narrationMs(text) {
  const words = wordCount(text);
  return words ? Math.round((words / WORDS_PER_SECOND) * 1000) : 0;
}

/*
 * MEASURED NARRATION. Once the neural voice's clips are known, a beat lasts
 * exactly as long as its clips; `setNarrationMeasure` installs that lookup
 * (the browser after loading the clip manifest, the script generator after
 * reading it). It returns the beat's narration in ms, or null when any
 * sentence has no clip — then the estimate below stands.
 */
let measure = null;
export function setNarrationMeasure(fn) {
  measure = typeof fn === 'function' ? fn : null;
}

/** A beat's narration length: measured from its clips when known, else estimated in its delivery. */
export function narrationMsFor(beat) {
  if (!beat?.narration) return 0;
  const measured = measure?.(beat);
  if (Number.isFinite(measured)) return measured;
  return sentencePlan(beat.narration, beat.prosody).reduce(
    (sum, sentence) => sum + estimateSentenceMs(sentence),
    0,
  );
}

/** Milliseconds a caption needs to be read when there is no voice. */
export function readingMs(text) {
  const words = wordCount(text);
  return words
    ? Math.round((words / READING_WORDS_PER_SECOND) * 1000) + 600
    : 0;
}

export function defineBeat(beat) {
  if (!beat?.id) throw new TypeError('A beat needs an id.');
  return Object.freeze({
    caption: null,
    narration: null,
    narrationAt: 0,
    minHoldMs: DEFAULT_MIN_HOLD_MS,
    ...beat,
    actions: Object.freeze(
      (beat.actions ?? []).map((action) => Object.freeze({ at: 0, ...action })),
    ),
  });
}

export function defineScene(scene) {
  if (!scene?.id) throw new TypeError('A scene needs an id.');
  const runs = Object.freeze([...(scene.runs ?? [RUNS.FULL])]);
  return Object.freeze({
    ...scene,
    runs,
    beats: Object.freeze(
      (scene.beats ?? []).map((beat) =>
        defineBeat({ ...beat, runs: beat.runs ?? runs }),
      ),
    ),
  });
}

/**
 * The beat's own length in briefing time: the later of its last action's
 * end and its narration's end (or caption's reading time when silent), plus
 * the minimum hold. `voiced` says which pace applies.
 */
export function beatLengthMs(beat, { voiced = true } = {}) {
  const actionsEnd = Math.max(
    0,
    ...beat.actions.map((action) => (action.at ?? 0) + actionDuration(action)),
  );
  const spoken = voiced
    ? (beat.narrationAt ?? 0) + narrationMsFor(beat)
    : readingMs(beat.caption ?? beat.narration);
  return (
    Math.max(actionsEnd, spoken) +
    (beat.minHoldMs ?? DEFAULT_MIN_HOLD_MS) +
    (beat.holdMs ?? 0)
  );
}

/**
 * The ordered list of beats a run plays.
 *
 * Each entry carries the beats of its scene that come BEFORE it, whether or
 * not the run plays them, because entering a scene part-way — a skip, a
 * shorter run — must still reach the state those beats would have built.
 */
export function planRun(scenes, run = RUNS.FULL) {
  const plan = [];
  /* A term is explained the first time THIS run reaches it, whichever run that is. */
  const explained = new Set();
  const firstTermsOf = (beat) => {
    const fresh = [];
    for (const action of beat.actions)
      if (action.type === 'term.show' && !explained.has(action.term)) {
        explained.add(action.term);
        fresh.push(action.term);
      }
    return Object.freeze(fresh);
  };
  scenes
    .filter((scene) => scene.runs.includes(run))
    .forEach((scene, sceneOrder) => {
      const played = scene.beats.filter((beat) => beat.runs.includes(run));
      const last = played[played.length - 1];
      scene.beats.forEach((beat, beatIndex) => {
        if (!beat.runs.includes(run)) return;
        plan.push(
          Object.freeze({
            key: `${scene.id}:${beat.id}`,
            scene,
            sceneOrder,
            beat,
            beatIndex,
            priorBeats: Object.freeze(scene.beats.slice(0, beatIndex)),
            /* The last beat this run plays in the scene: see `sceneEndHoldMs`. */
            endsScene: beat === last,
            /* Terms this beat explains because the run has not met them yet. */
            firstTerms: firstTermsOf(beat),
          }),
        );
      });
    });
  return Object.freeze(plan);
}

/**
 * The hold a run adds to the last beat it plays in a scene, so whatever
 * landed last is on screen for at least `PACING.sceneEndHoldMs` before the
 * cut. Depends on the pace: a long spoken line may already give it.
 */
export function sceneEndHoldMs(entry, options) {
  if (!entry?.endsScene) return 0;
  return Math.max(0, PACING.sceneEndHoldMs - finalHoldMs(entry.beat, options));
}

/** A planned beat's length: its own, plus any hold the run adds at a scene's end. */
export function entryLengthMs(entry, options) {
  return beatLengthMs(entry.beat, options) + sceneEndHoldMs(entry, options);
}

export function estimateRun(plan, options) {
  const beats = plan.map((entry) => entryLengthMs(entry, options));
  return Object.freeze({
    beats: plan.length,
    scenes: new Set(plan.map((entry) => entry.scene.id)).size,
    totalMs: beats.reduce((sum, ms) => sum + ms, 0),
    longestBeatMs: Math.max(0, ...beats),
  });
}

/**
 * The longest stretch of a beat in which nothing on screen changes.
 *
 * A change is an action's animation — a border drawing, a counter counting,
 * a camera flying — so each visible action covers [at, at + duration], and
 * an instant action covers a nominal 400 ms. The beat runs to the end of its
 * narration or reading time. Voice is not a visual change: a beat whose last
 * action lands at 2 s while its sentence runs to 12 s is ten seconds of
 * stillness, and this reports ten.
 */
export function longestStillMs(beat, options) {
  const end =
    beatLengthMs(beat, options) -
    (beat.minHoldMs ?? DEFAULT_MIN_HOLD_MS) -
    (beat.holdMs ?? 0);
  const intervals = beat.actions
    .filter((action) => action.type !== 'audio.cue')
    .map((action) => [
      action.at ?? 0,
      (action.at ?? 0) + Math.max(400, actionDuration(action)),
    ])
    .sort((a, b) => a[0] - b[0]);
  let longest = 0;
  let covered = 0;
  for (const [start, stop] of intervals) {
    if (start > covered) longest = Math.max(longest, start - covered);
    covered = Math.max(covered, stop);
  }
  if (end > covered) longest = Math.max(longest, end - covered);
  return longest;
}

/**
 * Pacing and content rules, as a list of problems. Empty means clean.
 *
 * These are the brief's standard turned into checks: a beat must change the
 * screen within half a second, never go six seconds without a change, keep
 * its caption to one glance, and use only real action types. Forbidden
 * phrasing is checked in every caption and every narration line.
 */
export function lintTimeline(scenes) {
  const problems = [];
  const sceneIds = new Set();
  for (const scene of scenes) {
    if (sceneIds.has(scene.id))
      problems.push(`${scene.id}: duplicate scene id`);
    sceneIds.add(scene.id);
    if (!scene.question) problems.push(`${scene.id}: no question`);
    if (!scene.beats.length) problems.push(`${scene.id}: no beats`);
    const beatIds = new Set();
    for (const beat of scene.beats) {
      const where = `${scene.id}:${beat.id}`;
      if (beatIds.has(beat.id)) problems.push(`${where}: duplicate beat id`);
      beatIds.add(beat.id);
      for (const run of beat.runs) {
        if (!scene.runs.includes(run))
          problems.push(`${where}: run "${run}" not in its scene`);
      }
      const visible = beat.actions.filter(
        (action) => action.type !== 'audio.cue',
      );
      if (visible.length < 2)
        problems.push(`${where}: fewer than two visible actions`);
      for (const action of beat.actions) {
        if (!ACTION_TYPES.includes(action.type))
          problems.push(`${where}: unknown action "${action.type}"`);
        if (action.type === 'term.show' && !GLOSSARY[action.term])
          problems.push(
            `${where}: term "${action.term}" is not in the glossary`,
          );
        if (action.until && action.until !== 'beat')
          problems.push(`${where}: until "${action.until}" (only "beat")`);
      }
      if (beat.kind && !BEAT_KINDS[beat.kind])
        problems.push(`${where}: unknown beat kind "${beat.kind}"`);
      problems.push(
        ...lintProsody(
          beat.prosody,
          splitSentences(beat.narration ?? '').length,
          where,
        ),
      );
      const times = visible
        .map((action) => action.at ?? 0)
        .sort((a, b) => a - b);
      if (times.length && times[0] > PACING.firstActionMs) {
        problems.push(
          `${where}: first change at ${times[0]} ms (limit ${PACING.firstActionMs})`,
        );
      }
      const still = longestStillMs(beat);
      if (still > PACING.maxGapMs)
        problems.push(
          `${where}: ${Math.round(still)} ms without a visible change`,
        );
      if (beat.caption) {
        /* Measured as it will read: a placeholder becomes a short figure, not its template text. */
        const shown = beat.caption.replace(/\{[^}]+\}/g, '00,000');
        if (wordCount(shown) > PACING.captionMaxWords)
          problems.push(
            `${where}: caption over ${PACING.captionMaxWords} words`,
          );
        if (shown.length > PACING.captionMaxChars)
          problems.push(
            `${where}: caption over ${PACING.captionMaxChars} characters`,
          );
      }
      for (const text of [
        beat.caption,
        beat.narration,
        ...beat.actions.map((a) => a.text),
      ]) {
        if (text && findForbiddenPhrasing(String(text)).length)
          problems.push(`${where}: forbidden phrasing in "${text}"`);
      }
    }
  }
  return problems;
}
