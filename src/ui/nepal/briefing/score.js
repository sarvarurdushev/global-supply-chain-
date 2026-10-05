/**
 * The score: an original ambient bed, generated live with the Web Audio API.
 *
 * WHY GENERATED. No music file is shipped, so there is nothing to license,
 * attribute or fetch, nothing borrowed from a film, and the score can follow
 * the story exactly: each act has a state (src/nepal/briefing/music.js), and
 * a state is a chord, a filter, a breathing rate, and at most a slow pulse.
 * It was written for this briefing; it imitates no composer or soundtrack.
 *
 * WHAT IT SOUNDS LIKE. A low, dark pad — triangle and a little sawtooth per
 * note, through a slowly moving low-pass filter — that sits under the voice
 * as a room tone with a mood. States crossfade over a few seconds, so an act
 * change is felt rather than heard as a cut. Six moments carry a cue (the
 * main shock, the M7.3, the first damage, the coverage gap, the rescue
 * disconnect, the close); nothing else does.
 *
 * MIXING. Everything here goes to the mixer's MUSIC bus (audio.js), which is
 * ducked under narration and has its own level and mute. The bed's own peak
 * is kept low (well under the voice) and every change is a ramp.
 */

import { MUSIC_CUES, MUSIC_STATES } from '../../../nepal/briefing/music.js';

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

/*
 * The states. Notes are MIDI numbers (38 = D2). `cutoff` is the filter's
 * centre in Hz, `level` the bed's loudness inside the bus, `pulse` a slow
 * low thump in beats per second (0 = none), `shimmer` a high, faint partial.
 */
export const SCORE_STATES = Object.freeze({
  /* Open fifth on D: watchful, nothing has happened yet. */
  incident: {
    notes: [38, 45, 50],
    cutoff: 520,
    level: 0.5,
    pulse: 0,
    shimmer: 0,
  },
  /* D minor, low and close, with a slow heartbeat under it. */
  mainshock: {
    notes: [38, 41, 45],
    cutoff: 430,
    level: 0.62,
    pulse: 0.75,
    shimmer: 0,
  },
  /* D minor with the ninth: people in the picture, still tense. */
  exposure: {
    notes: [38, 45, 53, 52],
    cutoff: 620,
    level: 0.5,
    pulse: 0,
    shimmer: 0.12,
  },
  /* B♭ major seventh over the low B♭: weight, consequence. */
  damage: {
    notes: [34, 41, 50, 57],
    cutoff: 700,
    level: 0.55,
    pulse: 0,
    shimmer: 0,
  },
  /* Suspended (D, A, E): unresolved, the record is silent. */
  gap: {
    notes: [38, 45, 52],
    cutoff: 560,
    level: 0.45,
    pulse: 0,
    shimmer: 0.3,
  },
  /* C with stacked fifths and a slow pulse: movement, roads, routing. */
  network: {
    notes: [36, 43, 50, 55],
    cutoff: 680,
    level: 0.5,
    pulse: 0.5,
    shimmer: 0,
  },
  /* F with the ninth and sixth: purpose, a way through. */
  access: {
    notes: [41, 48, 55, 57],
    cutoff: 780,
    level: 0.5,
    pulse: 0.4,
    shimmer: 0.1,
  },
  /* B♭ add9 spread wide: settled, warm, not triumphant. */
  summary: {
    notes: [34, 41, 50, 53, 60],
    cutoff: 950,
    level: 0.55,
    pulse: 0,
    shimmer: 0.18,
  },
});

const CROSSFADE_S = 3.5;

export function createScore({ engine }) {
  let layer = null;
  let state = null;
  let desired = null;
  let started = false;
  let pulseTimer = null;
  let nextPulse = 0;
  const log = [];

  const ctx = () => engine.context;
  const out = () => engine.bus('music');

  /** One state's sound: a pad per note, one shared filter, an LFO on the filter. */
  function buildLayer(name) {
    const spec = SCORE_STATES[name];
    const c = ctx();
    const t = c.currentTime;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(spec.level, t + CROSSFADE_S);
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = spec.cutoff;
    filter.Q.value = 0.6;
    filter.connect(gain);
    gain.connect(out());
    const nodes = [];
    /* The filter breathes: a slow sine opens and closes it by a quarter. */
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoDepth = c.createGain();
    lfoDepth.gain.value = spec.cutoff * 0.25;
    lfo.connect(lfoDepth);
    lfoDepth.connect(filter.frequency);
    lfo.start();
    nodes.push(lfo);
    spec.notes.forEach((midi, i) => {
      /* Lower notes carry the weight; upper notes are colour. */
      const weight = (1 / spec.notes.length) * (i === 0 ? 1.4 : 1 - i * 0.08);
      const noteGain = c.createGain();
      noteGain.gain.value = weight;
      noteGain.connect(filter);
      const body = c.createOscillator();
      body.type = 'triangle';
      body.frequency.value = hz(midi);
      body.connect(noteGain);
      const edge = c.createOscillator();
      edge.type = 'sawtooth';
      edge.frequency.value = hz(midi);
      edge.detune.value = i % 2 ? -7 : 7;
      const edgeGain = c.createGain();
      edgeGain.gain.value = 0.18;
      edge.connect(edgeGain);
      edgeGain.connect(noteGain);
      /* Each note swells on its own slow cycle, so the chord never sits still. */
      const swell = c.createOscillator();
      swell.frequency.value = 0.035 + i * 0.013;
      const swellDepth = c.createGain();
      swellDepth.gain.value = weight * 0.35;
      swell.connect(swellDepth);
      swellDepth.connect(noteGain.gain);
      for (const node of [body, edge, swell]) {
        node.start();
        nodes.push(node);
      }
    });
    if (spec.shimmer > 0) {
      const top = spec.notes.at(-1) + 24;
      const shimmer = c.createOscillator();
      shimmer.type = 'sine';
      shimmer.frequency.value = hz(top);
      const shimmerGain = c.createGain();
      shimmerGain.gain.value = spec.shimmer * 0.05;
      const tremolo = c.createOscillator();
      tremolo.frequency.value = 0.18;
      const tremoloDepth = c.createGain();
      tremoloDepth.gain.value = spec.shimmer * 0.04;
      tremolo.connect(tremoloDepth);
      tremoloDepth.connect(shimmerGain.gain);
      shimmer.connect(shimmerGain);
      shimmerGain.connect(gain);
      shimmer.start();
      tremolo.start();
      nodes.push(shimmer, tremolo);
    }
    return { name, spec, gain, nodes };
  }

  function retire(old) {
    if (!old) return;
    const c = ctx();
    const t = c.currentTime;
    const g = old.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.0001, t + CROSSFADE_S);
    for (const node of old.nodes) node.stop(t + CROSSFADE_S + 0.1);
    setTimeout(() => old.gain.disconnect(), (CROSSFADE_S + 0.5) * 1000);
  }

  /* The pulse: soft low thumps scheduled a little ahead on the audio clock. */
  function thump(at, strength) {
    const c = ctx();
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(58, at);
    osc.frequency.exponentialRampToValueAtTime(40, at + 0.35);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(strength, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
    osc.connect(g);
    g.connect(out());
    osc.start(at);
    osc.stop(at + 0.55);
  }
  function schedulePulse() {
    const c = ctx();
    const rate = layer?.spec.pulse ?? 0;
    if (!c || !rate) return;
    if (nextPulse < c.currentTime) nextPulse = c.currentTime + 0.1;
    while (nextPulse < c.currentTime + 0.4) {
      /* Heartbeat: a strong beat and a softer one just after it. */
      thump(nextPulse, 0.16);
      thump(nextPulse + 0.28, 0.08);
      nextPulse += 1 / rate;
    }
  }

  function apply() {
    if (!started || !engine.ready || desired === state) return;
    retire(layer);
    layer = desired ? buildLayer(desired) : null;
    state = desired;
    nextPulse = 0;
    log.push({ type: 'state', state, at: ctx().currentTime });
  }

  /* Cues: each a single gesture on the music bus, then gone. */
  function voice(
    midi,
    {
      type = 'triangle',
      at = 0,
      attack = 0.8,
      hold = 0.5,
      release = 3,
      peak = 0.12,
      glideTo = null,
      cutoff = 1200,
    } = {},
  ) {
    const c = ctx();
    const t = c.currentTime + at;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(hz(midi), t);
    if (glideTo !== null)
      osc.frequency.exponentialRampToValueAtTime(
        hz(glideTo),
        t + attack + hold + release,
      );
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    osc.connect(filter);
    filter.connect(g);
    g.connect(out());
    osc.start(t);
    osc.stop(t + attack + hold + release + 0.1);
  }
  function rumble({
    from = 70,
    to = 32,
    peak = 0.5,
    seconds = 2.6,
    noisePeak = 0.12,
  } = {}) {
    const c = ctx();
    const t = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + seconds);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    osc.connect(g);
    g.connect(out());
    osc.start(t);
    osc.stop(t + seconds + 0.1);
    /* The ground: low-passed noise that swells and settles. */
    const buffer = c.createBuffer(
      1,
      Math.ceil(c.sampleRate * seconds),
      c.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(noisePeak, t + 0.25);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    src.connect(lp);
    lp.connect(ng);
    ng.connect(out());
    src.start(t);
    src.stop(t + seconds);
  }
  const CUES = {
    impact() {
      rumble({ from: 72, to: 30, peak: 0.55, seconds: 3.2, noisePeak: 0.16 });
      voice(26, {
        type: 'sawtooth',
        attack: 0.05,
        hold: 0.4,
        release: 5,
        peak: 0.1,
        cutoff: 220,
      });
      voice(33, {
        type: 'triangle',
        attack: 1.2,
        hold: 0.8,
        release: 4,
        peak: 0.08,
        cutoff: 500,
      });
    },
    aftershock() {
      rumble({ from: 64, to: 34, peak: 0.38, seconds: 2.4, noisePeak: 0.1 });
      voice(29, {
        type: 'triangle',
        attack: 0.9,
        hold: 0.6,
        release: 3.5,
        peak: 0.07,
        cutoff: 450,
      });
    },
    damage() {
      for (const [k, midi] of [46, 50, 53, 57].entries())
        voice(midi, {
          at: k * 0.12,
          attack: 1.4,
          hold: 0.8,
          release: 4,
          peak: 0.045,
          cutoff: 900,
        });
    },
    gap() {
      voice(69, {
        type: 'sine',
        attack: 0.6,
        hold: 0.6,
        release: 2.2,
        peak: 0.05,
      });
      voice(64, {
        type: 'sine',
        at: 1.3,
        attack: 0.6,
        hold: 0.8,
        release: 2.8,
        peak: 0.05,
      });
    },
    disconnect() {
      voice(62, {
        type: 'sine',
        attack: 0.5,
        hold: 0.6,
        release: 2.6,
        peak: 0.05,
      });
      voice(68, {
        type: 'sine',
        attack: 0.5,
        hold: 0.6,
        release: 2.6,
        peak: 0.04,
        glideTo: 67,
      });
    },
    close() {
      for (const [k, midi] of [46, 53, 58, 62, 65].entries())
        voice(midi, {
          at: k * 0.18,
          attack: 1.8,
          hold: 1.2,
          release: 5,
          peak: 0.04,
          cutoff: 1400,
        });
    },
  };

  return {
    /** Begin playing (after the mixer is unlocked by BEGIN). */
    start() {
      started = true;
      clearInterval(pulseTimer);
      pulseTimer = setInterval(schedulePulse, 120);
      apply();
    },
    /** Move to a story state; the same state again changes nothing. */
    setState(name) {
      desired = MUSIC_STATES.includes(name) ? name : null;
      apply();
    },
    get state() {
      return state;
    },
    /** True if `name` is a musical cue (played here), false if it belongs elsewhere. */
    isCue: (name) => Object.hasOwn(MUSIC_CUES, name),
    cue(name) {
      if (!Object.hasOwn(CUES, name)) return false;
      if (started && engine.ready && !engine.isMuted('music')) {
        CUES[name]();
        log.push({ type: 'cue', cue: name, at: ctx().currentTime });
      }
      return true;
    },
    /** Fade the bed out (leaving the briefing); start() brings it back. */
    stop() {
      started = false;
      clearInterval(pulseTimer);
      if (engine.context) retire(layer);
      layer = null;
      state = null;
    },
    /** For QA: what the score has done. */
    get log() {
      return log.slice();
    },
  };
}
