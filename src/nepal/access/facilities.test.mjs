import test from 'node:test';
import assert from 'node:assert/strict';
import { FacilityTier, normaliseFacilityType } from './facilities.js';

test('published types map to service tiers', () => {
  assert.equal(normaliseFacilityType('Zonal Hospital').tier, FacilityTier.HOSPITAL);
  assert.equal(normaliseFacilityType('Primary Health Center').tier, FacilityTier.PRIMARY);
  assert.equal(normaliseFacilityType('Sub Health Post').tier, FacilityTier.HEALTH_POST);
  assert.equal(normaliseFacilityType('DPHO').tier, FacilityTier.NON_CLINICAL);
});

test('known misspellings are repaired and say so', () => {
  const result = normaliseFacilityType('Distict Cold Room');
  assert.equal(result.type, 'District Cold Room');
  assert.equal(result.repairedFrom, 'Distict Cold Room');
});

test('a place name in the type field and a literal "null" are refused, not guessed', () => {
  assert.deepEqual(normaliseFacilityType('Laxmipur'), { ok: false, issue: 'unknown' });
  assert.deepEqual(normaliseFacilityType('null'), { ok: false, issue: 'missing' });
  assert.deepEqual(normaliseFacilityType(''), { ok: false, issue: 'missing' });
});
