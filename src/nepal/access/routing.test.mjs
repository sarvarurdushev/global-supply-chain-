import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCsr, buildNodeIndex, multiSourceDijkstra, pathToSource, snapToNode } from './routing.js';

/*
 *   0 --100-- 1 --100-- 2 --100-- 3
 *             |                   |
 *            500                 50
 *             |                   |
 *             4 -------300------- 5
 */
const EDGES = [
  [0, 1, 100],
  [1, 2, 100],
  [2, 3, 100],
  [1, 4, 500],
  [3, 5, 50],
  [4, 5, 300],
];

test('one search answers every node with its nearest source', () => {
  const csr = buildCsr(6, EDGES);
  const r = multiSourceDijkstra(csr, [{ node: 0 }, { node: 5 }]);
  /* Node 2 is 200 from source 0 but 150 from source 1, round by 3. */
  assert.deepEqual([...r.dist], [0, 100, 150, 50, 300, 0]);
  assert.deepEqual([...r.source], [0, 0, 1, 1, 1, 1]);
});

test('a facility off the road starts with its straight-line leg', () => {
  const csr = buildCsr(6, EDGES);
  const r = multiSourceDijkstra(csr, [{ node: 0, offsetMetres: 400 }, { node: 5 }]);
  assert.equal(r.source[1], 1);
  assert.equal(r.dist[1], 250);
});

test('a disabled edge reroutes, and a cut network leaves nodes unreachable', () => {
  const csr = buildCsr(6, EDGES);
  const disabled = new Uint8Array(EDGES.length);
  disabled[1] = 1; /* 1-2 */
  const detour = multiSourceDijkstra(csr, [{ node: 0 }], { disabled });
  assert.equal(detour.dist[2], 100 + 500 + 300 + 50 + 100);
  assert.deepEqual(pathToSource(detour, EDGES, 2), [2, 4, 5, 3, 0]);
  disabled[3] = 1; /* 1-4 as well */
  const cut = multiSourceDijkstra(csr, [{ node: 0 }], { disabled });
  assert.equal(cut.dist[2], Infinity);
  assert.equal(cut.source[2], -1);
});

test('snapping finds the nearest junction and refuses one too far away', () => {
  const nodes = [
    [85.3, 27.7],
    [85.31, 27.7],
    [85.5, 27.9],
  ];
  const index = buildNodeIndex(nodes, 0.02);
  const hit = snapToNode(index, 85.309, 27.7005, 5000);
  assert.equal(hit.node, 1);
  assert.ok(hit.metres < 150);
  assert.equal(snapToNode(index, 86.5, 28.5, 5000), null);
  /* Across a cell boundary, the nearer node in the neighbouring cell still wins. */
  assert.equal(snapToNode(index, 85.4999, 27.8999, 5000).node, 2);
});
