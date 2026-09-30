#!/usr/bin/env node
/**
 * qa-briefing-transitions — every scene change of the FULL run, crossed the
 * way an audience sees it: by PLAYING out of the last beat of one scene into
 * the next, not by jumping.
 *
 * Why: a jump clears the map instantly, a played scene change fades the old
 * scene out. Stage 9.1's watch found scene 13 arriving with no outline and no
 * damage points, because its setup saw the fading copies of those layers and
 * skipped drawing its own. Only a played crossing shows that, so this script
 * plays every one.
 *
 * For each scene: land paused on the previous scene's last beat, play on the
 * briefing clock until the scene changes, let every fade finish, then check
 * that each object the new scene's setup draws is on the map and staying.
 *
 * Usage (production build: npm run build && npm run preview):
 *   node scripts/qa-briefing-transitions.mjs --url http://localhost:4173 [--run FULL]
 *
 * report.json goes to qa-shots/briefing-transitions/. Exit 1 on any FAIL.
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
const RUN = { FULL: 'FULL ANALYSIS', SIX: '6 MIN BRIEFING', THREE: '3 MIN EXECUTIVE' }[getOpt('--run', 'FULL')];
/* SwiftShader runs out of shader resources in long sessions: a fresh browser every few crossings. */
const PER_SESSION = Number(getOpt('--per-session', '6'));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'qa-shots', 'briefing-transitions');
fs.mkdirSync(OUT, { recursive: true });

const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  await puppeteer.executablePath().catch(() => null),
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
].filter(Boolean);
const executablePath = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));

async function open() {
  const browser = await puppeteer.launch({
    ...(executablePath ? { executablePath } : {}),
    headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 300)}`));
  await page.goto(`${APP_URL}/?narration=simulated`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForSelector('.brf-begin:not([hidden])', { timeout: 240000 });
  await page.waitForFunction(() => /READY/.test(document.querySelector('.ndi-top__stats')?.innerText ?? ''), { timeout: 240000 });
  await page.evaluate((label) => [...document.querySelectorAll('.brf-begin button')].find((b) => b.textContent.trim() === label).click(), RUN);
  await page.waitForFunction(() => window.__godsEyeView?.nepalCase?.briefing?.director?.state?.index >= 0, { timeout: 60000 });
  /* The briefing clock is advanced by hand, so a slow renderer does not change what is checked. */
  await page.evaluate(() => {
    const b = window.__godsEyeView.nepalCase.briefing;
    b.director.pause();
    b.overlay.setDrivesClock(false);
  });
  return { browser, page, errors };
}

/* Where each scene starts in the plan, and what its setup draws. */
async function sceneStarts(page) {
  return page.evaluate(() => {
    const plan = window.__godsEyeView.nepalCase.briefing.director.plan;
    const starts = [];
    plan.forEach((entry, i) => {
      if (i === 0 || plan[i - 1].scene !== entry.scene) starts.push({ index: i, scene: entry.scene.id });
    });
    return starts;
  });
}

async function cross(page, target) {
  return page.evaluate(async (target) => {
    const b = window.__godsEyeView.nepalCase.briefing;
    const d = b.director;
    const frames = (n) => new Promise((r) => {
      let k = 0;
      const step = () => (++k >= n ? r() : requestAnimationFrame(step));
      requestAnimationFrame(step);
    });
    d.goTo(target - 1);
    await new Promise((r) => setTimeout(r, 1500));
    d.play();
    /* Play on the clock, 250 ms at a time, until the scene changes (at most 90 s of briefing). */
    let played = 0;
    while (d.state.index < target && played < 90000) {
      b.clock.advance(250);
      played += 250;
      await frames(1);
    }
    if (d.state.index !== target) return { error: `did not reach beat ${target} in ${played} ms`, key: d.state.entry?.key };
    /* Let the old scene's fades and the new setup settle. */
    for (let k = 0; k < 6; k += 1) {
      b.clock.advance(250);
      await frames(1);
    }
    d.pause();
    const scene = d.state.entry.scene;
    const wanted = [];
    for (const a of scene.setup ?? []) {
      if (a.type === 'layer.show') wanted.push(a.id ?? a.layer);
      else if (['annotation.draw', 'metric.count', 'route.trace'].includes(a.type) && a.id) wanted.push(a.id);
    }
    const state = (id) => {
      const item = b.overlay.items.get(id);
      return !item ? 'missing' : item.removingAt !== undefined ? 'fading' : 'ok';
    };
    const bad = wanted.map((id) => [id, state(id)]).filter(([, s]) => s !== 'ok');
    return { key: d.state.entry.key, scene: scene.id, playedMs: played, wanted: wanted.length, bad };
  }, target);
}

const results = [];
let session = await open();
const starts = await sceneStarts(session.page);
let inSession = 0;
for (const start of starts.slice(1)) {
  if (inSession >= PER_SESSION) {
    await session.browser.close();
    session = await open();
    inSession = 0;
  }
  let r;
  try {
    r = await cross(session.page, start.index);
  } catch (e) {
    r = { error: String(e).slice(0, 200) };
    await session.browser.close().catch(() => {});
    session = await open();
    inSession = 0;
    r = await cross(session.page, start.index).catch((e2) => ({ error: String(e2).slice(0, 200) }));
  }
  inSession += 1;
  const passed = !r.error && r.bad.length === 0;
  results.push({ scene: start.scene, index: start.index, passed, ...r });
  console.log(`${passed ? 'PASS' : 'FAIL'}  → ${start.scene}${r.error ? `  ${r.error}` : `  ${r.wanted} setup objects${r.bad.length ? `, not on the map: ${JSON.stringify(r.bad)}` : ''}`}`);
}
await session.browser.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ run: RUN, results, errors: session.errors }, null, 1));
const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} scene changes arrive with every setup object drawn`);
process.exit(failed.length ? 1 : 0);
