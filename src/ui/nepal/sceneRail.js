/**
 * The left rail: the investigation, grouped by act.
 *
 * Navigation, not a rail-road. Every scene is reachable at any time and in any
 * order — the sequence is an argument, not a gate — and the rail's job is to
 * make the shape of that argument visible while you move around inside it.
 *
 * EACH ENTRY CARRIES ITS RESULT-CLASS MIX as a stripe. Scrolling the rail
 * therefore shows how the evidence changes character as the investigation
 * descends: solid observation at the top of Act II, hatched scenario by the
 * end of it. That is information the scene list would otherwise only reveal by
 * being walked.
 */

import { h } from '../../workspace/components.js';
import { ACTS, SCENES } from '../../nepal/story/scenes.js';
import {
  RESULT_CLASS_PRESENTATION,
  summariseClasses,
} from '../../nepal/story/resultClass.js';

/** A 3px stripe showing the classes a scene deals in, firmest first. */
function classStripe(entry) {
  const classes = summariseClasses(entry.resultClasses);
  return h(
    'span',
    {
      class: 'ndi-rail__stripe',
      'aria-hidden': 'true',
      title: classes
        .map((id) => RESULT_CLASS_PRESENTATION[id].label)
        .join(' · '),
    },
    classes.map((id) =>
      h('span', {
        class: 'ndi-rail__stripe-part',
        style: { background: RESULT_CLASS_PRESENTATION[id].colour },
      }),
    ),
  );
}

/**
 * @param {object} input
 * @param {object} input.state investigation snapshot
 * @param {(index:number)=>void} input.onScene
 */
export function renderSceneRail({ state, onScene = () => {} }) {
  const current = state?.sceneIndex ?? 0;
  return h(
    'nav',
    { class: 'ndi-rail', 'aria-label': 'Investigation scenes' },
    ACTS.map((act) => {
      const scenes = SCENES.filter((entry) => entry.act === act.id);
      return h('section', { class: 'ndi-rail__act' }, [
        h('h2', { class: 'ndi-rail__act-name' }, [
          h('span', { class: 'ndi-rail__act-id', text: `ACT ${act.id}` }),
          h('span', { class: 'ndi-rail__act-label', text: act.name }),
        ]),
        h(
          'ul',
          { class: 'ndi-rail__list' },
          scenes.map((entry) => {
            const isCurrent = entry.index === current;
            const seen = entry.index < current;
            return h('li', { class: 'ndi-rail__item' }, [
              h(
                'button',
                {
                  type: 'button',
                  class: `ndi-rail__button${isCurrent ? ' is-current' : ''}${seen ? ' is-seen' : ''}`,
                  'aria-current': isCurrent ? 'step' : null,
                  dataset: { scene: String(entry.index) },
                  onclick: () => onScene(entry.index),
                },
                [
                  h('span', {
                    class: 'ndi-rail__index',
                    text: String(entry.index).padStart(2, '0'),
                  }),
                  h('span', { class: 'ndi-rail__title', text: entry.title }),
                  classStripe(entry),
                ],
              ),
            ]);
          }),
        ),
      ]);
    }),
  );
}
