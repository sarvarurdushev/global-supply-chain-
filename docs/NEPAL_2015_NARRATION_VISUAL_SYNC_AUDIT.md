# Nepal 2015 briefing — narration ↔ visual synchronisation audit (Stage 9.2)

Two methods, both required: **measured** (every figure the voice says, timed by the
rendered neural clips, against the moment the picture first shows it) and **watched**
(stills of each changed beat at the moment of a key word, read frame by frame). A test
from tables alone was not accepted.

Verdicts: **PASS** — in sync as built; **FIXED** — out of sync when watched, corrected,
and re-shot; **FAIL** — open.

## 1. Watched — the moments that carry the story

| Scene · beat | Narration says | Must be on screen at that moment | Verdict |
| --- | --- | --- | --- |
| 04 · magnitude | "Magnitude 7.8." | The counter at the epicentre; the impact cue | PASS |
| 05 · scale | "These colours are intensity…" | The legend; *MAGNITUDE ≠ INTENSITY* chip | PASS |
| 05 · scale | "Not magnitude, which is one number…" | The card MAGNITUDE 7.8 · ONE NUMBER / INTENSITY · DIFFERENT AT EVERY PLACE | FIXED — the card came at 4.4 s against the sentence at 3.8 s; moved to 3.8 s |
| 05 · scale | "Six is strong. Eight, severe." | Bands ≥ VI lit, legend row VI; then ≥ VIII, row VIII | FIXED — highlights were set for the estimate (8.6 / 9.8 s); the rendered voice says them at 7.1 / 8.2 s; retimed |
| 06 · first-hour | "21 more earthquakes in the first hour" | Events arriving; clock DAY 0 · +n MIN; counter 21 | FIXED — the clock read "+0 H" through the whole first hour; it now counts minutes |
| 08 · second | "The days pass." | The clock running from day 1; old events dimming | PASS (the delivery pause holds the voice for 0.9 s while the clock runs) |
| 08 · second | "On 12 May, 17 days after the first" | Clock at DAY 17 · 12 MAY 2015 | FIXED — the clock reached 12 May 0.6 s after the date was said; the seek now lands on the word (3.0 s) |
| 08 · second | "a second major earthquake" / "magnitude 7.3" | The ring at the epicentre of the M7.3, the aftershock cue; then the counter | PASS |
| 08 · second | (labels) | M7.3 · 12 MAY readable | FIXED — labels for M6.6 and M7.8 overlapped near the epicentre, and the M7.3 label sat under the counter. Only M7+ are labelled now, above-left of the dot |
| 08 · decay | (labels, final watch) | M7.3 · 12 MAY and KATHMANDU both readable | FIXED — in the final 40-scene watch the M7.3 label sat on the KATHMANDU place name (the city lies 75 km west of the shock, its name set to the right). An event label now takes the first corner — above-left, below-left, below-right, above-right — that no place name, callout or counter occupies, and keeps it until that corner is taken, so it never hops during a flight. Re-shot: below-left, clear |
| 07 · catalogue → depth (F) | "Each bar counts magnitudes from its lower edge…" | Bars labelled by their edges; the rule card | PASS |
| 07 · threshold (F) | "Why so few below magnitude 4.0?" | First bar in focus; verdict INCOMPLETE BELOW M4.0 | FIXED — the verdict appeared 4 s after the question; now at 0.6 s |
| 07 · law (F) | "Two were very large" | The two largest pulsing — and the map showing the year the chart counts | FIXED — the map showed only the first week while the chart counted the year, and the M7.3 pulsed before the timeline reached it; the map now shows the whole year in 07, and 08 rewinds to day 1 at its cut |
| 12 · lag (F) | "The median wait: 4 days" | Clock at DAY 4 | FIXED — the clock reached day 4 1.1 s late; retimed to 1.5 s |
| 13 · together | "So where analysts found damage, most of it was the worst kind." | Composition chart full; WHAT THIS MEANS kicker | PASS |
| 16 · half | "Half of them lie in only 37" | Busiest squares lit; counter 37 | PASS |
| 18 · statistic | "chance cannot explain it … it is weak" | Test card, then V counter | FIXED — the term chip overlapped the lifted chart; the definitions now live on the card and the counter's label |
| 18 · reversal | "At seven and a half, the destroyed share drops" | Trend line with the drop in red; verdict | FIXED — the verdict still read "detectable but weak" during the reversal; it now says the share drops at 7.5 |
| 18 · reversal → hypotheses | (chart, final watch) | The destroyed shares readable | FIXED — in the final 40-scene watch the red "DROPS AT MMI 7.5" label inside the plot sat on the 38.7 % figure. The verdict above the bars already says it, so the plot keeps only the red step; re-shot |
| 20 · no-denominator | "No record is not no damage." | The bracketed empty square; WHAT THIS MEANS kicker | PASS |
| 25 · blocked | "184 road blockages were observed" | Markers on the map; counter | PASS (0.4–1.0 s after the word; within tolerance) |
| 30 · the-map | "So the bigger gap was the map itself" | No-route places dominant, the network receding (focus) | PASS |
| 32 · result | "One blockage cut this place off" | DISCONNECTED card; the disconnect cue | PASS |
| all | WHAT THIS MEANS / WHAT IT CANNOT TELL US | Kicker readable | FIXED — the kicker floated above the caption box over the map; it now sits inside the caption panel, and the bottom band reserves its line |

**Before / after must be visible when the narration says so:** scene 25 (main network
before, then with the blockages removed and the split counted), 26 (routes before and
after), 29 → 30 (baseline search, then the same search with the blockages), 32 (the route
before, the blockage on 4 May, the search over what still connects) — PASS in the stills.

## 2. Measured — every figure the 6 MIN run says

`node scripts/qa-briefing-sync.mjs --run six`: each sentence starts where the previous
clip ended; a word is placed by its share of its sentence. PASS if the figure is on screen
before it is said, or within 1.5 s after. The FULL run: 117 figures, 0 late.

| Beat | Figure said | Said at | First shown | Verdict |
| --- | --- | ---: | ---: | --- |
| incoming:detected | `{quake.time|dateLong}` | 0.0 s | already on screen | PASS |
| incoming:detected | `{quake.time|utcHM}` | 2.0 s | already on screen | PASS |
| locate:epicentre | `{geo.epicentreDistrict}` | 4.5 s | 1.9 s | PASS |
| main-shock:magnitude | `{quake.magnitude|dec1}` | 1.0 s | 0.5 s | PASS |
| main-shock:depth | `{quake.depthKm|dec1}` | 0.3 s | already on screen | PASS |
| shaking:kathmandu | `{exposure.kathmandu.maxMmi|dec1}` | 2.0 s | 0.7 s | PASS |
| shaking:kathmandu | `{exposure.kathmandu.exposed|millionWords}` | 2.6 s | 0.7 s | PASS |
| first-hours:first-hour | `{seq.hourly.0.count|int}` | 1.3 s | 0.9 s | PASS |
| first-hours:first-day | `{seq.firstDay|int}` | 0.0 s | 0.6 s | PASS (≤ 1.5 s after) |
| second-shock:second | `{seq.secondary.time|dayMonth}` | 2.1 s | already on screen | PASS |
| second-shock:second | `{seq.secondary.daysFromMainShock|int}` | 2.7 s | already on screen | PASS |
| second-shock:second | `{seq.secondary.magnitude|dec1}` | 7.9 s | already on screen | PASS |
| people-meet-shaking:meets | `{exposure.mmi6|millionWords}` | 1.3 s | 1.4 s | PASS (≤ 1.5 s after) |
| density-meets-shaking:hot | `{exposure.highHigh.people|millionWords}` | 2.7 s | 1.2 s | PASS |
| density-meets-shaking:hot | `{exposure.highHigh.shareOfPopulationPercent|int}` | 4.1 s | 1.2 s | PASS |
| damage-composition:destroyed | `{damage.total|int}` | 4.0 s | already on screen | PASS |
| damage-composition:destroyed | `{damage.destroyed|int}` | 5.2 s | already on screen | PASS |
| damage-composition:severe | `{damage.severe|int}` | 0.0 s | already on screen | PASS |
| damage-composition:severe | `{damage.moderate|int}` | 2.5 s | already on screen | PASS |
| damage-composition:severe | `{damage.possible|int}` | 4.5 s | already on screen | PASS |
| damage-concentration:grid | `{damage.grid1km.occupiedCells|int}` | 4.1 s | 1.6 s | PASS |
| damage-concentration:half | `{damage.gridHalf.units|int}` | 2.0 s | 0.3 s | PASS |
| model-vs-observation:shares | `{damage.byIntensity.2.destroyedShare|dec1}` | 3.0 s | already on screen | PASS |
| model-vs-observation:shares | `{damage.byIntensity.0.destroyedShare|dec1}` | 5.3 s | already on screen | PASS |
| model-vs-observation:statistic | `{damage.independence.cramersV|dec2}` | 6.2 s | already on screen | PASS |
| coverage-gap:unrecorded | `{coverage.unrecorded.people|millionWords}` | 0.8 s | 0.3 s | PASS |
| main-network:blocked | `{access.matching.blockages|int}` | 1.8 s | 2.8 s | PASS (≤ 1.5 s after) |
| main-network:blocked | `{access.matching.stage5MajorNetworkMatched|int}` | 4.5 s | 2.8 s | PASS |
| main-network:pieces | `{infra.baseline.components|int}` | 3.0 s | already on screen | PASS |
| main-network:pieces | `{infra.damaged.components|int}` | 4.2 s | 0.6 s | PASS |
| district-routes:routes | `{infra.routes.pairs|int}` | 3.1 s | already on screen | PASS |
| district-routes:outcomes | `{infra.routes.outcomes.UNCHANGED|int}` | 0.0 s | already on screen | PASS |
| district-routes:outcomes | `{infra.routes.outcomes.DETOUR|int}` | 0.8 s | already on screen | PASS |
| district-routes:outcomes | `{infra.routes.outcomes.NOT_ROUTABLE_BASELINE|int}` | 1.8 s | already on screen | PASS |
| baseline-access:roads | `{access.network.lengthKm|int}` | 3.3 s | 1.8 s | PASS |
| baseline-access:hospitals | `{access.lists.codCompiled|dateLong}` | 2.8 s | 2.9 s | PASS (≤ 1.5 s after) |
| baseline-access:no-road | `{access.hospital.peopleNoMappedRoadNearbyShare|int}` | 1.1 s | 0.6 s | PASS |
| baseline-access:median | `{access.hospital.medianBaselineKm|dec1}` | 4.2 s | already on screen | PASS |
| scenario-access:blockages | `{access.matching.blockages|int}` | 1.4 s | 2.4 s | PASS (≤ 1.5 s after) |
| scenario-access:blockages | `{access.matching.matched|int}` | 3.7 s | 2.4 s | PASS |
| scenario-access:cut | `{access.hospital.byCategory.DISCONNECTED|thousandWords}` | 0.8 s | 0.7 s | PASS |
| scenario-access:longer | `{access.detours.people|thousandWords}` | 0.6 s | 0.6 s | PASS (≤ 1.5 s after) |
| scenario-access:longer | `{access.detours.medianExtraKm|dec1}` | 3.7 s | 0.6 s | PASS |
| scenario-access:unchanged | `{access.hospital.byCategoryShareOfRoadConnected.SIMILAR|int}` | 0.2 s | already on screen | PASS |
| scenario-access:the-map | `{access.manbu.sites|int}` | 3.1 s | 3.6 s | PASS (≤ 1.5 s after) |
| rescue-route:need | `{access.cut.origin.district}` | 2.7 s | already on screen | PASS |
| rescue-route:need | `{access.cut.origin.people|int}` | 3.5 s | already on screen | PASS |
| rescue-route:facilities | `{access.cut.investigation.nearbyHospitals.0.district}` | 2.7 s | already on screen | PASS |
| rescue-route:facilities | `{access.cut.investigation.nearbyHospitals.1.district}` | 3.5 s | already on screen | PASS |
| rescue-route:nearest | `{access.cut.baseline.hospital.district}` | 2.1 s | already on screen | PASS |
| rescue-route:before | `{access.cut.baseline.km|dec1}` | 1.7 s | already on screen | PASS |
| rescue-route:cut | `{access.cut.blockagesOnBaselineRoute.0.sensedOn|dateLong}` | 0.2 s | already on screen | PASS |
| rescue-route:search | `{access.cut.investigation.reachableAfter.lengthKm|dec1}` | 2.0 s | already on screen | PASS |
| summary:epicentre | `{quake.magnitude|dec1}` | 2.1 s | 0.6 s | PASS |
| summary:epicentre | `{geo.epicentreDistrict}` | 3.4 s | 0.6 s | PASS |
| summary:shaking | `{exposure.mmi6|millionWords}` | 0.0 s | 0.6 s | PASS (≤ 1.5 s after) |
| summary:damage | `{damage.total|int}` | 0.0 s | 0.6 s | PASS (≤ 1.5 s after) |
| summary:damage | `{damage.gridHalf.units|int}` | 4.5 s | 0.6 s | PASS |
| summary:gap | `{coverage.unrecorded.people|millionWords}` | 0.0 s | already on screen | PASS |
| summary:network | `{summary.nga.blockedRoads|int}` | 1.4 s | 0.6 s | PASS |
| summary:network | `{summary.nga.bridgesOut|int}` | 2.7 s | 0.6 s | PASS |
| summary:access | `{access.hospital.byCategory.DISCONNECTED|thousandWords}` | 0.0 s | 0.6 s | PASS (≤ 1.5 s after) |
| summary:access | `{access.stableTop|names}` | 3.8 s | 0.6 s | PASS |

63 figures said in the six run; 0 late.
