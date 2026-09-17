# Phased Implementation Plan

Maps §46 of the brief onto this repository. **Every phase gates on `npm test`,
`npm run build` and `npm run check:boundaries` staying green, with no regression in
inherited God's Eye View behaviour.**

| Phase | Scope | Status |
| --- | --- | --- |
| **1** | Audit God's Eye View; availability matrix; licence matrix | ✅ **complete** |
| **2** | Preserve GEV: import base, verify tests/build/boundary gates | ✅ **complete** — 4136 pass / 0 fail |
| **3** | Supply-chain data foundation: provenance model, graph model, reference data, Comtrade + World Bank clients | ✅ **complete** |
| **4** | Trade visualization: flow rendering, commodity selector, timeline, charts | ✅ **complete** |
| **5** | Supply-chain graph: upstream/downstream traversal, dependency views | ✅ **complete** — engine, chokepoint/port graph, and the WHERE IS PRODUCTION? map (export proxy, labelled) |
| **6** | Live transport fusion with explicit LIVE/HISTORICAL/MODELLED separation | 🟡 **badging shipped in the console; joint live+historical views planned** |
| **7** | Disruption engine: node/edge closure, capacity reduction, alternative paths | ✅ **engine complete** |
| **8** | Analytics: centrality, concentration, dependency, resilience | ✅ **complete** |
| **9** | ML: forecasting, anomaly detection, clustering — all baseline-compared | ✅ **complete** |
| **10** | Geopolitical / event layer | 🟡 **natural hazards shipped via GDACS (live, no key); conflict and strikes still blocked** — availability matrix §3 |
| **11** | Voice: supply-chain action schemas + handlers | ✅ **complete** — 4 actions, layers voice-toggleable |
| **12** | Polish: camera, HUD, transitions, performance, error states | ✅ **complete** — camera framing, error states, data-gap rendering, and the authored 7-shot tour |
| **13** | Interface rebuild: own identity, navigation, vocabulary, layout, explanation layer | ✅ **complete** — see `docs/REBUILD_AUDIT.md` for all 44 requirements |

## Phase-1 deliverables (the brief's FINAL COMMAND, items 1–10)

| # | Deliverable | Where |
| --- | --- | --- |
| 1 | Repository architecture audit | `docs/PROJECT_ARCHITECTURE_AUDIT.md` |
| 2 | God's Eye View feature inventory | audit §5–§8 |
| 3 | Data-source inventory | audit §3, `DATA_SOURCES.md`, licence matrix §1–§2 |
| 4 | Data availability matrix | `docs/DATA_AVAILABILITY_MATRIX.md` |
| 5 | Licence matrix | `docs/DATA_LICENSE_MATRIX.md` |
| 6 | Proposed technical architecture | audit §14, `docs/ARCHITECTURE.md` |
| 7 | List of reusable modules | audit §10 |
| 8 | List of new modules | audit §12 |
| 9 | Features public data cannot support | audit §13, availability matrix §3 |
| 10 | Phased implementation plan | this document |

## Methodology documentation (§48)

| Document | State |
| --- | --- |
| `docs/ARCHITECTURE.md` | ✅ |
| `docs/DATA_SOURCES.md` (supply-chain layer; root file covers inherited) | ✅ |
| `docs/DATA_AVAILABILITY_MATRIX.md` | ✅ |
| `docs/DATA_LICENSE_MATRIX.md` | ✅ |
| `docs/SUPPLY_CHAIN_MODEL.md` | ✅ |
| `docs/DISRUPTION_MODEL.md` | ✅ |
| `docs/ROUTE_OPTIMIZATION.md` | ✅ |
| `docs/CONFIDENCE_METHODOLOGY.md` | ✅ |
| `docs/ML_METHODOLOGY.md` | ✅ |
| `docs/LIMITATIONS.md` | ✅ |
| `docs/DEMO_SCENARIOS.md` | ✅ |

## The interface

The supply-chain console ships as a right-rail panel in the inherited God's Eye View shell
(`src/ui/supplychain/console.js`), with three new globe layers registered in the normal
catalog: `trade-flows`, `supply-ports` and `chokepoints`. It is driven either by hand or by
the four voice actions in `src/voice/supplyChainActions.js`.

Trade data reaches the browser through `server/providers/supplychain.js`, which caches and
paces upstream calls — UN Comtrade 429s on back-to-back requests, so a browser talking to it
directly would be throttled part-way through a ten-year series.

## What is still not built

- **Per-commodity production data** (§21): the WHERE IS PRODUCTION? map ships, but it ranks
  **exports**, not production, and says so on every view. Real production data would need
  USGS Mineral Commodity Summaries (PDF and spreadsheets, no API) or FAOSTAT (key plus a
  34 MB bulk archive). Neither is integrated. Re-export hubs are individually flagged rather
  than corrected, because there is no basis for a correction.
- **Inland freight of any kind**: no open global dataset exists for freight rail,
  road-freight corridors, airport cargo tonnage or pipeline throughput. All four
  are listed in `Map Layers` under "Not Available" with what would be needed,
  because hiding them is how a user concludes the app forgot rather than that the
  data does not exist. City transit and road traffic ARE available at city scale
  and are a different thing, which the interface says in those words.
- **Five of the ten supply-chain stages** (§16): extraction, processing,
  manufacture, inland distribution and the final consumer. `Analyze → Trade
  Route` shows all ten and places five, with the other five present and
  explicitly empty. Drawing a plausible line to a plausible mine would have been
  the most convincing part of the picture and a complete fabrication.
- **Basin-level water stress** (§22): the resolution that actually matters, since
  a national figure averages a country's wet and dry halves. WRI Aqueduct
  publishes it by basin and is a bulk download rather than an API.
- **Conflict, strikes and port closures** (§15): GDACS covers natural hazards only and now
  drives the event layer with no key. It carries nothing human-caused — no strikes, port
  closures, sanctions or conflict — so the absence of a marker is not evidence that nothing
  happened, and the layer says exactly that. ACLED and EM-DAT still require registered
  accounts (availability matrix §3).
- **Joint live + historical views** (§23): the badging is in place, but vessels and trade are
  not yet shown in one fused view.
- **Complete world rankings for broad commodities**: the Comtrade preview endpoint caps every
  response at 500 rows without flagging it. The production loader detects the cap and halves
  its batch until every reporter's total is accounted for, but a single reporter whose own
  page is capped without a total in it is reported as incomplete rather than guessed at.

## The interface rebuild

Tracked requirement by requirement in `docs/REBUILD_AUDIT.md`: 28 done and
verified, 10 done as far as the data allows with the shortfall stated in the
interface, 6 not done with a stated data or scope reason.

The headline items:

- A left navigation rail with five sections and 21 entries, each carrying a
  plain-language name, a one-line description, and a badge when its data is
  partial or absent.
- **One** scroll region in the analysis panel. Cards never scroll. A unit test
  and `npm run qa:workspace` both fail if a second scroller appears.
- The inherited classification chrome, MGRS readout and first-run card hidden
  while the workspace is up, and fully restored by "Hide panels".
- Four investigations with real playback controls — play, pause, stop, restart,
  step forward and back, a progress bar and a clickable step list.
- A glossary, a data legend that explains certainty as well as shape, and a
  mandatory "why this matters" block on every data view.
- Country borders, a staged supply-chain route with its five unplaceable stages
  declared, and environmental risk joined to trade through a stated mechanism.

## Built since the first pass

- **WHERE IS PRODUCTION?** (§21) — world export ranking as a labelled production proxy, with
  HHI, re-export-hub flags and adaptive batching against the upstream row cap.
- **COMPARE COUNTRIES** (§20) — World Bank structural indicators plus k-means clustering with
  a silhouette score, each indicator rendered in its own unit.
- **EVENTS AFFECTING SUPPLY CHAINS** (§15) — GDACS live hazards on the globe, linked to the
  ports and chokepoints within 500 km and labelled as exposure, not impact.
- **Supply Chain Eye — Semiconductors** (§44) — a 7-shot authored tour that drives the
  console as it plays. `src/scenes/packs/supplyChain.js`.
