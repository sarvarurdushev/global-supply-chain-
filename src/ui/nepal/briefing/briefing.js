/**
 * The executive briefing, assembled: director, stage, overlay, voice, sound,
 * captions, controls, and the BEGIN BRIEFING screen.
 *
 * The briefing OWNS THE MAP while it runs. The explore experience underneath
 * is suspended — its layers cleared, its camera left alone — so two systems
 * never draw on or fly the same globe. Leaving (E or Escape) pauses the
 * briefing, releases the map, and puts explore on the scene the briefing was
 * showing.
 */

import { createClock } from '../../../nepal/briefing/clock.js';
import {
  SPEEDS,
  STATUS,
  createDirector,
} from '../../../nepal/briefing/director.js';
import { RUNS, RUN_LABELS, planRun } from '../../../nepal/briefing/timeline.js';
import { createFactBook, fillTemplate } from '../../../nepal/briefing/facts.js';
import {
  BRIEFING_SCENES,
  ACT_TITLES,
} from '../../../nepal/briefing/scenes/index.js';
import { createBriefingOverlay } from './overlay.js';
import { createBriefingStage } from './stage.js';
import { createCaptions } from './captions.js';
import { createNarrator } from './narration.js';
import { createSoundBed } from './sound.js';

const GEOMETRY_URL = '/data/analysis/nepal-2015-briefing-geometry.json';
const ACCESS_URL = '/data/analysis/nepal-2015-health-access.json';

function el(tag, className, text, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/**
 * @param {object} input
 * @param {object} input.viewer Cesium viewer
 * @param {HTMLElement} input.host the case root (`.ndi`)
 * @param {()=>Promise<object>} input.getIntelligence resolves the loaded Tier 1 artefacts
 * @param {(on:boolean)=>void} input.suspendMap hands the map to or from explore
 * @param {(sceneId:string|null)=>void} input.onExplore called when the presenter leaves
 */
export function createBriefing({
  viewer,
  host,
  getIntelligence,
  suspendMap = () => {},
  onExplore = () => {},
  holdRender = () => {},
  releaseRender = () => {},
  requestRender = () => {},
  scope = null,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  win = globalThis.window,
  scenes = BRIEFING_SCENES,
}) {
  const root = el('div', 'brf-root');
  root.hidden = true;
  host.append(root);

  const clock = createClock();
  const narrator = createNarrator();
  const sound = createSoundBed();
  let overlay = null;
  let captions = null;
  let stage = null;
  let director = null;
  let geometry = null;
  /** The Stage 9 health-access analysis: the rescue scenes' facts and drawing. */
  let access = null;
  let book = null;
  let run = RUNS.SIX;
  let active = false;
  let provenanceOpen = false;
  /** The scope vignette state before the run, restored on leave. */
  let scopeBefore = null;

  /* ---------------------------------------------------------- the veil */
  const veilNode = el('div', 'brf-veil');
  const veil = {
    opacity: 0,
    set(to, ms) {
      veilNode.style.transition = ms
        ? `opacity ${ms / 1000 / clock.speed}s ease`
        : 'none';
      veilNode.style.opacity = String(to);
    },
  };

  /* ---------------------------------------------------------- chrome */
  const heading = el('div', 'brf-heading');
  const headingAct = el('div', 'brf-heading__act');
  const headingScene = el('div', 'brf-heading__scene');
  const headingQuestion = el('div', 'brf-heading__question');
  heading.append(headingAct, headingScene, headingQuestion);

  const controls = el('div', 'brf-controls', null, {
    role: 'toolbar',
    'aria-label': 'Briefing controls',
  });
  const button = (label, title, onClick, className = '') => {
    const b = el('button', `brf-btn ${className}`.trim(), label, {
      type: 'button',
      title,
      'aria-label': title,
    });
    b.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
    return b;
  };
  const back = button('← BACK', 'Previous beat (←)', () =>
    director?.previous(),
  );
  const playPause = button(
    '❚❚ PAUSE',
    'Pause or play (Space)',
    () => director?.toggle(),
    'brf-btn--primary',
  );
  const next = button('NEXT →', 'Next beat (→)', () => director?.next());
  const speed = button('1×', 'Presentation speed', () => {
    if (!director) return;
    const i = SPEEDS.indexOf(director.state.speed);
    director.setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
  });
  const voice = button(
    'VOICE',
    'Narration on or off',
    () => {
      narrator.setEnabled(!narrator.enabled);
      render();
    },
    'brf-btn--toggle',
  );
  const cc = button(
    'CC',
    'Captions on or off',
    () => {
      captions?.setEnabled(!captions.enabled);
      render();
    },
    'brf-btn--toggle',
  );
  const volume = el('input', 'brf-volume', null, {
    type: 'range',
    min: '0',
    max: '100',
    value: '50',
    title: 'Volume',
    'aria-label': 'Volume',
  });
  volume.addEventListener('input', () => {
    sound.setVolume(Number(volume.value) / 100);
    narrator.setVolume(Number(volume.value) / 100);
  });
  const replay = button('↺', 'Replay this beat (R)', () => director?.replay());
  const explore = button(
    'EXPLORE',
    'Leave the briefing for explore mode (E)',
    () => leave(),
  );
  const position = el('div', 'brf-position');
  const bar = el('div', 'brf-progress');
  const barFill = el('div', 'brf-progress__fill');
  bar.append(barFill);
  controls.append(
    back,
    playPause,
    next,
    speed,
    el('span', 'brf-sep'),
    voice,
    cc,
    volume,
    replay,
    el('span', 'brf-sep'),
    position,
    explore,
  );

  const provenance = el('div', 'brf-provenance');
  provenance.hidden = true;

  const begin = el('div', 'brf-begin');
  const beginCard = el('div', 'brf-begin__card');
  beginCard.append(
    el('div', 'brf-begin__kicker', 'NATURAL DISASTER INTELLIGENCE'),
    el('div', 'brf-begin__title', 'EXECUTIVE SITUATION BRIEFING'),
    el('div', 'brf-begin__case', 'CASE 001 — NEPAL EARTHQUAKE 2015'),
  );
  const go = button(
    'BEGIN BRIEFING',
    'Begin the six-minute briefing',
    () => start(RUNS.SIX),
    'brf-begin__go',
  );
  const runRow = el('div', 'brf-begin__runs');
  runRow.append(
    button(RUN_LABELS.three, 'Three-minute executive briefing', () =>
      start(RUNS.THREE),
    ),
    button(RUN_LABELS.six, 'Six-minute briefing', () => start(RUNS.SIX)),
    button(RUN_LABELS.full, 'Full analysis', () => start(RUNS.FULL)),
    button('EXPLORE', 'Explore the case yourself', () => leave()),
  );
  beginCard.append(
    go,
    runRow,
    el(
      'div',
      'brf-begin__note',
      'Narration and sound start when you begin. ← → beats · Space pause · E explore · I sources · R replay',
    ),
  );
  begin.append(beginCard);

  root.append(veilNode, heading, provenance, controls, bar, begin);

  /* ---------------------------------------------------------- state view */
  function render() {
    const s = director?.state;
    root.classList.toggle('is-playing', s?.status === STATUS.PLAYING);
    playPause.textContent =
      s?.status === STATUS.PLAYING ? '❚❚ PAUSE' : '▶ PLAY';
    speed.textContent = `${s?.speed ?? 1}×`;
    voice.classList.toggle('is-on', narrator.enabled && narrator.available);
    voice.title = narrator.available
      ? `Narration: ${narrator.voiceName}`
      : narrator.voiceCount
        ? 'Narration on or off'
        : 'No speech voice in this browser — captions carry the briefing';
    cc.classList.toggle('is-on', captions?.enabled ?? true);
    back.disabled = !s || s.index <= 0;
    next.disabled = !s || s.index >= s.total - 1;
    const entry = s?.entry;
    if (entry) {
      const scene = entry.scene;
      headingAct.textContent = ACT_TITLES[scene.act] ?? '';
      headingScene.textContent = `${String(scene.number).padStart(2, '0')} · ${scene.title.toUpperCase()}`;
      headingQuestion.textContent = scene.question;
      position.textContent = `${RUN_LABELS[run]} · ${s.index + 1} / ${s.total}`;
    }
    root.setAttribute('data-beat', entry?.key ?? '');
    root.setAttribute('data-status', s?.status ?? 'idle');
    if (provenanceOpen) renderProvenance();
  }

  function progressTick() {
    if (!active) return;
    const s = director?.state;
    if (s && s.total) {
      const beatMs = director.currentBeatMs() || 1;
      const within = s.beatDone ? 1 : Math.min(1, s.elapsedInBeatMs / beatMs);
      barFill.style.width = `${((s.index + within) / s.total) * 100}%`;
    }
    requestAnimationFrame(progressTick);
  }

  /** The facts behind the current beat, with source, class and record. */
  function renderProvenance() {
    const entry = director?.state.entry;
    provenance.replaceChildren();
    if (!entry || !book) return;
    const ids = new Set();
    for (const action of entry.beat.actions)
      if (action.fact) ids.add(action.fact);
    const refs =
      `${entry.beat.narration ?? ''} ${entry.beat.caption ?? ''}`.matchAll(
        /\{([a-zA-Z0-9_.]+?)(?:\.[A-Za-z ]+)?(?:\|[a-zA-Z0-9]+)?\}/g,
      );
    for (const [, ref] of refs) {
      const parts = ref.split('.');
      for (let n = parts.length; n >= 2; n -= 1) {
        const id = parts.slice(0, n).join('.');
        if (book.has(id)) {
          ids.add(id);
          break;
        }
      }
    }
    provenance.append(
      el('div', 'brf-provenance__title', 'WHERE THESE FIGURES COME FROM'),
    );
    if (!ids.size)
      provenance.append(
        el('div', 'brf-provenance__row', 'This beat states no figure.'),
      );
    for (const id of ids) {
      const fact = book.get(id);
      const row = el('div', 'brf-provenance__row');
      row.append(
        el('span', 'brf-provenance__source', fact.source),
        el(
          'span',
          `brf-provenance__class brf-tag--${String(fact.cls)
            .toLowerCase()
            .replace(/[^a-z]+/g, '-')}`,
          String(fact.cls).replace('_', ' '),
        ),
        el(
          'span',
          'brf-provenance__path',
          `${fact.artefact}: ${fact.path.join('.')}${fact.record ? ` · record ${fact.record}` : ''}`,
        ),
      );
      provenance.append(row);
    }
  }

  /* ---------------------------------------------------------- lifecycle */

  async function ensureAssets() {
    if (!geometry) {
      const [geometryResponse, accessResponse] = await Promise.all([
        fetchImpl(GEOMETRY_URL),
        fetchImpl(ACCESS_URL),
      ]);
      if (!geometryResponse.ok)
        throw new Error(`Briefing geometry: HTTP ${geometryResponse.status}`);
      if (!accessResponse.ok)
        throw new Error(
          `Health access analysis: HTTP ${accessResponse.status}`,
        );
      [geometry, access] = await Promise.all([
        geometryResponse.json(),
        accessResponse.json(),
      ]);
    }
    if (!book) {
      const intelligence = await getIntelligence();
      /* The geometry artefact carries two facts of its own: the district count and the epicentre's district. */
      book = createFactBook({ ...intelligence.raw, geometry, access });
    }
    if (!overlay) {
      overlay = createBriefingOverlay({
        viewer,
        container: root,
        clock,
        holdRender,
        releaseRender,
      });
      root.insertBefore(overlay.root, veilNode.nextSibling);
      captions = createCaptions({ container: root, clock });
      stage = createBriefingStage({
        viewer,
        overlay,
        clock,
        book,
        geometry,
        narrator,
        sound,
        captions,
        holdRender,
        releaseRender,
        requestRender,
        veil,
      });
    }
  }

  function onKey(event) {
    if (!active) return;
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const key = event.key;
    let handled = true;
    if (key === 'ArrowRight') director?.next();
    else if (key === 'ArrowLeft') director?.previous();
    else if (key === ' ') director?.toggle();
    else if (key === 'Escape' || key === 'e' || key === 'E') leave();
    else if (key === 'p' || key === 'P') director?.play();
    else if (key === 'r' || key === 'R') director?.replay();
    else if (key === 'i' || key === 'I') {
      provenanceOpen = !provenanceOpen;
      provenance.hidden = !provenanceOpen;
      render();
    } else handled = false;
    if (handled) event.preventDefault?.();
  }

  /**
   * Start a run. `sceneId` opens it at that scene rather than the first —
   * the explore inspector's "play this in the briefing".
   */
  async function start(which = RUNS.SIX, { sceneId = null } = {}) {
    run = which;
    root.hidden = false;
    begin.hidden = true;
    root.classList.add('is-running');
    /* A user gesture: the one moment audio may be unlocked. */
    void sound.unlock();
    active = true;
    suspendMap(true);
    if (scope && scopeBefore === null) {
      scopeBefore = scope.isEnabled();
      scope.setEnabled(false);
    }
    await ensureAssets();
    director?.destroy();
    director = createDirector({
      plan: planRun(scenes, run),
      stage,
      clock,
      onChange: () => render(),
    });
    sound.cue('ambience');
    director.play();
    if (sceneId) director.goToScene(sceneId);
    render();
    requestAnimationFrame(progressTick);
    return director;
  }

  function leave() {
    const sceneId = director?.state.entry?.scene.explore ?? null;
    director?.pause();
    active = false;
    root.hidden = true;
    begin.hidden = true;
    root.classList.remove('is-running');
    overlay?.clear({ instant: true });
    captions?.show(null);
    veil.set(0, 0);
    narrator.cancel();
    sound.suspend();
    suspendMap(false);
    if (scope && scopeBefore !== null) {
      scope.setEnabled(scopeBefore);
      scopeBefore = null;
    }
    onExplore(sceneId);
  }

  win?.addEventListener?.('keydown', onKey);

  return Object.freeze({
    element: root,
    get director() {
      return director;
    },
    get active() {
      return active;
    },
    get geometry() {
      return geometry;
    },
    /** For QA: what is drawn, and the briefing clock. */
    get overlay() {
      return overlay;
    },
    get clock() {
      return clock;
    },
    get narrator() {
      return narrator;
    },
    /** The opening screen: identity and the four ways in. */
    showBegin() {
      root.hidden = false;
      begin.hidden = false;
      active = false;
    },
    start,
    leave,
    /** For tests and the script generator: fill a template against the loaded facts. */
    fill: (text) => (book ? fillTemplate(text, book) : text),
    destroy() {
      win?.removeEventListener?.('keydown', onKey);
      director?.destroy();
      overlay?.destroy();
      captions?.destroy();
      narrator.destroy();
      sound.destroy();
      root.remove();
    },
  });
}
