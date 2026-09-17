/**
 * The workspace shell.
 *
 * Owns the supply-chain chrome — the right-hand dock, its navigation drawer,
 * the single-scroll analysis panel, the playback strip and the legend — and
 * nothing else. It does not know what a chokepoint is, does not talk to Cesium,
 * and does not fetch. Everything world-facing arrives as an injected dependency
 * (`globe`, `layers`, `console`) so the shell can be reasoned about, and largely
 * tested, on its own.
 *
 * IT HIDES NOTHING IT INHERITED. An earlier version of this file blanked the
 * God's Eye View title bar, intel HUD, style indicator, scene and layer trays,
 * command dock, context rail and first-run card while the workspace was up, on
 * the theory that two products in one window is one too many. That was the wrong
 * call and it was not what was asked for: the request was to make the inherited
 * tabs easier to read and to move around in, not to take them away. Every one of
 * them is on screen now, renamed in place by `chromeRenames.js` and restyled by
 * `workspace.css`, and the supply-chain console still opens from its own
 * launcher.
 *
 * So the layout question becomes "where does the new panel go without covering
 * anything?" rather than "what can be removed?":
 *
 *   - The dock is a RIGHT-HAND COLUMN. Its own header carries the brand, the
 *     breadcrumb and the always-available controls, because the top edge of the
 *     screen already belongs to the inherited title, style indicator and camera
 *     actions.
 *   - Navigation is a DRAWER inside that column, not a fixed left rail: the left
 *     edge is the inherited panel stack's.
 *   - `body.ws-docked` lets the stylesheet slide the inherited context rail,
 *     style indicator, HUD readouts and command dock clear of the dock's width,
 *     so both interfaces are fully visible at once instead of overlapping.
 *   - The analysis panel is ONE scroll region. Cards inside it never scroll.
 *     This is the fix for the six-scrollbar panel and the most important rule in
 *     the file.
 *   - The dock header always carries Reset View, and the dock itself collapses
 *     to an edge tab. The user can always get out, and can always get back.
 */

import { h, append } from './components.js';
import { NAV_SECTIONS, navItem, DEFAULT_NAV_ID } from './navigation.js';
import { LEGEND, controlName } from './taxonomy.js';
import { investigation, createPlayback } from './investigations.js';
import { renderView } from './views.js';
import { createDisasterContext } from '../disaster/context.js';
import { setRefreshHook } from '../disaster/views.js';

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
    h('span', { class: 'ws-brand-name', text: 'Disaster Intel' }),
  ]);

  const breadcrumb = h('nav', {
    class: 'ws-breadcrumb',
    'aria-label': 'Location',
  });
  const topbarActions = h('div', { class: 'ws-topbar-actions' });
  /*
   * Called `.ws-topbar` since the first version, when it really was a bar
   * across the top of the window. It is the dock's own header row now — the
   * top edge of the screen belongs to the inherited title bar, style indicator
   * and camera actions, and a second full-width bar simply covered them.
   */
  const topbar = h('header', { class: 'ws-topbar' }, [
    h('div', { class: 'ws-topbar-row' }, [brand, topbarActions]),
    breadcrumb,
  ]);

  const rail = h('nav', { class: 'ws-rail', 'aria-label': 'Main navigation' });

  const panelTitle = h('h1', { class: 'ws-panel-title' });
  const panelSummary = h('p', { class: 'ws-panel-summary' });
  const panelScroll = h('div', { class: 'ws-panel-scroll' });

  /*
   * Playback lives INSIDE the panel, above the one scroll region.
   *
   * It used to be a free-floating strip, which on a real screen landed on top
   * of the inherited command dock at the bottom centre. In the panel it is
   * pinned where the reader is already looking, and it cannot collide with
   * anything that was here first.
   */
  const playbackStrip = h('div', {
    class: 'ws-playback',
    hidden: true,
    'aria-live': 'polite',
  });

  const panel = h('section', { class: 'ws-panel', 'aria-label': 'Analysis' }, [
    h('div', { class: 'ws-panel-head' }, [panelTitle, panelSummary]),
    playbackStrip,
    panelScroll,
  ]);

  const legend = h('aside', {
    class: 'ws-legend',
    hidden: true,
    'aria-label': 'Legend',
  });

  /** The edge tab that brings a collapsed dock back. */
  const reopenTab = h(
    'button',
    {
      class: 'ws-reopen',
      type: 'button',
      hidden: true,
      title: 'Open the supply-chain panel',
      onClick: () => setVisible(true),
    },
    [
      h('span', { class: 'ws-reopen-mark', text: '◈' }),
      h('span', { class: 'ws-reopen-text', text: 'Supply Chain' }),
    ],
  );

  const dock = h('div', { class: 'ws-dock' }, [topbar, panel, rail, legend]);

  const root = h('div', { class: 'ws-root' }, [dock, reopenTab]);
  container.appendChild(root);

  /* ---------------- coexistence with the inherited chrome ---------------- */

  /**
   * Tell the stylesheet the dock is occupying the right-hand column.
   *
   * Nothing is hidden. `body.ws-docked` moves the inherited context rail,
   * style indicator, HUD readouts and command dock inboard by the dock's width
   * so both interfaces are fully on screen, and removing the class puts every
   * one of them back where God's Eye View had it.
   */
  const bodyEl = container.ownerDocument?.body ?? container;
  function setDocked(docked) {
    bodyEl.classList?.toggle('ws-docked', Boolean(docked));
  }

  /* ---------------- context handed to views ---------------- */

  /*
   * The disaster context, built once and handed to every view.
   *
   * Created here rather than in each view because the whole platform is one
   * investigation (§27): if each view built its own, the timeline view and the
   * impact view would hold different sessions and disagree about what loaded.
   */
  const disaster = createDisasterContext({
    layers,
    globe,
    refresh: () => render(),
    hazardLayer: layers.get?.('hazard-geometry') ?? null,
  });

  const ctx = {
    state,
    console: consoleHandle,
    layers,
    globe,
    disaster,
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
        class: `ws-btn ws-btn-small ws-rail-toggle${state.railOpen ? ' ws-active' : ''}`,
        type: 'button',
        text: state.railOpen ? '✕ Close' : '☰ Views',
        title: 'Choose what to look at',
        'aria-expanded': String(state.railOpen),
        onClick: () => {
          state.railOpen = !state.railOpen;
          renderTopbar();
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
      // Collapses this dock only. Nothing inherited is hidden at any point, so
      // there is no "show panels" to put back — the edge tab reopens this one.
      h('button', {
        class: 'ws-btn ws-btn-small ws-btn-ghost',
        type: 'button',
        text: '⇥ Collapse',
        title:
          'Collapse this panel to the edge and give the window to the globe and the God’s Eye tools',
        onClick: () => setVisible(false),
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
    dock.hidden = !state.visible;
    reopenTab.hidden = state.visible;
    playbackStrip.hidden = !state.visible || !playback;
    setDocked(state.visible);
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
   * Collapse the dock to its edge tab, or bring it back.
   *
   * Collapsing gives the whole window over to the inherited interface, which
   * still has everything it ever had: the scene director, the data-layer tray,
   * the command dock, the context rail and the supply-chain console's own
   * launcher. The edge tab is what brings this panel back, so collapsing is
   * never a one-way door.
   */
  function setVisible(visible) {
    state.visible = Boolean(visible);
    applyRootClasses();
    if (state.visible) renderTopbar();
  }

  setRefreshHook(() => render());
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
      disaster.close();
      setRefreshHook(null);
      setDocked(false);
      root.remove();
    },
  };
}
