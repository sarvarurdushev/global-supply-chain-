/**
 * Driving the case as a presentation.
 *
 * REUSES `createDemoPlayback`. All the pacing — play, pause, step, restart,
 * "stepping by hand always pauses", the injected clock — is that module's,
 * and this supplies only the two things it cannot know: what a Nepal beat
 * does, and when a Nepal beat is ready. See `nepal/story/presentation.js` for
 * the script.
 *
 * PAUSE DROPS INTO EXPLORE AT THAT EXACT STATE. The design calls this the
 * single most important behaviour for presenting live, and it is a
 * consequence of how the state machine is built rather than a feature bolted
 * on: the beat sets a scene, and pausing changes only who is driving. Nothing
 * about the scene, the selection or the camera moves. `takeControl()` on the
 * investigation is the same call the mode switch makes.
 *
 * KEYBOARD, because a presenter's hands are not on a trackpad: right and left
 * step, space pauses and resumes, E escapes to explore, P returns to present.
 * Nothing is captured while the focus is in a field, so a text input still
 * takes a space.
 */

import { h } from '../../workspace/components.js';
import { createDemoPlayback } from '../../disaster/demo.js';
import { nepalPresentation } from '../../nepal/story/presentation.js';
import { MODE } from '../../nepal/story/investigation.js';
import { ACTS, scene } from '../../nepal/story/scenes.js';

/**
 * @param {object} input
 * @param {object} input.experience the Nepal experience handle
 * @param {HTMLElement} input.mount where the progress strip goes
 * @param {'full'|'short'} [input.length]
 * @param {object} [input.win] for the key listener
 * @param {(fn:Function, ms:number)=>*} [input.setTimer] injected for tests
 * @param {(handle:*)=>void} [input.clearTimer]
 */
export function createNepalPresentation({
  experience,
  mount,
  length = 'full',
  win = globalThis.window,
  setTimer,
  clearTimer,
}) {
  if (!experience) throw new TypeError('a presentation needs an experience');

  const script = nepalPresentation({ length });
  const strip = h('div', { class: 'ndi-present' });
  mount?.append(strip);

  let last = null;

  const playback = createDemoPlayback({
    demo: script,
    /* No disaster session here; the two hooks below replace it entirely. */
    session: null,
    navigate: () => {},
    setTimer,
    clearTimer,
    applyBeat: (beat) => {
      experience.investigation.setMode(MODE.PRESENT);
      experience.goTo(beat.sceneIndex);
    },
    /*
     * A dataset the case could not fetch. Read from the loader rather than
     * guessed, and reported on the strip: a beat whose layer is missing still
     * runs, because skipping it would present a rosier product than the real
     * one.
     */
    missingFor: (beat) =>
      (beat.needs ?? []).filter(
        (key) => experience.loader.stateOf(key) === 'failed',
      ),
    /*
     * THE HOLD STARTS WHEN THE MAP IS DRAWN. `whenSceneReady` covers both the
     * fetch and the geometry build, so a 40-second beat is 40 seconds of the
     * scene rather than 36 of it and 4 of an empty globe.
     */
    whenReady: () => experience.whenSceneReady(),
    onChange: (state) => {
      last = state;
      render(state);
    },
  });

  function render(state) {
    const beat = state.beat;
    const entry = beat ? scene(beat.sceneIndex) : null;
    const act = ACTS.find((candidate) => candidate.id === entry?.act);
    strip.replaceChildren(
      h('div', { class: 'ndi-present__bar' }, [
        h('span', {
          class: 'ndi-present__fill',
          style: { width: `${Math.round(state.progress * 100)}%` },
        }),
      ]),
      h('div', { class: 'ndi-present__line' }, [
        h('span', {
          class: 'ndi-present__act',
          text: act ? `ACT ${act.id} · ${act.name}` : '—',
        }),
        h('span', {
          class: 'ndi-present__title',
          text: entry
            ? `${String(entry.index).padStart(2, '0')} ${entry.title}`
            : '',
        }),
        h('span', {
          class: 'ndi-present__count',
          text: `${state.index + 1}/${state.total}`,
        }),
        h('span', {
          class: `ndi-present__status is-${state.status}`,
          text: state.status.toUpperCase(),
        }),
        state.missing.length > 0
          ? h('span', {
              class: 'ndi-present__missing',
              text: `layer unavailable: ${state.missing.join(', ')}`,
            })
          : null,
      ]),
    );
  }

  /** Escape to explore: pause, and hand the camera over at this exact state. */
  function escapeToExplore() {
    playback.pause();
    experience.investigation.takeControl();
  }

  function onKey(event) {
    const target = event.target;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (target?.isContentEditable) return;
    switch (event.key) {
      case 'ArrowRight':
        playback.next();
        break;
      case 'ArrowLeft':
        playback.previous();
        break;
      case ' ':
        /* Space pauses INTO explore, so the presenter can answer a question. */
        if (last?.status === 'playing') escapeToExplore();
        else playback.play();
        break;
      case 'e':
      case 'E':
        escapeToExplore();
        break;
      case 'p':
      case 'P':
        experience.investigation.setMode(MODE.PRESENT);
        playback.play();
        break;
      default:
        return;
    }
    event.preventDefault?.();
  }

  win?.addEventListener?.('keydown', onKey);

  return Object.freeze({
    script,
    playback,
    get element() {
      return strip;
    },
    get state() {
      return last;
    },
    start() {
      return playback.play();
    },
    escapeToExplore,
    /** Exposed so a test can drive the keyboard without a real KeyboardEvent. */
    handleKey: onKey,
    destroy() {
      win?.removeEventListener?.('keydown', onKey);
      playback.destroy();
      strip.remove();
    },
  });
}
