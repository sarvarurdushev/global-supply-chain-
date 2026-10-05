/**
 * Sound design, synthesised: short accents on the mixer's SFX bus.
 *
 * Every cue is generated with the Web Audio API — oscillators, filtered noise
 * and envelopes — so there is no audio file to license, attribute or fetch,
 * and nothing borrowed from a film. The palette is deliberately restrained: a
 * briefing room, not a trailer. Accents are brief; the bed under the story is
 * the score (score.js), and the dramatic moments belong to it, not here.
 * Nothing plays until the presenter presses BEGIN BRIEFING, because browsers
 * only allow audio after a user gesture and sound that starts on its own is
 * an ambush.
 */

export const CUES = Object.freeze([
  'lock',
  'pulse',
  'reveal',
  'trace',
  'hit',
  'tick',
]);

export function createSoundBed({ engine }) {
  const ctx = () => engine.context;
  const out = () => engine.bus('sfx');

  function envelope(
    node,
    { attack = 0.01, hold = 0.05, release = 0.3, peak = 0.3 } = {},
  ) {
    const c = ctx();
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    node.connect(g);
    g.connect(out());
    return t + attack + hold + release + 0.05;
  }

  function tone(freq, type = 'sine', opts = {}) {
    const osc = ctx().createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const end = envelope(osc, opts);
    osc.start();
    osc.stop(end);
    return osc;
  }

  function noise(
    seconds,
    { filter = 800, q = 0.7, type = 'bandpass', ...opts } = {},
  ) {
    const c = ctx();
    const buffer = c.createBuffer(
      1,
      Math.ceil(c.sampleRate * seconds),
      c.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = filter;
    f.Q.value = q;
    src.connect(f);
    const end = envelope(f, opts);
    src.start();
    src.stop(end);
    return { src, f };
  }

  const play = {
    lock() {
      tone(880, 'sine', { peak: 0.05, hold: 0.02, release: 0.08 });
      setTimeout(
        () =>
          ctx() &&
          tone(1320, 'sine', { peak: 0.04, hold: 0.02, release: 0.12 }),
        70,
      );
    },
    pulse() {
      const osc = tone(62, 'sine', {
        peak: 0.4,
        attack: 0.005,
        hold: 0.08,
        release: 0.9,
      });
      osc.frequency.exponentialRampToValueAtTime(38, ctx().currentTime + 0.9);
      noise(0.5, { filter: 180, type: 'lowpass', peak: 0.1, release: 0.4 });
    },
    reveal() {
      const osc = tone(520, 'triangle', {
        peak: 0.05,
        attack: 0.02,
        hold: 0.06,
        release: 0.35,
      });
      osc.frequency.linearRampToValueAtTime(700, ctx().currentTime + 0.3);
    },
    trace() {
      const { f } = noise(1.6, {
        filter: 400,
        q: 4,
        peak: 0.04,
        attack: 0.2,
        hold: 0.9,
        release: 0.5,
      });
      f.frequency.exponentialRampToValueAtTime(2400, ctx().currentTime + 1.5);
    },
    /* A soft low knock: a figure landing. The big impacts are the score's. */
    hit() {
      tone(55, 'sine', { peak: 0.28, attack: 0.004, hold: 0.06, release: 0.8 });
      noise(0.6, { filter: 140, type: 'lowpass', peak: 0.08, release: 0.5 });
    },
    tick() {
      noise(0.03, {
        filter: 3200,
        q: 2,
        peak: 0.03,
        attack: 0.001,
        hold: 0.005,
        release: 0.02,
      });
    },
  };

  return {
    cue(name) {
      if (!engine.ready || engine.isMuted('sfx')) return;
      play[name]?.();
    },
    /** For callers that predate the mixer: the SFX bus level. */
    setVolume(value) {
      engine.setLevel('sfx', value * 0.9);
    },
    setMuted(value) {
      engine.setMuted('sfx', value);
    },
  };
}
