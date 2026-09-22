import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArtefactLoader, ANALYSIS_BASE, PROCESSED_BASE } from './loader.js';
import { ANALYSIS_ARTEFACTS } from './artefacts.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** A fetch that reads the real committed artefacts off disk. */
function diskFetch({ fail = new Set(), count = null } = {}) {
  return async (url) => {
    if (count) count.push(url);
    const name = url.split('/').pop();
    if (fail.has(name)) return { ok: false, status: 503, json: async () => ({}) };
    const dir = url.startsWith(ANALYSIS_BASE) ? 'analysis' : 'processed';
    const text = await readFile(path.join(ROOT, 'data', dir, name), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
  };
}

test('a loader needs a fetch implementation', () => {
  assert.throws(() => createArtefactLoader({ fetchImpl: null }), /needs a fetch/);
});

test('Tier 1 loads all five analyses and returns wired intelligence', async () => {
  const urls = [];
  const loader = createArtefactLoader({ fetchImpl: diskFetch({ count: urls }) });
  const intel = await loader.loadTier1();
  assert.equal(urls.length, 5);
  assert.ok(urls.every((url) => url.startsWith(ANALYSIS_BASE)));
  assert.equal(intel.seismic.mainShock.magnitude, 7.8);
  assert.equal(intel.damage.reproduction.total, 4583);
  for (const key of Object.keys(ANALYSIS_ARTEFACTS)) {
    assert.equal(loader.stateOf(key), 'ready');
  }
});

test('progress reports load state, and a failure is reported rather than thrown away', async () => {
  const loader = createArtefactLoader({
    fetchImpl: diskFetch({ fail: new Set(['nepal-2015-osm-roads.json']) }),
  });
  assert.equal(loader.stateOf('shakemap'), 'idle');
  await loader.loadProcessed('shakemap');
  assert.equal(loader.stateOf('shakemap'), 'ready');
  await assert.rejects(loader.loadProcessed('osmRoads'), /HTTP 503/);
  assert.equal(loader.stateOf('osmRoads'), 'failed');
  assert.match(loader.errorOf('osmRoads'), /503/);
  const progress = loader.progress();
  assert.equal(progress.loaded, 1);
  assert.equal(progress.failed, 1);
  /*
   * Two datasets were asked for, and both have settled. `total` counts the
   * asking, not the catalogue: a header that divided by ten would sit at
   * "LOADING 1/10" over a case with nothing left in flight.
   */
  assert.equal(progress.total, 2);
  assert.equal(progress.pending, 0);
  assert.equal(progress.catalogue, 10);
});

test('progress counts what is still in the air, not what has never been asked for', async () => {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const loader = createArtefactLoader({
    fetchImpl: async () => {
      await held;
      return { ok: true, status: 200, json: async () => ({ features: [] }) };
    },
  });
  assert.deepEqual(
    { ...loader.progress() },
    { loaded: 0, failed: 0, pending: 0, total: 0, catalogue: 10 },
    'nothing requested is not the same as nothing loaded',
  );

  const inFlight = loader.loadProcessed('shakemap');
  assert.equal(loader.progress().pending, 1);
  assert.equal(loader.progress().total, 1);
  release();
  await inFlight;
  assert.equal(loader.progress().pending, 0);
  assert.equal(loader.progress().loaded, 1);
});

test('a dataset is fetched once however many scenes ask for it', async () => {
  /*
   * Two scenes prefetching the same 5 MB network is not a rounding error, so
   * concurrent requests must share one in-flight promise.
   */
  const urls = [];
  const loader = createArtefactLoader({ fetchImpl: diskFetch({ count: urls }) });
  const [a, b] = await Promise.all([
    loader.loadProcessed('shakemap'),
    loader.loadProcessed('shakemap'),
  ]);
  assert.equal(urls.length, 1);
  assert.equal(a, b, 'both callers must receive the same parsed object');
  await loader.loadProcessed('shakemap');
  assert.equal(urls.length, 1, 'a cached dataset must not refetch');
});

test('an unknown dataset key is refused with the known list', () => {
  const loader = createArtefactLoader({ fetchImpl: diskFetch() });
  assert.throws(() => loader.loadProcessed('nope'), /Unknown processed artefact/);
  assert.throws(() => loader.loadProcessed('nope'), /shakemap/);
});

test('prefetch never rejects, so a warm-up failure cannot surface as an error', async () => {
  const loader = createArtefactLoader({
    fetchImpl: diskFetch({ fail: new Set(['nepal-2015-osm-roads.json']) }),
  });
  // Unhandled rejection here would fail the test run.
  loader.prefetch(['osmRoads', 'shakemap', 'not-a-dataset']);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(loader.stateOf('osmRoads'), 'failed');
  assert.equal(loader.stateOf('shakemap'), 'ready');
});

test('ready() gives a scene what it can draw right now, without awaiting', async () => {
  const loader = createArtefactLoader({ fetchImpl: diskFetch() });
  assert.equal(loader.ready('shakemap'), null);
  await loader.loadProcessed('shakemap');
  assert.ok(loader.ready('shakemap').data.features.length > 0);
});

test('progress events are emitted for every state change', async () => {
  const events = [];
  const loader = createArtefactLoader({
    fetchImpl: diskFetch(),
    onProgress: (event) => events.push(`${event.id}:${event.state}`),
  });
  await loader.loadProcessed('nga');
  assert.deepEqual(events, ['nga:loading', 'nga:ready']);
});

test('processed artefacts are requested from the processed base path', async () => {
  const urls = [];
  const loader = createArtefactLoader({ fetchImpl: diskFetch({ count: urls }) });
  await loader.loadProcessed('unosat');
  assert.ok(urls[0].startsWith(PROCESSED_BASE), urls[0]);
});
