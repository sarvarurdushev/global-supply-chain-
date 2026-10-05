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
/* The grey crosses: observed, but on no road the 2015 map held, so they change no route. */
const KEY_BLOCKAGE_OFF = {
  glyph: '×',
  colour: 'unmatched',
  label: 'BLOCKAGE',
  sub: 'OBSERVED · NOT ON THE MAP',
};

export const BASELINE_ACCESS = defineScene({
  id: 'baseline-access',
  number: 29,
  act: 'V',
  title: 'Baseline access',
  question: 'How far was the nearest hospital by road, before the earthquake?',
  technical:
    'One multi-source Dijkstra search over every mapped road of {access.network.instant|dateShort} ({access.network.lengthKm|int} km), outward from every listed hospital at once, by length. A populated 1 km cell joins the network at its nearest road node if it lies within {access.params.originSnapMetres|kmFromMetres}; a hospital within {access.params.facilitySnapMetres|kmFromMetres}. No road speeds exist for the date, so this is distance, not travel time.',
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
        'Every road on the map the day before: {access.network.lengthKm|int} kilometres.',
      minHoldMs: 400,
      actions: [
        { at: 1200, type: 'term.show', term: 'OSM' },
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
          duration: 4600,
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
            '{access.network.ways|int} ROAD SEGMENTS · {access.network.lengthKm|int} KM',
          ],
        },
      ],
    },
    {
      id: 'hospitals',
      caption:
        '{access.lists.codHospitals|int} HOSPITALS · GOVERNMENT LIST COMPILED {access.lists.codCompiled|dateShort}',
      narration:
        'The hospitals, from the government list of {access.lists.codCompiled|dateLong}.',
      minHoldMs: 400,
      actions: [
        { at: 900, type: 'term.show', term: 'DOHS' },
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
        'Before any damage, {access.hospital.peopleNoMappedRoadNearbyShare|int} percent of people here lived more than {access.params.originSnapMetres|kmWordsFromMetres} from a mapped road.',
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
          duration: 3200,
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
          dx: -260,
          dy: -40,
        },
      ],
    },
    {
      id: 'median',
      caption:
        'MEDIAN TO THE NEAREST HOSPITAL: {access.hospital.medianBaselineKm|dec1} KM OF ROAD · NOT TRAVEL TIME',
      narration:
        'For people near a road, the median distance to a hospital: {access.hospital.medianBaselineKm|dec1} kilometres. Road distance, not travel time.',
      runs: SIX_FULL,
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
        { at: 300, type: 'term.show', term: 'shortestPath', holdMs: 8000 },
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
  technical:
    'The same search after removing every road edge within {access.params.blockageSnapMetres|int} m of an observed NGA blockage. A cell is LONGER when its route grows by more than {access.params.similarMetres|kmFromMetres}, DISCONNECTED when no listed hospital stays reachable. SCENARIO: all observed blockages at once, not a record of any day.',
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
        'Now apply the damage. Of {access.matching.blockages|int} observed blockages, {access.matching.matched|int} sit on a mapped road.',
      runs: SIX_FULL,
      minHoldMs: 400,
      actions: [
        { at: 1200, type: 'term.show', term: 'SCENARIO' },
        { at: 0, type: 'layer.show', layer: 'blockages', duration: 2600 },
        { at: 0, type: 'audio.cue', cue: 'tick' },
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
          rows: [KEY_ROADS, KEY_HOSPITAL, KEY_BLOCKAGE, KEY_BLOCKAGE_OFF],
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
        'Search again. {access.hospital.byCategory.DISCONNECTED|thousandWords} people lose every mapped road to a hospital.',
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
          duration: 2800,
        },
        {
          at: 3000,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'cut-where',
          duration: 1400,
          screen: { x: 0.64, y: 0.4 },
          className: 'brf-typed brf-typed--data',
          lines: [
            'WHERE ACCESS CHANGED MOST',
            '{access.mostDisruptedNames|list}',
          ],
          tag: SCENARIO,
        },
      ],
    },
    {
      id: 'longer',
      caption:
        '{access.detours.people|int} MORE FACE A LONGER ROUTE · MEDIAN +{access.detours.medianExtraKm|dec1} KM',
      narration:
        'Another {access.detours.people|thousandWords} face a longer route: about {access.detours.medianExtraKm|dec1} kilometres more.',
      runs: SIX_FULL,
      minHoldMs: 400,
      actions: [
        { at: 600, type: 'term.show', term: 'median' },
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
        { at: 0, type: 'annotation.remove', id: 'cut-where' },
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
        'For {access.hospital.byCategoryShareOfRoadConnected.SIMILAR|int} percent of people near a road, nothing changed.',
      minHoldMs: 400,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'longer-count' },
        { at: 0, type: 'annotation.remove', id: 'cut-count' },
        { at: 0, type: 'annotation.remove', id: 'cut-where' },
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
        { at: 2200, type: 'audio.cue', cue: 'tick' },
        /* Out to the whole study area: most of it did not change. */
        {
          at: 400,
          type: 'camera.fly',
          to: 'accessCentre',
          rangeKm: 520,
          pitch: -64,
          heading: 4,
          duration: 4200,
        },
      ],
    },
    {
      id: 'the-map',
      kind: 'meaning',
      caption:
        'THE BIGGER GAP WAS THE MAP · MANBU: {access.manbu.sites|int} SITES, NO MAPPED ROAD TO A HOSPITAL',
      narration:
        'So the bigger gap was the map itself. Around Manbu, {access.manbu.sites|int} damaged sites had no mapped road to a hospital, even before the earthquake.',
      minHoldMs: 900,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'same-share' },
        /* The places with no route at all are the subject; the network recedes to context. */
        {
          at: 400,
          type: 'focus',
          on: ['cells-never', 'area-routes', 'outline'],
        },
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
        /* From each named damage area's centre: what the observed blockages did to its route. */
        { at: 4400, type: 'layer.show', layer: 'area-routes', duration: 1400 },
        {
          at: 5200,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'area-summary',
          duration: 1600,
          screen: { x: 0.03, y: 0.22 },
          className: 'brf-typed brf-typed--data',
          lines: [
            'FROM THE {access.areaSummary.areas|int} NAMED DAMAGE AREAS',
            '{access.areaSummary.unchanged|int} ROUTES UNCHANGED · {access.areaSummary.changed|int} CHANGED',
            '{access.areaSummary.noBaselinePath|int} NO ROAD ROUTE, EVEN BEFORE · {access.areaSummary.offNetwork|int} OFF THE MAP',
          ],
          tag: SCENARIO,
        },
        /* Back out to all the named areas while their summary card is read. */
        {
          at: 6200,
          type: 'camera.fly',
          to: 'damageCentre',
          rangeKm: 280,
          pitch: -58,
          heading: 4,
          duration: 3000,
        },
        /* As the camera lands on the damage areas, the diamonds answer it. */
        {
          at: 6800,
          type: 'annotation.draw',
          kind: 'pulse',
          id: 'areas-pulse',
          anchor: 'area:Manbu Area',
          colour: '#9b8cff',
          maxPx: 60,
          count: 2,
        },
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
  technical: 'How this place was chosen: {access.cut.selectionRule}',
  explore: 14,
  runs: SIX_FULL,
  keep: ['outline', 'mask', 'roads', 'blockages'],
  /*
   * The search, performed rather than reported: one place, the hospitals a
   * search would consider, the one the roads actually reach, the route, the
   * observed cut, the search again over what still connects, the result —
   * then a place where the search finds a way round. Every position, line
   * and figure is the pipeline's (access.cut / access.detour).
   */
  setup: [
    ...base,
    { type: 'layer.show', layer: 'roads', centre: 'kathmandu' },
    { type: 'layer.filter', layer: 'roads', dim: 0.7 },
    { type: 'layer.hide', layer: 'hospitals' },
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
      id: 'need',
      caption:
        'ONE SQUARE KILOMETRE IN {access.cut.origin.district|upper} · {access.cut.origin.people|int} PEOPLE · MMI {access.cut.origin.mmi|dec1}',
      narration:
        'Take one place. A square kilometre in {access.cut.origin.district}: {access.cut.origin.people|int} people, in strong shaking.',
      minHoldMs: 300,
      actions: [
        {
          at: 0,
          type: 'camera.fly',
          to: { fact: 'access.cut', path: ['origin'] },
          rangeKm: 70,
          pitch: -56,
          heading: 10,
          duration: 4000,
        },
        { at: 0, type: 'audio.cue', cue: 'lock' },
        {
          at: 1400,
          type: 'annotation.draw',
          kind: 'bracket',
          id: 'origin-bracket',
          anchor: { fact: 'access.cut', path: ['origin'] },
          size: 40,
        },
        {
          at: 1500,
          type: 'annotation.draw',
          kind: 'pulse',
          id: 'origin-pulse',
          anchor: { fact: 'access.cut', path: ['origin'] },
          colour: '#e8f5ef',
          maxPx: 34,
        },
        {
          at: 2100,
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
      id: 'facilities',
      caption:
        'THE NEAREST HOSPITALS AS THE CROW FLIES · NO MAPPED ROAD REACHES THEM',
      narration:
        'The nearest hospitals as the crow flies are in {access.cut.investigation.nearbyHospitals.0.district} and {access.cut.investigation.nearbyHospitals.1.district}. No mapped road reaches either.',
      minHoldMs: 300,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'origin-label' },
        /*
         * Wide enough, centred on the place, to hold the two straight-line
         * guesses (south and east) and the hospital the roads do reach
         * (north-west), all within about 33 km.
         */
        {
          at: 0,
          type: 'camera.fly',
          to: { fact: 'access.cut', path: ['origin'] },
          rangeKm: 130,
          pitch: -72,
          heading: 0,
          duration: 3400,
        },
        {
          at: 500,
          type: 'layer.show',
          layer: 'hospital-candidates',
          fact: 'access.cut',
          path: ['investigation', 'nearbyHospitals'],
          duration: 2200,
        },
        { at: 500, type: 'audio.cue', cue: 'reveal' },
        {
          at: 2000,
          type: 'route.trace',
          id: 'crow-0',
          line: {
            between: [
              { fact: 'access.cut', path: ['origin'] },
              {
                fact: 'access.cut',
                path: ['investigation', 'nearbyHospitals', 0],
              },
            ],
          },
          colour: '#9aa5a1',
          width: 1.6,
          dashed: true,
          duration: 1000,
        },
        {
          at: 2400,
          type: 'route.trace',
          id: 'crow-1',
          line: {
            between: [
              { fact: 'access.cut', path: ['origin'] },
              {
                fact: 'access.cut',
                path: ['investigation', 'nearbyHospitals', 1],
              },
            ],
          },
          colour: '#9aa5a1',
          width: 1.6,
          dashed: true,
          duration: 1000,
        },
        {
          at: 3200,
          type: 'annotation.draw',
          kind: 'label',
          id: 'near-0',
          anchor: {
            fact: 'access.cut',
            path: ['investigation', 'nearbyHospitals', 0],
          },
          text: '{access.cut.investigation.nearbyHospitals.0.straightKm|dec1} KM · NO MAPPED ROAD',
          size: 'city',
          dx: 16,
          dy: 18,
        },
        {
          at: 3600,
          type: 'annotation.draw',
          kind: 'label',
          id: 'near-1',
          anchor: {
            fact: 'access.cut',
            path: ['investigation', 'nearbyHospitals', 1],
          },
          text: '{access.cut.investigation.nearbyHospitals.1.straightKm|dec1} KM · NO MAPPED ROAD',
          size: 'city',
          dx: 16,
          dy: -18,
        },
      ],
    },
    {
      id: 'nearest',
      caption:
        'THE NEAREST HOSPITAL THE ROADS REACH: {access.cut.baseline.hospital.district|upper}',
      narration:
        'The nearest one the roads reach is in {access.cut.baseline.hospital.district}.',
      minHoldMs: 300,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'crow-0' },
        { at: 0, type: 'annotation.remove', id: 'crow-1' },
        /* Attention moves north-west, to the hospital the roads reach. */
        {
          at: 200,
          type: 'camera.fly',
          to: { fact: 'access.cut', path: ['frame'] },
          spanFactor: 2.3,
          pitch: -62,
          heading: 0,
          duration: 3200,
        },
        {
          at: 200,
          type: 'annotation.draw',
          kind: 'pulse',
          id: 'nearest-pulse',
          anchor: { fact: 'access.cut', path: ['baseline', 'hospital'] },
          colour: '#3cf2a0',
          maxPx: 60,
          count: 2,
        },
        {
          at: 700,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'cut-hospital',
          anchor: { fact: 'access.cut', path: ['baseline', 'hospital'] },
          title: '{access.cut.baseline.hospital.type|upper}',
          lines: [
            '{access.cut.baseline.hospital.district|upper}',
            'NEAREST BY MAPPED ROAD',
          ],
          tag: COD,
          dx: -210,
          dy: -90,
        },
      ],
    },
    {
      id: 'before',
      caption:
        'BEFORE THE EARTHQUAKE: {access.cut.baseline.km|dec1} KM BY ROAD',
      narration:
        'Before the earthquake: {access.cut.baseline.km|dec1} kilometres by road.',
      minHoldMs: 300,
      actions: [
        {
          at: 100,
          type: 'route.trace',
          id: 'cut-before',
          line: { fact: 'access.cut', path: ['baseline', 'line'] },
          colour: '#3cf2a0',
          width: 3.5,
          duration: 3600,
        },
        { at: 100, type: 'audio.cue', cue: 'trace' },
        {
          at: 3000,
          type: 'annotation.draw',
          kind: 'label',
          id: 'before-km',
          anchor: { fact: 'access.cut', path: ['baseline', 'hospital'] },
          text: '{access.cut.baseline.km|dec1} KM',
          size: 'city',
          dx: -30,
          dy: 26,
        },
      ],
    },
    {
      id: 'cut',
      caption:
        '{access.cut.blockagesOnBaselineRoute.0.sensedOn|dateShort}: THE ROUTE IS OBSERVED CUT',
      narration:
        'On {access.cut.blockagesOnBaselineRoute.0.sensedOn|dateLong}, the route was observed cut.',
      minHoldMs: 400,
      actions: [
        {
          at: 0,
          type: 'camera.fly',
          to: { fact: 'access.cut', path: ['blockagesOnBaselineRoute', 0] },
          rangeKm: 45,
          pitch: -55,
          heading: 14,
          duration: 3000,
        },
        {
          at: 1000,
          type: 'annotation.draw',
          kind: 'pulse',
          id: 'cut-pulse',
          anchor: { fact: 'access.cut', path: ['blockagesOnBaselineRoute', 0] },
          colour: '#ff3d6e',
          maxPx: 70,
          count: 3,
        },
        { at: 1000, type: 'audio.cue', cue: 'tick' },
        {
          at: 1500,
          type: 'route.trace',
          id: 'cut-break',
          line: {
            fact: 'access.cut',
            path: ['investigation', 'split', 'afterCut'],
          },
          colour: '#ff3d6e',
          width: 4,
          dashed: true,
          duration: 2200,
        },
        {
          at: 1700,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'cut-callout',
          anchor: { fact: 'access.cut', path: ['blockagesOnBaselineRoute', 0] },
          title: 'OBSERVED BLOCKED',
          lines: [
            '{access.cut.blockagesOnBaselineRoute.0.sensedOn|dateShort} · NGA',
            'ON THE ONLY MAPPED ROUTE',
          ],
          tag: { source: 'NGA', cls: 'OBSERVED' },
          dx: 150,
          dy: -90,
          tone: 'alert',
        },
      ],
    },
    {
      id: 'search',
      caption:
        'SEARCH WHAT STILL CONNECTS: {access.cut.investigation.reachableAfter.lengthKm|dec1} KM OF ROAD · NO HOSPITAL',
      narration:
        'Search again, over what still connects. {access.cut.investigation.reachableAfter.lengthKm|dec1} kilometres of road, and no hospital on any of it.',
      minHoldMs: 400,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'cut-callout' },
        {
          at: 0,
          type: 'camera.fly',
          to: { fact: 'access.cut', path: ['frame'] },
          spanFactor: 1.7,
          pitch: -60,
          heading: 0,
          duration: 3200,
        },
        {
          at: 500,
          type: 'annotation.draw',
          kind: 'pulse',
          id: 'search-pulse',
          anchor: { fact: 'access.cut', path: ['origin'] },
          colour: '#ffb020',
          maxPx: 90,
          count: 3,
        },
        {
          at: 700,
          type: 'layer.show',
          layer: 'reachable',
          fact: 'access.cut',
          path: ['investigation', 'reachableAfter', 'lines'],
          from: { fact: 'access.cut', path: ['origin'] },
          radiusKm: 30,
          duration: 3600,
        },
        { at: 700, type: 'audio.cue', cue: 'trace' },
        /* Watching it: after the network spread, 10 s passed with nothing moving. Close in on the place it strands. */
        {
          at: 3400,
          type: 'camera.fly',
          to: { fact: 'access.cut', path: ['origin'] },
          rangeKm: 60,
          pitch: -58,
          heading: 8,
          duration: 3300,
        },
        {
          at: 4300,
          type: 'annotation.draw',
          kind: 'label',
          id: 'search-label',
          anchor: { fact: 'access.cut', path: ['origin'] },
          text: '{access.cut.investigation.reachableAfter.lengthKm|dec1} KM STILL CONNECTED · NO HOSPITAL',
          size: 'city',
          dx: -30,
          dy: 30,
        },
      ],
    },
    {
      id: 'result',
      caption: 'RESULT: DISCONNECTED FROM EVERY MAPPED HOSPITAL',
      narration:
        'Result: one blockage cut this place off from every mapped hospital. Unmapped tracks may exist; air access is not modelled.',
      /* The cause carries the stress; the caveat is set apart. */
      prosody: { 0: { emphasis: ['one blockage'] }, 1: { pauseBefore: 250 } },
      minHoldMs: 700,
      actions: [
        {
          at: 0,
          type: 'layer.filter',
          layer: 'reachable',
          dim: 0.6,
          duration: 1000,
        },
        {
          at: 200,
          type: 'camera.fly',
          to: { fact: 'access.cut', path: ['origin'] },
          rangeKm: 42,
          pitch: -55,
          heading: 16,
          duration: 4400,
        },
        {
          at: 300,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'result-card',
          duration: 1600,
          screen: { x: 0.58, y: 0.14 },
          className: 'brf-typed brf-typed--conclusion',
          lines: [
            'DISCONNECTED',
            'NO MAPPED ROAD ROUTE TO ANY HOSPITAL',
            'UNMAPPED TRACKS MAY EXIST · AIR ACCESS NOT MODELLED',
          ],
          tag: SCENARIO,
        },
        /* The rescue disconnect: one of the score's six moments. */
        { at: 300, type: 'audio.cue', cue: 'disconnect' },
      ],
    },
    {
      id: 'detour',
      /* The way-round case is the full run's: the six-minute run has seen a detour in scene 26. */
      runs: [RUNS.FULL],
      caption:
        'ELSEWHERE, A WAY ROUND: {access.detour.baseline.km|dec1} KM BECOMES {access.detour.scenario.km|dec1} KM',
      narration:
        'Elsewhere, the search finds a way round. In {access.detour.origin.district}, {access.detour.baseline.km|dec1} kilometres becomes {access.detour.scenario.km|dec1}.',
      minHoldMs: 700,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'result-card' },
        { at: 0, type: 'annotation.remove', id: 'search-label' },
        { at: 0, type: 'annotation.remove', id: 'search-pulse' },
        { at: 0, type: 'annotation.remove', id: 'near-0' },
        { at: 0, type: 'annotation.remove', id: 'near-1' },
        { at: 0, type: 'annotation.remove', id: 'cut-hospital' },
        { at: 0, type: 'annotation.remove', id: 'before-km' },
        { at: 0, type: 'annotation.remove', id: 'origin-bracket' },
        { at: 0, type: 'annotation.remove', id: 'origin-pulse' },
        { at: 0, type: 'annotation.remove', id: 'nearest-pulse' },
        { at: 0, type: 'annotation.remove', id: 'cut-pulse' },
        { at: 0, type: 'layer.hide', layer: 'hospital-candidates' },
        { at: 0, type: 'layer.hide', layer: 'reachable' },
        { at: 600, type: 'annotation.remove', id: 'cut-before' },
        { at: 600, type: 'annotation.remove', id: 'cut-break' },
        {
          at: 0,
          type: 'camera.fly',
          to: { fact: 'access.detour', path: ['frame'] },
          spanFactor: 1.9,
          pitch: -60,
          heading: 0,
          duration: 3400,
        },
        {
          at: 1600,
          type: 'route.trace',
          id: 'detour-before',
          line: { fact: 'access.detour', path: ['baseline', 'line'] },
          colour: '#3cf2a0',
          width: 3.5,
          duration: 1800,
        },
        {
          at: 3400,
          type: 'annotation.draw',
          kind: 'pulse',
          id: 'detour-cut',
          anchor: {
            fact: 'access.detour',
            path: ['blockagesOnBaselineRoute', 0],
          },
          colour: '#ff3d6e',
          maxPx: 56,
          count: 2,
        },
        {
          at: 3600,
          type: 'route.trace',
          id: 'detour-break',
          line: {
            fact: 'access.detour',
            path: ['investigation', 'split', 'afterCut'],
          },
          colour: '#ff3d6e',
          width: 4,
          dashed: true,
          duration: 1200,
        },
        {
          at: 4600,
          type: 'route.trace',
          id: 'detour-after',
          line: { fact: 'access.detour', path: ['scenario', 'line'] },
          colour: '#ffb020',
          width: 3.5,
          duration: 2400,
        },
        { at: 4600, type: 'audio.cue', cue: 'trace' },
        {
          at: 6800,
          type: 'annotation.draw',
          kind: 'label',
          id: 'detour-label',
          anchor: { fact: 'access.detour', path: ['origin'] },
          text: '+{access.detour.extraKm|dec1} KM · A DETOUR',
          size: 'city',
          dx: 30,
          dy: -26,
        },
        /* A slow turn over the finished detour, so the last line does not sit on a frozen map. */
        {
          at: 5400,
          type: 'camera.fly',
          to: { fact: 'access.detour', path: ['frame'] },
          spanFactor: 1.6,
          pitch: -58,
          heading: 10,
          duration: 2300,
        },
      ],
    },
    {
      id: 'meaning',
      kind: 'limit',
      caption:
        'DISTANCE ALONG MAPPED ROADS · NOT TRAVEL TIME · NOT HOSPITAL CAPACITY',
      narration:
        'Across the whole area, the same search, place by place. Distances along mapped roads, not travel times, and nothing about what a hospital could do.',
      /* The shorter runs gave the national totals in scene 30. */
      runs: [RUNS.FULL],
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
        /* Then a slow pass over the whole area while the caveats are read. */
        {
          at: 4400,
          type: 'camera.fly',
          to: 'accessCentre',
          rangeKm: 470,
          pitch: -62,
          heading: 8,
          duration: 5200,
        },
        { at: 0, type: 'annotation.remove', id: 'detour-label' },
        { at: 0, type: 'annotation.remove', id: 'detour-cut' },
        { at: 1800, type: 'annotation.remove', id: 'detour-before' },
        { at: 1800, type: 'annotation.remove', id: 'detour-break' },
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
