import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANALYSIS_ARTEFACTS,
  PROCESSED_ARTEFACTS,
  createIntelligence,
  headerState,
} from './artefacts.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

async function loadReal() {
  const parsed = {};
  for (const [key, file] of Object.entries(ANALYSIS_ARTEFACTS)) {
    parsed[key] = JSON.parse(
      await readFile(path.join(ROOT, 'data', 'analysis', file), 'utf8'),
    );
  }
  return createIntelligence(parsed);
}

test('every named artefact file exists on disk', async () => {
  for (const [dir, table] of [
    ['analysis', ANALYSIS_ARTEFACTS],
    ['processed', PROCESSED_ARTEFACTS],
  ]) {
    for (const [key, file] of Object.entries(table)) {
      const target = path.join(ROOT, 'data', dir, file);
      await assert.doesNotReject(
        readFile(target),
        `${key} → ${file} is named by the loader but not on disk`,
      );
    }
  }
});

test('a missing Tier 1 artefact is refused loudly', () => {
  assert.throws(() => createIntelligence({}), /Missing analysis artefacts/);
  assert.throws(() => createIntelligence({ seismic: {} }), /exposure/);
});

test('a path that does not exist throws with the artefact and the path', async () => {
  /*
   * The failure this prevents: an accessor pointing at a renamed field returns
   * undefined, and a panel renders an empty card instead of an error. A missing
   * figure must be loud.
   */
  const parsed = {};
  for (const key of Object.keys(ANALYSIS_ARTEFACTS)) {
    parsed[key] = { stage: 0, methodology: [], sources: [], validation: {}, results: {} };
  }
  assert.throws(() => createIntelligence(parsed), /has no value at/);
});

test('null is a legitimate analytical answer and is not treated as missing', () => {
  // "no comparison was measured" is a result; "the field does not exist" is a bug.
  const base = {
    stage: 5,
    methodology: [],
    sources: [],
    validation: { checks: [] },
    results: {},
    coverageStatement: null,
  };
  assert.throws(
    () => createIntelligence({ seismic: base, exposure: base, damage: base, infrastructure: base, damagePopulation: base }),
    /has no value at/,
  );
});

test('the real artefacts resolve every accessor', async () => {
  const intel = await loadReal();
  assert.equal(intel.seismic.mainShock.magnitude, 7.8);
  assert.equal(intel.seismic.counts.total, 316);
  assert.equal(intel.damage.reproduction.total, 4583);
  assert.equal(intel.damage.composition.shares.Destroyed, 45.5);
  assert.equal(intel.infrastructure.geometry.blockedRoads.features, 179);
  assert.equal(intel.infrastructure.geometry.blockedRoads.totalLengthKm, 19.93);
  assert.equal(intel.exposure.headlineThreshold, 6);
  assert.ok(intel.people.proximity.bands.length >= 5);
});

test('the headline exposure figures match Stage 4 exactly', async () => {
  const intel = await loadReal();
  const at = (threshold) =>
    intel.exposure.thresholdCurve.find((row) => row.threshold === threshold);
  assert.equal(at(6).exposedPopulationExact, 13_835_518);
  assert.equal(at(7).exposedPopulationExact, 7_453_534);
  assert.equal(at(8).exposedPopulationExact, 235_116);
  // And the sanctioned sentence, not a number the UI assembles for itself.
  assert.match(intel.exposure.statementFor(6), /geographically exposed to modelled shaking/);
  assert.match(intel.exposure.statementFor(6), /13\.84 million/);
});

test('the header states only what the artefacts support', async () => {
  const intel = await loadReal();
  const header = headerState(intel, { loaded: 5, total: 5 });
  assert.equal(header.caseId, 'NPL-2015-EQ');
  // Ten registry datasets are cited across the five analyses.
  assert.equal(header.datasets, 10);
  assert.equal(header.analyses, 22);
  assert.equal(header.checksPassed, header.checksTotal);
  assert.equal(header.checksAllCountable, true);
  assert.equal(header.checksLabel, `${header.checksPassed}/${header.checksTotal}`);
  assert.equal(header.system, 'READY');
  // And it reports loading honestly rather than claiming READY early.
  assert.equal(
    headerState(intel, { loaded: 3, pending: 7, total: 10 }).system,
    'LOADING 3/10',
  );
  /*
   * READY is about what is in flight, not about how much of the catalogue has
   * ever been fetched. Scene 00 needs one dataset; it must not read LOADING
   * because the 5 MB road network for scene 13 has not been touched.
   */
  assert.equal(headerState(intel, { loaded: 1, total: 1 }).system, 'READY');
  assert.equal(headerState(intel, {}).system, 'READY');
  // A settled failure is settled. It is reported in the panel, not the header.
  assert.equal(
    headerState(intel, { loaded: 2, failed: 1, pending: 0, total: 3 }).system,
    'READY',
  );
  assert.equal(
    headerState(intel, { loaded: 2, failed: 1, pending: 2, total: 5 }).system,
    'LOADING 3/5',
  );
});

test('an uncountable artefact marks the header label rather than silently shrinking it', async () => {
  const intel = await loadReal();
  const crippled = {
    ...intel,
    raw: { ...intel.raw, seismic: { ...intel.raw.seismic, validation: {} } },
  };
  const header = headerState(crippled);
  assert.equal(header.checksAllCountable, false);
  assert.match(header.checksLabel, /\*$/);
});

test('methodology records are addressable by id for the provenance panel', async () => {
  const intel = await loadReal();
  assert.equal(intel.methodology.length, 22);
  const record = intel.methodologyFor('damage-by-intensity');
  assert.ok(record, 'the Scene 09 methodology record must resolve');
  assert.ok(record.limitations.length > 0);
  assert.ok(record.question.length > 0);
  assert.equal(intel.methodologyFor('no-such-record'), null);
  // Every record carries the artefact it came from, so a panel can cite it.
  for (const entry of intel.methodology) assert.ok(entry.artefact);
});
