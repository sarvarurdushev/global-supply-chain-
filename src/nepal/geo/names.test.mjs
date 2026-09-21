import test from 'node:test';
import assert from 'node:assert/strict';
import { editDistance, resolveName } from './names.js';

const CANONICAL = [
  'chitwan', 'kavrepalanchok', 'kapilvastu', 'makwanpur', 'sindhupalchowk',
  'tanahun', 'tehrathum', 'dailekh', 'gorkha', 'bara', 'parsa', 'siraha', 'saptari',
];

test('edit distance is symmetric and zero only for equality', () => {
  assert.equal(editDistance('chitwan', 'chitwan'), 0);
  assert.equal(editDistance('chitawan', 'chitwan'), 1);
  assert.equal(editDistance('chitwan', 'chitawan'), 1);
  assert.equal(editDistance('', 'abc'), 3);
  assert.equal(editDistance('abc', ''), 3);
});

test('the real OCHA spellings resolve to the verified names', () => {
  // Every one of these cost a district in the first join attempt.
  const pairs = [
    ['chitawan', 'chitwan'],
    ['kabhrepalanchok', 'kavrepalanchok'],
    ['kapilbastu', 'kapilvastu'],
    ['makawanpur', 'makwanpur'],
    ['sindhupalchok', 'sindhupalchowk'],
    ['tanahu', 'tanahun'],
    ['terhathum', 'tehrathum'],
  ];
  for (const [source, expected] of pairs) {
    const result = resolveName(source, CANONICAL);
    assert.equal(result.matched, expected, `${source} -> ${result.matched} (${result.reason})`);
    assert.ok(result.distance <= 2);
  }
});

test('an exact match is reported as one, not as a near miss', () => {
  const result = resolveName('gorkha', CANONICAL);
  assert.equal(result.matched, 'gorkha');
  assert.equal(result.distance, 0);
  assert.equal(result.reason, 'exact match');
});

test('a genuinely different district is refused rather than snapped to a neighbour', () => {
  // Jajarkot has no polygon in the source file. Matching it to Dailekh — the
  // district that IS there — would put one district's statistics on another's
  // geometry, and the map would look entirely plausible.
  const result = resolveName('jajarkot', CANONICAL);
  assert.equal(result.matched, null);
  assert.match(result.reason, /edits away|too large a share/);
});

test('short names are held to a tighter standard than long ones', () => {
  // "bara" and "parsa" are two edits apart; on four-letter names that is not
  // a transliteration difference, it is a different place.
  const result = resolveName('barsa', ['bara', 'parsa']);
  assert.equal(result.matched, null);
  assert.match(result.reason, /ambiguous|too large a share/);
});

test('a tie is never broken by ordering', () => {
  const result = resolveName('xyz', ['xya', 'xyb']);
  assert.equal(result.matched, null);
  assert.match(result.reason, /ambiguous/);
});

test('an empty name resolves to nothing', () => {
  assert.equal(resolveName('', CANONICAL).matched, null);
  assert.equal(resolveName(null, CANONICAL).reason, 'empty name');
});
