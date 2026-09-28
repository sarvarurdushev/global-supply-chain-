/**
 * What the map should draw, as data.
 *
 * Pure: no Cesium, no DOM. It turns artefacts plus the current scene into a
 * list of drawables — kind, positions, colour, size, and the result class that
 * governs their grammar — and the Cesium layer renders that list without
 * making any visual decision of its own.
 *
 * WHY THE SPLIT. Every layer in this repository already separates `model.js`
 * from `index.js` for the same reason: the interesting failures are visual
 * decisions, not draw calls. "Aftershocks are sized by magnitude" and "an
 * observed point is hard-edged while a modelled field is not" are claims that
 * can be tested here and cannot be tested through a WebGL context. What is
 * left in the renderer is mechanical.
 *
 * THE RULE THIS FILE ENFORCES. Observed and modelled things never share a
 * grammar. It is applied here, once, by passing every drawable through
 * `mapGrammarFor`, rather than being remembered at each call site.
 */

import { ResultClass, drawable, passesFilter } from './resultClass.js';
import { networkDrawables, routeDrawables } from './network.js';

/** MMI → the ramp token. Deliberately not green: green is the interface. */
export const MMI_COLOURS = Object.freeze({
  4: '#7fd4e8',
  4.5: '#96dcd8',
  5: '#a8e6c4',
  5.5: '#d8e8a0',
  6: '#ffd166',
  6.5: '#ffb020',
  7: '#ff8c42',
  7.5: '#f4713b',
  8: '#ff4d4d',
});

/**
 * UNOSAT damage classes → colour. Ordinal, so the ramp is ordinal too.
 *
 * RE-STEPPED IN STAGE 8, BECAUSE THE OLD RAMP FAILED A MEASURED CHECK. The
 * previous steps put Severe (#ff8c42) and Destroyed (#ff4d4d) at ΔE 12.6 under
 * NORMAL colour vision — below the 15 floor, which means readers with full
 * colour vision could not reliably tell them apart. Those are the two classes
 * a reader most needs to separate, on the map and in Scene 08's composition
 * bar alike. The current steps measure ΔE 18.0 normal and 15.0 under
 * deuteranopia, with every step clearing 3:1 against the panel and the chroma
 * floor. The heat direction — cool for slight, hot for destroyed — is
 * unchanged, and so are the classes, the counts and their order: this is a
 * colour fix, not an analytical one.
 */
export const DAMAGE_COLOURS = Object.freeze({
  'Possible Damage': '#56c8ef',
  'Moderate Damage': '#f2d43c',
  'Severe Damage': '#f57c00',
  Destroyed: '#d92b4b',
});

/**
 * Radius for an earthquake marker, in pixels.
 *
 * Area proportional to released energy would make M4 invisible beside M7.8 —
 * a factor of ten thousand — so this is a power law tuned to keep the whole
 * catalogue legible at once, clamped at both ends. It is a LEGIBILITY choice,
 * not a physical one, and the panel states the magnitude rather than asking
 * anyone to read it off the radius.
 */
export function magnitudeRadius(magnitude) {
  if (!Number.isFinite(magnitude)) return 3;
  /*
   * Tuned so the catalogue's real range is legible: M4 lands near 3.5 px and
   * the M7.8 main shock near 25, a spread of about seven. An earlier constant
   * put M4 at 12 px and let the upper clamp do all the work, which drew 316
   * mostly-M4 aftershocks as a field of equal blobs and hid the sequence the
   * scene exists to show.
   */
  return Math.max(3, Math.min(28, 0.45 * 10 ** (0.222 * magnitude)));
}

/** Depth → colour. Shallow is the dangerous case, so shallow is the hot end. */
export function depthColour(depthKm) {
  if (!Number.isFinite(depthKm)) return '#5b6b66';
  if (depthKm < 10) return '#ff4d4d';
  if (depthKm < 25) return '#ff8c42';
  if (depthKm < 50) return '#ffd166';
  return '#7fd4e8';
}

/* ------------------------------------------------------------------ *
 * Per-layer builders. Each takes the data it needs and returns drawables.
 * ------------------------------------------------------------------ */

/** The epicentre, and nothing else. */
export function epicentreDrawables(mainShock) {
  if (!mainShock) return [];
  return [
    drawable({
      id: 'epicentre',
      layer: 'epicentre',
      kind: 'point',
      lon: mainShock.longitude,
      lat: mainShock.latitude,
      radius: magnitudeRadius(mainShock.magnitude),
      colour: '#00ff9c',
      resultClass: ResultClass.OBSERVED,
      label: `M${mainShock.magnitude}`,
      pulse: true,
    }),
  ];
}

/**
 * The seismic sequence.
 *
 * `cutoff` is how the timeline drives the map: events at or before it are
 * drawn and later ones are not. Nothing is interpolated between recorded
 * events, because there is nothing between them — the catalogue is a list of
 * things that happened, not a signal that can be resampled.
 */
export function seismicDrawables(
  events,
  { cutoff = null, mainShockId = null } = {},
) {
  const limit = cutoff ? Date.parse(cutoff) : null;
  const drawables = [];
  for (const event of events ?? []) {
    if (limit !== null && Date.parse(event.time) > limit) continue;
    const isMain = event.id === mainShockId;
    drawables.push(
      drawable({
        id: event.id,
        layer: 'seismic-events',
        kind: 'point',
        lon: event.longitude,
        lat: event.latitude,
        radius: magnitudeRadius(event.magnitude),
        colour: isMain ? '#00ff9c' : depthColour(event.depthKm),
        resultClass: ResultClass.OBSERVED,
        label: `M${event.magnitude}`,
        magnitude: event.magnitude,
        depthKm: event.depthKm,
        time: event.time,
        emphasis: isMain,
      }),
    );
  }
  return drawables;
}

/**
 * The filled intensity surface.
 *
 * `modeled: true` is the important flag: it sends every band through the
 * modelled grammar — soft, unstroked, translucent — so the field can never be
 * mistaken for something anyone observed. `threshold` dims bands below it
 * rather than removing them, because a band that vanishes reads as "no
 * shaking here" instead of "below the level you chose".
 */
export function shakingDrawables(bands, { threshold = null } = {}) {
  return (bands ?? []).map((band) =>
    drawable({
      id: `mmi-${band.mmi}`,
      layer: 'shakemap-bands',
      kind: 'polygon',
      geometry: band.geometry,
      colour: MMI_COLOURS[band.mmi] ?? '#5b6b66',
      resultClass: ResultClass.OBSERVED,
      modeled: true,
      mmi: band.mmi,
      label: band.label,
      dimmed: threshold !== null && band.mmi < threshold,
    }),
  );
}

/**
 * Observed damage points.
 *
 * Hard-edged squares by grammar, against the soft field behind them. `since`
 * drives the reveal by imagery date, which is narrative and also spreads four
 * and a half thousand insertions over the reveal rather than in one frame.
 */
export function damageDrawables(
  features,
  { classes = null, since = null, isolate = null } = {},
) {
  const wanted = classes ? new Set(classes) : null;
  const limit = since ? Date.parse(since) : null;
  const drawables = [];
  for (const feature of features ?? []) {
    const properties = feature.properties ?? {};
    if (wanted && !wanted.has(properties.damageClass)) continue;
    if (limit !== null && Date.parse(properties.sensorDate) > limit) continue;
    const [lon, lat] = feature.geometry.coordinates;
    drawables.push(
      drawable({
        id: `${lon},${lat},${properties.damageClass}`,
        layer: 'damage-points',
        kind: 'square',
        lon,
        lat,
        radius: 4,
        colour: DAMAGE_COLOURS[properties.damageClass] ?? '#5b6b66',
        resultClass: ResultClass.OBSERVED,
        damageClass: properties.damageClass,
        sensorDate: properties.sensorDate,
        settlement: properties.settlement ?? null,
        /*
         * Isolation dims, it never removes: the other areas stay on the map
         * as context, so the reader sees WHICH two places the reversal is
         * about and that they are two of fourteen.
         */
        ...(isolate && !isolate.has(properties.settlement)
          ? { dimmed: true, fillOverride: 0.14 }
          : {}),
      }),
    );
  }
  return drawables;
}

/*
 * LEGIBILITY ON REAL IMAGERY, MEASURED. Sixteen Esri World Imagery tiles
 * over the study area (Gorkha, Dhading, Kathmandu, Bhaktapur, Sindhupalchok,
 * Langtang, Chitwan; z10 and z12) put the median ground luminance at 0.02 to
 * 0.13 — Nepal from orbit is dark forest and shadowed valley, with snow as
 * the bright exception. Against those pixels:
 *
 *  - a Destroyed point (#d92b4b) with the old near-black ring failed 3:1 in
 *    BOTH fill and ring on 61% of the ground, because a dark ring vanishes
 *    into dark terrain. A light ring takes the worst class to 2%, and every
 *    class to 4% or less (the residue is snow, where the fills carry it).
 *  - mid-luminance lines (violet route, red closures, orange landslides)
 *    failed on 24–37% bare; a light casing takes them under 4%. Bright
 *    lines (amber, green, cyan) are best with a dark casing: 0%.
 *  - the district frame at 0.34 had a median contrast of 1.95:1; 0.5 lifts
 *    it to 2.65:1 and still reads as context rather than as a layer.
 *
 * These are colour measurements against real imagery pixels, not a render
 * of the scene over imagery — see the Stage 8 report.
 */
export const POINT_RING = '#e9f3ee';
/*
 * 0.6, not opaque. At 0.85 the ring was more than half of a 4px point and
 * washed Destroyed red to pink on the dark treatment; at 0.6 the worst class
 * fails 3:1 on 8–10% of imagery pixels (from 61%) and keeps its colour.
 */
export const RING_ALPHA = 0.6;
export const CASING_LIGHT = '#e9f3ee';
export const CASING_DARK = '#04070a';

/**
 * THE RING FOLLOWS THE GROUND IT IS DRAWN ON. Light rings are what real
 * imagery needs, and on the offline treatment — a flat dark surface — they
 * paled every dense cluster to pink, because at 4px a 1px ring is half the
 * mark. So the basemap in use decides: the offline grid keeps the dark ring
 * and plain lines it was designed with; any imagery gets the measured light
 * ring and casings.
 */
export function groundIsImagery(stackId) {
  return Boolean(stackId) && stackId !== 'offline';
}

export function pointRingFor(stackId) {
  return groundIsImagery(stackId) ? POINT_RING : CASING_DARK;
}

/** The casing that gives a line its best worst case: light under a
 * mid-luminance line, dark under a bright one. Legibility, not identity. */
export function casingFor(colour) {
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(colour.slice(i, i + 2), 16) / 255,
  );
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance < 0.4 ? CASING_LIGHT : CASING_DARK;
}

/**
 * The one colour each single-colour layer draws in, for the layer toggles.
 *
 * Read by the control strip so a chip can carry its layer's key: Scene 11
 * drew amber roads, orange landslides and red bridges with nothing on
 * screen saying which was which. The drawables below read the same table,
 * so the key and the map cannot drift apart.
 */
export const LAYER_SWATCHES = Object.freeze({
  'blocked-roads': '#ffb020',
  'bridges-out': '#ff4d4d',
  landslides: '#f4713b',
  'aoi-footprints': '#4dd8ff',
});

/** Blocked roads, bridges and landslides, each with its own grammar. */
export function infrastructureDrawables(nga, { show = null } = {}) {
  const wanted = show ? new Set(show) : null;
  const drawables = [];
  const push = (layer, features, build) => {
    if (wanted && !wanted.has(layer)) return;
    (features ?? []).forEach((feature, index) =>
      drawables.push(build(feature, index)),
    );
  };

  push('blocked-roads', nga?.blockedRoads?.features, (feature, index) =>
    drawable({
      id: `blocked-road-${index}`,
      layer: 'blocked-roads',
      kind: 'polyline',
      positions: feature.geometry.coordinates,
      colour: LAYER_SWATCHES['blocked-roads'],
      width: 3,
      cased: true,
      resultClass: ResultClass.OBSERVED,
      sensedOn: feature.properties?.sensedOn ?? null,
    }),
  );
  push('bridges-out', nga?.bridgesOut?.features, (feature, index) =>
    drawable({
      id: `bridge-out-${index}`,
      layer: 'bridges-out',
      kind: 'marker',
      lon: feature.geometry.coordinates[0],
      lat: feature.geometry.coordinates[1],
      radius: 9,
      colour: LAYER_SWATCHES['bridges-out'],
      resultClass: ResultClass.OBSERVED,
      glyph: 'bridge',
    }),
  );
  push('landslides', nga?.landslides?.features, (feature, index) =>
    drawable({
      id: `landslide-${index}`,
      layer: 'landslides',
      kind: 'polygon',
      geometry: feature.geometry,
      colour: LAYER_SWATCHES.landslides,
      resultClass: ResultClass.OBSERVED,
    }),
  );
  return drawables;
}

/**
 * The national outline, plus neighbours as a hairline.
 *
 * Nepal is filled faintly and stroked; everything else gets an edge and no
 * fill, so the eye goes to the country under investigation without the
 * neighbours disappearing into the sea.
 */
export function outlineDrawables(districts) {
  return (districts ?? []).map((feature) =>
    drawable({
      id: `district-${feature.properties.districtKey}`,
      layer: 'nepal-outline',
      kind: 'polygon',
      geometry: feature.geometry,
      colour: '#22d97f',
      resultClass: ResultClass.OFFICIAL,
      district: feature.properties.district,
      fillOverride: 0.06,
    }),
  );
}

/**
 * The district frame as faint context under a scene that does not draw
 * districts itself.
 *
 * WHY. On satellite imagery the country is legible from the ground itself;
 * on the offline treatment — which is what a dead venue network produces —
 * the only geography left is a graticule, and Scene 17 at 900 km was a grid
 * with nothing in it. District edges are not in satellite imagery either,
 * so this helps on every basemap: an aftershock cloud, a damage point or a
 * blocked road is read against the frame the analysis itself uses.
 *
 * One PolylineCollection, not 75 ground polygons: it is a hairline, not a
 * layer anyone reads for its own sake. Its class is OFFICIAL like the
 * boundaries it draws, so a result-class filter that excludes OFFICIAL
 * removes it with everything else.
 */
export const CONTEXT_LAYER = 'district-context';
const DRAWS_DISTRICTS = Object.freeze([
  'nepal-outline',
  'district-bivariate',
  'district-focus',
  'coverage-gap',
]);

export function contextDrawables(districts) {
  const out = [];
  for (const feature of districts ?? []) {
    const geometry = feature.geometry;
    const polygons =
      geometry?.type === 'MultiPolygon'
        ? geometry.coordinates
        : geometry?.type === 'Polygon'
          ? [geometry.coordinates]
          : [];
    polygons.forEach((polygon, p) => {
      /* The outer ring only: a district's holes are its neighbours' edges. */
      const ring = polygon[0];
      if (!ring?.length) return;
      out.push(
        drawable({
          id: `context-${feature.properties.districtKey}-${p}`,
          layer: CONTEXT_LAYER,
          kind: 'lines',
          positions: ring,
          colour: '#22d97f',
          width: 1,
          /* 0.5, measured against imagery: see POINT_RING above. */
          fillOverride: 0.5,
          resultClass: ResultClass.OFFICIAL,
          district: feature.properties.district,
        }),
      );
    });
  }
  return out;
}

function wantsContext(state, layers) {
  const index = state?.scene?.index;
  /* Scene 00 is the globe; a district frame there is a speck. */
  if (!(index > 0)) return false;
  if (DRAWS_DISTRICTS.some((layer) => layers.has(layer))) return false;
  const filter = new Set(state?.resultClassFilter ?? []);
  return passesFilter(ResultClass.OFFICIAL, filter);
}

/**
 * Everything the current scene should draw.
 *
 * Returns drawables grouped by layer so a renderer can add and remove one
 * layer without touching the others — the difference between a scene change
 * costing one layer and costing the whole map.
 */

/* ------------------------------------------------------------------ *
 * District choropleths. Scenes 06, 07 and 12 all colour the same 75
 * polygons by different fields, so they share one builder and differ only
 * in how a district is scored.
 * ------------------------------------------------------------------ */

/**
 * Colour 75 district polygons by a scoring function.
 *
 * A district the scorer cannot score is DRAWN, in the data-gap grey, rather
 * than omitted. This is the single most important behaviour in this file: a
 * missing district that is simply absent from the map reads as a district
 * where nothing happened, and Scene 12 exists to say that those are not the
 * same thing.
 *
 * @param {Array} features district GeoJSON features
 * @param {(props:object)=>({colour:string,resultClass:string,modeled?:boolean,
 *          label?:string,value?:*}|null)} score
 * @param {object} [options]
 * @param {string} [options.layer]
 * @param {string} [options.emphasise] district name drawn at full strength
 */
export function districtDrawables(
  features,
  score,
  { layer, emphasise = null } = {},
) {
  return (features ?? []).map((feature) => {
    const props = feature.properties ?? {};
    const scored = score(props) ?? null;
    const dimmed = emphasise !== null && props.district !== emphasise;
    return drawable({
      /* The scorer's own extras (fillOverride, maxMmi, …) ride through. */
      ...(scored ?? {}),
      id: `${layer}-${props.districtKey ?? props.district ?? 'unknown'}`,
      layer,
      kind: 'polygon',
      geometry: feature.geometry,
      district: props.district ?? null,
      colour: scored?.colour ?? DATA_GAP_GREY,
      resultClass: scored?.resultClass ?? ResultClass.DATA_GAP,
      modeled: scored?.modeled === true,
      label: scored?.label ?? `${props.district ?? 'Unknown'} — no data`,
      value: scored?.value ?? null,
      dimmed,
    });
  });
}

/** Grey for a district nothing can be said about. Never absent, never green. */
export const DATA_GAP_GREY = '#5b6b66';

/**
 * Scene 06 — where shaking and population overlap.
 *
 * BOTH DIMENSIONS COME STRAIGHT OUT OF THE ARTEFACT. Colour is the district's
 * `maxMmi` on the same MMI ramp Scene 04 uses, and fill strength is its
 * `exposedPercent` — the share of its people inside the headline contour.
 * Neither is computed here.
 *
 * An earlier version invented a density cut to make a 2x2. It had to go: the
 * artefact's own density figure is people per square kilometre while its
 * quadrant cut is people per ~1 km cell, and converting between them in the
 * frontend would have been this file doing analysis behind the analysis's
 * back — the one thing Stage 7 forbids outright. Using the two fields the
 * artefact already publishes needs no conversion and no new threshold.
 *
 * A district with no row is grey and says so. 38 of the 75 never reached the
 * threshold, and "did not reach the threshold" is a finding, not a blank.
 */
export function overlapDrawables(features, districtQuadrants) {
  const byKey = new Map(
    (districtQuadrants ?? []).map((row) => [row.districtKey, row]),
  );
  const levels = Object.keys(MMI_COLOURS)
    .map(Number)
    .sort((a, b) => a - b);
  const rampFor = (mmi) => {
    if (!Number.isFinite(mmi)) return null;
    let chosen = levels[0];
    for (const level of levels) if (level <= mmi) chosen = level;
    return MMI_COLOURS[chosen];
  };

  return districtDrawables(
    features,
    (props) => {
      const row = byKey.get(props.districtKey);
      if (!row) return null;
      const colour = rampFor(row.maxMmi);
      if (!colour) return null;
      const share = Math.min(100, Math.max(0, row.exposedPercent ?? 0)) / 100;
      return {
        colour,
        /*
         * DERIVED: two measured quantities read together. The weakest link
         * sets the class, and neither input is weaker than that.
         */
        resultClass: ResultClass.DERIVED,
        modeled: true,
        label: `${row.district} — MMI ${row.maxMmi}, ${row.exposedPercent}% of ${row.population.toLocaleString('en-GB')} people inside the contour`,
        value: row.exposedPercent,
        maxMmi: row.maxMmi,
        /* 0.12 floor so a 0%-exposed district is visible, not invisible. */
        fillOverride: 0.12 + share * 0.58,
      };
    },
    { layer: 'district-bivariate' },
  );
}

/**
 * Scene 07 — the descent. One district at full strength, the rest as context.
 *
 * The polygons are OFFICIAL and carry no analysis, so they are drawn in the
 * official colour rather than scored. What changes is emphasis.
 */
export function districtFocusDrawables(features, { district = null } = {}) {
  return districtDrawables(
    features,
    (props) => ({
      colour: props.district === district ? '#4dd8ff' : '#0f9d58',
      resultClass: ResultClass.OFFICIAL,
      label: props.district ?? 'Unknown district',
      value: props.district ?? null,
      /*
       * A TINT, NOT A COVER. The chosen district took the OFFICIAL grammar's
       * 0.95 fill, and at the scene's close camera the screen was one flat
       * cyan field — on satellite imagery that is the whole basemap hidden
       * behind the one thing the scene is about. The edge carries the
       * emphasis; the fill only says "this one".
       */
      fillOverride: props.district === district ? 0.14 : 0.04,
    }),
    { layer: 'district-focus', emphasise: district },
  );
}

/**
 * Scene 12 — the coverage gap. THE MOST IMPORTANT MAP IN THE PRODUCT.
 *
 * It colours districts by whether the infrastructure survey looked there, not
 * by whether anything was damaged there. A district with zero records is drawn
 * in the data-gap grey and its label says "no records" — never "no damage",
 * and never left blank. ZERO OBSERVATIONS IS NOT ZERO DAMAGE, and the whole
 * scene is built to make that impossible to misread.
 */
export const COVERAGE_COLOURS = Object.freeze({
  observed: '#00ff9c',
  sparse: '#ffb020',
  none: DATA_GAP_GREY,
});

export function coverageDrawables(
  features,
  recordsByDistrict,
  { sparseUnder = 5, emphasise = 'observed' } = {},
) {
  const counts = new Map(Object.entries(recordsByDistrict ?? {}));
  return districtDrawables(
    features,
    (props) => {
      const count = Number(counts.get(props.district) ?? 0);
      /*
       * `emphasise` flips which side of the question the map answers, and
       * BOTH READINGS ARE ABOUT THE SURVEY. "Districts not surveyed" is not
       * "districts undamaged", which is the whole reason this scene exists;
       * the gap reading simply makes the 66 the figure rather than the
       * background.
       */
      const gapView = emphasise === 'gaps';
      if (count === 0) {
        return {
          colour: COVERAGE_COLOURS.none,
          resultClass: ResultClass.DATA_GAP,
          label: `${props.district} — no infrastructure records. Not a finding of no damage.`,
          value: 0,
          ...(gapView ? { fillOverride: 0.72 } : {}),
        };
      }
      return {
        colour:
          count < sparseUnder
            ? COVERAGE_COLOURS.sparse
            : COVERAGE_COLOURS.observed,
        resultClass: ResultClass.OBSERVED,
        label: `${props.district} — ${count} record${count === 1 ? '' : 's'}`,
        value: count,
        /*
         * Half, not the observed grammar's 0.95. That alpha is for discrete
         * marks; over nine districts it was a flat neon slab that hid the
         * basemap and the district edges inside it. At half it is still the
         * loudest thing on the map against the gap grey, which is all the
         * scene needs it to be.
         */
        fillOverride: gapView ? 0.12 : 0.5,
      };
    },
    { layer: 'coverage-gap' },
  );
}

/* ------------------------------------------------------------------ *
 * Scene 10 — the second observation system
 * ------------------------------------------------------------------ */

/** Copernicus grading vocabulary, reduced to the three states it means. */
export const GRADING_COLOURS = Object.freeze({
  destroyed: '#ff4d4d',
  slight: '#ffb020',
  unaffected: '#0f9d58',
  unknown: DATA_GAP_GREY,
});

/** Which of those four a raw grading string is. Heterogeneous by source. */
export function gradingBucket(value) {
  const text = String(value ?? '').toLowerCase();
  if (text.includes('completely destroyed')) return 'destroyed';
  if (text.includes('negligible to slight')) return 'slight';
  if (text.includes('not affected')) return 'unaffected';
  return 'unknown';
}

/**
 * Copernicus grading points, columnar in and primitives out.
 *
 * 41,042 points. The brief's rule is that performance is solved by simplifying
 * RENDERING and never by simplifying a reported figure, so every point is
 * drawn — as primitives, which is one draw call — and `stride` exists only for
 * the presentation path where a laptop projector is the constraint. When a
 * stride is used the panel still quotes 41,042, and `drawn` reports what the
 * map shows so the two can never be confused.
 */
export function gradingDrawables(grading, { buckets = null, stride = 1 } = {}) {
  if (!grading?.count) return [];
  const wanted = buckets ? new Set(buckets) : null;
  const step = Math.max(1, Math.floor(stride));
  const out = [];
  for (let i = 0; i < grading.count; i += step) {
    const bucket = gradingBucket(grading.gradingValues[grading.grading[i]]);
    if (wanted && !wanted.has(bucket)) continue;
    out.push(
      drawable({
        id: `grading-${i}`,
        layer: 'copernicus-points',
        kind: 'point',
        lon: grading.lon[i],
        lat: grading.lat[i],
        radius: 3,
        colour: GRADING_COLOURS[bucket],
        resultClass:
          bucket === 'unknown' ? ResultClass.DATA_GAP : ResultClass.OBSERVED,
        bucket,
        aoi: grading.aoiValues[grading.aoi[i]] ?? null,
      }),
    );
  }
  return out;
}

/**
 * The areas each grading campaign actually covered.
 *
 * Drawn as outlines with almost no fill, because the footprint is the
 * argument: what the satellites looked at is a small part of the shaken area,
 * and a solid fill would read as a finding about the ground rather than as a
 * statement about the survey.
 */
export function aoiDrawables(features) {
  return (features ?? []).map((feature, index) =>
    drawable({
      id: `aoi-${feature.properties?.aoi ?? index}`,
      layer: 'aoi-footprints',
      kind: 'polygon',
      geometry: feature.geometry,
      colour: LAYER_SWATCHES['aoi-footprints'],
      resultClass: ResultClass.OFFICIAL,
      label: feature.properties?.aoi ?? `AOI ${index + 1}`,
      fillOverride: 0.06,
    }),
  );
}

/* ------------------------------------------------------------------ *
 * Scene 15 — people and damage
 * ------------------------------------------------------------------ */

/**
 * The proximity bands, drawn as a distance scale rather than a footprint.
 *
 * WHY NOT A BUFFER. The artefact's figures count ~1 km population cells whose
 * CENTRE lies within D metres of an observed damage point. Drawing that as a
 * filled buffer around 4,500 damage points would produce one continuous blob
 * that looks like a damage footprint, which is a different and much stronger
 * claim than the one the analysis makes.
 *
 * So the rings are anchored at one place, concentric, unfilled and labelled
 * with the distance — a ruler laid on the map. The counts stay in the panel,
 * where the wording that qualifies them is.
 */
export function proximityRingDrawables(bands, { lon, lat, chosen = null }) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [];
  const distance = (metres) =>
    metres >= 1000 ? `${metres / 1000} km` : `${metres} m`;
  return (bands ?? []).map((band) =>
    drawable({
      /*
       * The chosen ring is drawn; the others stay as a faint scale around it.
       * Removing them would lose the sense of distance the rings exist to
       * give, which is the only thing they claim.
       */
      dimmed: chosen !== null && band.withinMetres !== chosen,
      id: `proximity-${band.withinMetres}`,
      layer: 'proximity-rings',
      kind: 'circle',
      lon,
      lat,
      radiusMetres: band.withinMetres,
      colour: '#4dd8ff',
      resultClass: ResultClass.DERIVED,
      label: `${distance(band.withinMetres)} from an observed damage point`,
      /*
       * On the map, just the distance: the sentence sat over the densest
       * cluster in the scene and could not be read. The panel's headline
       * already says what the distance is from.
       */
      caption: distance(band.withinMetres),
      /*
       * One label, on the chosen ring. Five labels on one anchor printed on
       * top of each other as an unreadable smear; the dimmed rings are a
       * scale, and a scale does not need captions.
       */
      showLabel: chosen === null || band.withinMetres === chosen,
      value: band.people,
      fillOverride: 0,
    }),
  );
}

export function drawablesForScene({
  state,
  intelligence,
  data = {},
  focus = null,
}) {
  const layers = new Set(state?.visibleLayers ?? []);
  const controls = state?.controls ?? {};
  const out = new Map();
  const add = (layer, items) => {
    if (!layers.has(layer) || items.length === 0) return;
    out.set(layer, items);
  };

  if (data.districts && wantsContext(state, layers)) {
    out.set(CONTEXT_LAYER, contextDrawables(data.districts));
  }
  if (layers.has('epicentre')) {
    add('epicentre', epicentreDrawables(intelligence?.seismic?.mainShock));
  }
  if (layers.has('nepal-outline') && data.districts) {
    add('nepal-outline', outlineDrawables(data.districts));
  }
  if (layers.has('seismic-events') && data.seismicEvents) {
    add(
      'seismic-events',
      seismicDrawables(data.seismicEvents, {
        cutoff: controls.timeCutoff,
        mainShockId: intelligence?.seismic?.mainShock?.id,
      }),
    );
  }
  if (layers.has('shakemap-bands') && data.intensityBands) {
    add(
      'shakemap-bands',
      shakingDrawables(data.intensityBands, {
        threshold: controls.intensityThreshold,
      }),
    );
  }
  if (layers.has('damage-points') && data.unosat) {
    add(
      'damage-points',
      damageDrawables(data.unosat, {
        classes: controls.damageClass ? [controls.damageClass] : null,
        /* Scene 09's third beat: the two areas that straddle a band edge. */
        isolate:
          focus?.mapAction === 'isolateAreas'
            ? new Set(
                (
                  intelligence?.damage?.byIntensity?.withinAnalysisArea ?? []
                ).map((area) => area.area),
              )
            : null,
      }),
    );
  }
  for (const layer of ['blocked-roads', 'bridges-out', 'landslides']) {
    if (layers.has(layer) && data.nga) {
      add(layer, infrastructureDrawables(data.nga, { show: [layer] }));
    }
  }
  if (layers.has('population-density') && data.densityRaster) {
    /*
     * One drawable for 177,679 cells. The raster is computed once and cached
     * by the caller; this only says where to put it.
     */
    add('population-density', [
      drawable({
        id: 'population-density',
        layer: 'population-density',
        kind: 'raster',
        raster: data.densityRaster,
        colour: '#ffb020',
        resultClass: ResultClass.ESTIMATE,
        modeled: true,
        label: 'Modelled population, ~1 km cells',
      }),
    ]);
  }
  if (layers.has('district-bivariate') && data.districts) {
    add(
      'district-bivariate',
      overlapDrawables(
        data.districts,
        intelligence?.exposure?.districtQuadrants,
      ),
    );
  }
  if (layers.has('district-focus') && data.districts) {
    add(
      'district-focus',
      districtFocusDrawables(data.districts, {
        district: state?.selection?.district ?? null,
      }),
    );
  }
  if (layers.has('coverage-gap') && data.districts) {
    add(
      'coverage-gap',
      coverageDrawables(
        data.districts,
        recordsByDistrict(intelligence?.infrastructure?.distribution),
        { emphasise: controls.coverageToggle ?? 'observed' },
      ),
    );
  }
  if (layers.has('copernicus-points') && data.copernicusGrading) {
    add(
      'copernicus-points',
      gradingDrawables(data.copernicusGrading, {
        buckets: controls.gradingBucket ? [controls.gradingBucket] : null,
        stride: controls.gradingStride ?? 1,
      }),
    );
  }
  if (layers.has('aoi-footprints') && data.copernicusAois) {
    add('aoi-footprints', aoiDrawables(data.copernicusAois));
  }
  if (layers.has('road-network') && data.graphEdges) {
    add(
      'road-network',
      networkDrawables(data.graphEdges, {
        disabledEdgeIds:
          intelligence?.infrastructure?.network?.blockageMatching
            ?.disabledEdgeIds ?? [],
        classes: controls.roadClasses ?? null,
        /* A scene that draws a route makes the network its background. */
        dimmed: layers.has('route-baseline') || layers.has('route-damaged'),
      }),
    );
  }
  if (data.route) {
    const lines = routeDrawables(data.route);
    for (const layer of ['route-baseline', 'route-damaged']) {
      add(layer, lines[layer]);
    }
  }
  if (layers.has('proximity-rings')) {
    /*
     * The rings sit on a REAL damage point — the one nearest the centroid —
     * because the label says "from an observed damage point". Centred on the
     * mean of 4,583 points they were centred on a place nothing was observed.
     */
    const centroid = resolveTarget('damage-centroid', {
      intelligence,
      data,
      selection: state?.selection ?? {},
    });
    const anchor = nearestPoint(data.unosat, centroid) ?? centroid;
    add(
      'proximity-rings',
      proximityRingDrawables(intelligence?.people?.proximity?.bands, {
        ...anchor,
        chosen: controls.proximityBand ?? null,
      }),
    );
  }
  return out;
}

/**
 * Infrastructure records per district, summed across every record type.
 *
 * Scene 12 asks whether the survey LOOKED at a district, so a road, a bridge
 * and a landslide all count the same. The artefact publishes each type's
 * `byDistrict` separately, and this only adds them up.
 */
export function recordsByDistrict(distribution) {
  const totals = {};
  for (const group of Object.values(distribution ?? {})) {
    for (const row of group?.byDistrict ?? []) {
      if (!row?.id) continue;
      totals[row.id] = (totals[row.id] ?? 0) + (Number(row.count) || 0);
    }
  }
  return totals;
}

/**
 * Where the camera should look for a named scene target.
 *
 * Targets are NAMES in the scene list rather than coordinate pairs, so the
 * choreography reads as a descent and the positions come from the artefacts —
 * the epicentre is wherever USGS put it, not wherever someone once typed it.
 *
 * An unresolvable target falls back to the country rather than to 0,0. A
 * camera that flies to the Gulf of Guinea because a lookup missed is a very
 * loud bug with a very quiet cause, and the fallback keeps it on screen.
 */
export const NEPAL_CENTRE = Object.freeze({ lon: 84.1, lat: 28.4 });

export function resolveTarget(
  name,
  { intelligence = null, data = {}, selection = {} } = {},
) {
  const shock = intelligence?.seismic?.mainShock;
  if (!name || name === 'globe' || name === 'nepal') return { ...NEPAL_CENTRE };
  if (name === 'epicentre' || name === 'rupture') {
    return shock
      ? { lon: shock.longitude, lat: shock.latitude }
      : { ...NEPAL_CENTRE };
  }
  if (name.startsWith('district:')) {
    const wanted = name.slice('district:'.length);
    const feature = (data.districts ?? []).find(
      (entry) => entry.properties?.district === wanted,
    );
    const centroid = feature?.properties?.centroid;
    if (centroid) return { lon: centroid[0], lat: centroid[1] };
    return { ...NEPAL_CENTRE };
  }
  if (name === 'district') {
    return resolveTarget(
      selection.district ? `district:${selection.district}` : 'nepal',
      { intelligence, data, selection },
    );
  }
  if (name === 'damage-centroid' || name === 'straddling-areas') {
    return centroidOf(data.unosat) ?? { ...NEPAL_CENTRE };
  }
  if (name === 'route') {
    /*
     * The route's OWN geometry, not the blockage centroid.
     *
     * `route` used to fall through to the infrastructure extent, which put
     * the camera over the closures — south-east of the journey — and left
     * the two route lines off the edge of the frame. Scene 14's subject is
     * the line, so the camera frames the line.
     */
    const line =
      data.route?.damaged?.coordinates ?? data.route?.baseline?.coordinates;
    if (line?.length) {
      let lon = 0;
      let lat = 0;
      for (const point of line) {
        lon += point[0];
        lat += point[1];
      }
      return { lon: lon / line.length, lat: lat / line.length };
    }
  }
  if (name === 'infrastructure-extent' || name === 'network-extent') {
    return (
      centroidOfLines(data.nga?.blockedRoads?.features) ?? { ...NEPAL_CENTRE }
    );
  }
  if (name === 'coverage-contrast') {
    return resolveTarget('district:Sindhupalchok', {
      intelligence,
      data,
      selection,
    });
  }
  if (name === 'aoi-pair') {
    const aoi = data.copernicusAois?.[0]?.properties?.centroid;
    if (aoi) return { lon: aoi[0], lat: aoi[1] };
    return { ...NEPAL_CENTRE };
  }
  return { ...NEPAL_CENTRE };
}

function centroidOf(features) {
  if (!features?.length) return null;
  let lon = 0;
  let lat = 0;
  for (const feature of features) {
    lon += feature.geometry.coordinates[0];
    lat += feature.geometry.coordinates[1];
  }
  return { lon: lon / features.length, lat: lat / features.length };
}

/** The point feature nearest a target, by equirectangular distance. */
export function nearestPoint(features, target) {
  if (!features?.length || !target) return null;
  const k = Math.cos((target.lat * Math.PI) / 180);
  let best = null;
  let bestD = Infinity;
  for (const feature of features) {
    const [lon, lat] = feature.geometry?.coordinates ?? [];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const d = ((lon - target.lon) * k) ** 2 + (lat - target.lat) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { lon, lat };
    }
  }
  return best;
}

function centroidOfLines(features) {
  if (!features?.length) return null;
  let lon = 0;
  let lat = 0;
  let count = 0;
  for (const feature of features) {
    for (const position of feature.geometry.coordinates) {
      lon += position[0];
      lat += position[1];
      count += 1;
    }
  }
  return count > 0 ? { lon: lon / count, lat: lat / count } : null;
}

/**
 * How far the camera must sit from its subject to end up at a given height.
 *
 * WHY THIS EXISTS. `camera.flyTo({ destination, orientation: { pitch } })`
 * treats the destination as the CAMERA POSITION, not as the thing to look at.
 * Scene 04 asks for 900 km at a 70-degree pitch over the rupture; read that
 * way, the camera parked itself above the rupture and then looked 70 degrees
 * down and north, which put the entire modelled shaking field off the bottom
 * edge of the screen. The scene was drawing correctly and framing nothing.
 *
 * A scene's `target` is the subject, so the camera is placed by range from it
 * instead: range = height / sin(pitch). At a nadir pitch that is the height
 * itself, so the vertical scenes are unaffected.
 *
 * @param {object} pose
 * @param {number} pose.altKm intended camera height above the subject
 * @param {number} [pose.pitch] degrees, negative below the horizon
 * @returns {number} range in metres from the subject to the camera
 */
export function cameraRangeMetres({ altKm, pitch = -90 }) {
  const height = Math.max(1, Number(altKm) || 1) * 1000;
  /*
   * Clamp away from the horizon only. sin(0) is a camera at infinite range;
   * sin(90) is exactly 1, so a nadir scene must NOT be clamped — a 89.9 cap
   * made the vertical scenes land 1.4 m off their stated altitude for no
   * reason at all.
   */
  const degrees = Math.min(90, Math.max(5, Math.abs(Number(pitch) || 90)));
  return height / Math.sin((degrees * Math.PI) / 180);
}
