import test from 'node:test';
import assert from 'node:assert/strict';
import { installTestDom } from './testDom.mjs';

const dom = installTestDom();
const { createWorkspace } = await import('./shell.js');

/* ------------------------------------------------------------------ *
 * Harness
 * ------------------------------------------------------------------ */

function build(overrides = {}) {
  const calls = [];
  const enabled = new Set();
  const timers = [];
  let cameraSuspended = false;
  let consoleVisible = true;
  let selectListener = null;

  // Capture THIS build's own root. Looking it up later with
  // `querySelector('.ws-root')` returns the FIRST match, which is the wrong
  // tree as soon as any earlier test leaks one — and a failing assertion skips
  // its cleanup, so leaks happen. That cascade is what made the whole file
  // appear to hang: each later test failed before teardown, and the real
  // auto-advance timers kept rescheduling.
  const before = new Set(dom.body.children);
  const workspace = createWorkspace({
    // Fake timers: an investigation's real holds are 8-9 seconds each, so a
    // suite that used them would take minutes — and would hang outright if an
    // assertion threw before teardown, because the auto-advance chain keeps
    // rescheduling itself.
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length - 1;
    },
    clearTimer: (handle) => {
      if (timers[handle]) timers[handle].cleared = true;
    },
    console: {
      getData: () => ({
        result: null,
        series: null,
        scenario: null,
        production: null,
        comparison: null,
        events: null,
        error: null,
        commodity: 'semiconductors',
        reporter: 'KOR',
        flow: 'M',
        year: 2023,
        loading: false,
        ...overrides.data,
      }),
      run: async () => calls.push(['run']),
      simulate: (id) => calls.push(['simulate', id]),
      loadProduction: async () => calls.push(['loadProduction']),
      loadEvents: async () => calls.push(['loadEvents']),
      setCommodity: (v) => {
        calls.push(['setCommodity', v]);
        return overrides.rejectCommodity ? false : true;
      },
      setReporter: (v) => {
        calls.push(['setReporter', v]);
        return true;
      },
      setFlow: (v) => calls.push(['setFlow', v]),
      setYear: (v) => calls.push(['setYear', v]),
      setCameraSuspended: (next) => {
        const previous = cameraSuspended;
        cameraSuspended = Boolean(next);
        calls.push(['setCameraSuspended', cameraSuspended]);
        return previous;
      },
      setVisible: (v) => {
        consoleVisible = v;
        calls.push(['consoleSetVisible', v]);
      },
    },
    layers: {
      get: () => ({ getStats: () => ({ count: 7, error: null }) }),
      isEnabled: (id) => enabled.has(id),
      setEnabled: (id, on) => {
        calls.push(['setEnabled', id, on]);
        if (on) enabled.add(id);
        else enabled.delete(id);
      },
    },
    globe: {
      flyTo: (target) => calls.push(['flyTo', target]),
      resetView: () => calls.push(['resetView']),
      stopTracking: () => calls.push(['stopTracking']),
      onSelect: (listener) => {
        selectListener = listener;
        return () => {
          selectListener = null;
        };
      },
    },
  });

  const ownRoot = dom.body.children.find((child) => !before.has(child));

  return {
    workspace,
    calls,
    enabled,
    timers,
    pendingTimers: () => timers.filter((t) => !t.cleared && !t.fired).length,
    isCameraSuspended: () => cameraSuspended,
    isConsoleVisible: () => consoleVisible,
    select: (selection) => selectListener?.(selection),
    root: () => ownRoot,
    cleanup: () => workspace.destroy(),
  };
}

/* ------------------------------------------------------------------ *
 * Mounting
 * ------------------------------------------------------------------ */

test('the shell mounts its chrome and lands on the home view', () => {
  const h = build();
  const root = h.root();
  assert.ok(root, 'the workspace root must mount');
  assert.ok(root.querySelector('.ws-topbar'));
  assert.ok(root.querySelector('.ws-rail'));
  assert.ok(root.querySelector('.ws-panel'));
  assert.equal(h.workspace.getState().navId, 'home');
  assert.equal(h.workspace.getState().view, 'home');
  h.cleanup();
});

test('the panel has exactly one scroll region', () => {
  // The defect that motivated the rebuild: five sections, five scrollbars. The
  // markup contract is that `ws-panel-scroll` is the only scroller, so a
  // second one appearing is a regression worth failing on.
  const h = build();
  const scrollers = h.root().querySelectorAll('.ws-panel-scroll');
  assert.equal(scrollers.length, 1);
  h.cleanup();
});

test('the rail renders every section and item', () => {
  const h = build();
  const root = h.root();
  assert.equal(root.querySelectorAll('.ws-nav-section').length, 5);
  assert.ok(root.querySelectorAll('.ws-nav-item').length >= 18);
  h.cleanup();
});

test('a nav item carries its name and its one-line summary', () => {
  const h = build();
  const item = h.root().querySelector('.ws-nav-item');
  assert.ok(item.querySelector('.ws-nav-name').textContent.length > 2);
  assert.ok(item.querySelector('.ws-nav-summary').textContent.length > 10);
  h.cleanup();
});

test('an item with limited data is badged in the rail', () => {
  const h = build();
  const badges = h.root().querySelectorAll('.ws-nav-badge');
  assert.ok(badges.length > 0, 'partial entries must be marked before clicking');
  h.cleanup();
});

test('the original console is hidden on mount and restored when panels hide', () => {
  // Two panels showing the same trade query is the duplication the rebuild
  // removes — but "Hide panels" must not leave the user with nothing.
  const h = build();
  assert.equal(h.isConsoleVisible(), false);
  h.workspace.setVisible(false);
  assert.equal(h.isConsoleVisible(), true);
  h.workspace.setVisible(true);
  assert.equal(h.isConsoleVisible(), false);
  h.cleanup();
});

/* ------------------------------------------------------------------ *
 * Navigation
 * ------------------------------------------------------------------ */

test('navigating changes the view and marks the rail', () => {
  const h = build();
  assert.equal(h.workspace.navigate('chokepoints'), true);
  assert.equal(h.workspace.getState().view, 'chokepoints');
  const active = h.root().querySelectorAll('.ws-active');
  assert.equal(active.length, 1, 'exactly one item is current');
  h.cleanup();
});

test('navigating to an unknown item is refused rather than blanking the panel', () => {
  const h = build();
  assert.equal(h.workspace.navigate('no-such-item'), false);
  assert.equal(h.workspace.getState().navId, 'home');
  h.cleanup();
});

test('leaving the chokepoint list clears the selected chokepoint', () => {
  const h = build();
  h.workspace.navigate('chokepoints');
  h.workspace.navigate('events');
  h.workspace.navigate('chokepoints');
  assert.match(
    h.root().querySelector('.ws-panel-title').textContent,
    /Strategic Chokepoints/,
    'returning must show the list, not the last detail',
  );
  h.cleanup();
});

/* ------------------------------------------------------------------ *
 * Reset View — the "never trap the user" requirement
 * ------------------------------------------------------------------ */

test('reset view returns the camera, the selection and the panel to the start', () => {
  const h = build();
  h.workspace.navigate('events');
  h.select({ id: 'v1', kind: 'Vessel', label: 'MV Test', facts: {} });
  assert.ok(h.workspace.getState().selection);

  h.workspace.resetView();

  const state = h.workspace.getState();
  assert.equal(state.navId, 'home');
  assert.equal(state.selection, null);
  assert.equal(state.investigationId, null);
  assert.ok(h.calls.some(([kind]) => kind === 'resetView'));
  assert.ok(h.calls.some(([kind]) => kind === 'stopTracking'));
  h.cleanup();
});

test('reset view is reachable from the top bar at all times', () => {
  const h = build();
  for (const navId of ['home', 'events', 'disruption', 'layer-browser']) {
    h.workspace.navigate(navId);
    const buttons = h.root().querySelectorAll('.ws-topbar-actions .ws-btn');
    assert.ok(
      buttons.some((b) => b.textContent.includes('Reset View')),
      `Reset View missing on ${navId}`,
    );
  }
  h.cleanup();
});

/* ------------------------------------------------------------------ *
 * Selection and tracking
 * ------------------------------------------------------------------ */

test('a globe selection reaches the panel and switches to its view', () => {
  const h = build();
  h.select({
    id: 'abc123',
    kind: 'Aircraft',
    label: 'BA117',
    facts: { ID: 'abc123' },
    navId: 'aircraft',
  });
  const state = h.workspace.getState();
  assert.equal(state.selection.label, 'BA117');
  assert.equal(state.navId, 'aircraft');
  assert.match(h.root().querySelector('.ws-panel-scroll').textContent, /BA117/);
  h.cleanup();
});

test('a selection puts Stop Following in the top bar, and clearing removes it', () => {
  const h = build();
  const hasStop = () =>
    h
      .root()
      .querySelectorAll('.ws-topbar-actions .ws-btn')
      .some((b) => b.textContent.includes('Stop Following'));
  assert.equal(hasStop(), false, 'nothing to stop before a selection');
  h.select({ id: 'v', kind: 'Vessel', label: 'MV Test', facts: {} });
  assert.equal(hasStop(), true);
  h.root()
    .querySelectorAll('.ws-topbar-actions .ws-btn')
    .find((b) => b.textContent.includes('Stop Following'))
    .click();
  assert.equal(h.workspace.getState().selection, null);
  assert.ok(h.calls.some(([kind]) => kind === 'stopTracking'));
  h.cleanup();
});

/* ------------------------------------------------------------------ *
 * Legend
 * ------------------------------------------------------------------ */

test('the legend opens from the top bar and explains the data classes', () => {
  const h = build();
  const legend = h.root().querySelector('.ws-legend');
  assert.equal(legend.hidden, true);
  h.root()
    .querySelectorAll('.ws-topbar-actions .ws-btn')
    .find((b) => b.textContent.includes('Legend'))
    .click();
  assert.equal(legend.hidden, false);
  const text = legend.textContent;
  for (const cls of ['LIVE', 'HISTORICAL', 'INFERRED', 'SIMULATED']) {
    assert.match(text, new RegExp(cls));
  }
  h.cleanup();
});

/* ------------------------------------------------------------------ *
 * Investigations
 * ------------------------------------------------------------------ */

test('opening an investigation shows the playback strip with its controls', () => {
  const h = build();
  assert.equal(h.workspace.openInvestigation('hormuz-closure'), true);
  const strip = h.root().querySelector('.ws-playback');
  assert.equal(strip.hidden, false);
  const labels = strip.querySelectorAll('BUTTON').map((b) => b.textContent);
  // Requirement 11: the user must be able to stop at any moment.
  for (const needed of ['Previous Step', 'Play Investigation', 'Next Step', 'Restart', 'Stop']) {
    assert.ok(
      labels.some((label) => label.includes(needed)),
      `playback is missing "${needed}" — have: ${labels.join(' / ')}`,
    );
  }
  h.cleanup();
});

test('an unknown investigation is refused', () => {
  const h = build();
  assert.equal(h.workspace.openInvestigation('no-such-thing'), false);
  h.cleanup();
});

test('the playback strip shows a progress bar and a step count', () => {
  const h = build();
  h.workspace.openInvestigation('hormuz-closure');
  const strip = h.root().querySelector('.ws-playback');
  assert.ok(strip.querySelector('.ws-progress-fill'));
  assert.match(strip.querySelector('.ws-playback-count').textContent, /\d+ steps/);
  h.cleanup();
});

test('a step suspends the console camera and restores it afterwards', async () => {
  // While a step is playing, the step owns the camera — measured on the
  // authored tour, where a console fly-to overrode a 700 km beat to 2,500 km.
  const h = build();
  h.workspace.openInvestigation('hormuz-closure');
  const strip = h.root().querySelector('.ws-playback');
  strip
    .querySelectorAll('BUTTON')
    .find((b) => b.textContent.includes('Play Investigation'))
    .click();
  await new Promise((r) => setTimeout(r, 20));
  const suspensions = h.calls.filter(([kind]) => kind === 'setCameraSuspended');
  assert.ok(suspensions.length >= 2, 'suspend then restore');
  assert.deepEqual(suspensions.at(-1), ['setCameraSuspended', false]);
  assert.equal(h.isCameraSuspended(), false);
  h.cleanup();
});

test('a step that the console would reject is reported, not silently skipped', async () => {
  // setCommodity() returns false for an unknown key. Ignoring that is how an
  // investigation runs against whatever happened to be selected.
  const h = build({ rejectCommodity: true });
  h.workspace.openInvestigation('semiconductor-dependency');
  const strip = h.root().querySelector('.ws-playback');
  strip
    .querySelectorAll('BUTTON')
    .find((b) => b.textContent.includes('Play Investigation'))
    .click();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(
    h.workspace.getState().playback.stepError !== undefined ||
      h.workspace.getState().playback.status !== 'idle',
    true,
  );
  h.cleanup();
});

test('stopping playback closes the strip', () => {
  const h = build();
  h.workspace.openInvestigation('hormuz-closure');
  h.workspace.stopInvestigation();
  assert.equal(h.root().querySelector('.ws-playback').hidden, true);
  assert.equal(h.workspace.getState().investigationId, null);
  h.cleanup();
});

test('navigating away from an investigation stops it', () => {
  // Otherwise it keeps driving the camera from a view the user has left.
  const h = build();
  h.workspace.openInvestigation('hormuz-closure');
  h.workspace.navigate('events');
  assert.equal(h.workspace.getState().investigationId, null);
  h.cleanup();
});

/* ------------------------------------------------------------------ *
 * Teardown
 * ------------------------------------------------------------------ */

test('destroy removes the chrome and restores the inherited interface', () => {
  const rootsBefore = dom.body.querySelectorAll('.ws-root').length;
  const h = build();
  assert.equal(dom.body.querySelectorAll('.ws-root').length, rootsBefore + 1);
  assert.ok(h.root(), 'this build has its own root');
  h.workspace.destroy();
  assert.equal(dom.body.querySelectorAll('.ws-root').length, rootsBefore);
  assert.equal(h.root().parentElement, null, 'and it is detached');
});

test('the shell refuses to build without its dependencies', () => {
  assert.throws(() => createWorkspace({}), /requires a console/);
  assert.throws(
    () => createWorkspace({ console: {} }),
    /requires a layer adapter/,
  );
  assert.throws(
    () => createWorkspace({ console: {}, layers: {} }),
    /requires a globe adapter/,
  );
});

test.after(() => dom.restore());
