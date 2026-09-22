import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DAMAGE_COLOURS,
  MMI_COLOURS,
  cameraRangeMetres,
  damageDrawables,
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
