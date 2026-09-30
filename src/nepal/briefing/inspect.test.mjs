import test from 'node:test';
import assert from 'node:assert/strict';
import { INSPECT_ORDER, describe, inGeometry, pickAt, pointToLineMetres } from './inspect.js';

const square = { type: 'Polygon', coordinates: [[[85, 27], [86, 27], [86, 28], [85, 28], [85, 27]]] };

test('a point near the pointer beats a line and a district under it', () => {
  const hit = pickAt({
    lon: 85.5,
    lat: 27.5,
    metresPerPixel: 50,
    candidates: {
      hospital: [{ lon: 85.5005, lat: 27.5, type: 'Hospital' }],
      road: [{ line: [[85.4, 27.5], [85.6, 27.5]], highway: 'primary' }],
      district: [{ name: 'Test', geometry: square }],
    },
  });
  assert.equal(hit.kind, 'hospital');
  assert.ok(hit.metres < 100);
});

test('with no point in reach, a line is picked; with nothing, the district', () => {
  const road = pickAt({ lon: 85.5, lat: 27.5002, metresPerPixel: 10, candidates: { road: [{ line: [[85.4, 27.5], [85.6, 27.5]] }], district: [{ name: 'D', geometry: square }] } });
  assert.equal(road.kind, 'road');
  const district = pickAt({ lon: 85.5, lat: 27.9, metresPerPixel: 10, candidates: { road: [{ line: [[85.4, 27.5], [85.6, 27.5]] }], district: [{ name: 'D', geometry: square }] } });
  assert.equal(district.kind, 'district');
  assert.equal(pickAt({ lon: 90, lat: 30, metresPerPixel: 10, candidates: { district: [{ name: 'D', geometry: square }] } }), null);
});

test('geometry helpers measure what they claim', () => {
  assert.ok(Math.abs(pointToLineMetres(85.5, 27.501, [[85.4, 27.5], [85.6, 27.5]]) - 110.5) < 1);
  assert.equal(inGeometry(85.5, 27.5, square), true);
  assert.equal(inGeometry(84.5, 27.5, square), false);
});

test('every kind has a card with a class and a note, and a missing figure reads as a dash or a reason', () => {
  for (const kind of INSPECT_ORDER) {
    const card = describe({ kind, item: { lon: 85, lat: 27, line: [[85, 27]] } }, {});
    assert.ok(card.title.length > 0, kind);
    assert.ok(card.note.length > 0, kind);
    assert.ok(card.tag?.cls, kind);
    for (const [, value] of card.rows) assert.doesNotMatch(String(value), /undefined|NaN/, kind);
  }
  const bridge = describe({ kind: 'bridge', item: { district: 'Kavrepalanchok', whatIf: { peopleCut: 14476, peopleLonger: 0 } } });
  assert.equal(bridge.rows[3][1], '14,476 PEOPLE CUT OFF');
  assert.equal(bridge.tag.cls, 'SCENARIO');
  const district = describe({ kind: 'district', item: { name: 'Mustang', exposure: { population: 10 }, access: null } });
  assert.ok(district.rows.some(([, v]) => v === 'OUTSIDE THE ANALYSIS AREA'));
  const unloaded = describe({ kind: 'district', item: { name: 'Mustang', exposure: { population: 10 } } });
  assert.ok(unloaded.rows.some(([, v]) => v === 'ACCESS ANALYSIS NOT LOADED'), 'a missing artefact is not reported as outside the area');
  const inside = describe({ kind: 'district', item: { name: 'Bara', access: { coverageShare: 0.622, noMappedRoadShare: 5.7, medianBaselineKm: 10.93, medianScenarioKm: 10.93 } } });
  assert.ok(inside.rows.some(([, v]) => v === '62 %'));
  assert.ok(inside.rows.some(([, v]) => v === '5.7 %'));
});

test('every card that offers to play the briefing names a scene the full run holds', async () => {
  const { BRIEFING_SCENES } = await import('./scenes/index.js');
  const full = new Set(BRIEFING_SCENES.filter((scene) => scene.runs.includes('full')).map((scene) => scene.id));
  for (const kind of INSPECT_ORDER) {
    for (const item of [{ lon: 85, lat: 27, line: [[85, 27]] }, { id: 'us1', lon: 85, lat: 27 }]) {
      const card = describe({ kind, item }, { mainShockId: 'us1' });
      if (card.scene) assert.ok(full.has(card.scene), `${kind} → ${card.scene}`);
    }
  }
});
