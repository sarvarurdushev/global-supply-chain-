# Stage 6 — Frontend implementation plan

Companion to `NEPAL_2015_STAGE_6_DESIGN.md`. **Nothing here is built yet.**

This is the §28 C/D deliverable: components, state, scene system, map layers,
animation, data loading, charts, both modes — and an honest split between what
already exists and what does not.

---

## 1. What exists versus what must be built

### Exists — reuse unchanged

| Module | Role in Stage 6 |
| --- | --- |
| `src/ui/styles/identity.css` | Whole visual identity. Extended, not replaced. |
| `src/workspace/components.js` | `card`, `metric`, `metricRow`, `dataClassBadge`, `provenanceBlock`, `whyThisMatters`, `unavailableState`, `term` |
| `src/workspace/shell.js` | Right dock, drawer, analysis panel, playback strip |
| `src/workspace/globeAdapter.js` | `flyTo({lat, lon, altKm, durationSec})` |
| `src/scenes/cameraMotion.js` | `createCameraMotion` — timed flights |
| `src/disaster/investigation.js` | State machine: case / depth / phase / layers |
| `src/disaster/demo.js` | `createDemoPlayback` — presentation engine |
| `src/disaster/session.js` | Single load point |
| `src/disaster/catalogue.js` | LEVEL 0 case list |
| `src/ui/supplychain/charts.js` | `barChart`, `timeSeriesChart`, `beforeAfterChart` |
| `src/supplychain/{graph,routing,centrality}.js` | Routing engine — **do not rewrite** |
| `src/disaster/response.js` | `buildRoadGraph` |
| `src/nepal/**` (Stages 0–5) | All twenty-two analyses, unchanged |

### Exists — extend

| Module | Extension |
| --- | --- |
| `src/workspace/taxonomy.js` | `DATA_CLASS_PRESENTATION` → canonical 8-class `ResultClass` + legacy aliases |
| `src/ui/styles/identity.css` | MMI ramp, result-class accents, hatch patterns |
| `src/nepal/analysis/exposure.js` | **`intensityBands`** — the one new analysis |
| `src/nepal/analysis/terminology.test.mjs` | Run `findForbiddenPhrasing` over every scene string |
| `pipelines/analyse/{seismic,exposure}.mjs` | Emit `validation.checks` in the Stage 5 array shape so the top bar can count all five artefacts uniformly (additive; existing fields stay) |

### Must be built

| New module | Kind | Why |
| --- | --- | --- |
| `src/nepal/story/scenes.js` | **pure** | Declarative scene list: id, act, question, datasets, layers, camera, panel spec, result classes, limitations |
| `src/nepal/story/artefacts.js` | **pure** | Typed accessors over parsed artefact JSON so views never touch raw shapes |
| `src/nepal/story/resultClass.js` | **pure** | Canonical classes, aliases, presentation, map grammar |
| `src/nepal/story/loader.js` | Node/browser adapter | Fetch + cache Tier 1/Tier 2, nothing else |
| `src/layers/nepal/*` | Cesium layers | shakemap-bands, population-density, damage-points, copernicus-points, infrastructure, road-network, coverage-gap, proximity-rings |
| `src/ui/nepal/sceneRail.js` | UI | Left rail |
| `src/ui/nepal/intelPanel.js` | UI | Right panel, rebuilt per scene |
| `src/ui/nepal/topBar.js` | UI | Real state only |
| `src/ui/nepal/sceneControls.js` | UI | Bottom strip per scene |
| `src/ui/nepal/charts.js` | UI | `slopeChart`, `curveChart`, `concentrationCurve` |
| `workers/graph.worker.js` | Worker | Build the road graph off the main thread |
| `pipelines/build-frontend-assets.mjs` | Build | Precompute graph, density texture, simplified geometry, scene manifest |

---

## 2. State model

**One state object. Every view is a projection of it** — the rule
`investigation.js` already enforces and the reason the timeline and the panel
cannot disagree.

```js
{
  caseId: 'npl-2015-eq',
  mode: 'EXPLORE' | 'PRESENT',
  scene: 9,                       // 0..18
  act: 'I' | 'II' | 'III',

  selection: {                    // cross-filter, one source of truth
    district: 'Gorkha' | null,
    damageClass: Set<string>,
    analysisArea: string | null,
    origin: nodeId | null,
    destination: nodeId | null,
  },

  controls: {
    intensityThreshold: 6,        // scenes 04, 05
    timeCutoff: ISO | null,       // scenes 03, 16
    clock: 'EARTHQUAKE'|'IMAGERY'|'MAPPING'|'PUBLICATION',
    associationTolerance: 50,     // scene 11
    proximityBand: 500,           // scene 15
  },

  layers: Set<layerId>,           // persists across scenes
  resultClassFilter: Set<ResultClass>,  // scene 17, global effect

  load: { tier1: 'ready', tier2: Map<datasetId, 'idle'|'loading'|'ready'|'failed'> },
}
```

**Derived, never stored:** camera pose (from scene + selection), panel contents
(from scene + selection + artefacts), visible layers (scene ∩ layers ∩ class
filter). Storing any of those is how two panels start disagreeing.

---

## 3. Scene system

Scenes are **data, not code** — the pattern `hazards.js` already uses for hazard
types and the reason new scenes will not need new modules.

```js
// src/nepal/story/scenes.js  (pure, no Cesium, no fetch, fully testable)
{
  id: 'model-vs-observed',
  index: 9,
  act: 'II',
  title: 'Model versus observation',
  question: 'Does observed damage get worse where the model says shaking was stronger?',
  datasets: ['unosat', 'shakemap'],          // drives Tier 2 prefetch
  analyses: ['damage-by-intensity'],          // drives methodology link
  layers: ['shakemap-bands', 'damage-points'],
  camera: { altKm: 25, pitch: -45, target: 'straddling-areas', durationSec: 3 },
  beats: [
    { id: 'looks-correlated', holdSec: 6, panel: 'lookAtTheMap' },
    { id: 'the-statistics',   holdSec: 8, panel: 'chiSquare' },
    { id: 'the-reversal',     holdSec: 12, panel: 'withinArea', mapAction: 'isolateAreas' },
  ],
  resultClasses: ['DERIVED'],
  limitations: ['selection-bias', 'not-causal', 'effect-size-small'],
}
```

A scene declares **what it needs**; the runtime decides *when* to load it. The
declaration is also what the forbidden-phrasing test runs over.

**Testability:** because scenes are pure data, the whole sequence can be tested
without Cesium — every scene has a question, every dataset id resolves, every
analysis id matches a real methodology record, no string trips
`findForbiddenPhrasing`, and camera altitudes decrease monotonically within an act.

---

## 4. Map layer contracts

Each layer follows the existing `createXLayer({ source, overlayHost })` pattern
with `enable() / disable() / refresh(state)`, so the layer tray and scene system
drive them identically.

| Layer | Primitive | Budget | Notes |
| --- | --- | --- | --- |
| `nepal-outline` | Polyline + polygon | 75 → simplified | Animated draw-on |
| `seismic-events` | PointPrimitiveCollection | 316 | Sized by M, coloured by depth |
| `shakemap-bands` | GroundPrimitive | 8 bands | Needs `intensityBands` |
| `population-density` | Texture + extruded grid | texture + ≤8k boxes | Decimated by altitude |
| `damage-points` | PointPrimitiveCollection | 4,583 | Clustered above 150 km |
| `copernicus-points` | PointPrimitiveCollection | 41,042 | **Primitives, never entities** |
| `infrastructure` | Polyline + Point + Polygon | 235 | Three sub-toggles |
| `road-network` | PolylineCollection | 5,454 edges | Worker-built graph |
| `coverage-gap` | GroundPrimitive, hatched | 75 | Scene 12 |
| `proximity-rings` | GroundPrimitive | 5 | Scene 15 |

**Hard rule: no scene declares more than three heavy layers.** The scene
validator enforces it.

---

## 5. Animation system

Three kinds, deliberately separated:

1. **Camera** — `createCameraMotion`, ease-in-out, never cuts.
2. **Data reveal** — staged insertion (Scene 08's reveal by imagery date, Scene
   02's aftershock fade). Narrative *and* a performance strategy.
3. **Panel transitions** — 150 ms cross-fade, `--transition-fast`.

`prefers-reduced-motion` collapses camera flights to 400 ms, disables orbit, and
makes data reveals instant. Nothing becomes unavailable.

---

## 6. Data loading

```
startup ──► Tier 1 (334 KB, 5 files, parallel) ──► top bar real ──► Scene 00
                                                          │
scene change ──► prefetch next scene's datasets ──────────┘
              └► load current scene's datasets if cold
```

- Tier 1 is blocking; the case card renders behind it.
- Tier 2 is per-dataset, cached, and **prefetched one scene ahead** — in PRESENT
  mode two ahead, since the sequence is known.
- A failed Tier 2 load degrades to `unavailableState()` with what failed and a
  retry. The scene still renders; the layer does not.

---

## 7. Chart system

Extend `src/ui/supplychain/charts.js` rather than adding a dependency. Three new
inline-SVG primitives:

| Primitive | Scene | Shape |
| --- | --- | --- |
| `slopeChart` | 09 | Paired before/after lines, one per analysis area |
| `curveChart` | 11, 15 | X–Y line with a marked headline point and a shaded sensitivity range |
| `concentrationCurve` | 08 | Lorenz-style cumulative share |

All respect the result-class colours and take a `resultClass` prop that sets
stroke style — a fitted line is violet and dashed, an observed series is solid.

---

## 8. Explore and present

Both drive **the same state**; neither has a private rendering path. This is the
rule `demo.js` already states and the reason a demo cannot show something the
product cannot.

- **EXPLORE** — free navigation, layers persist, deep links, methodology on every
  figure.
- **PRESENT** — `createDemoPlayback` over the Nepal script; timed beats; pause
  drops into EXPLORE at that exact state; resume continues; `SHORT` variant.

---

## 9. Performance risks, ranked

| # | Risk | Impact | Mitigation | Confidence |
| --- | --- | --- | --- | --- |
| 1 | **Copernicus 41,042 as entities** would stall Scene 10 | Scene unusable | Primitive collection only; AOI-bounded; close zoom only | High — pattern exists in `earthquakes/model.js` |
| 2 | **Population density texture** is a new asset pipeline on Scene 05's critical path | Headline scene slips | Build it in P5 with a JSON fallback that renders a decimated grid | Medium |
| 3 | **OSM roads 5.2 MB + graph build** on the main thread | Frame drops entering Scene 13 | Precomputed typed-array graph + Worker | Medium |
| 4 | **Cesium primitive count** across carried-over layers | Gradual degradation in EXPLORE | Three-heavy-layer cap, enforced by the scene validator | High |
| 5 | Tier 1 parse (334 KB across 5 files) blocking first paint | Slow start | Case card renders first; parse is ~40 ms measured | High |

**The rule that governs all five: no mitigation removes an analytical figure.**
Decimation affects what is *drawn*, never what is *reported*.

---

## 10. Open questions for review

1. **Scene count.** Nineteen (00–18) against the brief's seventeen. I added a
   case card and split infrastructure from the coverage gap because Scene 12 is
   too strong to share a scene. Happy to merge back.
2. **Default district for Scene 07.** Gorkha has the most observations (1,847);
   Sindhupalchok sets up Scene 12 better but has no UNOSAT points to show.
   Currently Gorkha — worth arguing.
3. **DEM.** SRTM is openly licensed and not ingested. Ingesting it would add
   terrain realism and enable landslide-slope analysis, but it is Stage 5 work
   reopened. Recommend: **not now**, keep it as the one closeable gap.
4. **Legacy `DATA_CLASS_PRESENTATION` consumers.** Aliasing keeps them working;
   migrating them fully is a larger change. Recommend alias now, migrate later.
5. **Scene 18.** Cut first if time is short. Confirm that is acceptable.
6. **Mobile.** Explicitly out of scope. Confirm.
