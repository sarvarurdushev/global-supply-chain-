import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FREIGHT_NETWORKS,
  MAX_BBOX_DEG,
  SITE_KIND_LABELS,
  clampBbox,
  freightProvenance,
  freightQuery,
  normalizeFreightLines,
  normalizeFreightPoints,
  siteKind,
  siteOutput,
} from './freight.js';
import { sanitizeOverpassBody } from '../../server/providers/overpass/query.js';
import { DataClass } from './provenance.js';

/* ------------------------------------------------------------------ *
 * The queries must survive the app's own proxy
 *
 * This is the test that matters most. The proxy rejects any selector that is
 * not individually spatially bounded, rejects oversized radii and world-sized
 * boxes, and denies a list of escape hatches. A query this module builds that
 * the proxy refuses is a layer that silently never loads.
 * ------------------------------------------------------------------ */

test('every freight query passes the Overpass proxy validator', () => {
  for (const key of Object.keys(FREIGHT_NETWORKS)) {
    const built = freightQuery(key, {
      south: 20,
      west: 40,
      north: 30,
      east: 50,
    });
    assert.ok(built, `${key} produced no query`);
    const verdict = sanitizeOverpassBody(
      'data=' + encodeURIComponent(built.query),
    );
    assert.equal(
      verdict.ok,
      true,
      `${key} was refused by the proxy: ${verdict.error}`,
    );
  }
});

test('every network declares what it cannot measure', () => {
  // The rule the whole module exists for: position is shipped, volume is not,
  // and an entry that does not say so would let a reader assume otherwise.
  for (const [key, network] of Object.entries(FREIGHT_NETWORKS)) {
    assert.ok(network.reads?.length > 10, `${key} has no reading`);
    assert.ok(
      network.affectsSupplyChain?.length > 20,
      `${key} does not say how it reaches a supply chain`,
    );
    assert.ok(network.measures?.length > 0, `${key} measures nothing`);
    assert.ok(network.missing?.length > 0, `${key} claims to measure everything`);
    assert.ok(
      network.wouldNeed?.length > 20,
      `${key} does not say what closing the gap would take`,
    );
  }
});

test('rail asks for main lines only', () => {
  // Without `usage=main` the query returns every siding and yard headshunt in
  // the box: the Rhine-Ruhr probe came back with 19,027 ways and 26 MB.
  const built = freightQuery('rail', {
    south: 51,
    west: 4,
    north: 52,
    east: 7,
  });
  assert.match(built.query, /"usage"="main"/);
});

test('pipelines filter by substance, so water mains are not oil', () => {
  const built = freightQuery('pipelines', {
    south: 29,
    west: 46,
    north: 33,
    east: 50,
  });
  assert.match(built.query, /"substance"/);
  assert.match(built.query, /oil/);
});

/* ------------------------------------------------------------------ *
 * Viewport clamping
 * ------------------------------------------------------------------ */

test('a viewport wider than the proxy allows is clamped, not refused', () => {
  const box = clampBbox({ south: -60, west: -170, north: 70, east: 170 });
  assert.ok(box);
  assert.equal(box.clamped, true);
  assert.ok(box.north - box.south <= MAX_BBOX_DEG + 1e-9);
  assert.ok(box.east - box.west <= MAX_BBOX_DEG + 1e-9);
  // Centred on the original view rather than anchored to a corner: the middle
  // of the screen is what the user is looking at.
  assert.equal((box.north + box.south) / 2, 5);
  assert.equal((box.east + box.west) / 2, 0);
});

test('a usable viewport is passed through unchanged', () => {
  const box = clampBbox({ south: 51, west: 4, north: 52, east: 7 });
  assert.deepEqual(box, {
    south: 51,
    west: 4,
    north: 52,
    east: 7,
    clamped: false,
  });
});

test('an unusable viewport yields null rather than throwing', () => {
  // The caller is a camera-change handler. A camera mid-flight or pointed at
  // the horizon should skip a fetch, not raise.
  assert.equal(clampBbox(null), null);
  assert.equal(clampBbox({ south: 10, west: 10, north: 5, east: 20 }), null);
  assert.equal(clampBbox({ south: 10, west: 30, north: 20, east: 20 }), null);
  assert.equal(clampBbox({ south: -100, west: 0, north: 10, east: 10 }), null);
  assert.equal(clampBbox({ south: NaN, west: 0, north: 10, east: 10 }), null);
  assert.equal(freightQuery('rail', null), null);
  assert.equal(freightQuery('not-a-network', { south: 0, west: 0, north: 1, east: 1 }), null);
});

test('the QL timeout is clamped to what the proxy permits', () => {
  assert.match(
    freightQuery('rail', { south: 0, west: 0, north: 1, east: 1 }, 9999).query,
    /\[timeout:30\]/,
  );
  assert.match(
    freightQuery('rail', { south: 0, west: 0, north: 1, east: 1 }, 0).query,
    /\[timeout:1\]/,
  );
});

/* ------------------------------------------------------------------ *
 * Decoding
 * ------------------------------------------------------------------ */

test('lines with fewer than two usable points are dropped', () => {
  const lines = normalizeFreightLines({
    elements: [
      { type: 'way', id: 1, geometry: [{ lat: 1, lon: 1 }], tags: {} },
      { type: 'way', id: 2, geometry: [], tags: {} },
      { type: 'way', id: 3, tags: {} },
      {
        type: 'way',
        id: 4,
        geometry: [
          { lat: 1, lon: 1 },
          { lat: null, lon: 2 },
        ],
        tags: {},
      },
      {
        type: 'way',
        id: 5,
        geometry: [
          { lat: 1, lon: 1 },
          { lat: 2, lon: 2 },
        ],
        tags: { name: 'Real Line', usage: 'main', junk: 'dropped' },
      },
      { type: 'node', id: 6, lat: 1, lon: 1, tags: {} },
    ],
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].osmId, 'way/5');
  assert.deepEqual(lines[0].coordinates, [
    [1, 1],
    [2, 2],
  ]);
  assert.deepEqual(lines[0].tags, { name: 'Real Line', usage: 'main' });
});

test('points read a node position or a way centre, and drop the rest', () => {
  const points = normalizeFreightPoints({
    elements: [
      { type: 'node', id: 1, lat: -23.5, lon: -69, tags: { man_made: 'mineshaft', resource: 'copper' } },
      { type: 'way', id: 2, center: { lat: 29.7, lon: -95.2 }, tags: { man_made: 'works', product: 'petroleum' } },
      { type: 'way', id: 3, tags: { landuse: 'quarry' } },
    ],
  });
  assert.equal(points.length, 2);
  assert.equal(points[0].osmId, 'node/1');
  assert.equal(points[0].kind, 'MINE');
  assert.equal(points[1].osmId, 'way/2');
  assert.equal(points[1].lat, 29.7);
  assert.equal(points[1].kind, 'WORKS');
});

test('caps are honoured so one dense view cannot flood the scene', () => {
  const many = Array.from({ length: 50 }, (_, i) => ({
    type: 'way',
    id: i,
    geometry: [
      { lat: 0, lon: i },
      { lat: 1, lon: i },
    ],
    tags: {},
  }));
  assert.equal(normalizeFreightLines({ elements: many }, 10).length, 10);
  const nodes = Array.from({ length: 50 }, (_, i) => ({
    type: 'node',
    id: i,
    lat: 0,
    lon: i,
    tags: {},
  }));
  assert.equal(normalizeFreightPoints({ elements: nodes }, 7).length, 7);
});

test('a missing or malformed payload decodes to nothing, not a throw', () => {
  assert.deepEqual(normalizeFreightLines(null), []);
  assert.deepEqual(normalizeFreightLines({}), []);
  assert.deepEqual(normalizeFreightPoints(undefined), []);
});

test('site kind comes from the tag that matched, not from the name', () => {
  assert.equal(siteKind({ landuse: 'quarry' }), 'QUARRY');
  assert.equal(siteKind({ man_made: 'mineshaft' }), 'MINE');
  assert.equal(siteKind({ man_made: 'works' }), 'WORKS');
  assert.equal(siteKind({ name: 'Escondida Refinery' }), 'UNKNOWN');
  for (const kind of Object.keys(SITE_KIND_LABELS)) {
    assert.ok(SITE_KIND_LABELS[kind].length > 4);
  }
});

test('a site with no resource tag reports nothing rather than a guess', () => {
  assert.equal(siteOutput({}), null);
  assert.equal(siteOutput({ name: 'Copper Mountain Mine' }), null);
  assert.equal(siteOutput({ resource: 'copper' }), 'copper');
  // OSM packs multiple values into one semicolon-separated string.
  assert.equal(siteOutput({ resource: 'gold;silver' }), 'gold, silver');
  assert.equal(siteOutput({ product: 'natural_gas' }), 'natural gas');
});

/* ------------------------------------------------------------------ *
 * Provenance
 * ------------------------------------------------------------------ */

test('freight data is HISTORICAL, never LIVE', () => {
  /*
   * The §23 rule. The HTTP request is live; the data is a survey. A pipeline
   * mapped in 2019 is still in the database whether or not it still carries
   * anything, and labelling it LIVE because the fetch was live is exactly the
   * mislabelling the rule exists to prevent.
   */
  const provenance = freightProvenance({
    network: FREIGHT_NETWORKS.pipelines,
    bbox: { south: 29, west: 46, north: 33, east: 50 },
    count: 412,
    retrievedAt: '2026-09-17T00:00:00.000Z',
  });
  assert.equal(provenance.dataClass, DataClass.HISTORICAL);
  assert.match(provenance.license, /ODbL/);
  assert.match(provenance.license, /OpenStreetMap contributors/);
});

test('provenance states the volume gap, the coverage gap and the currency gap', () => {
  const provenance = freightProvenance({
    network: FREIGHT_NETWORKS.rail,
    bbox: { south: 51, west: 4, north: 52, east: 7 },
    count: 0,
    retrievedAt: '2026-09-17T00:00:00.000Z',
  });
  const text = provenance.limitations.join(' ');
  assert.match(text, /LOCATIONS ONLY/);
  assert.match(text, /tonne-kilometres/i);
  assert.match(text, /VOLUNTEER COVERAGE/);
  assert.match(text, /nobody has mapped this here/);
  assert.match(text, /NO CURRENCY GUARANTEE/);
  assert.match(text, /disused/);
});

test('a truncated view says so instead of looking complete', () => {
  const wide = freightProvenance({
    network: FREIGHT_NETWORKS.roads,
    bbox: { south: 0, west: 0, north: 12, east: 12 },
    count: 900,
    clamped: true,
    retrievedAt: '2026-09-17T00:00:00.000Z',
  });
  assert.match(wide.limitations.join(' '), /VIEW TRUNCATED/);
  const narrow = freightProvenance({
    network: FREIGHT_NETWORKS.roads,
    bbox: { south: 0, west: 0, north: 1, east: 1 },
    count: 900,
    clamped: false,
    retrievedAt: '2026-09-17T00:00:00.000Z',
  });
  assert.doesNotMatch(narrow.limitations.join(' '), /VIEW TRUNCATED/);
});
