# Stage 9.2 — Audio, comprehension, explanation, temporal clarity and visual synchronisation: report

Every figure below was measured on this branch's final build unless the row says otherwise.
Nothing analytical was recalculated: every number the briefing states still comes from the
Stage 3–5 artefacts through the fact book.

# HUMAN EXPERIENCE

**Does a normal viewer now understand what they are watching?** Yes, for the six-minute
run, with two honest qualifications below. In 9.1 a viewer saw a beautiful sequence of
results; in 9.2 every analysis ends by saying what it means, and the words a newcomer would
not know are explained on screen the first time they appear. I re-read the 6 MIN run as
someone who knows nothing about seismology or statistics, beat by beat
([comprehension QA](NEPAL_2015_COMPREHENSION_QA.md)): every analytical scene now answers its
own question in words, and none relies on the technical layer to be understood.

**The analyses that were hardest to understand, and what was added:**

| Analysis | Why it was hard (9.1) | What 9.2 adds |
| --- | --- | --- |
| 05 Shaking intensity | Coloured bands and a list of Roman numerals; magnitude and intensity easy to confuse | The voice says what the colours are and are not; a card puts MAGNITUDE 7.8 · ONE NUMBER beside INTENSITY · DIFFERENT AT EVERY PLACE; each level lights as it is named |
| 07 Magnitude distribution (FULL) | Bars labelled "M4-5"; "complete above magnitude 4.0" unexplained | Exact bin edges on every bar (4.0 ≤ M < 5.0), the rule said aloud, what M and the catalogue are, and why the first bar is a floor: the count jumps 20.5× at M4.0 (a reporting threshold) |
| 08 Second shock / Omori | "17 days later" was only a phrase; the timeline had jumped invisibly | A clock card runs from day 1 to 12 May on screen; earlier events dim, the M7.3 arrives as the date is said; "So this was not one event" |
| 18 Model vs observation | Ended on a statistic; "Cramér's V" unexplained | Result → meaning ("shaking alone does not decide the damage") → (FULL) hypotheses, labelled as hypotheses, kept apart from the measured result |
| 25 Network pieces | "40 pieces become 49" with no definition or consequence | Chip *NETWORK PIECES*; "Some places lost their main-road link to the rest" |
| 30 Scenario access | "From the 11 named damage areas, 0 routes changed" spoken bare | "So the bigger gap was the map itself", with the no-route places brought into focus |

Across the 6 MIN run: 19 terms explained on first use, 5 WHAT THIS MEANS beats, 1 WHAT IT
CANNOT TELL US, one SO FAR at the act break, and a Level-2 method note for 14 scenes in the
technical layer ([explanation audit](NEPAL_2015_ANALYSIS_EXPLANATION_AUDIT.md),
[glossary](NEPAL_2015_GLOSSARY.md)).

**How the 17-day transition was fixed.** The 9.1 setup of scene 08 jumped the aftershock
timeline from day 1 to day 7 between scenes, so "17 days later" was said over a picture in
which no time visibly passed. Now scene 08 opens on day 1, its first sentence ("The days
pass.") is followed by a rendered 0.9 s pause while a clock card runs DAY 1 → ONE WEEK →
DAY 17 · 12 MAY 2015 with a ruler whose ticks light as they are passed; the events of the
first day dim (OLD), the next sixteen days arrive bright (RECENT), the newest ring (NEW), and
the M7.3 is ringed and labelled M7.3 · 12 MAY. The clock lands on 12 May as the date is
spoken (measured with the rendered voice: 0.0 s apart).

**Narration ↔ visual mismatches found by watching, and fixed** (each listed with its
moment in the [sync audit](NEPAL_2015_NARRATION_VISUAL_SYNC_AUDIT.md)):

- scene 05: "Six is strong. Eight, severe." — the levels lit 1.5 s after the words (timed to
  the estimate, not the voice); retimed to the rendered clips;
- scene 06: the clock read "+0 H" for the whole first hour; it now counts minutes;
- scene 08: 12 May arrived 0.6 s after it was said; now on the word;
- scene 07: the question "why so few below 4.0?" was asked 4 s before the chart said
  INCOMPLETE BELOW M4.0;
- scene 07: the map showed one week while the chart counted the whole year, and pulsed the
  M7.3 before the timeline had reached it;
- scene 12: the clock reached the median day 1.1 s after "4 days";
- scene 18: the chart verdict still read "detectable but weak" while the voice said "not a
  straight line".

The measured check (`scripts/qa-briefing-sync.mjs`) times every figure the voice says
against the moment the picture first shows it, using the rendered clips: 63 figures in the
6 MIN run and 117 in the FULL run, none late.

**Layer persistence problems found:** the caption kicker floated over the map outside the
caption panel; the time card sat under the top bar; on screen labels for every major shock
(M6.6, M6.7, M7.3, M7.8) collided near the epicentre and the M7.3 label hid under its
magnitude counter; the scene-18 term chip overlapped a lifted chart; the ⚙ settings pop-over
opened under the caption, hiding its CAPTIONS row. The final 40-scene watch found two more:
the M7.3 label sat on the KATHMANDU place name at the end of scene 08 (event labels now take
the first free corner), and in scene 18 the red "DROPS AT MMI 7.5" inside the plot covered
the 38.7 % figure (the verdict above the bars already says it; the plot keeps the red step).
All fixed and re-shot.
The lifecycle is now also checked without a browser (`src/nepal/briefing/lifecycle.js`):
replaying each run with the director's rules, no beat has more than four reading panels on
screen and nothing outlives its scene unless the next scene keeps it.

**Geo-anchoring bugs found:** in 9.1 every map annotation was drawn at sea level, so on
terrain it slid against the mountains as the camera tilted, and the overlay drew from its
own animation frame, a frame behind the globe during flights. In 9.2 every geographic
object is lifted to the terrain height under it (sampled once, cached) and drawn in the
same frame as the globe, after it renders. The drift probe measures the drawn label against
a fresh projection of its latitude, longitude and terrain height during four flights (see
VISUAL LIFECYCLE below for the figure).

**Still weak, honestly:**

- the damage stretch of the 6 MIN run (01:46–03:13) is dense: four analyses in 87 seconds;
- the scene-18 statistic is the most technical moment of the run, and its two terms are
  explained on the card and counter rather than with a chip, because the frame is full;
- the Nepali place names are English approximations in the neural voice;
- this container has no GPU and no speakers: I watched stills and read rendered audio
  timings, and verified audio routing, ducking and cue scheduling through the Web Audio
  graph — but I have not listened to the result. The 10-minute local check in
  [NEPAL_2015_STAGE_9_1_LOCAL_QA.md](NEPAL_2015_STAGE_9_1_LOCAL_QA.md) applies, now with
  sound on.

# VOICE

**Candidates** ([research](NEPAL_2015_AUDIO_RESEARCH.md)): Kokoro-82M (Apache-2.0),
kokoro-js in the browser, Piper, Coqui XTTS-v2, F5-TTS, StyleTTS 2, Parler-TTS, MeloTTS,
Bark, Mimic 3, eSpeak NG, the Web Speech API, and cloud TTS — each checked for code and
weight licence, commercial use, redistribution, hardware, size, speed, quality, prosody
control, deployment fit and offline use.

**Chosen: Kokoro-82M v1.0, rendered at build time.** Apache-2.0 for code and weights;
redistributable; 82 M parameters; on this 4-vCPU container it rendered 46.3 s of speech in
86.7 s including model load. Rendering in advance means no model and no GPL phonemizer ever
reach the browser, each clip is deterministic, and a beat lasts exactly as long as its
voice. Every sentence of the script is one MP3 clip (about 57 kbit/s, normalised to
−20 dBFS speech), keyed by a hash of its words, pronunciation and delivery so a stale clip
can never play.

**Voices:** `af_heart` (default; model-card grade A), `bf_emma` (B−), `am_michael` (C+) —
the model's stock voices. None imitates or clones a real person. `am_michael` speaks 9 %
slower than the other two and would have made the 6 MIN run 6:25, so it is rendered at the
model's speed 1.15; each voice now keeps the run to its length (see 6 MIN RUNTIME).

**Licence:** Kokoro-82M Apache-2.0; ONNX export Apache-2.0; misaki G2P Apache-2.0; build
tools in [AUDIO_LICENSES.md](AUDIO_LICENSES.md). eSpeak NG (GPL-3.0) is misaki's
fallback for unknown words on the build machine only; no word of this script needed it.

**Fallback chain:** neural clip → system voice (per sentence, if a clip fails; or chosen) →
captions only. The status is computed from the tier in use and shown on the BEGIN card,
in ⚙, on the VOICE button and — whenever it is not the neural voice — as an amber badge in
the control bar: `VOICE · HIGH-QUALITY LOCAL MODEL`, `VOICE · SYSTEM FALLBACK`,
`CAPTIONS ONLY · NO VOICE AVAILABLE`, `VOICE MUTED · CAPTIONS`. A fallback counts its
sentences ("2 sentences fell back to the system voice"). The 9.1 Web Speech narrator is
intact as the system tier.

**Delivery:** pauses, rate and energy are rendered into the clips (and applied to the
system voice); emphasis exists only in the neural voice. Used sparingly: eight sentences in
six beats, three of them with emphasis. There is no `tone` field: neither engine has one.

**Real voice test:** in Chromium against the production build, the run spoke with the
neural clips (narrator tier `neural`, clips fetched one beat ahead), the music ducked to
0.32 under speech and recovered over ~2 s, NEXT stopped a clip at once, PAUSE suspended the
mixer, a withheld clip fell back to the system voice for that sentence only. Results under
TESTS / BUILD.

# MUSIC

**Track or system:** an original score generated live in the browser
(`src/ui/nepal/briefing/score.js`): a low pad, one state per act — INCIDENT, MAIN SHOCK
(with a slow heartbeat), EXPOSURE, DAMAGE, COVERAGE GAP, NETWORK, RESCUE ACCESS,
EXECUTIVE SUMMARY — crossfading over 3.5 s. Six cues only: the main shock, the M7.3, the
first damage reveal, the coverage-gap reveal, the rescue disconnect and the close (a test
holds them to exactly those beats). The 9.1 drone bed is retired; the generic "hit"
accents are softened to ticks.

**Licence:** written for this project; no file, so nothing to license or attribute.
Film music, video-site tracks and Pixabay/YouTube-library music were excluded.

**Ducking and volume:** one AudioContext, VOICE / MUSIC / SFX buses into a limiter. The
music sits ~14 dB under the voice, ducks a further ~10 dB in 0.25 s when a sentence starts,
waits 0.7 s after the last one and rises over 2 s. Ramps only. Voice volume, music on/off
and volume, and captions are set on the BEGIN card and in ⚙; VOICE and MUSIC mute in place
during the run.

**Act transitions:** the score changes state only when the scene's act (or its own story
state, scenes 04–08 and 20) changes; NEXT and BACK inside an act leave it playing. PAUSE
fades everything out in 0.2 s and suspends the mixer.

# ANALYSIS EXPLANATION AUDIT

[docs/NEPAL_2015_ANALYSIS_EXPLANATION_AUDIT.md](NEPAL_2015_ANALYSIS_EXPLANATION_AUDIT.md):
one record per analysis (22) with what we are looking at, how it was calculated or
observed, what was found, what it means, and what it cannot conclude. Ten records failed
"What did I just learn?" in 9.1; none does in 9.2.

# TEMPORAL CLARITY

- Events have four states: OLD (dim, desaturated), RECENT, NEW (ring), MAJOR (white ring;
  the two M7+ shocks labelled with magnitude and date).
- A clock card (DAY n · +MIN / +H, date and UTC time, a ruler with day 1, one week and the
  second shock marked) runs with the events in scenes 06 and 08, and through the image lag
  in scene 12.
- Scene 07 shows the whole year it counts; scene 08 rewinds to day 1 at its cut and plays
  the seventeen days forward.

# VISUAL LIFECYCLE

Policies, as the director applies them and `lifecycle.js` replays them:

- **PERSIST** — named in the next scene's `keep` (outline, mask, events, the clock card,
  roads, hospitals, …);
- **FADE** — everything else a scene draws, cleared at the scene change or by an explicit
  remove;
- **REPLACE** — drawn again under the same id;
- **CLEAR** — `until: 'beat'`, gone when the next beat starts (definition cards, the scene
  07 rule cards, the SO FAR recap).

Focus: a beat can make one dataset the subject; every other map layer recedes to 22 % and
stays as context (scenes 11 and 30). The mask is a frame, never dimmed.

Measured on the 6 MIN run: 59 beats; reading panels on screen at the end of a beat — 0: 4
beats, 1: 29, 2: 16, 3: 7, 4: 4 (never more than four).

Geo-anchoring: GEOGRAPHIC objects are anchored to latitude, longitude and terrain height;
SCREEN annotations (cards, counters, the clock) are screen-stable; GEO CALLOUTS draw their
leader to the projected anchor every frame. Measured during four camera flights (locate,
main shock ×2, shaking; 56 frames; range 2,687 → 270 km, pitch −86° → −46°): the drawn
label is never more than **0.67 px** from a fresh projection of its point, with the
terrain under the epicentre (1,288 m) applied.

Labels: an event label (M7.8 · 25 APR, M7.3 · 12 MAY) takes the first corner of its shock
— above-left, below-left, below-right, above-right — that no place name, callout or counter
occupies, and keeps it until that corner is taken.

# SYNCHRONIZATION QA

[docs/NEPAL_2015_NARRATION_VISUAL_SYNC_AUDIT.md](NEPAL_2015_NARRATION_VISUAL_SYNC_AUDIT.md):
24 watched moments (11 PASS, 13 FIXED, 0 FAIL) and the clip-timed table of all 63 figures the
6 MIN run says (0 late; FULL: 117, 0 late).

# COMPREHENSION QA

[docs/NEPAL_2015_COMPREHENSION_QA.md](NEPAL_2015_COMPREHENSION_QA.md): one audience question
per analytical scene (all answered by what is said or shown; seven failed in 9.1), the
6 MIN run reviewed as a normal viewer, and the WATCH / INTERACT / VERIFY levels.

# 6 MIN RUNTIME

**Measured: 6 MIN BRIEFING = 6:09.2** in the browser on the final build, against the 9.1
target of 5:50–6:10. 9.1 measured 6:03.9.

How it was measured: `scripts/qa-briefing-runtime.mjs` plays the real director on the real
stage from BEGIN to the last beat, hands off, with the briefing clock stepped by hand so a
slow renderer cannot stretch the result. The difference from 9.1 is the voice. Each sentence
now lasts exactly as long as the default neural voice's rendered clip for it. In 9.1 it lasted
as long as an estimate at 2.5 words a second. So 6:09.2 is the length of the briefing as it
will actually be spoken. On paper the timeline says 6:08.0; the 1.2 s difference is the
director waiting for flights, fades and narration ends.

| Scene | 9.1 | 9.2 | Change | Why |
| --- | ---: | ---: | ---: | --- |
| 01 Incident | 11.2 s | 11.8 s | +0.6 | |
| 02 Locate Nepal | 16.5 s | 15.8 s | −0.7 | shorter flight padding |
| 04 Main shock | 9.9 s | 9.9 s | 0 | |
| 05 Shaking | 17.1 s | 22.1 s | **+5.0** | what intensity is and is not; levels lit as named |
| 06 First hours | 13.1 s | 11.4 s | −1.7 | |
| 08 Second shock | 6.8 s | 14.2 s | **+7.4** | the seventeen days pass on the clock; "it was a sequence" |
| 10 Population | 12.4 s | 12.4 s | 0 | |
| 11 Density × shaking | 6.9 s | 7.8 s | +0.9 | |
| 13 Damage composition | 14.3 s | 19.4 s | **+5.1** | three classes merged into one beat; WHAT THIS MEANS |
| 16 Concentration | 20.6 s | 18.0 s | −2.6 | |
| 18 Model vs observation | 37.2 s | 36.4 s | −0.8 | definitions on the card, not chips |
| 20 Coverage gap | 19.2 s | 21.8 s | +2.6 | the SO FAR recap |
| 25 Network | 16.0 s | 16.5 s | +0.5 | |
| 26 Routes | 12.8 s | 12.1 s | −0.7 | |
| 29 Baseline access | 26.8 s | 24.7 s | −2.1 | flight padding |
| 30 Scenario access | 35.8 s | 34.2 s | −1.6 | |
| 32 Rescue route | 47.3 s | 40.0 s | **−7.3** | shorter narration; the detour step is FULL only |
| 40 Executive summary | 40.0 s | 40.7 s | +0.7 | |
| **Total** | **6:03.9** | **6:09.2** | **+5.3** | |

The explanation added about 21 s where a newcomer needed it (05, 08, 13, 20). Shorter camera
padding and tighter narration in the access scenes paid most of it back.

**By voice** (timeline timed by each voice's own clips):

| Voice | 3 MIN | 6 MIN | FULL |
| --- | ---: | ---: | ---: |
| `af_heart` (default) | 2:39.9 | 6:08.0 | 13:05.7 |
| `bf_emma` | 2:40.5 | 6:07.7 | 13:02.6 |
| `am_michael` (rendered at speed 1.15) | 2:39.4 | 6:06.6 | 13:03.8 |
| a system voice (estimate at 2.5 words a second) | 2:38.6 | 6:14.4 | 13:29.4 |

At the model's own speed `am_michael` made the 6 MIN run 6:24.9, and at speed 1.09 still
6:12.8 (speed does not shorten the fixed trim and pauses); it is rendered at 1.15. A system
voice speaks at its platform's rate, so its runs are only estimated; the director waits
for each sentence to end, so the real length follows the voice.

**Other runs:** 3 MIN measured in the browser at **2:41.5** (9.1: 2:44.6 on paper). FULL is
13:05.7 on paper (9.1: 12:07.5). The 58 s growth is the explanation added to the FULL-only
scenes: scene 07 rebuilt around the magnitude bins, the hypotheses beat in 18, and
WHAT THIS MEANS beats in 21–39. The executive summary is 40.7 s and still ends on
KNOW / INFER / SIMULATE / DON'T KNOW.

# LIMITATIONS

- **I have not heard it.** This container has no speakers and no GPU. Voice, music and
  ducking were verified through the Web Audio graph, rendered clip lengths and logs, and
  the pictures through software-rendered stills. Nobody has yet judged how the narrator
  sounds, whether the score is too present, or how the cues land. The 10-minute local check
  in [NEPAL_2015_STAGE_9_1_LOCAL_QA.md](NEPAL_2015_STAGE_9_1_LOCAL_QA.md), with sound on, is
  the remaining step.
- **Stills, not motion.** I watched every scene's final state and stills at the key words
  of the changed beats; the run was not watched as continuous video here. Flights were
  checked by the drift probe, not by eye.
- **The runtime margin is small.** 6:09.2 is 0.8 s inside 6:10. A longer sentence pushes it
  out, and `qa-briefing-runtime.mjs` then fails.
- **Comprehension was judged by me,** reading as a newcomer, not by real viewers. The
  questions in [COMPREHENSION QA](NEPAL_2015_COMPREHENSION_QA.md) are the test to run with
  an audience.
- **The damage stretch is dense:** four analyses in 87 seconds of the 6 MIN run.
- **Neural voice coverage is the script, exactly.** Any sentence not in the manifest (a
  changed figure or word without a re-render) is spoken by the system voice. This includes
  a sentence whose clip fails to load. `build-narration --check` fails CI if a clip is
  missing or stale.
- **Rendering needs the model on the build machine:** 326 MB, not committed, at about
  1.9× real time on 4 vCPU. The shipped clips are 13 MB for three voices, fetched one beat
  ahead.
- **Pronunciation:** Nepali place names are English approximations. Emphasis exists only in
  the neural voice; the system voice gets pauses, rate and volume but no emphasis.
- **Voice quality varies:** `am_michael` is the model card's C+ voice, kept for choice;
  `af_heart` is the default.
- **The score is procedural and restrained.** It is not a composed soundtrack, and it has
  been checked only by its graph and its log.
- **Scene 19 (FULL only)** ends on numbers over terrain with no map layer: the Copernicus
  gradings are not in the briefing geometry.
- **Jumping straight into a scene** (chapter jump, or `goTo` in QA) does not redraw objects
  kept from the scene before. Played in order, every kept object is there.

# TESTS / BUILD

All gates below were run on the final code, after the last change.

| Gate | Result |
| --- | --- |
| `npm test` | 5,282 tests: 5,281 pass, 0 fail, 1 skipped |
| `npm run format:check` | pass, 1,058 source files |
| `npm run check:boundaries` | pass |
| `npm run build` | pass; Vite's usual warning about chunks over 1.5 MB, as before |
| `node scripts/build-narration.mjs --check` | all 642 clips current (214 per voice, preview lines included); 13 MB |
| `node scripts/generate-briefing-script.mjs --check` | current; on paper 3 MIN 2:39.9, 6 MIN 6:08.0, FULL 13:05.7 |
| `node scripts/generate-briefing-glossary.mjs --check` | current |
| `node scripts/qa-briefing-sync.mjs --run six` / `--run full` | 6 MIN: 63 figures said, 0 late · FULL: 117, 0 late — with each of the three voices' clips |

Browser checks (software WebGL, headless Chromium, against `vite preview` of the production build).
The runtime and presenter rows were measured on the build before the last two visual fixes
(event-label corners, scene 18's plot label) and the `am_michael` re-render. None of those
touches timing, the controls or the default voice; the re-run on the final build is
recorded under the table.

| Check | Result |
| --- | --- |
| `qa-briefing-runtime.mjs --run SIX` | **6:09.2**, inside 5:50–6:10 |
| `qa-briefing-runtime.mjs --run THREE` | 2:41.5 |
| `qa-briefing-presenter.mjs` (20 random NEXT/BACK presses) | **20/20** pass |
| Final-state stills, all 40 scenes, 1280×720 | all 40 watched. Two collisions found and fixed (08 M7.3 label on KATHMANDU; 18 drop label on 38.7 %); both re-shot on the final build. 23 (14 km close-up) and 26 (detour) re-shot with a longer wait: as designed and as in 9.1 |
| Geo-anchoring probe, four flights, 56 frames | worst drift 0.67 px |

The presenter checks cover the following:
- the system tier: voice choice and preview, NEXT/BACK stopping speech within 120 ms, never two voices, no stray objects, PAUSE/PLAY mid-sentence, VOICE MUTED, CAPTIONS OFF;
- the neural tier: the default and its status, playback through the mixer with the music ducked to 0.32, NEXT stopping a clip, PAUSE suspending the mixer, the score's state and impact cue, a withheld clip falling back to the system voice for that sentence and counted in the status, and VOICE and MUSIC muting in place;
- no page errors.

Notes:

- **`npm test` skip.** One test is skipped, as in 9.1. Two allocation microbenchmarks
  report themselves skipped because their budgets are calibrated for Node 24 and this
  container runs Node 22.
- **Analytical figures.** None changed: no artefact under `data/analysis/` was modified in
  this stage, and every figure on screen and in the narration is still read from them
  through the fact book.
