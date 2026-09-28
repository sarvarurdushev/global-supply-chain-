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

import { cameraRangeMetres } from '../../nepal/story/mapModel.js';

const COLOUR_CACHE = new Map();

/** One owner id for the governor, so holds cannot leak per scene change. */
const HOLD_ID = 'nepal-case-layers';

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
export function createNepalCaseLayers({
  viewer,
  requestRender = () => {},
  holdRender = () => {},
  releaseRender = () => {},
  settleCapMs = 20_000,
}) {
  if (!viewer)
    throw new TypeError('The Nepal case layers need a Cesium viewer.');

  /**
   * Keep rendering until a scene's geometry has actually been built.
   *
   * WHY. The application runs in `requestRenderMode` — it draws a frame only
   * when something asks for one, which is what keeps an idle globe off the
   * GPU. Ground-clamped geometry is built ASYNCHRONOUSLY, so the one frame
   * requested after `render()` is drawn before any of it exists. Nothing then
   * asks for another, and the map stays empty PERMANENTLY. Scene 12 put 333
   * entities into a blank screen with the camera in exactly the right place,
   * no error, no warning, and the panel beside it reading perfectly. Given
   * sixteen seconds and a manual `requestRender()` it drew correctly, which
   * is how the cause was found.
   *
   * A FIXED TIMER WAS THE FIRST FIX AND IT WAS WRONG. Three seconds is plenty
   * on a GPU and nowhere near enough under software rendering, so the window
   * has to be a CONDITION. `dataSourceDisplay.ready` is false exactly while
   * an entity visualiser is still creating geometry, which is the thing being
   * waited for. The cap only exists so a stuck visualiser cannot pin the
   * globe into continuous rendering for the rest of the session.
   */
  let settleStop = null;
  let resolveSettled = null;
  let settled = Promise.resolve();
  /** The current camera flight; see `whenLanded`. */
  let landing = Promise.resolve();

  /**
   * End the current watch, releasing anybody waiting on it.
   *
   * RESOLVING ON SUPERSEDE IS NOT OPTIONAL. The first version removed the old
   * listener and dropped its promise on the floor, and since the loader
   * schedules a render on every progress event, the promise a caller was
   * already awaiting was routinely the abandoned one. `whenSceneReady()` then
   * never resolved and the whole experience hung — a deadlock built out of
   * two correct-looking halves.
   */
  function finishSettle() {
    settleStop?.();
    releaseRender(HOLD_ID);
    const release = resolveSettled;
    resolveSettled = null;
    release?.();
  }

  function holdWhileSettling() {
    finishSettle();
    holdRender(HOLD_ID);
    const deadline = Date.now() + settleCapMs;
    settled = new Promise((resolve) => {
      resolveSettled = resolve;
    });
    /*
     * READY HAS TO HOLD FOR SEVERAL FRAMES IN A ROW. On the first frame after
     * `render()` the visualisers have not started yet, so `ready` is still
     * true from the previous scene and a single-frame check declared the map
     * settled while the camera was five thousand kilometres up and nothing
     * had been built. Three consecutive ready frames, and a two-frame floor
     * so the check cannot pass before any work has begun.
     */
    let frames = 0;
    let readyRun = 0;
    const remove = viewer.scene.postRender.addEventListener(() => {
      frames += 1;
      readyRun = viewer.dataSourceDisplay?.ready === false ? 0 : readyRun + 1;
      const done = frames > 2 && readyRun >= 3;
      if (!done && Date.now() < deadline) return;
      finishSettle();
      requestRender();
    });
    settleStop = () => {
      remove();
      settleStop = null;
    };
  }

  /** @type {Map<string, {points: object|null, entities: object[]}>} */
  const layers = new Map();

  function ensure(layerId) {
    let entry = layers.get(layerId);
    if (!entry) {
      entry = { points: null, lines: null, entities: [], imagery: null };
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
    if (entry.lines) {
      viewer.scene.primitives.remove(entry.lines);
      entry.lines = null;
    }
    if (entry.imagery) {
      viewer.imageryLayers.remove(entry.imagery, true);
      entry.imagery = null;
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

  /**
   * A filled area, plus its edge as a separate ground polyline.
   *
   * THE EDGE HAS TO BE ITS OWN GEOMETRY. Cesium silently ignores `outline` on
   * a polygon with `CLAMP_TO_GROUND` — it is documented, it logs nothing at
   * run time, and the result was 75 district polygons with no borders at all.
   * That is survivable on a choropleth and fatal on Scene 12, where the
   * boundary between "surveyed" and "not surveyed" IS the finding. So an edge
   * is drawn as a clamped polyline whenever the grammar asks for one.
   */
  function drawPolygons(layerId, items) {
    const entry = ensure(layerId);
    for (const item of items) {
      const fill = item.fillOverride ?? (item.dimmed ? 0.08 : item.fillAlpha);
      for (const hierarchy of hierarchies(item.geometry)) {
        entry.entities.push(
          viewer.entities.add({
            polygon: {
              hierarchy,
              material: colour(item.colour, fill),
              /* See above: this is honoured only when NOT clamped. */
              outline: false,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          }),
        );
        if (!(item.outlineWidth > 0)) continue;
        for (const ring of [hierarchy, ...(hierarchy.holes ?? [])]) {
          if (!ring.positions?.length) continue;
          entry.entities.push(
            viewer.entities.add({
              polyline: {
                /* Closed: Cesium does not close a polyline for you. */
                positions: [...ring.positions, ring.positions[0]],
                width: item.outlineWidth,
                clampToGround: true,
                material: colour(item.colour, item.dimmed ? 0.35 : 0.9),
              },
            }),
          );
        }
      }
    }
  }

  /**
   * Many lines as ONE primitive.
   *
   * Scene 13 draws 2,727 road edges. As entities that is 2,727 visualisers
   * each building its own geometry, which is both a long stall and a large
   * amount of scene-graph bookkeeping for something the user reads as a
   * single texture. A PolylineCollection holds them all and costs one
   * primitive. This is the "simplify rendering, never the statistics" rule:
   * every edge is still drawn, and the panel's counts come from the artefact
   * regardless.
   *
   * Not ground-clamped. Clamping 2,727 polylines means 2,727 shadow volumes,
   * and at the altitudes these scenes use the terrain offset is invisible.
   */
  function drawLines(layerId, items) {
    const entry = ensure(layerId);
    const collection = viewer.scene.primitives.add(
      new Cesium.PolylineCollection(),
    );
    entry.lines = collection;
    for (const item of items) {
      collection.add({
        id: `${layerId}:${item.id}`,
        positions: Cesium.Cartesian3.fromDegreesArray(item.positions.flat()),
        width: item.width ?? 1,
        material: Cesium.Material.fromType('Color', {
          color: colour(item.colour, item.fillOverride ?? item.fillAlpha),
        }),
      });
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
            material: colour(item.colour, item.fillOverride ?? item.fillAlpha),
            clampToGround: true,
          },
        }),
      );
    }
  }

  /**
   * A ground-clamped raster: the population field, as one imagery layer.
   *
   * WHY IMAGERY AND NOT A TEXTURED RECTANGLE. An imagery layer is reprojected
   * and mip-mapped by the globe, so 978x492 cells stay legible from orbit and
   * from a district, and it costs one layer rather than a primitive per cell.
   * 177,679 primitives is not a scene; it is a stall.
   *
   * The canvas is built here rather than in the model because a canvas is a
   * browser object. `rasteriseDensity` hands over the bytes and the bounds,
   * which is everything a test can check.
   */
  function drawRaster(layerId, items) {
    const entry = ensure(layerId);
    const item = items[0];
    const raster = item?.raster;
    if (!raster) return;
    const canvas = document.createElement('canvas');
    canvas.width = raster.width;
    canvas.height = raster.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    const image = context.createImageData(raster.width, raster.height);
    image.data.set(raster.pixels);
    context.putImageData(image, 0, 0);

    entry.imagery = viewer.imageryLayers.addImageryProvider(
      new Cesium.SingleTileImageryProvider({
        url: canvas.toDataURL('image/png'),
        rectangle: Cesium.Rectangle.fromDegrees(
          raster.bounds.west,
          raster.bounds.south,
          raster.bounds.east,
          raster.bounds.north,
        ),
        tileWidth: raster.width,
        tileHeight: raster.height,
      }),
    );
    entry.imagery.alpha = item.dimmed ? 0.35 : 1;
  }

  /**
   * A circle on the ground, in METRES rather than pixels.
   *
   * Scene 15's proximity rings are a ruler laid on the map, so they have to
   * scale with the map. A pixel radius would mean the 10 km ring covered ten
   * kilometres at one altitude and a hundred at another, which is worse than
   * not drawing it.
   */
  /**
   * A ring: its edge as a ground polyline, its label at its northern point.
   *
   * THE SAME CLAMPED-OUTLINE TRAP AS THE POLYGONS. These were ellipses with
   * `outline: true`, clamped to ground, with a fill of 0 — so Cesium drew
   * nothing at all, and Scene 15 showed five captions stacked on one spot
   * over no rings. The edge is now its own clamped polyline, and the one
   * caption sits on the east edge of the ring it names.
   */
  function drawCircles(layerId, items) {
    const entry = ensure(layerId);
    for (const item of items) {
      const ring = circleDegrees(item.lon, item.lat, item.radiusMetres);
      entry.entities.push(
        viewer.entities.add({
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(ring.flat()),
            width: item.dimmed ? 1 : 2,
            clampToGround: true,
            material: colour(item.colour, item.dimmed ? 0.35 : 0.95),
          },
        }),
      );
      if (!item.label || item.showLabel === false) continue;
      /* The east point: clear of the cluster the rings are centred in. */
      const east = ring[Math.round(ring.length / 4)];
      entry.entities.push(
        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(east[0], east[1]),
          label: {
            text: item.caption ?? item.label,
            font: '11px ui-monospace, SFMono-Regular, Menlo, monospace',
            fillColor: colour(item.colour, 0.95),
            outlineColor: colour('#04070a', 0.9),
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(6, 0),
            horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }),
      );
    }
  }

  /** A closed ring of [lon, lat] around a centre, starting due north. */
  function circleDegrees(lon, lat, radiusMetres, segments = 72) {
    const R = 6371008.8;
    const dLat = (radiusMetres / R) * (180 / Math.PI);
    const dLon = dLat / Math.max(0.01, Math.cos((lat * Math.PI) / 180));
    const ring = [];
    for (let k = 0; k <= segments; k += 1) {
      const t = (2 * Math.PI * k) / segments;
      ring.push([lon + dLon * Math.sin(t), lat + dLat * Math.cos(t)]);
    }
    return ring;
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
          else if (kind === 'raster') drawRaster(layerId, batch);
          else if (kind === 'circle') drawCircles(layerId, batch);
          else if (kind === 'lines') drawLines(layerId, batch);
        }
      }
      holdWhileSettling();
      requestRender();
    },

    /**
     * Resolves once the geometry of the last `render()` has been built.
     *
     * Presentation mode needs this and not only the data: advancing while the
     * visualisers are still working presents an empty map, which is the same
     * failure as the one above with a deadline attached.
     */
    whenSettled() {
      return settled;
    },

    /**
     * Fly the camera.
     *
     * `prefers-reduced-motion` collapses the flight rather than removing it:
     * the destination is the same, only the journey is cut, so nothing becomes
     * unreachable for someone who asked for less movement.
     */
    /**
     * Frame a scene's subject.
     *
     * `flyToBoundingSphere` with a HeadingPitchRange, not `flyTo` with a
     * destination: a scene's target is the thing to LOOK AT, and `flyTo`
     * would read it as where to PUT the camera. See `cameraRangeMetres` for
     * what that cost — an oblique scene that framed empty sky.
     *
     * The `lookAt` on completion is the house pattern (`src/locations.js`):
     * the flight lands close, and the lock guarantees the subject is centred
     * rather than nearly centred.
     */
    flyTo({ lon, lat, altKm, pitch, durationSec }) {
      const reduced =
        globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ??
        false;
      const target = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
      const range = cameraRangeMetres({ altKm, pitch });
      const hpr = new Cesium.HeadingPitchRange(
        0,
        Cesium.Math.toRadians(pitch ?? -90),
        range,
      );
      const duration = reduced ? 0.4 : (durationSec ?? 2);
      let land;
      landing = new Promise((resolve) => {
        land = resolve;
      });
      /*
       * A flight that never reports back must not hold a caller forever: a
       * destroyed camera flight calls neither callback.
       */
      const guard = setTimeout(land, (duration + 2) * 1000);
      const done = () => {
        clearTimeout(guard);
        land();
      };
      viewer.camera.flyToBoundingSphere(
        new Cesium.BoundingSphere(target, range * 0.25),
        {
          offset: hpr,
          duration,
          complete: () => {
            viewer.camera.lookAt(target, hpr);
            viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
            requestRender();
            done();
          },
          /* Superseded by a newer flight: that one's landing is awaited. */
          cancel: done,
        },
      );
      requestRender();
    },

    /**
     * Resolves when the camera has arrived — at the LATEST destination.
     *
     * WHY. Scene readiness used to mean "data fetched and geometry built",
     * and a probe of Scene 01 caught it resolving with the camera still at
     * 20,000 km: the 4.5-second flight had barely left. Every screenshot
     * taken "once the scene was ready" was of a camera in transit, which is
     * why the Stage 7 audit showed Nepal as a blue disc and Scene 08's
     * damage points hard against the left rail. A refocus can start a second
     * flight while the first is being awaited, so this re-checks until the
     * flight it waited on is still the current one.
     */
    async whenLanded() {
      let awaited;
      do {
        awaited = landing;
        await awaited;
      } while (awaited !== landing);
    },

    destroy() {
      finishSettle();
      for (const layerId of [...layers.keys()]) clear(layerId);
      layers.clear();
    },
  });
}
