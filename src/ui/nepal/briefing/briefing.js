/**
 * The executive briefing, assembled: director, stage, overlay, voice, score,
 * sound, captions, controls, and the BEGIN BRIEFING screen.
 *
 * AUDIO is one mixer (audio.js) with three buses: the VOICE (neural clips or
 * the system voice, narration.js), the MUSIC (the generated score, score.js)
 * and the SFX (short accents, sound.js). Nothing sounds until BEGIN, the
 * music ducks under the voice, and the presenter sets each before starting:
 * voice and preview, voice volume, music on/off and volume, captions.
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
import {
  RUNS,
  RUN_LABELS,
  planRun,
  setNarrationMeasure,
} from '../../../nepal/briefing/timeline.js';
import { createFactBook, fillTemplate } from '../../../nepal/briefing/facts.js';
import {
  BRIEFING_SCENES,
  ACT_TITLES,
} from '../../../nepal/briefing/scenes/index.js';
import { createBriefingOverlay } from './overlay.js';
import { createBriefingStage } from './stage.js';
import { createCaptions } from './captions.js';
import { GLOSSARY, GLOSSARY_ORDER } from '../../../nepal/briefing/glossary.js';
import { createAudioEngine } from './audio.js';
import { createNarrator } from './narration.js';
import { createScore } from './score.js';
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
  /*
   * `?narration=simulated` is for QA recordings only: speech is replaced by
   * the briefing clock, so a browser with no voices still runs at voiced pace.
   */
  const simulated = (() => {
    try {
      return (
        new URLSearchParams(win?.location?.search ?? '').get('narration') ===
        'simulated'
      );
    } catch {
      return false;
    }
  })();
  const engine = createAudioEngine();
  const narrator = createNarrator({ clock, simulate: simulated, engine });
  const sound = createSoundBed({ engine });
  const score = createScore({ engine });
  let musicOn = true;
  /*
   * With the neural clips loaded, a beat lasts exactly as long as its clips
   * say — the director's timing, the progress bar and the run estimate all
   * read the real voice. Without them, the estimate in the line's delivery.
   */
  setNarrationMeasure((beat) =>
    book
      ? narrator.measureMs(fillTemplate(beat.narration, book), beat.prosody)
      : null,
  );
  void narrator.load().then(() => render());
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
  /** The technical layer: method, definitions and sources beside the beat. */
  let technicalOn = false;
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
  /* VOICE and MUSIC mute in place: the run keeps its pace, the captions carry the words. */
  const voice = button(
    'VOICE',
    'Mute or unmute the narration',
    () => {
      narrator.setMuted(!narrator.muted);
      render();
    },
    'brf-btn--toggle',
  );
  const music = button(
    'MUSIC',
    'Music on or off',
    () => setMusic(!musicOn),
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
  const technical = button(
    'TECH',
    'Technical layer: method, definitions and sources for this beat (I)',
    () => setTechnical(!technicalOn),
    'brf-btn--toggle',
  );
  const glossaryButton = button(
    '?',
    'Glossary: every term the briefing uses, in plain words (G)',
    () => setGlossary(glossaryPanel.hidden),
    'brf-btn--icon',
  );
  const replay = button('↺', 'Replay this beat (R)', () => director?.replay());
  /* A fallback is never hidden: when the neural voice is not speaking, the bar says so. */
  const voiceBadge = el('div', 'brf-voice-badge');

  function setMusic(on) {
    musicOn = Boolean(on);
    engine.setMuted('music', !musicOn);
    render();
  }

  /** Controls that exist twice (BEGIN card and settings pop-over) re-read state here. */
  const syncers = [];

  /*
   * The voice picker: the neural voices first, then every English system
   * voice best first, with a preview. Used on the BEGIN screen and in the
   * settings pop-over, so a presenter can choose before starting or mid-run.
   */
  function voicePicker() {
    const wrap = el('div', 'brf-voice');
    const select = el('select', 'brf-voice__select', null, {
      'aria-label': 'Narration voice',
    });
    const preview = button(
      '▶ PREVIEW',
      'Hear this voice',
      () => {
        /* PREVIEW is a gesture: the mixer may start here. */
        void engine.unlock();
        narrator.preview(select.value);
      },
      'brf-voice__preview',
    );
    const note = el('div', 'brf-voice__note');
    const TIERS = {
      NEURAL: ' · neural',
      NATURAL: ' · system, natural',
      SYSTEM: ' · system',
      BASIC: ' · system, basic',
      NOVELTY: ' · novelty',
    };
    function fill() {
      const list = narrator.voices;
      select.replaceChildren(
        ...list.map((v) => {
          const option = el('option', null, `${v.label}${TIERS[v.tier] ?? ''}`);
          option.value = v.id;
          return option;
        }),
      );
      select.value = narrator.voiceId ?? '';
      const none = list.length === 0;
      select.hidden = none;
      preview.hidden = none || narrator.simulated;
      const status = narrator.status;
      note.textContent = `${status.label}${status.detail ? ` — ${status.detail}` : ''}`;
      note.setAttribute('data-tier', status.tier);
    }
    select.addEventListener('change', () => {
      narrator.setVoice(select.value);
      void engine.unlock();
      narrator.preview(select.value);
      render();
    });
    narrator.onChange(fill);
    fill();
    wrap.append(el('div', 'brf-voice__label', 'VOICE'), select, preview, note);
    return wrap;
  }

  /** Voice volume, music on/off and volume, captions: before BEGIN and during the run. */
  function mixer() {
    const wrap = el('div', 'brf-mixer');
    const slider = (label, value, onInput) => {
      const input = el('input', 'brf-volume', null, {
        type: 'range',
        min: '0',
        max: '100',
        value: String(Math.round(value * 100)),
        'aria-label': label,
        title: label,
      });
      input.addEventListener('input', () => onInput(Number(input.value) / 100));
      return input;
    };
    const voiceVolume = slider('Voice volume', narrator.volume, (v) =>
      narrator.setVolume(v),
    );
    const musicToggle = button(
      'ON',
      'Music on or off',
      () => setMusic(!musicOn),
      'brf-btn--toggle',
    );
    const musicVolume = slider(
      'Music volume',
      engine.level('music') / 0.6,
      (v) => engine.setLevel('music', v * 0.6),
    );
    const captionToggle = button(
      'ON',
      'Captions on or off',
      () => {
        captionsWanted = !captionsWanted;
        captions?.setEnabled(captionsWanted);
        render();
      },
      'brf-btn--toggle',
    );
    syncers.push(() => {
      musicToggle.textContent = musicOn ? 'ON' : 'OFF';
      musicToggle.classList.toggle('is-on', musicOn);
      musicVolume.disabled = !musicOn;
      const cOn = captions?.enabled ?? captionsWanted;
      captionToggle.textContent = cOn ? 'ON' : 'OFF';
      captionToggle.classList.toggle('is-on', cOn);
      voiceVolume.value = String(Math.round(narrator.volume * 100));
      musicVolume.value = String(
        Math.round((engine.level('music') / 0.6) * 100),
      );
    });
    wrap.append(
      el('div', 'brf-mixer__label', 'VOICE VOLUME'),
      voiceVolume,
      el('span'),
      el('div', 'brf-mixer__label', 'MUSIC'),
      musicVolume,
      musicToggle,
      el('div', 'brf-mixer__label', 'CAPTIONS'),
      el('span'),
      captionToggle,
    );
    return wrap;
  }
  /* Captions chosen on the BEGIN screen, before the captions exist. */
  let captionsWanted = true;

  const settings = el('div', 'brf-settings', null, {
    role: 'dialog',
    'aria-label': 'Audio and narration settings',
  });
  settings.hidden = true;
  settings.append(voicePicker(), mixer());
  const settingsButton = button(
    '⚙',
    'Voice, music and caption settings',
    () => {
      settings.hidden = !settings.hidden;
    },
    'brf-btn--icon',
  );
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
    music,
    cc,
    settingsButton,
    el('span', 'brf-sep'),
    technical,
    glossaryButton,
    replay,
    el('span', 'brf-sep'),
    voiceBadge,
    position,
    explore,
  );

  const provenance = el('div', 'brf-provenance');
  provenance.hidden = true;

  /* ---------------------------------------------------------- glossary */
  /*
   * Every term the briefing uses, in plain words (Level 1). The technical
   * layer adds each term's precise definition (Level 2) beneath it.
   */
  const glossaryPanel = el('div', 'brf-glossary', null, {
    role: 'dialog',
    'aria-label': 'Glossary',
  });
  glossaryPanel.hidden = true;
  {
    const head = el('div', 'brf-glossary__head');
    head.append(
      el('div', 'brf-glossary__title', 'GLOSSARY · WHAT THE TERMS MEAN'),
      button(
        '×',
        'Close the glossary',
        () => setGlossary(false),
        'brf-glossary__close',
      ),
    );
    const list = el('dl', 'brf-glossary__list');
    for (const key of GLOSSARY_ORDER) {
      const term = GLOSSARY[key];
      const dt = el('dt', 'brf-glossary__term', term.term);
      if (term.expansion)
        dt.append(
          el('span', 'brf-glossary__expansion', ` · ${term.expansion}`),
        );
      const dd = el('dd', 'brf-glossary__plain', term.plain);
      const detail = el('dd', 'brf-glossary__detail', term.detail);
      list.append(dt, dd, detail);
    }
    glossaryPanel.append(head, list);
  }
  function setGlossary(on) {
    glossaryPanel.hidden = !on;
    render();
  }

  /* ---------------------------------------------------------- term chip */
  /*
   * The first time a run meets a term, its plain meaning appears under the
   * scene's question for a few seconds, then leaves. Later uses pass silently.
   */
  const headingTerm = el('div', 'brf-term', null, { 'aria-live': 'polite' });
  heading.append(headingTerm);
  let termToken = 0;
  function showTerm(term, { holdMs = 6500 } = {}) {
    termToken += 1;
    const mine = termToken;
    if (!term) {
      headingTerm.classList.remove('is-visible');
      return;
    }
    headingTerm.replaceChildren(
      el('span', 'brf-term__name', term.term),
      el(
        'span',
        'brf-term__expansion',
        term.expansion ? ` · ${term.expansion}` : '',
      ),
      el('span', 'brf-term__plain', term.plain),
    );
    headingTerm.classList.add('is-visible');
    clock.after(holdMs, () => {
      if (mine === termToken) headingTerm.classList.remove('is-visible');
    });
  }

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
  const audioCard = el('div', 'brf-begin__audio');
  audioCard.append(voicePicker(), mixer());
  beginCard.append(
    go,
    runRow,
    audioCard,
    el(
      'div',
      'brf-begin__note',
      'Sound starts when you begin. ← → beats · Space pause · E explore · I technical · G glossary · R replay',
    ),
  );
  begin.append(beginCard);

  root.append(
    veilNode,
    heading,
    provenance,
    glossaryPanel,
    settings,
    controls,
    bar,
    begin,
  );

  /* ---------------------------------------------------------- state view */
  function render() {
    const s = director?.state;
    root.classList.toggle('is-playing', s?.status === STATUS.PLAYING);
    playPause.textContent =
      s?.status === STATUS.PLAYING ? '❚❚ PAUSE' : '▶ PLAY';
    speed.textContent = `${s?.speed ?? 1}×`;
    const status = narrator.status;
    voice.classList.toggle('is-on', narrator.available && !narrator.muted);
    voice.title = `${status.label}${status.detail ? ` — ${status.detail}` : ''}. Click to mute or unmute.`;
    voiceBadge.textContent = status.tier === 'neural' ? '' : status.label;
    voiceBadge.title = status.detail || status.label;
    voiceBadge.setAttribute('data-tier', status.tier);
    music.classList.toggle('is-on', musicOn);
    cc.classList.toggle('is-on', captions?.enabled ?? captionsWanted);
    technical.classList.toggle('is-on', technicalOn);
    glossaryButton.classList.toggle('is-on', !glossaryPanel.hidden);
    for (const sync of syncers) sync();
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
    if (technicalOn) renderProvenance();
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

  function setTechnical(on) {
    technicalOn = Boolean(on);
    provenance.hidden = !technicalOn;
    root.classList.toggle('is-technical', technicalOn);
    render();
  }

  /**
   * The technical layer for the current beat: how it was calculated (Level 2
   * method notes), what its terms mean precisely, and where every figure
   * comes from — source, result class, artefact path and record.
   */
  function renderProvenance() {
    const entry = director?.state.entry;
    provenance.replaceChildren();
    if (!entry || !book) return;
    const method = entry.beat.technical ?? entry.scene.technical ?? null;
    if (method) {
      provenance.append(
        el('div', 'brf-provenance__title', 'METHOD · HOW THIS WAS CALCULATED'),
        el('div', 'brf-provenance__method', fillTemplate(method, book)),
      );
    }
    const terms = new Set(entry.scene.terms ?? []);
    for (const beat of entry.scene.beats)
      for (const action of beat.actions)
        if (action.type === 'term.show') terms.add(action.term);
    const known = [...terms].filter((key) => GLOSSARY[key]);
    if (known.length) {
      provenance.append(
        el('div', 'brf-provenance__title', 'TERMS · PRECISE DEFINITIONS'),
      );
      for (const key of known) {
        const term = GLOSSARY[key];
        const row = el('div', 'brf-provenance__term');
        row.append(
          el('span', 'brf-provenance__term-name', term.term),
          el('span', 'brf-provenance__term-detail', term.detail),
        );
        provenance.append(row);
      }
    }
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
      el(
        'div',
        'brf-provenance__title',
        'SOURCES · WHERE THESE FIGURES COME FROM',
      ),
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
      captions.setEnabled(captionsWanted);
      stage = createBriefingStage({
        viewer,
        overlay,
        clock,
        book,
        geometry,
        narrator,
        sound,
        music: score,
        audio: engine,
        onTerm: showTerm,
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
    else if (key === 'i' || key === 'I') setTechnical(!technicalOn);
    else if (key === 'g' || key === 'G') setGlossary(glossaryPanel.hidden);
    else handled = false;
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
    /* A user gesture: the one moment audio may be unlocked. The score starts once it is. */
    void engine.unlock().then(() => score.start());
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
    showTerm(null);
    score.stop();
    void engine.pause();
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
    /** For QA: the mixer (duck level, mutes) and the score (state, cues). */
    get audio() {
      return engine;
    },
    get score() {
      return score;
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
      score.stop();
      engine.destroy();
      setNarrationMeasure(null);
      root.remove();
    },
  });
}
