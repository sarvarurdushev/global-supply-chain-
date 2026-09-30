/**
 * ACT V — HEALTHCARE AND RESCUE ACCESS (vertical slice 5: scenes 29, 30, 32).
 *
 * Every figure is read from the Stage 9 health-access artefact
 * (`data/analysis/nepal-2015-health-access.json`, pipelines/analyse/
 * health-access.mjs). Three things are said out loud because the numbers are
 * easy to over-read: these are DISTANCES along roads mapped the day before
 * the earthquake, not travel times; the damaged network applies every
 * observed blockage at once (a SCENARIO); and the hospitals are the
 * government's list as compiled years earlier, with no capacity attached.
 */

import { RUNS, defineScene } from '../timeline.js';

const ALL = [RUNS.THREE, RUNS.SIX, RUNS.FULL];
const SIX_FULL = [RUNS.SIX, RUNS.FULL];

const OSM = { source: 'OPENSTREETMAP · 24 APR 2015', cls: 'OBSERVED' };
const COD = { source: 'DOHS / WHO LIST · 2010', cls: 'OFFICIAL' };
const SCENARIO = { source: 'OSM × DOHS × NGA BLOCKAGES', cls: 'SCENARIO' };
const DERIVED = { source: 'OSM × DOHS × WORLDPOP', cls: 'DERIVED' };
const GAP = { source: 'OPENSTREETMAP · 24 APR 2015', cls: 'DATA GAP' };

const base = [
  { type: 'veil', opacity: 0.14 },
  { type: 'layer.show', layer: 'outline', colour: '#3cf2a0' },
  { type: 'layer.show', layer: 'mask', alpha: 0.55 },
];

/* The key grows with the act: each scene adds the rows it introduces. */
const KEY_ROADS = {
  glyph: '—',
  colour: '#f1e3b5',
  label: 'ROADS',
  sub: 'MAPPED {access.network.instant|dateShort}',
};
const KEY_HOSPITAL = {
  glyph: '+',
  colour: 'hospital',
  label: 'HOSPITAL',
  sub: 'GOVERNMENT LIST {access.lists.codCompiled|dateShort}',
};
const KEY_NO_ROAD = {
  colour: 'noRoad',
  label: 'NO MAPPED ROAD',
  sub: 'WITHIN {access.params.originSnapMetres|kmFromMetres} · PEOPLE',
};
const KEY_BLOCKAGE = {
  glyph: '×',
  colour: 'blockage',
  label: 'BLOCKAGE',
  sub: 'OBSERVED · ON A MAPPED ROAD',
};

export const BASELINE_ACCESS = defineScene({
  id: 'baseline-access',
  number: 29,
  act: 'V',
  title: 'Baseline access',
  question: 'How far was the nearest hospital by road, before the earthquake?',
  explore: 13,
  runs: SIX_FULL,
  setup: [
    ...base,
    {
      type: 'camera.fly',
      to: 'accessCentre',
      rangeKm: 620,
      pitch: -74,
      heading: 0,
    },
  ],
  beats: [
    {
      id: 'roads',
      caption:
        'ROADS MAPPED BY {access.network.instant|dateShort} · {access.network.lengthKm|int} KM',
      narration:
        'This is every road OpenStreetMap held on the day before the earthquake: {access.network.lengthKm|int} kilometres.',
      minHoldMs: 400,
      actions: [
        {
          at: 0,
          type: 'layer.show',
          layer: 'roads',
          centre: 'kathmandu',
          radiusKm: 340,
          duration: 4600,
        },
        { at: 0, type: 'audio.cue', cue: 'trace' },
        {
          at: 300,
          type: 'camera.fly',
          to: 'accessCentre',
          rangeKm: 520,
          pitch: -66,
          heading: 6,
          duration: 6200,
        },
        {
          at: 1800,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'roads-card',
          duration: 1200,
          screen: { x: 0.66, y: 0.16 },
          className: 'brf-typed brf-typed--data',
          lines: [
            'ROAD NETWORK · OPENSTREETMAP',
            'AS MAPPED {access.network.instant|dateShort}',
            '{access.network.ways|int} ROADS · {access.network.lengthKm|int} KM',
          ],
        },
      ],
    },
    {
      id: 'hospitals',
      caption:
        '{access.lists.codHospitals|int} HOSPITALS · GOVERNMENT LIST COMPILED {access.lists.codCompiled|dateShort}',
      narration:
        'The hospitals come from the government list compiled in {access.lists.codCompiled|dateLong}: the latest official list openly available.',
      minHoldMs: 400,
      actions: [
        { at: 0, type: 'layer.show', layer: 'hospitals', duration: 2400 },
        {
          at: 0,
          type: 'layer.filter',
          layer: 'roads',
          dim: 0.6,
          duration: 900,
        },
        { at: 0, type: 'annotation.remove', id: 'roads-card' },
        { at: 0, type: 'audio.cue', cue: 'reveal' },
        {
          at: 600,
          type: 'chart.enter',
          chart: 'legend',
          id: 'access-key',
          title: 'HEALTH ACCESS · KEY',
          screen: { x: 0.03, y: 0.6 },
          rows: [KEY_ROADS, KEY_HOSPITAL],
        },
        { at: 700, type: 'chart.update', id: 'access-key', op: 'revealAll' },
        {
          at: 2600,
          type: 'layer.show',
          layer: 'osm-hospitals',
          duration: 1600,
        },
        {
          at: 2900,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'lists',
          anchor: 'kathmandu',
          title: 'TWO LISTS DISAGREE',
          lines: [
            'GOVERNMENT LIST: {access.lists.codHospitals|int} HOSPITALS',
            'OPENSTREETMAP: {access.lists.osmHospitals|int} TAGGED HOSPITAL',
            '{access.codNearOsm500.share|pct1} MATCH WITHIN {access.codNearOsm500.withinMetres|int} M',
          ],
          tag: { source: 'DOHS 2010 × OSM 2015', cls: 'DERIVED' },
          dx: 150,
          dy: -110,
          tone: 'caveat',
        },
      ],
    },
    {
      id: 'no-road',
      caption:
        '{access.hospital.peopleNoMappedRoadNearby|mega2} PEOPLE MORE THAN {access.params.originSnapMetres|kmFromMetres} FROM ANY MAPPED ROAD',
      narration:
        'Before any damage, {access.hospital.peopleNoMappedRoadNearbyShare|int} percent of the people here lived more than {access.params.originSnapMetres|kmWordsFromMetres} from any mapped road.',
      minHoldMs: 500,
      actions: [
        { at: 0, type: 'layer.show', layer: 'no-road', duration: 2800 },
        { at: 0, type: 'annotation.remove', id: 'lists' },
        { at: 0, type: 'layer.hide', layer: 'osm-hospitals' },
        { at: 200, type: 'chart.exit', id: 'access-key' },
        {
          at: 300,
          type: 'chart.enter',
          chart: 'legend',
          id: 'access-key-2',
          title: 'HEALTH ACCESS · KEY',
          screen: { x: 0.03, y: 0.6 },
          rows: [KEY_ROADS, KEY_HOSPITAL, KEY_NO_ROAD],
        },
        { at: 300, type: 'chart.update', id: 'access-key-2', op: 'revealAll' },
        {
          at: 600,
          type: 'metric.count',
          id: 'no-road-count',
          fact: 'access.hospital',
          key: 'peopleNoMappedRoadNearby',
          format: 'mega2',
          label:
            'PEOPLE · NO MAPPED ROAD WITHIN {access.params.originSnapMetres|kmFromMetres}',
          screen: { x: 0.64, y: 0.2 },
          size: 'xl',
          duration: 1800,
          tag: DERIVED,
        },
        {
          at: 2800,
          type: 'camera.fly',
          to: 'district:gorkha',
          rangeKm: 280,
          pitch: -60,
          heading: -8,
          duration: 4200,
        },
        {
          at: 4400,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'gorkha-road',
          anchor: 'district:gorkha',
          title: 'GORKHA',
          lines: [
            '{access.gorkha.noMappedRoadShare|pct1} OF PEOPLE',
            'NO MAPPED ROAD NEARBY',
          ],
          tag: DERIVED,
          dx: 160,
          dy: -90,
        },
      ],
    },
    {
      id: 'median',
      caption:
        'MEDIAN TO THE NEAREST HOSPITAL: {access.hospital.medianBaselineKm|dec1} KM OF ROAD · NOT TRAVEL TIME',
      narration:
        'For people near a road, the median distance to the nearest hospital was {access.hospital.medianBaselineKm|dec1} kilometres. Distance along the road, not travel time.',
      runs: [RUNS.FULL],
      minHoldMs: 600,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'gorkha-road' },
        { at: 0, type: 'annotation.remove', id: 'no-road-count' },
        {
          at: 0,
          type: 'camera.fly',
          to: 'accessCentre',
          rangeKm: 520,
          pitch: -66,
          heading: 0,
          duration: 3600,
        },
        {
          at: 500,
          type: 'metric.count',
          id: 'median-base',
          fact: 'access.hospital',
          key: 'medianBaselineKm',
          format: 'dec1',
          label: 'KM · MEDIAN ROAD DISTANCE TO NEAREST HOSPITAL',
          screen: { x: 0.64, y: 0.2 },
          size: 'xl',
          duration: 1500,
          tag: DERIVED,
        },
        {
          at: 2400,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'not-time',
          duration: 1000,
          screen: { x: 0.64, y: 0.42 },
          className: 'brf-typed brf-typed--data',
          lines: ['DISTANCE · NOT TIME', 'NO ROAD SPEEDS EXIST FOR THE DATE'],
        },
      ],
    },
  ],
});

export const SCENARIO_ACCESS = defineScene({
  id: 'scenario-access',
  number: 30,
  act: 'V',
  title: 'Damage-scenario access',
  question: 'How did the observed road damage change the way to a hospital?',
  explore: 13,
  runs: ALL,
  keep: ['outline', 'mask', 'roads', 'hospitals'],
  setup: [
    ...base,
    { type: 'layer.show', layer: 'roads', centre: 'kathmandu' },
    { type: 'layer.filter', layer: 'roads', dim: 0.6 },
    { type: 'layer.show', layer: 'hospitals' },
    {
      type: 'camera.fly',
      to: 'accessCentre',
      rangeKm: 520,
      pitch: -66,
      heading: 0,
    },
  ],
  beats: [
    {
      id: 'blockages',
      caption:
        '{access.matching.blockages|int} BLOCKAGES OBSERVED · {access.matching.matched|int} SIT ON A MAPPED ROAD',
      narration:
        'Then the damage. Of {access.matching.blockages|int} road blockages observed from the air, {access.matching.matched|int} sit on a road the map contained.',
      minHoldMs: 400,
      actions: [
        { at: 0, type: 'layer.show', layer: 'blockages', duration: 2600 },
        { at: 0, type: 'audio.cue', cue: 'hit' },
        {
          at: 200,
          type: 'camera.fly',
          to: 'accessCentre',
          rangeKm: 470,
          pitch: -62,
          heading: 8,
          duration: 5200,
        },
        {
          at: 900,
          type: 'chart.enter',
          chart: 'legend',
          id: 'access-key-3',
          title: 'HEALTH ACCESS · KEY',
          screen: { x: 0.03, y: 0.6 },
          rows: [KEY_ROADS, KEY_HOSPITAL, KEY_BLOCKAGE],
        },
        { at: 900, type: 'chart.update', id: 'access-key-3', op: 'revealAll' },
        {
          at: 2400,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'match-card',
          duration: 1300,
          screen: { x: 0.64, y: 0.16 },
          className: 'brf-typed brf-typed--data',
          lines: [
            'OBSERVED BLOCKAGES · NGA',
            '{access.matching.matched|int} OF {access.matching.blockages|int} ON A MAPPED ROAD',
            'MAJOR ROADS ALONE: {access.matching.stage5MajorNetworkMatched|int}',
          ],
        },
      ],
    },
    {
      id: 'cut',
      caption:
        '{access.hospital.byCategory.DISCONNECTED|int} PEOPLE LOST EVERY MAPPED ROAD ROUTE TO A HOSPITAL',
      narration:
        'Take those roads out and search again. {access.hospital.byCategory.DISCONNECTED|thousandWords} people lose every mapped road route to a hospital.',
      minHoldMs: 500,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'match-card' },
        { at: 0, type: 'layer.filter', layer: 'blockages', alpha: 0.55 },
        {
          at: 0,
          type: 'layer.show',
          layer: 'access-cells',
          id: 'cells-cut',
          categories: [3],
          duration: 2000,
        },
        { at: 0, type: 'audio.cue', cue: 'reveal' },
        { at: 200, type: 'chart.exit', id: 'access-key-3' },
        {
          at: 300,
          type: 'chart.enter',
          chart: 'legend',
          id: 'access-change',
          title: 'HOSPITAL ACCESS · DAMAGE SCENARIO',
          tag: SCENARIO,
          screen: { x: 0.03, y: 0.58 },
          rows: [
            {
              category: 3,
              label: 'NO ROUTE AFTER',
              sub: 'LOST EVERY MAPPED ROUTE',
            },
            { category: 1, label: 'LONGER ROUTE', sub: 'SAME HOSPITAL' },
            { category: 2, label: 'OTHER HOSPITAL', sub: 'NEAREST CHANGED' },
            {
              category: 4,
              label: 'NO ROUTE BEFORE',
              sub: 'ROAD NOT JOINED TO ANY',
            },
          ],
        },
        { at: 300, type: 'chart.update', id: 'access-change', op: 'revealAll' },
        {
          at: 700,
          type: 'metric.count',
          id: 'cut-count',
          fact: 'access.hospital',
          key: 'byCategory',
          subKey: 'DISCONNECTED',
          format: 'int',
          label: 'PEOPLE · NO MAPPED ROUTE TO A HOSPITAL AFTER',
          screen: { x: 0.64, y: 0.18 },
          size: 'xl',
          duration: 1800,
          tag: SCENARIO,
        },
        {
          at: 2600,
          type: 'camera.fly',
          to: { fact: 'access.cut', path: ['frame'] },
          spanFactor: 2.6,
          pitch: -60,
          heading: 0,
          duration: 3800,
        },
      ],
    },
    {
      id: 'longer',
      caption:
        '{access.detours.people|int} MORE FACE A LONGER ROUTE · MEDIAN +{access.detours.medianExtraKm|dec1} KM',
      narration:
        'Another {access.detours.people|thousandWords} face a longer route: typically about {access.detours.medianExtraKm|dec1} kilometres more.',
      runs: SIX_FULL,
      minHoldMs: 400,
      actions: [
        {
          at: 0,
          type: 'layer.show',
          layer: 'access-cells',
          id: 'cells-longer',
          categories: [1, 2],
          duration: 1600,
        },
        {
          at: 0,
          type: 'camera.fly',
          to: 'accessCentre',
          rangeKm: 470,
          pitch: -62,
          heading: 0,
          duration: 3600,
        },
        { at: 0, type: 'annotation.remove', id: 'cut-count' },
        {
          at: 600,
          type: 'metric.count',
          id: 'longer-count',
          fact: 'access.detours',
          key: 'people',
          format: 'int',
          label: 'PEOPLE · LONGER ROAD ROUTE TO A HOSPITAL',
          screen: { x: 0.64, y: 0.18 },
          size: 'xl',
          duration: 1600,
          tag: SCENARIO,
        },
      ],
    },
    {
      id: 'unchanged',
      caption:
        'FOR {access.hospital.byCategoryShareOfRoadConnected.SIMILAR|pct1} OF PEOPLE NEAR A ROAD, NOTHING CHANGED',
      narration:
        'But for {access.hospital.byCategoryShareOfRoadConnected.SIMILAR|int} percent of people near a road, the nearest hospital was as far away as before.',
      minHoldMs: 400,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'longer-count' },
        { at: 0, type: 'annotation.remove', id: 'cut-count' },
        { at: 0, type: 'layer.filter', layer: 'roads', dim: 1, duration: 1200 },
        {
          at: 300,
          type: 'metric.count',
          id: 'same-share',
          fact: 'access.hospital',
          key: 'byCategoryShareOfRoadConnected',
          subKey: 'SIMILAR',
          format: 'pct1',
          label: 'OF PEOPLE NEAR A ROAD · NO CHANGE',
          screen: { x: 0.64, y: 0.18 },
          size: 'xl',
          duration: 1600,
          tag: SCENARIO,
        },
        { at: 2200, type: 'audio.cue', cue: 'hit' },
      ],
    },
    {
      id: 'the-map',
      caption:
        'MANBU: {access.manbu.sites|int} DAMAGE SITES · NO MAPPED ROAD TO A HOSPITAL, EVEN BEFORE',
      narration:
        'The larger gap was the map itself. Around Manbu, with {access.manbu.sites|int} damaged sites, no mapped road reached a hospital even before the earthquake.',
      minHoldMs: 900,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'same-share' },
        {
          at: 0,
          type: 'layer.show',
          layer: 'access-cells',
          id: 'cells-never',
          categories: [4],
          duration: 1600,
        },
        {
          at: 300,
          type: 'camera.fly',
          to: 'area:Manbu Area',
          rangeKm: 170,
          pitch: -58,
          heading: -12,
          duration: 4200,
        },
        {
          at: 3600,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'manbu-gap',
          anchor: 'area:Manbu Area',
          title: 'MANBU AREA',
          lines: [
            '{access.manbu.sites|int} UNOSAT DAMAGE SITES',
            'NO MAPPED ROAD TO ANY HOSPITAL',
            'BEFORE OR AFTER · AIR ACCESS NOT MODELLED',
          ],
          tag: GAP,
          dx: 150,
          dy: -100,
          tone: 'caveat',
        },
        { at: 3700, type: 'audio.cue', cue: 'reveal' },
      ],
    },
  ],
});

export const RESCUE_ROUTE = defineScene({
  id: 'rescue-route',
  number: 32,
  act: 'V',
  title: 'A route, before and after',
  question: 'What did the damage do to one place’s road to a hospital?',
  explore: 14,
  runs: SIX_FULL,
  keep: ['outline', 'mask', 'roads', 'hospitals', 'blockages'],
  setup: [
    ...base,
    { type: 'layer.show', layer: 'roads', centre: 'kathmandu' },
    { type: 'layer.filter', layer: 'roads', dim: 0.7 },
    { type: 'layer.show', layer: 'hospitals' },
    { type: 'layer.show', layer: 'blockages' },
    { type: 'layer.filter', layer: 'blockages', alpha: 0.5 },
    {
      type: 'camera.fly',
      to: { fact: 'access.cut', path: ['frame'] },
      spanFactor: 2.6,
      pitch: -60,
      heading: 0,
    },
  ],
  beats: [
    {
      id: 'place',
      caption:
        'ONE SQUARE KILOMETRE IN {access.cut.origin.district|upper} · {access.cut.origin.people|int} PEOPLE',
      narration:
        'Take one place: a square kilometre in {access.cut.origin.district}, home to {access.cut.origin.people|int} people.',
      minHoldMs: 400,
      actions: [
        {
          at: 0,
          type: 'camera.fly',
          to: { fact: 'access.cut', path: ['origin'] },
          rangeKm: 70,
          pitch: -56,
          heading: 10,
          duration: 4200,
        },
        { at: 0, type: 'audio.cue', cue: 'lock' },
        {
          at: 1600,
          type: 'annotation.draw',
          kind: 'bracket',
          id: 'origin-bracket',
          anchor: { fact: 'access.cut', path: ['origin'] },
          size: 40,
        },
        {
          at: 1700,
          type: 'annotation.draw',
          kind: 'pulse',
          id: 'origin-pulse',
          anchor: { fact: 'access.cut', path: ['origin'] },
          colour: '#e8f5ef',
          maxPx: 34,
        },
        {
          at: 2300,
          type: 'annotation.draw',
          kind: 'label',
          id: 'origin-label',
          anchor: { fact: 'access.cut', path: ['origin'] },
          text: '{access.cut.origin.people|int} PEOPLE · MMI {access.cut.origin.mmi|dec1}',
          size: 'city',
          dx: 30,
          dy: -24,
        },
      ],
    },
    {
      id: 'before',
      caption:
        'BEFORE: {access.cut.baseline.km|dec1} KM BY ROAD TO A HOSPITAL IN {access.cut.baseline.hospital.district|upper}',
      narration:
        'Before the earthquake, its nearest hospital by road was {access.cut.baseline.km|dec1} kilometres away, in {access.cut.baseline.hospital.district}.',
      minHoldMs: 400,
      actions: [
        {
          at: 0,
          type: 'camera.fly',
          to: { fact: 'access.cut', path: ['frame'] },
          spanFactor: 1.5,
          pitch: -60,
          heading: 0,
          duration: 4800,
        },
        {
          at: 300,
          type: 'route.trace',
          id: 'cut-before',
          line: { fact: 'access.cut', path: ['baseline', 'line'] },
          colour: '#3cf2a0',
          width: 3.5,
          duration: 4600,
        },
        { at: 300, type: 'audio.cue', cue: 'trace' },
        {
          at: 4600,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'cut-hospital',
          anchor: { fact: 'access.cut', path: ['baseline', 'hospital'] },
          title: '{access.cut.baseline.hospital.type|upper}',
          lines: [
            '{access.cut.baseline.hospital.district|upper}',
            '{access.cut.baseline.km|dec1} KM OF MAPPED ROAD',
          ],
          tag: COD,
          dx: 150,
          dy: -90,
        },
      ],
    },
    {
      id: 'cut',
      caption:
        '{access.cut.blockagesOnBaselineRoute.0.sensedOn|dateShort}: THIS ROUTE OBSERVED CUT',
      narration:
        'On {access.cut.blockagesOnBaselineRoute.0.sensedOn|dateLong}, the route was observed cut.',
      minHoldMs: 500,
      actions: [
        {
          at: 0,
          type: 'camera.fly',
          to: { fact: 'access.cut', path: ['blockagesOnBaselineRoute', 0] },
          rangeKm: 45,
          pitch: -55,
          heading: 14,
          duration: 3200,
        },
        { at: 0, type: 'annotation.remove', id: 'origin-label' },
        {
          at: 1200,
          type: 'annotation.draw',
          kind: 'pulse',
          id: 'cut-pulse',
          anchor: { fact: 'access.cut', path: ['blockagesOnBaselineRoute', 0] },
          colour: '#ff3d6e',
          maxPx: 70,
          count: 3,
        },
        { at: 1200, type: 'audio.cue', cue: 'hit' },
        {
          at: 1600,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'cut-callout',
          anchor: { fact: 'access.cut', path: ['blockagesOnBaselineRoute', 0] },
          title: '{access.cut.blockagesOnBaselineRoute.0.kind|upper}',
          lines: [
            'OBSERVED {access.cut.blockagesOnBaselineRoute.0.sensedOn|dateShort}',
            'NGA DAMAGE ASSESSMENT',
          ],
          tag: { source: 'NGA', cls: 'OBSERVED' },
          dx: -230,
          dy: -80,
        },
        { at: 2400, type: 'annotation.remove', id: 'cut-before' },
        {
          at: 2400,
          type: 'route.trace',
          id: 'cut-dead',
          line: { fact: 'access.cut', path: ['baseline', 'line'] },
          colour: '#ff3d6e',
          width: 2.5,
          dashed: true,
          duration: 700,
        },
      ],
    },
    {
      id: 'no-route',
      caption: 'AFTER: NO ROAD ROUTE TO ANY HOSPITAL IN THE MAPPED NETWORK',
      narration:
        'With it gone, the mapped network offers no road route to any hospital. Tracks nobody had mapped may have existed; air access is not modelled.',
      minHoldMs: 600,
      actions: [
        {
          at: 0,
          type: 'camera.fly',
          to: { fact: 'access.cut', path: ['frame'] },
          spanFactor: 1.7,
          pitch: -62,
          heading: 0,
          duration: 3600,
        },
        { at: 0, type: 'annotation.remove', id: 'cut-callout' },
        {
          at: 400,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'no-route-card',
          duration: 1400,
          screen: { x: 0.6, y: 0.16 },
          className: 'brf-typed brf-typed--alert',
          lines: [
            'NO ROUTE IN THE MAPPED NETWORK',
            'SCENARIO · EVERY OBSERVED BLOCKAGE APPLIED',
            'UNMAPPED TRACKS AND AIR ACCESS: NOT MODELLED',
          ],
        },
        { at: 400, type: 'audio.cue', cue: 'reveal' },
        /* The map is all the analysis has: it dims, and the place pulses on its own. */
        {
          at: 3000,
          type: 'layer.filter',
          layer: 'roads',
          dim: 0.35,
          duration: 1400,
        },
        {
          at: 4200,
          type: 'annotation.draw',
          kind: 'pulse',
          id: 'origin-pulse',
          anchor: { fact: 'access.cut', path: ['origin'] },
          colour: '#ff3d6e',
          maxPx: 44,
          count: 2,
        },
        {
          at: 5600,
          type: 'layer.show',
          layer: 'access-cells',
          id: 'cells-cut',
          categories: [3],
          duration: 1400,
        },
      ],
    },
    {
      id: 'detour',
      caption:
        'A TYPICAL DETOUR IN {access.detour.origin.district|upper}: {access.detour.baseline.km|dec1} KM BECOMES {access.detour.scenario.km|dec1} KM',
      narration:
        'Elsewhere the road bends around the damage. In {access.detour.origin.district}, a typical detour: {access.detour.baseline.km|dec1} kilometres became {access.detour.scenario.km|dec1}.',
      minHoldMs: 600,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'no-route-card' },
        { at: 0, type: 'annotation.remove', id: 'origin-bracket' },
        { at: 0, type: 'annotation.remove', id: 'origin-pulse' },
        { at: 0, type: 'annotation.remove', id: 'cut-hospital' },
        { at: 0, type: 'annotation.remove', id: 'cut-dead' },
        { at: 0, type: 'annotation.remove', id: 'cut-pulse' },
        {
          at: 0,
          type: 'camera.fly',
          to: { fact: 'access.detour', path: ['frame'] },
          spanFactor: 1.9,
          pitch: -60,
          heading: 0,
          duration: 4400,
        },
        {
          at: 3400,
          type: 'annotation.draw',
          kind: 'bracket',
          id: 'detour-bracket',
          anchor: { fact: 'access.detour', path: ['origin'] },
          size: 36,
        },
        {
          at: 3600,
          type: 'route.trace',
          id: 'detour-before',
          line: { fact: 'access.detour', path: ['baseline', 'line'] },
          colour: '#3cf2a0',
          width: 3.5,
          duration: 2200,
        },
        {
          at: 5400,
          type: 'annotation.draw',
          kind: 'pulse',
          id: 'detour-cut',
          anchor: {
            fact: 'access.detour',
            path: ['blockagesOnBaselineRoute', 0],
          },
          colour: '#ff3d6e',
          maxPx: 50,
          count: 2,
        },
        {
          at: 6000,
          type: 'route.trace',
          id: 'detour-after',
          line: { fact: 'access.detour', path: ['scenario', 'line'] },
          colour: '#ffb020',
          width: 3.5,
          duration: 3000,
        },
        { at: 6000, type: 'audio.cue', cue: 'trace' },
        {
          at: 8200,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'detour-callout',
          anchor: { fact: 'access.detour', path: ['origin'] },
          title: '+{access.detour.extraKm|dec1} KM',
          lines: [
            'SAME HOSPITAL, LONGER ROAD',
            'MEDIAN DETOUR +{access.detours.medianExtraKm|dec1} KM',
          ],
          tag: SCENARIO,
          dx: -240,
          dy: -70,
        },
      ],
    },
    {
      id: 'meaning',
      caption:
        'DISTANCE ALONG MAPPED ROADS · NOT TRAVEL TIME · NOT HOSPITAL CAPACITY',
      narration:
        'These are distances along mapped roads, with every observed blockage applied at once. They are not travel times, and they say nothing about what a hospital could do.',
      minHoldMs: 900,
      actions: [
        {
          at: 0,
          type: 'camera.fly',
          to: 'accessCentre',
          rangeKm: 520,
          pitch: -66,
          heading: 0,
          duration: 4200,
        },
        { at: 0, type: 'annotation.remove', id: 'detour-callout' },
        { at: 0, type: 'annotation.remove', id: 'detour-bracket' },
        { at: 0, type: 'annotation.remove', id: 'detour-cut' },
        { at: 1800, type: 'annotation.remove', id: 'detour-before' },
        { at: 1800, type: 'annotation.remove', id: 'detour-after' },
        {
          at: 600,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'meaning-card',
          duration: 1800,
          screen: { x: 0.6, y: 0.16 },
          className: 'brf-typed brf-typed--data',
          lines: [
            'NO ROUTE AFTER: {access.hospital.byCategory.DISCONNECTED|int} PEOPLE',
            'LONGER: {access.detours.people|int} · MEDIAN +{access.detours.medianExtraKm|dec1} KM',
            'NO CHANGE: {access.hospital.byCategoryShareOfRoadConnected.SIMILAR|pct1} OF PEOPLE NEAR A ROAD',
            'NO MAPPED ROAD NEARBY: {access.hospital.peopleNoMappedRoadNearby|mega2}',
          ],
        },
        /* Each line of the card lights its own layer on the map, in the card's order. */
        {
          at: 2400,
          type: 'layer.filter',
          layer: 'roads',
          dim: 0.6,
          duration: 900,
        },
        {
          at: 2600,
          type: 'layer.show',
          layer: 'access-cells',
          id: 'cells-cut',
          categories: [3],
          duration: 1200,
        },
        {
          at: 4800,
          type: 'layer.show',
          layer: 'access-cells',
          id: 'cells-longer',
          categories: [1, 2],
          duration: 1200,
        },
        {
          at: 7200,
          type: 'layer.filter',
          layer: 'roads',
          dim: 1,
          duration: 1200,
        },
        { at: 9400, type: 'layer.show', layer: 'no-road', duration: 1600 },
      ],
    },
  ],
});

export const ACT5 = Object.freeze([
  BASELINE_ACCESS,
  SCENARIO_ACCESS,
  RESCUE_ROUTE,
]);
