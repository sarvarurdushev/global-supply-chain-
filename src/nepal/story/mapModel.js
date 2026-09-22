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

import { ResultClass, drawable } from './resultClass.js';
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

/** UNOSAT damage classes → colour. Ordinal, so the ramp is ordinal too. */
export const DAMAGE_COLOURS = Object.freeze({
  'Possible Damage': '#7fd4e8',
  'Moderate Damage': '#ffd166',
  'Severe Damage': '#ff8c42',
  Destroyed: '#ff4d4d',
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
  { classes = null, since = null } = {},
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
      }),
    );
  }
  return drawables;
}

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
      colour: '#ffb020',
      width: 3,
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
      colour: '#ff4d4d',
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
      colour: '#f4713b',
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
        ...(gapView ? { fillOverride: 0.12 } : {}),
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
      colour: '#4dd8ff',
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
      label: `${band.withinMetres >= 1000 ? `${band.withinMetres / 1000} km` : `${band.withinMetres} m`} from an observed damage point`,
      value: band.people,
      fillOverride: 0,
    }),
  );
}

export function drawablesForScene({ state, intelligence, data = {} }) {
  const layers = new Set(state?.visibleLayers ?? []);
  const controls = state?.controls ?? {};
  const out = new Map();
  const add = (layer, items) => {
    if (!layers.has(layer) || items.length === 0) return;
    out.set(layer, items);
  };

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
    const anchor = resolveTarget('damage-centroid', {
      intelligence,
      data,
      selection: state?.selection ?? {},
    });
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
