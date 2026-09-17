import * as Cesium from 'cesium';
import {
  GEOMETRY_KIND,
  INTENSITY_SCALES,
  classifyIntensity,
} from '../../disaster/hazards.js';

/**
 * The hazard geometry layer.
 *
 * Draws whatever the current investigation pushes into it, switching on the
 * GEOMETRY KIND rather than on the disaster type. That is what makes §21's
 * extensibility real at the rendering level: adding a hazard type to the
 * registry adds a drawable layer here without a line changing, because a new
 * type reuses the eight kinds this renderer already knows.
 *
 * §3's harder rule — "Do NOT use the same visualisation for every disaster" —
 * falls out of that. An earthquake pushes CONTOUR_BANDS and SOURCE_GEOMETRY and
 * gets nested intensity rings over a rupture plane. A cyclone pushes PATH and
 * DEPTH_SURFACE and gets a track with a surge surface. Neither can accidentally
 * look like the other, because neither declares the other's kinds.
 *
 * COLOUR IS NOT NEGOTIABLE HERE, and this is the one place the green identity
 * gives way. Intensity bands use each agency's own published ramp — USGS
 * ShakeMap's white-through-red for MMI, Saffir-Simpson's, the flood-depth
 * blues. A reader who has seen a ShakeMap before recognises it instantly, and
 * recolouring shaking intensity to match the interface would make the map
 * prettier and less useful. The green is the chrome; the hazard is the data.
 *
 * TIME-VARYING KINDS carry a `phaseOffsetHours` on each part, so stepping the
 * timeline shows only the parts that had happened — the §4 mechanism, applied
 * to geometry rather than to numbers.
 */

/** Line width per kind, in pixels. Intensity bands thin as they weaken. */
const CONTOUR_WIDTH_BASE = 1.4;
const PATH_WIDTH = 3.2;
const PERIMETER_WIDTH = 2.4;
const SOURCE_OUTLINE_WIDTH = 1.6;

/** Great-circle segments for a propagation ring. */
const RING_SEGMENTS = 96;

/**
 * Create the layer.
 *
 * @param {object} [deps]
 * @param {(reason:string)=>void} [deps.governorRequestRender]
 * @param {(record:object)=>void} [deps.onSelect]
 * @returns {object} layer
 */
export function createHazardLayer({
  governorRequestRender = () => {},
  onSelect = null,
} = {}) {
  let _viewer = null;
  let _dataSource = null;
  let _handler = null;
  let _enabled = false;
  let _lastUpdate = null;
  let _error = null;

  /** The pushed geometry, by layer id. */
  const _geometries = new Map();
  /** Which ids are currently shown. */
  const _visible = new Set();
  /** Timeline position, in hours from onset. */
  let _phaseOffsetHours = Infinity;
  /** Entity id -> the record a click should report. */
  const _records = new Map();

  function clear() {
    _dataSource?.entities.removeAll();
    _records.clear();
  }

  /** Does this part exist yet, at the current timeline position? */
  function withinPhase(part) {
    const at = part?.phaseOffsetHours;
    if (!Number.isFinite(at)) return true;
    return at <= _phaseOffsetHours;
  }

  function colourFor(scaleId, value, fallback) {
    const band = classifyIntensity(scaleId, value);
    return Cesium.Color.fromCssColorString(band?.colour ?? fallback);
  }

  /* ---------------- the eight kinds ---------------- */

  /**
   * Nested bands from an intensity field.
   *
   * Drawn weakest-first so the strong inner bands paint over the weak outer
   * ones, and thickened with intensity so the severe rings read first at a
   * glance. Every band is a separate entity, so a click can report which
   * intensity the reader hit.
   */
  function drawContourBands(geo) {
    const scale = INTENSITY_SCALES[geo.scale] ?? null;
    const bands = [...(geo.bands ?? [])].sort(
      (a, b) => (a.value ?? 0) - (b.value ?? 0),
    );
    for (const band of bands) {
      if (!withinPhase(band)) continue;
      const colour = colourFor(geo.scale, band.value, '#22d97f');
      const weight =
        scale && Number.isFinite(band.value)
          ? CONTOUR_WIDTH_BASE + (band.value / scale.bands.length) * 2.4
          : CONTOUR_WIDTH_BASE;
      for (const [index, line] of (band.lines ?? []).entries()) {
        if (!Array.isArray(line) || line.length < 2) continue;
        const id = `${geo.id}:band:${band.value}:${index}`;
        _dataSource.entities.add(
          new Cesium.Entity({
            id,
            polyline: {
              positions: line.map(([lon, lat]) =>
                Cesium.Cartesian3.fromDegrees(lon, lat),
              ),
              width: weight,
              clampToGround: true,
              material: new Cesium.ColorMaterialProperty(
                colour.withAlpha(0.92),
              ),
            },
          }),
        );
        _records.set(id, {
          kind: 'hazard-intensity',
          layerId: geo.id,
          layerName: geo.name,
          value: band.value,
          scale: geo.scale,
          band: classifyIntensity(geo.scale, band.value),
          answers: geo.answers,
        });
      }
    }
  }

  /**
   * A closed boundary that grows over time.
   *
   * Each snapshot is its own entity with its own hour, so stepping the
   * timeline genuinely shows the fire or the flood at its extent THEN rather
   * than fading one shape.
   */
  function drawPerimeter(geo) {
    for (const [index, part] of (geo.parts ?? []).entries()) {
      if (!withinPhase(part)) continue;
      const ring = part.ring ?? part;
      if (!Array.isArray(ring) || ring.length < 3) continue;
      const colour = Cesium.Color.fromCssColorString(
        part.colour ?? geo.colour ?? '#ff6b1a',
      );
      const id = `${geo.id}:perimeter:${index}`;
      _dataSource.entities.add(
        new Cesium.Entity({
          id,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(
              ring.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat)),
            ),
            material: colour.withAlpha(0.22),
            outline: true,
            outlineColor: colour,
            outlineWidth: PERIMETER_WIDTH,
            classificationType: Cesium.ClassificationType.TERRAIN,
          },
        }),
      );
      _records.set(id, {
        kind: 'hazard-extent',
        layerId: geo.id,
        layerName: geo.name,
        atHours: part.phaseOffsetHours ?? null,
        label: part.label ?? null,
        answers: geo.answers,
      });
    }
  }

  /**
   * A line the hazard travelled.
   *
   * Points carry their own intensity where the source has it — a storm track
   * changes category along its length, and drawing it one colour would hide
   * the landfall intensity, which is the part that matters.
   */
  function drawPath(geo) {
    const points = (geo.points ?? []).filter(withinPhase);
    if (points.length < 2) return;
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const colour = colourFor(geo.scale, a.value, geo.colour ?? '#00ff9c');
      const id = `${geo.id}:path:${i}`;
      _dataSource.entities.add(
        new Cesium.Entity({
          id,
          polyline: {
            positions: [
              Cesium.Cartesian3.fromDegrees(a.lon, a.lat),
              Cesium.Cartesian3.fromDegrees(b.lon, b.lat),
            ],
            width: PATH_WIDTH,
            clampToGround: true,
            material: new Cesium.ColorMaterialProperty(colour.withAlpha(0.95)),
          },
        }),
      );
      _records.set(id, {
        kind: 'hazard-path',
        layerId: geo.id,
        layerName: geo.name,
        value: a.value ?? null,
        scale: geo.scale,
        atHours: a.phaseOffsetHours ?? null,
        label: a.label ?? null,
        answers: geo.answers,
      });
    }
  }

  /**
   * Discrete located events.
   *
   * Sized by magnitude where there is one. This is the aftershock layer, and
   * it is the clearest case of §4 working on measured data: each point carries
   * its own hour, so the field genuinely accumulates as the handle moves.
   */
  function drawPointField(geo) {
    for (const [index, point] of (geo.points ?? []).entries()) {
      if (!withinPhase(point)) continue;
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;
      const colour = geo.scale
        ? colourFor(geo.scale, point.value, geo.colour ?? '#00ff9c')
        : Cesium.Color.fromCssColorString(geo.colour ?? '#00ff9c');
      const size = Number.isFinite(point.value)
        ? Math.max(5, Math.min(22, point.value * 2.4))
        : 7;
      const id = `${geo.id}:point:${index}`;
      _dataSource.entities.add(
        new Cesium.Entity({
          id,
          position: Cesium.Cartesian3.fromDegrees(point.lon, point.lat),
          point: {
            pixelSize: size,
            color: colour.withAlpha(0.85),
            outlineColor: Cesium.Color.BLACK.withAlpha(0.6),
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }),
      );
      _records.set(id, {
        kind: 'hazard-event',
        layerId: geo.id,
        layerName: geo.name,
        value: point.value ?? null,
        label: point.label ?? null,
        atHours: point.phaseOffsetHours ?? null,
        time: point.time ?? null,
        answers: geo.answers,
      });
    }
  }

  /**
   * A surface with a third value at each point.
   *
   * Extruded to its own value so depth is legible in 3D — this is §11's case
   * for terrain: flood depth drawn flat is a colour, and drawn as a height is
   * the reason the ground floors went.
   */
  function drawDepthSurface(geo) {
    for (const [index, cell] of (geo.cells ?? []).entries()) {
      if (!withinPhase(cell)) continue;
      const ring = cell.ring;
      if (!Array.isArray(ring) || ring.length < 3) continue;
      const colour = colourFor(geo.scale, cell.value, '#2d9bd6');
      const id = `${geo.id}:cell:${index}`;
      _dataSource.entities.add(
        new Cesium.Entity({
          id,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(
              ring.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat)),
            ),
            material: colour.withAlpha(0.55),
            extrudedHeight: Number.isFinite(cell.value)
              ? Math.max(1, cell.value) * (geo.verticalExaggeration ?? 8)
              : 1,
            perPositionHeight: false,
            outline: false,
          },
        }),
      );
      _records.set(id, {
        kind: 'hazard-depth',
        layerId: geo.id,
        layerName: geo.name,
        value: cell.value ?? null,
        scale: geo.scale,
        answers: geo.answers,
      });
    }
  }

  /** The rupture, vent or slide body itself. */
  function drawSourceGeometry(geo) {
    for (const [index, part] of (geo.parts ?? []).entries()) {
      const ring = part.ring ?? part;
      if (!Array.isArray(ring) || ring.length < 3) continue;
      /*
       * Slip magnitude modulates opacity rather than hue: the rupture sits
       * under the intensity bands, and a second colour ramp there would fight
       * the one that carries the reader's attention.
       */
      const alpha = Number.isFinite(part.slipM)
        ? Math.max(0.08, Math.min(0.75, part.slipM))
        : 0.3;
      const id = `${geo.id}:source:${index}`;
      _dataSource.entities.add(
        new Cesium.Entity({
          id,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(
              ring.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat)),
            ),
            material:
              Cesium.Color.fromCssColorString('#ff4d4d').withAlpha(alpha),
            outline: true,
            outlineColor:
              Cesium.Color.fromCssColorString('#ff9100').withAlpha(0.7),
            outlineWidth: SOURCE_OUTLINE_WIDTH,
            classificationType: Cesium.ClassificationType.TERRAIN,
          },
        }),
      );
      _records.set(id, {
        kind: 'hazard-source',
        layerId: geo.id,
        layerName: geo.name,
        slipM: part.slipM ?? null,
        answers: geo.answers,
      });
    }
  }

  /**
   * Expanding rings from a source — tsunami travel time.
   *
   * Each ring is an hour of travel, which is the only thing a coastal reader
   * actually wants: not where the wave is, but how long they had.
   */
  function drawPropagation(geo) {
    const origin = geo.origin;
    if (!origin || !Number.isFinite(origin.lat)) return;
    for (const ring of geo.rings ?? []) {
      if (!withinPhase(ring)) continue;
      const id = `${geo.id}:ring:${ring.hours}`;
      _dataSource.entities.add(
        new Cesium.Entity({
          id,
          position: Cesium.Cartesian3.fromDegrees(origin.lon, origin.lat),
          ellipse: {
            semiMajorAxis: ring.radiusKm * 1000,
            semiMinorAxis: ring.radiusKm * 1000,
            material: Cesium.Color.TRANSPARENT,
            outline: true,
            outlineColor:
              Cesium.Color.fromCssColorString('#4dd8ff').withAlpha(0.8),
            outlineWidth: 2,
            granularity: Cesium.Math.toRadians(360 / RING_SEGMENTS),
          },
          label: {
            text: `${ring.hours} h`,
            font: '600 11px "JetBrains Mono", monospace',
            fillColor: Cesium.Color.fromCssColorString('#4dd8ff'),
            outlineColor: Cesium.Color.BLACK.withAlpha(0.85),
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }),
      );
      _records.set(id, {
        kind: 'hazard-propagation',
        layerId: geo.id,
        layerName: geo.name,
        hours: ring.hours,
        answers: geo.answers,
      });
    }
  }

  /**
   * A zone classified rather than measured.
   *
   * Susceptibility is the §11 answer — landslide hazard, slope, fuel — and it
   * is drawn under everything else at low opacity, because it explains the
   * damage rather than being the damage.
   */
  function drawSusceptibility(geo) {
    for (const [index, zone] of (geo.zones ?? []).entries()) {
      const ring = zone.ring;
      if (!Array.isArray(ring) || ring.length < 3) continue;
      const colour = colourFor(geo.scale, zone.value, '#ffb020');
      const id = `${geo.id}:zone:${index}`;
      _dataSource.entities.add(
        new Cesium.Entity({
          id,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(
              ring.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat)),
            ),
            material: colour.withAlpha(0.2),
            outline: true,
            outlineColor: colour.withAlpha(0.55),
            outlineWidth: 1,
            classificationType: Cesium.ClassificationType.TERRAIN,
          },
        }),
      );
      _records.set(id, {
        kind: 'hazard-susceptibility',
        layerId: geo.id,
        layerName: geo.name,
        value: zone.value ?? null,
        scale: geo.scale,
        label: zone.label ?? null,
        answers: geo.answers,
      });
    }
  }

  /** Kind -> renderer. The whole extensibility contract, in one table. */
  const RENDERERS = Object.freeze({
    [GEOMETRY_KIND.CONTOUR_BANDS]: drawContourBands,
    [GEOMETRY_KIND.PERIMETER]: drawPerimeter,
    [GEOMETRY_KIND.PATH]: drawPath,
    [GEOMETRY_KIND.POINT_FIELD]: drawPointField,
    [GEOMETRY_KIND.DEPTH_SURFACE]: drawDepthSurface,
    [GEOMETRY_KIND.SOURCE_GEOMETRY]: drawSourceGeometry,
    [GEOMETRY_KIND.PROPAGATION]: drawPropagation,
    [GEOMETRY_KIND.SUSCEPTIBILITY]: drawSusceptibility,
  });

  /**
   * Repaint everything visible.
   *
   * Susceptibility first so it sits under the rest, then source geometry, then
   * the measured field, then discrete events on top. Painting order is the
   * reading order.
   */
  function render() {
    if (!_dataSource) return;
    clear();
    const order = [
      GEOMETRY_KIND.SUSCEPTIBILITY,
      GEOMETRY_KIND.DEPTH_SURFACE,
      GEOMETRY_KIND.SOURCE_GEOMETRY,
      GEOMETRY_KIND.PERIMETER,
      GEOMETRY_KIND.CONTOUR_BANDS,
      GEOMETRY_KIND.PROPAGATION,
      GEOMETRY_KIND.PATH,
      GEOMETRY_KIND.POINT_FIELD,
    ];
    for (const kind of order) {
      for (const geo of _geometries.values()) {
        if (geo.kind !== kind) continue;
        if (!_visible.has(geo.id)) continue;
        const draw = RENDERERS[geo.kind];
        if (!draw) continue;
        try {
          draw(geo);
        } catch (error) {
          /*
           * One malformed geometry must not blank the whole hazard picture.
           * The layer reports the failure and keeps drawing the rest.
           */
          _error = `${geo.id}: ${error?.message ?? error}`;
        }
      }
    }
    _lastUpdate = Date.now();
    governorRequestRender('hazard:render');
  }

  function attachPicking(viewer) {
    if (!onSelect || _handler) return;
    _handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    _handler.setInputAction((movement) => {
      if (!_enabled) return;
      const picked = viewer.scene.pick(movement.position);
      const entityId = picked?.id?.id;
      const record = entityId ? _records.get(entityId) : null;
      if (record) onSelect(toContextRecord(record));
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  /**
   * One record in the shape the selection bus expects.
   *
   * `properties` stays flat text: the voice payload drops nested objects, so a
   * nested band here would silently vanish from a spoken answer.
   */
  function toContextRecord(record) {
    const properties = {
      layer: record.layerName,
      answers: record.answers ?? '',
    };
    if (record.band) {
      properties.intensity = `${record.band.label} — ${record.band.name}`;
      properties.scale = record.band.scaleName;
    } else if (record.value != null) {
      properties.value = String(record.value);
    }
    if (record.atHours != null) {
      properties.atPhase = `${record.atHours >= 0 ? 'T+' : 'T'}${record.atHours}h`;
    }
    if (record.time) properties.observedAt = record.time;
    if (record.hours != null) properties.travelTime = `${record.hours} hours`;
    if (record.slipM != null) properties.slip = `${record.slipM.toFixed(2)} m`;
    return {
      id: `${record.layerId}:${record.value ?? record.label ?? 'part'}`,
      layerId: 'hazard-geometry',
      layerName: record.layerName,
      source: 'Hazard geometry',
      label: record.label ?? `${record.layerName}`,
      latitude: null,
      longitude: null,
      properties,
    };
  }

  const layer = {
    id: 'hazard-geometry',
    name: 'Hazard',
    icon: '◈',
    source: 'Per-hazard adapters',
    updateInterval: 0,

    init(viewer) {
      if (_viewer) throw new Error('Hazard layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource('hazard-geometry');
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      attachPicking(viewer);
      // Geometry pushed before the lazy init still belongs on screen.
      if (_geometries.size > 0) render();
    },

    enable() {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      if (_geometries.size > 0 && _lastUpdate === null) render();
      governorRequestRender('hazard:enable');
    },

    disable() {
      _enabled = false;
      if (_dataSource) _dataSource.show = false;
      governorRequestRender('hazard:disable');
    },

    /** Nothing to poll: this layer renders what the investigation pushes. */
    async update() {
      return true;
    },

    /**
     * Push one geometry declaration.
     *
     * @param {object} geo `{ id, name, kind, scale?, answers?, ...parts }`
     * @returns {boolean} false for a kind this renderer does not know
     */
    setGeometry(geo) {
      if (!geo?.id || !RENDERERS[geo.kind]) return false;
      _geometries.set(geo.id, geo);
      _visible.add(geo.id);
      render();
      return true;
    },

    /** Show or hide one pushed geometry without discarding it. */
    setVisible(geometryId, visible) {
      if (!_geometries.has(geometryId)) return false;
      if (visible) _visible.add(geometryId);
      else _visible.delete(geometryId);
      render();
      return true;
    },

    /**
     * Move the timeline.
     *
     * Every time-varying part re-tests itself against this, which is how
     * stepping the handle changes the geometry rather than only the numbers.
     */
    setPhaseOffsetHours(hours) {
      _phaseOffsetHours = Number.isFinite(hours) ? hours : Infinity;
      render();
      return true;
    },

    clearGeometry() {
      _geometries.clear();
      _visible.clear();
      _error = null;
      render();
      return true;
    },

    getStats() {
      return {
        count: _records.size,
        geometries: _geometries.size,
        visible: _visible.size,
        phaseOffsetHours: _phaseOffsetHours,
        enabled: _enabled,
        lastUpdate: _lastUpdate,
        error: _error,
        source: 'Per-hazard adapters',
      };
    },

    getAnalystRecords(maxCount = 60) {
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 60;
      return [..._records.values()].slice(0, limit).map((record, index) => ({
        index,
        kind: record.kind,
        layer: record.layerName,
        value: record.value ?? null,
        intensityBand: record.band?.label ?? null,
        atHours: record.atHours ?? null,
        observedAt: record.time ?? null,
        // Declared: this layer draws geometry, not consequences.
        casualties: null,
        damageAssessment: null,
      }));
    },

    destroy(viewer = _viewer) {
      if (_handler) {
        _handler.destroy();
        _handler = null;
      }
      if (_dataSource && viewer && !viewer.isDestroyed?.()) {
        viewer.dataSources.remove(_dataSource, true);
      }
      _dataSource = null;
      _viewer = null;
      _enabled = false;
      _geometries.clear();
      _visible.clear();
      _records.clear();
      _error = null;
      _lastUpdate = null;
      _phaseOffsetHours = Infinity;
    },
  };
  return layer;
}
