import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BRIEFING_SCENES } from './index.js';
import { RUNS, estimateRun, lintTimeline, planRun } from '../timeline.js';
import { createFactBook, fillTemplate } from '../facts.js';

const load = (name) =>
  JSON.parse(readFileSync(new URL(`../../../../data/analysis/${name}`, import.meta.url), 'utf8'));
const book = createFactBook({
  seismic: load('nepal-2015-seismic-analysis.json'),
  exposure: load('nepal-2015-population-exposure.json'),
  damage: load('nepal-2015-damage-analysis.json'),
  infrastructure: load('nepal-2015-infrastructure-analysis.json'),
  damagePopulation: load('nepal-2015-damage-population.json'),
  geometry: load('nepal-2015-briefing-geometry.json'),
  access: load('nepal-2015-health-access.json'),
});

/** A `{ fact, path }` reference, resolved the way the stage resolves it. */
const factAt = ({ fact, path = [] }) => path.reduce((value, key) => value?.[key], book.value(fact));

test('every scene passes the pacing and phrasing lint', () => {
  assert.deepEqual(lintTimeline(BRIEFING_SCENES), []);
});

test('every template in every scene resolves against the artefacts', () => {
  const texts = [];
  for (const scene of BRIEFING_SCENES) {
    for (const beat of scene.beats) {
      texts.push(beat.caption, beat.narration);
      for (const action of beat.actions) {
        texts.push(action.title, action.label, action.text, ...(action.lines ?? []).map((l) => (typeof l === 'string' ? l : l.text)));
        for (const row of action.rows ?? []) texts.push(row.label, row.sub);
        if (action.fact) assert.doesNotThrow(() => book.get(action.fact), `${scene.id}:${beat.id} fact ${action.fact}`);
        /* Places and routes read from facts must exist and be the right shape. */
        for (const ref of [action.anchor, action.to].filter((r) => r?.fact)) {
          /* As the stage reads it: an object with lon/lat, or a [lon, lat] pair. */
          const found = factAt(ref);
          const at = Array.isArray(found) ? { lon: found[0], lat: found[1] } : found;
          assert.ok(Number.isFinite(at?.lon) && Number.isFinite(at?.lat), `${scene.id}:${beat.id} ${ref.fact}.${ref.path} is not a place`);
        }
        if (action.line?.fact) {
          const line = factAt(action.line);
          assert.ok(Array.isArray(line) && line.length > 1, `${scene.id}:${beat.id} ${action.line.fact}.${action.line.path} is not a line`);
        }
      }
    }
  }
  for (const text of texts.filter(Boolean)) {
    assert.doesNotThrow(() => fillTemplate(text, book), text);
    assert.doesNotMatch(fillTemplate(text, book), /undefined|NaN/, text);
  }
});

test('no number is typed into a caption or narration line', () => {
  for (const scene of BRIEFING_SCENES) {
    for (const beat of scene.beats) {
      for (const text of [beat.caption, beat.narration]) {
        const bare = String(text ?? '').replace(/\{[^}]+\}/g, '');
        /* Scale labels (Mercalli six, seven and a half) are words; a digit outside a template is a typed figure. */
        assert.doesNotMatch(bare, /\d/, `${scene.id}:${beat.id} types a figure: "${text}"`);
      }
    }
  }
});

test('each run is shorter than the next and plays in storyboard order', () => {
  const lengths = [RUNS.THREE, RUNS.SIX, RUNS.FULL].map((run) => estimateRun(planRun(BRIEFING_SCENES, run)).totalMs);
  assert.ok(lengths[0] < lengths[1] && lengths[1] <= lengths[2], lengths.join(' < '));
  const numbers = planRun(BRIEFING_SCENES, RUNS.FULL).map((entry) => entry.scene.number);
  assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b));
});
