# Stage 9 — Executive disaster intelligence: report

Stage 8's presentation was measured before anything was rebuilt
([audit](NEPAL_2015_STAGE_9_CURRENT_EXPERIENCE_AUDIT.md)): 21 beats over
840 s, a median of **39 s without any visible change**, and the camera moving
for 6 % of the run. NEXT paused the presentation. Stage 9 replaces it with a
directed briefing — scene → beat → action on one clock — and adds the health
access analysis the rescue act needed, an inspector for EXPLORE, and a set of
acceptance tests that drive the real controls in a browser.

Every number below was measured on the code at the commit that adds this
report, unless it says otherwise.

---

## 1. NEW DATA

All through the pipeline, registered in `data/registry/`, licensed in
[DATA_LICENSE_MATRIX.md](DATA_LICENSE_MATRIX.md) (encumbrances #7 and #8).

| Dataset | What it is | As of | Size | Notes |
|---|---|---|---|---|
| OSM access network (`nepal-2015-osm-access-network.json`) | Every road way in the study envelope, as a routable graph | **24 Apr 2015** (attic snapshot, the day before the earthquake) | 30,337 ways · 50,947 nodes · 62,583 edges · 19,911 km | ODbL. 369 components; the largest holds 95 %. |
| OSM health facilities (`nepal-2015-osm-health-facilities.json`) | Hospitals, clinics, health posts mapped by then | 24 Apr 2015 | 724 facilities (343 hospitals in the envelope) | ODbL. Run *beside* the government list to show where they differ. |
| DoHS / WHO facility list (`nepal-2010-health-facilities-dohs.json`) | The government list of health facilities | **compiled 21 Sep 2010** | 38 hospitals · 66 primary · 1,348 health posts in the envelope | Non-commercial licence. The vintage is stated on every screen that uses it; it is never presented as a 2015 list. |
| OSM 2015 aerodromes and helipads | Landing sites mapped by 24 Apr 2015 | 24 Apr 2015 | 17 aerodromes · 45 helipads | Shown as context only. OurAirports was *not* used: its records carry no 2015 state. |

Not acquired, and why, is recorded in the access artefact's `dataGaps`:
road speeds and surface condition for April 2015; hospital capacity (beds,
theatres, staff, damage to the hospital itself); a facility list current in
April 2015; helicopter tasking; when each blockage cleared.

## 2. NEW ANALYSES

**`data/analysis/nepal-2015-health-access.json`** — `pipelines/analyse/health-access.mjs`,
engine in `src/nepal/access/` (tested). Five methodology records, six
validation checks, all passing.

- **Hospital distance, before and after.** Multi-source Dijkstra from every
  populated 1 km cell (WorldPop 2015) to its nearest hospital along roads
  mapped on 24 Apr 2015; then again with every observed NGA blockage removed
  from the network. Distance only — there is no 2015 speed data, so no time.
- **Blockage matching.** 184 observed blockages (179 roads, 5 bridges) matched
  to the full network with the Stage 5 matcher: **54 at 25 m** (the knee of the
  curve; 100 m ceiling). The Stage 5 major-roads network matched 21.
- **Categories per cell:** SIMILAR, LONGER, DIFFERENT FACILITY, DISCONNECTED,
  NO BASELINE PATH, with sensitivity to the snap and similarity thresholds.
- **Headline:** of 9,781,313 people in the envelope, **1,839,332 (18.8 %) had
  no mapped road within 2 km before any damage**. Of the road-connected,
  **92.6 % SIMILAR**, **85,783 DISCONNECTED** (1.1 %), 31,885 LONGER, 10,296
  DIFFERENT FACILITY; 459,646 had no road route to any hospital even before.
  Median distance 7.45 km, unchanged.
- **By district**, with a 90 % coverage floor; **most disrupted:** Sindhuli
  70.1 %, Okhaldhunga 24.2 %, Rasuwa 15.5 %, Nuwakot 14.6 %, Ramechhap 12.2 %.
- **Pressure, without a secret score.** A Pareto front over need and access
  measures (no weights), and four explicit weighting schemes to show how much
  any order depends on them. Stable in the top five under every scheme:
  **Ramechhap, Sindhuli**. Labelled everywhere as a place to start, not a
  priority list.
- **Example routes, chosen by rule in the pipeline:** the most populous cell
  that lost every route (Sindhuli, 669 people, 49.13 km to Dhulikhel before,
  cut on 4 May 2015) and a typical detour (Okhaldhunga, 8.8 → 14.0 km).
- **Bridge what-ifs:** bridge-1 alone cuts 14,476 people off; bridge-4 alone
  lengthens routes for 14,930. The other three bridges are on no mapped road.
- **List agreement:** 38 government-list hospitals against 343 OSM hospitals;
  the lists are compared, not merged.

**`data/analysis/nepal-2015-briefing-geometry.json`** — drawing geometry for the
briefing (outline, districts, shaking bands, roads, population blocks, the
1 km damage grid) and, new at the end of this stage, a `summary` block that
*selects* — never computes — the executive summary's plain answers: the
districts at the highest published ShakeMap contour (Dhading, Gorkha,
Lamjung, Nuwakot, Rasuwa, Sindhupalchok), the three analysis areas with the
most mapped damage, and the NGA observation counts. Eight checks, all
passing, including one that the counts equal those the Stage 5
infrastructure analysis worked from.

Stage 3–5 artefacts and their numbers are unchanged.

## 3. CINEMATIC SYSTEM

- **One clock.** Every action, caption word, count-up, camera flight and
  sound cue runs on the briefing clock (`src/nepal/briefing/clock.js`), so
  PAUSE freezes all of it at once and the speeds (0.75×, 1×, 1.25×, 1.5×)
  scale all of it together.
- **Director** (`director.js`, 12 tests). NEXT and BACK move on the press and
  keep playing; a jump rebuilds the scene's earlier beats instantly
  (`priorBeats`), so a skip lands in the right state. While paused, a jumped-to
  beat is shown whole — caption included (fixed this stage: it used to show
  one word, because captions type on the stopped clock). Played forward over a
  beat a shorter run leaves out, only that beat's lasting state is applied — no
  camera snap back through earlier views, no flash of a card the next beat
  removes (fixed this stage). The last beat a run plays in each scene holds its
  final picture at least 1.5 s before the cut (added after the recording
  showed the M7.3 aftershock figure landing 0.3 s before its scene ended).
- **Annotation engine** (`overlay.js`): outline, mask, bands, points, network
  (radial reveal with view culling), marks, events, pulse, bracket, trace,
  graticule, callout, label, metric (count-up), question, typed cards, panels,
  evidence tags — all anchored to geography and re-projected every frame.
- **Charts performed on the map** (`charts.js`): bars, ranks, legends, drawn
  and updated as beats.
- **Camera** (`flight.js`, tested): every move is an action with a reason in
  the script — each flight goes *to* the thing the next line talks about.
- **Narration:** Web Speech, choosing among generic system voices; no voice
  imitates a real person and every line is original briefing prose. With no
  voice (headless, some Linux desktops), beats are timed by caption reading
  time and the captions carry the story.
- **Sound:** synthesised with Web Audio (no samples), unlocked only by the
  BEGIN gesture.
- **Facts registry** (`facts.js`): every figure on screen or in narration is a
  `{fact.path|format}` template resolved against an artefact, carrying its
  source, evidence class and methodology record. Formats change units, never
  values. A test fails if any caption or narration types a digit.
- **Timeline lint** (`lintTimeline`): at least two visible actions per beat,
  the first within 500 ms, no still stretch over 6 s, captions ≤ 16 words and
  110 characters. **All 106 beats pass.**
- **The script is generated** from the scenes and the artefacts
  ([NEPAL_2015_EXECUTIVE_BRIEFING_SCRIPT.md](NEPAL_2015_EXECUTIVE_BRIEFING_SCRIPT.md));
  a test fails if the committed script drifts from the code.

## 4. STORY

Six acts, **40 scenes, 106 beats** — see the
[storyboard](NEPAL_2015_STAGE_9_STORYBOARD.md) and the generated script.
I Incident detection (01–08) · II Who and what was in the hazard (09–11) ·
III Physical damage (12–20) · IV Infrastructure failure (21–26) ·
V Healthcare and rescue access (27–34) · VI Synthesis (35–40). Every scene opens on a question; the summary closes
on what is known, what is inferred, what is simulated and what is not known.

## 5–7. RUNTIMES

Estimated from the timeline: voiced at the narration rate, silent at caption
reading time. Both include the hold each scene's last beat now gets, so the
figure that lands last stays on screen at least 1.5 s before the cut. The
recorder drives the same clock at silent pace. Recorded scene lengths come out
slightly longer than estimated, because a beat also waits for its slowest
action; for example, damage-scenario access recorded at 28.5 s against 26.2 s
estimated before the scene-end hold existed.

| Run | Scenes | Beats | Voiced | Silent |
|---|---:|---:|---:|---:|
| **FULL** | 40 | 105 | **13:32** | 10:46 |
| **6 MIN** | 19 | 54 | **6:45** | 5:24 |
| **3 MIN** | 11 | 25 | **3:12** | 2:22 |

Two beats were moved out of the shorter runs to hold them near their names:
the not-monotonic reversal leaves 3 MIN (the finding — real but weak — stays),
and the summary's gap beat leaves 3 and 6 MIN (the damage card carries the
limitation). 6 MIN is still 45 s over its name when voiced; silent, it is
under.

Pacing: **the longest a beat holds still is 5.8 s** voiced (1.9 s silent), by
the timeline. Stage 8 measured a median of 39.3 s.

Scene length is less even than the brief's 15–35 s: 22 of 40 scenes are in
that range in FULL, 8 of 19 in 6 MIN, 3 of 11 in 3 MIN. The shorter runs
condense scenes to one or two beats (5–14 s). Four dense scenes run past
35 s voiced: the executive summary (55 s in 3 and 6 MIN, 63 s in FULL), the
rescue route (49 s), model versus observation (42 s) and damage-scenario
access (41 s). Their beats still change every few seconds; splitting them
would take the story past 40 scenes.

## 8. INTERACTION

**§32 skip everything** — `scripts/qa-briefing-skip.mjs`, driving the real
buttons and keys against a production build (6 MIN run). **15 / 15 passed**,
re-run on the final build:

| Check | Result |
|---|---|
| NEXT advances on the press, 12 presses in a row | index +1 each time |
| New caption on screen after NEXT | on the **next drawn frame**, every one of 12 presses. Here a frame takes 1.0–1.7 s, so 0.1–3.1 s of wall time, never more than one frame |
| Three NEXT presses in one tick | exactly +3 |
| BACK twice | exactly −2 |
| PAUSE | clock frozen (identical reading 2.5 s apart) |
| Same beat by NEXT, by BACK, by a jump | same 10 objects drawn, same caption, same camera |
| PLAY after pause | resumes; the next beat follows on its own |
| Speed button | 1.25 → 1.5 → 0.75 → 1, label follows |
| I (provenance) | opens with its rows; closes; timeline untouched |
| Esc | EXPLORE, briefing hidden; 6 MIN from the top bar returns to a playing briefing |
| Ends | NEXT on the last beat and BACK on the first do nothing |
| Page errors | none |

**§33 EXPLORE inspector** (`src/nepal/briefing/inspect.js`, pure and tested;
`src/ui/nepal/briefing/inspector.js`; `scripts/qa-briefing-inspector.mjs`). Click the map; the nearest object of a
kind the scene is showing is ringed and described from artefact values, with
its evidence class and a **▶ PLAY THIS IN THE BRIEFING** that opens the full
run at the matching scene. Where the analysis has nothing, the card says so
and why. Driven click by click in a browser — **10 / 10 kinds answered:**

| Object | Scene | Card (abridged) |
|---|---|---|
| Earthquake | 02 | MAIN SHOCK · M7.8 · depth 8.2 km · USGS ID · OBSERVED |
| District | 06 | KATHMANDU · 2,779,012 modelled · MMI 7.5 peak · 300 damage sites · median 2.8 → 2.8 km to hospital |
| Damage point | 08 | SEVERE DAMAGE · 27 Apr 2015 image · analysis area · not field-validated |
| Blocked road | 11 | observed 27 Apr 2015 · *not on a road mapped in 2015* |
| Bridge | 11 | BRIDGE OUT · the what-if, or why there is none (not on a mapped road) |
| Landslide | 11 | 1.2 ha · Dolakha · 0 m to a blocked road · 337 people within 1 km · association, not cause |
| Hospital | 13 | government list, compiled 21 Sep 2010 · on the network · *no beds or capacity exist in the list* |
| Road | 13 | ROAD · PRIMARY · mapped 24 Apr 2015 · name · *no condition, speed or traffic exists* |
| Route | 14 | KATHMANDU → NUWAKOT · 74.3 → 83.5 km · DETOUR · SCENARIO |
| Chart element | 08 | damage-composition segment filters the map to that class (Stage 8 cross-filter) |

Points are tested against where they are drawn (sea level, depth test off)
and lines and districts against the terrain they are clamped to — the first
version tested everything against the terrain and missed points by up to a
kilometre on a pitched camera.

Also found and fixed by driving it: choosing EXPLORE on the BEGIN screen left
explore's scene rail and panel invisible for the rest of the session.

## 9. RESCUE ANALYSIS

The §34 chain, as the briefing plays it (scenes 29–32, every value from the
access artefact):

1. **Damage cluster** — the mapped damage and its 1 km grid (Act III).
2. **Population context** — 669 people in the chosen 1 km square, Sindhuli.
3. **Nearest health facility** — Dhulikhel, government list 2010.
4. **Baseline route** — 49.13 km along roads mapped the day before.
5. **Observed road disruption** — cut by the bridge observed out on 4 May 2015.
6. **Alternative route** — none on the mapped network (the typical *detour*
   case follows: Okhaldhunga, 8.8 → 14.0 km).
7. **Access consequence** — across the envelope, 85,783 people lose every
   mapped road route to a hospital; for 92.6 % nothing changes; 1.84 M had no
   mapped road to begin with — the larger gap was the map.

**What the chain found where the damage was mapped.** Traced from the centre
of each of the 11 named UNOSAT damage areas (≥ 20 sites), the observed
blockages changed **no** route: 8 were unchanged, 2 (Manbu, Daraudi valley)
had no mapped road route to a hospital even before, and 1 lies more than 2 km
from any mapped road. The route cuts the analysis found are away from these
area centres. Scene 30 now says so and draws each area coloured by its
outcome; the pipeline counts it (`areaRouteSummary`, with a check that every
area falls in exactly one outcome).

No bed count, capacity or travel time appears anywhere, because none exists
for 2015 in the sources held.

### §35 — the executive summary answers

Scene 40 plays in all three runs. Each question is answered on screen by a
typed card with its evidence class, and in the narration:

| Question | Where it is answered |
|---|---|
| Where did the earthquake occur? | *quake* card: pulse on the epicentre, **GORKHA** district |
| How strong was it? | *quake*: **M7.8**, 8.2 km deep |
| How did the sequence develop? | *quake*: **316 events**; largest aftershock **M7.3, 12 May 2015** |
| Where was strong shaking modelled? | *exposure*: bands on the map; strongest (MMI VIII contour) in **Dhading · Gorkha · Lamjung · Nuwakot · Rasuwa · Sindhupalchok** — MODELLED/DERIVED |
| How many people were geographically exposed? | *exposure*: **13.84 M inside MMI VI or stronger** |
| Where was physical damage observed? | *damage*: 4,583 sites on the map, **most in Manbu Area · Daraudi valley · Parkhalchaur**; half in 37 km² |
| Limitations of the damage observations? | *damage*: "imagery of chosen areas · damaged sites only"; FULL adds the *gap* beat (4.94 M people with no record) |
| What infrastructure disruptions were recorded? | *access*, OBSERVED card: **179 blocked roads · 5 bridges out · 51 landslides** (NGA) |
| What happened to connectivity under the scenario? | *access*, SCENARIO card: **85,783 lost every mapped road route**; 1.84 M had no mapped road |
| Which areas may have reduced modelled access? | *access*: **Sindhuli · Okhaldhunga · Rasuwa · Nuwakot · Ramechhap** |
| What could responders investigate first? | *first*: **Ramechhap · Sindhuli** (high need and poor access under every weighting) and the places with no record — "a place to start, not a priority list" |
| Observed vs modelled vs scenario? | every card carries its class tag (OBSERVED, DERIVED, STATISTIC, SCENARIO, DATA GAP); FULL adds scenes 36–38 |
| What remains unknown? | *close*: travel times · hospital capacity · where nothing was found; scene 39 lists every gap and what would fill it |

### §31 — the core story without the detail panel

The briefing has no right-hand detail panel: explore's rail and panel are
hidden for the whole run, and everything the story needs is on the map, in
the caption or in a typed card. Provenance (I) is an optional overlay. The
§30 recording below was made that way.

## 10. LIMITATIONS

- Distance, not time. No 2015 speed or surface data.
- The facility list is from 2010 and non-commercial; OSM 2015 is shown beside
  it. Per-hospital catchments are not computed; distances run from people to
  their nearest hospital.
- Every observed blockage is applied at once; clearance dates are unknown.
- Helicopter access is not modelled; the landing sites are context only.
- The UNOSAT product records damaged structures in chosen areas only; no
  record is not no damage, and the briefing says so.
- Headless browsers have no speech voices, so voiced runtimes are estimates
  from the voice rate; only the silent timing was recorded.
- The briefing overlay projects everything at sea level, while the globe
  drapes imagery over terrain. On pitched close-ups over the hills a mark can
  sit a few pixels off the imagery (estimated 4–10 px at the rescue route's
  70–90 km camera). It is not visible in the recordings; it would be on a
  closer shot.
- Two scene recordings stopped when SwiftShader's WebGL context failed ("fragment
  shader failed to compile, log: null") after 13–15 minutes of continuous
  software rendering: the rescue route at 43.5 s of 43.4 s, and an earlier
  run. Every scene was therefore recorded in a fresh browser. This was not
  reproduced on a GPU (none is available here), so it is recorded as an
  environment limitation, not ruled out as a defect. The summary recording
  failed the same way twice at 18–20 s. Entered in a fresh browser, the same
  beat played through to the end of the scene without error, so the failure
  builds up over a long session rather than coming from one shader.
- The recordings were made with SwiftShader, which draws a frame in
  0.7–1.0 s. Timing is exact (the recorder drives the clock); smoothness is
  not representative of a GPU.
- Terrain: no new source. The globe's keyless terrain mesh (Re:Earth /
  Mapterhorn, CC BY 4.0) is the only one used; the ion world terrain needs a
  token and is not used by the briefing.
- Before/after imagery swipe: not built. No 2015 before/after imagery pair is
  held under a usable licence; the Stage 8 imagery limitation stands.

## 11. VISUAL QA

**How it was watched.** A production build in headless Chromium (SwiftShader,
1280×720) with a recorder that takes the briefing clock over and advances it
in 500 ms steps, screenshotting every briefing second. Each recording is laid
out as a contact sheet and measured: mean absolute luminance change between
consecutive frames on a 160×90 greyscale downsample, with 1.2 (of 255) as
"nothing meaningful changed". Each scene is recorded in a fresh browser.

### §30 — the first 90 seconds of the 6 MIN run (recorded continuously)

| Required | On screen at |
|---|---|
| Incident detected | 0:01 — INCIDENT DETECTED · 25 APR 2015 · 06:11 UTC |
| Location | 0:04–0:12 — the globe turns to South Asia, the central Himalaya |
| Nepal border drawn | 0:13–0:17 |
| Epicentre | 0:18–0:25 — Kathmandu, and the epicentre in Gorkha |
| Magnitude | 0:26 — counts up to 7.8 |
| Depth | 0:30 — counts up to 8.2 km |
| Main shock | 0:26–0:32 |
| Shaking field | 0:33–0:48 — bands spread east; the intensity key; Kathmandu at MMI 7.5 |
| Aftershock development | 0:49–0:66 — 21 in the first hour, 89 in the first day, the M7.3 17 days later |
| Population overlap | 0:67–0:85 — modelled population, then 13.84 M inside MMI VI+, then 11.83 M where strong shaking met dense settlement |

**Longest stretch without meaningful change: 4 s** (0:16–0:19, the border
finished and the epicentre card arriving). The test fails at 20 s. 74 of the
92 one-second intervals changed the picture.

### Scenes watched

Recorded in full: the first 90 s (93 frames), baseline access (22),
damage-scenario access (29, then 33 after the changes), and the rescue route
(44). Longest still stretch in each: 4 s, 2 s, 2 s, 4 s. The executive
summary was recorded to 18–20 s twice (see Limitations). Its remaining beats,
and the fixed scene 30 card, were checked as whole-beat screenshots, jumping to
each beat while paused, on the final build.

That is 11 of the 40 scenes recorded frame by frame: the eight the first 90 s
covers and three in Act V. The rest were checked through the timeline lint, the
generated script and the acceptance runs, which pass through them. They were
not each watched frame by frame.

### Defects found by watching or driving it, all fixed in this stage

1. Choosing EXPLORE on the BEGIN screen left explore's scene rail and detail
   panel invisible for the rest of the session.
2. Paused, BACK or a jump showed the caption frozen at its first word.
3. The M7.3 aftershock figure landed 0.3 s before its scene cut away. A
   timeline check found 65 scene-final beats with the same shape; the run
   plan now holds each scene's final picture 1.5 s.
4. A shorter run playing over a left-out beat re-entered the scene: the
   camera snapped through earlier views and a card flashed (found while
   trimming the runs, then confirmed in the code path).
5. Scene 30's key did not explain the grey crosses (blockages on no mapped
   road).
6. Inspector clicks on points missed by up to a kilometre on pitched views
   (tested against the terrain instead of where points are drawn).
7. The inspector's hint sat on top of the scenario band.
8. The executive summary's cards were placed at 58 % of the width with a
   fixed 560 px maximum, so at 1280 px long lines ran to the right edge of
   the screen. They are now limited to 38 % of the viewport width.
9. The new damage-area card in scene 30 rendered in the large headline style
   with no panel, and its last line ran under the Manbu callout. It now uses
   the data-card style of the scene's other cards.
10. The closing card sat over the blue no-mapped-road squares and the road
    web left from the access beat; the close now clears them.

### Seen and left

- A scene's annotations fade out over the first half-second of the next
  scene, so a frame taken then shows both (e.g. 1:07). It reads as a
  cross-fade in motion.
- Imagery is lower-resolution in SwiftShader captures than on a GPU; colour
  and contrast were checked against it anyway.
- In one recording of scene 30, made while two other headless browsers were
  loading tiles, the imagery provider failed after 2 s and the Stage 8
  fallback chain switched to OpenStreetMap cartography. The briefing stayed
  legible on it. The same scene recorded earlier had imagery throughout.

## 12. PERFORMANCE

- Briefing assets fetched once at BEGIN: the geometry artefact (2.0 MB,
  338 KB gzipped) and the access artefact (738 KB, 86 KB gzipped).
- The road network (15,424 drawn edges) is culled to the camera's view
  rectangle each frame, per-line bounding boxes; the overlay requests renders
  only while something moves (render governor, request-render mode).
- In SwiftShader the page draws a frame in 0.7–1.0 s; NEXT lands on the next
  frame regardless.

## 13. TESTS / BUILD

- `npm test`: **5,249 tests — 5,248 pass, 0 fail, 1 skipped.** New this stage:
  the director (12), timeline and runs, facts and templates, flight, the
  routing and access engines, the inspector (5, including that every "play in
  briefing" scene exists), the scenes (anchors, facts, legends, no typed
  digits), and the generated script's sync.
- The analysis contract: every artefact carries its checks; health access 7
  of 7 and briefing geometry 8 of 8 pass.
- `node scripts/format.mjs --check`, `npm run check:boundaries`,
  `node scripts/generate-briefing-script.mjs --check`: clean.
- `npm run build`: succeeds (the existing large-chunk warning is unchanged).
- Browser acceptance (production build, headless Chromium):
  `scripts/qa-briefing-skip.mjs` 15 / 15 and `scripts/qa-briefing-inspector.mjs`
  10 / 10 object kinds, both re-run on the final build. §30 was recorded and
  measured as above. One earlier inspector run stopped after five kinds with
  no error printed; the next run completed. Treat a stop as SwiftShader's
  unless it repeats.
