/**
 * The Cesium renderer for the Nepal case.
 *
 * Deliberately thin. Every visual decision — colour, size, edge, fill,
 * grammar — was made in `src/nepal/story/mapModel.js`, which is pure and
 * tested. This file turns those decisions into primitives and nothing else,
 * because what happens inside a WebGL context cannot be asserted in the test
 * suite and so should contain as little judgement as possible.
 *
 * PRIMITIVES FOR POINTS, ENTITIES FOR THE REST. Four and a half thousand
 * damage points as entities would stall the scene; as a PointPrimitiveCollection
 * they are one draw call. Polygons and polylines number in the tens or low
 * hundreds, where entities are the simpler tool and the cost is irrelevant.
 *
 * LAYERS ARE ADDED AND REMOVED INDEPENDENTLY. A scene change that turns one
 * layer off must not rebuild the others: the drawables arrive grouped by layer
 * for exactly that reason, and this keeps one collection per layer so the diff
 * is a map lookup rather than a full teardown.
 */

import * as Cesium from 'cesium';

const COLOUR_CACHE = new Map();

function colour(hex, alpha) {
  const key = `${hex}:${alpha}`;
  let value = COLOUR_CACHE.get(key);
  if (!value) {
    value = Cesium.Color.fromCssColorString(hex).withAlpha(alpha);
    COLOUR_CACHE.set(key, value);
  }
  return value;
}

/** Flatten a GeoJSON polygon or multipolygon into Cesium hierarchies. */
function hierarchies(geometry) {
  const polygons =
    geometry?.type === 'MultiPolygon'
      ? geometry.coordinates
      : geometry?.type === 'Polygon'
        ? [geometry.coordinates]
        : [];
  return polygons.map((rings) => {
    const [outer, ...holes] = rings;
    return new Cesium.PolygonHierarchy(
      Cesium.Cartesian3.fromDegreesArray(outer.flat()),
      holes.map(
        (hole) =>
          new Cesium.PolygonHierarchy(
            Cesium.Cartesian3.fromDegreesArray(hole.flat()),
          ),
      ),
    );
  });
}

/**
 * Create the case layer manager.
 *
 * @param {object} input
 * @param {object} input.viewer a Cesium viewer
 * @param {()=>void} [input.requestRender] for the render governor
 */
export function createNepalCaseLayers({ viewer, requestRender = () => {} }) {
  if (!viewer)
    throw new TypeError('The Nepal case layers need a Cesium viewer.');

  /** @type {Map<string, {points: object|null, entities: object[]}>} */
  const layers = new Map();

  function ensure(layerId) {
    let entry = layers.get(layerId);
    if (!entry) {
      entry = { points: null, entities: [] };
      layers.set(layerId, entry);
    }
    return entry;
  }

  function clear(layerId) {
    const entry = layers.get(layerId);
    if (!entry) return;
    if (entry.points) {
      viewer.scene.primitives.remove(entry.points);
      entry.points = null;
    }
    for (const entity of entry.entities) viewer.entities.remove(entity);
    entry.entities = [];
  }

  function drawPoints(layerId, items) {
    const entry = ensure(layerId);
    const collection = viewer.scene.primitives.add(
      new Cesium.PointPrimitiveCollection(),
    );
    entry.points = collection;
    for (const item of items) {
      collection.add({
        id: `${layerId}:${item.id}`,
        position: Cesium.Cartesian3.fromDegrees(item.lon, item.lat),
        pixelSize: item.radius * (item.emphasis ? 1.15 : 1),
        color: colour(item.colour, item.fillAlpha),
        /*
         * The outline is the grammar: an observed point is rimmed, a modelled
         * one is not. `outlineWidth` comes straight from the model.
         */
        outlineColor: colour('#04070a', 0.9),
        outlineWidth: item.outlineWidth,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
    }
  }

  function drawPolygons(layerId, items) {
    const entry = ensure(layerId);
    for (const item of items) {
      for (const hierarchy of hierarchies(item.geometry)) {
        entry.entities.push(
          viewer.entities.add({
            polygon: {
              hierarchy,
              material: colour(
                item.colour,
                item.fillOverride ?? (item.dimmed ? 0.08 : item.fillAlpha),
              ),
              outline: item.outlineWidth > 0,
              outlineColor: colour(item.colour, 0.85),
              /* A modelled field is clamped to the ground; it has no edge to lift. */
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          }),
        );
      }
    }
  }

  function drawPolylines(layerId, items) {
    const entry = ensure(layerId);
    for (const item of items) {
      entry.entities.push(
        viewer.entities.add({
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(
              item.positions.flat(),
            ),
            width: item.width ?? 3,
            material: colour(item.colour, item.fillAlpha),
            clampToGround: true,
          },
        }),
      );
    }
  }

  function drawMarkers(layerId, items) {
    const entry = ensure(layerId);
    for (const item of items) {
      entry.entities.push(
        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(item.lon, item.lat),
          point: {
            pixelSize: item.radius,
            color: colour(item.colour, item.fillAlpha),
            outlineColor: colour('#04070a', 1),
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }),
      );
    }
  }

  return Object.freeze({
    /**
     * Draw one frame's worth of layers.
     *
     * Layers present in the map are redrawn; layers absent from it are cleared.
     * Redrawing a layer wholesale rather than diffing its contents is the right
     * trade here: the collections are rebuilt in one pass, and a per-item diff
     * would cost more bookkeeping than it saves on sets this size.
     */
    render(grouped) {
      const wanted = new Set(grouped.keys());
      for (const layerId of [...layers.keys()]) {
        if (!wanted.has(layerId)) clear(layerId);
      }
      for (const [layerId, items] of grouped) {
        clear(layerId);
        if (items.length === 0) continue;
        const byKind = new Map();
        for (const item of items) {
          if (!byKind.has(item.kind)) byKind.set(item.kind, []);
          byKind.get(item.kind).push(item);
        }
        for (const [kind, batch] of byKind) {
          if (kind === 'point' || kind === 'square') drawPoints(layerId, batch);
          else if (kind === 'polygon') drawPolygons(layerId, batch);
          else if (kind === 'polyline') drawPolylines(layerId, batch);
          else if (kind === 'marker') drawMarkers(layerId, batch);
        }
      }
      requestRender();
    },

    /**
     * Fly the camera.
     *
     * `prefers-reduced-motion` collapses the flight rather than removing it:
     * the destination is the same, only the journey is cut, so nothing becomes
     * unreachable for someone who asked for less movement.
     */
    flyTo({ lon, lat, altKm, pitch, durationSec }) {
      const reduced =
        globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ??
        false;
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          lon,
          lat,
          Math.max(1, altKm) * 1000,
        ),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(pitch ?? -90),
          roll: 0,
        },
        duration: reduced ? 0.4 : (durationSec ?? 2),
      });
      requestRender();
    },

    destroy() {
      for (const layerId of [...layers.keys()]) clear(layerId);
      layers.clear();
    },
  });
}
