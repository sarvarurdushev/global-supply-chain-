# Nepal 2015 Earthquake — Data Inventory

**Every entry below was probed from this machine on 2026-09-21.** Nothing here is
recalled from memory or assumed from documentation: each row records the HTTP
status, payload size and, where the file was opened, the real feature counts and
attribute values. Where a probe failed, it says so.

The measured facts in this document are the evidence base for the methodology
write-up. If a number appears in the application, it should be traceable to a
row here.

---

## 0. The headline finding, and a correction to our own earlier record

`docs/DATA_AVAILABILITY_MATRIX.md` register row 17 states that observed,
per-asset infrastructure damage "is not published as data" for these events, and
that the interface must therefore never colour an asset `CLOSED`.

**For Nepal 2015 that is wrong, and this inventory disproves it.** The UNOSAT
activation package contains NGA-produced layers of *observed* damage:

| Layer | Features | Geometry | What it asserts |
| --- | --- | --- | --- |
| `NGA_Impassable_Roads_Nepal_May_7th_2015` | **179** | POLYLINE Z | `Damage = BLOCKED_ROAD` |
| `NGA_Bridge_Out_Nepal_May_6th_2015` | **5** | POINT | `Damage = BRIDGE_OUT` |
| `NGA_Landslides_Nepal_May_7th_2015` | **51** | POLYGON Z | `Damage = LANDSLIDE` |

That is exactly the cited per-asset register the `applyCitedStatus` adapter was
built for and shipped empty. It can now be filled with real data, and the
infrastructure lifecycle stops being four structural zeroes. Register row 17
must be rewritten from "does not exist" to "exists for this event, from this
source, with these limits".

---

## 1. Earthquake event — USGS

| Field | Value |
| --- | --- |
| **Dataset** | USGS FDSN event service + ComCat products |
| **Publisher** | U.S. Geological Survey |
| **Endpoint** | `https://earthquake.usgs.gov/fdsnws/event/1/query` |
| **Licence** | US public domain |
| **Format** | GeoJSON, XML (PAGER), GeoJSON (ShakeMap contours) |
| **CRS** | WGS 84 (EPSG:4326) |
| **Probe** | HTTP 200, 110.8 KB, 543 ms |

**Main event, as returned:** `us20002926`, **M 7.8**, "67 km NNE of Bharatpur,
Nepal", origin `1429942285950` ms = **2015-04-25T06:11:25.950Z**, `mmi 8.718`,
`alert "red"`, `cdi 8.2`, `felt 1134`, `sig 2820`, `status "reviewed"`.

**Aftershocks (measured):** the `count` endpoint returns **316 events of M ≥ 2.5
within 300 km in the year following**. The M 7.3 of 12 May 2015 is in that set.
Query used:

```
/count?format=geojson&starttime=2015-04-25&endtime=2016-04-25
      &latitude=28.147&longitude=84.708&maxradiuskm=300&minmagnitude=2.5
```

**Already integrated.** `src/disaster/sources/usgs.js` reads the event, ShakeMap
`cont_mmi.json`, PAGER `pager.xml` / `exposure.xml`, `finite-fault` `FFM.geojson`,
ground-failure properties and DYFI. Aftershock *search* exists; aftershock
*analysis* (magnitude/depth/time distributions) does not.

**Known trap, already handled:** `<georss:point>` in PAGER XML is `"lat lon"`,
the opposite order from GeoJSON.

---

## 2. Satellite-derived damage — UNOSAT + Copernicus EMSR125 + NGA

This is the single most valuable download for the project.

| Field | Value |
| --- | --- |
| **Dataset** | `EQ20150425NPL_shp.zip` — consolidated activation package |
| **Publisher** | UNOSAT (UNITAR), containing Copernicus EMS and NGA products |
| **URL** | `https://cern.ch/unosat-maps/NP/EQ20150425NPL/EQ20150425NPL_shp.zip` |
| **Discovered via** | HDX `package_show` on the Sankhu / Bhaktapur damage datasets |
| **Licence** | HDX records "Other" — **must be read from the package before publishing derived data** |
| **Probe** | HTTP 200, **3.68 MB**, 168 files, **29 shapefile layers** |

### 2.1 UNOSAT damage points — opened and counted

`UNOSAT_Damage_Sites.shp`: **4,583 POINT features**, WGS 84, bbox lon
84.3751–85.5341, lat 27.5779–28.1919.

| `Main_Damag` | Count |
| --- | --- |
| Destroyed | **2,084** |
| Severe Damage | **1,347** |
| Moderate Damage | **1,057** |
| Possible Damage | **95** |

Other fields: `SensorDate` (20150426: 56, 20150427: 778, 20150429: 2,528,
20150503: 1,221 — **a real temporal dimension**), `Confidence` (Medium 4,325,
Very High 162, Uncertain 96), `Settlement`, `SensorID`, `EventCode`.

> **Limitation that must appear in the UI:** `FieldValid` reads
> **"Not yet field validated" for all 4,583 records.** These are remote-sensing
> interpretations, not ground survey. Also present: `UNOSAT_Damage_Zones.shp`.

### 2.2 Copernicus EMS EMSR125 — 8 areas of interest

Grading products (`crisis_information_point_grading`) for **01 KATHMANDU,
02 BHARATPUR, 03 POKHARA, 04 BIDUR (v1 + v2), 05 HETAUDA, 07 LEKHNATH
(delineation), 12 GORKHA, 14 CHILIME**, each with its `area_of_interest`.

`Copernicus_EMSR125_01KATHMANDU_02GRADING_v3_10000` — **961 points**:

| `grading` | Count |
| --- | --- |
| Negligible to slight damage | 543 |
| Not Affected | 216 |
| Completely Destroyed | 183 |
| *(empty)* | **14** |
| Not Applicable | 3 |
| Null | **2** |

Fields: `src_date, src_info, ext_scale, nam, ext_date, txt, act_id, source_nam,
grading, interpret, settl_type, subtype`.

> **Two findings for the methodology.** (a) The 19 empty/`Null`/`Not Applicable`
> records are a genuine data-quality case to log rather than silently drop.
> (b) UNOSAT and Copernicus use **different, non-interchangeable damage
> vocabularies** over overlapping ground — "Severe Damage" is not
> "Completely Destroyed". Harmonising them is a real data-fusion problem and
> should be presented as one, not hidden behind a single merged legend.

### 2.3 NGA observed infrastructure damage

The three layers in §0. **`NGA_*` layers are projected in `WGS_1984_UTM_Zone_45N`
(EPSG:32645), while the UNOSAT layers are geographic WGS 84.** A single package
therefore contains two coordinate systems — the concrete case that forces the
CRS-normalisation stage, and a good slide.

Also present: `Consolidated_UNOSAT_Copernicus_20150508.shp`,
`Consolidated_NGA_Damage_Zones_20150507.shp`.

### 2.4 Live activation portal

`https://rapidmapping.emergency.copernicus.eu/EMSR125` → **HTTP 200** (HTML).
The legacy `emergency.copernicus.eu/mapping/list-of-components/EMSR125` → **404**;
the service moved. Use the `rapidmapping` host for citation.

---

## 3. Administrative boundaries

| Source | Result | Verdict |
| --- | --- | --- |
| **geoBoundaries gbOpen NPL ADM2** | HTTP 200. **75 districts**, `boundaryYearRepresented: 2006`, **Public Domain**, simplified GeoJSON **147 KB** | ✅ **Use this** |
| geoBoundaries gbOpen NPL ADM3 | HTTP 200, 753 units, vintage **2019** | Wrong vintage for 2015 |
| HDX COD-AB `cod-ab-npl` | HTTP 200, SHP **53.7 MB**, GeoJSON **60.4 MB**, CC BY-IGO | Authoritative but too heavy to ship raw |

> **The join key problem, and why it matters.** Nepal restructured into 7
> provinces and 753 local units in 2015–2017. **The 2015 earthquake was reported
> against the old 75-district system.** ADM2/2006 (75 districts) is therefore the
> correct spatial frame for this event, and the modern COD-AB (which is
> post-restructuring) cannot be joined to 2015 district statistics without a
> crosswalk. This single fact governs every district-level aggregation we do.

---

## 4. Population

| Source | Result | Verdict |
| --- | --- | --- |
| **WorldPop `npl_ppp_2015.tif`** (unconstrained, ~100 m) | HTTP 200, **91.4 MB**, `image/tiff` | ✅ Correct year — needs a GeoTIFF reader and preprocessing |
| WorldPop `npl_ppp_2015_UNadj.tif` | HTTP 200, **82.0 MB** | UN-adjusted variant |
| WorldPop REST API (`hub.worldpop.org/rest/data/pop/wpgp?iso3=NPL`) | HTTP 200, JSON catalogue from 2000 | Use for provenance metadata |
| HDX `worldpop-population-counts-for-nepal` | Lists **2020 constrained** only | Wrong year — do not use for 2015 |
| HDX COD-PS `cod-ps-npl` | HTTP 200, CSV/XLSX, but **2023** | Wrong year |
| **OCHA `PGA_AffectedDistricts_POP.csv`** | HTTP 200, **66 district rows** | ✅ **Official comparator** |

The OCHA file is important: columns are
`id, objectid, zone, district, population, pga_value, severity_class, dist_id,
reg_code, zone_code, ocha_pcode, hlcit_code, ...` — district population against
**peak ground acceleration** and a severity class, published in 2015 by OCHA.
That lets us compare **our own derived population-exposure calculation against an
official one**, which is a far stronger presentation result than either alone.

> **Note the formatting trap:** `population` is quoted with thousands separators
> (`"275,903"`). Parsed naively it becomes `275`.

---

## 5. Infrastructure — OpenStreetMap / HOT

| Dataset | Size | Verdict |
| --- | --- | --- |
| `hotosm_npl_health_facilities` GeoJSON | **0.5 MB** | ✅ Ship directly |
| `hotosm_npl_roads` GeoPackage | **228 MB** | ❌ Too large for the hosted instance |
| `hotosm_npl_buildings` GeoPackage | **834 MB** | ❌ Too large |
| Overpass, via the app's own proxy | bounded by viewport | ✅ **Already built and working** |

All ODbL — attribution **and** share-alike attach to derived databases.

**Decision:** keep the existing Overpass proxy for bounded live queries (it
already caches, rotates mirrors and rate-limits), and pre-process one Nepal
study-area extract offline for the analyses that need a stable graph. Do not
download 834 MB at runtime.

---

## 6. Satellite imagery — and the constraint that decides the module

**Sentinel-2A launched 23 June 2015 — two months after the earthquake. There is
no Sentinel-2 "before" image of this event.** Any plan built on Sentinel-2
optical change detection for Nepal 2015 is impossible, and this is the kind of
thing that should be caught in a data inventory rather than three weeks in.

Landsat is available. Probed against the USGS STAC API
(`landsatlook.usgs.gov/stac-server`, keyless, HTTP 200), path/row **141041** over
Kathmandu, Collection 2 Level-2 surface reflectance:

| Window | Scenes | Best usable |
| --- | --- | --- |
| Before (Jan 1 – Apr 24 2015) | 14 | **2015-03-29, Landsat 8, 16.3 % cloud** |
| After (Apr 26 – Dec 31 2015) | 31 | **2015-06-01, Landsat 8, 7.3 % cloud** |

First post-event L8 scene is 2015-04-30 (5 days after) at 35.9 % cloud — usable
as an illustration, marginal for analysis. Landsat 7 scenes are cleaner on some
dates but carry **SLC-off striping** (the 2003 instrument failure), so a
like-for-like L8 → L8 pair is the defensible choice.

> **The honest limit, which must be stated in the UI:** Landsat is **30 m per
> pixel**. A collapsed house is roughly 10 m across. **We cannot detect building
> collapse from Landsat, and must not claim to.** What 30 m optical change
> detection can legitimately show is landslides, large debris fields and
> land-cover change. The 4,583 building-damage points come from **sub-metre
> commercial imagery** (WorldView-class) that UNOSAT could use and we cannot
> redistribute. Our imagery analysis and our damage layer are therefore two
> different claims from two different sources, and the interface must never let
> one be mistaken for the other.

---

## 7. Terrain

| Field | Value |
| --- | --- |
| **Dataset** | Copernicus DEM GLO-30 (30 m), COG on AWS Open Data |
| **URL** | `https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N27_00_E085_00_DEM/…tif` |
| **Probe** | HTTP 200, **44.9 MB** for the N27/E085 tile |
| **Why this and not SRTM** | NASA Earthdata products require an Earthdata Login; this is anonymous, and it is a Cloud-Optimised GeoTIFF, so windowed range reads are possible without downloading the tile |

Slope from a DEM is a real derived product and is what makes the 3D view
analytical rather than decorative: slope explains landslide-blocked roads.

---

## 8. Economic

| Source | Result | Verdict |
| --- | --- | --- |
| World Bank Indicators API | HTTP 200, keyless, JSON | ✅ Already integrated — macro context |
| **Nepal PDNA 2015** (NPC / World Bank) | PDF | ⚠️ **Not machine-readable** — figures must be transcribed with a page citation |
| HDX `nep-earthquake-topline-figure` | Google Sheets CSV export | Reachable; a 2015 OCHA topline |
| HDX `causalities-caused-by-earthquake-2015` | OpenNepal (marked **inactive**), `http://` only | ⚠️ Host likely dead — needs a fallback |

The PDNA total (≈ USD 7.0 bn) is already carried as a cited constant in
`src/disaster/catalogue.js`. It stays a **transcribed official figure with a page
citation**, never a computed one.

---

## 9. What we could NOT obtain

| Wanted | Status | Why |
| --- | --- | --- |
| Sentinel-2 pre-event imagery | **Impossible** | Satellite launched after the event |
| Sub-metre pre/post imagery | **Not redistributable** | Commercial (WorldView/Pléiades); UNOSAT's derived vectors are the public product |
| Building damage outside the mapped AOIs | **Does not exist** | UNOSAT/Copernicus covered 8 AOIs, not all 75 districts. Generalising their counts to Nepal would be fabrication |
| Ground-validated damage | **Does not exist in this package** | All 4,583 records read "Not yet field validated" |
| District economic loss | **Not published** | The PDNA total is national/sectoral, not per-district |
| Real 2015 road closure timeline | **Partial only** | NGA layers are dated 6–7 May 2015 — snapshots, not a time series |
| Actual relief convoy movements | **Not published** | Logistics Cluster reports are prose; FTS publishes funding, not tonnage |
