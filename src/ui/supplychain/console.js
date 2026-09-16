/**
 * The supply-chain console.
 *
 * Left rail of §43: search/selection, results, WHAT IF, provenance. Mounts its
 * own DOM rather than expanding a template marker, so it adds no entries to the
 * `build/html` allowlist and can be removed without touching the inherited
 * shell.
 *
 * Design rules this panel is built to, all from the brief:
 *
 *  - Nothing renders without its data class. Every figure is adjacent to a
 *    badge, and the provenance section is always populated, never collapsed
 *    away by default when a caveat exists.
 *  - Aggregate partners ("Other Asia, nes") render in the INFERRED colour with
 *    their caveat one click away — never silently merged into the country list.
 *  - A missing value renders `DATA UNAVAILABLE` with what would be needed. It
 *    never renders as zero, a dash, or an empty cell.
 *  - The WHAT IF result is labelled SIMULATED and states that the scenario did
 *    not occur.
 */

import {
  COMMODITY_GROUPS,
  HS_HEADINGS,
} from '../../supplychain/reference/commodities.js';
import { COUNTRIES } from '../../supplychain/reference/countries.js';
import { CHOKEPOINTS } from '../../supplychain/reference/chokepoints.js';
import { MAJOR_PORTS } from '../../supplychain/reference/ports.js';
import {
  interpretArea,
  partitionPartners,
} from '../../supplychain/reference/areas.js';
import { buildFlows } from '../../supplychain/sources/tradeProxy.js';
import { linkEventsToNodes } from '../../supplychain/sources/gdacs.js';
import { haversineKm } from '../../supplychain/geo.js';
import {
  herfindahlIndex,
  concentrationRatio,
} from '../../supplychain/centrality.js';
import { forecast } from '../../supplychain/ml/forecast.js';
import { clusterCountries } from '../../supplychain/ml/cluster.js';
import {
  productionProxy,
  PRODUCTION_INDICATORS,
  classifyStructure,
  reportersAtRisk,
} from '../../supplychain/production.js';
import { detectAnomalies } from '../../supplychain/ml/anomaly.js';
import { AssociationClass } from '../../supplychain/provenance.js';
import {
  createGraph,
  createNode,
  createEdge,
  NodeType,
  EdgeType,
  TransportMode,
} from '../../supplychain/graph.js';
import { DataClass, createProvenance } from '../../supplychain/provenance.js';
import {
  closeNode,
  simulateDisruption,
  propagate,
  DisruptionKind,
} from '../../supplychain/disruption.js';
import {
  barChart,
  timeSeriesChart,
  beforeAfterChart,
  formatUsd,
  formatterForUnit,
} from './charts.js';

/** Years offered by the time machine. Comtrade lags, so the newest is not this year. */
const YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023];
const DEFAULT_YEAR = 2023;

/** Reporters offered in the selector, as [ISO3, label]. Limited to major traders. */
const FEATURED_REPORTERS = [
  'KOR',
  'CHN',
  'JPN',
  'USA',
  'DEU',
  'NLD',
  'VNM',
  'SGP',
  'IND',
  'GBR',
  'FRA',
  'ITA',
  'MYS',
  'THA',
  'MEX',
  'BRA',
  'AUS',
  'CAN',
  'ESP',
  'POL',
  'TUR',
  'IDN',
  'SAU',
  'ARE',
];

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== null && value !== undefined) {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.appendChild(
      typeof child === 'string' ? document.createTextNode(child) : child,
    );
  }
  return node;
}

/** Render a `DATA UNAVAILABLE` block from a dataGap-shaped value. */
function dataGapBlock(reason, needed) {
  return h('div', { class: 'sc-gap' }, [
    h('div', { class: 'sc-gap-label', text: '⚪ DATA UNAVAILABLE' }),
    h('div', { class: 'sc-gap-reason', text: reason }),
    needed
      ? h('div', { class: 'sc-gap-needed', text: `Would need: ${needed}` })
      : null,
  ]);
}

/** Render a provenance record as the §24 panel. */
function provenanceBlock(provenance, { open = false } = {}) {
  if (!provenance) return null;
  const details = h('details', { class: 'sc-prov' }, [
    h('summary', {}, [
      h('span', { class: 'sc-badge', text: provenance.badge }),
      h('span', { class: 'sc-prov-source', text: provenance.source }),
    ]),
    h('dl', { class: 'sc-prov-body' }, [
      h('dt', { text: 'Dataset' }),
      h('dd', { text: provenance.dataset }),
      h('dt', { text: 'Method' }),
      h('dd', { text: provenance.method }),
      h('dt', { text: 'Licence' }),
      h('dd', { text: provenance.license }),
      h('dt', { text: 'Retrieved' }),
      h('dd', { text: provenance.retrievedAt ?? 'n/a' }),
      h('dt', { text: 'Confidence' }),
      h('dd', {
        text: `${provenance.confidence.toFixed(2)} — ${provenance.confidenceBand} (a methodological label, not a probability)`,
      }),
      h('dt', { text: 'Limitations' }),
      h(
        'dd',
        {},
        h(
          'ul',
          { class: 'sc-prov-limits' },
          provenance.limitations.map((l) => h('li', { text: l })),
        ),
      ),
    ]),
  ]);
  if (open) details.open = true;
  return details;
}

/**
 * Build a routing graph from the chokepoints and the ports that matter for a
 * maritime scenario.
 *
 * Deliberately small and explicit. This is a DEMONSTRATION network for the
 * WHAT IF panel, not a derived global shipping graph — we do not have sailed
 * route data — and the panel says so.
 */
function buildScenarioGraph() {
  const provenance = createProvenance({
    dataClass: DataClass.INFERRED,
    source: 'Global Supply Chain Eye',
    dataset: 'scenario-network',
    license: 'MIT (this project); port positions NGA WPI (public domain)',
    method:
      'Ports from the World Port Index joined by authored maritime legs ' +
      'through the curated chokepoints. Leg distances are great-circle.',
    confidence: 0.5,
    limitations: [
      'A demonstration network of major ports and chokepoints, NOT a derived ' +
        'global shipping graph. Real routes follow traffic separation schemes ' +
        'and carrier service loops, which are not represented.',
      'Leg distances are great-circle and therefore lower bounds on distance ' +
        'actually sailed.',
    ],
  });

  const wanted = [
    ['BUSAN', 'KRPUS'],
    ['SHANGHAI', 'CNSGH'],
    ['SINGAPORE', 'SGKEP'],
    ['ROTTERDAM', 'NLRTM'],
  ];
  const nodes = [];
  const byKey = new Map();
  for (const [key, unlocode] of wanted) {
    const port = MAJOR_PORTS.find((p) => p.unlocode === unlocode);
    if (!port) continue;
    byKey.set(key, port);
    nodes.push(
      createNode({
        id: key,
        type: NodeType.PORT,
        name: port.name,
        position: { lat: port.lat, lon: port.lon },
        country: port.country,
        provenance,
      }),
    );
  }
  for (const point of CHOKEPOINTS) {
    nodes.push(
      createNode({
        id: point.id,
        type: NodeType.CHOKEPOINT,
        name: point.name,
        position: { lat: point.lat, lon: point.lon },
        provenance,
      }),
    );
  }

  const leg = (id, from, to) =>
    createEdge({
      id,
      from,
      to,
      type: EdgeType.MARITIME_ROUTE,
      mode: TransportMode.SEA,
      provenance,
    });

  const edges = [];
  if (byKey.has('BUSAN') && byKey.has('SINGAPORE')) {
    edges.push(leg('busan-sing', 'BUSAN', 'SINGAPORE'));
  }
  if (byKey.has('SHANGHAI') && byKey.has('SINGAPORE')) {
    edges.push(leg('shanghai-sing', 'SHANGHAI', 'SINGAPORE'));
  }
  if (byKey.has('SINGAPORE')) {
    edges.push(leg('sing-malacca', 'SINGAPORE', 'malacca'));
    edges.push(leg('malacca-bab', 'malacca', 'bab-el-mandeb'));
    edges.push(leg('bab-suez', 'bab-el-mandeb', 'suez'));
    edges.push(leg('sing-cape', 'SINGAPORE', 'cape-of-good-hope'));
  }
  if (byKey.has('ROTTERDAM')) {
    edges.push(leg('suez-rot', 'suez', 'ROTTERDAM'));
    edges.push(leg('cape-rot', 'cape-of-good-hope', 'ROTTERDAM'));
  }
  return { graph: createGraph({ nodes, edges }), provenance };
}

/**
 * Create the supply-chain console.
 *
 * @param {object} deps
 * @param {object} deps.source a tradeProxy source
 * @param {object} [deps.layers] { tradeFlows, chokepoints, ports }
 * @param {(target:{lat:number,lon:number,heightM?:number})=>void} [deps.flyTo]
 * @param {HTMLElement} [deps.container]
 * @returns {{element:HTMLElement, destroy:Function, setCommodity:Function, setReporter:Function, setYear:Function, run:Function, simulate:Function, getState:Function}}
 */
export function createSupplyChainConsole({
  source,
  layers = {},
  setLayerEnabled = null,
  flyTo = null,
  container = document.body,
} = {}) {
  if (!source?.getTradeFlows) {
    throw new TypeError('The supply-chain console requires a trade source');
  }

  /**
   * Whether this console may move the camera.
   *
   * The console flies to what it loads, which is the right behaviour when a
   * person clicks INVESTIGATE or a bar in a chart. It is the wrong behaviour
   * during an authored scene: the director owns the camera there, and a
   * console fly-to lands the shot somewhere its author did not frame. Measured:
   * the tour's Suez beat is authored at 700 km, and the scenario fly-to left it
   * at 2,500 km. The scene runner suspends this around each scripted call.
   */
  let cameraSuspended = false;
  const moveCamera = (target) => {
    if (cameraSuspended || !flyTo) return false;
    flyTo(target);
    return true;
  };

  const state = {
    commodity: 'semiconductors',
    reporter: 'KOR',
    flow: 'M',
    year: DEFAULT_YEAR,
    loading: false,
    result: null,
    series: null,
    scenario: null,
    production: null,
    comparison: null,
    events: null,
    compareSelection: null,
    error: null,
  };

  let inflight = null;
  const listeners = new Set();

  /* ---------------- DOM skeleton ---------------- */

  const resultsBody = h('div', { class: 'sc-body' });
  const productionBody = h('div', { class: 'sc-body' });
  const compareBody = h('div', { class: 'sc-body' });
  const eventsBody = h('div', { class: 'sc-body' });
  const whatIfBody = h('div', { class: 'sc-body' });
  const statusLine = h('div', { class: 'sc-status', text: 'Ready.' });

  const commoditySelect = h(
    'select',
    { class: 'sc-select', 'aria-label': 'Commodity' },
    COMMODITY_GROUPS.map((g) =>
      h('option', { value: g.key, text: `${g.label}` }),
    ),
  );
  commoditySelect.value = state.commodity;

  const reporterSelect = h(
    'select',
    { class: 'sc-select', 'aria-label': 'Reporting country' },
    FEATURED_REPORTERS.map((iso3) => {
      const country = COUNTRIES.find((c) => c.iso3 === iso3);
      return h('option', {
        value: iso3,
        text: country ? country.name : iso3,
      });
    }),
  );
  reporterSelect.value = state.reporter;

  const flowSelect = h(
    'select',
    { class: 'sc-select', 'aria-label': 'Direction' },
    [
      h('option', { value: 'M', text: 'Imports' }),
      h('option', { value: 'X', text: 'Exports' }),
    ],
  );
  flowSelect.value = state.flow;

  const yearInput = h('input', {
    type: 'range',
    class: 'sc-range',
    min: String(YEARS[0]),
    max: String(YEARS[YEARS.length - 1]),
    step: '1',
    value: String(state.year),
    'aria-label': 'Year',
  });
  const yearLabel = h('span', { class: 'sc-year', text: String(state.year) });

  const runButton = h('button', {
    class: 'sc-run',
    type: 'button',
    text: 'INVESTIGATE',
  });
  const seriesButton = h('button', {
    class: 'sc-secondary',
    type: 'button',
    text: 'LOAD 2015–2023 SERIES',
  });

  const panel = h(
    'aside',
    { class: 'sc-console', 'aria-label': 'Supply chain console' },
    [
      h('header', { class: 'sc-head' }, [
        h('div', { class: 'sc-title', text: 'GLOBAL SUPPLY CHAIN EYE' }),
        h('div', { class: 'sc-head-actions' }, [
          h('button', {
            class: 'sc-collapse',
            type: 'button',
            'aria-label': 'Collapse panel body',
            title: 'Collapse',
            text: '–',
            onClick: () => panel.classList.toggle('sc-collapsed'),
          }),
          h('button', {
            class: 'sc-collapse',
            type: 'button',
            'aria-label': 'Dismiss supply chain console',
            title: 'Dismiss',
            text: '×',
            onClick: () => setVisible(false),
          }),
        ]),
      ]),
      h('div', { class: 'sc-controls' }, [
        h('label', { class: 'sc-field' }, [
          h('span', { class: 'sc-field-label', text: 'COMMODITY' }),
          commoditySelect,
        ]),
        h('label', { class: 'sc-field' }, [
          h('span', { class: 'sc-field-label', text: 'COUNTRY' }),
          reporterSelect,
        ]),
        h('label', { class: 'sc-field' }, [
          h('span', { class: 'sc-field-label', text: 'DIRECTION' }),
          flowSelect,
        ]),
        h('label', { class: 'sc-field sc-field-time' }, [
          h('span', { class: 'sc-field-label' }, [
            'TIME MACHINE ',
            yearLabel,
            h('span', {
              class: 'sc-badge sc-badge-hist',
              text: '🔵 HISTORICAL',
            }),
          ]),
          yearInput,
        ]),
        h('div', { class: 'sc-actions' }, [runButton, seriesButton]),
        statusLine,
      ]),
      h('section', { class: 'sc-section' }, [
        h('h3', { class: 'sc-h3', text: 'TRADE DEPENDENCY' }),
        resultsBody,
      ]),
      h('section', { class: 'sc-section' }, [
        h('h3', { class: 'sc-h3', text: 'WHERE IS PRODUCTION?' }),
        productionBody,
      ]),
      h('section', { class: 'sc-section' }, [
        h('h3', { class: 'sc-h3', text: 'COMPARE COUNTRIES' }),
        compareBody,
      ]),
      h('section', { class: 'sc-section' }, [
        h('h3', { class: 'sc-h3', text: 'EVENTS AFFECTING SUPPLY CHAINS' }),
        eventsBody,
      ]),
      h('section', { class: 'sc-section' }, [
        h('h3', { class: 'sc-h3', text: 'WHAT IF?' }),
        whatIfBody,
      ]),
    ],
  );

  /* ---------------- rendering ---------------- */

  function notify() {
    for (const listener of listeners) listener(getState());
  }

  function setStatus(text, kind = '') {
    statusLine.textContent = text;
    statusLine.className = `sc-status ${kind}`;
  }

  function renderResults() {
    resultsBody.replaceChildren();
    if (state.error) {
      resultsBody.appendChild(
        dataGapBlock(state.error, 'A successful response from UN Comtrade'),
      );
      return;
    }
    if (!state.result) {
      resultsBody.appendChild(
        h('p', {
          class: 'sc-hint',
          text: 'Choose a commodity and country, then INVESTIGATE.',
        }),
      );
      return;
    }

    const { countries, aggregates, world, provenance, group, hs } =
      state.result;

    resultsBody.appendChild(
      h('p', { class: 'sc-caption' }, [
        h('strong', { text: `HS ${hs}` }),
        ` — ${HS_HEADINGS[hs] ?? group.label}`,
      ]),
    );

    // Ranked partners. Aggregates are shown inline but coloured as inferences.
    const ranked = [...countries, ...aggregates]
      .sort((a, b) => b.valueUsd - a.valueUsd)
      .slice(0, 10)
      .map((row) => {
        const area = interpretArea(row.partnerCode);
        return {
          label: area.name,
          value: row.valueUsd,
          accent:
            area.association === AssociationClass.VERIFIED
              ? 'var(--sc-verified)'
              : 'var(--sc-inferred)',
          note: area.caveat ?? 'Individually reported partner',
          area,
        };
      });

    resultsBody.appendChild(
      barChart({
        rows: ranked,
        onSelect: (row) => {
          if (!row.area) return;
          const country = COUNTRIES.find((c) => c.m49 === row.area.code);
          if (country) {
            moveCamera({
              lat: country.lat,
              lon: country.lon,
              heightM: 4_000_000,
            });
          }
          showPartnerDetail(row.area, row.value);
        },
      }),
    );

    // Any aggregate in the top ranks gets its caveat surfaced, not hidden.
    const flaggedAggregate = ranked.find((r) => r.area.isAggregate);
    if (flaggedAggregate) {
      resultsBody.appendChild(
        h('div', { class: 'sc-caveat' }, [
          h('div', { class: 'sc-caveat-head' }, [
            h('span', { class: 'sc-badge sc-badge-inf', text: '🟡 INFERRED' }),
            h('strong', { text: flaggedAggregate.area.name }),
          ]),
          h('p', { text: flaggedAggregate.area.caveat }),
          flaggedAggregate.area.evidence?.length
            ? h(
                'ul',
                { class: 'sc-evidence' },
                flaggedAggregate.area.evidence.map((e) => h('li', { text: e })),
              )
            : null,
        ]),
      );
    }

    // Concentration.
    const shares = countries.map((r) => r.valueUsd);
    const hhi = herfindahlIndex(shares);
    const cr4 = concentrationRatio(shares, 4);
    const metrics = h('div', { class: 'sc-metrics' });
    if (hhi.value === null) {
      metrics.appendChild(
        dataGapBlock(hhi.interpretation, 'At least one positive partner value'),
      );
    } else {
      metrics.appendChild(
        h('div', { class: 'sc-metric' }, [
          h('span', { class: 'sc-metric-value', text: hhi.value.toFixed(3) }),
          h('span', {
            class: 'sc-metric-label',
            text: `HHI · ${hhi.interpretation}`,
          }),
        ]),
      );
      metrics.appendChild(
        h('div', { class: 'sc-metric' }, [
          h('span', {
            class: 'sc-metric-value',
            text: hhi.effectiveCount.toFixed(1),
          }),
          h('span', { class: 'sc-metric-label', text: 'effective suppliers' }),
        ]),
      );
      metrics.appendChild(
        h('div', { class: 'sc-metric' }, [
          h('span', {
            class: 'sc-metric-value',
            text: `${(cr4.value * 100).toFixed(0)}%`,
          }),
          h('span', { class: 'sc-metric-label', text: 'CR4' }),
        ]),
      );
    }
    resultsBody.appendChild(metrics);
    resultsBody.appendChild(
      h('p', { class: 'sc-footnote' }, [
        `Base: ${countries.length} individually-attributable countries. `,
        aggregates.length > 0
          ? `${aggregates.length} aggregate code(s) excluded from the index to avoid double counting. `
          : '',
        world ? `World total ${formatUsd(world.valueUsd)}.` : '',
      ]),
    );
    resultsBody.appendChild(h('p', { class: 'sc-formula', text: hhi.formula }));

    // Series, forecast and anomalies when loaded.
    if (state.series) renderSeries(resultsBody);

    resultsBody.appendChild(provenanceBlock(provenance));
  }

  function showPartnerDetail(area, value) {
    const existing = resultsBody.querySelector('.sc-detail');
    if (existing) existing.remove();
    resultsBody.appendChild(
      h('div', { class: 'sc-detail' }, [
        h('div', { class: 'sc-detail-head' }, [
          h('strong', { text: area.name }),
          h('span', { class: 'sc-detail-value', text: formatUsd(value) }),
        ]),
        h('div', { class: 'sc-detail-row' }, [
          h('span', {
            class: `sc-badge ${area.association === AssociationClass.VERIFIED ? 'sc-badge-ver' : 'sc-badge-inf'}`,
            text:
              area.association === AssociationClass.VERIFIED
                ? '🔵 VERIFIED PARTNER'
                : '🟡 INFERRED / AGGREGATE',
          }),
        ]),
        area.caveat
          ? h('p', { class: 'sc-detail-caveat', text: area.caveat })
          : null,
        h('p', {
          class: 'sc-footnote',
          text:
            'Commodity association for an individual shipment is not available ' +
            'from this data — AIS does not broadcast cargo.',
        }),
      ]),
    );
  }

  function renderSeries(parent) {
    const { values, periods, provenance } = state.series;
    if (values.length < 2) {
      parent.appendChild(
        dataGapBlock(
          'Fewer than two usable observations in this series.',
          'More reporting years for this reporter and commodity',
        ),
      );
      return;
    }

    const anomalies = detectAnomalies({
      values,
      periods,
      mode: 'change',
      threshold: 2.5,
      seriesLabel: `${state.reporter} ${state.commodity}`,
    });
    const projection = forecast({
      values,
      periods,
      horizon: 3,
      unit: 'current US$',
      seriesLabel: `${state.reporter} ${state.commodity}`,
    });

    parent.appendChild(
      h('h4', { class: 'sc-h4', text: 'TIME SERIES + FORECAST' }),
    );
    const forecastPoints =
      projection.model?.point.map((value, i) => ({
        period: periods[periods.length - 1] + 1 + i,
        value,
      })) ?? [];
    parent.appendChild(
      timeSeriesChart({
        observed: values.map((value, i) => ({ period: periods[i], value })),
        forecast: forecastPoints,
        interval: projection.model?.interval ?? null,
      }),
    );
    parent.appendChild(
      h('p', { class: 'sc-legend' }, [
        h('span', { class: 'sc-legend-obs', text: '── observed 🔵' }),
        h('span', { class: 'sc-legend-fc', text: '╌╌ modelled 🟠' }),
      ]),
    );

    // Model vs baselines — never one without the other.
    if (projection.recommended) {
      const rows = [
        ...projection.baselines.map((b) => ({
          method: b.method,
          mae: b.backtest.metrics?.mae ?? null,
        })),
        ...(projection.model
          ? [
              {
                method: projection.model.method,
                mae: projection.model.backtest.metrics?.mae ?? null,
              },
            ]
          : []),
      ];
      parent.appendChild(
        h('table', { class: 'sc-table' }, [
          h(
            'thead',
            {},
            h('tr', {}, [
              h('th', { text: 'METHOD' }),
              h('th', { text: 'OUT-OF-SAMPLE MAE' }),
            ]),
          ),
          h(
            'tbody',
            {},
            rows.map((r) =>
              h(
                'tr',
                {
                  class:
                    r.method === projection.recommended.method ? 'sc-win' : '',
                },
                [
                  h('td', { text: r.method }),
                  h('td', { text: r.mae === null ? 'n/a' : formatUsd(r.mae) }),
                ],
              ),
            ),
          ),
        ]),
      );
      parent.appendChild(
        h('p', {
          class: 'sc-verdict',
          text:
            projection.modelBeatsBaseline === true
              ? 'The model beat every baseline out of sample.'
              : projection.modelBeatsBaseline === false
                ? 'A simple baseline won — use the baseline.'
                : 'Too few observations to validate out of sample.',
        }),
      );
    }
    if (projection.reason) {
      parent.appendChild(
        h('p', { class: 'sc-footnote', text: projection.reason }),
      );
    }

    parent.appendChild(h('h4', { class: 'sc-h4', text: 'ANOMALIES' }));
    if (!anomalies.assessable) {
      parent.appendChild(
        dataGapBlock(anomalies.reason, 'A longer or more varied series'),
      );
    } else if (anomalies.anomalies.length === 0) {
      parent.appendChild(
        h('p', {
          class: 'sc-footnote',
          text: 'None at threshold 2.5. The absence of a flag does not mean nothing happened.',
        }),
      );
    } else {
      parent.appendChild(
        h(
          'ul',
          { class: 'sc-anomalies' },
          anomalies.anomalies.map((a) =>
            h('li', {
              text: `${a.period}  ${a.direction}  ${a.percentChange.toFixed(1)}%  (robust z ${a.robustZ.toFixed(2)})`,
            }),
          ),
        ),
      );
    }
    parent.appendChild(provenanceBlock(projection.provenance));
    if (provenance) parent.appendChild(provenanceBlock(provenance));
  }

  /* ---------------- production (§21) ---------------- */

  function renderProduction() {
    productionBody.replaceChildren();
    const button = h('button', {
      class: 'sc-secondary sc-block',
      type: 'button',
      text: 'MAP WORLD PRODUCTION',
      onClick: loadProduction,
    });
    productionBody.appendChild(button);

    if (!state.production) {
      productionBody.appendChild(
        h('p', {
          class: 'sc-hint',
          text:
            'Ranks exporters of the selected commodity worldwide. Exports are ' +
            'a proxy for production — this project has no production data.',
        }),
      );
      return;
    }

    const p = state.production;
    // The proxy warning is not tucked into the provenance drawer; it is the
    // first thing above the map, because the map is wrong without it.
    productionBody.appendChild(
      h('div', { class: 'sc-caveat' }, [
        h('div', { class: 'sc-caveat-head' }, [
          h('span', {
            class: 'sc-badge sc-badge-inf',
            text: '🟡 EXPORT PROXY',
          }),
          h('strong', { text: 'This is exports, not production.' }),
        ]),
        h('p', {
          text:
            'No open production dataset is integrated. Re-export hubs appear ' +
            'as producers, domestic consumption is invisible, and value is ' +
            'not volume.',
        }),
      ]),
    );

    if (p.producers.length === 0) {
      productionBody.appendChild(
        dataGapBlock(
          'No exporter reported this commodity for the selected year.',
          'A year in which reporters filed this HS heading',
        ),
      );
      return;
    }

    productionBody.appendChild(
      barChart({
        rows: p.producers.slice(0, 10).map((row) => ({
          label: row.name,
          value: row.valueUsd,
          accent: row.reexportHub ? 'var(--sc-inferred)' : 'var(--sc-verified)',
          note:
            row.reexportHub ??
            `${((row.share ?? 0) * 100).toFixed(1)}% of reported exports`,
          row,
        })),
        onSelect: (entry) => {
          const row = entry.row;
          if (row?.lat !== null && row?.lon !== null) {
            moveCamera({ lat: row.lat, lon: row.lon, heightM: 6_000_000 });
          }
        },
      }),
    );

    const hhi = p.concentration.hhi;
    if (hhi.value !== null) {
      productionBody.appendChild(
        h('div', { class: 'sc-metrics' }, [
          h('div', { class: 'sc-metric' }, [
            h('span', { class: 'sc-metric-value', text: hhi.value.toFixed(3) }),
            h('span', {
              class: 'sc-metric-label',
              text: `HHI · ${hhi.interpretation}`,
            }),
          ]),
          h('div', { class: 'sc-metric' }, [
            h('span', {
              class: 'sc-metric-value',
              text: hhi.effectiveCount.toFixed(1),
            }),
            h('span', {
              class: 'sc-metric-label',
              text: 'effective producers',
            }),
          ]),
        ]),
      );
    }

    for (const flag of p.reexportFlags) {
      productionBody.appendChild(
        h('p', { class: 'sc-footnote' }, [
          h('strong', { text: `${flag.name}: ` }),
          flag.note,
        ]),
      );
    }
    if (p.unretrievedReporterCount > 0) {
      productionBody.appendChild(
        dataGapBlock(
          `${p.unretrievedReporterCount} reporter(s) could not be retrieved ` +
            'from the upstream and are missing from this ranking entirely.',
          'A successful response from UN Comtrade for those reporters',
        ),
      );
    }
    if (p.incompleteReporters.length > 0) {
      // A capped upstream page is a gap in the ranking, so it is shown as one
      // rather than left to the provenance drawer.
      productionBody.appendChild(
        dataGapBlock(
          `${p.incompleteReporters.length} reporter(s) returned a truncated ` +
            `page and may be understated: ${p.incompleteReporters.join(', ')}.`,
          'An upstream query narrow enough to stay under the row cap',
        ),
      );
    }
    productionBody.appendChild(provenanceBlock(p.provenance));
  }

  /** Reporters per proxy call. The proxy caps a request at 60. */
  const PRODUCTION_BATCH = 30;

  async function loadProduction() {
    const group = COMMODITY_GROUPS.find((g) => g.key === state.commodity);
    if (!group) return;
    setStatus('Ranking world exporters…', 'sc-busy');
    try {
      const reporters = COUNTRIES.filter((c) => c.m49 !== null).map(
        (c) => c.m49,
      );
      const rows = [];
      const incomplete = [];
      const failed = [];
      let provenance = null;
      let done = 0;

      /**
       * Fetch one batch, splitting it only if the cap actually cost us a total.
       *
       * The preview endpoint caps every response at 500 rows and says so only
       * by returning exactly that many. Truncation alone is not proof of loss,
       * though: a page is mostly partner2/mode-of-transport breakdown slices,
       * which canonical filtering discards anyway. Turkey's 2023 HS 8542
       * exports fill all 500 rows with 133 partner2 values — and the one
       * canonical total is still in there. Warning on truncation alone flagged
       * Turkey as understated when its figure was exact.
       *
       * So the test is what came back, not how full the page was: a requested
       * reporter with no canonical total on a TRUNCATED page may have been cut
       * off, and that batch is halved to find out. The same reporter missing
       * from an UNTRUNCATED page simply did not report this commodity, which is
       * an absence in the source rather than one this code caused.
       */
      async function fetchBatch(batch) {
        let result;
        try {
          result = await source.getTradeFlows({
            reporter: batch,
            period: state.year,
            cmd: group.hsHeadings[0],
            flow: 'X',
            partner: 0,
          });
        } catch (error) {
          // One throttled or failed batch must not void the other seven. The
          // reporters in it are recorded as missing and the panel says so,
          // which is the same discipline getTradeSeries applies to a period
          // that fails mid-series.
          failed.push(...batch);
          done += batch.length;
          throw Object.assign(new Error(error.message), { batchFailed: true });
        }
        provenance = result.provenance;
        const atRisk = reportersAtRisk({
          requested: batch,
          returned: result.rows.map((row) => row.reporterCode),
          truncated: result.truncated,
        });

        if (atRisk.length === 0) {
          rows.push(...result.rows);
          done += batch.length;
          setStatus(
            `Ranking world exporters… ${done}/${reporters.length}`,
            'sc-busy',
          );
          return;
        }
        if (batch.length === 1) {
          // A single reporter whose own page is capped with no total in it. We
          // cannot narrow the query further from here, so it is declared.
          rows.push(...result.rows);
          incomplete.push(batch[0]);
          done += 1;
          return;
        }
        const mid = Math.ceil(batch.length / 2);
        await fetchBatch(batch.slice(0, mid));
        await fetchBatch(batch.slice(mid));
      }

      for (let i = 0; i < reporters.length; i += PRODUCTION_BATCH) {
        try {
          await fetchBatch(reporters.slice(i, i + PRODUCTION_BATCH));
        } catch (error) {
          if (!error.batchFailed) throw error;
        }
      }
      if (rows.length === 0) {
        setStatus(
          'Production ranking failed: no batch returned data.',
          'sc-err',
        );
        return;
      }

      state.production = productionProxy({
        rows,
        interpret: interpretArea,
        resolve: (code) => COUNTRIES.find((c) => c.m49 === code) ?? null,
        commodityLabel: group.label,
        period: state.year,
        retrievedAt: provenance.retrievedAt,
        incompleteReporters: incomplete.map(
          (code) => COUNTRIES.find((c) => c.m49 === code)?.name ?? String(code),
        ),
        unretrievedReporterCount: failed.length,
      });
      const caveats = [];
      if (incomplete.length)
        caveats.push(`${incomplete.length} truncated page(s)`);
      if (failed.length)
        caveats.push(`${failed.length} reporter(s) not retrieved`);
      setStatus(
        `${state.production.producers.length} exporters ranked (export proxy).` +
          (caveats.length ? ` ${caveats.join('; ')}.` : ''),
        caveats.length ? 'sc-warn' : 'sc-ok',
      );
      renderProduction();
      notify();
    } catch (error) {
      setStatus(`Production ranking failed: ${error.message}`, 'sc-err');
    }
  }

  /* ---------------- country comparison (§20) ---------------- */

  const COMPARE_DEFAULT = ['KOR', 'CHN', 'JPN', 'VNM', 'DEU'];

  function renderCompare() {
    compareBody.replaceChildren();
    const select = h(
      'select',
      {
        class: 'sc-select',
        multiple: '',
        size: '6',
        'aria-label': 'Countries to compare',
      },
      FEATURED_REPORTERS.map((iso3) => {
        const country = COUNTRIES.find((c) => c.iso3 === iso3);
        const option = h('option', {
          value: iso3,
          text: country?.name ?? iso3,
        });
        if ((state.compareSelection ?? COMPARE_DEFAULT).includes(iso3)) {
          option.selected = true;
        }
        return option;
      }),
    );
    compareBody.appendChild(
      h('label', { class: 'sc-field' }, [
        h('span', { class: 'sc-field-label', text: 'SELECT TWO OR MORE' }),
        select,
      ]),
    );
    compareBody.appendChild(
      h('button', {
        class: 'sc-secondary sc-block',
        type: 'button',
        text: 'COMPARE',
        onClick: () => {
          state.compareSelection = [...select.selectedOptions].map(
            (o) => o.value,
          );
          loadComparison();
        },
      }),
    );

    if (!state.comparison) {
      compareBody.appendChild(
        h('p', {
          class: 'sc-hint',
          text: 'World Bank indicators, plus a clustering of trade structure.',
        }),
      );
      return;
    }
    renderComparison(compareBody, state.comparison);
  }

  function renderComparison(parent, comparison) {
    const { economies, indicators, clustering, provenance } = comparison;

    for (const indicator of indicators) {
      parent.appendChild(
        h('h4', {
          class: 'sc-h4',
          text: `${indicator.label} (${indicator.unit})`,
        }),
      );
      const rows = economies
        .map((economy) => ({
          label: economy.name,
          value: economy.values[indicator.code],
        }))
        .filter((r) => typeof r.value === 'number' && r.value > 0);
      if (rows.length === 0) {
        // A missing indicator is a gap, not an empty chart.
        parent.appendChild(
          dataGapBlock(
            `No economy in this selection reports ${indicator.label}.`,
            'A year and economy the World Bank covers for this indicator',
          ),
        );
        continue;
      }
      parent.appendChild(
        barChart({
          rows: rows.sort((a, b) => b.value - a.value),
          rowHeight: 22,
          format: formatterForUnit(indicator.unit),
        }),
      );
      parent.appendChild(
        h('p', { class: 'sc-footnote', text: indicator.reads }),
      );
    }

    parent.appendChild(
      h('h4', { class: 'sc-h4', text: 'PRODUCTIVE STRUCTURE' }),
    );
    parent.appendChild(
      h(
        'ul',
        { class: 'sc-structure' },
        economies.map((economy) =>
          h('li', {}, [
            h('strong', { text: `${economy.name}: ` }),
            h('span', {
              text: economy.structure.structure
                .replace(/_/g, ' ')
                .toLowerCase(),
            }),
            h('br'),
            h('span', { class: 'sc-footnote', text: economy.structure.basis }),
            economy.structure.confident
              ? null
              : h('span', {
                  class: 'sc-footnote',
                  text: ' (residual classification — a weaker claim)',
                }),
          ]),
        ),
      ),
    );

    parent.appendChild(h('h4', { class: 'sc-h4', text: 'CLUSTERING' }));
    if (!clustering.assessable) {
      parent.appendChild(
        dataGapBlock(
          clustering.reason,
          'More economies with complete indicators',
        ),
      );
    } else {
      for (const cluster of clustering.clusters) {
        if (cluster.size === 0) continue;
        parent.appendChild(
          h('p', { class: 'sc-footnote' }, [
            h('strong', { text: `Cluster ${cluster.label + 1}: ` }),
            cluster.members.map((m) => m.name).join(', '),
          ]),
        );
      }
      parent.appendChild(
        h('p', {
          class: 'sc-verdict',
          text: `Silhouette ${clustering.silhouette === null ? 'n/a' : clustering.silhouette.toFixed(3)} — ${clustering.silhouetteInterpretation}`,
        }),
      );
      parent.appendChild(provenanceBlock(clustering.provenance));
    }
    parent.appendChild(provenanceBlock(provenance));
  }

  async function loadComparison() {
    const selection = state.compareSelection ?? COMPARE_DEFAULT;
    if (selection.length < 2) {
      setStatus('Select at least two countries to compare.', 'sc-err');
      return;
    }
    setStatus('Loading World Bank indicators…', 'sc-busy');
    try {
      const indicators = PRODUCTION_INDICATORS.concat([
        {
          code: 'NY.GDP.MKTP.CD',
          label: 'GDP',
          unit: 'current US$',
          reads: 'Economy size.',
        },
        {
          code: 'IS.SHP.GOOD.TU',
          label: 'Container port traffic',
          unit: 'TEU',
          reads:
            'Country-level container throughput. Port-level throughput is ' +
            'commercial; this national figure is the free substitute.',
        },
      ]);
      const values = new Map(selection.map((iso3) => [iso3, {}]));
      let lastProvenance = null;
      for (const indicator of indicators) {
        const result = await source.getIndicator({
          iso3: selection,
          indicator: indicator.code,
          start: state.year - 4,
          end: state.year,
        });
        lastProvenance = result.provenance;
        // Latest available observation per economy: indicators lag unevenly,
        // so pinning one year would drop economies that simply reported later.
        for (const iso3 of selection) {
          const series = result.observations.filter((o) => o.iso3 === iso3);
          values.get(iso3)[indicator.code] =
            series.length > 0 ? series[series.length - 1].value : null;
        }
      }

      const economies = selection.map((iso3) => {
        const country = COUNTRIES.find((c) => c.iso3 === iso3);
        return {
          iso3,
          name: country?.name ?? iso3,
          values: values.get(iso3),
          structure: classifyStructure(values.get(iso3)),
        };
      });

      // Cluster on the indicators every selected economy actually reports;
      // imputing a missing value would invent the structure being measured.
      const usable = indicators.filter((indicator) =>
        economies.every((e) => typeof e.values[indicator.code] === 'number'),
      );
      const clustering =
        usable.length >= 2 && economies.length >= 2
          ? clusterCountries({
              observations: economies.map((e) => ({
                id: e.iso3,
                name: e.name,
                features: usable.map((i) => e.values[i.code]),
              })),
              featureNames: usable.map((i) => i.label),
              k: Math.min(3, economies.length),
            })
          : {
              assessable: false,
              reason:
                'Fewer than two indicators are reported by every selected ' +
                'economy, so there is nothing common to cluster on.',
              clusters: [],
            };

      state.comparison = {
        economies,
        indicators,
        clustering,
        provenance: lastProvenance,
      };
      setStatus(`Compared ${economies.length} economies.`, 'sc-ok');
      renderCompare();
      notify();
    } catch (error) {
      setStatus(`Comparison failed: ${error.message}`, 'sc-err');
    }
  }

  /* ---------------- events (§15) ---------------- */

  function renderEvents() {
    eventsBody.replaceChildren();
    eventsBody.appendChild(
      h('button', {
        class: 'sc-secondary sc-block',
        type: 'button',
        text: 'LOAD CURRENT EVENTS',
        onClick: loadEvents,
      }),
    );

    if (!state.events) {
      eventsBody.appendChild(
        h('p', {
          class: 'sc-hint',
          text:
            'Live natural hazards from GDACS, matched to ports and chokepoints ' +
            'within 500 km.',
        }),
      );
      return;
    }

    const { events, exposed, provenance } = state.events;
    eventsBody.appendChild(
      h('p', { class: 'sc-caption' }, [
        h('span', { class: 'sc-badge sc-badge-live', text: '🟢 LIVE' }),
        ` ${events.length} current events · ${exposed.length} within 500 km of tracked infrastructure`,
      ]),
    );

    if (exposed.length === 0) {
      eventsBody.appendChild(
        h('p', {
          class: 'sc-footnote',
          text:
            'No current hazard is near a tracked port or chokepoint. That is ' +
            'not the same as no disruption: GDACS carries natural hazards ' +
            'only, not strikes, closures or sanctions.',
        }),
      );
    } else {
      eventsBody.appendChild(
        h(
          'ul',
          { class: 'sc-events' },
          exposed.slice(0, 8).map((event) =>
            h(
              'li',
              {
                class: `sc-event sc-alert-${(event.alertLevel ?? 'none').toLowerCase()}`,
              },
              [
                h('div', { class: 'sc-event-head' }, [
                  h('strong', { text: event.eventLabel }),
                  h('span', { text: event.country ?? '' }),
                ]),
                h('div', {
                  class: 'sc-footnote',
                  text: event.severityText ?? 'Severity not reported',
                }),
                h('div', { class: 'sc-footnote' }, [
                  'Near: ',
                  event.nearby
                    .map((n) => `${n.name} (${Math.round(n.distanceKm)} km)`)
                    .join(', '),
                ]),
              ],
            ),
          ),
        ),
      );
      eventsBody.appendChild(
        h('p', {
          class: 'sc-footnote',
          text: exposed[0].proximityCaveat,
        }),
      );
    }
    eventsBody.appendChild(provenanceBlock(provenance));
  }

  async function loadEvents() {
    setStatus('Loading GDACS events…', 'sc-busy');
    try {
      const { events, provenance } = await source.getEvents();
      const linked = linkEventsToNodes({
        events,
        nodes: [
          ...MAJOR_PORTS.map((p) => ({
            id: p.id,
            name: p.name,
            lat: p.lat,
            lon: p.lon,
            kind: 'port',
          })),
          ...CHOKEPOINTS.map((c) => ({
            id: c.id,
            name: c.name,
            lat: c.lat,
            lon: c.lon,
            kind: 'chokepoint',
          })),
        ],
        distanceKm: haversineKm,
        radiusKm: 500,
      });
      state.events = {
        events: linked,
        exposed: linked.filter((e) => e.nearbyCount > 0),
        provenance,
      };
      await setLayerEnabled?.('supply-events', true);
      setStatus(`${linked.length} events loaded.`, 'sc-ok');
      renderEvents();
      notify();
    } catch (error) {
      setStatus(`Events failed: ${error.message}`, 'sc-err');
    }
  }

  /* ---------------- WHAT IF ---------------- */

  function renderWhatIf() {
    whatIfBody.replaceChildren();
    const select = h(
      'select',
      { class: 'sc-select', 'aria-label': 'Disruption target' },
      CHOKEPOINTS.map((c) => h('option', { value: c.id, text: c.name })),
    );
    const button = h('button', {
      class: 'sc-run sc-run-danger',
      type: 'button',
      text: 'SIMULATE DISRUPTION',
      onClick: () => simulate(select.value),
    });
    whatIfBody.appendChild(
      h('div', { class: 'sc-field' }, [
        h('span', { class: 'sc-field-label', text: 'CLOSE THIS CHOKEPOINT' }),
        select,
      ]),
    );
    whatIfBody.appendChild(button);

    if (state.scenario) renderScenario(whatIfBody, state.scenario);
  }

  function renderScenario(parent, scenario) {
    const { result, reach, point, graphProvenance } = scenario;

    parent.appendChild(
      h('div', { class: 'sc-scenario-head' }, [
        h('span', { class: 'sc-badge sc-badge-sim', text: '🟠 SIMULATED' }),
        h('strong', { text: point.name }),
      ]),
    );
    parent.appendChild(
      h('p', {
        class: 'sc-footnote',
        text: 'MODEL OUTPUT. This scenario did not occur.',
      }),
    );

    if (!result.reachableBefore) {
      parent.appendChild(
        dataGapBlock(
          'No baseline route exists between these nodes in the demonstration network.',
          'A fuller maritime network',
        ),
      );
    } else if (!result.reachableAfter) {
      parent.appendChild(
        h('div', { class: 'sc-severed' }, [
          h('div', { class: 'sc-severed-label', text: 'ROUTE SEVERED' }),
          h('p', { text: result.note }),
        ]),
      );
    } else {
      parent.appendChild(
        h('div', { class: 'sc-route' }, [
          h('div', { class: 'sc-route-label', text: 'BEFORE' }),
          h('div', {
            class: 'sc-route-path',
            text: result.before.nodeNames.join(' → '),
          }),
          h('div', { class: 'sc-route-label', text: 'AFTER' }),
          h('div', {
            class: 'sc-route-path',
            text: result.after.nodeNames.join(' → '),
          }),
        ]),
      );
      parent.appendChild(
        beforeAfterChart({
          before: result.before.distanceKm,
          after: result.after.distanceKm,
          unit: 'km',
        }),
      );
      parent.appendChild(
        h('div', { class: 'sc-metrics' }, [
          h('div', { class: 'sc-metric' }, [
            h('span', {
              class: 'sc-metric-value',
              text: `+${Math.round(result.delta.additionalDistanceKm).toLocaleString()}`,
            }),
            h('span', { class: 'sc-metric-label', text: 'extra km' }),
          ]),
          h('div', { class: 'sc-metric' }, [
            h('span', {
              class: 'sc-metric-value',
              text: `+${(result.delta.additionalHours / 24).toFixed(1)}`,
            }),
            h('span', {
              class: 'sc-metric-label',
              text: 'extra days (modelled)',
            }),
          ]),
        ]),
      );
      parent.appendChild(
        h('details', { class: 'sc-prov' }, [
          h('summary', { text: 'Time assumptions' }),
          h(
            'ul',
            { class: 'sc-prov-limits' },
            result.after.timeAssumptions.map((a) => h('li', { text: a })),
          ),
        ]),
      );
      if (result.alternatives.length > 0) {
        parent.appendChild(h('h4', { class: 'sc-h4', text: 'ALTERNATIVES' }));
        parent.appendChild(
          h(
            'ul',
            { class: 'sc-alts' },
            result.alternatives.map((alt) =>
              h('li', {}, [
                h('span', { text: alt.nodeNames.join(' → ') }),
                h('span', {
                  class: 'sc-badge sc-badge-inf',
                  text:
                    alt.classification.kind === 'GEOGRAPHIC_ALTERNATIVE'
                      ? 'GEOGRAPHIC ONLY'
                      : 'OPERATIONALLY VALIDATED',
                }),
              ]),
            ),
          ),
        );
        parent.appendChild(
          h('p', {
            class: 'sc-footnote',
            text: result.alternatives[0].classification.reason,
          }),
        );
      }
    }

    parent.appendChild(h('h4', { class: 'sc-h4', text: 'PROPAGATION' }));
    parent.appendChild(
      h('div', { class: 'sc-tiers' }, [
        h('div', {}, [
          h('span', { class: 'sc-tier-label', text: 'DIRECT' }),
          h('span', {
            text: reach.direct.map((n) => n.name).join(', ') || '—',
          }),
        ]),
        h('div', {}, [
          h('span', { class: 'sc-tier-label', text: 'SECONDARY' }),
          h('span', {
            text: reach.secondary.map((n) => n.name).join(', ') || '—',
          }),
        ]),
        h('div', {}, [
          h('span', { class: 'sc-tier-label', text: 'TERTIARY' }),
          h('span', {
            text: reach.tertiary.map((n) => n.name).join(', ') || '—',
          }),
        ]),
      ]),
    );
    parent.appendChild(
      h('p', { class: 'sc-footnote', text: reach.provenance.limitations[0] }),
    );
    parent.appendChild(provenanceBlock(result.provenance));
    if (graphProvenance) parent.appendChild(provenanceBlock(graphProvenance));
  }

  /* ---------------- actions ---------------- */

  async function run() {
    if (state.loading) return;
    const group = COMMODITY_GROUPS.find((g) => g.key === state.commodity);
    const country = COUNTRIES.find((c) => c.iso3 === state.reporter);
    if (!group || !country) return;
    if (country.m49 === null) {
      state.error = `${country.name} does not report to UN Comtrade, so its trade can only be seen through partners' mirror statistics.`;
      state.result = null;
      renderResults();
      return;
    }

    inflight?.abort();
    const controller = new AbortController();
    inflight = controller;
    state.loading = true;
    state.error = null;
    setStatus('Querying UN Comtrade…', 'sc-busy');
    runButton.disabled = true;

    try {
      const hs = group.hsHeadings[0];
      const { rows, provenance } = await source.getTradeFlows(
        {
          reporter: country.m49,
          period: state.year,
          cmd: hs,
          flow: state.flow,
        },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;

      const { countries, aggregates, world } = partitionPartners(rows);
      state.result = {
        rows,
        countries,
        aggregates,
        world,
        provenance,
        group,
        hs,
      };

      const { flows, unplaceable } = buildFlows({
        rows,
        flow: state.flow,
        positionOf: (code) => {
          const match = COUNTRIES.find((c) => c.m49 === code);
          return match ? { lat: match.lat, lon: match.lon } : null;
        },
        interpret: interpretArea,
        limit: 50,
      });
      layers.tradeFlows?.setFlows(flows, {
        commodity: group.label,
        period: state.year,
        flow: state.flow,
      });

      // Layers start disabled, so pushing flows into a hidden layer would draw
      // the answer where nobody can see it. The console owns this layer, so it
      // turns it on rather than relying on the user finding the toggle.
      if (flows.length > 0) await setLayerEnabled?.('trade-flows', true);

      // Trade arcs are global. The inherited app starts at street level, where
      // none of them are on screen, so framing the reporter from orbit is part
      // of rendering the answer rather than a courtesy.
      if (flows.length > 0) {
        moveCamera({
          lat: country.lat,
          lon: country.lon,
          heightM: 18_000_000,
        });
      }

      setStatus(
        `${countries.length} partners · ${flows.length} arcs drawn` +
          (unplaceable.length > 0
            ? ` · ${unplaceable.length} aggregate row(s) have no coordinate and are listed but not drawn`
            : ''),
        'sc-ok',
      );
      renderResults();
      notify();
    } catch (error) {
      if (controller.signal.aborted) return;
      state.error = error.message;
      state.result = null;
      layers.tradeFlows?.setError(error.message);
      setStatus(
        error.retryable
          ? 'Upstream is rate-limited. Wait a moment and retry.'
          : `Failed: ${error.message}`,
        'sc-err',
      );
      renderResults();
    } finally {
      state.loading = false;
      runButton.disabled = false;
      if (inflight === controller) inflight = null;
    }
  }

  async function loadSeries() {
    const group = COMMODITY_GROUPS.find((g) => g.key === state.commodity);
    const country = COUNTRIES.find((c) => c.iso3 === state.reporter);
    if (!group || !country || country.m49 === null) return;

    seriesButton.disabled = true;
    setStatus('Loading 2015–2023 (one request per year, cached)…', 'sc-busy');
    try {
      const { series, provenance } = await source.getTradeSeries(
        {
          reporter: country.m49,
          cmd: group.hsHeadings[0],
          flow: state.flow,
          partner: 0,
        },
        YEARS,
        {
          onProgress: (done, total) =>
            setStatus(`Loading series ${done}/${total}…`, 'sc-busy'),
        },
      );
      const values = [];
      const periods = [];
      for (const entry of series) {
        const row = entry.rows[0];
        if (row) {
          values.push(row.valueUsd);
          periods.push(entry.period);
        }
      }
      state.series = { values, periods, provenance };
      setStatus(
        `Series loaded: ${values.length}/${YEARS.length} years.`,
        'sc-ok',
      );
      renderResults();
      notify();
    } catch (error) {
      setStatus(`Series failed: ${error.message}`, 'sc-err');
    } finally {
      seriesButton.disabled = false;
    }
  }

  function simulate(chokepointId) {
    const point = CHOKEPOINTS.find((c) => c.id === chokepointId);
    if (!point) return null;
    // Same reason as the trade layer: a highlighted chokepoint on a hidden
    // layer communicates nothing.
    setLayerEnabled?.('chokepoints', true);
    const { graph, provenance: graphProvenance } = buildScenarioGraph();
    if (!graph.hasNode(point.id)) return null;

    const disruption = closeNode(point.id, {
      kind: DisruptionKind.STRAIT_DISRUPTION,
      label: `${point.name} unavailable`,
    });
    const result = simulateDisruption(graph, disruption, 'BUSAN', 'ROTTERDAM');
    const reach = propagate(graph, disruption);

    state.scenario = { result, reach, point, graphProvenance };
    layers.chokepoints?.setDisrupted([point.id]);
    moveCamera({ lat: point.lat, lon: point.lon, heightM: 2_500_000 });
    renderWhatIf();
    notify();
    return state.scenario;
  }

  function getState() {
    return Object.freeze({
      commodity: state.commodity,
      reporter: state.reporter,
      flow: state.flow,
      year: state.year,
      loading: state.loading,
      hasResult: state.result !== null,
      hasSeries: state.series !== null,
      hasScenario: state.scenario !== null,
      hasProduction: state.production !== null,
      hasComparison: state.comparison !== null,
      hasEvents: state.events !== null,
      error: state.error,
    });
  }

  /* ---------------- wiring ---------------- */

  commoditySelect.addEventListener('change', () => {
    state.commodity = commoditySelect.value;
    // A commodity change invalidates the loaded series, which was for the old one.
    state.series = null;
    notify();
  });
  reporterSelect.addEventListener('change', () => {
    state.reporter = reporterSelect.value;
    state.series = null;
    notify();
  });
  flowSelect.addEventListener('change', () => {
    state.flow = flowSelect.value;
    state.series = null;
    notify();
  });
  yearInput.addEventListener('input', () => {
    state.year = Number(yearInput.value);
    yearLabel.textContent = String(state.year);
  });
  yearInput.addEventListener('change', () => {
    if (state.result) run();
  });
  runButton.addEventListener('click', run);
  seriesButton.addEventListener('click', loadSeries);

  // A dismissable panel needs a way back. The chip occupies the same corner so
  // the console cannot be lost.
  const launcher = h('button', {
    class: 'sc-launcher',
    type: 'button',
    text: 'SUPPLY CHAIN',
    hidden: '',
    'aria-label': 'Open supply chain console',
    onClick: () => setVisible(true),
  });

  function setVisible(visible) {
    panel.hidden = !visible;
    if (visible) launcher.setAttribute('hidden', '');
    else launcher.removeAttribute('hidden');
  }

  renderResults();
  renderProduction();
  renderCompare();
  renderEvents();
  renderWhatIf();
  container.appendChild(panel);
  container.appendChild(launcher);

  /**
   * A spoken summary of what is actually loaded.
   *
   * Returns null when nothing is loaded, so a voice handler says "nothing is
   * loaded" rather than describing trade from the model's own memory.
   */
  function describeResult() {
    if (!state.result) return null;
    const { countries, aggregates, group } = state.result;
    const ranked = [...countries, ...aggregates].sort(
      (a, b) => b.valueUsd - a.valueUsd,
    );
    if (ranked.length === 0) return 'That query returned no partners.';
    const hhi = herfindahlIndex(countries.map((r) => r.valueUsd));
    const top = ranked.slice(0, 3).map((row) => {
      const area = interpretArea(row.partnerCode);
      const qualifier = area.isAggregate ? ', an aggregate code' : '';
      return `${area.name}${qualifier} at ${formatUsd(row.valueUsd)}`;
    });
    const direction = state.flow === 'M' ? 'imports' : 'exports';
    const concentration =
      hhi.value === null
        ? ''
        : ` Concentration is ${hhi.interpretation.toLowerCase()}, about ` +
          `${hhi.effectiveCount.toFixed(1)} effective partners.`;
    return (
      `${group.label} ${direction} for ${state.reporter} in ${state.year}. ` +
      `Largest: ${top.join('; ')}.${concentration} This is historical UN ` +
      'Comtrade data, not live.'
    );
  }

  /** The §24 "why do you think this?" answer, from the loaded result only. */
  function describeEvidence() {
    if (!state.result) return null;
    const { countries, aggregates, provenance } = state.result;
    const flagged = [...countries, ...aggregates]
      .sort((a, b) => b.valueUsd - a.valueUsd)
      .map((row) => interpretArea(row.partnerCode))
      .find((area) => area.isAggregate);
    const base =
      `These figures come from ${provenance.source}, ${provenance.dataset}. ` +
      `${provenance.limitations[0]}`;
    if (!flagged) return base;
    return (
      `${base} Note also that ${flagged.name} is an aggregate code. ` +
      `${flagged.caveat}`
    );
  }

  return {
    element: panel,
    run,
    loadSeries,
    simulate,
    getState,
    describeResult,
    describeEvidence,
    loadProduction,
    loadComparison,
    loadEvents,
    /**
     * Suspend or restore this console's own camera moves.
     *
     * Used by the authored tour so the director keeps the camera it framed.
     * Returns the previous value so a caller can restore rather than guess.
     *
     * @param {boolean} suspended
     * @returns {boolean} the previous setting
     */
    setCameraSuspended(suspended) {
      const previous = cameraSuspended;
      cameraSuspended = Boolean(suspended);
      return previous;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(getState());
      return () => listeners.delete(listener);
    },
    setCommodity(key) {
      if (!COMMODITY_GROUPS.some((g) => g.key === key)) return false;
      state.commodity = key;
      commoditySelect.value = key;
      state.series = null;
      return true;
    },
    setReporter(iso3) {
      const country = COUNTRIES.find((c) => c.iso3 === iso3);
      if (!country) return false;
      state.reporter = iso3;
      if (!FEATURED_REPORTERS.includes(iso3)) {
        reporterSelect.appendChild(
          h('option', { value: iso3, text: country.name }),
        );
      }
      reporterSelect.value = iso3;
      state.series = null;
      return true;
    },
    setYear(year) {
      if (!YEARS.includes(year)) return false;
      state.year = year;
      yearInput.value = String(year);
      yearLabel.textContent = String(year);
      return true;
    },
    setFlow(flow) {
      if (flow !== 'M' && flow !== 'X') return false;
      state.flow = flow;
      flowSelect.value = flow;
      state.series = null;
      return true;
    },
    setVisible,
    destroy() {
      inflight?.abort();
      inflight = null;
      listeners.clear();
      panel.remove();
      launcher.remove();
    },
  };
}
