/**
 * Sound design, synthesised.
 *
 * Every cue is generated with the Web Audio API — oscillators, filtered noise
 * and envelopes — so there is no audio file to license, attribute or fetch,
 * and nothing borrowed from a film. The palette is deliberately restrained: a
 * briefing room, not a trailer. Nothing plays until the presenter presses
 * BEGIN BRIEFING, because browsers only allow audio after a user gesture and
 * because sound that starts on its own is an ambush.
 */

export const CUES = Object.freeze([
  'ambience',
  'lock',
  'pulse',
  'reveal',
  'trace',
  'hit',
  'tick',
]);

export function createSoundBed({
  AudioContextImpl = globalThis.AudioContext ?? globalThis.webkitAudioContext,
} = {}) {
  let ctx = null;
  let master = null;
  let ambience = null;
  let muted = false;
  let volume = 0.5;

  function ensure() {
    if (ctx || !AudioContextImpl) return ctx;
    ctx = new AudioContextImpl();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
    return ctx;
  }

  function envelope(
    node,
    { attack = 0.01, hold = 0.05, release = 0.3, peak = 0.3 } = {},
  ) {
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    node.connect(g);
    g.connect(master);
    return t + attack + hold + release + 0.05;
  }

  function tone(freq, type = 'sine', opts = {}) {
    const osc = ctx.createOscillator();
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
    const buffer = ctx.createBuffer(
      1,
      Math.ceil(ctx.sampleRate * seconds),
      ctx.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const f = ctx.createBiquadFilter();
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
      tone(880, 'sine', { peak: 0.08, hold: 0.02, release: 0.08 });
      setTimeout(
        () =>
          ctx && tone(1320, 'sine', { peak: 0.06, hold: 0.02, release: 0.12 }),
        70,
      );
    },
    pulse() {
      const osc = tone(62, 'sine', {
        peak: 0.45,
        attack: 0.005,
        hold: 0.08,
        release: 0.9,
      });
      osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.9);
      noise(0.5, { filter: 180, type: 'lowpass', peak: 0.12, release: 0.4 });
    },
    reveal() {
      const osc = tone(520, 'triangle', {
        peak: 0.07,
        attack: 0.02,
        hold: 0.06,
        release: 0.35,
      });
      osc.frequency.linearRampToValueAtTime(700, ctx.currentTime + 0.3);
    },
    trace() {
      const { f } = noise(1.6, {
        filter: 400,
        q: 4,
        peak: 0.05,
        attack: 0.2,
        hold: 0.9,
        release: 0.5,
      });
      f.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 1.5);
    },
    hit() {
      tone(48, 'sine', { peak: 0.5, attack: 0.004, hold: 0.1, release: 1.6 });
      noise(1.2, { filter: 120, type: 'lowpass', peak: 0.18, release: 1.1 });
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
    ambience() {
      if (ambience) return;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 55;
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 82.4;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 180;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(0.035, ctx.currentTime + 4);
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(g);
      g.connect(master);
      osc.start();
      osc2.start();
      ambience = { osc, osc2, g };
    },
  };

  return {
    /** Must be called from a user gesture (BEGIN BRIEFING). */
    unlock() {
      ensure();
      return ctx?.resume?.();
    },
    get ready() {
      return Boolean(ctx && ctx.state === 'running');
    },
    cue(name) {
      if (!ctx || ctx.state !== 'running' || muted) return;
      play[name]?.();
    },
    setMuted(value) {
      muted = Boolean(value);
      if (master) master.gain.value = muted ? 0 : volume;
    },
    get muted() {
      return muted;
    },
    setVolume(value) {
      volume = Math.max(0, Math.min(1, value));
      if (master && !muted) master.gain.value = volume;
    },
    get volume() {
      return volume;
    },
    suspend: () => ctx?.suspend?.(),
    resume: () => ctx?.resume?.(),
    destroy() {
      ambience?.osc.stop();
      ambience?.osc2.stop();
      ctx?.close?.();
      ctx = null;
    },
  };
}
