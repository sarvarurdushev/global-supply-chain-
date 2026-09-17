import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGER_ALERTS,
  createUsgsSource,
  pagerAlert,
  productFile,
  readCityExposureXml,
  readEvent,
  readPagerXml,
  readSummary,
} from './usgs.js';
import { DataClass } from '../../supplychain/provenance.js';

/* Fixtures cut from the live 2015 Gorkha response (us20002926). */

const EVENT_PAYLOAD = {
  id: 'us20002926',
  geometry: { coordinates: [84.7314, 28.2305, 8.22] },
  properties: {
    mag: 7.8,
    magType: 'mww',
    place: '67 km NNE of Bharatpur, Nepal',
    time: 1429942285950,
    alert: 'red',
    tsunami: 0,
    felt: 4174,
    url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us20002926',
    products: {
      shakemap: [
        {
          properties: { maxmmi: '8.718' },
          contents: {
            'download/cont_mmi.json': { url: 'https://example.test/cont_mmi.json' },
          },
        },
      ],
      'ground-failure': [
        {
          properties: {
            'landslide-alert': 'red',
            'landslide-hazard-alert-color': 'red',
            'landslide-hazard-alert-value': '1500.0',
            'landslide-hazard-alert-parameter': 'Aggregate Hazard',
            'landslide-population-alert-color': 'red',
            'landslide-population-alert-value': '250000',
            'liquefaction-alert': 'red',
          },
          contents: { 'jessee_2017.png': { url: 'https://example.test/jessee.png' } },
        },
      ],
    },
  },
};

const PAGER_XML = `<?xml version="1.0"?><pager>
<alert type="economic" level="red" summary="no" units="USD"/>
<alert type="fatality" level="red" summary="yes" units="fatalities"/>
<exposure dmin="0.5" dmax="1.5" exposure="0" rangeInsideMap="0"/>
<exposure dmin="3.5" dmax="4.5" exposure="10720626" rangeInsideMap="0"/>
<exposure dmin="4.5" dmax="5.5" exposure="84253151" rangeInsideMap="0"/>
<exposure dmin="5.5" dmax="6.5" exposure="40899271" rangeInsideMap="1"/>
<exposure dmin="6.5" dmax="7.5" exposure="3556392" rangeInsideMap="1"/>
<exposure dmin="7.5" dmax="8.5" exposure="2884736" rangeInsideMap="1"/>
<exposure dmin="8.5" dmax="9.5" exposure="11711" rangeInsideMap="1"/>
<structcomment>Overall, the population in this region resides in structures that are <b>highly vulnerable</b> to earthquake shaking.</structcomment>
</pager>`;

const CITY_XML = `<?xml version="1.0"?><exposure xmlns:georss="http://www.georss.org/georss">
<feature type="ACTUAL" name="Kathmandu" id="urn:1">
  <georss:point>27.701690 85.320600</georss:point>
  <measure type="population" value="1442271" units="people"/>
  <measure type="MMI" value="7.8900" units="mmi"/>
</feature>
<feature type="ACTUAL" name="Bhaktapur" id="urn:2">
  <georss:point>27.672980 85.430050</georss:point>
  <measure type="MMI" value="7.5400" units="mmi"/>
</feature>
<feature type="ACTUAL" name="No Measure Town" id="urn:3">
  <georss:point>1.0 2.0</georss:point>
</feature>
</exposure>`;

/* ------------------------------------------------------------------ *
 * The event
 * ------------------------------------------------------------------ */

test('an event decodes to the measured values, with depth from the geometry', () => {
  const event = readEvent(EVENT_PAYLOAD, 'https://example.test/q');
  assert.equal(event.magnitude, 7.8);
  assert.equal(event.magnitudeType, 'mww');
  assert.equal(event.latitude, 28.2305);
  assert.equal(event.longitude, 84.7314);
  // GeoJSON puts depth third in the coordinate array, in kilometres.
  assert.equal(event.depthKm, 8.22);
  assert.equal(event.time, '2015-04-25T06:11:25.950Z');
  assert.equal(event.alert, 'red');
  assert.equal(event.hazardId, 'earthquake');
  assert.equal(event.tsunamiFlag, false);
});

test('a malformed event decodes to null rather than a half-built one', () => {
  assert.equal(readEvent(null, 'u'), null);
  assert.equal(readEvent({ properties: {} }, 'u'), null);
  assert.equal(readEvent({ geometry: { coordinates: [1, 2] } }, 'u'), null);
  assert.equal(readSummary({}), null);
});

test('product files resolve by name, and a missing one is null', () => {
  const event = readEvent(EVENT_PAYLOAD, 'u');
  assert.equal(
    productFile(event, 'shakemap', 'download/cont_mmi.json'),
    'https://example.test/cont_mmi.json',
  );
  assert.equal(productFile(event, 'shakemap', 'nope.json'), null);
  assert.equal(productFile(event, 'no-such-product', 'x'), null);
});

/* ------------------------------------------------------------------ *
 * PAGER — the §6 payload
 * ------------------------------------------------------------------ */

test('population exposure decodes per MMI band, with the measured figures', () => {
  const expo = readPagerXml(PAGER_XML, 'https://example.test/pager.xml');
  const byLabel = Object.fromEntries(expo.bands.map((b) => [b.label, b.population]));
  assert.equal(byLabel.IV, 10_720_626);
  assert.equal(byLabel.V, 84_253_151);
  assert.equal(byLabel.VI, 40_899_271);
  assert.equal(byLabel.VII, 3_556_392);
  assert.equal(byLabel.VIII, 2_884_736);
  assert.equal(byLabel.IX, 11_711);
});

test('bands outside the ShakeMap footprint are marked as extrapolated', () => {
  /*
   * The tens of millions at MMI IV and V sit outside the measured footprint
   * and are looser than the millions at VII and VIII inside it. Flattening
   * that distinction would make the biggest number on the page the least
   * reliable one, unmarked.
   */
  const expo = readPagerXml(PAGER_XML, 'u');
  const band = (label) => expo.bands.find((b) => b.label === label);
  assert.equal(band('V').insideShakeMap, false);
  assert.equal(band('VIII').insideShakeMap, true);
  assert.equal(expo.totalInsideShakeMap, 40_899_271 + 3_556_392 + 2_884_736 + 11_711);
});

test('population at damaging intensity counts MMI VII and above', () => {
  const expo = readPagerXml(PAGER_XML, 'u');
  assert.equal(
    expo.populationAtDamagingIntensity,
    3_556_392 + 2_884_736 + 11_711,
  );
});

test('an alert level is reported as a published range, never as a number', () => {
  /*
   * PAGER publishes a colour and a distribution. "An estimated 9,000 deaths"
   * claims a precision USGS does not, so the adapter returns the band.
   */
  const expo = readPagerXml(PAGER_XML, 'u');
  assert.equal(expo.fatalityAlert.level, 'red');
  assert.equal(expo.fatalityAlert.range, '1,000+');
  assert.equal(expo.economicAlert.level, 'red');
  assert.match(expo.economicAlert.economic, /\$1 billion or more/);
  for (const alert of Object.values(PAGER_ALERTS)) {
    assert.ok(alert.fatality?.length > 5);
    assert.ok(alert.economic?.length > 5);
  }
  assert.equal(pagerAlert('RED').level, 'red');
  assert.equal(pagerAlert('not-a-level'), null);
  assert.equal(pagerAlert(undefined), null);
});

test('PAGER output is INFERRED, and says exposure is not casualties', () => {
  const expo = readPagerXml(PAGER_XML, 'u');
  assert.equal(expo.provenance.dataClass, DataClass.INFERRED);
  const text = expo.provenance.limitations.join(' ');
  assert.match(text, /ALERT LEVEL, NOT A DEATH TOLL/);
  assert.match(text, /EXPOSURE IS NOT CASUALTIES/);
  assert.match(expo.vulnerabilityComment, /highly vulnerable/);
  // Markup inside the agency's own comment is stripped, not rendered raw.
  assert.doesNotMatch(expo.vulnerabilityComment, /</);
});

test('a PAGER response with no bands is null, not an empty table', () => {
  // An empty exposure table would read as zero people exposed.
  assert.equal(readPagerXml('<pager></pager>', 'u'), null);
  assert.equal(readPagerXml('', 'u'), null);
  assert.equal(readPagerXml(null, 'u'), null);
});

/* ------------------------------------------------------------------ *
 * Per-city shaking — the LEVEL 3 reading
 * ------------------------------------------------------------------ */

test('city intensities decode with GeoRSS lat/lon order', () => {
  /*
   * `<georss:point>` is "lat lon", the opposite of GeoJSON. Reading it the
   * GeoJSON way put Kathmandu in the Indian Ocean.
   */
  const out = readCityExposureXml(CITY_XML, 'u');
  const kathmandu = out.cities.find((c) => c.name === 'Kathmandu');
  assert.equal(kathmandu.mmi, 7.89);
  assert.ok(kathmandu.latitude > 27 && kathmandu.latitude < 28, 'latitude first');
  assert.ok(kathmandu.longitude > 85 && kathmandu.longitude < 86, 'longitude second');
  assert.equal(kathmandu.population, 1_442_271);
});

test('cities rank by shaking, and one with no measurement is dropped', () => {
  const out = readCityExposureXml(CITY_XML, 'u');
  assert.deepEqual(
    out.cities.map((c) => c.name),
    ['Kathmandu', 'Bhaktapur'],
  );
  // A city whose population is not in the product reports null, not zero.
  assert.equal(out.cities.find((c) => c.name === 'Bhaktapur').population, null);
  assert.equal(readCityExposureXml('<exposure></exposure>', 'u'), null);
});

/* ------------------------------------------------------------------ *
 * Ground failure — the §11 answer
 * ------------------------------------------------------------------ */

test('ground failure reports the landslide alert that closed the roads', () => {
  const source = createUsgsSource({ fetchImpl: async () => ({ ok: false }) });
  const event = readEvent(EVENT_PAYLOAD, 'u');
  const gf = source.getGroundFailure(event);
  assert.equal(gf.landslide.alert, 'red');
  assert.equal(gf.landslide.hazardValue, 1500);
  assert.equal(gf.landslide.hazardParameter, 'Aggregate Hazard');
  assert.equal(gf.landslide.populationValue, 250_000);
  assert.equal(gf.liquefaction.alert, 'red');
  assert.deepEqual([...gf.images], ['https://example.test/jessee.png']);
});

test('an event with no ground-failure product returns null', () => {
  const source = createUsgsSource({ fetchImpl: async () => ({ ok: false }) });
  assert.equal(source.getGroundFailure({ products: {} }), null);
  assert.equal(source.getGroundFailure(null), null);
});

/* ------------------------------------------------------------------ *
 * Requests
 * ------------------------------------------------------------------ */

test('an aftershock search is bounded in time, space and magnitude', () => {
  const calls = [];
  const source = createUsgsSource({
    fetchImpl: async (url) => {
      calls.push(url);
      return { ok: true, json: async () => ({ features: [] }) };
    },
  });
  return source
    .getAftershocks({
      latitude: 28.23,
      longitude: 84.73,
      startTime: '2015-04-25T06:11:25Z',
      days: 30,
    })
    .then(() => {
      const params = new URLSearchParams(calls[0].split('?')[1]);
      assert.equal(params.get('latitude'), '28.23');
      assert.equal(params.get('maxradiuskm'), '250');
      assert.equal(params.get('orderby'), 'time-asc');
      // Starting a minute after the mainshock so it is not its own aftershock.
      assert.ok(params.get('starttime') > '2015-04-25T06:11:25');
      assert.equal(params.get('endtime').slice(0, 10), '2015-05-25');
    });
});

test('bad inputs are rejected before a request is made', async () => {
  /*
   * `assert.rejects`, not `assert.throws`: these methods are async, so a
   * validation failure arrives as a rejected promise. An earlier version of
   * this test used `throws` and passed vacuously on the first case while
   * leaving the rest as floating rejections.
   *
   * Every one is awaited, so a validation that silently stopped working would
   * fail the test rather than print an unhandled-rejection warning.
   */
  const source = createUsgsSource({
    fetchImpl: async () => {
      throw new Error('fetchImpl should not have been called');
    },
  });
  await assert.rejects(() => source.getEvent(''), /event id/);
  await assert.rejects(() => source.getEvent('../../etc/passwd'), /event id/);
  await assert.rejects(() => source.getEvent('has space'), /event id/);
  await assert.rejects(
    () => source.getAftershocks({ latitude: NaN, longitude: 1, startTime: 'x' }),
    /position/,
  );
  await assert.rejects(
    () =>
      source.getAftershocks({
        latitude: 1,
        longitude: 1,
        startTime: 'not-a-date',
      }),
    /time/,
  );
});

test('visual products are the agency’s own images, each with a caption', () => {
  // §12: shown as published, never redrawn from the underlying numbers, or the
  // caveat that comes with the agency's chart gets lost.
  const source = createUsgsSource({ fetchImpl: async () => ({ ok: false }) });
  const event = readEvent(EVENT_PAYLOAD, 'u');
  const products = source.getVisualProducts(event);
  assert.ok(products.length > 0);
  for (const item of products) {
    assert.ok(item.url?.startsWith('http'));
    assert.ok(item.title?.length > 4);
    assert.ok(item.explains?.length > 15, `${item.id} has no caption`);
    assert.equal(item.source, 'USGS');
  }
});
