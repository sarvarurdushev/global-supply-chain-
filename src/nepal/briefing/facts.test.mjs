import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FACTS, createFactBook, fillTemplate, formatValue } from './facts.js';

const load = (name) =>
  JSON.parse(readFileSync(new URL(`../../../data/analysis/${name}`, import.meta.url), 'utf8'));
const raw = {
  seismic: load('nepal-2015-seismic-analysis.json'),
  exposure: load('nepal-2015-population-exposure.json'),
  damage: load('nepal-2015-damage-analysis.json'),
  infrastructure: load('nepal-2015-infrastructure-analysis.json'),
  damagePopulation: load('nepal-2015-damage-population.json'),
  geometry: load('nepal-2015-briefing-geometry.json'),
  access: load('nepal-2015-health-access.json'),
};

test('every registered fact resolves against the committed artefacts', () => {
  const book = createFactBook(raw);
  for (const id of Object.keys(FACTS)) {
    assert.notEqual(book.value(id), undefined, id);
  }
});

test('the headline facts read the published values', () => {
  const book = createFactBook(raw);
  assert.equal(book.value('quake.magnitude'), 7.8);
  assert.equal(book.value('quake.depthKm'), 8.22);
  assert.equal(book.value('seq.firstDay'), 89);
  assert.equal(book.value('exposure.mmi6'), 13835518);
  assert.equal(book.value('exposure.mmi7'), 7453534);
  assert.equal(book.value('exposure.mmi8'), 235116);
  assert.equal(book.value('damage.counts').Destroyed, 2084);
  assert.equal(book.value('damage.total'), 4583);
});

test('formats present a value without changing it', () => {
  assert.equal(formatValue(13835518, 'mega2'), '13.84 M');
  assert.equal(formatValue(13835518, 'millionWords'), '13.8 million');
  assert.equal(formatValue(235116, 'kilo'), '235 K');
  assert.equal(formatValue(2084, 'int'), '2,084');
  assert.equal(formatValue('2015-04-25T06:11:25.950Z', 'utcTime'), '06:11:25 UTC');
  assert.equal(formatValue('2015-04-25T06:11:25.950Z', 'dateShort'), '25 APR 2015');
});

test('templates fill from facts, including one field of a structured fact', () => {
  const book = createFactBook(raw);
  assert.equal(
    fillTemplate('M{quake.magnitude|dec1}, {damage.counts.Destroyed|int} destroyed', book),
    'M7.8, 2,084 destroyed',
  );
  assert.throws(() => fillTemplate('{no.such.fact}', book), /names no fact/);
});

test('an unresolvable path throws with the fact named', () => {
  const book = createFactBook({ ...raw, seismic: { results: {} } });
  assert.throws(() => book.value('quake.magnitude'), /quake\.magnitude/);
});

test('a find selector picks a row by field, not by position', () => {
  const book = createFactBook(raw);
  assert.equal(book.value('exposure.kathmandu').districtKey, 'kathmandu');
  assert.equal(book.value('damage.manbu').area, 'Manbu Area');
  assert.equal(book.value('geo.epicentreDistrict'), 'Gorkha');
  assert.match(book.get('exposure.kathmandu').pathText, /districtKey=kathmandu/);
});

test('scientific notation stays a presentation of the published p', () => {
  assert.equal(formatValue(2.7599911960117723e-52, 'sci'), '2.8 × 10⁻⁵²');
});
