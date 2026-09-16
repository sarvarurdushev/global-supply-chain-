import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INVESTIGATIONS,
  DEFAULT_STEP_HOLD_SEC,
  investigation,
  investigationDurationSec,
  createPlayback,
} from './investigations.js';
import { CHOKEPOINTS } from '../supplychain/reference/chokepoints.js';
import { DATA_CLASS_PRESENTATION } from './taxonomy.js';

/* ---------------- shape ---------------- */

test('every investigation starts from a question', () => {
  for (const entry of INVESTIGATIONS) {
    assert.match(entry.question, /\?$/, `${entry.id} does not ask a question`);
    assert.ok(entry.why?.length > 25, `${entry.id} does not say why it matters`);
    assert.ok(entry.steps.length >= 4, `${entry.id} is too short to be a story`);
  }
});

test('every step makes a claim and declares its data class', () => {
  for (const entry of INVESTIGATIONS) {
    for (const step of entry.steps) {
      assert.ok(step.title?.length > 3, `${entry.id}/${step.id} has no title`);
      assert.ok(
        step.claim?.length > 25,
        `${entry.id}/${step.id} makes no claim`,
      );
      assert.ok(
        Object.hasOwn(DATA_CLASS_PRESENTATION, step.dataClass),
        `${entry.id}/${step.id} has unknown data class "${step.dataClass}"`,
      );
    }
  }
});

test('every investigation ends by stating what it cannot tell you', () => {
  // The requirement is that an investigation is honest about its own reach,
  // and the last thing a viewer reads is what they remember.
  for (const entry of INVESTIGATIONS) {
    const last = entry.steps[entry.steps.length - 1];
    assert.ok(
      last.unknown || last.dataClass === 'UNKNOWN' || /cannot|generalis/i.test(last.title),
      `${entry.id} ends on "${last.title}" without stating a limit`,
    );
  }
});

test('a step whose answer is unknown says so instead of being dropped', () => {
  const nepal = investigation('nepal-corridor');
  const gap = nepal.steps.find((s) => s.dataClass === 'UNKNOWN');
  assert.ok(gap, 'the Nepal corridor has a real tonnage gap and must show it');
  assert.match(gap.claim, /Unknown/i);
  assert.match(gap.detail, /not published/i);
});

test('a simulated step is never dressed as an observation', () => {
  const hormuz = investigation('hormuz-closure');
  const close = hormuz.steps.find((s) => s.id === 'hormuz-close');
  assert.equal(close.dataClass, 'SIMULATED');
  const alternative = hormuz.steps.find((s) => s.id === 'hormuz-alternative');
  assert.equal(alternative.dataClass, 'SIMULATED');
  assert.ok(alternative.unknown, 'an alternative route must state its limits');
});

test('the event investigation treats the event as step one, not the answer', () => {
  const nepal = investigation('nepal-corridor');
  assert.equal(nepal.steps[0].id, 'nepal-event');
  assert.match(nepal.steps[0].detail, /not the analysis/i);
  // And it must reach the goods, which is the whole point.
  const ids = nepal.steps.map((s) => s.id);
  assert.ok(ids.includes('nepal-corridor'), 'must reach what the corridor carries');
  assert.ok(ids.includes('nepal-alternative'), 'must reach alternatives');
});

test('every scripted disruption targets a real chokepoint', () => {
  const known = new Set(CHOKEPOINTS.map((c) => c.id));
  for (const entry of INVESTIGATIONS) {
    for (const step of entry.steps) {
      if (step.action?.kind !== 'disruption') continue;
      assert.ok(
        known.has(step.action.target),
        `${entry.id}/${step.id} closes unknown chokepoint "${step.action.target}"`,
      );
    }
  }
});

test('step ids are unique within an investigation', () => {
  for (const entry of INVESTIGATIONS) {
    const ids = entry.steps.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, `${entry.id} has a duplicate step id`);
  }
});

test('duration is the sum of the holds', () => {
  const entry = investigation('hormuz-closure');
  const expected = entry.steps.reduce((t, s) => t + s.holdSec, 0);
  assert.equal(investigationDurationSec(entry), expected);
  assert.equal(investigationDurationSec(null), 0);
});

test('a step without an explicit hold gets a readable default', () => {
  assert.ok(DEFAULT_STEP_HOLD_SEC >= 5, 'a claim needs time to be read');
  assert.equal(
    investigationDurationSec({ steps: [{ id: 'a' }, { id: 'b' }] }),
    DEFAULT_STEP_HOLD_SEC * 2,
  );
});

/* ---------------- playback ----------------
 *
 * The inherited director plays a scene to the end once started. The single
 * loudest complaint about it is that the user cannot get out. Everything below
 * is about being able to stop.
 */

function harness(id = 'hormuz-closure') {
  const shown = [];
  const states = [];
  const timers = [];
  const playback = createPlayback({
    investigation: investigation(id),
    onStep: (step, index) => shown.push([index, step.id]),
    onChange: (state) => states.push(state),
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length - 1;
    },
    clearTimer: (handle) => {
      if (timers[handle]) timers[handle].cleared = true;
    },
  });
  // Run the most recently scheduled, uncleared timer.
  const tick = () => {
    for (let i = timers.length - 1; i >= 0; i -= 1) {
      if (!timers[i].cleared && !timers[i].fired) {
        timers[i].fired = true;
        timers[i].fn();
        return true;
      }
    }
    return false;
  };
  return { playback, shown, states, timers, tick };
}

test('play shows the first step and schedules the next', async () => {
  const { playback, shown, timers } = harness();
  const state = await playback.play();
  assert.deepEqual(shown, [[0, 'hormuz-where']]);
  assert.equal(state.status, 'playing');
  assert.equal(state.index, 0);
  assert.equal(timers.filter((t) => !t.cleared).length, 1);
});

test('auto-advance moves one step at a time', async () => {
  const { playback, shown, tick } = harness();
  await playback.play();
  tick();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(shown.at(-1), [1, 'hormuz-what-passes']);
});

test('pause stops the clock and keeps the step on screen', async () => {
  const { playback, timers } = harness();
  await playback.play();
  const state = playback.pause();
  assert.equal(state.status, 'paused');
  assert.equal(state.index, 0, 'the step stays up');
  assert.ok(
    timers.every((t) => t.cleared || t.fired),
    'no timer may survive a pause',
  );
});

test('pausing twice is harmless', async () => {
  const { playback } = harness();
  await playback.play();
  playback.pause();
  assert.equal(playback.pause().status, 'paused');
});

test('play resumes from where it paused, not from the beginning', async () => {
  const { playback, shown, tick } = harness();
  await playback.play();
  tick();
  await new Promise((r) => setTimeout(r, 0));
  playback.pause();
  const before = shown.length;
  const state = await playback.play();
  assert.equal(state.index, 1, 'resumed on the same step');
  assert.equal(shown.length, before, 'resuming must not re-show the step');
});

test('stop returns to the start and shows nothing', async () => {
  const { playback, timers } = harness();
  await playback.play();
  const state = playback.stop();
  assert.equal(state.status, 'idle');
  assert.equal(state.index, -1);
  assert.equal(state.step, null);
  assert.equal(state.progress, 0);
  assert.ok(timers.every((t) => t.cleared || t.fired));
});

test('the user can stop at any moment, including mid-investigation', async () => {
  const { playback, tick } = harness();
  await playback.play();
  tick();
  await new Promise((r) => setTimeout(r, 0));
  tick();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(playback.getState().index, 2);
  assert.equal(playback.stop().status, 'idle');
});

test('restart plays again from step one', async () => {
  const { playback, shown } = harness();
  await playback.play();
  await playback.next();
  const state = await playback.restart();
  assert.equal(state.index, 0);
  assert.equal(state.status, 'playing');
  assert.deepEqual(shown.at(-1), [0, 'hormuz-where']);
});

test('stepping forward by hand pauses rather than carrying the user off', async () => {
  const { playback } = harness();
  await playback.play();
  const state = await playback.next();
  assert.equal(state.index, 1);
  assert.equal(
    state.status,
    'paused',
    'a user who pressed Next wants to look at this step',
  );
});

test('stepping back works and also pauses', async () => {
  const { playback } = harness();
  await playback.play();
  await playback.next();
  const state = await playback.previous();
  assert.equal(state.index, 0);
  assert.equal(state.status, 'paused');
});

test('previous at the first step is a no-op, not an error', async () => {
  const { playback } = harness();
  await playback.play();
  const state = await playback.previous();
  assert.equal(state.index, 0);
  assert.equal(state.canPrevious, false);
});

test('next at the last step finishes rather than wrapping', async () => {
  const { playback } = harness();
  const entry = investigation('hormuz-closure');
  await playback.goTo(entry.steps.length - 1);
  const state = await playback.next();
  assert.equal(state.status, 'finished');
  assert.equal(state.index, entry.steps.length - 1);
  assert.equal(state.canNext, false);
});

test('auto-advance finishes at the end instead of looping', async () => {
  const { playback, tick, states } = harness();
  const entry = investigation('hormuz-closure');
  await playback.goTo(entry.steps.length - 1);
  await playback.play();
  tick();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(states.at(-1).status, 'finished');
});

test('progress runs from 0 to 1 and drives the progress bar', async () => {
  const { playback } = harness();
  const entry = investigation('hormuz-closure');
  assert.equal(playback.getState().progress, 0);
  await playback.play();
  assert.ok(playback.getState().progress > 0);
  await playback.goTo(entry.steps.length - 1);
  assert.equal(playback.getState().progress, 1);
});

test('goTo clamps rather than throwing on a bad index', async () => {
  const { playback } = harness();
  assert.equal((await playback.goTo(-5)).index, 0);
  const entry = investigation('hormuz-closure');
  assert.equal((await playback.goTo(999)).index, entry.steps.length - 1);
});

test('a failing step reports the error and playback survives', async () => {
  const states = [];
  const playback = createPlayback({
    investigation: investigation('hormuz-closure'),
    onStep: () => {
      throw new Error('camera unavailable');
    },
    onChange: (state) => states.push(state),
    setTimer: () => 0,
    clearTimer: () => {},
  });
  await playback.play();
  const failure = states.find((s) => s.stepError);
  assert.ok(failure, 'the failure must surface');
  assert.match(failure.stepError, /camera unavailable/);
  assert.equal(playback.getState().index, 0, 'playback is not stranded');
});

test('destroy releases the timer and is safe to call twice', async () => {
  const { playback, timers } = harness();
  await playback.play();
  playback.destroy();
  playback.destroy();
  assert.ok(timers.every((t) => t.cleared || t.fired));
});

test('createPlayback refuses an investigation it cannot play', () => {
  assert.throws(() => createPlayback({ onStep: () => {} }), /with steps/);
  assert.throws(
    () => createPlayback({ investigation: { steps: [] }, onStep: () => {} }),
    /with steps/,
  );
  assert.throws(
    () => createPlayback({ investigation: investigation('hormuz-closure') }),
    /onStep/,
  );
});

/* ---------------- scripted actions must resolve ----------------
 *
 * Found by running it: the console's setCommodity() takes a GROUP KEY and
 * returns false for anything else. A script written with an HS code ("8542")
 * was silently rejected and the investigation ran on whatever commodity
 * happened to be selected. Silent rejection plus a plausible-looking result is
 * the worst combination available, so this test exists.
 */

test('every scripted commodity is a real group key', async () => {
  const { COMMODITY_GROUPS } = await import(
    '../supplychain/reference/commodities.js'
  );
  const keys = new Set(COMMODITY_GROUPS.map((g) => g.key));
  for (const entry of INVESTIGATIONS) {
    for (const step of entry.steps) {
      const commodity = step.action?.commodity;
      if (!commodity) continue;
      assert.ok(
        keys.has(commodity),
        `${entry.id}/${step.id} uses "${commodity}", which setCommodity() would reject`,
      );
    }
  }
});

test('every scripted reporter is a country the console accepts', async () => {
  const { COUNTRIES } = await import('../supplychain/reference/countries.js');
  const iso3 = new Set(COUNTRIES.map((c) => c.iso3));
  for (const entry of INVESTIGATIONS) {
    for (const step of entry.steps) {
      const reporter = step.action?.reporter;
      if (!reporter) continue;
      assert.ok(
        iso3.has(reporter),
        `${entry.id}/${step.id} reports for unknown country "${reporter}"`,
      );
    }
  }
});

test('every scripted action names a kind the runner handles', () => {
  const handled = new Set(['trade', 'disruption', 'production', 'events']);
  for (const entry of INVESTIGATIONS) {
    for (const step of entry.steps) {
      if (!step.action) continue;
      assert.ok(
        handled.has(step.action.kind),
        `${entry.id}/${step.id} has unhandled action kind "${step.action.kind}"`,
      );
    }
  }
});

test('the fertilizer investigation can actually run', async () => {
  // Requirement 20 asked for a fertilizer supply chain and there was no
  // fertilizer commodity group at all — every step would have no-opped.
  const { COMMODITY_GROUPS } = await import(
    '../supplychain/reference/commodities.js'
  );
  const fertilizer = COMMODITY_GROUPS.filter((g) => g.key.startsWith('fertilizer-'));
  assert.ok(
    fertilizer.length >= 3,
    'nitrogen, phosphate and potash are three different supply chains',
  );
  const entry = investigation('fertilizer-dependency');
  assert.ok(entry.steps.some((s) => s.action?.commodity?.startsWith('fertilizer-')));
});
