/**
 * ACT I — INCIDENT DETECTION.
 *
 * Every figure is a `{fact}` placeholder or a `fact:` reference, resolved
 * from the Stage 3–5 artefacts at run time (facts.js). Offsets are in
 * milliseconds of briefing time; the director scales them with speed.
 */

import { RUNS, defineScene } from '../timeline.js';

const ALL = [RUNS.THREE, RUNS.SIX, RUNS.FULL];
const SIX_FULL = [RUNS.SIX, RUNS.FULL];

const USGS = { source: 'USGS', cls: 'OBSERVED' };
/* ShakeMap intensity is a model run on the recordings, so it wears MODELLED, as the legend does. */
const SHAKEMAP = { source: 'USGS SHAKEMAP', cls: 'MODELLED' };

export const INCOMING = defineScene({
  id: 'incoming',
  number: 1,
  act: 'I',
  title: 'Incoming incident',
  question: 'What has happened?',
  explore: 0,
  runs: ALL,
  setup: [
    { type: 'veil', opacity: 0.94 },
    { type: 'layer.show', layer: 'graticule' },
    {
      type: 'camera.fly',
      to: { lon: 40, lat: 18 },
      rangeKm: 21000,
      pitch: -90,
    },
  ],
  beats: [
    {
      id: 'detected',
      caption:
        'INCIDENT DETECTED · {quake.time|dateShort} · {quake.time|utcHM}',
      narration:
        '{quake.time|dateLong}, {quake.time|utcHM}. A major earthquake is detected in South Asia.',
      minHoldMs: 600,
      actions: [
        { at: 0, type: 'audio.cue', cue: 'tick' },
        {
          at: 0,
          type: 'title.type',
          id: 'title',
          duration: 2600,
          screen: { x: 0.07, y: 0.32 },
          lines: [
            { text: 'NATURAL DISASTER INTELLIGENCE', className: 'is-kicker' },
            { text: 'INCIDENT DETECTED', className: 'is-alert' },
            { text: '{quake.time|dateShort}' },
            { text: '{quake.time|utcHM}' },
          ],
        },
        { at: 400, type: 'veil', opacity: 0.8, duration: 2400 },
        /* Under the veil the globe keeps turning towards Asia. */
        {
          at: 0,
          type: 'camera.fly',
          to: { lon: 62, lat: 22 },
          rangeKm: 19000,
          pitch: -90,
          duration: 4400,
        },
        { at: 2800, type: 'audio.cue', cue: 'reveal' },
      ],
    },
    {
      id: 'locating',
      caption: 'LOCATING THE EVENT',
      narration: 'Locating the event.',
      minHoldMs: 400,
      actions: [
        {
          at: 0,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'locating',
          duration: 900,
          screen: { x: 0.07, y: 0.56 },
          className: 'brf-typed brf-typed--status',
          lines: ['LOCATING EVENT …'],
        },
        { at: 200, type: 'veil', opacity: 0.3, duration: 3000 },
        { at: 1600, type: 'annotation.remove', id: 'title' },
        {
          at: 300,
          type: 'camera.fly',
          to: 'epicentre',
          rangeKm: 7500,
          pitch: -90,
          duration: 3000,
        },
        {
          at: 2600,
          type: 'annotation.draw',
          kind: 'bracket',
          id: 'find',
          anchor: 'epicentre',
          size: 150,
          duration: 900,
        },
      ],
    },
  ],
});

export const LOCATE = defineScene({
  id: 'locate',
  number: 2,
  act: 'I',
  title: 'Locate Nepal',
  question: 'Where on Earth is this?',
  explore: 1,
  runs: ALL,
  setup: [
    { type: 'veil', opacity: 0.3 },
    { type: 'camera.fly', to: 'epicentre', rangeKm: 7500, pitch: -90 },
  ],
  beats: [
    {
      id: 'south-asia',
      caption: 'SOUTH ASIA · THE CENTRAL HIMALAYA',
      narration: 'The central Himalaya, between India and China.',
      runs: SIX_FULL,
      minHoldMs: 300,
      actions: [
        { at: 0, type: 'veil', opacity: 0.12, duration: 2500 },
        {
          at: 0,
          type: 'camera.fly',
          to: 'nepal',
          rangeKm: 2700,
          pitch: -82,
          duration: 3400,
        },
        {
          at: 500,
          type: 'annotation.draw',
          kind: 'label',
          id: 'india',
          anchor: 'india',
          text: 'INDIA',
          size: 'country',
        },
        {
          at: 900,
          type: 'annotation.draw',
          kind: 'label',
          id: 'china',
          anchor: 'china',
          text: 'CHINA',
          size: 'country',
        },
      ],
    },
    {
      id: 'border',
      caption: 'NEPAL',
      narration: 'Nepal. Its border runs the length of the range.',
      minHoldMs: 500,
      actions: [
        { at: 0, type: 'layer.show', layer: 'outline', duration: 3200 },
        { at: 0, type: 'audio.cue', cue: 'trace' },
        {
          at: 400,
          type: 'layer.show',
          layer: 'mask',
          alpha: 0.6,
          duration: 1600,
        },
        { at: 1200, type: 'annotation.remove', id: 'india' },
        { at: 1200, type: 'annotation.remove', id: 'china' },
        {
          at: 2900,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'nepal-callout',
          anchor: 'nepal',
          title: 'NEPAL',
          lines: [
            'HIMALAYAN REGION',
            '{geo.districtCount|int} DISTRICTS IN 2015',
          ],
          tag: { source: 'OCHA COD-AB', cls: 'OFFICIAL' },
          dx: 170,
          dy: -120,
          duration: 1000,
        },
        { at: 3000, type: 'audio.cue', cue: 'reveal' },
      ],
    },
    {
      id: 'epicentre',
      caption:
        'KATHMANDU · AND THE EPICENTRE, IN {geo.epicentreDistrict|upper}',
      narration:
        'Kathmandu, the capital, sits in this valley. The rupture began to the north-west, in {geo.epicentreDistrict}.',
      minHoldMs: 300,
      actions: [
        /* Towards the valley as it is named; the camera sat parked here for 5 s. */
        {
          at: 0,
          type: 'camera.fly',
          to: 'kathmandu',
          rangeKm: 2000,
          pitch: -74,
          duration: 3600,
        },
        {
          at: 0,
          type: 'annotation.draw',
          kind: 'label',
          id: 'ktm',
          anchor: 'kathmandu',
          text: 'KATHMANDU',
          size: 'city',
          dx: 44,
          dy: -22,
        },
        {
          at: 0,
          type: 'annotation.draw',
          kind: 'bracket',
          id: 'ktm-bracket',
          anchor: 'kathmandu',
          size: 46,
        },
        { at: 1200, type: 'annotation.remove', id: 'nepal-callout' },
        {
          at: 1500,
          type: 'annotation.draw',
          kind: 'pulse',
          id: 'epi-pulse',
          anchor: 'epicentre',
          colour: '#ff5a5f',
          maxPx: 60,
        },
        { at: 1500, type: 'audio.cue', cue: 'pulse' },
        {
          at: 1900,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'epi-callout',
          anchor: 'epicentre',
          title: 'EPICENTRE · {geo.epicentreDistrict|upper}',
          lines: ['{quake.place|upper}'],
          tag: USGS,
          dx: -210,
          dy: -90,
        },
        { at: 2000, type: 'term.show', term: 'USGS' },
        {
          at: 3400,
          type: 'camera.fly',
          to: 'epicentre',
          rangeKm: 900,
          pitch: -68,
          duration: 2800,
        },
      ],
    },
  ],
});

export const MAIN_SHOCK = defineScene({
  id: 'main-shock',
  number: 4,
  act: 'I',
  title: 'Main shock',
  question: 'How big was it, and how deep?',
  technical:
    'USGS ComCat reviewed solution {quake.id|upper}: moment magnitude {quake.magnitude|dec1}, hypocentral depth {quake.depthKm|dec2} km, origin time {quake.time|raw}. Shallow-crustal depths carry several kilometres of uncertainty.',
  explore: 2,
  runs: ALL,
  music: 'mainshock',
  keep: ['outline', 'mask', 'epi-pulse', 'ktm'],
  setup: [
    { type: 'veil', opacity: 0.12 },
    { type: 'layer.show', layer: 'outline' },
    { type: 'layer.show', layer: 'mask', alpha: 0.6 },
    {
      type: 'annotation.draw',
      kind: 'pulse',
      id: 'epi-pulse',
      anchor: 'epicentre',
      colour: '#ff5a5f',
      maxPx: 60,
    },
    {
      type: 'annotation.draw',
      kind: 'label',
      id: 'ktm',
      anchor: 'kathmandu',
      text: 'KATHMANDU',
      size: 'city',
      dx: 44,
      dy: -22,
    },
    { type: 'camera.fly', to: 'epicentre', rangeKm: 900, pitch: -68 },
  ],
  beats: [
    {
      id: 'magnitude',
      caption: 'MAGNITUDE {quake.magnitude|dec1}',
      narration: 'Magnitude {quake.magnitude|dec1}.',
      /* The figure lands before the next line. */
      prosody: { 0: { pauseAfter: 400 } },
      minHoldMs: 600,
      actions: [
        {
          at: 0,
          type: 'camera.fly',
          to: 'epicentre',
          rangeKm: 520,
          pitch: -58,
          heading: 12,
          duration: 2600,
        },
        { at: 0, type: 'audio.cue', cue: 'impact' },
        {
          at: 0,
          type: 'annotation.draw',
          kind: 'pulse',
          id: 'epi-pulse',
          anchor: 'epicentre',
          colour: '#ff5a5f',
          maxPx: 140,
          count: 4,
        },
        { at: 900, type: 'term.show', term: 'magnitude' },
        {
          at: 500,
          type: 'metric.count',
          id: 'magnitude',
          fact: 'quake.magnitude',
          format: 'dec1',
          label: 'MOMENT MAGNITUDE (MW)',
          anchor: 'epicentre',
          size: 'xl',
          dx: 44,
          dy: -70,
          duration: 1700,
        },
      ],
    },
    {
      id: 'depth',
      caption: 'FOCAL DEPTH {quake.depthKm|dec1} KM · {quake.time|utcTime}',
      narration:
        'Only {quake.depthKm|dec1} kilometres deep. The energy was released close to the surface.',
      minHoldMs: 700,
      actions: [
        /* Down towards the rupture while the depth is read. */
        {
          at: 200,
          type: 'camera.fly',
          to: 'epicentre',
          rangeKm: 380,
          pitch: -44,
          heading: 20,
          duration: 5000,
        },
        {
          at: 0,
          type: 'metric.count',
          id: 'depth',
          fact: 'quake.depthKm',
          format: 'dec1',
          label: 'KM FOCAL DEPTH',
          anchor: 'epicentre',
          size: 'lg',
          dx: 44,
          dy: 36,
          duration: 1400,
        },
        { at: 400, type: 'term.show', term: 'depth' },
        {
          at: 900,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'time',
          duration: 1100,
          screen: { x: 0.66, y: 0.18 },
          className: 'brf-typed brf-typed--data',
          lines: [
            'ORIGIN TIME',
            '{quake.time|utcTime}',
            '{quake.time|dateShort}',
            'USGS {quake.id|upper}',
          ],
        },
        {
          at: 2400,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'shallow',
          anchor: 'epicentre',
          title: 'SHALLOW',
          lines: ['ENERGY RELEASED CLOSE TO THE SURFACE'],
          tag: USGS,
          dx: -240,
          dy: 70,
        },
      ],
    },
  ],
});

export const SHAKING = defineScene({
  id: 'shaking',
  number: 5,
  act: 'I',
  title: 'Shaking expands',
  question: 'Where did the ground shake, and how hard?',
  technical:
    "Intensity is USGS ShakeMap's modelled Modified Mercalli Intensity: recorded ground motion interpolated with ground-motion prediction equations and site amplification, then converted to intensity. The bands drawn are ShakeMap contours. MODELLED, not surveyed at each place.",
  explore: 4,
  runs: ALL,
  music: 'mainshock',
  keep: ['outline', 'mask', 'epi-pulse', 'ktm'],
  setup: [
    { type: 'veil', opacity: 0.12 },
    { type: 'layer.show', layer: 'outline' },
    { type: 'layer.show', layer: 'mask', alpha: 0.6 },
    {
      type: 'annotation.draw',
      kind: 'pulse',
      id: 'epi-pulse',
      anchor: 'epicentre',
      colour: '#ff5a5f',
      maxPx: 60,
    },
    {
      type: 'annotation.draw',
      kind: 'label',
      id: 'ktm',
      anchor: 'kathmandu',
      text: 'KATHMANDU',
      size: 'city',
      dx: 44,
      dy: -22,
    },
    {
      type: 'camera.fly',
      to: 'epicentre',
      rangeKm: 520,
      pitch: -58,
      heading: 12,
    },
  ],
  beats: [
    {
      id: 'spread',
      caption: 'THE SHAKING SPREADS EAST ALONG THE MOUNTAINS',
      narration:
        'Within seconds, strong shaking spread east along the mountains.',
      minHoldMs: 400,
      actions: [
        {
          at: 0,
          type: 'camera.fly',
          to: 'shakeCentre',
          rangeKm: 1150,
          pitch: -72,
          heading: 0,
          duration: 3200,
        },
        { at: 300, type: 'layer.show', layer: 'bands', duration: 4400 },
        { at: 300, type: 'audio.cue', cue: 'trace' },
        { at: 1200, type: 'term.show', term: 'ShakeMap' },
        /* The camera follows the shaking east while the outer bands finish. */
        {
          at: 2900,
          type: 'camera.fly',
          to: 'shakeCentre',
          rangeKm: 1020,
          pitch: -66,
          heading: 6,
          duration: 2200,
        },
      ],
    },
    {
      id: 'scale',
      caption:
        'INTENSITY, NOT MAGNITUDE · VI STRONG · VII VERY STRONG · VIII SEVERE',
      /*
       * The weak point of 9.1: a list of numerals. Now it says what the
       * colours ARE (shaking at a place) and what they are not (the size of
       * the earthquake), and each level lights as it is named.
       */
      narration:
        'These colours are intensity: how hard the ground shook at each place. Not magnitude, which is one number for the whole earthquake. Six is strong. Eight, severe.',
      runs: SIX_FULL,
      minHoldMs: 500,
      actions: [
        {
          at: 0,
          type: 'chart.enter',
          chart: 'mmiLegend',
          id: 'mmi-legend',
          screen: { x: 0.03, y: 0.5 },
        },
        { at: 200, type: 'chart.update', id: 'mmi-legend', op: 'revealAll' },
        { at: 300, type: 'term.show', term: 'intensityVsMagnitude' },
        /* The camera drifts as the definition is read, so the frame is never frozen. */
        {
          at: 300,
          type: 'camera.fly',
          to: 'shakeCentre',
          rangeKm: 980,
          pitch: -64,
          heading: 2,
          duration: 7000,
        },
        /* The distinction, on screen while it is said: one number, against a map of numbers. */
        {
          at: 3800,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'mag-vs-mmi',
          until: 'beat',
          duration: 1400,
          screen: { x: 0.6, y: 0.17 },
          className: 'brf-typed brf-typed--data',
          lines: [
            'MAGNITUDE {quake.magnitude|dec1} · ONE NUMBER FOR THE EARTHQUAKE',
            'INTENSITY · DIFFERENT AT EVERY PLACE',
          ],
          tag: SHAKEMAP,
        },
        { at: 7100, type: 'layer.filter', layer: 'bands', highlight: 6 },
        {
          at: 7100,
          type: 'chart.update',
          id: 'mmi-legend',
          op: 'focus',
          index: 4,
        },
        { at: 8200, type: 'layer.filter', layer: 'bands', highlight: 8 },
        {
          at: 8200,
          type: 'chart.update',
          id: 'mmi-legend',
          op: 'focus',
          index: 0,
        },
        { at: 9100, type: 'layer.filter', layer: 'bands', highlight: null },
        {
          at: 9100,
          type: 'chart.update',
          id: 'mmi-legend',
          op: 'focus',
          index: null,
        },
      ],
    },
    {
      id: 'kathmandu',
      caption:
        'KATHMANDU: MMI {exposure.kathmandu.maxMmi|dec1} · {exposure.kathmandu.exposed|mega2} PEOPLE INSIDE MMI VI+',
      narration:
        'Kathmandu: intensity {exposure.kathmandu.maxMmi|dec1}. {exposure.kathmandu.exposed|millionWords} people there were inside strong shaking.',
      minHoldMs: 800,
      actions: [
        {
          at: 0,
          type: 'annotation.draw',
          kind: 'bracket',
          id: 'ktm-bracket',
          anchor: 'kathmandu',
          size: 64,
        },
        {
          at: 300,
          type: 'camera.fly',
          to: 'kathmandu',
          rangeKm: 720,
          pitch: -66,
          heading: -8,
          duration: 3000,
        },
        {
          at: 700,
          type: 'metric.count',
          id: 'ktm-people',
          fact: 'exposure.kathmandu',
          key: 'exposed',
          format: 'mega2',
          label: 'MODELLED RESIDENTS · KATHMANDU · INSIDE MMI VI+',
          anchor: 'kathmandu',
          size: 'lg',
          dx: 56,
          dy: 50,
          duration: 1800,
          tag: { source: 'WORLDPOP × USGS SHAKEMAP', cls: 'DERIVED' },
        },
        {
          at: 3000,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'ktm-mmi',
          anchor: 'kathmandu',
          title: 'PEAK MMI {exposure.kathmandu.maxMmi|dec1}',
          lines: ['DISTRICT PEAK · MODELLED'],
          tag: SHAKEMAP,
          /* Above and right: up-left, it sat on the intensity legend's header. */
          dx: 110,
          dy: -100,
        },
        { at: 3100, type: 'audio.cue', cue: 'reveal' },
        { at: 900, type: 'term.show', term: 'MMI' },
      ],
    },
  ],
});

const MODEL_FIT = { source: 'USGS · OMORI FIT', cls: 'MODEL FIT' };

/* The sequence scenes share one frame: the rupture zone, epicentre to Kathmandu and east. */
const sequenceBase = [
  { type: 'veil', opacity: 0.12 },
  { type: 'layer.show', layer: 'outline' },
  { type: 'layer.show', layer: 'mask', alpha: 0.6 },
  {
    type: 'annotation.draw',
    kind: 'pulse',
    id: 'epi-pulse',
    anchor: 'epicentre',
    colour: '#ff5a5f',
    maxPx: 50,
  },
  {
    type: 'annotation.draw',
    kind: 'label',
    id: 'ktm',
    anchor: 'kathmandu',
    text: 'KATHMANDU',
    size: 'city',
    dx: 44,
    dy: -22,
  },
];

/*
 * THE CLOCK ON SCREEN. From the first aftershock to the second major shock,
 * a card reads the events layer's own time: DAY 0 · +1 H, the date, and a
 * ruler with day 1, one week and the second shock marked. "17 days later"
 * is something the viewer watches pass, not a number they are told.
 */
const TIME_CARD = {
  type: 'time.card',
  id: 'timecard',
  layer: 'events',
  spanDays: 20,
  /* Lower left, clear of the top bar, the heading and the right-hand counters. */
  screen: { x: 0.025, y: 0.6 },
  ticks: [
    { day: 1, label: 'DAY 1' },
    { day: 7, label: 'ONE WEEK' },
    {
      day: { fact: 'seq.secondary', path: ['daysFromMainShock'] },
      label: 'THE SECOND MAJOR SHOCK',
      className: 'is-major',
    },
  ],
};

export const FIRST_HOURS = defineScene({
  id: 'first-hours',
  number: 6,
  act: 'I',
  title: 'First hours',
  question: 'What happened after the main shock?',
  technical:
    'Counts of catalogue events by hour and day after the main shock. Catalogue: {seq.catalogue}. No declustering is applied.',
  explore: 3,
  runs: SIX_FULL,
  music: 'mainshock',
  keep: ['outline', 'mask', 'epi-pulse', 'ktm'],
  setup: [
    ...sequenceBase,
    {
      type: 'camera.fly',
      to: 'shakeCentre',
      rangeKm: 640,
      pitch: -68,
      heading: 0,
    },
  ],
  beats: [
    {
      id: 'first-hour',
      caption: 'THE FIRST HOUR: {seq.hourly.0.count|int} MORE EARTHQUAKES',
      narration:
        'The ground did not settle. {seq.hourly.0.count|int} more earthquakes in the first hour.',
      minHoldMs: 400,
      actions: [
        { at: 0, type: 'layer.show', layer: 'events', hour: 0 },
        { at: 0, ...TIME_CARD },
        {
          at: 0,
          type: 'timeline.seek',
          layer: 'events',
          toHour: 1,
          duration: 3200,
        },
        { at: 0, type: 'audio.cue', cue: 'pulse' },
        { at: 1400, type: 'term.show', term: 'aftershock' },
        {
          at: 300,
          type: 'camera.fly',
          to: 'epicentre',
          rangeKm: 420,
          pitch: -62,
          heading: 6,
          duration: 4200,
        },
        {
          at: 900,
          type: 'metric.count',
          id: 'hour-count',
          fact: 'seq.hourly',
          key: 0,
          subKey: 'count',
          format: 'int',
          label: 'EARTHQUAKES IN THE FIRST HOUR',
          screen: { x: 0.64, y: 0.18 },
          size: 'xl',
          duration: 1800,
          tag: USGS,
        },
      ],
    },
    {
      id: 'first-day',
      caption:
        '{seq.firstDay|int} IN THE FIRST DAY · SPREADING EAST ALONG THE RUPTURE',
      narration:
        '{seq.firstDay|int} by the end of the first day, spreading east toward Kathmandu.',
      minHoldMs: 500,
      actions: [
        {
          at: 0,
          type: 'timeline.seek',
          layer: 'events',
          toHour: 24,
          duration: 4800,
        },
        { at: 0, type: 'annotation.remove', id: 'hour-count' },
        {
          at: 200,
          type: 'camera.fly',
          to: 'shakeCentre',
          rangeKm: 600,
          pitch: -66,
          heading: 10,
          duration: 4800,
        },
        {
          at: 600,
          type: 'metric.count',
          id: 'day-count',
          fact: 'seq.firstDay',
          format: 'int',
          label: 'EARTHQUAKES IN THE FIRST DAY',
          screen: { x: 0.64, y: 0.18 },
          size: 'xl',
          duration: 4200,
          tag: USGS,
        },
        {
          at: 3200,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'extent',
          anchor: 'secondary',
          title: 'AFTERSHOCK ZONE',
          lines: ['{seq.extentKm|int} KM EAST TO WEST'],
          tag: USGS,
          dx: 120,
          dy: -90,
        },
      ],
    },
    {
      id: 'first-week',
      caption: '{seq.firstWeek|int} IN THE FIRST WEEK',
      narration: '{seq.firstWeek|int} by the end of the first week.',
      runs: [RUNS.FULL],
      minHoldMs: 500,
      actions: [
        {
          at: 0,
          type: 'timeline.seek',
          layer: 'events',
          toHour: 168,
          duration: 4000,
        },
        { at: 0, type: 'annotation.remove', id: 'day-count' },
        /* Pull back as the week fills in, so the whole aftershock zone is in frame. */
        {
          at: 200,
          type: 'camera.fly',
          to: 'shakeCentre',
          rangeKm: 680,
          pitch: -62,
          heading: -6,
          duration: 4600,
        },
        {
          at: 400,
          type: 'metric.count',
          id: 'week-count',
          fact: 'seq.firstWeek',
          format: 'int',
          label: 'EARTHQUAKES IN THE FIRST WEEK',
          screen: { x: 0.64, y: 0.18 },
          size: 'xl',
          duration: 3400,
          tag: USGS,
        },
      ],
    },
  ],
});

export const SECOND_SHOCK = defineScene({
  id: 'second-shock',
  number: 8,
  act: 'I',
  title: 'Second major shock',
  question: 'Was it over?',
  explore: 3,
  runs: SIX_FULL,
  music: 'mainshock',
  keep: ['outline', 'mask', 'epi-pulse', 'ktm', 'events', 'timecard'],
  /*
   * The setup only puts the timeline at day 1; the jump to the seventeenth
   * happens in the beat, on screen, with the clock running. (In 9.1 the
   * setup jumped to day 7 invisibly, and "17 days later" was only a phrase.)
   */
  setup: [
    ...sequenceBase,
    { type: 'layer.show', layer: 'events', hour: 24 },
    /* From scene 07's whole year (FULL), back to day 1 at the cut; the six-minute run is already there. */
    { type: 'timeline.seek', layer: 'events', toHour: 24 },
    TIME_CARD,
    {
      type: 'camera.fly',
      to: 'shakeCentre',
      rangeKm: 600,
      pitch: -66,
      heading: 10,
    },
  ],
  beats: [
    {
      id: 'second',
      caption:
        '{seq.secondary.daysFromMainShock|int} DAYS LATER · {seq.secondary.time|dateShort} · MAGNITUDE {seq.secondary.magnitude|dec1}',
      narration:
        'The days pass. On {seq.secondary.time|dayMonth}, {seq.secondary.daysFromMainShock|int} days after the first, a second major earthquake: magnitude {seq.secondary.magnitude|dec1}.',
      /* The pause lets the clock run before the date is said. */
      prosody: { 0: { pauseAfter: 900 } },
      minHoldMs: 500,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'week-count' },
        { at: 0, type: 'annotation.remove', id: 'day-count' },
        { at: 0, type: 'annotation.remove', id: 'extent' },
        /* What had happened by day 1 dims; the next sixteen days arrive bright. */
        {
          at: 0,
          type: 'timeline.seek',
          layer: 'events',
          toHour: { fact: 'seq.largest', path: [1, 'hoursFromMainShock'] },
          duration: 3000,
        },
        {
          at: 600,
          type: 'camera.fly',
          to: 'secondary',
          rangeKm: 420,
          pitch: -60,
          heading: -6,
          duration: 3800,
        },
        {
          at: 5000,
          type: 'annotation.draw',
          kind: 'pulse',
          id: 'second-pulse',
          anchor: 'secondary',
          colour: '#ffb020',
          maxPx: 120,
          count: 4,
        },
        { at: 5000, type: 'audio.cue', cue: 'aftershock' },
        {
          at: 6700,
          type: 'metric.count',
          id: 'second-mag',
          fact: 'seq.secondary',
          key: 'magnitude',
          format: 'dec1',
          label: 'MOMENT MAGNITUDE · {seq.secondary.time|dateShort}',
          anchor: 'secondary',
          size: 'xl',
          dx: 44,
          dy: -70,
          duration: 1500,
          tag: USGS,
        },
        {
          at: 8200,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'second-where',
          anchor: 'secondary',
          title:
            '{seq.largest.1.distanceFromEpicentreKm|int} KM EAST OF THE FIRST',
          lines: [
            '{seq.secondary.time|utcHM} · {seq.secondary.time|dateShort}',
          ],
          tag: USGS,
          dx: -250,
          dy: 60,
        },
      ],
    },
    {
      id: 'sequence',
      kind: 'meaning',
      caption: 'NOT ONE EVENT · A SEQUENCE, AND IT WAS NOT OVER',
      narration:
        'So this was not one event. It was a sequence, and it was not over.',
      /* A beat between the two halves; the stress on what is still to come. */
      prosody: { 0: { pauseAfter: 300 }, 1: { emphasis: ['not over'] } },
      minHoldMs: 600,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'second-where' },
        {
          at: 0,
          type: 'camera.fly',
          to: 'shakeCentre',
          rangeKm: 640,
          pitch: -66,
          heading: 4,
          duration: 3600,
        },
      ],
    },
    {
      id: 'decay',
      caption:
        'IT RESET THE DECAY · p {omori.before.pValue|dec2} BEFORE, {omori.after.pValue|dec2} AFTER',
      narration:
        'It also reset the decay. Before it, the aftershocks faded at the usual rate. After it, far more slowly, and the curve fits poorly. A weak fit is reported as one.',
      technical:
        'Daily aftershock counts fitted to the modified Omori law n(t) = K/(t + c)^p, c fixed at {omori.before.cFixedAt|raw} day, by least squares on log counts. Before the M{seq.secondary.magnitude|dec1}: p = {omori.before.pValue|dec2}, R² = {omori.before.rSquared|dec2} over {omori.before.daysFitted|int} days. After it: p = {omori.after.pValue|dec2}, R² = {omori.after.rSquared|dec2} over {omori.after.daysFitted|int} days. p near 1 is typical; R² this low means the curve describes the later sequence poorly.',
      runs: [RUNS.FULL],
      minHoldMs: 700,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'timecard' },
        {
          at: 0,
          type: 'timeline.seek',
          layer: 'events',
          toHour: 2200,
          duration: 6500,
        },
        {
          at: 200,
          type: 'camera.fly',
          to: 'shakeCentre',
          rangeKm: 620,
          pitch: -68,
          heading: 0,
          duration: 4800,
        },
        { at: 700, type: 'term.show', term: 'Omori', holdMs: 3700 },
        { at: 4400, type: 'term.show', term: 'rSquared' },
        {
          at: 700,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'omori',
          duration: 1800,
          screen: { x: 0.62, y: 0.16 },
          className: 'brf-typed brf-typed--data',
          lines: [
            'AFTERSHOCK DECAY · OMORI LAW',
            'BEFORE: p = {omori.before.pValue|dec2} · R² {omori.before.rSquared|dec2}',
            'AFTER: p = {omori.after.pValue|dec2} · R² {omori.after.rSquared|dec2}',
            'A WEAK FIT IS REPORTED AS ONE',
          ],
          tag: MODEL_FIT,
        },
        { at: 5600, type: 'annotation.remove', id: 'second-mag' },
      ],
    },
  ],
});

export const ACT1 = Object.freeze([
  INCOMING,
  LOCATE,
  MAIN_SHOCK,
  SHAKING,
  FIRST_HOURS,
  SECOND_SHOCK,
]);
