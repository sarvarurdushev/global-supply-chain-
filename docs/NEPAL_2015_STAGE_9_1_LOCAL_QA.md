# Nepal 2015 briefing: 10-minute local check on a real GPU

The container this was built in has no GPU. Its browser draws with SwiftShader (software WebGL) at
roughly one frame a second and, in long sessions, eventually fails with `Fragment shader failed to
compile. Compile log: null`. That failure is the software renderer running out of resources, not a
defect in the briefing: the same beat plays cleanly when opened fresh. A GPU run is still needed for
what software rendering cannot show: smooth motion, real speech, and how it looks on a projector.

This takes about ten minutes. Please note anything in the table at the end.

## 0. Setup (1 minute)

- Use **Chrome or Edge** on a machine with a GPU. `chrome://gpu` should say _WebGL: Hardware
  accelerated_.
- Open the deployed build, <https://disaster-intelligence-platform.onrender.com>, or run it locally:
  `npm ci && npm run build && npm run preview`, then <http://localhost:4173>.
- Turn the sound on. Full screen (F11) at the resolution you will present at.

## 1. Voice (1 minute, on the BEGIN screen)

1. Open the **VOICE** list under the run buttons. The best English voice should already be selected
   (on Edge, a "Microsoft … Online (Natural)" voice; on Chrome, a "Google UK/US English" voice; on
   macOS Safari, a local voice such as Daniel or Samantha). Novelty voices are listed last, marked
   _novelty_.
2. Press **▶ PREVIEW**. You should hear _"Magnitude seven point eight. Focal depth, eight
   kilometres."_
3. Pick another voice. It previews straight away, and it should still be selected after a reload.
4. Optional: paste this into the DevTools console and send us the output.
   `speechSynthesis.getVoices().map(v => `${v.name} | ${v.lang} | ${v.localService ? 'local' : 'online'}`).join('\n')`

If the list is empty, the browser has no speech voice. The briefing then runs on captions alone,
which is expected behaviour.

## 2. The full 6-minute run (6 minutes, hands off)

Press **6 MIN BRIEFING** and start a stopwatch. Don't touch anything. Landmarks:

| Time  | What should be happening                                                                                          |
| ----- | ----------------------------------------------------------------------------------------------------------------- |
| 0:00  | Incoming incident, then the camera drops onto Nepal                                                               |
| 0:28  | The magnitude (7.8) counts up over the epicentre                                                                  |
| 1:15  | Population meets shaking                                                                                          |
| 1:34  | Damage composition: the destroyed count, then the class bars                                                      |
| 2:09  | Model versus observation: the chart, then the amber verdict _statistically detectable, but a weak association_    |
| 2:46  | The coverage gap: people where nothing was recorded                                                               |
| 3:05  | Road blockages and the network in pieces                                                                          |
| 3:34  | Hospital access before, then (4:01) with the blockages                                                            |
| 4:37  | **Rescue route**: the need, the hospitals, a straight-line guess, the road route, the cut, the search, the result |
| 5:23  | **Executive summary**: six recap lines, then _what we know / infer / simulate / still don't know_                 |
| ≈6:03 | The run ends on the four-part card                                                                                |

These are scene starts measured by `scripts/qa-briefing-runtime.mjs` (the director played hands off in a
browser, with the QA stand-in voice at 2.5 words a second). A real voice speaks at its own pace, so
expect a few seconds either way.

Note the finishing time, and anything that looks frozen for more than about 5 seconds, text that
overlaps or is hard to read from where your audience will sit, or a voice that talks about something
not on screen.

## 3. Rapid NEXT/BACK (1 minute)

Press **6 MIN BRIEFING** again, then:

- press **NEXT →** five times quickly while the camera is flying;
- press **NEXT →** in the middle of a spoken sentence;
- press **← BACK** three times;
- press **❚❚ PAUSE** mid-sentence, wait, then **▶ PLAY**. The sentence should start again from its
  beginning.

Things that should never happen: two voices at once; the old sentence carrying on after NEXT; a
half-drawn line, card or chart left behind from an earlier beat; a caption that doesn't match the
picture.

## 4. Health access and the rescue route (1 minute)

Jump there with NEXT, or let the 6-minute run reach 4:30. Watch in order:

1. the green road route draws from the need to the nearest hospital by road;
2. a red break appears at the observed blockage;
3. the network still reachable spreads out from the origin, and no hospital lies in it;
4. the result card says **DISCONNECTED**, then the detour example shows _+N km_.

Note whether lines sit on the roads or float off them, whether the route draws smoothly, and whether
each step reads before the next one starts.

## 5. Executive summary (40 seconds)

From 5:17: six short recap lines appear one after another as the camera moves Gorkha → shaking →
damage → Sindhupalchok → network → hospital access, then the closing four-part card. Check that every
recap line is readable from the back of the room, and that nothing is still on screen from the scene
before.

## 6. Explore (optional, 1 minute)

Press **EXPLORE**. Choose the road-network or access scene and click a hospital cross. Its card
offers _SHOW CATCHMENT CONTEXT_, _COMPARE DAMAGE SCENARIO_, _TRACE FROM DAMAGE AREA_, _SHOW NEARBY
POPULATION_ and _SHOW SOURCE / DATE_. Actions the analysis can't support are greyed out with the
reason. Then click a blocked road (red): its matched road segment turns red, a dashed leader line
joins the card to it, and _TRACE NETWORK EFFECT_ shows which cells change when only that segment is
removed.

## What to send back

| Check                                               | OK? | Notes (time, beat, what you saw) |
| --------------------------------------------------- | --- | -------------------------------- |
| Voices offered / chosen                             |     |                                  |
| 6 MIN finishing time                                |     |                                  |
| Any moment frozen > 5 s                             |     |                                  |
| Text unreadable at presenting distance              |     |                                  |
| Voice and picture out of step                       |     |                                  |
| NEXT/BACK: two voices, leftovers, half-drawn states |     |                                  |
| Pause/play restarts the sentence                    |     |                                  |
| Rescue route reads step by step                     |     |                                  |
| Summary readable and uncluttered                    |     |                                  |
| Frame rate / stutter (flights, route drawing)       |     |                                  |
