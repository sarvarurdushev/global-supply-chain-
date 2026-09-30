/**
 * The system header.
 *
 * Every figure here corresponds to real application state. That is the whole
 * specification, and it is a constraint rather than a flourish: there is no
 * live feed in a 2015 case, so a blinking "SYSTEM: ONLINE" would be decoration
 * pretending to be telemetry — precisely the cheap-hacker tell the identity
 * stylesheet already warns against. `SYSTEM` reports load state and nothing
 * else, and the counts are read from the artefacts at load.
 *
 * THE SCENARIO BAND. When the current scene is constructed, a band crosses the
 * entire header rather than a chip sitting in a panel. The point is that it
 * should be impossible to screenshot a route from this product without the
 * word SCENARIO in frame.
 */

import { h } from '../../workspace/components.js';
import { MODE } from '../../nepal/story/investigation.js';
import { needsScenarioBand } from '../../nepal/story/resultClass.js';

function stat(label, value, { tone = null } = {}) {
  return h('div', { class: 'ndi-top__stat' }, [
    h('span', { class: 'ndi-top__stat-label', text: label }),
    h('span', {
      class: `ndi-top__stat-value${tone ? ` is-${tone}` : ''}`,
      text: String(value),
    }),
  ]);
}

/**
 * @param {object} input
 * @param {object} input.header from `headerState()` — never assembled here
 * @param {object} input.state investigation snapshot
 * @param {(mode:string, options?:{length:'full'|'short'})=>void} [input.onMode]
 * @param {'full'|'short'} [input.presentLength] which run PRESENT is playing
 */
export function renderTopBar({
  header,
  state,
  onMode = () => {},
  presentLength = 'full',
}) {
  const scenario = needsScenarioBand(state?.scene?.resultClasses ?? []);
  const bar = h('header', { class: 'ndi-top', role: 'banner' }, [
    /*
     * The product, then the case. This is the first thing on screen at `/`,
     * so it says in one line what is being investigated and when. The
     * catalogue id stays one hover away.
     */
    h('div', { class: 'ndi-top__brand' }, [
      h('span', {
        class: 'ndi-top__title',
        text: 'NATURAL DISASTER INTELLIGENCE',
      }),
      h('span', {
        class: 'ndi-top__case',
        title: `Case id ${header.caseId}`,
        text: `CASE ${header.caseNumber} / ${header.caseName} / ${header.caseDate}`,
      }),
    ]),
    h('div', { class: 'ndi-top__stats' }, [
      stat('DATASETS', header.datasets),
      stat('ANALYSES', header.analyses),
      stat('CHECKS', header.checksLabel, {
        tone: header.checksPassed === header.checksTotal ? 'ok' : 'warn',
      }),
      stat('SYSTEM', header.system, {
        tone: header.system === 'READY' ? 'ok' : 'busy',
      }),
    ]),
    h('div', { class: 'ndi-top__modes', role: 'group', 'aria-label': 'Mode' }, [
      modeButton('EXPLORE', MODE.EXPLORE, state?.mode, onMode),
      /*
       * THREE BRIEFINGS. Each runs the same directed timeline at a different
       * depth (see src/nepal/briefing): the executive three minutes, the six
       * minutes a meeting slot allows, and the full analysis.
       */
      presentButton('3 MIN', 'three', {
        title: 'Executive briefing — about 3 minutes',
        state,
        presentLength,
        onMode,
      }),
      presentButton('6 MIN', 'six', {
        title: 'Briefing — about 6 minutes',
        state,
        presentLength,
        onMode,
      }),
      presentButton('FULL', 'full', {
        title: 'Full analysis briefing',
        state,
        presentLength,
        onMode,
      }),
    ]),
  ]);

  if (!scenario) return bar;
  return h('div', { class: 'ndi-top__wrap' }, [
    bar,
    h('div', { class: 'ndi-scenario-band', role: 'note' }, [
      h('span', { text: 'SCENARIO' }),
      h('span', {
        class: 'ndi-scenario-band__note',
        text: 'constructed from observed inputs — not a record of what happened',
      }),
    ]),
  ]);
}

function presentButton(label, length, { title, state, presentLength, onMode }) {
  const active = state?.mode === MODE.PRESENT && presentLength === length;
  return h('button', {
    type: 'button',
    class: `ndi-top__mode${active ? ' is-active' : ''}`,
    'aria-pressed': active ? 'true' : 'false',
    title,
    text: label,
    onclick: () => onMode(MODE.PRESENT, { length }),
  });
}

function modeButton(label, mode, current, onMode) {
  const active = current === mode;
  return h('button', {
    type: 'button',
    class: `ndi-top__mode${active ? ' is-active' : ''}`,
    'aria-pressed': active ? 'true' : 'false',
    text: label,
    onclick: () => onMode(mode),
  });
}
