#!/usr/bin/env node
/**
 * qa-briefing-runtime — how long a run actually takes, measured by playing the
 * real director on the real stage in a browser, hands off, from BEGIN to the
 * last beat.
 *
 * Why not the timeline estimate: the estimate adds up beat lengths on paper.
 * This plays the briefing: every action's promise, every narration end, every
 * hold and scene-end pause the director really waits for. Narration is the QA
 * simulation (`?narration=simulated`), which takes as long as the paced
 * speaking rate says each sentence takes, on the briefing clock.
 *
 * The briefing clock is stepped by hand (100 ms at a time), with an overlay
 * frame after every step, so a slow renderer cannot stretch or shrink what is
 * measured. The 3D globe is not drawn while measuring: nothing the director
 * waits for depends on it (flights, fades and counters all run on the briefing
 * clock and the overlay's frame), and software WebGL would take an hour.
 *
 * Usage (production build: npm run build && npm run preview):
 *   node scripts/qa-briefing-runtime.mjs --url http://localhost:4173 [--run SIX]
 *
 * Prints each scene's start time and the finishing time; report.json goes to
 * qa-shots/briefing-runtime/. Exit 1 if the 6-minute run is outside 5:50–6:10.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
const getOpt = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const APP_URL = getOpt('--url', 'http://localhost:4173').replace(/\/$/, '');
const RUN_KEY = getOpt('--run', 'SIX');
const RUN = {
  FULL: 'FULL ANALYSIS',
  SIX: '6 MIN BRIEFING',
  THREE: '3 MIN EXECUTIVE',
}[RUN_KEY];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'qa-shots', 'briefing-runtime');
fs.mkdirSync(OUT, { recursive: true });

const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  await puppeteer.executablePath().catch(() => null),
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
].filter(Boolean);
const executablePath = CHROME_CANDIDATES.find((candidate) =>
  fs.existsSync(candidate),
);

const browser = await puppeteer.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: 'new',
  protocolTimeout: 3600000,
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', (e) =>
  errors.push(`pageerror: ${String(e).slice(0, 300)}`),
);
await page.goto(`${APP_URL}/?narration=simulated`, {
  waitUntil: 'domcontentloaded',
  timeout: 180000,
});
await page.waitForSelector('.brf-begin:not([hidden])', { timeout: 240000 });
await page.waitForFunction(
  () =>
    /READY/.test(document.querySelector('.ndi-top__stats')?.innerText ?? ''),
  { timeout: 240000 },
);
await page.evaluate(
  (label) =>
    [...document.querySelectorAll('.brf-begin button')]
      .find((b) => b.textContent.trim() === label)
      .click(),
  RUN,
);
await page.waitForFunction(
  () => window.__godsEyeView?.nepalCase?.briefing?.director?.state?.index >= 0,
  { timeout: 60000 },
);

/* Step the clock in slices so the protocol call never runs for an hour. */
await page.evaluate(() => {
  const b = window.__godsEyeView.nepalCase.briefing;
  const d = b.director;
  b.overlay.setDrivesClock(false);
  window.__godsEyeView.viewer.useDefaultRenderLoop = false;
  /* The run started a moment ago; count from its first beat's start. */
  const startedAt =
    b.clock.now() - (d.state.index === 0 ? d.state.elapsedInBeatMs : 0);
  window.__runtime = { scenes: [], startedAt, last: null };
});
const STEP_MS = 100;
let result = null;
for (let slice = 0; slice < 400 && !result; slice += 1) {
  result = await page.evaluate(async (STEP_MS) => {
    const b = window.__godsEyeView.nepalCase.briefing;
    const d = b.director;
    const r = window.__runtime;
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const frame = () =>
      new Promise((resolve) => requestAnimationFrame(resolve));
    /* About ten seconds of briefing per slice. */
    for (let k = 0; k < 100; k += 1) {
      const s = d.state;
      if (s.sceneId !== r.last) {
        r.scenes.push({
          scene: s.sceneId,
          number: s.entry?.scene.number,
          atMs: b.clock.now() - r.startedAt,
        });
        r.last = s.sceneId;
      }
      if (s.status === 'finished')
        return { totalMs: b.clock.now() - r.startedAt, scenes: r.scenes };
      b.clock.advance(STEP_MS);
      await tick();
      await frame();
      await tick();
    }
    return null;
  }, STEP_MS);
}
await browser.close();

if (!result) {
  console.log('FAIL  the run did not finish within the measuring window');
  process.exit(1);
}
const mmss = (ms) => {
  const s = ms / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};
for (const row of result.scenes)
  console.log(
    `${mmss(row.atMs).padStart(7)}  ${String(row.number).padStart(2)} ${row.scene}`,
  );
console.log(`\n${RUN}: ${mmss(result.totalMs)} (${result.totalMs} ms)`);
fs.writeFileSync(
  `${OUT}/report-${RUN_KEY}.json`,
  JSON.stringify({ run: RUN, ...result, errors }, null, 1),
);
if (errors.length) console.log(errors.join('\n'));
const inWindow =
  RUN_KEY !== 'SIX' || (result.totalMs >= 350000 && result.totalMs <= 370000);
if (!inWindow) console.log('FAIL  the 6-minute run is outside 5:50–6:10');
process.exit(inWindow ? 0 : 1);
