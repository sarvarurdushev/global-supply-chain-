# Stage 9.1 — Human experience QA and cinematic finishing: report

Final app commit: **c63fb8b**, deployed on Render. Every figure below was measured on it unless
the row says otherwise.

## HUMAN VERDICT

I watched all 40 scenes, most of them twice, frame by frame. Then I looked at a still of each scene's
final state on the final build. The briefing now tells one story, from the alert to the four-part close,
and I would show it to a room. It is not signed off until someone plays it once on a real machine with a
GPU and a real voice, because this container can do neither.

**How I watched.** This container has no GPU and no speech engine. Each scene was recorded at one frame
per second of briefing time, with a QA stand-in voice pacing the narration word by word, and I looked at
every frame. That shows what is on screen when, what moves, what collides and what sits dead. It cannot
show how smooth a camera flight is or how a real voice sounds. Those two things are what the 10-minute
procedure in [NEPAL_2015_STAGE_9_1_LOCAL_QA.md](NEPAL_2015_STAGE_9_1_LOCAL_QA.md) is for.

**What watching found that automation had not:**

- a played scene change that erased the new scene's map (scene 13 arrived with no outline and no damage);
- cards and charts that ran under the caption and the controls at 1280×720;
- a callout printed over the scene title;
- a big figure reading "0.ATHMANDU" through a map label;
- a basemap that fell to a blank grid after a few failed tiles;
- about fifteen stretches of 5–10 s where nothing moved while the voice went on;
- four closing cards (scenes 36–39) that listed things the map never showed.

**What the last pass found.** That pass was a still of every scene’s end state, and it found these
smaller faults that a viewer would still notice:

- a modelled intensity tagged OBSERVED (05);
- two callouts lying over a chart's verdict (18);
- labels cut off under their bars (14, 35), or run together in a key (26, 30);
- image dates out of order (12);
- a caption that said "grey crosses" over amber marks (28);
- the raw key HEALTH_POST (27);
- map marks showing through the control bar and the caption (09, 10, 22);
- a callout over a figure's source tag (14);
- a card sitting on the scene question (39).

All of these are fixed. The first list was watched again in motion. The second was re-shot as stills on
the final build, and scene 18's new ending, which moves the camera, was also recorded and watched in
motion.

**Still weak, honestly:**

- scene 12's lag card holds for about 5 s;
- scene 5's intensity-scale beat changes little on the map while the legend fills;
- some fixes were checked in stills or on paper and not re-recorded end to end: scene 2's push, scenes
  39–40's camera moves, and most of the last pass;
- the before/after imagery stays a documented gap.

## 40-SCENE REVIEW TABLE

How to read the columns:

- **Watched.** The recordings I went through frame by frame. Pass 1 is the first build of this stage;
  pass 2/3 come after fixes. "Final still" is the end-state screenshot of every scene on the final build
  (c63fb8b), and "re-shot" means the scene was captured again after a fix the still led to.
- **Duration.** The FULL run, with the 6 MIN run in brackets where the scene is in it.
- **Dead.** A stretch with no meaningful change on screen while the voice runs.
- **Visual problem / Fixed.** "Still:" marks what the final-still pass found.

| Scene                        | Watched                                                                                                          | Duration      | Boring/dead?                                                                                   | Clear story?                                                                   | Visual problem?                                                                                                                                                                                                                                      | Fixed?                                                                                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 Incoming incident         | yes · pass 1 + pass 2 + final still                                                                              | 10.4 s (10.4) | Pass 1: globe still 2–7 s. Now ~3 s of slow globe turn                                         | Yes: alert, time, locating                                                     | —                                                                                                                                                                                                                                                    | Globe turns under the veil (5d46417)                                                                                                                                                                       |
| 02 Locate Nepal              | yes · pass 1 + pass 2 + final still                                                                              | 16.5 s (16.5) | Pass 2: camera parked 5 s on "Kathmandu … sits in this valley"                                 | Yes: Himalaya → border → Kathmandu → epicentre                                 | —                                                                                                                                                                                                                                                    | Push toward the valley as it is named (a56c5eb, not re-recorded)                                                                                                                                           |
| 03 Administrative geography  | yes · pass 0 + 1 + 2 + final still                                                                               | 13.9 s        | Pass 0: 8 s card over faint districts. Now continuous                                          | Yes: 75 districts, three names that return                                     | Districts too faint                                                                                                                                                                                                                                  | Districts draw bright with a 51→71→75 count (5d46417)                                                                                                                                                      |
| 04 Main shock                | yes · pass 1 + 2 + final still                                                                                   | 9.9 s (9.9)   | Pass 1: depth beat 4 s still. Now 1 s                                                          | Yes: M7.8, 8.2 km, shallow                                                     | —                                                                                                                                                                                                                                                    | Camera descends through the depth beat (5d46417)                                                                                                                                                           |
| 05 Shaking expands           | yes · pass 1 + 2 + final still (re-shot after fix)                                                               | 16.9 s (16.9) | Pass 1: 3 s idle after the bands. Scale beat: ~4 s of little map change while the legend fills | Yes: spread east, the scale, Kathmandu 2.78 M                                  | PEAK MMI callout sat on the legend header; Still: PEAK MMI callout wore a green OBSERVED badge on modelled intensity                                                                                                                                 | Camera follows the spread (5d46417); callout moved (a129ac5, checked in stills); tag reads USGS SHAKEMAP / MODELLED (0ea3ff4)                                                                              |
| 06 First hours               | yes · pass 1 + 2 + final still                                                                                   | 18.4 s (13.1) | Pass 1: first-week beat 6 s still. Now ≤ 3 s                                                   | Yes: 21 → 89 → 135 with the dots                                               | —                                                                                                                                                                                                                                                    | Camera pulls back through the week (5d46417)                                                                                                                                                               |
| 07 Seismic sequence          | yes · pass 0 + 1 + 2 + final still                                                                               | 20.9 s        | Pass 0: the map never showed "few large". Now continuous                                       | Yes: many small, few large, completeness                                       | —                                                                                                                                                                                                                                                    | Largest events pulse, bar focus, verdict banner (5d46417, 528748a)                                                                                                                                         |
| 08 Second major shock        | yes · pass 1 + 2 + final still                                                                                   | 14.4 s (6.8)  | No (≤ 2 s)                                                                                     | Yes: 17 days later, 7.3, 139 km east, decay reset                              | —                                                                                                                                                                                                                                                    | —                                                                                                                                                                                                          |
| 09 Population                | yes · pass 1 + 2 + final still (re-shot after fix)                                                               | 12.1 s        | No (≤ 1 s)                                                                                     | Yes: 27.0 M, modelled, valley densest                                          | WorldPop card repeated in scene 10; Still: Population dots showed through the control bar, behind BACK and PLAY                                                                                                                                      | Card removed from 09 (aa5510c); bar background stays dense; only the buttons recede (f3fa7a3)                                                                                                              |
| 10 Population meets shaking  | yes · pass 1 + final still                                                                                       | 13.2 s (12.4) | No                                                                                             | Yes: 13.84 M inside MMI VI+                                                    | Still: population dots through the control bar, as in 09                                                                                                                                                                                             | same fix (f3fa7a3)                                                                                                                                                                                         |
| 11 Density × shaking         | yes · pass 1 + final still                                                                                       | 18.1 s (6.5)  | No                                                                                             | Yes                                                                            | Caption said "top 75 %": wrong reading of a quantile                                                                                                                                                                                                 | "Above the 75 % quantile" (5d46417)                                                                                                                                                                        |
| 12 Damage evidence arrives   | yes · pass 1 + final still (re-shot after fix)                                                                   | 17.6 s        | Lag card holds ~5 s at the end: borderline                                                     | Yes: damage appears by image date                                              | Still: Image-date bars sorted by count, so the dates read out of order                                                                                                                                                                               | Lag card not changed (acceptable, noted); dates in time order (f3fa7a3, c63fb8b)                                                                                                                           |
| 13 Damage composition        | yes · pass 1 + 2 + stills + final still                                                                          | 15.3 s (15.3) | No                                                                                             | Yes: 2,084 of 4,583 destroyed, shares of mapped damage only                    | **Bug:** a played scene change erased outline, mask and damage. Chart ran under the caption at 1280×720                                                                                                                                              | Stage keeps a new scene's layers (a4e7254); charts clear the caption band (e914c1a, e061dff)                                                                                                               |
| 14 Destroyed areas           | yes · pass 1 + 2 + final still (re-shot after fix)                                                               | 15.4 s        | No                                                                                             | Yes: 2,084 destroyed, largest cluster                                          | Still: Manbu callout covered the 2,084 figure's source tag; DARAUDI VALLEY cut to DARAUDI VALL                                                                                                                                                       | Verdict banner (528748a); callout level with the place; label column fits the longest label (f3fa7a3, c63fb8b)                                                                                             |
| 15 Severe and moderate       | yes · pass 1 + final still                                                                                       | 11.9 s        | No                                                                                             | Yes                                                                            | —                                                                                                                                                                                                                                                    | —                                                                                                                                                                                                          |
| 16 Damage concentration      | yes · pass 1 + final still                                                                                       | 20.6 s (20.6) | No                                                                                             | Yes: 362 → 37 km², Gini                                                        | Callout covered the count's source tag                                                                                                                                                                                                               | Callout below its anchor (ed5b205)                                                                                                                                                                         |
| 17 Gorkha deep dive          | yes · pass 1 + final still                                                                                       | 12.6 s        | No                                                                                             | Yes                                                                            | —                                                                                                                                                                                                                                                    | —                                                                                                                                                                                                          |
| 18 Model versus observation  | yes · pass 1 + 2 + stills + final still (re-shot after fix) + last beat re-recorded in motion on the final build | 37.2 s (37.2) | No                                                                                             | Yes: detectable but weak, not a straight line                                  | Reversal callout covered 0.167. Chart under caption at 1280. "0.ATHMANDU": figure over a map label; Still: Manbu and Sundar Bazar callouts lay over the chart's title and verdict (the places sit under the chart, a regression from the chart lift) | Count cleared before callouts (64178c4); chart lift (e914c1a); figure scrim (61f246f); callouts never land on a panel; last beat framed on Tanahu so both places sit right of the chart (f3fa7a3, c63fb8b) |
| 19 Second observation system | yes · pass 1 + final still                                                                                       | 14.5 s        | No                                                                                             | Yes: 41,042 graded by Copernicus                                               | **Bug:** the bar chart did not draw (fact not registered)                                                                                                                                                                                            | Fact registered (9da5444)                                                                                                                                                                                  |
| 20 Coverage gap              | yes · pass 1 + 2 + final still                                                                                   | 19.2 s (19.2) | Pass 1: 5 s still while the voice ran on. Now ≤ 3 s                                            | Yes: 4.94 M where nothing was recorded, a gap not an absence                   | Callout slid under the gap card on the pull-back                                                                                                                                                                                                     | Push-in + pulse on the empty square (5284fcd); callout removed first (183d329)                                                                                                                             |
| 21 Road network before       | yes · pass 1 + 2 + final still                                                                                   | 15.4 s        | Pass 1: camera barely moved. Now ≤ 2 s                                                         | Yes: the map was thin, 3.4× now                                                | —                                                                                                                                                                                                                                                    | Stronger push-in and Gorkha flight (5284fcd)                                                                                                                                                               |
| 22 Road blockages            | yes · pass 1 + final still (re-shot after fix)                                                                   | 12.1 s        | No                                                                                             | Yes                                                                            | Still: A blockage marker read through the caption                                                                                                                                                                                                    | caption background 86 % (f3fa7a3)                                                                                                                                                                          |
| 23 Landslides                | yes · pass 1 + 2 + final still                                                                                   | 13.7 s        | No (≤ 2 s)                                                                                     | Yes, after fix: one blockage beside one slide                                  | Slides too small to read; nothing tied a slide to a blockage; callout touched the % label                                                                                                                                                            | Fly to the Dolakha slide on a blocked road (8607cb7); callout below (d06b31d)                                                                                                                              |
| 24 Bridges                   | yes · pass 1 + final still                                                                                       | 11.6 s        | No                                                                                             | Yes                                                                            | —                                                                                                                                                                                                                                                    | —                                                                                                                                                                                                          |
| 25 Network before and after  | yes · pass 1 + 2 + final still                                                                                   | 21.9 s (16.0) | Pass 1: 4 s still on "most on minor roads". Now ≤ 2 s                                          | Yes: 184 blocked, 21 on main roads, 40 → 49 pieces                             | —                                                                                                                                                                                                                                                    | Camera goes to the minor roads on that line (dd120aa)                                                                                                                                                      |
| 26 Route reconstruction      | yes · pass 1 + final still (re-shot after fix)                                                                   | 17.4 s (12.8) | No                                                                                             | Yes                                                                            | Still: Key: NO ROUTE BEFORE ran into its description                                                                                                                                                                                                 | key label column fits the longest label (f3fa7a3)                                                                                                                                                          |
| 27 Health facility data      | yes · pass 1 + 2 + final still (re-shot after fix)                                                               | 16.4 s        | Pass 1: list card over an unchanging map. Now 4 s at most                                      | Yes: 2010 list, no capacity invented                                           | Still: Tier shown as the raw key HEALTH_POST                                                                                                                                                                                                         | Hospitals arrive across the map with the list (5353a96); reads HEALTH POST (c63fb8b)                                                                                                                       |
| 28 Facility map              | yes · pass 1 + 2 + final still (re-shot after fix)                                                               | 15.7 s        | No (≤ 3 s)                                                                                     | Yes, after fix                                                                 | The nine unreachable hospitals were grey on grey; Still: Caption and voice said grey crosses; the picture frames the nine in amber                                                                                                                   | Reachable dimmed, the nine framed in amber (5353a96); words now say framed in amber (c63fb8b)                                                                                                              |
| 29 Baseline access           | yes · pass 1 + stills + final still                                                                              | 26.8 s (26.8) | No                                                                                             | Yes: 7.5 km median, 1.84 M with no road, distance not time                     | —                                                                                                                                                                                                                                                    | —                                                                                                                                                                                                          |
| 30 Damage-scenario access    | yes · pass 1 + 2 + final still (re-shot after fix)                                                               | 35.4 s (35.4) | Pass 1: two 4–5 s holds. Now ≤ 2 s                                                             | Yes: 85,783 cut, 42,181 longer, 92.6 % unchanged, Manbu                        | Still: Key: NO ROUTE BEFORE ran into its description                                                                                                                                                                                                 | Camera moves through "nothing changed" and the area count (4d4be7d); as 26 (f3fa7a3)                                                                                                                       |
| 31 Rescue access pressure    | yes · pass 1 + 2 + final still                                                                                   | 20.1 s        | No (≤ 2 s)                                                                                     | Yes: Pareto set, rank depends on weights                                       | Card's district list ran off the right edge                                                                                                                                                                                                          | Count on the card, names in the caption; cards wrap (d42a0f8)                                                                                                                                              |
| 32 A route, before and after | yes · pass 1 + 2 (two parts) + tail re-record + final still                                                      | 59.2 s (47.5) | Pass 2: ~10 s across search→result, 4 s after the detour, 9 s under the close                  | Yes: need → hospitals → nearest → route → cut → search → disconnected → detour | Hospitals off-frame; search label off the right edge; hospital callout over the title at 1280                                                                                                                                                        | Framed on the place (9d1f61f); labels flip left; callouts kept in frame (2b1d892); camera moves in search/result/detour/close (5573ef5)                                                                    |
| 33 Bridge failure what-if    | yes · pass 1 + final still                                                                                       | 12.5 s        | No                                                                                             | Yes                                                                            | —                                                                                                                                                                                                                                                    | —                                                                                                                                                                                                          |
| 34 Airfields and helipads    | yes · pass 2 + 3 + final still                                                                                   | 14.3 s        | Pass 2: 8 s still, marks were specks. Now ≤ 1 s                                                | Yes: 17 airfields, 45 helipads, no flights inferred                            | The two counts' source tags touched                                                                                                                                                                                                                  | Larger marks, counts, camera move (d3a3665); tags spaced (0bd732c)                                                                                                                                         |
| 35 Four clocks               | yes · pass 2 + 3 + final still (re-shot after fix)                                                               | 18.5 s        | Pass 2: 8 s near-still while four clocks were named. Now ≤ 3 s                                 | Yes: each clock shows as named, median 12 days                                 | Still: Step names cut under the bars (QUAKE → IMAGE, MAP → PUBLIS…)                                                                                                                                                                                  | Epicentre pulse, damage by image date (d3a3665); label column fits the longest label (f3fa7a3)                                                                                                             |
| 36 What we know              | yes · pass 1 + 2 + final still                                                                                   | 10.3 s        | Pass 1: a card over a drifting map                                                             | Yes, after fix                                                                 | The map showed none of what the card listed                                                                                                                                                                                                          | Epicentre, damage, blockages light as the lines type (c90d28f)                                                                                                                                             |
| 37 What we infer             | yes · pass 1 + 2 + final still                                                                                   | 10.3 s        | Same as 36                                                                                     | Yes, after fix                                                                 | Same                                                                                                                                                                                                                                                 | MMI VI+ bands, half-of-damage grid (c90d28f)                                                                                                                                                               |
| 38 What we simulate          | yes · pass 1 + 2 + final still                                                                                   | 10.3 s        | Same as 36                                                                                     | Yes, after fix                                                                 | Same                                                                                                                                                                                                                                                 | Cut-off cells, blockages (c90d28f)                                                                                                                                                                         |
| 39 What we do not know       | yes · pass 1 + 2 + final still (re-shot after fix)                                                               | 18.2 s        | Map changed once in 18 s; last 5 s still                                                       | Yes                                                                            | Still: Gap card's top edge sat on the scene question                                                                                                                                                                                                 | Roads, hospitals, blockages as each gap is listed (6007770); flight carried through the close (4746cc5); cards start below the question (c63fb8b)                                                          |
| 40 Executive summary         | yes · pass 2 (whole scene) + stills + final still                                                                | 38.4 s (38.4) | Two 6 s holds: "look first" and the close                                                      | Yes: six recap lines, then know / infer / simulate / don't know                | —                                                                                                                                                                                                                                                    | Camera closes on Ramechhap and Sindhuli, drifts under the close (3cae89e)                                                                                                                                  |

## VOICE QA

**How the voice is chosen** (`src/ui/nepal/briefing/narration.js`). Voices are chosen by their
properties, never by name. The briefing offers only English voices and prefers:

- en-GB or en-US;
- a natural or neural voice (online "Natural" voices, Google, "premium"/"enhanced");
- a voice that runs locally.

Novelty voices (the macOS joke voices) and bare synthesisers (eSpeak and the like) go last, and are
labelled as such. No voice imitates or clones a real person, and every line spoken is original briefing
prose.

**Picker and preview.** The picker sits on the BEGIN card and in settings. Choosing a voice previews it
("Magnitude seven point eight. Focal depth, eight kilometres."), and the choice is remembered across
reloads.

**No voice.** When the browser has no voice at all, the briefing runs on captions alone, timed by
reading speed.

**Checked with a stand-in speech engine** (`scripts/qa-briefing-presenter.mjs`). A headless browser has
no voices, so the page gets six voices of the kinds real browsers offer: a natural online voice, a Google
voice, two local system voices, a macOS novelty voice and eSpeak. Results on the final code, 13/13:

| Check                                                            | Result                                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| The natural en-GB voice is chosen when nobody has chosen         | PASS: Microsoft Ryan Online (Natural)                                             |
| Every English voice listed, novelty last                         | PASS: natural → Daniel → Samantha → Google UK → eSpeak (basic) → Albert (novelty) |
| Choosing a voice previews it in that voice                       | PASS                                                                              |
| The chosen voice survives a reload                               | PASS                                                                              |
| NEXT/BACK stop the spoken line within 120 ms (30 random presses) | PASS: 0 late                                                                      |
| After a press, only the new beat's narration is spoken           | PASS                                                                              |
| Never two voices at once                                         | PASS: at most 1 active                                                            |
| PAUSE mid-sentence: silence and a frozen clock                   | PASS                                                                              |
| PLAY says the interrupted sentence again from its start          | PASS                                                                              |
| VOICE OFF: nothing spoken, run continues, captions carry it      | PASS                                                                              |
| CAPTIONS OFF, VOICE ON: no caption, voice continues              | PASS                                                                              |

**Briefing register.** Narration is short declarative sentences. Figures are said the way a person says
them ("86 thousand", "4.9 million"), and a figure is spoken only when the picture is already showing it.
In every recording I checked each spoken word against the frame on screen.

**Not verified here:** how any real voice sounds. That is step 1 of the local check.

## 6-MIN FINAL RUNTIME

**Measured: 6 MIN BRIEFING = 6:03.9** on the final build. The target was 5:50–6:10.

How it was measured: `scripts/qa-briefing-runtime.mjs` plays the real director on the real stage in a
browser, hands off from BEGIN to the last beat, with the QA voice speaking at 2.5 words a second. The
briefing clock is stepped by hand, so the slow renderer cannot stretch or shrink the result. On paper the
timeline says 6:01.7; the 2.2 s difference is the director really waiting for flights, fades and narration
ends.

| Time   | Scene                       |     | Time   | Scene                       |
| ------ | --------------------------- | --- | ------ | --------------------------- |
| 0:00.0 | 01 Incident                 |     | 2:08.8 | 18 Model versus observation |
| 0:11.2 | 02 Locate Nepal             |     | 2:46.0 | 20 Coverage gap             |
| 0:27.7 | 04 Main shock               |     | 3:05.2 | 25 Network before and after |
| 0:37.6 | 05 Shaking                  |     | 3:21.2 | 26 Route reconstruction     |
| 0:54.7 | 06 First hours              |     | 3:34.0 | 29 Baseline (health) access |
| 1:07.8 | 08 Second shock             |     | 4:00.8 | 30 Damage-scenario access   |
| 1:14.6 | 10 Population meets shaking |     | 4:36.6 | 32 Rescue route             |
| 1:27.0 | 11 Density × shaking        |     | 5:23.9 | 40 Executive summary        |
| 1:33.9 | 13 Damage composition       |     | 6:03.9 | end, on the four-part card  |
| 1:48.2 | 16 Damage concentration     |     |        |                             |

The chain the brief asked for, in this order: INCIDENT (01) → NEPAL (02) → MAIN SHOCK (04) → SHAKING
(05–08) → POPULATION (10–11) → DAMAGE (13, 16) → MODEL VS OBSERVATION (18) → INFRASTRUCTURE (25–26) →
COVERAGE GAP (29, who had no road to a hospital even before) → HEALTH / RESCUE ACCESS (30, 32) → NETWORK
/ ROUTE (32) → EXECUTIVE CONCLUSION (40).

One deviation, kept on purpose: the observation coverage gap (20, "no record is not no damage") sits
straight after model-versus-observation, because it is that comparison's caveat.

Other runs, on paper: 3 MIN 2:44.6 and FULL 12:07.5. The **executive summary is 38.4 s** and ends on
KNOW / INFER / SIMULATE / DON'T KNOW. Across all runs, the longest stretch on paper with nothing
scheduled to change is 3.8 s.

## RESCUE EXPERIENCE

Scene 32 is now a step-by-step investigation (47.5 s in the 6 MIN run). Each step is something you see
happen, not a card:

| Step asked for     | What is on screen                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| DAMAGE / NEED      | The camera lands on one square kilometre in Sindhuli: a bracket, "669 people · MMI 7.5"                                    |
| POPULATION         | The 669 counted on the place itself (WorldPop 2015 cell)                                                                   |
| HEALTH FACILITIES  | Dashed straight lines to the two nearest listed hospitals, both in frame, labelled "27.8 km / 26.7 km · no mapped road"    |
| NEAREST            | The camera glides to the nearest hospital the roads reach (Kavrepalanchok); its callout stays inside the frame             |
| BASELINE ROUTE     | The green road route draws: 49.1 km before the earthquake                                                                  |
| BLOCKAGE           | "Observed blocked · 4 May 2015 · NGA · on the only mapped route" at the cut                                                |
| ROUTE BREAKS       | The route turns red beyond the cut                                                                                         |
| ALTERNATIVE SEARCH | The network still reachable spreads out amber from the place (61.9 km), and the camera closes in: no hospital on any of it |
| RESULT             | DISCONNECTED: no mapped road route to any hospital; unmapped tracks may exist; air access not modelled                     |
| (then)             | A detour elsewhere (Okhaldhunga, 8.8 km becomes 14.0 km), drawn as before / cut / after                                    |

Every figure comes from `data/analysis/nepal-2015-health-access.json`. Nothing is computed in the browser,
and there is no capacity and no "rescue score". On the final build the tail (search to the end) has no
stretch longer than 3 s without change; before this stage's fixes there were 10 s and 9 s holds.

In EXPLORE, a hospital card offers:

- SHOW CATCHMENT CONTEXT;
- COMPARE DAMAGE SCENARIO;
- TRACE FROM DAMAGE AREA;
- SHOW NEARBY POPULATION;
- SHOW SOURCE / DATE.

A blocked-road card shows:

- the matched road segment, in red;
- a leader line to it;
- source and date, and the nearest mapped landslide with "nearness in space · no cause recorded";
- which scenario uses it;
- TRACE NETWORK EFFECT, which shows the cells whose access changes when only that segment is removed.

When a blockage matched no mapped road, the card says so and why, and greys out the actions it cannot
support.

## CONTROLS

- **NEXT / BACK** (presenter test, 30 random presses during flights, typing, charts, speech and route
  traces, seed 7): the spoken line stopped within 120 ms every time. Nothing from the previous beat was
  spoken afterwards, and no callout, chart or route from another scene was left on the map once its
  0.35 s fade finished.
  - The first run of the check reported scene 05's layers as left behind in scene 06. A deterministic
    replay of the same crossings (NEXT, BACK, triple NEXT, double BACK) showed them fading at +0.3 s and
    gone by +2.8 s of briefing time. The check was reading wall time on an overloaded machine, so it now
    waits on the briefing clock (82b04cc) and passes.
- **Played scene changes** (`scripts/qa-briefing-transitions.mjs`): 39/39 crossings arrive with every
  setup object drawn, after the scene 13 bug fix (a4e7254).
- **PAUSE / PLAY:** deterministic. Speech stops, the clock freezes, and PLAY repeats the interrupted
  sentence from its start.
- **VOICE OFF / CC OFF:** see VOICE QA. CC off now hides the caption at once (26a1188).
- **EXPLORE** (`scripts/qa-briefing-inspector.mjs`): all 10 object kinds pick and describe themselves,
  and a chart element cross-filters the map.
  - All 8 card actions on a hospital and a blocked road show their figures from the artefact, draw on the
    map, and keep the leader line to the object.
  - Actions the analysis cannot support are greyed out with the reason. No bed count or capacity appears
    anywhere.
  - Fixed after watching the screenshots: the landslide action drew a line but said nothing (ff1b04c);
    card labels broke one word per line (c34a1aa).

## DEPLOYMENT QA

Deployed build: <https://disaster-intelligence-platform.onrender.com>. Render deploys this branch, and
`/version.json` reported **c63fb8b** in every capture session, the same commit as the local build.

**What was compared.** I landed every one of the 58 beats of the 6 MIN run on both builds, paused at its
end state, and screenshotted each at 1280×720 (`.parity.mjs`, a fresh browser every 10 beats). The local
build is the same commit served by `vite preview`. For each beat I compared:

- the beat key;
- the set of map and overlay objects on screen;
- the caption;
- the picture, by pixel difference and by looking.

| Segment the brief named   | Beats | Objects on screen | Picture                                                                                                                                                                           |
| ------------------------- | ----- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First 90 s (01–11)        | 0–15  | identical, 16/16  | Same. From the alert to the epicentre (beats 0–4) under 0.5 % of pixels differ. Beat 12 (second shock) was caught at a different point of its tile load and its aftershock reveal |
| Damage (13, 16)           | 16–22 | identical, 7/7    | Same overlay. Beats 19 and 21 differ only in how far the satellite tiles had loaded                                                                                               |
| Model vs observation (18) | 23–27 | identical, 5/5    | Same: chart, 38.7 / 31.1 / 55.8 %, verdict, and both callouts right of the chart                                                                                                  |
| Coverage gap (20)         | 28–29 | identical, 2/2    | Same                                                                                                                                                                              |
| Infrastructure (25–26)    | 30–33 | identical, 4/4    | Same overlay: 184 blockages, 21 on a main road, 40 → 49 pieces. Beat 30: tiles loaded on Render, not yet locally                                                                  |
| Health access (29–30)     | 34–42 | identical, 9/9    | Same, after the re-capture below                                                                                                                                                  |
| Rescue route (32)         | 43–50 | identical, 8/8    | Same: route, cut, amber search, DISCONNECTED card                                                                                                                                 |
| Executive summary (40)    | 51–57 | identical, 7/7    | Same four-part close, after the re-capture below                                                                                                                                  |

**Result: all 58 beats show the same scene and the same objects on both builds.** Every figure on screen
comes from the same artefacts.

- In 50 of the 58 beats, under 4 % of pixels differ noticeably.
- In the other 8, the difference is in satellite imagery, which both builds fetch from Esri directly and
  which had loaded to different detail at the moment of capture.

**What differed, and why:**

- **Captions (12 beats).** The capture waits 3.5 s of wall time after landing a beat. On these beats one
  build was still showing the previous beat's caption, because the new caption had not yet come up. No
  caption has a different text or number.
- **White frames.** In the first pass these came on Render beats 35–39 and 57, the last beats of a browser
  session. That is the software renderer's known fault (GPU LIMITATION below). Re-captured in fresh
  sessions, all six match the local build within 3 % of pixels.
- **Black globe.** Local beats 20 and 40 were the first beat of a fresh session, captured before any
  tile had loaded. Re-captured mid-session, they match Render.
- **Load time.** Render's loads took 9.1–10.5 s per session, against 3.7–5.5 s locally.

The same comparison on the previous deployment (a56c5eb) also gave 58/58 identical beats.

**Not validated on Render:**

- smooth motion;
- a real voice;
- a played, hands-off run in real time.

This container cannot do any of the three. The local check in
[NEPAL_2015_STAGE_9_1_LOCAL_QA.md](NEPAL_2015_STAGE_9_1_LOCAL_QA.md) opens the deployed URL first, so those
are confirmed on Render when someone runs it.

## GPU LIMITATION

This container draws WebGL in software (SwiftShader) at about one frame a second, with no GPU and no
speech engine. After roughly 20–80 s of briefing in one browser session it fails with `Fragment shader
failed to compile. Compile log: null`, and a white frame appears just before the failure. The same beat
plays cleanly when opened fresh, so this is the software renderer running out of resources, not a defect
in the briefing. It is why every recording here is a chunk of one to three scenes.

What software rendering cannot show:

- how smooth camera flights and route traces are;
- how real voices sound, and whether their pace matches the picture;
- how the briefing looks on a projector.

[NEPAL_2015_STAGE_9_1_LOCAL_QA.md](NEPAL_2015_STAGE_9_1_LOCAL_QA.md) is a 10-minute procedure on a real
machine that covers exactly these: voice picker and preview, the whole 6 MIN run against measured
landmarks, rapid NEXT/BACK and pause, the rescue route, the summary, and EXPLORE. It ends with a table to
send back.

One finding here was a real application problem, not a renderer limit. The basemap fell from satellite
imagery to the blank offline grid after two failed tiles, and on a flaky venue network that would end the
imagery for the rest of a talk. An outage now means twelve failures within 20 s (b0dbce2, 452cb23).

## TESTS / BUILD

All gates and checks below were run on the final code (c63fb8b), except the type-size measurement (see the notes).

| Gate                                        | Result                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm test`                                  | 5,263 tests: 5,262 pass, 0 fail, 1 skipped                                           |
| `npm run format:check`                      | pass, 1,049 source files                                                             |
| `npm run check:boundaries`                  | pass                                                                                 |
| `npm run build`                             | pass. Vite's usual warning about chunks over 1.5 MB, as before                       |
| `node scripts/generate-briefing-script.mjs` | regenerated. On paper: 3 MIN 2:44.6, 6 MIN 6:01.7, FULL 12:07.5; longest still 3.8 s |

Browser checks (software WebGL, headless, against `vite preview` of the production build):

| Check                                                             | Result                                                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `qa-briefing-runtime.mjs --run SIX`                               | **6:03.9**, inside 5:50–6:10                                                                     |
| `qa-briefing-presenter.mjs` (30 random NEXT/BACK presses, seed 7) | 13/13 pass                                                                                       |
| `qa-briefing-transitions.mjs` (every played scene change)         | 39/39 scene changes arrive with every setup object drawn                                         |
| `qa-briefing-inspector.mjs` (EXPLORE)                             | all 10 object kinds pick and describe themselves; 8 card actions pressed, 0 failed               |
| Deployment parity, 58 beats, local vs Render                      | same objects on all 58 (see DEPLOYMENT QA)                                                       |
| Final-state stills, all 40 scenes, 1280×720                       | all 40 watched on the final build. The 13 scenes whose stills led to a fix were re-shot after it |
| Scene 18's last beat, recorded at 1 frame/s                       | watched: both callouts land right of the chart and never cover it                                |
| Type sizes at 1920×1080 and 1280×720                              | caption 27 / 18 px, figures 96 / 64 px, chart titles 15 / 11 px, verdicts 18 / 13 px             |

Notes:

- **`npm test` skips.** One test is skipped, and two allocation microbenchmarks report themselves skipped because their budgets are calibrated for Node 24 and this container runs Node 22.22.2.
- **GBFS timing test.** The inherited GBFS proxy timing test failed once in this stage under heavy machine load. It passed in both final runs, and 11/11 alone. Its code is untouched.
- **Type-size measurement.** It ran on 540c758, before the last three app commits; none of them changes a font size. It was stopped by the 2-hour limit after 16 of 18 screen-and-beat cells. The two missing cells are the summary at 1280. Every measured size matches the earlier full run, because they come from the same CSS.
- **Inspector page errors.** The two page errors the inspector logs are the preview server's 404 for `/api/setup/status`. That 404 is by design, and `src/tooling/previewServing.test.mjs` asserts it.
