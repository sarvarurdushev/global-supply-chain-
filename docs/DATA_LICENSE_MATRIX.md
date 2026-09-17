# Data License Matrix

**The MIT licence in `LICENSE` covers source code only. It does not extend to any dataset.**

This project inherits God's Eye View's code (MIT) *and* its bundled datasets, several of
which are **not** MIT and one of which is **NonCommercial**. This document is the single
place where every dataset's terms, attribution obligation and redistribution status are
recorded — for inherited sources and for the supply-chain sources added by this project.

`DATA_SOURCES.md` (inherited verbatim from upstream) remains the per-source narrative. This
matrix is the compliance view.

---

## 0. Read this first — encumbrances that affect the whole repository

| # | Encumbrance | Effect |
| --- | --- | --- |
| 1 | **TeleGeography Submarine Cable Map — CC BY-NC-SA 3.0** | `src/data/local_data/telegeography_submarine_cables/` is **NonCommercial + ShareAlike**. As shipped, **this repository is not usable commercially** without deleting that folder or licensing the data from TeleGeography. |
| 2 | **Bhote Koshi event imagery — CC BY-NC 4.0** (Vantor / GeoPera) | `public/events/bhote-koshi-2026/` and the derived river centreline embedded in `src/data/bhoteKoshiFloodPath.js` are **NonCommercial**. The derived coordinates remain third-party data *even though they live inside a `.js` source file* — the MIT grant does not cover them. |
| 3 | **ODbL share-alike** (datacenters, dams, OSM/Overpass, adsb.lol, Photon, Nominatim, OSRM) | Attribution **and** database share-alike obligations attach to derived databases. |
| 4 | **OpenSky — non-commercial research/education only** | The primary live-flight source cannot be used commercially. |
| 5 | **Google Maps Platform** | Proprietary; requires the operator's own key and billing; the Google credit must remain visible. |

**Neither NonCommercial dataset can simply be deleted.** Both are woven into code *and tests*
— the TeleGeography dataset alone is referenced from 30+ files including
`src/data/telegeographySubmarineCables.test.mjs`, and the Bhote Koshi pack is referenced from
`src/scenes/packs/nepal.js`, `src/app/constructCatalog.js` and several test files. Removing
them is a deliberate code change with test consequences, not a file deletion. See §4.

**This project's posture:** Global Supply Chain Eye is a **university research / academic
project**, which fits the NonCommercial terms. We therefore retain the datasets **with the
carve-out restated loudly here and in `LICENSE`**, exactly as upstream does — rather than
redistributing them silently. Anyone taking this repository commercially must act on §4.

---

## 1. Inherited — bundled datasets (redistributed in this repository)

| Dataset | Path | Licence | Commercial OK | Redistribution | Required attribution |
| --- | --- | --- | --- | --- | --- |
| **TeleGeography Submarine Cable Map** (712 cables, 1,917 landing points) | `src/data/local_data/telegeography_submarine_cables/` | **CC BY-NC-SA 3.0** | ❌ **NO** | Permitted NC + ShareAlike | "© TeleGeography — submarinecablemap.com" |
| **Bhote Koshi imagery + derived centreline** | `public/events/bhote-koshi-2026/`, `src/data/bhoteKoshiFloodPath.js` | **CC BY-NC 4.0** (Vantor / GeoPera) | ❌ **NO** | Permitted NC, with modification notice | Per folder README; source-linked witness posts retain owners' terms |
| **Datacenters** (~4,351) | `src/data/local_data/datacenters/` | **ODbL 1.0** (OSM extract) | ✅ | Permitted + share-alike | "© OpenStreetMap contributors" |
| **Dams** (704) | `src/data/local_data/dams/` | **ODbL 1.0** (OpenInfraMap / OSM) | ✅ | Permitted + share-alike | "© OpenStreetMap contributors" (+ Open Infrastructure Map) |
| **Natural Earth physical regions** (1,046 land + 292 marine) | `src/data/local_data/natural_earth/` | **Public domain** | ✅ | Unrestricted | "Made with Natural Earth" (courtesy) |
| **DataSF Analysis Neighborhoods** (41) | `src/data/local_data/neighborhoods/` | **PDDL 1.0** | ✅ | Unrestricted | "City & County of San Francisco — DataSF" (courtesy) |
| **CCTV ground heights** (3,445) | `src/data/local_data/cctv_ground_heights/` | Derived placement heights (folder README) | — | — | — |
| **3D models** (9 `.glb`) | `public/models/` | **Individual licences — NOT MIT** | Per model | Per model | Per `public/models/README.md` (author, source, licence, modification notice) |

## 2. Inherited — live sources (fetched at runtime, not redistributed)

| Source | Licence / terms | Commercial OK | Key | Attribution |
| --- | --- | --- | --- | --- |
| Google Map Tiles (Photorealistic 3D) + Places/Geocoding | Google Maps Platform ToS (proprietary) | Own key + billing | **Yes** | Google / Google Maps logo — **required, shown in-app** |
| Esri World Imagery | Esri Master Agreement — public service usable with attribution | Review at scale | No | "Powered by Esri — Source: Esri, Maxar, Earthstar Geographics, …" |
| **OpenSky Network** | **Non-commercial research/education** | ❌ **NO** | Optional | Schäfer et al., *Bringing Up OpenSky*, IPSN 2014 + opensky-network.org |
| adsb.lol | **ODbL 1.0** | ✅ | No | "adsb.lol" (ODbL) |
| AISStream.io | Free, beta, **no formal ToS**; AIS is a public broadcast | Unclear | Yes | "AISStream.io" (courtesy) |
| CelesTrak | US-government-origin, no licence; citation requested | ✅ | No | "CelesTrak (celestrak.org), Dr. T.S. Kelso" |
| The Space Devs Launch Library 2 | TSD terms; attribution encouraged; 15 calls/hr unauthenticated | ✅ | Optional | "Launch Library 2 — The Space Devs" |
| USGS | **US public domain** | ✅ | No | "Data courtesy of the U.S. Geological Survey" |
| NASA FIRMS | **CC0** / US public domain | ✅ | No | Citation requested |
| OSM Overpass | **ODbL 1.0** | ✅ | No | "© OpenStreetMap contributors" |
| OSM Overpass — freight rail, trunk road, pipelines, production sites | **ODbL 1.0** | ✅ | No | "© OpenStreetMap contributors" + share-alike on any derived database |
| **OurAirports** (`airports.csv`, bundled as `src/supplychain/reference/airGateways.js`) | **Public domain** | ✅ | No | None required; "OurAirports — ourairports.com" given anyway |
| **WRI Aqueduct 4.0** (via the Esri Living Atlas feature service) | **CC BY 4.0** | ✅ | No | "Aqueduct 4.0, World Resources Institute (WRI)" — hosted by Esri |
| TomTom Traffic | TomTom for Developers (proprietary) | Own key | **Yes** | "Traffic flow data © TomTom" |
| Photon (komoot) | Service: fair use, no bulk. Data: **ODbL 1.0** | Fair use only | No | "Photon (komoot)" + "© OpenStreetMap contributors" |
| Nominatim | ODbL 1.0 + usage policy: **max 1 req/s**, cache, identifying UA | Policy-bound | No | "© OpenStreetMap contributors" |
| Open-Meteo | **CC BY 4.0**, adjacent-link attribution required | ✅ | No | Linked "Weather data by Open-Meteo.com" **beside the data** |
| Google News RSS | **Personal, noncommercial use only** | ❌ **NO** | No | "Google News RSS" + each publisher |
| GDELT DOC 2.0 | GDELT ToU — unrestricted academic/commercial/gov, citation + link required | ✅ | No | "GDELT Project" + each publisher |
| OSRM on FOSSGIS | Usage policy: attribution + "fix the map" link, **1 req/s**, no heavy use; commercial only with restrictions | Restricted | No | "Routing: OSRM on the FOSSGIS servers" + "© OpenStreetMap contributors" + fix-the-map link |
| Re:Earth Terrain (Mapterhorn) | Mesh **CC BY 4.0**; geoid EGM2008 (NGA, public domain) | ✅ | No | "Re:Earth Terrain / Mapterhorn (CC BY 4.0) / EGM2008 (NGA)" |
| Radio Browser | Directory **PDDL 1.0**; broadcaster stream terms apply | ✅ | No | "Radio Browser" + broadcaster link |
| GBFS (Lyft / BCycle) | Per-feed, attribution-only | Per feed | No | Operator + its `license_url` |
| **13 CCTV catalogs** | Mixed: **CC BY 4.0 required** (Live Traffic NSW, Fintraffic), **TfL Open Data required**, OGL-Ontario / OGL-BC / OGL-Calgary required; others "courtesy" with no published terms | Per source | No | Per source — see `DATA_SOURCES.md` |
| **7 transit feeds** (MBTA, CapMetro, Metro Transit, OVapi, Entur, TransLink QLD, HSL) | Open realtime vehicle data published for developer use | Per agency | No | Courtesy attribution per agency |

## 3. New — supply-chain sources added by this project

| Source | Use | Licence | Commercial OK | Redistribution | Key | Required attribution |
| --- | --- | --- | --- | --- | --- | --- |
| **UN Comtrade** (public preview API) | Bilateral trade by HS commodity, value + net weight | UN Comtrade terms of use — free public access; attribution expected; **bulk redistribution restricted** | ✅ with attribution | **Cache only, do not republish bulk extracts** | **No** | "Source: UN Comtrade (comtradeplus.un.org)" |
| **World Bank Indicators API v2** | GDP, population, trade indicators, LPI | **CC BY 4.0** | ✅ | ✅ with attribution | **No** | "Source: World Bank — data.worldbank.org (CC BY 4.0)" |
| **GDACS** (Global Disaster Alert and Coordination System) | Live natural-hazard events: earthquakes, cyclones, floods, volcanoes, droughts, wildfires | GDACS terms of use — free public access, attribution expected | Attribution | **Query and cache; do not mirror the feed** | **No** | "Source: GDACS — Global Disaster Alert and Coordination System (European Commission / UN)" |
| **NGA World Port Index** | Port identity, location, harbour type/size, depths, UN/LOCODE | **US Government public domain** (17 U.S.C. §105) | ✅ | ✅ unrestricted | **No** | "Source: National Geospatial-Intelligence Agency, World Port Index" (courtesy) |
| **IMF DataMapper** | Macro indicators and forecasts | IMF terms — free access, attribution required, redistribution restricted | Attribution | **Query, do not mirror** | No | "Source: International Monetary Fund" |
| **OECD SDMX** | Structural/trade statistics | OECD terms — free reuse with attribution; some datasets restricted | Attribution | Per dataset | No | "Source: OECD" |
| **Natural Earth** (ports, countries) | Reference geometry | **Public domain** | ✅ | ✅ | No | "Made with Natural Earth" (courtesy) |
| **Curated chokepoint geometry** | Strait/canal polygons + dependency notes | Authored by this project (MIT) from cited public sources | ✅ | ✅ | No | Per-record `sources[]` citation |
| **Curated disruption timeline** | Historical documented disruptions | Authored by this project (MIT); each entry cites a public source | ✅ | ✅ | No | Per-record `sources[]` citation |

### 3.1 Sources deliberately NOT used, and why

| Source | Reason |
| --- | --- |
| WTO Timeseries API | Returned **401** — requires a subscription key this project does not hold. |
| ACLED | Requires a registered account; academic licence with redistribution limits. Its conflict/strike coverage is therefore absent, and GDACS does not substitute for it. |
| EM-DAT | Requires an account; academic licence. |
| Lloyd's List / Drewry / Alphaliner (port throughput) | Commercial, paywalled. |
| SEMI / TechInsights (fab capacity) | Commercial, paywalled. |
| Panjiva / ImportGenius (bills of lading) | Commercial; would be the only route to per-shipment cargo. |

**Not using these is a stated limitation, not an oversight.** Each is recorded in
`docs/DATA_AVAILABILITY_MATRIX.md` §3 as BLOCKED, and the corresponding feature is degraded
in the UI rather than faked.

---

## 4. Removing the NonCommercial datasets (for commercial use)

This is a code change, not a file deletion. Both datasets are referenced from runtime code
*and* tests.

**TeleGeography submarine cables** — referenced from 30+ files, including:
`src/layers/submarineCables/{bundledSource,ingestion,rendering,lifecycle,policy}.js`,
`src/data/{localLayers,dataCredits,layerState}.js`, `src/ui/layerPanel.js`,
`src/voice/{actionSchemas,gevActions}.js`, `src/overlays/worldOverlayAllocation.worker.mjs`,
`server/providers/openai/{toolDescriptions,instructions}.js`, several `scripts/qa-*.mjs`, and
the tests `src/data/telegeographySubmarineCables.test.mjs`,
`src/scenes/{director,scenePolicy}.test.mjs`, `src/firstRunExperience.test.mjs`,
`src/qaL9MatrixVerdicts.test.mjs`, `src/overlays/worldOverlayAllocation.test.mjs`.

**Bhote Koshi pack** — referenced from `src/scenes/packs/nepal.js`,
`src/scenes/nepalEvidencePack.js`, `src/scenes/recipes.js`, `src/app/constructCatalog.js`,
`src/app/tools.js`, `src/overlays/worldOverlay.js`, and the tests
`src/sharelink.celestial.test.mjs`, `src/app/constructCatalog.test.mjs`,
`src/scenes/{director,scenePolicy}.test.mjs`.

Removal therefore requires: deleting the data, removing the layer/scene registration, and
updating the affected tests to assert the layer's *absence*. Budget it as real work.

---

## 5. Standing obligations

1. **Every new source registers in `src/data/dataCredits.js`.** Upstream routes per-layer
   credits into the expandable "Data attribution" lightbox on the credit line, which stays
   visible in clean-view and recording modes. A source that renders without a credit is a
   licence violation, not a cosmetic bug.
2. **Open-Meteo requires its attribution *adjacent to the displayed data***, not only in the
   lightbox.
3. **Google and Esri credits render on the on-globe credit line** and must not be suppressed.
4. **ODbL share-alike propagates** to derived databases — including any supply-chain graph
   edge whose geometry is derived from OSM/Overpass. Such edges are tagged `odbl: true` in
   the graph model so the obligation is machine-visible.
5. **Rate-limit policies are licence terms, not performance advice.** Nominatim and FOSSGIS
   OSRM are 1 req/s; violating them breaches the usage policy.
6. **UN Comtrade extracts are cached, never republished in bulk.** The server cache is a
   performance cache with a TTL, not a redistribution mirror.
