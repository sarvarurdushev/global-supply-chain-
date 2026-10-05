# Nepal 2015 briefing — analysis explanation audit (Stage 9.2)

One record per analysis the briefing presents. Each answers the five questions every
analysis must answer on screen or in the voice:

1. **Looking at** — what is on the map or chart?
2. **How** — how was it calculated or observed?
3. **Found** — the result.
4. **Means** — what it means, in plain language (the `WHAT THIS MEANS` kicker where the
   meaning is a beat of its own).
5. **Cannot conclude** — the limitation (`WHAT IT CANNOT TELL US` where it is a beat).

The verdict is the test from the brief: after the beat, can a viewer answer *"What did I
just learn?"* **FAIL (9.1)** marks a record that failed in the Stage 9.1 build and what
was changed; **PASS** is the 9.2 state, checked against the stills and the rendered
voice. Level 2 (the precise method) is in the technical layer (`TECH` / `I`) for every
scene marked *T2*. Runs: 3 = three-minute, 6 = six-minute, F = full.

Figures below are quoted from the artefacts through the fact book; none was recalculated.

---

### 04 · Main shock — magnitude and depth (3 · 6 · F) · OBSERVED · T2

- **Looking at:** the epicentre, a counter for the magnitude, another for the depth.
- **How:** the USGS reviewed solution (term chips: *MAGNITUDE (M)*, *FOCAL DEPTH*).
- **Found:** magnitude 7.8, 8.2 km deep.
- **Means:** "The energy was released close to the surface" — a very large and shallow
  earthquake, which shakes the surface hard.
- **Cannot conclude:** depth carries several kilometres of uncertainty (T2).
- **Verdict:** PASS. FAIL (9.1): "magnitude" was never defined; the chip now says it is one
  number for the whole event and each step is about 32 times the energy.

### 05 · Shaking intensity (3 · 6 · F) · MODELLED · T2

- **Looking at:** coloured bands of modelled shaking over Nepal, and a legend.
- **How:** USGS ShakeMap, a model built from the recordings (chip *SHAKEMAP*; tag MODELLED).
- **Found:** the strongest shaking ran east along the mountains; Kathmandu reached 7.5.
- **Means:** "These colours are intensity: how hard the ground shook at each place. Not
  magnitude, which is one number for the whole earthquake." Six is strong, eight severe —
  each level lights on the map and the legend as it is named.
- **Cannot conclude:** intensity is modelled, not surveyed at each place.
- **Verdict:** PASS. FAIL (9.1): the scale beat was a list of numerals ("Six is strong.
  Seven, very strong…") with no statement of what the colours are; magnitude and intensity
  were easy to confuse. Fixed with the card *MAGNITUDE 7.8 · ONE NUMBER FOR THE EARTHQUAKE /
  INTENSITY · DIFFERENT AT EVERY PLACE* and the *MAGNITUDE ≠ INTENSITY* chip.

### 06 · First hours (6 · F) · OBSERVED · T2

- **Looking at:** aftershocks appearing on the map as a clock runs: DAY 0 · +n MIN, then
  +n H.
- **How:** USGS catalogue events counted by hour (chip *AFTERSHOCK*).
- **Found:** 21 more earthquakes in the first hour; 89 by the end of the first day.
- **Means:** "The ground did not settle."
- **Cannot conclude:** small events are under-recorded (explained in 07).
- **Verdict:** PASS.

### 07 · Seismic sequence — magnitude and depth distributions (F) · OBSERVED / STATISTIC / MODEL FIT · T2

- **Looking at:** a bar chart of earthquakes by magnitude, each bar labelled by its exact
  edges (`2.5 ≤ M < 4.0` … `M ≥ 7.0`); then by depth (`10 ≤ DEPTH < 20 KM`).
- **How:** the USGS catalogue for the year after the main shock (316 events, main shock
  included; its bounds are quoted in T2). Bars count `min ≤ M < max`: the lower edge is in,
  the upper edge goes to the next bar — said in the voice, written on the card.
- **Found:** 270 between magnitude 4.0 and 5.0; 289 between 10 and 20 km deep;
  b-value 0.80 (R² 0.97).
- **Means:** "So the ground kept moving for months: hundreds of moderate, shallow shocks
  under the same mountains."
- **Cannot conclude:** below magnitude 4.0 the catalogue is incomplete — the count per 0.1
  step jumps 20.5× at M4.0, a reporting threshold — so the first bar is a floor, not a
  count (`WHAT IT CANNOT TELL US`, chip *CATALOGUE COMPLETENESS*).
- **Verdict:** PASS. FAIL (9.1): bars were labelled "M4-5" with no edge rule, "M" was never
  expanded, "complete above magnitude 4.0" was said without saying what it meant for the
  chart.

### 08 · Second major shock and the decay (6 · F) · OBSERVED / MODEL FIT · T2

- **Looking at:** the clock card runs from day 1 to 12 May; earlier events dim, new ones
  arrive bright, the M7.3 rings and is labelled `M7.3 · 12 MAY`.
- **How:** USGS events in time order; the decay fitted with the Omori law (F; chips *OMORI
  LAW*, *R²*).
- **Found:** a magnitude 7.3, 17 days after the first, east of it. Before it the
  aftershocks faded at the usual rate (p 1.07); after it far more slowly, and the curve fits
  poorly (R² 0.33).
- **Means:** "So this was not one event. It was a sequence, and it was not over."
- **Cannot conclude:** a weak fit is reported as one; the Omori numbers describe, they do
  not forecast.
- **Verdict:** PASS. FAIL (9.1): the timeline jumped from day 1 to day 7 invisibly between
  scenes, and "17 days later" was only a phrase. Now the passage of time is on screen and
  the date arrives as it is said (`qa-briefing-sync`: 0.0 s apart).

### 10 · Population meets shaking (3 · 6 · F) · DERIVED · T2

- **Looking at:** dots of modelled population, then the strong-shaking bands laid over them.
- **How:** WorldPop 2015 population summed inside ShakeMap contours (chip *WORLDPOP*:
  modelled, not counted).
- **Found:** 13.8 million inside modelled intensity six or stronger.
- **Means:** said directly — this many people were inside strong shaking.
- **Cannot conclude:** exposure is not harm; both inputs are models.
- **Verdict:** PASS.

### 11 · High density × high shaking (6 · F) · DERIVED / STATISTIC · T2

- **Looking at:** only the squares that are both dense and strongly shaken stay lit; the
  rest recedes (focus).
- **How:** dense = above the 75th percentile of populated squares (chip *75 % QUANTILE*);
  strong = modelled MMI 6+.
- **Found:** 11.8 million people, 44 % of everyone in the area analysed; the densest square
  kilometre held about 36,000 (F).
- **Means:** where the most people met the strongest shaking — the Kathmandu Valley.
- **Cannot conclude:** the cut-off is a choice (stated, from the data, not borrowed).
- **Verdict:** PASS. FAIL (9.1): "44 percent of everyone here" — *here* was undefined; now
  "of everyone in the area analysed".

### 12 · Damage evidence arrives (F) · STATISTIC

- **Looking at:** damage appearing image date by image date; a clock card running from the
  earthquake to the median image day, then to the last.
- **Found:** first image day 1, median wait 4 days.
- **Means:** "So a damage map is also a map of when someone could look."
- **Verdict:** PASS. FAIL (9.1): the lag card held still for five seconds (the weak point
  named in 9.1). The wait is now something to watch.

### 13 · Damage composition (3 · 6 · F) · OBSERVED · T2

- **Looking at:** damage sites by class on the map and a composition chart.
- **How:** UNOSAT read damage from satellite images (chip *UNOSAT*).
- **Found:** 4,583 sites mapped; 2,084 destroyed (45.5 %), 1,347 severe (29.4 %).
- **Means:** "So where analysts found damage, most of it was the worst kind."
- **Cannot conclude:** shares of *mapped* damage, not of all buildings — the chart's
  verdict and the DAMAGE-ONLY RECORD callout say so.
- **Verdict:** PASS.

### 16 · Damage concentration (6 · F) · STATISTIC · T2

- **Looking at:** one-kilometre squares holding mapped damage; the busiest light up.
- **Found:** every site in 362 squares; half of them in 37.
- **Means:** "The mapped damage is piled up, not spread out."
- **Cannot conclude:** "But that is where analysts looked. It is not a map of all the
  damage." (`WHAT IT CANNOT TELL US`; chip *GINI*.)
- **Verdict:** PASS. FAIL (9.1): the result had no plain statement; the viewer was left
  with "37" and no reading of it.

### 18 · Model versus observation (3 · 6 · F) · STATISTIC · T2

- **Looking at:** the three strongest modelled bands, the damage inside each, and a chart of
  the destroyed share per band.
- **How:** a χ² test of independence and Cramér's V (chips *p-VALUE* then *CRAMÉR'S V*).
- **Found:** the link is real (chance cannot explain it) but weak (V 0.17), and not a
  straight line: at 7.5 the destroyed share drops, inside single areas too.
- **Means:** "So shaking alone does not decide the damage. Where the satellites looked
  shapes this record as much."
- **Cannot conclude (F):** building type, local ground and distance to the rupture probably
  matter — stated as **hypotheses** on a card that separates *MEASURED* from *HYPOTHESIS*,
  because this data has no building or soil records.
- **Verdict:** PASS. FAIL (9.1): the hardest analysis ended on the statistic; "Cramér's V"
  was unexplained and the meaning was folded into a 13.8-second beat.

### 19 · A second observation system (F) · OBSERVED

- Copernicus graded every structure in its areas (chip *COPERNICUS EMS*), giving the
  denominator UNOSAT lacks: in its Kathmandu area 183 destroyed of 958 graded. PASS.

### 20 · Coverage gap (3 · 6 · F) · DATA GAP · T2

- **Looking at:** populated squares with no damage record at all; one is bracketed.
- **Found:** 4.9 million people lived in the more populated squares with no record.
- **Means:** "No record is not no damage. The product lists only what it found, not where it
  looked." (`WHAT THIS MEANS`; chip *DATA GAP*.)
- **Then:** the one mid-run `SO FAR` — millions in strong shaking, damage in tight clusters,
  a large blind spot — and the next question: could help still get through?
- **Verdict:** PASS.

### 22–24 · Blockages, landslides, bridges (F) · OBSERVED / DERIVED

- A blockage marker says where a road was cut, not how much road was lost
  (`WHAT THIS MEANS`). 17 blockages lie within 50 m of a landslide: a link in space, not a
  cause (`WHAT IT CANNOT TELL US`; chip *SPATIAL ASSOCIATION*). PASS.

### 25 · Network before and after (6 · F) · SCENARIO · T2

- **Looking at:** main roads, the observed blockages (chip *NGA*), the network splitting.
- **Found:** 184 blockages, only 21 on a main road; 40 pieces become 49 (chip *NETWORK
  PIECES*).
- **Means:** "Some places lost their main-road link to the rest."
- **Cannot conclude:** every blockage applied at once; clearance dates unknown (T2).
- **Verdict:** PASS. FAIL (9.1): "pieces" was undefined and no consequence was stated.

### 26 · District routes (3 · 6 · F) · SCENARIO · T2

- **Found:** 8 unchanged, 1 detour, 5 with no main-road route even before.
- **Means:** "The bigger gaps were older than the earthquake."
- **Verdict:** PASS.

### 29 · Baseline access (6 · F) · DERIVED · T2

- **How:** a shortest-route search along mapped roads from every listed hospital (chip
  *SHORTEST ROAD ROUTE*); roads as mapped the day before (chip *OSM*); hospitals from the
  2010 government list (chip *DOHS*).
- **Found:** 19 % of people lived more than 2 km from any mapped road; for the rest, the
  median distance to a hospital was 7.5 km of road.
- **Cannot conclude:** road distance, not travel time ("DISTANCE · NOT TIME").
- **Verdict:** PASS.

### 30 · Damage-scenario access (3 · 6 · F) · SCENARIO · T2

- **How:** the same search with every observed blockage applied (chip *SCENARIO*).
- **Found:** 86 thousand people lose every mapped road to a hospital; 42 thousand face a
  longer route (median +3.7 km, chip *MEDIAN*); for 93 % nothing changed.
- **Means:** "So the bigger gap was the map itself. Around Manbu, 1,524 damaged sites had no
  mapped road to a hospital, even before the earthquake." (`WHAT THIS MEANS`; the
  routing network recedes so the no-route places dominate.)
- **Verdict:** PASS. FAIL (9.1): "From the 11 named damage areas, 0 routes changed" was
  spoken without context; it is now on the card, and the voice says the meaning.

### 31 · Rescue access pressure (F) · DERIVED

- Seven districts are beaten on all three measures by no other (chip *PARETO SET*); only
  Ramechhap and Sindhuli stay in the top five under every weighting (`WHAT THIS MEANS`).
  A comparison of conditions, not a record of need. PASS.

### 32 · A route, before and after (6 · F) · SCENARIO · T2

- **Looking at:** one square kilometre in Sindhuli, its nearest hospitals, the route the
  roads allowed before, the blockage observed on 4 May, the search over what still connects.
- **Found:** "One blockage cut this place off from every mapped hospital."
- **Cannot conclude:** "Unmapped tracks may exist; air access is not modelled." How the
  place was chosen is in T2 (the most populous cell that lost its last route — chosen by the
  pipeline, not by hand).
- **Verdict:** PASS.

### 33–35 · Bridge what-if, landing places, four clocks (F)

- Removing one bridge cuts 14,476 people off every mapped road to a hospital (chip
  *SCENARIO*). Landing places are places an aircraft could land, not a record of any flight
  (`WHAT IT CANNOT TELL US`). Layers were published a median 12 days after the earthquake:
  "a response runs on the clock of its data" (`WHAT THIS MEANS`). PASS.

### 36–40 · Known, inferred, simulated, unknown; executive summary

- The three classes are named with their chips (*OBSERVED*, *DERIVED*, *SCENARIO*) and the
  unknowns as a limitation beat. The summary restates seven findings and closes on what is
  still unknown: travel times, hospital capacity, and where nothing was found. PASS.

---

## Summary

Counted from the timeline (`planRun`, `lifecycle.js`, `docs/NEPAL_2015_GLOSSARY.md`):

| Run | Terms explained on first use | `WHAT THIS MEANS` beats | `WHAT IT CANNOT TELL US` beats | `SO FAR` | Scenes with a Level-2 method note |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3 MIN | 10 | 3 | 0 | 0 | 8 |
| 6 MIN | 21 | 5 | 1 | 1 | 14 |
| FULL | 31 | 12 | 9 | 1 | 16 |

In 9.1 every one of these counts was zero: no term was defined on screen, and meaning and
limitation, where present, were folded into result lines with nothing to mark them.
Records marked FAIL (9.1) above: 10 of 22. Records failing "What did I just learn?" in
9.2: none. In the 6 MIN run the limitation of most analyses is carried inside its result
or meaning line (for example "Road distance, not travel time"), not as a separate beat,
to keep the run near six minutes.
