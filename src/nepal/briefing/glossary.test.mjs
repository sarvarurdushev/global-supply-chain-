import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLOSSARY, GLOSSARY_ORDER } from './glossary.js';
import { BRIEFING_SCENES } from './scenes/index.js';
import { GLOSSARY_PATH, renderGlossary } from '../../../scripts/generate-briefing-glossary.mjs';

test('every term has both layers, and the order lists each term once', () => {
  assert.deepEqual([...GLOSSARY_ORDER].sort(), Object.keys(GLOSSARY).sort());
  for (const [key, term] of Object.entries(GLOSSARY)) {
    assert.ok(term.term && term.plain && term.detail, key);
    assert.ok(term.plain.length <= 220, `${key}: the plain meaning is one short line`);
  }
});

test('every term a scene explains is in the glossary', () => {
  for (const scene of BRIEFING_SCENES)
    for (const beat of scene.beats)
      for (const action of beat.actions)
        if (action.type === 'term.show') assert.ok(GLOSSARY[action.term], `${scene.id}:${beat.id} ${action.term}`);
});

test('the committed glossary document is what the glossary module produces', () => {
  assert.equal(readFileSync(GLOSSARY_PATH, 'utf8'), renderGlossary(), 'run node scripts/generate-briefing-glossary.mjs');
});
