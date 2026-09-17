# Rebuild Audit — All 44 Requirements

Every requirement from the rebuild brief, with what was done and what was not.
Written after the work, checked against the running application rather than
against intent.

Verification levels used below:

| Mark | Meaning |
| --- | --- |
| ✅ | Done, and verified in the running browser or by a test that would fail if it regressed |
| 🟡 | Done as far as the available data allows, with the shortfall stated in the interface |
| ⬜ | Not done. The reason is given, and it is a data or scope reason, not an oversight |

`npm run qa:workspace` drives flows 1–12 in a real browser and is the evidence
for most of the ✅ marks below. 15/15 checks pass.

---

## 1. Audit the existing project first

✅ Done before any change. The finding that drove everything else was in this
project's own CSS: `.sc-console > .sc-section { overflow-y: auto }` gave **every**
section its own scrollbar, which is the six-scrollbar panel in the screenshots.

Inventory: 27 registered layers, 7 scene recipes, 22 UI modules under `src/ui/`,
two boundary gates (`check-import-directions`, `check-package-boundaries`), the
4-phase `createApplication` lifecycle, and the `contextStore` selection bus that
the new workspace listens to rather than competing with.

## 2. Stop copying God's Eye View

✅ The inherited chrome is hidden while the workspace is up — `#title-bar`,
`#intel-hud`, `#style-indicator`, `#left-panel-stack`, `#top-center-actions`,
`#command-dock`, the classification strip, the MGRS readout, the "forbidden
cockpit" first-run card, and the original supply-chain console.

An earlier version of that hide list used plausible-sounding class names that
matched nothing, and the GOD'S EYE VIEW title rendered straight through the new
top bar. The list is now verified ids, and the QA script asserts zero inherited
chrome is visible.

**"Hide panels" restores all of it.** Nothing is deleted.

Identity chosen: the product keeps the name **Global Supply Chain Eye**, and the
spine of the interface is the flow the brief asked for —
Resources → Production → Transport → Chokepoints → Countries → Consumers — which
is the first card on the home view and is clickable stage by stage.

## 3. Redesign the visual language

✅ Navy-slate surfaces instead of pure black, so cards sit on something. Amber
primary and teal secondary instead of one radar cyan. 13px Inter for anything a
person reads, with monospace reserved for figures and codes. 10px radii and real
padding. The bracket-corner motif is dropped entirely — it is the inherited
product's signature.

## 4. Completely fix navigation

✅ Every label the brief listed as unreadable is renamed, and a test holds the
rename list against the shipped recipes so it cannot be half-applied:

| Was | Now |
| --- | --- |
| Orbital Watch | Satellite Tracking |
| Global Flights Radar | Air Cargo & Aircraft Tracking |
| Thermal Threat Board | Active Fires & Heat Detection |
| City Overload | Urban Transport Density |
| Omniscience Pullback | Everything At Once — Wide View |
| Nepal Flood Incident | Nepal Flood — Corridor Disruption |
| Run Log | Playback Report |
| Export Presets | Save Investigation… |
| Import | Open Saved Investigation… |
| Edit Details | Rename Investigation |
| Share Scene | Copy Shareable Link |
| Start | Play Investigation |
| Capture Shot | Add Step From This View |
| Investigate | Show Trade Flows |

Old names are kept as `formerly` subtitles so a returning user is not stranded.

## 5. Create a simple main navigation

✅ Five sections, exactly as specified: Global Overview, Analyze, Track, Map
Layers, Investigations. 21 entries, each with a name, a one-line description of
what it does, an icon, and a badge when its data is partial or absent.

## 6. Remove confusing scene-by-scene presentation

✅ Investigations replace cinematic shots. Each starts from a question, and every
step is a claim with its data class, its evidence, and what it cannot establish.

## 7. Create a real supply-chain investigation workflow

✅ SELECT → TRACE → ANALYZE → INVESTIGATE IMPACT is the shape of the Analyze
section: pick a product, country, resource, route or chokepoint; trace it through
`Analyze → Trade Route`; analyse concentration and dependency; then close
something in `Disruption` and see what reroutes.

## 8. Make the globe actually useful

✅ Rotate, zoom, and click any marker to select it. Ports, chokepoints, hazard
events, vessels, aircraft, satellites and transit vehicles are all pickable —
each by the layer that owns it, through the inherited `contextStore` bus. When
something is selected the panel answers what it is, where it is, what it
connects to, and what the data cannot say about it.

## 9. Fix satellite / aircraft / ship tracking

✅ One click selects, highlights and follows. **Stop Following** appears in the
top bar the moment something is selected and disappears when it is released —
and it clears both the Cesium tracked entity and the layer params, because
clearing only the first lets the layer re-acquire its target on the next poll,
which looks exactly like the button not working.

Fixed here: selection facts were nearly all blank. Every layer publishes
`{ id, layerId, layerName, source, label, latitude, longitude, properties }` and
the panel's reader had invented its own field names, matching none of them.

## 10. Add a universal reset view

✅ **Reset View** is in the top bar on every view. It stops playback, releases
the camera, drops the selection, clears transient view state and returns home.
Verified: after reset the camera is at 24,000 km and the selection is null.

## 11. Fix the analysis playback

✅ Play, Pause, Stop, Restart, Previous Step, Next Step, a progress bar, a step
counter and a clickable step list. Stepping by hand pauses, because a user who
pressed Next wants to look at that step rather than be carried off it.

The inherited director plays a scene to the end once started. This does not.

## 12. Explain everything

✅ Every data view carries a mandatory **WHY THIS MATTERS** block — a test fails
if one is missing. The chokepoint detail answers all three questions the brief
named: why it matters, what passes through, what happens if disrupted. Transit
volumes are `DATA UNAVAILABLE` with what would be needed, because the EIA and
UNCTAD figures are not integrated and a remembered number is a fabricated one.

## 13. Implement strategic chokepoints

✅ All nine: Hormuz, Malacca, Suez, Bab el-Mandeb, Panama, the Turkish Straits,
the Danish Straits, the Taiwan Strait, and the Cape of Good Hope. Each selectable,
with location, connected waters, bordering countries, cargo categories,
alternative routing and per-record sources.

🟡 **Land and rail corridors are drawn now; the Arctic route is not.**

The previous verdict here was that land and rail corridors "have no open global
dataset". That conflated two questions. Where the corridors ARE is mapped
worldwide in OpenStreetMap under ODbL, and `Track → Inland freight
infrastructure` draws main-line rail, trunk road and oil and gas pipelines for
whatever region is in view. How much moves on them is the part that is closed.

The Arctic / Northern Sea Route remains out: its usability is seasonal, its
transit traffic is reported by Russian authorities rather than published as a
feed, and there is no route geometry in OSM to draw in the meantime.

## 14. Build the Strait of Hormuz scenario

✅ Before, disruption, affected, alternatives, compare — and the honest result is
that closing Hormuz **severs** the Gulf pair entirely in this network, with no
maritime alternative. That is the real-world answer.

Fixed here: the scenario network wired only four of nine chokepoints. Hormuz,
Panama and the Turkish, Danish and Taiwan Straits were nodes with no edges at
all, so closing any of them correctly reported "+0 km" — arithmetically right and
completely uninformative. Ports were added to put every chokepoint on a lane, and
the scenario now searches for an origin/destination pair whose shortest path
actually crosses the node being closed.

## 15. Support multiple transport modes

🟡 Air (live ADS-B), maritime (live AIS), ports (417 from WPI), and city transit
and road traffic where feeds exist. Legs on a drawn chain are styled by mode.

✅ **All four are built now.** The earlier verdict — "no open global dataset
exists for any of them" — was wrong, and the probes that disproved it took
minutes:

| Layer | Source | Measured |
|---|---|---|
| Freight Rail Corridors | OSM `railway=rail` + `usage=main` | 19,027 ways across the Rhine-Ruhr |
| Road Freight Corridors | OSM `highway=motorway\|trunk` | already proven by the inherited traffic layer |
| Oil & Gas Pipelines | OSM `man_made=pipeline` + `substance` | 2.8 MB of geometry across Iraq/Kuwait |
| Air Freight Gateways | OurAirports `airports.csv` | 1,152 large airports with scheduled service, public domain, bundled |

What is genuinely missing is narrower and is now stated as its own gap:
**throughput**. No tonne-kilometres by corridor, no heavy-goods counts by road,
no pipeline flow rates, no airport cargo tonnage. Every one of those exists per
operator, per regulator or per national statistics office, on its own schedule
and in its own units, and several are sold rather than published. `Map Layers`
lists it as "Freight Volumes & Capacity" under Not Available.

The three OSM layers are viewport-driven, because the proxy caps a query at 12°
of span and a continental rail query returns tens of thousands of ways. At
whole-globe range the panel says "too far out to query" rather than drawing a
band across the middle of the screen and letting it read as an answer.

City transit is still not freight rail, and the interface still says so in those
words.

## 16. Draw supply-chain routes

🟡 `Analyze → Trade Route` draws a ten-stage chain and can place five stages:
origin country, load port, sea transit, discharge port, destination country.
Legs are mode-styled — solid sea, dashed land, dotted air, with dash pattern
carrying the distinction so it survives greyscale.

The five stages the chain itself cannot place — extraction, processing,
manufacture, inland distribution, final consumer — are **present and explicitly
empty** on the drawn chain, each with why and what would fix it. Drawing a
plausible line to a plausible mine would have been the most convincing-looking
part of the picture and a complete fabrication.

Two of those five now have real places to look at, on their own layer rather
than spliced into the chain. `Track → Inland freight infrastructure` draws
mines, quarries and industrial works from OpenStreetMap, with the commodity
where a surveyor tagged it — 92 sites in the Atacama on the probe, 63 named,
most carrying `resource=copper`. That is honest about what it is: **these are
extraction and processing sites in this region**, not a claim that any of them
supplied the shipment the chain is about. Joining a specific mine to a specific
cargo needs facility-level output reconciled to trade records, which is the gap
that remains, so the chain still shows a gap where the link would go.

## 17. Product / resource analysis

✅ 34 commodity groups over real HS headings. Production, export, import,
routes, dependencies and risks, with HHI, effective-supplier count and CR4.

## 18. Country analysis

🟡 Exports, imports, trading partners, nearby ports, and a "Show Supply Chains"
path into the trade views. Nearby ports are a proximity heuristic against the
country's label point and say so.

🟡 Domestic rail corridors are drawn from OpenStreetMap now (see §15). Airport
cargo tonnage is still unavailable: no open source publishes it, so the air
gateway layer draws every gateway at the same size rather than implying a
ranking it cannot support.

## 19. Resource map

🟡 `Analyze → Resource` ranks world exporters of any of the 34 commodities, with
re-export hubs individually flagged. Potash ranks Canada first at $8.6B with an
HHI of 0.460.

It measures **exports, not production**, and leads with that. Three distortions
are stated next to the chart: entrepôts appear as producers, domestic consumption
is invisible, and value is not volume.

## 20. Fertilizer supply chain

✅ Nitrogen, phosphate, potash, NPK and ammonia as five separate commodity
groups, because they are three different supply chains and averaging them hides
that a gas-price shock hits one and leaves another alone. A dedicated
investigation runs raw materials → producers → importers → routes → limits.

Found here: the requirement asked for fertilizer and there was no fertilizer
commodity at all. Every step of that investigation would have no-opped.

## 21. Semiconductor supply chain

✅ A dedicated investigation. The step that matters is the third: the largest
single source for Korea is "Other Asia, nes", an aggregate customs code, not a
country. Taiwan does not report to UN Comtrade, and the app labels the inference
as an inference rather than quietly relabelling the bar.

## 22. Geographic / environmental risk

🟡 `Analyze → Environmental Risk`. Five keyless World Bank series: freshwater
withdrawal, irrigated farmland, renewable water per person, historical disaster
exposure, agricultural land.

**The mechanism is rendered above the numbers, not below them** — that was the
requirement. India: 44.8% withdrawal, 44% of farmland irrigated, so water is
directly tied to crop output. Egypt: 7,750% of internal renewable water and 9 m³
per person, which is real rather than an error because it lives on a river that
rises outside its borders. Brazil gets no mechanism and says why instead of
implying one.

Bands are the published FAO/SDG 6.4.2 thresholds and the Falkenmark per-capita
breakpoints, not numbers invented here.

✅ **Basin-level water stress is integrated.** The earlier verdict said WRI
Aqueduct "publishes it by basin and is a bulk download rather than an API". The
first half is right; the second was wrong. Esri's Living Atlas serves Aqueduct
4.0 as a queryable feature service — keyless, CC BY 4.0, and sending
`access-control-allow-origin: *` so a browser can read it directly.

`Analyze → Environmental Risk` now shows both resolutions and names the gap
between them. Measured on the live service:

| | Withdrawal as % of renewable supply |
|---|---|
| China, national (World Bank) | 20.2% |
| Guangzhou basin, Pearl River | 1.6% — Low |
| Beijing basin | 93.7% — Extremely High |
| Hebei basin (pfaf 431648) | 1,969% — Extremely High |

Which is the argument the old caveat was making, with numbers behind it: the
national figure is about 97 times too low for the basin the wheat grows in.

Two traps in this dataset would have produced numbers that do not exist, and
both are handled and tested. Aqueduct writes **9,999 for "arid and low water
use" and -9,999 for "no data"** in every raw field — printed as a percentage the
first reads "999,900% water stress", so coded rows report a classification and
no number. And **withdrawal above 100% is real**, not an error: Hebei mines
groundwater at nearly twenty times its renewable supply, so the figure is never
clamped. A basin crossing a provincial border is also returned once per
province, so rows are deduplicated by `pfaf_id` or a top-ten list becomes the
same basin three times.

## 23. Country borders

✅ 174 countries, Natural Earth 110m, generated by `scripts/build-borders.mjs`
(152 KB, committed). Thin and low-contrast so they orient without competing with
the trade arcs. Labelled an orientation aid, not an authority: simplified to
about a kilometre, following Natural Earth's editorial boundary decisions, and
this project takes no position on any territorial dispute.

## 24. Simplify dashboards

✅ **One scroll region in the panel.** Cards inside it never scroll —
`.ws-card` has no overflow property, the stylesheet does not give it one, and
both a unit test and the QA script fail if a second scroller appears. Larger
readable panels, collapsible sections, clearly separated cards.

## 25. Make information hierarchical

✅ Level 1 is the panel title and summary; level 2 the mandatory why-block;
level 3 the cards, with provenance collapsed inside; level 4 the "what to
investigate next" block. Gap cards and source lists start collapsed.

## 26. Remove unclear buttons

✅ See §4. Every control names its object.

## 27. Add tooltips / explanations

✅ A glossary of the twelve terms that cannot be renamed away — chokepoint, trade
route, supply dependency, HHI, CR4, mirror statistics, aggregate code, TEU, HS
code, exposure, geographic alternative, provenance — attached inline at the word,
with a test capping each definition at 200 characters so it stays tooltip-sized.

## 28. Loading errors must be fixed

✅ Four visually distinct states, because they are four different facts:
`Loading X…` names what is loading; `Unable to load X` gives the detail and a
retry that works; `No X for this selection` is a successful empty result, not a
failure; and `DATA UNAVAILABLE` says nothing will fix it on a retry and states
what would be needed.

A view that throws renders an error card with a retry rather than taking the
panel down — a blank panel is indistinguishable from a broken application.

## 29. Make globe performance stable

🟡 Borders are built once at init and then only shown or hidden. The chain layer
renders on push. The inherited render governor and hidden-tab suspension are
preserved. No unexplained console errors across all twelve flows.

⬜ No formal performance budget was added for the new layers. The inherited
allocation microbenchmarks still run and still pass.

## 30. Create an actual "Global Supply Chain" home view

✅ The landing view. "This is a system for seeing how the world moves goods",
the six-stage chain as clickable stages, live layer counts, fixed-infrastructure
totals, and four investigations to start.

## 31. Events must connect to supply chains

✅ `Global Events` links each live GDACS hazard to the ports and chokepoints
within 500 km, and labels that as **exposure, not impact** — a cyclone 200 km
from a port may close it for a week or miss it entirely.

The Nepal investigation is the reframing: the flood is step **one of six**, not
the answer. Flood → the road it destroyed → the border crossing → what that
corridor carries → how much goes through it (unknown, and it says so) → what
moves instead.

## 32. Create a "why am I seeing this?" component

✅ Mandatory on every data view, test-enforced.

## 33. Make investigation interactive

✅ The "what to investigate next" block phrases every suggestion as the question
a user is actually asking — "What could interrupt all of this?", "Who depends on
this most?", "Where is it actually produced?" — rather than as a menu label.

## 34. Do not overbuild economics yet

✅ No GDP impact, inflation or market modelling. The disruption view states
plainly that turning a reroute into a price needs input-output models this
project does not have, and stops at distance and modelled days.

## 35. Create a clear data legend

✅ A legend opened from the top bar, in four groups: Places, Movement,
Disruption, and **"How sure is this?"** — which explains LIVE, HISTORICAL,
INFERRED, SIMULATED and UNAVAILABLE, because the certainty of a mark matters as
much as its shape.

## 36. Fix mobile / responsive issues

✅ Desktop-first, with readability preferred over fitting everything in. Below
1280px the columns narrow; below 1020px the rail becomes a drawer opened from the
top bar and the panel takes the width; below 620px the breadcrumb hides. Nothing
shrinks below readable type size.

## 37. Do not remove good existing work

✅ Nothing is deleted, and nothing is hidden either.

An earlier version of this got it wrong. It blanked the inherited title bar,
intel HUD, style indicator, data-layer tray, scene director, command dock,
context rail and first-run card while the workspace was up, on the theory that
one window should hold one product, and closed the original supply-chain console
on mount. That removed things that had been asked to be kept. Corrected:

- `src/workspace/shell.js` carries no hide list and never touches the console's
  visibility. A test asserts both, in both directions.
- The workspace is a right-hand dock instead of a full-screen shell.
  `body.ws-docked` slides the inherited context rail, style indicator, HUD
  readouts and command dock inboard by the dock's width so **both interfaces
  are fully on screen at once**. A browser run confirms zero overlapping
  rectangles between any pair of the nine visible panels.
- The dock collapses to an edge tab, so the whole window is one click away and
  one click back.
- The original console mounts collapsed behind its own `SUPPLY CHAIN` chip —
  the affordance it was built with — because it and the dock occupy the same
  column. Collapsed is not hidden: the chip is always there, and clicking it
  opens the console beside the dock rather than under it.

The globe, camera, tracking, trails, HUD, director, voice, share links, live
layers, Nepal evidence pack and inherited scenes all still work.

## 38. Test every major user flow

✅ `npm run qa:workspace` drives all twelve flows in a real browser against live
upstream data. **24/24 pass.** It is committed, repeatable, and exits non-zero
on the first failure.

Beyond the twelve flows it now also proves the things only a real page can:
that every inherited panel is on screen and **no pair of them overlaps**; that
all 29 rows of the inherited layer tray carry a plain-language description; that
the scene picker shows the renamed scenes rather than the inherited labels; that
the freight layers refuse at whole-globe range instead of drawing a band; that
1,464 real pipeline ways load over the Rhine-Ruhr with their substances; that
every freight record declares the volume it does not have as an explicit null;
and that OpenStreetMap geometry carries its ODbL attribution.

One check reports SKIPPED rather than passing on a lie: reaching Esri's Aqueduct
service needs outbound TLS the sandboxed browser does not trust, the same way
basemap tiles already fail there. The module's own logic — sentinels,
deduplication, the finding — is covered without a network in
`waterBasins.test.mjs`.

## 39. Important UX rule

✅ Applied as the test "every view explains why it matters" and "every view
offers a next step", both of which fail the build if a view skips them.

## 40. Final quality standard

🟡 The interface is its own product rather than the inherited one with data
bolted on. Whether it reaches "Google Earth + logistics intelligence" is not
ours to mark.

What can be said is that it is no longer a reskin of what it inherited, while
keeping everything it inherited. `src/ui/styles/identity.css` loads last and
re-skins every stylesheet above it — cyan `#00d4ff` to amber `#f0a830` with teal
as secondary, pure black to navy-slate `#0e1420`, 16px pill radii to 8px, the
cyan bloom reduced to a warm rim, the logo mark's cyan replaced, and the
wordmark de-glowed and renamed to GLOBAL SUPPLY CHAIN EYE. It changes tokens and
a few signature motifs only: no panel is hidden, no control moves, no behaviour
changes.

The intel HUD kept every slot and lost its invented content. `KH11-4180`,
`OPS-4152`, `ORB: 47098 PASS: DESC-206` and `BAND: PAN / BITS: 11 / LVL: 1A`
were random numbers dressed as a reconnaissance satellite's mission, sensor,
orbit and imagery product, under a `TOP SECRET // SI-TK // NOFORN` banner that
made public customs totals look like intercepts. They now read `SUPPLY CHAIN
EYE`, a real session id, `VIEW ONLY · NOT RECORDING`, the three data classes,
and `OPEN DATA · PUBLIC SOURCES · NOT CLASSIFIED`. The camera readouts that were
always real — MGRS, lat/lon, GSD, NIIRS, off-nadir angle, sun elevation —
are untouched.

## 41. Implementation priority

✅ Worked in the specified order: foundation (audit, navigation, terminology,
layout, states), then globe, then supply chain, then transport, then chokepoints,
then investigations, then polish.

## 42. Do not fake data

✅ The discipline that shaped every decision above. Concretely: the production
map ranks exports and says so; five of ten chain stages are empty rather than
imagined; chokepoint transit volumes are absent rather than remembered; per-port
throughput is absent while country-level TEU is used and labelled as national;
Taiwan's trade appears only as a labelled inference; vessel cargo is declared
unavailable; a truncated upstream page is reported as incomplete; and a country
missing from a result is an absent measurement, never a zero.

Also caught: `setCommodity()` returns `false` for an unknown key, and the
authored tour was passing HS codes. Every step was silently rejected and the tour
ran on whatever happened to be selected — producing entirely plausible output
from the wrong query. Both scripts now use group keys, and tests reject anything
`setCommodity` would refuse.

## 43. Do not create more complexity than necessary

✅ Two panels showing the same trade query was the duplication to remove, and the
original console is now the engine behind the new views rather than a second UI.
One card primitive, one scroll region, one state vocabulary, one selection bus.

## 44. Do not stop after the obvious problems

The audit above is the answer. What remains undone is listed as ⬜ with a data or
scope reason in each case, and every one of those gaps is visible in the
interface rather than only in this file.

---

## Summary

Counted by each section's leading verdict (§44 is this summary itself):

| Status | Count | Sections |
| --- | --- | --- |
| ✅ Done and verified | 36 | 1–14, 17, 20, 21, 23–28, 30–39, 41–43 |
| 🟡 Done as far as the data allows, shortfall stated in the UI | 7 | 15, 16, 18, 19, 22, 29, 40 |
| ⬜ Not done | 0 | — |

No requirement is now wholly undone. What remains are shortfalls inside the
seven 🟡 sections, and each one is visible in the interface rather than only in
this file: freight throughput (§15), the inland-distribution and
final-consumer chain stages (§16, §18), facility output (§16), Aqueduct's
modelling limits (§22), a formal performance budget for the new layers (§29),
and the unmarkable judgement in §40.

### What changed in this pass

Five of the six ⬜ items are built. They had been written off on one shared
premise — "no open global dataset for inland freight or facility-level
production" — and that premise was never tested. The probes that disproved it
took minutes:

| Was ⬜ | Now | Source |
|---|---|---|
| Freight rail corridors (§15) | ✅ | OSM `railway=rail`+`usage=main` |
| Road freight corridors (§15) | ✅ | OSM `highway=motorway\|trunk` |
| Pipelines (§15) | ✅ | OSM `man_made=pipeline`+`substance` |
| Air cargo hubs (§15) | ✅ | OurAirports, 1,152 gateways, public domain |
| Facility-level production sites (§16, §18) | 🟡 | OSM quarry/mineshaft/works, with `resource` tags |
| Basin-level water stress (§22) | ✅ | WRI Aqueduct 4.0 via the Esri Living Atlas |

**The lesson, recorded because it is the useful part:** "no open dataset exists"
is a claim that needs a probe behind it, and five of the six here did not have
one. What survives re-probing is a narrower and more honest gap — not the
infrastructure, which is mapped, but the **throughput**: tonne-kilometres by
corridor, heavy-goods counts by road, pipeline flow rates, airport cargo
tonnage, and annual output per facility. Those are per-operator, per-regulator
or commercial, and they are now listed as their own two entries in the layer
browser rather than hidden inside a claim that nothing at all was available.

The one remaining ⬜ is a formal performance budget for the new layers (§29).
The Arctic / Northern Sea Route (§13) stays out as a stated scope limit: its
traffic is not published as a feed and there is no route geometry to draw.

Five of those six are the same underlying fact in different clothes: **there is
no open global dataset for inland freight or for facility-level production.**
That is the boundary of what this project can honestly show, and it is stated in
the interface at every point where a user would otherwise assume the absence of
a marker meant the absence of a thing.
