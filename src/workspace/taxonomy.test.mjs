import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCENE_NAMES,
  LAYER_NAMES,
  CONTROL_NAMES,
  GLOSSARY,
  LEGEND,
  DATA_CLASS_PRESENTATION,
  sceneName,
  layerName,
  controlName,
  glossary,
  dataClassPresentation,
} from './taxonomy.js';
import { SCENE_RECIPES } from '../scenes/recipes.js';

/* ---------------- the renames must actually reach the app ----------------
 *
 * A rename that lives only in this file is worse than no rename: the docs say
 * one thing and the screen says another.
 */

test('every shipped scene has a plain-language name', () => {
  for (const recipe of SCENE_RECIPES) {
    assert.ok(
      sceneName(recipe.id),
      `recipe "${recipe.id}" (${recipe.title}) has no entry in SCENE_NAMES`,
    );
  }
});

test('every renamed scene points at a recipe that exists', () => {
  const ids = new Set(SCENE_RECIPES.map((r) => r.id));
  for (const entry of SCENE_NAMES) {
    assert.ok(ids.has(entry.id), `SCENE_NAMES has orphan id "${entry.id}"`);
  }
});

test('no scene name is left in the inherited vocabulary', () => {
  // The exact labels the user could not interpret.
  const rejected = [
    /^Orbital Watch$/,
    /^Thermal Threat Board$/,
    /^City Overload$/,
    /^Omniscience Pullback$/,
    /^Global Flights Radar$/,
  ];
  for (const entry of SCENE_NAMES) {
    for (const pattern of rejected) {
      assert.ok(
        !pattern.test(entry.name),
        `"${entry.name}" is still the old label`,
      );
    }
  }
});

test('every scene says what it investigates', () => {
  for (const entry of SCENE_NAMES) {
    assert.ok(entry.summary?.length > 10, `${entry.id} has no summary`);
    assert.ok(
      entry.investigates?.length > 10,
      `${entry.id} does not say what it investigates`,
    );
  }
});

test('a scene keeps its old name as a subtitle where one existed', () => {
  // So a returning user is not stranded by the rename.
  const orbital = sceneName('orbital-watch');
  assert.equal(orbital.name, 'Satellite Tracking');
  assert.equal(orbital.formerly, 'Orbital Watch');
});

test('sceneName returns null for an unknown id', () => {
  assert.equal(sceneName('nope'), null);
  assert.equal(sceneName(undefined), null);
});

/* ---------------- layers ---------------- */

test('every layer entry has a name, a summary and an availability flag', () => {
  for (const entry of LAYER_NAMES) {
    assert.ok(entry.name?.length > 2, `${entry.id} has no name`);
    assert.ok(entry.summary?.length > 10, `${entry.id} has no summary`);
    assert.equal(typeof entry.available, 'boolean', `${entry.id} availability`);
  }
});

test('an unavailable layer explains what is missing', () => {
  // Requirement 42: never imply a gap is an oversight, and never fake past it.
  const gaps = LAYER_NAMES.filter((entry) => !entry.available);
  assert.ok(gaps.length >= 4, 'the known gaps should be listed, not hidden');
  for (const entry of gaps) {
    assert.ok(
      entry.missing?.length > 30,
      `${entry.id} is unavailable but does not say why`,
    );
  }
});

test('a layer whose name overstates its data carries a caveat', () => {
  // "City Transit" must not be mistaken for freight rail, and "Trade Flows"
  // must not be mistaken for live.
  assert.match(layerName('transit').caveat, /not freight rail/i);
  assert.match(layerName('traffic').caveat, /City-scale/i);
  assert.match(layerName('trade-flows').caveat, /Never live/i);
  assert.match(layerName('supply-events').caveat, /not evidence/i);
});

test('layerName returns null for an unknown id', () => {
  assert.equal(layerName('nope'), null);
});

/* ---------------- controls ---------------- */

test('no control is left as a bare verb', () => {
  // "Start", "Export", "Import", "Run Log" — each needs an object.
  const bare = new Set(['start', 'stop', 'export', 'import', 'next', 'prev']);
  for (const [key, entry] of Object.entries(CONTROL_NAMES)) {
    const words = entry.name.trim().split(/\s+/);
    if (words.length === 1) {
      assert.ok(
        !bare.has(entry.name.toLowerCase()) || entry.name === 'Stop',
        `control "${key}" is still the bare verb "${entry.name}"`,
      );
    }
  }
});

test('the specific labels the user could not interpret are all renamed', () => {
  assert.equal(controlName('runLog'), 'Playback Report');
  assert.equal(controlName('exportPresets'), 'Save Investigation…');
  assert.equal(controlName('importPresets'), 'Open Saved Investigation…');
  assert.equal(controlName('editDetails'), 'Rename Investigation');
  assert.equal(controlName('shareScene'), 'Copy Shareable Link');
  assert.equal(controlName('start'), 'Play Investigation');
  assert.equal(controlName('investigate'), 'Show Trade Flows');
});

test('controlName falls back to the key rather than throwing', () => {
  assert.equal(controlName('unheard-of'), 'unheard-of');
});

test('the controls the inherited director lacked are defined', () => {
  // Requirement: the user must be able to stop at any moment.
  for (const key of ['pause', 'restart', 'previous', 'resetView', 'stopTracking']) {
    assert.ok(CONTROL_NAMES[key], `missing control: ${key}`);
  }
});

/* ---------------- glossary ---------------- */

test('every glossary entry is one readable sentence', () => {
  for (const [key, entry] of Object.entries(GLOSSARY)) {
    assert.ok(entry.term?.length > 2, `${key} has no term`);
    assert.ok(entry.short?.length > 20, `${key} has no definition`);
    assert.ok(
      entry.short.length < 200,
      `${key} definition is too long to be read in a tooltip (${entry.short.length} chars)`,
    );
  }
});

test('the terms a new user would stumble on are all covered', () => {
  for (const term of [
    'chokepoint',
    'trade route',
    'supply dependency',
    'HHI',
    'mirror statistics',
    'aggregate code',
    'TEU',
    'HS code',
  ]) {
    assert.ok(glossary(term), `no glossary entry for "${term}"`);
  }
});

test('glossary lookup is case and whitespace tolerant', () => {
  assert.equal(glossary('  CHOKEPOINT '), GLOSSARY.chokepoint);
  assert.equal(glossary('Hhi'), GLOSSARY.hhi);
  assert.equal(glossary('not a term'), null);
  assert.equal(glossary(null), null);
});

/* ---------------- legend ---------------- */

test('the legend defines a mark and a colour for every symbol', () => {
  for (const group of LEGEND) {
    assert.ok(group.group?.length > 2);
    assert.ok(group.entries.length > 0);
    for (const entry of group.entries) {
      assert.ok(entry.mark?.length >= 1, `${group.group} entry has no mark`);
      assert.ok(entry.label?.length > 2, `${group.group} entry has no label`);
      assert.match(entry.swatch, /^#[0-9a-f]{6}$/i, `${entry.label} swatch`);
    }
  }
});

test('the legend explains the data classes, not just the shapes', () => {
  const group = LEGEND.find((g) => /how sure/i.test(g.group));
  assert.ok(group, 'the legend must say how certain each mark is');
  const labels = group.entries.map((e) => e.label).join(' ');
  for (const cls of ['LIVE', 'HISTORICAL', 'INFERRED', 'SIMULATED', 'UNAVAILABLE']) {
    assert.match(labels, new RegExp(cls));
  }
});

/* ---------------- data classes ---------------- */

test('every data class has a plain-English reading', () => {
  for (const [key, entry] of Object.entries(DATA_CLASS_PRESENTATION)) {
    assert.ok(entry.plain?.length > 4, `${key} has no plain reading`);
    assert.ok(entry.means?.length > 20, `${key} does not say what it means`);
    assert.match(entry.colour, /^#[0-9a-f]{6}$/i);
  }
});

test('an unknown data class degrades to UNAVAILABLE, never to a guess', () => {
  assert.equal(dataClassPresentation('NONSENSE').label, 'UNAVAILABLE');
  assert.equal(dataClassPresentation(undefined).label, 'UNAVAILABLE');
  assert.equal(dataClassPresentation('LIVE').label, 'LIVE');
});
