/**
 * Build the Nepal road graph off the main thread.
 *
 * WHY A WORKER FOR 259 MILLISECONDS. That is what `buildRoadGraph` measures on
 * the real 2,129-way artefact on this machine — one blocking pass that splits
 * every way at its junctions. It is not catastrophic, but it lands exactly
 * when the user reaches Scene 13, and a third of a second of frozen UI at the
 * moment somebody clicks is the difference between an application and a demo.
 * On a slower machine it is worse, and the cost of moving it is one file.
 *
 * THE SPLIT IS WHERE THE WORK IS. The expensive part is the junction pass; the
 * graph OBJECT is cheap to assemble (5 ms) and cannot cross a worker boundary
 * because it carries methods. So the worker posts plain `{nodes, edges}`
 * arrays, which structured-clone fine, and the main thread calls `createGraph`
 * on them.
 *
 * IT IMPORTS THE SAME ENGINE. `buildRoadGraph` is Stage 5's, unchanged. There
 * is no second implementation of the graph here, which is the whole point of
 * moving the call rather than rewriting it.
 */

import { buildRoadGraph } from '../disaster/response.js';

self.addEventListener('message', (event) => {
  const { id, segments, snapMetres } = event.data ?? {};
  try {
    const graph = buildRoadGraph({
      segments,
      ...(snapMetres ? { snapMetres } : {}),
    });
    /*
     * Spread into plain objects: the graph's own node and edge records are
     * already plain, but taking them through the iterators rather than
     * reaching into internals keeps this honest about the public surface.
     */
    self.postMessage({
      id,
      ok: true,
      nodes: [...graph.nodes()],
      edges: [...graph.edges()],
    });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error?.message ?? error) });
  }
});
