import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STRATEGIC_HIGHWAY_CLASSES,
  overpassBaseTimestamp,
  parseOverpassCount,
  parseOverpassWays,
  resolveNetworkComparison,
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

test('a failed coverage measurement never erases a successful one', () => {
  const held = { ways: 7143, measuredAt: '2026-09-21', carriedForward: false };

  // A successful run records its own figure and its own date.
  const fresh = resolveNetworkComparison({
    measured: true,
    ways: 7200,
    today: '2026-09-22',
    previous: held,
  });
  assert.equal(fresh.ways, 7200);
  assert.equal(fresh.measuredAt, '2026-09-22');
  assert.equal(fresh.carriedForward, false);
  assert.equal(fresh.remeasuredThisRun, true);

  // A failed run keeps the earlier figure AND its earlier date, and says so.
  const carried = resolveNetworkComparison({
    measured: false,
    ways: 0,
    today: '2026-09-22',
    previous: held,
  });
  assert.equal(carried.ways, 7143);
  assert.equal(carried.measuredAt, '2026-09-21', 'the date must not advance');
  assert.equal(carried.carriedForward, true);
  assert.equal(carried.remeasuredThisRun, false);

  // With nothing held, a failed run reports nothing rather than inventing one.
  assert.equal(
    resolveNetworkComparison({ measured: false, ways: 0, today: '2026-09-22' }),
    null,
  );
  // A held record without a date is not evidence and is not carried forward.
  assert.equal(
    resolveNetworkComparison({
      measured: false,
      ways: 0,
      today: '2026-09-22',
      previous: { ways: 7143 },
    }),
    null,
  );
});

test('a measurement written before the dated field existed is still evidence', () => {
  /*
   * The first version of this artefact stored the count as a bare number. It
   * is a real measurement and its date is the day the artefact was generated,
   * so it is carried forward rather than discarded over a schema change.
   */
  const migrated = resolveNetworkComparison({
    measured: false,
    ways: 0,
    today: '2026-09-22',
    previous: null,
    legacyWays: 7143,
    legacyDate: '2026-09-21',
  });
  assert.equal(migrated.ways, 7143);
  assert.equal(migrated.measuredAt, '2026-09-21');
  assert.equal(migrated.carriedForward, true);
  assert.equal(migrated.fromLegacyField, true);

  // A fresh measurement still wins over the legacy one.
  const fresh = resolveNetworkComparison({
    measured: true,
    ways: 7200,
    today: '2026-09-22',
    legacyWays: 7143,
    legacyDate: '2026-09-21',
  });
  assert.equal(fresh.ways, 7200);
  assert.equal(fresh.fromLegacyField, undefined);

  // A legacy count with no artefact date is not evidence.
  assert.equal(
    resolveNetworkComparison({
      measured: false,
      ways: 0,
      today: '2026-09-22',
      legacyWays: 7143,
      legacyDate: null,
    }),
    null,
  );
});
