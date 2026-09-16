# Demo Scenarios

Every figure below was produced by running this repository's code against the live public
APIs. Reproduction commands are given so each can be re-run.

Where a scenario depends on interface work that is not built yet, it says so rather than
describing it as if it worked. See `docs/PHASED_PLAN.md`.

---

## Scenario 1 — Semiconductor dependency (RUNNABLE NOW)

**Question:** how concentrated are South Korea's integrated-circuit imports, and who supplies
them?

```js
import { createComtradeSource, FlowCode } from 'gods-eye-view/supplychain/sources/comtrade';
import { interpretArea, partitionPartners } from 'gods-eye-view/supplychain/reference/areas';
import { herfindahlIndex, concentrationRatio } from 'gods-eye-view/supplychain/centrality';

const comtrade = createComtradeSource();
const { rows, provenance } = await comtrade.getTradeFlows({
  reporterCode: 410,          // South Korea
  period: 2023,
  cmdCode: '8542',            // Electronic integrated circuits
  flowCode: FlowCode.IMPORT,
});
const { countries, aggregates, world } = partitionPartners(rows);
```

**Result, retrieved 2026-09-16:**

```
108 partner rows -> 105 countries + 2 aggregates + World total ($51.7B)

Other Asia, nes     $17.28B   [INFERRED -> Taiwan]
China               $16.82B
Japan                $5.06B
Singapore            $2.93B
USA                  $2.49B

HHI  = 0.2872  (Highly concentrated), effective suppliers = 3.5
CR4  = 80.4%
```

**What makes this a real finding rather than a chart:**

1. The **largest single source is an aggregate code**. Reading it as Taiwan is an inference,
   returned as `association: INFERRED` with its evidence, not as a verified figure.
2. **Partner code 158 (Taiwan) returns nothing.** Anyone querying Taiwan directly would
   conclude Korea imports no chips from Taiwan.
3. The HHI base **excludes aggregates**, so the concentration figure is over
   individually-attributable countries only. A naive sum would silently double-count.
4. Every row carries `isReported: false` where it is a Comtrade-derived aggregate, and that
   reaches the provenance panel.

---

## Scenario 2 — Canal closure and the Cape reroute (RUNNABLE NOW)

**Question:** what happens to an Asia–Europe route if a canal becomes unavailable?

```js
import { createGraph, createNode, createEdge } from 'gods-eye-view/supplychain/graph';
import { closeNode, simulateDisruption, propagate } from 'gods-eye-view/supplychain/disruption';

const result = simulateDisruption(graph, closeNode('CANAL'), 'BUSAN', 'ROTTERDAM');
```

**Result** (network as constructed in `disruption.test.mjs`):

```
BEFORE  Busan -> Singapore -> Canal -> Rotterdam      19,300 km
AFTER   Busan -> Singapore -> Cape   -> Rotterdam     25,000 km

additional distance   +5,700 km
distance ratio        1.295
additional hours      modelled, at 14 kn assumed service speed
transshipments        unchanged

data class            🟠 SIMULATED
alternatives          all labelled GEOGRAPHIC_ALTERNATIVE
```

**What the system refuses to say:** how much this costs, how long recovery takes, or that
any carrier would actually sail the Cape route. `classifyAlternative()` names the missing
inputs — capacity and observed utilisation on every leg.

A **capacity reduction** variant shows the non-binary case: cutting canal capacity by 10%
keeps the original routing at higher cost (`additionalDistanceKm: 0`, `costRatio > 1`);
cutting it by 50% makes the Cape route preferable.

---

## Scenario 3 — Forecast with baseline comparison (RUNNABLE NOW)

**Question:** what does a model say about Korea's semiconductor exports, and does it beat
just guessing?

```js
const { series } = await comtrade.getTimeSeries(
  { reporterCode: 410, cmdCode: '8542', flowCode: FlowCode.EXPORT, partnerCode: 0 },
  [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023],
  { delayMs: 1500 },   // one call per period; the endpoint permits only one
);
const result = forecast({ values, periods, horizon: 3, unit: 'current US$', seriesLabel: '...' });
```

**Observed series (USD billions):**

```
2015  52.2    2018 109.8    2021 109.3
2016  52.3    2019  79.1    2022 112.8
2017  86.1    2020  82.9    2023  86.1
```

**Result:**

```
METHOD         2024     2025     2026    out-of-sample MAE
naive          86.1     86.1     86.1    $21.24B
drift          90.4     94.6     98.9    $22.12B
mean           85.6     85.6     85.6    $22.16B
holt-damped    96.5     97.2     97.9    $16.31B   <- recommended

95% interval 2024: $51.9B .. $141.1B
modelBeatsBaseline: true
data class: 🟠 SIMULATED
```

**Why the wide interval is the honest answer:** the series moved between $52B and $113B in
nine years. An interval that looked tight would be lying. The model did genuinely beat every
baseline out of sample, which is a real result — and had it not, `modelBeatsBaseline: false`
would have said so and the baseline would be recommended.

---

## Scenario 4 — Anomaly detection on a volatile series (RUNNABLE NOW)

Run against the same Korea HS 8542 export series at threshold 2.5:

```
assessable: true
no anomalies at threshold 2.5
data class: 🟡 INFERRED
```

**This is the correct result, not a failure.** The series is volatile throughout — it roughly
doubled in 2017, fell 28% in 2019, rose 32% in 2021 — so no single year stands out against
the median year-on-year change. A detector that flagged something here would be responding to
the threshold, not to the data.

The provenance states it: *"the absence of a flag does not mean nothing happened."*

---

## Scenario 5 — Network resilience (RUNNABLE NOW)

```js
import { betweennessCentrality, alternativeRouteAvailability } from 'gods-eye-view/supplychain/centrality';
```

Betweenness identifies which nodes carry a disproportionate share of shortest paths;
`alternativeRouteAvailability()` removes each intermediate node on the best path in turn and
reports the fraction that remain reroutable plus the cost ratio of the best survivor.

Every result ships `formula`, `inputs` and `limitations`, and none of them is combined into a
composite risk score — see `docs/SUPPLY_CHAIN_MODEL.md`.

---

## The full §44 investigation — NOT YET RUNNABLE

The brief's flagship demo moves WORLD → commodity → country → port → vessel → simulation →
forecast on the globe. The **analytical half exists and is demonstrated above**. The
**interface half does not**:

| Step | State |
| --- | --- |
| Select SEMICONDUCTORS, see production regions | ⬜ Phase 4/5 UI not built |
| Trade flows rendered on the globe | ⬜ Phase 4 not built |
| Drill to South Korea, then Busan | ⬜ Phase 4 not built |
| Select a live vessel, see public telemetry | 🟢 inherited from God's Eye View and working |
| Commodity association with evidence | 🟡 framework built and tested; no UI |
| Historical trade relationship | 🟡 data client built; no timeline UI |
| Simulate maritime disruption | 🟡 engine built and tested; no WHAT IF panel |
| Alternative routes | 🟡 engine built and tested; no UI |
| Countries most exposed | 🟡 `propagate()` returns `exposedCountries`; no UI |
| Ten-year change | 🟡 `getTimeSeries()` works; no time machine UI |
| Forecast | 🟡 built and tested; no chart |

🟢 working · 🟡 engine only · ⬜ not built

Stating this plainly is the point. The engine is real and its outputs are reproducible
today; the interface is Phase 4 onward and has not been written.
