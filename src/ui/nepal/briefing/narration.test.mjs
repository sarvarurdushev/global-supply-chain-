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
