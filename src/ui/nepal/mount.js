/**
 * Where the Nepal case attaches to the running application.
 *
 * The investigation is a SECOND FULL-SCREEN INTERFACE over the same globe, not
 * another panel in the workspace dock. That is a deliberate call and it has a
 * reason: the workspace already owns the right-hand column, and the case panel
 * is also a right-hand column. Two of them side by side leaves the map a strip
 * in the middle, and the one thing this product cannot afford is a small map.
 * So while the case is open the workspace chrome steps aside (`body.ndi-open`,
 * handled in CSS) and steps back when it closes. Nothing is destroyed.
 *
 * IT IS LAZY. Opening the case is what constructs the experience, the loader
 * and the Cesium collections. A visitor who never opens Case 001 pays nothing
 * for it — no artefact fetches, no primitive collections, no listeners beyond
 * the single `hashchange` below.
 *
 * THE URL IS THE STATE. `#/case/npl-2015-eq/scene/…` opens the case at that
 * scene, and every later move writes itself back, so any view a person reaches
 * can be sent to somebody else. Removing the hash closes the case. The echo
 * guard matters: writing the hash fires `hashchange`, and without the guard the
 * case would re-apply its own deep link on every scene change and fight the
 * user for the camera.
 */

import { h } from '../../workspace/components.js';
import { createNepalExperience } from './experience.js';
import { createNepalPresentation } from './present.js';
import { MODE } from '../../nepal/story/investigation.js';

export const CASE_HASH_PREFIX = '#/case/npl-2015-eq';

/** Does this address ask for the case? */
export function isCaseHash(hash) {
  return String(hash ?? '').startsWith(CASE_HASH_PREFIX);
}

/**
 * @param {object} input
 * @param {HTMLElement} [input.container] where the host element is appended
 * @param {() => object} [input.createLayers] built on first open; stubbed in tests
 * @param {typeof fetch} [input.fetchImpl]
 * @param {object} [input.win] window-like, for hash routing
 * @param {object} [input.doc] document-like, for the body class
 */
export function createNepalCaseMount({
  container = document.body,
  createLayers = null,
  createWorker = null,
  fetchImpl,
  win = globalThis.window,
  doc = globalThis.document,
} = {}) {
  const host = h('div', { class: 'ndi-host' });
  host.hidden = true;
  container.appendChild(host);

  /*
   * A chip, exactly like `.sc-launcher`. A product whose only entrance is a
   * URL somebody has to be told about does not have an entrance.
   */
  const launcher = h('button', {
    class: 'ndi-launcher',
    type: 'button',
    text: 'CASE 001 — NEPAL 2015',
    'aria-label': 'Open the Nepal 2015 earthquake case',
    onClick: () => {
      openCase();
    },
  });
  container.appendChild(launcher);

  let experience = null;
  let caseLayers = null;
  /*
   * The presentation is owned HERE and not by the experience, because it
   * drives the experience: `present.js` imports it, so the experience cannot
   * import back. The mount already watches every state change for the address
   * bar, so the mode switch is a line in the same place.
   */
  let presentation = null;
  let open = false;
  /* Set while this module is the one writing `location.hash`. */
  let writingHash = false;

  /**
   * The PRESENT button in the header is what starts the presentation.
   *
   * Leaving it is not a teardown: `escapeToExplore` already paused and handed
   * the camera over, so the runner is kept and P resumes from where the
   * presenter stopped. Destroying it on every mode flip would lose the place
   * in the script, which is the one thing a presenter cannot afford.
   */
  function syncPresentation(state, reason) {
    if (!open || reason !== 'mode') return;
    if (state.mode === MODE.PRESENT) {
      if (!presentation) {
        presentation = createNepalPresentation({
          experience,
          /*
           * The experience's own reserved zone. `.ndi__top` was the first
           * choice and it is cleared on every render, so the strip appeared
           * and vanished with the next state change.
           */
          mount: experience.presentSlot,
        });
      }
      presentation.start();
      return;
    }
    presentation?.playback.pause();
  }

  function syncHash(state, reason) {
    if (!open || reason === 'deeplink') return;
    const next = state?.deepLink;
    if (!next || !win?.location) return;
    if (win.location.hash === next) return;
    writingHash = true;
    try {
      win.location.hash = next;
    } finally {
      writingHash = false;
    }
  }

  function build() {
    if (experience) return experience;
    caseLayers = createLayers ? createLayers() : null;
    experience = createNepalExperience({
      mount: host,
      caseLayers,
      createWorker,
      fetchImpl,
      onChange: (state, reason) => {
        syncHash(state, reason);
        syncPresentation(state, reason);
      },
    });
    return experience;
  }

  async function openCase({ hash } = {}) {
    const first = !experience;
    build();
    open = true;
    host.hidden = false;
    launcher.hidden = true;
    doc?.body?.classList?.add('ndi-open');
    const target = hash ?? win?.location?.hash ?? '';
    /*
     * Apply the address BEFORE starting, so the opening fetch is the scene the
     * link asked for rather than scene 00 followed immediately by a second
     * scene's worth of geometry.
     */
    if (isCaseHash(target)) experience.investigation.applyDeepLink(target);
    /*
     * Claim the address on open. Without this the case runs under whatever
     * hash the host application last wrote, and it only becomes shareable
     * once you happen to change scene — so the opening view, the one most
     * likely to be sent to somebody, was the one view with no link.
     */
    syncHash(experience.investigation.state, 'open');
    if (first) await experience.start();
    else experience.render();
    return experience;
  }

  function closeCase() {
    if (!open) return;
    open = false;
    host.hidden = true;
    launcher.hidden = false;
    doc?.body?.classList?.remove('ndi-open');
    if (win?.location && isCaseHash(win.location.hash)) {
      writingHash = true;
      try {
        win.location.hash = '';
      } finally {
        writingHash = false;
      }
    }
  }

  function onHashChange() {
    if (writingHash) return;
    const hash = win?.location?.hash ?? '';
    if (isCaseHash(hash)) {
      if (open) experience?.investigation.applyDeepLink(hash);
      else openCase({ hash });
      return;
    }
    closeCase();
  }

  win?.addEventListener?.('hashchange', onHashChange);

  /* An address that already names the case opens it on load. */
  if (isCaseHash(win?.location?.hash ?? '')) openCase();

  return Object.freeze({
    get element() {
      return host;
    },
    get launcher() {
      return launcher;
    },
    get isOpen() {
      return open;
    },
    get experience() {
      return experience;
    },
    get presentation() {
      return presentation;
    },
    get caseLayers() {
      return caseLayers;
    },
    open: openCase,
    close: closeCase,

    destroy() {
      win?.removeEventListener?.('hashchange', onHashChange);
      doc?.body?.classList?.remove('ndi-open');
      presentation?.destroy();
      presentation = null;
      experience?.destroy();
      experience = null;
      caseLayers = null;
      launcher.remove();
      host.remove();
    },
  });
}
