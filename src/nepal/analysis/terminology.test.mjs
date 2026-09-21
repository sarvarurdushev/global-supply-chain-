import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FORBIDDEN_PHRASING,
  ImpactVariable,
  ResultClass,
  describeExposure,
  findForbiddenPhrasing,
  roundPercent,
  roundPopulation,
} from './terminology.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

test('the five impact variables are distinct and say what they do not imply', () => {
  const ids = Object.values(ImpactVariable).map((v) => v.id);
  assert.equal(new Set(ids).size, 5);
  for (const variable of Object.values(ImpactVariable)) {
    assert.ok(variable.measures.length > 20, `${variable.id} has no definition`);
    assert.ok(variable.doesNotImply.length > 20, `${variable.id} does not say what it excludes`);
    assert.equal(typeof variable.availableToUs, 'boolean');
  }
  // Only exposure and damage are derivable here. The rest must stay absent.
  assert.equal(ImpactVariable.EXPOSURE.availableToUs, true);
  assert.equal(ImpactVariable.DAMAGE.availableToUs, true);
  assert.equal(ImpactVariable.CASUALTIES.availableToUs, false);
  assert.equal(ImpactVariable.HUMANITARIAN_NEED.availableToUs, false);
  assert.equal(ImpactVariable.DISPLACEMENT.availableToUs, false);
});

test('the sanctioned sentence names the variable, the threshold and that both are modelled', () => {
  const sentence = describeExposure({ people: 13_835_518, threshold: 6, roman: 'VI' });
  assert.match(sentence, /geographically exposed/);
  assert.match(sentence, /modelled shaking/);
  assert.match(sentence, /MMI VI or greater/);
  assert.match(sentence, /13\.84 million/);
  // And it must not smuggle in harm.
  assert.deepEqual(findForbiddenPhrasing(sentence), []);
});

test('the forbidden words are caught, including in the sentence people reach for', () => {
  assert.deepEqual(
    findForbiddenPhrasing('13.8 million people were affected').map((r) => r.phrase),
    ['affected'],
  );
  assert.equal(findForbiddenPhrasing('the region was impacted by the quake').length, 1);
  assert.equal(findForbiddenPhrasing('families hit by the earthquake').length, 1);
  assert.equal(findForbiddenPhrasing('exposed to modelled shaking').length, 0);
  // A substring must not trip it: "unaffected" is not "affected".
  assert.equal(findForbiddenPhrasing('the district was unaffected').length, 0);
  for (const rule of FORBIDDEN_PHRASING) assert.ok(rule.instead.length > 5);
});

test('population is rounded to what a modelled surface can carry', () => {
  // The exact integer is for reconciliation; it is not a claim to the person.
  assert.equal(roundPopulation(13_835_518).text, '13.84 million');
  assert.equal(roundPopulation(235_116).text, '235,000');
  assert.equal(roundPopulation(7_453_534).text, '7.45 million');
  assert.equal(roundPopulation(1_234).text, '1,200');
  assert.equal(roundPopulation(42).text, '42');
  assert.equal(roundPopulation(Number.NaN), null);
  assert.equal(roundPercent(51.2194), 51.2);
});

test('a fitted model parameter is classified apart from an observation', () => {
  // The distinction the seismic stage needed: a magnitude is measured, a
  // b-value is a parameter of a model fitted to measurements.
  assert.ok(ResultClass.MODEL_FIT.means.includes('NOT a measurement'));
  assert.notEqual(ResultClass.MODEL_FIT.id, ResultClass.OBSERVED.id);
  assert.notEqual(ResultClass.MODEL_FIT.id, ResultClass.DESCRIPTIVE_STATISTIC.id);
  assert.equal(new Set(Object.values(ResultClass).map((r) => r.id)).size, 7);
});

test('the shipped analysis artefacts contain no overstated language', async () => {
  // The rule enforced against what this project actually writes, rather than
  // merely stated in a module nobody reads.
  for (const name of ['nepal-2015-population-exposure.json', 'nepal-2015-seismic-analysis.json']) {
    const file = path.join(ROOT, 'data', 'analysis', name);
    let text;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      continue; // artefact not built in this checkout
    }
    const payload = JSON.parse(text);
    /*
     * The vocabulary block itself quotes the forbidden words in order to
     * forbid them, so it is excluded from the scan; everything else is
     * checked.
     */
    const scanned = JSON.stringify({
      ...payload,
      definitionOfExposure: undefined,
    });
    const hits = findForbiddenPhrasing(scanned);
    assert.deepEqual(
      hits.map((h) => h.phrase),
      [],
      `${name} uses ${hits.map((h) => h.phrase).join(', ')}`,
    );
  }
});

test('the seismic artefact classifies its fitted parameters as fitted', async () => {
  const file = path.join(ROOT, 'data', 'analysis', 'nepal-2015-seismic-analysis.json');
  let payload;
  try {
    payload = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return;
  }
  const classes = payload.resultClassification;
  assert.equal(classes.mainShock, 'OBSERVED');
  assert.equal(classes.magnitude, 'DESCRIPTIVE_STATISTIC');
  assert.equal(classes.gutenbergRichter, 'MODEL_FIT');
  assert.equal(classes.omori, 'MODEL_FIT');
  assert.equal(classes.bValueSensitivity, 'MODEL_FIT');
});
