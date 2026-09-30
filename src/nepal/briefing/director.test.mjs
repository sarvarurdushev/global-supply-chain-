import test from 'node:test';
import assert from 'node:assert/strict';
import { createClock } from './clock.js';
import { STATUS, createDirector } from './director.js';
import { RUNS, defineScene, planRun } from './timeline.js';

/** Let every pending promise callback run. */
async function settle() {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
}

/** Advance the clock in small steps, settling promises between them. */
async function run(clock, ms, step = 50) {
  for (let t = 0; t < ms; t += step) {
    clock.advance(step);
    await settle();
  }
}

function fakeStage({ voice = false } = {}) {
  const log = [];
  return {
    log,
    hasVoice: voice,
    enterScene: (scene, { instant }) => log.push(['enter', scene.id, instant]),
    run: (action, { instant }) => {
      log.push([instant ? 'instant' : 'play', action.id]);
    },
    caption: (text, options) => log.push(['caption', text, options?.instant === true]),
    speak: (text) => {
      log.push(['speak', text]);
      return { done: Promise.resolve(), cancel: () => {} };
    },
    cancel: () => log.push(['cancel']),
    pause: () => log.push(['pause']),
    resume: () => log.push(['resume']),
  };
}

const beat = (id, actions, extra = {}) => ({
  id,
  caption: `${id} caption`,
  minHoldMs: 200,
  actions: actions.map(([at, aid]) => ({ at, type: 'annotation.draw', id: aid, duration: 0 })),
  ...extra,
});

const scenes = [
  defineScene({
    id: 's1',
    question: 'q1',
    runs: [RUNS.FULL, RUNS.THREE],
    beats: [
      beat('a', [[0, 'a1'], [300, 'a2']]),
      beat('b', [[0, 'b1'], [100, 'b2']], { runs: [RUNS.FULL] }),
      beat('c', [[0, 'c1'], [100, 'c2']]),
    ],
  }),
  defineScene({
    id: 's2',
    question: 'q2',
    runs: [RUNS.FULL, RUNS.THREE],
    beats: [beat('d', [[0, 'd1'], [200, 'd2']])],
  }),
];

test('a run plays every beat in order and finishes', async () => {
  const clock = createClock();
  const stage = fakeStage();
  const director = createDirector({ plan: planRun(scenes, RUNS.FULL), stage, clock });
  director.play();
  await run(clock, 30_000);
  assert.equal(director.state.status, STATUS.FINISHED);
  const played = stage.log.filter(([kind]) => kind === 'play').map(([, id]) => id);
  assert.deepEqual(played, ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'd1', 'd2']);
});

test('a beat does not end before its caption has been readable', async () => {
  const clock = createClock();
  const director = createDirector({ plan: planRun(scenes, RUNS.FULL), stage: fakeStage(), clock });
  director.play();
  await run(clock, 400);
  assert.equal(director.state.beatId, 'a', 'actions are done at 300 ms, reading is not');
  await run(clock, 2000);
  assert.notEqual(director.state.beatId, 'a');
});

test('NEXT during playback moves immediately and KEEPS PLAYING', async () => {
  const clock = createClock();
  const stage = fakeStage();
  const director = createDirector({ plan: planRun(scenes, RUNS.FULL), stage, clock });
  director.play();
  await run(clock, 100);
  director.next();
  await settle();
  assert.equal(director.state.beatId, 'b');
  assert.equal(director.state.status, STATUS.PLAYING, 'a skip is not a pause');
  await run(clock, 400);
  /* Beat a's second action (due at 300 ms) must never fire after the skip. */
  const late = stage.log.filter(([kind, id]) => kind === 'play' && id === 'a2');
  assert.equal(late.length, 0);
});

test('BACK to a beat mid-scene rebuilds the earlier beats instantly', async () => {
  const clock = createClock();
  const stage = fakeStage();
  const director = createDirector({ plan: planRun(scenes, RUNS.FULL), stage, clock });
  director.play();
  await run(clock, 30_000);
  stage.log.length = 0;
  director.goToScene('s1');
  await settle();
  director.next();
  director.next();
  await settle();
  director.previous();
  await settle();
  assert.equal(director.state.beatId, 'b');
  const instants = stage.log.filter(([kind]) => kind === 'instant').map(([, id]) => id);
  assert.ok(instants.includes('a1') && instants.includes('a2'), 'beat a rebuilt without animation');
});

test('pause freezes the beat; play resumes where it stopped', async () => {
  const clock = createClock();
  const director = createDirector({ plan: planRun(scenes, RUNS.FULL), stage: fakeStage(), clock });
  director.play();
  await run(clock, 100);
  director.pause();
  const before = clock.now();
  await run(clock, 60_000);
  assert.equal(clock.now(), before, 'no time passes while paused');
  assert.equal(director.state.beatId, 'a');
  director.play();
  await run(clock, 5000);
  assert.notEqual(director.state.beatId, 'a');
});

test('a jump while paused shows the whole beat and stays paused', async () => {
  const clock = createClock();
  const stage = fakeStage();
  const director = createDirector({ plan: planRun(scenes, RUNS.FULL), stage, clock });
  director.play();
  await run(clock, 50);
  director.pause();
  director.next();
  await settle();
  assert.equal(director.state.status, STATUS.PAUSED);
  assert.equal(director.state.beatId, 'b');
  const shown = stage.log.filter(([kind]) => kind === 'instant').map(([, id]) => id);
  assert.ok(shown.includes('b1') && shown.includes('b2'));
  /* The paused clock cannot type the caption, so it is shown whole. */
  assert.deepEqual(stage.log.filter(([kind]) => kind === 'caption').at(-1), ['caption', 'b caption', true]);
});

test('a beat played in time types its caption on the clock', async () => {
  const clock = createClock();
  const stage = fakeStage();
  const director = createDirector({ plan: planRun(scenes, RUNS.FULL), stage, clock });
  director.play();
  await run(clock, 50);
  assert.deepEqual(stage.log.find(([kind]) => kind === 'caption'), ['caption', 'a caption', false]);
});

test('speed shortens the briefing in wall time', async () => {
  const lengths = [];
  for (const speed of [1, 1.5]) {
    const clock = createClock();
    const director = createDirector({ plan: planRun(scenes, RUNS.FULL), stage: fakeStage(), clock });
    director.setSpeed(speed);
    director.play();
    let wall = 0;
    while (director.state.status !== STATUS.FINISHED && wall < 60_000) {
      clock.advance(50);
      await settle();
      wall += 50;
    }
    lengths.push(wall);
  }
  assert.ok(lengths[1] < lengths[0] * 0.75, `1.5× took ${lengths[1]} ms vs ${lengths[0]} ms`);
});

test('a shorter run skips a beat but still builds its state', async () => {
  const clock = createClock();
  const stage = fakeStage();
  const plan = planRun(scenes, RUNS.THREE);
  assert.deepEqual(plan.map((entry) => entry.beat.id), ['a', 'c', 'd']);
  const director = createDirector({ plan, stage, clock });
  director.play();
  await run(clock, 30_000);
  const instants = stage.log.filter(([kind]) => kind === 'instant').map(([, id]) => id);
  assert.ok(instants.includes('b1') && instants.includes('b2'), 'beat b is applied, not played');
});

test('with a voice, the beat waits for the narration to finish', async () => {
  const clock = createClock();
  let finish;
  const stage = fakeStage({ voice: true });
  stage.speak = () => ({ done: new Promise((resolve) => { finish = resolve; }), cancel: () => {} });
  const narrated = [defineScene({ id: 'v', question: 'q', beats: [beat('x', [[0, 'x1'], [100, 'x2']], { narration: 'one two three' }), beat('y', [[0, 'y1'], [100, 'y2']])] })];
  const director = createDirector({ plan: planRun(narrated, RUNS.FULL), stage, clock });
  director.play();
  await run(clock, 1000);
  assert.equal(director.state.beatId, 'x', 'still speaking');
  finish();
  await run(clock, 400);
  assert.equal(director.state.beatId, 'y');
});
