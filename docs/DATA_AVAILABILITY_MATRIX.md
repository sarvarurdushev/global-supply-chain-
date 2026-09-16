# Data Availability Matrix

**Purpose:** answer the §33 Data Availability Gate for every feature *before* it is built,
so that no feature is implemented as if data exists when it does not.

**All reachability results below were measured from this project's execution environment on
2026-09-16**, not assumed. Where a source was probed, the observed HTTP status, payload size
and any limit is recorded. Where a claim is an inherited one from God's Eye View's
`DATA_SOURCES.md`, it is marked *(inherited)*.

Status vocabulary:

| Status | Meaning |
| --- | --- |
| **READY** | Probed, reachable, licence permits our use, sufficient for the feature. |
| **READY (inherited)** | Already wired and working in the God's Eye View base. |
| **DATA-LIMITED** | Source exists but does not cover what the feature needs. Feature ships degraded, and says so in the UI. |
| **PLANNED** | Viable source identified, not yet integrated. |
| **BLOCKED** | No adequate public source. Feature must **not** be built as if data existed. |

---

## 1. Probe results (measured 2026-09-16)

| Source | Endpoint probed | HTTP | Payload | Notes |
| --- | --- | --- | --- | --- |
| **UN Comtrade** (public preview) | `comtradeapi.un.org/public/v1/preview/C/A/HS` | **200** | 85 KB | No API key. 95 partner rows in one call. |
| **World Bank Indicators v2** | `api.worldbank.org/v2/country/KOR/indicator/NY.GDP.MKTP.CD` | **200** | 1.1 KB | No key. Data through 2025. |
| **NGA World Port Index** | `msi.nga.mil/api/publications/world-port-index?output=json` | **200** | **6.3 MB** | **2,951 ports, 112 fields each.** US public domain. |
| **IMF DataMapper** | `imf.org/external/datamapper/api/v1/NGDPD/KOR` | **200** | 154 KB | No key. |
| **OECD SDMX** | `sdmx.oecd.org/public/rest/dataflow/OECD.SDD.TPS` | **200** | 782 KB | No key; SDMX-ML. |
| **Natural Earth 10m ports** | `naciscdn.org/naturalearth/10m/cultural/ne_10m_ports.zip` | **200** | 51 KB | Public domain. |
| **Natural Earth 110m countries** | `naciscdn.org/naturalearth/110m/cultural/ne_110m_admin_0_countries.zip` | **200** | 210 KB | Public domain. |
| **USGS earthquakes** | `earthquake.usgs.gov/.../all_day.geojson` | **200** | 145 KB | *(inherited)* |
| **adsb.lol** | `api.adsb.lol/v2/lat/35.1/lon/129.0/dist/50` | **200** | 6.3 KB | *(inherited)* |
| **OpenSky** | `opensky-network.org/api/states/all?...` | **200** | 1.5 KB | *(inherited)* Anonymous quota is small. |
| **CelesTrak** | `celestrak.org/NORAD/elements/gp.php` | **200** | 8.7 KB | *(inherited)* |
| **Nominatim** | `nominatim.openstreetmap.org/search` | **200** | 458 B | *(inherited)* 1 req/s cap. |
| **Open-Meteo** | `api.open-meteo.com/v1/forecast` | **200** | 317 B | *(inherited)* First attempt timed out; second succeeded. |
| **OSM Overpass** | `overpass-api.de/api/interpreter` | *(no status returned)* | — | *(inherited)* Intermittent; must fail soft. |
| **GDELT DOC 2.0** | `api.gdeltproject.org/api/v2/doc/doc` | **429** | 444 B | *(inherited)* Rate-limited on first call. Needs backoff. |
| **WTO Timeseries API** | `api.wto.org/timeseries/v1/indicators` | **401** | 152 B | **Requires a subscription key.** Not used. |
| **UNCTADstat API** | `unctadstat-api.unctad.org/api/reportMetadata/...` | **400** | 73 B | Probed path invalid; API shape undocumented for our use. Deferred. |
| **Wikidata SPARQL** | `query.wikidata.org/sparql` | **400** | 7 KB | Probe query malformed; service itself reachable. Deferred. |
| **ACLED** | `api.acleddata.com/acled/read` | *(no status)* | — | Requires registration + key. Not used. |
| **EM-DAT** | `api.emdat.be/v1` | **500** | 96 B | Requires account. Not used. |
| **GDACS** | `gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP` | **200** | 135 KB | No key. 100 events. **In use** — natural hazards only. |
| **GLEIF** | `api.gleif.org/api/v1/lei-records` | *(no status)* | — | Deferred. |

### 1.1 UN Comtrade — measured constraints

These shape the proxy design and are not negotiable:

| Constraint | Measurement |
| --- | --- |
| API key | **Not required** for `/public/v1/preview/`. |
| Periods per call | **Exactly 1.** `period=2018,2019,...` → HTTP 400 `"Maximum number of periods for preview is 1"`. |
| Reporters per call | **Multiple allowed.** `reporterCode=410,158,156` returned rows for 410 and 156. |
| Partners per call | **Multiple allowed / all.** Omitting `partnerCode` returned **95** partner rows. |
| Rate limiting | **HTTP 429 observed** on a third call issued back-to-back. Recovered after a short pause. **Server-side throttle + TTL cache is mandatory.** |
| Descriptive fields | `reporterISO`, `partnerISO`, `cmdDesc`, `flowDesc` are returned **null** on the preview endpoint. Codes must be resolved locally against our own reference tables. |
| Quantity | `qty` is frequently `0` with `isQtyEstimated: true`. **`netWgt` (kg) is the usable volume field**; `primaryValue` (USD) is the usable value field. |
| Aggregation flags | Rows carry `isReported`, `isAggregate`, `legacyEstimationFlag`. These must be surfaced, not hidden. |

**Worked verification** — the brief's own example (§7), fetched live:

```
South Korea (410) → Vietnam (704), HS 8542 (electronic integrated circuits), 2023, export
  primaryValue = 11,852,014,614 USD
  netWgt       = 1,677,573.63 kg
  isReported   = false        ← the row is an aggregate, not a directly reported line
  isAggregate  = true
```

The `isReported: false` flag is exactly the kind of thing that must reach the provenance
panel. It is real data, but it is **aggregated**, not a reported customs line.

### 1.2 NGA World Port Index — measured field reliability

WPI is authoritative and public domain, but **it is not uniformly populated**. Measured
coverage across all 2,951 ports:

| Field | Coverage | Verdict |
| --- | --- | --- |
| `xcoord` / `ycoord` (decimal degrees) | **100%** | **Reliable.** Port node geometry. |
| `harborType` | **99%** | **Reliable.** (CN 1021, CB 617, RN 570, OR 517, …) |
| `tide` | 99% | Reliable. |
| `harborSize` | **99%** | **Reliable but coarse** — V 1784 / S 744 / M 282 / L 135. A 4-level ordinal, *not* throughput. |
| `anDepth` (anchorage depth) | 89% | Reliable. Capacity proxy. |
| `chDepth` (channel depth) | **87%** | **Reliable.** Best available capacity proxy. |
| `unloCode` (UN/LOCODE) | **86%** | **Reliable join key** to other datasets. |
| `loWharves` | 74% | Usable. |
| `firstPortOfEntry` | 59% | Partial. |
| `cmRail` (rail connection) | 48% `Y`, 2% `N`, **50% `U`** | **Partial** — absence means unknown, never "no rail". |
| `maxVesselDraft` | **3%** | **Unusable.** |
| `loContainer` | **1%** (Y=32, N=14, **U=2,905**) | **Unusable.** |
| `loLiquidBulk` / `loSolidBulk` / `loOilTerm` / `loRoro` | **1–2%** | **Unusable.** |
| `cranesContainer` | **0%** (4 ports) | **Unusable.** |
| `portSecurity` | 1% | Unusable. |

**Consequence, and it is a significant one:** WPI gives us excellent port *identity, location,
physical scale and depth*. It does **not** give us port *commodity specialization*. The
"port specialization" evidence line in the brief's §6 example therefore **cannot be sourced
from WPI** and is marked DATA-LIMITED below. Building commodity association on those 1%-
populated flags would be fabrication.

---

## 2. Feature-by-feature availability gate

Columns follow §32 of the brief.

### 2.1 Transport (inherited)

| Feature | Dataset | Provider | Coverage | Historical | Real-time | Cost | License | Reliability | API | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Live aircraft | State vectors | OpenSky | Global | No | Yes | Free (NC) | Non-commercial research/edu | Medium — anonymous quota small | REST | **READY (inherited)** |
| Live aircraft fallback | Point API | adsb.lol | Bounded radius | Traces only | Yes | Free | ODbL 1.0 | Good | REST | **READY (inherited)** |
| Live vessels | AIS | AISStream.io | Global coastal | ~minutes | Yes | Free, beta | No formal ToS | Medium — beta, gaps offshore | WebSocket | **READY (inherited)** |
| Vessel recent tracks | AIS store | (local) | Global coastal | ~minutes only | — | — | — | Good | in-process | **READY (inherited)** |
| Satellites | TLE | CelesTrak | Global | No | Yes | Free | US-gov origin | Good | REST | **READY (inherited)** |
| Road geometry | Overpass | OSM | Global | No | No | Free | ODbL 1.0 | **Intermittent** | REST | **READY (inherited)** — must fail soft |
| Road congestion | Traffic flow tiles | TomTom | Global (BYOK) | No | Yes | Free tier 200K/mo | Proprietary | Good | Vector tiles | **READY (inherited)** — BYOK |
| Maritime routing | — | — | — | — | — | — | — | — | — | **BLOCKED** — see §3 |
| Global freight/truck tracking | — | — | — | — | — | — | — | — | — | **BLOCKED** |
| Rail freight movements | — | — | — | — | — | — | — | — | — | **BLOCKED** |

### 2.2 Trade

| Feature | Dataset | Provider | Coverage | Historical | Real-time | Cost | License | Reliability | API | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Bilateral trade by HS commodity | Comtrade preview | UN | ~200 reporters | 1962– (HS from 1988) | **No** — 1–2 yr lag | Free, no key | UN Comtrade terms | Good, with caveats | REST | **READY** |
| Trade value (USD) | `primaryValue` | UN | " | " | No | " | " | Good | REST | **READY** |
| Trade volume (kg) | `netWgt` | UN | " | " | No | " | " | **Partial** — `qty` often 0/estimated | REST | **READY (use netWgt)** |
| Taiwan trade | — | UN | **absent** | — | — | — | — | — | — | **DATA-LIMITED** — see §3 |
| Trade in services | Comtrade services | UN | Partial | Annual | No | Free | " | Lower | REST | **PLANNED** |
| Tariff / NTM data | — | WTO | — | — | — | **key required (401)** | — | — | — | **BLOCKED (no key)** |

### 2.3 Economic context

| Feature | Dataset | Provider | Coverage | Historical | Real-time | Cost | License | Reliability | API | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GDP, trade %, population, indicators | Indicators v2 | World Bank | ~217 economies | 1960– | No (annual) | Free, no key | CC BY 4.0 | **High** | REST | **READY** |
| GDP forecasts / macro | DataMapper | IMF | Global | Annual + forecast | No | Free, no key | IMF terms | High | REST | **PLANNED** |
| Structural/trade statistics | SDMX | OECD | OECD + partners | Annual | No | Free, no key | OECD terms | High | SDMX-ML | **PLANNED** |
| Logistics Performance Index | LPI | World Bank | ~160 | Biennial | No | Free | CC BY 4.0 | High | REST | **PLANNED** |

### 2.4 Infrastructure

| Feature | Dataset | Provider | Coverage | Historical | Real-time | Cost | License | Reliability | API | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Port identity + location | World Port Index | NGA | **2,951 ports** | Revised editions | No | Free | **US public domain** | **100% coords** | REST (6.3 MB) | **READY** |
| Port UN/LOCODE join key | `unloCode` | NGA | 86% of ports | — | No | Free | Public domain | Good | REST | **READY** |
| Port physical capacity proxy | `chDepth`, `anDepth`, `harborSize` | NGA | 87–99% | — | No | Free | Public domain | **Coarse ordinal** | REST | **READY (as proxy only)** |
| Port rail connection | `cmRail` | NGA | 48% `Y`, 50% `U` | — | No | Free | Public domain | **Partial** | REST | **DATA-LIMITED** |
| **Port commodity specialization** | `loContainer` etc. | NGA | **~1%** | — | — | Free | Public domain | **Unusable** | REST | **DATA-LIMITED** |
| Port container throughput (TEU) | — | — | — | — | — | — | — | — | — | **DATA-LIMITED** — country-level only, see §3 |
| Maritime chokepoints | curated | (this project) | 8 chokepoints | — | No | Free | see licence matrix | Geometry authored from public sources, each cited | bundled | **READY** |
| Submarine cables | TeleGeography | *(inherited)* | Global | No | No | Free | **CC BY-NC-SA 3.0** | Good | bundled | **READY (inherited, NC)** |
| Datacenters / dams | OSM extracts | *(inherited)* | Global | No | No | Free | ODbL 1.0 | Good | bundled | **READY (inherited)** |
| Airports | — | — | — | — | — | — | — | — | — | **PLANNED** |
| Pipelines | OSM / OpenInfraMap | — | Partial | No | No | Free | ODbL 1.0 | Uneven | Overpass | **PLANNED** |
| Factory / fab locations | — | — | — | — | — | — | — | — | — | **BLOCKED** |

### 2.5 Events

| Feature | Dataset | Provider | Coverage | Historical | Real-time | Cost | License | Reliability | API | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Earthquakes | USGS feed | USGS | Global | 24h feed; archive available | Yes | Free | US public domain | **High** | REST | **READY (inherited)** |
| Active fires | FIRMS | NASA | Global | Snapshot bundled | Near-real-time | Free | CC0 | High | bundled + REST | **READY (inherited)** |
| News-derived events | DOC 2.0 | GDELT | Global | 2015– | ~15 min | Free | GDELT ToU | **Rate-limited (429 observed)** | REST | **READY (inherited)** — needs backoff |
| Weather | Forecast | Open-Meteo | Global | Archive available | Yes | Free | CC BY 4.0 | Good | REST | **READY (inherited)** |
| Curated disruption timeline | curated | (this project) | Major documented events | Yes | No | Free | per-citation | Each entry carries a source URL | bundled | **PLANNED** |
| Sanctions lists | — | OFAC/EU/UN | — | — | — | Free | Public | — | REST | **PLANNED** |
| **Natural hazard events** | GDACS `geteventlist/EVENTS4APP` | EC / UN | Global | current only | continuous | **None** | GDACS terms of use | High | REST (GeoJSON) | ✅ **AVAILABLE — in use** (verified: 100 events, 2026-09-16) |
| Conflict events | ACLED | ACLED | Global | 1997– | Weekly | **Registration required** | Academic licence | High | REST | **BLOCKED (no key)** |
| Disaster impacts | EM-DAT | CRED | Global | 1900– | No | **Account required** | Academic licence | High | REST | **BLOCKED (no key)** |
| Strikes / port closures | — | — | — | — | — | — | — | — | — | **DATA-LIMITED** — news-derived only |

### 2.6 Production

| Feature | Dataset | Provider | Coverage | Historical | Real-time | Cost | License | Reliability | API | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Production proxy via exports | Comtrade | UN | ~200 reporters | 1988– | No | Free | UN terms | **Proxy only** — exports ≠ production | REST | **READY (as labelled proxy)** |
| Mineral production | USGS Mineral Commodity Summaries | USGS | Global | Annual | No | Free | US public domain | High | **PDF/XLS, no API** | **PLANNED** |
| Energy production | — | EIA / IEA | Global | Annual | No | EIA free w/ key | mixed | High | REST | **PLANNED** |
| Agricultural production | FAOSTAT | FAO | Global | 1961– | No | Free | CC BY 4.0 | High | REST | **PLANNED** |
| Semiconductor fab capacity | — | — | — | — | — | — | — | — | — | **BLOCKED** — commercial (SEMI, TechInsights) |
| Firm-level production | — | — | — | — | — | — | — | — | — | **BLOCKED** |

---

## 3. Explicit BLOCKED / DATA-LIMITED register

Each of these answers "NO" to a critical §33 gate question. **None of them may be built as if
the data existed.** The UI must show `DATA UNAVAILABLE` or `PUBLIC DATA INSUFFICIENT` and
state what would be needed.

| # | Feature | Gate failed | What is actually needed |
| --- | --- | --- | --- |
| 1 | **Per-vessel cargo contents** | "Does it contain enough information?" — **NO** | AIS carries position, COG/SOG, nav status, self-declared destination, vessel type. **Cargo is never broadcast.** Needs commercial bill-of-lading data (Panjiva, ImportGenius) or customs manifests. Maximum honest output: an **INFERRED commodity association** with its evidence exposed. |
| 2 | **Taiwan trade statistics** | "Does it cover the geography?" — **NO** | Taiwan is not a UN Comtrade reporter (verified: `reporterCode=158` returns no rows). Only partner-side **mirror statistics** are available, and they must be labelled as mirror data with the reporting partner named. A critical gap precisely where semiconductors matter most. |
| 3 | **Port-level container throughput (TEU)** | "Is it accessible?" — **NO at port level, YES at country level** | Per-port rankings are commercial (Lloyd's List, Drewry, Alphaliner), and World Bank CPPI is a *performance index*, not throughput. **Re-probed and revised:** World Bank `IS.SHP.GOOD.TU` publishes **country-level** container throughput with no key, and the COMPARE COUNTRIES panel uses it (China 278.8M TEU, Korea 30.0M, 2023). That is a national total, not a port figure — it cannot rank Rotterdam against Shanghai. For per-port scale we still use WPI `harborSize`/`chDepth` as an explicitly-labelled **physical scale proxy**, never as throughput. |
| 4 | **Port commodity specialization** | "Does it contain enough information?" — **NO** | WPI cargo flags are ~1% populated (measured). Needs per-authority terminal data. Until then, port→commodity association is **UNKNOWN**, not guessed. |
| 5 | **Real-time trade flows** | "Is it sufficiently current?" — **NO** | Comtrade annual lags 1–2 years. Trade is **HISTORICAL** and must never carry a LIVE badge. |
| 6 | **Operationally validated alternative routes** | "Does it contain enough information?" — **NO** | Needs carrier schedules, slot capacity, freight rates — all commercial. We compute **geographic alternatives** only, and label them as such (§13 of the brief). |
| 7 | **Global real-time freight (truck/rail)** | "Does the dataset exist?" — **NO** | No open global source. Only jurisdiction-specific congestion feeds. |
| 8 | **Factory / fab-level capacity** | "Does the dataset exist?" — **NO** | Company-confidential. Public data reaches country×commodity. The WHERE IS PRODUCTION? map therefore ranks **export value**, labelled `EXPORT PROXY` on every view, with re-export hubs individually flagged and the three distortions (entrepôts, invisible domestic consumption, value≠volume) stated next to the chart. National production data would need USGS Mineral Commodity Summaries (PDF and spreadsheets, no API) or FAOSTAT (key plus a 34 MB bulk archive); neither is integrated. |
| 9 | **Historical live-telemetry replay** | "Does it cover the required historical period?" — **NO** | GEV retains only short recent tracks. Historical AIS/ADS-B archives are commercial. The Time Machine scrubs **historical trade data**, not historical telemetry — and the UI must say so. |
| 10 | **Quantified economic impact of a disruption** | "Does it contain enough information?" — **NO** | Needs input-output/CGE models and elasticities. We report **network-topological exposure** only, explicitly not GDP impact. |
| 11 | **Tariff / NTM analysis** | "Can we legally use it?" — **NO KEY** | WTO Timeseries API returned **401**; requires a subscription key not held by this project. |
| 12 | **Conflict events, strikes, port closures** | "Does the dataset exist (openly)?" — **NO** | ACLED and EM-DAT both require registered accounts. **Re-probed and partially resolved:** GDACS (European Commission / UN) publishes a live GeoJSON event feed with **no key**, and it now drives the event layer — but it covers **natural hazards only**: earthquakes, cyclones, floods, volcanoes, droughts, wildfires. It carries nothing human-caused. Strikes, port closures, sanctions, trade restrictions and conflict remain unavailable, and the layer states that the absence of a marker is not evidence that nothing happened. |
| 13 | **Complete world rankings for broad commodities** | "Does it contain enough information?" — **PARTIALLY** | The Comtrade preview endpoint caps every response at **500 rows** and signals it only by returning exactly that many (measured 2026-09-16: 40 reporters of `cmdCode=TOTAL` → `count: 500`; the same query for one HS heading → 144). The client detects the cap, and the production loader halves its batch until every requested reporter's canonical total is accounted for. A single reporter whose own page is capped with no total in it is reported as **INCOMPLETE** in the panel, never silently dropped or inferred. |

---

## 4. Operational requirements this matrix imposes

1. **Comtrade must be proxied, cached and throttled.** 429 was observed on the third
   back-to-back call. Reuse `server/providers/common/rate-limit.js` and the
   `overpass/cache.js` TTL pattern.
2. **One period per Comtrade call.** A 2015–2024 time series is **10 sequential calls**, and
   must be built by a throttled batch job, not a burst.
3. **Codes must be resolved locally.** The preview endpoint returns null descriptions, so the
   project owns reporter/partner/HS reference tables.
4. **`isReported` and `isAggregate` must reach the provenance panel.** A row with
   `isReported: false` is an aggregate, and the user is entitled to know.
5. **WPI is a 6.3 MB payload.** Fetch server-side, normalize once, ship a slim derived subset
   to the browser. Never load it into the bundle raw (the build already warns above 1500 kB).
6. **Overpass and GDELT fail intermittently** (measured: no-status and 429 respectively).
   Both must fail soft and degrade the layer, never the application.
7. **Trade data may never be badged LIVE.** Enforced in the provenance model, not by
   convention.
