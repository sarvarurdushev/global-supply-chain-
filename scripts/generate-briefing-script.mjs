#!/usr/bin/env node
/**
 * Writes docs/NEPAL_2015_EXECUTIVE_BRIEFING_SCRIPT.md from the briefing
 * timeline and the analysis artefacts. `--check` exits non-zero if the
 * committed script is out of date instead of writing it.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createFactBook, fillTemplate } from '../src/nepal/briefing/facts.js';
import { manifestMeasure } from '../src/nepal/briefing/speech.js';
import { setNarrationMeasure } from '../src/nepal/briefing/timeline.js';
import { BRIEFING_SCENES } from '../src/nepal/briefing/scenes/index.js';
import { renderBriefingScript } from '../src/nepal/briefing/script.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const SCRIPT_PATH = path.join(ROOT, 'docs', 'NEPAL_2015_EXECUTIVE_BRIEFING_SCRIPT.md');

/** The artefacts the briefing reads, keyed as the fact registry names them. */
export function loadBriefingBook() {
  const load = (name) => JSON.parse(readFileSync(path.join(ROOT, 'data', 'analysis', name), 'utf8'));
  return createFactBook({
    seismic: load('nepal-2015-seismic-analysis.json'),
    exposure: load('nepal-2015-population-exposure.json'),
    damage: load('nepal-2015-damage-analysis.json'),
    infrastructure: load('nepal-2015-infrastructure-analysis.json'),
    damagePopulation: load('nepal-2015-damage-population.json'),
    geometry: load('nepal-2015-briefing-geometry.json'),
    access: load('nepal-2015-health-access.json'),
  });
}

const MANIFEST_PATH = path.join(ROOT, 'public', 'audio', 'narration', 'manifest.json');

/**
 * Time the script by the shipped voice: each beat lasts as long as the
 * default neural voice's clips for it, the way the briefing will play it.
 * Without the manifest (or for a line not yet rendered) the estimate stands.
 */
export function useShippedVoice(book) {
  if (!existsSync(MANIFEST_PATH)) return null;
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const voice = manifest.voices.find((v) => v.default) ?? manifest.voices[0];
  setNarrationMeasure(manifestMeasure(manifest, voice.id, (text) => fillTemplate(text, book)));
  return voice;
}

export function currentScript() {
  const book = loadBriefingBook();
  const voice = useShippedVoice(book);
  try {
    return renderBriefingScript(book, BRIEFING_SCENES, { voice });
  } finally {
    setNarrationMeasure(null);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = currentScript();
  if (process.argv.includes('--check')) {
    const committed = readFileSync(SCRIPT_PATH, 'utf8');
    if (committed !== text) {
      console.error(`${path.relative(ROOT, SCRIPT_PATH)} is out of date: run node scripts/generate-briefing-script.mjs`);
      process.exit(1);
    }
    console.log('Briefing script is current.');
  } else {
    writeFileSync(SCRIPT_PATH, text);
    console.log(`Wrote ${path.relative(ROOT, SCRIPT_PATH)} (${text.split('\n').length} lines).`);
  }
}
