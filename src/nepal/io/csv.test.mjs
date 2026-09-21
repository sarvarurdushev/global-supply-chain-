import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseNumber } from './csv.js';

test('quoted fields carrying the delimiter stay one field', () => {
  // This is the real shape of OCHA's PGA_AffectedDistricts_POP.csv.
  const { header, rows } = parseCsv('district,population,pga_value\nArghakhanchi,"275,903",0.04\n');
  assert.deepEqual(header, ['district', 'population', 'pga_value']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].population, '275,903');
  assert.equal(rows[0].pga_value, '0.04');
});

test('doubled quotes, embedded newlines and CRLF are handled', () => {
  const { rows } = parseCsv('a,b\r\n"say ""hi""","two\nlines"\r\n');
  assert.equal(rows[0].a, 'say "hi"');
  assert.equal(rows[0].b, 'two\nlines');
});

test('a trailing newline does not become an empty record', () => {
  assert.equal(parseCsv('a,b\n1,2\n').rows.length, 1);
  assert.equal(parseCsv('a,b\n1,2\n\n').rows.length, 1);
});

test('an empty cell is null, not an empty string pretending to be a value', () => {
  const { rows } = parseCsv('a,b\n1,\n');
  assert.equal(rows[0].b, null);
});

test('a thousands separator is repaired, and the repair is reported', () => {
  // 275,903 parsed naively is 275 — a district of a quarter-million people
  // reduced to a rounding error that survives every later sum.
  assert.equal(Number('275,903'), Number.NaN);
  assert.equal(Number.parseInt('275,903', 10), 275);
  const parsed = parseNumber('275,903');
  assert.equal(parsed.value, 275903);
  assert.equal(parsed.repaired, true);
  assert.match(parsed.reason, /thousands separator/);
});

test('an ambiguous comma is refused rather than guessed', () => {
  // In much of Europe "1,5" is one and a half. Repairing it to 15 would be
  // inventing a value.
  const parsed = parseNumber('1,5');
  assert.equal(parsed.value, null);
  assert.equal(parsed.repaired, false);
  assert.match(parsed.reason, /not a number/);
});

test('plain numbers pass through unrepaired, and empty is empty', () => {
  assert.deepEqual(parseNumber('0.04'), { value: 0.04, repaired: false, reason: null });
  assert.deepEqual(parseNumber('-12'), { value: -12, repaired: false, reason: null });
  assert.equal(parseNumber('').value, null);
  assert.equal(parseNumber(null).reason, 'empty');
  // A genuine zero is a measurement, not a missing value.
  assert.equal(parseNumber('0').value, 0);
});
