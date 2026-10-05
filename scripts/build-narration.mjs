#!/usr/bin/env node
/**
 * Pre-render the briefing's narration with the neural voices.
 *
 *   KOKORO_DIR=… NARRATION_PYTHON=… node scripts/build-narration.mjs [--voices af_heart,bf_emma] [--check]
 *
 * 1. Every beat of every run is filled from the artefacts (the same fact
 *    book the script generator uses), split into sentences with its
 *    delivery, and given a clip key (src/nepal/briefing/speech.js).
 * 2. Missing clips are rendered by scripts/narration/render.py (Kokoro-82M,
 *    build time only) into public/audio/narration/clips/.
 * 3. public/audio/narration/manifest.json lists every clip with its exact
 *    length, so the browser — and the runtime and script estimates — time
 *    each beat by the real voice. Clips no beat uses any more are removed.
 *
 * `--check` renders nothing and exits non-zero if any clip is missing or
 * stale: the CI-friendly guard that the shipped voice matches the script.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fillTemplate } from '../src/nepal/briefing/facts.js';
import { BRIEFING_SCENES } from '../src/nepal/briefing/scenes/index.js';
import { clipKey, neuralInput, sentencePlan } from '../src/nepal/briefing/speech.js';
import { NARRATION_VOICES, PREVIEW_LINE, RENDER_VERSION } from '../src/nepal/briefing/voices.js';
import { loadBriefingBook } from './generate-briefing-script.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const NARRATION_DIR = path.join(ROOT, 'public', 'audio', 'narration');
export const MANIFEST_PATH = path.join(NARRATION_DIR, 'manifest.json');
const CLIPS_DIR = path.join(NARRATION_DIR, 'clips');

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
};

/** Every sentence the briefing can speak, per voice, with its delivery. */
export function narrationJobs(voices = NARRATION_VOICES) {
  const book = loadBriefingBook();
  const jobs = new Map();
  for (const scene of BRIEFING_SCENES)
    for (const beat of scene.beats) {
      if (!beat.narration) continue;
      const text = fillTemplate(beat.narration, book);
      for (const sentence of sentencePlan(text, beat.prosody))
        for (const voice of voices) {
          const key = clipKey(voice.id, sentence);
          jobs.set(key, {
            key,
            voice: voice.id,
            british: voice.british,
            input: neuralInput(sentence),
            speed: sentence.rate,
            pauseBefore: sentence.pauseBefore,
            pauseAfter: sentence.pauseAfter,
            gainDb: sentence.energy * 1.5,
            beat: `${scene.id}:${beat.id}`,
            text: sentence.text,
          });
        }
    }
  for (const voice of voices) {
    const [sentence] = sentencePlan(PREVIEW_LINE);
    const key = `preview-${clipKey(voice.id, sentence)}`;
    jobs.set(key, {
      key,
      voice: voice.id,
      british: voice.british,
      input: neuralInput(sentence),
      speed: 1,
      pauseBefore: 0,
      pauseAfter: 0,
      gainDb: 0,
      preview: true,
      text: PREVIEW_LINE,
    });
  }
  return [...jobs.values()];
}

function render(jobs) {
  const python = process.env.NARRATION_PYTHON ?? 'python3';
  if (!process.env.KOKORO_DIR) throw new Error('Set KOKORO_DIR to the Kokoro-82M ONNX model directory.');
  const jobsPath = path.join(NARRATION_DIR, '.jobs.json');
  writeFileSync(jobsPath, JSON.stringify(jobs));
  return new Promise((resolve, reject) => {
    const child = spawn(python, [path.join(ROOT, 'scripts', 'narration', 'render.py'), jobsPath, CLIPS_DIR], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const results = new Map();
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith('{')) continue;
        const row = JSON.parse(line);
        results.set(row.key, row);
        if (!row.cached) process.stdout.write(`  ${row.key} ${row.ms} ms\n`);
      }
    });
    child.on('close', (code) => {
      rmSync(jobsPath, { force: true });
      if (code === 0) resolve(results);
      else reject(new Error(`render.py exited ${code}`));
    });
  });
}

async function main() {
  const only = arg('--voices')?.split(',');
  const voices = only ? NARRATION_VOICES.filter((v) => only.includes(v.id)) : NARRATION_VOICES;
  const jobs = narrationJobs(voices);
  const previous = existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) : null;
  const missing = jobs.filter((job) => !existsSync(path.join(CLIPS_DIR, `${job.key}.mp3`)));
  if (process.argv.includes('--check')) {
    if (missing.length) {
      console.error(`${missing.length} narration clips are missing or stale; run node scripts/build-narration.mjs`);
      process.exit(1);
    }
    console.log(`All ${jobs.length} narration clips are current.`);
    return;
  }
  mkdirSync(CLIPS_DIR, { recursive: true });
  console.log(`${jobs.length} clips, ${missing.length} to render`);
  const results = await render(jobs);
  const clips = {};
  for (const job of jobs) {
    const ms = results.get(job.key)?.ms ?? previous?.clips?.[job.key];
    if (!Number.isFinite(ms)) throw new Error(`No length for ${job.key}`);
    clips[job.key] = ms;
  }
  const fallbackWords = [...new Set([...results.values()].flatMap((r) => r.fallbackWords ?? []))];
  /* Clips no sentence uses any more are deleted, so the shipped set is exactly the script. */
  const wanted = new Set(jobs.map((job) => `${job.key}.mp3`));
  let pruned = 0;
  for (const file of readdirSync(CLIPS_DIR))
    if (file.endsWith('.mp3') && !wanted.has(file)) {
      rmSync(path.join(CLIPS_DIR, file));
      pruned += 1;
    }
  const manifest = {
    schemaVersion: 1,
    engine: 'Kokoro-82M v1.0 (onnx-community ONNX, fp32) with misaki G2P, rendered at build time',
    licence: 'Kokoro-82M: Apache-2.0 (code and weights); misaki: Apache-2.0',
    renderVersion: RENDER_VERSION,
    format: 'audio/mpeg',
    sampleRate: 24000,
    voices: voices.map((voice) => ({
      ...voice,
      preview: jobs.find((job) => job.preview && job.voice === voice.id).key,
    })),
    clips: Object.fromEntries(Object.entries(clips).sort(([a], [b]) => a.localeCompare(b))),
  };
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 1)}\n`);
  console.log(`Wrote ${path.relative(ROOT, MANIFEST_PATH)}: ${Object.keys(clips).length} clips, ${pruned} pruned.`);
  if (fallbackWords.length) console.log(`G2P fell back to eSpeak for: ${fallbackWords.join(', ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
