# Nepal 2015 — Stage 3 (seismic) and Stage 4 (population exposure)

What was computed, how it was checked, and the three defects the checks caught.
No visualisation work: these stages produce validated analytical results.

Re-run with `node pipelines/run-analysis.mjs`. Neither stage downloads anything.

---

# STAGE 3 — SEISMIC ANALYSIS

**Input:** `data/processed/nepal-2015-seismic.json` — 316 validated events.
**Output:** `data/analysis/nepal-2015-seismic-analysis.json` (38.6 KB, 6 methodology records).

## 3.1 The main earthquake

| | |
| --- | --- |
| Event | `us20002926` |
| Magnitude | **M 7.8** |
| Origin | **2015-04-25T06:11:25.950Z** |
| Epicentre | 28.2305 N, 84.7314 E |
| Depth | **8.22 km** |
| Place | 67 km NNE of Bharatpur |

Separated from aftershocks structurally, not by label: the partition is
`0 foreshocks + 1 main shock + 315 aftershocks = 316`, and the ingest refuses
to run if that does not reconcile.

## 3.2–3.5 Distributions

| Magnitude band | Events | | Depth band | Events |
| --- | ---: | --- | --- | ---: |
| M2.5–4 | 10 | | 0–10 km | (median 10 km) |
| M4–5 | **270** | | range | 2.64–42.44 km |
| M5–6 | 30 | | missing depth | **0** |
| M6–7 | 4 | | | |
| M7+ | **2** | | | |

Bands sum to 316 exactly, and depth is accounted for on every event — both
asserted, because a distribution that quietly drops records still looks like a
distribution.

**Temporal:** 89 events in the first 24 hours, 135 in the first week.

## 3.3 The timeline is the data

| Event | Magnitude | When | From main shock | Distance |
| --- | ---: | --- | ---: | ---: |
| Main shock | M7.8 | 25 Apr 06:11 | — | 0 km |
| | M6.6 | 25 Apr 06:45 | +0.6 h | 8.9 km |
| | M6.7 | 26 Apr 07:09 | +25.0 h | 136.3 km |
| **Second main shock** | **M7.3** | **12 May 07:05** | **+408.9 h** | **139.3 km** |
| | M6.3 | 12 May 07:36 | +409.4 h | 155.9 km |

## 3.6 Spatial

Rupture extent **494.6 km E–W × 290.8 km N–S**. Of 315 aftershocks, 107 lie
within 100 km of the epicentre. Distances are computed in EPSG:32645 metres,
not degrees.

## Two results that looked wrong, and what they turned out to be

### The Omori fit was bad because the model was wrong

A single decay law across the year returns **p = 0.418, R² = 0.44**. That is a
poor fit, and the poor fit is the finding. Omori's law describes decay from
**one** main shock; the M7.3 on 12 May restarted the sequence seventeen days in.

| Window | p | R² | Days |
| --- | ---: | ---: | ---: |
| Whole year, one fit | 0.418 | 0.44 | 86 |
| **Before 12 May** | **1.065** | **0.72** | 17 |
| After 12 May, re-zeroed | 0.253 | 0.33 | 68 |

p ≈ 1.07 before 12 May is textbook aftershock decay. All three fits are
reported: the poor one is the evidence for segmenting, and hiding it would turn
a reasoned decision into an unexplained one.

### The b-value is not as precise as it looks

Maximum curvature returns Mc = 4.0, giving **b = 0.799, R² = 0.97**. But the
magnitude histogram has a **cliff at exactly M4.0 — 41 events at 4.0 against 2
at 3.9**, a 20.5× jump. A detection limit produces a taper; a jump that sharp is
a *reporting* threshold, so the catalogue is incomplete below it whatever
maximum curvature says.

| Completeness cut | b | R² | Events |
| --- | ---: | ---: | ---: |
| 4.0 | 0.799 | 0.970 | 305 |
| 4.4 | 0.759 | 0.960 | 153 |
| 4.8 | 0.693 | 0.953 | 61 |

b falls monotonically as the cut rises — what happens when a fit that included
incomplete bins is progressively cleaned. **The honest statement is b ≈ 0.69–0.80**,
not a single value to three decimals.

## 3.8 Validation — all assertions, not spot checks

| Check | Result |
| --- | --- |
| Event count = 316 | ✅ |
| Main shock M7.8 at 06:11:25.950Z | ✅ |
| 12 May M7.3 present | ✅ +408.9 h, 139.3 km |
| Duplicate event ids | ✅ none |
| Partition reconciles (0 + 1 + 315 = 316) | ✅ |
| Magnitude bands sum to the total | ✅ |
| Every event accounted for on depth | ✅ |

A synthetic catalogue built with a known b = 1 is recovered as **b = 1.00 ± 0.12**
by the same estimator — the fit is tested against a known answer, not against
the number this project happens to produce.

---

# STAGE 4 — POPULATION EXPOSURE

**Output:** `data/analysis/nepal-2015-population-exposure.json` (66.2 KB, 4 methodology records).

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
| Geographic unit | Nepal districts, the 2015 75-district system |

**Exposed does not mean harmed.** It is a geographic statement about modelled
shaking over modelled population. It does not say anyone was injured, that a
building failed, or even that they were at home — the earthquake struck at
11:56 on a Saturday morning.

## 4.2 + 4.7 The result is a curve, not a number

| Threshold | | Exposed | Share | Damage at this intensity |
| --- | --- | ---: | ---: | --- |
| MMI 4.5 | IV–V | 20,846,924 | 77.2% | None to very light |
| MMI 5 | V | 18,930,889 | 70.1% | Very light |
| MMI 5.5 | V–VI | 15,908,941 | 58.9% | Very light to light |
| **MMI 6** | **VI** | **13,835,518** | **51.2%** | **Light — damage begins** |
| MMI 6.5 | VI–VII | 11,688,706 | 43.3% | Light to moderate |
| MMI 7 | VII | 7,453,534 | 27.6% | Moderate, general in poor construction |
| MMI 7.5 | VII–VIII | 1,431,894 | 5.3% | Moderate to heavy |
| MMI 8 | VIII | 235,116 | 0.9% | Heavy, partial collapse |

**MMI 3 and 3.5 are not reported.** Those contours run beyond the edge of the
ShakeMap grid and are not closed; closing them along the grid edge would assert
a boundary the model does not publish.

## 4.5 By district (top eight at MMI 6+)

| District | Exposed | Population | Share | Max MMI |
| --- | ---: | ---: | ---: | ---: |
| Kathmandu | 2,779,012 | 2,779,012 | 100% | 7.5 |
| Parsa | 896,158 | 896,158 | 100% | 7 |
| Siraha | 748,962 | 753,897 | 99.4% | 6.5 |
| Sarlahi | 730,125 | 730,125 | 100% | 7.5 |
| Dhanusa | 701,731 | 701,731 | 100% | 7 |
| Rautahat | 663,222 | 663,222 | 100% | 7 |
| Bara | 657,572 | 657,572 | 100% | 7 |
| Nawalparasi | 608,969 | 609,012 | ~100% | 7 |

## 4.3 + 4.4 The OCHA comparison — **stopped deliberately**

The brief asked for a comparison against `PGA_AffectedDistricts_POP.csv`. It is
**not made**, and the reason is the finding.

Two readings of OCHA's `population` column were tested against the data and
**both fail**:

1. **District total population?** No. Jhapa reads **1,511** for a district of
   roughly 800,000; Ilam reads 2,144.
2. **Population inside the shaken footprint?** Also no. In **52 of 66**
   districts the figure **exceeds the district's own population** — Morang
   1,251,498 against 943,889; Lalitpur 911,815 against a 2011 census count near
   468,000. A clipped subset cannot be larger than the whole.

HDX documents the dataset only as *"Population data by district and severity
class"*, methodology *"Census"*, with no column definitions.

**So the two sets are reported side by side with no difference column.**
Computing a difference would have been easy and would have meant nothing.

**A lead, recorded but not asserted:** across the flagged districts the OCHA
figure sits at a fairly consistent multiple of ours (median ≈ ×1.3). Nepal's
growth from the 2011 census to 2015 is about ×1.05, so a systematic ×1.3 points
at a different population *base* rather than a different spatial method — HDX
hosts an "HMIS Estimated population data 2014-2015" set that would be a
candidate. Not pursued.

## The defect that mattered most

The first run of this stage produced a median district disagreement of −24%
against OCHA and a national total that reconciled perfectly. Both district
sources were wrong:

**1. Two polygons shared a name.** geoBoundaries labels two different districts
"Saptari" and two "Bara". Keying totals on that name **merged each pair into one
bucket** — Bara came back with 1,492,620 people against a real figure near
690,000, while the national total still balanced because nothing was lost, only
mixed.

**2. The geometry was wrong.** geoBoundaries ADM2 carries about **50 vertices
per district**. At that coarseness the Kathmandu polygon swallows Lalitpur: a
point in **Patan tested as being in Kathmandu**, and Lalitpur's population was
silently added to its neighbour's.

Neither was patched. The frame was replaced:

| | geoBoundaries ADM2 | **COD-AB ADM2** |
| --- | --- | --- |
| Source | Wikimedia-derived | **UN OCHA, authoritative** |
| Vertices | 3,834 (51/district) | **411,412 → 24,681 after simplification (329/district)** |
| p-codes | none | **yes** |
| Duplicate names | 2 pairs | **none** |
| Patan resolves to | Kathmandu ❌ | **Lalitpur ✅** |
| OCHA districts joining | 55 of 66 | **66 of 66** |

The 2015 frame is reconstructed by merging the only two districts the 2017
restructuring split — Nawalparasi East+West and Rukum East+West — giving exactly
75. Six known settlements are re-verified against the **simplified** geometry,
and the ingest throws if any of them lands in the wrong district.

## A second defect: 1.32 million people in no district

Strict containment left **4,472 cells holding 1,321,592 people (4.9% of Nepal)**
inside no district polygon, concentrated in the dense Terai border strip (8.6%
of the 26–27 N band). Every one lies within 20 km of a district boundary, 92%
within 5 km.

WorldPop's raster is clipped to Nepal, so a populated cell in it **is** in
Nepal — what was in doubt was *which district*. They are attributed to the
nearest district boundary within a measured 20 km tolerance, which places all of
them. Both figures are reported:

| | Exposed at MMI 6+ | Unplaced |
| --- | ---: | ---: |
| Strict containment | 13,199,031 | 4.89% of Nepal |
| Nearest-district fill | **13,835,518** | **0** |

Each district records how many of its people arrived that way.

## 4.8 Validation

| Check | Result |
| --- | --- |
| Cells decoded = artefact count | ✅ 177,679 |
| Decoded population = stored total | ✅ within 2 people |
| District totals + remainder = national total | ✅ exact sums, rounding residual reported |
| Cumulative exposure monotonic in threshold | ✅ |
| District exposure ≤ grid exposure (no double count) | ✅ |
| No two districts share a key | ✅ throws if they do |
| Six settlements in the right district | ✅ after simplification |

## Limitations

1. **Exposure is not harm.** Geographic overlap of modelled shaking and modelled population.
2. **WorldPop is modelled, not counted.** In dense urban districts it differs materially from census: our Kathmandu figure runs well above the projected census count, while Lalitpur and Morang land within a few per cent.
3. **ShakeMap is modelled** from sparse instrumentation — Nepal had few strong-motion stations in 2015 — and this is the current revision, not what responders saw on 25 April.
4. **Cells are assigned whole** to the contour containing their centre.
5. **MMI < 4.5 cannot be computed** by containment; those contours are open.
6. **The nearest-district fill** makes border cells the least certain attribution in the dataset.
7. **Boundaries simplified to 100 m**, so a cell within ~100 m of a border may fall on the wrong side.

---

## Gates

- `npm test` — **4,916 passing**, 0 failing (30 new: 13 seismic, 10 exposure, 7 simplify)
- `npm run build` — clean
- `npm run check:boundaries` and `check-import-directions` — clean
- `node pipelines/run-all.mjs --force` then `run-analysis.mjs` — reproduces every figure here
