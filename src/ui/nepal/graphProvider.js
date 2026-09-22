/**
 * The road graph, built once, off the main thread when one is available.
 *
 * INJECTED, NOT IMPORTED. `createWorker` arrives as a dependency so the test
 * suite can drive the same code path with the graph built in-process. A
 * provider that reached for `new Worker(...)` directly would be untestable in
 * Node and would also have no answer for a browser where workers are blocked.
 *
 * THE FALLBACK IS THE SAME ENGINE. When no worker can be created the build
 * runs inline. It is the identical `buildRoadGraph` call — slower to the eye,
 * identical in result — rather than a cheaper approximation, because a
 * degraded path that quietly produces a different network would be worse than
 * a third of a second of jank.
 */

import { createGraph } from '../../supplychain/graph.js';
import { buildRoadGraph } from '../../disaster/response.js';

/**
 * @param {object} [options]
 * @param {() => Worker} [options.createWorker]
 * @param {(reason:string)=>void} [options.onNote] told how the graph was built
 */
export function createGraphProvider({
  createWorker = null,
  onNote = null,
} = {}) {
  let pending = null;
  let built = null;
  let how = null;

  async function inWorker(segments) {
    const worker = createWorker();
    try {
      const { nodes, edges } = await new Promise((resolve, reject) => {
        const id = `graph:${Date.now()}`;
        worker.addEventListener('message', (event) => {
          if (event.data?.id !== id) return;
          if (event.data.ok) resolve(event.data);
          else reject(new Error(event.data.error));
        });
        worker.addEventListener('error', (event) =>
          reject(new Error(event.message ?? 'worker failed')),
        );
        worker.postMessage({ id, segments });
      });
      /* Cheap (about 5 ms): the expensive junction pass already happened. */
      return createGraph({ nodes, edges });
    } finally {
      worker.terminate?.();
    }
  }

  return Object.freeze({
    /** How the last build ran: 'worker', 'inline', or null before any build. */
    get how() {
      return how;
    },

    /** The graph, built at most once however many scenes ask for it. */
    graph(segments) {
      if (built) return Promise.resolve(built);
      if (pending) return pending;
      pending = (async () => {
        if (createWorker) {
          try {
            built = await inWorker(segments);
            how = 'worker';
            onNote?.('worker');
            return built;
          } catch (error) {
            /*
             * A worker that cannot start is not a reason to have no network
             * scene. Fall through to the inline build and say which happened.
             */
            onNote?.(`worker unavailable (${error.message}); built inline`);
          }
        }
        built = buildRoadGraph({ segments });
        how = 'inline';
        onNote?.(
          how === 'inline' && createWorker ? 'inline-fallback' : 'inline',
        );
        return built;
      })();
      return pending;
    },

    /** Drop the graph, for teardown. */
    reset() {
      pending = null;
      built = null;
      how = null;
    },
  });
}
