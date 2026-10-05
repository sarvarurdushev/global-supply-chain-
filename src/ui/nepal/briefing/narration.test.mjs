import test from 'node:test';
import assert from 'node:assert/strict';
import { createClock } from '../../../nepal/briefing/clock.js';
import { chooseVoice, createNarrator, rankVoices, splitSentences } from './narration.js';

const VOICES = [
  { name: 'Albert', lang: 'en-US', localService: true, voiceURI: 'albert' },
  { name: 'Daniel', lang: 'en-GB', localService: true, voiceURI: 'daniel' },
  { name: 'Microsoft Ryan Online (Natural) - English (United Kingdom)', lang: 'en-GB', localService: false, voiceURI: 'ryan' },
  { name: 'Google UK English Male', lang: 'en-GB', localService: false, voiceURI: 'google-uk' },
  { name: 'eSpeak English', lang: 'en', localService: true, voiceURI: 'espeak' },
  { name: 'Thomas', lang: 'fr-FR', localService: true, voiceURI: 'thomas' },
];

function mockSynth(voices = VOICES) {
  const spoken = [];
  let current = null;
  let cancels = 0;
  return {
    spoken,
    get cancels() {
      return cancels;
    },
    get current() {
      return current;
    },
    getVoices: () => voices,
    addEventListener() {},
    removeEventListener() {},
    speak(utterance) {
      /* Two utterances at once is exactly what must never happen. */
      assert.equal(current, null, `"${utterance.text}" started while "${current?.text}" was still speaking`);
      spoken.push({ text: utterance.text, voice: utterance.voice?.name });
      current = utterance;
    },
    cancel() {
      cancels += 1;
      const was = current;
      current = null;
      /* Browsers report a cancelled utterance as an error. */
      was?.onerror?.({ error: 'interrupted' });
    },
    finish() {
      const was = current;
      current = null;
      was?.onend?.();
    },
  };
}
class Utterance {
  constructor(text) {
    this.text = text;
  }
}
const now = (fn) => fn();
const memory = () => {
  const store = new Map();
  return { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
};

test('sentences split on full stops, not inside a magnitude or a count', () => {
  assert.deepEqual(splitSentences('Magnitude 7.8. It struck at 06:11 UTC. 4,583 sites were mapped.'), ['Magnitude 7.8.', 'It struck at 06:11 UTC.', '4,583 sites were mapped.']);
});

test('voices rank by their properties: natural first, novelty and basic voices last, English only', () => {
  const ranked = rankVoices(VOICES);
  assert.equal(ranked[0].id, 'ryan');
  assert.equal(ranked[0].tier, 'NATURAL');
  assert.ok(!ranked.some((row) => row.id === 'thomas'), 'not English');
  assert.equal(ranked.at(-1).id, 'albert');
  assert.equal(ranked.at(-1).tier, 'NOVELTY');
  assert.ok(ranked.findIndex((r) => r.id === 'daniel') < ranked.findIndex((r) => r.id === 'espeak'));
  assert.equal(chooseVoice(VOICES).voiceURI, 'ryan');
  assert.equal(chooseVoice([VOICES[0]]), null, 'a novelty voice is never chosen on its own');
  assert.match(ranked.find((r) => r.id === 'daniel').label, /Daniel — English UK/);
});

test('a line is spoken sentence by sentence, and done resolves at the end', async () => {
  const synth = mockSynth();
  const narrator = createNarrator({ synth, Utterance, schedule: now, storage: memory() });
  let finished = false;
  const line = narrator.speak('First sentence. Second sentence.');
  line.done.then(() => {
    finished = true;
  });
  assert.equal(synth.spoken.length, 1);
  synth.finish();
  assert.equal(synth.spoken.length, 2);
  assert.equal(synth.spoken[1].text, 'Second sentence.');
  synth.finish();
  await line.done;
  assert.ok(finished);
});

test('a new line stops the old one at once, and the old line never speaks again', () => {
  const synth = mockSynth();
  const narrator = createNarrator({ synth, Utterance, schedule: now, storage: memory() });
  narrator.speak('Old one. Old two. Old three.');
  narrator.speak('New one. New two.');
  synth.finish();
  synth.finish();
  assert.deepEqual(synth.spoken.map((s) => s.text), ['Old one.', 'New one.', 'New two.']);
});

test('pause stops speech; resume says the interrupted sentence again, then carries on', () => {
  const synth = mockSynth();
  const narrator = createNarrator({ synth, Utterance, schedule: now, storage: memory() });
  narrator.speak('One. Two. Three.');
  synth.finish();
  narrator.pause();
  assert.equal(synth.current, null, 'nothing is speaking while paused');
  narrator.resume();
  synth.finish();
  synth.finish();
  assert.deepEqual(synth.spoken.map((s) => s.text), ['One.', 'Two.', 'Two.', 'Three.']);
});

test('the presenter’s voice choice is used, remembered, and previewed without being spoken over', () => {
  const storage = memory();
  const synth = mockSynth();
  const narrator = createNarrator({ synth, Utterance, schedule: now, storage });
  assert.ok(narrator.setVoice('daniel'));
  narrator.speak('A line.');
  assert.equal(synth.spoken[0].voice, 'Daniel');
  const again = createNarrator({ synth: mockSynth(), Utterance, schedule: now, storage });
  assert.equal(again.voiceId, 'daniel');
  synth.finish();
  assert.ok(narrator.preview('google-uk'));
  assert.equal(synth.spoken.at(-1).voice, 'Google UK English Male');
  assert.equal(narrator.voiceId, 'daniel', 'a preview does not change the choice');
});

test('with no English voice the narrator is unavailable and speaking resolves at once', async () => {
  const narrator = createNarrator({ synth: mockSynth([VOICES[5]]), Utterance, schedule: now, storage: memory() });
  assert.equal(narrator.available, false);
  await narrator.speak('Nothing.').done;
});

test('simulated narration runs on the briefing clock and pauses with it', async () => {
  const clock = createClock();
  clock.start();
  const narrator = createNarrator({ clock, simulate: true, storage: memory() });
  assert.ok(narrator.available);
  let finished = false;
  narrator.speak('One two three four five. Six seven.').done.then(() => {
    finished = true;
  });
  assert.equal(narrator.speaking.index, 0);
  clock.advance(2_600);
  assert.equal(narrator.speaking.index, 1, 'the second sentence follows the first on the clock');
  narrator.pause();
  clock.advance(10_000);
  assert.equal(finished, false, 'paused speech does not finish');
  narrator.resume();
  for (let i = 0; i < 10; i += 1) clock.advance(500);
  await new Promise((r) => setImmediate(r));
  assert.ok(finished);
});

/* ------------------------------------------------------------------ neural */

import { clipKey, sentencePlan } from '../../../nepal/briefing/speech.js';

function neuralManifest(lines, voice = 'af_heart', ms = 1500) {
  const clips = {};
  for (const line of lines) for (const s of sentencePlan(line)) clips[clipKey(voice, s)] = ms;
  clips['preview-x'] = 2000;
  return {
    schemaVersion: 1,
    voices: [{ id: voice, label: 'Neural narrator · calm, female', accent: 'en-US', default: true, preview: 'preview-x' }],
    clips,
  };
}
class FakeAudio {
  static played = [];
  constructor() {
    this.src = '';
    this.currentTime = 0;
    this.paused = true;
  }
  play() {
    FakeAudio.played.push(this.src);
    FakeAudio.current = this;
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  end() {
    this.paused = true;
    this.onended?.();
  }
}
const flush = () => new Promise((r) => setImmediate(r));
const fakeFetch = (missing = new Set()) => async (url) => ({
  ok: !missing.has(url),
  blob: async () => url,
});
const fakeUrl = { createObjectURL: (blob) => `blob:${blob}`, revokeObjectURL() {} };
function fakeEngine() {
  const calls = [];
  return {
    calls,
    speechStarted: () => calls.push('start'),
    speechEnded: () => calls.push('end'),
    speechReset: () => calls.push('reset'),
    setLevel: (bus, v) => calls.push(`level:${bus}:${v}`),
  };
}

test('the neural voice is offered first and chosen by default, and status says so honestly', () => {
  const narrator = createNarrator({ synth: mockSynth(), Utterance, schedule: now, storage: memory(), manifest: neuralManifest(['A line.']), AudioImpl: FakeAudio });
  assert.equal(narrator.voices[0].tier, 'NEURAL');
  assert.equal(narrator.voiceId, 'neural:af_heart');
  assert.equal(narrator.status.tier, 'neural');
  assert.equal(narrator.status.label, 'VOICE · HIGH-QUALITY LOCAL MODEL');
  narrator.setVoice('daniel');
  assert.equal(narrator.status.label, 'VOICE · SYSTEM FALLBACK');
  narrator.setEnabled(false);
  assert.equal(narrator.status.label, 'VOICE OFF · CAPTIONS');
});

test('without the clip manifest the system voice speaks, and the status names it a fallback', () => {
  const narrator = createNarrator({ synth: mockSynth(), Utterance, schedule: now, storage: memory(), AudioImpl: FakeAudio });
  assert.equal(narrator.voiceId, 'ryan');
  assert.equal(narrator.status.tier, 'system');
  assert.match(narrator.status.detail, /neural clips are not available/);
  const none = createNarrator({ synth: mockSynth([]), Utterance, schedule: now, storage: memory() });
  assert.equal(none.status.label, 'CAPTIONS ONLY · NO VOICE AVAILABLE');
});

test('neural clips play sentence by sentence, duck the music, and a clip that fails falls back to the system voice for that sentence only', async () => {
  const line = 'First sentence. Second sentence. Third sentence.';
  const manifest = neuralManifest([line]);
  const second = clipKey('af_heart', sentencePlan(line)[1]);
  const synth = mockSynth();
  const engine = fakeEngine();
  FakeAudio.played = [];
  const narrator = createNarrator({ synth, Utterance, schedule: now, storage: memory(), manifest, AudioImpl: FakeAudio, engine, fetchImpl: fakeFetch(new Set([`/audio/narration/clips/${second}.mp3`])), objectUrl: fakeUrl });
  const { done } = narrator.speak(line);
  await flush();
  assert.equal(FakeAudio.played.length, 1);
  FakeAudio.current.end();
  await flush();
  /* The second clip does not exist: the system voice says that sentence, in its spoken form. */
  assert.equal(synth.spoken.length, 1);
  assert.equal(synth.spoken[0].text, 'Second sentence.');
  assert.equal(narrator.status.fallbacks, 1);
  assert.match(narrator.status.detail, /1 sentence fell back/);
  synth.finish();
  await flush();
  assert.equal(FakeAudio.played.length, 2, 'the third sentence is neural again');
  FakeAudio.current.end();
  await done;
  assert.deepEqual(engine.calls, ['start', 'end', 'start', 'end', 'start', 'end']);
});

test('a neural clip pauses where it is and resumes from there; NEXT cancels it at once', async () => {
  const line = 'Only sentence here.';
  const engine = fakeEngine();
  const narrator = createNarrator({ synth: mockSynth(), Utterance, schedule: now, storage: memory(), manifest: neuralManifest([line]), AudioImpl: FakeAudio, engine, fetchImpl: fakeFetch(), objectUrl: fakeUrl });
  narrator.speak(line);
  await flush();
  const audio = FakeAudio.current;
  audio.currentTime = 0.8;
  narrator.pause();
  assert.ok(audio.paused);
  narrator.resume();
  await flush();
  assert.equal(audio.currentTime, 0.8, 'resumed mid-clip, not from the start');
  assert.equal(audio.paused, false);
  narrator.cancel();
  assert.ok(audio.paused, 'cancel stops the clip');
  assert.equal(engine.calls.at(-1), 'reset');
});

test('measured length comes from the clips, and is null for a line the clips do not cover', () => {
  const line = 'One. Two.';
  const narrator = createNarrator({ synth: mockSynth(), Utterance, schedule: now, storage: memory(), manifest: neuralManifest([line], 'af_heart', 1234), AudioImpl: FakeAudio });
  assert.equal(narrator.measureMs(line), 2468);
  assert.equal(narrator.measureMs('Not rendered.'), null);
  narrator.setVoice('daniel');
  assert.equal(narrator.measureMs(line), null, 'a system voice is estimated, not measured');
});

test('simulated narration is timed by the neural clips when the manifest is there', () => {
  const line = 'One two three. Four.';
  const clock = createClock();
  clock.start();
  const narrator = createNarrator({ clock, simulate: true, storage: memory(), manifest: neuralManifest([line], 'af_heart', 4000) });
  narrator.speak(line);
  clock.advance(3_900);
  assert.equal(narrator.speaking.index, 0, 'a 4-second clip is still speaking at 3.9 s');
  clock.advance(200);
  assert.equal(narrator.speaking.index, 1);
  assert.match(narrator.status.detail, /neural voice/);
});

test('the system voice says the spoken form and honours the delivery: rate, volume, pauses', () => {
  const synth = mockSynth();
  const clock = createClock();
  clock.start();
  const narrator = createNarrator({ synth, Utterance, schedule: now, storage: memory(), clock });
  narrator.speak('It struck at 06:11 UTC. Then M7.3.', { prosody: { 1: { pauseBefore: 600, rate: 0.9, energy: -2 } } });
  assert.equal(synth.spoken[0].text, 'It struck at 6 11 UTC.');
  synth.finish();
  assert.equal(synth.spoken.length, 1, 'the pause before the second sentence is real');
  clock.advance(650);
  assert.equal(synth.spoken[1].text, 'Then magnitude 7.3.');
  assert.ok(Math.abs(synth.current.rate - 0.95 * 0.9) < 1e-9);
  assert.ok(synth.current.volume < 0.9 * 0.75, 'quieter by 3 dB');
});
