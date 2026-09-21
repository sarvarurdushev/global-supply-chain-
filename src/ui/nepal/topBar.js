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
 * @param {(mode:string)=>void} [input.onMode]
 */
export function renderTopBar({ header, state, onMode = () => {} }) {
  const scenario = needsScenarioBand(state?.scene?.resultClasses ?? []);
  const bar = h('header', { class: 'ndi-top', role: 'banner' }, [
    h('div', { class: 'ndi-top__brand' }, [
      h('span', {
        class: 'ndi-top__title',
        text: 'NATURAL DISASTER INTELLIGENCE',
      }),
      h('span', { class: 'ndi-top__case', text: `CASE ${header.caseId}` }),
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
      modeButton('PRESENT', MODE.PRESENT, state?.mode, onMode),
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
