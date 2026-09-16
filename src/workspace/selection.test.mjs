import test from 'node:test';
import assert from 'node:assert/strict';
import { describeSelection, TRACKING_PARAMS } from './selection.js';

/* ---------------- describeSelection ----------------
 *
 * The record shapes below are copied from the layers that actually publish
 * them: src/layers/vessels/selection.js registerSelectedContext(), and
 * src/layers/flights/tracking.js _contextSubjectMetadata(). An earlier version
 * of describeSelection invented its own field names and read none of these, so
 * a vessel selection rendered its id and nothing else.
 */

const VESSEL_RECORD = Object.freeze({
  id: 'ais-232003859',
  layerId: 'ais-live-vessels',
  layerName: 'Live AIS Vessels',
  source: 'AISStream · LIVE',
  label: 'MAERSK KOWLOON',
  latitude: 51.9244,
  longitude: 4.4777,
  properties: {
    mmsi: '232003859',
    type: 'Cargo',
    speedKt: 12.4,
    course: 87,
    destination: 'ROTTERDAM',
  },
});

const FLIGHT_RECORD = Object.freeze({
  id: 'a835af',
  layerId: 'flights',
  layerName: 'Live Flights',
  source: 'OpenSky',
  label: 'UAL779',
  latitude: 37.6,
  longitude: -122.4,
  properties: {
    name: 'UAL779',
    operator: 'United Airlines',
    callsign: 'UAL779',
    registration: '',
    type: 'Boeing 777-200',
    altitude: '36,000 ft',
    speed: '482 kt',
    heading: '337°',
    route: 'SFO → NRT',
    icao24: 'a835af',
  },
});

test('a vessel selection surfaces the facts the layer published', () => {
  const selection = describeSelection(VESSEL_RECORD);
  assert.equal(selection.label, 'MAERSK KOWLOON');
  assert.equal(selection.kind, 'Vessel');
  assert.equal(selection.navId, 'ships');
  assert.equal(selection.facts.MMSI, '232003859');
  assert.equal(selection.facts.Type, 'Cargo');
  assert.equal(selection.facts.Speed, '12.4');
  assert.equal(selection.facts.Destination, 'ROTTERDAM');
  assert.equal(selection.facts.Position, '51.924, 4.478');
  assert.equal(selection.facts.Feed, 'AISStream · LIVE');
});

test('a flight selection surfaces its route and operator', () => {
  const selection = describeSelection(FLIGHT_RECORD);
  assert.equal(selection.kind, 'Aircraft');
  assert.equal(selection.navId, 'aircraft');
  assert.equal(selection.facts.Route, 'SFO → NRT');
  assert.equal(selection.facts.Operator, 'United Airlines');
  assert.equal(selection.facts.Altitude, '36,000 ft');
  assert.equal(selection.facts.ICAO24, 'a835af');
});

test('a field the layer could not determine is omitted, not shown blank', () => {
  // The layers write '' for an unknown field. An empty row reads as a value of
  // nothing, which is worse than no row at all.
  const selection = describeSelection(FLIGHT_RECORD);
  assert.ok(
    !Object.hasOwn(selection.facts, 'Registration'),
    'an empty registration must not render',
  );
});

test('acronym keys are not mangled by the humaniser', () => {
  assert.equal(describeSelection(VESSEL_RECORD).facts.MMSI, '232003859');
  assert.equal(describeSelection(FLIGHT_RECORD).facts.ICAO24, 'a835af');
  const selection = describeSelection({
    id: 'p1',
    layerId: 'supply-ports',
    properties: { unlocode: 'NLRTM', harborSize: 'L' },
  });
  assert.equal(selection.facts['UN/LOCODE'], 'NLRTM');
  assert.equal(selection.facts['Harbor size'], 'L');
});

test('a nested property is skipped rather than stringified to [object Object]', () => {
  const selection = describeSelection({
    id: 'x',
    layerId: 'flights',
    properties: { good: 'yes', bad: { nested: true } },
  });
  assert.equal(selection.facts.Good, 'yes');
  assert.ok(!Object.hasOwn(selection.facts, 'Bad'));
});

test('a vessel selection carries the cargo caveat', () => {
  // Every vessel selection provokes "what is it carrying?", and AIS cannot say.
  assert.match(describeSelection(VESSEL_RECORD).caveat, /no cargo field/i);
  assert.match(describeSelection(FLIGHT_RECORD).caveat, /no payload/i);
});

test('an unknown layer keeps its published name rather than being guessed at', () => {
  const selection = describeSelection({
    id: 'q',
    layerId: 'some-new-layer',
    layerName: 'Some New Layer',
    properties: {},
  });
  assert.equal(selection.kind, 'Some New Layer');
  assert.equal(selection.navId, null);
});

test('a record with no id is not a selection', () => {
  assert.equal(describeSelection(null), null);
  assert.equal(describeSelection({}), null);
  assert.equal(describeSelection({ layerId: 'flights' }), null);
});

/* ---------------- the tracking-param contract ----------------
 *
 * `stopTracking()` must clear the layer params as well as the Cesium tracked
 * entity. Clearing only the entity lets the layer re-acquire its target on the
 * next poll, which looks exactly like the button not working. The adapter
 * itself imports Cesium and is verified in the browser; this pins the list it
 * clears, which is the part that silently rots when a layer is added.
 */

test('every tracking layer the app coordinates is in the clear list', () => {
  const ids = TRACKING_PARAMS.map(([layerId]) => layerId);
  assert.deepEqual(ids, ['flights', 'military', 'satellites']);
  for (const [layerId, key] of TRACKING_PARAMS) {
    assert.match(key, /^selected.*TrackingId$/, `${layerId} param name`);
  }
});
