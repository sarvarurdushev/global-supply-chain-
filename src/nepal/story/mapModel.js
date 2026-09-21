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

import { mapGrammarFor } from './resultClass.js';
import { ResultClass } from './resultClass.js';

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

/** A drawable, with its grammar already resolved. */
function drawable(input) {
  const grammar = mapGrammarFor(input.resultClass, {
    modeled: input.modeled === true,
  });
  return Object.freeze({
    ...input,
    grammar,
    /* Convenience for the renderer; identical information to `grammar`. */
    outlineWidth: grammar.outlineWidth,
    fillAlpha: grammar.fillAlpha,
  });
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
  return out;
}
