import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatUsd,
  formatCount,
  formatPercent,
  formatterForUnit,
} from './charts.js';

/* These are the value labels a reader takes at face value. A wrong unit here
 * is not a cosmetic defect — it states something false about the number, which
 * is exactly what docs/LIMITATIONS.md commits this project not to do. */

test('formatUsd keeps the order of magnitude and marks currency', () => {
  assert.equal(formatUsd(18_270_000_000_000), '$18.27T');
  assert.equal(formatUsd(4_560_000_000), '$4.6B');
  assert.equal(formatUsd(2_900_000), '$2.9M');
  assert.equal(formatUsd(1_500), '$1.5K');
  assert.equal(formatUsd(42), '$42');
  assert.equal(formatUsd(Number.NaN), 'n/a');
  assert.equal(formatUsd(null), 'n/a');
});

test('formatCount renders magnitudes without a currency symbol', () => {
  // Container throughput is a count of boxes. "$278.8M TEU" is nonsense.
  assert.equal(formatCount(278_800_000), '278.8M');
  assert.equal(formatCount(30_000_000), '30.0M');
  assert.equal(formatCount(114), '114');
  // Index values below 10 keep a decimal; rounding 9.4 to "9" loses the point.
  assert.equal(formatCount(9.4), '9.4');
  assert.ok(!formatCount(12_345).includes('$'));
  assert.equal(formatCount(Number.POSITIVE_INFINITY), 'n/a');
});

test('formatPercent renders a percentage', () => {
  assert.equal(formatPercent(9.2), '9.2%');
  assert.equal(formatPercent(0), '0.0%');
  assert.equal(formatPercent(Number.NaN), 'n/a');
});

test('formatterForUnit picks by the published unit string', () => {
  // The exact unit strings the comparison panel passes.
  assert.equal(formatterForUnit('current US$'), formatUsd);
  assert.equal(formatterForUnit('% of GDP'), formatPercent);
  assert.equal(formatterForUnit('% of merchandise exports'), formatPercent);
  assert.equal(formatterForUnit('TEU'), formatCount);
  assert.equal(formatterForUnit('2014-2016 = 100'), formatCount);
  // An unknown or missing unit must not default to money.
  assert.equal(formatterForUnit(undefined), formatCount);
  assert.equal(formatterForUnit('kg'), formatCount);
});
