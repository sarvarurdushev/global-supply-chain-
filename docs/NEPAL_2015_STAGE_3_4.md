# Nepal 2015 — Stage 3 (seismic) and Stage 4 (population exposure)

Final validated results. Re-run with `node pipelines/run-analysis.mjs`; neither
stage downloads anything.

Every analysis below is recorded in the same seven fields: **Dataset,
Processing, Analysis, Result, Validation, Limitation, Classification.**

---

## The vocabulary this document is written in

Five impact variables, deliberately kept apart. They are measured differently,
by different people, and **none implies another**.

| Variable | Measures | Does not imply | Can we derive it? |
| --- | --- | --- | --- |
| **Exposure** | People inside a modelled hazard footprint at a stated intensity | Injury, death, damage, displacement or need | **Yes** — this stage |
| **Damage** | Structures observed damaged or destroyed | That anyone inside was harmed | **Yes** — Stage 5 |
| **Casualties** | People killed or injured | Anything about damage distribution | **No** — agency counts only |
| **Humanitarian need** | People assessed as requiring assistance | That their home fell | **No** — cluster assessments |
| **Displacement** | People who left home | That their house was destroyed | **No** — IOM DTM |

**Sanctioned phrasing:** *"N people were geographically exposed to modelled
shaking of MMI X or greater."*

**Never:** "affected", "impacted", "victims", "hit by", "suffered". Those words
assert harm this analysis does not measure. A test scans the shipped artefacts
for them and fails the build if one appears.

### Result classes — an observation is not a fitted parameter

| Class | Means |
| --- | --- |
| `OBSERVED` | Recorded by an instrument or read from an agency catalogue |
| `DESCRIPTIVE_STATISTIC` | A count or median computed directly from observations; adds no assumptions |
| **`MODEL_FIT`** | **A parameter of a statistical model fitted to observations. Depends on the model, the window and the data excluded. NOT a measurement of the earth.** |
| `DERIVED` | Computed by combining datasets, no free parameters |
| `ESTIMATE` | Computed here, and a stated assumption changes the answer |
| `OFFICIAL` | Published by an authoritative body |
| `SCENARIO` | A hypothetical, never a claim about what happened |

The b-value and the Omori exponent are **`MODEL_FIT`**. The magnitude of the
main shock is `OBSERVED`. The artefact carries this classification per result
so a plot cannot silently present one as the other.

---

# STAGE 3 — SEISMIC

**Output:** `data/analysis/nepal-2015-seismic-analysis.json` — 6 methodology records.

## The main earthquake — `OBSERVED`

| | |
| --- | --- |
| Event | `us20002926` |
| Magnitude | **M 7.8** |
| Origin | **2015-04-25T06:11:25.950Z** |
| Epicentre | 28.2305 N, 84.7314 E |
| Depth | 8.2 km |

## 3.1 Magnitude distribution

- **Dataset** — USGS FDSN catalogue, 316 events M2.5+ within 300 km, one year.
- **Processing** — Events binned into fixed magnitude bands.
- **Analysis** — `count(M in [min, max))` per band.
- **Result** — M2.5–4: 10 · M4–5: **270** · M5–6: 30 · M6–7: 4 · M7+: **2**.
- **Validation** — Bands sum to 316 exactly; asserted, not spot-checked.
- **Limitation** — Complete only above the completeness magnitude; the lowest band is a lower bound.
- **Classification** — `DESCRIPTIVE_STATISTIC`.

## 3.2 Depth distribution

- **Dataset** — As above.
- **Processing** — Binned into seismological depth bands; events with no depth counted separately, never as 0 km.
- **Analysis** — Counts plus median and range.
- **Result** — Median **10 km**, range 2.6–42.4 km, **0 events missing depth**.
- **Validation** — `withDepth + missingDepth = 316`.
- **Limitation** — Shallow continental depths carry uncertainties of several km; some are analyst-fixed rather than solved.
- **Classification** — `DESCRIPTIVE_STATISTIC`.

## 3.3 Temporal evolution

- **Dataset** — As above.
- **Processing** — Hourly buckets for 72 h, daily thereafter; bucket width changes because the rate falls by orders of magnitude.
- **Analysis** — Counts and a running cumulative.
- **Result** — **89 events in the first 24 h**, 135 in the first week.
- **Validation** — Cumulative never decreases; partition `0 foreshocks + 1 main + 315 aftershocks = 316` reconciles.
- **Limitation** — Small aftershocks in the first hours are masked by the main shock's coda, so the earliest buckets understate the true rate most.
- **Classification** — `DESCRIPTIVE_STATISTIC`.

| Event | M | When | From main shock | Distance |
| --- | ---: | --- | ---: | ---: |
| Main shock | 7.8 | 25 Apr 06:11 | — | 0 km |
| | 6.6 | 25 Apr 06:45 | +0.6 h | 8.9 km |
| | 6.7 | 26 Apr 07:09 | +25.0 h | 136 km |
| **Second main shock** | **7.3** | **12 May 07:05** | **+408.9 h** | **139 km** |

## 3.4 Gutenberg–Richter b-value — **`MODEL_FIT`**

- **Dataset** — 315 aftershocks.
- **Processing** — Completeness magnitude estimated by maximum curvature; events below it excluded.
- **Analysis** — Least squares on `log10 N(≥M) = a − b·M` over the cumulative distribution.
- **Result** — At Mc 4.0: **b = 0.80**, R² = 0.97. Across plausible cuts 4.0–4.8: **b = 0.69 to 0.80**.
- **Validation** — A synthetic catalogue built with a known **b = 1** is recovered as **1.00 ± 0.12** by the same estimator.
- **Limitation** — The magnitude histogram has a **cliff at exactly M4.0 — 41 events at 4.0 against 2 at 3.9, a 20.5× jump**. That is a *reporting* threshold, not a detection limit, so the true completeness is higher than maximum curvature returns and a single b is false precision. **Report the range.**
- **Classification** — `MODEL_FIT`. Not an observation.

| Completeness cut | b | R² | Events |
| --- | ---: | ---: | ---: |
| 4.0 | 0.80 | 0.97 | 305 |
| 4.4 | 0.76 | 0.96 | 153 |
| 4.8 | 0.69 | 0.95 | 61 |

## 3.5 Omori decay — **`MODEL_FIT`**

- **Dataset** — 315 aftershocks; daily counts.
- **Processing** — Fitted three ways: whole window, and segmented at the largest aftershock.
- **Analysis** — Least squares on `log10(rate)` against `log10(t + c)` for `n(t) = K/(t+c)^p`, with **c held at 0.1 days** rather than fitted — three free parameters against a few dozen daily counts produces a number with no meaning.
- **Result** —

| Window | p | R² | Days |
| --- | ---: | ---: | ---: |
| Whole year, one fit | **0.42** | **0.44** | 86 |
| **Before 12 May** | **1.07** | **0.72** | 17 |
| After 12 May, re-zeroed | 0.25 | 0.33 | 68 |

- **Validation** — A synthetic two-sequence catalogue is fitted better by the segmented model than the whole-window one, confirming the segmentation detects what it claims to.
- **Limitation** — **The poor whole-window fit is the finding, not noise.** Omori describes decay from *one* main shock; the M7.3 restarted the sequence at day 17. The post-12-May window is superimposed on continuing decay from 25 April, so re-zeroing it is itself an approximation and its fit is correspondingly poor.
- **Classification** — `MODEL_FIT`.

## 3.6 Spatial distribution

- **Result** — Rupture extent **495 km E–W × 291 km N–S**; 107 of 315 aftershocks within 100 km of the epicentre.
- **Processing** — Distances computed in EPSG:32645 metres, not degrees.
- **Limitation** — Epicentres are horizontal projections; two events 5 km apart on the map may be 30 km apart in the rock. The 300 km search radius is a circle, not a tectonic boundary.
- **Classification** — `DESCRIPTIVE_STATISTIC`.

---

# STAGE 4 — POPULATION EXPOSURE

**Output:** `data/analysis/nepal-2015-population-exposure.json` — 4 methodology records.

## 4.1 What "exposed" means here

> A person is counted as exposed at intensity X when the ~819 m population cell
> they are modelled into has its centre inside the **closed MMI X contour** of
> the USGS ShakeMap for this event.

| | |
| --- | --- |
| Hazard variable | Modified Mercalli Intensity (USGS ShakeMap) |
| Headline threshold | **MMI VI** — the lowest intensity at which the USGS scale records damage occurring at all |
| Spatial test | point-in-polygon of the cell centre in the closed ring |
| Population | WorldPop 2015 UN-adjusted, aggregated to ~819 m |
| Geographic unit | Nepal districts, the 2015 75-district system, from OCHA COD-AB |

## 4.2 + 4.7 The threshold curve

**The result is a curve, not a number.** Every row in the artefact carries its
threshold, source, definition, calculation and result, so no row can be quoted
without its definition travelling with it.

| Threshold | | Exposed | Share | USGS damage description |
| --- | --- | ---: | ---: | --- |
| MMI 4.5 | IV–V | **20.85 M** | 77.2% | None to very light |
| MMI 5 | V | 18.93 M | 70.1% | Very light |
| MMI 5.5 | V–VI | 15.91 M | 58.9% | Very light to light |
| **MMI 6** | **VI** | **13.84 M** | **51.2%** | **Light — damage begins** |
| MMI 6.5 | VI–VII | 11.69 M | 43.3% | Light to moderate |
| MMI 7 | VII | 7.45 M | 27.6% | Moderate, general in poor construction |
| MMI 7.5 | VII–VIII | 1.43 M | 5.3% | Moderate to heavy |
| MMI 8 | VIII | 235,000 | 0.9% | Heavy, partial collapse |

**Three levels are dropped, with reasons recorded in the artefact:**

| Level | Why |
| --- | --- |
| MMI 3 | 3 of 4 parts run beyond the ShakeMap grid |
| MMI 3.5 | 7 of 16 parts run beyond the grid |
| MMI 4 | 1 of 14 parts runs beyond the grid |

A level is usable only if **every** part is closed. Keeping the closed parts of
a partly open level reports a figure that silently omits the rest of the area at
that intensity — a partial answer presented as a whole one.

- **Validation** — Cumulative exposure is monotonic in the threshold (asserted); a higher threshold cannot expose more people.
- **Limitation** — Exposure is not harm. A cell is assigned whole to the contour containing its centre.
- **Classification** — `DERIVED`.

## 4.3 Population reconciliation — the district attribution ledger

Every person is accounted for in one of three places. **The fallback is
reported as its own line and never folded into district totals silently.**

| | |
| --- | ---: |
| Nepal population total | **27,010,569** |
| Sum of district-attributed population | **27,010,569** |
| **Difference** | **0** |
| Cells assigned by containment | **176,431** |
| **Cells assigned by FALLBACK (proximity)** | **1,248** |
| **People assigned by FALLBACK** | **119,471 (0.4%)** |
| Cells unassigned | **0** |

> ⚠️ **119,471 people (0.4% of Nepal) are attributed to a district by
> PROXIMITY, not containment.** Their district assignment is the least certain
> in this dataset. Each district reports how many of its people arrived that
> way, and the artefact carries the per-district breakdown.

The fallback tolerance is **20 km**, measured rather than chosen: every cell
strict containment fails to place lies within that distance of a boundary.

**This improved by an order of magnitude when the boundaries were replaced:**
under geoBoundaries the fallback carried **1,321,592 people (4.9%)**; under
COD-AB it carries **119,471 (0.4%)**.

## 4.4 By district (top eight at MMI VI+)

| District | Exposed | Population | Share | Max MMI |
| --- | ---: | ---: | ---: | ---: |
| Kathmandu | 2.78 M | 2.78 M | 100% | 7.5 |
| Parsa | 896,000 | 896,000 | 100% | 7 |
| Siraha | 749,000 | 754,000 | 99.4% | 6.5 |
| Sarlahi | 730,000 | 730,000 | 100% | 7.5 |
| Dhanusa | 702,000 | 702,000 | 100% | 7 |
| Rautahat | 663,000 | 663,000 | 100% | 7 |
| Bara | 658,000 | 658,000 | 100% | 7 |
| Nawalparasi | 609,000 | 609,000 | ~100% | 7 |

## 4.5 Population × intensity — the new analytical output

Two maps side by side make a reader do the crossing in their head, and they do
it badly: the eye goes to the darkest patch on either map rather than to where
the two coincide. So the coincidence is computed.

| Quadrant | People | Share | Cells | What it means |
| --- | ---: | ---: | ---: | --- |
| **High shaking, high density** | **11.83 M** | 43.8% | 18,788 | Where the most people met the strongest shaking |
| High shaking, low density | 2.00 M | 7.4% | 42,673 | Severe shaking over few people — remote, often hardest to reach |
| Low shaking, high density | 9.47 M | 35.1% | 25,667 | Many people, little shaking — correctly excluded by the threshold |
| Low shaking, low density | 3.71 M | 13.7% | 90,551 | The rest of the country |

- **Processing** — Intensity split at the documented damage threshold (MMI VI). Density split at the **75th percentile of populated cells = 134.1 people/cell**, a quantile rather than an imported people-per-km² figure, so it adapts to how Nepal is settled.
- **Validation** — The four quadrants partition the populated cells exactly; shares sum to 100%; zero-population cells are excluded rather than classified.
- **Limitation** — Both splits are choices and both are reported. "High shaking, low density" is small in absolute numbers and may still be where access is worst — the quadrant is not a ranking.
- **Classification** — `DERIVED`.

## 4.6 OCHA comparison — verdict: **NOT COMPARABLE**

Assessed dimension by dimension before any number was placed beside another.
**6 of 7 dimensions are incompatible.**

| Dimension | Ours | OCHA | Compatible? |
| --- | --- | --- | :---: |
| Geographic unit | 2015 75-district frame, COD-AB | District names, no p-code or boundary | ✅ |
| Population dataset | WorldPop 2015 UN-adjusted | **Undocumented** ("Census") | ❌ |
| Hazard variable | Modified Mercalli Intensity | Peak ground acceleration | ❌ |
| Hazard threshold | MMI VI, justified | **Not stated** | ❌ |
| Reference year | 2015 | Unstated | ❌ |
| Spatial method | Point-in-polygon per cell | Inferred GIS overlay, not documented | ❌ |
| **Quantity measured** | **Population exposed at a stated intensity** | **Unresolved** | ❌ |

**The decisive dimension is the last one.** Two readings were tested against the
data and both fail:

1. **District total population?** No — Jhapa reads **1,511** for a district of roughly 800,000.
2. **Population inside the shaken footprint?** No — in **52 of 66** districts the figure **exceeds the district's own population**, which a clipped subset cannot do.

**No difference is computed.** The two sets are shown side by side. Computing a
percentage difference would have been easy and would have meant nothing.

**A lead, recorded but not asserted:** across the flagged districts the OCHA
figure sits at a consistent **median ×1.35** of ours. Nepal's growth from the
2011 census to 2015 is about ×1.05, so a systematic ×1.35 points at a different
population **base** rather than a different spatial method. HDX hosts an "HMIS
Estimated population data 2014-2015" set that would be a candidate. Not pursued.

**What would change the verdict:** a column definition or methodology note from
OCHA. With the quantity established, the verdict would move to *partially
comparable* — the hazard variables would still differ, but that difference can
be named and bounded.

---

## Data quality

### Resolved during this stage

| Anomaly | Resolution |
| --- | --- |
| Omori p = 0.42, R² = 0.44 | Not noise — a two-main-shock sequence fitted with a one-main-shock model. Segmented; p = 1.07 before 12 May |
| b-value looked precise at 0.80 | Reporting-threshold cliff at M4.0 detected; reported as a range 0.69–0.80 |
| Two polygons named "Saptari", two "Bara" | geoBoundaries replaced by COD-AB; keying on names had merged each pair |
| Patan resolved to Kathmandu | COD-AB at 329 vertices/district; all six containment checks pass |
| 55 of 66 OCHA districts joined | **66 of 66** now join |
| 1.32 M people in no district (4.9%) | **119,471 (0.4%)** after the boundary replacement, all reported as fallback |
| MMI 3/3.5/4 partially counted | Levels with any open part now dropped entirely, with the reason recorded |
| "affected" in an artefact string | Rephrased; a test now scans shipped artefacts and fails on forbidden phrasing |

### Unresolved, and why

| Issue | Status |
| --- | --- |
| OCHA's `population` column semantics | **Unresolved.** Needs a definition from the publisher. Blocks any difference calculation |
| WorldPop vs census in dense urban districts | **Known model property.** Our Kathmandu figure runs above the projected census count while Lalitpur and Morang land within a few per cent |
| ShakeMap revision | Current revision used, not the April 2015 one responders saw. The hazard field has changed since |
| Casualties, need, displacement | **Not derivable here.** Agency products only — recorded as such in the vocabulary |

---

## Reproducibility

- `npm test` — **4,928 passing**, 0 failing
- `npm run build` — clean
- `npm run check:boundaries`, `check-import-directions` — clean
- `node pipelines/run-all.mjs --force` then `node pipelines/run-analysis.mjs` — reproduces every figure above
- Committed artefacts: `data/processed` (8.31 MB), `data/analysis` (145 KB), `data/registry`, `data/reports`
