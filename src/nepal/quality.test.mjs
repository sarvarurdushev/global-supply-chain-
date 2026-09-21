import test from 'node:test';
import assert from 'node:assert/strict';
import { Issue, createQualityLog, formatQualitySummary } from './quality.js';

test('a log that does not reconcile throws instead of reporting a tidy total', () => {
  const log = createQualityLog('fixture');
  log.readRecord(10);
  log.keptRecord(8);
  // Two records vanished without being dropped: the exact silent-loss bug
  // this reconciliation exists to catch.
  assert.throws(() => log.summary(), /does not reconcile/);
});

test('a balanced log reports retention and groups issues by cause', () => {
  const log = createQualityLog('fixture');
  log.readRecord(5);
  log.keptRecord(3);
  log.drop(Issue.INVALID_COORDINATE, 'null island', { id: 'a' });
  log.drop(Issue.INVALID_COORDINATE, 'out of range', { id: 'b' });
  const summary = log.summary();
  assert.equal(summary.read, 5);
  assert.equal(summary.kept, 3);
  assert.equal(summary.dropped, 2);
  assert.equal(summary.retention, 0.6);
  assert.equal(summary.issues[0].code, Issue.INVALID_COORDINATE);
  assert.equal(summary.issues[0].count, 2);
  assert.deepEqual([...summary.issues[0].details], ['null island', 'out of range']);
});

test('a repair is not a drop: it keeps the record and still changes the data', () => {
  const log = createQualityLog('fixture');
  log.readRecord(2);
  log.keptRecord(2);
  log.repair('thousands separator removed', '275,903');
  const summary = log.summary();
  assert.equal(summary.dropped, 0);
  assert.equal(summary.retention, 1);
  const repaired = summary.issues.find((i) => i.code === Issue.REPAIRED);
  assert.equal(repaired.count, 1);
  assert.deepEqual([...repaired.samples], ['275,903']);
});

test('dropping or repairing without a reason is a programming error', () => {
  const log = createQualityLog('fixture');
  assert.throws(() => log.drop(Issue.MISSING_VALUE), /requires a reason/);
  assert.throws(() => log.repair(), /requires a description/);
  assert.throws(() => log.note('NOT_A_CODE', 'x'), /Unknown quality issue/);
});

test('the summary renders to report lines', () => {
  const log = createQualityLog('nepal-fixture');
  log.readRecord(3);
  log.keptRecord(2);
  log.drop(Issue.OUT_OF_STUDY_AREA, 'outside Nepal');
  const text = formatQualitySummary(log.summary());
  assert.match(text, /nepal-fixture: read 3, kept 2, dropped 1/);
  assert.match(text, /OUT_OF_STUDY_AREA x1/);
});
