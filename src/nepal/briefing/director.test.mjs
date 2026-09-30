import test from 'node:test';
import assert from 'node:assert/strict';
import { createClock } from './clock.js';
import { STATUS, createDirector } from './director.js';
import { PACING, RUNS, defineScene, entryLengthMs, planRun, sceneEndHoldMs } from './timeline.js';

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
  /* Played forward over b: the scene is not entered again, and a is not re-applied. */
  assert.equal(stage.log.filter(([kind, id]) => kind === 'enter' && id === 's1').length, 1);
  assert.ok(!instants.includes('a1') && !instants.includes('a2'), 'the beat already on stage is not rebuilt');
});

test('played over a left-out beat, its camera move and the marks the next beat removes are skipped', async () => {
  const clock = createClock();
  const stage = fakeStage();
  const flyThenCard = defineScene({
    id: 'sum',
    question: 'q',
    runs: [RUNS.FULL, RUNS.THREE],
    beats: [
      { id: 'one', caption: 'one', minHoldMs: 200, actions: [{ at: 0, type: 'annotation.draw', id: 'card-1', duration: 0 }] },
      {
        id: 'two',
        caption: 'two',
        minHoldMs: 200,
        runs: [RUNS.FULL],
        actions: [
          { at: 0, type: 'annotation.remove', id: 'card-1' },
          { at: 0, type: 'camera.fly', id: 'fly-2', to: 'x' },
          { at: 0, type: 'layer.show', id: 'layer-2', layer: 'x' },
          { at: 0, type: 'annotation.draw', id: 'card-2', duration: 0 },
        ],
      },
      { id: 'three', caption: 'three', minHoldMs: 200, actions: [{ at: 0, type: 'annotation.remove', id: 'card-2' }] },
    ],
  });
  const director = createDirector({ plan: planRun([flyThenCard], RUNS.THREE), stage, clock });
  director.play();
  await run(clock, 30_000);
  const instants = stage.log.filter(([kind]) => kind === 'instant').map(([, id]) => id);
  assert.ok(instants.includes('layer-2'), 'lasting state of the left-out beat is applied');
  assert.ok(!instants.includes('fly-2'), 'its camera move is not');
  assert.ok(!instants.includes('card-2'), 'nor a card the next beat removes at once');
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

test('the last beat a run plays in a scene holds its final picture before the cut', () => {
  const quick = defineScene({
    id: 'quick',
    question: 'q',
    runs: [RUNS.FULL],
    beats: [
      { id: 'first', caption: 'one two', minHoldMs: 0, actions: [{ at: 0, type: 'annotation.draw', id: 'x', duration: 0 }] },
      { id: 'late', caption: 'one two', minHoldMs: 200, actions: [{ at: 900, type: 'annotation.draw', id: 'y', duration: 1000 }] },
    ],
  });
  const plan = planRun([quick], RUNS.FULL);
  assert.equal(sceneEndHoldMs(plan[0], { voiced: false }), 0, 'only the scene’s last beat is held');
  const last = plan[1];
  assert.ok(sceneEndHoldMs(last, { voiced: false }) > 0);
  /* Landed at 1.9 s; the held beat ends no sooner than 1.5 s later. */
  assert.ok(entryLengthMs(last, { voiced: false }) - 1900 >= PACING.sceneEndHoldMs);
});
