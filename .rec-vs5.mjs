/*
 * Deterministic briefing recorder. It takes the briefing clock from the
 * overlay and advances it in fixed steps, so frame N is exactly N * FRAME_MS
 * of briefing time however slowly SwiftShader draws. Wall-clock waits between
 * steps let imagery tiles stream in as they would for a viewer.
 *
 * env: OUT, RUN ('BEGIN BRIEFING' | '3 MIN' | 'FULL ANALYSIS'), MAX_MS,
 *      STEP_MS (250), FRAME_MS (1000), WAIT_MS (wall ms per step, 60),
 *      W/H (viewport), FROM_MS (skip capture before this briefing time)
 */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = process.env.OUT;
const RUN = process.env.RUN ?? 'BEGIN BRIEFING';
const MAX_MS = Number(process.env.MAX_MS ?? 60000);
const STEP_MS = Number(process.env.STEP_MS ?? 250);
const FRAME_MS = Number(process.env.FRAME_MS ?? 1000);
const WAIT_MS = Number(process.env.WAIT_MS ?? 60);
const FROM_MS = Number(process.env.FROM_MS ?? 0);
const W = Number(process.env.W ?? 1280);
const H = Number(process.env.H ?? 720);
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`${m.type()}: ${m.text().slice(0, 300)}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 400)}`));
await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.brf-begin:not([hidden])', { timeout: 90000 });
await page.waitForFunction(() => /READY/.test(document.querySelector('.ndi-top__stats')?.innerText ?? ''), { timeout: 90000 });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate((label) => {
  const button = [...document.querySelectorAll('.brf-begin button')].find((b) => b.textContent.trim() === label);
  button.click();
}, RUN);
await page.waitForFunction(() => window.__godsEyeView?.nepalCase?.briefing?.overlay, { timeout: 60000 });
await page.evaluate(() => window.__godsEyeView.nepalCase.briefing.overlay.setDrivesClock(false));
if (process.env.FROM_SCENE) {
  await page.evaluate((id) => window.__godsEyeView.nepalCase.briefing.director.goToScene(id), process.env.FROM_SCENE);
  await new Promise((r) => setTimeout(r, 3000));
}
const stopAt = process.env.STOP_SCENE ?? null;

const frames = [];
const wallStart = Date.now();
let vt = 0;
const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
while (vt <= MAX_MS) {
  const state = await page.evaluate(() => {
    const b = window.__godsEyeView.nepalCase.briefing;
    const s = b.director.state;
    return {
      now: b.clock.now(),
      key: s.entry?.key ?? null,
      status: s.status,
      index: s.index,
      total: s.total,
      caption: document.querySelector('.brf-caption.is-visible .brf-caption__text')?.textContent ?? '',
    };
  });
  if (vt % FRAME_MS === 0 && vt >= FROM_MS) {
    await settle();
    const name = `${String(Math.round(vt / 1000)).padStart(4, '0')}.jpg`;
    await page.screenshot({ path: `${OUT}/${name}`, type: 'jpeg', quality: 62 });
    frames.push({ vt, file: name, ...state });
    if (frames.length % 20 === 0) console.log(`${(vt / 1000).toFixed(0)} s  ${state.key}  (${((Date.now() - wallStart) / 1000).toFixed(0)} s wall)`);
  }
  if (state.status === 'finished') break;
  if (stopAt && state.key?.startsWith(`${stopAt}:`)) break;
  await page.evaluate((ms) => window.__godsEyeView.nepalCase.briefing.clock.advance(ms), STEP_MS);
  vt += STEP_MS;
  await settle();
  if (WAIT_MS) await new Promise((r) => setTimeout(r, WAIT_MS));
}
writeFileSync(`${OUT}/log.json`, JSON.stringify({ run: RUN, frameMs: FRAME_MS, frames, errors }, null, 1));
console.log(`frames ${frames.length}, briefing ${(vt / 1000).toFixed(1)} s, wall ${((Date.now() - wallStart) / 1000).toFixed(0)} s, errors ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log(' ', e);
await browser.close();
