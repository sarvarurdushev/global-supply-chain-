import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RISK_INDICATORS,
  WATER_STRESS_BANDS,
  waterStress,
  waterAvailability,
  environmentalRisk,
} from './environment.js';
import { DataClass } from './provenance.js';

const AT = '2026-09-16T00:00:00Z';

/* Values measured live from the World Bank API on 2026-09-16. */
const EGYPT_VALUES = Object.freeze({
  'ER.H2O.FWTL.ZS': 7750.0,
  'ER.H2O.INTR.PC': 8.9,
  'AG.LND.AGRI.ZS': 4.1,
  'EN.CLC.MDAT.ZS': 0.0,
});
const CHINA_VALUES = Object.freeze({
  'ER.H2O.FWTL.ZS': 20.2,
  'ER.H2O.INTR.PC': 1991.9,
  'AG.LND.AGRI.ZS': 55.4,
  'EN.CLC.MDAT.ZS': 8.0,
});
const BRAZIL_VALUES = Object.freeze({
  'ER.H2O.FWTL.ZS': 1.2,
  'ER.H2O.INTR.PC': 26917.9,
  'AG.LND.IRIG.AG.ZS': 3.9,
});

/* ---------------- the §22 requirement ---------------- */

test('every indicator says how it reaches the supply chain', () => {
  // A risk layer that does not answer "how does this affect the supply chain?"
  // is decoration. This is that requirement as a test.
  for (const indicator of RISK_INDICATORS) {
    assert.ok(indicator.label?.length > 4, `${indicator.code} has no label`);
    assert.ok(indicator.unit?.length > 1, `${indicator.code} has no unit`);
    assert.ok(
      indicator.affectsSupplyChain?.length > 60,
      `${indicator.code} does not say how it reaches trade`,
    );
    assert.ok(indicator.reads?.length > 15, `${indicator.code} has no plain reading`);
  }
});

test('the indicators cover water, irrigation and disaster history', () => {
  const codes = RISK_INDICATORS.map((i) => i.code);
  assert.ok(codes.includes('ER.H2O.FWTL.ZS'), 'water withdrawal');
  assert.ok(codes.includes('AG.LND.IRIG.AG.ZS'), 'irrigation');
  assert.ok(codes.includes('EN.CLC.MDAT.ZS'), 'disaster exposure');
});

/* ---------------- water stress bands ---------------- */

test('the bands are the published FAO thresholds, in order', () => {
  const maxima = WATER_STRESS_BANDS.map((b) => b.max);
  assert.deepEqual(maxima, [10, 20, 40, 80, 100, Infinity]);
  assert.deepEqual(
    maxima,
    [...maxima].sort((a, b) => a - b),
    'bands must be ascending or the lookup picks the wrong one',
  );
});

test('water stress classifies across the whole range', () => {
  assert.equal(waterStress(1.2).level, 'LOW');
  assert.equal(waterStress(15).level, 'LOW_MEDIUM');
  assert.equal(waterStress(30).level, 'MEDIUM_HIGH');
  assert.equal(waterStress(60).level, 'HIGH');
  assert.equal(waterStress(90).level, 'VERY_HIGH');
  assert.equal(waterStress(7750).level, 'BEYOND_RENEWABLE');
});

test('a figure above 100% is explained, not treated as an error', () => {
  // Egypt withdraws 7,750% of its INTERNAL renewable water because it lives on
  // a river that rises outside its borders. Clamping or rejecting that would
  // discard the most important fact about its water.
  const stress = waterStress(EGYPT_VALUES['ER.H2O.FWTL.ZS']);
  assert.equal(stress.level, 'BEYOND_RENEWABLE');
  assert.match(stress.basis, /rising outside its borders/);
  assert.match(stress.basis, /7,750%/);
});

test('water stress returns null rather than guessing', () => {
  assert.equal(waterStress(null), null);
  assert.equal(waterStress(undefined), null);
  assert.equal(waterStress(Number.NaN), null);
});

/* ---------------- per-capita availability ---------------- */

test('availability uses the Falkenmark thresholds', () => {
  assert.equal(waterAvailability(8.9).level, 'ABSOLUTE_SCARCITY');
  assert.equal(waterAvailability(700).level, 'SCARCITY');
  assert.equal(waterAvailability(1500).level, 'STRESS');
  assert.equal(waterAvailability(26917).level, 'SUFFICIENT');
  assert.equal(waterAvailability(null), null);
});

test('a sufficient result still warns that it is a national average', () => {
  // The measure ignores where in a country the water is, which is usually the
  // question that matters.
  assert.match(
    waterAvailability(26917).basis,
    /national average and says nothing about where/i,
  );
});

/* ---------------- the joined reading ---------------- */

test('a country with several joined indicators gets a stated mechanism', () => {
  const risk = environmentalRisk({
    country: { iso3: 'IND', name: 'India' },
    values: {
      'ER.H2O.FWTL.ZS': 66,
      'AG.LND.IRIG.AG.ZS': 44.4,
      'ER.H2O.INTR.PC': 1100,
    },
    agriculturalExports: [{ label: 'Rice' }, { label: 'Wheat' }],
    retrievedAt: AT,
  });
  assert.ok(Array.isArray(risk.mechanism));
  const text = risk.mechanism.join(' ');
  assert.match(text, /draws heavily on its water/);
  assert.match(text, /44% of its farmland is irrigated/);
  assert.match(text, /exports Rice, Wheat/);
  assert.equal(risk.unlinkedReason, null);
});

test('a country with too little to join says so instead of implying a link', () => {
  // One indicator with nothing to connect it to is not a supply-chain finding,
  // and dressing it as one is the failure mode this guards.
  const risk = environmentalRisk({
    country: { iso3: 'BRA', name: 'Brazil' },
    values: BRAZIL_VALUES,
    retrievedAt: AT,
  });
  assert.equal(risk.mechanism, null);
  assert.match(risk.unlinkedReason, /Not enough joined-up data/);
});

test('the mechanism only cites indicators that are present', () => {
  // A sentence with a hole in it is worse than a shorter sentence.
  const risk = environmentalRisk({
    country: { iso3: 'EGY', name: 'Egypt' },
    values: EGYPT_VALUES, // no irrigation figure in this set
    agriculturalExports: [{ label: 'Citrus' }],
    retrievedAt: AT,
  });
  const text = (risk.mechanism ?? []).join(' ');
  assert.ok(!/undefined|NaN|null/.test(text), `mechanism reads: ${text}`);
  assert.ok(!/% of its farmland is irrigated/.test(text));
});

test('an indicator with no value is marked unavailable, not zero', () => {
  const risk = environmentalRisk({
    country: { iso3: 'EGY', name: 'Egypt' },
    values: EGYPT_VALUES,
    retrievedAt: AT,
  });
  const irrigation = risk.readings.find((r) => r.code === 'AG.LND.IRIG.AG.ZS');
  assert.equal(irrigation.available, false);
  assert.equal(irrigation.value, null, 'absent must not become 0');
});

test('a zero that is real stays zero', () => {
  // Egypt's disaster figure is genuinely 0.0 for that period. Treating a real
  // zero as missing would be the mirror of the previous bug.
  const risk = environmentalRisk({
    country: { iso3: 'EGY', name: 'Egypt' },
    values: EGYPT_VALUES,
    retrievedAt: AT,
  });
  const disasters = risk.readings.find((r) => r.code === 'EN.CLC.MDAT.ZS');
  assert.equal(disasters.available, true);
  assert.equal(disasters.value, 0);
});

test('China is classed medium-high nationally, and the caveat says why that misleads', () => {
  // 20.2% falls in the 20-40 band. The national figure is the whole problem:
  // it averages the water-rich south with the water-scarce north, and the
  // north is where the wheat is.
  const risk = environmentalRisk({
    country: { iso3: 'CHN', name: 'China' },
    values: CHINA_VALUES,
    retrievedAt: AT,
  });
  assert.equal(risk.waterStress.level, 'MEDIUM_HIGH');
  assert.match(
    risk.provenance.limitations.join(' '),
    /averages the water-rich south with the water-scarce north/,
  );
});

/* ---------------- provenance ---------------- */

test('the result is HISTORICAL and makes no causal claim', () => {
  const risk = environmentalRisk({
    country: { iso3: 'CHN', name: 'China' },
    values: CHINA_VALUES,
    retrievedAt: AT,
  });
  assert.equal(risk.provenance.dataClass, DataClass.HISTORICAL);
  const limitations = risk.provenance.limitations.join(' ');
  assert.match(limitations, /No causal claim is made/);
  assert.match(limitations, /NATIONAL AVERAGES/);
  assert.match(limitations, /Aqueduct/, 'the better source is named');
});

test('environmentalRisk refuses a country it cannot identify', () => {
  assert.throws(
    () => environmentalRisk({ values: {}, retrievedAt: AT }),
    /requires a country/,
  );
});
