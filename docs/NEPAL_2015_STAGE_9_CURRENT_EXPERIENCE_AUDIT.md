# Stage 9 — Audit of the current presentation experience

What a viewer actually gets from the Stage 7/8 presentation, measured, before
anything is rebuilt. The product built at commit `5dd45d0` was served with
`npm run preview` and driven in Chromium from `/` in a fresh profile. The run
was started by clicking PRESENT (and, separately, 6 MIN) and then left alone.

**Verdict: the brief's description is accurate.** The presentation is a
sequence of finished frames, each held for a fixed time while the explanation
sits in a panel. Measured: across the 14-minute full run the median beat goes
**39 seconds without any visible change**, the camera moves for about **6 % of
the run**, there is **no narration and no sound**, **18 of 19 scenes put no text
on the map**, and pressing NEXT **stops the presentation**.

---

## 1. How it was measured

| Instrument | What it records | Resolution |
| --- | --- | --- |
| In-page sampler | camera position/orientation change; playback beat and status | 250 ms |
| MutationObserver on the case host | every DOM change in the case UI except the progress strip | every change |
| Screenshots | frame, and mean absolute difference from the previous frame (200×119 greyscale) | ~7.5 s (full), ~10.5 s (6 MIN) |
| Keyboard probe | real key presses during autoplay; time to react and to settle | 100 ms |
| Scene sweep | words in the right-hand panel; labels drawn on the map | per scene |

A "change" is a camera move or any DOM change in the case interface. Frame
differences are coarse under software rendering (a Chromium screenshot costs
several seconds with SwiftShader), so they corroborate rather than time.
Camera figures are lower bounds for the same reason: a flight renders few
frames under SwiftShader. The design flight times are given beside them.

## 2. The numbers

### 2.1 Full run (PRESENT) — 840 s, 21 beats

Designed as 18 scenes × **40 s** hold (`DEFAULT_HOLD_SEC.full = 40` in
`src/nepal/story/presentation.js`) plus Scene 09's three beats (6 + 8 + 12 s)
plus 52.8 s of camera flights.

| # | Beat | Length s | Longest period with no change s | Camera moving s (measured) |
| --- | --- | ---: | ---: | ---: |
| 00 | case-card | 40.0 | 39.5 | 0.0 |
| 01 | locate | 46.7 | 40.2 | 0.5 |
| 02 | earthquake | 44.0 | 39.2 | 0.3 |
| 03 | sequence | 42.5 | 32.1 | 0.8 |
| 04 | shaking | 50.2 | 40.4 | 1.0 |
| 05 | exposure | 43.8 | 40.1 | 0.5 |
| 06 | overlap | 43.0 | 39.8 | 0.8 |
| 07 | descend | 48.1 | 39.0 | 0.8 |
| 08 | observed-damage | 47.9 | 38.2 | 0.5 |
| 09a | model-vs-observed: looks correlated | 10.0 | 6.4 | 0.5 |
| 09b | model-vs-observed: the statistics | 9.8 | 9.7 | 0.0 |
| 09c | model-vs-observed: the reversal | 12.4 | 12.3 | 0.0 |
| 10 | second-source | 42.8 | 40.0 | 0.5 |
| 11 | infrastructure | 44.4 | 41.3 | 0.5 |
| 12 | coverage-gap | 46.5 | 37.3 (entire hold static) | 0.8 |
| 13 | network | 49.9 | 38.9 | 0.3 |
| 14 | route | 40.8 | 40.1 | 0.3 |
| 15 | people-and-damage | 45.3 | 39.3 | 0.3 |
| 16 | four-clocks | 42.7 | 32.3 | 0.8 |
| 17 | data-quality | 44.9 | 40.2 | 0.8 |
| 18 | scenarios | 43.9 | 40.0 (entire hold static) | 0.3 |

- **Median longest unchanged period: 39.3 s. Maximum: 41.3 s.** The Stage 9
  standard is 5–7 s.
- **Camera motion:** 10 s measured, 52.8 s designed — **6 % of an 840 s run.**
- **Frames:** 72 of 106 consecutive screenshots, taken about 7.5 s apart, were
  visually identical.
- The only beats under 13 s are Scene 09's three — the one place the Stage 7
  design already split a scene, and the one place the run feels directed.

### 2.2 6 MIN run — 371 s, 13 beats

| Beat | Length s | Longest no-change s |
| --- | ---: | ---: |
| locate | 27.8 | 20.4 |
| earthquake | 30.0 | 26.0 |
| sequence | 32.1 | 19.8 |
| shaking | 35.5 | 28.1 |
| exposure | 30.1 | 25.9 (entire hold static) |
| observed-damage | 33.7 | 27.2 |
| model-vs-observed ×3 | 11.1 / 8.0 / 12.2 | 3.9 / 8.0 / 12.1 |
| infrastructure | 29.1 | 26.1 |
| coverage-gap | 41.5 | 31.4 (entire hold static) |
| route | 37.5 | 29.9 |
| data-quality | 42.8 | 38.0 (entire hold static) |

Median longest unchanged period **26 s**, maximum **38 s**; 22 of 39 frame pairs
identical.

### 2.3 The first 90 seconds (full run)

| Time | On screen |
| --- | --- |
| 0–40 s | The case card: a globe and a panel. Nothing moves. |
| 40–47 s | The camera flies to Nepal. |
| 47–87 s | Nepal's outline and one epicentre dot. Nothing moves. |
| 87–90 s | The camera starts toward the epicentre. |

Of the ten things the Stage 9 first-90-seconds test requires, a viewer has
seen **two**: location and a border (drawn complete, not progressively). No
magnitude animation, no depth, no shaking field, no population, no
aftershocks. **FAIL.**

## 3. Presenter control during autoplay

Real key presses, measured:

| Action | Reacts | Then | Problem |
| --- | --- | --- | --- |
| → NEXT while playing | 0.08 s | **status becomes PAUSED**; next scene settles 3–6.5 s later | the presenter must press Space again to continue |
| ← BACK | 0.04 s | PAUSED; settles 3.8 s later | same |
| Space while playing | — | pauses **into EXPLORE** | Space is not a pause; it leaves the presentation |
| Space while paused | 0.01 s | resumes | — |
| P | resumes | — | — |
| R (replay) | — | not implemented | — |
| Speed | — | not implemented | — |
| On-screen controls | — | **none**: the strip shows a key hint only | a mouse or touch presenter cannot skip or go back |

The rule "stepping by hand always pauses" is deliberate in
`createDemoPlayback` (`src/disaster/demo.js`). For a presenter it means every
skip ends the autoplay.

## 4. Narration and sound

- `speechSynthesis.speak` was called **0** times in both runs. There is no
  narration code in the product.
- No `<audio>` element and no Web Audio graph exist. There is no sound.
- There are no captions. The only running text is the strip's scene title and
  question.
- Narration and visuals cannot be out of sync because there is no narration.
- The test browser (headless Chromium) exposes **0** speech voices, so any
  narration must degrade to captions without breaking timing.

## 5. Reading required

Words in the right-hand panel per scene, against text drawn on the map:

| Scene | Panel words | Map labels |
| --- | ---: | ---: |
| case-card | 58 | 0 |
| locate | 43 | 0 |
| earthquake | 65 | 0 |
| sequence | 151 | 0 |
| shaking | 83 | 0 |
| exposure | 102 | 0 |
| overlap | 145 | 0 |
| descend | 80 | 0 |
| observed-damage | 163 | 0 |
| model-vs-observed | 163 | 0 |
| second-source | 112 | 0 |
| infrastructure | 93 | 0 |
| coverage-gap | 126 | 0 |
| network | 137 | 0 |
| route | 76 | 0 |
| people-and-damage | 92 | 1 |
| four-clocks | 222 | 0 |
| data-quality | 330 | 0 |
| scenarios | 50 | 0 |

**Every scene requires the panel to be read to understand it.** The map carries
geometry and no words: no place names, no callouts, no leader lines, no counts
where the counted things are.

### Scenes that show dots or lines without explaining them on the map

| Scene | What is drawn | What the map does not say |
| --- | --- | --- |
| 02–03 | 316 seismic events | which are large, when they happened, that they are a sequence |
| 04 | ShakeMap bands | what an MMI band means, where people are |
| 08 | 4,583 damage points in four colours | which colour is which class, where the clusters are, how many |
| 10 | Copernicus points and AOIs | how they differ from UNOSAT, what a rate is |
| 11 | blockages, bridges, landslides | which is which, how many, how they relate to roads |
| 12 | surveyed / not-surveyed districts | that Sindhupalchok has 65 blockages and 0 damage points — the finding is only in the panel |
| 13 | 2,727 road edges | what a component is, which roads were cut |
| 14 | two route lines | which is baseline, where the detour is, by how much |
| 15 | proximity rings | whose population, which cluster |

## 6. Analysis that exists and is never actively presented

Computed in Stage 3–5 artefacts, never drawn or narrated in either run:

| Result | Artefact path | Status |
| --- | --- | --- |
| Gutenberg–Richter b-value 0.80 (R² 0.97) | `seismic-analysis results.gutenbergRichter` | methodology record never cited by a scene |
| Completeness magnitude Mc 4.0 | `results.completeness` | never shown |
| b-value sensitivity | `results.bValueSensitivity` | never shown |
| Aftershock magnitude statistics | `results.aftershockMagnitude` | never shown |
| Population × intensity quadrants (11,834,041) | `population-exposure results.populationIntensityQuadrants` | panel only (Scene 06); not in the 6 MIN run |
| Strict-containment exposure | `results.exposureStrictContainment` | never shown |
| OCHA discrepancy analysis | `population-exposure discrepancyAnalysis` | never shown |
| Betweenness-centrality change | `infrastructure results.network.centrality` | never shown |
| k-alternative routes (redundancy, k = 4) | `results.network.alternativeRoutes` | never shown |
| Landslide proximity to population | `results.landslides[].peopleWithin1Km` | never shown |
| Copernicus per-AOI destroyed rates | `damage-analysis results.copernicus.grades[]` | panel only; not in 6 MIN |
| Damage concentration (362 cells, 50 % in 37) | `results.spatialDistribution` | panel only |

Records cited by no scene in the 6 MIN run: copernicus-dose-response,
observation-timeline, population-proximity, population-concentration,
exposure-by-district, the quadrants and Gutenberg–Richter.

## 7. Why it feels static — the causes, not the symptoms

1. **The unit of presentation is the scene.** One state per scene, drawn once,
   then a 40-second timer. There is no concept below the scene except Scene
   09's panel emphasis.
2. **Holds are timers, not content.** The hold was worked backwards from a
   target runtime ("40 s over 18 plain beats lands at 12.4 minutes"), so the
   length of a scene is set by the schedule rather than by what the scene has
   to show.
3. **The explanation lives in the panel.** The map draws geometry; the words
   are 43–330 per scene on the right. A viewer watching the map learns
   nothing, and a viewer reading the panel is not watching the map.
4. **Everything arrives complete.** Layers, charts and figures render in their
   final state on the first frame of a scene. Nothing is revealed, counted or
   built in front of the viewer.
5. **The camera moves once per scene**, for 1.8–5 s, then holds for 40.
6. **No voice, no sound, no captions.**
7. **Control fights the presenter.** Any skip pauses the run; Space leaves it;
   there are no on-screen buttons.

## 8. What Stage 9 must change (the audit's requirements for the rebuild)

- Replace the scene-with-a-timer with **scene → beat → action**, authored as
  data, with state-driven waits and a minimum readable hold.
- Every beat changes something visible within 0.5 s and at least every 5–6 s.
- Put the explanation **on the map**: geo-anchored labels, callouts and counts.
  The panel becomes optional depth.
- Reveal progressively: borders draw, bands grow, counters count, charts build
  with the map in step.
- Narration synchronised to the actions, with captions as the fallback where a
  browser has no voice.
- NEXT and BACK move by one beat immediately and **keep playing**; Space is
  pause; on-screen controls always visible; speed control.
- Present the analyses listed in §6.
