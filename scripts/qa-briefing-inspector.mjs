#!/usr/bin/env node
/**
 * qa-briefing-inspector — Stage 9 §33, EXPLORE's map inspector in the real app.
 *
 * Opens the explore scene that shows each kind of object, clicks one of them
 * on the map (an on-screen one, projected the way the layer draws it: points
 * at sea level, clamped lines on the terrain), and records the card. Every
 * kind must be picked and described — earthquake, district, damage point,
 * blocked road, bridge, landslide, hospital, road, route — and a chart
 * element must cross-filter the map.
 *
 * Usage (against a production build: npm run build && npm run preview):
 *   node scripts/qa-briefing-inspector.mjs --url http://localhost:4173
 *
 * Screenshots and report.json go to qa-shots/briefing-inspector/. Exit 1 on any miss.
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
const OUT = path.join(ROOT, 'qa-shots', 'briefing-inspector');
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
page.on('response', (r) => {
  if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 160)}`);
});
await page.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.brf-begin:not([hidden])', { timeout: 120000 });
await page.waitForFunction(() => /READY/.test(document.querySelector('.ndi-top__stats')?.innerText ?? ''), { timeout: 120000 });
await page.evaluate(() => {
  [...document.querySelectorAll('.brf-begin button')].find((b) => b.textContent.trim() === 'EXPLORE').click();
});
await new Promise((r) => setTimeout(r, 1500));

const SCENES = ['case-card', 'locate', 'earthquake', 'sequence', 'shaking', 'exposure', 'overlap', 'descend', 'observed-damage', 'model-vs-observed', 'second-source', 'infrastructure', 'coverage-gap', 'network', 'route', 'people-and-damage', 'four-clocks', 'data-quality', 'scenarios'];

async function openScene(id) {
  await page.evaluate(async (index) => {
    const c = window.__godsEyeView.nepalCase;
    c.experience.investigation.goTo(index);
    await c.experience.whenSceneReady();
  }, SCENES.indexOf(id));
  /* Let geometry settle and a few frames draw. */
  await new Promise((r) => setTimeout(r, 4000));
}

/* The target's position is read in the page from the loaded data. */
async function clickTarget(kind, locate) {
  const onTerrain = !['earthquake', 'damage', 'bridge', 'hospital'].includes(kind);
  const result = await page.evaluate(async (kind, locateSrc, onTerrain) => {
    const c = window.__godsEyeView.nepalCase;
    const ctx = c.experience.inspectContext();
    const locateFn = new Function('ctx', 'access', `return (${locateSrc})(ctx, access);`);
    const access = await fetch('/data/analysis/nepal-2015-health-access.json').then((r) => r.json());
    /* The first candidate drawn inside the map column, clear of the rail, the panel and the header. */
    const box = document.querySelector('.ndi').getBoundingClientRect();
    const rail = document.querySelector('.ndi__rail')?.getBoundingClientRect();
    const panel = document.querySelector('.ndi__panel')?.getBoundingClientRect();
    const minX = (rail && rail.width ? rail.right : box.left) + 30;
    const maxX = (panel && panel.width ? panel.left : box.right) - 30;
    const inMap = (p) => p && p.x > minX && p.x < maxX && p.y > 110 && p.y < box.bottom - 140;
    const list = locateFn(ctx, access) ?? [];
    let target = null;
    let at = null;
    for (const t of list) {
      const p = c.inspector.project(t[0], t[1], { onTerrain });
      if (inMap(p)) {
        target = t;
        at = p;
        break;
      }
    }
    if (!target) return { error: `none of ${list.length} candidates is on screen` };
    await c.inspector.clickAt(at.x, at.y);
    const card = c.inspector.element;
    return {
      target,
      at,
      picked: c.inspector.current?.kind ?? null,
      hidden: card.hidden,
      text: card.innerText,
    };
  }, kind, locate.toString(), onTerrain);
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: `${OUT}/${kind}.jpg`, type: 'jpeg', quality: 70 });
  return result;
}

const mid = (line) => line[Math.floor(line.length / 2)];
const CASES = [
  ['earthquake', 'earthquake', (ctx) => [[ctx.intelligence.seismic.mainShock.longitude, ctx.intelligence.seismic.mainShock.latitude]]],
  ['district', 'overlap', () => [[85.33, 27.72], [85.0, 27.9], [84.7, 28.2]]],
  ['damage', 'observed-damage', (ctx) => ctx.data.unosat.map((f) => f.geometry.coordinates)],
  ['blockage', 'infrastructure', (ctx) => ctx.data.nga.blockedRoads.features.map((f) => { const l = f.geometry.coordinates; return l[Math.floor(l.length / 2)]; })],
  ['bridge', 'infrastructure', (ctx) => { const b = ctx.intelligence.raw.infrastructure.results.bridges; return [b[1], ...b].map((x) => [x.lon, x.lat]); }],
  ['landslide', 'infrastructure', (ctx) => ctx.intelligence.raw.infrastructure.results.landslides.map((l) => [l.lon, l.lat])],
  ['hospital', 'network', (ctx, access) => access.results.display.hospitals.filter((x) => x.district !== 'Kathmandu' && x.district !== 'Lalitpur' && x.district !== 'Bhaktapur').map((h) => [h.lon, h.lat])],
  ['road', 'network', (ctx, access) => {
    const points = [...access.results.display.hospitals, ...access.results.display.blockages];
    const far = ([lon, lat]) => points.every((h) => Math.hypot((h.lon - lon) * 98, (h.lat - lat) * 111) > 5);
    return ctx.data.graphEdges.filter((x) => x.highway === 'primary' && x.coordinates.length > 6).map((e) => e.coordinates[Math.floor(e.coordinates.length / 2)]).filter(far);
  }],
  ['route', 'route', (ctx) => { const l = ctx.data.route.baseline.coordinates; return [1 / 3, 1 / 2, 2 / 3, 1 / 4].map((f) => l[Math.floor(l.length * f)]); }],
];

const report = [];
let lastScene = null;
for (const [kind, scene, locate] of CASES) {
  if (scene !== lastScene) {
    await openScene(scene);
    lastScene = scene;
  }
  const t0 = Date.now();
  const r = await clickTarget(kind, locate);
  report.push({ kind, scene, ...r, ms: Date.now() - t0 });
  console.log(`\n=== ${kind} (${scene}) → picked ${r.picked}${r.error ? ` ERROR ${r.error}` : ''}\n${r.text ?? ''}`);
}

/* A chart element: the damage-composition segment in observed-damage. */
await openScene('observed-damage');
const chart = await page.evaluate(async () => {
  const hit = document.querySelector('.ndi__panel [role="button"][aria-pressed]');
  if (!hit) return { error: 'no clickable chart element' };
  const label = hit.getAttribute('aria-label') ?? hit.textContent;
  hit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 1500));
  return { label, pressed: hit.getAttribute('aria-pressed'), filter: window.__godsEyeView.nepalCase.experience.investigation.state.controls };
});
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: `${OUT}/chart.jpg`, type: 'jpeg', quality: 70 });
report.push({ kind: 'chart', scene: 'observed-damage', ...chart });
console.log(`\n=== chart element\n${JSON.stringify(chart)}`);

/* Nothing under the pointer: open sea of the plains, in a scene with no districts loaded. */
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ report, errors }, null, 1));
console.log(`\nerrors: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log('  ', e);
await browser.close();
const missed = report.filter((r) => (r.kind === 'chart' ? !r.label || r.filter?.damageClass == null : r.picked !== r.kind || r.hidden));
for (const r of missed) console.log(`FAIL  ${r.kind}: picked ${r.picked ?? 'nothing'}${r.error ? ` (${r.error})` : ''}`);
console.log(`${report.length - missed.length}/${report.length} kinds answered`);
process.exit(missed.length ? 1 : 0);
