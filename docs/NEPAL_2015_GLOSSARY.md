# Nepal 2015 — glossary

> **Generated** by `node scripts/generate-briefing-glossary.mjs` from
> `src/nepal/briefing/glossary.js` and the scene timeline. Do not edit by hand: a test
> regenerates this file and fails if it differs.

Every acronym and technical term the briefing uses, in two layers:

- **Plain** (Level 1) is what the briefing shows on screen the first time a run meets the
  term, under the scene’s question, for a few seconds. Later uses pass silently.
- **Technical** (Level 2) is the precise definition, shown in the in-app glossary (`?` or
  `G`) when the technical layer is on (`TECH` or `I`), next to the method notes and the
  sources of every figure.

Definitions describe; they never add a figure. Every number the briefing states comes from an
analysis artefact.

## Sources

### USGS — United States Geological Survey

- **Plain:** The US government science agency that runs the world’s main public earthquake catalogue.
- **Technical:** Event locations, times, depths and moment magnitudes come from the USGS FDSN event service (ComCat), reviewed solutions; public domain (17 U.S.C. §105).
- **First explained:** 3 MIN EXECUTIVE: 02 Locate Nepal · epicentre; 6 MIN BRIEFING: 02 Locate Nepal · epicentre; FULL ANALYSIS: 02 Locate Nepal · epicentre

### SHAKEMAP — USGS ShakeMap

- **Plain:** A USGS model of how hard the ground shook at each place, built from the earthquake and the instruments that recorded it.
- **Technical:** ShakeMap interpolates recorded ground motion with ground-motion prediction equations and site amplification, and converts it to intensity. It is MODELLED, not observed at each place.
- **First explained:** 3 MIN EXECUTIVE: 05 Shaking expands · spread; 6 MIN BRIEFING: 05 Shaking expands · spread; FULL ANALYSIS: 05 Shaking expands · spread

### WORLDPOP — WorldPop 2015 population grid

- **Plain:** A modelled map of where people lived in 2015, about one value per 100 m square — an estimate, not a census count.
- **Technical:** WorldPop distributes census totals onto a grid with a random-forest model of settlement covariates. Aggregated here to 1 km cells; MODELLED.
- **First explained:** 3 MIN EXECUTIVE: 10 Population meets shaking · meets; 6 MIN BRIEFING: 10 Population meets shaking · people; FULL ANALYSIS: 09 Population distribution · people

### UNOSAT — UN Satellite Centre (UNITAR)

- **Plain:** The UN satellite-imagery team that mapped damaged buildings by looking at images taken after the earthquake.
- **Technical:** UNOSAT damage assessment for Nepal 2015: point records of damaged structures in four classes (destroyed, severe, moderate, possible), read from post-event imagery and not field-validated at publication. Records only what was found.
- **First explained:** 3 MIN EXECUTIVE: 13 Damage composition · destroyed; 6 MIN BRIEFING: 13 Damage composition · destroyed; FULL ANALYSIS: 13 Damage composition · destroyed

### COPERNICUS EMS — Copernicus Emergency Management Service (EU), activation EMSR125

- **Plain:** The EU’s emergency-mapping service. In its areas it graded every building it could see, including undamaged ones.
- **Technical:** EMSR125 grading maps use EMS-98-style grades; only grades 1 and 5 were published for the areas used here, so classes do not align one-to-one with UNOSAT’s.
- **First explained:** FULL ANALYSIS: 19 A second observation system · graded

### NGA — US National Geospatial-Intelligence Agency

- **Plain:** The US mapping agency whose analysts marked blocked roads, damaged bridges and landslides from imagery.
- **Technical:** NGA Nepal 2015 humanitarian products: road-blockage segments, bridge status and landslide polygons, each with an observation date.
- **First explained:** 6 MIN BRIEFING: 25 Network before and after · blocked; FULL ANALYSIS: 25 Network before and after · blocked

### OSM — OpenStreetMap

- **Plain:** The volunteer-built world map. We use its roads exactly as they were mapped the day before the earthquake.
- **Technical:** OpenStreetMap history snapshot at 2015-04-24; roads classed as main (motorway to tertiary) or minor and tracks. ODbL. Unmapped tracks existed and are not in the network.
- **First explained:** 6 MIN BRIEFING: 29 Baseline access · roads; FULL ANALYSIS: 21 Road network before · main

### OCHA COD-AB — UN Office for the Coordination of Humanitarian Affairs — Common Operational Dataset, Administrative Boundaries

- **Plain:** The official district boundaries the UN and government used to count everything in 2015.
- **Technical:** Nepal admin level 3 (75 districts) as distributed on HDX; OFFICIAL.
- **First explained:** FULL ANALYSIS: 03 Administrative geography · districts

### DOHS — Nepal Department of Health Services

- **Plain:** Nepal’s government health department, whose list of health facilities (compiled 2010) we use.
- **Technical:** DOHS/WHO health-facility list compiled 21 September 2010, the latest openly available; type and location only — no beds, staff or capacity.
- **First explained:** 6 MIN BRIEFING: 29 Baseline access · hospitals; FULL ANALYSIS: 27 Health facility data · list

## Measures

### MAGNITUDE (M) — Moment magnitude, Mw

- **Plain:** The size of the earthquake itself — one number for the whole event. Each step of one is about 32 times more energy.
- **Technical:** Moment magnitude from the seismic moment: Mw = (2/3)·log10(M0) − 10.7 (M0 in dyne·cm). Logarithmic; +1 Mw ≈ 31.6× energy.
- **First explained:** 3 MIN EXECUTIVE: 04 Main shock · magnitude; 6 MIN BRIEFING: 04 Main shock · magnitude; FULL ANALYSIS: 04 Main shock · magnitude

### FOCAL DEPTH — Depth of the hypocentre

- **Plain:** How far underground the rupture started. Shallow earthquakes shake the surface harder.
- **Technical:** Hypocentral depth from the USGS solution; shallow-crustal depths carry several kilometres of uncertainty and some are fixed by the network.
- **First explained:** 3 MIN EXECUTIVE: 04 Main shock · depth; 6 MIN BRIEFING: 04 Main shock · depth; FULL ANALYSIS: 04 Main shock · depth

### MMI — Modified Mercalli Intensity

- **Plain:** How strongly shaking was felt at a place, and what it did to buildings. Roman numerals: VI strong, VII very strong, VIII severe.
- **Technical:** Macroseismic intensity scale (I–XII). ShakeMap’s MMI is computed from modelled peak ground motion, so it is MODELLED intensity, not a field survey.
- **First explained:** 3 MIN EXECUTIVE: 05 Shaking expands · kathmandu; 6 MIN BRIEFING: 05 Shaking expands · kathmandu; FULL ANALYSIS: 05 Shaking expands · kathmandu

### MAGNITUDE ≠ INTENSITY — Size of the event vs shaking at a place

- **Plain:** Magnitude is one number for the earthquake. Intensity differs place to place: strongest near the rupture, weaker far away.
- **Technical:** Magnitude describes the source; intensity describes effects at a site and depends on distance, depth, geology and buildings.
- **First explained:** 6 MIN BRIEFING: 05 Shaking expands · scale; FULL ANALYSIS: 05 Shaking expands · scale

### AFTERSHOCK — An earthquake that follows a larger one nearby

- **Plain:** Smaller earthquakes that follow the main shock in the same area, sometimes for months.
- **Technical:** Here: every catalogue event after the main shock; the catalogue’s own bounds are quoted in the technical layer. No declustering is applied.
- **First explained:** 6 MIN BRIEFING: 06 First hours · first-hour; FULL ANALYSIS: 06 First hours · first-hour

## Statistics

### CATALOGUE COMPLETENESS — Completeness magnitude, Mc

- **Plain:** Below a certain size, small earthquakes stop being reliably recorded and listed. Counts below it are too low.
- **Technical:** Mc estimated by maximum curvature, which is a lower bound for aftershock sequences. A sharp jump in the count at one magnitude is the signature of a reporting threshold, not of nature; the figures for this catalogue are in the technical layer.
- **First explained:** FULL ANALYSIS: 07 Seismic sequence · threshold

### b-VALUE — Gutenberg–Richter b-value

- **Plain:** How fast earthquakes get rarer as they get bigger. About 1 is typical: roughly ten times fewer for each step up in magnitude.
- **Technical:** Least-squares fit of log10 N(≥M) = a − b·M to the events above Mc; MODEL FIT, reported with its R² and the number of events used.
- **First explained:** FULL ANALYSIS: 07 Seismic sequence · law

### OMORI LAW — Modified Omori law, n(t) = K/(c + t)^p

- **Plain:** Aftershocks are most frequent right after the main shock and then fade. The p number says how fast they fade.
- **Technical:** Daily counts fitted to K/(c + t)^p before and after the 12 May M7.3; p ≈ 1 is typical. A low R² is reported as a weak fit, not hidden.
- **First explained:** FULL ANALYSIS: 08 Second major shock · decay

### 75 % QUANTILE — Upper-quartile threshold

- **Plain:** The value that only the top quarter of places exceed. “Dense” here means busier than three quarters of populated squares.
- **Technical:** Density threshold = 75th percentile of people per populated 1 km cell; computed from the data, not borrowed.
- **First explained:** 6 MIN BRIEFING: 11 High density × high shaking · hot; FULL ANALYSIS: 11 High density × high shaking · hot

### MEDIAN — The middle value

- **Plain:** Half of the cases are above it and half below. Unlike an average, a few extreme cases cannot drag it.
- **Technical:** 50th percentile of the distribution.
- **First explained:** 6 MIN BRIEFING: 30 Damage-scenario access · longer; FULL ANALYSIS: 30 Damage-scenario access · longer

### χ² TEST — Chi-square test of independence

- **Plain:** A check of whether two things could be unrelated, with the pattern just chance. Here: chance is ruled out.
- **Technical:** Pearson χ² on the intensity-band × damage-class table; with thousands of sites even a weak link gives a tiny p-value, so the strength is judged separately (Cramér’s V).
- **First explained:** glossary only (no beat shows it)

### CRAMÉR’S V — Strength of association between two categories

- **Plain:** How strong a link is, from 0 (none) to 1 (total). About 0.1–0.2 is weak.
- **Technical:** V = √(χ² / (n·(k − 1))), k = min(rows, columns). Reported with χ², degrees of freedom and p in the provenance panel.
- **First explained:** glossary only (no beat shows it)

### GINI — Gini concentration coefficient

- **Plain:** How unevenly something is spread: 0 means evenly everywhere, 1 means all in one place.
- **Technical:** Gini over occupied 1 km cells of the UNOSAT site counts; describes where damage was MAPPED, not all damage.
- **First explained:** 6 MIN BRIEFING: 16 Damage concentration · caveat; FULL ANALYSIS: 16 Damage concentration · caveat

### p-VALUE — Probability under “no link”

- **Plain:** How likely a pattern this strong would be if there were no real link. Tiny means “not chance” — not “strong”.
- **Technical:** Probability of a test statistic at least as extreme under the null hypothesis.
- **First explained:** glossary only (no beat shows it)

### R² — Coefficient of determination

- **Plain:** How well a fitted curve follows the data: 1 is a perfect fit, near 0 is a poor one.
- **Technical:** Share of variance explained by the fitted model.
- **First explained:** FULL ANALYSIS: 08 Second major shock · decay

### SPEARMAN — Spearman rank correlation

- **Plain:** Whether two rankings tend to go up together, from −1 to +1.
- **Technical:** Pearson correlation of ranks; used in the methodology for rank stability under different weights. Not stated in the briefing.
- **First explained:** glossary only (no beat shows it)

## Methods

### SHORTEST ROAD ROUTE — Dijkstra shortest path on the mapped road network

- **Plain:** For each place, the computer finds the shortest way along mapped roads to the nearest hospital — then again with the blocked roads removed.
- **Technical:** One multi-source Dijkstra outward from every listed hospital at once, over the undirected 24 Apr 2015 OSM road graph, by length; each populated 1 km cell joins at its nearest junction. Distance, not travel time: no speeds, surfaces or traffic exist for the date.
- **First explained:** 6 MIN BRIEFING: 29 Baseline access · median; FULL ANALYSIS: 29 Baseline access · median

### NETWORK PIECES — Connected components of the road graph

- **Plain:** Groups of roads you can drive between without leaving the road. When a blockage splits a group, it becomes two pieces.
- **Technical:** Weakly connected components of the main-road graph before and after removing observed blockages.
- **First explained:** 6 MIN BRIEFING: 25 Network before and after · pieces; FULL ANALYSIS: 25 Network before and after · pieces

### PARETO SET — Non-dominated districts

- **Plain:** The districts that no other district beats on every measure at once — a short list that needs no weighting choices.
- **Technical:** A district is in the set if no other is at least as high on all three criteria (exposure, distance, disruption) and higher on one.
- **First explained:** FULL ANALYSIS: 31 Rescue access pressure · pareto

### SPATIAL ASSOCIATION — Things found near each other

- **Plain:** Two things found close together. It does not show that one caused the other.
- **Technical:** Here: blockages within 50 m of a mapped landslide polygon; nearness only — neither product records a cause.
- **First explained:** FULL ANALYSIS: 23 Landslides · association

## Evidence classes

### OBSERVED — Evidence class

- **Plain:** Recorded by an instrument or an analyst — a measurement or a mapped observation, not calculated by us.
- **Technical:** Values taken as published by the source (USGS, UNOSAT, NGA, Copernicus, OSM).
- **First explained:** FULL ANALYSIS: 07 Seismic sequence · catalogue

### MODELLED — Evidence class

- **Plain:** Estimated by a scientific model rather than measured at each place (shaking, population).
- **Technical:** Values from a source’s model (ShakeMap intensity, WorldPop population).
- **First explained:** glossary only (no beat shows it)

### DERIVED — Evidence class

- **Plain:** Calculated by this analysis by combining sources — for example people inside strong shaking.
- **Technical:** Computed here from OBSERVED/MODELLED inputs with a recorded method.
- **First explained:** FULL ANALYSIS: 37 What we infer · statements

### STATISTIC — Evidence class

- **Plain:** A summary number computed from the data — a median, a share, a test result.
- **Technical:** Descriptive or inferential statistic computed here; each has a methodology record.
- **First explained:** glossary only (no beat shows it)

### MODEL FIT — Evidence class

- **Plain:** A curve fitted to the data to describe its pattern. How good the fit is, is shown too.
- **Technical:** Parameters of a fitted model (Gutenberg–Richter, Omori) with goodness of fit.
- **First explained:** glossary only (no beat shows it)

### SCENARIO — Evidence class

- **Plain:** A what-if: what the road map implies if every observed blockage held at once. Not a record of what happened.
- **Technical:** Network simulation with all observed blockages applied simultaneously; clearance dates are unknown.
- **First explained:** 6 MIN BRIEFING: 30 Damage-scenario access · blockages; FULL ANALYSIS: 30 Damage-scenario access · blockages

### OFFICIAL — Evidence class

- **Plain:** A government or UN reference list or boundary, used as published.
- **Technical:** Administrative boundaries (OCHA COD-AB) and the DOHS facility list.
- **First explained:** glossary only (no beat shows it)

### DATA GAP — Evidence class

- **Plain:** Where the data is missing or silent. A gap is not evidence that nothing happened.
- **Technical:** Places or questions no source covers; stated, not filled in.
- **First explained:** 3 MIN EXECUTIVE: 20 Observation coverage failure · no-denominator; 6 MIN BRIEFING: 20 Observation coverage failure · no-denominator; FULL ANALYSIS: 20 Observation coverage failure · no-denominator
