# Natural Disaster Visual Intelligence — audit against all 27 sections

Written against the pivot brief, section by section, as its NON-NEGOTIABLE
requires: "Before considering the work complete, inspect this entire prompt
again and verify that every major requirement has been addressed in the actual
application."

| Mark | Meaning |
| --- | --- |
| ✅ | Built and verified, in the app |
| 🟡 | Built as far as real data allows, with the shortfall stated in the UI |
| ⬜ | Not built. The reason is a data or scope reason, and it is visible in the app |

Every figure quoted below was measured against the live services before it was
written down.

---

## 1. First: change the visual design language

✅ `src/ui/styles/identity.css`, loaded last so it re-skins every stylesheet
above it rather than only one panel.

Very dark green-shifted surfaces (`#060b0e`), emerald `#22d97f` as the
interface, neon `#00ff9c` reserved for what is live or selected, a 40 px
technical grid and drifting scanlines behind the content, squarer 4 px radii,
and rim-and-spread glow instead of blur halos. It remaps the inherited and
workspace design tokens too, so the whole application follows without those
files being touched.

**The line it is trying not to cross is stated in the file**, because "do NOT
make it look like a cheap hacker website" is easy to fail:

- Green carries **meaning**, not decoration. Hazard states are deliberately
  **not** green — an alert the colour of the chrome is not an alert. Red for
  destroyed/blocked/fatal, amber for degraded/estimated, violet for modelled.
  In the browser the Gorkha death toll renders red, not green.
- Text never glows. Body copy stays Inter and near-white, with an explicit rule
  guarding against drift into green monospace — the clearest tell of the
  aesthetic being avoided. Monospace is reserved for values that are genuinely
  machine-read: coordinates, magnitudes, MMI, timestamps.
- Scanlines and grid sit at 2–4% alpha, behind content, and respect
  `prefers-reduced-motion`.

**One defect this work introduced and a test caught.** The first version pushed
the texture behind content with `position: relative; z-index` on
`#cesiumContainer`, which forms a **stacking context** — and the world overlay
blends with `screen` against the WebGL canvas. An isolating ancestor silently
discards that blend, invisible to any assertion checking the blend string.
`worldOverlay.test.mjs` walks the real ancestor chain against the shipped
stylesheet and failed on it. The texture now uses `z-index: -1` on body's own
pseudo-elements and alters nothing else.

## 2. The core concept — LEVEL 0 disaster selection

✅ `src/disaster/catalogue.js` and the Disaster Explorer view.

What makes these cases rather than cards:

- **Per-dimension data availability** on every case, so a user is not three
  zoom levels deep before finding an empty panel. Gorkha 2015 rates 7/7; the
  Bhote Koshi flood rates 5/7 and names which two are missing.
- **Confirmed and modelled figures never share a field.** Gorkha carries 8,964
  recorded deaths (Government of Nepal PDNA) *and* a red PAGER alert meaning
  "1,000+ estimated". Merging them would present a model as a count, and a test
  asserts the two groups share no key.
- **Every figure names its publisher.** A test walks every curated figure and
  fails on any without a source and an availability label.
- `investigates` and `whyThisCase` say what the case is good for before it is
  opened.

Live GDACS cases are deliberately thin: `confirmed: {}` is the finding for an
event three hours old, not a gap to fill. A hazard code the registry does not
model is dropped rather than mapped to the nearest match.

## 3. Example investigation: Nepal — and the three levels

✅ Two Nepal cases, each with an **authored** descent rather than one derived
from a bounding box:

`World → South Asia → Nepal → Gandaki and Bagmati Provinces → Kathmandu Valley
→ Kathmandu → Langtang corridor → Pasang Lhamu Highway`

Verified in the browser: the camera runs from 22,000 km to 6 km through all
eight rungs. Borders are drawn at the **region and country rungs only** —
earlier they are noise, later the camera is inside the country — and a test
asserts exactly that.

Each rung declares what it reveals, which is how LEVEL 1, 2 and 3 differ in
substance rather than only in altitude: L2 places the epicentre against the
whole country, L3 explains that the rupture ran **east** toward the Kathmandu
Valley rather than radiating evenly, L5 gives Kathmandu's own measured MMI 7.89.

## 4. Disaster event timeline

🟡 Built, with one constraint stated plainly in `src/disaster/timeline.js`
because it shapes everything: **no disaster has an hour-by-hour casualty feed.**
Deaths are counted over days and revised for months.

So the timeline separates and labels three things at every phase — **observed**,
**modelled**, **unavailable** — and a test asserts no phase ever claims to
observe or model a casualty count.

**What genuinely changes as the handle moves is measured.** Against the real
USGS catalogue the aftershock count runs:

| Phase | Aftershocks M4.5+ | Largest so far |
| --- | --- | --- |
| T-0 | 0 | — |
| T+1h | 16 | M6.6 |
| T+6h | 34 | M6.6 |
| T+24h | 47 | M6.6 |
| T+48h | 55 | M6.7 |
| T+30d | 96 | **M7.3** (the real 12 May Dolakha event) |

Every shock is timestamped, so "which had happened by T+6h" is an answer rather
than an interpolation — and it is the layer that explains why rescue teams could
not enter buildings. The hazard layer filters its own time-varying geometry on
the same offset, so the phase changes the **shapes**, not only the numbers.

Nine unavailable dimensions each state why, what source would supply them, and
what is shown instead.

## 5. Show what actually happened

✅ Visual evidence is the agencies' own published products, shown as published
and linked — eight for Gorkha, including the ShakeMap intensity image, the
fatality and economic probability histograms, the population exposure map,
deaths-by-structure-type, and the landslide hazard model. Never redrawn from the
underlying numbers, because a redrawn chart loses the caveat that came with it.

§5's labelling is enforced **structurally**, not by care: the views render a
figure through `sourced()`, which will not print a value without an availability
label and a publisher. A number with no provenance cannot reach the screen.

## 6. Impact analysis — human impact

🟡 "Do not simply display '10,000 people affected'. Instead, show it
geographically." Nothing in `src/disaster/impact.js` returns a headline number;
every function returns **placed** items. Real Gorkha figures:

| MMI | Population | Footprint | Status |
| --- | --- | --- | --- |
| IX | 11,711 | — | measured |
| VIII | 2,884,736 | 2 contour lines | measured |
| VII | 3,556,392 | 1 contour line | measured |
| VI | 40,899,271 | 2 contour lines | measured |
| V | 84,253,151 | 3 contour lines | **extrapolated** |
| IV | 10,720,626 | 14 contour lines | **extrapolated** |

Measured (47.4M) and extrapolated (95.0M) are kept apart, because summing them
would make the biggest number the loosest, unmarked. Every band repeats
"exposure, not casualties" — repeated per band rather than once at the top,
because a band is what gets screenshotted.

At city resolution: Kathmandu MMI 7.89 with 1,442,271 people, Patan 7.71,
Kirtipur 7.68 — 187 cities, clickable to fly the camera.

⬜ Deaths, injuries, missing and displaced **by location** are not published for
any disaster. The recorded national totals are shown with their source, and the
per-phase and per-district versions are declared unavailable with what would
supply them (national EOC situation reports; IOM DTM rounds).

## 7. Infrastructure impact

🟡 The distinction the module turns on: **exposure is computable, damage is not
published.** Given the real OSM network and the real USGS ground-failure model,
"this segment crosses terrain rated high landslide hazard" is defensible. "This
segment was destroyed" is not open data for any past disaster.

So a road returns `AT_RISK` with `basis: MODELLED`, **never** `CLOSED`, and says
on every segment that this is exposure to failure rather than a report that it
failed. An unexposed road is not declared safe either.

On the real Nepal network: 43 of 1,691 access-road segments exposed, 39 km of
1,088 km.

**A threshold bug found by running it.** At the original 0.1 threshold the MMI VI
contour covered the whole region and **all 367** trunk segments came back
exposed — 177 km of 177 km. A map with one colour is not a finding. The default
is 0.55 now, which admits only the severe bands, and a test pins the reason.

**The recovery arc, and the state nothing reaches.** §7 asks for
normal → damaged → recovery. `INFRA_STATE` carries all five states, but the
modelled path can only ever produce `OPERATIONAL` and `AT_RISK`; `CLOSED` and
`RECOVERING` are observations. Rather than leave those two as vocabulary no code
could reach — which is what an earlier revision of this document described
without noticing — they now have exactly one route in: `applyCitedStatus`, which
takes per-asset records carrying a source and a validity window in hours from
origin time, applies the ones in force at the phase being viewed, and refuses
any record without a source or naming a modelled state. **No register ships,
because none is published for these events**, so the panel prints all five
states with their counts and says in one line that every asset is modelled and
none observed. Four structural zeroes in a legend is the finding. The same
register, once a road authority publishes one, drives the whole timeline with
no other change: a bridge cited closed at T+0 and cited partly reopened at
T+240 reads `CLOSED` at T+24h and `RECOVERING` at T+14d by itself.

**A registration bug found by running it.** The `access` network — motorway
down to secondary, the roads relief actually drives on — was defined in
`FREIGHT_NETWORKS` and **never constructed**, so every rescue, evacuation and
aid-corridor solve was still running over `motorway|trunk`, the long-haul
freight network that does not reach a Nepali village. It is now a registered
layer (`access-roads`, token `9`, 35 layers), `roadSegments()` prefers it over
the freight network, and both the catalogue test and the share-link registry
assert it.

## 8. Supply-chain disruption

✅ "Do not abandon the supply-chain capabilities from the previous version.
Instead, make supply-chain analysis a major consequence of natural disasters."

Every supply-chain view, engine and layer is kept and moved into the
**CONSEQUENCES** section: disruption simulation, the staged route, chokepoints,
product dependencies, `simulateDisruption`, `propagate`, `shortestPath`, the
trade-flow and port layers. "Global Overview" became "Baseline" — no longer
where a user starts, now the undisrupted world the event is compared against.

## 9. Economic damage

🟡 "Avoid simply putting large numbers into dashboard cards. Make the numbers
spatially meaningful." The only honest way to do that with a national total is
to say openly how it is being distributed, so `economicApportionment` spreads
the cited $7.0 bn PDNA figure across measured intensity bands and labels the
result **AN APPORTIONMENT, NOT AN ASSESSMENT**.

Its **sensitivity is stated**: at the current exponent MMI VI takes 77% because
it holds fourteen times the population of MMI VIII, and raising the exponent
flips the ordering. That the answer moves that much with a modelling choice is
exactly why it is not presented as a measurement.

Clicking a bar selects the matching contour band on the map (§13).

## 10. Multi-layer map system

✅ Seven groups in `LAYER_GROUPS` — geography, hazard, human, infrastructure,
supply chain, economic, response — all toggleable. The hazard group is built
**per case** from the registry, so an earthquake offers intensity contours and a
rupture while a flood offers extent and depth, and a layer the case has no data
for stays listed and refuses to enable with the adapter named.

## 11. 3D visualisation

🟡 `src/layers/terrain/index.js`, built to §11's rule that "every 3D
visualization should answer a question". It enables terrain, **tilts the camera**
— relief looking straight down is a colour gradient — and exaggerates with a
stated multiplier that travels with every reading, so a setting cannot be read
as a finding.

The three questions it declares are the brief's own: why did this area flood,
why was this road destroyed, why was this city isolated. Nine geometry layers
across the registry carry `requiresTerrain`, and a test asserts each of them
explains what terrain explains.

🟡 Terrain needs a Cesium ion token. Without one the layer reports that relief
cannot be drawn rather than failing silently.

## 12. Photographs + video evidence

🟡 Eight published USGS products for Gorkha, each with a caption saying what it
explains and a link to the original. The Bhote Koshi case carries geolocated
witness media and before/after satellite imagery in its own event pack.

⬜ A full Map → Satellite → Photograph → Video → Data walk without losing
geographic context exists for the Bhote Koshi case (which has an authored
evidence spine of 16 items) but not generically: it needs per-event media that
only a curated pack or a Copernicus EMS activation provides.

## 13. Interactive charts

🟡 The economic bars and every impact row are clickable and select the matching
geometry; clicking a city flies the camera to it. The linkage is
object-identity — the bar and the contour band are the same object — rather
than a lookup by name.

⬜ Chart-to-map highlighting is one-directional for the aggregate charts: a
map click updates the contextual panel, but not yet a re-filter of every chart.

## 14. Response & rescue intelligence

✅ Recommendations are never paragraphs. `routeAlternatives` solves Route A over
the real OSM network, blocks the exposed edges, re-solves, and returns both
geometries with the cost of the difference. Verified on real Nepali roads:
Kathmandu → Bhaktapur is 11.3 km and 34 minutes via प्रदर्शनी मार्ग / राम शाह
पथ / माइतिघर सडक.

Where no route remains it reports **SEVERED** with "air access or clearing the
route" rather than an empty result, because no-alternative is the most important
finding the function can produce.

**Three bugs found by running it on real data, all fixed:**

1. `buildRoadGraph` noded only segment **endpoints**, but OSM ways join at
   shared **intermediate** vertices. The network fragmented into 42 components
   with only 80% reachable, and Kathmandu could not route to Langtang at all.
   Ways are split at junctions now: 14 components, 95% reachable.
2. `roadExposure` folded `osmId` into `id` and dropped it, so every blocked-edge
   lookup came back empty and a severed corridor routed as if nothing were
   closed.
3. `motorway|trunk` is the freight network and the wrong one for reaching a
   village — the only road north is tagged `primary`. A dedicated **access**
   network was added.

**And one honesty fix in the opposite direction.** Langtang's nearest
primary-class road is 15 km away in a 2-node island, because mountain Nepal is
sparsely mapped at this class. Reporting that as severance would turn a data gap
into a dramatic finding, so `ENDPOINT_POORLY_MAPPED` and `NEVER_CONNECTED` now
distinguish a coverage gap and a permanently disconnected pair from a closure
the disaster caused.

## 15. Evacuation scenarios

✅ Scenarios A, B and C are **solved**, not described — each with a different
blocked-edge set, routed on foot at a stated 4 km/h, returning every candidate
safe zone with its travel time and whether it is reachable. Where none is
reachable, that is reported as the scenario's finding rather than a routing
failure.

Reachable zones are ordered by the time the panel displays, not by distance,
because sorting by one while showing the other invites a misread.

## 16. Humanitarian response

🟡 `aidCorridors` solves Need → Supply → Route → Destination per demand point.
On the real network: 3 of 3 Kathmandu Valley cities servable from Kathmandu —
Patan 7 min / 2.3 km, Kirtipur 16 min / 5.2 km, Bhaktapur 34 min / 11.3 km.

⬜ Tonnage required is not published for any event and is **not estimated**.
Shelter capacity shows only where a surveyor recorded one in OSM.

## 17. What happened → why → what now

✅ The conceptual backbone, implemented as a **reading of the state** rather
than a mode the user picks: `chapter()` maps the current timeline phase onto one
of the three questions, and every navigation section declares which one it
serves. A test asserts the mapping and the section ordering.

## 18. Progressive zoom is critical

✅ Eight rungs per curated case, one camera move per rung rather than one flight
to the bottom — because §3's "Global → South Asia → Nepal" is about the reader
recognising each level, and a single flight from orbit to a street shows them
nothing on the way.

**Depth and phase are independent**, and a test pins that down: coupling them
was the obvious first design and it made the interface a slideshow where
stepping the clock threw the user back to the country view.

## 19. Do not turn this into a normal dashboard

✅ Each view leads with a geographic or temporal fact, and every figure is
either clickable through to the map or captioned with what it cannot tell you.
There is no view that is a grid of totals. Every view also carries a
why-this-matters block and real next steps — which for an investigation are a
genuine order rather than a menu, since you cannot read impact before you know
where you are.

## 20. Data source architecture

✅ Thirty adapters across twelve hazard types: **13 wired and live, 1 archived,
16 declared but not connected**. A `PLANNED` adapter carries the integration
point in the file — `src/disaster/sources/copernicus.js`, `glofas.js`,
`weather.js` and so on — and a test fails any PLANNED adapter without one.

The SOURCES view renders all of them, plus what actually loaded for the open
case and what that leaves each dimension able to prove. Wired: USGS (catalogue,
ShakeMap, PAGER, finite-fault, ground failure, DYFI), GDACS, OpenStreetMap via
Overpass, OurAirports, WRI Aqueduct, Cesium terrain, World Bank.

## 21. Disaster-specific visualisation

✅ `src/disaster/hazards.js` is the extensibility backbone. A hazard type is
**data, not code**: twelve types, each declaring its own geometry layers across
eight distinct kinds, its own published intensity scale, only the timeline
phases it really has, its secondary hazards and its adapters.

A test asserts **no two types draw the same thing** — which is §3's rule not to
reuse one visualisation for every disaster. An earthquake begins at T-0 and has
no forecast; a cyclone has three days of them; a drought has no hour-scale onset
at all. The renderer switches on geometry **kind**, so adding a type to the
registry makes it drawable without a line changing in `layers/hazard`.

All eight of the brief's named types are covered, plus drought, extreme heat,
tornado, avalanche and severe storm.

**One data bug caught by its own test:** the SPI drought bands used a `-99`
sentinel that made an exceptional drought classify as merely extreme, because
nothing is ever at or below −99. Replaced with the real US Drought Monitor
D1–D4 thresholds.

## 22. UI structure

✅ Navigation restructured into the stages of one investigation: **EVENTS →
INVESTIGATE → IMPACT → CONSEQUENCES → RESPONSE**, with **SOURCES** last as the
audit trail, and the supply-chain sections kept below. The map stays dominant;
the right-hand dock is the contextual panel and changes with the selection.

## 23. Animation

✅ Animation carries information: the per-rung descent, the accumulating
aftershock field, the phase-driven geometry filter, the radar sweep on loading
states. The scanline drift is the one purely decorative rule in the stylesheet
and it is marked as such.

## 24. Demo experience

✅ `src/disaster/demo.js` — all sixteen scenes in the brief's order, ~2 minutes,
each with the **claim** a viewer should be able to repeat afterwards.

It drives the same session, views and layers a user drives by hand. There is no
demo mode with its own rendering path, because a demo that shows something the
product cannot do is a lie about the product. A scene whose sources failed still
runs and says which are missing, because silently skipping it would demonstrate
a rosier platform than the real one.

The declared runtime is **derived** from the beats: an earlier version carried
`runtimeMinutes: 4` next to a two-minute script.

## 25. Preserve what already works

✅ Nothing was deleted and nothing is hidden. The globe, camera, tracking,
trails, intel HUD, scene director, voice, share links, first-run card, command
dock and every live layer still work. The supply-chain engine, its layers and
its views are all intact and reframed rather than replaced. The God's Eye View
panels remain on screen beside the dock, with a browser check asserting no two
of them overlap.

The pivot **added** `src/disaster/` and two layers; it modified navigation, the
view registry, the stylesheet and the shell's context. It rewrote nothing that
was working.

## 26. Quality bar

🟡 Whether it reads as "geospatial intelligence + disaster command centre +
interactive documentary" is not ours to mark. What can be said is that of the
sixteen questions §26 lists, fourteen are answered visually from real data
today: where, how large, how it spread, who was affected, what infrastructure
was exposed, which roads, what supply chains, what it cost, where rescuers can
enter, which routes are available, where people can evacuate, where supplies go,
how it changes over time, and where every figure came from.

The two that are not: **where people are now** (displacement tracking is
assessed in rounds and not open) and **which roads became unavailable** as an
observed fact rather than modelled exposure.

## 27. Final implementation requirement

The full chain is demonstrable end to end:

DISASTER SELECTION → COUNTRY → REGION → CITY → EXACT EVENT → TIMELINE →
PHYSICAL IMPACT → HUMAN IMPACT → INFRASTRUCTURE → SUPPLY CHAIN → ECONOMIC
IMPACT → VISUAL EVIDENCE → 3D/GEOSPATIAL → RESCUE → EVACUATION → HUMANITARIAN
LOGISTICS → RECOVERY

They are not separate pages. One session object holds the case, the descent
position, the timeline position, the active layers, the selection and the
scenario, and every view is a projection of it — which is why the timeline view
and the impact view cannot disagree about what loaded.

---

## Summary

| Status | Count | Sections |
| --- | --- | --- |
| ✅ | 17 | 1, 2, 3, 5, 8, 10, 14, 15, 17, 18, 19, 20, 21, 22, 23, 24, 25 |
| 🟡 | 9 | 4, 6, 7, 9, 11, 12, 13, 16, 26 |
| ⬜ | 0 whole sections | — |

Twenty-six of the twenty-seven sections carry a mark; §27 is the instruction to
re-read the specification, so it is this document rather than a marked feature.

No section is wholly undone. The shortfalls inside the nine 🟡 sections are all
the same shape and all visible in the interface: **the infrastructure, the
hazard and the population are open data; what happened to them at a given hour
is not.** Casualties by location and by hour, observed road damage, shelter
occupancy, displacement counts, aid tonnage and per-district economic loss are
each declared with the source that would supply them.

## Gates

- `npm test` — **4,826 passing**, 0 failing, 1 skipped (two allocation
  microbenchmarks whose budgets are calibrated for Node 24; this environment
  runs 22.22.2 and the harness says so rather than passing quietly)
- `npm run build` — clean
- `npm run check:boundaries` — clean
- `node scripts/check-import-directions.mjs` — clean, 775 modules, 71 portable
  entries
- `npm run format:check` — clean, 978 files
- `npm run qa:workspace` — **33/33**, driving the real browser against live
  upstream data, including nine disaster-platform flows

Two of those 33 report **SKIPPED** rather than passing quietly, and the
distinction matters: this sandbox's browser cannot complete TLS to
`earthquake.usgs.gov` or `services.arcgis.com`, and the public Overpass mirrors
were answering 406/503 during the final run. Each skip names the source, says
which unit test covers the logic without a network, and still asserts
everything that does not need one — the infrastructure check's "claims no damage
it cannot cite" assertion ran and passed on a skipped legend.
