#!/usr/bin/env node
/**
 * Run every Nepal 2015 ingest, then audit what may be committed.
 *
 *   node pipelines/run-all.mjs            reuse anything already in data/raw
 *   node pipelines/run-all.mjs --force    re-download every source
 *
 * Order matters: the boundaries produce the polygons the name crosswalk
 * verifies, and the crosswalk produces the join keys the OCHA table resolves
 * against.
 */

import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { PROCESSED, RAW, formatBytes } from './lib/io.mjs';
import { ingestUsgsEvents } from './ingest/usgs-events.mjs';
import { ingestShakeMap } from './ingest/shakemap.mjs';
import { ingestUnosatDamage } from './ingest/unosat-damage.mjs';
import { ingestBoundaries } from './ingest/boundaries.mjs';
import { ingestDistrictNames } from './ingest/district-names.mjs';
import { ingestOchaExposure } from './ingest/ocha-exposure.mjs';
import { ingestWorldPop } from './ingest/worldpop.mjs';

const force = process.argv.includes('--force');

const STEPS = [
  ['USGS events and aftershocks', ingestUsgsEvents],
  ['USGS ShakeMap contours', ingestShakeMap],
  ['UNOSAT / Copernicus / NGA damage', ingestUnosatDamage],
  ['Nepal district boundaries', ingestBoundaries],
  ['District name verification', ingestDistrictNames],
  ['OCHA district exposure', ingestOchaExposure],
  ['WorldPop 2015 population', ingestWorldPop],
];

for (const [label, run] of STEPS) {
  const started = Date.now();
  process.stdout.write(`\n=== ${label}\n`);
  try {
    await run({ force });
    process.stdout.write(`    done in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
  } catch (error) {
    process.stdout.write(`    FAILED: ${error.message}\n`);
    process.exitCode = 1;
  }
}

/* ---------------- the commit audit the brief asks for ---------------- */

process.stdout.write('\n=== Processed artefacts (committed)\n');
let processedTotal = 0;
for (const name of (await readdir(PROCESSED)).sort()) {
  const file = path.join(PROCESSED, name);
  const { size } = await stat(file);
  processedTotal += size;
  const { source, dataClass } = JSON.parse(await import('node:fs/promises').then((m) => m.readFile(file, 'utf8')));
  const encumbered =
    source.redistribution === 'SHARE_ALIKE' || source.redistribution === 'NON_COMMERCIAL';
  process.stdout.write(
    `  ${formatBytes(size).padStart(9)}  ${dataClass.padEnd(9)}  ${name}\n` +
      `             ${source.license}` +
      `${encumbered ? `  [${source.redistribution}: this obligation travels with the derived file]` : ''}\n`,
  );
}
process.stdout.write(`  ${formatBytes(processedTotal).padStart(9)}  TOTAL COMMITTED\n`);

process.stdout.write('\n=== Raw downloads (NOT committed, reproducible by re-running)\n');
let rawTotal = 0;
try {
  for (const name of (await readdir(RAW)).sort()) {
    const { size } = await stat(path.join(RAW, name));
    rawTotal += size;
    process.stdout.write(`  ${formatBytes(size).padStart(9)}  ${name}\n`);
  }
} catch {
  process.stdout.write('  (none yet)\n');
}
process.stdout.write(`  ${formatBytes(rawTotal).padStart(9)}  TOTAL NOT COMMITTED\n`);
