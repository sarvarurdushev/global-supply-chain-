/**
 * ACT II — WHO AND WHAT WAS IN THE HAZARD (scenes 10 and 11).
 *
 * Population is WorldPop 2015, a MODELLED surface; shaking is the USGS
 * ShakeMap, a MODELLED intensity. Their product is a DERIVED exposure, and
 * every caption says "modelled" or "inside" — never that anyone was harmed.
 */

import { RUNS, defineScene } from '../timeline.js';

const ALL = [RUNS.THREE, RUNS.SIX, RUNS.FULL];
const SIX_FULL = [RUNS.SIX, RUNS.FULL];

const WORLDPOP = { source: 'WORLDPOP 2015 · MODELLED', cls: 'DERIVED' };
const SHAKE = { source: 'WORLDPOP × USGS SHAKEMAP', cls: 'DERIVED' };

const base = [
  { type: 'veil', opacity: 0.12 },
  { type: 'layer.show', layer: 'outline' },
  { type: 'layer.show', layer: 'mask', alpha: 0.62 },
];

export const PEOPLE_MEET_SHAKING = defineScene({
  id: 'people-meet-shaking',
  number: 10,
  act: 'II',
  title: 'Population meets shaking',
  question: 'How many people were inside the strong shaking?',
  explore: 5,
  runs: ALL,
  keep: ['outline', 'mask'],
  setup: [
    ...base,
    { type: 'camera.fly', to: 'nepal', rangeKm: 1000, pitch: -80, heading: 0 },
  ],
  beats: [
    {
      id: 'people',
      caption: 'WHERE PEOPLE LIVED · MODELLED, NOT COUNTED',
      narration:
        'Before the shaking, the people. Each point is a block of modelled population, larger where more people lived.',
      runs: SIX_FULL,
      minHoldMs: 400,
      actions: [
        { at: 0, type: 'layer.show', layer: 'population', duration: 3600 },
        { at: 0, type: 'audio.cue', cue: 'reveal' },
        {
          at: 300,
          type: 'camera.fly',
          to: 'nepal',
          rangeKm: 820,
          pitch: -72,
          heading: 4,
          duration: 5200,
        },
        {
          at: 1600,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'pop-card',
          duration: 1200,
          screen: { x: 0.64, y: 0.16 },
          className: 'brf-typed brf-typed--data',
          lines: [
            'POPULATION · WORLDPOP 2015',
            'MODELLED, NOT COUNTED',
            'ABOUT ONE-KILOMETRE CELLS',
          ],
          tag: WORLDPOP,
        },
      ],
    },
    {
      id: 'meets',
      caption:
        '{exposure.mmi6|mega2} PEOPLE INSIDE MODELLED MMI VI OR STRONGER',
      narration:
        'Lay the modelled shaking over them. {exposure.mmi6|millionWords} people were inside intensity six or stronger.',
      minHoldMs: 500,
      actions: [
        {
          at: 0,
          type: 'layer.show',
          layer: 'population',
          duration: 1600,
          ifAbsent: true,
        },
        { at: 0, type: 'annotation.remove', id: 'pop-card' },
        {
          at: 200,
          type: 'layer.show',
          layer: 'bands',
          minMmi: 6,
          duration: 4200,
        },
        { at: 200, type: 'audio.cue', cue: 'trace' },
        {
          at: 400,
          type: 'camera.fly',
          to: 'shakeCentre',
          rangeKm: 700,
          pitch: -68,
          heading: 0,
          duration: 4600,
        },
        {
          at: 1400,
          type: 'metric.count',
          id: 'mmi6',
          fact: 'exposure.mmi6',
          format: 'mega2',
          label: 'PEOPLE INSIDE MODELLED MMI VI+',
          screen: { x: 0.64, y: 0.18 },
          size: 'xl',
          duration: 2400,
          tag: SHAKE,
        },
      ],
    },
    {
      id: 'stronger',
      caption:
        'MMI VII+: {exposure.mmi7|mega2} · MMI VIII: {exposure.mmi8|kilo}',
      narration:
        '{exposure.mmi7|millionWords} were inside intensity seven. {exposure.mmi8|thousandWords} inside eight, the strongest band.',
      runs: [RUNS.FULL],
      minHoldMs: 500,
      actions: [
        { at: 0, type: 'layer.filter', layer: 'bands', highlight: 7 },
        { at: 0, type: 'annotation.remove', id: 'mmi6' },
        {
          at: 300,
          type: 'metric.count',
          id: 'mmi7',
          fact: 'exposure.mmi7',
          format: 'mega2',
          label: 'INSIDE MMI VII+',
          screen: { x: 0.64, y: 0.16 },
          size: 'lg',
          duration: 1600,
          tag: SHAKE,
        },
        { at: 2800, type: 'layer.filter', layer: 'bands', highlight: 8 },
        {
          at: 2800,
          type: 'camera.fly',
          to: 'epicentre',
          rangeKm: 360,
          pitch: -60,
          heading: 8,
          duration: 3400,
        },
        {
          at: 3100,
          type: 'metric.count',
          id: 'mmi8',
          fact: 'exposure.mmi8',
          format: 'kilo',
          label: 'INSIDE MMI VIII',
          screen: { x: 0.64, y: 0.36 },
          size: 'lg',
          duration: 1400,
          tag: SHAKE,
        },
      ],
    },
  ],
});

export const DENSITY_MEETS_SHAKING = defineScene({
  id: 'density-meets-shaking',
  number: 11,
  act: 'II',
  title: 'High density × high shaking',
  question: 'Where did the most people meet the strongest shaking?',
  explore: 6,
  runs: SIX_FULL,
  keep: ['outline', 'mask', 'population', 'bands'],
  setup: [
    ...base,
    { type: 'layer.show', layer: 'population' },
    { type: 'layer.show', layer: 'bands', minMmi: 6 },
    {
      type: 'camera.fly',
      to: 'shakeCentre',
      rangeKm: 700,
      pitch: -68,
      heading: 0,
    },
  ],
  beats: [
    {
      id: 'hot',
      caption:
        '{exposure.highHigh.people|mega2} PEOPLE: STRONG SHAKING AND DENSE SETTLEMENT',
      narration:
        'Where strong shaking met dense settlement: {exposure.highHigh.people|millionWords} people, {exposure.highHigh.shareOfPopulationPercent|int} percent of everyone in the analysis.',
      minHoldMs: 500,
      actions: [
        { at: 0, type: 'layer.filter', layer: 'population', alpha: 0.3 },
        { at: 0, type: 'layer.filter', layer: 'bands', highlight: 8 },
        { at: 0, type: 'annotation.remove', id: 'mmi7' },
        { at: 0, type: 'annotation.remove', id: 'mmi8' },
        {
          at: 200,
          type: 'layer.show',
          layer: 'population',
          highHighOnly: true,
          duration: 2800,
        },
        { at: 200, type: 'audio.cue', cue: 'reveal' },
        {
          at: 400,
          type: 'camera.fly',
          to: 'kathmandu',
          rangeKm: 420,
          pitch: -62,
          heading: -6,
          duration: 4600,
        },
        {
          at: 1200,
          type: 'metric.count',
          id: 'hot-count',
          fact: 'exposure.highHigh',
          key: 'people',
          format: 'mega2',
          label: 'PEOPLE · MMI VI+ AND HIGH DENSITY',
          screen: { x: 0.64, y: 0.18 },
          size: 'xl',
          duration: 2200,
          tag: SHAKE,
        },
      ],
    },
    {
      id: 'densest',
      caption:
        'THE DENSEST SQUARE KILOMETRE: {exposure.highHigh.densestCellPeople|int} PEOPLE',
      narration:
        'The densest single square kilometre, in the Kathmandu Valley, held about {exposure.highHigh.densestCellPeople|thousandWords} people.',
      runs: [RUNS.FULL],
      minHoldMs: 500,
      actions: [
        {
          at: 0,
          type: 'camera.fly',
          to: { fact: 'exposure.highHigh', path: ['densestCellAt'] },
          rangeKm: 60,
          pitch: -56,
          heading: 12,
          duration: 4200,
        },
        { at: 0, type: 'annotation.remove', id: 'hot-count' },
        {
          at: 2400,
          type: 'annotation.draw',
          kind: 'bracket',
          id: 'densest',
          anchor: { fact: 'exposure.highHigh', path: ['densestCellAt'] },
          size: 44,
        },
        { at: 2500, type: 'audio.cue', cue: 'lock' },
        {
          at: 3000,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'densest-callout',
          anchor: { fact: 'exposure.highHigh', path: ['densestCellAt'] },
          title: '{exposure.highHigh.densestCellPeople|int} PEOPLE',
          lines: ['ONE MODELLED CELL', 'INSIDE MMI VI OR STRONGER'],
          tag: WORLDPOP,
          dx: 150,
          dy: -90,
        },
      ],
    },
    {
      id: 'rule',
      caption:
        'HIGH DENSITY = THE TOP {exposure.quadrantParams.densityQuantile|shareToPct} OF POPULATED CELLS, NOT A BORROWED FIGURE',
      narration:
        'Dense means at least {exposure.quadrantParams.densityCutPeoplePerCell|int} people in a cell: the cut that separates the busiest quarter of Nepal’s populated cells.',
      runs: [RUNS.FULL],
      minHoldMs: 700,
      actions: [
        {
          at: 0,
          type: 'camera.fly',
          to: 'kathmandu',
          rangeKm: 300,
          pitch: -64,
          heading: 0,
          duration: 3600,
        },
        { at: 0, type: 'annotation.remove', id: 'densest-callout' },
        { at: 0, type: 'annotation.remove', id: 'densest' },
        {
          at: 500,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'rule-card',
          duration: 1600,
          screen: { x: 0.62, y: 0.16 },
          className: 'brf-typed brf-typed--data',
          lines: [
            'HOW “HIGH” IS DEFINED',
            'SHAKING: MMI ≥ {exposure.quadrantParams.intensityThreshold|int}',
            'DENSITY: ≥ {exposure.quadrantParams.densityCutPeoplePerCell|dec1} PEOPLE PER CELL',
            'THE {exposure.quadrantParams.densityQuantile|shareToPct} QUANTILE OF POPULATED CELLS',
          ],
          tag: SHAKE,
        },
      ],
    },
  ],
});

export const ACT2 = Object.freeze([PEOPLE_MEET_SHAKING, DENSITY_MEETS_SHAKING]);
