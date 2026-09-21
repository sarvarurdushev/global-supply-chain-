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
| **World Bank water/climate** | `api.worldbank.org/v2/.../ER.H2O.FWTL.ZS` and four more | **200** | — | No key. All five return data. **In use** — national aggregates only, see §3 item 15. |
| **Natural Earth 110m** | `raw.githubusercontent.com/nvkelso/natural-earth-vector` | **200** | 215 KB | Public domain. **In use** — generated into `reference/borders.js`. |
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

### 2.7 Disaster investigation (added 2026-09-17)

| Feature | Dataset | Provider | Coverage | Historical | Real-time | Cost | License | Reliability | API | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Event parameters (M, depth, origin time, fault mechanism) | FDSN `event/1/query` | USGS | Global | 1900– | ~minutes | Free | US public domain | **High** | REST (GeoJSON) | ✅ **AVAILABLE — in use** (verified `us20002926`, 2026-09-17) |
| Shaking field | ShakeMap `cont_mmi.json` | USGS | Where ShakeMap is produced | Per event | Per event, revised | Free | US public domain | High | REST (GeoJSON) | ✅ **AVAILABLE — in use** |
| Rupture geometry | `finite-fault` `FFM.geojson` | USGS | Large events only | Per event | Days after | Free | US public domain | High | REST (GeoJSON) | ✅ **AVAILABLE — in use**, absent for small events |
| Population exposure by shaking band | PAGER `exposure.xml` | USGS | Global | Per event | Hours after | Free | US public domain | High | REST (XML) | ✅ **AVAILABLE — in use**; `population="0"` is a placeholder, read as null |
| Casualty / loss estimate | PAGER `pager.xml` | USGS | Global | Per event | Hours after | Free | US public domain | **Ranges only** | REST (XML) | ✅ **AVAILABLE as published ranges** — never a point estimate |
| Landslide / liquefaction potential | `ground-failure` properties | USGS | Global | Per event | Hours after | Free | US public domain | Modelled | REST (JSON properties) | ✅ **AVAILABLE — in use**, labelled MODELLED |
| Felt intensity from the public | `dyfi` | USGS | Where people report | Per event | Continuous | Free | US public domain | Self-selected sample | REST | ✅ **AVAILABLE — in use**, labelled OBSERVED |
| Roads, bridges, hospitals, schools, airstrips in the affected area | Overpass | OSM | Global, volunteer-uneven | Current snapshot | Current | Free | ODbL 1.0 | **Coverage varies by region** | REST via own proxy | ✅ **AVAILABLE — in use**; an empty result means unmapped, never undamaged |
| Which roads and facilities were actually damaged | — | — | — | — | — | — | — | — | — | **BLOCKED** — see register row 17 |
| Casualties by location and by hour | — | — | — | — | — | — | — | — | — | **BLOCKED** — see register row 18 |
| Shelter occupancy / displacement counts | — | — | — | — | — | — | — | — | — | **BLOCKED** — see register row 19 |
| Aid tonnage delivered, by corridor and day | — | — | — | — | — | — | — | — | — | **BLOCKED** — see register row 20 |
| Post-event satellite imagery of the affected area | — | Maxar / Planet / Copernicus EMS | Varies | Per activation | Per activation | Maxar/Planet **commercial**; Copernicus EMS free per activation | mixed | REST (EMS: per-activation download) | **DATA-LIMITED** — see register row 21 |

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
| 13 | **Inland freight INFRASTRUCTURE** | "Does the dataset exist?" — **YES. Re-probed and resolved.** | This row previously read "Inland freight of any kind — NO", which was wrong, and the probes that disproved it took minutes. It conflated *where the infrastructure is* with *how much moves on it*. Measured on the live APIs 2026-09-17: `railway=rail`+`usage=main|branch` returned **19,027 ways across the Rhine-Ruhr**; `man_made=pipeline`+`substance` returned **2.8 MB of geometry across Iraq/Kuwait**; `landuse=quarry`/`man_made=mineshaft` returned **92 sites in the Atacama, 63 named, tagged `resource=copper`**; OurAirports `airports.csv` returned **86,084 rows, of which 1,174 large airports and 1,152 with scheduled service**, public domain. Four layers are built on those (`freight-rail`, `freight-roads`, `pipelines`, `production-sites`) plus a bundled `air-cargo-hubs`. The OSM layers are viewport-bounded because the proxy caps a query at 12° of span. Coverage is volunteer-surveyed and uneven, so an empty result is stated as "nobody has mapped this here", never as "there is nothing here". City transit (GTFS) and city road traffic are still a different thing, which the interface states in those words. |
| 13b | **Inland freight THROUGHPUT** | "Does the dataset exist?" — **NO** | This is what actually remains closed, and it is a much narrower claim than row 13 used to make. No tonne-kilometres by rail corridor, no heavy-goods-vehicle counts by road, no pipeline flow rate or direction, no airport cargo tonnage. Each exists per operator, per regulator or per national statistics office (Eurostat `rail_go_*`, the US STB waybill sample, ENTSOG for EU gas nominations, ACI's cargo rankings), on its own schedule and in its own units, and several are sold rather than published. Listed in the layer browser as "Freight Volumes & Capacity" under Not Available. Every built layer declares it: `getAnalystRecords` returns `annualVolume`, `capacity`, `currentUtilisation`, `inService` and `cargoTonnes` as explicit nulls rather than omitting them, so a spoken or written answer reports the gap instead of leaving a reader to assume the field was simply not asked for. |
| 14 | **Facility-level supply-chain stages** | "Does the dataset exist?" — **PARTIALLY. Re-probed.** | The claim that "mine, well and farm locations with output are not open at global scale" was two claims wearing one coat. LOCATIONS are open: the `production-sites` layer draws quarries, mineshafts and industrial works from OpenStreetMap, and a good share carry `resource` or `product` tags naming the commodity — the Atacama probe returned `resource=copper` on most of its 92 sites. OUTPUT is not: annual tonnes, reserves, employment and whether a site is currently working are company-reported in annual PDFs (USGS Mineral Yearbooks, company filings) that do not reconcile to OSM ids. So the extraction and processing stages have real positions now; what stays absent is their scale. Inland distribution and the final consumer remain entirely absent and are still drawn as explicit gaps. |
| 15 | **Basin-level water stress** | "Is it accessible?" — **YES. Re-probed and resolved.** | This row said Aqueduct "is a bulk download rather than an API. Not integrated." The first half was wrong. Esri's Living Atlas serves **WRI Aqueduct 4.0** as a queryable feature service — keyless, CC BY 4.0, and sending `access-control-allow-origin: *`, so a browser reads it directly. It answers both a point query and a `name_0='<country>'` query with `orderByFields=bws_raw DESC`. Measured 2026-09-17: China 20.2% nationally (World Bank), Guangzhou basin **1.6% Low**, Beijing basin **93.7% Extremely High**, Hebei basin `pfaf 431648` **1,969% Extremely High** — about 97× the national figure, in the basin the wheat grows in. Both resolutions are shown together and the gap between them is stated as a finding. **Three traps, all handled and tested:** Aqueduct writes **9,999 for "arid and low water use" and -9,999 for "no data"** in every raw field, so coded rows report a classification and never a percentage (printed naively the first reads "999,900%"); **withdrawal above 100% is real**, not an error, so it is never clamped; and a basin crossing a provincial border is returned **once per province** with identical figures, so rows are deduplicated by `pfaf_id` or a top-ten list becomes the same basin three times. |
| 16 | **Complete world rankings for broad commodities** | "Does it contain enough information?" — **PARTIALLY** | The Comtrade preview endpoint caps every response at **500 rows** and signals it only by returning exactly that many (measured 2026-09-16: 40 reporters of `cmdCode=TOTAL` → `count: 500`; the same query for one HS heading → 144). The client detects the cap, and the production loader halves its batch until every requested reporter's canonical total is accounted for. A single reporter whose own page is capped with no total in it is reported as **INCOMPLETE** in the panel, never silently dropped or inferred. |
| 17 | **Observed infrastructure damage** | "Does the dataset exist?" — **YES for Nepal 2015. This row was wrong and the probe that disproved it took one download.** | The claim here used to be that post-event condition reaches the public only as narrative, and that the interface may therefore never colour an asset `CLOSED`. The UNOSAT activation package for this event contains NGA layers of **observed** damage: **179 impassable road segments, 5 bridges out and 51 landslide polygons**, each carrying a production and sensing date. They are ingested by `pipelines/ingest/unosat-damage.mjs` into `data/processed/nepal-2015-nga-infrastructure-damage.json` and are exactly the cited per-asset register `applyCitedStatus` was built for and shipped empty. What remains true, and is now the actual limitation: the layers are a **single-date snapshot (6-7 May 2015)**, not a time series, so they cannot animate closure and reopening; absence of a feature is not evidence a road stayed open; and the segments carry no OpenStreetMap identifier, so attaching them to a routable network is a spatial join with a tolerance, not a key lookup. Whether an equivalent register exists for any OTHER event must be checked per event rather than assumed either way. |
| 18 | **Casualties by location and by hour** | "Does it contain enough information?" — **NO** | PAGER gives **national ranges with probabilities** ("1,000+"), on the event, not on a district or an hour. The eventual official district-level toll is published weeks later in an assessment document, in a table, not an API. `humanImpactBands` therefore shows exposed population by shaking band — which is a measured geographic quantity — and states in the panel that the distribution of harm inside those bands is not published. The timeline's human-impact rung is explicitly declared unavailable per phase (`UNAVAILABLE_REASONS` in `src/disaster/timeline.js`), with what would supply it. |
| 19 | **Shelter occupancy and displacement** | "Does the dataset exist (openly, per site)?" — **NO** | IOM's Displacement Tracking Matrix and the shelter cluster publish site-level figures per activation as PDF and XLSX, per-country, with no stable API and no consistent site ids. There is no feed that answers "how many people are in this camp tonight". The humanitarian view draws the corridors and facilities it can evidence and declares occupancy absent. |
| 20 | **Aid delivered, by corridor and day** | "Does the dataset exist?" — **NO** | UN OCHA's Financial Tracking Service publishes **funding** by appeal, not tonnage by route. Logistics Cluster situation reports describe corridors in prose. So `aidCorridors` in `src/disaster/response.js` computes corridor *feasibility* — travel time at stated assumed speeds over the real road network, and whether the route survives the hazard zones — and labels it a routing result, never a delivery record. `ASSUMED_SPEEDS` is printed beside every duration. |
| 21 | **Post-event high-resolution imagery** | "Can we legally use it?" — **PARTIALLY** | Maxar and Planet imagery is commercial; Maxar's Open Data Program and Copernicus EMS release selected activations freely, per event, as downloads rather than as a tiled service, under terms that vary by activation. Nothing may be assumed. The evidence view therefore shows the **agency-published products that are unambiguously public domain** (USGS ShakeMap, PAGER exposure and deaths-by-structure figures, the ground-failure model image, the event poster, the DYFI felt map) and, for the Bhote Koshi case, the bundled CC BY-NC imagery with its NonCommercial terms stated. Where no image exists for a phase, the evidence panel says so and names the activation that would carry it. |

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
