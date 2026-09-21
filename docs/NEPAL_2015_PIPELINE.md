# Nepal 2015 — Stage 0-2: registry, readers, ingestion

What was built, what it produced, and how each number was checked. Companion to
[`NEPAL_2015_DATA_INVENTORY.md`](NEPAL_2015_DATA_INVENTORY.md) (the measured
source evidence) and [`NEPAL_2015_ASSESSMENT.md`](NEPAL_2015_ASSESSMENT.md)
(the plan).

No visualisation work was done. This stage produces clean, validated,
reproducible datasets and nothing else.

---

## The chain, for every dataset

```
SOURCE ── RAW ── READER ── VALIDATE ── PROCESS ── ARTEFACT ── ANALYSIS
           │                                         │
     data/raw (gitignored,                    data/processed
     reproducible, 86.27 MB)                  (committed, 7.19 MB)
```

Each artefact carries its own provenance **inside the file**: source, publisher,
licence, retrieval date, the ordered lineage, the quality log, the validation
checks, and the limitations. A file separated from this repository still says
where it came from.

Re-run everything with `node pipelines/run-all.mjs --force`.

---

## What was built

### Stage 0 — registry and quality logging

| Module | What it enforces |
| --- | --- |
| `src/nepal/registry.js` | A dataset record missing any provenance field **throws**. So does a `dataClass` outside the five-value vocabulary, a `retrievedAt` of `"2015"`, and — the one that mattered — a licence of `"Other"`. |
| `src/nepal/quality.js` | `read = kept + dropped` must balance or `summary()` throws. A drop without a reason throws. A *repair* is counted separately from a drop, because a changed value is not a removed one. |

The `"Other"` rule is not hypothetical. HDX reports `license_title: "Other"` for
the UNOSAT damage datasets and puts the real terms in `license_other`, where
they read **CC BY-NC-SA 3.0**. Accepting the placeholder is how a project
redistributes NonCommercial data believing it is open.

### Stage 1 — readers, written rather than depended on

All portable (bytes in, values out), all in `src/nepal/io/` and `src/nepal/geo/`,
all unit-tested without a network.

| Reader | Scope | Validated against |
| --- | --- | --- |
| `zip.js` | Central directory, stored + deflate, via the web-standard `DecompressionStream` | The real 3.68 MB UNOSAT archive |
| `dbf.js` | dBASE III/IV; C/N/F/D/L types; deleted records skipped | The real UNOSAT and NGA attribute tables |
| `shapefile.js` | Point/Polyline/Polygon and their Z/M variants; **ring winding resolved into GeoJSON holes**; `.prj` read for UTM zone | Synthetic fixtures + the real package |
| `geotiff.js` | Classic TIFF **and BigTIFF**; LZW; **predictor 2**; strip-based float32; strip caching | Both WorldPop rasters |
| `csv.js` | RFC 4180; `parseNumber` repairs `"275,903"` and **refuses** `"1,5"` | The real OCHA CSV |
| `crs.js` | WGS 84 ↔ UTM 45N, areas and distances in metres | Round-trip error **0.05 mm**; the real NGA bbox corner reprojects into Nepal |
| `geometry.js` | Position, ring and study-area validation; duplicate keys; point-in-polygon with holes | — |
| `names.js` | Bounded-edit-distance name resolution, ambiguity refused | The 11 OCHA spellings that failed to join |

Three details in those readers are the difference between right and
plausible-but-wrong:

1. **Shapefile holes are encoded by winding only.** Read as a flat ring list,
   every hole becomes an island and every area is overstated.
2. **TIFF predictor 2 on float32 accumulates as `uint32`.** Summing in floating
   point yields a raster of the right size and shape that is quietly wrong.
3. **`Number("275,903")` is `NaN` and `parseInt` gives `275`.** A district of
   a quarter of a million people becomes a rounding error that survives every
   later sum looking reasonable.

### Stage 2 — seven ingests

| # | Artefact | Class | Size | Records | Check that had to pass |
| --- | --- | --- | ---: | ---: | --- |
| 1 | `nepal-2015-seismic.json` | OBSERVED | 124 KB | **316** events | Main shock is **M7.8 at 2015-04-25T06:11:25.950Z** or the ingest throws |
| 2 | `nepal-2015-shakemap-contours.json` | OBSERVED | 99 KB | 11 contours | MMI 3.0–8.0 in half steps, all within I–XII |
| 3 | `nepal-2015-unosat-damage-sites.json` | OBSERVED | 2.00 MB | **4,583** points | Class counts equal the inventory **exactly** |
| 4 | `nepal-2015-nga-infrastructure-damage.json` | OBSERVED | 294 KB | **179 / 5 / 51** | Counts match, and reprojected geometry lands in Nepal |
| 5 | `nepal-2015-copernicus-grading.json` | OBSERVED | 1.72 MB | 41,042 points, 7 AOIs | Superseded revisions excluded |
| 6 | `nepal-districts-adm2-2006.json` | OFFICIAL | 220 KB | **75** districts | Total area within **0.37 %** of Nepal's published land area |
| 7 | `nepal-district-name-crosswalk.json` | DERIVED | 30 KB | 75 verifications | **72 distinct join keys, zero duplicates** |
| 8 | `nepal-2015-ocha-district-exposure.json` | OFFICIAL | 30 KB | **66** districts | **62** resolve to a polygon; the other 4 each name a reason |
| 9 | `nepal-2015-population-1km.json` | ESTIMATE | 2.66 MB | 177,679 cells | Aggregation retains **99.9835 %** of population |

---

## What the validation actually caught

### The boundary file is not what it appears to be

geoBoundaries NPL ADM2 has exactly 75 features and its total area agrees with
Nepal's published land area to 0.37 %. By both cheap checks it is the pre-2015
75-district system. It is not clean:

- **Two polygons are labelled wrong.** The file calls **Siraha "Saptari"** and
  **Parsa "Bara"**. A third, labelled **"Jajarkot", is Dailekh**.
- **Ten names are transliterated differently** from every other source.
- **The vintage is mixed**: `Rukum_E`, `Rukum_W` and `Nawalapur` are *post-2015*
  splits inside a file whose declared vintage is 2006.

None of this was assumed. Every one of the 75 centroids was reverse-geocoded
against OpenStreetMap, the result cached in `data/raw`, and the corrections
recorded with their evidence. All 75 centroids lie inside their own polygon, so
the mislabels are not centroid artefacts.

**Why it matters:** a district join by name would have silently mismatched or
dropped districts, and the totals would still have looked reasonable.

### The OCHA join, before and after

| | Districts joined |
| --- | ---: |
| Naive name match | 55 of 66 |
| After verified crosswalk + bounded edit-distance resolution | **62 of 66** |

The remaining four are refused deliberately, each for a different reason:

| District | Why it cannot join |
| --- | --- |
| **Jajarkot** | The polygon bearing its name is Dailekh; Jajarkot has no polygon |
| **Nawalparasi** | Split after 2015; no single polygon represents the 2015 district |
| **Rukum** | Split after 2015 into East and West |
| **Rupandehi** | Simply absent from the source file |

Matching Jajarkot to Dailekh — its nearest neighbour, 4 edits away — would put
one district's statistics on another's geometry and the map would look
entirely plausible. The resolver refuses anything beyond 2 edits, anything
ambiguous, and anything whose edit distance is more than a quarter of the
name's length.

### WorldPop: two files, two formats, one right answer

| Variant | Format | Total | vs World Bank 2015 (27,823,629) |
| --- | --- | ---: | ---: |
| `npl_ppp_2015.tif` (unconstrained) | classic TIFF, predictor 1 | 30,723,449 | **+10.4 %** |
| `npl_ppp_2015_UNadj.tif` (UN-adjusted) | **BigTIFF, predictor 2** | 27,015,033 | **−2.91 %** |

Both decode to **identical populated-cell counts (19,092,069)**, which is what
confirms the BigTIFF and predictor handling rather than a plausible-looking
total. The UN-adjusted variant is the one carried forward, because the analysis
compares against census-derived district statistics.

### Copernicus: superseded revisions were being double-counted

The archive ships **BIDUR at both v1 and v2**. Reading both mixed a superseded
interpretation with its replacement and inflated that AOI. Only the latest
revision per AOI is now read: 45,893 → 41,093 records, and the artefact fell
from 24.44 MB to 1.72 MB once the points were stored columnar.

The grading vocabulary is **not uniform across AOIs** — some layers append an
EMS-98 grade (`"Completely Destroyed (EMS-98 grade 5)"`). Values are left
exactly as published. **UNOSAT's four damage classes and Copernicus's grading
scale are kept separate and are never merged**: reconciling them is an arguable
analysis decision, not an ingest step.

### Counts that differ from PHASE 1, and why

The inventory counted raw rows; the pipeline deduplicates on geometry first.
Kathmandu "Negligible to slight damage" is **543 raw rows → 540 distinct
points**: three grading points digitised twice at the same location. Recorded in
the artefact rather than left as an unexplained disagreement.

---

## Licensing: what may be committed, and what travels with it

Checked per dataset before anything was written.

| Artefacts | Licence | Committed | Obligation |
| --- | --- | --- | --- |
| seismic, shakemap | US public domain | ✅ | Attribution given as courtesy |
| districts | Public domain (geoBoundaries) | ✅ | — |
| population | CC BY 4.0 | ✅ | Attribution |
| OCHA exposure | CC BY-IGO 3.0 | ✅ | Attribution, share-alike |
| crosswalk | ODbL 1.0 (verifying source) | ✅ | Attribution, share-alike |
| **UNOSAT, Copernicus, NGA** | **CC BY-NC-SA 3.0** | ✅ | **NonCommercial + ShareAlike** |

> ⚠️ **New encumbrance.** The three damage artefacts are **NonCommercial**. This
> is recorded as entry 2 in `docs/DATA_LICENSE_MATRIX.md` §0 alongside the
> TeleGeography and Bhote Koshi datasets. A university or demonstration
> deployment is fine; a commercial one needs those three files removed or the
> data separately licensed.

Raw downloads are **not** committed: 86.27 MB, of which an 82 MB raster, and one
archive under NonCommercial terms. Every one is re-fetchable by re-running the
pipeline, and each artefact records the source URL and the SHA-256 of the bytes
it was built from.

---

## A correction to our own record

`DATA_AVAILABILITY_MATRIX.md` register row 17 stated that observed per-asset
infrastructure damage "is not published as data" for these events, and that the
interface may therefore never mark an asset closed. **For Nepal 2015 that was
wrong**, and one download disproved it. Row 17 has been rewritten. The real
remaining limitations are narrower and now stated: the NGA layers are a
single-date snapshot, absence is not evidence a road stayed open, and the
segments carry no OSM identifier so attaching them to a routable network is a
spatial join with a tolerance.

---

## Gates

- `npm test` — **4,886 passing**, 0 failing (67 new tests in `src/nepal/`)
- `npm run build` — clean
- `npm run check:boundaries` — clean
- `node scripts/check-import-directions.mjs` — clean; the readers are portable
  and Node-only I/O stays in `pipelines/`
- `node pipelines/run-all.mjs --force` — full re-download and rebuild reproduces
  every count in this document
