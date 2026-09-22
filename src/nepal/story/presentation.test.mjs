import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_HOLD_SEC,
  SHORT_RUN,
  nepalPresentation,
  runSeconds,
  scenesCovered,
} from './presentation.js';
import { SCENES, scene } from './scenes.js';

test('the full run visits every scene, and nothing is silently skipped', () => {
  /*
   * A presentation that misses a scene means a scene nobody ever sees, which
   * is how a broken panel survives to a demo.
   */
  const script = nepalPresentation();
  assert.deepEqual(
    scenesCovered(script),
    SCENES.map((entry) => entry.index),
  );
  assert.equal(script.id, 'npl-2015-eq');
  assert.equal(script.length, 'full');
});

test('a scene with its own beats contributes all of them, at its own weights', () => {
  /*
   * Scene 09 argues in three moves and the punchline needs twice the setup's
   * time. One hold for the scene would give them the same weight.
   */
  const script = nepalPresentation();
  const nine = scene('model-vs-observed');
  const beats = script.beats.filter((beat) => beat.sceneIndex === nine.index);
  assert.equal(beats.length, nine.beats.length);
  assert.equal(beats.length, 3);
  assert.deepEqual(
    beats.map((beat) => beat.id),
    [
      'model-vs-observed:looks-correlated',
      'model-vs-observed:the-statistics',
      'model-vs-observed:the-reversal',
    ],
  );
  assert.deepEqual(
    beats.map((beat) => beat.holdMs),
    [6000, 8000, 12_000],
  );
  assert.ok(
    beats.at(-1).holdMs > beats[0].holdMs,
    'the reversal holds longer than its setup',
  );
  assert.equal(beats.at(-1).mapAction, 'isolateAreas');

  /* Every beat carries its scene's question, so the strip can state it. */
  for (const beat of script.beats) {
    assert.match(beat.question, /\?$/);
    assert.ok(beat.title.length > 0);
    assert.ok(Array.isArray(beat.needs));
  }
});

test('both runs land on the runtimes the design asks for', () => {
  /*
   * 12-14 minutes full, about 6 short. The holds were worked backwards from
   * those targets; a first pass used a round 7 seconds and produced a
   * 2.5-minute slideshow nobody could read a panel in.
   */
  const full = runSeconds(nepalPresentation()) / 60;
  const short = runSeconds(nepalPresentation({ length: 'short' })) / 60;
  assert.ok(full >= 12 && full <= 14, `full run is ${full.toFixed(1)} min`);
  assert.ok(short >= 5 && short <= 7, `short run is ${short.toFixed(1)} min`);
  assert.ok(DEFAULT_HOLD_SEC.short > DEFAULT_HOLD_SEC.full, 'fewer scenes, longer each');
});

test('the short run is the argument without the descent', () => {
  const script = nepalPresentation({ length: 'short' });
  assert.equal(script.id, 'npl-2015-eq-short');
  const ids = [...new Set(script.beats.map((beat) => beat.sceneId))];
  assert.deepEqual(ids, [...SHORT_RUN]);
  /* Every named scene exists, so a rename cannot leave a hole in the run. */
  for (const id of SHORT_RUN) assert.ok(scene(id), `unknown scene "${id}"`);

  /* It keeps the centrepiece and the coverage gap: the two teaching moments. */
  assert.ok(ids.includes('model-vs-observed'));
  assert.ok(ids.includes('coverage-gap'));
  /* And it drops the descent and the network walk, which are the long parts. */
  assert.ok(!ids.includes('descend'));
  assert.ok(!ids.includes('network'));
});
