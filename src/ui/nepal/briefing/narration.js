/**
 * The briefing's voice.
 *
 * THREE TIERS, AND THE BRIEFING NEVER FAILS FOR WANT OF ONE.
 *
 *   1. NEURAL. Kokoro-82M (Apache-2.0), rendered in advance: every sentence
 *      of the script is a short clip under public/audio/narration/, listed
 *      with its exact length in a manifest (scripts/build-narration.mjs).
 *      Clips load lazily — the next beat's while this one plays — and play
 *      through the mixer's VOICE bus, so the music ducks under them. No model
 *      runs in the browser and nothing leaves it. The voices are the model's
 *      own stock voices; none imitates or clones a real person.
 *   2. SYSTEM. The Web Speech API: whatever the browser and operating system
 *      provide, ranked by properties (language, natural/neural, local), never
 *      by a hard-coded name. Used when the presenter picks a system voice,
 *      when the clips are not there, or for any single sentence whose clip
 *      fails to load.
 *   3. CAPTIONS. No voice at all: the director times each beat by its
 *      caption's reading time, and the captions carry the story.
 *
 * `status` says which tier is speaking, in words a presenter can read: a
 * fallback is never hidden.
 *
 * SENTENCE BY SENTENCE. A line is a queue of sentences, each with its
 * delivery (speech.js). A neural clip pauses and resumes where it stopped; a
 * system sentence is stopped and, on resume, spoken again from its start,
 * because `speechSynthesis.pause()` is unreliable across browsers. A stale
 * sentence never speaks over the next beat: every queue carries a generation
 * token, and events from an older generation are ignored.
 *
 * QA: `simulate` replaces speech with the briefing clock. A sentence "lasts"
 * as long as the neural voice's clip for it (or the estimate, without a
 * manifest), pauses with the clock, and reports the word being spoken, so a
 * recording made without any speech engine runs at the real voice's pace.
 */

import {
  clipKey,
  estimateSentenceMs,
  sentencePlan,
  splitSentences,
} from '../../../nepal/briefing/speech.js';
import { spokenText } from '../../../nepal/briefing/pronunciation.js';
import { PREVIEW_LINE } from '../../../nepal/briefing/voices.js';

export { splitSentences };

export const MANIFEST_URL = '/audio/narration/manifest.json';
const CLIP_BASE = '/audio/narration/clips/';

/* Name fragments that mark a voice, by property rather than by identity. */
const QUALITY_HINT =
  /\b(natural|neural|premium|enhanced|online|wavenet|studio|hd)\b/i;
/* macOS novelty voices and bare eSpeak-style synthesisers: never a briefing voice. */
const NOVELTY_HINT =
  /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|grandma|grandpa|rocko|shelley|sandy|flo|eddy|reed)\b/i;
const BASIC_HINT = /\b(espeak|mbrola|festival|pico)\b/i;

/**
 * Every English system voice, best first, with the reason it ranks where it does.
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

/** The system voice the briefing uses when nobody has chosen one. */
export function chooseVoice(voices) {
  const best = rankVoices(voices).find((row) => row.tier !== 'NOVELTY');
  return best?.voice ?? null;
}

/** What the presenter is told is speaking. Honest by construction: it reads the tier in use. */
export const VOICE_STATUS = Object.freeze({
  neural: 'VOICE · HIGH-QUALITY LOCAL MODEL',
  system: 'VOICE · SYSTEM FALLBACK',
  simulated: 'QA · SIMULATED NARRATION',
  off: 'VOICE OFF · CAPTIONS',
  muted: 'VOICE MUTED · CAPTIONS',
  none: 'CAPTIONS ONLY · NO VOICE AVAILABLE',
});

const STORAGE_KEY = 'nepal-briefing-voice';
const NEURAL_PREFIX = 'neural:';
/** Decoded clips kept in memory: about two minutes of narration. */
const CLIP_CACHE = 48;

const dbToGain = (db) => 10 ** (db / 20);

export function createNarrator({
  synth = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
  storage = globalThis.localStorage,
  clock = null,
  simulate = false,
  schedule = (fn) => setTimeout(fn, 0),
  engine = null,
  manifest: initialManifest = null,
  AudioImpl = globalThis.Audio,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  objectUrl = globalThis.URL,
} = {}) {
  let manifest = null;
  let neuralRows = [];
  let systemRows = [];
  let row = null;
  let chosenId = null;
  let enabled = true;
  let muted = false;
  let volume = 0.9;
  /* Every queue and every cancel moves the generation on; older events are ignored. */
  let generation = 0;
  let queue = null;
  let listeners = [];
  let fallbacks = 0;
  let lastTier = null;
  const log = [];
  /** key → Promise<string|null> of a playable URL (a blob URL once fetched). */
  const clips = new Map();
  let player = null;
  let playerSource = null;

  try {
    chosenId = storage?.getItem?.(STORAGE_KEY) ?? null;
  } catch {
    chosenId = null;
  }

  const notify = () => {
    for (const fn of listeners) fn();
  };
  const now = () => clock?.now?.() ?? Date.now();
  const after = (ms, fn) => {
    if (clock) return clock.after(ms, fn);
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  };

  function setManifest(value) {
    manifest =
      value && value.clips && Array.isArray(value.voices) ? value : null;
    neuralRows = (manifest?.voices ?? []).map((voice) => ({
      id: `${NEURAL_PREFIX}${voice.id}`,
      neural: voice,
      tier: 'NEURAL',
      label: `${voice.label} — ${voice.accent === 'en-GB' ? 'English UK' : 'English US'}`,
    }));
  }

  function refresh() {
    systemRows = simulate
      ? []
      : rankVoices(synth?.getVoices?.() ?? []).map((r) => ({ ...r }));
    const all = [...neuralRows, ...systemRows];
    const chosen = all.find((r) => r.id === chosenId);
    const defaultNeural =
      neuralRows.find((r) => r.neural.default) ?? neuralRows[0];
    const bestSystem = systemRows.find((r) => r.tier !== 'NOVELTY');
    row = simulate
      ? {
          id: 'simulated',
          tier: 'SIMULATED',
          simulated: true,
          neural: defaultNeural?.neural ?? null,
          label: 'Simulated narration — QA',
        }
      : (chosen ?? defaultNeural ?? bestSystem ?? null);
    notify();
  }
  setManifest(initialManifest);
  refresh();
  synth?.addEventListener?.('voiceschanged', refresh);

  const record = (event) => {
    log.push({ ...event, at: now() });
    if (log.length > 400) log.shift();
  };

  /* ------------------------------------------------------------ clips */

  const keyFor = (voiceRow, sentence) =>
    voiceRow?.neural ? clipKey(voiceRow.neural.id, sentence) : null;
  const clipMs = (key) => {
    const ms = key ? manifest?.clips?.[key] : undefined;
    return Number.isFinite(ms) ? ms : null;
  };

  /** A playable URL for a clip, fetched once and kept as a blob while it is likely to be needed. */
  function loadClip(key) {
    if (clips.has(key)) {
      const hit = clips.get(key);
      clips.delete(key);
      clips.set(key, hit);
      return hit;
    }
    const url = `${CLIP_BASE}${key}.mp3`;
    const pending =
      fetchImpl && objectUrl?.createObjectURL
        ? fetchImpl(url)
            .then((response) => (response.ok ? response.blob() : null))
            .then((blob) => (blob ? objectUrl.createObjectURL(blob) : null))
            .catch(() => null)
        : Promise.resolve(url);
    clips.set(key, pending);
    while (clips.size > CLIP_CACHE) {
      const [oldKey, oldUrl] = clips.entries().next().value;
      clips.delete(oldKey);
      oldUrl.then(
        (u) => u?.startsWith?.('blob:') && objectUrl.revokeObjectURL?.(u),
      );
    }
    return pending;
  }

  /** One <audio> element for the whole briefing, routed once into the VOICE bus. */
  function audioElement() {
    if (!player && AudioImpl) {
      player = new AudioImpl();
      player.preload = 'auto';
      if ('preservesPitch' in player) player.preservesPitch = true;
    }
    if (player && !playerSource && engine?.context?.createMediaElementSource) {
      try {
        playerSource = engine.context.createMediaElementSource(player);
        playerSource.connect(engine.bus('voice'));
      } catch {
        playerSource = null;
      }
    }
    return player;
  }

  /* ------------------------------------------------------------ speaking */

  function duckStart(q) {
    if (q.ducked) return;
    q.ducked = true;
    engine?.speechStarted?.();
  }
  function duckEnd(q) {
    if (!q.ducked) return;
    q.ducked = false;
    engine?.speechEnded?.();
  }

  /** Speak the queue's current sentence; on its end, the next. */
  function speakCurrent(q) {
    if (q !== queue || q.gen !== generation || q.paused) return;
    if (q.index >= q.sentences.length) {
      queue = null;
      q.resolve();
      return;
    }
    const sentence = q.sentences[q.index];
    const gen = q.gen;
    const live = () => q === queue && q.gen === gen && !q.paused;
    /* One-shot: a clip's end, its watchdog and a fallback can all report; only the first counts. */
    let advanced = false;
    const advance = () => {
      if (advanced || !live()) return;
      advanced = true;
      clearTimeout(q.watchdog);
      duckEnd(q);
      record({ type: 'end', index: q.index, tier: q.tier });
      q.index += 1;
      q.offsetS = 0;
      speakCurrent(q);
    };
    const key = keyFor(q.voice, sentence);
    const known = clipMs(key);
    q.startedAt = now();
    q.sentenceMs = (known ?? estimateSentenceMs(sentence)) / q.rate;

    if (q.voice.simulated) {
      q.tier = 'simulated';
      record({
        type: 'start',
        index: q.index,
        text: sentence.text,
        tier: q.tier,
        key,
        ms: q.sentenceMs,
      });
      duckStart(q);
      clock.after(q.sentenceMs, advance);
      return;
    }
    if (q.voice.neural && known !== null && AudioImpl) {
      playNeural(q, sentence, key, live, advance);
      return;
    }
    if (q.voice.neural) fellBack(q, sentence, 'no clip for this sentence');
    playSystem(q, sentence, live, advance);
  }

  function fellBack(q, sentence, reason) {
    fallbacks += 1;
    record({ type: 'fallback', index: q.index, text: sentence.text, reason });
    notify();
  }

  function playNeural(q, sentence, key, live, advance) {
    q.tier = 'neural';
    lastTier = 'neural';
    record({
      type: 'start',
      index: q.index,
      text: sentence.text,
      tier: 'neural',
      key,
      ms: q.sentenceMs,
    });
    const fail = (reason) => {
      if (!live()) return;
      clearTimeout(q.watchdog);
      fellBack(q, sentence, reason);
      playSystem(q, sentence, live, advance);
    };
    loadClip(key).then((url) => {
      if (!live()) return;
      if (!url) return fail('clip did not load');
      const audio = audioElement();
      audio.onended = advance;
      audio.onerror = () => fail('clip did not play');
      /* On resume the clip is already loaded and parked where it paused. */
      if (!q.offsetS || audio.src !== url) {
        audio.src = url;
        if (q.offsetS) audio.currentTime = q.offsetS;
      }
      audio.playbackRate = q.rate;
      audio.volume = playerSource ? 1 : muted ? 0 : volume;
      duckStart(q);
      /* A clip that never reports its end must not stall the briefing. */
      q.watchdog = setTimeout(advance, q.sentenceMs * 1.6 + 2500);
      Promise.resolve(audio.play?.()).catch(() => fail('playback was refused'));
    });
  }

  function playSystem(q, sentence, live, advance) {
    const system = q.voice.neural ? bestSystemRow() : q.voice;
    if (!system || !synth || !Utterance) {
      /* No voice left: the sentence passes in silence, timed, and the caption carries it. */
      q.tier = 'silent';
      record({
        type: 'start',
        index: q.index,
        text: sentence.text,
        tier: 'silent',
      });
      after(estimateSentenceMs(sentence) / q.rate, advance);
      return;
    }
    q.tier = 'system';
    lastTier = q.voice.neural ? lastTier : 'system';
    const speak = () => {
      if (!live()) return;
      const utterance = new Utterance(spokenText(sentence.text));
      utterance.voice = system.voice;
      utterance.lang = system.voice.lang;
      utterance.rate = 0.95 * q.rate * sentence.rate;
      utterance.pitch = 0.95;
      utterance.volume = muted
        ? 0
        : Math.min(1, volume * dbToGain(sentence.energy * 1.5));
      let finished = false;
      const finish = () => {
        if (finished || !live()) return;
        finished = true;
        clearTimeout(q.watchdog);
        duckEnd(q);
        if (sentence.pauseAfter) after(sentence.pauseAfter / q.rate, advance);
        else advance();
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      record({
        type: 'start',
        index: q.index,
        text: sentence.text,
        tier: 'system',
      });
      duckStart(q);
      /* A voice that never reports its end must not stall the briefing. */
      q.watchdog = setTimeout(finish, q.sentenceMs * 2.5 + 2500);
      /* After a cancel, Chrome can drop a speak() issued in the same task. */
      schedule(() => {
        if (live()) synth.speak(utterance);
      });
    };
    if (sentence.pauseBefore) after(sentence.pauseBefore / q.rate, speak);
    else speak();
  }

  function bestSystemRow() {
    return systemRows.find((r) => r.tier !== 'NOVELTY') ?? null;
  }

  function stopSound() {
    if (queue) clearTimeout(queue.watchdog);
    if (player) {
      player.onended = null;
      player.onerror = null;
      player.pause?.();
    }
    if (!simulate) synth?.cancel?.();
  }

  const narrator = {
    get available() {
      if (!enabled || !row) return false;
      if (row.simulated) return Boolean(clock);
      if (row.neural) return true;
      return Boolean(synth && Utterance);
    },
    get simulated() {
      return simulate;
    },
    /** True when the chosen voice is the neural one. */
    get neural() {
      return Boolean(row?.neural && !row.simulated);
    },
    get voiceName() {
      if (!row) return null;
      if (row.simulated) return 'Simulated narration (QA)';
      if (row.neural) return `${row.neural.label} (Kokoro-82M)`;
      return `${row.voice.name} (${row.voice.lang})`;
    },
    get voiceCount() {
      return neuralRows.length + systemRows.length;
    },
    /** The choices a presenter is offered: the neural voices, then system voices best first. */
    get voices() {
      return [...neuralRows, ...systemRows].map(({ id, label, tier }) => ({
        id,
        label,
        tier,
      }));
    },
    get voiceId() {
      return row?.id ?? null;
    },
    /**
     * Which tier is speaking, in words. `label` is what the presenter sees;
     * `fallbacks` counts sentences a neural voice could not say itself.
     */
    get status() {
      let tier;
      if (!row && !simulate) tier = 'none';
      else if (!enabled) tier = 'off';
      else if (muted) tier = 'muted';
      else if (row.simulated) tier = 'simulated';
      else if (row.neural) tier = 'neural';
      else tier = synth && Utterance ? 'system' : 'none';
      const detail =
        tier === 'neural'
          ? `${row.neural.label} · Kokoro-82M, rendered in advance${fallbacks ? ` · ${fallbacks} sentence${fallbacks === 1 ? '' : 's'} fell back to the system voice` : ''}`
          : tier === 'system'
            ? `${row.voice.name} · the browser's own voice${neuralRows.length ? '' : ' · the neural clips are not available here'}`
            : tier === 'simulated'
              ? manifest
                ? 'Timed by the neural voice’s clips'
                : 'Timed by estimate (no clip manifest)'
              : '';
      return { tier, label: VOICE_STATUS[tier], detail, fallbacks, lastTier };
    },
    /** Load the neural clip manifest. Resolves true if neural voices are now offered. */
    async load(url = MANIFEST_URL) {
      if (!fetchImpl) return false;
      try {
        const response = await fetchImpl(url);
        if (!response.ok) return false;
        setManifest(await response.json());
      } catch {
        setManifest(null);
      }
      refresh();
      return neuralRows.length > 0;
    },
    get manifest() {
      return manifest;
    },
    /**
     * The exact spoken length of a line in the current voice, from its
     * clips, or null when the voice is not neural or a clip is missing.
     */
    measureMs(text, prosody = null) {
      if (!row?.neural || !text) return null;
      let total = 0;
      for (const sentence of sentencePlan(text, prosody)) {
        const ms = clipMs(keyFor(row, sentence));
        if (ms === null) return null;
        total += ms;
      }
      return total;
    },
    setVoice(id) {
      const next = [...neuralRows, ...systemRows].find(
        (item) => item.id === id,
      );
      if (!next || simulate) return false;
      row = next;
      chosenId = id;
      try {
        storage?.setItem?.(STORAGE_KEY, id);
      } catch {
        /* Private windows refuse storage; the choice lasts for this page. */
      }
      notify();
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
      notify();
    },
    /**
     * MUTE keeps the voice's pace and silences it: the run neither speeds up
     * nor jumps, and the captions carry the words. (VOICE OFF — `setEnabled`
     * — instead times each beat by reading pace.)
     */
    setMuted(on) {
      muted = Boolean(on);
      engine?.setMuted?.('voice', muted);
      if (player && !playerSource) player.volume = muted ? 0 : volume;
      notify();
    },
    get muted() {
      return muted;
    },
    /** Voice volume, 0–1: the VOICE bus for neural clips, the utterance volume for system voices. */
    setVolume(value) {
      volume = Math.max(0, Math.min(1, value));
      engine?.setLevel?.('voice', volume);
      if (player && !playerSource) player.volume = muted ? 0 : volume;
    },
    get volume() {
      return volume;
    },
    /** For QA: what is being said now, and roughly which word. */
    get speaking() {
      if (!queue || queue.paused) return null;
      const sentence = queue.sentences[queue.index];
      if (!sentence) return null;
      const words = sentence.text.split(/\s+/);
      const elapsed =
        queue.tier === 'neural' && player && Number.isFinite(player.currentTime)
          ? (player.currentTime * 1000) / queue.rate
          : now() - queue.startedAt;
      const word = Math.min(
        words.length - 1,
        Math.max(
          0,
          Math.floor((elapsed / Math.max(1, queue.sentenceMs)) * words.length),
        ),
      );
      return {
        sentence: sentence.text,
        index: queue.index,
        word,
        wordText: words[word],
        tier: queue.tier,
      };
    },
    /** For QA: the neural clip element's state (null before any clip has played). */
    get clip() {
      return player
        ? {
            paused: player.paused,
            src: String(player.src ?? ''),
            time: player.currentTime,
          }
        : null;
    },
    /** For tests: start, end, fallback events, in order. */
    get log() {
      return log.slice();
    },
    /** Fetch a line's clips ahead of time (the next beat, while this one plays). */
    prefetch(text, prosody = null) {
      if (!row?.neural || simulate || !text) return 0;
      let n = 0;
      for (const sentence of sentencePlan(text, prosody)) {
        const key = keyFor(row, sentence);
        if (clipMs(key) !== null) {
          void loadClip(key);
          n += 1;
        }
      }
      return n;
    },
    /** Speak a line. `done` resolves when it ends, errors, or is cancelled. */
    speak(text, { rate = 1, prosody = null } = {}) {
      narrator.cancel();
      if (!narrator.available || !text)
        return { done: Promise.resolve(), cancel() {} };
      generation += 1;
      let resolve;
      const done = new Promise((r) => {
        resolve = r;
      });
      const q = {
        sentences: sentencePlan(text, prosody),
        index: 0,
        gen: generation,
        rate,
        voice: row,
        paused: false,
        resolve,
        watchdog: null,
        offsetS: 0,
        ducked: false,
        tier: null,
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
    /** Stop where we are. A neural clip resumes mid-sentence; a system sentence is said again. */
    pause() {
      if (!queue || queue.paused) return;
      queue.offsetS =
        queue.tier === 'neural' && player ? player.currentTime || 0 : 0;
      queue.paused = true;
      generation += 1;
      record({ type: 'pause', index: queue.index });
      stopSound();
      duckEnd(queue);
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
      stopSound();
      if (q) {
        record({ type: 'cancel', index: q.index });
        if (q.ducked) {
          q.ducked = false;
          engine?.speechReset?.();
        }
        q.resolve();
      }
    },
    /** Say the sample line in a voice, without choosing it. */
    preview(id) {
      const target =
        [...neuralRows, ...systemRows].find((item) => item.id === id) ?? row;
      if (!target || simulate) return false;
      narrator.cancel();
      if (target.neural) {
        const key = target.neural.preview;
        if (!key || !AudioImpl) return false;
        loadClip(key).then((url) => {
          if (!url || queue) return;
          const audio = audioElement();
          audio.onended = null;
          audio.onerror = null;
          audio.src = url;
          audio.playbackRate = 1;
          audio.volume = playerSource ? 1 : volume;
          Promise.resolve(audio.play?.()).catch(() => {});
        });
        return true;
      }
      if (!synth || !Utterance) return false;
      const utterance = new Utterance(spokenText(PREVIEW_LINE));
      utterance.voice = target.voice;
      utterance.lang = target.voice.lang;
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
      for (const pending of clips.values())
        pending.then(
          (u) => u?.startsWith?.('blob:') && objectUrl.revokeObjectURL?.(u),
        );
      clips.clear();
    },
  };
  return narrator;
}
