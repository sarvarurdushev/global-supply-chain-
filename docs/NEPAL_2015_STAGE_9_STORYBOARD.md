# Stage 9 — Storyboard: Executive Situation Briefing

NATURAL DISASTER INTELLIGENCE · EXECUTIVE SITUATION BRIEFING ·
CASE 001 — NEPAL EARTHQUAKE 2015

This is the storyboard the briefing is built from, written **before** the
presentation code. It is the design; `NEPAL_2015_EXECUTIVE_BRIEFING_SCRIPT.md`
is the beat-by-beat script generated from the implemented timeline, and the
two must agree.

Every figure quoted here was read from a committed Stage 3–5 artefact and is
cited by artefact and path. Where a scene needs a figure that does not exist
yet (the health-access and rescue analyses of Act V), the storyboard names the
analysis that must produce it and quotes **no number**. Nothing on screen may
originate in the frontend.

Contents: §1 what changes · §2 the unit of direction · §3 pacing standard ·
§4 visual grammar · §5 sound and narration · §6 controls and modes · §7 the
forty scenes · §8 run selections · §9 data status per scene · §10 vertical
slices · §11 acceptance mapping.

---

## 1. What changes, in one paragraph

The Stage 7/8 presentation is nineteen scenes, each drawn complete and then
held for a fixed **40 seconds** (`DEFAULT_HOLD_SEC.full = 40`), with the
explanation in a right-hand panel the viewer has to read. Stage 9 replaces that
with a **directed briefing**: forty short scenes, each a question, built from
about 120 narrated beats, each beat a sequence of timed actions on the map —
borders that draw themselves, callouts on leader lines anchored to real
coordinates, counters that count, charts that grow while the map highlights the
same class, a camera that moves only when the geography changes. The panel
becomes optional depth. A viewer who never touches anything must be able to
follow the argument from the map, the caption and the voice.

## 2. The unit of direction: SCENE → BEAT → ACTION

| Unit | What it is | Typical length |
| --- | --- | --- |
| **Scene** | One question the briefing answers ("Where did the shaking reach?") | 8–36 s |
| **Beat** | One narrated idea: one caption line, one voice sentence | 4–10 s |
| **Action** | One visible change, at an offset inside its beat | instant – 3 s |

A beat is never a static frame held for its narration. Every beat has at least
two actions, and the first action lands within 0.5 s of the beat starting.
Actions are data (see `src/nepal/briefing/`), in this vocabulary:

```
camera.fly  camera.orbit  camera.hold
layer.show  layer.hide  layer.filter  layer.animate
annotation.draw  annotation.remove
chart.enter  chart.update  chart.highlight
caption.show  caption.replace  caption.hide
narration.speak  audio.cue  metric.count  route.trace  timeline.seek
question.show  evidence.tag
wait.untilCameraSettled  wait.untilLayerReady  wait.minHold
```

**Waits are state, not clocks.** A beat advances when its camera has landed,
its layers are drawn, its chart animation has finished, its narration has
finished (or, with voice off, its caption's reading time has passed) **and** a
minimum readable hold has elapsed. A fixed wait is used only as the minimum
hold, never as the only condition.

## 3. The pacing standard (measurable)

| Rule | Limit | How it is measured |
| --- | --- | --- |
| Longest unchanged frame in a normal beat | ≤ 6 s | frame-difference trace of a recorded run |
| Visible actions | one every 2–5 s | action timestamps in the timeline log |
| Scene length | 8–36 s (most 12–24 s) | timeline log |
| Deliberate absorb-hold | allowed once per scene, ≤ 6 s, only after a key result | marked `hold: 'absorb'` in data |
| Camera moves | only when the geography changes; each has a stated reason (§7) | reviewed per scene |
| Charts | always enter progressively; never appear complete | chart.enter has a duration > 0 |
| Captions | revealed progressively; ≤ 2 lines, ≤ 16 words | lint on the data |
| Narration | never before its visual; a spoken figure's counter starts with it | cue offsets in data |

FULL targets about 14 minutes (§8 gives the measured budget per act).

## 4. Visual grammar

### 4.1 Three information scales

| Scale | Where | What goes there |
| --- | --- | --- |
| **ON-MAP** | anchored to coordinates | names, counts, brackets, leader-line callouts — the WHERE |
| **CINEMATIC CAPTION** | lower third, centred, max 2 lines | what the narrator is saying now — the WHAT |
| **DETAIL PANEL** | right, collapsed in PRESENT | method, limits, provenance — the HOW, on demand (I key, or a click) |

In PRESENT the scene rail is hidden and the detail panel is collapsed. The map
has the screen.

### 4.2 Annotation components

All are geo-anchored: their anchor is a longitude/latitude (and optional
height), re-projected to the screen on every rendered frame, so a callout stays
attached to its place while the camera flies. None is HTML "roughly over" the
map.

| Component | Use |
| --- | --- |
| `GeoCallout` | a titled box joined to a place by a `LeaderLine`; carries an `EvidenceTag` |
| `LeaderLine` | an elbow line from anchor to callout, drawn with a stroke animation |
| `MapLabel` | a place name set on the ground — KATHMANDU, GORKHA |
| `TargetBracket` | four corner brackets that close on a place |
| `PulseMarker` | a point with an expanding ring, for the epicentre and events |
| `AreaOutline` | a polygon edge drawn progressively along its length |
| `ArrowPath` | an arrow along a geographic path (the camera's travel, a detour) |
| `FocusRing` | a ring that contracts onto a place |
| `CountUpMetric` | a number that counts from 0 to its artefact value |
| `TypewriterCaption` | system text typed character by character |
| `EvidenceTag` | `SOURCE · CLASS` badge, coloured by result class |
| `QuestionCard` | a full-width question, before the analysis that answers it |
| `ChartCallout` | a chart anchored beside the map, performing with it |
| `BeforeAfterSwipe` | a vertical divider between two states of one view |

### 4.3 Evidence language

Every major claim carries `SOURCE · CLASS` from the existing result-class
vocabulary (OBSERVED, OFFICIAL, STATISTIC, DERIVED, MODEL FIT, ESTIMATE,
SCENARIO, DATA GAP) in its existing colours. SCENARIO results keep the
scenario band. No numeric "confidence score" is shown anywhere: confidence is
expressed as the class plus the stated limitation.

### 4.4 Text

Uppercase mono for system text and figures, Inter for captions. Allowed motion:
fade, type, count, slide, highlight. No bounce, no glitch, no shake. No
paragraph ever appears on the map.

## 5. Narration and sound

**Voice.** Web Speech API (`speechSynthesis`), zero-key default. The voice is
chosen at runtime from `getVoices()`: English, preferring a calm, lower,
documentary register (voices whose names indicate a male or lower-pitched
English voice, then any `en-GB`/`en-US` local voice), rate 0.95, pitch 0.9.
No real person is imitated or cloned and no film dialogue is used; the text is
original briefing prose. Where no voice exists (headless test browsers, some
Linux desktops) the captions carry the story alone and each beat's duration is
taken from its reading time. An adapter interface allows a licensed TTS
provider to be configured later; none is required.

**Sound.** Synthesised with the Web Audio API — no audio files, nothing to
license. Cues: `ambience` (a low filtered drone, very quiet), `lock` (a short
two-tone click when the camera settles on a target), `pulse` (a low thump with
the epicentre), `reveal` (a soft rising tone when a figure lands), `trace` (a
filtered sweep while a route draws), `hit` (a restrained low transition for a
major finding), `tick` (typewriter). Nothing plays until **BEGIN BRIEFING**.

Controls: VOICE on/off, CAPTIONS on/off, VOLUME, REPLAY NARRATION.

## 6. Controls and modes

Always visible in PRESENT, bottom centre, unobtrusive:

```
← BACK    ❚❚ PAUSE / ▶ PLAY    NEXT →    1×    VOICE  CC  VOL  ↺
```

| Key | Action |
| --- | --- |
| → | next beat, immediately; playback **continues** (a skip is not a pause) |
| ← | previous beat, immediately; playback continues |
| Space | pause / play |
| Esc or E | EXPLORE, at the exact current state |
| P | resume the presentation |
| I | provenance of the current figure |
| R | replay the current beat |

Speed 0.75× · 1× · 1.25× · 1.5×: animation durations, holds and speech rate
all scale.

Modes: **3 MIN EXECUTIVE · 6 MIN BRIEFING · FULL ANALYSIS · EXPLORE**. The
opening screen offers BEGIN BRIEFING (6 MIN by default) and the other runs.

---

## 7. The forty scenes

Format per scene: **Q** question · **OPEN** first frame · **BEATS** with
actions and offsets in seconds · **VOICE** narration draft · **MAP** ·
**CHART** · **ACT** user interaction · **RESULT** with evidence · **OUT**
transition · **CAMERA WHY**. Durations are FULL-run targets.

### ACT I — INCIDENT DETECTION

#### 01 · Incoming incident — 10 s · 2 beats
- **Q** What has happened?
- **OPEN** Black. Night-side globe, city lights off, a faint graticule.
- **BEATS**
  1. (0) `TypewriterCaption` NATURAL DISASTER INTELLIGENCE → (1.4) INCIDENT
     DETECTED in amber → (2.6) `25 APR 2015` → (3.4) `06:11 UTC`; `tick` cue.
  2. (5) LOCATING EVENT… typed; (5.5) globe brightens, begins turning toward
     South Asia; (7) `TargetBracket` opens over the Himalaya.
- **VOICE** "Twenty-fifth of April, twenty fifteen. Eleven minutes past six,
  universal time. A major earthquake is detected in South Asia."
- **RESULT** Origin time 2015-04-25 06:11:25.950 UTC — USGS · OBSERVED
  (`seismic-analysis results.mainShock.time`).
- **OUT** camera already moving into 02.
- **CAMERA WHY** a world view says "somewhere on Earth"; the turn says where.

#### 02 · Locate Nepal — 16 s · 3 beats — *vertical slice 1*
- **Q** Where on Earth is this?
- **OPEN** Globe turning toward South Asia (continued from 01).
- **BEATS**
  1. (0) camera flies Earth → South Asia → Himalaya (5 s); (1) India and China
     labelled faintly; (3.5) `lock`.
  2. (0) Nepal's border draws itself clockwise (`AreaOutline`, 3 s); (0.5)
     neighbouring land dims 35 %; (3) `LeaderLine` from Nepal's centroid to a
     `GeoCallout`: NEPAL / HIMALAYAN REGION; (4) `EvidenceTag` COD-AB ·
     OFFICIAL.
  3. (0) `MapLabel` KATHMANDU fades in at its position; (1) `PulseMarker` at the
     epicentre; (2) callout line: EPICENTRE · GORKHA DISTRICT; (3) camera
     starts its descent toward Gorkha.
- **VOICE** "The event is in Nepal — a country the length of the central
  Himalaya, between India and China." / "The capital, Kathmandu, sits in a
  valley here. The rupture began to the north-west, in Gorkha district."
- **RESULT** Epicentre 28.2305°N 84.7314°E, "67 km NNE of Bharatpur" — USGS ·
  OBSERVED. Border — COD-AB 2015 district frame · OFFICIAL.
- **ACT** click the border: country card; click Kathmandu: district card.
- **OUT** descent continues into 03.
- **CAMERA WHY** country-scale framing first, because every later place is
  named relative to Nepal and Kathmandu.

#### 03 · Administrative geography — 14 s · 3 beats
- **Q** Which places will matter?
- **OPEN** Nepal outlined, camera at ~900 km.
- **BEATS**
  1. (0) district boundaries draw progressively west→east (3 s); (0.5)
     caption SEVENTY-FIVE DISTRICTS (2015).
  2. (0) GORKHA label + `TargetBracket`; (1.5) DHADING; (3) KATHMANDU,
     LALITPUR, BHAKTAPUR as one valley bracket.
  3. (0) SINDHUPALCHOK label pulses once; (1.5) caption: REMEMBER THIS
     DISTRICT; (2.5) labels fade except the six.
- **VOICE** "Nepal was then divided into seventy-five districts. Six of them
  carry this story: Gorkha and Dhading near the epicentre, the three districts
  of the Kathmandu Valley — and Sindhupalchok, to the north-east."
- **RESULT** 75 districts — COD-AB · OFFICIAL.
- **OUT** hard cut of labels, camera settles on epicentre.
- **CAMERA WHY** no move; this scene is about names, and the frame holds while
  names arrive.

#### 04 · Main shock — 16 s · 3 beats — *vertical slice 2*
- **Q** How big was it, and how deep?
- **OPEN** Epicentre centred at ~350 km, terrain lit low.
- **BEATS**
  1. (0) `pulse` + `PulseMarker` rings ×3 from the epicentre; (0.5) `hit`.
  2. (0) `CountUpMetric` M 0.0 → **M 7.8** (1.6 s) beside the marker; (1.8)
     `EvidenceTag` USGS · OBSERVED; (2.4) DEPTH **8.2 KM** counts; (3.4) time
     06:11:25 UTC types.
  3. (0) caption: SHALLOW: THE ENERGY RELEASED CLOSE TO THE SURFACE; (1.5)
     a short vertical depth bar from the marker to 8.2 km (`ChartCallout`).
- **VOICE** "Magnitude seven point eight." / "Its focus was only about eight
  kilometres deep: the energy was released close to the surface." (No
  historical comparison is spoken — no artefact holds one.)
- **RESULT** M7.8 (mww), depth 8.22 km, 06:11:25.950 UTC, USGS us20002926 —
  OBSERVED (`results.mainShock`). Limit: current catalogue revision.
- **OUT** rings keep expanding into the shaking field of 05.
- **CAMERA WHY** a slight push-in to the point that everything radiates from.

#### 05 · Shaking expands — 20 s · 3 beats — *vertical slice 2*
- **Q** Where did the ground shake, and how hard?
- **OPEN** Epicentre, rings still expanding; camera pulls back to ~800 km.
- **BEATS**
  1. (0) camera pulls back (3 s); (0.5) ShakeMap bands grow outward from the
     epicentre, weakest last, strongest first: MMI 8 → 7.5 → 7 → 6.5 → 6
     (`layer.animate`, 4 s).
  2. (0) intensity legend builds beside the map as each band lands; (1) MMI
     scale callout: VI STRONG · VII VERY STRONG · VIII SEVERE (from the
     artefact's `meaning` per band).
  3. (0) the Kathmandu Valley bracket re-appears; (0.8) callout: KATHMANDU —
     MMI 7.5 PEAK — 2.78 M PEOPLE, ALL INSIDE MMI VI+ (`CountUpMetric`);
     `EvidenceTag` USGS ShakeMap · MODELLED / WorldPop · ESTIMATE.
- **VOICE** "Within seconds the shaking spread east along the mountains." /
  "Intensity is modelled on the Mercalli scale: six is strong, seven very
  strong, eight severe." / "It reached the Kathmandu Valley at seven and a
  half. Every one of the valley's two point seven eight million modelled
  residents was inside intensity six or stronger."
- **RESULT** Kathmandu district: max MMI 7.5; 2,779,012 exposed of 2,779,012
  (`population-exposure results.exposureAtHeadlineThreshold.districts`).
  USGS ShakeMap — a MODEL (8 closed contours, MMI 4.5–8).
- **ACT** click a band: its population at-or-above (Act II figures).
- **OUT** bands dim to 40 %; seismic events begin to appear (06).
- **CAMERA WHY** pull back because the subject grows from a point to a region.

#### 06 · First hours — 16 s · 2 beats
- **Q** Did it stop?
- **OPEN** Shaking dimmed; a clock appears top-left at T+0 h.
- **BEATS**
  1. (0) `timeline.seek` plays hours 0 → 24 over 8 s; aftershocks appear at
     their positions as their hour arrives, each with a small pulse; (0)
     `CountUpMetric` EVENTS IN FIRST 24 H 0 → **89**, driven by the same clock.
  2. (0) the M6.6 at 34 minutes and the M6.7 the next day get callouts
     (magnitude + time) as they appear.
- **VOICE** "It did not stop. Eighty-nine further earthquakes were recorded in
  the first twenty-four hours — two of them above magnitude six and a half."
- **RESULT** firstDayCount 89 (`results.temporal.firstDayCount`), USGS catalogue
  · OBSERVED; limit: only events above the network's detection threshold.
- **OUT** clock keeps running into 07.

#### 07 · Seismic sequence — 20 s · 3 beats
- **Q** How did the sequence develop?
- **OPEN** Clock at T+24 h; a daily-count chart enters bottom-left.
- **BEATS**
  1. (0) chart bars grow day by day in step with the clock (days 0–16, 5 s);
     each bar's events pulse on the map as it grows (`chart.update` +
     `layer.filter`).
  2. (0) magnitude bands chart enters; M4–5 bar grows to 270, highlighted;
     (2) caption: MOST EVENTS WERE M4–5.
  3. (0) the spatial spread: bracket from west to east, 495 km, callout
     SEQUENCE SPANS ~495 KM.
- **VOICE** "Over the next two weeks the activity decayed — as aftershock
  sequences do." / "Most events were between magnitude four and five, and they
  spread almost five hundred kilometres along the fault."
- **RESULT** 316 events; M4–5: 270; extent E–W 494.6 km (`results.magnitude`,
  `results.spatial`) · OBSERVED.
- **OUT** clock jumps forward; day 17 flashes.

#### 08 · Second major shock — 24 s · 4 beats
- **Q** Was this one sequence, or two?
- **OPEN** Clock at day 16, map east of Kathmandu.
- **BEATS**
  1. (0) clock → 12 MAY 07:05 UTC; `pulse` at the M7.3 position, 139 km east of
     the first; (1) M 7.3 counts; `hit`.
  2. (0) the daily chart's day-17 bar shoots up to 63; the map fills with the
     second cluster.
  3. (0) `QuestionCard`: CAN ONE DECAY CURVE DESCRIBE BOTH?; (2.5) the Omori
     whole-window fit draws dashed violet across the chart: p = 0.42, R² = 0.44
     — MODEL FIT.
  4. (0) the fit splits: before 12 May p = 1.07, R² = 0.72; after p = 0.25,
     R² = 0.33; caption: TWO MAIN SHOCKS — ONE CURVE DOES NOT FIT.
- **VOICE** "Seventeen days later, a second major earthquake: magnitude seven
  point three, a hundred and forty kilometres to the east." / "A single decay
  curve fitted across both describes the data poorly. Split at the second
  shock, the first sequence decays as expected — the whole-window fit was
  describing two events as one."
- **RESULT** M7.3 2015-05-12T07:05:19 UTC, depth 15 km, 139.3 km from the
  epicentre · OBSERVED. Omori whole p 0.418 R² 0.443; before p 1.065 R² 0.720;
  after p 0.253 R² 0.331 · MODEL FIT (`results.omori`).
- **OUT** events fade; population surface rises (09).
- **CAMERA WHY** a lateral pan east to the new epicentre — the geography of
  the story just changed.

### ACT II — WHO AND WHAT WAS IN THE HAZARD

#### 09 · Population distribution — 16 s · 2 beats
- **Q** Where did people live?
- **OPEN** Shaking hidden; camera over central Nepal.
- **BEATS**
  1. (0) WorldPop density rises from zero opacity west→east (3 s); (1)
     caption: MODELLED POPULATION, 2015.
  2. (0) camera glides over the Kathmandu Valley (densest), then north into
     the hills (sparse); callouts: VALLEY — up to 36,255 PEOPLE PER 1 KM CELL;
     HILLS — OFTEN FEWER THAN 50.
- **VOICE** "People were not spread evenly. The valley is dense; the hills
  around it are thinly settled — and harder to reach."
- **RESULT** densest cell 36,255 people at 85.31°E 27.73°N
  (`populationIntensityQuadrants.quadrants[0].densestCellPeople`) · ESTIMATE.
- **CAMERA WHY** a low glide from valley to hills makes density a place.

#### 10 · Population meets shaking — 22 s · 3 beats — *in first-90-s summary via 05*
- **Q** How many people were inside strong shaking?
- **OPEN** Density visible; bands return as outlines.
- **BEATS**
  1. (0) MMI VI+ region lights; `CountUpMetric` **13.84 M**; tag USGS ×
     WorldPop · DERIVED.
  2. (0) VII+ region lights, VI fades to outline; **7.45 M** counts.
  3. (0) VIII+ lights (small, around Gorkha–Dhading); **235 K** counts; caption:
     ONLY THE EPICENTRAL HILLS REACHED VIII.
- **VOICE** "Thirteen point eight million people lived where the model puts
  shaking at intensity six or stronger. Seven point four five million at seven
  or stronger. At eight — severe — two hundred and thirty-five thousand."
- **RESULT** 13,835,518 / 7,453,534 / 235,116 (`exposureTotalsByThreshold`) ·
  DERIVED (model × estimate).
- **ACT** click a threshold chip: its region and figure.
- **CAMERA WHY** hold: the thresholds change, the place does not.

#### 11 · High density × high shaking — 22 s · 3 beats
- **Q** Where did many people meet strong shaking?
- **OPEN** QuestionCard, then the map.
- **BEATS**
  1. (0) cells above MMI 6 fill (HIGH SHAKING); label.
  2. (0) cells above the density cut (134 people per cell) fill (HIGH DENSITY);
     label; tag: CUT = 75TH PERCENTILE OF POPULATED CELLS.
  3. (0) only the overlap stays lit; `CountUpMetric` **11,834,041**; caption:
     PEOPLE IN CELLS BOTH STRONGLY SHAKEN AND DENSELY SETTLED — 43.8 % OF THE
     POPULATION.
- **VOICE** "Two conditions, one map. Strong shaking. Dense settlement. Where
  both are true: eleven point eight million people — four in ten Nepalis."
- **RESULT** 11,834,041 in 18,788 cells; 43.8 %; thresholds MMI 6 and 134.1
  people per cell (`populationIntensityQuadrants`) · DERIVED. Limit: geographic
  exposure, not harm.

### ACT III — PHYSICAL DAMAGE

#### 12 · Damage evidence arrives — 18 s · 2 beats
- **Q** What did satellites see?
- **OPEN** Exposure fades; a four-date strip (26, 27, 29 Apr, 3 May) appears.
- **BEATS**
  1. (0) EvidenceTag UNOSAT · OBSERVED slides in; (1) caption: SUB-METRE
     IMAGERY, 26 APR – 3 MAY; (2) the fourteen analysis areas outline one by
     one.
  2. (0) points arrive by sensor date — 56, 778, 2,528, 1,221 — with the date
     strip advancing; counter to **4,583**.
- **VOICE** "Within a day, satellites were imaging the damage. UNOSAT mapped
  four thousand five hundred and eighty-three damaged structures across
  fourteen areas."
- **RESULT** 4,583 points; bySensorDate 56 / 778 / 2,528 / 1,221 · OBSERVED.
  Limit: damage-only, not field-validated.

#### 13 · Damage composition — 24 s · 4 beats — *vertical slice 3*
- **Q** How severe was the observed damage?
- **OPEN** All points grey; composition bar frame enters empty.
- **BEATS**
  1. (0) DESTROYED segment grows to 2,084 (1.5 s) while destroyed points turn
     red on the map; (1.5) 45.5 % types.
  2. (0) SEVERE grows to 1,347, severe points light orange, destroyed dim.
  3. (0) MODERATE 1,057, yellow. (2) POSSIBLE 95, blue.
  4. (0) all classes on; caption: THREE IN FOUR OBSERVED SITES WERE SEVERE OR
     DESTROYED.
- **VOICE** "Of the four thousand five hundred and eighty-three mapped sites,
  two thousand and eighty-four were classed as destroyed." / "One thousand
  three hundred and forty-seven severe. One thousand and fifty-seven moderate.
  Ninety-five possible."
- **RESULT** 2,084 / 1,347 / 1,057 / 95; 45.5 / 29.4 / 23.1 / 2.1 %
  (`results.unosat`) · OBSERVED. 45.5 + 29.4 = 74.9 %.
- **ACT** click a segment → only that class on the map; click a point →
  inspector.

#### 14 · Destroyed areas — 20 s · 3 beats
- **Q** Where are the destroyed sites?
- **BEATS**
  1. (0) only Destroyed visible; camera to the largest cluster (Manbu area);
     callout MANBU AREA — 1,524 POINTS.
  2. (0) camera to Daraudi valley (651) → Bhaktapur (458); bracket + count each.
  3. (0) district bar (Gorkha 1,847 … Chitawan 46) grows beside; caption: 9 OF
     75 DISTRICTS CARRY ANY UNOSAT OBSERVATION.
- **RESULT** byAnalysisArea, byDistrict (`results.unosat`) · OBSERVED.
- **CAMERA WHY** cluster-to-cluster, low, so points read as places not dots.

#### 15 · Severe and moderate — 16 s · 2 beats
- **BEATS** class stepper NEXT CLASS / PREVIOUS CLASS / ALL, auto-stepping
  Severe → Moderate → All with the map and bar in sync.
- **ACT** the stepper stays live in EXPLORE.

#### 16 · Damage concentration — 20 s · 3 beats
- **Q** Is the damage spread out or concentrated?
- **BEATS**
  1. (0) 1 km grid draws over the points; occupied cells fill: **362**.
  2. (0) cells sort by count (cells rise as columns); the top cells light until
     half the observations are covered: **37 CELLS HOLD 50 %**.
  3. (0) two example hotspots bracketed with counts.
- **RESULT** 362 occupied cells; 50 % in 37 (10.2 %); Gini 0.65
  (`spatialDistribution.grids[0]`) · STATISTIC.

#### 17 · Gorkha deep dive — 24 s · 3 beats
- **Q** What does one district look like, all layers together?
- **BEATS** descend into Gorkha with terrain; population → shaking → damage →
  roads → terrain context, each added with a caption and its tag.
- **RESULT** Gorkha: 1,847 UNOSAT points; max MMI 8; 20 blocked-road markers.
- **CAMERA WHY** the first descent into terrain: the hills are the reason
  access is hard, and this is where the audience first sees them.

#### 18 · Model versus observation — 36 s · 5 beats — *vertical slice 4*
- **Q** DID STRONGER SHAKING MEAN MORE SEVERE DAMAGE?
- **BEATS**
  1. (0) `QuestionCard` (3 s).
  2. (0) modelled bands only (MMI 7, 7.5, 8); (2) observed damage over them.
  3. (0) three stacked bars, one per band, grow class by class; (3) destroyed
     share labels: 38.7 % · 31.1 % · 55.8 %.
  4. (0) caption: THE ASSOCIATION IS DETECTABLE…; (1.5) χ² = 255.5, p ≈ 3×10⁻⁵²;
     (3) …BUT SMALL: CRAMÉR'S V = 0.167.
  5. (0) the 7.5 bar pulses — lower than 7; (1.5) inside Manbu and Sundar
     Bazar the destroyed share falls as intensity rises (55.4 → 50.8 %, 20.3 →
     14.1 %); caption: WHICH PLACES WERE IMAGED MATTERS MORE THAN THE SHAKING
     BAND.
- **VOICE** "Does stronger modelled shaking mean more severe observed damage?"
  / "The association is real — the odds of it being chance are vanishingly
  small. But it is weak: Cramér's V of zero point one seven." / "And it is not
  monotonic. At seven and a half the destroyed share falls. Inside the same
  analysis area, it falls again. The pattern is set by where satellites were
  pointed, as much as by the shaking."
- **RESULT** `damageByIntensity` · STATISTIC; selection warning stated.

#### 19 · A second observation system — 24 s · 3 beats
- **Q** Do raw counts and rates tell the same story?
- **BEATS** Copernicus AOIs outline, visually separate from UNOSAT (different
  frame colour); structures graded including undamaged (41,042); per-AOI
  destroyed RATE counters; caption: A RATE NEEDS A DENOMINATOR — ONLY
  COPERNICUS HAS ONE.
- **RESULT** 41,042 structures, 38,589 graded; 1,240 damaged, 448 destroyed;
  per-AOI rates (`results.copernicus.grades[]`) · OBSERVED / STATISTIC.

#### 20 · Observation coverage failure — 28 s · 4 beats
- **Q** ZERO DAMAGE OBSERVATIONS. ZERO DAMAGE?
- **BEATS**
  1. (0) camera travels Gorkha → Sindhupalchok (visible `ArrowPath`).
  2. (0) 65 ROAD BLOCKAGES count; (2) 23 LANDSLIDES count; (4) 0 UNOSAT DAMAGE
     POINTS — silence, `hit`, 2 s absorb.
  3. (0) `0 OBSERVATIONS ≠ 0 DAMAGE` types.
  4. (0) coverage outlines of the three products draw: UNOSAT areas miss the
     district; NGA covers it.
- **RESULT** Sindhupalchok: 65 blocked-road markers, 23 landslides, 2 bridges
  out, 0 UNOSAT points (`infrastructure distribution`, `landslides[]`,
  `unosat.byDistrict`) · OBSERVED / DATA GAP.

### ACT IV — INFRASTRUCTURE FAILURE

#### 21 · Road network before — 18 s · 2 beats
- **BEATS** trunk/primary draw first, then secondary, then tertiary; caption:
  THE MAPPED NETWORK ON 24 APRIL 2015 — 2,129 WAYS; callout: TODAY'S MAP HOLDS
  3.4× AS MANY.
- **RESULT** baseline network (`results.network.baseline`) · OBSERVED (OSM) /
  limitation stated.
- **CAMERA WHY** pull up: network structure only reads from altitude.

#### 22 · Road blockages — 20 s · 3 beats
- **BEATS** 179 markers arrive by district; the 21 matched to the network
  within 25 m snap to their edge with a short connector; caption: A MARKER IS A
  PLACE AN ANALYST SAW A BLOCKAGE — MEDIAN 65 M.
- **ACT** click → inspector: source, length, nearest road + class, nearest
  landslide, district, MMI, class.
- **RESULT** 179 markers, 19.9 km, median 65 m; 21 of 184 matched at 25 m ·
  OBSERVED / DERIVED.

#### 23 · Landslides — 20 s · 2 beats
- **BEATS** 51 landslide polygons grow; three examples next to blocked roads
  get leader lines with their measured distance; association curve drawn.
- **RESULT** `landslideRoadAssociation` (headline tolerance 50 m) · DERIVED.

#### 24 · Bridges — 22 s · 3 beats
- **BEATS** 5 bridge-out records one by one; zoom to the one on the network;
  caption: ONLY ONE OF FIVE SITS ON THE MAPPED STRATEGIC NETWORK; its removal
  splits the network: 40 → 41 components.
- **RESULT** `network.bridgesOnly` · SCENARIO.

#### 25 · Network before vs damage scenario — 26 s · 3 beats
- **BEATS** `BeforeAfterSwipe` BASELINE ↔ DAMAGE SCENARIO; the 10 disabled
  edges fade out; components recolour; 40 → 49 components (+9).
- **ACT** drag the swipe; toggle.
- **RESULT** `network.damaged` · SCENARIO.

#### 26 · Route reconstruction — 28 s · 4 beats
- **Q** IF THESE ROADS ARE CLOSED, HOW DOES A JOURNEY CHANGE?
- **BEATS** the one detoured Kathmandu pair: baseline path traces; the closed
  edge flashes and erases; the alternative traces; `CountUpMetric` +km (the
  artefact's extraKm); caption: DISTANCE, NOT TIME — NO 2015 ROAD SPEEDS EXIST.
- **RESULT** 14 pairs: 8 unchanged, 5 not routable at baseline, 1 detour
  (`network.routes`) · SCENARIO.

### ACT V — HEALTHCARE AND RESCUE ACCESS

All figures in this act come from the Stage 9 health-access artefact
(`data/analysis/nepal-2015-health-access.json`), built by the pipeline from the
sources below. **None is quoted here**: they do not exist until it runs.

#### 27 · Health facility data — 18 s · 2 beats
- **Q** What health facilities existed in April 2015?
- **BEATS** source card types in: NEPAL HEALTH FACILITIES (COD) · DoHS/WHO,
  SURVEY DEPARTMENT · **COMPILED BY 21 SEP 2010** · OFFICIAL; facilities appear
  by type (hospital first).
- **CORRECTION (found at ingest).** HDX lists this dataset with a 2015 date,
  but the file's own metadata says it was created on 2010-09-21. It is the
  most recent official list openly available, and it is labelled 2010
  everywhere it is used. The OpenStreetMap facilities as mapped on 2015-04-24
  are run alongside it and the two are compared, not merged.
- **RESULT** facility inventory, counts by type · OFFICIAL. If a type or date
  is not verifiable, the card says so.

#### 28 · Facility map — 20 s · 3 beats
- **BEATS** hospitals as distinct symbols, lower tiers smaller; three
  hospitals nearest the damage clusters get callouts (name, type, source date).
- **ACT** click any facility → inspector: name, type, source, date, nearby
  population, baseline network distance, scenario distance, distance to the
  selected damage cluster. **No capacity is shown** — none exists in the data.

#### 29 · Baseline accessibility — 24 s · 3 beats
- **Q** How far was the nearest hospital by road, before the earthquake?
- **BEATS** network distance surface from populated cells / damage clusters
  to the nearest mapped hospital builds outward from each hospital; callouts
  at the worst-served clusters. Tag DERIVED; caption: NETWORK DISTANCE —
  NOT TRAVEL TIME.

#### 30 · Damage-scenario health access — 26 s · 3 beats — *vertical slice 5*
- **BEATS** BEFORE ↔ DAMAGE SCENARIO swipe over the same surface; cells
  recolour into: SIMILAR · LONGER · DIFFERENT FACILITY · DISCONNECTED IN MODEL;
  counts per category count up. Tag SCENARIO.

#### 31 · Rescue access pressure — 28 s · 4 beats
- **Q** WHICH PLACES COMBINE HIGH NEED WITH POOR MODELLED ACCESS?
- **BEATS** need axis (exposure MMI VII+, observed damage, landslide proximity)
  vs access axis (hospital network distance, isolation, redundancy) as a
  scatter; the Pareto front lights; the same places light on the map; rank
  stability across three weightings shown as a band.
- **RESULT** DERIVED / SCENARIO. Not a historical rescue priority.

#### 32 · Rescue route interaction — 26 s · 4 beats — *vertical slice 5*
- **BEATS** DAMAGE CLUSTER (bracket) → POPULATION CONTEXT (counter) → NEAREST
  HEALTH FACILITY (callout) → BASELINE ROUTE (trace) → ROAD DISRUPTION
  SCENARIO (edges fade) → ALTERNATIVE ROUTE (trace) or NO ROUTE IN MODELED
  NETWORK → ACCESS CONSEQUENCE (+km, or next reachable facility).
- **ACT** choose cluster and facility; the chain recomputes from the
  artefact's precomputed graph.

#### 33 · Bridge failure what-if — 22 s · 3 beats
- **BEATS** BRIDGE ACTIVE ↔ BRIDGE UNAVAILABLE toggle on the map; components
  and the facilities each side can reach recolour. SCENARIO.

#### 34 · Humanitarian logistics / response options — 24 s · 3 beats
- **BEATS** usable trunk routes in the scenario; network-constrained districts;
  airfields and heliports as CURRENT CONTEXT (OurAirports) where no 2015 list
  exists. No helicopters, teams, capacities or times are invented. SCENARIO.

### ACT VI — SYNTHESIS

#### 35 · Four clocks — 18 s · 3 beats
- **BEATS** four timelines run in parallel: earthquake (25 Apr) → imagery
  (26 Apr – 7 May) → mapping (to 7 May) → publication; the gaps are the story.
- **RESULT** `results.observationTimeline` · OBSERVED.

#### 36–39 · What we know / infer / simulate / do not know — 14–16 s each
Each is one screen per class: the statements of that class animate on, each
with its source; DATA GAP items include road speeds, a DEM for slope, which
roads were checked, reopening dates, a settlement gazetteer, facility capacity.

#### 40 · Executive summary — 40 s · 6 beats
- Rapid replay of the geography, 3 s per stop: EPICENTRE → HIGH EXPOSURE →
  DAMAGE CLUSTERS → ROAD DISRUPTION → COVERAGE GAP → HEALTH ACCESS → NETWORK
  SCENARIO; then the conclusions one at a time, each with its class.

---

## 8. Run selections (targets; measured times are in the Stage 9 report)

| Run | Scenes | Target |
| --- | --- | --- |
| **FULL ANALYSIS** | 01–40, all beats | ~14 min |
| **6 MIN BRIEFING** | 01 02 04 05 06 08 10 11 13 16 18 20 25 26 29 30 32 39 40 (key beats) | ~6 min |
| **3 MIN EXECUTIVE** | 01 02 04 05 10 13 18 20 26 30 40 (one or two beats each) | ~3 min |

## 9. Data status per scene

| Scenes | Status |
| --- | --- |
| 01–26, 35–39 | **Existing artefacts** — every figure above is in Stage 3–5 output |
| 17 (terrain) | Terrain provider must be verified (keyless terrain in the app; Copernicus DEM GLO-30 identified in the inventory) |
| 27–28 | **Acquired**: HDX `nepal-health-facilities-cod` (DoHS/WHO, Survey Department) — file compiled by 2010-09-21 despite HDX's 2015 date; HumanitarianResponse.info legacy terms, non-commercial (`pipelines/ingest/health-facilities-dohs.mjs`). Plus OpenStreetMap facilities and roads as at 2015-04-24 (`pipelines/ingest/osm-access-2015.mjs`, ODbL) |
| 29–33 | **Analysed**: `pipelines/analyse/health-access.mjs` → `data/analysis/nepal-2015-health-access.json` — network distance to hospitals before and after the observed blockages, change categories with sensitivity, Pareto pressure with weighting sensitivity, bridge what-if, list agreement, two rule-chosen example routes |
| 34 | OurAirports as CURRENT CONTEXT only |
| 12 (Landsat swipe, optional) | 2015-03-29 / 2015-06-01 Landsat 8 pair identified, not ingested; landscape-scale only |

## 10. Vertical slices (built first, to final quality)

1. Scenes 01–02 — incoming incident, locate Nepal, border annotation.
2. Scenes 04–05 — main shock and shaking field.
3. Scene 13 — damage composition with map/chart synchronisation.
4. Scene 18 — model versus observation.
5. Scenes 30–32 — rescue route, baseline versus damage scenario.

Each is recorded in Chromium and reviewed against §3 before any other scene
is built.

## 11. Acceptance mapping

| Test | Where it is met |
| --- | --- |
| First 90 seconds | 01 → 06 in FULL reach 88 s: incident, location, border, epicentre, magnitude, depth, shaking field, the Kathmandu population inside it (05 b3), aftershock development (06) |
| No reading required | caption + map carry every beat; the panel is collapsed throughout |
| Skip everything | NEXT/BACK act on beats immediately and never pause the run |
| Interactivity | inspector for earthquake, district, damage point, road, blockage, bridge, landslide, facility, route, chart element |
| Rescue chain | scene 32 |
| Executive summary | scene 40 answers the thirteen questions of the brief |
