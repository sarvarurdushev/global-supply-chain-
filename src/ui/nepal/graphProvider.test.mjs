import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createGraphProvider } from './graphProvider.js';
import { buildRoadGraph } from '../../disaster/response.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

let cachedSegments = null;
async function segments() {
  if (!cachedSegments) {
    const text = await readFile(
      `${ROOT}data/processed/nepal-2015-osm-roads.json`,
      'utf8',
    );
    cachedSegments = JSON.parse(text).data.segments;
  }
  return cachedSegments;
}

/**
 * A worker-shaped stub that does the real build in-process.
 *
 * It answers over the same message protocol, so the worker path is exercised
 * end to end — including the `{nodes, edges}` round trip, which is the part
 * that would break if the graph object were posted by mistake.
 */
function fakeWorker({ fail = false } = {}) {
  const listeners = new Map();
  let terminated = false;
  const worker = {
    get terminated() {
      return terminated;
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    postMessage({ id, segments: input }) {
      setTimeout(() => {
        if (fail) {
          for (const handler of listeners.get('error') ?? [])
            handler({ message: 'worker refused to start' });
          return;
        }
        const graph = buildRoadGraph({ segments: input });
        const payload = {
          id,
          ok: true,
          nodes: [...graph.nodes()],
          edges: [...graph.edges()],
        };
        /* Prove it survives a structured-clone round trip. */
        const cloned = structuredClone(payload);
        for (const handler of listeners.get('message') ?? [])
          handler({ data: cloned });
      }, 0);
    },
    terminate() {
      terminated = true;
    },
  };
  return worker;
}

test('the graph is built in the worker and rebuilt on the main thread', async () => {
  const notes = [];
  let workers = 0;
  let last = null;
  const provider = createGraphProvider({
    createWorker: () => {
      workers += 1;
      last = fakeWorker();
      return last;
    },
    onNote: (note) => notes.push(note),
  });
  const graph = await provider.graph(await segments());

  assert.equal(workers, 1);
  assert.equal(provider.how, 'worker');
  assert.deepEqual(notes, ['worker']);
  assert.equal(last.terminated, true, 'the worker is released');
  /* The real network, and it matches what the artefact reports. */
  assert.equal([...graph.nodes()].length, 2268);
  assert.equal([...graph.edges()].length, 5454);
  /* And it is a real graph, not the plain arrays it travelled as. */
  assert.equal(typeof graph.outEdges, 'function');
  assert.ok(graph.outEdges([...graph.nodes()][0].id).length >= 1);
});

test('it is built at most once however many scenes ask', async () => {
  let workers = 0;
  const provider = createGraphProvider({
    createWorker: () => {
      workers += 1;
      return fakeWorker();
    },
  });
  const input = await segments();
  /* Concurrent callers share one build; a later caller gets the cache. */
  const [a, b] = await Promise.all([
    provider.graph(input),
    provider.graph(input),
  ]);
  const c = await provider.graph(input);
  assert.equal(workers, 1);
  assert.equal(a, b);
  assert.equal(a, c);

  provider.reset();
  await provider.graph(input);
  assert.equal(workers, 2, 'reset means rebuild');
});

test('a worker that will not start costs speed, never the scene', async () => {
  /*
   * The fallback runs the SAME `buildRoadGraph`, not a cheaper
   * approximation: a degraded path that quietly produced a different network
   * would be worse than a third of a second of jank.
   */
  const notes = [];
  const provider = createGraphProvider({
    createWorker: () => fakeWorker({ fail: true }),
    onNote: (note) => notes.push(note),
  });
  const graph = await provider.graph(await segments());
  assert.equal(provider.how, 'inline');
  assert.equal([...graph.nodes()].length, 2268);
  assert.equal([...graph.edges()].length, 5454);
  assert.match(notes[0], /worker unavailable \(worker refused to start\)/);
});

test('with no worker factory at all it builds inline and says so', async () => {
  const notes = [];
  const provider = createGraphProvider({ onNote: (note) => notes.push(note) });
  assert.equal(provider.how, null, 'nothing is built until asked');
  const graph = await provider.graph(await segments());
  assert.equal(provider.how, 'inline');
  assert.deepEqual(notes, ['inline']);
  assert.equal([...graph.edges()].length, 5454);
});
