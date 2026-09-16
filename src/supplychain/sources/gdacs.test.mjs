import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_TYPES,
  ALERT_LEVELS,
  GdacsError,
  alertRank,
  normalizeEvent,
  normalizeEventFeed,
  gdacsProvenance,
  createGdacsSource,
  linkEventsToNodes,
} from './gdacs.js';
import { DataClass } from '../provenance.js';
import { haversineKm } from '../geo.js';

/** A real feature shape, captured from the live feed on 2026-09-16. */
const FEATURE = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [167.0164, -15.0655] },
  properties: {
    eventtype: 'EQ',
    eventid: 1566492,
    episodeid: 1734308,
    eventname: '',
    name: 'Earthquake in Vanuatu',
    description: 'Earthquake in Vanuatu',
    alertlevel: 'Green',
    alertscore: 1,
    iscurrent: 'true',
    country: 'Vanuatu',
    iso3: 'VUT',
    fromdate: '2026-09-16T04:12:00',
    todate: '2026-09-16T04:12:00',
    affectedcountries: [{ iso2: 'VU', iso3: 'VUT', countryname: 'Vanuatu' }],
    severitydata: {
      severity: 4.7,
      severitytext: 'Magnitude 4.7M, Depth:60.686km',
      severityunit: 'M',
    },
    url: { report: 'https://www.gdacs.org/report.aspx?eventid=1566492' },
  },
};

const feed = (features) => ({ type: 'FeatureCollection', features });

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => payload };
}

test('alertRank orders by severity and sinks unknown levels', () => {
  assert.deepEqual(ALERT_LEVELS, ['Green', 'Orange', 'Red']);
  assert.ok(alertRank('Red') > alertRank('Orange'));
  assert.ok(alertRank('Orange') > alertRank('Green'));
  assert.equal(alertRank(null), -1);
  assert.equal(alertRank('Puce'), -1);
});

test('normalizeEvent handles the real feature shape', () => {
  const event = normalizeEvent(FEATURE);
  assert.equal(event.eventType, 'EQ');
  assert.equal(event.eventLabel, EVENT_TYPES.EQ);
  assert.equal(event.alertLevel, 'Green');
  assert.equal(event.lat, -15.0655);
  assert.equal(event.lon, 167.0164);
  assert.equal(event.iso3, 'VUT');
  assert.equal(event.severity, 4.7);
  assert.match(event.severityText, /Magnitude 4\.7M/);
  assert.equal(event.isCurrent, true);
  assert.deepEqual(event.affectedIso3, ['VUT']);
  assert.ok(Object.isFrozen(event));
});

test('event ids include the episode so a re-issued advisory does not collide', () => {
  const first = normalizeEvent(FEATURE);
  const reissued = normalizeEvent({
    ...FEATURE,
    properties: { ...FEATURE.properties, episodeid: 1734309 },
  });
  assert.notEqual(first.id, reissued.id);
  assert.equal(first.eventId, reissued.eventId);
});

test('normalizeEvent rejects malformed or unplaceable features', () => {
  assert.equal(normalizeEvent(null), null);
  assert.equal(normalizeEvent({}), null);
  assert.equal(normalizeEvent({ properties: {} }), null);
  // No geometry.
  assert.equal(
    normalizeEvent({ ...FEATURE, geometry: null }),
    null,
  );
  // Out-of-range coordinates must be rejected, not clamped.
  assert.equal(
    normalizeEvent({ ...FEATURE, geometry: { coordinates: [200, 0] } }),
    null,
  );
  assert.equal(
    normalizeEvent({ ...FEATURE, geometry: { coordinates: [0, 999] } }),
    null,
  );
  // No event type or id.
  assert.equal(
    normalizeEvent({ ...FEATURE, properties: { ...FEATURE.properties, eventtype: '' } }),
    null,
  );
  assert.equal(
    normalizeEvent({ ...FEATURE, properties: { ...FEATURE.properties, eventid: null } }),
    null,
  );
});

test('an unrecognised alert level becomes null rather than being trusted', () => {
  const event = normalizeEvent({
    ...FEATURE,
    properties: { ...FEATURE.properties, alertlevel: 'Chartreuse' },
  });
  assert.equal(event.alertLevel, null);
});

test('normalizeEventFeed sorts most severe first and counts rejections', () => {
  const red = {
    ...FEATURE,
    properties: { ...FEATURE.properties, eventid: 2, alertlevel: 'Red' },
  };
  const orange = {
    ...FEATURE,
    properties: { ...FEATURE.properties, eventid: 3, alertlevel: 'Orange' },
  };
  const { events, rejected } = normalizeEventFeed(feed([FEATURE, red, orange, {}]));
  assert.equal(events.length, 3);
  assert.equal(rejected, 1);
  assert.deepEqual(
    events.map((e) => e.alertLevel),
    ['Red', 'Orange', 'Green'],
  );
});

test('normalizeEventFeed rejects a malformed envelope', () => {
  assert.throws(() => normalizeEventFeed(null), GdacsError);
  assert.throws(() => normalizeEventFeed({ features: 'nope' }), GdacsError);
});

test('GDACS provenance is LIVE and names what the feed does not cover', () => {
  const p = gdacsProvenance({ dataset: 'test', retrievedAt: '2026-09-16T00:00:00Z' });
  // Unlike trade data, a hazard feed is legitimately live.
  assert.equal(p.dataClass, DataClass.LIVE);
  assert.equal(p.badge, '🟢 LIVE');
  assert.ok(
    p.limitations.some((l) => /does NOT carry strikes, port/.test(l)),
    'must state that human-caused disruptions are absent',
  );
  assert.ok(
    p.limitations.some((l) => /absence of a marker is not evidence/.test(l)),
  );
  assert.ok(
    p.limitations.some((l) => /modelled estimate of likely humanitarian/.test(l)),
  );
  assert.ok(p.limitations.some((l) => /not a historical archive/.test(l)));
});

test('getEvents returns normalized events with provenance', async () => {
  let requested = null;
  const source = createGdacsSource({
    fetchImpl: async (url) => {
      requested = url;
      return jsonResponse(feed([FEATURE]));
    },
    now: () => '2026-09-16T00:00:00Z',
  });
  const result = await source.getEvents();
  assert.match(requested, /geteventlist\/EVENTS4APP$/);
  assert.equal(result.events.length, 1);
  assert.equal(result.provenance.dataClass, DataClass.LIVE);
});

test('getEvents surfaces HTTP failures with retryability', async () => {
  const source = createGdacsSource({
    fetchImpl: async () => jsonResponse({}, { ok: false, status: 503 }),
  });
  await assert.rejects(
    () => source.getEvents(),
    (error) => {
      assert.ok(error instanceof GdacsError);
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

/* ---------------- linkEventsToNodes ---------------- */

const BUSAN = { id: 'p1', name: 'Busan', lat: 35.1, lon: 129.03, kind: 'port' };
const ROTTERDAM = { id: 'p2', name: 'Rotterdam', lat: 51.9, lon: 4.48, kind: 'port' };

test('linkEventsToNodes finds infrastructure inside the radius', () => {
  // An event ~80 km from Busan and nowhere near Rotterdam.
  const event = { ...normalizeEvent(FEATURE), lat: 35.5, lon: 129.8 };
  const [linked] = linkEventsToNodes({
    events: [event],
    nodes: [BUSAN, ROTTERDAM],
    distanceKm: haversineKm,
    radiusKm: 500,
  });
  assert.equal(linked.nearbyCount, 1);
  assert.equal(linked.nearby[0].name, 'Busan');
  assert.ok(linked.nearby[0].distanceKm < 500);
  assert.equal(linked.nearby[0].kind, 'port');
});

test('linkEventsToNodes attaches the exposure caveat to every event', () => {
  // The whole point: proximity is exposure, not impact, and the record says so.
  const [linked] = linkEventsToNodes({
    events: [normalizeEvent(FEATURE)],
    nodes: [BUSAN],
    distanceKm: haversineKm,
  });
  assert.match(linked.proximityCaveat, /EXPOSURE, not impact/);
  assert.match(linked.proximityCaveat, /not that it was affected/);
});

test('linkEventsToNodes returns nothing nearby when the radius excludes everything', () => {
  const [linked] = linkEventsToNodes({
    events: [normalizeEvent(FEATURE)],
    nodes: [BUSAN, ROTTERDAM],
    distanceKm: haversineKm,
    radiusKm: 10,
  });
  assert.equal(linked.nearbyCount, 0);
  assert.deepEqual(linked.nearby, []);
});

test('linkEventsToNodes sorts by distance and caps the list', () => {
  const event = { ...normalizeEvent(FEATURE), lat: 35.1, lon: 129.03 };
  const nodes = [
    { id: 'far', name: 'Far', lat: 37.0, lon: 129.03, kind: 'port' },
    { id: 'near', name: 'Near', lat: 35.2, lon: 129.03, kind: 'port' },
    { id: 'mid', name: 'Mid', lat: 36.0, lon: 129.03, kind: 'port' },
  ];
  const [linked] = linkEventsToNodes({
    events: [event],
    nodes,
    distanceKm: haversineKm,
    radiusKm: 1000,
    maxPerEvent: 2,
  });
  assert.equal(linked.nearby.length, 2, 'capped');
  assert.equal(linked.nearbyCount, 3, 'but the true count is preserved');
  assert.deepEqual(
    linked.nearby.map((n) => n.name),
    ['Near', 'Mid'],
  );
});

test('linkEventsToNodes validates its arguments', () => {
  assert.throws(
    () => linkEventsToNodes({ events: 'nope', nodes: [], distanceKm: haversineKm }),
    TypeError,
  );
  assert.throws(
    () => linkEventsToNodes({ events: [], nodes: [], distanceKm: null }),
    TypeError,
  );
});
