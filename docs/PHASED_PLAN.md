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
| **5** | Supply-chain graph: upstream/downstream traversal, dependency views | 🟡 **engine + chokepoint/port graph complete; production regions planned** |
| **6** | Live transport fusion with explicit LIVE/HISTORICAL/MODELLED separation | 🟡 **badging shipped in the console; joint live+historical views planned** |
| **7** | Disruption engine: node/edge closure, capacity reduction, alternative paths | ✅ **engine complete** |
| **8** | Analytics: centrality, concentration, dependency, resilience | ✅ **complete** |
| **9** | ML: forecasting, anomaly detection, clustering — all baseline-compared | ✅ **complete** |
| **10** | Geopolitical / event layer | ⬜ planned — blocked on ACLED/EM-DAT keys, see availability matrix §3 |
| **11** | Voice: supply-chain action schemas + handlers | ✅ **complete** — 4 actions, layers voice-toggleable |
| **12** | Polish: camera, HUD, transitions, performance, error states | 🟡 **camera framing, error states and data-gap rendering done; cinematic tours planned** |

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

- **Production regions** (§21): needs per-commodity production data. USGS Mineral Commodity
  Summaries and FAOSTAT are identified but not integrated; exports are currently used as an
  explicitly-labelled proxy.
- **Geopolitical event layer** (§10/§15): ACLED and EM-DAT both require registered accounts
  (availability matrix §3). GDELT is reachable but rate-limited.
- **Country comparison UI** (§20): the clustering engine and World Bank client exist; the
  comparison panel does not.
- **Cinematic scene tours** for the §44 investigation: the director can do it, the scene pack
  is not authored.
- **Joint live + historical views** (§23): the badging is in place, but vessels and trade are
  not yet shown in one fused view.
