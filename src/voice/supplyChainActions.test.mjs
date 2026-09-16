import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveCommodity,
  resolveCountry,
  resolveChokepoint,
  createSupplyChainActions,
} from './supplyChainActions.js';
import { GEV_ACTION_SCHEMAS } from './actionSchemas.js';

test('the supply-chain actions are declared in the schema inventory', () => {
  const names = GEV_ACTION_SCHEMAS.map((s) => s.name);
  for (const expected of [
    'show_trade_flows',
    'simulate_supply_disruption',
    'set_trade_period',
    'explain_trade_evidence',
  ]) {
    assert.ok(names.includes(expected), `${expected} must be declared`);
  }
  // A handler without a schema is unreachable; a schema without a handler is a
  // promise the model cannot keep.
  const handlers = Object.keys(
    createSupplyChainActions({ console: stubConsole() }),
  );
  for (const name of handlers) {
    assert.ok(names.includes(name), `handler ${name} has no schema`);
  }
});

test('the supply-chain layers are toggleable by voice', () => {
  const layerAction = GEV_ACTION_SCHEMAS.find((s) => s.name === 'set_layer_visibility');
  const ids = layerAction.parameters.properties.layerId.enum;
  assert.ok(ids.includes('trade-flows'));
  assert.ok(ids.includes('supply-ports'));
  assert.ok(ids.includes('chokepoints'));
});

test('resolveCommodity accepts slugs, labels and loose speech', () => {
  assert.equal(resolveCommodity('semiconductors')?.key, 'semiconductors');
  assert.equal(resolveCommodity('Semiconductors (integrated circuits)')?.key, 'semiconductors');
  assert.equal(resolveCommodity('crude oil')?.key, 'crude-oil');
  assert.equal(resolveCommodity('  COPPER  ')?.key, 'copper');
  assert.equal(resolveCommodity('unobtainium'), null);
  assert.equal(resolveCommodity(''), null);
  assert.equal(resolveCommodity(null), null);
});

test('resolveCountry accepts ISO3 and names', () => {
  assert.equal(resolveCountry('KOR')?.iso3, 'KOR');
  assert.equal(resolveCountry('kor')?.iso3, 'KOR');
  assert.equal(resolveCountry('South Korea')?.iso3, 'KOR');
  assert.equal(resolveCountry('Netherlands')?.iso3, 'NLD');
  assert.equal(resolveCountry('Atlantis'), null);
});

test('resolveChokepoint accepts ids and spoken names', () => {
  assert.equal(resolveChokepoint('suez')?.id, 'suez');
  assert.equal(resolveChokepoint('Suez Canal')?.id, 'suez');
  assert.equal(resolveChokepoint('hormuz')?.id, 'hormuz');
  assert.equal(resolveChokepoint('nowhere'), null);
});

test('show_trade_flows drives the console and reports its result', async () => {
  const calls = [];
  const actions = createSupplyChainActions({
    console: stubConsole({
      onCall: (name, value) => calls.push([name, value]),
      describeResult: () => 'Semiconductors imports for KOR in 2023.',
    }),
  });
  const result = await actions.show_trade_flows({
    commodity: 'semiconductors',
    country: 'KOR',
    direction: 'imports',
    year: 2022,
  });
  assert.equal(result.ok, true);
  assert.match(result.spoken, /Semiconductors imports/);
  assert.deepEqual(calls, [
    ['setCommodity', 'semiconductors'],
    ['setReporter', 'KOR'],
    ['setFlow', 'M'],
    ['setYear', 2022],
    ['run', undefined],
  ]);
});

test('show_trade_flows refuses a country that does not report', async () => {
  // The Taiwan case. The honest answer is the gap, not a substitute figure.
  const actions = createSupplyChainActions({ console: stubConsole() });
  const result = await actions.show_trade_flows({
    commodity: 'semiconductors',
    country: 'Taiwan',
  });
  assert.equal(result.ok, false);
  assert.match(result.spoken, /does not report trade to UN Comtrade/);
  assert.match(result.spoken, /partners report/);
});

test('show_trade_flows refuses an unknown commodity rather than guessing', async () => {
  const actions = createSupplyChainActions({ console: stubConsole() });
  const result = await actions.show_trade_flows({ commodity: 'moon rocks' });
  assert.equal(result.ok, false);
  assert.match(result.spoken, /do not have a commodity/);
});

test('simulate_supply_disruption speaks the modelled delta and flags it as a model', async () => {
  const actions = createSupplyChainActions({
    console: stubConsole({
      simulate: () => ({
        result: {
          reachableBefore: true,
          reachableAfter: true,
          after: { nodeNames: ['Busan', 'Singapore', 'Cape of Good Hope', 'Rotterdam'] },
          delta: { additionalDistanceKm: 6986, additionalHours: 220 },
        },
      }),
    }),
  });
  const result = await actions.simulate_supply_disruption({ chokepoint: 'suez' });
  assert.equal(result.ok, true);
  assert.match(result.spoken, /6,986 kilometres/);
  assert.match(result.spoken, /9\.2 modelled days/);
  // Both honesty markers are mandatory in the spoken answer.
  assert.match(result.spoken, /model result/);
  assert.match(result.spoken, /geographic, not commercially validated/);
});

test('a severed route is spoken without overclaiming', async () => {
  const actions = createSupplyChainActions({
    console: stubConsole({
      simulate: () => ({
        result: { reachableBefore: true, reachableAfter: false },
      }),
    }),
  });
  const result = await actions.simulate_supply_disruption({ chokepoint: 'hormuz' });
  assert.match(result.spoken, /severs the route entirely in the loaded network/);
  assert.match(
    result.spoken,
    /does not mean none exists in the world/,
    'must not claim the world has no alternative',
  );
});

test('set_trade_period rejects a year outside the available range', async () => {
  const actions = createSupplyChainActions({
    console: stubConsole({ setYear: () => false }),
  });
  const result = await actions.set_trade_period({ year: 1999 });
  assert.equal(result.ok, false);
  assert.match(result.spoken, /2015 through 2023/);
});

test('explain_trade_evidence answers only from loaded data', async () => {
  const empty = createSupplyChainActions({
    console: stubConsole({ describeEvidence: () => null }),
  });
  const none = await empty.explain_trade_evidence();
  assert.equal(none.ok, false);
  assert.match(none.spoken, /Nothing is loaded/);

  const loaded = createSupplyChainActions({
    console: stubConsole({
      describeEvidence: () => 'These figures come from UN Comtrade.',
    }),
  });
  const answer = await loaded.explain_trade_evidence();
  assert.equal(answer.ok, true);
  assert.match(answer.spoken, /UN Comtrade/);
});

test('createSupplyChainActions requires a console', () => {
  assert.throws(() => createSupplyChainActions({ console: null }), TypeError);
  assert.throws(() => createSupplyChainActions({ console: {} }), TypeError);
});

function stubConsole({
  onCall = () => {},
  describeResult = () => 'ok',
  describeEvidence = () => 'evidence',
  simulate = () => null,
  setYear = (year) => {
    onCall('setYear', year);
    return true;
  },
} = {}) {
  return {
    setCommodity: (v) => {
      onCall('setCommodity', v);
      return true;
    },
    setReporter: (v) => {
      onCall('setReporter', v);
      return true;
    },
    setFlow: (v) => {
      onCall('setFlow', v);
      return true;
    },
    setYear,
    run: async () => {
      onCall('run', undefined);
    },
    simulate,
    getState: () => ({ reporter: 'KOR', year: 2023, error: null, hasResult: false }),
    describeResult,
    describeEvidence,
  };
}
