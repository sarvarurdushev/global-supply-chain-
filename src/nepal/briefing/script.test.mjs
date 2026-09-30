import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCRIPT_PATH, currentScript } from '../../../scripts/generate-briefing-script.mjs';

test('the committed briefing script is what the timeline and artefacts produce', () => {
  /*
   * A script edited by hand, or a scene changed without regenerating, is a
   * document that no longer describes the product.
   */
  assert.equal(readFileSync(SCRIPT_PATH, 'utf8'), currentScript(), 'run node scripts/generate-briefing-script.mjs');
});

test('the script carries every column the brief asks for, and no unresolved figure', () => {
  const text = currentScript();
  for (const heading of ['**NARRATION**', '**CAPTION**', '**CAMERA**', '**MAP**', '**ANNOTATION**', '**CHART**', '**SOUND**', '**EVIDENCE**', '**CLASS**']) {
    assert.ok(text.includes(heading), `missing ${heading}`);
  }
  assert.doesNotMatch(text, /undefined|NaN|\{[a-z]+\.[a-zA-Z.]+(\|[a-zA-Z0-9]+)?\}/);
});
