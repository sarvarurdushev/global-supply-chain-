# Nepal 2015 — Codebase Assessment and Implementation Plan

Companion to [`NEPAL_2015_DATA_INVENTORY.md`](NEPAL_2015_DATA_INVENTORY.md),
which holds the measured dataset evidence. This document answers: what exists,
what is reusable, what is missing, and in what order to build it.

---

## 1. Current architecture

A Vite browser application over CesiumJS, with a Node provider layer that runs
as middleware inside the same process (dev and production alike).

```
 browser ── Cesium globe ── layer manager (35 layers, uniform contract)
    │                            │
    │                       src/disaster/*   investigation state machine
    │                       src/supplychain/*  graph + routing + centrality
    │
    └── /api/* ── server/providers/* ── Overpass, OSRM, TomTom, FIRMS,
                  (Vite plugins)        OpenSky, AIS, GTFS, terrain, trade
```

| Area | Source lines | Tests |
| --- | ---: | ---: |
| `src/layers` (28 layer families) | 58,464 | 7,519 |
| `src/data` | 31,921 | 53,331 |
| `src/supplychain` (analysis engine) | 31,099 | 5,266 |
| `src/ui` | 21,254 | 4,603 |
| `server` (16 providers) | 12,933 | 595 |
| **`src/disaster`** | **7,898** | **2,272** |
| `src/workspace` (panel, nav) | 6,178 | 1,991 |

**No database.** State is in-memory per session; datasets are bundled JS modules
or fetched live. **No ingestion pipeline** — the two things this brief most
requires are the two things that do not exist.

---

## 2. KEEP / MODIFY / REBUILD / ADD

### KEEP — working, tested, directly reusable

| Component | Why it matters here |
| --- | --- |
| `src/supplychain/graph.js` | `createGraph/createNode/createEdge`, `withScenario` — the G=(V,E) model PHASE 15 asks for **already exists** |
| `src/supplychain/routing.js` | `shortestPath`, `aStarPath`, **`kShortestPaths`**, `routeDistanceKm`, `classifyAlternative` — PHASE 17's alternative-route analysis |
| `src/supplychain/centrality.js` | **`betweennessCentrality`** with a `methodology()` export — PHASE 18 asks for exactly this metric, and it is built and tested |
| `src/disaster/response.js` | `buildRoadGraph` with two-pass junction splitting (measured: 42 components → 14, 80 % → 95 % reachable). This is hard-won and must not be rewritten |
| `src/disaster/sources/usgs.js` | Six ComCat products, with the GeoRSS and `population="0"` traps already handled |
| `src/disaster/hazards.js` | 12 hazard types, 8 geometry kinds, agency intensity scales |
| `src/disaster/investigation.js` | Depth ladder + phase machine, independent axes — PHASE 7's progressive zoom |
| `src/disaster/timeline.js` | 11 phases, per-phase evidence and unavailability reasons — PHASE 24 |
| `src/supplychain/provenance.js` | `DataClass`, `createProvenance`, `createEvidence`, `dataGap` — PHASE 28's labelling **already has a vocabulary** |
| `server/providers/overpass.js` | Validating, caching, mirror-rotating OSM proxy with the UA the API requires |
| `src/layers/*` contract | `init/enable/disable/update/destroy/getStats/getAnalystRecords` — 35 layers; new layers inherit toggling, share links, the tray |
| `src/ui/styles/identity.css` | The green intelligence identity from §22 is **done** |
| Gate infrastructure | 4,827 tests, two boundary checkers, browser QA suite |

### MODIFY — adapt rather than replace

| Component | Change |
| --- | --- |
| `src/disaster/catalogue.js` | Nepal becomes the deep case, not one of two demo cases |
| `src/disaster/impact.js` | `applyCitedStatus` ships **empty**; feed it the 179 NGA blocked roads, 5 bridges, 51 landslides |
| `DATA_AVAILABILITY_MATRIX.md` row 17 | **Factually wrong for this event** — rewrite (see inventory §0) |
| `src/disaster/session.js` | Loads 7 USGS products; extend to the new datasets with the same per-product status model |
| `src/disaster/views.js` | Add analysis views; keep the `sourced()` refusal-to-print-unsourced mechanism |
| `src/supplychain/chain.js` | Re-frame as the **illustrative humanitarian logistics** scenario of PHASE 20, labelled `SCENARIO` |

### REBUILD — genuinely incompatible

Nothing. No component needs deletion. The gap is additive.

### ADD — completely missing

1. **An ingestion pipeline.** Nothing downloads, validates, cleans or versions a dataset today.
2. **A processed-data store.** No database, no intermediate artefacts.
3. **Raster analysis.** WorldPop and the DEM are GeoTIFF; nothing in the repo reads a GeoTIFF.
4. **Vector-format readers.** Shapefile and GeoPackage are unsupported.
5. **A CRS engine.** Geographic and UTM 45N appear in the same package; no reprojection exists.
6. **Zonal statistics.** Population-grid × polygon aggregation does not exist.
7. **A data-quality logger.** Validation failures are handled ad hoc.
8. **An analysis registry.** PHASE 26/27's per-module metadata object.
9. **Raster change detection.** For the Landsat pair.
10. **Accessibility analysis.** Population → hospital travel time before/after.

---

## 3. Recommended sources (measured — see the inventory for evidence)

| Module | Source | Status |
| --- | --- | --- |
| Event + aftershocks | USGS FDSN / ComCat | ✅ 200; 316 events M≥2.5 in one year |
| Shaking | USGS ShakeMap `cont_mmi.json` | ✅ Already integrated |
| Building damage | UNOSAT `EQ20150425NPL_shp.zip` | ✅ 3.68 MB, 4,583 points |
| Damage grading | Copernicus EMSR125, 8 AOIs | ✅ In the same package |
| **Observed road/bridge damage** | NGA layers in the same package | ✅ **179 / 5 / 51** |
| Boundaries | geoBoundaries ADM2 (2006, 75 districts) | ✅ 147 KB, public domain |
| Population | WorldPop `npl_ppp_2015.tif` | ✅ 91.4 MB |
| Official comparator | OCHA `PGA_AffectedDistricts_POP.csv` | ✅ 66 districts |
| Infrastructure | Overpass proxy + HOT health facilities | ✅ Proxy already built |
| Imagery | Landsat C2-L2 via USGS STAC | ✅ 2015-03-29 → 2015-06-01 |
| Terrain | Copernicus DEM GLO-30 (AWS COG) | ✅ 44.9 MB tile |
| Economy | World Bank API + PDNA (PDF, transcribed) | ✅ / ⚠️ |

---

## 4. Proposed data architecture

No server database. The analysis is **reproducible offline, versioned in git, and
served as static artefacts** — which suits a university deliverable better than a
live database, because the examiner can re-run it.

```
data/
  registry/         one provenance record per dataset (the §18 schema)
  raw/              exactly as downloaded, never edited      [gitignored]
  interim/          decompressed, reprojected to EPSG:4326   [gitignored]
  processed/        analysis-ready, small, committed
  reports/          quality logs + analysis registry entries, committed

pipelines/          node scripts: fetch → validate → clean → transform
analysis/           pure functions, no I/O, unit-testable
```

**CRS policy.** Store and serve EPSG:4326. Compute areas and distances in
**EPSG:32645 (UTM 45N)**, which covers the study area — NGA layers arrive in it
already. Never compute area from degrees.

**Checked at ingest** (§19): missing/invalid coordinates, out-of-Nepal points,
duplicate geometries, invalid timestamps, empty damage classes (19 in the
Kathmandu grading), thousands-separator numbers (`"275,903"`), CRS mismatch,
null geometries. Failures are **logged with a count and a sample**, never dropped
silently.

---

## 5. Analysis pipeline

```
USGS ──────────┐
UNOSAT/EMSR125 ├──→ ingest → validate → clean → reproject ──→ processed/
NGA            │                                                  │
geoBoundaries  │                                                  ↓
WorldPop       │                                         ┌──→ analysis modules
OSM/Overpass   │                                         │    A1 seismic
Landsat STAC   │                                         │    A2 exposure
Copernicus DEM ┘                                         │    A3 damage
                                                          │    A4 infrastructure
                    each module emits:                    │    A5 terrain
                      result + provenance + registry entry│    A6 network
                                                          │    A7 accessibility
                    ↓                                     │    A8 logistics
             visualization API ──→ existing layers/views ─┘    A9 economic
```

Eleven modules, each with the PHASE 26 metadata record (question, inputs,
method, formula, outputs, visualization, limitations, data class).

---

## 6. Implementation plan

| Stage | Work | Verifiable when |
| --- | --- | --- |
| **0** | Registry schema, quality logger, `data/` layout | Schema tests pass |
| **1** | Shapefile + DBF reader, CRS transform, GeoTIFF reader | Round-trip tests against the real UNOSAT file |
| **2** | Ingest: USGS, UNOSAT/EMSR125/NGA, geoBoundaries, WorldPop, OCHA CSV, DEM | `processed/` reproduces the counts in the inventory |
| **3** | A1 seismic (aftershock magnitude/depth/time distributions) | 316-event count reproduced |
| **4** | A2 population exposure — zonal stats, WorldPop × MMI × district | **Compared against OCHA's official figure** |
| **5** | A3 damage — 4,583 points by class, district, distance from epicentre | Class totals match §2.1 exactly |
| **6** | A4 + A6 — feed NGA closures into `applyCitedStatus`; re-solve routes | Lifecycle legend stops being all zeroes |
| **7** | A6b betweenness on the Nepal graph; A7 hospital accessibility before/after | Centrality already tested; new fixtures |
| **8** | A5 terrain — slope from DEM, correlated with landslide polygons | Slope distribution inside vs outside the 51 polygons |
| **9** | A10 Landsat change detection, scoped honestly to 30 m | NDVI/brightness delta over landslide AOIs |
| **10** | A8 logistics + A9 economic, both labelled | Scenario badge present on every figure |
| **11** | Wire all into the 17-scene Nepal journey; methodology document | Browser QA drives the full flow |

---

## 7. Limitations to state now, not at the end

1. **Sentinel-2 did not exist on 25 April 2015.** No S2 before-image is possible.
2. **Landsat is 30 m.** Building collapse is not detectable. Our change detection covers landslides and land-cover change only; building damage comes from UNOSAT vectors and must be labelled as such.
3. **Damage data covers 8 AOIs, not 75 districts.** Their counts must never be extrapolated nationally.
4. **All 4,583 UNOSAT records are "Not yet field validated."**
5. **The district system changed after 2015.** ADM2/2006 (75 districts) is the only correct frame; modern boundaries need a crosswalk.
6. **UNOSAT and Copernicus damage vocabularies differ** and cannot be merged into one scale without a documented, arguable mapping.
7. **NGA road/bridge/landslide layers are single-date snapshots** (6–7 May 2015), not a time series — the timeline cannot animate their recovery.
8. **PDNA figures are PDF.** Transcribed with page citations, never computed.
9. **HOT roads (228 MB) and buildings (834 MB) cannot be fetched at runtime** on the hosted instance; a study-area extract must be pre-processed offline.
10. **No relief-delivery data exists.** All logistics and evacuation output stays `SCENARIO`.
