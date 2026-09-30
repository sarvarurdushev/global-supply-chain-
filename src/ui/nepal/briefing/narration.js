/**
 * The briefing's voice.
 *
 * ZERO-KEY DEFAULT: the Web Speech API. The voice comes from whatever the
 * browser and operating system provide, ranked by its properties — language,
 * whether it is a natural/neural voice, whether it runs locally — never by a
 * single hard-coded name. The presenter can choose any English voice before
 * the briefing and hear a preview. No voice imitates or clones a real person,
 * and every line spoken is original briefing prose from the script.
 *
 * SENTENCE BY SENTENCE. A line is spoken as a queue of sentences. That makes
 * pause deterministic — speech is stopped and, on resume, the interrupted
 * sentence is spoken again from its start — because `speechSynthesis.pause()`
 * is unreliable across browsers (Chrome drops long utterances after ~15 s
 * and some voices ignore pause entirely). It also means a stale sentence can
 * never speak over the next beat: every queue carries a generation token,
 * and events from an older generation are ignored.
 *
 * NO VOICE IS A NORMAL CASE. Headless browsers and some Linux desktops expose
 * none. Then `available` is false, the director times each beat by its
 * caption's reading time instead, and the captions carry the story.
 *
 * QA: `simulate` replaces speech with the briefing clock. A sentence "lasts"
 * as long as the narration rate says, pauses with the clock, and reports the
 * word being spoken, so a recording made without any speech engine still runs
 * at voiced pace and can be checked word against picture.
 */

import { narrationMs } from '../../../nepal/briefing/timeline.js';

/** Split narration into sentences. "7.8" and "4,583" have no space after the point, so they stay whole. */
export function splitSentences(text) {
  return String(text ?? '')
    .split(/(?<=[.!?…])\s+(?=[A-Z0-9"“‘(])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/* Name fragments that mark a voice, by property rather than by identity. */
const QUALITY_HINT =
  /\b(natural|neural|premium|enhanced|online|wavenet|studio|hd)\b/i;
/* macOS novelty voices and bare eSpeak-style synthesisers: never a briefing voice. */
const NOVELTY_HINT =
  /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|grandma|grandpa|rocko|shelley|sandy|flo|eddy|reed)\b/i;
const BASIC_HINT = /\b(espeak|mbrola|festival|pico)\b/i;

/**
 * Every English voice, best first, with the reason it ranks where it does.
 * @returns {Array<{voice: object, id: string, score: number, tier: string, label: string}>}
 */
export function rankVoices(voices) {
  return (voices ?? [])
    .filter((voice) => /^en([-_]|$)/i.test(voice.lang ?? ''))
    .map((voice) => {
      const name = String(voice.name ?? '');
      const lang = String(voice.lang ?? '').replace('_', '-');
      let score = 0;
      if (/^en-(GB|US)$/i.test(lang)) score += 20;
      else if (/^en-(AU|IE|CA|NZ|ZA|IN)$/i.test(lang)) score += 12;
      else score += 6;
      if (/^en-GB$/i.test(lang)) score += 2;
      const natural = QUALITY_HINT.test(name);
      if (natural) score += 30;
      /* A local voice starts faster and keeps working offline. */
      if (voice.localService) score += 8;
      const novelty = NOVELTY_HINT.test(name);
      const basic = BASIC_HINT.test(name);
      if (novelty) score -= 100;
      if (basic) score -= 30;
      if (voice.default) score += 1;
      const tier = novelty
        ? 'NOVELTY'
        : natural
          ? 'NATURAL'
          : basic
            ? 'BASIC'
            : 'SYSTEM';
      return {
        voice,
        id: voice.voiceURI || `${name}|${lang}`,
        score,
        tier,
        label: `${name.replace(/\s*\(.*\)\s*$/, '')} — ${languageName(lang)}${voice.localService ? '' : ' · online'}`,
      };
    })
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

function languageName(lang) {
  const region = String(lang).split('-')[1]?.toUpperCase();
  const names = {
    GB: 'English UK',
    US: 'English US',
    AU: 'English Australia',
    IE: 'English Ireland',
    CA: 'English Canada',
    NZ: 'English New Zealand',
    ZA: 'English South Africa',
    IN: 'English India',
  };
  return names[region] ?? 'English';
}

/** The voice the briefing uses when nobody has chosen one. */
export function chooseVoice(voices) {
  const best = rankVoices(voices).find((row) => row.tier !== 'NOVELTY');
  return best?.voice ?? null;
}

const STORAGE_KEY = 'nepal-briefing-voice';

export function createNarrator({
  synth = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
  storage = globalThis.localStorage,
  clock = null,
  simulate = false,
  schedule = (fn) => setTimeout(fn, 0),
} = {}) {
  let ranked = [];
  let voice = null;
  let chosenId = null;
  let enabled = true;
  let volume = 0.9;
  /* Every queue and every cancel moves the generation on; older events are ignored. */
  let generation = 0;
  let queue = null;
  let listeners = [];
  const log = [];

  try {
    chosenId = storage?.getItem?.(STORAGE_KEY) ?? null;
  } catch {
    chosenId = null;
  }

  function refresh() {
    ranked = simulate
      ? [
          {
            voice: {
              name: 'Simulated narration (QA)',
              lang: 'en-GB',
              localService: true,
            },
            id: 'simulated',
            score: 0,
            tier: 'SIMULATED',
            label: 'Simulated narration — QA',
          },
        ]
      : rankVoices(synth?.getVoices?.() ?? []);
    const chosen = ranked.find((row) => row.id === chosenId);
    voice =
      chosen?.voice ??
      (simulate
        ? ranked[0].voice
        : chooseVoice(ranked.map((row) => row.voice)));
    for (const fn of listeners) fn();
  }
  refresh();
  synth?.addEventListener?.('voiceschanged', refresh);

  const record = (event) => {
    log.push({ ...event, at: clock?.now?.() ?? Date.now() });
    if (log.length > 400) log.shift();
  };

  /** Speak the queue's current sentence; on its end, the next. */
  function speakCurrent(q) {
    if (q !== queue || q.gen !== generation || q.paused) return;
    if (q.index >= q.sentences.length) {
      queue = null;
      q.resolve();
      return;
    }
    const sentence = q.sentences[q.index];
    const advance = () => {
      if (q !== queue || q.gen !== generation || q.paused) return;
      clearTimeout(q.watchdog);
      record({ type: 'end', index: q.index });
      q.index += 1;
      speakCurrent(q);
    };
    q.startedAt = clock?.now?.() ?? Date.now();
    q.sentenceMs = narrationMs(sentence) / q.rate;
    record({ type: 'start', index: q.index, text: sentence });
    if (simulate) {
      clock.after(q.sentenceMs, advance);
      return;
    }
    const utterance = new Utterance(sentence);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 0.95 * q.rate;
    utterance.pitch = 0.95;
    utterance.volume = volume;
    utterance.onend = advance;
    utterance.onerror = advance;
    /* A voice that never reports its end must not stall the briefing. */
    q.watchdog = setTimeout(advance, q.sentenceMs * 2.5 + 2500);
    /* After a cancel, Chrome can drop a speak() issued in the same task. */
    schedule(() => {
      if (q !== queue || q.gen !== generation || q.paused) return;
      synth.speak(utterance);
    });
  }

  function stopSpeech() {
    if (queue) clearTimeout(queue.watchdog);
    if (!simulate) synth?.cancel?.();
  }

  const narrator = {
    get available() {
      return Boolean(enabled && voice && (simulate || (synth && Utterance)));
    },
    get simulated() {
      return simulate;
    },
    get voiceName() {
      return voice ? `${voice.name} (${voice.lang})` : null;
    },
    get voiceCount() {
      return ranked.length;
    },
    /** The choices a presenter is offered: English voices, best first, novelty voices last. */
    get voices() {
      return ranked.map(({ id, label, tier }) => ({ id, label, tier }));
    },
    get voiceId() {
      return ranked.find((row) => row.voice === voice)?.id ?? null;
    },
    setVoice(id) {
      const row = ranked.find((item) => item.id === id);
      if (!row) return false;
      voice = row.voice;
      chosenId = id;
      try {
        storage?.setItem?.(STORAGE_KEY, id);
      } catch {
        /* Private windows refuse storage; the choice lasts for this page. */
      }
      for (const fn of listeners) fn();
      return true;
    },
    onChange(fn) {
      listeners.push(fn);
      return () => {
        listeners = listeners.filter((item) => item !== fn);
      };
    },
    get enabled() {
      return enabled;
    },
    setEnabled(on) {
      enabled = Boolean(on);
      if (!enabled) narrator.cancel();
      for (const fn of listeners) fn();
    },
    setVolume(value) {
      volume = Math.max(0, Math.min(1, value));
    },
    /** For QA: what is being said now, and roughly which word. */
    get speaking() {
      if (!queue || queue.paused) return null;
      const sentence = queue.sentences[queue.index];
      if (!sentence) return null;
      const words = sentence.split(/\s+/);
      const elapsed = (clock?.now?.() ?? Date.now()) - queue.startedAt;
      const word = Math.min(
        words.length - 1,
        Math.max(
          0,
          Math.floor((elapsed / Math.max(1, queue.sentenceMs)) * words.length),
        ),
      );
      return { sentence, index: queue.index, word, wordText: words[word] };
    },
    /** For tests: start and end events, in order. */
    get log() {
      return log.slice();
    },
    /** Speak a line. `done` resolves when it ends, errors, or is cancelled. */
    speak(text, { rate = 1 } = {}) {
      narrator.cancel();
      if (!narrator.available || !text)
        return { done: Promise.resolve(), cancel() {} };
      generation += 1;
      let resolve;
      const done = new Promise((r) => {
        resolve = r;
      });
      const q = {
        sentences: splitSentences(text),
        index: 0,
        gen: generation,
        rate,
        paused: false,
        resolve,
        watchdog: null,
      };
      queue = q;
      speakCurrent(q);
      return {
        done,
        cancel() {
          if (queue === q) narrator.cancel();
        },
      };
    },
    /** Stop, remembering the sentence; resume says it again from its start. */
    pause() {
      if (!queue || queue.paused) return;
      queue.paused = true;
      generation += 1;
      record({ type: 'pause', index: queue.index });
      stopSpeech();
    },
    resume() {
      if (!queue || !queue.paused) return;
      generation += 1;
      queue.paused = false;
      queue.gen = generation;
      record({ type: 'resume', index: queue.index });
      speakCurrent(queue);
    },
    cancel() {
      generation += 1;
      const q = queue;
      queue = null;
      if (q) {
        clearTimeout(q.watchdog);
        record({ type: 'cancel', index: q.index });
        q.resolve();
      }
      if (!simulate) synth?.cancel?.();
    },
    /** Say a sample line in a voice, without choosing it. */
    preview(
      id,
      text = 'Magnitude seven point eight. Focal depth, eight kilometres.',
    ) {
      const row =
        ranked.find((item) => item.id === id) ??
        ranked.find((item) => item.voice === voice);
      if (!row || simulate || !synth || !Utterance) return false;
      narrator.cancel();
      const utterance = new Utterance(text);
      utterance.voice = row.voice;
      utterance.lang = row.voice.lang;
      utterance.rate = 0.95;
      utterance.pitch = 0.95;
      utterance.volume = volume;
      schedule(() => synth.speak(utterance));
      return true;
    },
    destroy() {
      synth?.removeEventListener?.('voiceschanged', refresh);
      narrator.cancel();
      listeners = [];
    },
  };
  return narrator;
}
