/**
 * ACT IV — INFRASTRUCTURE FAILURE (scenes 25 and 26).
 *
 * The Stage 5 result, on the main-road network as mapped the day before:
 * connectivity with the observed blockages applied, and a route from
 * Kathmandu to each district that had a destination on it. Act V then routes
 * on EVERY mapped road; the two are presented as two resolutions of the same
 * map, and the gap between them is itself a finding.
 */

import { RUNS, defineScene } from '../timeline.js';

const ALL = [RUNS.THREE, RUNS.SIX, RUNS.FULL];
const SIX_FULL = [RUNS.SIX, RUNS.FULL];

const OSM = { source: 'OPENSTREETMAP · 24 APR 2015', cls: 'OBSERVED' };
const SCENARIO = { source: 'OSM 2015 × NGA BLOCKAGES', cls: 'SCENARIO' };

const base = [
  { type: 'veil', opacity: 0.14 },
  { type: 'layer.show', layer: 'outline' },
  { type: 'layer.show', layer: 'mask', alpha: 0.58 },
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

export const MAIN_NETWORK = defineScene({
  id: 'main-network',
  number: 25,
  act: 'IV',
  title: 'Network before and after',
  question: 'What did the observed blockages do to the main roads?',
  technical:
    'Main roads: OpenStreetMap motorway to tertiary as mapped on {infra.baseline.instant|dateShort}, {infra.baseline.ways|int} ways. Connected pieces counted on the undirected graph before ({infra.baseline.components|int}) and after removing every edge an observed NGA blockage sits on ({infra.damaged.components|int}). SCENARIO: every blockage applied at once; clearance dates are unknown.',
  explore: 13,
  runs: SIX_FULL,
  keep: ['outline', 'mask', 'ktm'],
  setup: [
    ...base,
    {
      type: 'camera.fly',
      to: 'accessCentre',
      rangeKm: 560,
      pitch: -70,
      heading: 0,
    },
  ],
  beats: [
    {
      id: 'main-roads',
      caption:
        'MAIN ROADS AS MAPPED ON {infra.baseline.instant|dateShort} · {infra.baseline.ways|int} SEGMENTS',
      narration: 'The main roads, as mapped the day before.',
      runs: [RUNS.FULL],
      minHoldMs: 400,
      actions: [
        { at: 800, type: 'term.show', term: 'OSM' },
        {
          at: 0,
          type: 'layer.show',
          layer: 'roads',
          majorOnly: true,
          centre: 'kathmandu',
          radiusKm: 340,
          duration: 4000,
        },
        { at: 0, type: 'audio.cue', cue: 'trace' },
        {
          at: 300,
          type: 'camera.fly',
          to: 'accessCentre',
          rangeKm: 500,
          pitch: -64,
          heading: 6,
          duration: 5200,
        },
        {
          at: 1800,
          type: 'annotation.draw',
          kind: 'typed',
          id: 'main-card',
          duration: 1200,
          screen: { x: 0.64, y: 0.16 },
          className: 'brf-typed brf-typed--data',
          lines: [
            'MAIN ROADS · MOTORWAY TO TERTIARY',
            'OPENSTREETMAP · {infra.baseline.instant|dateShort}',
            '{infra.baseline.components|int} SEPARATE PIECES ALREADY',
          ],
          tag: OSM,
        },
      ],
    },
    {
      id: 'blocked',
      caption:
        '{access.matching.blockages|int} BLOCKAGES OBSERVED · {access.matching.stage5MajorNetworkMatched|int} ON A MAIN ROAD',
      narration:
        'In the days that followed, {access.matching.blockages|int} road blockages were observed. Only {access.matching.stage5MajorNetworkMatched|int} on a main road; most on minor roads and tracks.',
      minHoldMs: 500,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'main-card' },
        {
          at: 0,
          type: 'layer.show',
          layer: 'blockages',
          plain: true,
          duration: 2600,
        },
        { at: 0, type: 'audio.cue', cue: 'tick' },
        { at: 900, type: 'term.show', term: 'NGA' },
        {
          at: 300,
          type: 'camera.fly',
          to: 'kathmandu',
          rangeKm: 360,
          pitch: -60,
          heading: -8,
          duration: 4600,
        },
        {
          at: 2800,
          type: 'metric.count',
          id: 'on-main',
          fact: 'access.matching',
          key: 'stage5MajorNetworkMatched',
          format: 'int',
          label:
            'OF {access.matching.blockages|int} BLOCKAGES SIT ON A MAIN ROAD',
          screen: { x: 0.64, y: 0.18 },
          size: 'xl',
          duration: 1400,
          tag: { source: 'NGA × OSM 2015', cls: 'DERIVED' },
        },
        /* "Most were on minor roads and tracks": down to where the markers sit off the main roads. */
        {
          at: 4600,
          type: 'camera.fly',
          to: 'district:sindhupalchok',
          rangeKm: 170,
          pitch: -55,
          heading: 8,
          duration: 3000,
        },
      ],
    },
    {
      id: 'pieces',
      caption:
        'THE MAIN NETWORK SPLITS: {infra.baseline.components|int} PIECES BECOME {infra.damaged.components|int}',
      narration:
        'Take them out, and the main network splits: {infra.baseline.components|int} pieces become {infra.damaged.components|int}. Some places lost their main-road link to the rest.',
      minHoldMs: 600,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'on-main' },
        {
          at: 0,
          type: 'layer.filter',
          layer: 'roads',
          dim: 0.45,
          duration: 1400,
        },
        {
          at: 200,
          type: 'camera.fly',
          to: 'accessCentre',
          rangeKm: 500,
          pitch: -66,
          heading: 0,
          duration: 4200,
        },
        {
          at: 600,
          type: 'metric.count',
          id: 'pieces-count',
          fact: 'infra.damaged',
          key: 'components',
          format: 'int',
          label:
            'SEPARATE PIECES AFTER · {infra.baseline.components|int} BEFORE',
          screen: { x: 0.64, y: 0.18 },
          size: 'xl',
          duration: 1800,
          tag: SCENARIO,
        },
        { at: 1400, type: 'term.show', term: 'networkPieces' },
        {
          at: 3200,
          type: 'layer.filter',
          layer: 'roads',
          dim: 1,
          duration: 1200,
        },
      ],
    },
  ],
});

export const DISTRICT_ROUTES = defineScene({
  id: 'district-routes',
  number: 26,
  act: 'IV',
  title: 'Route reconstruction',
  question: 'Could Kathmandu still reach the districts by main road?',
  technical:
    'Shortest main-road path by length from Kathmandu to the nearest main-road node of each of {infra.routes.pairs|int} district centroids, before and after the blockages are removed from the graph. Outcomes: unchanged, a detour, or no main-road path even before.',
  explore: 14,
  runs: ALL,
  keep: ['outline', 'mask', 'ktm', 'roads'],
  setup: [
    ...base,
    {
      type: 'layer.show',
      layer: 'roads',
      majorOnly: true,
      centre: 'kathmandu',
    },
    {
      type: 'camera.fly',
      to: 'accessCentre',
      rangeKm: 560,
      pitch: -68,
      heading: 0,
    },
  ],
  beats: [
    {
      id: 'routes',
      caption:
        'A MAIN-ROAD ROUTE FROM KATHMANDU TO {infra.routes.pairs|int} DISTRICTS, TESTED',
      narration:
        'Test a main-road route from Kathmandu to each of {infra.routes.pairs|int} districts.',
      runs: SIX_FULL,
      minHoldMs: 400,
      actions: [
        { at: 0, type: 'layer.show', layer: 'district-routes', duration: 2600 },
        {
          at: 0,
          type: 'annotation.draw',
          kind: 'pulse',
          id: 'ktm-pulse',
          anchor: 'kathmandu',
          colour: '#3cf2a0',
          maxPx: 70,
          count: 2,
        },
        { at: 0, type: 'audio.cue', cue: 'reveal' },
        {
          at: 300,
          type: 'camera.fly',
          to: 'kathmandu',
          rangeKm: 520,
          pitch: -64,
          heading: 6,
          duration: 5000,
        },
        {
          at: 900,
          type: 'chart.enter',
          chart: 'legend',
          id: 'route-key',
          title: 'MAIN-ROAD ROUTE FROM KATHMANDU',
          tag: SCENARIO,
          screen: { x: 0.03, y: 0.6 },
          rows: [
            { colour: '#3cf2a0', label: 'UNCHANGED', sub: 'SAME ROUTE AFTER' },
            { colour: '#ffb020', label: 'DETOUR', sub: 'LONGER ROUTE AFTER' },
            {
              colour: '#9b8cff',
              label: 'NO ROUTE BEFORE',
              sub: 'NOT ON THE MAIN NETWORK',
            },
          ],
        },
        { at: 900, type: 'chart.update', id: 'route-key', op: 'revealAll' },
      ],
    },
    {
      id: 'outcomes',
      caption:
        '{infra.routes.outcomes.UNCHANGED|int} UNCHANGED · {infra.routes.outcomes.DETOUR|int} DETOUR · {infra.routes.outcomes.NOT_ROUTABLE_BASELINE|int} WITH NO MAIN-ROAD ROUTE EVEN BEFORE',
      narration:
        '{infra.routes.outcomes.UNCHANGED|int} unchanged, {infra.routes.outcomes.DETOUR|int} detour, and {infra.routes.outcomes.NOT_ROUTABLE_BASELINE|int} with no main-road route even before. The bigger gaps were older than the earthquake.',
      minHoldMs: 600,
      actions: [
        {
          at: 0,
          type: 'layer.filter',
          layer: 'district-routes',
          outcomes: ['NOT_ROUTABLE_BASELINE'],
        },
        { at: 0, type: 'audio.cue', cue: 'tick' },
        {
          at: 300,
          type: 'camera.fly',
          to: 'district:gorkha',
          rangeKm: 360,
          pitch: -60,
          heading: -10,
          duration: 4400,
        },
        {
          at: 3000,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'gorkha-route',
          anchor: 'district:gorkha',
          title: 'GORKHA',
          lines: [
            'NO MAIN-ROAD ROUTE FROM KATHMANDU',
            'BEFORE OR AFTER · ON THE 2015 MAP',
          ],
          tag: { source: 'OPENSTREETMAP · 24 APR 2015', cls: 'DATA GAP' },
          dx: 140,
          dy: -90,
          tone: 'caveat',
        },
        {
          at: 5600,
          type: 'layer.filter',
          layer: 'district-routes',
          outcomes: null,
        },
      ],
    },
    {
      id: 'detour',
      caption:
        'KATHMANDU → {infra.detour.district|upper}: {infra.detour.baselineKm|dec1} KM BECOMES {infra.detour.damagedKm|dec1} KM',
      narration:
        'The one detour, to {infra.detour.district}: {infra.detour.baselineKm|dec1} kilometres became {infra.detour.damagedKm|dec1}.',
      runs: [RUNS.FULL],
      minHoldMs: 500,
      actions: [
        { at: 0, type: 'annotation.remove', id: 'gorkha-route' },
        {
          at: 0,
          type: 'layer.filter',
          layer: 'district-routes',
          outcomes: ['DETOUR'],
        },
        {
          at: 200,
          type: 'camera.fly',
          to: 'district:nuwakot',
          rangeKm: 260,
          pitch: -60,
          heading: 8,
          duration: 3800,
        },
        {
          at: 2600,
          type: 'annotation.draw',
          kind: 'callout',
          id: 'detour-callout',
          anchor: 'district:nuwakot',
          title: '+{infra.detour.extraKm|dec1} KM',
          lines: [
            '{infra.detour.extraShare|dec1} % LONGER',
            'MAIN ROADS ONLY · SCENARIO',
          ],
          tag: SCENARIO,
          dx: 150,
          dy: -80,
        },
      ],
    },
  ],
});

export const ACT4 = Object.freeze([MAIN_NETWORK, DISTRICT_ROUTES]);
