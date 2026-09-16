/**
 * The GLOBAL SUPPLY CHAIN EYE authored tour (§44, §45).
 *
 * This is the one place where the supply-chain work becomes cinema rather than
 * a panel: a fixed sequence of shots that walks the semiconductor investigation
 * from a whole-world view down to the chokepoint that would break it, then out
 * to the live hazard feed. It reuses the inherited director wholesale — camera
 * path, holds, styles, share links and export all behave as they do for the
 * Nepal pack — and adds only two things a generic recipe cannot express.
 *
 * FIRST: a data script. The trade-flow layer renders what the console loaded
 * and nothing else, by design — no layer in this project invents a query. A
 * camera path alone would therefore fly over an empty globe. `TOUR_DATA_SCRIPT`
 * names, per shot, the console call that shot's frame requires, and the
 * composition wiring in `src/app/tools.js` performs it. Nothing here fetches.
 *
 * SECOND: honest holds. The inherited default of ~0.9 s per shot is tuned for
 * motion, and it is far too short to read a hundred trade arcs or a table of
 * modelled reroute distances. `minimumHoldSec` raises the floor for exactly the
 * shots that put numbers on screen. A shot that shows a figure the viewer
 * cannot read has not communicated it.
 *
 * WHAT THE TOUR DOES NOT DO: it does not narrate conclusions. Each beat carries
 * a caption naming its data class, and the Taiwan beat exists specifically to
 * show an absence — Taiwan does not report to UN Comtrade, so the tour flies to
 * the strait and says the data is missing rather than filling it in. That beat
 * is the point of the sequence, not an aside.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

/** The recipe id this pack presents. */
export const SUPPLY_CHAIN_TOUR_ID = 'supply-chain-eye-semiconductors';

/**
 * Hold floors for the shots that put figures on screen, in seconds.
 *
 * Chosen by reading them: 105 partner arcs need a beat to resolve into a
 * pattern, and the WHAT IF before/after comparison is two routes and four
 * numbers. The rest of the tour keeps the inherited pacing.
 */
export const READABLE_HOLD_SEC = Object.freeze({
  tradeFlows: 4,
  events: 3,
});

/**
 * Per-shot data requirements.
 *
 * Keyed by shot title, because that is what the director publishes and what a
 * saved project keeps stable across edits. Each entry is a declarative request,
 * not a call: `action` names a console method and `args` its argument, and the
 * wiring decides whether and when to run it. Keeping it inert means this module
 * stays portable and testable without a browser.
 */
export const TOUR_DATA_SCRIPT = Object.freeze({
  'World Trade In One Commodity': Object.freeze({
    action: 'run',
    commodity: 'semiconductors',
    reporter: 'KOR',
    flow: 'M',
    year: 2023,
    caption: 'HISTORICAL · UN Comtrade 2023',
  }),
  'The Dependency': Object.freeze({
    action: 'run',
    commodity: 'semiconductors',
    reporter: 'KOR',
    flow: 'M',
    year: 2023,
    caption: 'HISTORICAL · concentration measured, not estimated',
  }),
  'The Gap Where Taiwan Should Be': Object.freeze({
    action: 'none',
    caption:
      'DATA UNAVAILABLE · Taiwan does not report to UN Comtrade. Its trade is ' +
      'visible only through what its partners report.',
  }),
  Malacca: Object.freeze({
    action: 'none',
    caption: 'REFERENCE · chokepoint geometry, NGA World Port Index',
  }),
  'Suez Under Closure': Object.freeze({
    action: 'simulate',
    target: 'suez',
    caption: 'SIMULATED · model output, geographic alternative only',
  }),
  'The Cape Reroute': Object.freeze({
    action: 'none',
    caption: 'SIMULATED · +6,986 km on the modelled path',
  }),
  'What Is Happening Right Now': Object.freeze({
    action: 'loadEvents',
    caption: 'LIVE · GDACS. Proximity is exposure, not impact.',
  }),
});

/**
 * Presentation rules for the tour.
 *
 * Shaped like `nepalScenePresentation` so the registry treats both the same.
 */
export const supplyChainScenePresentation = {
  /**
   * Floor the hold on shots whose content has to be read rather than watched.
   *
   * Keyed on layer state, not shot title: a saved project can be re-titled by
   * hand, but a shot that enables `trade-flows` is showing trade arcs whatever
   * it is called. This is a floor under the authored `hold` values in the
   * recipe, not a replacement for them — it exists so a user who shortens a
   * hold in the editor cannot end up with a frame that flashes a hundred arcs
   * past too fast to see. Neither layer takes params, so nothing finer than
   * "which layer is on" is available here, and nothing finer is claimed.
   */
  minimumHoldSec(states) {
    return Math.max(
      states?.['trade-flows']?.enabled ? READABLE_HOLD_SEC.tradeFlows : 0,
      states?.['supply-events']?.enabled ? READABLE_HOLD_SEC.events : 0,
    );
  },

  /**
   * The tour is deliberately imagery-based, not photoreal.
   *
   * Every beat is a global or regional view where 3D buildings contribute
   * nothing and the photoreal tileset costs a long load. Downgrading here also
   * means the tour runs without a Google Photorealistic Tiles key, which the
   * Nepal pack needs and most people running this will not have.
   */
  resolveVisual(shot, visual) {
    const isTourShot = Boolean(
      shot?.layers?.['trade-flows']?.enabled ||
      shot?.layers?.['chokepoints']?.enabled ||
      shot?.layers?.['supply-events']?.enabled,
    );
    return isTourShot && visual.mapStack === 'photoreal'
      ? { ...visual, mapStack: 'esri-imagery' }
      : visual;
  },

  cancelMotion() {
    // No layer in this pack animates its own camera, so there is nothing to
    // cancel. Declared explicitly so the registry contract stays obvious.
  },
};

/**
 * The data script entry for a shot, or null when it asks for nothing.
 *
 * @param {{title?:string}} shot
 * @returns {object|null}
 */
export function tourDataForShot(shot) {
  const title = shot?.title;
  if (typeof title !== 'string') return null;
  return TOUR_DATA_SCRIPT[title] ?? null;
}

/**
 * Suspend the console's camera, returning a one-shot restore.
 *
 * Tolerates a console without the hook so a caller can pass a partial stub.
 *
 * @param {object} consoleHandle
 * @returns {()=>void}
 */
function suspendCamera(consoleHandle) {
  if (typeof consoleHandle.setCameraSuspended !== 'function') {
    return () => {};
  }
  const previous = consoleHandle.setCameraSuspended(true);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    consoleHandle.setCameraSuspended(previous);
  };
}

/** Attach failure and cleanup handlers to a possibly-async console call. */
function settle(result, fail, release) {
  Promise.resolve(result).catch(fail).finally(release);
}

/**
 * The identity of a data request, ignoring presentation.
 *
 * @param {object} entry a TOUR_DATA_SCRIPT value
 * @returns {string}
 */
function requestKey(entry) {
  return JSON.stringify([
    entry.action,
    entry.commodity ?? null,
    entry.reporter ?? null,
    entry.flow ?? null,
    entry.year ?? null,
    entry.target ?? null,
  ]);
}

/**
 * Drive the console from director playback.
 *
 * Returns a listener for `SceneDirector.subscribe`. On each `shot-loaded`
 * change belonging to the tour it performs that shot's data requirement, and
 * ignores everything else — other scenes, other change types, and shots with no
 * entry in the script.
 *
 * Two deliberate properties:
 *
 *   IDEMPOTENT. Consecutive shots often need the same query (the world view and
 *   the Korea view are the same data at different altitudes). The runner skips a
 *   request identical to the one it last performed, so replaying or scrubbing
 *   does not re-issue calls.
 *
 *   NON-BLOCKING. The console's loaders are async and the director publishes
 *   synchronously. The runner starts the work and returns; a failure surfaces in
 *   the console's own status line, which already states failures honestly, and
 *   is passed to `onError` for logging. Playback is never held up waiting for a
 *   network call, because a stalled tour is worse than a beat that arrives with
 *   its data a moment late.
 *
 * @param {object} input
 * @param {object} input.console the supply-chain console handle
 * @param {string} [input.sceneId] scene to respond to
 * @param {(error:Error, entry:object)=>void} [input.onError]
 * @returns {(notification:object)=>string|null} the action performed, for tests
 */
export function createTourDataRunner({
  console: consoleHandle,
  sceneId = SUPPLY_CHAIN_TOUR_ID,
  onError = () => {},
}) {
  if (!consoleHandle) throw new TypeError('a console handle is required');
  let lastKey = null;

  return function onDirectorChange(notification) {
    // The director's state channel delivers {state, change, revision, initial};
    // a bare change is accepted too so a caller can drive this directly.
    const change = notification?.change ?? notification;
    if (change?.type !== 'shot-loaded' || change.sceneId !== sceneId) {
      return null;
    }
    const entry = tourDataForShot(change.shot);
    if (!entry || entry.action === 'none') return null;

    // Keyed on the REQUEST, not the whole entry: two beats can share a query
    // and differ only in their caption, which is exactly the world-view and
    // Korea-view pair. Including the caption would defeat the de-duplication.
    const key = requestKey(entry);
    if (key === lastKey) return 'skipped';
    lastKey = key;

    const fail = (error) => onError(error, entry);
    // The director framed this shot; the console must not re-aim the camera
    // while filling it. Restored once the call settles, so interactive use
    // after the tour behaves normally.
    const release = suspendCamera(consoleHandle);
    try {
      if (entry.action === 'run') {
        consoleHandle.setCommodity(entry.commodity);
        consoleHandle.setReporter(entry.reporter);
        consoleHandle.setFlow(entry.flow);
        consoleHandle.setYear(entry.year);
        settle(consoleHandle.run(), fail, release);
        return 'run';
      }
      if (entry.action === 'simulate') {
        try {
          consoleHandle.simulate(entry.target);
        } finally {
          release();
        }
        return 'simulate';
      }
      if (entry.action === 'loadEvents') {
        settle(consoleHandle.loadEvents(), fail, release);
        return 'loadEvents';
      }
    } catch (error) {
      release();
      fail(error);
      return 'failed';
    }
    release();
    // An unknown action is a script error, not a data error: fail loudly in
    // tests rather than silently skipping a beat.
    throw new Error(`Unknown tour action: ${entry.action}`);
  };
}
