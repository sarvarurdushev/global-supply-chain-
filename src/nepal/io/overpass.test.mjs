import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STRATEGIC_HIGHWAY_CLASSES,
  overpassBaseTimestamp,
  parseOverpassCount,
  parseOverpassWays,
} from './overpass.js';

const way = (id, geometry, tags = { highway: 'primary' }) => ({
  type: 'way',
  id,
  tags,
  geometry,
});

test('ways are normalised to positions and a kept tag subset', () => {
  const result = parseOverpassWays({
    elements: [
      way(1, [{ lon: 85.1234567, lat: 27.7654321 }, { lon: 85.2, lat: 27.8 }], {
        highway: 'trunk',
        name: 'Prithvi Highway',
        ref: 'H04',
        // Tags outside the kept set must not survive into the artefact.
        source: 'Bing',
        'addr:city': 'Kathmandu',
      }),
    ],
  });
  assert.equal(result.kept, 1);
  const segment = result.segments[0];
  assert.deepEqual(segment.coordinates[0], [85.123457, 27.765432]);
  assert.deepEqual(Object.keys(segment.tags).sort(), ['highway', 'name', 'ref']);
});

test('a way repeated across tiles is counted once', () => {
  const seen = new Set();
  const payload = { elements: [way(7, [{ lon: 85, lat: 27 }, { lon: 85.1, lat: 27 }])] };
  const first = parseOverpassWays(payload, { seen });
  const second = parseOverpassWays(payload, { seen });
  assert.equal(first.kept, 1);
  assert.equal(second.kept, 0);
  assert.equal(second.dropped, 1);
});

test('a way with an unresolved position is refused rather than shortened', () => {
  const issues = [];
  const result = parseOverpassWays(
    {
      elements: [
        way(1, [{ lon: 85, lat: 27 }, { lon: null, lat: null }, { lon: 85.2, lat: 27 }]),
      ],
    },
    { onIssue: (issue) => issues.push(issue) },
  );
  assert.equal(result.kept, 0);
  assert.equal(result.dropped, 1);
  assert.match(issues[0].reason, /unresolved positions/);
});

test('ways too short to be a line, and ways without a highway tag, are dropped', () => {
  const result = parseOverpassWays({
    elements: [
      way(1, [{ lon: 85, lat: 27 }]),
      way(2, [{ lon: 85, lat: 27 }, { lon: 85.1, lat: 27 }], { building: 'yes' }),
      { type: 'node', id: 3, lat: 27, lon: 85 },
    ],
  });
  assert.equal(result.read, 2, 'nodes are not ways and must not be read');
  assert.equal(result.kept, 0);
  assert.equal(result.dropped, 2);
});

test('the count and base-timestamp forms are read', () => {
  const payload = {
    osm3s: { timestamp_osm_base: '2015-04-24T00:00:00Z' },
    elements: [{ type: 'count', id: 0, tags: { ways: '71', nodes: '0', relations: '0', total: '71' } }],
  };
  assert.equal(parseOverpassCount(payload).ways, 71);
  assert.equal(overpassBaseTimestamp(payload), '2015-04-24T00:00:00Z');
  assert.equal(parseOverpassCount({ elements: [] }), null);
  assert.equal(overpassBaseTimestamp({}), null);
});

test('the strategic class list contains the through-roads and their links only', () => {
  assert.ok(STRATEGIC_HIGHWAY_CLASSES.includes('trunk'));
  assert.ok(STRATEGIC_HIGHWAY_CLASSES.includes('tertiary_link'));
  // Residential streets and tracks are excluded by design; the limitation is
  // stated in the ingest rather than quietly absorbed.
  assert.equal(STRATEGIC_HIGHWAY_CLASSES.includes('residential'), false);
  assert.equal(STRATEGIC_HIGHWAY_CLASSES.includes('track'), false);
});
