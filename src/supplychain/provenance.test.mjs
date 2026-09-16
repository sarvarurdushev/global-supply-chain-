import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DataClass,
  ConfidenceBand,
  AssociationClass,
  DISPLAY_FLOOR,
  confidenceBand,
  isDisplayable,
  createEvidence,
  createProvenance,
  combineConfidence,
  classifyAssociation,
  freshness,
  dataGap,
} from './provenance.js';

const OK = {
  dataClass: DataClass.HISTORICAL,
  source: 'UN Comtrade',
  dataset: 'preview/C/A/HS',
  license: 'UN Comtrade terms of use',
  method: 'Direct API read',
};

test('confidenceBand maps scores onto the documented bands', () => {
  assert.equal(confidenceBand(1), ConfidenceBand.DOCUMENTED);
  assert.equal(confidenceBand(0.95), ConfidenceBand.DOCUMENTED);
  assert.equal(confidenceBand(0.94), ConfidenceBand.STRONG);
  assert.equal(confidenceBand(0.8), ConfidenceBand.STRONG);
  assert.equal(confidenceBand(0.79), ConfidenceBand.MODERATE);
  assert.equal(confidenceBand(0.6), ConfidenceBand.MODERATE);
  assert.equal(confidenceBand(0.59), ConfidenceBand.WEAK);
  assert.equal(confidenceBand(0.4), ConfidenceBand.WEAK);
  assert.equal(confidenceBand(0.39), ConfidenceBand.INSUFFICIENT);
  assert.equal(confidenceBand(0), ConfidenceBand.INSUFFICIENT);
});

test('confidence scores outside 0..1 are rejected, not clamped', () => {
  assert.throws(() => confidenceBand(1.01), RangeError);
  assert.throws(() => confidenceBand(-0.01), RangeError);
  assert.throws(() => confidenceBand('0.5'), TypeError);
  assert.throws(() => confidenceBand(NaN), TypeError);
});

test('isDisplayable enforces the 40% floor from the brief', () => {
  assert.equal(DISPLAY_FLOOR, 0.4);
  assert.equal(isDisplayable(0.4), true);
  assert.equal(isDisplayable(0.399), false);
});

test('createProvenance requires every field the provenance panel shows', () => {
  for (const missing of ['source', 'dataset', 'license', 'method']) {
    const input = { ...OK };
    delete input[missing];
    assert.throws(() => createProvenance(input), TypeError, `missing ${missing}`);
  }
  assert.throws(
    () => createProvenance({ ...OK, dataClass: 'MADE_UP' }),
    TypeError,
  );
});

test('lagging datasets cannot be classed LIVE', () => {
  // This is the guard that stops trade data being badged as live telemetry.
  for (const source of ['UN Comtrade', 'World Bank', 'IMF', 'OECD']) {
    assert.throws(
      () => createProvenance({ ...OK, source, dataClass: DataClass.LIVE }),
      /cannot be classed LIVE/,
      source,
    );
  }
  // The same source is fine as HISTORICAL.
  assert.equal(
    createProvenance({ ...OK, source: 'UN Comtrade' }).dataClass,
    DataClass.HISTORICAL,
  );
  // A genuinely live source is unaffected.
  assert.equal(
    createProvenance({
      ...OK,
      source: 'AISStream.io',
      dataClass: DataClass.LIVE,
    }).dataClass,
    DataClass.LIVE,
  );
});

test('createProvenance carries a badge and is deeply frozen', () => {
  const p = createProvenance({ ...OK, limitations: ['lags 1-2 years'] });
  assert.equal(p.badge, '🔵 HISTORICAL');
  assert.equal(p.confidenceBand, ConfidenceBand.DOCUMENTED);
  assert.ok(Object.isFrozen(p));
  assert.ok(Object.isFrozen(p.limitations));
  assert.ok(Object.isFrozen(p.evidence));
  assert.throws(() => {
    'use strict';
    p.confidence = 1;
  });
});

test('UNKNOWN defaults to zero confidence and is not displayable', () => {
  const p = createProvenance({ ...OK, dataClass: DataClass.UNKNOWN });
  assert.equal(p.confidence, 0);
  assert.equal(p.displayable, false);
});

test('createEvidence validates its fields', () => {
  assert.throws(() => createEvidence({ kind: '', detail: 'd', source: 's', weight: 0.5 }), TypeError);
  assert.throws(() => createEvidence({ kind: 'k', detail: 'd', source: 's', weight: 2 }), RangeError);
  assert.throws(
    () => createEvidence({ kind: 'k', detail: 'd', source: 's', weight: 0.5, supports: 'yes' }),
    TypeError,
  );
  const e = createEvidence({ kind: 'k', detail: 'd', source: 's', weight: 0.5 });
  assert.equal(e.supports, true);
  assert.ok(Object.isFrozen(e));
});

test('combineConfidence accumulates independent support by noisy-OR', () => {
  assert.equal(combineConfidence([]), 0);
  const one = combineConfidence([
    createEvidence({ kind: 'a', detail: 'd', source: 's', weight: 0.5 }),
  ]);
  assert.ok(Math.abs(one - 0.5) < 1e-12);
  // Two independent 0.5 signals -> 1 - 0.25 = 0.75. Stronger than either alone.
  const two = combineConfidence([
    createEvidence({ kind: 'a', detail: 'd', source: 's', weight: 0.5 }),
    createEvidence({ kind: 'b', detail: 'd', source: 't', weight: 0.5 }),
  ]);
  assert.ok(Math.abs(two - 0.75) < 1e-12);
  assert.ok(two > one);
});

test('combineConfidence never reaches certainty from weak evidence alone', () => {
  const many = Array.from({ length: 50 }, (_, i) =>
    createEvidence({ kind: `k${i}`, detail: 'd', source: 's', weight: 0.1 }),
  );
  const score = combineConfidence(many);
  assert.ok(score < 1, `expected < 1, got ${score}`);
  assert.ok(score > 0.99);
});

test('contradicting evidence reduces the score', () => {
  const supporting = createEvidence({ kind: 'a', detail: 'd', source: 's', weight: 0.8 });
  const against = createEvidence({
    kind: 'b',
    detail: 'contradicts',
    source: 't',
    weight: 0.5,
    supports: false,
  });
  const withoutObjection = combineConfidence([supporting]);
  const withObjection = combineConfidence([supporting, against]);
  assert.ok(Math.abs(withObjection - 0.4) < 1e-12);
  assert.ok(withObjection < withoutObjection);
});

test('contradicting evidence alone yields zero, not a negative score', () => {
  const only = combineConfidence([
    createEvidence({ kind: 'a', detail: 'd', source: 's', weight: 0.9, supports: false }),
  ]);
  assert.equal(only, 0);
});

test('an association is only VERIFIED with direct documentation', () => {
  // Overwhelming indirect evidence must still not reach VERIFIED. This is the
  // guard against fabricating cargo certainty from circumstantial signals.
  const indirect = Array.from({ length: 20 }, (_, i) =>
    createEvidence({ kind: 'vessel-route', detail: 'd', source: `s${i}`, weight: 0.5 }),
  );
  const strong = classifyAssociation(indirect);
  assert.ok(strong.confidence > 0.99);
  assert.equal(strong.association, AssociationClass.INFERRED);

  const documented = classifyAssociation([
    createEvidence({
      kind: 'direct-documentation',
      detail: 'Port authority publishes the cargo manifest for this call',
      source: 'Port authority',
      weight: 0.97,
    }),
  ]);
  assert.equal(documented.association, AssociationClass.VERIFIED);
});

test('classifyAssociation grades the remaining bands', () => {
  const moderate = classifyAssociation([
    createEvidence({ kind: 'trade-statistic', detail: 'd', source: 's', weight: 0.65 }),
  ]);
  assert.equal(moderate.association, AssociationClass.INFERRED);

  const weak = classifyAssociation([
    createEvidence({ kind: 'trade-statistic', detail: 'd', source: 's', weight: 0.45 }),
  ]);
  assert.equal(weak.association, AssociationClass.ESTIMATED);

  const none = classifyAssociation([
    createEvidence({ kind: 'trade-statistic', detail: 'd', source: 's', weight: 0.1 }),
  ]);
  assert.equal(none.association, AssociationClass.UNKNOWN);
  assert.equal(none.displayable, false);
});

test('classifyAssociation with no evidence is UNKNOWN', () => {
  const result = classifyAssociation([]);
  assert.equal(result.association, AssociationClass.UNKNOWN);
  assert.equal(result.confidence, 0);
});

test('freshness reports stale after three missed update periods', () => {
  const now = 1_000_000;
  assert.equal(freshness(now, 60_000, now).state, 'nominal');
  assert.equal(freshness(now - 100_000, 60_000, now).state, 'nominal');
  assert.equal(freshness(now - 180_001, 60_000, now).state, 'stale');
  assert.equal(freshness(null, 60_000, now).state, 'unavailable');
  assert.equal(freshness(null, 60_000, now).ageMs, null);
  assert.equal(freshness(now - 5000, 60_000, now).ageMs, 5000);
});

test('freshness rejects invalid inputs', () => {
  assert.throws(() => freshness('x', 1000), TypeError);
  assert.throws(() => freshness(1000, 0), TypeError);
  assert.throws(() => freshness(1000, -5), TypeError);
});

test('dataGap states the reason and what would resolve it', () => {
  const gap = dataGap(
    'AIS does not broadcast cargo',
    'Bill-of-lading or customs manifest data',
  );
  assert.equal(gap.dataGap, true);
  assert.equal(gap.label, 'DATA UNAVAILABLE');
  assert.equal(gap.dataClass, DataClass.UNKNOWN);
  assert.ok(Object.isFrozen(gap));
  assert.throws(() => dataGap('', 'x'), TypeError);
  assert.throws(() => dataGap('x', ''), TypeError);
});
