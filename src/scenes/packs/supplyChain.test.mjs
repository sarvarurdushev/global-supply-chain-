import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPLY_CHAIN_TOUR_ID,
  READABLE_HOLD_SEC,
  TOUR_DATA_SCRIPT,
  supplyChainScenePresentation,
  tourDataForShot,
  createTourDataRunner,
} from './supplyChain.js';
import { getSceneRecipeById } from '../recipes.js';
import { recipeToScene } from '../project.js';
import { CHOKEPOINTS } from '../../supplychain/reference/chokepoints.js';

const recipe = getSceneRecipeById(SUPPLY_CHAIN_TOUR_ID);

/* ---------------- the recipe and the script must agree ----------------
 *
 * The data script is keyed by shot title. If a title drifts, the shot still
 * flies but arrives with no data on the globe — a silent failure that looks
 * like a rendering bug. These two tests are the reason renaming a shot is safe.
 */

test('the tour recipe is installed', () => {
  assert.ok(recipe, `${SUPPLY_CHAIN_TOUR_ID} must be a shipped recipe`);
  assert.equal(recipe.cameraPath.length, 7);
});

test('every shot title has a data-script entry', () => {
  for (const keyframe of recipe.cameraPath) {
    assert.ok(
      Object.hasOwn(TOUR_DATA_SCRIPT, keyframe.title),
      `shot "${keyframe.title}" has no entry in TOUR_DATA_SCRIPT`,
    );
  }
});

test('every data-script entry belongs to a shot', () => {
  const titles = new Set(recipe.cameraPath.map((k) => k.title));
  for (const title of Object.keys(TOUR_DATA_SCRIPT)) {
    assert.ok(titles.has(title), `script entry "${title}" has no shot`);
  }
});

test('every scripted chokepoint exists in the reference data', () => {
  const ids = new Set(CHOKEPOINTS.map((c) => c.id));
  for (const [title, entry] of Object.entries(TOUR_DATA_SCRIPT)) {
    if (entry.action !== 'simulate') continue;
    assert.ok(ids.has(entry.target), `${title} targets unknown ${entry.target}`);
  }
});

test('every beat states its data class', () => {
  // §23: LIVE, HISTORICAL, INFERRED and SIMULATED never mix invisibly. A
  // cinematic sequence is where that is easiest to lose, so each caption
  // carries its class.
  const classes = /HISTORICAL|LIVE|SIMULATED|INFERRED|REFERENCE|DATA UNAVAILABLE/;
  for (const [title, entry] of Object.entries(TOUR_DATA_SCRIPT)) {
    assert.match(entry.caption, classes, `${title} caption states no data class`);
  }
});

test('the Taiwan beat declares an absence rather than filling it', () => {
  const entry = TOUR_DATA_SCRIPT['The Gap Where Taiwan Should Be'];
  assert.equal(entry.action, 'none', 'there is no query that would populate it');
  assert.match(entry.caption, /DATA UNAVAILABLE/);
  assert.match(entry.caption, /does not report/);
});

/* ---------------- presentation ---------------- */

test('a trade-arc shot gets a readable hold floor', () => {
  assert.equal(
    supplyChainScenePresentation.minimumHoldSec({
      'trade-flows': { enabled: true },
    }),
    READABLE_HOLD_SEC.tradeFlows,
  );
});

test('an events shot gets the events floor', () => {
  assert.equal(
    supplyChainScenePresentation.minimumHoldSec({
      'supply-events': { enabled: true },
    }),
    READABLE_HOLD_SEC.events,
  );
});

test('the floor is the larger of the two when both are on', () => {
  assert.equal(
    supplyChainScenePresentation.minimumHoldSec({
      'trade-flows': { enabled: true },
      'supply-events': { enabled: true },
    }),
    Math.max(READABLE_HOLD_SEC.tradeFlows, READABLE_HOLD_SEC.events),
  );
});

test('another pack’s shot is left alone', () => {
  assert.equal(
    supplyChainScenePresentation.minimumHoldSec({
      'bhote-koshi-locator': { enabled: true },
    }),
    0,
  );
  assert.equal(supplyChainScenePresentation.minimumHoldSec(undefined), 0);
});

test('the authored holds already clear their own floors', () => {
  // Otherwise the adapter would silently override the authored pacing, which
  // would make the recipe's numbers a lie about what plays.
  const scene = recipeToScene(recipe);
  for (const shot of scene.shots) {
    const floor = supplyChainScenePresentation.minimumHoldSec(shot.layers);
    assert.ok(
      shot.holdSec >= floor,
      `${shot.title}: authored hold ${shot.holdSec}s is below its ${floor}s floor`,
    );
  }
});

test('a tour shot downgrades photoreal to imagery', () => {
  const shot = { layers: { 'trade-flows': { enabled: true } } };
  assert.deepEqual(
    supplyChainScenePresentation.resolveVisual(shot, { mapStack: 'photoreal' }),
    { mapStack: 'esri-imagery' },
  );
  // Anything already on imagery is untouched, as is another pack's shot.
  assert.deepEqual(
    supplyChainScenePresentation.resolveVisual(shot, { mapStack: 'osm' }),
    { mapStack: 'osm' },
  );
  assert.deepEqual(
    supplyChainScenePresentation.resolveVisual(
      { layers: { flights: { enabled: true } } },
      { mapStack: 'photoreal' },
    ),
    { mapStack: 'photoreal' },
  );
});

/* ---------------- the runner ---------------- */

function stubConsole() {
  const calls = [];
  return {
    calls,
    setCommodity: (v) => calls.push(['setCommodity', v]),
    setReporter: (v) => calls.push(['setReporter', v]),
    setFlow: (v) => calls.push(['setFlow', v]),
    setYear: (v) => calls.push(['setYear', v]),
    run: async () => calls.push(['run']),
    simulate: (v) => calls.push(['simulate', v]),
    loadEvents: async () => calls.push(['loadEvents']),
  };
}

function shotLoaded(title, sceneId = SUPPLY_CHAIN_TOUR_ID) {
  return { change: { type: 'shot-loaded', sceneId, shot: { title } } };
}

test('a scripted shot drives the console', () => {
  const consoleHandle = stubConsole();
  const run = createTourDataRunner({ console: consoleHandle });
  assert.equal(run(shotLoaded('World Trade In One Commodity')), 'run');
  assert.deepEqual(consoleHandle.calls, [
    ['setCommodity', 'semiconductors'],
    ['setReporter', 'KOR'],
    ['setFlow', 'M'],
    ['setYear', 2023],
    ['run'],
  ]);
});

test('an identical consecutive request is not re-issued', () => {
  // The world view and the Korea view are the same query at two altitudes.
  const consoleHandle = stubConsole();
  const run = createTourDataRunner({ console: consoleHandle });
  run(shotLoaded('World Trade In One Commodity'));
  const before = consoleHandle.calls.length;
  assert.equal(run(shotLoaded('The Dependency')), 'skipped');
  assert.equal(consoleHandle.calls.length, before);
});

test('the simulate beat closes the scripted chokepoint', () => {
  const consoleHandle = stubConsole();
  const run = createTourDataRunner({ console: consoleHandle });
  assert.equal(run(shotLoaded('Suez Under Closure')), 'simulate');
  assert.deepEqual(consoleHandle.calls, [['simulate', 'suez']]);
});

test('the live beat loads events', () => {
  const consoleHandle = stubConsole();
  const run = createTourDataRunner({ console: consoleHandle });
  assert.equal(run(shotLoaded('What Is Happening Right Now')), 'loadEvents');
  assert.deepEqual(consoleHandle.calls, [['loadEvents']]);
});

test('an unscripted or action-free shot does nothing', () => {
  const consoleHandle = stubConsole();
  const run = createTourDataRunner({ console: consoleHandle });
  assert.equal(run(shotLoaded('The Gap Where Taiwan Should Be')), null);
  assert.equal(run(shotLoaded('Some Shot Nobody Scripted')), null);
  assert.deepEqual(consoleHandle.calls, []);
});

test('another scene’s playback is ignored', () => {
  const consoleHandle = stubConsole();
  const run = createTourDataRunner({ console: consoleHandle });
  assert.equal(
    run(shotLoaded('World Trade In One Commodity', 'flights-radar')),
    null,
  );
  assert.deepEqual(consoleHandle.calls, []);
});

test('a non-playback notification is ignored', () => {
  const consoleHandle = stubConsole();
  const run = createTourDataRunner({ console: consoleHandle });
  // The channel emits an initial notification with change: null.
  assert.equal(run({ change: null, initial: true }), null);
  assert.equal(run({ change: { type: 'shot-renamed' } }), null);
  assert.equal(run(undefined), null);
  assert.deepEqual(consoleHandle.calls, []);
});

test('a failed async loader reaches onError without throwing at the caller', async () => {
  const errors = [];
  const run = createTourDataRunner({
    console: {
      ...stubConsole(),
      loadEvents: async () => {
        throw new Error('GDACS unreachable');
      },
    },
    onError: (error) => errors.push(error.message),
  });
  assert.equal(run(shotLoaded('What Is Happening Right Now')), 'loadEvents');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(errors, ['GDACS unreachable']);
});

test('a synchronous console failure is reported, not thrown', () => {
  const errors = [];
  const run = createTourDataRunner({
    console: {
      ...stubConsole(),
      simulate: () => {
        throw new Error('no graph');
      },
    },
    onError: (error) => errors.push(error.message),
  });
  assert.equal(run(shotLoaded('Suez Under Closure')), 'failed');
  assert.deepEqual(errors, ['no graph']);
});

test('the runner refuses to be built without a console', () => {
  assert.throws(() => createTourDataRunner({}), /console handle is required/);
});

test('tourDataForShot tolerates a shot with no usable title', () => {
  assert.equal(tourDataForShot(undefined), null);
  assert.equal(tourDataForShot({}), null);
  assert.equal(tourDataForShot({ title: 42 }), null);
});

/* ---------------- camera ownership ----------------
 *
 * Measured in the running app before this was added: the tour's Suez beat is
 * authored at 700 km altitude, and the console's scenario fly-to left the
 * camera at 2,500 km. During an authored scene the director owns the camera.
 */

function cameraTrackingConsole() {
  const suspensions = [];
  let suspended = false;
  const base = stubConsole();
  return {
    ...base,
    suspensions,
    isSuspended: () => suspended,
    setCameraSuspended(next) {
      const previous = suspended;
      suspended = Boolean(next);
      suspensions.push(suspended);
      return previous;
    },
    simulate(target) {
      base.calls.push(['simulate', target, { suspended }]);
    },
    async run() {
      base.calls.push(['run', { suspended }]);
    },
    async loadEvents() {
      base.calls.push(['loadEvents', { suspended }]);
    },
  };
}

test('a synchronous scripted call runs with the camera suspended, then restored', () => {
  const consoleHandle = cameraTrackingConsole();
  const run = createTourDataRunner({ console: consoleHandle });
  run(shotLoaded('Suez Under Closure'));
  assert.deepEqual(consoleHandle.calls, [
    ['simulate', 'suez', { suspended: true }],
  ]);
  assert.deepEqual(consoleHandle.suspensions, [true, false]);
  assert.equal(consoleHandle.isSuspended(), false);
});

test('an async scripted call restores the camera only once it settles', async () => {
  const consoleHandle = cameraTrackingConsole();
  const run = createTourDataRunner({ console: consoleHandle });
  run(shotLoaded('World Trade In One Commodity'));
  assert.equal(consoleHandle.isSuspended(), true, 'still suspended mid-flight');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(consoleHandle.isSuspended(), false);
  assert.deepEqual(consoleHandle.calls.at(-1), ['run', { suspended: true }]);
});

test('a failed async call still restores the camera', async () => {
  const consoleHandle = {
    ...cameraTrackingConsole(),
    loadEvents: async () => {
      throw new Error('down');
    },
  };
  const errors = [];
  const run = createTourDataRunner({
    console: consoleHandle,
    onError: (error) => errors.push(error.message),
  });
  run(shotLoaded('What Is Happening Right Now'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(errors, ['down']);
  assert.equal(consoleHandle.isSuspended(), false);
});

test('a console without the camera hook is still driveable', () => {
  // setCameraSuspended is optional so a partial handle does not break the tour.
  const consoleHandle = stubConsole();
  delete consoleHandle.setCameraSuspended;
  const run = createTourDataRunner({ console: consoleHandle });
  assert.equal(run(shotLoaded('Suez Under Closure')), 'simulate');
});

test('every scripted commodity is a key setCommodity would accept', async () => {
  // setCommodity() takes a GROUP KEY and returns false for anything else. The
  // script originally passed HS codes ("8542"), which were silently rejected —
  // the tour then ran against whatever commodity happened to be selected and
  // looked entirely plausible while doing it.
  const { COMMODITY_GROUPS } = await import(
    '../../supplychain/reference/commodities.js'
  );
  const keys = new Set(COMMODITY_GROUPS.map((g) => g.key));
  for (const [title, entry] of Object.entries(TOUR_DATA_SCRIPT)) {
    if (!entry.commodity) continue;
    assert.ok(
      keys.has(entry.commodity),
      `"${title}" uses commodity "${entry.commodity}", which setCommodity() rejects`,
    );
  }
});

test('every scripted reporter is a country setReporter would accept', async () => {
  const { COUNTRIES } = await import('../../supplychain/reference/countries.js');
  const iso3 = new Set(COUNTRIES.map((c) => c.iso3));
  for (const [title, entry] of Object.entries(TOUR_DATA_SCRIPT)) {
    if (!entry.reporter) continue;
    assert.ok(iso3.has(entry.reporter), `"${title}" uses unknown reporter`);
  }
});
