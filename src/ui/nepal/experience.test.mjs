import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installTestDom } from '../../workspace/testDom.mjs';

installTestDom();

const { createNepalExperience } = await import('./experience.js');
const { SCENES } = await import('../../nepal/story/scenes.js');
const { ANALYSIS_BASE } = await import('../../nepal/story/loader.js');

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** A fetch reading the real committed artefacts, with optional failures. */
function diskFetch({ fail = new Set() } = {}) {
  return async (url) => {
    const name = url.split('/').pop();
    if (fail.has(name)) return { ok: false, status: 503, json: async () => ({}) };
    const dir = url.startsWith(ANALYSIS_BASE) ? 'analysis' : 'processed';
    const text = await readFile(path.join(ROOT, 'data', dir, name), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
  };
}

/** A map renderer that records instead of drawing. */
function recordingLayers() {
  const renders = [];
  const flights = [];
  return {
    renders,
    flights,
    render: (grouped) => renders.push(grouped),
    flyTo: (pose) => flights.push(pose),
    destroy: () => {},
  };
}

function mountPoint() {
  return document.createElement('div');
}

test('starting loads the evidence and paints all three zones', async () => {
  const mount = mountPoint();
  const layers = recordingLayers();
  const experience = createNepalExperience({
    mount,
    caseLayers: layers,
    fetchImpl: diskFetch(),
  });
  // Before the evidence lands, it says so rather than showing nothing.
  assert.match(mount.textContent, /Loading the case evidence/);

  await experience.start();
  const text = mount.textContent;
  assert.match(text, /NATURAL DISASTER INTELLIGENCE/);
  assert.match(text, /CASE NPL-2015-EQ/);
  assert.match(text, /38\/38/, 'the header counts real checks');
  assert.match(text, /7\.8/, 'the case card states the magnitude');
  assert.ok(layers.flights.length > 0, 'the camera is placed on start');
  experience.destroy();
});

test('every scene can be reached, and each one draws and moves the camera', async () => {
  /*
   * This is the difference between "the component exists" and "the scene
   * works": every scene in the sequence is visited, its panel rendered from
   * the artefacts, its datasets fetched, and its camera pose recorded.
   */
  const mount = mountPoint();
  const layers = recordingLayers();
  const experience = createNepalExperience({
    mount,
    caseLayers: layers,
    fetchImpl: diskFetch(),
  });
  await experience.start();

  for (const entry of SCENES) {
    experience.goTo(entry.index);
    await experience.whenSceneReady();
    experience.render();
    const text = mount.textContent;
    assert.ok(text.includes(entry.question), `${entry.id} does not show its question`);
    assert.doesNotMatch(text, /could not resolve a figure/, `${entry.id} has an unresolved figure`);
  }
  /*
   * At least one flight per scene, and a few scenes take a second.
   *
   * Most camera targets are DATA-DERIVED — the mean of a solved route, the
   * centroid of 4,500 damage points — so a scene resolves differently before
   * and after its datasets land. The first flight leaves immediately, because
   * a still globe during a scene change reads as a broken one, and the camera
   * corrects itself once the data is in. Scene 14 framed the centre of Nepal
   * before this existed, with its route off the edge of the frame.
   */
  assert.ok(
    layers.flights.length >= SCENES.length,
    `${layers.flights.length} flights for ${SCENES.length} scenes`,
  );
  assert.ok(
    layers.flights.length <= SCENES.length * 2,
    'a scene must not fly more than twice: that would be the camera oscillating',
  );
  for (const flight of layers.flights) {
    assert.ok(Number.isFinite(flight.lon) && Number.isFinite(flight.lat), 'a real destination');
    assert.ok(flight.altKm > 0);
  }
  experience.destroy();
});

test('scenes that declare layers actually draw them', async () => {
  const mount = mountPoint();
  const layers = recordingLayers();
  const experience = createNepalExperience({
    mount,
    caseLayers: layers,
    fetchImpl: diskFetch(),
  });
  await experience.start();

  experience.goTo('earthquake');
  await experience.whenSceneReady();
  experience.render();
  const drawn = layers.renders[layers.renders.length - 1];
  assert.ok(drawn.has('seismic-events'), 'the earthquake scene must draw its events');
  assert.equal(drawn.get('seismic-events').length, 316);

  experience.goTo('shaking');
  await experience.whenSceneReady();
  experience.render();
  const bands = layers.renders[layers.renders.length - 1];
  assert.ok(bands.has('shakemap-bands'), 'the shaking scene must draw filled bands');
  assert.equal(bands.get('shakemap-bands').length, 8);
  // And the bands are modelled, so they must not carry the observed grammar.
  assert.equal(bands.get('shakemap-bands')[0].grammar.chip, 'MODELED');
  experience.destroy();
});

test('a dataset that fails to load costs its layer, not the analysis', async () => {
  /*
   * A blank screen because one of ten files 404ed would hide the analysis
   * behind a network error. The scene must still state its question, its
   * figures and its limitations, and name what is missing.
   */
  const mount = mountPoint();
  const layers = recordingLayers();
  const experience = createNepalExperience({
    mount,
    caseLayers: layers,
    fetchImpl: diskFetch({ fail: new Set(['nepal-2015-seismic.json']) }),
  });
  await experience.start();
  experience.goTo('earthquake');
  await experience.whenSceneReady();
  experience.render();

  const text = mount.textContent;
  assert.match(text, /Layer unavailable/);
  assert.match(text, /seismicEvents/);
  assert.match(text, /analysis above is unaffected/);
  // The figures are Tier 1 and still there.
  assert.match(text, /316/, 'the event count comes from the analysis, not the geometry');
  assert.ok(text.includes('Was this one earthquake, or many?'));
  experience.destroy();
});

test('Tier 1 failing is reported rather than leaving a blank application', async () => {
  const mount = mountPoint();
  const experience = createNepalExperience({
    mount,
    caseLayers: recordingLayers(),
    fetchImpl: diskFetch({ fail: new Set(['nepal-2015-damage-analysis.json']) }),
  });
  await assert.rejects(experience.start(), /HTTP 503/);
  // And the shell is still on screen saying it is loading, not an empty page.
  assert.match(mount.textContent, /Loading the case evidence/);
  experience.destroy();
});

test('the rail navigates and the mode switch changes who is driving', async () => {
  const mount = mountPoint();
  const experience = createNepalExperience({
    mount,
    caseLayers: recordingLayers(),
    fetchImpl: diskFetch(),
  });
  await experience.start();

  const railButtons = mount
    .querySelectorAll('button')
    .filter((button) => button.dataset.scene !== undefined);
  assert.equal(railButtons.length, SCENES.length);
  railButtons[9].click();
  await experience.whenSceneReady();
  assert.equal(experience.investigation.state.scene.id, 'model-vs-observed');

  experience.setMode('PRESENT');
  experience.render();
  assert.equal(experience.investigation.state.mode, 'PRESENT');
  experience.destroy();
});

test('opening a methodology record emits it for the provenance panel', async () => {
  const mount = mountPoint();
  const experience = createNepalExperience({
    mount,
    caseLayers: recordingLayers(),
    fetchImpl: diskFetch(),
  });
  await experience.start();
  experience.goTo('model-vs-observed');
  await experience.whenSceneReady();
  experience.render();

  const received = [];
  experience.element.addEventListener('ndi:methodology', (event) => received.push(event.detail));
  const why = mount
    .querySelectorAll('button')
    .find((button) => button.textContent.includes('why is this here'));
  assert.ok(why);
  why.click();
  assert.equal(received.length, 1);
  assert.equal(received[0].id, 'damage-by-intensity');
  assert.ok(received[0].limitations.length > 0);
  experience.destroy();
});

test('a control that changes the answer re-solves it, not just the view', async () => {
  /*
   * Scene 18's bridge toggle asks a different question of the same graph.
   * Without re-solving, the chip moved, the state updated, and the line on
   * the map stayed exactly where it was — a scenario tool that agrees with
   * you whatever you pick.
   */
  const mount = mountPoint();
  const experience = createNepalExperience({
    mount,
    caseLayers: recordingLayers(),
    fetchImpl: diskFetch(),
  });
  await experience.start();
  experience.goTo('scenarios');
  await experience.whenSceneReady();

  const observed = experience.networkStatus();
  assert.equal(observed.route, 'Kathmandu → Nuwakot', 'the one detour pair');
  assert.ok(observed.damagedKm > observed.baselineKm, 'the closures lengthen it');

  experience.investigation.setControl('bridgeToggle', true);
  await experience.whenSceneReady();
  const scenario = experience.networkStatus();
  assert.notEqual(
    scenario.damagedKm,
    observed.damagedKm,
    'the scenario must produce a different answer',
  );
  /*
   * And the answer it produces is a real finding: the one bridge that matched
   * the network is not on this path, so removing it changes nothing here.
   */
  assert.equal(scenario.damagedKm, scenario.baselineKm);
  /* A scenario has no published figure to check against, so none is claimed. */
  assert.deepEqual(scenario.problems, []);
  experience.destroy();
});
