import test from 'node:test';
import assert from 'node:assert/strict';
import { BRIEFING_SCENES } from './scenes/index.js';
import { RUNS, planRun } from './timeline.js';
import { lifecycle } from './lifecycle.js';

for (const run of [RUNS.THREE, RUNS.SIX, RUNS.FULL]) {
  test(`${run}: one idea at a time — never more than four reading panels on screen`, () => {
    const crowded = lifecycle(planRun(BRIEFING_SCENES, run))
      .filter((row) => row.panels.length > 4)
      .map((row) => `${row.key}: ${row.panels.map((p) => p.id).join(', ')}`);
    assert.deepEqual(crowded, []);
  });

  test(`${run}: nothing outlives its scene unless the next scene keeps it`, () => {
    const rows = lifecycle(planRun(BRIEFING_SCENES, run));
    for (const row of rows)
      for (const obj of row.objects) {
        const fromScene = obj.from.split(':')[0];
        const here = row.key.split(':')[0];
        if (fromScene !== here)
          assert.equal(obj.policy, 'PERSIST', `${row.key}: ${obj.id} from ${obj.from}`);
      }
  });
}
