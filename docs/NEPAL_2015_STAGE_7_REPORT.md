# Stage 7 — Frontend implementation: report

Natural Disaster Intelligence, Case 001 — Nepal Earthquake 2015.
Reported against §33 of the Stage 7 brief.

---

## IMPLEMENTED

All eleven phases of the §30 build order, P1 through P11.

**All nineteen scenes are complete** against the bar §33 sets — a scene counts
only when data, visualisation, interaction, transition and provenance work
together. Verified by walking every scene in real Chromium against the built
bundle, not by the presence of a component:

| # | Scene | Data | Map | Controls | Camera | Provenance | Deep link | Drawn |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 00 | Case card | ✓ | — none declared | — none | ✓ | ✓ | ✓ | — |
| 01 | Locate | ✓ | ✓ | — none | ✓ | ✓ | ✓ | 154 entities |
| 02 | The earthquake | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 316 points, 1 collection |
| 03 | The sequence | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 1 collection |
| 04 | Shaking | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 20 entities |
| 05 | Who was under it | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 20 entities + raster |
| 06 | Where they overlap | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 96 entities |
| 07 | Descend | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 154 entities |
| 08 | Observed damage | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 4,583 points, 1 collection |
| 09 | Model vs observation | ✓ | ✓ | — none | ✓ | ✓ | ✓ | 20 entities + points |
| 10 | A second observation system | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 41,042 points, 1 collection |
| 11 | Infrastructure | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 286 entities |
| 12 | The coverage gap | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 333 entities |
| 13 | The network | ✓ | ✓ | — none | ✓ | ✓ | ✓ | 2,727 lines, 1 collection |
| 14 | A route | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 2 lines over dimmed network |
| 15 | People and damage | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 5 rings |
| 16 | Four clocks | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | points |
| 17 | Intelligence quality | ✓ | — none declared | ✓ | ✓ | ✓ | ✓ | — |
| 18 | Scenarios | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | scenario route |

Zero console errors and zero failed requests to our own server across the
whole walk.

**The case is mounted and reachable.** A chip opens it; the URL is the state
(`#/case/npl-2015-eq/scene/…`), so any view can be sent to somebody; removing
the hash closes it. Nothing is constructed until it is opened.

---

## PARTIAL

Nothing is partial against the Stage 6 design. Three things are smaller than
a reader might assume from the scene list, and each is a property of the data
rather than of the build:

- **Scene 07's district picker offers nine of seventy-five districts.** Only
  nine carry a damage observation. The label says so.
- **Scene 14 offers fourteen routes.** That is every pair Stage 5 measured.
- **Scene 18's bridge scenario removes one bridge.** Five were observed and
  one matched the mapped network; the control states both numbers.

---

## DATA

**Every figure on screen is read from a Stage 3–5 artefact.** No analysis was
reimplemented in JavaScript. Exactly one new analysis was written, in Stage 7
P5 and in the analysis layer where it belongs: `intensityBands`, which fills
ShakeMap contours into areas.

Ten processed datasets and five analysis artefacts are served from `data/` by
a Vite plugin that refuses anything that is not a `.json` inside
`analysis/` or `processed/`. `data/raw` is never served or copied.

**Two artefact fields were added, both additive, both already computed.**
Scene 14 draws the route the observed closures produce and Scene 18 draws the
bridge scenario; the infrastructure artefact published only how MANY edges
each closure set disabled, not which. Reaching those lines any other way
would have meant re-implementing the 25 m blockage-matching rule in the
frontend — a second analytical implementation of a decision Stage 5 had
already made. So `blockageMatching.disabledEdgeIds` and
`bridgesOnly.disabledEdgeIds` are now emitted. The pipeline was re-run offline
from the committed processed files and diffed field by field:

- First run: exactly two changes — `generatedAt` and the new list.
- Second run: exactly one change — the new list.
- **No figure moved.**

With those ids the frontend reproduces **all fourteen route pairs to the
centimetre**, and `verifyRoute` is wired into the panel so a mismatch would be
stated rather than drawn quietly.

**No figure was modified to make the frontend work.** §29 was never invoked,
because no discrepancy was found.

---

## VISUALS

The visual language is the one Stages 0–6 established: very dark, green as
the single interface accent, violet reserved for modelled or simulated, amber
for estimate, and hazard colours that are never green. Body copy is Inter at
13px and near-white; no text glows.

- **Observed and modelled never share a grammar.** Every drawable in the
  product passes through one `drawable()` factory that applies
  `mapGrammarFor`, so it cannot be forgotten at a call site.
- **A scenario is impossible to screenshot without the word.** Scenes 14 and
  18 carry a violet band across the full width of the header.
- **A data gap is drawn, not omitted.** Scene 12's sixty-six unsurveyed
  districts are grey and hatched, and every label says "no infrastructure
  records. Not a finding of no damage."
- The density ramp is logarithmic, because a linear ramp over a distribution
  running from 1 person to 36,255 asserts that nobody lives outside
  Kathmandu. Its legend is derived from the same ramp, so the two cannot
  drift.

---

## INTERACTION

Fifteen scenes carry controls; four are statements and show no strip at all,
because an empty strip beats a strip of disabled controls.

**No option in any control is typed.** Intensity levels are the ShakeMap's
usable contours — and the three it cannot close are absent. Damage classes are
UNOSAT's own order. Districts are the nine observed. Tolerances are the
association curve's. Bands are the proximity analysis's. Routes are the
fourteen measured.

Auditing what each control actually did found four that did nothing, and each
is now honest:

- `ghostNetwork` promised today's OpenStreetMap over April 2015's. That data
  is not held — only a measure of the growth (3.36×). The control is gone and
  the figure stays in the panel as a statement.
- `associationTolerance` was declared on the Copernicus scene, which holds no
  landslides. It moved to the scene that reads it.
- `clock` and `quadrant` wrote state nothing read. Both now choose what their
  panel leads with, carrying the artefact's own wording.
- Scene 02 had no control at all and drew all 316 events at once. It has the
  timeline now.

Cross-filtering works: a district selected on Scene 07 follows into every
later scene, and the deep link carries it.

---

## PERFORMANCE

The rule was obeyed in both directions: rendering is simplified, **no reported
statistic is**.

| Load | Handling | Cost |
| --- | --- | --- |
| 41,042 Copernicus grading points | one `PointPrimitiveCollection` | 33 ms to build the drawables |
| 4,583 UNOSAT damage points | one `PointPrimitiveCollection` | 11 ms |
| 2,727 road edges | one `PolylineCollection` | — |
| 177,679 population cells | one ground-clamped raster | 49 ms, once, cached |
| 2,129-way road graph | built in a Worker | 259 ms off the main thread |

The design flagged two high risks. **Neither survived contact.**

- The WorldPop density texture needed no build-time asset pipeline: the grid
  is 978 × 492, so rasterising it in the browser is one pass over half a
  million pixels. No new artefact, no new build step, nothing to keep in sync.
- The road graph did need a Worker, and it is one file. The Worker posts plain
  `{nodes, edges}` and the main thread calls `createGraph` (5 ms), because the
  graph object carries methods. A Worker that will not start falls back to the
  identical `buildRoadGraph` inline and says which happened.

The heaviest scene holds 333 entities. Nothing in the product instantiates
41,000 of anything.

---

## TESTS

**5,153 tests, 5,152 passing, 0 failing, 1 skipped** (two allocation
microbenchmarks calibrated for Node 24; this sandbox runs 22.22.2).

142 of them are the Nepal case's own. The ones that carry the stage's rules:

- Every scene in the sequence is visited, its panel rendered from the real
  artefacts, its datasets fetched, its camera pose recorded.
- Every layer a scene declares has a builder — a declared layer that draws
  nothing is a test failure, not a silent blank.
- Every control a scene declares has a widget, and no widget exists for a
  control no scene declares.
- Every panel carries a source line, a methodology link and a result-class
  chip, and every cited methodology id resolves to a record that exists.
- No label in the coverage layer can be read as a finding of absence.
- No route description contains hours, minutes, km/h or "reachable within".
- Scene 18's controls produce no evacuation, rescue, casualty, arrival or
  priority language.
- All fourteen route pairs reproduce the artefact's kilometres exactly, and
  `verifyRoute` is shown to be able to fail.

Five flaky `setTimeout(20)` waits were replaced with `whenSceneReady()`, which
is not only a test affordance: presentation mode needs it too.

---

## BUILD

`npm run build` succeeds. `npm run format`, `scripts/check-import-directions.mjs`
and `scripts/check-package-boundaries.mjs` all pass.

The portability boundary Stages 0–5 established is intact: everything under
`src/nepal/` still takes values and never touches `fs` or the network; the
only module that reaches the network is `story/loader.js`, and it takes an
injected `fetch`.

The boundary checker gained one fix: it now strips Vite query suffixes, so
`foo.worker.js?worker` is judged as the file it is.

---

## PRESENTATION MODE

Works, and reuses `createDemoPlayback` rather than duplicating it. Only two
things in that module were specific to the disaster session — how a beat is
applied, and how readiness is read — so both are injected and default to the
previous behaviour exactly. The inherited demo is untouched and its own tests
pass unchanged.

- **21 beats over all 19 scenes in 12.4 minutes**, inside the design's 12–14.
- **SHORT: the design's eight scenes in 6.0 minutes.**
- Scene 09 contributes three beats, because its argument has three moves and
  the reversal needs twice the setup's time.
- **The hold starts when the map is drawn**, not when the beat was requested.
- **Pause drops into explore at that exact state** — verified in a browser:
  space at scene 02 leaves scene 02 on screen, mode EXPLORE, playback paused.
  Leaving present mode keeps the place in the script.
- Keyboard: → ← step, space escapes to explore, E explore, P present. Nothing
  is captured while focus is in a field.
- A beat whose dataset failed still runs and the strip names it.

---

## REMAINING

Nothing in the Stage 6 design is unbuilt. What a next stage would take up:

1. **Charts.** Scene 03 declares a `seismic-decay` chart, Scene 08 a class
   composition and Scene 16 four clocks. The figures are all in the panels;
   the plotted forms are not drawn. This is the largest remaining piece.
2. **Scene 09's three beats are three panel emphases, not three map states.**
   The `mapAction: 'isolateAreas'` the scene declares is carried through the
   beat and not yet acted on.
3. **Tier 2 prefetch warms only the next scene.** Jumping across the rail to a
   heavy scene waits on its fetch. The strip says READY honestly while it
   does, but a wider lookahead would remove the wait.
4. **The presentation has no narration lines.** The design mentions them; the
   beats carry each scene's question and title, which is what the strip shows.
5. **Base imagery could not be verified here.** This sandbox blocks the tile
   and terrain hosts (`ERR_CERT_AUTHORITY_INVALID`), so every screenshot in
   this stage shows the ellipsoid without imagery. Every layer, camera pose
   and interaction was verified against that; how the palette sits over real
   satellite imagery has not been seen and should be checked on a machine
   with network access.

### One design deviation, recorded

§10's `SYSTEM: LOADING n/10 → READY` counted all ten Tier 2 datasets, which
made READY unreachable: nothing requests the 5.2 MB road network until Scene
13, so Scene 00 of a fully loaded case read `LOADING 0/10`. It counts what has
been requested now. The displayed shape is unchanged and it is now true. Full
reasoning in `NEPAL_2015_STAGE_6_DESIGN.md` §19.
