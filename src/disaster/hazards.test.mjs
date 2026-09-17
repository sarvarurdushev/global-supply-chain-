import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADAPTER_STATUS,
  GEOMETRY_KIND,
  HAZARD_LIST,
  HAZARD_TYPES,
  INTENSITY_SCALES,
  TIMELINE_PHASES,
  allAdapters,
  classifyIntensity,
  geometriesFor,
  hazard,
  hazardForGdacsCode,
  phasesFor,
  scaleFor,
} from './hazards.js';

/* ------------------------------------------------------------------ *
 * The rule the registry exists to enforce (§3)
 * ------------------------------------------------------------------ */

test('no two hazard types share a visualisation', () => {
  /*
   * "Do NOT use the same visualisation for every disaster." A registry where
   * every type declared the same geometry kinds would satisfy the letter of
   * extensibility and none of the point.
   */
  const signatures = new Map();
  for (const type of HAZARD_LIST) {
    const signature = type.geometries
      .map((geo) => `${geo.kind}:${geo.id}`)
      .sort()
      .join('|');
    assert.ok(
      !signatures.has(signature),
      `${type.id} draws exactly the same thing as ${signatures.get(signature)}`,
    );
    signatures.set(signature, type.id);
  }
});

test('every hazard type declares what it draws and why', () => {
  for (const type of HAZARD_LIST) {
    assert.ok(type.name?.length > 2, `${type.id} has no name`);
    assert.ok(
      type.question?.includes('?'),
      `${type.id} does not state the question it answers`,
    );
    assert.ok(type.geometries.length >= 2, `${type.id} draws almost nothing`);
    assert.ok(
      type.secondaryHazards?.length > 0,
      `${type.id} names no secondary hazards, and those usually do the damage`,
    );
    for (const geo of type.geometries) {
      assert.ok(GEOMETRY_KIND[geo.kind], `${geo.id} has an unknown kind`);
      // The discipline from §11, applied to every layer and not only to 3D.
      assert.ok(
        geo.answers?.length > 20,
        `${type.id}/${geo.id} does not say which question it answers`,
      );
    }
  }
});

test('a hazard type declares only the timeline phases it really has', () => {
  /*
   * An earthquake has no forecast — it begins at T-0. A drought has no T+1
   * hour. A registry where every type carried all eleven phases would put
   * empty beats in every timeline.
   */
  const eq = phasesFor('earthquake').map((p) => p.key);
  assert.equal(eq[0], 'T-0', 'an earthquake cannot be forecast');
  assert.ok(!eq.includes('T-24h'));

  const cyclone = phasesFor('cyclone').map((p) => p.key);
  assert.ok(cyclone.includes('T-72h'), 'a cyclone is forecast for days');

  const drought = phasesFor('drought').map((p) => p.key);
  assert.ok(!drought.includes('T+1h'), 'a drought has no hour-scale onset');
  assert.ok(drought.includes('T+30d'));

  for (const type of HAZARD_LIST) {
    const phases = phasesFor(type.id);
    assert.ok(phases.length >= 4, `${type.id} has too few phases to investigate`);
    for (const phase of phases) {
      assert.ok(TIMELINE_PHASES[phase.key], `${phase.key} is not a known phase`);
      assert.ok(phase.heading?.length > 3);
    }
    // Phases must be in chronological order or the timeline runs backwards.
    const offsets = phases.map((p) => p.offsetHours);
    assert.deepEqual(
      offsets,
      [...offsets].sort((a, b) => a - b),
      `${type.id} phases are out of order`,
    );
  }
});

/* ------------------------------------------------------------------ *
 * Intensity scales
 * ------------------------------------------------------------------ */

test('intensity scales are published ones, with an authority named', () => {
  for (const scale of Object.values(INTENSITY_SCALES)) {
    assert.ok(scale.authority?.length > 2, `${scale.id} names no authority`);
    assert.ok(scale.reads?.length > 15, `${scale.id} does not say what it measures`);
    assert.ok(scale.bands.length >= 4, `${scale.id} has too few bands`);
    for (const band of scale.bands) {
      assert.match(band.colour, /^#[0-9a-f]{6}$/i, `${scale.id} band has no colour`);
      assert.ok(band.label?.length > 0);
    }
  }
});

test('the measured Kathmandu intensity classifies as severe', () => {
  // PAGER's measured value for Kathmandu in the 2015 Gorkha earthquake.
  const band = classifyIntensity('MMI', 7.89);
  assert.equal(band.label, 'VIII');
  assert.equal(band.name, 'Severe');
});

test('a descending scale classifies the right way round', () => {
  /*
   * SPI runs negative and worsens downwards, so a naive ascending search
   * would call an extreme drought "moderate". Detected from the band ordering
   * rather than special-cased by id.
   */
  // US Drought Monitor D1-D4 thresholds: -0.8, -1.3, -1.6, -2.0.
  assert.equal(classifyIntensity('SPI', -1.1).name, 'Moderate drought');
  assert.equal(classifyIntensity('SPI', -1.4).name, 'Severe drought');
  assert.equal(classifyIntensity('SPI', -1.8).name, 'Extreme drought');
  assert.equal(classifyIntensity('SPI', -2.6).name, 'Exceptional drought');
});

test('an unmeasured intensity is null, never the lowest band', () => {
  // "Not measured" and "low" are different findings.
  assert.equal(classifyIntensity('MMI', null), null);
  assert.equal(classifyIntensity('MMI', NaN), null);
  assert.equal(classifyIntensity('MMI', undefined), null);
  assert.equal(classifyIntensity('NOT_A_SCALE', 5), null);
});

test('every hazard type resolves its own scale', () => {
  for (const type of HAZARD_LIST) {
    assert.ok(scaleFor(type.id), `${type.id} has no resolvable intensity scale`);
  }
});

/* ------------------------------------------------------------------ *
 * Adapters (§20)
 * ------------------------------------------------------------------ */

test('an unwired adapter names its integration point instead of being hidden', () => {
  const planned = allAdapters().filter(
    (item) => item.status === ADAPTER_STATUS.PLANNED,
  );
  assert.ok(planned.length > 0, 'the honest set of gaps should not be empty');
  for (const item of planned) {
    assert.ok(
      item.note?.length > 20,
      `${item.id} is PLANNED but does not say what connecting it would take`,
    );
  }
});

test('every adapter says who publishes it and what it provides', () => {
  for (const item of allAdapters()) {
    assert.ok(item.source?.length > 3, `${item.id} names no publisher`);
    assert.ok(item.provides?.length > 10, `${item.id} does not say what it provides`);
    assert.ok(ADAPTER_STATUS[item.status], `${item.id} has an unknown status`);
    assert.ok(item.hazards.length > 0);
  }
});

test('the wired filter drops layers with no data behind them', () => {
  /*
   * A renderer asks for wired geometries only. The declaration stays in the
   * registry and reaches the Sources panel either way — what must not happen
   * is a layer drawing nothing while claiming to show something.
   */
  const all = geometriesFor('cyclone');
  const wired = geometriesFor('cyclone', { onlyWired: true });
  assert.ok(wired.length < all.length, 'cyclone has planned adapters');
  assert.ok(wired.length > 0, 'and at least one wired one');
  assert.ok(wired.every((geo) => geo.adapter !== 'surge-model'));

  // Earthquake is fully wired against USGS, so nothing is dropped.
  assert.equal(
    geometriesFor('earthquake', { onlyWired: true }).length,
    geometriesFor('earthquake').length,
  );
});

/* ------------------------------------------------------------------ *
 * Lookups
 * ------------------------------------------------------------------ */

test('GDACS codes map onto hazard types, and unknown codes stay null', () => {
  assert.equal(hazardForGdacsCode('EQ').id, 'earthquake');
  assert.equal(hazardForGdacsCode('FL').id, 'flood');
  assert.equal(hazardForGdacsCode('TC').id, 'cyclone');
  assert.equal(hazardForGdacsCode('WF').id, 'wildfire');
  assert.equal(hazardForGdacsCode('DR').id, 'drought');
  assert.equal(hazardForGdacsCode('VO').id, 'volcano');
  // Guessing at the nearest match would put a tornado under "severe storm"
  // and silently mislabel the event.
  assert.equal(hazardForGdacsCode('XX'), null);
  assert.equal(hazardForGdacsCode(null), null);
});

test('the twelve hazard types the brief lists are all present', () => {
  for (const id of [
    'earthquake',
    'flood',
    'cyclone',
    'tsunami',
    'volcano',
    'wildfire',
    'landslide',
    'drought',
    'extremeHeat',
    'tornado',
    'avalanche',
    'severeStorm',
  ]) {
    assert.ok(hazard(id), `${id} is missing from the registry`);
    assert.equal(HAZARD_TYPES[id].id, id);
  }
  assert.equal(hazard('not-a-hazard'), null);
});

test('at least one hazard needs terrain to answer its question', () => {
  // §11: 3D has to earn its place. The registry is where that is declared.
  const terrainLayers = HAZARD_LIST.flatMap((type) =>
    type.geometries.filter((geo) => geo.requiresTerrain),
  );
  assert.ok(terrainLayers.length >= 5);
  for (const geo of terrainLayers) {
    assert.ok(
      /terrain|elevation|slope|depth|coastal|valley|shade|gradient|mountain|slide|downslope|runout/i.test(
        geo.answers,
      ),
      `${geo.id} asks for terrain without saying what terrain explains`,
    );
  }
});
