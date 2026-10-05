#!/usr/bin/env node
/**
 * qa-briefing-sync — Stage 9.2: when the voice says a figure, is the picture
 * already showing it? Timed by the RENDERED voice, not an estimate: each
 * sentence starts where the previous clip ended, and a word inside a sentence
 * is placed by its share of the sentence's characters.
 *
 *   node scripts/qa-briefing-sync.mjs [--run six|three|full] [--voice af_heart]
 *
 * Prints a markdown table (beat, figure, said at, shown at, verdict) and
 * exits 1 if any figure is said more than 1.5 s before anything shows it.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fillTemplate } from '../src/nepal/briefing/facts.js';
import { BRIEFING_SCENES } from '../src/nepal/briefing/scenes/index.js';
import { clipKey, sentencePlan } from '../src/nepal/briefing/speech.js';
import { figureCues } from '../src/nepal/briefing/sync.js';
import { planRun } from '../src/nepal/briefing/timeline.js';
import { loadBriefingBook } from './generate-briefing-script.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const run = arg('--run', 'six');
const voice = arg('--voice', 'af_heart');
const book = loadBriefingBook();
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'public', 'audio', 'narration', 'manifest.json'), 'utf8'));

/** ms into the beat at which the narration reaches `prefix` (template text), by the rendered clips. */
function clipTimer(beat) {
  const full = fillTemplate(beat.narration, book);
  const sentences = sentencePlan(full, beat.prosody).map((s) => ({
    ...s,
    ms: manifest.clips[clipKey(voice, s)] ?? null,
  }));
  return (prefix) => {
    const reached = fillTemplate(prefix, book).length;
    let offset = 0;
    let t = 0;
    for (const s of sentences) {
      const at = full.indexOf(s.text, offset);
      const end = at + s.text.length;
      if (s.ms === null) return NaN;
      if (reached <= end) {
        const speech = s.ms - s.pauseBefore - s.pauseAfter;
        return t + s.pauseBefore + (Math.max(0, reached - at) / s.text.length) * speech;
      }
      t += s.ms;
      offset = end;
    }
    return t;
  };
}

const rows = [];
for (const entry of planRun(BRIEFING_SCENES, run)) {
  const index = entry.scene.beats.indexOf(entry.beat);
  for (const cue of figureCues(entry.scene, index, clipTimer(entry.beat))) {
    const verdict = cue.shownAt === null
      ? 'FAIL (never shown)'
      : !Number.isFinite(cue.spokenAt)
        ? 'NO CLIP'
        : cue.shownAt <= cue.spokenAt
          ? 'PASS'
          : cue.shownAt - cue.spokenAt <= 1500
            ? 'PASS (≤ 1.5 s after)'
            : 'FAIL (late)';
    rows.push({ key: entry.key, ...cue, verdict });
  }
}
const s = (ms) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`);
console.log(`| Beat | Figure said | Said at | First shown | Verdict |`);
console.log(`| --- | --- | ---: | ---: | --- |`);
for (const r of rows)
  console.log(`| ${r.key} | \`${r.template}\` | ${s(r.spokenAt)} | ${r.shownAt === 0 ? 'already on screen' : s(r.shownAt)} | ${r.verdict} |`);
const failed = rows.filter((r) => r.verdict.startsWith('FAIL'));
console.log(`\n${rows.length} figures said in the ${run} run; ${failed.length} late.`);
process.exit(failed.length ? 1 : 0);
