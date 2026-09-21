import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCheckList, summariseChecks } from './validation.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

test('a check list carries names, details and a derived verdict', () => {
  const result = createCheckList([
    { name: 'first', passed: true, detail: 'fine' },
    { name: 'second', passed: false, detail: 'why it failed' },
  ]);
  assert.equal(result.checks.length, 2);
  assert.equal(result.passed, false);
  assert.deepEqual(result.failures, ['second: why it failed']);
  assert.equal(result.checks[0].detail, 'fine');
});

test('an unnamed or empty check list is refused', () => {
  assert.throws(() => createCheckList([{ passed: true }]), /has no name/);
  assert.throws(() => createCheckList([]), /at least one named check/);
  assert.throws(() => createCheckList(null), /at least one named check/);
});

test('a check with a non-boolean pass is treated as failed, not as truthy', () => {
  // `passed: 'yes'` must not slip through as a pass.
  const result = createCheckList([{ name: 'loose', passed: 'yes' }]);
  assert.equal(result.checks[0].passed, false);
  assert.equal(result.passed, false);
});

test('summarising distinguishes "no checks" from "checks I cannot read"', () => {
  const summary = summariseChecks([
    { stage: 5, validation: { checks: [{ passed: true }, { passed: false }] } },
    { stage: 3, validation: {} },
  ]);
  assert.equal(summary.passed, 1);
  assert.equal(summary.total, 2);
  assert.equal(summary.allCountable, false);
  assert.deepEqual(summary.uncountableStages, [3]);
  // The asterisk is the visible marker that the count is incomplete.
  assert.equal(summary.label, '1/2*');
});

test('every committed analysis artefact emits a countable check list', async () => {
  /*
   * The regression this guards: Stage 3 and Stage 4 once expressed validation
   * as named booleans while Stage 5 used an array, so no consumer could count
   * checks across all five without knowing which stage wrote each one. A header
   * reading "38/38" has to mean all of them.
   */
  const dir = path.join(ROOT, 'data', 'analysis');
  const files = (await readdir(dir)).filter((name) => name.endsWith('.json'));
  assert.equal(files.length, 5, 'expected five analysis artefacts');
  const artefacts = await Promise.all(
    files.map(async (name) => JSON.parse(await readFile(path.join(dir, name), 'utf8'))),
  );
  for (const artefact of artefacts) {
    assert.ok(
      Array.isArray(artefact.validation.checks),
      `stage ${artefact.stage} has no checks array`,
    );
    for (const check of artefact.validation.checks) {
      assert.ok(check.name?.length > 0, `stage ${artefact.stage} has an unnamed check`);
      assert.equal(typeof check.passed, 'boolean');
    }
  }
  const summary = summariseChecks(artefacts);
  assert.equal(summary.allCountable, true);
  assert.equal(summary.passed, summary.total, 'a committed artefact must not carry a failing check');
  assert.ok(summary.total >= 38, `expected at least 38 checks, got ${summary.total}`);
});
