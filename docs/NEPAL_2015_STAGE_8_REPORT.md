# Stage 8 — Visual completion and presentation QA: report

Natural Disaster Intelligence, Case 001 — Nepal Earthquake 2015.
Reported against Part M of the Stage 8 brief.

## PROJECT STATUS — FREEZE LIFTED

The freeze declared after the integrity patch was **lifted** for an
entry-point defect: the bare address `/` opened the inherited God's Eye View
workspace and its first-launch chooser, not this case. Every Stage 7 and
Stage 8 screenshot was taken after a script clicked the case chip, at
`/#/case/npl-2015-eq/scene/<id>`, so none of them showed what a visitor sees
first. The diagnosis and the fix are in
[`NEPAL_2015_ENTRY_POINT.md`](NEPAL_2015_ENTRY_POINT.md). No analytical figure
changed.

**No analytical figure was changed.** Every number on screen is still read
from a Stage 5 artefact. One provenance gap was found and is reported under
"Analytical discrepancies" rather than papered over.

**Three Stage 7 claims were wrong, and Stage 8 corrected them.** The Stage 7
table marked every scene's camera, provenance and drawing as working. A
settled screenshot pass showed:

- scene readiness resolved while the camera was still flying (Scene 01 at
  20,000 km), so the Stage 7 screenshots showed cameras in transit;
- "why is this here?" dispatched an event that nothing in the product
  listened for — the provenance link on every scene opened nothing;
- Scene 15's "5 rings" were never drawn (ground-clamped ellipses silently
  drop their outline, and their fill was 0).

---

## CHARTS

Inline SVG, no chart library. Geometry is pure and tested in
`src/nepal/story/charts.js`; rendering is in `src/ui/nepal/chartViews.js`.
Dark surface, thin axes, recessive grid, violet only for modelled values,
hover detail on every mark, and a legend wherever there are two or more
series.

| Scene | Chart | What it shows |
| --- | --- | --- |
| 03 | Events per day | Log axis; the 25 April main shock and 12 May M7.3 marked as rules. Defaults to the first 60 days and names the 47 events beyond it (through day 356). Full-catalogue scale put the two anchors at x=0 and x=5. |
| 03 | Magnitude distribution | The M4–5 bar highlighted and the 20.5× jump stated in the caption: the completeness cliff is the finding, so it is marked. |
| 03 | Depth distribution | Folded under a disclosure — secondary. |
| 03 | Omori decay | Folded. Observed bars and the fitted curve on one axis, the fit dashed **and** violet; the whole-window vs pre-12-May fit quality as bars. The fitted curve leaves the plot at t=0 (310/day vs an observed peak of 88); it is clipped and the caption says so rather than rescaling away the data. |
| 08 | Damage class composition | One segmented bar, counts in the legend (the 95 Possible Damage segment is too narrow to label). Counts are **summed from the per-district breakdown**, not derived from published shares: 45.5% × 4,583 = 2,085.3, the true count is 2,084. Sums to 4,583. |
| 08 | Observations by district | Captioned "surveyed districts only — 9 of 75", so it cannot be read as a national ranking. |
| 16 | Four clocks | Earthquake, image acquisition, feature production and publication on one time axis; each track is clickable to identify its source. |

Colour: the damage ramp failed the validator in Stage 8A — Severe vs
Destroyed measured ΔE 12.6 under normal vision (floor 15). Re-stepped to
18.0 normal / 15.0 deuteranopia; map and chart share one ramp object.

## INTERACTION

Verified in the browser, not only in unit tests:

| Gesture | Effect | Measured |
| --- | --- | --- |
| Scene 03 time cutoff | Filters the events drawn | 319 → 85 points at a mid-sequence cutoff |
| Scene 08 class segment / legend | Filters the map to that class | 4,586 → 2,087 points on "Destroyed" |
| Scene 08 district bar | Selects the district | selection state set; panel follows |
| Scene 16 clock track | Changes which clock the panel leads with | panel statement and headline change |
| Scene 10/11 layer chips | Toggle layers; now carry a colour swatch per layer | — |
| Headline ⓘ / `I` key | Opens the provenance card in place | see Part J below |

## BASEMAP

**Runtime chain (audited in `src/maps/`):**

| Step | Provider | Auth | On failure |
| --- | --- | --- | --- |
| Primary (keyless) | Esri World Imagery (`ArcGisMapServerImageryProvider`) | none | construction failure → OSM; 2 tile failures → OSM |
| Primary (keyed) | Google Photorealistic 3D / Cesium ion Bing | `GOOGLE_MAPS_API_KEY`, `CESIUM_ION_TOKEN` via `import.meta.env` at build time | unavailable → Esri |
| Fallback | OpenStreetMap tiles | none | 3 tile failures → offline |
| **Floor (new)** | **Offline map treatment** (`src/maps/offlineImagery.js`) | none, no network | cannot fail |
| Terrain | Cesium World Terrain (ion) or Re:Earth keyless mesh | ion token if set | falls back to flat ellipsoid; the offline stack uses flat terrain directly |

No credentials are in the repository: keys are read from `import.meta.env`,
`.env` is git-ignored, and nothing in Stage 8 adds a key.

**The offline treatment** is a graticule drawn into canvas tiles on the
product's dark surface, one shade lighter than the page so the globe's limb
stays visible. It is labelled in the credit line as "Offline map treatment —
no imagery provider reachable. Boundaries and analytical layers are real
data." It does not imitate imagery. Grid steps nest (30/10/5/1/0.5/0.1°) so a
line cannot stop at a tile seam. It carries **no text**: labels baked into
tiles were magnified by Cesium's ancestor-tile upsampling into 300px smears
during descents.

**Nepal stays legible on any basemap:** the district frame is now drawn as
faint context under every scene that does not draw districts itself (not on
the Scene 00 globe; removed with everything else by a result-class filter
that excludes OFFICIAL).

**What was actually visually verified:**

- The **offline treatment**, end to end: Esri fails at construction → OSM →
  3 tile failures → offline grid, observed in the browser console and on
  screen, with zero errors. Every Stage 8 screenshot is on this treatment.
- **Real imagery was not rendered in the browser.** The imagery hosts are
  reachable from this environment with `curl` (Esri metadata and tiles
  return 200), but the test Chromium does not trust the session proxy's TLS
  interception, and overriding that was declined. The app therefore still
  falls back to the offline grid here.
- **Real imagery was measured instead** — see Visual QA. That is a colour
  measurement against real pixels, not a render of the scene over imagery.

## VISUAL QA

### Contrast against real imagery (Part F)

Sixteen Esri World Imagery tiles over the study area (Gorkha ×2, Dhading,
Kathmandu, Bhaktapur, Sindhupalchok, Langtang, Chitwan; z10 and z12) were
fetched and every layer colour measured against their pixels. **Nepal from
orbit is dark**: median ground luminance 0.02–0.13, snow the only bright
ground.

| Layer | Question | Finding | Action |
| --- | --- | --- | --- |
| Green (#22d97f / #00ff9c) | Readable? | Below 3:1 on 8% / 5% of pixels | none needed |
| Violet (scenario route) | MODEL/SCENARIO distinct? | ΔE 33 from the green baseline route; bare line below 3:1 on 24% | casing over imagery → <10% |
| UNOSAT points | Disappear into imagery? | **Destroyed failed 3:1 in fill and ring on 61% of pixels** — a dark ring vanishes into dark ground | light ring at 0.6 over imagery → worst class 8–10% |
| Roads / closures | Legible? | Closures (#ff4d4d) 37%, landslides 28% bare; minor network roads 43–85% (deliberately recessive) | casings on closures, routes and blocked roads |
| Population | Overwhelms the map? | Ramp's low end sits close to mid-tone ground (ΔE 6.4); it does not overwhelm — if anything the sparse end under-reads | reported |
| ShakeMap | Hazard vs basemap? | Bands vs ground ΔE 14–29 (7 on snow): distinguishable. **Adjacent MMI levels only ΔE 2.7–5 apart at 0.55 fill** | reported (see Remaining) |
| Labels | Readable? | The district frame at 0.34 alpha: median 1.95:1 | raised to 0.5 → 2.65:1 |

The ring and casings **follow the basemap in use**: over the offline grid the
designed dark ring stays (a light ring paled dense clusters to pink there),
over any imagery the light ring and casings apply, and a map-stack change
restyles what is already on screen. Verified in the browser by dispatching
the stack-change event.

### Screenshot pass — problems found and fixed

Every item below was found by looking at a settled screenshot, not by a test.

| Scene | Problem | Fix |
| --- | --- | --- |
| all | Readiness resolved mid-flight; holds and screenshots timed from a camera in transit | readiness includes the landing (`whenLanded`) |
| 03, 08, 14, 16, 17, 18 | Control strip slid over the imagery attribution (a collapsed grid row shifted auto-placement) | every zone names its grid row; a reserved attribution row |
| all | Limitations were a browser-default 16px list with bullets outside the panel | styled in the caveat grammar under a LIMITS label |
| 02, 05, 10, 13, 14 + 09 | The same caveat printed twice (prefix match missed near-verbatim pairs; 09's caveat was stitched from two limits) | content-word overlap, pairwise and against all limits |
| 17 | Result-class glossary set as a two-word-wide right-aligned mono column; data-gap text inside a 4px bar | stacked glossary; styled gap list |
| 07 | Chosen district filled at 0.95 — one flat cyan screen at 25 km | tint 0.14; camera 110 km so the district is whole |
| 08, 09 | 25 km showed ~1/20 of a 114 × 68 km damage extent | 140 / 130 km, same frame for both |
| 12 | Coverage fill hid the basemap and district edges | 0.5 fill |
| 15 | Rings never drawn; five labels stacked on one anchor | clamped polyline rings on a **real** damage point; one short caption |
| 11 | Three layer colours, no key | swatches on the layer chips, from the same table the map uses |
| offline | Step search always chose 30°; labels printed rounded tile corners at coordinates no line had | nested finest-fit steps; labels removed |
| 09 (present) | Page overflowed horizontally: the strip's unwrapped line widened the grid | `minmax(0, 1fr)` track |

## PRESENT MODE

**Full run:** 19 scenes, 21 beats (Scene 09 has three), holds 746 s + camera
flights 48.8 s = **13.25 min computed; 13.8 min measured** (827.6 s, real
time, auto-advancing end to end in the browser under software rendering,
zero errors). The extra half-minute is data and geometry readiness, which
the hold waits for; on a GPU it should shrink. Scene 09's three beats landed
at 401.6 s, 413.2 s and 421.4 s — 12, 8 and 12 s apart, as scripted.

Behaviour, verified in the browser by stepping all 21 beats and by a
real-time run:

- **The strip is a map of the investigation, not a slide counter**: one
  segment per beat sized by its duration, acts separated, current segment
  lit; then act, step (`05 / 21`), the step's cue and question, the next
  step, time left, status, and a faint key legend. It hides "next" and the
  keys at 1280 px and narrower.
- **The rail hides while presenting** (it returns on E/EXPLORE); headline
  figures step up to 36 px and the question to 15 px for reading distance.
- **Scene 09 is staged**, as its design always said and its implementation
  never did: beat 1 shows only "Look at the map first…" and the question;
  beat 2 adds the statistic; beat 3 adds the reversal, the limits, and dims
  every damage point except the two areas that straddle a band edge.
  Pausing into explore shows the whole scene.
- **Holds start when the camera lands**, not when the beat is requested.
- Keys: ← → step, space pause into explore, E explore, P resume, **I opens
  the headline's provenance card** without pausing.

**The seven questions, per scene** — the fixes above are the answers that
changed. Headlines that did not answer their own question were changed to
artefact figures that do: Scene 05 (people at the chosen intensity, follows
the slider), Scene 13 (**9** new disconnected components, 40 → 49, instead
of "2,129 ways mapped"), Scene 14 ("1 pair detoured, of 14 measured").
Headline integers now carry separators (11,834,041 was unreadable at
distance).

**Provenance in place (Part J).** Seventeen headline figures — every scene
except 12 and 17, whose headlines are a statement and a count of records —
carry an ⓘ button. It opens a card read entirely from the analysis's methodology
record: SOURCE (dataset + role), METHOD (first two sentences), CLASS, COVERAGE
and the first LIMITATION, with a count of the rest. For 13.84M: WorldPop
2015 + USGS ShakeMap contours + OCHA COD-AB; containment of ~1 km cells in
closed MMI rings; DERIVED; "EXPOSURE IS NOT HARM…". "why is this here?" now
opens the same card.

## SHORT MODE

**Reachable from the header** — it was not before: the one PRESENT button
always played the full run. The header now has **PRESENT** and **6 MIN**;
switching run mid-presentation starts the chosen run at its first step.

**Scene selection follows the argument in the brief**, one scene per step,
in scene order:

| Step | Scene | Hold |
| --- | --- | --- |
| Nepal | 01 Locate | 20 s |
| M7.8 earthquake | 02 The earthquake | 26 s |
| Seismic sequence | 03 The sequence | 28 s |
| Shaking | 04 Shaking | 28 s |
| Population exposure | 05 Who was under it | 28 s |
| Observed damage | 08 Observed damage | 30 s |
| Model vs observation | 09 (three staged beats) | 6 + 8 + 12 s |
| Infrastructure | 11 Infrastructure | 26 s |
| Coverage gap | 12 The coverage gap | 36 s |
| Network consequence | 14 A route | 30 s |
| What the data can / cannot tell us | 17 Intelligence quality | 38 s |

The Stage 6 short run (00, 02, 04, 05, 09, 12, 15, 17) reached Scene 09's
reversal before the audience had seen a single damage point.

**Duration: 5.77 min computed; 6.1 min measured** (368.8 s, real time, end
to end in the browser under software rendering, zero errors). No controls
are demonstrated; the strip names each step by its place in the argument.

## SCREENSHOTS

Inspected individually, camera landed, 1600×950, offline basemap:
Scenes **01, 03, 04, 06, 08, 09, 11, 12, 13, 14, 16, 17** (and 07, 15 after
their fixes). Presentation frames: all 21 full-run beats and all 13
short-run beats; Scene 09's three beats; the provenance card over Scene 04.
Overflow checked at 1280×720, 1600×950 and 1920×1080 in present mode — no
horizontal scroll, panel inside the viewport.

## ACCESSIBILITY

| Check | Result |
| --- | --- |
| Keyboard | Every control is a `<button>`; tab order runs rail → panel (ⓘ, "why is this here?") → control strip → attribution → header. Enter on ⓘ opens the card (`aria-expanded` true, `aria-controls` set). |
| Focus | Visible focus ring on every stop checked (16 consecutive stops). |
| Reduced motion | Scene 07's 5 s flight becomes 0.4 s: ready in 2.7 s vs 7.0 s. Strip transitions off. |
| Contrast (panel #081410) | text 16.6:1, dim 7.2:1, green 10.1:1, amber 10.3:1, emerald 5.4:1. **faint 3.3:1** — see Remaining. |
| Identity never colour alone | Damage classes have counts in the legend; Omori fit is dashed as well as violet; layer chips carry names and swatches. |
| Semantics | Limits list labelled by its heading; provenance cards are labelled regions; mode buttons expose `aria-pressed`. |

## PERFORMANCE

Measured in headless Chromium with SwiftShader (software GL) — a floor, not
the venue machine:

- Scene readiness (data + geometry + camera landed): 1.6–5.5 s for most
  scenes; 8.7–13 s for Scenes 01 and 12 whose flights are longest and whose
  75 ground polygons build on a worker.
- Scene 10 draws all **41,122** Copernicus points as one primitive
  collection (ready 2.5 s); Scene 13 draws 2,807 line primitives (2.8 s).
  JS heap ~290–300 MB throughout.
- The render governor holds continuous rendering only while geometry
  settles and returns to idle within 5 s of readiness on every scene
  checked.
- Under software rendering the offline tiles refine slowly, so coarse
  ancestor tiles are visible for a few seconds after a descent (soft bands
  where graticule lines are magnified). Not seen as a lasting state.

## TESTS

**5,185 tests: 5,184 passing, 0 failing, 1 skipped** (`npm test`; the skip
is pre-existing). Stage 8 added tests for: the
offline tiling arithmetic, step nesting and float-safe grid values; the
Esri → OSM → offline chain; scene readiness waiting for the landing;
limitations markup and caveat de-duplication; provenance cards (content,
placement, the unrecorded case, the footer link); the district context
layer; ring anchoring and captions; point isolation for the reversal; ring
and casing rules; the short run's order and the flight-inclusive runtime;
the header's run choice; the strip's segments; the I key and beat staging.

Two pinned voice-schema digests were re-pinned (+10 bytes, `,"offline"`):
another test requires the voice `set_map_stack` enum to equal the map
stack list exactly.

Format, import-direction and package-boundary gates pass.

## BUILD

`vite build` succeeds. The existing chunk-size warning is unchanged.

## ANALYTICAL DISCREPANCIES AND PROVENANCE GAPS

**No numeric discrepancy was found.** One gap:

- **Scene 06's headline (11,834,041 people in cells both strongly shaken and
  densely settled) has no methodology record.** The counts and their
  parameters are published at `results.populationIntensityQuadrants` in
  `nepal-2015-population-exposure.json`, but none of its four records
  (`exposure-population-by-intensity`, `exposure-by-district`,
  `exposure-threshold-sensitivity`, `exposure-ocha-comparison`) describes the
  quadrant classification. The card for this figure says "No methodology
  record" rather than borrowing the nearest one. **Recommended correction:**
  add a record for the intensity × density quadrants to the Stage 5
  exposure artefact. Not done here: it is an analysis-stage change.

  **Resolved after Stage 8 (integrity patch).** The record was added in the
  analysis layer — the **Stage 4** pipeline `pipelines/analyse/exposure.mjs`,
  not Stage 5 as written above — as
  `exposure-population-intensity-quadrants` in
  `data/analysis/nepal-2015-population-exposure.json`, documenting the method
  as it runs in `populationIntensityQuadrants`: MMI VI or stronger at the cell
  centre for high shaking, and the 75th percentile of the 177,679 populated
  cells (134.1 people per cell, verified from the raw grid) for high density.
  Regenerating the artefact changed **no figure**: a full comparison against
  the previous file differs only in `generatedAt` and the added record; the
  four existing records are byte-identical. Scene 06's ⓘ now opens that
  record from the artefact, and the temporary "No methodology record" card is
  removed. The methodology record count is therefore 23, not 22 (the header's
  ANALYSES and Scene 17's count read it).

## REMAINING VISUAL ISSUES

Not verified, or verified and left:

1. **The scene has not been seen over real imagery.** Legibility was measured
   against real Esri pixels and fixed where it failed, but the rendered
   composition over imagery — how the offline-designed layers sit on Himalayan
   terrain, snow and cloud — still needs one walk-through on a machine whose
   browser can load the tiles. Running `npm run preview` locally and walking
   PRESENT would settle it.
2. **Adjacent MMI levels are hard to tell apart** (ΔE 2.7–5 after the 0.55
   fill, 4.9–9.2 raw). The modelled field carries no edges by design, so the
   ramp alone has to separate eight levels; re-stepping it is a design
   decision left open.
3. **`--gx-text-faint` is 3.3:1** on the panel, below AA for small text. It is
   used for deliberately recessive annotations (strip "next" and key legend,
   the provenance record id), never for a figure or a limitation.
4. **Long panels scroll under the sticky provenance footer** (Scenes 03, 16,
   17): the LIMITS heading can sit just above the footer with its items below
   the fold until scrolled.
5. The offline grid refines slowly under software rendering (soft magnified
   bands for a few seconds after a descent); expected to be brief on a GPU,
   not measured on one.
