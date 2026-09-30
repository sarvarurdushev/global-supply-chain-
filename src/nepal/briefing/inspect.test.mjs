import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INSPECT_ORDER,
  describe,
  inGeometry,
  pickAt,
  pointToLineMetres,
} from './inspect.js';

const square = {
  type: 'Polygon',
  coordinates: [
    [
      [85, 27],
      [86, 27],
      [86, 28],
      [85, 28],
      [85, 27],
    ],
  ],
};

test('a point near the pointer beats a line and a district under it', () => {
  const hit = pickAt({
    lon: 85.5,
    lat: 27.5,
    metresPerPixel: 50,
    candidates: {
      hospital: [{ lon: 85.5005, lat: 27.5, type: 'Hospital' }],
      road: [
        {
          line: [
            [85.4, 27.5],
            [85.6, 27.5],
          ],
          highway: 'primary',
        },
      ],
      district: [{ name: 'Test', geometry: square }],
    },
  });
  assert.equal(hit.kind, 'hospital');
  assert.ok(hit.metres < 100);
});

test('with no point in reach, a line is picked; with nothing, the district', () => {
  const road = pickAt({
    lon: 85.5,
    lat: 27.5002,
    metresPerPixel: 10,
    candidates: {
      road: [
        {
          line: [
            [85.4, 27.5],
            [85.6, 27.5],
          ],
        },
      ],
      district: [{ name: 'D', geometry: square }],
    },
  });
  assert.equal(road.kind, 'road');
  const district = pickAt({
    lon: 85.5,
    lat: 27.9,
    metresPerPixel: 10,
    candidates: {
      road: [
        {
          line: [
            [85.4, 27.5],
            [85.6, 27.5],
          ],
        },
      ],
      district: [{ name: 'D', geometry: square }],
    },
  });
  assert.equal(district.kind, 'district');
  assert.equal(
    pickAt({
      lon: 90,
      lat: 30,
      metresPerPixel: 10,
      candidates: { district: [{ name: 'D', geometry: square }] },
    }),
    null,
  );
});

test('geometry helpers measure what they claim', () => {
  assert.ok(
    Math.abs(
      pointToLineMetres(85.5, 27.501, [
        [85.4, 27.5],
        [85.6, 27.5],
      ]) - 110.5,
    ) < 1,
  );
  assert.equal(inGeometry(85.5, 27.5, square), true);
  assert.equal(inGeometry(84.5, 27.5, square), false);
});

test('every kind has a card with a class and a note, and a missing figure reads as a dash or a reason', () => {
  for (const kind of INSPECT_ORDER) {
    const card = describe(
      { kind, item: { lon: 85, lat: 27, line: [[85, 27]] } },
      {},
    );
    assert.ok(card.title.length > 0, kind);
    assert.ok(card.note.length > 0, kind);
    assert.ok(card.tag?.cls, kind);
    for (const [, value] of card.rows)
      assert.doesNotMatch(String(value), /undefined|NaN/, kind);
  }
  const bridge = describe({
    kind: 'bridge',
    item: {
      district: 'Kavrepalanchok',
      whatIf: { peopleCut: 14476, peopleLonger: 0 },
    },
  });
  assert.equal(bridge.rows[3][1], '14,476 PEOPLE CUT OFF');
  assert.equal(bridge.tag.cls, 'SCENARIO');
  const district = describe({
    kind: 'district',
    item: { name: 'Mustang', exposure: { population: 10 }, access: null },
  });
  assert.ok(district.rows.some(([, v]) => v === 'OUTSIDE THE ANALYSIS AREA'));
  const unloaded = describe({
    kind: 'district',
    item: { name: 'Mustang', exposure: { population: 10 } },
  });
  assert.ok(
    unloaded.rows.some(([, v]) => v === 'ACCESS ANALYSIS NOT LOADED'),
    'a missing artefact is not reported as outside the area',
  );
  const inside = describe({
    kind: 'district',
    item: {
      name: 'Bara',
      access: {
        coverageShare: 0.622,
        noMappedRoadShare: 5.7,
        medianBaselineKm: 10.93,
        medianScenarioKm: 10.93,
      },
    },
  });
  assert.ok(inside.rows.some(([, v]) => v === '62 %'));
  assert.ok(inside.rows.some(([, v]) => v === '5.7 %'));
});

test('every card that offers to play the briefing names a scene the full run holds', async () => {
  const { BRIEFING_SCENES } = await import('./scenes/index.js');
  const full = new Set(
    BRIEFING_SCENES.filter((scene) => scene.runs.includes('full')).map(
      (scene) => scene.id,
    ),
  );
  for (const kind of INSPECT_ORDER) {
    for (const item of [
      { lon: 85, lat: 27, line: [[85, 27]] },
      { id: 'us1', lon: 85, lat: 27 },
    ]) {
      const card = describe({ kind, item }, { mainShockId: 'us1' });
      if (card.scene)
        assert.ok(full.has(card.scene), `${kind} → ${card.scene}`);
    }
  }
});

test('a blockage explains itself: matched road, nearest landslide, where it is used, and what removing it does', () => {
  const on = describe({
    kind: 'blockage',
    item: {
      id: 'road-7',
      matched: true,
      sensedOn: '2015-04-27',
      roadClass: 'tertiary',
      roadMetres: 11,
      snapMetres: 25,
      segment: [
        [85.1, 27.7],
        [85.2, 27.8],
      ],
      nearestLandslide: { index: 4, metres: 640 },
      whatIf: {
        peopleCut: 2204,
        peopleLonger: 0,
        peopleSwitched: 0,
        cells: [3],
      },
      examples: ['cut'],
      damageAreas: [],
    },
  });
  const row = (card, label) => card.rows.find(([l]) => l === label)?.[1];
  assert.match(
    row(on, 'ON A ROAD MAPPED THE DAY BEFORE'),
    /YES · TERTIARY · 11 M/,
  );
  assert.equal(row(on, 'NEAREST MAPPED LANDSLIDE'), '640 M');
  assert.match(
    row(on, 'USED IN'),
    /OBSERVED-BLOCKAGES SCENARIO · THE CUT-OFF EXAMPLE/,
  );
  const effect = on.actions.find((a) => a.id === 'effect');
  assert.ok(effect.enabled);
  assert.deepEqual(effect.rows, [
    ['REMOVING ONLY THIS ROAD SEGMENT', '2,204 CUT OFF'],
  ]);
  assert.equal(effect.tag.cls, 'SCENARIO');
  /* Pressing the landslide action says what the line on the map means, not only draws it. */
  const slide = on.actions.find((a) => a.id === 'landslide');
  assert.ok(slide.enabled);
  assert.deepEqual(slide.rows[0], ['DISTANCE FROM THIS BLOCKAGE', '640 M']);
  assert.match(slide.rows[1][1], /NO CAUSE IS RECORDED/);

  const off = describe({
    kind: 'blockage',
    item: {
      id: 'road-2',
      matched: false,
      roadMetres: null,
      snapMetres: 25,
      nearestLandslide: null,
      whatIf: null,
    },
  });
  assert.equal(
    row(off, 'ON A ROAD MAPPED THE DAY BEFORE'),
    'NO — NO MAPPED ROAD WITHIN 500 M',
  );
  assert.match(row(off, 'USED IN'), /CANNOT CUT A ROAD IT DOES NOT HAVE/);
  assert.match(off.note, /No road mapped the day before lies within 25 m/);
  for (const id of ['effect', 'landslide']) {
    const action = off.actions.find((a) => a.id === id);
    assert.equal(action.enabled, false, id);
    assert.ok(action.why.length > 10, `${id} says why it is off`);
  }
  assert.ok(off.actions.find((a) => a.id === 'source').enabled);
});

test('a hospital card offers only what the analysis holds, and never a capacity', () => {
  const item = {
    id: 'dohs-663',
    type: 'Hospital',
    district: 'Bhaktapur',
    onNetwork: true,
    nearbyPeople: 1707214,
    nearestByRoadPeople: { before: 298194, after: 296000 },
    damageAreasBefore: ['Bhaktapur'],
    damageAreasAfter: ['Bhaktapur'],
  };
  const card = describe(
    { kind: 'hospital', item },
    { codCompiled: '2010-09-30' },
  );
  const ids = card.actions.map((a) => a.id);
  assert.deepEqual(ids, ['catchment', 'scenario', 'trace', 'nearby', 'source']);
  assert.ok(card.actions.every((a) => a.enabled));
  const scenario = card.actions.find((a) => a.id === 'scenario');
  assert.equal(scenario.rows[0][1], '298,194 → 296,000 PEOPLE');
  const everything = JSON.stringify(card);
  assert.doesNotMatch(
    everything.replace(/NO CAPACITY|No beds, staff or capacity/g, ''),
    /\b(BEDS?|CAPACITY|STAFF)\b/i,
  );

  const offNetwork = describe({
    kind: 'hospital',
    item: {
      ...item,
      onNetwork: false,
      damageAreasBefore: [],
      damageAreasAfter: [],
    },
  });
  for (const id of ['catchment', 'scenario', 'trace']) {
    const action = offNetwork.actions.find((a) => a.id === id);
    assert.equal(action.enabled, false, id);
    assert.ok(action.why, id);
  }
});
