import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AQUEDUCT_BANDS,
  SENTINEL_MAGNITUDE,
  basinAtPointUrl,
  basinProvenance,
  isMeasured,
  nationalAverageGap,
  readBasin,
  readBasins,
  stressedBasinsUrl,
} from './waterBasins.js';
import { DataClass } from './provenance.js';

/** One feature in the shape the live service returns. */
function feature(attributes) {
  return { attributes };
}

const HEBEI = {
  pfaf_id: 431648,
  name_0: 'China',
  name_1: 'Hebei',
  bws_raw: 19.693,
  bws_label: 'Extremely High (>80%)',
  bwd_label: 'High (50-75%)',
  gtd_label: 'Medium - High (2-4 cm/y)',
  area_km2: 12000,
};

/* ------------------------------------------------------------------ *
 * The sentinels
 *
 * These are the two values that would have produced numbers that do not
 * exist. Aqueduct writes 9999 for "arid and low water use" and -9999 for "no
 * data" in every raw field; printed as a percentage the first reads
 * "999,900% water stress".
 * ------------------------------------------------------------------ */

test('sentinel codes are never treated as measurements', () => {
  assert.equal(isMeasured(SENTINEL_MAGNITUDE), false);
  assert.equal(isMeasured(-SENTINEL_MAGNITUDE), false);
  assert.equal(isMeasured(10_000), false);
  assert.equal(isMeasured(0.937), true);
  assert.equal(isMeasured(19.693), true);
  assert.equal(isMeasured(null), false);
  assert.equal(isMeasured(NaN), false);
});

test('an arid basin reports a classification and no percentage', () => {
  const basin = readBasin({
    pfaf_id: 471201,
    name_0: 'China',
    bws_raw: 9999,
    bws_label: 'Arid and Low Water Use',
  });
  assert.equal(basin.withdrawalPercent, null);
  assert.equal(basin.level, 'ARID_LOW_USE');
  assert.match(basin.unmeasuredReason, /arid with low water use/);
  assert.match(basin.unmeasuredReason, /meaningless rather than high/);
});

test('an unmeasured basin says so rather than reading as zero', () => {
  const basin = readBasin({
    pfaf_id: 1,
    bws_raw: -9999,
    bws_label: 'No Data',
  });
  assert.equal(basin.withdrawalPercent, null);
  assert.equal(basin.level, 'NO_DATA');
  assert.match(basin.unmeasuredReason, /no baseline water-stress measurement/);
});

test('withdrawal above 100% is preserved, not clamped', () => {
  /*
   * Hebei withdraws nearly twenty times its renewable supply by mining
   * groundwater. Clamping to 100% would hide the most important thing the
   * dataset says about the North China Plain.
   */
  const basin = readBasin(HEBEI);
  assert.ok(basin.withdrawalPercent > 1900);
  assert.ok(basin.withdrawalPercent < 2000);
});

test('bands come from Aqueduct’s own labels, not a parallel scale', () => {
  const basin = readBasin(HEBEI);
  assert.equal(basin.label, 'Extremely High (>80%)');
  assert.equal(basin.plainLabel, 'Extremely high');
  // An unrecognised label falls back to NO_DATA rather than being guessed at.
  const odd = readBasin({ pfaf_id: 2, bws_raw: 0.5, bws_label: 'Wat' });
  assert.equal(odd.level, 'NO_DATA');
  for (const band of AQUEDUCT_BANDS) {
    assert.ok(band.plain.length > 2, `${band.level} has no plain label`);
  }
});

test('a row with no basin id is dropped', () => {
  assert.equal(readBasin({ bws_raw: 0.5 }), null);
  assert.equal(readBasin(null), null);
});

/* ------------------------------------------------------------------ *
 * Deduplication
 * ------------------------------------------------------------------ */

test('a basin crossing provinces is returned once, with every province', () => {
  /*
   * The live service repeats a basin per `name_1` it intersects, with
   * identical figures. Without deduplication a top-three list is the same
   * basin three times — which is what the first version of this did.
   */
  const basins = readBasins({
    features: [
      feature({ ...HEBEI, pfaf_id: 431670, name_1: 'Hebei' }),
      feature({ ...HEBEI, pfaf_id: 431670, name_1: 'Shandong' }),
      feature({ ...HEBEI, pfaf_id: 431670, name_1: 'Tianjin' }),
    ],
  });
  assert.equal(basins.length, 1);
  assert.deepEqual([...basins[0].provinces], ['Hebei', 'Shandong', 'Tianjin']);
});

test('basins rank by severity, with coded rows last rather than worst', () => {
  const basins = readBasins({
    features: [
      feature({ pfaf_id: 1, bws_raw: -9999, bws_label: 'No Data' }),
      feature({ pfaf_id: 2, bws_raw: 0.05, bws_label: 'Low (<10%)' }),
      feature({ pfaf_id: 3, bws_raw: 9999, bws_label: 'Arid and Low Water Use' }),
      feature({ ...HEBEI, pfaf_id: 4 }),
      feature({ pfaf_id: 5, bws_raw: 0.5, bws_label: 'High (40-80%)' }),
    ],
  });
  assert.deepEqual(
    basins.map((basin) => basin.basinId),
    [4, 5, 2, 3, 1],
  );
});

test('an error response and an empty response both decode to nothing', () => {
  assert.deepEqual(readBasins({ error: { code: 400 } }), []);
  assert.deepEqual(readBasins({ features: [] }), []);
  assert.deepEqual(readBasins(null), []);
});

/* ------------------------------------------------------------------ *
 * URLs
 * ------------------------------------------------------------------ */

test('a point query names the point and asks for no geometry back', () => {
  const url = basinAtPointUrl({ lat: 39.9, lon: 116.4 });
  assert.match(url, /geometry=116\.4%2C39\.9/);
  assert.match(url, /geometryType=esriGeometryPoint/);
  assert.match(url, /returnGeometry=false/);
  assert.match(url, /bws_label/);
});

test('an unusable point yields null rather than a bad request', () => {
  assert.equal(basinAtPointUrl({}), null);
  assert.equal(basinAtPointUrl({ lat: 100, lon: 0 }), null);
  assert.equal(basinAtPointUrl({ lat: 0, lon: 200 }), null);
});

/**
 * Read a built URL's query the way the server will.
 *
 * Not `decodeURIComponent`: these are form-encoded, so a space is `+` and
 * decodeURIComponent leaves it as one. Asserting against the raw string
 * therefore tests the encoding rather than the clause.
 */
function clauseOf(url) {
  return new URLSearchParams(url.split('?')[1]);
}

test('a country query excludes the sentinels server-side', () => {
  const params = clauseOf(stressedBasinsUrl({ countryName: 'China', limit: 40 }));
  assert.equal(
    params.get('where'),
    "name_0='China' AND bws_raw > -9999 AND bws_raw < 9999",
  );
  assert.equal(params.get('orderByFields'), 'bws_raw DESC');
});

test('a country name with an apostrophe is escaped, not left to break the clause', () => {
  // "Cote d'Ivoire" is a real value in Aqueduct's name_0 field, and an
  // unescaped quote makes the SQL malformed and the service answer 400.
  const params = clauseOf(stressedBasinsUrl({ countryName: "Cote d'Ivoire" }));
  assert.match(params.get('where'), /^name_0='Cote d''Ivoire' AND /);
});

test('the row budget is bounded in both directions', () => {
  assert.match(
    stressedBasinsUrl({ countryName: 'China', limit: 10_000 }),
    /resultRecordCount=200/,
  );
  assert.match(
    stressedBasinsUrl({ countryName: 'China', limit: 0 }),
    /resultRecordCount=1/,
  );
  assert.equal(stressedBasinsUrl({}), null);
});

/* ------------------------------------------------------------------ *
 * The finding
 * ------------------------------------------------------------------ */

test('the national average and the worst basin are stated together', () => {
  /*
   * The whole reason for this module. environment.js said, in its own words,
   * that China's national figure averages the water-rich south with the
   * water-scarce north and "the north is where the wheat is". The numbers are
   * the measured ones: 20.2% nationally, 1,969% in the Hebei basin.
   */
  const basins = readBasins({ features: [feature(HEBEI)] });
  const gap = nationalAverageGap({
    nationalPercent: 20.2,
    basins,
    countryName: 'China',
  });
  assert.match(gap.finding, /20\.2%/);
  assert.match(gap.finding, /1,969%/);
  assert.match(gap.finding, /Hebei/);
  assert.match(gap.finding, /97 times/);
  assert.match(gap.finding, /wrong resolution/);
  assert.ok(gap.ratio > 90);
});

test('with no national figure the basin still reports, without a comparison', () => {
  const basins = readBasins({ features: [feature(HEBEI)] });
  const gap = nationalAverageGap({
    nationalPercent: null,
    basins,
    countryName: 'China',
  });
  assert.equal(gap.nationalPercent, null);
  assert.equal(gap.ratio, null);
  assert.match(gap.finding, /no national figure/);
});

test('nothing to contrast yields no finding rather than half a sentence', () => {
  assert.equal(
    nationalAverageGap({ nationalPercent: 20.2, basins: [], countryName: 'China' }),
    null,
  );
  // Coded rows alone are not a comparison either.
  const coded = readBasins({
    features: [feature({ pfaf_id: 9, bws_raw: 9999, bws_label: 'Arid and Low Water Use' })],
  });
  assert.equal(
    nationalAverageGap({ nationalPercent: 20.2, basins: coded, countryName: 'X' }),
    null,
  );
});

/* ------------------------------------------------------------------ *
 * Provenance
 * ------------------------------------------------------------------ */

test('basin data is HISTORICAL and carries its licence and its traps', () => {
  const provenance = basinProvenance({
    scope: 'China',
    count: 6,
    retrievedAt: '2026-09-17T00:00:00.000Z',
  });
  assert.equal(provenance.dataClass, DataClass.HISTORICAL);
  assert.match(provenance.license, /CC BY 4\.0/);
  assert.match(provenance.license, /World Resources Institute/);
  const text = provenance.limitations.join(' ');
  assert.match(text, /BASELINE, NOT A READING FOR TODAY/);
  assert.match(text, /SENTINEL CODES/);
  assert.match(text, /ABOVE 100% IS REAL/);
  assert.match(text, /MODELLED, NOT METERED/);
});
