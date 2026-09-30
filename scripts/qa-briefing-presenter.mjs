#!/usr/bin/env node
/**
 * qa-briefing-presenter — Stage 9.1 §13–15: the briefing driven the way a
 * nervous presenter drives it, with a speech engine that talks.
 *
 * A headless browser has no voices, so this page gets a stand-in speech
 * engine before the app loads: six English voices of the kinds real browsers
 * offer (a natural online voice, a Google voice, two local system voices, a
 * macOS novelty voice, eSpeak), one utterance at a time, word boundaries at
 * 2.5 words a second, `cancel` interrupting as Chrome does. Everything it is
 * asked to say is logged, so the checks can ask what was audible and when.
 *
 * 1. VOICE — the natural voice is chosen by default, the novelty voice is
 *    listed last, choosing another voice previews it and survives a reload.
 * 2. CHAOS — NEXT and BACK pressed at random moments of the 6 MIN run: during
 *    flights, typing, charts, speech and route traces. After every press the
 *    old line must stop at once, anything spoken afterwards must belong to
 *    the new beat, and no object from another scene may be left drawn.
 * 3. PAUSE — mid-sentence: silence and a frozen clock; PLAY says the
 *    interrupted sentence again from its start.
 * 4. VOICE OFF — nothing is spoken and the captions carry the run.
 * 5. CAPTIONS OFF, VOICE ON — no caption, and the voice goes on.
 *
 * Usage (production build: npm run build && npm run preview):
 *   node scripts/qa-briefing-presenter.mjs --url http://localhost:4173 [--presses 30] [--seed 7]
 *
 * Screenshots and report.json go to qa-shots/briefing-presenter/. Exit 1 on any FAIL.
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
const PRESSES = Number(getOpt('--presses', '30'));
let seed = Number(getOpt('--seed', '7'));
/* A seeded generator, so a failing sequence of presses can be replayed. */
const random = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'qa-shots', 'briefing-presenter');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------ the stand-in engine */

function installSpeechEngine() {
  const voices = [
    {
      name: 'Microsoft Ryan Online (Natural) - English (United Kingdom)',
      lang: 'en-GB',
      localService: false,
      default: false,
      voiceURI: 'ryan-online',
    },
    {
      name: 'Google UK English Male',
      lang: 'en-GB',
      localService: false,
      default: false,
      voiceURI: 'google-uk-male',
    },
    {
      name: 'Daniel',
      lang: 'en-GB',
      localService: true,
      default: false,
      voiceURI: 'daniel',
    },
    {
      name: 'Samantha',
      lang: 'en-US',
      localService: true,
      default: true,
      voiceURI: 'samantha',
    },
    {
      name: 'Albert',
      lang: 'en-US',
      localService: true,
      default: false,
      voiceURI: 'albert',
    },
    {
      name: 'eSpeak English',
      lang: 'en',
      localService: true,
      default: false,
      voiceURI: 'espeak-en',
    },
  ];
  const log = { started: [], words: 0, cancels: 0, maxActive: 0, active: 0 };
  let queue = [];
  let speaking = null;
  let paused = false;
  let timer = null;
  const WPS = 2.5;
  function finish(s, kind) {
    clearTimeout(timer);
    speaking = null;
    log.active -= 1;
    if (kind === 'end') s.u.onend?.({ utterance: s.u });
    else s.u.onerror?.({ utterance: s.u, error: kind });
  }
  function startNext() {
    if (speaking || paused || !queue.length) return;
    const u = queue.shift();
    speaking = { u, words: u.text.split(/\s+/).filter(Boolean), i: 0 };
    log.active += 1;
    log.maxActive = Math.max(log.maxActive, log.active);
    log.started.push({
      t: performance.now(),
      text: u.text,
      voice: u.voice?.name ?? null,
    });
    u.onstart?.({ utterance: u });
    tick();
  }
  function tick() {
    clearTimeout(timer);
    if (!speaking || paused) return;
    const s = speaking;
    if (s.i >= s.words.length) {
      finish(s, 'end');
      startNext();
      return;
    }
    s.u.onboundary?.({
      name: 'word',
      charIndex: s.words.slice(0, s.i).join(' ').length,
      utterance: s.u,
    });
    log.words += 1;
    s.i += 1;
    timer = setTimeout(tick, 1000 / (WPS * (s.u.rate || 1)));
  }
  const listeners = new Set();
  const synth = {
    getVoices: () => voices,
    speak(u) {
      queue.push(u);
      startNext();
    },
    cancel() {
      log.cancels += 1;
      const dropped = queue;
      queue = [];
      if (speaking) finish(speaking, 'interrupted');
      for (const u of dropped) u.onerror?.({ utterance: u, error: 'canceled' });
    },
    pause() {
      paused = true;
      clearTimeout(timer);
    },
    resume() {
      paused = false;
      tick();
      startNext();
    },
    get speaking() {
      return Boolean(speaking);
    },
    get pending() {
      return queue.length > 0;
    },
    get paused() {
      return paused;
    },
    addEventListener: (type, fn) =>
      type === 'voiceschanged' && listeners.add(fn),
    removeEventListener: (type, fn) => listeners.delete(fn),
  };
  class Utterance {
    constructor(text) {
      this.text = text;
      this.rate = 1;
      this.pitch = 1;
      this.volume = 1;
      this.voice = null;
      this.lang = '';
    }
  }
  Object.defineProperty(window, 'speechSynthesis', {
    value: synth,
    configurable: true,
  });
  window.SpeechSynthesisUtterance = Utterance;
  window.__speech = { log, current: () => speaking?.u.text ?? null };
}

/* ------------------------------------------------------------ harness */

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
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.evaluateOnNewDocument(installSpeechEngine);
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 300));
});
page.on('pageerror', (e) =>
  errors.push(`pageerror: ${String(e).slice(0, 400)}`),
);

const results = [];
const check = (name, passed, detail) => {
  results.push({ name, passed: Boolean(passed), detail });
  console.log(
    `${passed ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `  — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600)}` : ''}`,
  );
};
const clickControl = (prefix) =>
  page.evaluate((prefix) => {
    const button = [...document.querySelectorAll('.brf-root button')].find(
      (b) => b.textContent.trim().startsWith(prefix) && b.offsetParent !== null,
    );
    button?.click();
    return Boolean(button);
  }, prefix);
const openApp = async () => {
  await page.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.brf-begin:not([hidden])', { timeout: 180000 });
  await page.waitForFunction(
    () =>
      /READY/.test(document.querySelector('.ndi-top__stats')?.innerText ?? ''),
    { timeout: 180000 },
  );
  await sleep(800);
};
const startRun = async (label) => {
  await page.evaluate(
    (label) =>
      [...document.querySelectorAll('.brf-begin button')]
        .find((b) => b.textContent.trim() === label)
        .click(),
    label,
  );
  await page.waitForFunction(
    () =>
      window.__godsEyeView?.nepalCase?.briefing?.director?.state?.index >= 0,
    { timeout: 60000 },
  );
};

/* ------------------------------------------------------------ 1. voice */

await openApp();
const voiceState = await page.evaluate(() => {
  const n = window.__godsEyeView.nepalCase.briefing.narrator;
  const select = document.querySelector('.brf-begin .brf-voice__select');
  return {
    chosen: n.voiceName,
    options: [...(select?.options ?? [])].map((o) => o.textContent),
    selected: select?.selectedOptions?.[0]?.textContent ?? null,
  };
});
check(
  'the natural en-GB voice is chosen when nobody has chosen',
  /Ryan Online \(Natural\)/.test(voiceState.chosen ?? ''),
  voiceState.chosen,
);
check(
  'the picker lists every English voice, the novelty voice last',
  voiceState.options.length === 6 && /Albert/.test(voiceState.options.at(-1)),
  voiceState.options,
);
const picked = await page.evaluate(async () => {
  const select = document.querySelector('.brf-begin .brf-voice__select');
  const daniel = [...select.options].find((o) => /^Daniel/.test(o.textContent));
  select.value = daniel.value;
  select.dispatchEvent(new Event('change'));
  await new Promise((r) => setTimeout(r, 300));
  const last = window.__speech.log.started.at(-1);
  return {
    voice: last?.voice,
    text: last?.text,
    narrator: window.__godsEyeView.nepalCase.briefing.narrator.voiceName,
  };
});
check(
  'choosing a voice previews it with that voice',
  picked.voice === 'Daniel' && /Magnitude/.test(picked.text ?? ''),
  picked,
);
await openApp();
const remembered = await page.evaluate(
  () => window.__godsEyeView.nepalCase.briefing.narrator.voiceName,
);
check(
  'the chosen voice survives a reload',
  /^Daniel/.test(remembered ?? ''),
  remembered,
);

/* ------------------------------------------------------------ 2. chaos */

await startRun('6 MIN BRIEFING');
await sleep(3000);
const presses = [];
const orphanReports = [];
for (let i = 0; i < PRESSES; i += 1) {
  await sleep(300 + random() * 3200);
  const action = random() < 0.72 ? 'NEXT' : '← BACK';
  const r = await page.evaluate(async (action) => {
    const b = window.__godsEyeView.nepalCase.briefing;
    const d = b.director;
    const sp = window.__speech;
    const t0 = performance.now();
    const before = { key: d.state.entry?.key, speaking: sp.current() };
    [...document.querySelectorAll('.brf-root button')]
      .find((x) => x.textContent.trim().startsWith(action))
      .click();
    const key = d.state.entry?.key;
    const narration = b
      .fill(d.state.entry?.beat?.narration ?? '')
      .replace(/\s+/g, ' ');
    const at120 = await new Promise((r) =>
      setTimeout(() => r(sp.current()), 120),
    );
    await new Promise((r) => setTimeout(r, 900));
    const startedAfter = sp.log.started
      .filter((s) => s.t > t0 + 5)
      .map((s) => s.text);
    /* Only this press's beat, if the run has not moved on by itself meanwhile. */
    const stillSame = d.state.entry?.key === key;
    return {
      action,
      before,
      key,
      narration,
      at120,
      startedAfter,
      stillSame,
      status: d.state.status,
    };
  }, action);
  const belongs = (text) =>
    !text || r.narration.includes(text.replace(/\s+/g, ' '));
  r.oldStopped =
    r.at120 === null || r.at120 !== r.before.speaking || belongs(r.at120);
  r.onlyNewBeat = !r.stillSame || r.startedAfter.every(belongs);
  presses.push(r);
  if (i % 6 === 5)
    await page.screenshot({
      path: `${OUT}/chaos-${String(i).padStart(2, '0')}.jpg`,
      type: 'jpeg',
      quality: 65,
    });
  /* Every few presses: let the beat settle, then look for anything drawn that this scene did not draw. */
  if (i % 4 === 3) {
    await sleep(2500);
    const orphans = await page.evaluate(() => {
      const b = window.__godsEyeView.nepalCase.briefing;
      const e = b.director.state.entry;
      const ids = new Set(e.scene.keep ?? []);
      const add = (a) => {
        if (a.type === 'layer.show')
          ids.add(
            a.id ??
              (a.layer === 'population' && a.highHighOnly
                ? 'population-hot'
                : a.layer),
          );
        else if (
          [
            'annotation.draw',
            'metric.count',
            'chart.enter',
            'route.trace',
          ].includes(a.type)
        )
          ids.add(a.id);
        else if (a.type === 'question.show') ids.add('question');
        else if (a.type === 'title.type') ids.add(a.id ?? 'title');
      };
      (e.scene.setup ?? []).forEach(add);
      e.scene.beats
        .slice(0, e.beatIndex + 1)
        .forEach((beat) => beat.actions.forEach(add));
      /* A layer that draws a companion with it. */
      if (ids.has('no-road')) ids.add('envelope');
      return {
        key: e.key,
        orphans: [...b.overlay.items.keys()].filter((id) => !ids.has(id)),
      };
    });
    orphanReports.push(orphans);
  }
}
const late = presses.filter((p) => !p.oldStopped);
check(
  `NEXT/BACK stop the line being spoken within 120 ms (${PRESSES} random presses)`,
  late.length === 0,
  late.map((p) => [p.before.key, p.key, p.at120]),
);
const foreign = presses.filter((p) => !p.onlyNewBeat);
check(
  'after a press, only the new beat’s narration is spoken',
  foreign.length === 0,
  foreign.map((p) => [p.key, p.startedAfter]),
);
const maxActive = await page.evaluate(() => window.__speech.log.maxActive);
check('never two voices at once', maxActive <= 1, { maxActive });
const orphaned = orphanReports.filter((o) => o.orphans.length);
check(
  'no callout, chart or route from another scene is left drawn',
  orphaned.length === 0,
  orphaned,
);

/* ------------------------------------------------------------ 3. pause mid-sentence */

let pauseResult = null;
for (let attempt = 0; attempt < 12 && !pauseResult; attempt += 1) {
  await sleep(700);
  pauseResult = await page.evaluate(async () => {
    const b = window.__godsEyeView.nepalCase.briefing;
    const sp = window.__speech;
    const sentence = sp.current();
    if (!sentence || b.director.state.status !== 'playing') return null;
    [...document.querySelectorAll('.brf-root button')]
      .find((x) => /PAUSE/.test(x.textContent))
      .click();
    await new Promise((r) => setTimeout(r, 150));
    const words0 = sp.log.words;
    const clock0 = b.clock.now();
    await new Promise((r) => setTimeout(r, 2000));
    const silent = sp.log.words === words0 && sp.current() === null;
    const frozen = b.clock.now() === clock0;
    const startedBefore = sp.log.started.length;
    [...document.querySelectorAll('.brf-root button')]
      .find((x) => /PLAY/.test(x.textContent))
      .click();
    await new Promise((r) => setTimeout(r, 400));
    const again = sp.log.started.slice(startedBefore).map((s) => s.text);
    return { sentence, silent, frozen, again };
  });
}
check(
  'PAUSE mid-sentence: silence and a frozen clock',
  pauseResult?.silent && pauseResult?.frozen,
  pauseResult,
);
check(
  'PLAY says the interrupted sentence again from its start',
  pauseResult?.again?.[0] === pauseResult?.sentence,
  pauseResult?.again,
);

/* ------------------------------------------------------------ 4. voice off */

/*
 * A fresh page for the audio modes: after the chaos section, software WebGL
 * can run out of shader resources and stop drawing the globe (an environment
 * limit, docs/NEPAL_2015_STAGE_9_1_LOCAL_QA.md), which says nothing about the
 * controls checked here.
 */
await openApp();
await startRun('6 MIN BRIEFING');
await clickControl('VOICE');
/*
 * Waits are on the briefing, not the wall clock: under software rendering the
 * briefing clock can run far slower than real time.
 */
const voiceOff = await page.evaluate(async () => {
  const sp = window.__speech;
  const b = window.__godsEyeView.nepalCase.briefing;
  const n0 = sp.log.started.length;
  const i0 = b.director.state.index;
  const captions = [];
  const t0 = performance.now();
  while (b.director.state.index < i0 + 2 && performance.now() - t0 < 90000) {
    await new Promise((r) => setTimeout(r, 500));
    captions.push(
      document.querySelector('.brf-caption.is-visible .brf-caption__text')
        ?.textContent ?? '',
    );
  }
  /* A caption may be blank for the instant between two beats; what matters is that each beat's caption appeared. */
  return {
    spoken: sp.log.started.length - n0,
    moved: b.director.state.index - i0,
    captions: [...new Set(captions.filter(Boolean))],
  };
});
await page.screenshot({
  path: `${OUT}/voice-off.jpg`,
  type: 'jpeg',
  quality: 70,
});
check(
  'VOICE OFF: nothing is spoken, the run goes on, the captions carry it',
  voiceOff.spoken === 0 &&
    voiceOff.moved >= 2 &&
    voiceOff.captions.filter(Boolean).length >= 2,
  voiceOff,
);

/* ------------------------------------------------------------ 5. captions off, voice on */

await clickControl('VOICE');
await clickControl('CC');
const ccOff = await page.evaluate(async () => {
  const sp = window.__speech;
  const b = window.__godsEyeView.nepalCase.briefing;
  const n0 = sp.log.started.length;
  const i0 = b.director.state.index;
  const seen = [];
  const t0 = performance.now();
  /* Until a new beat has started speaking, or 90 s of wall time. */
  while (
    (b.director.state.index === i0 || sp.log.started.length === n0) &&
    performance.now() - t0 < 90000
  ) {
    await new Promise((r) => setTimeout(r, 500));
    seen.push(
      Boolean(
        document.querySelector('.brf-caption.is-visible .brf-caption__text')
          ?.textContent,
      ),
    );
  }
  return {
    spoken: sp.log.started.length - n0,
    moved: b.director.state.index - i0,
    captionShown: seen.some(Boolean),
  };
});
await page.screenshot({
  path: `${OUT}/captions-off.jpg`,
  type: 'jpeg',
  quality: 70,
});
check(
  'CAPTIONS OFF, VOICE ON: no caption, and the voice goes on',
  ccOff.spoken >= 1 && !ccOff.captionShown,
  ccOff,
);
await clickControl('CC');

/* The software renderer's shader-compile failure is reported, not counted as an application error. */
const RENDERER_LIMIT =
  /Fragment shader failed to compile|Rendering has stopped/;
const rendererErrors = errors.filter((e) => RENDERER_LIMIT.test(e));
const pageErrors = errors.filter(
  (e) => !/Failed to load resource/.test(e) && !RENDERER_LIMIT.test(e),
);
if (rendererErrors.length)
  console.log(
    `NOTE  software WebGL stopped drawing ${rendererErrors.length} time(s) (environment limit, not checked here)`,
  );
check(
  'no page errors through all of it',
  pageErrors.length === 0,
  pageErrors.slice(0, 5),
);
fs.writeFileSync(
  `${OUT}/report.json`,
  JSON.stringify({ results, presses, orphanReports, errors }, null, 1),
);
console.log(
  `\n${results.filter((r) => r.passed).length}/${results.length} passed`,
);
await browser.close();
process.exit(results.every((r) => r.passed) ? 0 : 1);
