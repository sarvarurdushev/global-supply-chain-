#!/usr/bin/env node
/**
 * Writes docs/NEPAL_2015_GLOSSARY.md from src/nepal/briefing/glossary.js and
 * the scene timeline: every term, its plain meaning (Level 1, shown in the
 * briefing), its precise definition (Level 2, the technical layer), and
 * where each run first explains it. `--check` exits non-zero if the
 * committed file is out of date instead of writing it.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLOSSARY, GLOSSARY_ORDER } from '../src/nepal/briefing/glossary.js';
import { BRIEFING_SCENES } from '../src/nepal/briefing/scenes/index.js';
import { RUNS, RUN_LABELS, planRun } from '../src/nepal/briefing/timeline.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const GLOSSARY_PATH = path.join(ROOT, 'docs', 'NEPAL_2015_GLOSSARY.md');

const KINDS = {
  source: 'Sources',
  measure: 'Measures',
  statistic: 'Statistics',
  method: 'Methods',
  class: 'Evidence classes',
};

/** Where each run first shows a term: "06 First hours · first-hour". */
function firstShown() {
  const out = {};
  for (const run of [RUNS.THREE, RUNS.SIX, RUNS.FULL])
    for (const entry of planRun(BRIEFING_SCENES, run))
      for (const term of entry.firstTerms ?? [])
        (out[term] ??= {})[run] ??= `${String(entry.scene.number).padStart(2, '0')} ${entry.scene.title} · ${entry.beat.id}`;
  return out;
}

export function renderGlossary() {
  const shown = firstShown();
  const out = [
    '# Nepal 2015 — glossary',
    '',
    '> **Generated** by `node scripts/generate-briefing-glossary.mjs` from',
    '> `src/nepal/briefing/glossary.js` and the scene timeline. Do not edit by hand: a test',
    '> regenerates this file and fails if it differs.',
    '',
    'Every acronym and technical term the briefing uses, in two layers:',
    '',
    '- **Plain** (Level 1) is what the briefing shows on screen the first time a run meets the',
    '  term, under the scene’s question, for a few seconds. Later uses pass silently.',
    '- **Technical** (Level 2) is the precise definition, shown in the in-app glossary (`?` or',
    '  `G`) when the technical layer is on (`TECH` or `I`), next to the method notes and the',
    '  sources of every figure.',
    '',
    'Definitions describe; they never add a figure. Every number the briefing states comes from an',
    'analysis artefact.',
    '',
  ];
  for (const [kind, title] of Object.entries(KINDS)) {
    const keys = GLOSSARY_ORDER.filter((key) => GLOSSARY[key].kind === kind);
    if (!keys.length) continue;
    out.push(`## ${title}`, '');
    for (const key of keys) {
      const term = GLOSSARY[key];
      out.push(`### ${term.term}${term.expansion ? ` — ${term.expansion}` : ''}`, '');
      out.push(`- **Plain:** ${term.plain}`);
      out.push(`- **Technical:** ${term.detail}`);
      const where = shown[key];
      out.push(
        `- **First explained:** ${
          where
            ? [RUNS.THREE, RUNS.SIX, RUNS.FULL]
                .filter((run) => where[run])
                .map((run) => `${RUN_LABELS[run]}: ${where[run]}`)
                .join('; ')
            : 'glossary only (no beat shows it)'
        }`,
      );
      out.push('');
    }
  }
  return `${out.join('\n')}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = renderGlossary();
  if (process.argv.includes('--check')) {
    if (readFileSync(GLOSSARY_PATH, 'utf8') !== text) {
      console.error('docs/NEPAL_2015_GLOSSARY.md is out of date: run node scripts/generate-briefing-glossary.mjs');
      process.exit(1);
    }
    console.log('Glossary is current.');
  } else {
    writeFileSync(GLOSSARY_PATH, text);
    console.log(`Wrote ${path.relative(ROOT, GLOSSARY_PATH)}.`);
  }
}
