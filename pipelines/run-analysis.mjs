#!/usr/bin/env node
/**
 * Run every analysis stage, in the order the investigation tells its story.
 *
 *   node pipelines/run-analysis.mjs
 *
 * Each stage reads committed artefacts from data/processed and writes its
 * result to data/analysis. Ingestion is a separate command: re-running the
 * analysis does not re-download anything.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ANALYSIS, formatBytes } from './lib/io.mjs';
import { analyseSeismic } from './analyse/seismic.mjs';
import { analyseExposure } from './analyse/exposure.mjs';
import { analyseDamage } from './analyse/damage.mjs';
import { analyseInfrastructure } from './analyse/infrastructure.mjs';
import { analyseDamagePopulation } from './analyse/damage-population.mjs';

const STAGES = [
  [3, 'Seismic analysis — what happened', analyseSeismic],
  [4, 'Population exposure \u2014 who was inside the shaking', analyseExposure],
  [5, 'Observed damage \u2014 what was seen to break', analyseDamage],
  [5, 'Infrastructure and network \u2014 what the blockages did to connectivity', analyseInfrastructure],
  [5, 'Damage and population \u2014 people near what was observed', analyseDamagePopulation],
];

for (const [stage, label, run] of STAGES) {
  const started = Date.now();
  process.stdout.write(`\n=== Stage ${stage}: ${label}\n`);
  try {
    const { analysis } = await run();
    process.stdout.write(
      `    validation ${analysis.validation.passed ? 'PASSED' : 'FAILED'} in ${((Date.now() - started) / 1000).toFixed(1)}s\n`,
    );
    if (!analysis.validation.passed) process.exitCode = 1;
  } catch (error) {
    process.stdout.write(`    FAILED: ${error.message}\n`);
    process.exitCode = 1;
  }
}

process.stdout.write('\n=== Analysis artefacts (committed)\n');
let total = 0;
for (const name of (await readdir(ANALYSIS)).sort()) {
  const file = path.join(ANALYSIS, name);
  const { size } = await stat(file);
  total += size;
  const payload = JSON.parse(await readFile(file, 'utf8'));
  process.stdout.write(
    `  ${formatBytes(size).padStart(9)}  stage ${payload.stage}  ${payload.dataClass.padEnd(8)}  ${name}\n` +
      `             ${payload.methodology.length} methodology records, validation ${payload.validation.passed ? 'passed' : 'FAILED'}\n`,
  );
}
process.stdout.write(`  ${formatBytes(total).padStart(9)}  TOTAL\n`);
