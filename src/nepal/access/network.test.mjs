import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildJunctionGraph,
  classifyFacility,
  haversineMetres,
  simplifyLine,
} from './network.js';

test('two ways crossing at a shared node become four edges at one junction', () => {
  const graph = buildJunctionGraph([
    { osmId: 1, tags: { highway: 'primary' }, coordinates: [[85, 27], [85.01, 27], [85.02, 27]] },
    { osmId: 2, tags: { highway: 'track', bridge: 'yes' }, coordinates: [[85.01, 26.99], [85.01, 27], [85.01, 27.01]] },
  ]);
  assert.equal(graph.nodes.length, 5, 'four ends and one crossing');
  assert.equal(graph.edges.length, 4);
  const crossing = graph.nodes.findIndex(([lon, lat]) => lon === 85.01 && lat === 27);
  assert.equal(graph.edges.filter((e) => e.from === crossing || e.to === crossing).length, 4);
  assert.ok(graph.edges.filter((e) => e.osmId === 2).every((e) => e.bridge));
  assert.ok(graph.edges.filter((e) => e.osmId === 1).every((e) => !e.bridge));
});

test('an interior vertex used by one way is shape, not a junction', () => {
  const graph = buildJunctionGraph([
    { osmId: 7, tags: { highway: 'unclassified' }, coordinates: [[85, 27], [85.005, 27.002], [85.01, 27]] },
  ]);
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.edges.length, 1);
  const straight = haversineMetres([85, 27], [85.01, 27]);
  assert.ok(graph.edges[0].m > straight, 'length follows the bend, not the chord');
});

test('simplification keeps the ends and a real bend, and drops a wobble', () => {
  const line = [[85, 27], [85.001, 27.00001], [85.002, 27], [85.002, 27.01]];
  const kept = simplifyLine(line, 12);
  assert.deepEqual(kept[0], line[0]);
  assert.deepEqual(kept.at(-1), line.at(-1));
  assert.ok(kept.some((p) => p[0] === 85.002 && p[1] === 27), 'the corner stays');
  assert.ok(!kept.some((p) => p[1] === 27.00001), 'a 1 m wobble goes');
});

test('facility classification follows the tag, amenity first', () => {
  assert.equal(classifyFacility({ amenity: 'hospital' }), 'hospital');
  assert.equal(classifyFacility({ healthcare: 'hospital' }), 'hospital');
  assert.equal(classifyFacility({ amenity: 'hospital', healthcare: 'clinic' }), 'hospital');
  assert.equal(classifyFacility({ amenity: 'clinic' }), 'clinic');
  assert.equal(classifyFacility({ amenity: 'health_post' }), 'health_post');
  assert.equal(classifyFacility({ healthcare: 'pharmacy' }), 'healthcare_other');
  assert.equal(classifyFacility({ aeroway: 'aerodrome' }), 'aerodrome');
  assert.equal(classifyFacility({ aeroway: 'helipad' }), 'helipad');
  assert.equal(classifyFacility({ shop: 'bakery' }), null);
});
