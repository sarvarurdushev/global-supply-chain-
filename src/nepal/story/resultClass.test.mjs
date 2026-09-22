import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MODELED,
  RESULT_CLASS_PRESENTATION,
  ResultClass,
  mapGrammarFor,
  needsScenarioBand,
  passesFilter,
  presentationFor,
  resolveResultClass,
  summariseClasses,
} from './resultClass.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

test('every class has a colour, a plain phrase and an explanation', () => {
  assert.equal(Object.keys(RESULT_CLASS_PRESENTATION).length, 8);
  for (const entry of Object.values(RESULT_CLASS_PRESENTATION)) {
    assert.ok(entry.label.length > 0, `${entry.id} has no label`);
    assert.ok(entry.plain.length > 5, `${entry.id} has no plain phrase`);
    assert.ok(entry.means.length > 30, `${entry.id} has no explanation`);
    assert.match(entry.colour, /^var\(--gx-/, `${entry.id} must use a palette token`);
    assert.equal(typeof entry.rank, 'number');
  }
  // Ranks are unique and ordered from observation outward.
  const ranks = Object.values(RESULT_CLASS_PRESENTATION).map((e) => e.rank);
  assert.equal(new Set(ranks).size, ranks.length);
  assert.equal(RESULT_CLASS_PRESENTATION[ResultClass.OBSERVED].rank, 0);
  assert.equal(RESULT_CLASS_PRESENTATION[ResultClass.DATA_GAP].rank, 7);
});

test('the legacy vocabulary resolves rather than falling through', () => {
  assert.equal(resolveResultClass('LIVE'), ResultClass.OBSERVED);
  assert.equal(resolveResultClass('HISTORICAL'), ResultClass.OBSERVED);
  assert.equal(resolveResultClass('INFERRED'), ResultClass.DERIVED);
  assert.equal(resolveResultClass('SIMULATED'), ResultClass.SCENARIO);
  assert.equal(resolveResultClass('UNKNOWN'), ResultClass.DATA_GAP);
  assert.equal(resolveResultClass('model_fit'), ResultClass.MODEL_FIT);
});

test('an unclassifiable figure becomes a visible gap, never a crash', () => {
  /*
   * A panel that cannot classify a figure must say so on screen. Throwing
   * would hide the very thing this module exists to surface.
   */
  for (const junk of ['wat', '', null, undefined, 42, {}]) {
    assert.equal(resolveResultClass(junk), ResultClass.DATA_GAP);
    assert.equal(presentationFor(junk).id, ResultClass.DATA_GAP);
  }
});

test('the data gap is not coloured like an alarm', () => {
  const gap = RESULT_CLASS_PRESENTATION[ResultClass.DATA_GAP];
  assert.equal(gap.colour, 'var(--gx-gap)');
  assert.notEqual(gap.colour, 'var(--gx-red)');
  assert.notEqual(gap.colour, 'var(--gx-amber)');
});

test('observed and modelled never share a map grammar', () => {
  // The single rule the whole visual argument rests on.
  const observed = mapGrammarFor(ResultClass.OBSERVED);
  const modeled = mapGrammarFor(ResultClass.OBSERVED, { modeled: true });
  assert.equal(observed.edge, 'hard');
  assert.equal(observed.shape, 'discrete');
  assert.equal(observed.outlineWidth, 1);
  assert.equal(modeled.edge, 'none');
  assert.equal(modeled.shape, 'field');
  assert.equal(modeled.outlineWidth, 0);
  assert.equal(modeled.chip, MODELED);
  assert.ok(observed.fillAlpha > modeled.fillAlpha);
});

test('scenario draws differently from derived, and both from observed', () => {
  const derived = mapGrammarFor(ResultClass.DERIVED);
  const scenario = mapGrammarFor(ResultClass.SCENARIO);
  const observed = mapGrammarFor(ResultClass.OBSERVED);
  assert.equal(observed.dashPattern, null, 'an observation is never dashed');
  assert.ok(derived.dashPattern !== null);
  assert.ok(scenario.outlineWidth > derived.outlineWidth);
  assert.notEqual(scenario.chip, derived.chip);
});

test('an empty filter shows everything rather than blanking the map', () => {
  // An empty selection that hid every layer would read as a bug.
  assert.equal(passesFilter(ResultClass.SCENARIO, new Set()), true);
  assert.equal(passesFilter(ResultClass.SCENARIO, null), true);
  assert.equal(passesFilter(ResultClass.SCENARIO, undefined), true);
});

test('the Scene 17 filter dims everything that is not observed', () => {
  const onlyObserved = new Set([ResultClass.OBSERVED]);
  assert.equal(passesFilter(ResultClass.OBSERVED, onlyObserved), true);
  for (const other of [
    ResultClass.DERIVED,
    ResultClass.MODEL_FIT,
    ResultClass.SCENARIO,
    ResultClass.ESTIMATE,
    ResultClass.DATA_GAP,
  ]) {
    assert.equal(passesFilter(other, onlyObserved), false, `${other} should be filtered out`);
  }
  // And legacy values are filtered on their canonical meaning.
  assert.equal(passesFilter('SIMULATED', onlyObserved), false);
  assert.equal(passesFilter('LIVE', onlyObserved), true);
});

test('classes summarise deduplicated and ordered by distance from observation', () => {
  assert.deepEqual(summariseClasses(['SCENARIO', 'OBSERVED', 'DERIVED', 'OBSERVED']), [
    ResultClass.OBSERVED,
    ResultClass.DERIVED,
    ResultClass.SCENARIO,
  ]);
  assert.deepEqual(summariseClasses([]), []);
  assert.deepEqual(summariseClasses(null), []);
});

test('only a scenario earns the persistent header band', () => {
  assert.equal(needsScenarioBand([ResultClass.DERIVED, ResultClass.OBSERVED]), false);
  assert.equal(needsScenarioBand([ResultClass.DERIVED, ResultClass.SCENARIO]), true);
  assert.equal(needsScenarioBand(['SIMULATED']), true, 'a legacy alias still earns it');
});

test('every result class used by a committed artefact is one this module knows', async () => {
  /*
   * The wiring failure this catches: an artefact introduces a class the
   * interface has never heard of, and every figure carrying it silently
   * renders as a data gap.
   */
  const dir = path.join(ROOT, 'data', 'analysis');
  const files = (await readdir(dir)).filter((name) => name.endsWith('.json'));
  const seen = new Set();
  for (const name of files) {
    const artefact = JSON.parse(await readFile(path.join(dir, name), 'utf8'));
    for (const record of artefact.methodology) {
      if (record.resultClass) seen.add(record.resultClass);
      if (record.dataClass) seen.add(record.dataClass);
    }
  }
  assert.ok(seen.size > 0, 'no result classes found in the artefacts');
  for (const value of seen) {
    assert.notEqual(
      resolveResultClass(value),
      ResultClass.DATA_GAP,
      `artefacts use "${value}" but the interface resolves it to DATA_GAP`,
    );
  }
});

test('the palette tokens every class names are defined in the stylesheet', async () => {
  const css = await readFile(path.join(ROOT, 'src/ui/styles/identity.css'), 'utf8');
  for (const entry of Object.values(RESULT_CLASS_PRESENTATION)) {
    const token = entry.colour.replace('var(', '').replace(')', '');
    assert.ok(
      css.includes(`${token}:`),
      `${entry.id} names ${token}, which the stylesheet does not define`,
    );
  }
  // And the hazard ramp is not green, because green is the interface.
  for (const step of ['--gx-mmi-6:', '--gx-mmi-8:']) {
    assert.ok(css.includes(step), `${step} is missing from the ramp`);
  }
});

test('a data gap is the faintest class and is still visible', () => {
  /*
   * At 0.18 over a dark globe the 66 unsurveyed districts of Scene 12 were
   * effectively not drawn, and the scene whose whole argument is "absence of
   * observation is not absence of damage" showed an empty map. Invisibility
   * says "nothing here"; the hatch and the dashed edge are what say "we
   * cannot answer this".
   */
  const gap = mapGrammarFor(ResultClass.DATA_GAP);
  const derived = mapGrammarFor(ResultClass.DERIVED);
  const observed = mapGrammarFor(ResultClass.OBSERVED);
  assert.ok(gap.fillAlpha >= 0.3, `a gap must be visible, got ${gap.fillAlpha}`);
  assert.ok(gap.fillAlpha < derived.fillAlpha, 'and still the faintest');
  assert.ok(derived.fillAlpha < observed.fillAlpha);
  assert.equal(gap.edge, 'dashed');
  assert.ok(gap.dashPattern > 0, 'the dash is what carries the meaning');
});
