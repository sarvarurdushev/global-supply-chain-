/**
 * The I/O shell around the portable readers in `src/nepal/`.
 *
 * Everything that touches the network or the filesystem lives here, so the
 * parsers stay testable without either and could run in a browser unchanged.
 * This split is the project's existing boundary rule applied to the pipeline.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const RAW = path.join(ROOT, 'data', 'raw');
export const PROCESSED = path.join(ROOT, 'data', 'processed');
export const REGISTRY = path.join(ROOT, 'data', 'registry');
export const REPORTS = path.join(ROOT, 'data', 'reports');
/** Stage 3+ analytical results, derived from the processed artefacts. */
export const ANALYSIS = path.join(ROOT, 'data', 'analysis');

const UA =
  'NepalEQ-Research/1.0 (university disaster-analysis project; contact via repository)';

/**
 * Download to `data/raw`, or reuse what is already there.
 *
 * Raw files are gitignored — several are 80 MB or more and one is
 * NonCommercial — so the cache is what makes a re-run cheap and the checksum
 * is what makes it honest: a changed upstream file changes the hash, and the
 * ingest report records it.
 */
export async function fetchRaw(name, url, { force = false } = {}) {
  await mkdir(RAW, { recursive: true });
  const target = path.join(RAW, name);
  if (!force) {
    try {
      const existing = await readFile(target);
      return { path: target, bytes: existing, cached: true, sha256: sha256(existing) };
    } catch {
      /* not cached yet */
    }
  }
  const response = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Fetch failed for ${name}: HTTP ${response.status} from ${url}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await writeFile(target, bytes);
  return { path: target, bytes, cached: false, sha256: sha256(bytes) };
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Write a processed artefact with its provenance header attached. */
export async function writeProcessed(name, payload) {
  await mkdir(PROCESSED, { recursive: true });
  const target = path.join(PROCESSED, name);
  const text = `${JSON.stringify(payload, null, 1)}\n`;
  await writeFile(target, text);
  const { size } = await stat(target);
  return { path: target, bytes: size };
}

/** Write an analysis result. Same envelope discipline as a processed artefact. */
export async function writeAnalysis(name, payload) {
  await mkdir(ANALYSIS, { recursive: true });
  const target = path.join(ANALYSIS, name);
  await writeFile(target, `${JSON.stringify(payload, null, 1)}\n`);
  const { size } = await stat(target);
  return { path: target, bytes: size };
}

export async function writeRegistry(record) {
  await mkdir(REGISTRY, { recursive: true });
  const target = path.join(REGISTRY, `${record.id}.json`);
  await writeFile(target, `${JSON.stringify(record, null, 1)}\n`);
  return target;
}

export async function writeReport(name, text) {
  await mkdir(REPORTS, { recursive: true });
  const target = path.join(REPORTS, name);
  await writeFile(target, text.endsWith('\n') ? text : `${text}\n`);
  return target;
}

/** Human-readable size, for the commit-size checks the brief asks for. */
export function formatBytes(n) {
  return n >= 1e6 ? `${(n / 1e6).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`;
}
