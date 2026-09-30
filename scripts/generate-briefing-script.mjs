#!/usr/bin/env node
/**
 * Writes docs/NEPAL_2015_EXECUTIVE_BRIEFING_SCRIPT.md from the briefing
 * timeline and the analysis artefacts. `--check` exits non-zero if the
 * committed script is out of date instead of writing it.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createFactBook } from '../src/nepal/briefing/facts.js';
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

export function currentScript() {
  return renderBriefingScript(loadBriefingBook(), BRIEFING_SCENES);
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
