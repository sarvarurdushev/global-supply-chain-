/**
 * The workspace shell.
 *
 * Owns the chrome — top bar, navigation rail, the single-scroll panel, the
 * playback strip and the legend — and nothing else. It does not know what a
 * chokepoint is, does not talk to Cesium, and does not fetch. Everything
 * world-facing arrives as an injected dependency (`globe`, `layers`, `console`)
 * so the shell can be reasoned about, and largely tested, on its own.
 *
 * Layout decisions that differ deliberately from the inherited shell:
 *
 *   - Navigation lives in a persistent LEFT RAIL with full names and one-line
 *     descriptions, not in stacked collapsible trays of icons.
 *   - The analysis panel is ONE scroll region on the right. Cards inside it
 *     never scroll. This is the fix for the six-scrollbar panel.
 *   - The top bar always carries Reset View. The user can always get out.
 *   - While the workspace is up, the inherited classification banner and MGRS
 *     readout are hidden: they belong to a different product and they make
 *     customs statistics look like intercepts.
 */

import { h, append } from './components.js';
import { NAV_SECTIONS, navItem, DEFAULT_NAV_ID } from './navigation.js';
import { LEGEND, controlName } from './taxonomy.js';
import { investigation, createPlayback } from './investigations.js';
import { renderView } from './views.js';

/**
 * Inherited chrome hidden while the workspace is up.
 *
 * These are the elements that make the product read as a surveillance cockpit:
 * the GOD'S EYE VIEW title, the classification strip and MGRS readout in the
 * intel HUD, the stacked layer/scene trays, and the style indicator. None of
 * them is deleted — `setVisible(false)` puts every one back, so "Hide panels"
 * returns the original interface intact.
 *
 * Verified against the real DOM rather than guessed: an earlier version of this
 * list used plausible-sounding class names that matched nothing, and the
 * inherited titles rendered straight through the workspace.
 */
const INHERITED_CHROME_SELECTORS = Object.freeze([
  '#title-bar',
  '#intel-hud',
  '#style-indicator',
  '#left-panel-stack',
  '#top-center-actions',
  '#command-dock',
  '#safe-frame-overlay',
  '#world-overlay-actions',
  // The inherited first-run card ("Choose your first view" / "forbidden
  // cockpit") is the other product's opening. The workspace home view IS the
  // orientation now: it says what the system is for and offers a first
  // investigation, which is what a first run is supposed to do.
  '#first-run-launcher',
  // The right-hand context rail sits exactly where the analysis panel goes and
  // peeks out behind it. The sync chips are inherited progress badges for feeds
  // the workspace reports on itself.
  '#right-context-rail',
  '#traffic-sync-chip',
  '#cctv-sync-chip',
  '#global-loading-status',
  '#toast',
  // The original supply-chain console and its launcher. It is still the engine
  // — every view calls into it — but it is no longer a user interface, and two
  // panels showing the same trade query is exactly the duplication the rebuild
  // is meant to remove. "Hide panels" brings it back.
  '.sc-console',
  '.sc-launcher',
]);

/**
 * Create the workspace shell.
 *
 * @param {object} deps
 * @param {object} deps.console supply-chain console handle
 * @param {object} deps.layers  { get, isEnabled, setEnabled, all }
 * @param {object} deps.globe   { flyTo, resetView, stopTracking, onSelect }
 * @param {HTMLElement} [deps.container]
 * @returns {object} workspace handle
 */
export function createWorkspace({
  console: consoleHandle,
  layers,
  globe,
  container = document.body,
  // Injected so a test can drive an investigation without waiting out its real
  // hold times. Without this the suite either takes minutes or hangs when an
  // assertion fails before teardown and the auto-advance chain keeps
  // rescheduling itself.
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (handle) => clearTimeout(handle),
}) {
  if (!consoleHandle) throw new TypeError('the workspace requires a console');
  if (!layers) throw new TypeError('the workspace requires a layer adapter');
  if (!globe) throw new TypeError('the workspace requires a globe adapter');

  /* ---------------- state ---------------- */

  const state = {
    navId: DEFAULT_NAV_ID,
    chokepointId: null,
    disruptionTarget: null,
    countryIso3: null,
    routeFrom: null,
    routeTo: null,
    trackItem: null,
    investigation: null,
    selection: null,
    legendOpen: false,
    railOpen: false,
    visible: true,
  };

  let playback = null;

  /* ---------------- DOM ---------------- */

  const brand = h('div', { class: 'ws-brand' }, [
    h('span', { class: 'ws-brand-mark', text: '◈' }),
    h('span', { class: 'ws-brand-name', text: 'Global Supply Chain Eye' }),
    h('span', {
      class: 'ws-brand-sub',
      text: 'Trade · Transport · Disruption',
    }),
  ]);

  const breadcrumb = h('nav', {
    class: 'ws-breadcrumb',
    'aria-label': 'Location',
  });
  const topbarActions = h('div', { class: 'ws-topbar-actions' });
  const topbar = h('header', { class: 'ws-topbar' }, [
    brand,
    breadcrumb,
    topbarActions,
  ]);

  const rail = h('nav', { class: 'ws-rail', 'aria-label': 'Main navigation' });

  const panelTitle = h('h1', { class: 'ws-panel-title' });
  const panelSummary = h('p', { class: 'ws-panel-summary' });
  const panelScroll = h('div', { class: 'ws-panel-scroll' });
  const panel = h('section', { class: 'ws-panel', 'aria-label': 'Analysis' }, [
    h('div', { class: 'ws-panel-head' }, [panelTitle, panelSummary]),
    panelScroll,
  ]);

  const playbackStrip = h('div', {
    class: 'ws-playback',
    hidden: true,
    'aria-live': 'polite',
  });

  const legend = h('aside', {
    class: 'ws-legend',
    hidden: true,
    'aria-label': 'Legend',
  });

  const root = h('div', { class: 'ws-root' }, [
    topbar,
    rail,
    panel,
    playbackStrip,
    legend,
  ]);
  container.appendChild(root);

  /* ---------------- inherited chrome ---------------- */

  const hiddenChrome = [];
  function setInheritedChromeHidden(hidden) {
    if (hidden) {
      for (const selector of INHERITED_CHROME_SELECTORS) {
        for (const node of container.querySelectorAll(selector)) {
          if (node.dataset.wsHidden) continue;
          node.dataset.wsHidden = '1';
          node.dataset.wsPrevDisplay = node.style.display ?? '';
          node.style.display = 'none';
          hiddenChrome.push(node);
        }
      }
    } else {
      for (const node of hiddenChrome.splice(0)) {
        node.style.display = node.dataset.wsPrevDisplay ?? '';
        delete node.dataset.wsHidden;
        delete node.dataset.wsPrevDisplay;
      }
    }
  }

  /* ---------------- context handed to views ---------------- */

  const ctx = {
    state,
    console: consoleHandle,
    layers,
    globe,
    get playback() {
      return playback;
    },
    navigate,
    refresh: render,
    openInvestigation,
  };

  /* ---------------- navigation ---------------- */

  function navigate(navId) {
    const item = navItem(navId);
    if (!item) return false;
    // Leaving an investigation stops it. Silently continuing to drive the
    // camera from a view the user has navigated away from is the exact
    // behaviour that made the inherited director feel uncontrollable.
    if (playback && item.view !== 'investigation') stopInvestigation();
    state.navId = navId;
    state.railOpen = false;
    if (item.view === 'track') state.trackItem = item;
    if (item.view === 'investigation' && item.investigationId) {
      openInvestigation(item.investigationId, { navigate: false });
      return true;
    }
    if (item.view !== 'chokepoints') state.chokepointId = null;
    render();
    return true;
  }

  function renderRail() {
    rail.replaceChildren();
    for (const section of NAV_SECTIONS) {
      const group = h('div', { class: 'ws-nav-section' }, [
        h('div', { class: 'ws-nav-section-head' }, [
          h('h2', { class: 'ws-nav-section-title', text: section.title }),
          h('p', { class: 'ws-nav-section-blurb', text: section.blurb }),
        ]),
      ]);
      for (const item of section.items) {
        const active = item.id === state.navId;
        group.appendChild(
          h(
            'button',
            {
              class: `ws-nav-item${active ? ' ws-active' : ''}`,
              type: 'button',
              'aria-current': active ? 'page' : null,
              onClick: () => navigate(item.id),
            },
            [
              h('span', { class: 'ws-nav-icon', text: item.icon }),
              h('span', { class: 'ws-nav-text' }, [
                h('span', { class: 'ws-nav-name', text: item.name }),
                h('span', { class: 'ws-nav-summary', text: item.summary }),
                item.status !== 'ready'
                  ? h('span', {
                      class: `ws-nav-badge ws-nav-badge-${item.status}`,
                      text: item.status === 'gap' ? 'no data' : 'limited',
                      title: item.note ?? '',
                    })
                  : null,
              ]),
            ],
          ),
        );
      }
      rail.appendChild(group);
    }
  }

  function renderBreadcrumb(title) {
    const item = navItem(state.navId);
    breadcrumb.replaceChildren();
    append(breadcrumb, [
      h('span', { class: 'ws-breadcrumb-sep', text: item?.section ?? '' }),
      h('span', { class: 'ws-breadcrumb-sep', text: '›' }),
      h('span', { class: 'ws-breadcrumb-current', text: title }),
    ]);
  }

  /* ---------------- top bar ---------------- */

  function renderTopbar() {
    topbarActions.replaceChildren();
    append(topbarActions, [
      h('button', {
        class: 'ws-btn ws-btn-small ws-rail-toggle',
        type: 'button',
        text: '☰ Menu',
        onClick: () => {
          state.railOpen = !state.railOpen;
          applyRootClasses();
        },
      }),
      state.selection
        ? h('button', {
            class: 'ws-btn ws-btn-small ws-btn-danger',
            type: 'button',
            text: controlName('stopTracking'),
            onClick: () => {
              globe.stopTracking();
              state.selection = null;
              render();
            },
          })
        : null,
      h('button', {
        class: 'ws-btn ws-btn-small',
        type: 'button',
        text: 'Legend',
        'aria-pressed': String(state.legendOpen),
        onClick: () => {
          state.legendOpen = !state.legendOpen;
          renderLegend();
        },
      }),
      // Requirement: never leave the user trapped inside a visualisation.
      h('button', {
        class: 'ws-btn ws-btn-small',
        type: 'button',
        text: controlName('resetView'),
        title: 'Return the globe and this panel to the starting state',
        onClick: resetEverything,
      }),
      h('button', {
        class: 'ws-btn ws-btn-small ws-btn-ghost',
        type: 'button',
        text: state.visible ? 'Hide panels' : 'Show panels',
        title: 'Hide the workspace to see the globe on its own',
        onClick: () => setVisible(!state.visible),
      }),
    ]);
  }

  /* ---------------- legend ---------------- */

  function renderLegend() {
    legend.hidden = !state.legendOpen;
    if (!state.legendOpen) return;
    legend.replaceChildren();
    append(legend, [
      h('h2', { class: 'ws-legend-title', text: 'What the marks mean' }),
      LEGEND.map((group) =>
        h('div', { class: 'ws-legend-group' }, [
          h('div', { class: 'ws-legend-group-title', text: group.group }),
          group.entries.map((entry) =>
            h('div', { class: 'ws-legend-row' }, [
              h('span', {
                class: 'ws-legend-mark',
                style: { color: entry.swatch },
                text: entry.mark,
              }),
              h('span', { text: entry.label }),
            ]),
          ),
        ]),
      ),
    ]);
  }

  /* ---------------- investigations ---------------- */

  function openInvestigation(id, { navigate: doNavigate = true } = {}) {
    const entry = investigation(id);
    if (!entry) return false;
    stopInvestigation({ silent: true });
    state.investigation = entry;
    if (doNavigate) {
      const item = [...NAV_SECTIONS]
        .flatMap((section) => section.items)
        .find((candidate) => candidate.investigationId === id);
      state.navId = item?.id ?? state.navId;
    }
    playback = createPlayback({
      investigation: entry,
      onStep: applyStep,
      onChange: () => {
        renderPlayback();
        renderPanel();
      },
      setTimer,
      clearTimer,
    });
    render();
    renderPlayback();
    return true;
  }

  function stopInvestigation({ silent = false } = {}) {
    if (playback) {
      playback.destroy();
      playback = null;
    }
    state.investigation = null;
    playbackStrip.hidden = true;
    if (!silent) render();
  }

  /**
   * Apply one investigation step to the world.
   *
   * Camera first, then layers, then data — so the frame is already in the right
   * place when the data lands rather than jumping afterwards. The console's own
   * camera moves are suspended throughout for the same reason they are during
   * the authored tour: while a step is playing, the step owns the camera.
   */
  async function applyStep(step) {
    const release = suspendConsoleCamera();
    try {
      if (step.camera) globe.flyTo(step.camera);
      if (step.layers) {
        for (const [layerId, enabled] of Object.entries(step.layers)) {
          layers.setEnabled(layerId, enabled);
        }
      }
      await applyStepAction(step.action);
    } finally {
      release();
    }
  }

  function suspendConsoleCamera() {
    if (typeof consoleHandle.setCameraSuspended !== 'function') return () => {};
    const previous = consoleHandle.setCameraSuspended(true);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      consoleHandle.setCameraSuspended(previous);
    };
  }

  async function applyStepAction(action) {
    if (!action) return;
    switch (action.kind) {
      case 'trade': {
        // setCommodity/setReporter return false for an unknown key rather than
        // throwing. Ignoring that return is how a step ends up running against
        // whatever happened to be selected — so it is checked.
        const okCommodity = consoleHandle.setCommodity(action.commodity);
        const okReporter = consoleHandle.setReporter(action.reporter);
        if (!okCommodity || !okReporter) {
          throw new Error(
            `step rejected: commodity "${action.commodity}" or country "${action.reporter}" is not selectable`,
          );
        }
        consoleHandle.setFlow(action.flow ?? 'M');
        await consoleHandle.run();
        return;
      }
      case 'disruption':
        consoleHandle.simulate(action.target);
        return;
      case 'production': {
        if (!consoleHandle.setCommodity(action.commodity)) {
          throw new Error(`step rejected: commodity "${action.commodity}"`);
        }
        await consoleHandle.loadProduction();
        return;
      }
      case 'events':
        await consoleHandle.loadEvents();
        return;
      default:
        throw new Error(`unknown investigation action: ${action.kind}`);
    }
  }

  function renderPlayback() {
    if (!playback || !state.investigation) {
      playbackStrip.hidden = true;
      return;
    }
    const playbackState = playback.getState();
    const entry = state.investigation;
    const step = playbackState.step;
    playbackStrip.hidden = false;
    playbackStrip.replaceChildren();

    const isPlaying = playbackState.status === 'playing';
    append(playbackStrip, [
      h('div', { class: 'ws-playback-head' }, [
        h('span', { class: 'ws-playback-name', text: entry.name }),
        h('span', {
          class: 'ws-playback-step',
          text: step ? step.title : 'Ready to start',
        }),
        h('span', {
          class: 'ws-playback-count',
          text:
            playbackState.index >= 0
              ? `${playbackState.index + 1} / ${playbackState.total}`
              : `${playbackState.total} steps`,
        }),
      ]),
      step ? h('p', { class: 'ws-playback-claim', text: step.claim }) : null,
      h('div', { class: 'ws-progress' }, [
        h('div', {
          class: 'ws-progress-fill',
          style: { width: `${Math.round(playbackState.progress * 100)}%` },
        }),
      ]),
      h('div', { class: 'ws-playback-controls' }, [
        h('button', {
          class: 'ws-btn ws-btn-small',
          type: 'button',
          text: `◀ ${controlName('previous')}`,
          disabled: !playbackState.canPrevious,
          onClick: () => playback.previous(),
        }),
        isPlaying
          ? h('button', {
              class: 'ws-btn ws-btn-small ws-btn-primary',
              type: 'button',
              text: `❚❚ ${controlName('pause')}`,
              onClick: () => playback.pause(),
            })
          : h('button', {
              class: 'ws-btn ws-btn-small ws-btn-primary',
              type: 'button',
              text:
                playbackState.status === 'finished'
                  ? `↻ ${controlName('restart')}`
                  : `▶ ${controlName('start')}`,
              onClick: () =>
                playbackState.status === 'finished'
                  ? playback.restart()
                  : playback.play(),
            }),
        h('button', {
          class: 'ws-btn ws-btn-small',
          type: 'button',
          text: `${controlName('next')} ▶`,
          disabled: !playbackState.canNext,
          onClick: () => playback.next(),
        }),
        h('button', {
          class: 'ws-btn ws-btn-small',
          type: 'button',
          text: `↻ ${controlName('restart')}`,
          onClick: () => playback.restart(),
        }),
        h('button', {
          class: 'ws-btn ws-btn-small ws-btn-danger',
          type: 'button',
          text: `■ ${controlName('stop')}`,
          onClick: () => {
            playback.stop();
            renderPlayback();
          },
        }),
        h('button', {
          class: 'ws-btn ws-btn-small ws-btn-ghost',
          type: 'button',
          text: 'Close',
          onClick: () => stopInvestigation(),
        }),
      ]),
    ]);
  }

  /* ---------------- reset ---------------- */

  /**
   * Return everything to the starting state.
   *
   * Deliberately thorough: stop playback, release the camera, drop the
   * selection, clear the transient view state, go home. A partial reset that
   * leaves the camera following a vessel is worse than none, because the user
   * pressed the button believing it worked.
   */
  function resetEverything() {
    stopInvestigation({ silent: true });
    globe.stopTracking();
    globe.resetView();
    state.selection = null;
    state.chokepointId = null;
    state.disruptionTarget = null;
    state.countryIso3 = null;
    state.legendOpen = false;
    state.navId = DEFAULT_NAV_ID;
    renderLegend();
    render();
  }

  /* ---------------- selection from the globe ---------------- */

  /**
   * Something on the globe was clicked.
   *
   * The requirement is one click to select, highlight and follow — no menus in
   * between. So this both records the selection and starts tracking, and the
   * panel switches to show what was picked.
   */
  function handleSelection(selection) {
    state.selection = selection ?? null;
    if (selection?.navId) {
      state.navId = selection.navId;
      // The track view renders whichever layer `trackItem` names, and only
      // navigate() was setting it. Selecting an aircraft therefore moved the
      // rail to Aircraft while the panel still described ships.
      const item = navItem(selection.navId);
      if (item?.view === 'track') state.trackItem = item;
    }
    render();
  }

  const detachSelect = globe.onSelect ? globe.onSelect(handleSelection) : null;

  /* ---------------- render ---------------- */

  function applyRootClasses() {
    root.classList.toggle('ws-rail-open', state.railOpen);
    root.classList.toggle('ws-panel-hidden', !state.visible);
    root.classList.toggle('ws-rail-hidden', !state.visible);
    playbackStrip.hidden = !state.visible || !playback;
  }

  function renderPanel() {
    const item = navItem(state.navId);
    const view = renderView(item?.view ?? 'home', ctx);
    panelTitle.textContent = view.title;
    panelSummary.textContent = view.summary ?? '';
    panelScroll.replaceChildren();
    append(panelScroll, view.cards);
    // A view change starts at the top; a refresh in place should not yank the
    // reader back to it, but distinguishing the two is not worth the state.
    panelScroll.scrollTop = 0;
    renderBreadcrumb(view.title);
  }

  function render() {
    renderRail();
    renderTopbar();
    renderPanel();
    applyRootClasses();
  }

  /**
   * Show or hide the workspace.
   *
   * Hiding it restores the inherited interface in full — including the original
   * supply-chain console — rather than leaving the user on a bare globe with no
   * controls at all. "Hide panels" means "get out of my way", not "remove every
   * way of doing anything".
   */
  function setVisible(visible) {
    state.visible = Boolean(visible);
    setInheritedChromeHidden(state.visible);
    if (!state.visible) consoleHandle.setVisible?.(true);
    else consoleHandle.setVisible?.(false);
    applyRootClasses();
    renderTopbar();
  }

  // The console keeps its own visibility flag, so hiding its DOM is not enough:
  // it would still believe it was open and re-show its launcher.
  consoleHandle.setVisible?.(false);
  setInheritedChromeHidden(true);
  render();
  renderLegend();

  /* ---------------- handle ---------------- */

  return {
    navigate,
    openInvestigation,
    stopInvestigation,
    resetView: resetEverything,
    setVisible,
    isVisible: () => state.visible,
    getState: () =>
      Object.freeze({
        navId: state.navId,
        view: navItem(state.navId)?.view ?? null,
        investigationId: state.investigation?.id ?? null,
        playback: playback?.getState?.() ?? null,
        selection: state.selection,
        legendOpen: state.legendOpen,
        visible: state.visible,
      }),
    /** For a host that changed something the workspace renders. */
    refresh: render,
    /** For a host that picked an entity itself. */
    select: handleSelection,
    destroy() {
      stopInvestigation({ silent: true });
      detachSelect?.();
      setInheritedChromeHidden(false);
      root.remove();
    },
  };
}
