# Entry point: `/` opens Case 001

Natural Disaster Intelligence, Case 001 — Nepal Earthquake, 25 April 2015.

This records an entry-point defect, the reason earlier browser QA did not
catch it, and the fix. It is not an analytical change: no Stage 3–5
calculation, artefact, headline figure or dataset was touched.

---

## 1. The defect

Opening the application at its bare address, `http://localhost:4173/` or the
hosted root, did **not** show the Nepal investigation. It showed the inherited
God's Eye View workspace:

- page title "God's Eye View";
- the address rewritten to a camera hash over Austin, Texas
  (`#v=2&lat=30.2672&lon=-97.7431&…&map=esri-imagery`);
- after about three seconds, the "MISSION CONTROL · FIRST LAUNCH / Choose your
  first view" chooser (LIVE CONTACTS, SPACE MISSIONS, ENVIRONMENTAL, EXPLORE
  MANUALLY);
- the inherited chrome: DATA LAYERS and SCENES panels (Nepal Flood Incident,
  Global Flights Radar, Orbital Watch, Thermal Threat Board…), the SUPPLY
  CHAIN chip, and the right-hand "Global Supply Chain" workspace panel;
- the Nepal case only as a small chip, "CASE 001 — NEPAL 2015", in the
  bottom-left corner, partly over the imagery credit.

Measured on commit `8d7efa7` in a fresh Chromium profile that opened only `/`.

## 2. Why Stage 7 and Stage 8 QA did not show it

The Stage 7 and Stage 8 screenshot scripts opened `/`, waited about three
seconds and **clicked the "CASE 001 — NEPAL 2015" chip**. Every screenshot
after that was taken at `http://localhost:4173/#/case/npl-2015-eq/scene/<id>`.
Several scripts then moved between scenes with a test handle
(`window.__godsEyeView.nepalCase.experience.goTo` / `whenSceneReady`) rather
than the interface.

At the moment of that click the first-launch chooser was already on screen.
Opening the case adds `body.ndi-open`, and `nepal-case.css` hides the chooser
and all the inherited chrome under that class. So every captured frame showed
the case and none showed what a visitor sees first. The QA tested the case
correctly and tested the wrong entry path.

## 3. The startup path, and where the old shell kept control

```
src/main.js
  → createStandaloneApplication            src/standalone/application.js
    → scene      createStandaloneScene      (Cesium viewer, map stack)
    → controls   createApplicationControls  src/app/controls.js
                   StyleManager / ApplicationShell / ShareRestoration
                   – parse the hash as a GEV share state
                   – restore saved workspace layers (gev:layer-state:v2)
                   – no share state → flyToAustin()
    → data       createStandaloneData
    → tools      createApplicationTools     src/app/tools.js
                   startChrome → initFirstRunExperience  (the chooser)
                   createNepalCaseMount     src/ui/nepal/mount.js
                     – builds the chip
                     – opens the case ONLY IF the hash starts with
                       #/case/npl-2015-eq
```

With no hash the mount did nothing, so the inherited shell owned the page:
its camera, its restored layers, its chooser and its chrome.

## 4. The fix

| Where | Change |
| --- | --- |
| `src/ui/nepal/mount.js` | `resolveEntry`, `claimEntryAddress`, `WORKSPACE_HASH`. With `entry: true` the mount opens the case on construction for every address except `#/workspace`, and claims the address with `replaceState` (so Back leaves the product rather than stepping into the old shell). Only `#/workspace` closes it; closing names `#/workspace` so a reload keeps the choice. |
| `src/main.js` | Decides the entry once, before startup, and drops any non-case hash (for example a restored `#v=2&lat=…` tab) so the inherited shell never reads it. |
| `src/app/controls.js`, `applicationShell.js`, `shareRestoration.js` | On the case entry: no fly-in to Austin (it lands 500 ms in and could cancel the case's first flight) and no restoring of layers a workspace session saved (they would draw under the case). `#/workspace` behaves exactly as before. |
| `src/standalone/startupChrome.js` | The first-launch chooser is not initialised in this build, and its markup is removed. `firstRunExperience.js` is untouched. |
| `src/app/tools.js` | Mounts the case as the entry. |
| `index.html`, `hud-loading.html` | Title "Natural Disaster Intelligence — Case 001 · Nepal Earthquake 2015"; loading cover "NATURAL DISASTER INTELLIGENCE", status "Opening Case 001 — Nepal earthquake, 25 April 2015…". |
| `src/ui/nepal/topBar.js`, `artefacts.js` | Header reads `NATURAL DISASTER INTELLIGENCE` / `CASE 001 / NEPAL EARTHQUAKE / 25 APR 2015`; the catalogue id `NPL-2015-EQ` is kept as the tooltip. The identity is one constant, `CASE_IDENTITY`, and is not a result. |
| `build/build-info.js` | Every build writes `/version.json` and a `build-commit` meta tag with the commit it was built from (Render's `RENDER_GIT_COMMIT` when present, git otherwise), so a deployment can be compared with a local build by reading one file. |

Nothing inherited was deleted. The workspace, its layers, scenes and the
supply-chain console are all still in the build.

## 5. Addresses

| Address | Opens |
| --- | --- |
| `/` | Case 001, scene 00, EXPLORE |
| `/#/case/npl-2015-eq/scene/<id>?…` | Case 001 at that scene (deep links unchanged) |
| `/#v=2&lat=…` (an old workspace link or restored tab) | Case 001; the old hash is dropped |
| `/#/workspace` | The inherited workspace, with the chip to open the case; no chooser |

## 6. How the root is verified

The verification journey uses a new Chromium process with a fresh temporary
profile (no localStorage, sessionStorage or cookies) and opens only
`http://localhost:4173/`. It moves only by clicking the interface (the scene
rail, PRESENT, EXPLORE, 6 MIN). It never calls into the application, never
navigates to a deep link, never writes storage and never dispatches events.
Waits are DOM conditions (the rail's `aria-current`, the header's `READY`),
browser network idle and a fixed settle. It records, for every frame, the
address, the title, the header, the current scene, whether any inherited
workspace text is visible, and the `build-commit` meta tag.

Unit tests cover the address rules, the entry open (no click, no push, no
`hashchange`), the workspace route, closing, the legacy-hash drop, the
declined layer restore and the build stamp.

## 7. Deployment parity

`render.yaml` deploys branch `claude/supply-chain-intelligence-platform-5u3va2`
with `autoDeploy: true`, so every push to that branch is built. To confirm the
hosted site is the version tested locally:

1. Locally, after `npm run build`: `cat dist/version.json`.
2. Hosted: open `https://<your-service>.onrender.com/version.json`.
3. The `commit` values must be equal, and `dirty` must be `false` locally.

If they differ, the host has not deployed that commit yet: check the service's
**Events** tab for a failed or pending build, or use **Manual Deploy → Deploy
latest commit**.

## 8. Known limits

- The frames of this verification show Esri World Imagery tiles: after a
  container restart the automated browser could load them, with no change to
  this repository, the browser's settings or its certificate store. The
  Stage 8 report's limitation is left exactly as recorded for Stage 8. The
  browser renders through SwiftShader, so tiles refine slowly and a frame
  taken a few seconds after a flight can still show coarse tiles.
- The circular dark vignette at the map's edge is the inherited scope mask of
  the NORMAL visual style. It was present in the Stage 8 frames too and was not
  changed here.
- The `#/workspace` route does not write its camera into the address, because
  the inherited share-link writer only owns empty or camera hashes. A camera
  link copied from the workspace (`#v=2&…`) now opens Case 001, by design:
  the workspace is reached by `#/workspace` and nothing else.
