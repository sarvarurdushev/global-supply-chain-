# Stage 6 — Experience design

**Nepal earthquake, 25 April 2015. Case NPL-2015-EQ.**

Design only. No frontend code is written in this stage.

Everything below is built on the artefacts validated in Stages 0–5. Every figure
quoted here was read out of `data/analysis/` while writing this document, not
recalled. Where a number cannot be traced to an artefact it is marked as a data
gap and stays one.

---

## 0. What the inspection found (§29)

Read before designing: the five analysis artefacts, the ten processed artefacts,
all twenty-two methodology records (Stage 3: 6, Stage 4: 4, Stage 5: 12), and
the existing frontend.

### Already built and reusable — do not rebuild

| Asset | What it gives Stage 6 |
| --- | --- |
| `src/ui/styles/identity.css` (704 lines) | The whole green command-centre identity. `--gx-neon / green / emerald / amber / red / violet` with **violet already reserved for "modelled or simulated, never observed"** — half the data-confidence language exists. |
| `src/workspace/components.js` | `card`, `metric`, `metricRow`, `dataClassBadge`, `provenanceBlock`, `whyThisMatters`, `unavailableState`, `term`. The right-panel vocabulary. |
| `src/workspace/taxonomy.js` | `DATA_CLASS_PRESENTATION`, `GLOSSARY`, `LEGEND`, `SCENE_NAMES`, `LAYER_NAMES`. Plain-language layer. |
| `src/ui/supplychain/charts.js` | `barChart`, `timeSeriesChart`, `beforeAfterChart` — inline SVG, no chart dependency. |
| `src/workspace/shell.js` | Right dock, navigation drawer, single-scroll analysis panel, playback strip. |
| `src/workspace/globeAdapter.js` | `flyTo({lat, lon, altKm, durationSec})`. |
| `src/disaster/investigation.js` | State machine: case / depth / phase / layers. `CHAPTERS`, `LAYER_GROUPS`. |
| `src/disaster/demo.js` | A 16-beat script plus `createDemoPlayback` — **presentation mode already has an engine**. |
| `src/disaster/catalogue.js` | LEVEL 0 case explorer with per-dimension `AVAILABILITY`. |
| `src/disaster/session.js` | Single load point, so two panels cannot disagree. |
| `src/disaster/hazards.js` | `GEOMETRY_KIND`, `INTENSITY_SCALES`, hazard registry. |
| `src/supplychain/{graph,routing,centrality}.js` | `createGraph`, `withScenario`, `shortestPath`, `kShortestPaths`, `betweennessCentrality`. |
| `src/disaster/response.js` | `buildRoadGraph` with junction splitting. |
| `src/scenes/director.js`, `cameraMotion.js` | Cinematic shot sequencing with timed camera flights. |
| Layer pattern | `createXLayer({ source, overlayHost })` with `enable/disable/refresh`. 28 layers follow it. |

### The one structural gap

**Nothing in `src/` reads a single Stage 0–5 artefact.** `src/nepal/` has zero
consumers in the application; `data/analysis/` and `data/processed/` are not
served to the browser at all. Stage 6's central engineering task is not new
analysis — it is *wiring twenty-two validated analyses into a frontend that has
never seen them*.

### The one vocabulary conflict

The frontend's `DATA_CLASS_PRESENTATION` has five classes — LIVE, HISTORICAL,
INFERRED, SIMULATED, UNKNOWN. The Stage 3–5 artefacts carry seven — OBSERVED,
OFFICIAL, DESCRIPTIVE_STATISTIC, DERIVED, MODEL_FIT, ESTIMATE, SCENARIO — plus
DATA_GAP for what cannot be computed.

**Decision: the Stage 3–5 `ResultClass` becomes canonical.** It is the
vocabulary the artefacts actually carry, the one twenty-two methodology records are
written against, and the one the university work rests on. The five legacy keys
stay as aliases so no existing view breaks. Resolved in §14.

---

## 1. Product concept

**Natural Disaster Intelligence** is a case-based investigation environment. A
person who knows nothing about Nepal opens Case 001 and descends from the globe
to a single damaged building, and at every step the system tells them three
things at once:

1. **What is on the map.**
2. **Where that came from** — which satellite, which agency, which day.
3. **How firmly it is known** — observed, official, derived, fitted, scenario,
   or not known at all.

The third is the product. A dashboard shows numbers. This shows numbers *with
their epistemic status attached*, and it is as willing to render a hole in the
evidence as a finding. The strongest single moment in the whole experience —
Scene 11 — is a map of something nobody observed.

**The sentence the product has to earn:** *the map looks correlated; the data is
more complicated.*

### What it is not

- Not a dashboard with charts. There is no screen that is a grid of tiles.
- Not a hacker aesthetic. Green carries meaning (interface / live / data), never
  decoration. Body copy is Inter at 13px and near-white. Text never glows.
- Not a simulation dressed as history. Anything constructed is labelled
  SCENARIO in the chrome, in the map legend, and in the panel, simultaneously.

---

## 2. User journey

```
        ┌─────────────────────────────────────────────┐
        │  CASE SELECT     Natural Disaster → Nepal   │
        │                  → 2015 Earthquake          │
        └───────────────────────┬─────────────────────┘
                                │
   GLOBAL ─→ NEPAL ─→ EARTHQUAKE ─→ REGION ─→ SHAKING ─→ POPULATION
                                                            │
        ┌───────────────────────────────────────────────────┘
        │
   DAMAGE ─→ MODEL vs OBSERVED ─→ SECOND SOURCE ─→ INFRASTRUCTURE
                                                            │
        ┌───────────────────────────────────────────────────┘
        │
   COVERAGE GAP ─→ NETWORK ─→ ROUTE ─→ PEOPLE + DAMAGE
                                                            │
        ┌───────────────────────────────────────────────────┘
        │
   INTELLIGENCE QUALITY ─→ WHAT WE DO NOT KNOW ─→ SCENARIOS
```

Three acts, matching the existing `CHAPTERS` in `investigation.js`:

| Act | Scenes | Question | Existing chapter |
| --- | --- | --- | --- |
| **I — What happened** | 00–04 | What was the event, where, how big? | `what-happened` |
| **II — What it met** | 05–14 | Who was under it, what broke, what did we actually see? | `why-it-mattered` |
| **III — What we know** | 15–17 | How firm is any of this, and what follows? | `what-now` |

The user can leave the rail at any point and explore freely; the rail remembers
where they were.

---

## 3. Complete scene sequence

Nineteen scenes (00–18). Scene 00 is the case card, 01–17 are the
investigation, and 18 is designed here but built last.

Numbering differs from the brief's because a case card is added at 00 and the
infrastructure/coverage pair is split. The mapping to the brief's own scene
numbers is in §4 so coverage can be checked row by row.

### SCENE 00 — CASE CARD

```
NATURAL DISASTER INTELLIGENCE
CASE 001

NEPAL
EARTHQUAKE

25 APR 2015 · 06:11:26 UTC
M 7.8 · DEPTH 8.2 KM
```

- **Purpose** Introduce a case to someone who knows nothing about it.
- **Question** What am I about to investigate?
- **Data** `nepal-2015-seismic-analysis.json → results.mainShock`.
- **Visual** Full-bleed dark. Type only, no map yet. A single slow scanline
  pass. The globe fades up behind the type as the card dismisses.
- **Interaction** `BEGIN INVESTIGATION` → Scene 01. Nothing else is clickable.
- **Result class** OBSERVED.
- **Limitation** Depth and magnitude are the USGS catalogue's current revision,
  not what was reported on the day.

### SCENE 01 — LOCATE

- **Purpose** Establish where on Earth this is.
- **Question** Where did this happen?
- **Data** District boundaries (dissolved to a national outline); epicentre.
- **Analysis** None — this is orientation.
- **Visual** Camera starts at 20,000 km over South Asia. Nepal's outline draws
  on as a **stroked path animating from west to east** in `--gx-green`, then
  fills at 6% alpha. Neighbours (India, China) get a 1px `--gx-line` edge and no
  fill. One epicentre marker pulses.
- **Interaction** Hover Nepal → name and area. Nothing else on.
- **Transition** 4.5 s ease-in-out flight to 1,200 km, centred 84.7°E 28.2°N.
- **Result class** OBSERVED (boundaries are OFFICIAL COD-AB).
- **Limitation** Boundaries are the reconstructed 2015 75-district frame.

### SCENE 02 — THE EARTHQUAKE

- **Purpose** Turn a point into a sequence.
- **Question** Was this one earthquake, or many?
- **Data** `nepal-2015-seismic.json` — 316 events.
- **Analysis** Stage 3 `counts`, `magnitude`, `depth`, `largestEvents`.
- **Visual** Main shock first, alone, as a filled `--gx-neon` disc with an
  expanding ring. Beat. Then **316 aftershocks fade in over 2.5 s**, sized by
  magnitude (radius ∝ 10^(0.4M), clamped 3–28 px) and coloured by depth on the
  existing `depthColor` ramp.
- **Interaction** Click any event → right panel shows its magnitude, depth, time
  and offset from the main shock.
- **Transition** Hold; the timeline strip slides up from the bottom edge.
- **Result class** OBSERVED.
- **Limitation** The catalogue is complete only above the reporting threshold —
  Stage 3 measured a 20.5× count cliff at M4.0. Smaller aftershocks happened and
  are absent. This is stated in the panel, not buried.

### SCENE 03 — THE SEQUENCE EVOLVES

- **Purpose** Make time a control, not a caption.
- **Question** How did the sequence unfold?
- **Data** The same 316 events, plus Stage 3 `omori` and `temporal`.
- **Analysis** Stage 3 Omori decay — **segmented**, because the M7.3 on 12 May
  restarted the sequence (p = 1.065, R² = 0.72 before 12 May; the single-window
  fit gives p = 0.418, R² = 0.44 and is wrong).
- **Visual** A horizontal timeline from 25 Apr to 31 May. Scrubbing sets a
  cutoff: events at or before it are drawn, later ones are not. Two anchors are
  permanently marked — **25 APR M7.8** and **12 MAY M7.3**. Below the map, a
  decay curve with the fitted Omori line in `--gx-violet` (a model) over the
  observed counts in `--gx-green`.
- **Interaction** Scrub, play/pause, step to next M≥6. The map is driven by the
  timeline, not decorated by it.
- **Transition** Timeline returns to full extent; camera holds.
- **Result class** Events OBSERVED; the decay curve **MODEL_FIT**, drawn in
  violet, and the panel says a fitted parameter is not a measurement of the
  earth.
- **Limitation** The fit depends on the window chosen; both windows are shown.

### SCENE 04 — SHAKING

- **Purpose** Move from points to a field.
- **Question** How hard did the ground shake, and where?
- **Data** `nepal-2015-shakemap-contours.json` — 11 contours, 1,842 vertices.
- **Analysis** Stage 4 `contoursToRings` → **new** `intensityBands` (§11).
- **Visual** Epicentre markers recede to 30% opacity. Filled MMI bands bloom
  outward from the rupture over 2 s in an intensity ramp that is deliberately
  **not green** — green means "interface", and a hazard field that matches the
  chrome is not a hazard field. Ramp runs pale-cyan → amber → red for MMI
  IV–VIII. Only the eight closed levels are drawn.
- **Interaction** A threshold slider. Moving it dims every band below the
  threshold and prints the exposed population from Stage 4.
- **Result class** **MODELED** — the ShakeMap is a model constrained by very few
  instruments. The band legend carries a `MODELED` chip throughout.
- **Limitation** MMI 3, 3.5 and 4 are excluded entirely: their contours run off
  the model grid and cannot be closed. Shown as a greyed row in the legend, not
  omitted silently.

### SCENE 05 — WHO WAS UNDER IT

- **Purpose** Put people under the field.
- **Question** How many people were inside each level of modelled shaking?
- **Data** `nepal-2015-population-1km.json` (177,679 cells).
- **Analysis** Stage 4 `populationByIntensity`, `thresholdSensitivity`.
- **Visual** Population density rises as a **3D extruded grid**, height ∝
  log(people), over the intensity bands. Then the threshold slider becomes the
  hero control:

  | Threshold | Exposed |
  | --- | --- |
  | MMI VI+ | **13.84 million** |
  | MMI VII+ | **7.45 million** |
  | MMI VIII+ | **235,000** |

- **Interaction** Dragging the threshold redraws bands, re-extrudes population
  and re-prints the figure. One control, three coupled views.
- **Result class** DERIVED (modelled population × modelled hazard).
- **Limitation** **Exposure is not harm.** The sanctioned sentence is
  `describeExposure()`'s; the words *affected*, *impacted*, *victims*, *hit by*
  and *suffered* are refused by `findForbiddenPhrasing`, which already ships.

### SCENE 06 — WHERE THEY OVERLAP

- **Purpose** Stop showing two maps and start showing one relationship.
- **Question** Where did many people and strong shaking coincide?
- **Data** Stage 4 `populationIntensityQuadrants`, `districtQuadrants`.
- **Visual** A **bivariate choropleth** over the 75 districts — population on
  one axis, intensity on the other, a 3×3 colour matrix with the legend drawn as
  the matrix itself. The four quadrant cells are selectable.
- **Interaction** Click a quadrant → map filters to those districts; click a
  district → Scene 07 opens on it.
- **Result class** DERIVED.
- **Limitation** District aggregation hides within-district variation; the
  quadrant thresholds are stated in the legend and are adjustable.

### SCENE 07 — DESCEND

- **Purpose** The moment the experience becomes investigative.
- **Question** What happened *here*?
- **Data** Selected district. Default **Gorkha** (1,847 observations, the most
  of any district).
- **Visual** Cinematic descent — 1,200 km → 120 km → 25 km, pitch from −90° to
  −55°, terrain on. Neighbouring districts drop to 15% opacity. The right panel
  rebuilds as a district dossier.
- **Interaction** A district picker limited to the nine that carry observations,
  with the other 66 listed as *no observation coverage* — which is the point of
  Scene 11 and is foreshadowed here.
- **Result class** Mixed; each panel row carries its own badge.
- **Limitation** Only nine of 75 districts can be descended into with damage
  data. The picker says so.

### SCENE 08 — OBSERVED DAMAGE

- **Purpose** Introduce observation as a different kind of thing from model.
- **Question** What did satellites actually see?
- **Data** `nepal-2015-unosat-damage-sites.json` — 4,583 points.
- **Analysis** Stage 5.1 reproduction; 5.2 severity ranking; 5.3 concentration.
- **Visual** **Numbers before dots.** The panel counts up first:

  ```
  OBSERVED DAMAGE        4,583 observations
  DESTROYED   2,084   45.5%
  SEVERE      1,347   29.4%
  MODERATE    1,057   23.1%
  POSSIBLE       95    2.1%
  ```

  Then points reveal **progressively by imagery date** — 26 Apr (56), 27 Apr
  (778), 29 Apr (2,528), 3 May (1,221) — so the reveal is itself the acquisition
  sequence from Scene 16. Observed points are **hard-edged squares with a 1px
  rim**; the modelled field behind them is **soft, blurred and unstroked**. The
  two never share a visual grammar.
- **Interaction** Toggle damage classes; hover a point for its class, imagery
  date and confidence.
- **Result class** OBSERVED.
- **Limitation** **No denominator.** UNOSAT records damaged structures only; no
  examined-area footprint is published, so no damage *rate* can ever be computed
  from it. This is the single most repeated caption in the product.

### SCENE 09 — MODEL VERSUS OBSERVATION ★

**The analytical centrepiece.** Designed as a three-beat reveal.

- **Question** Does observed damage get worse where the model says shaking was
  stronger?

**Beat 1 — the map looks correlated.** Damage points over intensity bands. They
visibly cluster in the strong bands. The panel says only: *it looks related.*

**Beat 2 — the statistics.**

```
DAMAGE CLASS × INTENSITY BAND
χ² = 255.5   df = 6   p ≈ 3 × 10⁻⁵²
Cramér's V = 0.167              ← small
Cochran's rule: holds
```

with the caption: *with 4,583 observations a trivial departure is
"significant". Read the effect size.*

**Beat 3 — the reversal.** Destroyed share by band: VII 38.7% → VII–VIII 31.1%
→ VIII 55.8%. **Not monotonic.** Then the only comparison that holds place
constant — the two analysis areas that straddle a contour:

| Area | Lower band | Higher band | |
| --- | --- | --- | --- |
| Sundar Bazar | VII: 20.3% | VII–VIII: 14.1% | ↓ |
| Manbu Area | VII–VIII: 55.4% | VIII: 50.8% | ↓ |

*In neither does the destroyed share rise with intensity.* Each band contains
different towns; the pooled pattern is produced by **which places fall in each
band**, not by the shaking.

- **Visual** Beat 3 animates the two areas isolating themselves on the map while
  everything else dims to 8%, with a paired slope chart beside them.
- **Result class** DERIVED, with the association explicitly marked as *not
  causal*.
- **Limitation** Observation counts per band measure satellite tasking, not
  damage. Only composition within a band is read.

### SCENE 10 — A SECOND OBSERVATION SYSTEM

- **Purpose** Show that "damage data" is not one thing.
- **Question** What does a source with a denominator tell us that UNOSAT cannot?
- **Data** `nepal-2015-copernicus-grading.json` — 41,042 graded structures.
- **Analysis** Stage 5.5 per-AOI rates and the dose-response.
- **Visual** Split-screen. **Left: UNOSAT** — 4,583 points, no denominator, four
  ordinal classes. **Right: Copernicus** — 41,042 structures *including
  undamaged ones*, two EMS-98 grades with **nothing between them**. The
  vocabularies are drawn as two separate scales with a **broken link glyph**
  between them; no crosswalk is offered because none exists.

  Then the rate only Copernicus can support:

  | MMI band | Graded | Destroyed | Rate | Areas |
  | --- | ---: | ---: | ---: | --- |
  | VI–VII | 14,542 | 8 | 0.055% | POKHARA |
  | VII | 19,060 | 191 | 1.0% | HETAUDA, KATHMANDU, BHARATPUR |
  | VII–VIII | 4,987 | 249 | 5.0% | CHILIME, BIDUR, GORKHA |

  ρ = 1, χ² = 797. A clean gradient — **and then the confound lands**: no area
  of interest spans two bands, so *intensity band and town are the same
  variable*. The three band labels visibly resolve into three sets of town names.
- **Result class** DERIVED.
- **Limitation** Seven towns are not Nepal. GORKHA's 121 records carry no usable
  grading at all; LEKHNATH has delineation only.

### SCENE 11 — INFRASTRUCTURE

- **Purpose** Move from buildings to the things that connect them.
- **Question** What infrastructure was observed damaged?
- **Data** `nepal-2015-nga-infrastructure-damage.json`.
- **Analysis** Stage 5.6 geometry check, 5.7 association.
- **Visual** Three layers animate on in sequence, each with its own toggle:
  **179 blocked roads** (amber→red technical line segments), **5 bridges out**
  (distinct point glyph, not a dot), **51 landslides** (polygons, 325.9 ha).

  Then the geometry check, which changes how everything above is read:

  ```
  179 blocked roads  =  19.93 km of line geometry
  median feature length  65 m
  → these are OBSTRUCTION MARKERS, not closed routes
  ```

  And the association curve, drawn as a curve rather than a number: 0 m 7.8% →
  50 m **9.5%** → 500 m 14.5%. Only 17 of 179 blockages lie within 50 m of a
  mapped landslide, median distance **7.7 km**.
- **Interaction** Layer toggles; tolerance slider that redraws the association.
- **Result class** OBSERVED (features), DERIVED (association).
- **Limitation** **Spatially associated with**, never *caused by*. And the low
  association partly measures a 51-polygon landslide layer against inventories
  that map tens of thousands.

### SCENE 12 — THE COVERAGE GAP ★

**The strongest teaching moment in the product.**

- **Question** Does "no damage recorded" mean "no damage"?
- **Data** Stage 5 district distributions, joined.
- **Visual** A single table, built row by row on the map:

  | | Blocked roads | Landslides | UNOSAT points |
  | --- | ---: | ---: | ---: |
  | **Sindhupalchok** | **65** | **23** | **0** |
  | Dolakha | 33 | 4 | 0 |
  | Rasuwa | 22 | 5 | 0 |
  | Gorkha | 20 | 9 | 1,847 |
  | Bhaktapur | 0 | 0 | 458 |

  Sindhupalchok lights up amber on the map — the district with the **most
  observed road blockage and the largest mapped landslide area**, and **not one
  UNOSAT damage point**. Then the headline:

  ```
  OBSERVATION COVERAGE ≠ REAL-WORLD ABSENCE
  ```

  A dedicated **coverage layer** renders the two footprints as distinct hatches
  so the gap between them is a visible shape, not an inference.
- **Interaction** Toggle between *what was observed* and *what was examined*.
- **Result class** DERIVED, with DATA_GAP shading over uncovered districts.
- **Limitation** This is the point of the scene, not a footnote on it.

### SCENE 13 — THE NETWORK

- **Purpose** Turn damage into consequence.
- **Question** What did the blockages do to connectivity?
- **Data** `nepal-2015-osm-roads.json` — the network **as at 2015-04-24**.
- **Analysis** Stage 5.8.
- **Visual** The 2,129-way network draws in as a dim green mesh (2,268 nodes,
  5,454 directed edges, 40 components). A persistent **SCENARIO** chip appears
  in the top bar and stays for Scenes 13–14 and 17.

  Then the honest diagnostic, which is the finding:

  | Where the 184 markers sit | |
  | --- | ---: |
  | On a strategic-class road (routable) | 21 |
  | On a mapped road **below tertiary** | 45 |
  | Near a mapped road, beyond tolerance | 48 |
  | **No mapped road of any class within ~600 m** | **70** |

  And the mapping gap, measured: today's OSM holds **7,143 ways against 2,129 —
  3.36×**. A ghost layer of the modern network can be toggled over the 2015 one
  to make that visible.
- **Result class** **SCENARIO** — observed blockages on a constructed network.
- **Limitation** Strategic classes only. Most of the observed disruption was on
  roads this network cannot represent, and it says so on screen.

### SCENE 14 — A ROUTE

- **Purpose** Make the abstraction personal.
- **Question** What happens to one journey?
- **Data** Same network, `withScenario` + `shortestPath` + `kShortestPaths`.
- **Visual** User picks origin and destination. Two paths animate: **baseline**
  in green, **damage scenario** in amber. Of 14 Kathmandu→district pairs: 8
  unchanged, **1 detour (+9.16 km)**, 0 severed, and **5 that could not be
  routed on the 2015 map at all** — drawn in grey and labelled a *coverage gap*,
  never a severance.
- **Interaction** Origin/destination pickers; a bridges-only toggle showing that
  one bridge loss alone splits the network 40 → 41 components and detaches 14
  nodes.
- **Result class** SCENARIO.
- **Limitation** **No travel time anywhere.** No speed or condition dataset for
  April 2015 exists. The k-shortest-path count **saturated at k = 4** and the
  panel says so rather than reporting "no redundancy lost" as a finding.

### SCENE 15 — PEOPLE AND DAMAGE

- **Purpose** Bring population back, precisely.
- **Question** How many people lived near what was observed?
- **Data** Stage 5.10/5.11.
- **Visual** Expanding proximity rings around the damage points, with the count
  updating per band:

  | Within | People |
  | --- | ---: |
  | 500 m | 169,000 |
  | 1 km | 251,000 |
  | 2 km | 361,000 |
  | 5 km | 785,000 |
  | 10 km | 2.64 million |

  Then the per-capita reversal, which is the analytical payload:

  ```
  Gorkha      7.61 per 1,000      151 of 4,786 cells examined
  Dhading     3.34
  Bhaktapur   1.39
  KATHMANDU   0.11  ← 8th of 9      2 of 547 cells examined (0.4%)
  ```

  *and* Kathmandu is the **highest Copernicus destruction rate at 19.5%**. The
  two facts are placed side by side deliberately.
- **Result class** DERIVED.
- **Limitation** The label is *population within X of observed damage*. Never
  "affected". Never "lost their homes". The artefact ships the forbidden list.

### SCENE 16 — FOUR CLOCKS

- **Purpose** Show that observation has its own timeline.
- **Question** When was any of this actually seen?
- **Data** Stage 5.12.
- **Visual** Four parallel tracks on one axis, **never merged**:

  ```
  EARTHQUAKE    25 Apr 06:11 UTC ──────────────────────────
  IMAGERY       ····· 26 ·· 27 ······ 29 ········ 3 May ····
  MAPPING       ·············· 28 ······ 30 ····· 4 May ····
  PUBLICATION   ································· 6–7 May ··
  ```

  Lags: event→imagery **median 4 days**; imagery→mapping median 0; mapping→
  publication median 3; event→publication median 12.
- **Interaction** Scrub any single clock; the map shows what that clock knew.
- **Result class** OBSERVED.
- **Limitation** **None of these clocks records when damage occurred.** Cloud and
  revisit intervals drive the sequence. Animation is per-clock by design — the
  UI makes it impossible to animate a merged one.

### SCENE 17 — INTELLIGENCE QUALITY & DATA GAPS

- **Purpose** Make the epistemics the subject.
- **Question** How firmly is any of this known, and what is missing?
- **Visual** Two panels. **Left — the result-class legend** as a live filter:
  ticking OBSERVED dims every derived and scenario layer on the map at once, so
  a user can literally see how much of the picture is constructed. **Right — the
  gap register:**

  ```
  DATA GAPS
  CASUALTIES              → government/agency counts; not derivable
  DISPLACEMENT            → IOM DTM; not held
  ECONOMIC LOSS           → PDNA is national/sectoral, not per-district
  HOSPITAL CAPACITY       → not held
  EVACUATION CAPACITY     → not held
  RECOVERY                → no reopening dates for any blocked road
  ROAD SPEEDS (Apr 2015)  → no open inventory found
  TERRAIN / DEM           → SRTM available, not ingested
  ```

  Each row names the dataset that would answer it.
- **Result class** DATA_GAP.
- **Limitation** This scene is the limitation section, promoted to a first-class
  view.

### SCENE 18 — SCENARIOS *(design only; build last)*

Response exploration, permanently chipped **SCENARIO**: route alternatives under
a chosen blockage, connectivity under a chosen bridge loss, population above a
chosen threshold. **No optimal evacuation or rescue plan is offered** — the data
to support one does not exist, and saying so is part of the scene.

---

## 4. Scene-by-scene data mapping

`A` = artefact in `data/analysis/`, `P` = artefact in `data/processed/`.
"Brief §" maps each scene back to the Stage 6 brief so coverage is checkable.

| # | Scene | Brief § | Dataset | Analysis reused | Visualization | Result class |
| --- | --- | --- | --- | --- | --- | --- |
| 00 | Case card | §3 | A seismic | `mainShock` | Type only | OBSERVED |
| 01 | Locate | §4 | P districts | — | Animated outline, epicentre | OBSERVED/OFFICIAL |
| 02 | Earthquake | §5 | P seismic (316) | `counts`, `magnitude`, `depth`, `largestEvents` | Graduated point cloud | OBSERVED |
| 03 | Sequence | §6 | P seismic | `omori` (segmented), `temporal` | Timeline → map + decay chart | OBSERVED + MODEL_FIT |
| 04 | Shaking | §7 | P shakemap | `contoursToRings` + **new** `intensityBands` | Filled intensity surface | MODELED |
| 05 | Who was under it | §7–8 | P population | `populationByIntensity`, `thresholdSensitivity` | Extruded density + threshold | DERIVED |
| 06 | Overlap | §8 | A exposure | `populationIntensityQuadrants`, `districtQuadrants` | Bivariate choropleth | DERIVED |
| 07 | Descend | §9 | P districts | Stage 5 `byDistrict` | Cinematic descent + dossier | mixed |
| 08 | Observed damage | §10 | P UNOSAT (4,583) | 5.1 reproduction, 5.2 ranking, 5.3 concentration | Progressive point reveal | OBSERVED |
| 09 | Model vs observation ★ | §11 | P UNOSAT + shakemap | **5.4** incl. within-area stratification | 3-beat: map → stats → reversal | DERIVED |
| 10 | Second source | §12 | P Copernicus (41,042) | **5.5** dose-response | Split-screen + broken-link glyph | DERIVED |
| 11 | Infrastructure | §13 | P NGA | 5.6 geometry, **5.7** association curve | 3 layers + tolerance curve | OBSERVED + DERIVED |
| 12 | Coverage gap ★ | §14 | A damage + infrastructure | district joins | Table built on map + hatch layer | DERIVED + DATA_GAP |
| 13 | Network | §15 | P OSM roads | **5.8** matching diagnostic | Network mesh + ghost layer | SCENARIO |
| 14 | Route | §16 | P OSM roads | `shortestPath`, `kShortestPaths`, `withScenario` | Dual route animation | SCENARIO |
| 15 | People + damage | §17 | A damage-population | **5.10**, **5.11** per-capita | Proximity rings + ranking | DERIVED |
| 16 | Four clocks | §12 (5.12) | A damage | `observationTimeline` | Four parallel tracks | OBSERVED |
| 17 | Quality & gaps | §18–19 | all | all methodology records | Class filter + gap register | DATA_GAP |
| 18 | Scenarios | §20 | P OSM roads | `withScenario`, `betweennessCentrality` | Interactive what-if | SCENARIO |

### Data → Visualization matrix (§28 B)

| Dataset | Size | Records | Analysis | Visualization | Scenes |
| --- | ---: | ---: | --- | --- | --- |
| USGS events | 128 KB | 316 | Seismic sequence, Omori, G-R | Point cloud + timeline + decay chart | 00, 02, 03 |
| USGS ShakeMap | 100 KB | 11 contours / 1,842 verts | Intensity bands | Filled 3D surface | 04, 05, 09 |
| WorldPop 2015 | 2.6 MB | 177,679 cells | Exposure by intensity, quadrants | Extruded density, bivariate choropleth | 05, 06, 15 |
| COD-AB districts | 1.4 MB | 75 / 24,681 verts | Attribution, per-district joins | Outline, choropleth, dossier | 01, 06, 07, 12 |
| OCHA exposure | 28 KB | 66 districts | Comparability verdict | Comparison table | 17 |
| UNOSAT damage | 2.0 MB | 4,583 | Counts, severity, concentration, ×intensity | Progressive point layer | 08, 09, 12, 15 |
| Copernicus EMSR125 | 1.7 MB | 41,042 | AOI rates, dose-response | Split-screen + rate chart | 10 |
| NGA infrastructure | 296 KB | 235 | Geometry check, association | 3 toggleable layers + curve | 11, 12 |
| OSM roads 2015-04-24 | 5.2 MB | 2,129 / 105,887 verts | Network, matching, routing | Network mesh + routes | 13, 14, 18 |
| OSM blockage context | 1.1 MB | 393 | Blockage diagnostic | Class breakdown | 13 |

**Analyses reused: all twenty-two Stage 3–5 methodology records** (Stage 3: 6,
Stage 4: 4, Stage 5: 12).
**New analysis required: one** — `intensityBands` (§11). Everything else is a
rendering or joining concern, not an analysis.

---

## 5. Visualization specification

### The visual grammar that carries the argument

The single most important rule in the whole design: **observed and modelled
things never share a visual grammar.**

| | OBSERVED | MODELED | DERIVED | SCENARIO |
| --- | --- | --- | --- | --- |
| Edge | Hard, 1px rim | None | Dashed 1px | Dashed 2px |
| Fill | Solid, high opacity | Soft gradient, ≤35% | Hatched | Hatched + animated |
| Shape | Square / discrete glyph | Continuous field | Polygon | Polygon |
| Motion | Appears at its own date | Blooms from source | Fades | Pulses slowly |
| Chip | `OBSERVED` | `MODELED` | `DERIVED` | `SCENARIO` |

A user who has seen Scene 09 should be able to tell, from across the room and
with no legend, whether a thing on the map was *seen* or *computed*.

### Visualization types, and the question each earns

| Type | Used in | Question it answers |
| --- | --- | --- |
| Graduated point cloud | 02, 08 | Where and how big? |
| Timeline → map binding | 03, 16 | When, and what was knowable then? |
| Filled intensity surface | 04 | How hard, where? |
| Extruded density grid | 05 | How many people, where? |
| Bivariate choropleth | 06 | Where do two variables coincide? |
| Slope chart (paired) | 09 | Does the relationship hold within a place? |
| Split-screen comparison | 10 | Are these the same kind of measurement? |
| Association curve | 11 | How sensitive is this to my tolerance? |
| Hatched coverage layer | 12 | What was examined, versus what was found? |
| Network mesh + scenario diff | 13, 14 | What did this break? |
| Proximity rings | 15 | How close, and how many? |
| Parallel time tracks | 16 | Which clock is this? |
| Class filter | 17 | How much of this picture is constructed? |

### Charts

Reuse `src/ui/supplychain/charts.js` (`barChart`, `timeSeriesChart`,
`beforeAfterChart`). Three new primitives are needed and are small:
`slopeChart` (Scene 09), `curveChart` with a marked headline point (Scene 11),
`concentrationCurve` (Scene 08). All inline SVG; no chart dependency is added.

---

## 6. Interaction specification

### The principle

Every visualization answers a question, and the question is printed above it.
A view that cannot state its question does not ship.

### Controls, by scene

| Control | Scenes | Effect |
| --- | --- | --- |
| Scene rail | all | Jump to scene; state preserved |
| Timeline scrub | 03, 16 | Sets event cutoff / clock; drives the map |
| Intensity threshold | 04, 05 | Redraws bands, re-extrudes population, re-prints exposure |
| Quadrant select | 06 | Filters districts |
| District picker | 07 | Descends; limited to the nine with coverage |
| Damage-class toggles | 08, 09 | Filters the point layer |
| Tolerance slider | 11 | Redraws road–landslide association |
| Layer toggles | 11, 13 | Roads / bridges / landslides / network / ghost network |
| Origin–destination | 14, 18 | Routes baseline and scenario |
| Proximity band | 15 | Expands rings, updates population |
| Result-class filter | 17, global | Dims every layer not of the ticked classes |
| Mode switch | global | EXPLORE ⇄ PRESENT |

### Cross-filtering

One selection propagates everywhere. Selecting Sindhupalchok in Scene 12 filters
the damage layer, the infrastructure layer, the network view and the panel
simultaneously — they are projections of one state, as `investigation.js`
already enforces.

### What is deliberately not interactive

- The result-class chips. They are not toggles; they are facts.
- The forbidden-phrasing rules. There is no "simplify labels" mode that turns
  *population within 500 m of observed damage* into *affected*.

---

## 7. Map and camera choreography

```
SCENE   ALTITUDE      PITCH   TARGET                    DURATION
00      20,000 km     −90°    globe, behind type        —
01      20,000 →       −90°    South Asia → Nepal        4.5 s
         1,200 km
02       1,200 km     −90°    84.7E 28.2N               hold
03       1,200 km     −75°    slow orbit 6°/s           continuous
04         900 km     −70°    rupture centroid          2.5 s
05         900 km     −55°    tilt for extrusion        2.0 s
06         900 km     −90°    top-down for choropleth   1.8 s
07         900 →      −55°    selected district         5.0 s
          120 → 25 km
08          25 km     −50°    damage centroid           1.5 s
09          25 km     −45°    two straddling areas      3.0 s
10          18 km     −55°    AOI pair                  2.5 s
11          60 km     −60°    infrastructure extent     2.5 s
12         400 km     −80°    Sindhupalchok + Gorkha    3.5 s
13         400 km     −75°    network extent            2.5 s
14         200 km     −60°    follows the route         animated
15          80 km     −55°    damage + population       2.5 s
16         400 km     −90°    top-down, time as hero    2.0 s
17         900 km     −90°    whole country             3.0 s
```

**Rules.** Never cut — every move is a flight. Ease-in-out throughout. Altitude
changes and pitch changes are simultaneous, never sequential. The camera stops
moving whenever the user touches a control, and resumes only on scene change.
`prefers-reduced-motion` collapses every flight to 400 ms and disables the orbit.

Reuses `createCameraMotion` and `globeAdapter.flyTo`; no new camera engine.

---

## 8. Explore mode

The default. The scene rail is navigation, not a rail-road:

- Any scene is reachable at any time, in any order.
- Layers persist across scenes — turning on infrastructure in 11 and jumping to
  06 keeps it on, with the layer tray showing what is carried.
- A **"why is this here?"** affordance on every figure opens its methodology
  record: question, inputs, spatial coverage, method, validation, limitations,
  result class. Twelve records already exist and are rendered, not rewritten.
- Deep links: `#/case/npl-2015-eq/scene/09?district=gorkha&layers=damage,shakemap`.

---

## 9. Presentation mode

For the university presentation. **Reuses `createDemoPlayback` from
`src/disaster/demo.js`** — the engine exists; the script is replaced.

- Runs scenes 00 → 17 on timed beats with camera flights and narration lines.
- **Pause at any point drops into EXPLORE at that exact state.** Resume
  continues. This is the single most important behaviour for live presenting.
- Keyboard: `→` next beat, `←` previous, `space` pause/resume, `E` escape to
  explore, `P` back to present.
- A thin progress strip shows position in the sequence and which act.
- Target runtime **12–14 minutes**, with a `SHORT` variant (00, 02, 04, 05, 09,
  12, 15, 17) at ~6 minutes for a tight slot.

---

## 10. UI architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ NATURAL DISASTER INTELLIGENCE   CASE NPL-2015-EQ                     │
│ DATASETS 10 · ANALYSES 22 · STAGE-5 CHECKS 26/26 · [EXPLORE|PRESENT] │  TOP BAR
├────────────┬────────────────────────────────────────┬────────────────┤
│ ACT I      │                                        │  SEISMIC EVENT │
│ 00 CASE    │                                        │                │
│ 01 LOCATE  │                                        │  M 7.8         │
│ 02 QUAKE   │          CESIUM — 3D MAP               │  8.2 KM        │
│ 03 SEQUENCE│                                        │  06:11:26 UTC  │
│            │          the storytelling surface      │                │
│ ACT II     │                                        │  316 EVENTS    │
│ 04 SHAKING │                                        │  ───────────   │
│ 05 EXPOSURE│                                        │  [OBSERVED]    │
│ ...        │                                        │  why is this   │
│            │                                        │  here? →       │
│ ACT III    ├────────────────────────────────────────┤                │
│ 17 QUALITY │ TIMELINE / THRESHOLD / LAYER TOGGLES   │  SOURCE: USGS  │
└────────────┴────────────────────────────────────────┴────────────────┘
   LEFT 240px              CENTER flex                    RIGHT 340px
```

**Top bar.** Every figure corresponds to real application state — 10 datasets
loaded, 22 methodology records, and 26 of 26 Stage 5 validation checks passing,
all read from the artefacts at load.

**An inconsistency the inspection turned up, and the top bar is where it bites.**
Stage 5 artefacts carry `validation.checks` as an array of named pass/fail
rows; Stage 3 and Stage 4 instead carry named boolean fields
(`eventCountMatches`, `cellsMatch`, …). So there is no uniform count to display
across all five. Rather than print a figure that silently means "Stage 5 only",
P1 normalises Stage 3 and Stage 4 to the same `checks` array shape — a small,
additive artefact change — and the bar then counts all of them honestly. Until
that lands the label says `STAGE-5 CHECKS`.

**No fake "live" indicators.** There is no live feed in a 2015 case, and a
blinking "SYSTEM: ONLINE" that means nothing is exactly the cheap-hacker tell
the identity file already warns against. `SYSTEM` reports actual load state:
`LOADING 3/10` → `READY`.

**Left rail.** Scenes grouped by act. Each carries a completion dot and its
result-class mix as a 3px stripe, so the rail itself shows how the evidence
changes character as you descend.

**Center.** Cesium. Everything else is chrome around it.

**Right panel.** Contextual, rebuilt per scene from `workspace/components.js`
primitives. Always ends with the result-class badge, the source line and the
"why is this here?" link.

**Bottom strip.** Scene-specific controls only. Empty on scenes that have none —
an empty strip is better than a strip of disabled controls.

---

## 11. Data architecture

### Two tiers, and the reason

```
TIER 1 — ANALYSIS (334 KB total, loaded at startup)
  nepal-2015-seismic-analysis.json         44 KB
  nepal-2015-population-exposure.json     108 KB
  nepal-2015-damage-analysis.json         104 KB
  nepal-2015-infrastructure-analysis.json  64 KB
  nepal-2015-damage-population.json        28 KB

TIER 2 — GEOMETRY (14.6 MB, lazy, per scene)
  shakemap contours    100 KB   scene 04
  seismic events       128 KB   scene 02
  NGA infrastructure   296 KB   scene 11
  districts            1.4 MB   scene 01 (simplified) / 07 (full)
  Copernicus           1.7 MB   scene 10
  UNOSAT               2.0 MB   scene 08
  population           2.6 MB   scene 05
  OSM roads            5.2 MB   scene 13
  blockage context     1.1 MB   scene 13
```

**Every headline number in the product lives in Tier 1.** The panels, the scene
text, the top bar and the whole of Scene 17 need 334 KB. Geometry is only needed
when its layer is actually drawn. This is why the experience can feel instant
while carrying 15 MB of evidence.

### Serving

`data/` is outside Vite's `publicDir`. Two options, and the second is chosen:

1. Copy artefacts into `public/` at build — duplicates 15 MB in the repo.
2. **Add a Vite static-serve mapping for `/data/**` in dev and copy at build
   time via a build step.** No duplication in source control, one path in both
   modes: `/data/analysis/...`, `/data/processed/...`.

### Reading them

A new pure module `src/nepal/story/artefacts.js` takes parsed JSON and returns
typed accessors, so the frontend never reaches into raw artefact shapes. It
keeps the portability boundary Stages 0–5 established: pure modules in
`src/nepal/` take values, never touch `fs` or the network; fetching lives in a
thin `src/nepal/story/loader.js` adapter.

---

## 12. Performance architecture

### The rule

**Do not solve performance by deleting analytical information.** Every technique
below preserves every figure; what changes is when and in what form it arrives.

### Budget

| Stage | Target |
| --- | --- |
| First paint (case card) | < 800 ms |
| Tier 1 loaded, Scene 01 ready | < 2 s |
| Scene transition (cached layer) | < 400 ms |
| Scene transition (cold layer) | < 1.5 s |
| Sustained | 60 fps desktop, 30 fps laptop |

### Per-dataset plan

| Dataset | Risk | Treatment |
| --- | --- | --- |
| **OSM roads 5.2 MB / 105,887 verts** | Highest. Parsing + graph build measured at ~170 ms in Node; the payload is the problem. | Precompute the **built graph** at build time into a compact typed-array format (nodes, edges, offsets). Ship geometry separately and only for drawn edges. Build the graph in a **Web Worker**. |
| **Population 177,679 cells** | Rendering 177k entities is impossible. | Precompute a **density texture** (PNG) at build time for the visual layer; keep the sparse JSON for numbers only, loaded once and kept off the render path. Extrusion uses a decimated 4 km grid at country zoom, 1 km below 200 km altitude. |
| **UNOSAT 4,583 points** | Manageable. | Render directly. Cluster above 150 km altitude using the existing overlay cohort pattern (`EARTHQUAKE_OVERLAY_COHORT_LIMIT`). |
| **Copernicus 41,042 points** | Too many individual entities. | Already columnar. Render as a **single point primitive collection**, not entities. Only ever shown inside AOI polygons at close zoom. |
| **Districts 24,681 verts** | Fine. | Two versions: simplified (already have `simplifyRing`) for Scene 01/06, full for Scene 07. |
| **Copernicus/UNOSAT/roads together** | Never co-rendered. | Scene system enforces it: no scene declares more than three heavy layers. |

### Techniques

- **Precompute at build, not at runtime** — graph, density texture, simplified
  geometry, scene manifests. A `pipelines/build-frontend-assets.mjs` step.
- **Web Workers** for graph construction and any routing that is not instant.
- **Progressive reveal is also a performance strategy** — Scene 08's reveal by
  imagery date is narratively motivated *and* spreads 4,583 insertions over 2 s.
- **Unload on scene exit** for layers not carried forward.

### Risks

1. **Cesium primitive count** is the real ceiling, not payload. Copernicus must
   use primitives, not entities, or Scene 10 will stall.
2. **The density texture is a new asset pipeline** — it is the piece most likely
   to slip, and it is on the critical path for Scene 05.
3. **Mobile is out of scope.** This is a desktop presentation tool; the design
   does not pretend otherwise.

---

## 13. Visual design system

### What exists and is kept

`src/ui/styles/identity.css` already establishes the whole language and its
discipline. Stage 6 **extends** it; it does not restyle it.

```css
/* surfaces — very dark, slightly green-shifted */
--gx-void:         #04070a
--gx-bg:           #060b0e
--gx-panel:        #081410
--gx-panel-raised: #0b1a15
--gx-inset:        #050d0a

/* greens — three, each with one job */
--gx-neon:    #00ff9c   live, selected, active now
--gx-green:   #22d97f   the interface: borders, labels, controls
--gx-emerald: #0f9d58   fills, secondary text, inactive

/* states — never green, because an alert that matches the chrome is not an alert */
--gx-amber:  #ffb020   warning, degraded, estimated
--gx-red:    #ff4d4d   destroyed, blocked, fatal
--gx-violet: #a78bfa   modelled or simulated, never observed
--gx-cyan:   #4dd8ff

/* edges — a rim and a spread, never a blur halo */
--gx-glow:        0 0 0 1px rgba(34,217,127,.28), 0 0 18px rgba(34,217,127,.07)
--gx-glow-strong: 0 0 0 1px rgba(0,255,156,.5),   0 0 26px rgba(0,255,156,.14)

/* type */
--font-sans: Inter        13px body, near-white  #e4f5ec
--font-mono: JetBrains Mono — machine-read numbers only
--panel-radius: 4px
```

The four rules already written into that file and reaffirmed here:

1. **Green carries meaning, not decoration.**
2. **Glow is a rim plus a low-alpha spread. Text never glows.**
3. **Body copy is Inter, near-white.** Green monospace at paragraph length is
   the single clearest tell of the aesthetic being avoided.
4. **Scanlines and grid at 2–4% alpha, on backgrounds only, behind content, and
   both respect `prefers-reduced-motion`.**

### What Stage 6 adds

```css
/* hazard intensity ramp — deliberately NOT green.
   Green is the interface; a hazard field in interface colour is not a field. */
--gx-mmi-4:  #7fd4e8    --gx-mmi-6:   #ffd166    --gx-mmi-7-5: #f4713b
--gx-mmi-5:  #a8e6c4    --gx-mmi-6-5: #ffb020    --gx-mmi-8:   #ff4d4d

/* result-class accents (§14) */
--gx-observed: var(--gx-neon)     --gx-modelfit: #c4a7f5
--gx-official: var(--gx-cyan)     --gx-estimate: var(--gx-amber)
--gx-derived:  var(--gx-green)    --gx-scenario: var(--gx-violet)
--gx-gap:      #5b6b66            /* desaturated: a gap is not an alert */

/* surface treatments */
--gx-hatch-derived:  repeating-linear-gradient(45deg, …)
--gx-hatch-scenario: repeating-linear-gradient(-45deg, …)
--gx-hatch-gap:      repeating-linear-gradient(90deg, …)
```

**Panels.** 1px `--gx-line` border, `--gx-panel` fill, 4px radius, no shadow
except `--gx-glow` on the active one. **Cards** are panels with a 3px left
stripe in their result-class colour. **Numbers** are JetBrains Mono, tabular
figures, with the unit at 0.75em in `--gx-text-dim`.

---

## 14. Data-confidence visual language

**This is the product's differentiator and it gets the most careful treatment.**

### Resolving the vocabulary conflict

The frontend's five classes and the artefacts' seven must become one list. The
**Stage 3–5 `ResultClass` is canonical** — it is what the artefacts carry, what
twenty-two methodology records are written against, and what the academic work rests
on. Legacy keys are kept as aliases so no existing view breaks.

| Canonical | Colour | Chip | Means | Legacy alias |
| --- | --- | --- | --- | --- |
| **OBSERVED** | `--gx-neon` | ● solid | Recorded by an instrument or agency. Not computed here. | `LIVE`, `HISTORICAL` |
| **OFFICIAL** | `--gx-cyan` | ● solid | Published by an authoritative body, reported as published. | `HISTORICAL` |
| **DESCRIPTIVE_STATISTIC** | `--gx-green` | ◐ half | A count or distribution computed directly from observations. Adds no assumptions. | `INFERRED` |
| **DERIVED** | `--gx-green` | ◐ half | Computed here by combining datasets. No free parameters. | `INFERRED` |
| **MODEL_FIT** | `--gx-modelfit` | ◑ hatched | A parameter of a model fitted to observations. **Not a measurement of the earth.** | `SIMULATED` |
| **ESTIMATE** | `--gx-amber` | ◔ dotted | Computed here, and a stated assumption changes the answer. | `INFERRED` |
| **SCENARIO** | `--gx-violet` | ◌ dashed | A hypothetical. **Never a claim about what happened.** | `SIMULATED` |
| **DATA_GAP** | `--gx-gap` | ○ open | Cannot be reliably computed. What would be needed is stated. | `UNKNOWN` |

`DATA_GAP` is deliberately **desaturated grey-green, not red**. A gap is not an
alarm; treating it as one would make honesty look like failure.

### Where the language appears — four places, always together

1. **On the chip** in the panel, beside the figure.
2. **In the map grammar** — edge, fill and motion per §5.
3. **In the legend**, which is a filter and not decoration.
4. **In the top bar** when a whole scene is constructed: Scenes 13, 14 and 18
   carry a persistent `SCENARIO` band across the header. It is impossible to
   screenshot a route from this product without the word SCENARIO in frame.

### The Scene 17 filter

The strongest expression: ticking only **OBSERVED** dims every derived, fitted
and scenario layer simultaneously. The user sees, in one gesture, how much of
the picture is constructed. No other feature in the product teaches as much
about disaster data in as little time.

### Guardrails already in code

`src/nepal/analysis/terminology.js` ships `FORBIDDEN_PHRASING` and
`findForbiddenPhrasing`, and existing tests run them against strings the project
actually ships. Stage 6 extends that test to **every user-facing string in the
Nepal scene definitions**, so a scene cannot be authored with the word
*affected* in it.

---

## 15. Data gaps

Rendered as a first-class view (Scene 17), not an appendix.

| Gap | Why it matters | What would fill it |
| --- | --- | --- |
| **Casualties** | The figure everyone expects and none of our sources carry. | Government and agency counts. Not derivable from exposure or damage. |
| **Displacement** | People leave undamaged homes; damage does not predict it. | IOM Displacement Tracking Matrix. Not held. |
| **Economic loss** | PDNA total is national and sectoral. | Per-district loss assessment. Not published in that form. |
| **Hospital capacity** | Needed for any real response analysis. | Health facility registry with capacity. Not held. |
| **Evacuation capacity** | Same. | Shelter cluster site data. Not held. |
| **Recovery / reopening** | Every network result is a single snapshot without it. | Logistics Cluster access constraint updates. Not machine-readable for this event. |
| **Road speeds, April 2015** | Why no travel time appears anywhere. | Department of Roads inventory. Not found in open form. |
| **Terrain / DEM** | Landslide susceptibility cannot be related to slope. | SRTM or ALOS AW3D30 — **openly licensed, simply not ingested.** The one gap that is a choice rather than an absence. |
| **Examined-area footprint** | Why UNOSAT has no denominator and Scene 12 exists. | Nothing published. |

The DEM row is marked differently from the rest: it is the only gap the project
could close, and saying so is more honest than listing it beside the ones that
cannot be closed at all.

---

## 16. Future scenario system

Designed now, built last, and fenced.

**Three scenario types are defensible** because each only re-runs an existing
validated engine over observed inputs:

1. **Route alternative** — "if this road is unavailable" → `withScenario` +
   `kShortestPaths`. Reports additional distance and whether a route exists.
2. **Connectivity** — "if this bridge is unavailable" → `componentProfile`
   diff. Reports components split and nodes detached.
3. **Population above threshold** — "which areas hold the most people above MMI
   X" → the Stage 4 threshold curve, already computed.

**What is refused, and why it is written into the design rather than left to
judgement at build time:**

- No optimal evacuation plan. Requires evacuation capacity. Not held.
- No rescue prioritisation. Requires casualty and capacity data. Not held.
- No travel time or ETA. Requires road speeds. Not held.
- No recovery timeline. Requires reopening dates. Not held.
- No casualty projection under any scenario. Not derivable, ever, from what we
  hold.

Every scenario output carries the `SCENARIO` band, and the panel states which
observed inputs and which constructed assumptions produced it.

---

## 17. Implementation phases

Ordered so that something demonstrable exists after every phase, and so the
riskiest work is neither first nor last.

| Phase | Scope | Deliverable | Risk |
| --- | --- | --- | --- |
| **P1 — Plumbing** | Serve `data/`, `story/loader.js`, `story/artefacts.js`, Tier 1 load, top bar reading real state | The app shows 10 datasets, 22 analyses and real check counts; Stage 3/4 validation normalised to the Stage 5 `checks` shape | Low |
| **P2 — Result-class language** | Canonical `ResultClass` + aliases, chips, map grammar tokens, forbidden-phrasing test over scene strings | Every existing panel gains a correct badge | Low |
| **P3 — Scene system** | `src/nepal/story/scenes.js` (pure, declarative), scene rail, state machine binding, deep links | Navigable empty scenes with correct camera | Medium |
| **P4 — Act I** | Scenes 00–03: case card, locate, earthquake, sequence | First presentable slice | Low |
| **P5 — Hazard & exposure** | Scenes 04–06 + **`intensityBands`** (the one new analysis) + density texture pipeline | The 13.84M / 7.45M / 235K moment works | **High** — new asset pipeline |
| **P6 — Damage** | Scenes 07–10 incl. **Scene 09**, the centrepiece | The strongest analytical content | Medium |
| **P7 — Infrastructure & coverage** | Scenes 11–12 incl. **Scene 12**, the teaching moment | The second-strongest content | Medium |
| **P8 — Network** | Scenes 13–14, graph in a Worker, precomputed graph asset | Routing under scenario | **High** — 5.2 MB + Worker |
| **P9 — Synthesis** | Scenes 15–17 | The epistemics view | Low |
| **P10 — Presentation mode** | Nepal script over `createDemoPlayback`, pause-to-explore, SHORT variant | Presentable end to end | Medium |
| **P11 — Scenarios** | Scene 18 | Optional for the presentation | Low |

**If time is short, P11 is cut first, then P8 is reduced to Scene 13 without
interactive routing.** P5, P6 and P7 are the presentation and are not cut.
