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

const base = [
  { type: 'veil', opacity: 0.16 },
  { type: 'layer.show', layer: 'outline' },
  { type: 'layer.show', layer: 'mask', alpha: 0.6 },
];

/*
 * One line of the summary's recap list. Each stop adds the next line below
 * the last, so the list builds as the camera travels.
 */
const recap = (n, line, tag) => ({
  at: 600,
  type: 'annotation.draw',
  kind: 'typed',
  id: `recap-${n}`,
  duration: 1000,
  screen: { x: 0.03, y: 0.19 + (n - 1) * 0.085 },
  className: 'brf-typed brf-typed--recap',
  lines: [line],
  tag,
});

export const UNKNOWNS = defineScene({
  id: 'unknowns',
  number: 39,
  act: 'VI',
  title: 'What we do not know',
  question: 'What can this analysis not answer?',
  explore: 17,
  /* In the shorter runs the summary's close says what is not known. */
  runs: [RUNS.FULL],
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
      narration: 'What this analysis cannot answer, and what would answer it.',
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
        'No travel times. Nothing about what a hospital could do. And no record of where damage was absent, only where it was found.',
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
  /*
   * A rapid recap, not a slide: the camera travels the case once, one stop
   * per finding, and each stop adds one line to a list that builds on the
   * left. The close clears the list and says what kind of knowledge each
   * finding is.
   */
  beats: [
    {
      id: 'epicentre',
      caption:
        'M{quake.magnitude|dec1} · {geo.epicentreDistrict|upper} · {quake.time|dateShort}',
      narration:
        'In short. A shallow magnitude {quake.magnitude|dec1} earthquake in {geo.epicentreDistrict}.',
      minHoldMs: 300,
      actions: [
        {
          at: 0,
          type: 'camera.fly',
          to: 'epicentre',
          rangeKm: 460,
          pitch: -60,
          heading: 8,
          duration: 2800,
        },
        { at: 0, type: 'veil', opacity: 0.1, duration: 1000 },
        {
          at: 300,
          type: 'annotation.draw',
          kind: 'pulse',
          id: 'sum-epi',
          anchor: 'epicentre',
          colour: '#ff5a5f',
          maxPx: 80,
          count: 2,
        },
        recap(
          1,
          'M{quake.magnitude|dec1} · {geo.epicentreDistrict|upper} · {seq.total|int} EVENTS',
          { source: 'USGS', cls: 'OBSERVED' },
        ),
      ],
    },
    {
      id: 'shaking',
      caption: '{exposure.mmi6|mega2} PEOPLE INSIDE MODELLED STRONG SHAKING',
      narration: '{exposure.mmi6|millionWords} people inside strong shaking.',
      minHoldMs: 300,
      actions: [
        {
          at: 0,
          type: 'layer.show',
          layer: 'bands',
          minMmi: 6,
          duration: 1800,
          ifAbsent: true,
        },
        {
          at: 0,
          type: 'camera.fly',
          to: 'shakeCentre',
          rangeKm: 700,
          pitch: -68,
          heading: 0,
          duration: 2800,
        },
        recap(2, '{exposure.mmi6|mega2} PEOPLE IN STRONG SHAKING', {
          source: 'WORLDPOP × USGS',
          cls: 'DERIVED',
        }),
      ],
    },
    {
      id: 'damage',
      caption:
        '{damage.total|int} DAMAGED SITES MAPPED · HALF IN {damage.gridHalf.units|int} KM²',
      narration:
        '{damage.total|int} damaged sites mapped. Half of them in {damage.gridHalf.units|int} square kilometres.',
      minHoldMs: 300,
      actions: [
        { at: 0, type: 'layer.hide', layer: 'bands' },
        {
          at: 0,
          type: 'layer.show',
          layer: 'damage',
          duration: 1400,
          ifAbsent: true,
        },
        {
          at: 0,
          type: 'camera.fly',
          to: 'damageCentre',
          rangeKm: 300,
          pitch: -60,
          heading: 6,
          duration: 2800,
        },
        recap(
          3,
          '{damage.total|int} SITES · HALF IN {damage.gridHalf.units|int} KM²',
          { source: 'UNOSAT', cls: 'OBSERVED' },
        ),
      ],
    },
    {
      id: 'gap',
      caption:
        '{coverage.unrecorded.people|mega2} PEOPLE WHERE NO DAMAGE WAS RECORDED · A GAP, NOT AN ABSENCE',
      narration:
        '{coverage.unrecorded.people|millionWords} lived where no damage was recorded. A gap, not an absence.',
      minHoldMs: 300,
      actions: [
        {
          at: 0,
          type: 'layer.show',
          layer: 'population',
          duration: 1600,
          ifAbsent: true,
        },
        {
          at: 0,
          type: 'camera.fly',
          to: { fact: 'coverage.unrecorded', path: ['examples', 0] },
          rangeKm: 110,
          pitch: -58,
          heading: 10,
          duration: 3000,
        },
        recap(4, '{coverage.unrecorded.people|mega2} WITH NO DAMAGE RECORD', {
          source: 'WORLDPOP × UNOSAT',
          cls: 'DATA GAP',
        }),
      ],
    },
    {
      id: 'network',
      caption:
        '{summary.nga.blockedRoads|int} ROADS CUT · {summary.nga.bridgesOut|int} BRIDGES OUT · {summary.nga.landslides|int} LANDSLIDES',
      narration:
        'Roads were cut in {summary.nga.blockedRoads|int} places, and {summary.nga.bridgesOut|int} bridges were out.',
      minHoldMs: 300,
      actions: [
        { at: 0, type: 'layer.hide', layer: 'population' },
        { at: 0, type: 'layer.hide', layer: 'damage' },
        {
          at: 0,
          type: 'layer.show',
          layer: 'roads',
          centre: 'kathmandu',
          duration: 2000,
          ifAbsent: true,
        },
        {
          at: 0,
          type: 'camera.fly',
          to: 'accessCentre',
          rangeKm: 440,
          pitch: -64,
          heading: 0,
          duration: 3000,
        },
        {
          at: 900,
          type: 'layer.show',
          layer: 'blockages',
          plain: true,
          duration: 1400,
          ifAbsent: true,
        },
        recap(
          5,
          '{summary.nga.blockedRoads|int} ROADS CUT · {summary.nga.bridgesOut|int} BRIDGES OUT',
          { source: 'NGA', cls: 'OBSERVED' },
        ),
      ],
    },
    {
      id: 'access',
      caption:
        '{access.hospital.byCategory.DISCONNECTED|int} LOST EVERY MAPPED ROAD TO A HOSPITAL · LOOK FIRST: {access.stableTop|list}',
      narration:
        '{access.hospital.byCategory.DISCONNECTED|thousandWords} people lost every mapped road to a hospital. {access.stableTop|names} are where to look first.',
      minHoldMs: 400,
      actions: [
        { at: 0, type: 'layer.hide', layer: 'blockages' },
        {
          at: 0,
          type: 'layer.filter',
          layer: 'roads',
          dim: 0.55,
          duration: 1000,
        },
        {
          at: 300,
          type: 'layer.show',
          layer: 'access-cells',
          id: 'cells-cut',
          categories: [3],
          duration: 1400,
          ifAbsent: true,
        },
        {
          at: 1800,
          type: 'layer.show',
          layer: 'district-focus',
          keysFrom: { fact: 'access.stableTop' },
          colour: '#ffb020',
          duration: 1600,
        },
        recap(
          6,
          '{access.hospital.byCategory.DISCONNECTED|int} LOST ROAD ACCESS · LOOK FIRST: {access.stableTop|list}',
          { source: 'OSM 2015 × DOHS 2010 × NGA', cls: 'SCENARIO' },
        ),
      ],
    },
    {
      id: 'close',
      caption: 'KNOWN · INFERRED · SIMULATED · AND STILL UNKNOWN',
      narration:
        'What we know. What we infer. What we simulate. And what we still don’t know: travel times, hospital capacity, and where nothing was found.',
      minHoldMs: 900,
      actions: [
        ...[1, 2, 3, 4, 5, 6].map((n) => ({
          at: 0,
          type: 'annotation.remove',
          id: `recap-${n}`,
        })),
        { at: 0, type: 'annotation.remove', id: 'sum-epi' },
        { at: 0, type: 'layer.hide', layer: 'district-focus' },
        { at: 0, type: 'layer.hide', id: 'cells-cut', layer: 'access-cells' },
        { at: 0, type: 'layer.hide', layer: 'roads' },
        {
          at: 0,
          type: 'camera.fly',
          to: 'nepal',
          rangeKm: 1100,
          pitch: -78,
          heading: 0,
          duration: 3800,
        },
        { at: 400, type: 'veil', opacity: 0.45, duration: 2400 },
        {
          at: 700,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'four-kinds',
          duration: 3200,
          screen: { x: 0.3, y: 0.3 },
          className: 'brf-typed brf-typed--closing',
          lines: [
            'WHAT WE KNOW · THE EARTHQUAKE · THE DAMAGE MAPPED · THE BLOCKAGES',
            'WHAT WE INFER · WHO WAS EXPOSED · WHERE DAMAGE CONCENTRATED',
            'WHAT WE SIMULATE · HOSPITAL ACCESS WITH EVERY BLOCKAGE APPLIED',
            'WHAT WE STILL DON’T KNOW · TRAVEL TIME · HOSPITAL CAPACITY · WHERE NOTHING WAS FOUND',
          ],
        },
        { at: 800, type: 'audio.cue', cue: 'lock' },
      ],
    },
  ],
});

export const ACT6 = Object.freeze([UNKNOWNS, SUMMARY]);
