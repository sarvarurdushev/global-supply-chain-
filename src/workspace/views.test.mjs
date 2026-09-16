import test from 'node:test';
import assert from 'node:assert/strict';
import { installTestDom } from './testDom.mjs';
import { NAV_ITEMS } from './navigation.js';

/* The workspace builds real DOM, so a DOM has to exist before the modules that
 * touch it are imported. `components.js` reads `document` only inside
 * functions, so a dynamic import after install is enough. */
const dom = installTestDom();
const { renderView, VIEW_NAMES } = await import('./views.js');
const { card, whyThisMatters, unavailableState, errorState, emptyState, loadingState, term } =
  await import('./components.js');

/* ------------------------------------------------------------------ *
 * A context that records what a view asked the world to do
 * ------------------------------------------------------------------ */

function makeCtx(overrides = {}) {
  const calls = [];
  const state = {
    navId: 'home',
    chokepointId: null,
    disruptionTarget: null,
    countryIso3: null,
    trackItem: null,
    selection: null,
    investigation: null,
    ...overrides.state,
  };
  return {
    calls,
    state,
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
      setCommodity: (v) => calls.push(['setCommodity', v]) && true,
      setReporter: (v) => calls.push(['setReporter', v]) && true,
      setFlow: (v) => calls.push(['setFlow', v]),
      setYear: (v) => calls.push(['setYear', v]),
    },
    layers: {
      get: () => ({ getStats: () => ({ count: 42, error: null }) }),
      isEnabled: () => false,
      setEnabled: (id, on) => calls.push(['setEnabled', id, on]),
      ...overrides.layers,
    },
    globe: {
      flyTo: (target) => calls.push(['flyTo', target]),
      resetView: () => calls.push(['resetView']),
      stopTracking: () => calls.push(['stopTracking']),
    },
    playback: overrides.playback ?? null,
    navigate: (id) => calls.push(['navigate', id]),
    refresh: () => calls.push(['refresh']),
    openInvestigation: (id) => calls.push(['openInvestigation', id]),
  };
}

/** Every rendered card's text, joined. */
function textOf(view) {
  return view.cards.map((node) => node.textContent).join(' ');
}

/* ------------------------------------------------------------------ *
 * Every view renders
 * ------------------------------------------------------------------ */

test('every registered view renders without throwing', () => {
  for (const name of VIEW_NAMES) {
    const view = renderView(name, makeCtx());
    assert.ok(view.title?.length > 1, `${name} produced no title`);
    assert.ok(view.cards.length > 0, `${name} produced no cards`);
    assert.ok(
      !/failed|not found/i.test(view.title),
      `${name} fell into the error path: ${view.title}`,
    );
  }
});

test('every view a nav item points at exists', () => {
  for (const item of NAV_ITEMS) {
    assert.ok(
      VIEW_NAMES.includes(item.view),
      `nav item "${item.id}" opens unknown view "${item.view}"`,
    );
  }
});

test('every data view explains why it matters', () => {
  // Requirement: the user should never have to work out why they are looking at
  // something. `investigation` is exempt — it leads with its own question.
  for (const name of VIEW_NAMES.filter((v) => v !== 'investigation')) {
    const view = renderView(name, makeCtx());
    const hasWhy = view.cards.some(
      (node) => node.querySelectorAll('.ws-why').length > 0,
    );
    assert.ok(hasWhy, `${name} has no "why this matters" block`);
  }
});

test('every view offers a next step', () => {
  for (const name of VIEW_NAMES.filter((v) => v !== 'investigation')) {
    const view = renderView(name, makeCtx());
    const hasNext = view.cards.some(
      (node) => node.querySelectorAll('.ws-next').length > 0,
    );
    assert.ok(hasNext, `${name} leaves the user with nowhere to go`);
  }
});

test('an unknown view name is reported, not silently blank', () => {
  const view = renderView('no-such-view', makeCtx());
  assert.match(view.title, /not found/i);
  assert.match(textOf(view), /not registered/i);
});

test('a throwing view costs that view, not the application', () => {
  // A view that crashes must render an error card with a retry, because a blank
  // panel is indistinguishable from a broken app.
  const ctx = makeCtx({
    layers: {
      get: () => {
        throw new Error('layer manager exploded');
      },
    },
  });
  const view = renderView('home', ctx);
  assert.match(view.title, /failed/i);
  assert.match(textOf(view), /layer manager exploded/);
});

/* ------------------------------------------------------------------ *
 * Empty and unavailable states, which must not look alike
 * ------------------------------------------------------------------ */

test('a view with nothing loaded says so rather than rendering blank', () => {
  for (const name of ['commodity', 'resource', 'events', 'disruption']) {
    const view = renderView(name, makeCtx());
    assert.match(
      textOf(view),
      /No .* for this selection|not loaded yet|Load current events|Choose a passage/i,
      `${name} renders nothing and explains nothing`,
    );
  }
});

test('the chokepoint detail answers all three questions', () => {
  // Requirement 12: why it matters, what passes through, what if disrupted.
  const view = renderView(
    'chokepoints',
    makeCtx({ state: { chokepointId: 'hormuz' } }),
  );
  const text = textOf(view);
  assert.equal(view.title, 'Strait of Hormuz');
  assert.match(text, /WHY IT MATTERS/i);
  assert.match(text, /WHAT PASSES THROUGH HERE/i);
  assert.match(text, /WHAT HAPPENS IF IT CLOSES/i);
  assert.match(text, /Crude oil/);
  // And it must not invent a transit volume.
  assert.match(text, /DATA UNAVAILABLE/);
  assert.match(text, /tonnes or barrels/i);
});

test('a chokepoint with no alternative says so plainly', () => {
  const view = renderView(
    'chokepoints',
    makeCtx({ state: { chokepointId: 'hormuz' } }),
  );
  assert.match(textOf(view), /There is no maritime alternative/);
});

test('a chokepoint with an alternative names it', () => {
  const view = renderView(
    'chokepoints',
    makeCtx({ state: { chokepointId: 'suez' } }),
  );
  assert.match(textOf(view), /Cape of Good Hope/);
});

test('the vessel tracking view refuses to imply it knows the cargo', () => {
  const view = renderView(
    'track',
    makeCtx({ state: { navId: 'ships', trackItem: { layerId: 'ais-live-vessels' } } }),
  );
  const text = textOf(view);
  assert.match(text, /no cargo field/i);
  assert.match(text, /DATA UNAVAILABLE/);
});

test('the resource view leads with the export-proxy caveat', () => {
  const view = renderView('resource', makeCtx());
  const text = textOf(view);
  assert.match(text, /exports, not production/i);
  assert.match(text, /re-export hubs/i);
  assert.match(text, /domestic consumption is invisible/i);
});

test('the events view states what the feed does not carry', () => {
  const view = renderView('events', makeCtx());
  const text = textOf(view);
  assert.match(text, /strikes, port closures, sanctions/i);
  assert.match(text, /not evidence that nothing happened/i);
});

test('the layers view lists the gaps instead of hiding them', () => {
  const view = renderView('layers', makeCtx());
  const text = textOf(view);
  assert.match(text, /Freight Rail Corridors/);
  assert.match(text, /No open global freight-rail dataset/i);
});

/* ------------------------------------------------------------------ *
 * Interaction
 * ------------------------------------------------------------------ */

test('clicking a chokepoint row opens its detail and flies there', () => {
  const ctx = makeCtx();
  const view = renderView('chokepoints', ctx);
  const rows = view.cards.flatMap((node) =>
    node.querySelectorAll('.ws-clickable'),
  );
  const hormuz = rows.find((row) => row.textContent.includes('Hormuz'));
  assert.ok(hormuz, 'the chokepoint list must be clickable');
  hormuz.click();
  assert.equal(ctx.state.chokepointId, 'hormuz');
  assert.ok(ctx.calls.some(([kind]) => kind === 'flyTo'));
  assert.ok(ctx.calls.some(([kind, id]) => kind === 'setEnabled' && id === 'chokepoints'));
});

test('the disruption view closes the selected chokepoint', () => {
  const ctx = makeCtx({ state: { disruptionTarget: 'malacca' } });
  const view = renderView('disruption', ctx);
  const button = view.cards
    .flatMap((node) => node.querySelectorAll('BUTTON'))
    .find((node) => node.textContent.includes('Close Strait of Malacca'));
  assert.ok(button, 'the close button must name what it closes');
  button.click();
  assert.deepEqual(
    ctx.calls.find(([kind]) => kind === 'simulate'),
    ['simulate', 'malacca'],
  );
});

test('a severed route is reported as severed, not as zero extra distance', () => {
  const ctx = makeCtx({
    state: { disruptionTarget: 'hormuz' },
    data: {
      scenario: {
        point: { id: 'hormuz', name: 'Strait of Hormuz' },
        result: {
          reachableBefore: true,
          reachableAfter: false,
          before: { distanceKm: 8244, nodeNames: ['Ras Tannurah', 'Rotterdam'] },
          after: null,
          delta: null,
          alternatives: [],
          note: 'The disruption severs this origin-destination pair entirely.',
        },
        reach: null,
      },
    },
  });
  const view = renderView('disruption', ctx);
  const text = textOf(view);
  assert.match(text, /no route/);
  assert.match(text, /severs this origin-destination pair/);
  assert.ok(!/\+0 km/.test(text), 'a severed route must not read as +0 km');
});

test('a chokepoint nothing routes through says that, and offers a way forward', () => {
  const ctx = makeCtx({
    state: { disruptionTarget: 'cape-of-good-hope' },
    data: { scenario: { noLane: true, point: { id: 'cape-of-good-hope' } } },
  });
  const view = renderView('disruption', ctx);
  const text = textOf(view);
  assert.match(text, /Nothing in this network routes through/);
  assert.match(text, /Close Suez Canal instead/);
});

test('a next-step button navigates', () => {
  const ctx = makeCtx();
  const view = renderView('home', ctx);
  const next = view.cards
    .flatMap((node) => node.querySelectorAll('.ws-next-item'))
    .at(0);
  assert.ok(next, 'home must suggest a next step');
  next.click();
  assert.ok(ctx.calls.some(([kind]) => kind === 'navigate'));
});

/* ------------------------------------------------------------------ *
 * Components
 * ------------------------------------------------------------------ */

test('a card never becomes its own scroll container', () => {
  // The defect this whole layout exists to fix: five sections, five scrollbars.
  // A card must not set overflow, at all, ever.
  const node = card({ title: 'T', children: 'body' });
  assert.equal(node.style.overflow, undefined);
  assert.equal(node.style.overflowY, undefined);
});

test('a collapsible card starts collapsed when asked and toggles on click', () => {
  const node = card({ title: 'T', collapsible: true, startCollapsed: true, children: 'x' });
  assert.ok(node.classList.contains('ws-collapsed'));
  node.querySelector('.ws-card-head').click();
  assert.ok(!node.classList.contains('ws-collapsed'));
});

test('the four states are visually distinct classes', () => {
  // "No data exists" and "the request failed" are different facts and must not
  // collapse into one grey box.
  assert.ok(loadingState('x').classList.contains('ws-state-loading'));
  assert.ok(errorState({ what: 'x' }).classList.contains('ws-state-error'));
  assert.ok(emptyState({ what: 'x' }).classList.contains('ws-state-empty'));
  assert.ok(
    unavailableState({ what: 'x', because: 'y' }).classList.contains('ws-state-gap'),
  );
});

test('an error state without a retry is still legible, with one is actionable', () => {
  const plain = errorState({ what: 'vessel data' });
  assert.match(plain.textContent, /Unable to load vessel data/);
  let retried = 0;
  const actionable = errorState({ what: 'x', onRetry: () => (retried += 1) });
  actionable.querySelector('BUTTON').click();
  assert.equal(retried, 1);
});

test('an unavailable state must say what would be needed', () => {
  const node = unavailableState({
    what: 'Per-port throughput.',
    because: 'It is commercial.',
    wouldNeed: 'A Drewry subscription.',
    instead: 'Country-level TEU.',
  });
  const text = node.textContent;
  assert.match(text, /DATA UNAVAILABLE/);
  assert.match(text, /Would need: A Drewry subscription/);
  assert.match(text, /instead: Country-level TEU/i);
});

test('a glossary term carries its definition where the word is', () => {
  const node = term('chokepoint');
  assert.equal(node.tagName, 'ABBR');
  assert.match(node.getAttribute('title'), /narrow stretch of sea/i);
});

test('an unknown term renders as plain text rather than a dead tooltip', () => {
  const node = term('not-a-real-term');
  assert.equal(node.tagName, 'SPAN');
  assert.equal(node.getAttribute('title'), null);
});

test('whyThisMatters requires the what, and shows the data class when given', () => {
  const node = whyThisMatters({
    what: 'These arcs are trade.',
    why: 'Because customs recorded it.',
    dataClass: 'HISTORICAL',
  });
  const text = node.textContent;
  assert.match(text, /WHY THIS MATTERS/);
  assert.match(text, /These arcs are trade/);
  assert.match(text, /HISTORICAL/);
  assert.match(text, /A past measurement/);
});

test.after(() => dom.restore());
