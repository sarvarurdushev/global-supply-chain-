import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DataClass,
  Redistribution,
  commitPolicy,
  createDatasetRecord,
  createLineage,
} from './registry.js';

const GOOD = {
  id: 'usgs-gorkha',
  datasetName: 'USGS FDSN event query',
  publisher: 'U.S. Geological Survey',
  sourceUrl: 'https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=us20002926',
  license: 'US public domain',
  redistribution: Redistribution.OPEN,
  retrievedAt: '2026-09-21',
  originalFormat: 'GeoJSON',
  temporalCoverage: '2015-04-25',
  geographicCoverage: 'Nepal',
  coordinateSystem: 'EPSG:4326',
  description: 'The M7.8 Gorkha main shock as USGS publishes it.',
  dataClass: DataClass.OBSERVED,
};

test('a record missing provenance is refused, and names what is missing', () => {
  for (const key of ['sourceUrl', 'license', 'retrievedAt', 'publisher', 'dataClass']) {
    const partial = { ...GOOD };
    delete partial[key];
    assert.throws(() => createDatasetRecord(partial), new RegExp(key));
  }
});

test('"Other" is rejected as a licence', () => {
  // HDX returns license_title "Other" and puts the real terms in
  // license_other. Accepting the placeholder is how CC BY-NC-SA data gets
  // redistributed by a project that believes it is unencumbered.
  assert.throws(
    () => createDatasetRecord({ ...GOOD, license: 'Other' }),
    /placeholder, not a licence/,
  );
  assert.throws(() => createDatasetRecord({ ...GOOD, license: 'unknown' }), /placeholder/);
});

test('a vintage year is not a retrieval date', () => {
  assert.throws(() => createDatasetRecord({ ...GOOD, retrievedAt: '2015' }), /ISO date/);
  assert.doesNotThrow(() => createDatasetRecord({ ...GOOD, retrievedAt: '2026-09-21T10:00:00Z' }));
});

test('an encumbered dataset must carry an attribution line', () => {
  assert.throws(
    () => createDatasetRecord({ ...GOOD, redistribution: Redistribution.NON_COMMERCIAL }),
    /attribution/,
  );
  assert.doesNotThrow(() =>
    createDatasetRecord({
      ...GOOD,
      redistribution: Redistribution.NON_COMMERCIAL,
      attribution: 'UNITAR/UNOSAT',
    }),
  );
});

test('unknown vocabulary is refused rather than coerced', () => {
  assert.throws(() => createDatasetRecord({ ...GOOD, dataClass: 'PROBABLY' }), /dataClass/);
  assert.throws(() => createDatasetRecord({ ...GOOD, redistribution: 'MAYBE' }), /redistribution/);
});

test('commit policy blocks only what cannot be redistributed, and carries the obligation', () => {
  const open = commitPolicy(createDatasetRecord(GOOD));
  assert.equal(open.mayCommit, true);

  const nc = commitPolicy(
    createDatasetRecord({
      ...GOOD,
      redistribution: Redistribution.NON_COMMERCIAL,
      license: 'CC BY-NC-SA 3.0',
      attribution: 'UNITAR/UNOSAT',
    }),
  );
  assert.equal(nc.mayCommit, true);
  assert.match(nc.notice, /CC BY-NC-SA 3\.0/);
  assert.match(nc.notice, /UNITAR\/UNOSAT/);
  assert.match(nc.notice, /applies to this derived file/);

  const closed = commitPolicy(
    createDatasetRecord({
      ...GOOD,
      redistribution: Redistribution.NONE,
      license: 'All rights reserved',
      attribution: 'Somebody',
    }),
  );
  assert.equal(closed.mayCommit, false);
  assert.match(closed.reason, /commit the script, not the data/);
});

test('a lineage needs real steps', () => {
  assert.throws(() => createLineage('x', []), /at least one step/);
  assert.throws(() => createLineage('x', [{ step: 'fetch' }]), /detail/);
  const lineage = createLineage('usgs-gorkha', [
    { step: 'fetch', detail: 'FDSN query' },
    { step: 'validate', detail: 'coordinates inside Nepal' },
  ]);
  assert.equal(lineage.steps.length, 2);
});
