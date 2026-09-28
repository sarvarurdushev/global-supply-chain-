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
 * step, space pauses and resumes, E escapes to explore, P returns to present,
 * I reveals the headline figure's provenance.
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
      /*
       * A beat can stage what the scene shows. Scene 09's three beats — the
       * map, the statistic, the reversal — were identical on screen because
       * nothing read `panel` or `mapAction`, so the reveal the whole scene is
       * built around never happened.
       */
      experience.setBeatFocus?.({
        panel: beat.panel ?? null,
        mapAction: beat.mapAction ?? null,
      });
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
     * THE HOLD STARTS WHEN THE MAP IS DRAWN AND THE CAMERA HAS LANDED.
     * `whenSceneReady` covers the fetch, the geometry build and the flight,
     * so a 40-second beat is 40 seconds of the scene rather than 36 of it
     * and 4 of a camera in transit.
     */
    whenReady: () => experience.whenSceneReady(),
    onChange: (state) => {
      last = state;
      render(state);
    },
  });

  /*
   * THE STRIP IS A MAP OF THE INVESTIGATION, NOT A SLIDE COUNTER. One segment
   * per beat, as wide as the beat is long, with a wider gap where an act
   * ends — so the presenter sees at a glance that Act II is the long middle
   * and Scene 09 is three short moves, and the audience sees a route being
   * walked rather than "slide 7 of 21". Everything else on the line answers
   * "where am I": the act, the step, the step's place in the argument, what
   * comes next, and how long is left.
   */
  const beatSec = script.beats.map(
    (beat) => (beat.holdMs + (beat.flightMs ?? 0)) / 1000,
  );
  const actOf = (beat) => scene(beat.sceneIndex)?.act ?? null;

  function track(index) {
    const children = [];
    script.beats.forEach((beat, n) => {
      if (n > 0 && actOf(beat) !== actOf(script.beats[n - 1]))
        children.push(h('span', { class: 'ndi-present__act-gap' }));
      children.push(
        h('span', {
          class: `ndi-present__seg${n < index ? ' is-done' : ''}${n === index ? ' is-current' : ''}`,
          style: { flexGrow: String(beatSec[n]) },
          title: beat.cue ?? beat.title,
        }),
      );
    });
    return h(
      'div',
      { class: 'ndi-present__track', 'aria-hidden': 'true' },
      children,
    );
  }

  function remainingText(index) {
    const left = beatSec.slice(Math.max(0, index)).reduce((a, b) => a + b, 0);
    if (!(left > 0)) return '';
    const minutes = Math.max(0.5, Math.round((left / 60) * 2) / 2);
    return `≈ ${minutes} min left`;
  }

  function render(state) {
    const beat = state.beat;
    const entry = beat ? scene(beat.sceneIndex) : null;
    const act = ACTS.find((candidate) => candidate.id === entry?.act);
    const next = script.beats
      .slice(state.index + 1)
      .find((candidate) => candidate.sceneIndex !== beat?.sceneIndex);
    strip.replaceChildren(
      track(state.index),
      h('div', { class: 'ndi-present__line' }, [
        h('span', {
          class: 'ndi-present__act',
          text: act ? `ACT ${act.id} · ${act.name}` : '—',
        }),
        h('span', {
          class: 'ndi-present__count',
          text: `${String(state.index + 1).padStart(2, '0')} / ${String(state.total).padStart(2, '0')}`,
        }),
        h('span', { class: 'ndi-present__title' }, [
          h('span', {
            class: 'ndi-present__cue',
            text: (beat?.cue ?? entry?.title ?? '').toUpperCase(),
          }),
          entry
            ? h('span', {
                class: 'ndi-present__question',
                text: entry.question,
              })
            : null,
        ]),
        next
          ? h('span', {
              class: 'ndi-present__next',
              text: `next · ${next.cue ?? next.title}`,
            })
          : h('span', { class: 'ndi-present__next', text: 'last step' }),
        state.missing.length > 0
          ? h('span', {
              class: 'ndi-present__missing',
              text: `layer unavailable: ${state.missing.join(', ')}`,
            })
          : null,
        h('span', {
          class: 'ndi-present__left',
          text: remainingText(state.index),
        }),
        h('span', {
          class: `ndi-present__status is-${state.status}`,
          text: state.status.toUpperCase(),
        }),
        h('span', {
          class: 'ndi-present__keys',
          text: '← →  step · space  pause · I  source · E  explore',
        }),
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
      /*
       * I opens the provenance card behind the scene's headline figure —
       * source, method, class, limitation — without leaving the scene or
       * pausing the run. Asked "where does that number come from?", the
       * presenter answers from the record, not from memory.
       */
      case 'i':
      case 'I':
        experience.toggleHeadlineProvenance?.();
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
