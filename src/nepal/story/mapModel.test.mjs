import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COVERAGE_COLOURS,
  DAMAGE_COLOURS,
  DATA_GAP_GREY,
  MMI_COLOURS,
  aoiDrawables,
  cameraRangeMetres,
  coverageDrawables,
  damageDrawables,
  districtFocusDrawables,
  gradingBucket,
  gradingDrawables,
  overlapDrawables,
  proximityRingDrawables,
  recordsByDistrict,
  depthColour,
  drawablesForScene,
  epicentreDrawables,
  infrastructureDrawables,
  magnitudeRadius,
  outlineDrawables,
  seismicDrawables,
  shakingDrawables,
} from './mapModel.js';
import { contoursToRings, intensityBands } from '../analysis/exposure.js';
import { createNepalInvestigation } from './investigation.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = async (name) =>
  JSON.parse(await readFile(path.join(ROOT, 'data', 'processed', name), 'utf8'));

test('magnitude radius keeps the whole catalogue legible at once', () => {
  /*
   * The regression this pins: an earlier constant put M4 at 12 px and let the
   * upper clamp do the work, drawing 316 mostly-M4 aftershocks as a field of
   * equal blobs and hiding the sequence the scene exists to show.
   */
  assert.ok(magnitudeRadius(4) < 4.5, `M4 should be small, got ${magnitudeRadius(4)}`);
  assert.ok(magnitudeRadius(7.8) > 20, `M7.8 should dominate, got ${magnitudeRadius(7.8)}`);
  const spread = magnitudeRadius(7.8) / magnitudeRadius(4);
  assert.ok(spread > 5 && spread < 10, `spread should be about sevenfold, got ${spread}`);
  // Monotonic, floored, and safe on rubbish.
  assert.ok(magnitudeRadius(5) < magnitudeRadius(6));
  assert.equal(magnitudeRadius(null), 3);
  assert.equal(magnitudeRadius(NaN), 3);
  assert.ok(magnitudeRadius(12) <= 28, 'clamped at the top');
});

test('shallow depth is the hot end of the ramp', () => {
  // Shallow is the dangerous case, so it must read as the alarming one.
  assert.equal(depthColour(5), '#ff4d4d');
  assert.equal(depthColour(200), '#7fd4e8');
  assert.equal(depthColour(null), '#5b6b66');
});

test('the modelled field and the observed points never share a grammar', async () => {
  /*
   * The single rule the whole visual argument rests on, checked on the real
   * data rather than on a fixture.
   */
  const bands = intensityBands(contoursToRings((await read('nepal-2015-shakemap-contours.json')).data.features)).bands;
  const field = shakingDrawables(bands)[0];
  const points = damageDrawables((await read('nepal-2015-unosat-damage-sites.json')).data.features)[0];
  assert.equal(field.grammar.edge, 'none');
  assert.equal(field.grammar.shape, 'field');
  assert.equal(field.grammar.chip, 'MODELED');
  assert.equal(points.grammar.edge, 'hard');
  assert.equal(points.grammar.shape, 'discrete');
  assert.ok(points.fillAlpha > field.fillAlpha);
});

test('the timeline drives the map without inventing events between them', async () => {
  const events = (await read('nepal-2015-seismic.json')).data.events;
  const all = seismicDrawables(events, { mainShockId: 'us20002926' });
  assert.equal(all.length, events.length);
  assert.equal(all.filter((d) => d.emphasis).length, 1, 'exactly one main shock');

  const early = seismicDrawables(events, { cutoff: '2015-04-26T00:00:00Z' });
  assert.ok(early.length > 0 && early.length < all.length);
  // Every drawn event is a real catalogue entry; nothing is interpolated.
  const ids = new Set(events.map((event) => event.id));
  for (const item of early) assert.ok(ids.has(item.id));
  // A cutoff before the main shock draws nothing.
  assert.equal(seismicDrawables(events, { cutoff: '2015-01-01T00:00:00Z' }).length, 0);
});

test('a threshold dims weaker bands rather than deleting them', async () => {
  /*
   * A band that vanishes reads as "no shaking here" instead of "below the
   * level you chose".
   */
  const bands = intensityBands(contoursToRings((await read('nepal-2015-shakemap-contours.json')).data.features)).bands;
  const drawn = shakingDrawables(bands, { threshold: 7 });
  assert.equal(drawn.length, bands.length, 'no band is removed');
  assert.ok(drawn.some((d) => d.dimmed));
  assert.ok(drawn.some((d) => !d.dimmed));
  for (const item of drawn) assert.ok(MMI_COLOURS[item.mmi], `no colour for MMI ${item.mmi}`);
});

test('the damage reveal follows imagery dates, and the classes have an ordinal ramp', async () => {
  const features = (await read('nepal-2015-unosat-damage-sites.json')).data.features;
  assert.equal(damageDrawables(features).length, 4583);
  // 56 on 26 Apr plus 778 on 27 Apr.
  assert.equal(damageDrawables(features, { since: '2015-04-27' }).length, 834);
  const destroyed = damageDrawables(features, { classes: ['Destroyed'] });
  assert.equal(destroyed.length, 2084);
  assert.ok(destroyed.every((d) => d.colour === DAMAGE_COLOURS.Destroyed));
  // The ramp is ordinal, so the worst class is the hot end.
  assert.equal(DAMAGE_COLOURS.Destroyed, '#ff4d4d');
});

test('each infrastructure kind gets its own visual grammar', async () => {
  const nga = (await read('nepal-2015-nga-infrastructure-damage.json')).data;
  const all = infrastructureDrawables(nga);
  assert.equal(all.length, 235);
  const kinds = new Set(all.map((d) => d.kind));
  assert.deepEqual([...kinds].sort(), ['marker', 'polygon', 'polyline']);
  assert.equal(infrastructureDrawables(nga, { show: ['blocked-roads'] }).length, 179);
  assert.equal(infrastructureDrawables(nga, { show: ['bridges-out'] }).length, 5);
  assert.equal(infrastructureDrawables(nga, { show: ['landslides'] }).length, 51);
});

test('the epicentre and the outline are drawn from the artefacts', async () => {
  const districts = (await read('nepal-districts-adm2-2015.json')).data.features;
  assert.equal(outlineDrawables(districts).length, 75);
  assert.equal(outlineDrawables(districts)[0].grammar.resultClass, 'OFFICIAL');
  const epicentre = epicentreDrawables({ longitude: 84.7, latitude: 28.2, magnitude: 7.8 });
  assert.equal(epicentre.length, 1);
  assert.equal(epicentre[0].pulse, true);
  assert.equal(epicentreDrawables(null).length, 0);
});

test('a scene draws only the layers it declares, grouped so one can change alone', async () => {
  const inv = createNepalInvestigation();
  inv.goTo('earthquake');
  const events = (await read('nepal-2015-seismic.json')).data.events;
  const grouped = drawablesForScene({
    state: inv.state,
    intelligence: { seismic: { mainShock: { id: 'us20002926' } } },
    data: { seismicEvents: events },
  });
  assert.deepEqual([...grouped.keys()], ['seismic-events']);
  assert.equal(grouped.get('seismic-events').length, events.length);

  // A layer whose data has not loaded is absent rather than empty.
  const withoutData = drawablesForScene({ state: inv.state, intelligence: {}, data: {} });
  assert.equal(withoutData.size, 0);
});

test('the result-class filter reaches the map, not just the panel', () => {
  const inv = createNepalInvestigation();
  inv.goTo('network');
  inv.setResultClassFilter(['OBSERVED']);
  const grouped = drawablesForScene({
    state: inv.state,
    intelligence: {},
    data: { nga: { blockedRoads: { features: [] } } },
  });
  assert.equal(grouped.size, 0, 'a SCENARIO scene must draw nothing under an OBSERVED filter');
});

test('an oblique scene is framed by range from its subject, not parked over it', () => {
  /*
   * The scene's target is what to LOOK AT. Read as a camera position, scene
   * 04's 900 km at -70 degrees put the whole modelled shaking field off the
   * bottom of the screen: the layer drew correctly and framed nothing.
   */
  const nadir = cameraRangeMetres({ altKm: 900, pitch: -90 });
  assert.equal(nadir, 900_000, 'a vertical scene is unchanged');

  const oblique = cameraRangeMetres({ altKm: 900, pitch: -70 });
  assert.ok(oblique > nadir, 'an oblique camera stands further off');
  assert.equal(Math.round(oblique / 1000), 958);
  /* The camera still ends up at the height the scene asked for. */
  assert.equal(
    Math.round((oblique * Math.sin((70 * Math.PI) / 180)) / 1000),
    900,
  );

  // A pitch at the horizon would put the camera at infinite range.
  assert.ok(Number.isFinite(cameraRangeMetres({ altKm: 10, pitch: 0 })));
  assert.ok(Number.isFinite(cameraRangeMetres({ altKm: 10, pitch: -0.0001 })));
  assert.equal(
    cameraRangeMetres({ altKm: 10, pitch: -1 }),
    cameraRangeMetres({ altKm: 10, pitch: -5 }),
    'anything flatter than five degrees is clamped to five',
  );
});

/* ------------------------------------------------------------------ *
 * District choropleths — scenes 06, 07 and 12
 * ------------------------------------------------------------------ */

function fakeDistricts(names) {
  return names.map((name) => ({
    properties: {
      district: name,
      districtKey: name.toLowerCase(),
      centroid: [85, 28],
    },
    geometry: { type: 'Polygon', coordinates: [[[85, 28], [86, 28], [86, 29], [85, 28]]] },
  }));
}

test('a district nobody has a figure for is DRAWN, in grey, and says so', () => {
  /*
   * The most important behaviour in the file. A district that is simply
   * absent from the map reads as a district where nothing happened, and
   * Scene 12 exists to say those are not the same thing.
   */
  const districts = fakeDistricts(['Gorkha', 'Mustang']);
  const drawn = overlapDrawables(districts, [
    {
      district: 'Gorkha',
      districtKey: 'gorkha',
      population: 234076,
      exposedPercent: 100,
      maxMmi: 7.5,
    },
  ]);
  assert.equal(drawn.length, 2, 'both districts are drawn');
  const mustang = drawn.find((item) => item.district === 'Mustang');
  assert.equal(mustang.colour, DATA_GAP_GREY);
  assert.equal(mustang.grammar.chip, 'DATA GAP');
  assert.match(mustang.label, /no data/);
  assert.doesNotMatch(mustang.label, /no damage|undamaged|safe/i);

  const gorkha = drawn.find((item) => item.district === 'Gorkha');
  assert.equal(gorkha.colour, MMI_COLOURS[7.5]);
  assert.match(gorkha.label, /MMI 7\.5/);
  assert.match(gorkha.label, /100% of 234,076 people/);
});

test('the overlap map colours by MMI and fills by exposed share, both from the artefact', () => {
  const districts = fakeDistricts(['High', 'Low', 'Partial']);
  const drawn = overlapDrawables(districts, [
    { district: 'High', districtKey: 'high', population: 100, exposedPercent: 100, maxMmi: 8 },
    { district: 'Low', districtKey: 'low', population: 100, exposedPercent: 0, maxMmi: 4.5 },
    { district: 'Partial', districtKey: 'partial', population: 100, exposedPercent: 50, maxMmi: 6 },
  ]);
  const by = new Map(drawn.map((item) => [item.district, item]));
  assert.equal(by.get('High').colour, MMI_COLOURS[8]);
  assert.equal(by.get('Low').colour, MMI_COLOURS[4.5]);
  assert.equal(by.get('Partial').colour, MMI_COLOURS[6]);
  /* A 0%-exposed district is faint, never invisible: it is still a finding. */
  assert.ok(by.get('Low').fillOverride >= 0.12);
  assert.ok(by.get('Partial').fillOverride > by.get('Low').fillOverride);
  assert.ok(by.get('High').fillOverride > by.get('Partial').fillOverride);
  /* An off-ramp MMI snaps down to a level that exists, never to undefined. */
  const odd = overlapDrawables(fakeDistricts(['Odd']), [
    { district: 'Odd', districtKey: 'odd', population: 1, exposedPercent: 10, maxMmi: 6.9 },
  ]);
  assert.equal(odd[0].colour, MMI_COLOURS[6.5]);
});

test('zero infrastructure records is reported as no records, never as no damage', () => {
  const districts = fakeDistricts(['Sindhupalchok', 'Nuwakot', 'Manang']);
  const drawn = coverageDrawables(districts, {
    Sindhupalchok: 65,
    Nuwakot: 2,
  });
  const by = new Map(drawn.map((item) => [item.district, item]));

  assert.equal(by.get('Sindhupalchok').colour, COVERAGE_COLOURS.observed);
  assert.equal(by.get('Nuwakot').colour, COVERAGE_COLOURS.sparse);
  assert.equal(by.get('Manang').colour, COVERAGE_COLOURS.none);

  assert.equal(by.get('Manang').value, 0);
  assert.match(by.get('Manang').label, /no infrastructure records/);
  assert.match(by.get('Manang').label, /Not a finding of no damage/);
  assert.equal(by.get('Manang').grammar.chip, 'DATA GAP');
  for (const item of drawn) {
    assert.doesNotMatch(
      item.label,
      /undamaged|no damage here|intact|unaffected/i,
      `${item.district} implies a finding the survey cannot support`,
    );
  }
  assert.match(by.get('Nuwakot').label, /2 records/);
  assert.match(by.get('Sindhupalchok').label, /65 records/);
  /* Singular reads as English, because a label is language. */
  assert.match(coverageDrawables(fakeDistricts(['One']), { One: 1 })[0].label, /1 record$/);
});

test('records are summed across every kind of infrastructure the survey logged', () => {
  const totals = recordsByDistrict({
    blockedRoads: { byDistrict: [{ id: 'Rasuwa', count: 22 }, { id: 'Gorkha', count: 20 }] },
    bridges: { byDistrict: [{ id: 'Rasuwa', count: 3 }] },
    landslides: { byDistrict: [{ id: 'Gorkha', count: 7 }, { id: 'Nowhere' }] },
  });
  assert.equal(totals.Rasuwa, 25, 'a road and a bridge both mean somebody looked');
  assert.equal(totals.Gorkha, 27);
  assert.equal(totals.Nowhere, 0, 'a row with no count contributes nothing, not NaN');
  assert.deepEqual(recordsByDistrict(null), {});
  assert.deepEqual(recordsByDistrict({ empty: null }), {});
});

test('the descent emphasises one district without deleting the others', () => {
  const drawn = districtFocusDrawables(fakeDistricts(['Gorkha', 'Kathmandu']), {
    district: 'Gorkha',
  });
  assert.equal(drawn.length, 2);
  const by = new Map(drawn.map((item) => [item.district, item]));
  assert.equal(by.get('Gorkha').dimmed, false);
  assert.equal(by.get('Kathmandu').dimmed, true, 'context, not absence');
  assert.equal(by.get('Gorkha').grammar.chip, 'OFFICIAL');
  /* With nothing selected, nothing is dimmed. */
  for (const item of districtFocusDrawables(fakeDistricts(['A', 'B']), {})) {
    assert.equal(item.dimmed, false);
  }
});

/* ------------------------------------------------------------------ *
 * Scene 10 — Copernicus
 * ------------------------------------------------------------------ */

test('the heterogeneous grading vocabulary reduces to the states it means', () => {
  /*
   * Some AOIs suffix the EMS-98 grade and some do not. Treating those as
   * different categories would split the same finding in two.
   */
  assert.equal(gradingBucket('Completely Destroyed'), 'destroyed');
  assert.equal(gradingBucket('Completely Destroyed (EMS-98 grade 5)'), 'destroyed');
  assert.equal(gradingBucket('Negligible to slight damage'), 'slight');
  assert.equal(gradingBucket('Negligible to slight damage (EMS-98 grade 1)'), 'slight');
  assert.equal(gradingBucket('Not Affected'), 'unaffected');
  /* Everything the source could not say becomes one honest bucket. */
  for (const unknown of ['Unknown', 'Null', '', null, undefined, 'Not Applicable']) {
    assert.equal(gradingBucket(unknown), 'unknown', String(unknown));
  }
});

test('every grading point is drawn, and a stride never changes the reported total', () => {
  const grading = {
    encoding: 'columnar',
    count: 6,
    gradingValues: ['Completely Destroyed', 'Not Affected', 'Unknown'],
    aoiValues: ['KATHMANDU'],
    lon: [85, 85.1, 85.2, 85.3, 85.4, 85.5],
    lat: [27.7, 27.7, 27.7, 27.7, 27.7, 27.7],
    grading: [0, 1, 2, 0, 1, 2],
    aoi: [0, 0, 0, 0, 0, 0],
  };
  assert.equal(gradingDrawables(grading).length, 6, 'nothing is dropped by default');
  assert.equal(gradingDrawables(grading, { stride: 3 }).length, 2);
  /*
   * Performance is solved by simplifying RENDERING, never a reported figure.
   * `stride` thins the draw; the panel still quotes the full count.
   */
  assert.equal(gradingDrawables(grading, { buckets: ['destroyed'] }).length, 2);
  const unknown = gradingDrawables(grading, { buckets: ['unknown'] });
  assert.equal(unknown.length, 2);
  assert.equal(unknown[0].grammar.chip, 'DATA GAP', 'an ungraded point is a gap');
  assert.equal(
    gradingDrawables(grading, { buckets: ['destroyed'] })[0].grammar.chip,
    'OBSERVED',
  );
  assert.deepEqual(gradingDrawables(null), []);
  assert.deepEqual(gradingDrawables({ count: 0 }), []);
});

test('an area of interest is a statement about the survey, not about the ground', () => {
  const drawn = aoiDrawables([
    {
      properties: { aoi: 'KATHMANDU' },
      geometry: { type: 'Polygon', coordinates: [[[85, 27], [86, 27], [86, 28], [85, 27]]] },
    },
  ]);
  assert.equal(drawn.length, 1);
  assert.equal(drawn[0].label, 'KATHMANDU');
  /* Almost no fill: a solid footprint would read as a finding about buildings. */
  assert.ok(drawn[0].fillOverride <= 0.1);
  assert.deepEqual(aoiDrawables(null), []);
});

/* ------------------------------------------------------------------ *
 * Scene 15 — proximity
 * ------------------------------------------------------------------ */

test('proximity bands are a ruler in metres, not a buffer and not pixels', () => {
  const bands = [
    { withinMetres: 500, people: 169387 },
    { withinMetres: 10_000, people: 2644051 },
  ];
  const drawn = proximityRingDrawables(bands, { lon: 85.3, lat: 27.7 });
  assert.equal(drawn.length, 2);
  /*
   * Metres, so the ring scales with the map. A pixel radius would mean the
   * 10 km ring covered ten kilometres at one altitude and a hundred at
   * another, which is worse than not drawing it.
   */
  assert.equal(drawn[0].radiusMetres, 500);
  assert.equal(drawn[1].radiusMetres, 10_000);
  assert.equal(drawn[0].fillOverride, 0, 'unfilled: it is a distance, not an area');
  assert.match(drawn[0].label, /500 m from an observed damage point/);
  assert.match(drawn[1].label, /10 km from an observed damage point/);
  /* The count rides along for the panel; the ring itself claims no footprint. */
  assert.equal(drawn[1].value, 2644051);
  /* No anchor means no rings, rather than rings at 0,0. */
  assert.deepEqual(proximityRingDrawables(bands, {}), []);
  assert.deepEqual(proximityRingDrawables(bands, { lon: Number.NaN, lat: 1 }), []);
});
