/**
 * ACT VI — SYNTHESIS (scenes 39 and 40).
 *
 * The summary replays the geography once, one stop per finding, and each
 * finding carries its class: OBSERVED, DERIVED, STATISTIC, SCENARIO or DATA
 * GAP. Nothing here is new — every figure has already been shown, from the
 * same fact, earlier in the run.
 */

import { RUNS, defineScene } from '../timeline.js';

const ALL = [RUNS.THREE, RUNS.SIX, RUNS.FULL];
const SIX_FULL = [RUNS.SIX, RUNS.FULL];

const base = [
  { type: 'veil', opacity: 0.16 },
  { type: 'layer.show', layer: 'outline' },
  { type: 'layer.show', layer: 'mask', alpha: 0.6 },
];

const card = (id, lines, tag, at = 500) => ({
  at,
  type: 'annotation.draw',
  kind: 'typed',
  id,
  duration: 1400,
  screen: { x: 0.58, y: 0.14 },
  className: 'brf-typed brf-typed--conclusion',
  lines,
  tag,
});

export const UNKNOWNS = defineScene({
  id: 'unknowns',
  number: 39,
  act: 'VI',
  title: 'What we do not know',
  question: 'What can this analysis not answer?',
  explore: 17,
  runs: SIX_FULL,
  keep: ['outline', 'mask'],
  setup: [
    ...base,
    {
      type: 'camera.fly',
      to: 'accessCentre',
      rangeKm: 900,
      pitch: -76,
      heading: 0,
    },
  ],
  beats: [
    {
      id: 'gaps',
      caption: 'WHAT THE DATA CANNOT TELL US',
      narration:
        'Some questions this analysis cannot answer, and it says so. These are the gaps, and what would fill them.',
      minHoldMs: 900,
      actions: [
        { at: 0, type: 'veil', opacity: 0.42, duration: 1600 },
        { at: 0, type: 'audio.cue', cue: 'reveal' },
        {
          at: 200,
          type: 'camera.fly',
          to: 'accessCentre',
          rangeKm: 820,
          pitch: -70,
          heading: 8,
          duration: 7000,
        },
        {
          at: 500,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'gaps-card',
          duration: 4200,
          screen: { x: 0.08, y: 0.16 },
          className: 'brf-typed brf-typed--data',
          lines: ['DATA GAPS · STATED, NOT HIDDEN'],
          linesFrom: { fact: 'access.gaps', field: 'gap' },
          tag: { source: 'STAGES 5 AND 9', cls: 'DATA GAP' },
        },
        {
          at: 5200,
          type: 'layer.show',
          layer: 'roads',
          majorOnly: true,
          centre: 'kathmandu',
          duration: 2400,
        },
      ],
    },
    {
      id: 'unmeasured',
      caption:
        'NO TRAVEL TIMES · NO HOSPITAL CAPACITY · NO RECORD OF WHERE NOTHING WAS FOUND',
      narration:
        'So this briefing gives no travel times, says nothing about what a hospital could do, and cannot say where damage was absent — only where it was recorded.',
      runs: [RUNS.FULL],
      minHoldMs: 900,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'gaps-card' },
        { at: 0, type: 'layer.show', layer: 'damage', duration: 1400 },
        {
          at: 200,
          type: 'camera.fly',
          to: 'damageCentre',
          rangeKm: 420,
          pitch: -64,
          heading: -6,
          duration: 5600,
        },
        {
          at: 700,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'infra-gaps',
          duration: 3600,
          screen: { x: 0.08, y: 0.16 },
          className: 'brf-typed brf-typed--data',
          lines: ['WHAT WOULD FILL THEM'],
          linesFrom: {
            fact: 'access.gaps',
            field: 'couldBeFilledBy',
            limit: 4,
          },
          tag: { source: 'STAGE 9', cls: 'DATA GAP' },
        },
      ],
    },
  ],
});

export const SUMMARY = defineScene({
  id: 'summary',
  number: 40,
  act: 'VI',
  title: 'Executive summary',
  question: 'What does it add up to?',
  explore: 17,
  runs: ALL,
  keep: ['outline', 'mask'],
  setup: [
    ...base,
    { type: 'camera.fly', to: 'nepal', rangeKm: 1100, pitch: -80, heading: 0 },
  ],
  beats: [
    {
      id: 'quake',
      caption:
        'MAGNITUDE {quake.magnitude|dec1} · {quake.depthKm|dec1} KM DEEP · {seq.total|int} EARTHQUAKES IN THE SEQUENCE',
      narration:
        'In summary. A magnitude {quake.magnitude|dec1} earthquake, shallow, followed by {seq.total|int} more in the catalogue.',
      minHoldMs: 500,
      actions: [
        {
          at: 0,
          type: 'camera.fly',
          to: 'epicentre',
          rangeKm: 520,
          pitch: -62,
          heading: 8,
          duration: 3200,
        },
        { at: 0, type: 'veil', opacity: 0.12, duration: 1200 },
        {
          at: 300,
          type: 'annotation.draw',
          kind: 'pulse',
          id: 'sum-epi',
          anchor: 'epicentre',
          colour: '#ff5a5f',
          maxPx: 90,
          count: 2,
        },
        card(
          'sum-1',
          [
            'A SHALLOW M{quake.magnitude|dec1} EARTHQUAKE',
            '{quake.time|dateShort} · {seq.total|int} EVENTS IN THE SEQUENCE',
          ],
          { source: 'USGS', cls: 'OBSERVED' },
        ),
      ],
    },
    {
      id: 'exposure',
      caption:
        '{exposure.mmi6|mega2} PEOPLE INSIDE MODELLED MMI VI OR STRONGER',
      narration:
        '{exposure.mmi6|millionWords} people were inside modelled strong shaking.',
      runs: SIX_FULL,
      minHoldMs: 500,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'sum-1' },
        {
          at: 0,
          type: 'layer.show',
          layer: 'bands',
          minMmi: 6,
          duration: 2200,
          ifAbsent: true,
        },
        {
          at: 0,
          type: 'camera.fly',
          to: 'shakeCentre',
          rangeKm: 720,
          pitch: -68,
          heading: 0,
          duration: 3000,
        },
        card(
          'sum-2',
          [
            '{exposure.mmi6|mega2} PEOPLE INSIDE MMI VI+',
            'MODELLED POPULATION × MODELLED SHAKING',
          ],
          { source: 'WORLDPOP × USGS SHAKEMAP', cls: 'DERIVED' },
        ),
      ],
    },
    {
      id: 'damage',
      caption:
        '{damage.total|int} DAMAGED SITES MAPPED · HALF OF THEM IN {damage.gridHalf.units|int} SQUARE KILOMETRES',
      narration:
        '{damage.total|int} damaged sites were mapped from above, half of them in just {damage.gridHalf.units|int} square kilometres — and the link to modelled shaking is real but weak.',
      minHoldMs: 500,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'sum-2' },
        { at: 0, type: 'layer.hide', layer: 'bands' },
        {
          at: 0,
          type: 'layer.show',
          layer: 'damage',
          duration: 1600,
          ifAbsent: true,
        },
        {
          at: 0,
          type: 'camera.fly',
          to: 'damageCentre',
          rangeKm: 320,
          pitch: -60,
          heading: 6,
          duration: 3200,
        },
        {
          at: 3600,
          type: 'layer.show',
          layer: 'damage-grid',
          duration: 1800,
          ifAbsent: true,
        },
        {
          at: 5800,
          type: 'layer.filter',
          layer: 'damage-grid',
          top: { fact: 'damage.gridHalf', path: ['units'] },
        },
        card(
          'sum-3',
          [
            '{damage.total|int} DAMAGED SITES MAPPED',
            'SHAKING ↔ DAMAGE: CRAMÉR’S V {damage.independence.cramersV|dec2}, SMALL',
          ],
          { source: 'UNOSAT × USGS SHAKEMAP', cls: 'STATISTIC' },
        ),
      ],
    },
    {
      id: 'gap',
      caption:
        '{coverage.unrecorded.people|mega2} PEOPLE WHERE NO DAMAGE WAS RECORDED · A GAP, NOT AN ABSENCE',
      narration:
        'Millions lived where nothing was recorded. That is a gap in the observation, not evidence that nothing broke.',
      runs: SIX_FULL,
      minHoldMs: 500,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'sum-3' },
        {
          at: 0,
          type: 'camera.fly',
          to: 'kathmandu',
          rangeKm: 160,
          pitch: -58,
          heading: -8,
          duration: 3200,
        },
        card(
          'sum-4',
          [
            '{coverage.unrecorded.people|mega2} PEOPLE · NO DAMAGE RECORD',
            'NO RECORD IS NOT NO DAMAGE',
          ],
          { source: 'WORLDPOP × UNOSAT', cls: 'DATA GAP' },
        ),
      ],
    },
    {
      id: 'access',
      caption:
        '{access.hospital.byCategory.DISCONNECTED|int} LOST EVERY MAPPED ROAD TO A HOSPITAL · {access.hospital.peopleNoMappedRoadNearby|mega2} HAD NO MAPPED ROAD',
      narration:
        'On the road network, the observed damage cut {access.hospital.byCategory.DISCONNECTED|thousandWords} people off from every mapped route to a hospital. But {access.hospital.peopleNoMappedRoadNearby|millionWords} had no mapped road nearby to begin with.',
      minHoldMs: 700,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'sum-4' },
        { at: 0, type: 'layer.hide', layer: 'damage' },
        { at: 0, type: 'layer.hide', layer: 'damage-grid' },
        {
          at: 0,
          type: 'layer.show',
          layer: 'roads',
          centre: 'kathmandu',
          duration: 2400,
          ifAbsent: true,
        },
        {
          at: 0,
          type: 'camera.fly',
          to: 'accessCentre',
          rangeKm: 520,
          pitch: -66,
          heading: 0,
          duration: 3400,
        },
        {
          at: 1200,
          type: 'layer.show',
          layer: 'access-cells',
          id: 'cells-cut',
          categories: [3],
          duration: 1400,
          ifAbsent: true,
        },
        {
          at: 3600,
          type: 'layer.show',
          layer: 'no-road',
          duration: 2400,
          ifAbsent: true,
        },
        {
          at: 6400,
          type: 'layer.filter',
          layer: 'roads',
          dim: 0.55,
          duration: 1200,
        },
        card(
          'sum-5',
          [
            '{access.hospital.byCategory.DISCONNECTED|int} PEOPLE LOST EVERY MAPPED ROAD ROUTE',
            '{access.hospital.peopleNoMappedRoadNearby|mega2} HAD NO MAPPED ROAD NEARBY',
            'MOST CHANGED: {access.mostDisruptedNames|list}',
          ],
          { source: 'OSM 2015 × DOHS 2010 × NGA', cls: 'SCENARIO' },
          600,
        ),
      ],
    },
    {
      id: 'first',
      caption:
        'WHERE TO LOOK FIRST: {access.stableTop|list} · AND WHERE NOTHING WAS RECORDED',
      narration:
        'Where to look first: {access.stableTop|list}, which rank high on need and poor access under every weighting; and the places where nothing was recorded at all.',
      minHoldMs: 700,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'sum-5' },
        { at: 0, type: 'layer.hide', id: 'cells-cut', layer: 'access-cells' },
        {
          at: 0,
          type: 'layer.show',
          layer: 'district-focus',
          keysFrom: { fact: 'access.stableTop' },
          colour: '#ffb020',
          duration: 1800,
        },
        {
          at: 200,
          type: 'camera.fly',
          to: 'district:sindhuli',
          rangeKm: 360,
          pitch: -60,
          heading: 8,
          duration: 4000,
        },
        card(
          'sum-6',
          [
            'WHERE TO LOOK FIRST',
            'HIGH NEED, POOR ACCESS UNDER EVERY WEIGHTING: {access.stableTop|list}',
            'AND THE POPULATED SQUARES WITH NO RECORD',
            'A PLACE TO START, NOT A PRIORITY LIST',
          ],
          { source: 'THIS ANALYSIS', cls: 'DERIVED' },
          600,
        ),
      ],
    },
    {
      id: 'close',
      caption:
        'EVERY FIGURE IN THIS BRIEFING OPENS IN EXPLORE, WITH ITS SOURCE',
      narration:
        'Every figure in this briefing can be opened, with its source and its method, in Explore.',
      minHoldMs: 1200,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'sum-6' },
        { at: 0, type: 'layer.hide', layer: 'district-focus' },
        {
          at: 0,
          type: 'camera.fly',
          to: 'nepal',
          rangeKm: 1100,
          pitch: -78,
          heading: 0,
          duration: 4200,
        },
        { at: 400, type: 'veil', opacity: 0.4, duration: 2600 },
        {
          at: 800,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'close-card',
          duration: 1800,
          screen: { x: 0.34, y: 0.34 },
          className: 'brf-typed brf-typed--conclusion',
          lines: [
            'CASE 001 · NEPAL 2015',
            'NOT KNOWN: TRAVEL TIMES · HOSPITAL CAPACITY · WHERE NOTHING WAS FOUND',
            'PRESS E TO EXPLORE THE EVIDENCE',
          ],
        },
        { at: 800, type: 'audio.cue', cue: 'lock' },
      ],
    },
  ],
});

export const ACT6 = Object.freeze([UNKNOWNS, SUMMARY]);
