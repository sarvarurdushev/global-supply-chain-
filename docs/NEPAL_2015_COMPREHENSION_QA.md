# Nepal 2015 briefing — comprehension QA (Stage 9.2)

One audience question per analytical scene. The test: after the scene plays, could a
viewer who has never seen the data answer it from what was **said or shown** — not from the
technical layer, not from prior knowledge? **FAIL** if the presentation does not answer
it. Checked against the generated script (`docs/NEPAL_2015_EXECUTIVE_BRIEFING_SCRIPT.md`),
the rendered voice and stills of each beat.

## Per scene

| Scene | Run | Question a viewer should be able to answer | Answered by | Verdict |
| --- | --- | --- | --- | --- |
| 04 Main shock | 3 · 6 · F | How big and how deep was it, and why does shallow matter? | Counters 7.8 / 8.2 km; "energy released close to the surface"; *MAGNITUDE* chip | PASS |
| 05 Shaking | 3 · 6 · F | What do the colours show, and how is that different from magnitude? | "These colours are intensity: how hard the ground shook at each place. Not magnitude…"; card and chip | PASS (FAIL in 9.1) |
| 06 First hours | 6 · F | Did the ground settle after the main shock? | "The ground did not settle"; 21 in the first hour; clock card | PASS |
| 07 Seismic sequence | F | Why does the first magnitude bar look so small? | "Below that size, many were never listed … the first bar is a floor, not a count" | PASS (FAIL in 9.1) |
| 08 Second shock | 6 · F | How long after the first did the second major earthquake come? | The clock runs to 12 May; "17 days after the first"; label M7.3 · 12 MAY | PASS (FAIL in 9.1) |
| 10 Population meets shaking | 3 · 6 · F | How many people were inside strong shaking — counted or estimated? | 13.8 million; "modelled, not counted"; *WORLDPOP* chip | PASS |
| 11 Density × shaking | 6 · F | Where did the most people meet the strongest shaking? | The dense, strongly shaken squares stay lit (Kathmandu Valley); 44 % of everyone in the area analysed | PASS |
| 12 Evidence arrives | F | Why is a damage map also a clock? | The clock runs to the median image day; "a damage map is also a map of when someone could look" | PASS (FAIL in 9.1) |
| 13 Damage composition | 3 · 6 · F | Of the damage that was found, how bad was most of it? | "Most of it was the worst kind"; 45.5 % destroyed | PASS |
| 16 Concentration | 6 · F | Was damage spread out, and is this all the damage? | "Piled up, not spread out"; "that is where analysts looked … not a map of all the damage" | PASS |
| 18 Model vs observation | 3 · 6 · F | Did stronger shaking mean worse damage? | "The link is real … but it is weak"; "not a straight line"; "shaking alone does not decide the damage" | PASS (FAIL in 9.1) |
| 20 Coverage gap | 3 · 6 · F | Does "no damage recorded" mean "no damage"? | "No record is not no damage" | PASS |
| 25 Network | 6 · F | What did the blockages do to the main roads? | "Only 21 on a main road"; "the main network splits … some places lost their main-road link" | PASS (FAIL in 9.1) |
| 26 District routes | 3 · 6 · F | Could Kathmandu still reach the districts by main road? | 8 unchanged, 1 detour, 5 never had a route; "the bigger gaps were older than the earthquake" | PASS |
| 29 Baseline access | 6 · F | Before any damage, how far was a hospital, and is that a travel time? | 7.5 km median; "road distance, not travel time" | PASS |
| 30 Scenario access | 3 · 6 · F | Who lost road access to a hospital, and what was the bigger problem? | 86 thousand; "the bigger gap was the map itself" | PASS (FAIL in 9.1) |
| 32 Rescue route | 6 · F | What did one blockage do to one place? | "One blockage cut this place off from every mapped hospital" | PASS |
| 40 Summary | 3 · 6 · F | What do we know, infer, simulate — and not know? | Closing card and line | PASS |
| 31, 33–39 | F | (as their questions on screen) | See the explanation audit | PASS |

## The six-minute run, watched as a normal viewer

The reviewer's notes, beat by beat, on what an executive who knows nothing about seismology
would take away. They use the rendered voice's timing (the 6 MIN run is 6:15 with the
default neural voice; times from the generated script).

- **00:00–00:38 — the event.** Clear. The date and time, then Nepal, Kathmandu, the
  epicentre. "Magnitude 7.8" now comes with a one-line meaning on screen.
- **00:38–01:03 — shaking.** In 9.1 a viewer could leave thinking the colours were the
  magnitude. Now the voice says what they are and are not, and the card puts the two side by
  side. Six and eight light up as they are named.
- **01:03–01:29 — the sequence.** The clock card makes time visible: +MIN, +H, then days.
  "Seventeen days later" is something the viewer watches pass, and the M7.3 arrives as the
  date is said. "It was a sequence, and it was not over" lands as the point.
- **01:29–01:49 — people.** Modelled, not counted — said and shown. "Dense" is defined the
  first time it matters.
- **01:49–03:17 — damage.** The hardest stretch. The composition reads easily; the
  concentration now ends on "piled up, not spread out" and its caveat. The model-versus-
  observation statistic is the most technical moment of the run: the p-value chip and then
  the Cramér's V chip carry the two words a viewer would not know, and the meaning beat
  says the takeaway without statistics.
- **03:17–03:25 — so far.** The one recap. It is short and it asks the next question,
  which turns the story from damage to access.
- **03:25–05:34 — roads and hospitals.** Each step says what it measured and what it is
  not (distance, not time; a scenario, not a record). The single-place route is the most
  memorable minute of the briefing.
- **05:34–06:15 — summary.** Unchanged in structure; the close is the score's last cue.

Weak points that remain: the 6 MIN run is about 15 seconds over six minutes; the damage
stretch is dense; and on a machine without the neural clips the system voice's timing is
an estimate.

## Three levels

| Level | Where | What it offers |
| --- | --- | --- |
| **WATCH** | The briefing (BEGIN BRIEFING; 3 MIN, 6 MIN, FULL) | Voice, captions with WHAT THIS MEANS / WHAT IT CANNOT TELL US / NEXT QUESTION / SO FAR kickers, first-use term chips |
| **INTERACT** | EXPLORE (E) and the inspector on any map object | The same layers and records, at the viewer's pace |
| **VERIFY** | TECH (I) and the glossary (? / G) during the run; the methodology records and `docs/` | The method of each analysis (Level 2), the precise definition of each term, and the source, class, artefact and record behind every figure on screen |
