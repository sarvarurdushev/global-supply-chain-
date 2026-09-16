# Phased Implementation Plan

Maps §46 of the brief onto this repository. **Every phase gates on `npm test`,
`npm run build` and `npm run check:boundaries` staying green, with no regression in
inherited God's Eye View behaviour.**

| Phase | Scope | Status |
| --- | --- | --- |
| **1** | Audit God's Eye View; availability matrix; licence matrix | ✅ **complete** |
| **2** | Preserve GEV: import base, verify tests/build/boundary gates | ✅ **complete** — 4136 pass / 0 fail |
| **3** | Supply-chain data foundation: provenance model, graph model, reference data, Comtrade + World Bank clients | ✅ **complete** |
| **4** | Trade visualization: flow rendering, commodity selector, timeline, charts | ⬜ planned |
| **5** | Supply-chain graph: upstream/downstream traversal, dependency views, production regions | 🟡 **engine complete, UI planned** |
| **6** | Live transport fusion with explicit LIVE/HISTORICAL/MODELLED separation | 🟡 **provenance model complete, fusion UI planned** |
| **7** | Disruption engine: node/edge closure, capacity reduction, alternative paths | ✅ **engine complete** |
| **8** | Analytics: centrality, concentration, dependency, resilience | ✅ **complete** |
| **9** | ML: forecasting, anomaly detection, clustering — all baseline-compared | ✅ **complete** |
| **10** | Geopolitical / event layer | ⬜ planned |
| **11** | Voice: supply-chain action schemas + handlers | ⬜ planned |
| **12** | Polish: camera, HUD, transitions, performance, error states | ⬜ planned |

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

## What is deliberately not built yet

Phases 4, 10, 11 and 12 are UI and integration work that depends on the engine layer landing
first. The engine (phases 3, 5, 7, 8, 9) is complete and tested because it is what the brief
calls "proving the data foundation" — it is portable, runs under `node --test`, and its
outputs are reproducible without a browser.
