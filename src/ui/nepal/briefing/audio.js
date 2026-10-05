/**
 * The briefing's mixer: one AudioContext, three buses, one limiter.
 *
 *   VOICE  narration — the neural clips, routed here; dominant.
 *   MUSIC  the score — background, ducked under the voice.
 *   SFX    short accents (lock, reveal, impact) — brief, never a bed.
 *
 *   voice ─────────────┐
 *   music ── duck ─────┼── master ── limiter ── speakers
 *   sfx ───────────────┘
 *
 * DUCKING. When narration starts the music's duck gain glides down to
 * about −10 dB in a quarter of a second; when narration stops it waits
 * (sentence gaps are short, and pumping between every sentence is worse
 * than none) and then rises back over two seconds. Ramps only — no cuts.
 *
 * LOUDNESS. Clips are rendered to about −20 dBFS speech RMS; the music bed
 * sits about 14 dB under that before ducking. A limiter on the master stops
 * anything clipping when a cue lands on a loud word.
 */

export const MIX = Object.freeze({
  voice: 0.95,
  music: 0.32,
  sfx: 0.5,
  /** Music level while narration speaks, as a fraction (≈ −10 dB). */
  duck: 0.32,
  duckAttackS: 0.25,
  duckHoldS: 0.7,
  duckReleaseS: 2.0,
});

export function createAudioEngine({
  AudioContextImpl = globalThis.AudioContext ?? globalThis.webkitAudioContext,
} = {}) {
  let ctx = null;
  let master = null;
  let buses = null;
  let duckGain = null;
  let speaking = 0;
  let releaseTimer = null;
  /* A resume racing a pause's fade must win: each pause or resume moves this on. */
  let transport = 0;
  const levels = { voice: MIX.voice, music: MIX.music, sfx: MIX.sfx };
  const muted = { voice: false, music: false, sfx: false };

  function ensure() {
    if (ctx || !AudioContextImpl) return ctx;
    ctx = new AudioContextImpl();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(limiter);
    limiter.connect(ctx.destination);
    duckGain = ctx.createGain();
    duckGain.gain.value = 1;
    duckGain.connect(master);
    buses = {
      voice: ctx.createGain(),
      music: ctx.createGain(),
      sfx: ctx.createGain(),
    };
    buses.voice.connect(master);
    buses.music.connect(duckGain);
    buses.sfx.connect(master);
    for (const name of Object.keys(buses)) apply(name, 0);
    return ctx;
  }

  function apply(name, rampS = 0.15) {
    if (!buses) return;
    const target = muted[name] ? 0 : levels[name];
    const g = buses[name].gain;
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    if (rampS > 0) g.linearRampToValueAtTime(target, t + rampS);
    else g.setValueAtTime(target, t);
  }

  function duckTo(value, timeConstantS) {
    if (!duckGain) return;
    const g = duckGain.gain;
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(value, t, timeConstantS / 3);
  }

  return {
    /** Must run inside a user gesture (BEGIN, PREVIEW): browsers allow audio only then. */
    unlock() {
      ensure();
      return ctx ? this.resume() : Promise.resolve();
    },
    get context() {
      return ctx;
    },
    get ready() {
      return Boolean(ctx && ctx.state === 'running');
    },
    bus(name) {
      ensure();
      return buses?.[name] ?? null;
    },
    setLevel(name, value) {
      levels[name] = Math.max(0, Math.min(1, value));
      apply(name);
    },
    level: (name) => levels[name],
    setMuted(name, value) {
      muted[name] = Boolean(value);
      apply(name, 0.4);
    },
    isMuted: (name) => muted[name],
    /** Narration began a sentence: bring the music down. */
    speechStarted() {
      speaking += 1;
      clearTimeout(releaseTimer);
      duckTo(MIX.duck, MIX.duckAttackS);
    },
    /** Narration finished a sentence: let the music back up, unless more follows at once. */
    speechEnded() {
      speaking = Math.max(0, speaking - 1);
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(() => {
        if (speaking === 0) duckTo(1, MIX.duckReleaseS);
      }, MIX.duckHoldS * 1000);
    },
    /** Speech was cancelled outright (NEXT, BACK, leave). */
    speechReset() {
      speaking = 0;
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(
        () => duckTo(1, MIX.duckReleaseS),
        MIX.duckHoldS * 1000,
      );
    },
    /** For QA: the duck gain's value now. */
    get duckLevel() {
      return duckGain?.gain.value ?? 1;
    },
    /**
     * PAUSE: everything fades out in a fifth of a second and the context
     * stops, so nothing — voice, music, a cue's tail — carries on under a
     * paused picture. RESUME brings it back the same way.
     */
    pause() {
      if (!ctx || ctx.state !== 'running') return Promise.resolve();
      const mine = (transport += 1);
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + 0.2);
      return new Promise((resolve) => setTimeout(resolve, 230)).then(() =>
        ctx?.state === 'running' && mine === transport
          ? ctx.suspend()
          : undefined,
      );
    },
    resume() {
      if (!ctx) return Promise.resolve();
      transport += 1;
      const done = Promise.resolve(ctx.resume?.()).then(() => {
        if (!ctx) return;
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.linearRampToValueAtTime(1, t + 0.2);
      });
      return done;
    },
    suspend: () => ctx?.suspend?.(),
    destroy() {
      clearTimeout(releaseTimer);
      ctx?.close?.();
      ctx = null;
      buses = null;
    },
  };
}
