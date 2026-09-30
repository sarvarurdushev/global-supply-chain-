/**
 * The briefing's voice.
 *
 * ZERO-KEY DEFAULT: the Web Speech API. The voice is chosen at runtime from
 * whatever the browser and operating system provide, preferring a calm,
 * lower, documentary English register. No voice imitates or clones a real
 * person, and every line spoken is original briefing prose from the script.
 *
 * NO VOICE IS A NORMAL CASE. Headless browsers and some Linux desktops expose
 * none. Then `available` is false, the director times each beat by its
 * caption's reading time instead, and the captions carry the story — the
 * briefing never waits on speech that cannot happen.
 *
 * ADAPTERS. `createNarrator` accepts an `engine` with the same three methods
 * (`speak`, `pause`, `resume`, `cancel`), so a properly licensed TTS provider
 * can be plugged in later without touching the director. None is required.
 */

/** Ranked preferences, most wanted first. Generic system voice families only. */
const PREFERENCES = [
  /* Lower, measured English system voices. */
  /\b(Daniel|Arthur|George|Oliver|Ryan|Thomas|Guy|Brian|Christopher|Eric|Roger|Steffan|Davis|Andrew|Aaron|Evan)\b/i,
  /\bmale\b/i,
  /en-GB/i,
  /en-US/i,
  /^en/i,
];

/** Pick a voice from `getVoices()` output. Exported for its test. */
export function chooseVoice(voices) {
  const english = (voices ?? []).filter((voice) => /^en/i.test(voice.lang));
  if (!english.length) return null;
  const score = (voice) => {
    const text = `${voice.name} ${voice.lang}`;
    const rank = PREFERENCES.findIndex((pattern) => pattern.test(text));
    /* A local voice keeps working offline and starts faster. */
    return (
      (rank < 0 ? PREFERENCES.length : rank) * 2 + (voice.localService ? 0 : 1)
    );
  };
  return [...english].sort((a, b) => score(a) - score(b))[0];
}

export function createNarrator({
  synth = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
} = {}) {
  let voice = null;
  let enabled = true;
  let volume = 0.9;
  let voices = [];
  let current = null;

  function refresh() {
    voices = synth?.getVoices?.() ?? [];
    voice = chooseVoice(voices);
  }
  refresh();
  synth?.addEventListener?.('voiceschanged', refresh);

  return {
    get available() {
      return Boolean(enabled && synth && Utterance && voice);
    },
    get voiceName() {
      return voice ? `${voice.name} (${voice.lang})` : null;
    },
    get voiceCount() {
      return voices.length;
    },
    get enabled() {
      return enabled;
    },
    setEnabled(on) {
      enabled = Boolean(on);
      if (!enabled) synth?.cancel?.();
    },
    setVolume(value) {
      volume = Math.max(0, Math.min(1, value));
    },
    /** Speak one line. `done` resolves when it ends, errors, or is cancelled. */
    speak(text, { rate = 1 } = {}) {
      if (!this.available || !text)
        return { done: Promise.resolve(), cancel() {} };
      synth.cancel();
      const utterance = new Utterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = 0.95 * rate;
      utterance.pitch = 0.9;
      utterance.volume = volume;
      const done = new Promise((resolve) => {
        utterance.onend = resolve;
        utterance.onerror = resolve;
      });
      current = utterance;
      synth.speak(utterance);
      return {
        done,
        cancel() {
          if (current === utterance) synth.cancel();
        },
      };
    },
    pause: () => synth?.pause?.(),
    resume: () => synth?.resume?.(),
    cancel: () => synth?.cancel?.(),
    destroy() {
      synth?.removeEventListener?.('voiceschanged', refresh);
      synth?.cancel?.();
    },
  };
}
