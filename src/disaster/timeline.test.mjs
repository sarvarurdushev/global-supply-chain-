import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UNAVAILABLE_REASONS,
  absoluteTime,
  buildTimeline,
  eventsByPhase,
  worldStateAt,
} from './timeline.js';
import { curatedCase } from './catalogue.js';
import { AVAILABILITY } from './catalogue.js';

const GORKHA = '2015-04-25T06:11:25.950Z';

/** Shocks at +30min, +3h, +10h, +40h after the mainshock. */
const SHOCKS = [
  { magnitude: 6.6, time: '2015-04-25T06:45:21.000Z' },
  { magnitude: 5.0, time: '2015-04-25T09:30:00.000Z' },
  { magnitude: 5.4, time: '2015-04-25T16:00:00.000Z' },
  { magnitude: 6.7, time: '2015-04-26T22:09:00.000Z' },
];

test('an earthquake timeline cannot be warned about; a flood can', () => {
  /*
   * The difference is the whole reason phases are per-hazard. Saying it once
   * on the timeline is better than leaving a reader to notice that some
   * timelines have a left-hand half and others do not.
   */
  assert.equal(buildTimeline(curatedCase('nepal-gorkha-2015')).warnable, false);
  assert.equal(buildTimeline(curatedCase('bhote-koshi-2026')).warnable, true);
});

test('every phase says what happened and what to watch', () => {
  for (const id of ['nepal-gorkha-2015', 'bhote-koshi-2026']) {
    const timeline = buildTimeline(curatedCase(id));
    for (const step of timeline.steps) {
      assert.ok(step.what?.length > 20, `${id} ${step.key} has no narrative`);
      assert.ok(step.evidenceSummary?.length > 5);
      assert.ok(Array.isArray(step.layers));
    }
  }
});

test('a hazard with no authored narrative falls back rather than borrowing one', () => {
  /*
   * A cyclone must not be given an earthquake's story about aftershocks. With
   * no entry the phase prints its own generic heading.
   */
  const timeline = buildTimeline({ id: 'x', hazardId: 'cyclone', date: '2026-01-01' });
  for (const step of timeline.steps) {
    assert.doesNotMatch(step.what, /aftershock|rupture/i);
    assert.ok(step.what.length > 3);
  }
});

test('phases carry an absolute instant when the case has a date', () => {
  const timeline = buildTimeline(curatedCase('nepal-gorkha-2015'));
  const onset = timeline.steps.find((step) => step.key === 'T-0');
  assert.equal(onset.at, '2015-04-25T00:00:00.000Z');
  const sixHours = timeline.steps.find((step) => step.key === 'T+6h');
  assert.equal(sixHours.at, '2015-04-25T06:00:00.000Z');
  assert.equal(absoluteTime(null, 5), null);
  assert.equal(absoluteTime('not-a-date', 5), null);
});

/* ------------------------------------------------------------------ *
 * The honesty core
 * ------------------------------------------------------------------ */

test('no phase claims a running casualty count', () => {
  /*
   * The constraint the module exists to hold. No disaster publishes deaths by
   * the hour, so "T+6h: 1,240 deaths" would be inventing the most emotionally
   * loaded number in the product.
   */
  const timeline = buildTimeline(curatedCase('nepal-gorkha-2015'));
  for (const step of timeline.steps) {
    assert.ok(
      !step.observed.includes('casualty-count'),
      `${step.key} claims to observe casualties`,
    );
    assert.ok(
      !step.modelled.includes('casualty-count'),
      `${step.key} claims to model casualties`,
    );
  }
  // And it is explicitly declared unavailable across the impact phases.
  const declaring = timeline.steps.filter((step) =>
    step.unavailable.some((item) => item.id === 'casualty-count'),
  );
  assert.ok(declaring.length >= 5);
});

test('every unavailable dimension says why, what would fix it, and what is shown instead', () => {
  const timeline = buildTimeline(curatedCase('nepal-gorkha-2015'));
  const seen = new Set();
  for (const step of timeline.steps) {
    for (const item of step.unavailable) {
      seen.add(item.id);
      assert.ok(item.name?.length > 5, `${item.id} has no name`);
      assert.ok(item.because?.length > 30, `${item.id} does not say why`);
      assert.ok(item.wouldNeed?.length > 20, `${item.id} names no source`);
      assert.ok(item.instead?.length > 20, `${item.id} offers nothing instead`);
    }
  }
  assert.ok(seen.size >= 6, 'the honest gap list should not be trivial');
  for (const id of seen) {
    assert.ok(UNAVAILABLE_REASONS[id], `${id} has no reason entry`);
  }
});

test('road exposure is offered where road damage is not', () => {
  // The substitution that keeps the phase useful: exposure is computable from
  // real geometry, damage is not published.
  const reason = UNAVAILABLE_REASONS['road-damage-assessment'];
  assert.match(reason.instead, /EXPOSURE/);
  assert.match(reason.instead, /OSM/);
  assert.match(reason.instead, /modelled risk, not an observed closure/);
  const timeline = buildTimeline(curatedCase('nepal-gorkha-2015'));
  const disruption = timeline.steps.find((step) => step.key === 'T+6h');
  assert.ok(disruption.modelled.includes('road-exposure'));
  assert.ok(
    disruption.unavailable.some((item) => item.id === 'road-damage-assessment'),
  );
});

/* ------------------------------------------------------------------ *
 * The one measured time-varying layer
 * ------------------------------------------------------------------ */

test('timestamped events accumulate as the handle moves', () => {
  /*
   * Measured, not interpolated. Against the real catalogue this runs
   * 0 → 16 → 34 → 96 shocks across the phases, and the largest-so-far changes
   * from M6.6 to the real M7.3 Dolakha event on 12 May.
   */
  assert.equal(eventsByPhase(SHOCKS, GORKHA, 0).length, 0);
  assert.equal(eventsByPhase(SHOCKS, GORKHA, 1).length, 1);
  assert.equal(eventsByPhase(SHOCKS, GORKHA, 6).length, 2);
  assert.equal(eventsByPhase(SHOCKS, GORKHA, 12).length, 3);
  assert.equal(eventsByPhase(SHOCKS, GORKHA, 48).length, 4);
});

test('an unusable origin or event time yields nothing rather than everything', () => {
  assert.deepEqual(eventsByPhase(SHOCKS, 'not-a-date', 24), []);
  assert.deepEqual(eventsByPhase(null, GORKHA, 24), []);
  assert.equal(eventsByPhase([{ time: 'bad' }], GORKHA, 24).length, 0);
});

test('the world state reports the largest shock so far, not the largest overall', () => {
  const timeline = buildTimeline(curatedCase('nepal-gorkha-2015'));
  const at = (index) =>
    worldStateAt({
      timeline,
      phaseIndex: index,
      inputs: { aftershocks: SHOCKS, originTime: GORKHA },
    });
  const oneHour = at(1).readings.find((r) => r.id === 'aftershocks');
  assert.equal(oneHour.value, 1);
  assert.match(oneHour.detail, /M6\.6/);
  const later = at(5).readings.find((r) => r.id === 'aftershocks');
  assert.equal(later.value, 4);
  assert.match(later.detail, /M6\.7/);
  assert.equal(oneHour.availability, AVAILABILITY.CONFIRMED);
});

test('exposure is reported as exposure, never as casualties', () => {
  const timeline = buildTimeline(curatedCase('nepal-gorkha-2015'));
  const state = worldStateAt({
    timeline,
    phaseIndex: 2,
    inputs: {
      exposure: { populationAtDamagingIntensity: 6_452_839 },
      originTime: GORKHA,
    },
  });
  const reading = state.readings.find((r) => r.id === 'population-exposure');
  assert.equal(reading.value, 6_452_839);
  assert.equal(reading.availability, AVAILABILITY.MODELLED);
  assert.match(reading.detail, /not casualties/i);
  assert.match(reading.name, /MMI VII or above/);
});

test('a phase with nothing loaded says so rather than showing an empty list', () => {
  /*
   * An empty readings list reads as "nothing happened". `nothingMeasured`
   * lets the panel say "nothing is recorded" instead.
   */
  const timeline = buildTimeline(curatedCase('nepal-gorkha-2015'));
  const state = worldStateAt({ timeline, phaseIndex: 0, inputs: {} });
  assert.equal(state.nothingMeasured, true);
  assert.deepEqual([...state.readings], []);
  // And it still carries the phase's declared gaps and layers.
  assert.ok(Array.isArray(state.layers));
  assert.equal(worldStateAt({ timeline, phaseIndex: 99, inputs: {} }), null);
});

test('a timeline needs a case', () => {
  assert.throws(() => buildTimeline(null), /requires a case/);
  assert.throws(() => buildTimeline({}), /requires a case/);
});
