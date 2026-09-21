import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMOS, NEPAL_DEMO, createDemoPlayback, demo, runtimeMinutes } from './demo.js';

/** A session stub recording what the demo drove. */
function fakeSession({ loaded = ['event', 'contours', 'exposure'] } = {}) {
  const calls = { depths: [], phases: [], layers: [] };
  return {
    calls,
    case: { id: 'nepal-gorkha-2015' },
    productStatus: (id) => (loaded.includes(id) ? 'LOADED' : 'FAILED'),
    investigation: {
      goToDepth: (i) => calls.depths.push(i),
      goToPhase: (i) => calls.phases.push(i),
      setLayer: (id, on) => {
        calls.layers.push(`${id}:${on}`);
        return { ok: true };
      },
    },
  };
}

function build(options = {}) {
  const session = fakeSession(options);
  const navigated = [];
  const timers = [];
  const playback = createDemoPlayback({
    demo: NEPAL_DEMO,
    session,
    navigate: (id) => navigated.push(id),
    setTimer: (fn) => {
      timers.push(fn);
      return timers.length - 1;
    },
    clearTimer: () => {},
  });
  return { playback, session, navigated, timers };
}

test('the demo covers the sixteen scenes the brief lists', () => {
  assert.equal(NEPAL_DEMO.beats.length, 16);
  assert.deepEqual(
    NEPAL_DEMO.beats.map((beat) => beat.scene),
    Array.from({ length: 16 }, (_, i) => i + 1),
  );
  assert.equal(demo('nepal-gorkha-demo'), NEPAL_DEMO);
  assert.equal(demo('nope'), null);
  assert.equal(DEMOS.length, 1);
});

test('every scene states the claim a viewer should be able to repeat', () => {
  // A scene that cannot say what it is demonstrating is a screensaver.
  for (const beat of NEPAL_DEMO.beats) {
    assert.ok(beat.title?.length > 4, `scene ${beat.scene} has no title`);
    assert.ok(beat.claim?.length > 40, `scene ${beat.scene} makes no claim`);
    assert.ok(beat.holdMs >= 5000, `scene ${beat.scene} is too fast to read`);
  }
});

test('the runtime is derived from the beats, not declared beside them', () => {
  /*
   * An earlier version carried `runtimeMinutes: 4` next to a script that
   * totalled two — the kind of stated figure that drifts the moment a hold
   * changes.
   */
  assert.ok(!('runtimeMinutes' in NEPAL_DEMO));
  const expected =
    NEPAL_DEMO.beats.reduce((sum, beat) => sum + beat.holdMs, 0) / 60_000;
  assert.equal(runtimeMinutes(NEPAL_DEMO), Math.round(expected * 10) / 10);
  assert.equal(runtimeMinutes({ beats: [] }), 0);
  assert.equal(runtimeMinutes(null), 0);
});

test('the scenes descend and then widen, following the brief’s order', () => {
  /*
   * §24's shape: explorer, then the descent, then the event, then outward
   * through impact, consequences and response. The depths must not bounce.
   */
  const depths = NEPAL_DEMO.beats
    .filter((beat) => Number.isFinite(beat.depth))
    .map((beat) => beat.depth);
  assert.deepEqual(depths, [...depths].sort((a, b) => a - b), 'depths only go deeper');
  const views = NEPAL_DEMO.beats.map((beat) => beat.view);
  assert.equal(views[0], 'case-explorer');
  assert.equal(views.at(-1), 'provenance', 'it ends on where the figures came from');
  assert.ok(views.includes('timeline'));
  assert.ok(views.includes('human-impact'));
  assert.ok(views.includes('supply-disruption'), '§8: supply chain is a scene');
  assert.ok(views.includes('rescue'), '§14: response is a scene');
  assert.ok(views.includes('evidence'), '§12: evidence is a scene');
});

test('playing a scene drives the real session rather than a demo path', () => {
  const { playback, session, navigated } = build();
  playback.play();
  const state = playback.getState();
  assert.equal(state.index, 0);
  assert.equal(state.status, 'playing');
  assert.deepEqual(navigated, ['case-explorer']);
  assert.deepEqual(session.calls.depths, [0]);
});

test('advancing applies the scene’s depth, phase and layers', () => {
  const { playback, session, navigated } = build();
  playback.goTo(7); // scene 8: T+6h, aftershocks and terrain
  const beat = playback.getState().beat;
  assert.equal(beat.scene, 8);
  assert.equal(session.calls.phases.at(-1), beat.phase);
  assert.ok(session.calls.layers.includes('aftershocks:true'));
  assert.ok(session.calls.layers.includes('terrain-3d:true'));
  assert.equal(navigated.at(-1), 'timeline');
});

test('a scene whose sources failed still runs, and says which are missing', () => {
  /*
   * Silently skipping it would demonstrate a rosier platform than the real
   * one.
   */
  const { playback } = build({ loaded: ['event'] });
  playback.goTo(4); // scene 5 needs contours and rupture
  const state = playback.getState();
  assert.equal(state.beat.scene, 5);
  assert.deepEqual([...state.missing].sort(), ['contours', 'rupture']);
  // And a scene whose sources did load reports nothing missing.
  playback.goTo(13); // scene 14 needs only the event record
  assert.deepEqual([...playback.getState().missing], []);
});

test('stepping by hand pauses, because the viewer has taken over', () => {
  const { playback } = build();
  playback.play();
  assert.equal(playback.getState().status, 'playing');
  playback.next();
  assert.equal(playback.getState().status, 'paused');
  playback.play();
  playback.previous();
  assert.equal(playback.getState().status, 'paused');
});

test('the auto-advance chain walks the whole script and then finishes', () => {
  const { playback, timers } = build();
  playback.play();
  let guard = 0;
  while (timers.length > 0 && guard < 200) {
    timers.shift()();
    guard += 1;
  }
  const state = playback.getState();
  assert.equal(state.status, 'finished');
  assert.equal(state.index, NEPAL_DEMO.beats.length - 1);
  assert.equal(state.progress, 1);
});

test('stop clears the position; restart begins again', () => {
  const { playback } = build();
  playback.goTo(9);
  playback.stop();
  const stopped = playback.getState();
  assert.equal(stopped.index, -1);
  assert.equal(stopped.status, 'idle');
  assert.equal(stopped.beat, null);
  playback.restart();
  assert.equal(playback.getState().index, 0);
  assert.equal(playback.getState().status, 'playing');
});

test('bounds are clamped rather than running off the script', () => {
  const { playback } = build();
  playback.goTo(-5);
  assert.equal(playback.getState().index, 0);
  assert.equal(playback.previous(), false);
  playback.goTo(999);
  assert.equal(playback.getState().index, NEPAL_DEMO.beats.length - 1);
  assert.equal(playback.next(), false);
});

test('a demo needs beats and an open session', () => {
  assert.throws(
    () => createDemoPlayback({ demo: { beats: [] }, session: fakeSession() }),
    /needs beats/,
  );
  assert.throws(
    () => createDemoPlayback({ demo: NEPAL_DEMO, session: null }),
    /open session/,
  );
});
