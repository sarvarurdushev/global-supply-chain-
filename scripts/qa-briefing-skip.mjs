#!/usr/bin/env node
/**
 * qa-briefing-skip — Stage 9 §32 "skip everything", driven through the real
 * controls of the executive briefing (6 MIN run).
 *
 * NEXT repeatedly (how many drawn frames until the new beat's caption is on
 * screen), three presses in one tick, BACK, pause, resume, every speed,
 * provenance open and close, explore and return, the ends of the timeline —
 * and a timeline-integrity check: one beat reached by NEXT, by BACK and by a
 * jump must leave the same objects drawn, the same caption and the same
 * camera. No action may corrupt the timeline.
 *
 * Usage (against a production build: npm run build && npm run preview):
 *   node scripts/qa-briefing-skip.mjs --url http://localhost:4173
 *
 * Screenshots and report.json go to qa-shots/briefing-skip/. Exit 1 on any FAIL.
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
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'qa-shots', 'briefing-skip');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  await puppeteer.executablePath().catch(() => null),
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
].filter(Boolean);
const executablePath = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));

const browser = await puppeteer.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: 'new',
  /* SwiftShader where there is no GPU; a GPU is used when present. */
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 300));
});
page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 400)}`));
await page.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.brf-begin:not([hidden])', { timeout: 120000 });
await page.waitForFunction(() => /READY/.test(document.querySelector('.ndi-top__stats')?.innerText ?? ''), { timeout: 120000 });
await sleep(1000);
await page.evaluate(() => [...document.querySelectorAll('.brf-begin button')].find((b) => b.textContent.trim() === '6 MIN BRIEFING').click());
await page.waitForFunction(() => window.__godsEyeView?.nepalCase?.briefing?.director?.state?.index >= 0, { timeout: 60000 });

const results = [];
const check = (name, passed, detail) => {
  results.push({ name, passed: Boolean(passed), detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `  — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
};
const state = () =>
  page.evaluate(() => {
    const b = window.__godsEyeView.nepalCase.briefing;
    const s = b.director.state;
    return { index: s.index, total: s.total, status: s.status, speed: s.speed, key: s.entry?.key, now: b.clock.now() };
  });
const control = (label) =>
  page.evaluate((label) => {
    const button = [...document.querySelectorAll('.brf-controls button, .brf-root button')].find((b) => b.textContent.trim().startsWith(label));
    button.click();
    return Boolean(button);
  }, label);

/* 1. NEXT, repeatedly: how long until the new beat's caption is on screen. */
const latencies = [];
for (let i = 0; i < 12; i += 1) {
  const r = await page.evaluate(async () => {
    const b = window.__godsEyeView.nepalCase.briefing;
    const before = b.director.state.index;
    const t0 = performance.now();
    [...document.querySelectorAll('.brf-root button')].find((x) => x.textContent.trim().startsWith('NEXT')).click();
    const indexMs = performance.now() - t0;
    const after = b.director.state.index;
    const want = b.fill(b.director.state.entry.beat.caption ?? '').split(/\s+/)[0] ?? '';
    let captionMs = null;
    let frames = 0;
    /* The captions module writes the text in its own animation frame, so the count is frames the page drew. */
    while (performance.now() - t0 < 5000) {
      const text = document.querySelector('.brf-caption.is-visible .brf-caption__text')?.textContent ?? '';
      if (!want || text.startsWith(want)) {
        captionMs = performance.now() - t0;
        break;
      }
      await new Promise((r) => requestAnimationFrame(r));
      frames += 1;
    }
    /* This renderer's own frame interval, measured right after. */
    const f0 = performance.now();
    for (let i = 0; i < 5; i += 1) await new Promise((r) => requestAnimationFrame(r));
    const frameMs = (performance.now() - f0) / 5;
    return { before, after, indexMs, captionMs, frames, frameMs, key: b.director.state.entry.key };
  });
  latencies.push(r);
  await sleep(250);
}
check('NEXT advances the beat index on the press, every press', latencies.every((r) => r.after === r.before + 1), latencies.map((r) => r.key));
check(
  'the new beat caption is on screen within three drawn frames of NEXT',
  latencies.every((r) => r.captionMs !== null && r.frames <= 3),
  latencies.map((r) => `${r.frames} frames / ${Math.round(r.captionMs)} ms (frame ${Math.round(r.frameMs)} ms)`),
);
await page.screenshot({ path: `${OUT}/01-after-next.jpg`, type: 'jpeg', quality: 70 });

/* 2. Three presses in one tick land three beats on. */
const triple = await page.evaluate(() => {
  const b = window.__godsEyeView.nepalCase.briefing;
  const before = b.director.state.index;
  const next = [...document.querySelectorAll('.brf-root button')].find((x) => x.textContent.trim().startsWith('NEXT'));
  next.click();
  next.click();
  next.click();
  return { before, after: b.director.state.index };
});
check('three NEXT presses in one tick land exactly three beats on', triple.after === triple.before + 3, triple);
await sleep(1500);

/* 3. BACK. */
const back = await page.evaluate(() => {
  const b = window.__godsEyeView.nepalCase.briefing;
  const before = b.director.state.index;
  const button = [...document.querySelectorAll('.brf-root button')].find((x) => x.textContent.trim().startsWith('← BACK'));
  button.click();
  button.click();
  return { before, after: b.director.state.index, key: b.director.state.entry.key };
});
check('BACK twice returns exactly two beats', back.after === back.before - 2, back);
await sleep(1500);

/* 4. Pause: the clock stops. */
await control('❚❚');
const p0 = await state();
await sleep(2500);
const p1 = await state();
check('PAUSE stops the briefing clock', p0.status === 'paused' && p1.now === p0.now && p1.index === p0.index, { status: p0.status, clockBefore: p0.now, clockAfter: p1.now });
await page.screenshot({ path: `${OUT}/02-paused.jpg`, type: 'jpeg', quality: 70 });

/* 5. Timeline integrity: one beat, reached three ways, while paused. */
const signature = () =>
  page.evaluate(async () => {
    /* Let any instant reconcile finish. */
    for (let i = 0; i < 20; i += 1) await new Promise((r) => requestAnimationFrame(r));
    const c = window.__godsEyeView.nepalCase;
    const b = c.briefing;
    const cam = window.__godsEyeView.viewer.camera.positionCartographic;
    return {
      index: b.director.state.index,
      key: b.director.state.entry.key,
      items: [...b.overlay.items.keys()].sort(),
      caption: document.querySelector('.brf-caption.is-visible .brf-caption__text')?.textContent ?? '',
      camera: [cam.longitude, cam.latitude, cam.height].map((v, i) => (i < 2 ? Number(((v * 180) / Math.PI).toFixed(3)) : Math.round(v / 100) * 100)),
    };
  });
const target = (await state()).index;
await sleep(1500);
const viaPlay = await signature();
for (let i = 0; i < 3; i += 1) await control('NEXT');
await sleep(1500);
for (let i = 0; i < 3; i += 1) await control('← BACK');
await sleep(2500);
const viaBack = await signature();
await page.evaluate(() => window.__godsEyeView.nepalCase.briefing.director.goTo(0));
await sleep(2000);
await page.evaluate((t) => window.__godsEyeView.nepalCase.briefing.director.goTo(t), target);
await sleep(2500);
const viaJump = await signature();
const same = (a, b) => JSON.stringify([a.key, a.items, a.caption]) === JSON.stringify([b.key, b.items, b.caption]);
check('the same beat reached by NEXT, by BACK and by a jump draws the same objects and caption', same(viaPlay, viaBack) && same(viaPlay, viaJump), {
  key: viaPlay.key,
  items: [viaPlay.items.length, viaBack.items.length, viaJump.items.length],
  onlyInOne: [...new Set([...viaPlay.items, ...viaBack.items, ...viaJump.items])].filter((id) => !(viaPlay.items.includes(id) && viaBack.items.includes(id) && viaJump.items.includes(id))),
});
check('…and leaves the camera in the same place', JSON.stringify(viaBack.camera) === JSON.stringify(viaJump.camera), { viaPlay: viaPlay.camera, viaBack: viaBack.camera, viaJump: viaJump.camera });
fs.writeFileSync(`${OUT}/signatures.json`, JSON.stringify({ viaPlay, viaBack, viaJump }, null, 1));

/* 6. Resume: the clock runs and the beat after it follows. */
await control('▶');
const r0 = await state();
await page.evaluate(() => window.__godsEyeView.nepalCase.briefing.director.setSpeed(1.5));
let advanced = null;
for (let i = 0; i < 60 && !advanced; i += 1) {
  await sleep(1000);
  const s = await state();
  if (s.index !== r0.index) advanced = s;
}
check('PLAY resumes and the next beat follows on its own', r0.status === 'playing' && advanced?.index === r0.index + 1, { from: r0.key, to: advanced?.key ?? null });

/* 7. Every speed, from the speed button. */
await page.evaluate(() => window.__godsEyeView.nepalCase.briefing.director.setSpeed(1));
const speeds = [];
for (let i = 0; i < 4; i += 1) {
  await control(`${(await state()).speed}×`);
  const s = await state();
  const label = await page.evaluate(() => [...document.querySelectorAll('.brf-root button')].find((x) => /×$/.test(x.textContent.trim()))?.textContent.trim());
  speeds.push({ speed: s.speed, label });
}
check('the speed button cycles 1.25, 1.5, 0.75, 1 and its label follows', JSON.stringify(speeds.map((s) => s.speed)) === '[1.25,1.5,0.75,1]' && speeds.every((s) => s.label === `${s.speed}×`), speeds);

/* 8. Provenance: open, read, close; the timeline is untouched. */
const beforeProv = await state();
await page.keyboard.press('i');
await sleep(800);
const prov = await page.evaluate(() => {
  const p = document.querySelector('.brf-provenance');
  return { visible: !!p && !p.hidden, rows: p?.querySelectorAll('.brf-provenance__row').length ?? 0, text: p?.innerText.slice(0, 400) };
});
await page.screenshot({ path: `${OUT}/03-provenance.jpg`, type: 'jpeg', quality: 70 });
await page.keyboard.press('i');
await sleep(500);
const provClosed = await page.evaluate(() => document.querySelector('.brf-provenance')?.hidden);
const afterProv = await state();
check('I opens provenance with rows, I closes it', prov.visible && prov.rows > 0 && provClosed, { rows: prov.rows });
check('provenance does not move the timeline', afterProv.status === 'playing' && afterProv.index >= beforeProv.index, { before: beforeProv.key, after: afterProv.key });

/* 9. Explore and back. */
await page.keyboard.press('Escape');
await sleep(2000);
const explored = await page.evaluate(() => {
  const c = window.__godsEyeView.nepalCase;
  return { mode: c.experience.investigation.state.mode, briefingHidden: c.briefing.element.hidden, active: c.briefing.active };
});
check('Esc leaves to EXPLORE with the briefing hidden', explored.mode === 'EXPLORE' && explored.briefingHidden && !explored.active, explored);
await page.screenshot({ path: `${OUT}/04-explore.jpg`, type: 'jpeg', quality: 70 });
await page.evaluate(() => [...document.querySelectorAll('.ndi__top button')].find((b) => b.textContent.trim() === '6 MIN').click());
await sleep(3000);
const returned = await state();
check('6 MIN from the top bar returns to a playing briefing', returned.status === 'playing' && returned.index >= 0, returned);

/* 10. The ends of the timeline. */
const ends = await page.evaluate(async () => {
  const d = window.__godsEyeView.nepalCase.briefing.director;
  d.pause();
  d.goTo(d.state.total - 1);
  await new Promise((r) => setTimeout(r, 2500));
  const atEnd = d.state.index;
  const nextAtEnd = d.next();
  d.goTo(0);
  await new Promise((r) => setTimeout(r, 2500));
  const backAtStart = d.previous();
  return { total: d.state.total, atEnd, nextAtEnd, index: d.state.index, backAtStart };
});
check('NEXT on the last beat and BACK on the first do nothing', ends.atEnd === ends.total - 1 && ends.nextAtEnd === false && ends.backAtStart === false && ends.index === 0, ends);

const pageErrors = errors.filter((e) => !/Failed to load resource/.test(e));
check('no page errors through all of it', pageErrors.length === 0, pageErrors.slice(0, 5));
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ results, latencies, errors }, null, 1));
console.log(`\n${results.filter((r) => r.passed).length}/${results.length} passed`);
await browser.close();
process.exit(results.every((r) => r.passed) ? 0 : 1);
