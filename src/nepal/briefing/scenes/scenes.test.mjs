import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BRIEFING_SCENES } from './index.js';
import {
  RUNS,
  estimateRun,
  lintTimeline,
  narrationMs,
  planRun,
} from '../timeline.js';
import { createFactBook, fillTemplate } from '../facts.js';
import { MUSIC_CUES } from '../music.js';

const load = (name) =>
  JSON.parse(
    readFileSync(
      new URL(`../../../../data/analysis/${name}`, import.meta.url),
      'utf8',
    ),
  );
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
const factAt = ({ fact, path = [] }) =>
  path.reduce((value, key) => value?.[key], book.value(fact));

test('every scene passes the pacing and phrasing lint', () => {
  assert.deepEqual(lintTimeline(BRIEFING_SCENES), []);
});

test('every technical note resolves against the artefacts', () => {
  for (const scene of BRIEFING_SCENES)
    for (const note of [
      scene.technical,
      ...scene.beats.map((beat) => beat.technical),
    ].filter(Boolean))
      assert.doesNotThrow(() => fillTemplate(note, book), scene.id);
});

test('the six musical cues are played once each, at their moments, and nowhere else', () => {
  const cues = new Map();
  for (const scene of BRIEFING_SCENES)
    for (const beat of scene.beats)
      for (const action of beat.actions)
        if (action.type === 'audio.cue' && MUSIC_CUES[action.cue])
          cues.set(action.cue, [...(cues.get(action.cue) ?? []), `${scene.number}:${beat.id}`]);
  assert.deepEqual(Object.fromEntries(cues), {
    impact: ['4:magnitude'],
    aftershock: ['8:second'],
    damage: ['13:destroyed'],
    gap: ['20:unrecorded'],
    disconnect: ['32:result'],
    close: ['40:close'],
  });
});

test('every template in every scene resolves against the artefacts', () => {
  const texts = [];
  for (const scene of BRIEFING_SCENES) {
    for (const beat of scene.beats) {
      texts.push(beat.caption, beat.narration);
      for (const action of beat.actions) {
        texts.push(
          action.title,
          action.label,
          action.text,
          ...(action.lines ?? []).map((l) =>
            typeof l === 'string' ? l : l.text,
          ),
        );
        for (const row of action.rows ?? []) texts.push(row.label, row.sub);
        if (action.fact)
          assert.doesNotThrow(
            () => book.get(action.fact),
            `${scene.id}:${beat.id} fact ${action.fact}`,
          );
        /* A chart's rows and a highlight's keys are read from facts too: a list, or a {name: count} map for rows. */
        for (const ref of [action.rowsFrom, action.keysFrom].filter(
          (r) => r?.fact,
        )) {
          assert.doesNotThrow(
            () => book.get(ref.fact),
            `${scene.id}:${beat.id} fact ${ref.fact}`,
          );
          const found = factAt(ref);
          assert.ok(
            Array.isArray(found) ||
              (ref === action.rowsFrom && found && typeof found === 'object'),
            `${scene.id}:${beat.id} ${ref.fact} is not rows`,
          );
        }
        /* Places and routes read from facts must exist and be the right shape. */
        for (const ref of [action.anchor, action.to].filter((r) => r?.fact)) {
          /* As the stage reads it: an object with lon/lat or longitude/latitude, or a [lon, lat] pair. */
          const found = factAt(ref);
          const at = Array.isArray(found)
            ? { lon: found[0], lat: found[1] }
            : Number.isFinite(found?.longitude)
              ? { lon: found.longitude, lat: found.latitude }
              : found;
          assert.ok(
            Number.isFinite(at?.lon) && Number.isFinite(at?.lat),
            `${scene.id}:${beat.id} ${ref.fact}.${ref.path} is not a place`,
          );
        }
        if (action.line?.fact) {
          const line = factAt(action.line);
          assert.ok(
            Array.isArray(line) && line.length > 1,
            `${scene.id}:${beat.id} ${action.line.fact}.${action.line.path} is not a line`,
          );
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
        assert.doesNotMatch(
          bare,
          /\d/,
          `${scene.id}:${beat.id} types a figure: "${text}"`,
        );
      }
    }
  }
});

test('narration never uses a display-only format: capitals and symbols are read out oddly', () => {
  /* `list` gives "GORKHA · DHADING"; some voices spell capitals letter by letter. Narration uses `names`. */
  const DISPLAY =
    /\{[^}|]+\|(list|upper|mega2|kilo|pct1|dateShort|utcTime|kmFromMetres|shareToPct)\}/;
  for (const scene of BRIEFING_SCENES)
    for (const beat of scene.beats)
      assert.doesNotMatch(
        beat.narration ?? '',
        DISPLAY,
        `${scene.id}:${beat.id}`,
      );
});

test('when the voice says a figure, the map or a chart is already showing it', () => {
  /*
   * Picture and word in sync: for every figure a narration line speaks, some
   * action — a count, a card, a callout, a label, a chart or a layer drawing
   * that figure — must have started by the time the word is reached (with
   * 1.5 s of grace). The caption does not count: it always carries the figure.
   */
  const VISUALISES = {
    'chart:composition': [
      'damage.total',
      'damage.destroyed',
      'damage.severe',
      'damage.moderate',
      'damage.possible',
      'damage.shareDestroyed',
      'damage.shareSevere',
      'damage.shareModerate',
      'damage.sharePossible',
    ],
    'chart:intensity': ['damage.byIntensity', 'damage.independence'],
    'chart:ranks': ['access.pressure', 'access.stableTop'],
    'layer:district-routes': ['infra.routes'],
  };
  const factOf = (template) =>
    template.slice(1, -1).split('|')[0].split('.').slice(0, 2).join('.');
  const shownIn = (a) =>
    [
      a.title,
      a.text,
      a.label,
      ...(a.lines ?? []).map((l) => (typeof l === 'string' ? l : l.text)),
      a.fact,
      a.anchor?.fact,
      a.to?.fact,
      a.line?.fact,
      a.keysFrom?.fact,
      a.rowsFrom?.fact,
      /* The clock card's ruler marks its ticks from the moment it appears. */
      ...(a.ticks ?? []).map((t) => t.day?.fact),
      ...(VISUALISES[`chart:${a.chart}`] ?? []),
      ...(VISUALISES[`layer:${a.layer}`] ?? []),
    ]
      .filter(Boolean)
      .map(String);
  const late = [];
  for (const scene of BRIEFING_SCENES) {
    scene.beats.forEach((beat, index) => {
      const earlier = [
        ...(scene.setup ?? []),
        ...scene.beats.slice(0, index).flatMap((b) => b.actions),
      ].map((a) => ({ ...a, at: 0 }));
      const words = String(beat.narration ?? '').split(/\s+/);
      words.forEach((word, i) => {
        const template = word.match(/\{[^}]+\}/)?.[0];
        if (!template) return;
        const fact = factOf(template);
        if (fact.startsWith('access.params')) return;
        const spokenAt =
          (beat.narrationAt ?? 0) + narrationMs(words.slice(0, i).join(' '));
        const starts = [...earlier, ...beat.actions]
          .filter(
            (a) =>
              a.type !== 'audio.cue' &&
              shownIn(a).some((t) => t.includes(fact)),
          )
          .map((a) => a.at ?? 0);
        if (!starts.length || Math.min(...starts) > spokenAt + 1500)
          late.push(`${scene.id}:${beat.id} ${fact}`);
      });
    });
  }
  assert.deepEqual(late, []);
});

test('each run is shorter than the next and plays in storyboard order', () => {
  const lengths = [RUNS.THREE, RUNS.SIX, RUNS.FULL].map(
    (run) => estimateRun(planRun(BRIEFING_SCENES, run)).totalMs,
  );
  assert.ok(
    lengths[0] < lengths[1] && lengths[1] <= lengths[2],
    lengths.join(' < '),
  );
  const numbers = planRun(BRIEFING_SCENES, RUNS.FULL).map(
    (entry) => entry.scene.number,
  );
  assert.deepEqual(
    numbers,
    [...numbers].sort((a, b) => a - b),
  );
});
