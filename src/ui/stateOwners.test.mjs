import assert from 'node:assert/strict';
import test from 'node:test';
import { NavigationController } from './navigationController.js';
import { ShareRestoration } from './shareRestoration.js';

function navigation() {
  const tracking = Object.fromEntries(
    [
      'flightsLayer',
      'militaryFlightsLayer',
      'satellitesLayer',
      'aisLiveVesselsLayer',
      'militaryAwarenessLayer',
      'rocketLaunchesLayer',
    ].map((name) => [name, {}]),
  );
  return new NavigationController({
    viewer: { camera: { cancelFlight() {}, lookAtTransform() {} } },
    tracking,
    searchInput: null,
    interruptCameraMotion() {},
    isCockpitActive: () => false,
    clearLocation() {},
    cancelShareSelection: () => false,
    getDataManager: () => null,
    stopOrbit() {},
    showToast() {},
  });
}

test('navigation generations belong to their owner and teardown closes both entry paths', () => {
  const first = navigation();
  const second = navigation();
  const a = first._beginDeferredNavigation();
  const b = second._beginDeferredNavigation();
  first._stampNavigation();
  assert.equal(first._reassertNavigationHandoff(a), false);
  assert.equal(second._reassertNavigationHandoff(b), true);
  let flights = 0;
  second.stop();
  assert.equal(second._beginDeferredNavigation(), false);
  assert.equal(
    second._runExplicitNavigation('location', () => {
      flights += 1;
    }),
    false,
  );
  assert.equal(flights, 0);
  const generation = second._navigationGeneration;
  second.destroy();
  assert.equal(second._navigationGeneration, generation + 1);
});

test('share teardown settles its promise, removes gestures and rejects a retained timer callback', async (t) => {
  const prior = {
    window: globalThis.window,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  const timers = new Map();
  let timerId = 0;
  globalThis.window = new EventTarget();
  globalThis.setTimeout = (fn) => {
    timers.set(++timerId, fn);
    return timerId;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);
  t.after(() => Object.assign(globalThis, prior));
  const canvas = new EventTarget();
  let stamps = 0;
  let applies = 0;
  const owner = new ShareRestoration({
    viewer: { canvas },
    navigation: {
      _beginDeferredNavigation: () => 1,
      _reassertNavigationHandoff: () => true,
      _stampNavigation: () => {
        stamps += 1;
      },
    },
    syncShareState() {},
    syncModels3d() {},
    showStatus() {},
    feedback: {},
    updateFeedback() {},
  });
  owner.attachLinks({
    parseInitialHash: () => ({ latitude: 30, longitude: -97 }),
    applyState: async () => {
      applies += 1;
      return { camera: 'applied' };
    },
    completeInitialRestore() {},
  });
  owner.start();
  const retained = [...timers.values()][0];
  canvas.dispatchEvent(new Event('wheel'));
  assert.equal(stamps, 1);
  owner.destroy();
  assert.equal((await owner.initialRestorePromise).status, 'destroyed');
  assert.equal(timers.size, 0);
  canvas.dispatchEvent(new Event('wheel'));
  retained();
  await Promise.resolve();
  assert.equal(stamps, 1);
  assert.equal(applies, 0);
});

test('visual teardown restores owned fog and aircraft sensor state once', async (t) => {
  const { VisualSettings } = await import('./visualSettings.js');
  const priorDocument = globalThis.document;
  globalThis.document = {
    documentElement: { dataset: {} },
    getElementById: () => null,
  };
  t.after(() => {
    globalThis.document = priorDocument;
  });
  const calls = [];
  const viewer = { scene: { fog: { enabled: false } } };
  const owner = new VisualSettings({
    viewer,
    elements: {},
    operations: {},
    services: {
      governorRequestRender() {},
      holdContinuousRender() {},
      releaseContinuousRender() {},
    },
    readDataManager: () => ({ setLayerParams: (...args) => calls.push(args) }),
  });
  owner._irBoostActive = true;
  owner._irFogWasEnabled = true;
  owner.releaseIrBoost();
  owner.releaseIrBoost();
  assert.equal(viewer.scene.fog.enabled, true);
  assert.deepEqual(calls, [
    ['flights', { irBoost: false }],
    ['military', { irBoost: false }],
  ]);
  assert.equal(owner._irBoostActive, false);
  owner.destroy();
});

test('the case entry does not restore layers a workspace session saved', async (t) => {
  /*
   * `/` opens Case 001. Live layers a previous workspace session left on
   * would draw under the case, so the case entry declines them; the named
   * workspace (`#/workspace`) restores them exactly as before.
   */
  const {
    createDefaultLayerState,
    serializeStoredLayerState,
    LAYER_STATE_STORAGE_KEY,
  } = await import('../data/layerState.js');
  const stored = serializeStoredLayerState(createDefaultLayerState());
  const prior = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => (key === LAYER_STATE_STORAGE_KEY ? stored : null),
    setItem() {},
  };
  t.after(() => {
    if (prior === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prior;
  });
  const sources = {};
  for (const restoreLocalLayers of [true, false]) {
    const owner = new ShareRestoration({
      viewer: {},
      restoreLocalLayers,
      navigation: {},
      syncShareState() {},
      syncModels3d() {},
      showStatus() {},
      feedback: {},
      updateFeedback() {},
    });
    owner.attachLinks({
      parseInitialHash: () => null,
      setLayerStateProvider() {},
      onLayerStateChange() {},
    });
    owner.connect({
      registrationsFinalized: true,
      subscribe: () => () => {},
      subscribeVisibilityRequests: () => () => {},
      layers: new Map(),
      getAll: () => [],
      isEnabled: () => false,
    });
    await owner._layerStateRestorePromise;
    sources[restoreLocalLayers] = owner._layerStateCoordinator.source;
    owner._layerStateCoordinator.destroy();
  }
  assert.equal(sources.true, 'local', 'the workspace restores saved layers');
  assert.equal(sources.false, 'legacy-share', 'the case entry does not');
});
