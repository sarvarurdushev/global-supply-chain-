/**
 * Run the supply-chain engine against the live public APIs and print the result.
 *
 *   node scripts/supplychain-demo.mjs              # all scenarios
 *   node scripts/supplychain-demo.mjs concentration
 *   node scripts/supplychain-demo.mjs disruption   # offline, no network
 *   node scripts/supplychain-demo.mjs forecast
 *   node scripts/supplychain-demo.mjs economy
 *
 * This exists because the supply-chain INTERFACE is not built yet (see
 * docs/PHASED_PLAN.md). The engine is complete and tested, so this is the way to
 * see what it actually produces. Every figure printed is computed live, except
 * where a scenario says it is using a fixed demonstration network.
 *
 * Network scenarios hit UN Comtrade and the World Bank. Neither needs a key.
 * Comtrade rate-limits, so the forecast scenario paces itself and takes ~15 s.
 */

import { createComtradeSource, FlowCode } from '../src/supplychain/sources/comtrade.js';
import {
  createWorldBankSource,
  INDICATORS,
} from '../src/supplychain/sources/worldbank.js';
import {
  interpretArea,
  partitionPartners,
} from '../src/supplychain/reference/areas.js';
import { COMMODITY_GROUPS, HS_HEADINGS } from '../src/supplychain/reference/commodities.js';
import {
  herfindahlIndex,
  concentrationRatio,
  betweennessCentrality,
} from '../src/supplychain/centrality.js';
import {
  NodeType,
  EdgeType,
  TransportMode,
  createNode,
  createEdge,
  createGraph,
} from '../src/supplychain/graph.js';
import {
  DisruptionKind,
  closeNode,
  reduceNodeCapacity,
  simulateDisruption,
  propagate,
  compareScenarios,
} from '../src/supplychain/disruption.js';
import { DataClass, createProvenance } from '../src/supplychain/provenance.js';
import { forecast } from '../src/supplychain/ml/forecast.js';
import { detectAnomalies } from '../src/supplychain/ml/anomaly.js';

/* ---------------------------------------------------------------- *
 * Terminal formatting
 * ---------------------------------------------------------------- */

const colour = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, text) => (colour ? `[${code}m${text}[0m` : text);
const bold = (t) => c('1', t);
const dim = (t) => c('2', t);
const cyan = (t) => c('36', t);
const green = (t) => c('32', t);
const yellow = (t) => c('33', t);
const red = (t) => c('31', t);

function heading(text) {
  console.log(`\n${bold(cyan('━'.repeat(74)))}`);
  console.log(bold(cyan(`  ${text}`)));
  console.log(bold(cyan('━'.repeat(74))));
}

function section(text) {
  console.log(`\n${bold(text)}`);
}

const usd = (v) => `$${(v / 1e9).toFixed(2)}B`;
const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);

/** Print a provenance record the way the UI panel would. */
function printProvenance(provenance, { limit = 4 } = {}) {
  console.log(dim(`\n  PROVENANCE  ${provenance.badge}`));
  console.log(dim(`    source     ${provenance.source}`));
  console.log(dim(`    licence    ${provenance.license.slice(0, 60)}`));
  console.log(dim(`    method     ${provenance.method.slice(0, 60)}`));
  console.log(
    dim(
      `    confidence ${provenance.confidence.toFixed(2)} (${provenance.confidenceBand})`,
    ),
  );
  console.log(dim('    limitations:'));
  for (const l of provenance.limitations.slice(0, limit)) {
    console.log(dim(`      - ${wrap(l, 66, 8)}`));
  }
  if (provenance.limitations.length > limit) {
    console.log(dim(`      ... and ${provenance.limitations.length - limit} more`));
  }
}

function wrap(text, width, indent) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((line + word).length > width) {
      lines.push(line.trimEnd());
      line = '';
    }
    line += `${word} `;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines.join(`\n${' '.repeat(indent)}`);
}

/* ---------------------------------------------------------------- *
 * Scenario 1 — trade concentration (live)
 * ---------------------------------------------------------------- */

async function concentration() {
  heading('1. SEMICONDUCTOR DEPENDENCY  ·  live UN Comtrade');

  const comtrade = createComtradeSource();
  const group = COMMODITY_GROUPS.find((g) => g.key === 'semiconductors');
  const hs = group.hsHeadings[0];
  console.log(`\n  Commodity   HS ${hs} — ${wrap(HS_HEADINGS[hs], 56, 14)}`);
  console.log('  Reporter    South Korea (410), IMPORTS, 2023');
  console.log(dim('\n  fetching...'));

  const { rows, provenance } = await comtrade.getTradeFlows({
    reporterCode: 410,
    period: 2023,
    cmdCode: hs,
    flowCode: FlowCode.IMPORT,
  });

  const { countries, aggregates, world } = partitionPartners(rows);
  section('  TOP SOURCES');
  console.log(
    dim('    partner                         value      note'),
  );
  const top = [...countries, ...aggregates]
    .sort((a, b) => b.valueUsd - a.valueUsd)
    .slice(0, 6);
  for (const row of top) {
    const area = interpretArea(row.partnerCode);
    const note = area.isAggregate
      ? yellow(`[${area.association}${area.likelyMeans ? ` → ${area.likelyMeans}` : ''}]`)
      : green('[VERIFIED]');
    console.log(`    ${pad(area.name, 28)} ${rpad(usd(row.valueUsd), 10)}  ${note}`);
  }
  if (world) console.log(dim(`    ${pad('(World total)', 28)} ${rpad(usd(world.valueUsd), 10)}`));

  const shares = countries.map((r) => r.valueUsd);
  const hhi = herfindahlIndex(shares);
  const cr4 = concentrationRatio(shares, 4);

  section('  CONCENTRATION');
  console.log(
    dim(`    base: ${countries.length} individually-attributable countries ` +
      `(${aggregates.length} aggregate code(s) excluded)`),
  );
  console.log(`    HHI                  ${hhi.value.toFixed(4)}  ${bold(hhi.interpretation)}`);
  console.log(`    effective suppliers  ${hhi.effectiveCount.toFixed(1)}`);
  console.log(`    CR4                  ${(cr4.value * 100).toFixed(1)}%`);
  console.log(dim(`    formula: ${hhi.formula}`));

  const flagged = top.find((r) => interpretArea(r.partnerCode).isAggregate);
  if (flagged) {
    const area = interpretArea(flagged.partnerCode);
    section(`  ${yellow('WHY THE TOP SOURCE IS AN INFERENCE')}`);
    console.log(`    ${wrap(area.caveat, 68, 4)}`);
    console.log(dim('\n    evidence:'));
    for (const e of area.evidence) console.log(dim(`      - ${e}`));
  }

  printProvenance(provenance);
}

/* ---------------------------------------------------------------- *
 * Scenario 2 — disruption (offline, fixed network)
 * ---------------------------------------------------------------- */

function demoNetwork() {
  const prov = createProvenance({
    dataClass: DataClass.HISTORICAL,
    source: 'NGA World Port Index',
    dataset: 'world-port-index',
    license: 'US Government public domain',
    method: 'Port positions from WPI; legs authored for this demonstration.',
    limitations: [
      'This is a five-node demonstration network, not the full port graph.',
      'Leg distances are representative, not measured sailed distances.',
    ],
  });
  const port = (id, lat, lon, country) =>
    createNode({
      id,
      type: NodeType.PORT,
      name: id,
      position: { lat, lon },
      country,
      provenance: prov,
    });
  const leg = (id, from, to, km) =>
    createEdge({
      id,
      from,
      to,
      type: EdgeType.MARITIME_ROUTE,
      mode: TransportMode.SEA,
      distanceKm: km,
      provenance: prov,
    });
  return createGraph({
    nodes: [
      port('BUSAN', 35.1, 129.03, 'KOR'),
      port('SINGAPORE', 1.28, 103.85, 'SGP'),
      port('SUEZ', 30.0, 32.35, 'EGY'),
      port('CAPE_TOWN', -33.92, 18.42, 'ZAF'),
      port('ROTTERDAM', 51.9, 4.48, 'NLD'),
    ],
    edges: [
      leg('bs', 'BUSAN', 'SINGAPORE', 4600),
      leg('ss', 'SINGAPORE', 'SUEZ', 8300),
      leg('sr', 'SUEZ', 'ROTTERDAM', 6400),
      leg('sc', 'SINGAPORE', 'CAPE_TOWN', 8900),
      leg('cr', 'CAPE_TOWN', 'ROTTERDAM', 11500),
    ],
  });
}

function disruption() {
  heading('2. DISRUPTION SIMULATION  ·  offline, fixed demonstration network');

  const graph = demoNetwork();
  console.log(
    dim(`\n  ${graph.nodeCount} ports, ${graph.edgeCount} maritime legs. ` +
      'Busan → Rotterdam, via Suez or the Cape.'),
  );

  const result = simulateDisruption(
    graph,
    closeNode('SUEZ', { kind: DisruptionKind.CANAL_CLOSURE, label: 'Suez Canal unavailable' }),
    'BUSAN',
    'ROTTERDAM',
  );

  section('  BEFORE');
  console.log(`    ${result.before.nodeNames.join(' → ')}`);
  console.log(
    `    ${rpad(result.before.distanceKm.toLocaleString(), 8)} km` +
      `   ${rpad(Math.round(result.before.estimatedHours).toLocaleString(), 6)} h modelled` +
      `   ${result.before.transshipments} transshipment(s)`,
  );

  section(`  AFTER  ${dim('— Suez closed')}`);
  console.log(`    ${result.after.nodeNames.join(' → ')}`);
  console.log(
    `    ${rpad(result.after.distanceKm.toLocaleString(), 8)} km` +
      `   ${rpad(Math.round(result.after.estimatedHours).toLocaleString(), 6)} h modelled` +
      `   ${result.after.transshipments} transshipment(s)`,
  );

  section('  DELTA');
  console.log(
    `    additional distance  ${red(`+${result.delta.additionalDistanceKm.toLocaleString()} km`)}` +
      `  (×${result.delta.distanceRatio.toFixed(3)})`,
  );
  console.log(
    `    additional time      ${red(`+${Math.round(result.delta.additionalHours).toLocaleString()} h`)}` +
      dim(`  ≈ ${(result.delta.additionalHours / 24).toFixed(1)} days, modelled`),
  );
  console.log(dim('\n    time assumptions:'));
  for (const a of result.after.timeAssumptions) console.log(dim(`      - ${a}`));

  section('  ALTERNATIVES');
  for (const alt of result.alternatives) {
    const label =
      alt.classification.kind === 'GEOGRAPHIC_ALTERNATIVE'
        ? yellow('GEOGRAPHIC only')
        : green('OPERATIONALLY VALIDATED');
    console.log(`    ${pad(alt.nodeNames.join(' → '), 48)} ${label}`);
  }
  console.log(dim(`\n    ${wrap(result.alternatives[0].classification.reason, 68, 4)}`));

  const reach = propagate(graph, closeNode('SUEZ'));
  section('  PROPAGATION');
  console.log(`    DIRECT     ${reach.direct.map((n) => n.name).join(', ') || '—'}`);
  console.log(`    SECONDARY  ${reach.secondary.map((n) => n.name).join(', ') || '—'}`);
  console.log(`    TERTIARY   ${reach.tertiary.map((n) => n.name).join(', ') || '—'}`);
  console.log(`    countries  ${reach.exposedCountries.join(', ')}`);
  console.log(
    dim(`\n    ${wrap(reach.provenance.limitations[0], 68, 4)}`),
  );

  section('  SCENARIO COMPARISON  (worst first)');
  const ranked = compareScenarios(
    graph,
    [
      closeNode('SUEZ', { kind: DisruptionKind.CANAL_CLOSURE, label: 'Suez closed' }),
      reduceNodeCapacity('SUEZ', 0.5, { label: 'Suez at 50% capacity' }),
      closeNode('SINGAPORE', { label: 'Singapore closed' }),
    ],
    'BUSAN',
    'ROTTERDAM',
  );
  for (const r of ranked) {
    const verdict = r.severed
      ? red('ROUTE SEVERED')
      : `cost ×${r.costRatio.toFixed(2)}`;
    console.log(`    ${pad(r.label, 34)} ${verdict}`);
  }

  section('  NETWORK CENTRALITY');
  const bc = betweennessCentrality(graph, { normalise: false });
  const ranking = [...bc.values.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  for (const [id, value] of ranking) {
    console.log(`    ${pad(id, 14)} betweenness ${value.toFixed(2)}`);
  }
  console.log(dim(`    formula: ${bc.formula}`));

  printProvenance(result.provenance, { limit: 5 });
}

/* ---------------------------------------------------------------- *
 * Scenario 3 — forecast + anomaly (live, paced)
 * ---------------------------------------------------------------- */

async function forecastScenario() {
  heading('3. FORECAST vs BASELINE  ·  live UN Comtrade, ~15 s');

  const comtrade = createComtradeSource();
  const periods = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023];
  console.log('\n  South Korea, HS 8542 exports to World, 2015–2023');
  console.log(
    dim('  The preview endpoint permits one period per call, so this is ' +
      `${periods.length} sequential calls.`),
  );

  const { series, failures } = await comtrade.getTimeSeries(
    { reporterCode: 410, cmdCode: '8542', flowCode: FlowCode.EXPORT, partnerCode: 0 },
    periods,
    {
      delayMs: 1500,
      onProgress: (done, total) => {
        if (process.stdout.isTTY) {
          process.stdout.write(dim(`\r  fetching ${done}/${total}...`));
        }
      },
    },
  );
  if (process.stdout.isTTY) process.stdout.write('\r' + ' '.repeat(40) + '\r');
  if (failures.length > 0) {
    console.log(yellow(`  ${failures.length} period(s) failed: ` +
      failures.map((f) => f.period).join(', ')));
  }

  const values = [];
  const labels = [];
  for (const entry of series) {
    const row = entry.rows[0];
    if (row) {
      values.push(row.valueUsd);
      labels.push(entry.period);
    }
  }

  section('  OBSERVED');
  for (let i = 0; i < values.length; i += 1) {
    const bar = '█'.repeat(Math.round(values[i] / 1e9 / 4));
    console.log(`    ${labels[i]}  ${rpad(usd(values[i]), 9)}  ${dim(bar)}`);
  }

  const anomalies = detectAnomalies({
    values,
    periods: labels,
    mode: 'change',
    threshold: 2.5,
    seriesLabel: 'KOR HS8542 exports',
  });
  section('  ANOMALY DETECTION  (robust z on log year-on-year change)');
  if (!anomalies.assessable) {
    console.log(`    ${yellow('cannot assess')} — ${anomalies.reason}`);
  } else if (anomalies.anomalies.length === 0) {
    console.log(dim('    none at threshold 2.5 — the series is volatile throughout,'));
    console.log(dim('    so no single year stands out against the median change.'));
  } else {
    for (const a of anomalies.anomalies) {
      console.log(
        `    ${a.period}  ${a.direction}  ${a.percentChange.toFixed(1)}%  ` +
          dim(`(robust z ${a.robustZ.toFixed(2)})`),
      );
    }
  }

  const result = forecast({
    values,
    periods: labels,
    horizon: 3,
    unit: 'current US$',
    seriesLabel: 'KOR HS8542 exports',
  });

  section('  FORECAST 2024–2026  ·  every model measured against baselines');
  console.log(
    dim('    method          2024      2025      2026    out-of-sample MAE'),
  );
  const line = (method, point, metrics, isModel) => {
    const mae = metrics ? usd(metrics.mae) : 'n/a';
    const name = isModel ? bold(pad(method, 14)) : pad(method, 14);
    const points = point.map((v) => rpad(usd(v), 9)).join(' ');
    const winner = result.recommended?.method === method ? green('  ← recommended') : '';
    return `    ${name}${points}   ${rpad(mae, 8)}${winner}`;
  };
  for (const b of result.baselines) {
    console.log(line(b.method, b.point, b.backtest.metrics, false));
  }
  if (result.model) {
    console.log(line(result.model.method, result.model.point, result.model.backtest.metrics, true));
    if (result.model.interval) {
      const iv = result.model.interval;
      console.log(
        dim(`\n    ${iv.nominalCoverage} interval for 2024: ` +
          `${usd(iv.lower[0])} … ${usd(iv.upper[0])}`),
      );
      console.log(dim(`    ${wrap(iv.caveat, 66, 4)}`));
    }
  }
  const verdict =
    result.modelBeatsBaseline === true
      ? green('the model beat every baseline out of sample')
      : result.modelBeatsBaseline === false
        ? yellow('a simple baseline won — use the baseline')
        : dim('not enough data to validate out of sample');
  console.log(`\n    verdict: ${verdict}`);
  if (result.reason) console.log(dim(`    note: ${wrap(result.reason, 66, 4)}`));

  printProvenance(result.provenance);
}

/* ---------------------------------------------------------------- *
 * Scenario 4 — economic context (live)
 * ---------------------------------------------------------------- */

async function economy() {
  heading('4. ECONOMIC CONTEXT  ·  live World Bank');

  const wb = createWorldBankSource();
  const economies = ['KOR', 'JPN', 'CHN', 'VNM'];
  console.log(`\n  ${economies.join(', ')} — GDP and trade openness`);
  console.log(dim('  fetching...'));

  const gdp = await wb.getIndicator({
    iso3: economies,
    indicator: INDICATORS.GDP_CURRENT_USD.code,
    startYear: 2023,
    endYear: 2023,
  });
  const trade = await wb.getIndicator({
    iso3: economies,
    indicator: INDICATORS.TRADE_PCT_GDP.code,
    startYear: 2023,
    endYear: 2023,
  });

  const tradeBy = new Map(trade.observations.map((o) => [o.iso3, o.value]));
  section('  2023');
  console.log(dim('    economy                    GDP     trade % of GDP'));
  for (const o of gdp.observations.sort((a, b) => b.value - a.value)) {
    const t = tradeBy.get(o.iso3);
    console.log(
      `    ${pad(o.country, 20)} ${rpad(`$${(o.value / 1e12).toFixed(2)}T`, 8)}` +
        `      ${t === undefined ? dim('DATA UNAVAILABLE') : `${t.toFixed(1)}%`}`,
    );
  }
  console.log(dim(`\n    unit: ${INDICATORS.GDP_CURRENT_USD.unit}`));
  printProvenance(gdp.provenance, { limit: 3 });
}

/* ---------------------------------------------------------------- *
 * Entry
 * ---------------------------------------------------------------- */

const SCENARIOS = {
  concentration,
  disruption,
  forecast: forecastScenario,
  economy,
};

async function main() {
  const requested = process.argv[2];
  console.log(bold('\n  GLOBAL SUPPLY CHAIN EYE — engine demonstration'));
  console.log(
    dim('  The supply-chain UI is not built yet (docs/PHASED_PLAN.md).\n' +
      '  This is what the engine actually produces.'),
  );

  if (requested && !SCENARIOS[requested]) {
    console.error(
      red(`\n  Unknown scenario: ${requested}`) +
        `\n  Available: ${Object.keys(SCENARIOS).join(', ')}\n`,
    );
    process.exitCode = 1;
    return;
  }

  const toRun = requested ? [requested] : Object.keys(SCENARIOS);
  for (const name of toRun) {
    try {
      await SCENARIOS[name]();
    } catch (error) {
      console.error(red(`\n  ${name} failed: ${error.message}`));
      if (error.retryable) {
        console.error(
          yellow('  This is a rate limit or upstream outage. Wait a minute and retry.'),
        );
      }
      process.exitCode = 1;
    }
  }
  console.log('');
}

main();
