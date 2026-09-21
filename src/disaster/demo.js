/**
 * The guided demonstration — §24's sixteen scenes.
 *
 * "Build a complete demonstration using a Nepal disaster case. The demo should
 * allow someone unfamiliar with the project to understand the concept within a
 * few minutes."
 *
 * So this is a script, in the theatrical sense: an ordered list of beats, each
 * one saying what the viewer should be looking at, which view to show, what to
 * turn on, and where to put the camera and the clock. It drives the same
 * session, views and layers a user drives by hand — there is no demo mode with
 * its own rendering path, because a demo that shows something the product
 * cannot do is a lie about the product.
 *
 * WHY EACH BEAT CARRIES A CLAIM. A scene that cannot say what it is
 * demonstrating is a screensaver. `claim` is the sentence a viewer should be
 * able to repeat afterwards, and it is rendered with the beat rather than
 * narrated separately.
 *
 * WHAT HAPPENS WHEN A BEAT'S DATA IS MISSING. It still runs and says so. A
 * demo that silently skips the beats whose sources failed would present a
 * rosier platform than the one being demonstrated.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

/**
 * One beat.
 *
 * `view` is the nav item id to navigate to. `depth` and `phase` are indices
 * into the case's own ladder and timeline, so a beat cannot address geography
 * the case does not have. `layers` are turned on; nothing is turned off, so a
 * viewer watching accumulates context rather than seeing it flicker.
 */
function beat({
  scene,
  title,
  claim,
  view = null,
  depth = null,
  phase = null,
  layers = [],
  holdMs = 6000,
  needs = [],
}) {
  return Object.freeze({
    scene,
    title,
    claim,
    view,
    depth,
    phase,
    layers: Object.freeze([...layers]),
    holdMs,
    /** Product ids this beat is about; absent ones are declared, not skipped. */
    needs: Object.freeze([...needs]),
  });
}

/**
 * The Nepal demonstration, scene by scene.
 *
 * Mapped directly onto §24's list, in its order. The depth indices follow the
 * Gorkha case's authored ladder: 0 World, 1 South Asia, 2 Nepal, 3 Provinces,
 * 4 Kathmandu Valley, 5 Kathmandu, 6 Langtang corridor, 7 Pasang Lhamu Highway.
 */
export const NEPAL_DEMO = Object.freeze({
  id: 'nepal-gorkha-demo',
  caseId: 'nepal-gorkha-2015',
  name: 'Gorkha 2015 — a complete investigation',
  premise:
    'One earthquake, followed from the whole world down to a single mountain road, and then outward again through who it killed, what it cut, and what could still be done.',
  beats: Object.freeze([
    beat({
      scene: 1,
      title: 'Natural Disaster Explorer',
      claim:
        'The platform does not open on one disaster. It opens on a list of them, each showing how far it can be investigated before you commit.',
      view: 'case-explorer',
      depth: 0,
      holdMs: 7000,
    }),
    beat({
      scene: 2,
      title: 'Selecting Nepal',
      claim:
        'Gorkha 2015 is the case where almost every claim can be checked: USGS published the shaking field, the rupture, the landslide model and the population exposure, and the Government of Nepal published a needs assessment against it.',
      view: 'case-explorer',
      holdMs: 6000,
    }),
    beat({
      scene: 3,
      title: 'The world, then South Asia',
      claim:
        'The descent is the explanation. You see the Himalayan collision boundary before you see the valley, so the valley means something when you arrive.',
      view: 'descent',
      depth: 1,
      layers: ['country-borders'],
      holdMs: 7000,
    }),
    beat({
      scene: 4,
      title: 'Nepal, with its borders drawn',
      claim:
        'The national border is drawn at exactly this level and not before: earlier it is noise, later the camera is inside the country.',
      view: 'descent',
      depth: 2,
      layers: ['country-borders'],
      holdMs: 7000,
    }),
    beat({
      scene: 5,
      title: 'The affected provinces',
      claim:
        'The rupture ran east from the epicentre toward the Kathmandu Valley rather than radiating evenly. That is why the damage is where it is and not where the epicentre is.',
      view: 'hazard-layers',
      depth: 3,
      layers: ['mmi-contours', 'rupture'],
      needs: ['contours', 'rupture'],
      holdMs: 8000,
    }),
    beat({
      scene: 6,
      title: 'The shaking field',
      claim:
        'Eleven measured intensity bands, in the USGS ShakeMap ramp rather than this interface’s palette — because a reader who has seen a ShakeMap recognises it instantly.',
      view: 'hazard-layers',
      depth: 4,
      layers: ['mmi-contours'],
      needs: ['contours'],
      holdMs: 7000,
    }),
    beat({
      scene: 7,
      title: 'The timeline begins',
      claim:
        'An earthquake has no forecast: the timeline starts at T-0. A cyclone’s would start three days earlier, because the hazard type decides its own phases.',
      view: 'timeline',
      phase: 0,
      holdMs: 6000,
    }),
    beat({
      scene: 8,
      title: 'T+6h — infrastructure disruption',
      claim:
        'Thirty-four aftershocks have been recorded by now, every one timestamped by USGS. This layer genuinely accumulates as the clock moves; it is measured, not interpolated.',
      view: 'timeline',
      phase: 2,
      layers: ['aftershocks', 'terrain-3d'],
      needs: ['aftershocks'],
      holdMs: 8000,
    }),
    beat({
      scene: 9,
      title: 'Human impact',
      claim:
        '2.9 million people experienced severe shaking and 8,964 died. Those are different kinds of claim from different sources, and the platform never merges them.',
      view: 'human-impact',
      depth: 5,
      needs: ['exposure', 'cities'],
      holdMs: 9000,
    }),
    beat({
      scene: 10,
      title: 'Kathmandu, at city resolution',
      claim:
        '1,442,271 people in a city that shook at MMI 7.89 — a measured value for a named place, not a regional average.',
      view: 'human-impact',
      depth: 5,
      needs: ['cities'],
      holdMs: 7000,
    }),
    beat({
      scene: 11,
      title: 'Why the roads failed',
      claim:
        'In mountains the shaking rarely kills the road; the slope above it does. The USGS landslide model was red with an aggregate hazard of 1,500 — and terrain is the only way to see why.',
      view: 'infrastructure',
      depth: 6,
      layers: ['terrain-3d', 'landslide-hazard', 'freight-roads'],
      needs: ['groundFailure'],
      holdMs: 9000,
    }),
    beat({
      scene: 12,
      title: 'Supply-chain disruption',
      claim:
        'The factories were standing and the road to the port was not. This is the consequence that outlasts the damage.',
      view: 'supply-disruption',
      depth: 6,
      phase: 5,
      layers: ['supply-chain', 'supply-ports'],
      holdMs: 8000,
    }),
    beat({
      scene: 13,
      title: 'Economic damage, placed',
      claim:
        'A cited $7 billion — about a third of GDP — distributed across the shaking bands and labelled an apportionment, because no assessment breaks it down that way.',
      view: 'economic',
      needs: ['exposure'],
      holdMs: 8000,
    }),
    beat({
      scene: 14,
      title: 'The published evidence',
      claim:
        'The agencies’ own products, shown as published and linked. A redrawn chart loses the caveat that came with it.',
      view: 'evidence',
      needs: ['event'],
      holdMs: 7000,
    }),
    beat({
      scene: 15,
      title: 'Rescue access and evacuation',
      claim:
        'Route A is blocked, so Route B is solved over the real road network and drawn — with the extra distance and the extra hours. Where no route remains, the platform says severed rather than showing nothing.',
      view: 'rescue',
      depth: 7,
      phase: 3,
      layers: ['freight-roads', 'rescue-routes', 'blocked-routes'],
      holdMs: 9000,
    }),
    beat({
      scene: 16,
      title: 'Where every figure came from',
      claim:
        'Thirteen adapters wired, sixteen declared but not connected — each with its integration point named. A visualisation you cannot trace is decoration.',
      view: 'provenance',
      holdMs: 8000,
    }),
  ]),
});

/**
 * Runtime, derived rather than declared.
 *
 * An earlier version carried `runtimeMinutes: 4` next to a script that totalled
 * two, which is the kind of stated figure that drifts the moment a beat's hold
 * changes. Computed from the beats, so it cannot.
 */
export function runtimeMinutes(script) {
  const ms = (script?.beats ?? []).reduce(
    (sum, item) => sum + (item.holdMs ?? 0),
    0,
  );
  return Math.round((ms / 60_000) * 10) / 10;
}

export const DEMOS = Object.freeze([NEPAL_DEMO]);

/** Look up a demo. */
export function demo(id) {
  return DEMOS.find((entry) => entry.id === id) ?? null;
}

/**
 * Drive a demo.
 *
 * Returns a handle with the same shape as the investigation playback the
 * project already has — play, pause, next, previous, stop — because a viewer
 * who has used one should not have to learn the other.
 *
 * @param {object} deps
 * @param {object} deps.demo
 * @param {object} deps.session the open disaster session
 * @param {(itemId:string)=>void} deps.navigate
 * @param {(state:object)=>void} [deps.onChange]
 * @param {(fn:Function, ms:number)=>unknown} [deps.setTimer]
 * @param {(handle:unknown)=>void} [deps.clearTimer]
 */
export function createDemoPlayback({
  demo: script,
  session,
  navigate,
  onChange = () => {},
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (handle) => clearTimeout(handle),
}) {
  if (!script?.beats?.length) throw new TypeError('a demo needs beats');
  if (!session) throw new TypeError('a demo needs an open session');

  let index = -1;
  let status = 'idle';
  let timer = null;

  function notify() {
    onChange(state());
  }

  function state() {
    const current = index >= 0 ? script.beats[index] : null;
    return Object.freeze({
      demoId: script.id,
      index,
      total: script.beats.length,
      status,
      beat: current,
      /*
       * Which of this beat's products actually loaded. A beat whose data is
       * missing still runs and says so, because silently skipping it would
       * demonstrate a rosier platform than the real one.
       */
      missing: current
        ? Object.freeze(
            current.needs.filter(
              (id) => session.productStatus(id) !== 'LOADED',
            ),
          )
        : Object.freeze([]),
      progress: script.beats.length
        ? Math.max(0, index + 1) / script.beats.length
        : 0,
      canNext: index < script.beats.length - 1,
      canPrevious: index > 0,
    });
  }

  function applyBeat(current) {
    if (!current) return;
    if (Number.isFinite(current.depth)) {
      session.investigation.goToDepth(current.depth);
    }
    if (Number.isFinite(current.phase)) {
      session.investigation.goToPhase(current.phase);
    }
    for (const layerId of current.layers) {
      /*
       * A refusal is expected and ignored: a beat may name a layer this case
       * has no data for, and the beat's own `missing` list is what reports it.
       */
      session.investigation.setLayer(layerId, true);
    }
    if (current.view) navigate(current.view);
  }

  function goTo(target) {
    const clamped = Math.max(0, Math.min(script.beats.length - 1, target));
    index = clamped;
    applyBeat(script.beats[index]);
    notify();
    return true;
  }

  function schedule() {
    if (timer !== null) clearTimer(timer);
    const current = script.beats[index];
    timer = setTimer(() => {
      timer = null;
      if (status !== 'playing') return;
      if (index >= script.beats.length - 1) {
        status = 'finished';
        notify();
        return;
      }
      goTo(index + 1);
      schedule();
    }, current?.holdMs ?? 6000);
  }

  return {
    demo: script,
    play() {
      if (status === 'playing') return false;
      status = 'playing';
      if (index < 0) goTo(0);
      else notify();
      schedule();
      return true;
    },
    pause() {
      if (status !== 'playing') return false;
      status = 'paused';
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      notify();
      return true;
    },
    /** Stepping by hand always pauses: the viewer has taken over. */
    next() {
      if (index >= script.beats.length - 1) return false;
      status = status === 'playing' ? 'paused' : status;
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      return goTo(index + 1);
    },
    previous() {
      if (index <= 0) return false;
      status = status === 'playing' ? 'paused' : status;
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      return goTo(index - 1);
    },
    goTo(target) {
      status = status === 'playing' ? 'paused' : status;
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      return goTo(target);
    },
    restart() {
      index = -1;
      status = 'playing';
      goTo(0);
      schedule();
      return true;
    },
    stop() {
      status = 'idle';
      index = -1;
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      notify();
      return true;
    },
    getState: state,
    destroy() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      status = 'idle';
    },
  };
}
