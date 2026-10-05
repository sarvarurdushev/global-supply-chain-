/**
 * Narration as speech: sentences, their delivery, and the clips a neural
 * voice was rendered to. Pure and shared — the browser's narrator, the
 * director's timing, the script generator and the clip renderer all read the
 * same sentences with the same delivery, so a clip found at run time is the
 * clip that was rendered for that exact sentence.
 *
 * DELIVERY IS DATA, AND ONLY WHAT TAKES EFFECT. A beat may carry `prosody`,
 * keyed by sentence index (0-based), with these fields and no others:
 *
 *   pauseBefore, pauseAfter  milliseconds of silence. Neural: rendered into
 *                            the clip. System voice: a timed gap. Both real.
 *   rate                     0.8–1.15. Neural: the model's speed. System
 *                            voice: the utterance rate. Both real.
 *   energy                   -2…+2 (dB-like steps of 1.5 dB). Neural: gain
 *                            rendered into the clip. System voice: utterance
 *                            volume. Both real, and deliberately small.
 *   emphasis                 phrases inside the sentence to stress. Neural
 *                            only: the G2P raises their lexical stress
 *                            (misaki `[phrase](+1)`). The Web Speech API has
 *                            no portable emphasis (browsers ignore SSML), so
 *                            the system voice says them plainly.
 *
 * There is no `tone`: neither engine can change one on request, and a
 * control that does nothing would be a lie in the script.
 */

import { neuralText, spokenText } from './pronunciation.js';
import { RENDER_VERSION } from './voices.js';

/** Split narration into sentences. "7.8" and "4,583" have no space after the point, so they stay whole. */
export function splitSentences(text) {
  return String(text ?? '')
    .split(/(?<=[.!?…])\s+(?=[A-Z0-9"“‘(])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export const PROSODY_FIELDS = Object.freeze([
  'pauseBefore',
  'pauseAfter',
  'rate',
  'energy',
  'emphasis',
]);

export const PROSODY_LIMITS = Object.freeze({
  pauseBefore: [0, 1500],
  pauseAfter: [0, 1500],
  rate: [0.8, 1.15],
  energy: [-2, 2],
});

/** Speaking pace for estimates when no clip is known: 150 words a minute. */
export const WORDS_PER_SECOND = 2.5;

function words(text) {
  return String(text ?? '')
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * The sentences of a line with their delivery. `prosody` is the beat's
 * `{ [index]: {...} }`; a missing entry is plain delivery.
 */
export function sentencePlan(text, prosody = null) {
  return splitSentences(text).map((sentence, index) => {
    const p = prosody?.[index] ?? {};
    return Object.freeze({
      index,
      text: sentence,
      pauseBefore: p.pauseBefore ?? 0,
      pauseAfter: p.pauseAfter ?? 0,
      rate: p.rate ?? 1,
      energy: p.energy ?? 0,
      emphasis: Object.freeze([...(p.emphasis ?? [])]),
    });
  });
}

/** Problems with a beat's prosody against its (filled) narration. Empty is clean. */
export function lintProsody(prosody, sentenceCount, where = '') {
  const problems = [];
  if (!prosody) return problems;
  for (const [key, entry] of Object.entries(prosody)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= sentenceCount)
      problems.push(
        `${where}: prosody for sentence ${key}, which does not exist`,
      );
    for (const [field, value] of Object.entries(entry ?? {})) {
      if (!PROSODY_FIELDS.includes(field)) {
        problems.push(`${where}: prosody field "${field}" has no effect`);
        continue;
      }
      const limits = PROSODY_LIMITS[field];
      if (limits && !(value >= limits[0] && value <= limits[1]))
        problems.push(
          `${where}: prosody ${field} ${value} outside ${limits.join('…')}`,
        );
      if (field === 'emphasis' && !Array.isArray(value))
        problems.push(`${where}: emphasis must be a list of phrases`);
    }
  }
  return problems;
}

/** Estimated length of one sentence in its delivery, when no clip says. */
export function estimateSentenceMs(sentence) {
  const n = words(sentence.text);
  const spoken = n ? (n / WORDS_PER_SECOND / (sentence.rate || 1)) * 1000 : 0;
  return Math.round(spoken + sentence.pauseBefore + sentence.pauseAfter);
}

/** FNV-1a, 32 bit, as 8 hex digits: a stable name for a sentence's clip. */
function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** What the neural voice is given for a sentence: spoken forms, lexicon, emphasis. */
export function neuralInput(sentence) {
  return neuralText(spokenText(sentence.text), sentence.emphasis);
}

/**
 * The clip a voice was rendered to for this sentence, in this delivery.
 * Any change to the words, the pronunciation, the delivery or the renderer
 * is a different clip, so a stale clip can never be played for a revised line.
 */
export function clipKey(voiceId, sentence) {
  const signature = [
    RENDER_VERSION,
    neuralInput(sentence),
    sentence.pauseBefore,
    sentence.pauseAfter,
    sentence.rate,
    sentence.energy,
    sentence.emphasis.join('|'),
  ].join('§');
  return `${voiceId}-${fnv1a(signature)}${fnv1a(`${signature}#`).slice(0, 4)}`;
}
