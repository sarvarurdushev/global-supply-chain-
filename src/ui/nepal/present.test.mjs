import test from 'node:test';
import assert from 'node:assert/strict';
import { installTestDom } from '../../workspace/testDom.mjs';

installTestDom();

const { createNepalPresentation } = await import('./present.js');
const { MODE } = await import('../../nepal/story/investigation.js');

/** A fake clock, so a 40-second beat does not take 40 seconds. */
function fakeClock() {
  let next = 1;
  const timers = new Map();
  return {
    setTimer(fn, ms) {
      const id = next++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    /** Fire every pending timer, oldest first. */
    async tick() {
      const pending = [...timers.entries()].sort((a, b) => a[0] - b[0]);
      timers.clear();
      for (const [, entry] of pending) entry.fn();
      /* Let the readiness promise chain settle before asserting. */
      await Promise.resolve();
      await Promise.resolve();
    },
    get pending() {
      return timers.size;
    },
  };
}

/** An experience stub that records what the presentation asked of it. */
function fakeExperience({ readyAfter = null, failed = [] } = {}) {
  const calls = [];
  let mode = MODE.EXPLORE;
  let sceneIndex = 0;
  let readyResolve = null;
  return {
    calls,
    get mode() {
      return mode;
    },
    get sceneIndex() {
      return sceneIndex;
    },
    releaseReady() {
      readyResolve?.();
      readyResolve = null;
    },
    investigation: {
      setMode(next) {
        mode = next;
        calls.push(['setMode', next]);
      },
      takeControl() {
        mode = MODE.EXPLORE;
        calls.push(['takeControl']);
      },
    },
    loader: {
      stateOf: (key) => (failed.includes(key) ? 'failed' : 'ready'),
    },
    goTo(index) {
      sceneIndex = index;
      calls.push(['goTo', index]);
    },
    whenSceneReady() {
      if (!readyAfter) return Promise.resolve();
      return new Promise((resolve) => {
        readyResolve = resolve;
      });
    },
  };
}

function mountPoint() {
  return document.createElement('div');
}

test('the presentation drives scenes and reports where it is', async () => {
  const clock = fakeClock();
  const experience = fakeExperience();
  const mount = mountPoint();
  const present = createNepalPresentation({
    experience,
    mount,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });

  present.start();
  await Promise.resolve();
  assert.equal(experience.mode, MODE.PRESENT);
  assert.equal(experience.sceneIndex, 0);
  assert.match(mount.textContent, /ACT I/);
  assert.match(mount.textContent, /CASE 001/);
  assert.match(mount.textContent, /What am I about to investigate\?/);
  assert.match(mount.textContent, /01 \/ 21/);
  assert.match(mount.textContent, /next · Locate/);
  assert.match(mount.textContent, /min left/);
  assert.match(mount.textContent, /PLAYING/);

  await clock.tick();
  assert.equal(experience.sceneIndex, 1, 'it advanced on its own');
  assert.match(mount.textContent, /02 \/ 21/);
  present.destroy();
});

test('the strip is a map of the investigation: one segment per beat, acts apart', () => {
  const experience = fakeExperience();
  const mount = mountPoint();
  const present = createNepalPresentation({ experience, mount });
  present.start();
  const track = mount.querySelector('.ndi-present__track');
  assert.ok(track);
  const segments = track.children.filter((node) => node.classList.contains('ndi-present__seg'));
  const gaps = track.children.filter((node) => node.classList.contains('ndi-present__act-gap'));
  assert.equal(segments.length, present.script.beats.length);
  assert.equal(gaps.length, 2, 'three acts, two boundaries');
  assert.equal(segments.filter((node) => node.classList.contains('is-current')).length, 1);
  /* Width follows the beat's real length, so Scene 09's short moves look short. */
  const grow = segments.map((node) => Number(node.style.flexGrow));
  assert.ok(Math.max(...grow) > Math.min(...grow));
  present.destroy();
});

test('the six-minute run names each step of the argument on the strip', () => {
  const experience = fakeExperience();
  const mount = mountPoint();
  const present = createNepalPresentation({ experience, mount, length: 'short' });
  present.start();
  assert.equal(present.script.length, 'short');
  assert.match(mount.textContent, /01 \/ 13/);
  assert.match(mount.textContent, /NEPAL/);
  assert.match(mount.textContent, /next · M7\.8 earthquake/);
  present.destroy();
});

test('I reveals the headline provenance without pausing the run', () => {
  const experience = fakeExperience();
  let toggles = 0;
  experience.toggleHeadlineProvenance = () => {
    toggles += 1;
  };
  const present = createNepalPresentation({ experience, mount: mountPoint() });
  present.start();
  present.handleKey({ key: 'i', target: null, preventDefault() {} });
  assert.equal(toggles, 1);
  assert.equal(present.state.status, 'playing');
  present.destroy();
});

test('the hold starts when the map is drawn, not when the beat was requested', async () => {
  /*
   * A 40-second beat whose geometry takes 4 seconds to build would otherwise
   * be on screen for 36 and an empty globe for 4.
   */
  const clock = fakeClock();
  const experience = fakeExperience({ readyAfter: true });
  const present = createNepalPresentation({
    experience,
    mount: mountPoint(),
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });

  present.start();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(clock.pending, 0, 'nothing is scheduled while the scene loads');

  experience.releaseReady();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(clock.pending, 1, 'the hold begins once the scene is ready');
  present.destroy();
});

test('pause drops into explore at that exact state', async () => {
  /*
   * The design calls this the single most important behaviour for presenting
   * live. Nothing about the scene may move: only who is driving.
   */
  const clock = fakeClock();
  const experience = fakeExperience();
  const present = createNepalPresentation({
    experience,
    mount: mountPoint(),
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  present.start();
  await Promise.resolve();
  await clock.tick();
  const wasAt = experience.sceneIndex;

  present.escapeToExplore();
  assert.equal(experience.mode, MODE.EXPLORE);
  assert.equal(experience.sceneIndex, wasAt, 'the scene did not move');
  assert.equal(present.state.status, 'paused');

  /* And it stays put: no timer is left to advance it behind the presenter. */
  await clock.tick();
  assert.equal(experience.sceneIndex, wasAt);
  present.destroy();
});

test('the keyboard steps, pauses and resumes, and leaves fields alone', async () => {
  const clock = fakeClock();
  const experience = fakeExperience();
  const present = createNepalPresentation({
    experience,
    mount: mountPoint(),
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  present.start();
  await Promise.resolve();

  const key = (k, target = { tagName: 'DIV' }) => {
    let prevented = false;
    present.handleKey({ key: k, target, preventDefault: () => { prevented = true; } });
    return prevented;
  };

  assert.equal(key('ArrowRight'), true);
  assert.equal(experience.sceneIndex, 1);
  assert.equal(present.state.status, 'paused', 'stepping by hand takes over');

  key('ArrowLeft');
  assert.equal(experience.sceneIndex, 0);

  key('p');
  assert.equal(experience.mode, MODE.PRESENT);
  assert.equal(present.state.status, 'playing');

  key(' ');
  assert.equal(experience.mode, MODE.EXPLORE, 'space escapes to explore');
  assert.equal(present.state.status, 'paused');

  key('E');
  assert.equal(experience.mode, MODE.EXPLORE);

  /* A space typed into a field is a space, not a pause. */
  present.playback.play();
  assert.equal(key(' ', { tagName: 'INPUT' }), false);
  assert.equal(present.state.status, 'playing');
  assert.equal(key('x'), false, 'an unbound key is not swallowed');
  present.destroy();
});

test('a beat whose layer failed still runs, and the strip says which', async () => {
  const clock = fakeClock();
  const experience = fakeExperience({ failed: ['seismicEvents'] });
  const mount = mountPoint();
  const present = createNepalPresentation({
    experience,
    mount,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  present.start();
  await Promise.resolve();
  /* Scene 02 is the first beat that needs the seismic catalogue. */
  present.playback.goTo(2);
  await Promise.resolve();
  assert.match(mount.textContent, /layer unavailable: seismicEvents/);
  /* It did not skip the beat: silently skipping presents a rosier product. */
  assert.equal(experience.sceneIndex, 2);
  present.destroy();
});

test('destroying releases the key listener and the strip', async () => {
  const clock = fakeClock();
  const experience = fakeExperience();
  const mount = mountPoint();
  const present = createNepalPresentation({
    experience,
    mount,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  present.start();
  await Promise.resolve();
  present.destroy();
  assert.equal(mount.children.length, 0);
  /* A late tick must not move anything after teardown. */
  const wasAt = experience.sceneIndex;
  await clock.tick();
  assert.equal(experience.sceneIndex, wasAt);
});

test('a beat hands its staging to the experience', async () => {
  const clock = fakeClock();
  const experience = fakeExperience();
  const focuses = [];
  experience.setBeatFocus = (focus) => focuses.push(focus);
  const present = createNepalPresentation({
    experience,
    mount: mountPoint(),
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  present.start();
  await Promise.resolve();
  const at = present.script.beats.findIndex((beat) => beat.sceneId === 'model-vs-observed');
  while (present.state.index < at) present.playback.next();
  assert.deepEqual(focuses.at(-1), { panel: 'lookAtTheMap', mapAction: null });
  present.playback.next();
  present.playback.next();
  assert.deepEqual(focuses.at(-1), { panel: 'withinArea', mapAction: 'isolateAreas' });
  present.destroy();
});
