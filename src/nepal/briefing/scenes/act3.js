/**
 * ACT III — PHYSICAL DAMAGE (vertical-slice scenes 13 and 18).
 */

import { RUNS, defineScene } from '../timeline.js';

const ALL = [RUNS.THREE, RUNS.SIX, RUNS.FULL];
const SIX_FULL = [RUNS.SIX, RUNS.FULL];
const UNOSAT = { source: 'UNOSAT', cls: 'OBSERVED' };
const STAT = { source: 'UNOSAT × USGS SHAKEMAP', cls: 'STATISTIC' };

/* Place names, so a cluster of dots is somewhere. */
const districtLabel = (key, text) => ({
  type: 'annotation.draw',
  kind: 'label',
  id: `d-${key}`,
  anchor: `district:${key}`,
  text,
  size: 'district',
});

const damageBase = [
  { type: 'veil', opacity: 0.1 },
  { type: 'layer.show', layer: 'outline', colour: '#3cf2a0' },
  { type: 'layer.show', layer: 'mask', alpha: 0.55 },
  districtLabel('gorkha', 'GORKHA'),
  districtLabel('dhading', 'DHADING'),
  districtLabel('lamjung', 'LAMJUNG'),
  districtLabel('nuwakot', 'NUWAKOT'),
  districtLabel('chitawan', 'CHITWAN'),
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

export const COMPOSITION = defineScene({
  id: 'damage-composition',
  number: 13,
  act: 'III',
  title: 'Damage composition',
  question: 'How severe was the observed damage?',
  technical:
    'UNOSAT point records of damaged structures in four classes, read from post-event imagery and not field-validated at publication. Shares are of the {damage.total|int} mapped sites: the record lists no undamaged buildings, so they are not shares of all buildings.',
  explore: 8,
  runs: ALL,
  setup: [
    ...damageBase,
    {
      type: 'camera.fly',
      to: 'damageCentre',
      rangeKm: 330,
      pitch: -62,
      heading: 0,
    },
    { type: 'layer.show', layer: 'damage' },
    { type: 'layer.filter', layer: 'damage', classes: [], dim: 0.22 },
  ],
  beats: [
    {
      id: 'destroyed',
      caption:
        '{damage.destroyed|int} OF {damage.total|int} MAPPED SITES: DESTROYED',
      narration:
        'UNOSAT mapped damage from satellite images: {damage.total|int} sites. {damage.destroyed|int} classed as destroyed.',
      minHoldMs: 500,
      actions: [
        {
          at: 0,
          type: 'chart.enter',
          chart: 'composition',
          id: 'composition',
          screen: { x: 0.03, y: 0.66 },
        },
        {
          at: 300,
          type: 'chart.update',
          id: 'composition',
          op: 'reveal',
          index: 0,
          duration: 1600,
        },
        {
          at: 300,
          type: 'layer.filter',
          layer: 'damage',
          classes: [0],
          dim: 0.1,
          duration: 900,
        },
        {
          at: 400,
          type: 'camera.fly',
          to: 'damageCentre',
          rangeKm: 300,
          pitch: -60,
          heading: 6,
          duration: 5200,
        },
        /* The first damage the briefing shows: one of the score's six moments. */
        { at: 1900, type: 'audio.cue', cue: 'damage' },
        { at: 600, type: 'term.show', term: 'UNOSAT' },
        {
          at: 2300,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'manbu',
          anchor: 'area:Manbu Area',
          title: 'MANBU AREA',
          lines: ['LARGEST CLUSTER · {damage.areaManbu|int} SITES'],
          tag: UNOSAT,
          dx: -210,
          dy: -80,
        },
      ],
    },
    {
      id: 'severe',
      caption:
        '{damage.severe|int} SEVERE · {damage.moderate|int} MODERATE · {damage.possible|int} POSSIBLE',
      narration:
        '{damage.severe|int} severe. {damage.moderate|int} moderate. {damage.possible|int} possible.',
      runs: SIX_FULL,
      minHoldMs: 300,
      /* Each class lights as it is named (times from the rendered voice). */
      actions: [
        {
          at: 0,
          type: 'chart.update',
          id: 'composition',
          op: 'reveal',
          index: 1,
          duration: 1300,
        },
        {
          at: 0,
          type: 'layer.filter',
          layer: 'damage',
          classes: [1],
          dim: 0.1,
          duration: 700,
        },
        { at: 0, type: 'annotation.remove', id: 'manbu' },
        {
          at: 2400,
          type: 'chart.update',
          id: 'composition',
          op: 'reveal',
          index: 2,
          duration: 1100,
        },
        {
          at: 2400,
          type: 'layer.filter',
          layer: 'damage',
          classes: [2],
          dim: 0.1,
          duration: 600,
        },
        {
          at: 4300,
          type: 'chart.update',
          id: 'composition',
          op: 'reveal',
          index: 3,
          duration: 900,
        },
        {
          at: 4300,
          type: 'layer.filter',
          layer: 'damage',
          classes: [3],
          dim: 0.1,
          duration: 600,
        },
      ],
    },
    {
      id: 'together',
      kind: 'meaning',
      caption:
        'MOST MAPPED DAMAGE WAS THE WORST KIND · DESTROYED {damage.shareDestroyed|pct1} · SEVERE {damage.shareSevere|pct1}',
      narration:
        'So where analysts found damage, most of it was the worst kind.',
      minHoldMs: 900,
      actions: [
        { at: 0, type: 'chart.update', id: 'composition', op: 'revealAll' },
        {
          at: 0,
          type: 'layer.filter',
          layer: 'damage',
          classes: [0, 1, 2, 3],
          duration: 900,
        },
        { at: 300, type: 'chart.update', id: 'composition', op: 'total' },
        {
          at: 2200,
          type: 'chart.update',
          id: 'composition',
          op: 'verdict',
          text: 'SHARES OF MAPPED DAMAGE · NOT OF ALL BUILDINGS',
        },
        {
          at: 1200,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'caveat',
          anchor: 'area:Bhaktapur',
          title: 'DAMAGE-ONLY RECORD',
          lines: ['NO UNDAMAGED BUILDINGS RECORDED', 'NOT FIELD-VALIDATED'],
          tag: UNOSAT,
          dx: 120,
          dy: 70,
          tone: 'caveat',
        },
      ],
    },
  ],
});

export const MODEL_VS_OBSERVATION = defineScene({
  id: 'model-vs-observation',
  number: 18,
  act: 'III',
  title: 'Model versus observation',
  question: 'Did stronger shaking mean more severe damage?',
  technical:
    'Pearson χ² test of independence on the intensity-band × damage-class table of {damage.independence.total|int} sites: χ² = {damage.independence.statistic|dec1}, df = {damage.independence.df|int}, p = {damage.independence.p|sci}. Cramér’s V = √(χ² / (n·(k − 1))) = {damage.independence.cramersV|dec3}: a small effect. {damage.selectionWarning}',
  explore: 9,
  runs: ALL,
  setup: [
    ...damageBase,
    {
      type: 'camera.fly',
      to: 'damageCentre',
      rangeKm: 360,
      pitch: -64,
      heading: 0,
    },
  ],
  beats: [
    {
      id: 'question',
      caption: 'DID STRONGER SHAKING MEAN MORE SEVERE DAMAGE?',
      narration: 'Did stronger shaking mean worse damage?',
      minHoldMs: 300,
      actions: [
        {
          at: 0,
          type: 'question.show',
          text: 'DID STRONGER SHAKING MEAN MORE SEVERE DAMAGE?',
          duration: 2200,
          holdMs: 900,
        },
        { at: 0, type: 'audio.cue', cue: 'tick' },
        {
          at: 400,
          type: 'layer.show',
          layer: 'bands',
          minMmi: 7,
          duration: 3000,
        },
      ],
    },
    {
      id: 'overlay',
      caption: 'THREE MODELLED BANDS · AND THE DAMAGE OBSERVED INSIDE EACH',
      narration:
        'The three strongest modelled bands, and the damage observed inside each.',
      runs: SIX_FULL,
      minHoldMs: 300,
      actions: [
        { at: 0, type: 'layer.show', layer: 'damage', duration: 1400 },
        {
          at: 0,
          type: 'camera.fly',
          to: 'damageCentre',
          rangeKm: 320,
          pitch: -60,
          heading: 8,
          duration: 4800,
        },
        {
          at: 900,
          type: 'chart.enter',
          chart: 'intensity',
          id: 'intensity',
          screen: { x: 0.03, y: 0.5 },
        },
        { at: 1200, type: 'chart.update', id: 'intensity', op: 'grow' },
      ],
    },
    {
      id: 'shares',
      caption:
        'DESTROYED SHARE · MMI {damage.byIntensity.0.mmi} {damage.byIntensity.0.destroyedShare|pct1} · {damage.byIntensity.1.mmi} {damage.byIntensity.1.destroyedShare|pct1} · {damage.byIntensity.2.mmi} {damage.byIntensity.2.destroyedShare|pct1}',
      narration:
        'Watch the destroyed share. At intensity eight, {damage.byIntensity.2.destroyedShare|dec1} percent. At seven, {damage.byIntensity.0.destroyedShare|dec1}.',
      runs: SIX_FULL,
      minHoldMs: 400,
      actions: [
        { at: 0, type: 'chart.update', id: 'intensity', op: 'shares' },
        {
          at: 200,
          type: 'layer.filter',
          layer: 'damage',
          classes: [0],
          dim: 0.12,
          duration: 800,
        },
        { at: 1600, type: 'layer.filter', layer: 'bands', highlight: 8 },
        {
          at: 1600,
          type: 'chart.update',
          id: 'intensity',
          op: 'focus',
          mmi: 8,
        },
      ],
    },
    {
      id: 'statistic',
      caption:
        'DETECTABLE · BUT SMALL · CRAMÉR’S V = {damage.independence.cramersV|dec3}',
      narration:
        'The link is real. With this many sites, chance cannot explain it. But it is weak: Cramér’s V, {damage.independence.cramersV|dec2}.',
      minHoldMs: 700,
      actions: [
        {
          at: 0,
          type: 'chart.update',
          id: 'intensity',
          op: 'focus',
          mmi: null,
        },
        { at: 0, type: 'layer.filter', layer: 'bands', highlight: null },
        {
          at: 300,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'chi',
          duration: 1400,
          screen: { x: 0.62, y: 0.2 },
          className: 'brf-typed brf-typed--data',
          lines: [
            'INDEPENDENCE TEST · χ²',
            'χ² = {damage.independence.statistic|dec1} · DF {damage.independence.df|int}',
            'P = {damage.independence.p|sci} · FAR TOO SMALL TO BE CHANCE',
            'SO THE LINK IS REAL · NOT THAT IT IS STRONG',
          ],
        },
        {
          at: 2200,
          type: 'metric.count',
          id: 'cramer',
          fact: 'damage.independence',
          key: 'cramersV',
          format: 'dec3',
          label: 'CRAMÉR’S V · 0 = NO LINK, 1 = TOTAL · THIS IS SMALL',
          screen: { x: 0.62, y: 0.46 },
          size: 'xl',
          duration: 1600,
          tag: STAT,
        },
        /*
         * No term chip here: the chart, the test card and the counter fill the
         * frame. The two terms are explained where they are read instead — the
         * card says what the p-value means, the counter's label what V's scale
         * is — and in full in the technical layer and the glossary.
         */
        { at: 3600, type: 'audio.cue', cue: 'reveal' },
        /* The chart says it too, over the bars the statistic is about. */
        {
          at: 4000,
          type: 'chart.update',
          id: 'intensity',
          op: 'verdict',
          text: 'STATISTICALLY DETECTABLE · BUT A WEAK ASSOCIATION',
        },
      ],
    },
    {
      id: 'reversal',
      caption:
        'NOT A STRAIGHT LINE · AT MMI {damage.byIntensity.1.mmi} THE DESTROYED SHARE DROPS',
      narration:
        'And it is not a straight line. At seven and a half, the destroyed share drops, inside single areas too.',
      /* The three-minute run keeps the finding (real but weak) and leaves the nuance to the longer runs. */
      runs: SIX_FULL,
      minHoldMs: 600,
      actions: [
        { at: 0, type: 'layer.filter', layer: 'bands', highlight: 7.5 },
        /*
         * Manbu and Sundar Bazar lie west of the damage centre, under the chart
         * on the left: framed on Tanahu, both sit right of it with their callouts.
         */
        {
          at: 600,
          type: 'camera.fly',
          to: 'district:tanahu',
          rangeKm: 380,
          pitch: -60,
          heading: 0,
          duration: 4600,
        },
        { at: 0, type: 'chart.update', id: 'intensity', op: 'focus', mmi: 7.5 },
        /* The line through the destroyed shares, with the drop into 7.5 in red. */
        {
          at: 600,
          type: 'chart.update',
          id: 'intensity',
          op: 'trend',
          mmi: 7.5,
        },
        { at: 0, type: 'annotation.remove', id: 'chi' },
        {
          at: 2400,
          type: 'chart.update',
          id: 'intensity',
          op: 'verdict',
          text: 'NOT A STRAIGHT LINE · THE SHARE DROPS AT MMI {damage.byIntensity.1.mmi}',
        },
        /* The verdict and the caption carry the figure now; the callouts need the space. */
        { at: 0, type: 'annotation.remove', id: 'cramer' },
        {
          at: 1400,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'manbu-within',
          anchor: 'area:Manbu Area',
          title: 'MANBU AREA',
          lines: [
            'MMI {damage.manbu.bands.0.mmi|dec1}: {damage.manbu.bands.0.destroyedSharePercent|pct1} DESTROYED',
            'MMI {damage.manbu.bands.1.mmi|dec1}: {damage.manbu.bands.1.destroyedSharePercent|pct1} DESTROYED',
          ],
          tag: STAT,
          dx: 150,
          dy: -110,
          tone: 'caveat',
        },
        {
          at: 3400,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'sundar-within',
          anchor: 'area:Sundar Bazar',
          title: 'SUNDAR BAZAR',
          lines: [
            'MMI {damage.sundarBazar.bands.0.mmi|dec1}: {damage.sundarBazar.bands.0.destroyedSharePercent|pct1} DESTROYED',
            'MMI {damage.sundarBazar.bands.1.mmi|dec1}: {damage.sundarBazar.bands.1.destroyedSharePercent|pct1} DESTROYED',
          ],
          tag: STAT,
          /* Below and right of the place, clear of the Kathmandu label and its damage. */
          dx: 90,
          dy: 160,
          tone: 'caveat',
        },
      ],
    },
    {
      id: 'meaning',
      kind: 'meaning',
      caption:
        'SHAKING ALONE DOES NOT DECIDE THE DAMAGE · WHERE SATELLITES LOOKED SHAPES THE RECORD',
      narration:
        'So shaking alone does not decide the damage. Where the satellites looked shapes this record as much.',
      runs: SIX_FULL,
      minHoldMs: 900,
      actions: [
        {
          at: 0,
          type: 'chart.update',
          id: 'intensity',
          op: 'verdict',
          text: 'WHERE SATELLITES LOOKED MATTERS AS MUCH AS THE SHAKING',
        },
        {
          at: 600,
          type: 'layer.filter',
          layer: 'damage',
          classes: [0, 1, 2, 3],
          duration: 900,
        },
        {
          at: 600,
          type: 'camera.fly',
          to: 'district:tanahu',
          rangeKm: 340,
          pitch: -60,
          heading: 4,
          duration: 4200,
        },
        {
          at: 3200,
          type: 'chart.update',
          id: 'intensity',
          op: 'foot',
          text: 'SELECTION: BOTH PRODUCTS WERE TASKED WHERE DAMAGE WAS EXPECTED',
        },
        { at: 5200, type: 'layer.filter', layer: 'bands', highlight: null },
      ],
    },
    {
      id: 'hypotheses',
      kind: 'limit',
      caption:
        'BUILDING TYPE, GROUND, DISTANCE TO THE RUPTURE: LIKELY FACTORS · HYPOTHESES, NOT TESTED HERE',
      narration:
        'Building type, local ground and distance to the rupture probably matter too. Those are hypotheses. This data cannot test them: it has no building or soil records.',
      runs: [RUNS.FULL],
      minHoldMs: 700,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'manbu-within' },
        { at: 0, type: 'annotation.remove', id: 'sundar-within' },
        {
          at: 300,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'hypotheses-card',
          until: 'beat',
          duration: 1600,
          screen: { x: 0.6, y: 0.16 },
          className: 'brf-typed brf-typed--data',
          lines: [
            'MEASURED: A WEAK LINK, NOT A STRAIGHT LINE',
            'HYPOTHESIS: BUILDING TYPE',
            'HYPOTHESIS: LOCAL GROUND',
            'HYPOTHESIS: DISTANCE TO THE RUPTURE',
            'NOT IN THIS DATA: BUILDING OR SOIL RECORDS',
          ],
        },
        {
          at: 200,
          type: 'camera.fly',
          to: 'damageCentre',
          rangeKm: 380,
          pitch: -62,
          heading: 0,
          duration: 6000,
        },
      ],
    },
  ],
});

const GRID = { source: 'UNOSAT · 1 KM GRID', cls: 'STATISTIC' };
const GAP = { source: 'WORLDPOP × UNOSAT', cls: 'DATA GAP' };

export const CONCENTRATION = defineScene({
  id: 'damage-concentration',
  number: 16,
  act: 'III',
  title: 'Damage concentration',
  question: 'Was the mapped damage spread out, or piled up?',
  technical:
    'Sites binned to a {damage.grid1km.cellMetres|int} m grid: {damage.grid1km.occupiedCells|int} occupied cells. Ranked by count, {damage.gridHalf.units|int} cells hold half the sites and {damage.gridEighty.units|int} hold {damage.gridEighty.share|shareToPct}. Gini over occupied cells {damage.grid1km.concentration.gini|dec2}. This describes where damage was mapped, not where it occurred.',
  explore: 8,
  runs: SIX_FULL,
  keep: ['outline', 'mask'],
  setup: [
    ...damageBase,
    {
      type: 'camera.fly',
      to: 'damageCentre',
      rangeKm: 300,
      pitch: -60,
      heading: 0,
    },
  ],
  beats: [
    {
      id: 'grid',
      caption:
        'EVERY MAPPED SITE FITS IN {damage.grid1km.occupiedCells|int} SQUARE KILOMETRES',
      narration:
        'On a one-kilometre grid, every mapped site falls in just {damage.grid1km.occupiedCells|int} squares.',
      minHoldMs: 500,
      actions: [
        { at: 0, type: 'layer.show', layer: 'damage', duration: 900 },
        {
          at: 0,
          type: 'layer.filter',
          layer: 'damage',
          classes: [],
          dim: 0.25,
          duration: 900,
        },
        { at: 600, type: 'layer.show', layer: 'damage-grid', duration: 2600 },
        { at: 600, type: 'audio.cue', cue: 'reveal' },
        {
          at: 400,
          type: 'camera.fly',
          to: 'damageCentre',
          rangeKm: 260,
          pitch: -58,
          heading: 8,
          duration: 5000,
        },
        {
          at: 1600,
          type: 'metric.count',
          id: 'cells',
          fact: 'damage.grid1km',
          key: 'occupiedCells',
          format: 'int',
          label: 'SQUARE KILOMETRES WITH ANY MAPPED DAMAGE',
          screen: { x: 0.64, y: 0.18 },
          size: 'xl',
          duration: 2000,
          tag: GRID,
        },
      ],
    },
    {
      id: 'half',
      caption:
        'HALF OF ALL MAPPED SITES LIE IN {damage.gridHalf.units|int} OF THOSE SQUARES',
      narration:
        'Half of them lie in only {damage.gridHalf.units|int}. The mapped damage is piled up, not spread out.',
      minHoldMs: 600,
      actions: [
        {
          at: 0,
          type: 'layer.filter',
          layer: 'damage-grid',
          top: { fact: 'damage.gridHalf', path: ['units'] },
        },
        { at: 0, type: 'annotation.remove', id: 'cells' },
        { at: 0, type: 'audio.cue', cue: 'tick' },
        {
          at: 300,
          type: 'metric.count',
          id: 'half-cells',
          fact: 'damage.gridHalf',
          key: 'units',
          format: 'int',
          label: 'SQUARES HOLD HALF OF ALL MAPPED SITES',
          screen: { x: 0.64, y: 0.18 },
          size: 'xl',
          duration: 1600,
          tag: GRID,
        },
        {
          at: 2200,
          type: 'camera.fly',
          to: 'area:Bhaktapur',
          rangeKm: 110,
          pitch: -56,
          heading: -10,
          duration: 3600,
        },
        {
          at: 4400,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'busiest',
          anchor: 'area:Bhaktapur',
          title: 'THE BUSIEST SQUARES',
          lines: [
            'SANKHU AND BHAKTAPUR',
            '{damage.grid1km.concentration.maxCellCount|int} SITES IN THE BUSIEST ONE',
          ],
          tag: UNOSAT,
          dx: 150,
          dy: 70,
        },
      ],
    },
    {
      id: 'caveat',
      kind: 'limit',
      caption: 'CONCENTRATED WHERE ANALYSTS LOOKED · NOT A MAP OF ALL DAMAGE',
      narration:
        'But that is where analysts looked. It is not a map of all the damage.',
      runs: SIX_FULL,
      minHoldMs: 700,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'busiest' },
        { at: 0, type: 'annotation.remove', id: 'half-cells' },
        { at: 0, type: 'layer.filter', layer: 'damage-grid', top: null },
        {
          at: 200,
          type: 'camera.fly',
          to: 'damageCentre',
          rangeKm: 300,
          pitch: -60,
          heading: 0,
          duration: 4000,
        },
        {
          at: 900,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'grid-caveat',
          duration: 1600,
          screen: { x: 0.62, y: 0.16 },
          className: 'brf-typed brf-typed--data',
          lines: [
            'GINI OVER OCCUPIED SQUARES: {damage.grid1km.concentration.gini|dec2}',
            '{damage.gridEighty.share|shareToPct} OF SITES IN {damage.gridEighty.units|int} SQUARES',
            'NO RECORD OF WHERE NOTHING WAS FOUND',
          ],
          tag: GRID,
        },
        { at: 1200, type: 'term.show', term: 'gini' },
      ],
    },
  ],
});

export const COVERAGE_GAP = defineScene({
  id: 'coverage-gap',
  number: 20,
  act: 'III',
  title: 'Observation coverage failure',
  question: 'Where do we have no observation at all?',
  technical:
    'Universe: populated 1 km cells in {coverage.universe.districts|names}. Unrecorded: cells above the median population with no UNOSAT record — {coverage.unrecorded.cells|int} cells, {coverage.unrecorded.people|int} people (WorldPop). UNOSAT publishes no footprint of the areas it examined, so the absence of a record cannot be read as the absence of damage.',
  explore: 12,
  runs: ALL,
  /* The story turns here: the record's silence. The score turns with it. */
  music: 'gap',
  keep: ['outline', 'mask'],
  setup: [
    ...damageBase,
    { type: 'layer.show', layer: 'damage' },
    {
      type: 'camera.fly',
      to: 'kathmandu',
      rangeKm: 140,
      pitch: -58,
      heading: 0,
    },
  ],
  beats: [
    {
      id: 'unrecorded',
      caption:
        '{coverage.unrecorded.people|mega2} PEOPLE LIVED IN THE MORE POPULATED SQUARES WITH NO DAMAGE RECORD',
      narration:
        'Now the gap. {coverage.unrecorded.people|millionWords} people lived in the more populated squares of these districts, with no damage record at all.',
      minHoldMs: 500,
      actions: [
        { at: 0, type: 'audio.cue', cue: 'gap' },
        {
          at: 0,
          type: 'layer.show',
          layer: 'population',
          duration: 2600,
          ifAbsent: true,
        },
        {
          at: 0,
          type: 'layer.filter',
          layer: 'damage',
          classes: [0, 1, 2, 3],
          duration: 600,
        },
        {
          at: 300,
          type: 'camera.fly',
          to: { fact: 'coverage.unrecorded', path: ['examples', 0] },
          rangeKm: 60,
          pitch: -55,
          heading: 10,
          duration: 4600,
        },
        {
          at: 900,
          type: 'metric.count',
          id: 'unrecorded-count',
          fact: 'coverage.unrecorded',
          key: 'people',
          format: 'mega2',
          label: 'PEOPLE · ABOVE-MEDIAN SQUARES · NO DAMAGE RECORD',
          screen: { x: 0.64, y: 0.18 },
          size: 'xl',
          duration: 2200,
          tag: GAP,
        },
        {
          at: 3800,
          type: 'annotation.draw',
          kind: 'bracket',
          id: 'no-record',
          anchor: { fact: 'coverage.unrecorded', path: ['examples', 0] },
          size: 44,
        },
        {
          at: 4400,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'no-record-callout',
          anchor: { fact: 'coverage.unrecorded', path: ['examples', 0] },
          title:
            '{coverage.unrecorded.examples.0.people|int} PEOPLE · NO RECORD',
          lines: [
            '{coverage.unrecorded.examples.0.district|upper} · ONE SQUARE KILOMETRE',
          ],
          tag: GAP,
          dx: 150,
          dy: -90,
          tone: 'caveat',
        },
        /* The voice is still on the gap: close in on the empty square and mark it. */
        {
          at: 4800,
          type: 'camera.fly',
          to: { fact: 'coverage.unrecorded', path: ['examples', 0] },
          rangeKm: 46,
          pitch: -50,
          heading: 22,
          duration: 3000,
        },
        {
          at: 5600,
          type: 'annotation.draw',
          kind: 'pulse',
          id: 'no-record-pulse',
          anchor: { fact: 'coverage.unrecorded', path: ['examples', 0] },
          colour: '#ffb020',
          maxPx: 70,
          count: 3,
        },
      ],
    },
    {
      id: 'no-denominator',
      kind: 'meaning',
      caption:
        'NO RECORD IS NOT NO DAMAGE · THE PRODUCT LISTS ONLY WHAT IT FOUND',
      narration:
        'No record is not no damage. The product lists only what it found, not where it looked.',
      /* The sentence turns on one word; said a little slower. */
      prosody: { 0: { emphasis: ['is not'], rate: 0.95 } },
      minHoldMs: 700,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'unrecorded-count' },
        { at: 2000, type: 'term.show', term: 'DATA_GAP' },
        {
          at: 200,
          type: 'camera.fly',
          to: 'kathmandu',
          rangeKm: 120,
          pitch: -60,
          heading: -6,
          duration: 4400,
        },
        /* The square's callout goes before the card arrives: the pull-back slides it under the card. */
        { at: 500, type: 'annotation.remove', id: 'no-record-callout' },
        {
          at: 600,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'no-denominator-card',
          duration: 1800,
          screen: { x: 0.6, y: 0.16 },
          className: 'brf-typed brf-typed--alert',
          lines: [
            'A GAP, NOT AN ABSENCE',
            'UNOSAT RECORDS DAMAGED STRUCTURES ONLY',
            'NO EXAMINED-AREA FOOTPRINT IS PUBLISHED',
          ],
        },
      ],
    },
    /*
     * The one mid-run SO FAR: halfway, at the turn from what happened to
     * whether help could reach it. Three findings, then the next question.
     */
    {
      id: 'so-far',
      kind: 'sofar',
      caption:
        'STRONG SHAKING · CLUSTERED DAMAGE · A BLIND SPOT · NEXT: COULD HELP GET THROUGH?',
      narration:
        'So far: millions in strong shaking, damage in tight clusters, and a large blind spot. Next: could help still get through?',
      runs: [RUNS.SIX, RUNS.FULL],
      minHoldMs: 600,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'no-denominator-card' },
        { at: 0, type: 'annotation.remove', id: 'no-record-pulse' },
        {
          at: 200,
          type: 'camera.fly',
          to: 'damageCentre',
          rangeKm: 520,
          pitch: -66,
          heading: 0,
          duration: 5600,
        },
        {
          at: 400,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'so-far-card',
          until: 'beat',
          duration: 2400,
          screen: { x: 0.6, y: 0.16 },
          className: 'brf-typed brf-typed--recap',
          lines: [
            '{exposure.mmi6|mega2} PEOPLE IN STRONG SHAKING',
            'HALF THE MAPPED DAMAGE IN {damage.gridHalf.units|int} KM²',
            '{coverage.unrecorded.people|mega2} PEOPLE WITH NO DAMAGE RECORD',
            'NEXT · COULD HELP STILL GET THROUGH?',
          ],
        },
      ],
    },
  ],
});

export const ACT3 = Object.freeze([
  COMPOSITION,
  CONCENTRATION,
  MODEL_VS_OBSERVATION,
  COVERAGE_GAP,
]);
