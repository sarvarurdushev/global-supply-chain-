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

## The full §44 investigation — RUNNABLE IN THE APP

`npm run dev`, open http://localhost:4173, dismiss the first-run card, and the supply-chain
console is the right-hand rail.

| Step | State | How |
| --- | --- | --- |
| Select SEMICONDUCTORS | 🟢 working | COMMODITY selector, 28 groups over real HS headings |
| Pick a reporting country and direction | 🟢 working | COUNTRY / DIRECTION selectors |
| Trade flows rendered on the globe | 🟢 working | INVESTIGATE draws great-circle arcs, width by value, and frames the reporter from orbit |
| Aggregate partners flagged, not hidden | 🟢 working | "Other Asia, nes" renders amber (INFERRED) with its caveat and evidence |
| Concentration analysis | 🟢 working | HHI, effective suppliers, CR4, with the formula shown |
| Ten-year change | 🟢 working | LOAD 2015–2023 SERIES; time machine slider re-runs any year |
| Forecast vs baselines | 🟢 working | Time-series chart with dashed forecast and shaded interval, plus the MAE table |
| Anomaly detection | 🟢 working | Robust z on log year-on-year change |
| Chokepoint map | 🟢 working | `chokepoints` layer; no-alternative chokepoints drawn in the critical colour |
| Major ports | 🟢 working | `supply-ports` layer, 417 ports from WPI |
| Simulate disruption | 🟢 working | WHAT IF panel: before/after routes, extra distance and modelled days, propagation tiers |
| Alternative routes | 🟢 working | Listed and labelled GEOGRAPHIC ONLY |
| Provenance panel | 🟢 working | Every result carries an expandable source/method/licence/limitations block |
| Voice control | 🟢 working | 4 actions; see below |
| Staged supply-chain route | 🟡 **5 of 10 stages** | `Analyze → Trade Route`. The other five are shown as explicit gaps with why and what would fix them |
| Environmental risk | 🟡 **national resolution** | `Analyze → Environmental Risk`. The mechanism is stated above the numbers; basin-level data is a bulk download and not integrated |
| Country borders | 🟢 working | 174 countries, Natural Earth 110m. An orientation aid, not an authority |
| One-click tracking | 🟢 working | Click any vessel, aircraft, satellite or transit vehicle. **Stop Following** in the top bar |
| Reset View | 🟢 working | Always in the top bar. Stops playback, releases the camera, drops the selection, returns home |
| Select a live vessel | 🟢 inherited | God's Eye View AIS layer, unchanged |
| Per-vessel commodity association | ⚪ **DATA UNAVAILABLE** | AIS carries no cargo field. The port card says so rather than guessing |
| Where is production? | 🟡 **export proxy** | MAP WORLD PRODUCTION ranks every reporting exporter. Verified live: 141 exporters for HS 8542 in 2023, Hong Kong and Singapore flagged as re-export hubs. Labelled EXPORT PROXY throughout — see below |
| Country comparison | 🟢 working | COMPARE COUNTRIES: World Bank structural indicators plus k-means clustering with a silhouette score. Each indicator renders in its own unit |
| Events affecting supply chains | 🟢 working | LOAD CURRENT EVENTS: live GDACS hazards, linked to ports and chokepoints within 500 km. Verified live: 100 events, 18–19 exposed |
| Authored cinematic tour | 🟢 working | SCENES → "Supply Chain Eye — Semiconductors", 7 shots. The tour drives the console as it plays |
| Per-commodity production data | ⚪ **DATA UNAVAILABLE** | USGS is PDF-only, FAOSTAT needs a key. The map says EXPORTS, NOT PRODUCTION rather than implying otherwise |
| Conflict, strikes, port closures | ⚪ **DATA UNAVAILABLE** | GDACS is natural hazards only; ACLED and EM-DAT need accounts. The layer states that an absent marker is not evidence of absence |

### Voice, verified in the running app

Driven through `window.__godsEyeView.supplyChainActions`, which is what the Realtime runner
calls. Actual spoken output:

> **"Show semiconductor imports for Korea in 2023."**
> Semiconductors (integrated circuits) imports for KOR in 2023. Largest: Other Asia, nes, an
> aggregate code at $17.3B; China at $16.8B; Japan at $5.1B. Concentration is highly
> concentrated, about 3.5 effective partners. **This is historical UN Comtrade data, not live.**

> **"Show Taiwan's semiconductor trade."**
> **Taiwan does not report trade to UN Comtrade, so I cannot show its own figures.** Its trade
> is only visible through what its partners report.

> **"Why do you think that?"**
> These figures come from UN Comtrade, /api/supplychain/trade?reporter=410&period=2023&
> cmd=8542&flow=M. UN Comtrade annual data lags its reference period by 1-2 years… Note also
> that Other Asia, nes is an aggregate code. Code 490 … **is an inference, not a statement by
> the data.**

> **"Simulate a Suez Canal disruption."**
> Simulated closure of Suez Canal. The route reroutes via Keppel (East Singapore), Cape of
> Good Hope, adding 6,986 kilometres and about 9.2 modelled days. **This is a model result and
> the alternative is geographic, not commercially validated.**

Every answer is assembled from what the console actually loaded. The handlers never answer
from the model's own knowledge, and when nothing is loaded they say so.

---

## Scenario 7 — The rebuilt interface (RUNNABLE NOW)

`npm run dev`, open http://localhost:4173. No first-run card to dismiss — the
home view **is** the orientation.

| Flow | What to do | What proves it |
| --- | --- | --- |
| 1 | Read the home view | "This is a system for seeing how the world moves goods", the six-stage chain as clickable stages, live layer counts |
| 2 | Analyze → Country | Trade paths, nearby ports, and what is not there |
| 3 | Analyze → Product Supply Chain → Semiconductors | 105 partners; "Other Asia, nes" at $17.3B labelled as an aggregate code read as Taiwan, which is an inference |
| 4 | Change product to Fertilizer — potassic | Canada first at $8.6B, HHI 0.460 |
| 5 | Global Overview → Strategic Chokepoints → Hormuz | Why it matters / what passes through / what happens if it closes, with transit volume as DATA UNAVAILABLE |
| 6 | Press "Run the closure scenario", then close it | The Gulf pair is **severed** — no maritime alternative, which is the real answer |
| 7 | Click any vessel on the globe | Selected and followed in one click, facts shown, cargo declared unavailable |
| 8 | Click any aircraft | Same, and the panel switches to Aircraft rather than staying on Ships |
| 9 | Track → Trains | City transit offered, freight rail declared absent in those words |
| 10 | Investigations → Nepal Flood, then play / pause / next / prev / stop | The flood is step 1 of 6, and you can stop at any moment |
| 11 | Press Reset View | Camera back to 24,000 km, selection dropped, playback stopped, panel home |
| 12 | Set country to Taiwan and press Show Trade Flows | It explains that Taiwan does not report, and offers a Retry |

All twelve are driven in a real browser by `npm run qa:workspace`, which is
committed and exits non-zero on the first failure. 15/15 checks pass.

Two more worth running:

- **Analyze → Trade Route**, then "Draw this chain on the globe". Korea to the
  Netherlands: 6 of 10 stages with no data at all, 8,787 km total of which 8,602
  km by sea, solid lines for sea and dashed for land.
- **Analyze → Environmental Risk**, country India, "Load indicators". 44.8%
  freshwater withdrawal with 44% of farmland irrigated, and the mechanism stated
  above the numbers. Try Egypt for 7,750% — real, not an error.

---

## Scenario 6 — The authored tour (RUNNABLE NOW)

`npm run dev`, open the **SCENES** panel, pick **Supply Chain Eye — Semiconductors**, press
play. Seven shots, about 58 seconds.

| # | Shot | What is on screen | Data class |
| --- | --- | --- | --- |
| 1 | World Trade In One Commodity | The whole planet, every partner arc for HS 8542 | 🟡 HISTORICAL |
| 2 | The Dependency | Korea, the reporter the arcs converge on | 🟡 HISTORICAL |
| 3 | The Gap Where Taiwan Should Be | The strait, held on an empty map | ⚪ **DATA UNAVAILABLE** |
| 4 | Malacca | Chokepoint and the ports around it | ⚫ REFERENCE |
| 5 | Suez Under Closure | The disruption simulation running | 🔵 SIMULATED |
| 6 | The Cape Reroute | Where the modelled path goes instead | 🔵 SIMULATED |
| 7 | What Is Happening Right Now | Live GDACS hazards over the port network | 🟢 LIVE |

Shot 3 is the point of the sequence, not an aside. Taiwan does not report to UN Comtrade, so
the tour flies to the strait and holds on nothing — it does not substitute a mirror estimate
and present it as Taiwan's own figure.

The tour drives the console as it plays: `src/scenes/packs/supplyChain.js` maps each shot
title to the console call that shot's frame needs, and `src/app/tools.js` subscribes the
runner to the director. The trade layer draws only what the console loaded, by design, so a
camera path on its own would fly over an empty globe.

While a scripted call runs, the console's own camera moves are suspended — the director owns
the camera during an authored scene. Without that, the Suez beat authored at 700 km landed at
2,500 km because the scenario fly-to overrode it.

**Verified in the running app**: all seven shots reached their authored camera position, with
the right layers enabled and the scripted data loaded (105 partners / 50 arcs on shots 1–3,
scenario present from shot 5, 100 GDACS events on shot 7). No console errors.
