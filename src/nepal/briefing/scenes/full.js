/**
 * The scenes only the FULL ANALYSIS run plays: the depth the three- and
 * six-minute briefings leave out. Each keeps its storyboard number and act,
 * so the run interleaves them in order (scenes/index.js).
 *
 * Same rules as every other scene: every figure is a fact, every beat
 * changes the picture within half a second, and no stretch stands still for
 * more than six.
 */

import { RUNS, defineScene } from '../timeline.js';

const FULL = [RUNS.FULL];

const COD_AB = { source: 'OCHA COD-AB', cls: 'OFFICIAL' };
const USGS = { source: 'USGS', cls: 'OBSERVED' };
const FIT = { source: 'USGS · GUTENBERG–RICHTER FIT', cls: 'MODEL FIT' };
const UNOSAT = { source: 'UNOSAT', cls: 'OBSERVED' };
const COPERNICUS = { source: 'COPERNICUS EMSR125', cls: 'OBSERVED' };
const NGA = { source: 'NGA', cls: 'OBSERVED' };
const OSM = { source: 'OPENSTREETMAP · 24 APR 2015', cls: 'OBSERVED' };
const COD = { source: 'DOHS / WHO LIST · 2010', cls: 'OFFICIAL' };
const SCENARIO = { source: 'OSM 2015 × DOHS 2010 × NGA', cls: 'SCENARIO' };
const DERIVED = { source: 'THIS ANALYSIS', cls: 'DERIVED' };

const frame = (alpha = 0.58) => [
  { type: 'veil', opacity: 0.12 },
  { type: 'layer.show', layer: 'outline' },
  { type: 'layer.show', layer: 'mask', alpha },
];
const data = (id, lines, tag, at = 700, screen = { x: 0.62, y: 0.16 }) => ({
  at,
  type: 'annotation.draw',
  kind: 'typed',
  id,
  duration: 1500,
  screen,
  className: 'brf-typed brf-typed--data',
  lines,
  tag,
});
const conclusion = (id, lines, tag, at = 500) => ({
  at,
  type: 'annotation.draw',
  kind: 'typed',
  id,
  duration: 1400,
  screen: { x: 0.56, y: 0.16 },
  className: 'brf-typed brf-typed--conclusion',
  lines,
  tag,
});

/* ------------------------------------------------------------------ Act I */

export const ADMIN_GEOGRAPHY = defineScene({
  id: 'admin-geography',
  number: 3,
  act: 'I',
  title: 'Administrative geography',
  question: 'What are the units the figures are counted in?',
  explore: 1,
  runs: FULL,
  keep: ['outline', 'mask'],
  setup: [
    ...frame(),
    { type: 'camera.fly', to: 'nepal', rangeKm: 1000, pitch: -80, heading: 0 },
  ],
  beats: [
    {
      id: 'districts',
      caption:
        '{geo.districtCount|int} DISTRICTS · THE ADMINISTRATIVE MAP OF THE TIME',
      narration:
        'At the time, Nepal had {geo.districtCount|int} districts. Most figures here are counted by district.',
      minHoldMs: 400,
      actions: [
        {
          at: 0,
          type: 'layer.show',
          layer: 'districts',
          strong: true,
          duration: 3600,
        },
        { at: 0, type: 'audio.cue', cue: 'trace' },
        {
          at: 300,
          type: 'metric.count',
          id: 'district-count',
          fact: 'geo.districtCount',
          format: 'int',
          label: 'DISTRICTS · THE ADMINISTRATIVE MAP OF THE TIME',
          screen: { x: 0.64, y: 0.18 },
          size: 'xl',
          duration: 3200,
          tag: COD_AB,
        },
        {
          at: 300,
          type: 'camera.fly',
          to: 'nepal',
          rangeKm: 820,
          pitch: -72,
          heading: 5,
          duration: 7000,
        },
      ],
    },
    {
      id: 'names',
      caption: 'GORKHA · SINDHUPALCHOK · KATHMANDU: NAMES THAT WILL RETURN',
      narration:
        'Three names will return. Gorkha, where the rupture began. Sindhupalchok. And Kathmandu.',
      minHoldMs: 500,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'district-count' },
        {
          at: 0,
          type: 'layer.show',
          layer: 'district-focus',
          keys: ['gorkha', 'sindhupalchok', 'kathmandu'],
          duration: 1800,
        },
        {
          at: 300,
          type: 'camera.fly',
          to: 'shakeCentre',
          rangeKm: 520,
          pitch: -64,
          heading: 6,
          duration: 4400,
        },
        {
          at: 900,
          type: 'annotation.draw',
          kind: 'label',
          id: 'n-gorkha',
          anchor: 'district:gorkha',
          text: 'GORKHA',
          size: 'city',
        },
        {
          at: 1900,
          type: 'annotation.draw',
          kind: 'label',
          id: 'n-sindhu',
          anchor: 'district:sindhupalchok',
          text: 'SINDHUPALCHOK',
          size: 'city',
        },
        {
          at: 2900,
          type: 'annotation.draw',
          kind: 'label',
          id: 'n-ktm',
          anchor: 'kathmandu',
          text: 'KATHMANDU',
          size: 'city',
          dx: 44,
          dy: -22,
        },
      ],
    },
  ],
});

export const SEQUENCE = defineScene({
  id: 'seismic-sequence',
  number: 7,
  act: 'I',
  title: 'Seismic sequence',
  question: 'How big, and how deep, were the earthquakes that followed?',
  explore: 3,
  runs: FULL,
  keep: ['outline', 'mask', 'events', 'epi-pulse', 'ktm'],
  setup: [
    ...frame(0.6),
    { type: 'layer.show', layer: 'events', hour: 168 },
    { type: 'timeline.seek', layer: 'events', toHour: 168 },
    {
      type: 'camera.fly',
      to: 'shakeCentre',
      rangeKm: 620,
      pitch: -68,
      heading: 0,
    },
  ],
  beats: [
    {
      id: 'sizes',
      caption:
        '{seq.total|int} EARTHQUAKES · {seq.bands.1.count|int} IN BAND {seq.bands.1.label|upper}',
      narration:
        '{seq.total|int} earthquakes in all. Most were moderate: {seq.bands.1.count|int} in the {seq.bands.1.label} band.',
      minHoldMs: 500,
      actions: [
        {
          at: 300,
          type: 'metric.count',
          id: 'seq-total',
          fact: 'seq.total',
          format: 'int',
          label: 'EARTHQUAKES IN THE CATALOGUE',
          screen: { x: 0.64, y: 0.18 },
          size: 'xl',
          duration: 1800,
        },
        { at: 0, type: 'layer.filter', layer: 'events', minMagnitude: 5 },
        { at: 0, type: 'audio.cue', cue: 'reveal' },
        {
          at: 200,
          type: 'camera.fly',
          to: 'shakeCentre',
          rangeKm: 560,
          pitch: -64,
          heading: 8,
          duration: 5200,
        },
        {
          at: 400,
          type: 'chart.enter',
          chart: 'bars',
          id: 'mag-bars',
          title: 'EARTHQUAKES BY MAGNITUDE',
          screen: { x: 0.03, y: 0.58 },
          rowsFrom: { fact: 'seq.bands', label: 'label', value: 'count' },
        },
        { at: 500, type: 'chart.update', id: 'mag-bars', op: 'revealAll' },
        {
          at: 3000,
          type: 'chart.update',
          id: 'mag-bars',
          op: 'focus',
          index: 1,
        },
      ],
    },
    {
      id: 'law',
      caption:
        'MANY SMALL, FEW LARGE · b = {seq.gr.bValue|dec2} · COMPLETE ABOVE M{seq.completeness.mc|dec1}',
      narration:
        'Many small, few large: the usual pattern. The fitted b-value is {seq.gr.bValue|dec2}. The catalogue is complete above magnitude {seq.completeness.mc|dec1}.',
      minHoldMs: 600,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'seq-total' },
        { at: 0, type: 'layer.filter', layer: 'events', minMagnitude: null },
        {
          at: 0,
          type: 'chart.update',
          id: 'mag-bars',
          op: 'focus',
          index: null,
        },
        { at: 1500, type: 'layer.filter', layer: 'events', minMagnitude: 6 },
        {
          at: 1500,
          type: 'chart.update',
          id: 'mag-bars',
          op: 'focus',
          index: 4,
        },
        { at: 1500, type: 'audio.cue', cue: 'hit' },
        {
          at: 1700,
          type: 'annotation.draw',
          kind: 'pulse',
          id: 'largest-0',
          anchor: { fact: 'seq.largest', path: [0] },
          colour: '#ff3d6e',
          maxPx: 90,
          count: 3,
        },
        {
          at: 1900,
          type: 'annotation.draw',
          kind: 'pulse',
          id: 'largest-1',
          anchor: { fact: 'seq.largest', path: [1] },
          colour: '#ffb020',
          maxPx: 80,
          count: 3,
        },
        data(
          'gr-card',
          [
            'GUTENBERG–RICHTER · MODEL FIT',
            'b = {seq.gr.bValue|dec2} · R² {seq.gr.rSquared|dec2}',
            'FROM {seq.gr.eventsUsed|int} EVENTS ABOVE M{seq.completeness.mc|dec1}',
          ],
          FIT,
          3000,
        ),
        {
          at: 3200,
          type: 'camera.fly',
          to: 'epicentre',
          rangeKm: 460,
          pitch: -60,
          heading: -6,
          duration: 4000,
        },
      ],
    },
    {
      id: 'depth',
      caption:
        'SHALLOW: {seq.depthBands.1.count|int} OF THEM IN THE {seq.depthBands.1.label|upper} BAND',
      narration:
        'And shallow: {seq.depthBands.1.count|int} in the {seq.depthBands.1.label} band.',
      minHoldMs: 600,
      actions: [
        { at: 0, type: 'chart.exit', id: 'mag-bars' },
        { at: 0, type: 'annotation.remove', id: 'gr-card' },
        { at: 0, type: 'layer.filter', layer: 'events', minMagnitude: null },
        {
          at: 200,
          type: 'chart.enter',
          chart: 'bars',
          id: 'depth-bars',
          title: 'EARTHQUAKES BY FOCAL DEPTH',
          colour: '#7fdcff',
          screen: { x: 0.03, y: 0.58 },
          rowsFrom: { fact: 'seq.depthBands', label: 'label', value: 'count' },
        },
        { at: 300, type: 'chart.update', id: 'depth-bars', op: 'revealAll' },
        {
          at: 300,
          type: 'camera.fly',
          to: 'shakeCentre',
          rangeKm: 600,
          pitch: -58,
          heading: 14,
          duration: 5000,
        },
      ],
    },
  ],
});

/* ------------------------------------------------------------------ Act II */

export const POPULATION = defineScene({
  id: 'population',
  number: 9,
  act: 'II',
  title: 'Population distribution',
  question: 'Where did people live?',
  explore: 5,
  runs: FULL,
  keep: ['outline', 'mask'],
  setup: [
    ...frame(0.62),
    { type: 'camera.fly', to: 'nepal', rangeKm: 1000, pitch: -80, heading: 0 },
  ],
  beats: [
    {
      id: 'people',
      caption: '{exposure.total|mega2} PEOPLE · MODELLED, NOT COUNTED',
      narration:
        'Now the people. About {exposure.total|millionWords}, modelled, not counted. Larger points, more people.',
      minHoldMs: 500,
      actions: [
        {
          at: 900,
          type: 'metric.count',
          id: 'pop-total',
          fact: 'exposure.total',
          format: 'mega2',
          label: 'PEOPLE · MODELLED, NOT COUNTED',
          screen: { x: 0.64, y: 0.18 },
          size: 'xl',
          duration: 1800,
        },
        { at: 0, type: 'layer.show', layer: 'population', duration: 3800 },
        { at: 0, type: 'audio.cue', cue: 'reveal' },
        {
          at: 300,
          type: 'camera.fly',
          to: 'nepal',
          rangeKm: 820,
          pitch: -72,
          heading: 4,
          duration: 5400,
        },
        data(
          'pop-card',
          [
            'POPULATION · WORLDPOP 2015',
            'A MODEL, NOT A CENSUS',
            'ABOUT ONE-KILOMETRE CELLS',
          ],
          { source: 'WORLDPOP 2015', cls: 'DERIVED' },
          2800,
          { x: 0.64, y: 0.4 },
        ),
      ],
    },
    {
      id: 'valley',
      caption: 'THE DENSEST CLUSTER: THE KATHMANDU VALLEY',
      narration: 'The densest cluster, by far: the Kathmandu Valley.',
      minHoldMs: 700,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'pop-card' },
        {
          at: 0,
          type: 'camera.fly',
          to: 'kathmandu',
          rangeKm: 200,
          pitch: -60,
          heading: -8,
          duration: 4400,
        },
        {
          at: 2600,
          type: 'annotation.draw',
          kind: 'bracket',
          id: 'valley',
          anchor: 'kathmandu',
          size: 90,
        },
        {
          at: 2800,
          type: 'annotation.draw',
          kind: 'label',
          id: 'ktm',
          anchor: 'kathmandu',
          text: 'KATHMANDU VALLEY',
          size: 'city',
          dx: 60,
          dy: -40,
        },
      ],
    },
  ],
});

/* ------------------------------------------------------------------ Act III */

const damageFrame = [
  ...frame(0.55),
  {
    type: 'camera.fly',
    to: 'damageCentre',
    rangeKm: 320,
    pitch: -62,
    heading: 0,
  },
];

export const EVIDENCE_ARRIVES = defineScene({
  id: 'evidence-arrives',
  number: 12,
  act: 'III',
  title: 'Damage evidence arrives',
  question: 'When did the damage become visible?',
  explore: 8,
  runs: FULL,
  keep: ['outline', 'mask'],
  setup: damageFrame,
  beats: [
    {
      id: 'arrives',
      caption:
        'DAMAGE APPEARS AS THE IMAGERY WAS READ · FIRST IMAGE {damage.lags.eventToAcquisition.min|int} DAY AFTER',
      narration:
        'Damage became visible only as imagery arrived. The first image, {damage.lags.eventToAcquisition.min|int} day after. The last, more than a week later.',
      minHoldMs: 500,
      actions: [
        { at: 0, type: 'layer.show', layer: 'damage', duration: 800 },
        { at: 0, type: 'layer.filter', layer: 'damage', throughDate: 0 },
        { at: 0, type: 'audio.cue', cue: 'tick' },
        { at: 1600, type: 'layer.filter', layer: 'damage', throughDate: 1 },
        { at: 3200, type: 'layer.filter', layer: 'damage', throughDate: 2 },
        { at: 4800, type: 'layer.filter', layer: 'damage', throughDate: 3 },
        {
          at: 300,
          type: 'camera.fly',
          to: 'damageCentre',
          rangeKm: 290,
          pitch: -58,
          heading: 8,
          duration: 6000,
        },
        {
          at: 600,
          type: 'chart.enter',
          chart: 'bars',
          id: 'date-bars',
          title: 'MAPPED SITES BY IMAGE DATE',
          screen: { x: 0.03, y: 0.6 },
          rowsFrom: { fact: 'damage.byDate', label: 'key', value: 'value' },
        },
        { at: 700, type: 'chart.update', id: 'date-bars', op: 'revealAll' },
        {
          at: 3400,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'first-last',
          duration: 1200,
          screen: { x: 0.64, y: 0.18 },
          className: 'brf-typed brf-typed--data',
          lines: [
            'FIRST IMAGE · DAY {damage.lags.eventToAcquisition.min|int}',
            'LAST IMAGE · DAY {damage.lags.eventToAcquisition.max|int}',
          ],
        },
      ],
    },
    {
      id: 'lag',
      caption:
        'MEDIAN {damage.lags.eventToAcquisition.median|int} DAYS FROM EARTHQUAKE TO IMAGE',
      narration:
        'The median wait: {damage.lags.eventToAcquisition.median|int} days from earthquake to image. A damage map is also a map of when someone could look.',
      minHoldMs: 700,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'first-last' },
        {
          at: 0,
          type: 'camera.fly',
          to: 'damageCentre',
          rangeKm: 340,
          pitch: -64,
          heading: -4,
          duration: 4600,
        },
        data(
          'lag-card',
          [
            'EARTHQUAKE → IMAGE: MEDIAN {damage.lags.eventToAcquisition.median|int} DAYS',
            'RANGE {damage.lags.eventToAcquisition.min|int} TO {damage.lags.eventToAcquisition.max|int} DAYS',
            'DAMAGE HAPPENED BEFORE THE IMAGE, NOT ON ITS DATE',
          ],
          { source: 'UNOSAT × NGA', cls: 'STATISTIC' },
          500,
        ),
      ],
    },
  ],
});

export const DESTROYED_AREAS = defineScene({
  id: 'destroyed-areas',
  number: 14,
  act: 'III',
  title: 'Destroyed areas',
  question: 'Where were buildings destroyed?',
  explore: 8,
  runs: FULL,
  keep: ['outline', 'mask'],
  setup: [...damageFrame, { type: 'layer.show', layer: 'damage' }],
  beats: [
    {
      id: 'destroyed',
      caption:
        '{damage.destroyed|int} DESTROYED · SPREAD ACROSS THE ANALYSIS AREAS',
      narration:
        '{damage.destroyed|int} destroyed sites, spread across the analysis areas. Heaviest around Manbu.',
      minHoldMs: 500,
      actions: [
        {
          at: 200,
          type: 'metric.count',
          id: 'destroyed-total',
          fact: 'damage.destroyed',
          format: 'int',
          label: 'SITES CLASSED DESTROYED',
          screen: { x: 0.64, y: 0.18 },
          size: 'xl',
          duration: 1800,
        },
        {
          at: 0,
          type: 'layer.filter',
          layer: 'damage',
          classes: [0],
          dim: 0.08,
          duration: 900,
        },
        { at: 0, type: 'audio.cue', cue: 'hit' },
        {
          at: 400,
          type: 'chart.enter',
          chart: 'bars',
          id: 'area-bars',
          title: 'MAPPED SITES BY ANALYSIS AREA',
          colour: '#ff4d6d',
          screen: { x: 0.03, y: 0.52 },
          rowsFrom: {
            fact: 'damage.byArea',
            label: 'key',
            value: 'value',
            exclude: ['Nepal', '(unlabelled)'],
            limit: 6,
          },
        },
        { at: 500, type: 'chart.update', id: 'area-bars', op: 'revealAll' },
        {
          at: 2400,
          type: 'camera.fly',
          to: 'area:Manbu Area',
          rangeKm: 140,
          pitch: -58,
          heading: -10,
          duration: 4000,
        },
      ],
    },
    {
      id: 'manbu',
      caption:
        'MANBU: {damage.areaManbu|int} MAPPED SITES, THE LARGEST CLUSTER',
      narration:
        'Around Manbu alone, {damage.areaManbu|int} sites: the largest single cluster.',
      minHoldMs: 600,
      actions: [
        {
          at: 0,
          type: 'layer.filter',
          layer: 'damage',
          classes: [0, 1, 2, 3],
          duration: 900,
        },
        {
          at: 300,
          type: 'annotation.draw',
          kind: 'bracket',
          id: 'manbu-bracket',
          anchor: 'area:Manbu Area',
          size: 70,
        },
        {
          at: 900,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'manbu-callout',
          anchor: 'area:Manbu Area',
          title: 'MANBU AREA',
          lines: ['{damage.areaManbu|int} MAPPED SITES', 'ALL FOUR CLASSES'],
          tag: UNOSAT,
          dx: 150,
          dy: -80,
        },
        {
          at: 3000,
          type: 'camera.fly',
          to: 'area:Manbu Area',
          rangeKm: 110,
          pitch: -54,
          heading: 14,
          duration: 4000,
        },
      ],
    },
  ],
});

export const SEVERE_MODERATE = defineScene({
  id: 'severe-moderate',
  number: 15,
  act: 'III',
  title: 'Severe and moderate',
  question: 'Where was damage heavy but not total?',
  explore: 8,
  runs: FULL,
  keep: ['outline', 'mask'],
  setup: [...damageFrame, { type: 'layer.show', layer: 'damage' }],
  beats: [
    {
      id: 'severe',
      caption: '{damage.severe|int} SEVERE · {damage.moderate|int} MODERATE',
      narration:
        '{damage.severe|int} severe, {damage.moderate|int} moderate. Damaged, but standing.',
      minHoldMs: 500,
      actions: [
        {
          at: 200,
          type: 'metric.count',
          id: 'severe-total',
          fact: 'damage.severe',
          format: 'int',
          label: 'SEVERE · DAMAGED, STANDING',
          screen: { x: 0.64, y: 0.16 },
          size: 'xl',
          duration: 1800,
        },
        {
          at: 1100,
          type: 'metric.count',
          id: 'moderate-total',
          fact: 'damage.moderate',
          format: 'int',
          label: 'MODERATE',
          screen: { x: 0.64, y: 0.34 },
          size: 'lg',
          duration: 1400,
        },
        {
          at: 0,
          type: 'layer.filter',
          layer: 'damage',
          classes: [1, 2],
          dim: 0.08,
          duration: 900,
        },
        {
          at: 300,
          type: 'camera.fly',
          to: 'area:Bhaktapur',
          rangeKm: 90,
          pitch: -56,
          heading: -10,
          duration: 4400,
        },
        {
          at: 2800,
          type: 'annotation.draw',
          kind: 'label',
          id: 'bhaktapur',
          anchor: 'area:Bhaktapur',
          text: 'BHAKTAPUR',
          size: 'city',
          dx: 40,
          dy: -20,
        },
        {
          at: 3200,
          type: 'annotation.draw',
          kind: 'label',
          id: 'sankhu',
          anchor: 'area:Sankhu',
          text: 'SANKHU',
          size: 'city',
          dx: 40,
          dy: -20,
        },
      ],
    },
    {
      id: 'confidence',
      caption: 'NONE OF IT FIELD-VALIDATED AT PUBLICATION',
      narration:
        'All of it read from imagery. None of it checked on the ground at publication.',
      minHoldMs: 700,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'severe-total' },
        { at: 0, type: 'annotation.remove', id: 'moderate-total' },
        {
          at: 0,
          type: 'layer.filter',
          layer: 'damage',
          classes: [0, 1, 2, 3],
          duration: 900,
        },
        {
          at: 200,
          type: 'camera.fly',
          to: 'damageCentre',
          rangeKm: 300,
          pitch: -60,
          heading: 0,
          duration: 4400,
        },
        data(
          'fv-card',
          [
            'READ FROM IMAGERY',
            '“NOT YET FIELD VALIDATED”',
            'THE PRODUCT’S OWN WORDS',
          ],
          UNOSAT,
          600,
        ),
      ],
    },
  ],
});

export const GORKHA = defineScene({
  id: 'gorkha',
  number: 17,
  act: 'III',
  title: 'Gorkha deep dive',
  question: 'What did the epicentre district look like on the record?',
  explore: 8,
  runs: FULL,
  keep: ['outline', 'mask'],
  setup: [
    ...frame(0.6),
    { type: 'layer.show', layer: 'damage' },
    {
      type: 'camera.fly',
      to: 'district:gorkha',
      rangeKm: 320,
      pitch: -62,
      heading: 0,
    },
  ],
  beats: [
    {
      id: 'district',
      caption:
        'GORKHA: {dp.gorkha.damagePoints|int} MAPPED SITES · {dp.gorkha.population|int} PEOPLE',
      narration:
        'Gorkha, the epicentre district. {dp.gorkha.damagePoints|int} mapped damage sites, among about {dp.gorkha.population|thousandWords} people.',
      minHoldMs: 500,
      actions: [
        {
          at: 0,
          type: 'layer.show',
          layer: 'district-focus',
          keys: ['gorkha'],
          duration: 1800,
        },
        {
          at: 0,
          type: 'annotation.draw',
          kind: 'pulse',
          id: 'g-epi',
          anchor: 'epicentre',
          colour: '#ff5a5f',
          maxPx: 70,
          count: 2,
        },
        {
          at: 300,
          type: 'camera.fly',
          to: 'district:gorkha',
          rangeKm: 240,
          pitch: -56,
          heading: -12,
          duration: 5000,
        },
        data(
          'gorkha-card',
          [
            'GORKHA DISTRICT',
            '{dp.gorkha.damagePointsPerThousandPeople|dec1} MAPPED SITES PER THOUSAND PEOPLE',
            'DAMAGE IN {dp.gorkha.shareOfCellsWithObservedDamage|pct1} OF ITS SQUARES',
          ],
          { source: 'UNOSAT × WORLDPOP', cls: 'DERIVED' },
          1400,
        ),
      ],
    },
    {
      id: 'roads',
      caption:
        'AND {access.gorkha.noMappedRoadShare|pct1} OF ITS PEOPLE HAD NO MAPPED ROAD NEARBY',
      narration:
        'And {access.gorkha.noMappedRoadShare|int} percent of its people had no mapped road within reach.',
      minHoldMs: 700,
      actions: [
        {
          at: 400,
          type: 'metric.count',
          id: 'gorkha-noroad',
          fact: 'access.gorkha',
          key: 'noMappedRoadShare',
          format: 'pct1',
          label: 'OF GORKHA’S PEOPLE · NO MAPPED ROAD NEARBY',
          screen: { x: 0.64, y: 0.18 },
          size: 'xl',
          duration: 1800,
        },
        { at: 0, type: 'annotation.remove', id: 'gorkha-card' },
        {
          at: 0,
          type: 'layer.show',
          layer: 'roads',
          centre: 'district:gorkha',
          radiusKm: 120,
          duration: 2600,
        },
        { at: 1800, type: 'layer.show', layer: 'no-road', duration: 2600 },
        {
          at: 300,
          type: 'camera.fly',
          to: 'district:gorkha',
          rangeKm: 200,
          pitch: -58,
          heading: 10,
          duration: 5000,
        },
      ],
    },
  ],
});

export const SECOND_SYSTEM = defineScene({
  id: 'second-system',
  number: 19,
  act: 'III',
  title: 'A second observation system',
  question: 'Did anyone count the undamaged buildings too?',
  explore: 10,
  runs: FULL,
  keep: ['outline', 'mask'],
  setup: damageFrame,
  beats: [
    {
      id: 'graded',
      caption:
        'COPERNICUS GRADED {copernicus.totals.total|int} STRUCTURES · {copernicus.totals.notAffected|int} UNDAMAGED',
      narration:
        'A second system, Copernicus, graded every structure in its areas, including the undamaged. {copernicus.totals.total|int} in all.',
      minHoldMs: 500,
      actions: [
        {
          at: 3600,
          type: 'metric.count',
          id: 'cop-total',
          fact: 'copernicus.totals',
          key: 'total',
          format: 'int',
          label: 'STRUCTURES GRADED · UNDAMAGED INCLUDED',
          screen: { x: 0.64, y: 0.62 },
          size: 'lg',
          duration: 1800,
        },
        { at: 0, type: 'audio.cue', cue: 'reveal' },
        {
          at: 300,
          type: 'chart.enter',
          chart: 'bars',
          id: 'aoi-bars',
          title: 'STRUCTURES GRADED, BY AREA',
          colour: '#7fdcff',
          screen: { x: 0.03, y: 0.54 },
          rowsFrom: { fact: 'copernicus.grades', label: 'aoi', value: 'total' },
        },
        { at: 400, type: 'chart.update', id: 'aoi-bars', op: 'revealAll' },
        {
          at: 200,
          type: 'camera.fly',
          to: 'kathmandu',
          rangeKm: 300,
          pitch: -62,
          heading: 6,
          duration: 5000,
        },
      ],
    },
    {
      id: 'denominator',
      caption:
        'KATHMANDU AREA: {copernicus.kathmandu.destroyed|int} DESTROYED OF {copernicus.kathmandu.total|int} GRADED',
      narration:
        'That gives the missing denominator. In its Kathmandu area: {copernicus.kathmandu.destroyed|int} destroyed, out of {copernicus.kathmandu.total|int}.',
      minHoldMs: 700,
      actions: [
        {
          at: 1800,
          type: 'metric.count',
          id: 'ktm-destroyed',
          fact: 'copernicus.kathmandu',
          key: 'destroyed',
          format: 'int',
          label: 'DESTROYED · KATHMANDU AREA',
          screen: { x: 0.64, y: 0.18 },
          size: 'xl',
          duration: 1800,
        },
        {
          at: 3400,
          type: 'metric.count',
          id: 'ktm-total',
          fact: 'copernicus.kathmandu',
          key: 'total',
          format: 'int',
          label: 'GRADED IN THE SAME AREA',
          screen: { x: 0.64, y: 0.36 },
          size: 'lg',
          duration: 1400,
        },
        { at: 0, type: 'chart.exit', id: 'aoi-bars' },
        { at: 0, type: 'annotation.remove', id: 'cop-total' },
        {
          at: 200,
          type: 'camera.fly',
          to: 'kathmandu',
          rangeKm: 140,
          pitch: -58,
          heading: -8,
          duration: 4400,
        },
        data(
          'cop-card',
          [
            'COPERNICUS · EMS-98 GRADES',
            'ONLY GRADES 1 AND 5 PUBLISHED',
            'NOT ALIGNED WITH UNOSAT’S FOUR CLASSES',
          ],
          COPERNICUS,
          4600,
          { x: 0.64, y: 0.52 },
        ),
      ],
    },
  ],
});

/* ------------------------------------------------------------------ Act IV */

export const MAP_WAS_THIN = defineScene({
  id: 'map-was-thin',
  number: 21,
  act: 'IV',
  title: 'Road network before',
  question: 'How complete was the road map in April 2015?',
  explore: 13,
  runs: FULL,
  keep: ['outline', 'mask'],
  setup: [
    ...frame(0.58),
    {
      type: 'camera.fly',
      to: 'accessCentre',
      rangeKm: 540,
      pitch: -68,
      heading: 0,
    },
  ],
  beats: [
    {
      id: 'main',
      caption: 'THE MAIN ROADS AS MAPPED ON {infra.baseline.instant|dateShort}',
      narration:
        'The main roads, as the map held them the day before the earthquake.',
      minHoldMs: 400,
      actions: [
        {
          at: 0,
          type: 'layer.show',
          layer: 'roads',
          majorOnly: true,
          centre: 'kathmandu',
          radiusKm: 340,
          duration: 3600,
        },
        { at: 0, type: 'audio.cue', cue: 'trace' },
        {
          at: 300,
          type: 'camera.fly',
          to: 'accessCentre',
          rangeKm: 500,
          pitch: -64,
          heading: 6,
          duration: 5000,
        },
      ],
    },
    {
      id: 'growth',
      caption:
        'TODAY THE SAME MAP HOLDS {infra.baseline.mappingGrowthSince2015|dec1} TIMES AS MANY MAIN-ROAD SEGMENTS',
      narration:
        'Today the same map holds {infra.baseline.mappingGrowthSince2015|dec1} times as many main-road segments here. Back then, most of today’s network was not yet drawn.',
      minHoldMs: 700,
      actions: [
        {
          at: 0,
          type: 'layer.filter',
          layer: 'roads',
          dim: 0.5,
          duration: 1400,
        },
        { at: 0, type: 'audio.cue', cue: 'hit' },
        {
          at: 400,
          type: 'metric.count',
          id: 'growth',
          fact: 'infra.baseline',
          key: 'mappingGrowthSince2015',
          format: 'dec1',
          label: 'TIMES AS MANY SEGMENTS MAPPED NOW AS THEN',
          screen: { x: 0.64, y: 0.18 },
          size: 'xl',
          duration: 1800,
          tag: { source: 'OPENSTREETMAP · 2015 AND 2026', cls: 'DERIVED' },
        },
        {
          at: 2600,
          type: 'layer.filter',
          layer: 'roads',
          dim: 1,
          duration: 1400,
        },
        {
          at: 2600,
          type: 'camera.fly',
          to: 'district:gorkha',
          rangeKm: 300,
          pitch: -60,
          heading: -10,
          duration: 4400,
        },
      ],
    },
  ],
});

export const BLOCKAGES = defineScene({
  id: 'blockages',
  number: 22,
  act: 'IV',
  title: 'Road blockages',
  question: 'What do the blockage records measure?',
  explore: 11,
  runs: FULL,
  keep: ['outline', 'mask'],
  setup: [
    ...frame(0.58),
    {
      type: 'layer.show',
      layer: 'roads',
      majorOnly: true,
      centre: 'kathmandu',
    },
    {
      type: 'camera.fly',
      to: 'accessCentre',
      rangeKm: 500,
      pitch: -64,
      heading: 0,
    },
  ],
  beats: [
    {
      id: 'markers',
      caption:
        '{infra.geometry.features|int} BLOCKED-ROAD MARKERS · MEDIAN {infra.geometry.lengthMetres.median|int} M LONG',
      narration:
        'Blocked roads arrive as {infra.geometry.features|int} short markers. A median of {infra.geometry.lengthMetres.median|int} metres each.',
      minHoldMs: 500,
      actions: [
        {
          at: 0,
          type: 'layer.show',
          layer: 'blockages',
          plain: true,
          duration: 2600,
        },
        { at: 0, type: 'audio.cue', cue: 'hit' },
        {
          at: 300,
          type: 'camera.fly',
          to: 'kathmandu',
          rangeKm: 320,
          pitch: -60,
          heading: 8,
          duration: 5000,
        },
        data(
          'marker-card',
          [
            'NGA BLOCKED ROADS',
            '{infra.geometry.totalLengthKm|dec1} KM OF LINE IN TOTAL',
            'WHERE A ROAD WAS CUT · NOT HOW MUCH',
          ],
          NGA,
          1800,
        ),
      ],
    },
    {
      id: 'meaning',
      caption: 'A MARKER SAYS WHERE A ROAD WAS CUT, NOT HOW MUCH ROAD WAS LOST',
      narration:
        'Each one says where a road was cut. Not how much road was lost.',
      minHoldMs: 700,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'marker-card' },
        {
          at: 200,
          type: 'camera.fly',
          to: 'district:sindhupalchok',
          rangeKm: 200,
          pitch: -56,
          heading: -8,
          duration: 4600,
        },
        {
          at: 2600,
          type: 'layer.filter',
          layer: 'roads',
          dim: 0.6,
          duration: 1200,
        },
      ],
    },
  ],
});

export const LANDSLIDES = defineScene({
  id: 'landslides',
  number: 23,
  act: 'IV',
  title: 'Landslides',
  question: 'Were the blockages next to landslides?',
  explore: 11,
  runs: FULL,
  keep: ['outline', 'mask', 'roads'],
  setup: [
    ...frame(0.58),
    {
      type: 'layer.show',
      layer: 'roads',
      majorOnly: true,
      centre: 'kathmandu',
    },
    {
      type: 'camera.fly',
      to: 'district:sindhupalchok',
      rangeKm: 260,
      pitch: -60,
      heading: 0,
    },
  ],
  beats: [
    {
      id: 'slides',
      caption: 'MAPPED LANDSLIDES · AND THE BLOCKAGES BESIDE THEM',
      narration: 'Now the mapped landslides, and the blockages beside them.',
      minHoldMs: 500,
      actions: [
        {
          at: 0,
          type: 'layer.show',
          layer: 'fact-marks',
          id: 'slides',
          fact: 'infra.landslides',
          shape: 'diamond',
          colour: '#c9924f',
          size: 4,
          duration: 2200,
        },
        {
          at: 400,
          type: 'layer.show',
          layer: 'blockages',
          plain: true,
          duration: 2000,
        },
        {
          at: 300,
          type: 'camera.fly',
          to: 'district:sindhupalchok',
          rangeKm: 200,
          pitch: -56,
          heading: 10,
          duration: 5000,
        },
      ],
    },
    {
      id: 'association',
      caption:
        '{infra.association.features|int} BLOCKAGES WITHIN {infra.association.toleranceMetres|int} M OF A LANDSLIDE · ASSOCIATION, NOT CAUSE',
      narration:
        '{infra.association.features|int} blockages lie within {infra.association.toleranceMetres|int} metres of a landslide. A link in space. Neither product claims a cause.',
      minHoldMs: 700,
      actions: [
        { at: 0, type: 'audio.cue', cue: 'reveal' },
        {
          at: 300,
          type: 'metric.count',
          id: 'assoc',
          fact: 'infra.association',
          key: 'featureShare',
          format: 'pct1',
          label: 'OF BLOCKAGES NEAR A MAPPED LANDSLIDE',
          screen: { x: 0.64, y: 0.18 },
          size: 'xl',
          duration: 1600,
          tag: { source: 'NGA', cls: 'DERIVED' },
        },
        {
          at: 2400,
          type: 'camera.fly',
          to: 'district:sindhupalchok',
          rangeKm: 240,
          pitch: -60,
          heading: -6,
          duration: 4200,
        },
      ],
    },
  ],
});

export const BRIDGES = defineScene({
  id: 'bridges',
  number: 24,
  act: 'IV',
  title: 'Bridges',
  question: 'Where were bridges lost?',
  explore: 11,
  runs: FULL,
  keep: ['outline', 'mask', 'roads'],
  setup: [
    ...frame(0.58),
    {
      type: 'layer.show',
      layer: 'roads',
      majorOnly: true,
      centre: 'kathmandu',
    },
    {
      type: 'camera.fly',
      to: 'accessCentre',
      rangeKm: 520,
      pitch: -64,
      heading: 0,
    },
  ],
  beats: [
    {
      id: 'out',
      caption:
        'BRIDGES OBSERVED OUT · THE FIRST IN {infra.bridges.0.district|upper}',
      narration: 'A handful of bridges were observed out, east of Kathmandu.',
      minHoldMs: 500,
      actions: [
        {
          at: 0,
          type: 'layer.show',
          layer: 'fact-marks',
          id: 'bridges-out',
          fact: 'infra.bridges',
          shape: 'x',
          colour: '#ff3d6e',
          size: 6,
          halo: true,
          duration: 1800,
        },
        { at: 0, type: 'audio.cue', cue: 'hit' },
        {
          at: 300,
          type: 'camera.fly',
          to: { fact: 'infra.bridges', path: [1] },
          rangeKm: 260,
          pitch: -58,
          heading: 8,
          duration: 5000,
        },
      ],
    },
    {
      id: 'one',
      caption:
        'IN {infra.bridges.1.district|upper}: OBSERVED OUT ON {infra.bridges.1.sensedOn|dateShort}',
      narration:
        'This one, in {infra.bridges.1.district}, was seen out on {infra.bridges.1.sensedOn|dateLong}. It matters later.',
      minHoldMs: 600,
      actions: [
        {
          at: 0,
          type: 'annotation.draw',
          kind: 'pulse',
          id: 'bridge-pulse',
          anchor: { fact: 'infra.bridges', path: [1] },
          colour: '#ff3d6e',
          maxPx: 60,
          count: 3,
        },
        {
          at: 300,
          type: 'camera.fly',
          to: { fact: 'infra.bridges', path: [1] },
          rangeKm: 80,
          pitch: -54,
          heading: -10,
          duration: 4000,
        },
        {
          at: 2400,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'bridge-callout',
          anchor: { fact: 'infra.bridges', path: [1] },
          title: 'BRIDGE OUT',
          lines: [
            '{infra.bridges.1.district|upper}',
            'OBSERVED {infra.bridges.1.sensedOn|dateShort} · MMI {infra.bridges.1.mmi|dec1}',
          ],
          tag: NGA,
          dx: 150,
          dy: -80,
        },
      ],
    },
  ],
});

/* ------------------------------------------------------------------ Act V */

export const FACILITY_DATA = defineScene({
  id: 'facility-data',
  number: 27,
  act: 'V',
  title: 'Health facility data',
  question: 'What health facilities existed?',
  explore: 13,
  runs: FULL,
  keep: ['outline', 'mask'],
  setup: [
    ...frame(0.55),
    {
      type: 'camera.fly',
      to: 'accessCentre',
      rangeKm: 600,
      pitch: -70,
      heading: 0,
    },
  ],
  beats: [
    {
      id: 'list',
      caption:
        'THE GOVERNMENT LIST, COMPILED {access.lists.codCompiled|dateShort} · THE LATEST OPENLY AVAILABLE',
      narration:
        'The latest official list of health facilities openly available dates from {access.lists.codCompiled|dateLong}. It is used, and labelled, as exactly that.',
      minHoldMs: 500,
      actions: [
        { at: 0, type: 'audio.cue', cue: 'reveal' },
        data(
          'cod-card',
          [
            'HEALTH FACILITIES · DOHS / WHO',
            'COMPILED BY {access.lists.codCompiled|dateShort}',
            'HDX DATES IT LATER; ITS OWN FILE SAYS OTHERWISE',
          ],
          COD,
          300,
        ),
        {
          at: 1200,
          type: 'chart.enter',
          chart: 'bars',
          id: 'tier-bars',
          title: 'FACILITIES IN THE ANALYSIS AREA, BY TIER',
          colour: '#e8f5ef',
          screen: { x: 0.03, y: 0.58 },
          rowsFrom: {
            fact: 'access.lists',
            path: ['codClinicalByTier'],
            label: 'key',
            value: 'value',
          },
        },
        { at: 1300, type: 'chart.update', id: 'tier-bars', op: 'revealAll' },
        {
          at: 300,
          type: 'camera.fly',
          to: 'accessCentre',
          rangeKm: 540,
          pitch: -66,
          heading: 6,
          duration: 5400,
        },
      ],
    },
    {
      id: 'no-capacity',
      caption:
        'A TYPE FOR EACH · NO BEDS, STAFF OR CAPACITY · NONE IS INVENTED',
      narration:
        'Each entry has a type and a place. No beds, no staff, no capacity. None is invented here.',
      minHoldMs: 700,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'cod-card' },
        { at: 0, type: 'layer.show', layer: 'hospitals', duration: 2400 },
        {
          at: 300,
          type: 'camera.fly',
          to: 'kathmandu',
          rangeKm: 320,
          pitch: -60,
          heading: -6,
          duration: 4800,
        },
      ],
    },
  ],
});

export const FACILITY_MAP = defineScene({
  id: 'facility-map',
  number: 28,
  act: 'V',
  title: 'Facility map',
  question: 'Could the listed hospitals be reached by mapped road at all?',
  explore: 13,
  runs: FULL,
  keep: ['outline', 'mask', 'hospitals'],
  setup: [
    ...frame(0.55),
    { type: 'layer.show', layer: 'hospitals' },
    {
      type: 'camera.fly',
      to: 'accessCentre',
      rangeKm: 540,
      pitch: -66,
      heading: 0,
    },
  ],
  beats: [
    {
      id: 'off-network',
      caption:
        '{access.lists.offNetwork.codHospitals|int} OF {access.lists.codHospitals|int} LISTED HOSPITALS: OVER {access.params.facilitySnapMetres|kmFromMetres} FROM ANY MAPPED ROAD',
      narration:
        '{access.lists.offNetwork.codHospitals|int} of the {access.lists.codHospitals|int} listed hospitals here are more than {access.params.facilitySnapMetres|kmWordsFromMetres} from any mapped road.',
      minHoldMs: 600,
      actions: [
        {
          at: 0,
          type: 'layer.show',
          layer: 'roads',
          centre: 'kathmandu',
          duration: 3000,
        },
        { at: 0, type: 'audio.cue', cue: 'trace' },
        {
          at: 300,
          type: 'camera.fly',
          to: 'accessCentre',
          rangeKm: 480,
          pitch: -62,
          heading: 8,
          duration: 5000,
        },
        {
          at: 800,
          type: 'metric.count',
          id: 'off-net',
          fact: 'access.lists',
          key: 'offNetwork',
          subKey: 'codHospitals',
          format: 'int',
          label: 'LISTED HOSPITALS OFF THE MAPPED NETWORK',
          screen: { x: 0.64, y: 0.18 },
          size: 'xl',
          duration: 1400,
          tag: DERIVED,
        },
      ],
    },
    {
      id: 'grey',
      caption: 'GREY CROSSES: HOSPITALS THE ROUTING CANNOT REACH',
      narration:
        'They are drawn grey. The routing cannot reach them. That says as much about the map as about the hospitals.',
      minHoldMs: 700,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'off-net' },
        {
          at: 0,
          type: 'layer.filter',
          layer: 'roads',
          dim: 0.5,
          duration: 1000,
        },
        {
          at: 200,
          type: 'camera.fly',
          to: 'district:gorkha',
          rangeKm: 300,
          pitch: -58,
          heading: -10,
          duration: 4800,
        },
      ],
    },
  ],
});

export const PRESSURE = defineScene({
  id: 'pressure',
  number: 31,
  act: 'V',
  title: 'Rescue access pressure',
  question: 'Which places combine high need with poor modelled access?',
  explore: 13,
  runs: FULL,
  keep: ['outline', 'mask'],
  setup: [
    ...frame(0.55),
    { type: 'layer.show', layer: 'districts' },
    {
      type: 'camera.fly',
      to: 'accessCentre',
      rangeKm: 600,
      pitch: -70,
      heading: 0,
    },
  ],
  beats: [
    {
      id: 'question',
      caption: 'WHICH DISTRICTS COMBINE HIGH NEED WITH POOR ROAD ACCESS?',
      narration:
        'Which districts combine the most people in strong shaking, the longest distances, and the most disrupted access?',
      minHoldMs: 400,
      actions: [
        {
          at: 0,
          type: 'question.show',
          text: 'WHICH DISTRICTS COMBINE HIGH NEED WITH POOR ROAD ACCESS?',
          duration: 2600,
          holdMs: 900,
        },
        { at: 0, type: 'audio.cue', cue: 'hit' },
        {
          at: 400,
          type: 'camera.fly',
          to: 'accessCentre',
          rangeKm: 540,
          pitch: -64,
          heading: 6,
          duration: 5200,
        },
      ],
    },
    {
      id: 'pareto',
      caption: 'THE PARETO SET: {access.pareto|list}',
      narration:
        '{access.pareto.length|int} districts are beaten on all three by no other. No weighting needed.',
      minHoldMs: 600,
      actions: [
        {
          at: 0,
          type: 'layer.show',
          layer: 'district-focus',
          keysFrom: { fact: 'access.pareto' },
          colour: '#ffb020',
          duration: 2400,
        },
        { at: 0, type: 'audio.cue', cue: 'reveal' },
        data(
          'pareto-card',
          [
            'PARETO SET · NO WEIGHTS',
            '{access.pareto|list}',
            'NOT A PRIORITY LIST',
          ],
          DERIVED,
          900,
        ),
      ],
    },
    {
      id: 'weights',
      caption:
        'IN THE TOP {access.pressure.weighting.top|int} UNDER EVERY WEIGHTING: {access.stableTop|list}',
      narration:
        'Weight the measures four ways. Only {access.stableTop|names} stay in the top {access.pressure.weighting.top|int} every time.',
      minHoldMs: 900,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'pareto-card' },
        {
          at: 300,
          type: 'chart.enter',
          chart: 'ranks',
          id: 'ranks',
          title: 'RANK UNDER FOUR WEIGHTINGS',
          limit: 12,
          screen: { x: 0.03, y: 0.36 },
        },
        { at: 400, type: 'chart.update', id: 'ranks', op: 'revealAll' },
        /* As the names are said, the map lights them. */
        {
          at: 2200,
          type: 'layer.show',
          layer: 'district-focus',
          keysFrom: { fact: 'access.stableTop' },
          colour: '#ffb020',
          duration: 1600,
        },
        {
          at: 400,
          type: 'camera.fly',
          to: 'district:sindhuli',
          rangeKm: 320,
          pitch: -60,
          heading: 10,
          duration: 5200,
        },
      ],
    },
  ],
});

export const BRIDGE_WHAT_IF = defineScene({
  id: 'bridge-what-if',
  number: 33,
  act: 'V',
  title: 'Bridge failure what-if',
  question: 'What does one bridge carry?',
  explore: 14,
  runs: FULL,
  keep: ['outline', 'mask'],
  setup: [
    ...frame(0.55),
    { type: 'layer.show', layer: 'roads', centre: 'kathmandu' },
    { type: 'layer.show', layer: 'hospitals' },
    {
      type: 'camera.fly',
      to: { fact: 'infra.bridges', path: [1] },
      rangeKm: 220,
      pitch: -60,
      heading: 0,
    },
  ],
  beats: [
    {
      id: 'alone',
      caption:
        'THAT BRIDGE ALONE: {access.bridges.1.peopleCut|int} PEOPLE LOSE EVERY MAPPED ROAD TO A HOSPITAL',
      narration:
        'Remove only that bridge, and {access.bridges.1.peopleCut|int} people lose every mapped road to a hospital.',
      minHoldMs: 600,
      actions: [
        {
          at: 0,
          type: 'layer.show',
          layer: 'fact-marks',
          id: 'bridges-out',
          fact: 'infra.bridges',
          shape: 'x',
          colour: '#ff3d6e',
          size: 6,
          halo: true,
          duration: 1200,
        },
        {
          at: 0,
          type: 'annotation.draw',
          kind: 'pulse',
          id: 'bridge-pulse',
          anchor: { fact: 'access.bridges', path: [1] },
          colour: '#ff3d6e',
          maxPx: 70,
          count: 3,
        },
        {
          at: 300,
          type: 'camera.fly',
          to: { fact: 'access.bridges', path: [1] },
          rangeKm: 120,
          pitch: -56,
          heading: 8,
          duration: 4600,
        },
        {
          at: 1600,
          type: 'metric.count',
          id: 'bridge-cut',
          fact: 'access.bridges',
          key: 1,
          subKey: 'peopleCut',
          format: 'int',
          label: 'PEOPLE CUT OFF BY ONE BRIDGE · SCENARIO',
          screen: { x: 0.64, y: 0.18 },
          size: 'xl',
          duration: 1800,
          tag: SCENARIO,
        },
      ],
    },
    {
      id: 'another',
      caption:
        'ANOTHER BRIDGE: {access.bridges.4.peopleLonger|int} PEOPLE FACE A LONGER ROUTE',
      narration:
        'Another bridge sends {access.bridges.4.peopleLonger|int} people the long way round.',
      minHoldMs: 700,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'bridge-cut' },
        {
          at: 200,
          type: 'camera.fly',
          to: { fact: 'access.bridges', path: [4] },
          rangeKm: 120,
          pitch: -56,
          heading: -10,
          duration: 4600,
        },
        {
          at: 2400,
          type: 'annotation.draw',
          kind: 'pulse',
          id: 'bridge-pulse-2',
          anchor: { fact: 'access.bridges', path: [4] },
          colour: '#ffb020',
          maxPx: 60,
          count: 2,
        },
        data(
          'bridge-card',
          [
            'ONE EDGE AT A TIME',
            'EVERY OTHER ROAD LEFT OPEN',
            'A WHAT-IF, NOT A RECORD',
          ],
          SCENARIO,
          2600,
        ),
      ],
    },
  ],
});

export const LANDING_PLACES = defineScene({
  id: 'landing-places',
  number: 34,
  act: 'V',
  title: 'Airfields and helipads',
  question: 'Where could aircraft land?',
  explore: 13,
  runs: FULL,
  keep: ['outline', 'mask'],
  setup: [
    ...frame(0.55),
    {
      type: 'layer.show',
      layer: 'roads',
      majorOnly: true,
      centre: 'kathmandu',
    },
    {
      type: 'camera.fly',
      to: 'accessCentre',
      rangeKm: 600,
      pitch: -70,
      heading: 0,
    },
  ],
  beats: [
    {
      id: 'mapped',
      caption:
        '{access.airfields.aerodromeCount|int} AIRFIELDS AND {access.airfields.helipadCount|int} HELIPADS WERE ON THE MAP',
      narration:
        'Where roads failed, aircraft were the other way in. {access.airfields.aerodromeCount|int} airfields and {access.airfields.helipadCount|int} helipads were on the map.',
      minHoldMs: 500,
      actions: [
        {
          at: 0,
          type: 'layer.show',
          layer: 'fact-marks',
          id: 'aerodromes',
          fact: 'access.airfields',
          path: ['aerodromes'],
          shape: 'diamond',
          colour: '#7fdcff',
          size: 6,
          halo: true,
          duration: 1800,
        },
        {
          at: 900,
          type: 'layer.show',
          layer: 'fact-marks',
          id: 'helipads',
          fact: 'access.airfields',
          path: ['helipads'],
          shape: 'dot',
          colour: '#e8f5ef',
          size: 3,
          duration: 1800,
        },
        {
          at: 300,
          type: 'camera.fly',
          to: 'accessCentre',
          rangeKm: 540,
          pitch: -64,
          heading: 6,
          duration: 5200,
        },
      ],
    },
    {
      id: 'not-use',
      caption: 'PLACES AN AIRCRAFT COULD LAND · NOT A RECORD OF ANY FLIGHT',
      narration: 'Places an aircraft could land. Not a record of any flight.',
      minHoldMs: 700,
      actions: [
        { at: 0, type: 'audio.cue', cue: 'reveal' },
        {
          at: 200,
          type: 'camera.fly',
          to: 'district:gorkha',
          rangeKm: 320,
          pitch: -60,
          heading: -10,
          duration: 4800,
        },
        data(
          'air-card',
          [
            'LANDING PLACES · OPENSTREETMAP',
            'AS MAPPED {access.airfields.instant|dateShort}',
            'NO FLIGHTS, AIRCRAFT OR CAPACITY INFERRED',
          ],
          OSM,
          600,
        ),
      ],
    },
  ],
});

/* ------------------------------------------------------------------ Act VI */

export const FOUR_CLOCKS = defineScene({
  id: 'four-clocks',
  number: 35,
  act: 'VI',
  title: 'Four clocks',
  question: 'When did we know what we know?',
  explore: 16,
  runs: FULL,
  keep: ['outline', 'mask'],
  setup: [
    ...frame(0.6),
    {
      type: 'camera.fly',
      to: 'damageCentre',
      rangeKm: 420,
      pitch: -66,
      heading: 0,
    },
  ],
  beats: [
    {
      id: 'clocks',
      caption: 'FOUR CLOCKS: SHAKING · IMAGE · MAPPING · PUBLICATION',
      narration:
        'Every observation has four clocks. When the ground shook. When a satellite looked. When an analyst mapped it. When it was published.',
      minHoldMs: 500,
      actions: [
        { at: 0, type: 'layer.show', layer: 'damage', duration: 1600 },
        { at: 0, type: 'audio.cue', cue: 'tick' },
        {
          at: 300,
          type: 'camera.fly',
          to: 'damageCentre',
          rangeKm: 380,
          pitch: -62,
          heading: 6,
          duration: 5200,
        },
        {
          at: 600,
          type: 'chart.enter',
          chart: 'bars',
          id: 'lag-bars',
          title: 'MEDIAN DAYS · EACH STEP',
          colour: '#f4d35e',
          screen: { x: 0.03, y: 0.58 },
          rowsFrom: {
            fact: 'damage.lags',
            label: 'key',
            value: 'value.median',
            labels: {
              eventToAcquisition: 'QUAKE → IMAGE',
              acquisitionToProduction: 'IMAGE → MAP',
              productionToPublication: 'MAP → PUBLISHED',
              eventToPublication: 'QUAKE → PUBLISHED',
            },
          },
        },
        { at: 700, type: 'chart.update', id: 'lag-bars', op: 'revealAll' },
      ],
    },
    {
      id: 'twelve',
      caption:
        'LAYERS PUBLISHED A MEDIAN {damage.lags.eventToPublication.median|int} DAYS AFTER THE EARTHQUAKE',
      narration:
        'These layers were published a median of {damage.lags.eventToPublication.median|int} days after the earthquake. A response runs on the clock of its data.',
      minHoldMs: 800,
      actions: [
        { at: 0, type: 'chart.update', id: 'lag-bars', op: 'focus', index: 3 },
        {
          at: 300,
          type: 'camera.fly',
          to: 'kathmandu',
          rangeKm: 260,
          pitch: -58,
          heading: -8,
          duration: 4800,
        },
        data(
          'clock-card',
          [
            'EARTHQUAKE {damage.event.mainShock|dateShort}',
            'IMAGES FROM DAY {damage.lags.eventToAcquisition.min|int}',
            'PUBLISHED BY DAY {damage.lags.eventToPublication.max|int}',
          ],
          { source: 'UNOSAT × NGA', cls: 'STATISTIC' },
          800,
        ),
      ],
    },
  ],
});

const byClass = (
  id,
  number,
  title,
  question,
  caption,
  narration,
  lines,
  tag,
  stops,
) =>
  defineScene({
    id,
    number,
    act: 'VI',
    title,
    question,
    explore: 17,
    runs: FULL,
    keep: ['outline', 'mask'],
    setup: [
      ...frame(0.6),
      {
        type: 'camera.fly',
        to: stops[0],
        rangeKm: 600,
        pitch: -70,
        heading: 0,
      },
    ],
    beats: [
      {
        id: 'statements',
        caption,
        narration,
        minHoldMs: 900,
        actions: [
          { at: 0, type: 'veil', opacity: 0.3, duration: 1400 },
          { at: 0, type: 'audio.cue', cue: 'reveal' },
          {
            at: 200,
            type: 'camera.fly',
            to: stops[0],
            rangeKm: 520,
            pitch: -64,
            heading: 6,
            duration: 4200,
          },
          conclusion(`${id}-card`, lines, tag, 500),
          {
            at: 4600,
            type: 'camera.fly',
            to: stops[1],
            rangeKm: 380,
            pitch: -60,
            heading: -6,
            duration: 4200,
          },
        ],
      },
    ],
  });

export const WHAT_WE_KNOW = byClass(
  'what-we-know',
  36,
  'What we know',
  'What was observed directly?',
  'OBSERVED · RECORDED BY AN INSTRUMENT OR AN ANALYST, NOT COMPUTED HERE',
  'What we know, because it was observed: the earthquake, the damage read from imagery, the blockages, and the second product’s grades.',
  [
    'OBSERVED',
    'M{quake.magnitude|dec1} · {quake.depthKm|dec1} KM DEEP · {seq.total|int} EVENTS',
    '{damage.total|int} DAMAGED SITES MAPPED FROM IMAGERY',
    '{access.matching.blockages|int} BLOCKAGES AND BRIDGES OUT',
    '{copernicus.totals.total|int} STRUCTURES GRADED BY COPERNICUS',
  ],
  { source: 'USGS · UNOSAT · NGA · COPERNICUS', cls: 'OBSERVED' },
  ['epicentre', 'damageCentre'],
);

export const WHAT_WE_INFER = byClass(
  'what-we-infer',
  37,
  'What we infer',
  'What was computed from the observations?',
  'DERIVED AND STATISTICAL · COMPUTED HERE, EACH WITH ITS METHOD',
  'What we infer, by computing from those observations. Each with its method and its caveat.',
  [
    'DERIVED · STATISTIC',
    '{exposure.mmi6|mega2} PEOPLE INSIDE MODELLED MMI VI+',
    'SHAKING ↔ DAMAGE: CRAMÉR’S V {damage.independence.cramersV|dec2}, SMALL',
    'HALF OF MAPPED SITES IN {damage.gridHalf.units|int} SQUARE KILOMETRES',
    '{coverage.unrecorded.people|mega2} PEOPLE WHERE NOTHING WAS RECORDED',
  ],
  { source: 'THIS ANALYSIS', cls: 'DERIVED' },
  ['shakeCentre', 'kathmandu'],
);

export const WHAT_WE_SIMULATE = byClass(
  'what-we-simulate',
  38,
  'What we simulate',
  'What is a scenario, not a record?',
  'SCENARIO · WHAT THE ROAD MAP IMPLIES IF EVERY OBSERVED BLOCKAGE HELD',
  'What we simulate, and only simulate: the road network with every observed blockage applied at once.',
  [
    'SCENARIO',
    '{access.hospital.byCategory.DISCONNECTED|int} LOSE EVERY MAPPED ROAD TO A HOSPITAL',
    '{access.detours.people|int} FACE A LONGER ROUTE · MEDIAN +{access.detours.medianExtraKm|dec1} KM',
    'ONE BRIDGE ALONE: {access.bridges.1.peopleCut|int} CUT OFF',
    'DISTANCE, NOT TIME · NO HOSPITAL CAPACITY',
  ],
  { source: 'OSM 2015 × DOHS 2010 × NGA', cls: 'SCENARIO' },
  ['accessCentre', 'district:sindhuli'],
);

export const FULL_ONLY = Object.freeze([
  ADMIN_GEOGRAPHY,
  SEQUENCE,
  POPULATION,
  EVIDENCE_ARRIVES,
  DESTROYED_AREAS,
  SEVERE_MODERATE,
  GORKHA,
  SECOND_SYSTEM,
  MAP_WAS_THIN,
  BLOCKAGES,
  LANDSLIDES,
  BRIDGES,
  FACILITY_DATA,
  FACILITY_MAP,
  PRESSURE,
  BRIDGE_WHAT_IF,
  LANDING_PLACES,
  FOUR_CLOCKS,
  WHAT_WE_KNOW,
  WHAT_WE_INFER,
  WHAT_WE_SIMULATE,
]);
