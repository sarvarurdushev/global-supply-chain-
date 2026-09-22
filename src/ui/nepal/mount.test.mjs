import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installTestDom } from '../../workspace/testDom.mjs';

installTestDom();

const { createNepalCaseMount, isCaseHash, CASE_HASH_PREFIX } = await import(
  './mount.js'
);
const { ANALYSIS_BASE } = await import('../../nepal/story/loader.js');

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function diskFetch() {
  return async (url) => {
    const name = url.split('/').pop();
    const dir = url.startsWith(ANALYSIS_BASE) ? 'analysis' : 'processed';
    const text = await readFile(path.join(ROOT, 'data', dir, name), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
  };
}

/**
 * A window whose hash behaves like the real one: assigning it fires
 * `hashchange`. That is the whole reason the echo guard exists, so a stub
 * that stayed silent would test nothing.
 */
function fakeWindow(initialHash = '') {
  const listeners = new Map();
  const win = {
    location: { _hash: initialHash },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((entry) => entry !== handler),
      );
    },
    fired: 0,
  };
  Object.defineProperty(win.location, 'hash', {
    get() {
      return this._hash;
    },
    set(value) {
      if (this._hash === value) return;
      this._hash = value;
      win.fired += 1;
      for (const handler of listeners.get('hashchange') ?? []) handler();
    },
  });
  return win;
}

function fakeDoc() {
  const classes = new Set();
  return {
    body: {
      classList: {
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name),
        contains: (name) => classes.has(name),
      },
    },
    classes,
  };
}

function recordingLayers(log = []) {
  return {
    log,
    render: (grouped) => log.push(['render', grouped]),
    flyTo: (pose) => log.push(['fly', pose]),
    destroy: () => log.push(['destroy']),
  };
}

test('the case costs nothing until it is opened', () => {
  const container = document.createElement('div');
  let built = 0;
  const mount = createNepalCaseMount({
    container,
    win: fakeWindow(),
    doc: fakeDoc(),
    createLayers: () => {
      built += 1;
      return recordingLayers();
    },
    fetchImpl: () => assert.fail('nothing should be fetched before opening'),
  });
  assert.equal(built, 0, 'no Cesium collections are constructed');
  assert.equal(mount.experience, null);
  assert.equal(mount.isOpen, false);
  assert.equal(mount.element.hidden, true);
  assert.equal(mount.launcher.hidden, false, 'but there is a way in');
  assert.match(mount.launcher.textContent, /CASE 001/);
  mount.destroy();
});

test('the chip opens the case, and comes back when it closes', async () => {
  const container = document.createElement('div');
  const mount = createNepalCaseMount({
    container,
    win: fakeWindow(),
    doc: fakeDoc(),
    createLayers: () => recordingLayers(),
    fetchImpl: diskFetch(),
  });
  mount.launcher.click();
  assert.equal(mount.isOpen, true);
  assert.equal(mount.launcher.hidden, true);
  /* The click starts an async load; let it settle before asserting on copy. */
  await mount.open();
  assert.match(container.textContent, /CASE NPL-2015-EQ/);

  mount.close();
  assert.equal(mount.launcher.hidden, false);
  mount.destroy();
});

test('opening builds once, starts the case and yields the chrome', async () => {
  const container = document.createElement('div');
  const doc = fakeDoc();
  const win = fakeWindow();
  let built = 0;
  const mount = createNepalCaseMount({
    container,
    win,
    doc,
    createLayers: () => {
      built += 1;
      return recordingLayers();
    },
    fetchImpl: diskFetch(),
  });

  await mount.open();
  assert.equal(built, 1);
  assert.equal(mount.isOpen, true);
  assert.equal(mount.element.hidden, false);
  assert.match(
    win.location.hash,
    /^#\/case\/npl-2015-eq\/scene\//,
    'the opening view is shareable, not just later ones',
  );
  assert.ok(
    doc.classes.has('ndi-open'),
    'the workspace chrome is told to step aside',
  );
  assert.match(container.textContent, /NATURAL DISASTER INTELLIGENCE/);

  // Re-opening does not build a second experience or refetch the case.
  await mount.open();
  assert.equal(built, 1);

  mount.close();
  assert.equal(mount.isOpen, false);
  assert.equal(mount.element.hidden, true);
  assert.equal(doc.classes.has('ndi-open'), false);
  mount.destroy();
});

test('an address naming the case opens it at that scene', async () => {
  const container = document.createElement('div');
  const win = fakeWindow(`${CASE_HASH_PREFIX}/scene/shaking`);
  const mount = createNepalCaseMount({
    container,
    win,
    doc: fakeDoc(),
    createLayers: () => recordingLayers(),
    fetchImpl: diskFetch(),
  });
  // Construction starts the open; wait for the experience to settle.
  await mount.open();
  assert.equal(mount.isOpen, true);
  assert.equal(mount.experience.investigation.state.scene.id, 'shaking');
  mount.destroy();
});

test('moving through the case writes the address, and does not echo', async () => {
  const container = document.createElement('div');
  const win = fakeWindow();
  const mount = createNepalCaseMount({
    container,
    win,
    doc: fakeDoc(),
    createLayers: () => recordingLayers(),
    fetchImpl: diskFetch(),
  });
  await mount.open();
  const before = win.fired;

  mount.experience.goTo(4);
  assert.ok(isCaseHash(win.location.hash), win.location.hash);
  assert.match(win.location.hash, /\/scene\/shaking/);
  /*
   * Exactly one hashchange, absorbed by the guard: the scene the user chose
   * is still the scene on screen, not one re-derived from the link.
   */
  assert.equal(win.fired - before, 1);
  assert.equal(mount.experience.investigation.state.scene.id, 'shaking');
  mount.destroy();
});

test('an address that leaves the case closes it', async () => {
  const container = document.createElement('div');
  const win = fakeWindow();
  const doc = fakeDoc();
  const mount = createNepalCaseMount({
    container,
    win,
    doc,
    createLayers: () => recordingLayers(),
    fetchImpl: diskFetch(),
  });
  await mount.open();
  assert.equal(mount.isOpen, true);

  win.location.hash = '#/somewhere-else';
  assert.equal(mount.isOpen, false);
  assert.equal(doc.classes.has('ndi-open'), false);
  mount.destroy();
});

test('destroying leaves no host, no body class and no listener', async () => {
  const container = document.createElement('div');
  const win = fakeWindow();
  const doc = fakeDoc();
  const log = [];
  const mount = createNepalCaseMount({
    container,
    win,
    doc,
    createLayers: () => recordingLayers(log),
    fetchImpl: diskFetch(),
  });
  await mount.open();
  mount.destroy();

  assert.equal(container.children.length, 0, 'host and chip are both gone');
  assert.equal(doc.classes.has('ndi-open'), false);
  assert.ok(
    log.some(([kind]) => kind === 'destroy'),
    'the map collections are released',
  );
  // A late hashchange must not resurrect anything.
  win.location.hash = `${CASE_HASH_PREFIX}/scene/shaking`;
  assert.equal(container.children.length, 0);
});

test('the PRESENT button starts the presentation, and leaving it keeps the place', async () => {
  const container = document.createElement('div');
  const mount = createNepalCaseMount({
    container,
    win: fakeWindow(),
    doc: fakeDoc(),
    createLayers: () => recordingLayers(),
    fetchImpl: diskFetch(),
  });
  await mount.open();
  assert.equal(mount.presentation, null, 'nothing runs until asked');

  mount.experience.setMode('PRESENT');
  await Promise.resolve();
  assert.ok(mount.presentation, 'the mode switch is what starts it');
  assert.equal(mount.presentation.state.status, 'playing');
  assert.match(container.textContent, /ACT I/);

  /* Step, so the place in the script is somewhere other than the start. */
  mount.presentation.playback.next();
  const at = mount.presentation.state.index;
  assert.ok(at > 0);

  mount.experience.setMode('EXPLORE');
  await Promise.resolve();
  assert.equal(mount.presentation.state.status, 'paused');
  /*
   * Leaving present mode must not tear the runner down: P has to resume from
   * where the presenter stopped, not from the top.
   */
  mount.experience.setMode('PRESENT');
  await Promise.resolve();
  assert.equal(mount.presentation.state.index, at, 'it resumed in place');
  mount.destroy();
});
