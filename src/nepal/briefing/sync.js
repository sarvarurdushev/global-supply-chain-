/**
 * Narration ↔ picture: when the voice says a figure, is the picture already
 * showing it? Shared by the scene test (timed by estimate) and the sync
 * audit (timed by the rendered voice, scripts/qa-briefing-sync.mjs).
 */

import { narrationMs } from './timeline.js';

/** Charts and layers that display a fact without naming it in a template. */
export const VISUALISES = Object.freeze({
  'chart:composition': [
    'damage.total',
    'damage.destroyed',
    'damage.severe',
    'damage.moderate',
    'damage.possible',
    'damage.shareDestroyed',
    'damage.shareSevere',
    'damage.shareModerate',
    'damage.sharePossible',
  ],
  'chart:intensity': ['damage.byIntensity', 'damage.independence'],
  'chart:ranks': ['access.pressure', 'access.stableTop'],
  'layer:district-routes': ['infra.routes'],
});

/** The fact a `{fact.path|format}` token names, to two segments. */
export const factOf = (template) =>
  template.slice(1, -1).split('|')[0].split('.').slice(0, 2).join('.');

/** Every fact an action puts on screen. */
export const shownIn = (a) =>
  [
    a.title,
    a.text,
    a.label,
    ...(a.lines ?? []).map((l) => (typeof l === 'string' ? l : l.text)),
    a.fact,
    a.anchor?.fact,
    a.to?.fact,
    a.line?.fact,
    a.keysFrom?.fact,
    a.rowsFrom?.fact,
    /* The clock card's ruler marks its ticks from the moment it appears. */
    ...(a.ticks ?? []).map((t) => t.day?.fact),
    ...(VISUALISES[`chart:${a.chart}`] ?? []),
    ...(VISUALISES[`layer:${a.layer}`] ?? []),
  ]
    .filter(Boolean)
    .map(String);

/**
 * Each figure a beat's narration says: the fact, when it is said, and when
 * the picture first shows it (0 if an earlier beat or the setup already
 * does; null if nothing does). `spokenAt(prefix)` gives the time at which
 * the narration has reached `prefix` (template text); the default is the
 * 2.5-words-a-second estimate.
 */
export function figureCues(
  scene,
  index,
  spokenAt = (prefix) => narrationMs(prefix),
) {
  const beat = scene.beats[index];
  const earlier = [
    ...(scene.setup ?? []),
    ...scene.beats.slice(0, index).flatMap((b) => b.actions),
  ];
  const words = String(beat.narration ?? '').split(/\s+/);
  const out = [];
  words.forEach((word, i) => {
    const template = word.match(/\{[^}]+\}/)?.[0];
    if (!template) return;
    const fact = factOf(template);
    if (fact.startsWith('access.params')) return;
    const said =
      (beat.narrationAt ?? 0) + spokenAt(words.slice(0, i).join(' '));
    const shows = (a) =>
      a.type !== 'audio.cue' && shownIn(a).some((t) => t.includes(fact));
    const shown = earlier.some(shows)
      ? 0
      : Math.min(Infinity, ...beat.actions.filter(shows).map((a) => a.at ?? 0));
    out.push({
      fact,
      template,
      spokenAt: Math.round(said),
      shownAt: Number.isFinite(shown) ? shown : null,
    });
  });
  return out;
}
