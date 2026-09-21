# Stage 5 — Observed physical damage

Stage 3 measured the earthquake. Stage 4 measured who lived under the shaking.
Stage 5 measures what was seen to break, and — more than either of the earlier
stages — what the observations **cannot** support.

Everything here is reproduced by:

```bash
node pipelines/run-all.mjs --force      # ingestion, including the 2015 OSM network
node pipelines/run-analysis.mjs         # Stage 3, 4 and 5 analysis
```

---

## The three refusals this stage is built around

**1. UNOSAT has no denominator.** The 4,583 UNOSAT records are damage sites.
There is no "examined and intact" record and no published footprint of the area
examined. UNOSAT can therefore answer *how many damaged structures were seen,
and where*; it cannot answer *what fraction of buildings were damaged*. Every
UNOSAT-derived rate in Stage 5 is per unit **area** or per unit of another
dataset, never a proportion of structures.

**2. Copernicus is a different product, not more of the same.** Copernicus
EMSR125 grades every structure it examines inside a published area of interest,
including "Not Affected" — so it **does** carry a denominator, and it is the
only source in this project that supports a damage rate. Its vocabulary is its
own, and for this activation it published only EMS-98 grade 1 and grade 5, with
**nothing between them**. A four-step scale and a two-step scale with a hole in
the middle cannot be crosswalked, and no crosswalk is attempted.

**3. Observed damage is not a sample of Nepal.** Both products were tasked where
damage was expected. Counting more damage inside MMI VIII than inside MMI VI is
partly a fact about the earthquake and partly a fact about where satellites were
pointed.

---

## 5.1 UNOSAT damage analysis

The published inventory is reproduced from the artefact geometry before anything
is derived from it, class by class:

| Damage class | Published | Observed | Share |
| --- | ---: | ---: | ---: |
| Destroyed | 2,084 | 2,084 | 45.5 % |
| Severe Damage | 1,347 | 1,347 | 29.4 % |
| Moderate Damage | 1,057 | 1,057 | 23.1 % |
| Possible Damage | 95 | 95 | 2.1 % |
| **Total** | **4,583** | **4,583** | |

Attribution to the 2015 district frame: **4,582 of 4,583** points fall inside a
district polygon, one is placed by nearest boundary at 0.01 km, none is unplaced.
Nine districts of seventy-five carry any observation at all: Gorkha 1,847,
Dhading 926, Bhaktapur 458, Kavrepalanchok 420, Lamjung 420, Kathmandu 300,
Tanahu 93, Lalitpur 73, Chitawan 46.

**Coverage is not national and the interface must say so.** A district with no
observed damage is a district no satellite product examined at this resolution.

## 5.2 Damage severity index

The UNOSAT classes are **ordinal**. The source establishes an order and nothing
else, so any interval between classes is imposed by the analyst. Rather than pick
one weighting and hide it, four are computed and the question becomes whether the
**answer** depends on the choice:

| Scheme | Weights (Possible / Moderate / Severe / Destroyed) | Why |
| --- | --- | --- |
| `ordinal-linear` | 1 / 2 / 3 / 4 | The minimum assumption that still yields a number |
| `destroyed-only` | 0 / 0 / 0 / 1 | No interval assumption at all — the control |
| `collapse-weighted` | 0 / 1 / 3 / 5 | 89 of the 95 "Possible" records are flagged Uncertain |
| `geometric` | 1 / 2 / 4 / 8 | The steepest defensible shape |

Verdict, by unit: **districts ROBUST** (worst pairwise Spearman 0.933),
**analysis areas ROBUST** (0.978), **1 km cells BROADLY_STABLE** (0.869).

What may be reported is the **ordering** of places, which survives every
weighting including the weightless one. The score itself remains an index
supplied by this analysis, not a measurement published by UNOSAT.

## 5.3 Spatial damage concentration

Binned at 1 km — the WorldPop cell size, so damage and population share a unit —
with 2 km and 5 km reported beside it to show the result is not an artefact of
that choice.

| Cell size | Occupied cells | Observed footprint | Gini | Cells holding half the damage |
| --- | ---: | ---: | ---: | ---: |
| 1 km | 362 | 362 km² | 0.650 | 37 |
| 2 km | 145 | 580 km² | 0.644 | 17 |
| 5 km | 51 | 1,275 km² | 0.616 | 7 |

The busiest 1 km cells, with the people the population surface places in them:

| District | Damage points | Modelled population | Per 1,000 people | MMI |
| --- | ---: | ---: | ---: | --- |
| Kathmandu (Sankhu) | 295 | 2,075 | 142 | VII |
| Bhaktapur | 261 | 10,635 | 24.5 | VII |
| Gorkha | 188 | 53 | *(suppressed)* | VIII |
| Gorkha | 110 | 54 | *(suppressed)* | VIII |
| Bhaktapur | 95 | 11,579 | 8.2 | VII |

**Three of the fifteen busiest cells have their ratio suppressed**, and the
reason is worth stating rather than hiding. Those Gorkha cells hold 53–71
modelled people while carrying 380 damage points between them, which would give
ratios above 3,500 damaged structures per thousand people. That is not a fact
about Gorkha. WorldPop spreads a district total smoothly across terrain —
Gorkha averages 49 modelled people per cell over 4,786 cells — while buildings
cluster in villages, and at ~1 km the two do not line up. The **counts** in
those cells are observations and stand; the **ratio** is withheld below a
stated floor of 100 modelled people.

The denominator is the area in which damage **was observed**, not the area that
was examined. A cell with no damage point may never have been looked at.

## 5.4 Damage against modelled shaking — and what it does not show

Every one of the 4,583 damage points falls inside MMI VII or above; no UNOSAT
area was tasked at lower intensity.

| MMI band | Observations | Destroyed share |
| --- | ---: | ---: |
| VII | 1,479 | 38.7 % |
| VII–VIII (7.5) | 895 | 31.1 % |
| VIII | 2,209 | 55.8 % |

"Destroyed share" here means the share of **observations in that band classed
Destroyed** — not the share of buildings destroyed, which UNOSAT cannot give.

Class and band are not independent (χ² = 255.5, df = 6, p ≈ 3 × 10⁻⁵², Cramér's
V = 0.167, Cochran's rule holds). Read the effect size, not the p-value: with
4,583 observations a trivial departure from independence is "significant", and
V = 0.167 on a 3 × 4 table is a small association. And **the destroyed share is
not monotonic in intensity**, with the reason visible in the data: each band
contains different places. MMI VII is Bhaktapur and Sankhu; MMI VII–VIII is the
Chepe valley and Manbu; MMI VIII is the Daraudi valley and Manbu.

Two UNOSAT analysis areas straddle a contour, which permits the only comparison
that holds place, imagery and analyst constant:

| Area | Lower band | Higher band | Direction |
| --- | --- | --- | --- |
| Sundar Bazar | MMI VII: 35/172 = 20.3 % | MMI VII–VIII: 11/78 = 14.1 % | does not increase |
| Manbu Area | MMI VII–VIII: 150/271 = 55.4 % | MMI VIII: 636/1,253 = 50.8 % | does not increase |

**In neither area does the destroyed share rise with modelled intensity.** The
between-band pattern in the pooled table is being produced by which places fall
in each band, not by the shaking. Correlation is not causation, and here it is
not even a clean correlation.

## 5.5 Copernicus EMSR125 — the only source with a denominator

41,042 graded structures across seven areas of interest (eight area polygons are
published; LEKHNATH has delineation only, and GORKHA's 121 records carry no
usable grading at all).

| Area of interest | Records | Graded | Damaged | Destroyed | Destroyed / graded |
| --- | ---: | ---: | ---: | ---: | ---: |
| BHARATPUR | 18,076 | 18,076 | 50 | 6 | 0.033 % |
| POKHARA | 16,192 | 14,542 | 42 | 8 | 0.055 % |
| BIDUR | 4,791 | 4,128 | 180 | 120 | 2.9 % |
| KATHMANDU | 958 | 939 | 723 | 183 | 19.5 % |
| CHILIME | 859 | 859 | 200 | 129 | 15.0 % |
| HETAUDA | 45 | 45 | 45 | 2 | 4.4 % |
| GORKHA | 121 | 0 | — | — | no usable grading |

Because the denominator exists, a genuine dose-response can be computed:

| MMI band | Graded | Destroyed | Destroyed / graded | Areas |
| --- | ---: | ---: | ---: | --- |
| VI–VII (6.5) | 14,542 | 8 | 0.055 % | POKHARA |
| VII | 19,060 | 191 | 1.0 % | HETAUDA, KATHMANDU, BHARATPUR |
| VII–VIII (7.5) | 4,987 | 249 | 5.0 % | CHILIME, BIDUR, GORKHA |

Spearman ρ = 1, χ² = 797, p ≈ 7 × 10⁻¹⁷⁴, Cramér's V = 0.144.

**And the confound that governs it: no area of interest spans two intensity
bands.** Intensity band and town are the same variable in this table. The
gradient says "destruction rates were higher in the towns nearer the rupture",
which is consistent with a shaking effect and does not isolate one from building
stock, terrain, or the analyst who graded each area.

## 5.6 NGA infrastructure damage

The features are measured before they are described:

| | Count | Total | Median size |
| --- | ---: | ---: | ---: |
| Blocked roads | 179 | **19.93 km** of line geometry | **65 m** per feature |
| Bridges out | 5 | — | — |
| Landslides | 51 | 325.9 ha | 9,144 m² (54 m equivalent radius) |

**179 blocked roads is 20 km of geometry.** These are obstruction markers where
an analyst saw a blockage, not the extents of closed routes. Any statement about
how much road was unusable must come from the network the marker sits on.

### The infrastructure product covers a different Nepal from the building products

| | Blocked roads | Landslides | UNOSAT damage points |
| --- | ---: | ---: | ---: |
| Sindhupalchok | **65** (5.8 km) | **23** (173.7 ha) | **0** |
| Dolakha | 33 (3.3 km) | 4 (6.1 ha) | 0 |
| Rasuwa | 22 (5.3 km) | 5 (103.0 ha) | 0 |
| Gorkha | 20 (2.4 km) | 9 (34.5 ha) | **1,847** |
| Okhaldhunga | 11 (1.1 km) | 0 | 0 |
| Dhading | 5 (0.3 km) | 5 (2.2 ha) | 926 |
| Bhaktapur | 0 | 0 | 458 |

**Sindhupalchok — the district with the most observed road blockage and the
largest mapped landslide area — carries not one UNOSAT damage point.** The two
product families were tasked over different places. Any map that draws them
together must say so, and no district ranking may be built by adding them.

Blocked roads also span a wider intensity range than the building damage does:
MMI VI 8, VI–VII 3, VII 13, **VII–VIII 114**, VIII 41 — where every one of the
4,583 UNOSAT points sits at MMI VII or above.

Bridges out: 5 features, in Okhaldhunga (MMI VI–VII), Sindhupalchok ×2 and
Kavrepalanchok ×2 (all MMI VII–VIII), sensed between 26 April and 6 May. Three
of the five are more than 20 km from any mapped landslide.

**Do the bridge losses disconnect the network?** Tested on their own rather than
inside the combined scenario, because 179 road markers would otherwise mask
them. **One** of the five attaches to the 2015 strategic network at all; the
other four are on roads it does not contain. Disabling that single edge splits
the network from 40 components into **41** and detaches 14 nodes from the
largest component (1,927 → 1,913). No Kathmandu-to-district pair is severed by
it. So: yes, one mapped bridge loss isolates a small sub-network, and the other
four are invisible to this network — which is a statement about the network, not
about the bridges.

Landslides and people: 49 of the 51 mapped slides have some modelled population
within 1 km, and the median distance to the nearest populated cell is 0.48 km.
These are slides in inhabited valleys, not remote terrain — though "modelled
population within 1 km" is the whole claim, and no exposure to the slide itself
is asserted.

## 5.7 Roads and landslides — spatially associated, not caused

The tolerance is derived from the geometry, not chosen: the road lines have a
median vertex spacing of 13.7 m (below which a separation is digitising noise),
and the landslides have a median equivalent radius of 54 m (above which a
"nearby" slide is one whose mapped extent does not reach the road). Headline:
**50 m**, with the full curve reported:

| Tolerance | 0 m | 25 m | 50 m | 100 m | 250 m | 500 m | 1000 m |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Blocked roads associated | 7.8 % | 8.9 % | **9.5 %** | 11.2 % | 12.3 % | 14.5 % | 14.5 % |

**Only 17 of 179 observed blockages lie within 50 m of an observed landslide.**
The popular account that landslides blocked the roads is not supported by these
two products — but the honest reading is about the *products*, not the event:
NGA mapped 51 landslides, while academic inventories of the same earthquake map
tens of thousands. The low association measures the incompleteness of the
landslide layer at least as much as it measures the cause of the blockages.

Distance from a blocked road to the nearest mapped landslide: median **7.7 km**
(p25 2.0 km, max 58.6 km). Most observed blockages are nowhere near a mapped
slide.

The reverse direction answers a different question and gives a different answer:
**19.6 %** of the 51 landslides lie within 50 m of a blocked road, rising to
41.2 % within 1 km, with a median nearest-road distance of 1.8 km. Slides are
closer to blockages than blockages are to slides — which is what you expect when
one layer has 51 features and the other 179.

The relationship is **spatial association**. Neither product links a blockage to
a slide, and several pairs were observed on different dates.

## 5.8 Network impact

The baseline network is OpenStreetMap **as it stood at 2015-04-24T00:00:00Z**,
retrieved with an Overpass attic query. This matters: OpenStreetMap's Nepal
coverage was transformed by the post-earthquake HOT activation, so today's map
contains roads mapped *because of* the event. 2,129 ways → 2,268 junction nodes,
5,454 directed edges, 40 components (largest 1,927 nodes).

**The mapping gap is measured, not hedged.** The same query against today's
database over the same tiles returns **7,143 ways — 3.36× more**. A route the
2015 network cannot find is not necessarily a route that did not exist.

Blockages are attached to edges at a tolerance taken from the knee of the match
curve (25 m, capped at 100 m). Result: **21 of 184 blockages attach to the
routable network.**

That number is diagnosed rather than left hanging. Each blockage was matched a
second time against **every** highway class within 600 m of it, as OpenStreetMap
held them the day before the earthquake:

| Where the marker sits | Count of 184 |
| --- | ---: |
| On a mapped road, strategic class (the routable network) | 21 |
| On a mapped road **below tertiary** — residential, track, unclassified, path | 45 |
| Near a mapped road but beyond the 25 m snap tolerance | 48 |
| **No mapped road of any class within ~600 m** | 70 |

Distance from a marker to the nearest mapped road of any class: median 12 m,
p75 200 m, max 1,163 m. The 393 context ways are 169 residential, 45 path, 39
track, 29 unclassified, 29 footway, 25 service — against 45 strategic-class ways.

Two things follow and they point in different directions. The low match rate
against the routable network is partly a **class restriction this analysis
imposed**: the disruption was on exactly the minor mountain roads a
strategic-network analysis cannot see. But 70 markers — the largest single
group — sit where OpenStreetMap had drawn no road at all, which is a **mapping
gap**. Neither reading is evidence about where roads actually were; both
describe the map of April 2015, not the road system.

On the strategic network, of 14 Kathmandu-to-district-centroid pairs: 8
unchanged, 1 detour (+9.16 km), 0 severed, and **5 that could not be routed on
the 2015 map at all** — a coverage gap, reported separately so it is never
mistaken for damage.

**Alternative routes** come from the project's existing Yen k-shortest-paths, at
k = 4. Nine of the 14 pairs returned four alternatives; the other five are the
unroutable ones. **No pair lost an alternative — and that is not a finding.**
Every routable pair returned the maximum both before and after, so the counter
measured its own cap. It supports only "at least four deviating paths existed
either way", not "redundancy was unaffected", and the artefact says so in a
`saturated` flag rather than reporting the zero bare.

**No travel time is reported anywhere.** No road speed or condition dataset for
April 2015 exists in any source this project holds.

## 5.9 The critical caveat, carried throughout

- A blocked-road feature is a ~65 m obstruction marker, not a closed route.
- A marker disables the whole network edge it sits on. That is correct for
  **connectivity** (an edge has no junction in its interior) and would be badly
  wrong as a statement of how much road was unusable. No such figure is produced.
- **Absence of a reported blockage is not evidence a road was open.** The NGA
  products publish no footprint of which roads were checked.
- The baseline network is the network **as mapped**, not as it existed.

## 5.10 Population and observed damage

| Within | People | Wording |
| --- | ---: | --- |
| 500 m | 169,000 | "lived in ~1 km modelled population cells whose centre lies within 500 m of an observed damage point" |
| 1 km | 251,000 | |
| 2 km | 361,000 | |
| 5 km | 785,000 | |
| 10 km | 2.64 million | |

There is deliberately **no 0 m band**: a cell centre exactly coincident with a
damage point is a measure-zero event, and a row always reading zero would be
misread as "nobody was there".

Forbidden, and refused by the artefact: *"X people lost their homes"*, *"X people
were made homeless"*, *"X people were affected"*.

## 5.11 Damage concentration against population concentration

Universe: **16,501 populated ~819 m cells in the nine districts where damage was
observed** — not the country, because most of it was never examined, and not
only the cells near damage, because that would make "low damage" vacuous.
Damage is binned onto the WorldPop grid's **own** cells; an earlier version used
a 1 km UTM grid laid over it and double-counted 4,583 points into 6,139.

Thresholds are defined independently of Stage 4: population at the median of the
analysed cells, damage at **presence** — because the median damage count across
these cells is zero, so a median split would call every cell with a single
observation "high".

| Quadrant | Cells | People | Damage points |
| --- | ---: | ---: | ---: |
| High population / damage observed | 350 | 162,214 | 3,666 |
| High population / none observed | 7,907 | 4,939,366 | 0 |
| Low population / damage observed | 63 | 3,355 | 906 |
| Low population / none observed | 8,181 | 213,995 | 0 |

Gini over identical cells: **population 0.836, observed damage 0.991.** Observed
damage is far more concentrated than the population it sits among. Spearman
between the two is only 0.122.

### "Kathmandu was worst" is what the map looks like, not what the metric says

Normalising observed damage by the modelled population of the same cells
reverses the ranking the raw counts suggest:

| District | Damage points | Population | **Points per 1,000 people** | Cells examined |
| --- | ---: | ---: | ---: | ---: |
| Gorkha | 1,781 | 234,076 | **7.61** | 151 of 4,786 (3.2 %) |
| Dhading | 984 | 295,045 | 3.34 | 94 of 2,514 (3.7 %) |
| Lamjung | 423 | 143,496 | 2.95 | 55 of 2,191 (2.5 %) |
| Kavrepalanchok | 421 | 222,171 | 1.89 | 63 of 1,835 (3.4 %) |
| Bhaktapur | 458 | 330,195 | 1.39 | 11 of 164 (6.7 %) |
| Tanahu | 94 | 286,655 | 0.33 | 25 of 2,079 (1.2 %) |
| Lalitpur | 72 | 475,235 | 0.15 | 7 of 520 (1.3 %) |
| **Kathmandu** | 300 | 2,779,012 | **0.11** | **2 of 547 (0.4 %)** |
| Chitawan | 39 | 553,044 | 0.07 | 5 of 1,865 (0.3 %) |

**Kathmandu ranks eighth of nine on observed damage per head** — and the last
column says why that must not be read as "Kathmandu was fine": UNOSAT examined
0.4 % of its cells.

This is the clearest case in the whole project for keeping the products apart.
Copernicus **did** grade Kathmandu, and found **19.5 % of graded structures
completely destroyed — the highest rate of any area of interest.** UNOSAT makes
Kathmandu look barely touched; Copernicus makes it the worst-hit place graded.
Both are true statements about different products, and averaging them would
produce a number that is true of neither.

Concentration in unit terms: half the observed damage sits in **40 cells**
(0.24 % of the analysed cells); half the population in **153 cells** (0.93 %).

(§5.3 reports 37 cells for the same half of the damage. The two are not in
conflict: §5.3 bins onto a 1 km UTM grid over the 362 cells that contain damage,
§5.11 bins onto the WorldPop grid's own ~819 m cells over all 16,501 analysed
cells. Different unit, different universe, same story.)

**"None observed" is ambiguous** between "the buildings held" and "nobody looked
here", and the dataset cannot separate them. Every quadrant containing it
inherits that ambiguity.

## 5.12 Four clocks, never merged

| Clock | What it records |
| --- | --- |
| **Earthquake** | 2015-04-25 06:11:26 UTC (M7.8); M7.3 aftershock 2015-05-12 07:05 UTC. The only clock that records the damage itself. |
| **Imagery acquired** | When a satellite photographed the ground. Damage visible in it occurred at some point between the earthquake and this date. |
| **Feature mapped** | When an analyst digitised it. A measure of response speed. |
| **Layer published** | When the product reached users. |

UNOSAT imagery: 2015-04-26 (56), 04-27 (778), 04-29 (2,528), 05-03 (1,221).
UNOSAT publishes **no** production or publication date in this shapefile, so its
mapping lag cannot be measured and is left null rather than inferred. The NGA
layers carry `sensedOn` and `producedOn` separately, plus a publication date in
the layer name (6–7 May 2015), and ship the same column in mixed `M/D/YYYY` and
ISO formats — parsed explicitly, with anything ambiguous refused.

Measured lags: earthquake → imagery **median 4 days** (range 1–12, over 4,818
observations); imagery → mapping **median 0 days** (max 3, NGA only); mapping →
publication **median 3 days**; earthquake → publication **median 12 days** (NGA
only — UNOSAT publishes no publication date).

**These dates must not be animated as the progress of the disaster.** Cloud
cover, satellite revisit intervals and tasking priorities drive the sequence at
least as much as the earthquake does.

## 5.13 Cross-source comparison

Full table in `data/analysis/nepal-2015-damage-analysis.json` under
`results.crossSource.table`, covering USGS, ShakeMap, WorldPop, UNOSAT,
Copernicus, NGA and OCHA with what each observes, its coverage, dates,
classification, limitation and result class.

The products are **not merged**, for four stated reasons: the units differ, the
vocabularies differ in shape rather than wording, coverage overlaps without
nesting (so a single collapsed building can appear in both and be double
counted), and only Copernicus carries a denominator.

## Data gaps recorded rather than filled

| Gap | Consequence |
| --- | --- |
| Road speeds and surface condition, April 2015 | No travel time, no isochrones, no response-time analysis |
| A digital elevation model | Landslide susceptibility cannot be related to slope |
| Which roads were checked and found open | Blockage counts have no denominator |
| Reopening dates for blocked roads | Disruption has no duration; every network result is a snapshot |
| A settlement gazetteer with populations | Landslide proximity measured to population cells, not settlements |
| Casualties, displacement, economic damage, destroyed-house counts | Not derivable from anything here; never estimated |

## Artefacts

The eight required outputs, and where each one lives:

| | Output | File | Path inside it |
| --- | --- | --- | --- |
| **A** | Damage summary by severity | `nepal-2015-damage-analysis.json` | `results.unosat` |
| **B** | Damage spatial distribution | `nepal-2015-damage-analysis.json` | `results.spatialDistribution` |
| **C** | Damage × intensity | `nepal-2015-damage-analysis.json` | `results.damageByIntensity`, `results.copernicus.doseResponse` |
| **D** | Landslide × road blockage | `nepal-2015-infrastructure-analysis.json` | `results.landslideRoadAssociation` |
| **E** | Network disruption | `nepal-2015-infrastructure-analysis.json` | `results.network` |
| **F** | Population × observed damage | `nepal-2015-damage-population.json` | `results.populationNearObservedDamage` |
| **G** | Damage vs population concentration | `nepal-2015-damage-population.json` | `results.concentration`, `results.quadrants` |
| **H** | Cross-source comparison | `nepal-2015-damage-analysis.json` | `results.crossSource` |

Each file also carries a `methodology` array whose records state, for every
analysis: research question, input datasets with their role, spatial coverage,
processing, algorithm, outputs, validation, limitations, data class and result
class. `createSpatialAnalysisRecord` refuses a record missing spatial coverage
or validation, so no Stage 5 result can be written without them.


| File | Contents |
| --- | --- |
| `data/analysis/nepal-2015-damage-analysis.json` | 5.1–5.5, 5.12, 5.13 |
| `data/analysis/nepal-2015-infrastructure-analysis.json` | 5.6–5.9 |
| `data/analysis/nepal-2015-damage-population.json` | 5.10–5.11 |
| `data/processed/nepal-2015-osm-roads.json` | 2015-04-24 strategic road network (ODbL) |
| `data/processed/nepal-2015-osm-blockage-context.json` | all-class roads beneath the blockages (ODbL) |

---

## Which of these belongs in the presentation

**Headline — these carry the argument.**

| Analysis | Why it is strong | What must be said with it |
| --- | --- | --- |
| **5.4 + 5.5 together** — the dose-response pair | It is the same question asked of two products and answered differently, because one has a denominator and one does not. Copernicus shows 0.055 % → 1.0 % → 5.0 % destroyed across MMI VI–VII to VII–VIII; UNOSAT, held to within-place comparisons, shows no rise at all. | That no Copernicus area of interest spans two bands, so intensity and town are the same variable there. |
| **The per-capita table** — "Kathmandu was worst" tested | It replaces an impression with a metric and the metric reverses it: Kathmandu is 8th of 9 on observed damage per head, while being the **highest** Copernicus destruction rate at 19.5 %. | That UNOSAT examined 0.4 % of Kathmandu's cells. The contradiction is the point, not a flaw. |
| **5.6 cross-product geography** | Sindhupalchok has 65 blocked roads, 23 landslides and **zero** UNOSAT damage points. One table makes coverage visible as a decision. | That absence of observation is not absence of damage. |
| **5.9 + 5.8 diagnostic** — "179 blocked roads is 20 km of geometry" | Memorable, verifiable, and it teaches the map/territory distinction: 70 of 184 markers sit where OpenStreetMap had drawn no road at all. | That the 2015 network holds 3.36× fewer ways than today's. |
| **5.1 + 5.2** — reproduction and rank stability | The right opening: the published counts are reproduced exactly, and the district ordering survives four weightings including the weightless one. | That the severity score is an index this analysis supplies, not a UNOSAT measurement. |

**Supporting — keep in the methodology section or the appendix.**

| Analysis | Why it is not a headline |
| --- | --- |
| 5.3 grid concentration and Gini | A correct technical measure, but "Gini 0.650" does not land with an audience; the concentration curve inside 5.11 already says it in cells. |
| 5.7 road–landslide association | The 9.5 % figure is genuine, but it is dominated by the incompleteness of a 51-polygon landslide layer, and it needs more caveat than headline. |
| 5.8 routing results proper | 8 unchanged, 1 detour, 5 unroutable on the 2015 map is too thin to carry a slide. The diagnostic is the finding; the routes are not. |
| 5.10 population proximity bands | Useful for scale, but the figure moves from 169,000 to 2.64 million across the bands, so it can only honestly be shown as a curve. |
| 5.12 timeline lags | A good context slide — median 4 days to first imagery, 12 to publication — rather than a finding about the earthquake. |
| 5.13 cross-source table | Methodology appendix. It is the justification for everything above it, not a result. |

**Not presentable as a result at all:** anything requiring casualties, displacement,
destroyed-house counts outside the observed points, economic loss, travel times,
or infrastructure recovery. Those are recorded as data gaps and stay that way.
