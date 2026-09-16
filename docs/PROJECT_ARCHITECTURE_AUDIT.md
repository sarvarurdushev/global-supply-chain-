# Project Architecture Audit

**Subject:** `bilawalsidhu/gods-eye-view` @ `a65d9d85f1faa06ae7df235d7fa8a29b026b7a5b`
(2026-09-15, "Merge pull request #616 from bilawalsidhu/feat/director-sharing")
**Purpose:** establish what Global Supply Chain Eye inherits, extends, and must build new.
**Audit performed:** 2026-09-16, against a full clone, reading source — not just docs.

This is Phase 1 of `docs/PHASED_PLAN.md`. No supply-chain feature was implemented before
this audit was written.

---

## 0. Verification baseline (measured, not claimed)

The upstream tree was imported into this repository and exercised on the environment's
Node 22.22.2 before a single line was changed:

| Gate | Command | Result |
| --- | --- | --- |
| Unit suite | `npm test` | **4136 pass / 0 fail / 1 skipped** |
| Allocation microbenchmarks | (part of `npm test`) | **2 self-skipped** — budgets calibrated for Node 24 |
| Production build | `npm run build` | **succeeds** (~6.2 s) |
| Import-direction + package-boundary gates | `npm run check:boundaries` | **passes** |

`package.json` declares `engines: >=24.14.0 <25 \|\| >=26 <27`. This environment runs
Node 22.22.2, so `npm install` emits `EBADENGINE`. **In practice the portable suite runs
clean anyway**, because the only Node-24-specific tests are the two GC-bracketed allocation
probes in `scripts/run-unit-tests.mjs`, which detect an uncalibrated runtime and skip with a
warning rather than fail. This is a real but bounded constraint — see §9.

**Measured scale:** 719 `.js` + 423 `.mjs` files, ~168,465 lines of JavaScript, 326
`*.test.mjs` files, 99 MB on disk (68 MB of that is `docs/media/` demo GIFs, excluded from
this repository — see §11).

---

## 1. Existing architecture

God's Eye View is a **browser-first Cesium application with a thin Node provider tier**. It
is not a framework app: there is no React/Vue, no store library, no router. State lives in
explicit factory closures, and the whole thing is wired by hand through a lifecycle
controller.

### 1.1 The construction contract

`src/app/application.js` exports `createApplication`, documented in `docs/APPLICATION.md`.
It is a four-phase lifecycle controller and nothing else — importing it creates no viewer,
discovers no configuration, starts no requests, and attaches no listeners.

```
createScene    ({ signal, defer })                        → { viewer, ... }
      ↓
createControls ({ scene, signal, defer })                 → controls
      ↓
createData     ({ scene, controls, signal, defer })       → data
      ↓
createTools    ({ scene, controls, data, signal, defer }) → tools
```

Key properties, all of which the supply-chain work must respect:

- **`defer(cleanup)` is registered immediately after acquiring a resource, before any
  `await`.** Within a phase, cleanup runs in reverse order. Across phases, teardown runs
  **tools → controls → data → scene** (controls must cancel restoration while their data
  manager and viewer are still alive).
- **`start()` and `destroy()` are idempotent**, each returning the same promise on repeated
  calls. `destroy()` aborts the shared `AbortSignal`, waits for an in-flight constructor to
  settle, then runs every cleanup. Cleanup failures are collected into an `AggregateError`
  rather than aborting the remaining callbacks.
- **A constructor failure triggers the same cleanup path before rejecting startup.**
- `getState()` returns a frozen `{ status, phase }`; `subscribe(listener)` reports
  immediately and returns an unsubscribe. Status ∈ `created | starting | ready | destroying
  | destroyed | failed`.

`src/main.js` → `src/standalone/application.js` selects the four standalone implementations.
Only one standalone application may exist per page (the catalog and several control modules
hold page-scoped state).

### 1.2 Ownership map

Taken from `docs/CODE-BOUNDARIES.md` and confirmed against the tree:

| Owner | Responsibility and lifetime |
| --- | --- |
| `src/app/` | Construct supplied components, share scene/request services, cancel startup, dispose |
| `src/standalone/` | Select the default catalog, local sources, setup controls |
| `src/ui/` | Navigation generations, restoration, visual state, panel snapshots, subscriptions |
| `src/data/` | Lifecycle, context and feed state; legacy default-layer facades |
| `src/layers/<family>/` | Source acquisition, records, Cesium resources; explicit controller/renderer owners |
| `src/sources/` | Portable protocols and source contracts; request state per factory instance |
| `src/services/` | Supplied application operations; scene construction owns caches and cancellation |
| `src/voice/` | Portable action schemas/session, common controls, execution, protocol adapters |
| `server/providers/` | Node route factories, process-scoped caches, shutdown cleanup |
| `server/standalone/` | Environment, local settings writes, server composition |

### 1.3 The boundary gates — the most valuable thing this project has

`npm run check:boundaries` runs two enforcement passes that make the architecture
*mechanically true* rather than aspirational:

1. **`scripts/check-import-directions.mjs`** parses every runtime JS/MJS/CJS file in `src/`
   and `server/` — *including files unused by the current bundle*. Static, literal-dynamic
   and re-export edges are checked. Computed module imports and CommonJS `require` are
   rejected outright. Rules enforced:
   - browser graphs cannot reach Node, server or test modules, even through helpers;
   - reusable modules cannot select standalone setup;
   - provider modules cannot import application/rendering modules;
   - **portable source graphs cannot reach application/rendering, Node, Cesium, or browser
     globals** — `document` and `window` are reserved names in those modules.
2. **`scripts/check-package-boundaries.mjs`** builds *every declared `package.json` export*
   in isolation, without app Vite configuration or environment files.
   `scripts/package-boundaries.json` assigns each export exactly once and lists its owned
   modules and permitted external dependencies. Unused imports still count.

`package.json` declares **~150 export entries** and is explicitly "the authoritative export
inventory". Consumers use declared exports rather than reaching into internal files.

**Consequence for this project:** every supply-chain module that is pure computation must be
written as a portable module (no Cesium, no Node, no browser globals), registered in
`package-boundaries.json`, and it will then be *provably* testable in plain `node --test`.
That is exactly the property an academic analytics layer needs.

### 1.4 Data tiering already present

The codebase already separates three concerns the supply-chain product needs:

- **`src/sources/*` and `src/layers/*/source.js`** — portable acquisition. Injected
  `fetchImpl`, `AbortSignal` plumbed through, normalization + validation before any record
  escapes. Source exports do not start acquisition at import time.
- **`src/layers/<family>/records.js` + `ingestion.js`** — normalization into plain
  JSON-safe records, separate from rendering.
- **`src/layers/<family>/rendering.js` + `lifecycle.js`** — Cesium entity/primitive
  ownership.

---

## 2. Existing reusable modules

### 2.1 The layer contract (the single most reusable thing here)

Every layer is a plain object. Read from `src/layers/earthquakes/index.js`, confirmed across
families:

```js
{
  id, name, icon, source, updateInterval,      // identity + metadata
  init(viewer), enable(viewer), disable(viewer),
  async update(viewer) -> boolean,             // returns "did I change anything"
  destroy(viewer),
  getStats() -> { count, lastUpdate, error },  // HUD/telemetry seam
  getAnalystRecords(maxCount) -> Array<Object> // voice/NL query seam
}
```

Two seams matter enormously for this project:

- **`getStats()`** already feeds the HUD freshness/error display. A supply-chain layer gets
  freshness badging for free by implementing it.
- **`getAnalystRecords(maxCount)`** is an on-demand, zero-per-frame snapshot of a layer's
  in-memory records as plain objects, explicitly built for the voice analyst query engine.
  **This is the hook through which natural-language supply-chain queries reach live data.**

The per-layer abort discipline is also worth copying verbatim: `update()` aborts the prior
request, checks `request.signal.aborted || _request !== request || !_enabled` after every
await, and only commits to the data source once the snapshot fully validates. That is the
"never render a partial feed" rule, already solved.

### 2.2 Catalog and control binding

`src/app/catalog.js` — `createLayerCatalog(layers, metadata)` validates that layer instances
and serialization metadata are 1:1, with no duplicate or unmatched IDs, and freezes the
result. `catalogControlServices(catalog)` binds named control roles
(`trafficLayer`, `flightsLayer`, `aisLiveVesselsLayer`, …) to exact catalog instances and
throws if one is missing. New layers register here.

### 2.3 Portable computation already extracted

- `src/director/playback.js` (`gods-eye-view/director`) — `buildPlaybackQueue` and
  `playSceneQueue`. The runner imports **no renderer, UI, storage, recipe or dataset**. An
  adapter supplies `selectShot → applyVisual → applyLayers → travel → settle → hold →
  completeShot`, plus `releaseScene`. Cancellation is checked after every phase.
- `src/director/timeline.js` — pure seek calculations; `src/director/clock.js` — run/load/
  shot tickers, hold deadlines, snapshots.
- `src/voice/actionSchemas.js` — **28 declarative action schemas**, portable, no protocol
  dependency.
- `src/search/*` — forward/reverse geocoding, place search, route provider interfaces behind
  a capability-reporting adapter contract.
- `src/data/localGeojsonCore.js` / `localGeojsonLod.js` — GeoJSON layer construction and LOD
  policy, exported as `gods-eye-view/infrastructure/geojson` and `/lod`.

### 2.4 Node provider tier

`server/providers/` is a set of Vite-middleware route factories with process-scoped caches.
Directly reusable helpers:

| Module | What it gives us |
| --- | --- |
| `common/http.js` | Capped reads + request coalescing |
| `common/rate-limit.js` | Per-provider rate limiting |
| `common/query.js` | Query-value validation |
| `common/request.js` | Shared request plumbing |
| `common/geo.js` | Server-side geo helpers |
| `overpass/cache.js` | TTL cache pattern for slow upstreams |

**`common/http.js` + `common/rate-limit.js` + `overpass/cache.js` are precisely what a UN
Comtrade proxy needs** — Comtrade's public preview endpoint returns HTTP 429 under modest
concurrency (measured, §4 of `docs/DATA_AVAILABILITY_MATRIX.md`).

---

## 3. Existing data sources

Full detail in `DATA_SOURCES.md` (inherited verbatim) and `docs/DATA_LICENSE_MATRIX.md`
(new). Summary of what is already wired:

**Live (fetched at runtime):** Google Map Tiles (Photorealistic 3D) + Places/Geocoding ·
Esri World Imagery (keyless default basemap) · OpenSky Network · adsb.lol (fallback +
military + traces) · AISStream.io (vessels) · CelesTrak (TLEs) · The Space Devs Launch
Library 2 · USGS earthquakes · NASA FIRMS · OSM Overpass (roads, installations) · TomTom
Traffic (BYOK) · Photon + Nominatim (geocoding) · Open-Meteo (weather) · Google News RSS +
GDELT (regional headlines) · OSRM on FOSSGIS (routing) · Radio Browser · Re:Earth/Mapterhorn
terrain · GBFS bikeshare · **13 municipal/agency CCTV catalogs** · **7 transit agency
realtime feeds** (MBTA, CapMetro, Metro Transit, OVapi, Entur, TransLink QLD, HSL).

**Bundled snapshots (`src/data/local_data/`):** datacenters ~4,351 (ODbL) · dams 704 (ODbL) ·
TeleGeography submarine cables 712 cables + 1,917 landing points (**CC BY-NC-SA 3.0**) ·
Natural Earth physical regions 1,046 land + 292 marine (public domain) · DataSF
neighborhoods 41 (PDDL) · CCTV ground heights 3,445.

**Directly relevant to supply chain, already present and working:**
AIS vessels · aircraft (OpenSky/adsb.lol) · earthquakes (USGS) · OSM Overpass road geometry ·
submarine cables · datacenters · dams · Natural Earth regions · OSRM routing · GDELT events ·
Open-Meteo weather.

**What is absent and must be added:** every trade, commodity, production, port-throughput and
economic-indicator dataset. God's Eye View tracks *things in motion*; it has no concept of
*what those things are carrying, where it came from, or what it is worth.*

---

## 4. Existing API / proxy architecture

Providers are Vite middleware factories composed by `server/providers/local.js` and mounted
by `server/standalone/vite.config.js`. Properties confirmed in source:

- **Importing a provider entry does not start acquisition.** Caches are process-scoped and
  live for the server's lifetime.
- **Secrets stay server-side.** `resolveApiKey` is injected; browser configuration never
  carries provider credentials. Provider Settings writes to the root `.env` via
  `server/standalone/key-setup.js`, with filesystem hardening isolated in
  `key-setup-hardening.mjs`.
- **Endpoints are developer configuration, not request parameters.** `docs/APPLICATION.md`
  is explicit: endpoints are "developer-selected configuration, not URLs accepted from page
  queries or model arguments." Request parameters cannot override them. This is an SSRF
  guard and the supply-chain proxy must honour it.
- Providers dispose on server close (the AIS plugin tears down its socket and watchdog) and
  re-read configuration after restart.

**Pattern to copy for `server/providers/supplychain/`:** a route factory taking
`{ fetchImpl, cache, rateLimit }`, validating query values through `common/query.js`,
reading through `common/http.js` with a cap, and never interpolating client input into an
upstream host.

---

## 5. Existing globe functionality

- **Cesium viewer** constructed by `src/app/viewer.js` (`gods-eye-view/application/viewer`),
  preserving render settings, requiring a visible credit container.
- **Map stacks** — `src/maps/` owns `controller.js`, `catalog.js`, `imagery.js`,
  `terrain.js`, `google3d.js`, `defaultSources.js`. Google Photorealistic 3D Tiles when a key
  exists; **Esri World Imagery keyless fallback** is the default landing otherwise. Terrain
  from Re:Earth/Mapterhorn with EGM2008 geoid; `egm96-universal` handles height datum
  conversion.
- **Camera** — `src/app/controls.js` + director camera directions (`docs/DIRECTOR-CAMERA.md`),
  `cameraAtProgress`, fly-to, frame-overhead, zoom-to-globe, cockpit mode
  (`src/ui/cockpit.js`, `src/cockpitMath.js`, `cockpitUtilityLayout.js`,
  `cockpitVisionPolicy.js`).
- **Render governor** — `governorRequestRender(reason)` is threaded through every layer.
  Cesium runs on-demand, not free-running; layers must explicitly request frames. The
  earthquakes layer comments on deliberately *not* holding continuous render because its
  discs are static geometry. **The supply-chain layers must obey this or they will burn
  battery for nothing.**
- **Overlay host** — `src/overlays/` with `setEntries(sourceId, entries, { cohortLimit,
  collisionCapacity, moving })`, `setVisible`, `clearSource`. Label collision and paint
  budgets are already solved, including a worker
  (`src/overlays/worldOverlayAllocation.worker.mjs`).
- **Height datum** handling and `mgrs` coordinate support.

## 6. Existing tracking functionality

- **Click-to-track** — entity context registration (`registerEntityContext`,
  `selectEntityContext`, `clearSelectedEntityContextForLayer`,
  `removeEntityContextsForLayer`) with per-layer ownership so selection can be cleared
  safely.
- **Per-family tracking modules** — e.g. `src/layers/vessels/tracking.js`,
  `selection.js`, `queries.js` (19 KB of vessel query logic), `cards.js` (metadata cards).
  Note: `src/layers/vessels/evidence.js` is **not** a data-provenance seam despite the name —
  it is a DEV-only QA harness (`FOCUS_EVIDENCE_DEV = import.meta.env?.DEV === true`) that
  injects synthetic AIS rows and snapshots billboard alpha/screen positions for rendering
  regression shots. Do not build product provenance on it.
- **Feed honesty state** — `src/data/feedState.js` exports `layerFeedState(stats)`, which
  normalizes any layer's `getStats()` into one of `nominal | loading | degraded | stale |
  fallback | unavailable`. It already distinguishes *fallback* sources (e.g. adsb.lol standing
  in for OpenSky) and *stale* caches from healthy feeds, and carries explicit honesty
  carve-outs in comments. **This is the real seam to extend for §23 data-class badging** — it
  is production code, unlike `evidence.js`.
- **Trails** — fading historical position trails; AIS recent-track storage in
  `server/providers/vessels/ais-store.js`; aircraft traces in
  `server/providers/aircraft/tracks.js`.
- **Cockpit / 3D models** — `public/models/` (9 `.glb`), first-person camera on a tracked
  entity.
- **Stop-tracking / re-target** voice and UI actions.

## 7. Existing visualization functionality

- **HUD** — `src/hud.js` (`gods-eye-view/ui/hud`), fed by `getStats()`.
- **Detection overlays / sensor styles** — `set_detection`, `set_visual_style`,
  `set_post_processing`; bloom (`src/bloom.js`), visual effects, style sweep.
- **Panels** — `panelDisclosure.js`, `panelRails.js`, `panelChrome.js`, `surfaceKeyboard.js`
  (keyboard accessibility), `layerPanel.js`, `visualSettings.js`.
- **Scene director** — `SceneDirector` + `src/scenes/`, data packs
  (`docs/DIRECTOR-DATA-PACKS.md`), declarative interactions
  (`docs/DIRECTOR-INTERACTIONS.md`), scene document format (`docs/SCENE-DOCUMENT.md`).
- **Shareable state** — `src/ui/shareRestoration.js`, `src/sharelink.*`,
  `src/director/sharing/` (`docs/DIRECTOR-SHARING.md`).
- **Global context** — `src/ui/context.js` + `contextModePolicy.js`; regional briefing,
  weather, news.
- **Annotations** — `src/annotations/`, draw tool, voice-driven map annotation.
- **Attribution lightbox** — `src/data/dataCredits.js` registers every per-layer credit into
  an expandable "Data attribution" popover on the credit line, visible in clean-view and
  recording modes. **New sources register here. This is a licence obligation, not a nicety.**

**Absent:** every non-geospatial analytic chart. There is no time-series chart, Sankey, node-
link graph, choropleth, heatmap, scatter, or correlation matrix anywhere in the tree, and no
charting dependency in `package.json`. §27 of the brief is entirely new work.

## 8. Existing voice functionality

- **`src/voice/actionSchemas.js`** — 28 portable action schemas: `track_entity`,
  `fly_to_location`, `set_layer_visibility`, `analyst_query`, `annotate_map`, `control_scene`,
  `set_hud`, `move_camera`, `zoom_to_globe`, `get_entity_context`, `set_context_mode`, …
- **`src/voice/gevActions.js`** — 141 KB of action execution, with a 124 KB test file.
- **Realtime transport** — `realtimeController.js`, `realtimeConnection.js`,
  `realtimeProtocol.js`, `realtimeTurns.js`, `realtimeInput.js` (push-to-talk),
  `realtimeRadio.js` (radio handoff), `realtimeViewport.js`, `realtimeDiagnostics.js`.
- **Cost accounting** — `voiceCost.js` + `realtimeCost.js`, with an explicit conservative
  estimate for unknown model IDs.
- **Server side** — `server/providers/openai/` with `tools.js`, `toolDescriptions.js`,
  `instructions.js`, `rate-limit.js`, ephemeral client-secret minting.
- **Ownership rule** (`docs/VOICE-OWNERSHIP.md`): common voice controls cannot depend on a
  Realtime protocol implementation.

**Critically:** the voice system **executes structured actions**; it does not answer from the
model's own knowledge. `analyst_query` runs against `getAnalystRecords()` snapshots. This is
exactly the architecture §29/§30 of the brief demands, and it already exists. Supply-chain
voice work is **schema addition + action handlers**, not a new subsystem.

## 9. Existing weaknesses

Honest assessment, relevant to building on this base:

1. **Node engine pin.** `>=24.14.0 <25 || >=26 <27` versus this environment's Node 22.
   Mitigated (portable suite is green; the two Node-24 probes self-skip) but it means the
   allocation regression gate is **not** running here. Any allocation claim in this project
   must be re-verified on Node 24 before it is asserted.
2. **Page-scoped singleton state.** `src/ui.js`, `src/data/manager.js`, the standalone
   catalog and several control modules hold module-level state. Only one application per
   page. Multi-viewer comparison ("compare two disruption scenarios side by side") is **not**
   available without extraction work. §20/scenario-comparison must therefore be built as
   in-panel comparison, not dual globes.
3. **Bundle size.** The build already warns on chunks over 1500 kB: `index` 2.15 MB,
   `regions` 1.99 MB, `egm96-universal` 2.77 MB. Adding trade matrices and a charting library
   naively will make this materially worse. Supply-chain data must be server-aggregated and
   lazily loaded.
4. **Compatibility back-edges.** `docs/CODE-BOUNDARIES.md` lists retained legacy entries
   (`src/data/manager.js`, `src/data/<layer>.js`, `src/app/sources.js`, …) and two exact
   standalone-import exceptions. These "do not authorize new compatibility back-edges" —
   new code must use the clean seams.
5. **Not all `ingestion.js` files are portable.** The doc warns explicitly: "Do not label all
   ingestion modules platform-independent by filename." Only the reviewed graphs (ALPR,
   bikeshare, CCTV, earthquakes, FIRMS, installations, launches, radio, satellites, traffic,
   plus flight/military/vessel records+ingestion) are guaranteed portable.
6. **License encumbrance travels with the tree.** TeleGeography (CC BY-NC-SA 3.0) and Bhote
   Koshi imagery (CC BY-NC 4.0) are bundled, and both are woven into code *and tests* — the
   submarine-cable dataset is referenced from 30+ files including
   `src/data/telegeographySubmarineCables.test.mjs`. They cannot be silently dropped without
   breaking the suite. See §11 and `docs/DATA_LICENSE_MATRIX.md`.
7. **Some upstreams are fragile or restricted.** OpenSky is non-commercial research/education
   only. AISStream is beta with no formal ToS. FOSSGIS OSRM is 1 req/s, no heavy use.
   Nominatim is 1 req/s. Google News RSS is personal/non-commercial. Several CCTV feeds are
   "courtesy" access with no published terms.
8. **`docs/CURRENT-STATE.md` is 3,925 lines.** Institutional knowledge is real but the
   surface area is large; `docs/KNOWN-ISSUES.md` should be read before debugging anything.

## 10. What can be reused directly

No modification needed — consume as-is:

| Asset | Use in Global Supply Chain Eye |
| --- | --- |
| `createApplication` lifecycle | Unchanged. Supply-chain components register in the same four phases. |
| Layer contract (`init/enable/disable/update/destroy/getStats/getAnalystRecords`) | Every new supply-chain layer implements it verbatim. |
| `createLayerCatalog` / `catalogControlServices` | Register trade-flow, chokepoint, port, production layers. |
| Cesium viewer, map stacks, terrain, height datum | The globe itself. Zero change. |
| Camera + director (`playSceneQueue`, `cameraAtProgress`, timeline, clock) | WORLD→REGION→COUNTRY→PORT scale transitions and the demo scenario. |
| Overlay host (collision, cohort limits, worker) | Port/chokepoint/production labels at global density. |
| Entity context + selection + tracking + trails | Click a vessel, click a port, click a chokepoint. |
| Render governor | Frame discipline for animated trade flows. |
| HUD + panels + `surfaceKeyboard` | LIVE INTELLIGENCE panel, provenance panel. |
| Share/restoration (`shareRestoration.js`, `sharelink`) | Shareable scenario + disruption-simulation state. |
| Attribution lightbox (`dataCredits.js`) | Mandatory for every new source. |
| Voice: schemas, session, Realtime transport, cost accounting | Supply-chain voice commands are new *schemas*, not a new stack. |
| `server/providers/common/{http,rate-limit,query,request,geo}.js` | The Comtrade/World Bank proxy's foundation. |
| `overpass/cache.js` TTL pattern | Trade-data caching. |
| AIS vessels, aircraft, earthquakes, Overpass roads, submarine cables, datacenters, dams, Natural Earth, OSRM, GDELT, Open-Meteo | Live transport + infrastructure + event + environment layers, already working. |
| Boundary gates + `npm test` + `format` | Quality bar, inherited and kept green. |

## 11. What should be extended

| Existing thing | Extension |
| --- | --- |
| `src/data/feedState.js` | Extend `layerFeedState()` — which already yields `nominal/loading/degraded/stale/fallback/unavailable` — into the §23 data-class badge set (LIVE / HISTORICAL / INFERRED / SIMULATED / UNKNOWN). It is the existing production honesty seam. |
| `src/layers/vessels/cards.js` + a **new** `commodityAssociation.js` | Commodity association is new work, not an extension of `evidence.js` (dev-only QA harness). Attach VERIFIED/INFERRED/ESTIMATED/UNKNOWN classes with exposed evidence. Never invent cargo certainty. |
| `src/layers/vessels/queries.js` | Add destination-port resolution, route-corridor membership, and a provenance footer to vessel cards. |
| `getAnalystRecords()` | Implement on every supply-chain layer so NL query reaches trade/graph data the same way it reaches earthquakes. |
| `src/voice/actionSchemas.js` | Add supply-chain actions: `select_commodity`, `show_trade_flows`, `simulate_disruption`, `show_alternative_routes`, `compare_countries`, `set_time_period`, `show_production_map`, `explain_evidence`. |
| `server/providers/openai/{tools,toolDescriptions,instructions}.js` | Register the new actions so the model can call them. |
| `src/data/dataCredits.js` | Register UN Comtrade, World Bank, WPI, Natural Earth, and every new source. |
| `src/ui/context.js` + regional briefing | Add a supply-chain context mode (nearby ports, dependent corridors). |
| `src/scenes/` + director packs | Author the §44 semiconductor investigation as a scene pack. |
| `src/maps/` scale handling | Formalize WORLD → REGION → COUNTRY → INFRASTRUCTURE as named camera scales. |
| `DATA_SOURCES.md` | Extend with supply-chain sources (kept in the inherited format). |
| Infrastructure GeoJSON layers (`localGeojsonCore`, `lod`) | Reuse the loader + LOD policy for ports, rail terminals, border crossings. |

## 12. What must be newly implemented

Nothing in God's Eye View addresses any of this. All new:

**Portable core (`src/supplychain/`)** — no Cesium, no Node, no browser globals:
- provenance + data-class model (LIVE / HISTORICAL / MODELLED / INFERRED / UNKNOWN)
- confidence framework with documented thresholds and evidence records
- supply-chain graph model (typed nodes, typed edges, per-edge source/timestamp/confidence)
- routing: Dijkstra, A\*, Yen's k-shortest-paths
- network analytics: degree, weighted degree, Brandes betweenness, HHI concentration,
  substitutability, alternative-route availability
- disruption engine: node/edge removal + capacity penalty, before/after comparison,
  direct/secondary/tertiary propagation
- geodesy: haversine / great-circle distance, route length, transit-time estimation
- HS commodity registry

**Data acquisition (new sources + provider):**
- UN Comtrade client (public preview endpoint, no key) + `server/providers/supplychain/`
  proxy with cache and throttle (429 handling is mandatory — measured)
- World Bank indicator client
- curated reference datasets: ports, maritime chokepoints, country metadata — every record
  carrying a real citation

**ML (`src/supplychain/ml/`):**
- forecasting with **mandatory baseline comparison** (naive / seasonal-naive / drift vs model)
  and reported error + interval
- anomaly detection over trade and traffic series
- country clustering on trade structure

**UI (new):**
- charting subsystem (time-series, Sankey, node-link, choropleth, heatmap, scatter,
  correlation matrix) with bidirectional globe↔chart selection
- commodity selector, trade-flow render mode, production map, dependency graph
- chokepoint / port / country intelligence panels
- disruption simulator + WHAT IF panel
- provenance panel ("why do you think this?")
- time machine (historical scrub, with live data visually separated)
- data-class badges (🟢 LIVE / 🔵 HISTORICAL / 🟡 INFERRED / 🟠 SIMULATED / ⚪ UNKNOWN)

**Docs:** the nine new methodology documents listed in §48 of the brief.

---

## 13. Features that public data cannot currently support

Stated up front, per §31/§33 of the brief. These are marked **DATA-LIMITED** or **PLANNED**
and must never be shipped as if the data existed.

| Brief feature | Blocking reality |
| --- | --- |
| Per-vessel cargo identification | AIS broadcasts position, heading, speed, nav status, self-declared destination and vessel type. **It does not broadcast cargo.** Manifest data is commercial (bills of lading). Maximum honest output is an INFERRED commodity *association* with exposed evidence. |
| Global real-time truck/freight tracking | No open global source exists. Only jurisdiction-specific congestion feeds. |
| Factory-level production volumes | Company-confidential. Public data reaches country×commodity, occasionally sub-national. |
| Taiwan trade statistics via UN Comtrade | **Taiwan is not a UN Comtrade reporter** (verified: `reporterCode=158` returns no rows). Critical gap for semiconductors — partner-side mirror statistics are the only route, and they must be labelled as mirror data. |
| Real-time trade flows | Comtrade annual data lags 1–2 years; monthly lags months. Trade is **HISTORICAL**, never LIVE. |
| Port container throughput, live | Annual/quarterly at best, per-authority, inconsistent formats, much of it paywalled (Lloyd's List, Drewry). |
| Operationally validated alternative routes | Requires carrier capacity, schedule and cost data — all commercial. We can compute **geographic alternatives** only, and must label them as such. |
| Commercial feasibility of new infrastructure | Requires engineering + cost + demand studies. Output is a **NETWORK-BASED CANDIDATE LOCATION**, never a recommendation. |
| Historical live vessel/aircraft position replay | GEV stores only short recent tracks (AIS ~minutes, aircraft traces). Historical telemetry archives are commercial. The Time Machine scrubs **historical trade data**, not historical telemetry. |
| Quantified economic consequence of a disruption | Requires input-output/CGE modelling and elasticities beyond open data at this granularity. We report network-topological exposure, explicitly not GDP impact. |

---

## 14. Proposed technical architecture

```
  PUBLIC SOURCES
  UN Comtrade · World Bank · NGA WPI · Natural Earth · USGS · AISStream
  OpenSky/adsb.lol · OSM Overpass · GDELT · Open-Meteo · OSRM
        │
        ▼
  INGESTION                server/providers/supplychain/*  (Node)
    injected fetchImpl · capped reads · coalescing · rate limit · TTL cache
    endpoints are developer config, never request parameters
        │
        ▼
  NORMALIZATION + VALIDATION      src/supplychain/sources/*  (portable)
    reject malformed snapshots wholesale; never partially commit
        │
        ▼
  PROVENANCE TAGGING              src/supplychain/provenance.js
    every record gets { dataClass, source, license, retrievedAt, confidence }
        │
        ├──────────────┬────────────────┐
        ▼              ▼                ▼
   LIVE store    HISTORICAL store   MODELLED store     ← never merged silently
        │              │                │
        └──────────────┴────────────────┘
                       ▼
  GRAPH ENGINE            src/supplychain/graph.js
    typed nodes/edges · per-edge evidence · immutable base + scenario overlay
                       ▼
  ANALYTICS               routing.js · centrality.js · disruption.js · ml/*
    Dijkstra/A*/Yen · Brandes · HHI · propagation · forecast+baseline
                       ▼
  API                     /api/supplychain/*
                       ▼
  3D CLIENT               src/layers/{tradeflows,chokepoints,ports,production}/
                          + src/ui/supplychain/* (panels, charts, WHAT IF)
                          on the inherited Cesium globe, director, HUD, voice
```

The portable core sits below the API deliberately: it runs identically in `node --test`, in
the browser, and in a server-side batch job. That is what makes the analytics academically
reproducible.

---

## 15. Phased implementation plan

Tracked in `docs/PHASED_PLAN.md`. Mapping to the brief's §46:

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Audit + availability matrix + license matrix | **this document** |
| 2 | Preserve GEV: import, run tests/build/boundary gates | **done** — 4136 pass / 0 fail |
| 3 | Supply-chain data foundation: reference data, Comtrade + World Bank clients, provenance model | next |
| 4 | Trade visualization: flows, commodity selector, timeline, charts | |
| 5 | Supply-chain graph: nodes, edges, upstream/downstream, dependencies | |
| 6 | Live transport fusion with explicit LIVE/HISTORICAL separation | |
| 7 | Disruption engine: closures, capacity reduction, alternative paths | |
| 8 | Analytics: centrality, concentration, resilience | |
| 9 | ML: forecasting, anomaly detection, clustering — baseline-compared | |
| 10 | Geopolitical/event layer | |
| 11 | Voice: supply-chain action schemas + handlers | |
| 12 | Polish: camera, HUD, transitions, performance, error states | |

**Gate on every phase:** `npm test`, `npm run build`, `npm run check:boundaries` stay green,
and no inherited God's Eye View behaviour regresses.
