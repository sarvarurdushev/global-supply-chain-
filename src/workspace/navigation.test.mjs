import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NAV_SECTIONS,
  NAV_ITEMS,
  DEFAULT_NAV_ID,
  navItem,
  nextSteps,
} from './navigation.js';
import { NEXT_STEPS } from './navigation.js';
import { INVESTIGATIONS, investigation } from './investigations.js';

/** Views that declare suggestions at all. */
const NEXT_STEPS_VIEWS = new Set(Object.keys(NEXT_STEPS));
import { LAYER_NAMES } from './taxonomy.js';

test('every nav item says what it is and why it matters', () => {
  // Requirement: a user should never have to guess what a menu entry does.
  for (const item of NAV_ITEMS) {
    assert.ok(item.name?.length > 2, `${item.id} has no name`);
    assert.ok(
      item.summary?.length > 15,
      `${item.id} ("${item.name}") has no summary`,
    );
    assert.ok(item.icon?.length >= 1, `${item.id} has no icon`);
    assert.ok(item.view?.length > 2, `${item.id} opens no view`);
  }
});

test('every nav item declares an honest status', () => {
  for (const item of NAV_ITEMS) {
    assert.ok(
      ['ready', 'partial', 'gap'].includes(item.status),
      `${item.id} has status "${item.status}"`,
    );
  }
});

test('anything less than ready explains the shortfall', () => {
  // A "partial" entry that does not say what is partial about it is just a
  // broken feature with a nicer word on it.
  for (const item of NAV_ITEMS.filter((i) => i.status !== 'ready')) {
    assert.ok(
      item.note?.length > 25,
      `${item.id} is "${item.status}" but does not say why`,
    );
  }
});

test('nav item ids are unique', () => {
  const ids = NAV_ITEMS.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate nav id');
});

test('the sections the requirements asked for are all present', () => {
  /*
   * §22's sections, plus the supply-chain ones the pivot kept.
   *
   * "Global Overview" became "Baseline" when the platform pivoted to disaster
   * investigation: it is no longer where a user starts, it is the undisrupted
   * world they compare the event against. The supply-chain sections are all
   * still here, because §8 requires the capability to stay.
   */
  const titles = NAV_SECTIONS.map((s) => s.title);
  for (const expected of [
    'Events',
    'Investigate',
    'Impact',
    'Consequences',
    'Response',
    'Sources',
    'Baseline',
    'Analyze',
    'Track',
    'Map Layers',
  ]) {
    assert.ok(titles.includes(expected), `missing section: ${expected}`);
  }
});

test('the default landing item exists', () => {
  const item = navItem(DEFAULT_NAV_ID);
  assert.ok(item);
  assert.equal(item.view, 'home');
});

test('navItem returns null rather than undefined for a miss', () => {
  assert.equal(navItem('no-such-item'), null);
  assert.equal(navItem(undefined), null);
});

test('every tracking entry points at a layer the app actually has', () => {
  const known = new Set(LAYER_NAMES.map((l) => l.id));
  for (const item of NAV_ITEMS.filter((i) => i.layerId)) {
    assert.ok(
      known.has(item.layerId),
      `${item.id} tracks unknown layer "${item.layerId}"`,
    );
  }
});

test('every investigation entry points at a defined investigation', () => {
  for (const item of NAV_ITEMS.filter((i) => i.investigationId)) {
    assert.ok(
      investigation(item.investigationId),
      `${item.id} references unknown investigation "${item.investigationId}"`,
    );
  }
});

test('every investigation is reachable from the navigation', () => {
  // Otherwise it exists in code and nowhere a user can find it.
  const reachable = new Set(
    NAV_ITEMS.map((i) => i.investigationId).filter(Boolean),
  );
  for (const entry of INVESTIGATIONS) {
    assert.ok(
      reachable.has(entry.id),
      `investigation "${entry.id}" has no nav entry`,
    );
  }
});

/* ---------------- next steps ---------------- */

test('next steps are phrased as questions, not as menu labels', () => {
  // "Chokepoints" is a destination; "What could interrupt this?" is a thought
  // the user is already having.
  for (const view of ['home', 'commodity', 'chokepoints', 'events']) {
    const steps = nextSteps(view);
    assert.ok(steps.length > 0, `${view} suggests nothing`);
    for (const step of steps) {
      assert.ok(
        step.question.length > 12,
        `${view} suggestion "${step.question}" is too terse to be a question`,
      );
    }
  }
});

test('every suggested next step resolves to a real nav item', () => {
  for (const view of Object.keys(
    Object.fromEntries(NAV_ITEMS.map((i) => [i.view, true])),
  )) {
    for (const step of nextSteps(view)) {
      assert.ok(step.item, `${view} suggests a missing item`);
      assert.ok(step.item.name);
    }
  }
});

test('an unknown view suggests nothing rather than throwing', () => {
  assert.deepEqual(nextSteps('nowhere'), []);
  assert.deepEqual(nextSteps(undefined), []);
});

test('no nav item suggests itself as the next step', () => {
  // The risk view inherited `nextFrom: 'resource'` and so offered
  // "Environmental Risk" as the thing to do after Environmental Risk.
  //
  // Compared by ITEM, not by view: Ships and Major Logistics Hubs share the
  // track renderer and are different destinations, so "which ports are near
  // it?" from a vessel is a real next step rather than a loop.
  for (const item of NAV_ITEMS) {
    for (const step of nextSteps(item.view, item.id)) {
      assert.notEqual(
        step.item.id,
        item.id,
        `${item.id} suggests itself: "${step.question}"`,
      );
    }
  }
});

test('excluding the current item still leaves somewhere to go', () => {
  // Filtering must not empty the list — a view with one suggestion that
  // happens to be itself would leave the user at a dead end.
  for (const item of NAV_ITEMS) {
    const steps = nextSteps(item.view, item.id);
    if (NEXT_STEPS_VIEWS.has(item.view)) {
      assert.ok(steps.length > 0, `${item.id} has nowhere to go`);
    }
  }
});
