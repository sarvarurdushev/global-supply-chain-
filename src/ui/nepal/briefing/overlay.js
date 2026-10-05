/**
 * The briefing's annotation engine: everything drawn ON the map.
 *
 * GEO-ANCHORED, NOT FLOATING. Every mark here — a border being drawn, a
 * callout's leader line, a bracket closing on a valley, a counter beside the
 * epicentre — is anchored to a longitude and latitude, and is re-projected
 * through the live Cesium camera on every frame. When the camera flies, the
 * callout stays on its place. Nothing is HTML positioned "roughly over" the
 * map once and left there.
 *
 * TWO SURFACES. A canvas for geometry (outlines, bands, points, rings,
 * leader lines, brackets), because thousands of projected vertices a frame
 * is what a canvas is for; a DOM layer for text (callouts, labels, counters,
 * captions), because text should be crisp, selectable and readable by
 * assistive technology. Both are redrawn from the same projection in the
 * same animation frame.
 *
 * ONE CLOCK. Every animation reads the briefing clock, not the wall clock:
 * pausing the briefing freezes a half-drawn border exactly where it is, and
 * 1.5× speed draws it 1.5× faster. See `src/nepal/briefing/clock.js`.
 *
 * Projection is done here rather than with Cesium's SceneTransforms per
 * point, because a band layer is thousands of vertices: the view-projection
 * matrix is read once per frame and applied by hand, and points on the far
 * side of the globe are culled with a horizon test.
 *
 * ON THE GROUND, IN STEP WITH THE GLOBE. Two things made marks drift while
 * the camera moved, and both are handled here (Stage 9.2):
 *
 *   HEIGHT. The globe drapes its imagery over a terrain mesh: Kathmandu's
 *   surface is about 1.26 km up, the epicentre's 2.24 km. A mark projected
 *   at sea level sits below that surface, so on a pitched camera it was
 *   drawn off its place by 10–30 px, by an amount that changed as the
 *   camera zoomed or tilted. Every geographic vertex now takes the terrain
 *   height under it, sampled from the terrain provider's tiles once and
 *   cached (`createHeightSampler`); until the heights arrive it is drawn at
 *   sea level as before.
 *
 *   FRAME. The overlay used to move the camera and draw in its own animation
 *   frame, after Cesium had already rendered that frame with the previous
 *   camera, so during a flight the marks led the globe by one frame. The
 *   flight now steps in the scene's preRender and the overlay draws in its
 *   postRender, with the camera the globe was just drawn with. A plain
 *   animation-frame loop still draws when Cesium is not rendering (QA
 *   recording drives the clock and the globe itself).
 */

import * as Cesium from 'cesium';
import { ease, progress } from '../../../nepal/briefing/clock.js';

const WGS84 = Cesium.Ellipsoid.WGS84;

/** Flat [lon, lat, lon, lat, …] to a Float64Array of ECEF x,y,z triples. */
export function toEcef(flatLonLat, height = 0) {
  const n = flatLonLat.length / 2;
  const out = new Float64Array(n * 3);
  const scratch = new Cesium.Cartesian3();
  for (let i = 0; i < n; i += 1) {
    Cesium.Cartesian3.fromDegrees(
      flatLonLat[i * 2],
      flatLonLat[i * 2 + 1],
      height,
      WGS84,
      scratch,
    );
    out[i * 3] = scratch.x;
    out[i * 3 + 1] = scratch.y;
    out[i * 3 + 2] = scratch.z;
  }
  return out;
}

/**
 * Terrain heights for geographic marks, sampled from the terrain provider's
 * tiles — not from what happens to be rendered — at one moderate level, and
 * cached per point. One request serves every layer that shares a place.
 *
 * Level 9 tiles are about 0.35° across: sampled there, a point's height is
 * within a couple of hundred metres in steep valleys, which is 2–3 px on the
 * closest briefing camera (~35 km), against 10–30 px at sea level.
 */
export function createHeightSampler({ viewer, level = 9, batchMs = 40 }) {
  const provider = viewer?.terrainProvider;
  const flat =
    !provider ||
    provider instanceof Cesium.EllipsoidTerrainProvider ||
    typeof Cesium.sampleTerrain !== 'function';
  const cache = new Map();
  /** Queued fills: [{ flat, target }], served in one batch. */
  let queue = [];
  let timer = null;
  const key = (lon, lat) => `${lon.toFixed(4)},${lat.toFixed(4)}`;
  const exaggeration = () => viewer.scene?.verticalExaggeration ?? 1;

  function write(flatLonLat, target) {
    const n = flatLonLat.length / 2;
    const scratch = new Cesium.Cartesian3();
    const k = exaggeration();
    for (let i = 0; i < n; i += 1) {
      const h = cache.get(key(flatLonLat[i * 2], flatLonLat[i * 2 + 1]));
      if (h === undefined) continue;
      Cesium.Cartesian3.fromDegrees(
        flatLonLat[i * 2],
        flatLonLat[i * 2 + 1],
        h * k,
        WGS84,
        scratch,
      );
      target[i * 3] = scratch.x;
      target[i * 3 + 1] = scratch.y;
      target[i * 3 + 2] = scratch.z;
    }
  }

  async function flush() {
    timer = null;
    const batch = queue;
    queue = [];
    const wanted = new Map();
    for (const { flat: f } of batch)
      for (let i = 0; i < f.length; i += 2) {
        const id = key(f[i], f[i + 1]);
        if (!cache.has(id) && !wanted.has(id))
          wanted.set(id, Cesium.Cartographic.fromDegrees(f[i], f[i + 1]));
      }
    if (wanted.size) {
      try {
        const ids = [...wanted.keys()];
        const sampled = await Cesium.sampleTerrain(provider, level, [
          ...wanted.values(),
        ]);
        sampled.forEach((carto, i) => {
          if (Number.isFinite(carto.height)) cache.set(ids[i], carto.height);
        });
      } catch {
        /* No tiles, no heights: the marks stay at sea level, as before. */
      }
    }
    for (const { flat: f, target } of batch) write(f, target);
  }

  return {
    get enabled() {
      return !flat;
    },
    /** Raise `target` (ECEF triples for `flatLonLat`) onto the terrain when its heights arrive. */
    fill(flatLonLat, target) {
      if (flat || flatLonLat.length === 0) return;
      queue.push({ flat: flatLonLat, target });
      if (!timer) timer = setTimeout(flush, batchMs);
    },
    /** For QA: the cached height at a place, or undefined. */
    heightAt: (lon, lat) => cache.get(key(lon, lat)),
  };
}

/**
 * The frame's projection: ECEF → CSS pixels, with a horizon cull.
 * Returns x, y and whether the point is on the visible hemisphere and in
 * front of the camera.
 */
function makeProjector(viewer, width, height) {
  const camera = viewer.scene.camera;
  const view = camera.viewMatrix;
  const proj = camera.frustum.projectionMatrix;
  const vp = Cesium.Matrix4.multiply(proj, view, new Cesium.Matrix4());
  const m = Cesium.Matrix4.toArray(vp);
  const cam = camera.positionWC;
  const cx = cam.x;
  const cy = cam.y;
  const cz = cam.z;
  const out = { x: 0, y: 0, visible: false };
  return function project(ecef, i) {
    const x = ecef[i * 3];
    const y = ecef[i * 3 + 1];
    const z = ecef[i * 3 + 2];
    /* Horizon: the surface normal at the point must face the camera. */
    const facing = x * (cx - x) + y * (cy - y) + z * (cz - z);
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= 0) {
      out.visible = false;
      return out;
    }
    const px = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    const py = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    out.x = (px * 0.5 + 0.5) * width;
    out.y = (1 - (py * 0.5 + 0.5)) * height;
    out.visible = facing > 0;
    return out;
  };
}

/** Cumulative screen length along a projected ring, for progressive drawing. */
function tracePath(ctx, project, ecef, fraction, { close = false } = {}) {
  const n = ecef.length / 3;
  const last = Math.max(1, Math.floor(n * fraction));
  let pen = false;
  for (let i = 0; i < last; i += 1) {
    const p = project(ecef, i);
    if (!p.visible) {
      pen = false;
      continue;
    }
    if (!pen) {
      ctx.moveTo(p.x, p.y);
      pen = true;
    } else ctx.lineTo(p.x, p.y);
  }
  if (close && fraction >= 1 && pen) ctx.closePath();
}

/** A geodesic circle as flat lon/lat, for band growth clips and rings. */
export function geoCircle(lon, lat, radiusM, segments = 96) {
  const out = [];
  const R = 6371008.8;
  const d = radiusM / R;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  for (let i = 0; i <= segments; i += 1) {
    const θ = (i / segments) * 2 * Math.PI;
    const φ2 = Math.asin(
      Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(θ),
    );
    const λ2 =
      λ1 +
      Math.atan2(
        Math.sin(θ) * Math.sin(d) * Math.cos(φ1),
        Math.cos(d) - Math.sin(φ1) * Math.sin(φ2),
      );
    out.push((λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI);
  }
  return out;
}

const MONTHS = Object.freeze([
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
]);

const hexToRgba = (hex, alpha) => {
  const h = hex.replace('#', '');
  const v =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = parseInt(v, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

/**
 * @param {object} input
 * @param {object} input.viewer Cesium viewer
 * @param {HTMLElement} input.container where the overlay mounts (over the globe)
 * @param {object} input.clock the briefing clock
 * @param {(id:string)=>void} [input.holdRender] keep Cesium rendering (a flight, a draw)
 * @param {(id:string)=>void} [input.releaseRender]
 */
export function createBriefingOverlay({
  viewer,
  container,
  clock,
  holdRender = () => {},
  releaseRender = () => {},
}) {
  const root = document.createElement('div');
  root.className = 'brf-overlay';
  const canvas = document.createElement('canvas');
  canvas.className = 'brf-canvas';
  const dom = document.createElement('div');
  dom.className = 'brf-dom';
  root.append(canvas, dom);
  container.append(root);
  const ctx = canvas.getContext('2d');

  /** @type {Map<string, object>} */
  const items = new Map();
  let frame = null;
  let width = 0;
  let height = 0;
  let destroyed = false;
  let lastReal = null;
  let onFrame = null;
  /** False when a recorder steps the clock itself, frame by frame. */
  let drivesClock = true;
  /** When the globe last rendered (real ms): the overlay then draws with it. */
  let lastSceneRender = -Infinity;
  const heights = createHeightSampler({ viewer });

  /**
   * A geographic position list as ECEF, on the terrain once its heights
   * arrive. The array is filled in place, so a layer built now is raised
   * without being rebuilt.
   */
  function ground(flatLonLat) {
    const ecef = toEcef(flatLonLat);
    heights.fill(flatLonLat, ecef);
    return ecef;
  }

  function resize() {
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    width = viewer.canvas.clientWidth || root.clientWidth;
    height = viewer.canvas.clientHeight || root.clientHeight;
    if (
      canvas.width !== Math.round(width * dpr) ||
      canvas.height !== Math.round(height * dpr)
    ) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Focus: how much of an item shows while another is the subject (1 = all of it). */
  function focusNow(item) {
    const f = item.focus;
    if (!f) return 1;
    return f.from + (f.to - f.from) * ease.inOut(progress(clock, f.at, f.ms));
  }

  /** Draw every item with the camera the globe has (or is about to be) drawn with. */
  function render() {
    resize();
    ctx.clearRect(0, 0, width, height);
    const project = makeProjector(viewer, width, height);
    const now = clock.now();
    const ordered = [...items.values()].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
    for (const item of ordered) {
      const fadeOut =
        item.removingAt !== undefined
          ? 1 - progress(clock, item.removingAt, item.fadeMs ?? 350)
          : 1;
      if (fadeOut <= 0) {
        item.dispose?.();
        items.delete(item.id);
        continue;
      }
      const shown = fadeOut * focusNow(item);
      ctx.save();
      ctx.globalAlpha = shown;
      item.draw?.(ctx, project, now, { width, height, fadeOut: shown });
      ctx.restore();
      item.place?.(project, now, { width, height, fadeOut: shown });
    }
  }

  /*
   * In step with the globe: the camera moves before the scene renders and
   * the overlay draws after it, inside the same frame.
   */
  const removePreUpdate = (
    viewer.scene?.preUpdate ?? viewer.scene?.preRender
  )?.addEventListener?.(() => {
    if (!destroyed) onFrame?.();
  });
  const removePostRender = viewer.scene?.postRender?.addEventListener?.(() => {
    if (destroyed) return;
    lastSceneRender = performance.now();
    render();
  });

  function draw(realNow) {
    if (destroyed) return;
    /*
     * Real time drives briefing time. The cap only guards against a huge jump
     * after a backgrounded tab; it is a full second so that a slow machine
     * drawing four frames a second still runs the briefing in real time.
     */
    if (drivesClock && lastReal !== null)
      clock.advance(Math.min(1000, realNow - lastReal));
    lastReal = realNow;
    /*
     * When the globe is not rendering (QA steps it by hand, or a renderer
     * stalls), this frame is the overlay's own: step the flight and draw.
     */
    if (realNow - lastSceneRender > 120) {
      onFrame?.();
      render();
    }
    frame = requestAnimationFrame(draw);
  }

  function add(item, kind = 'annotation') {
    const existing = items.get(item.id);
    existing?.dispose?.();
    item.kind = item.kind ?? kind;
    items.set(item.id, item);
    return item;
  }

  /**
   * FOCUS. While one dataset is the subject, the others recede but stay as
   * context: every map layer not in `on` fades to `dim`; annotations and
   * panels are left alone (they belong to the beat). `on: null` restores
   * everything. Items drawn later are not dimmed: what arrives is the focus.
   */
  function setFocus({
    on = null,
    dim = 0.22,
    durationMs = 700,
    instant = false,
  } = {}) {
    const keep = on ? new Set(on) : null;
    for (const item of items.values()) {
      if (item.kind !== 'layer') continue;
      const target = !keep || keep.has(item.id) ? 1 : dim;
      const from = instant ? target : focusNow(item);
      item.focus = {
        from,
        to: target,
        at: clock.now(),
        ms: instant ? 0 : durationMs,
      };
    }
  }

  function remove(id, { instant = false } = {}) {
    const item = items.get(id);
    if (!item) return;
    if (instant) {
      item.dispose?.();
      items.delete(id);
    } else item.removingAt = clock.now();
  }

  function clear({ instant = false, keep = [] } = {}) {
    for (const id of [...items.keys()])
      if (!keep.includes(id)) remove(id, { instant });
  }

  /** When an animation should be considered to have started, given `instant`. */
  const startAt = (instant, durationMs) =>
    instant ? clock.now() - durationMs - 1 : clock.now();

  /*
   * ---------------------------------------------------------------------
   * Geometry components (canvas)
   * ---------------------------------------------------------------------
   */

  /** A set of rings drawn progressively along their length. */
  function outline({
    id,
    rings,
    colour = '#3cf2a0',
    width: w = 2,
    durationMs = 2500,
    glow = 10,
    instant = false,
    z = 20,
    fill = null,
    fillAlpha = 0.12,
  }) {
    const ecef = rings.map((ring) => ground(ring));
    const t0 = startAt(instant, durationMs);
    return add({
      id,
      z,
      kind: 'layer',
      draw(c, project) {
        const t = ease.inOut(progress(clock, t0, durationMs));
        if (fill && t >= 1) {
          c.beginPath();
          for (const ring of ecef)
            tracePath(c, project, ring, 1, { close: true });
          c.fillStyle = hexToRgba(fill, fillAlpha);
          c.fill('evenodd');
        }
        c.beginPath();
        for (const ring of ecef) tracePath(c, project, ring, t);
        c.strokeStyle = colour;
        c.lineWidth = w;
        c.lineJoin = 'round';
        c.shadowColor = colour;
        c.shadowBlur = glow;
        c.stroke();
      },
    });
  }

  /** Darken everything outside a set of rings — "dim the neighbours". */
  function outsideMask({
    id,
    rings,
    alpha = 0.45,
    durationMs = 1200,
    instant = false,
    z = 5,
  }) {
    const ecef = rings.map((ring) => ground(ring));
    const t0 = startAt(instant, durationMs);
    return add({
      id,
      z,
      kind: 'layer',
      draw(c, project, _now, { width: W, height: H }) {
        const a = alpha * ease.out(progress(clock, t0, durationMs));
        c.beginPath();
        c.rect(0, 0, W, H);
        for (const ring of ecef)
          tracePath(c, project, ring, 1, { close: true });
        c.fillStyle = `rgba(2,6,8,${a})`;
        c.fill('evenodd');
      },
    });
  }

  /**
   * Nested bands (ShakeMap), growing outward from a centre. Levels from
   * `fillFrom` up are filled — nested, so the fills stack toward the
   * strongest shaking; weaker levels are contour lines only, which shows the
   * reach of the shaking without washing the map out.
   */
  function bands({
    id,
    levels,
    centre,
    maxRadiusM = 450_000,
    durationMs = 4000,
    instant = false,
    alpha = 0.2,
    fillFrom = 6,
    z = 10,
    highlight = null,
  }) {
    const prepared = levels.map((level) => ({
      ...level,
      ecef: level.rings.map((ring) => ground(ring)),
    }));
    const t0 = startAt(instant, durationMs);
    const state = { highlight, dimOthers: 0 };
    const item = add({
      id,
      z,
      kind: 'layer',
      state,
      draw(c, project) {
        const t = ease.out(progress(clock, t0, durationMs));
        const radius = maxRadiusM * t;
        c.save();
        if (t < 1) {
          const clip = toEcef(
            geoCircle(centre.lon, centre.lat, Math.max(1000, radius)),
          );
          c.beginPath();
          tracePath(c, project, clip, 1, { close: true });
          c.clip();
        }
        for (const level of prepared) {
          const on = state.highlight === null || level.mmi >= state.highlight;
          c.beginPath();
          for (const ring of level.ecef)
            tracePath(c, project, ring, 1, { close: true });
          const filled = level.mmi >= fillFrom;
          if (filled) {
            c.fillStyle = hexToRgba(level.colour, on ? alpha : alpha * 0.25);
            c.fill('evenodd');
          }
          c.setLineDash(filled ? [] : [5, 5]);
          c.strokeStyle = hexToRgba(
            level.colour,
            (on ? 0.9 : 0.3) * (filled ? 1 : 0.6),
          );
          c.lineWidth = level.mmi >= 7 ? 1.4 : 1;
          c.stroke();
          c.setLineDash([]);
        }
        c.restore();
      },
    });
    return item;
  }

  /**
   * Many points, coloured by a category, each category's opacity animated
   * toward a target — so "highlight Destroyed" is a cross-fade, not a cut.
   */
  function points({
    id,
    rows,
    lonIndex = 0,
    latIndex = 1,
    categoryIndex = 2,
    colours,
    radius = 3,
    z = 30,
    instant = false,
    revealMs = 1200,
    filter = null,
  }) {
    const ecef = ground(rows.flatMap((row) => [row[lonIndex], row[latIndex]]));
    const categories = rows.map((row) => row[categoryIndex]);
    const alpha = colours.map(() => ({
      from: 0,
      to: 1,
      at: startAt(instant, revealMs),
      ms: revealMs,
    }));
    const state = { filter, rows };
    const alphaNow = (k) => {
      const a = alpha[k];
      return a.from + (a.to - a.from) * ease.inOut(progress(clock, a.at, a.ms));
    };
    return add({
      id,
      z,
      kind: 'layer',
      state,
      setAlpha(k, to, ms = 700, instantly = false) {
        const current = alphaNow(k);
        alpha[k] = {
          from: instantly ? to : current,
          to,
          at: clock.now(),
          ms: instantly ? 0 : ms,
        };
      },
      draw(c, project) {
        const levels = colours.map((_, k) => alphaNow(k));
        for (let k = 0; k < colours.length; k += 1) {
          if (levels[k] <= 0.01) continue;
          c.beginPath();
          for (let i = 0; i < categories.length; i += 1) {
            if (categories[i] !== k) continue;
            if (state.filter && !state.filter(state.rows[i], i)) continue;
            const p = project(ecef, i);
            if (!p.visible) continue;
            c.moveTo(p.x + radius, p.y);
            c.arc(p.x, p.y, radius, 0, Math.PI * 2);
          }
          c.fillStyle = hexToRgba(colours[k], 0.9 * levels[k]);
          c.fill();
          c.strokeStyle = `rgba(245,250,248,${0.55 * levels[k]})`;
          c.lineWidth = 0.8;
          c.stroke();
        }
      },
    });
  }

  /**
   * Many polylines drawn as one layer — a road network — revealed outward
   * from a centre so the network "draws in" rather than cuts in. Groups draw
   * in order, so minor roads sit under major ones.
   */
  function network({
    id,
    groups,
    centre,
    maxRadiusM = 350_000,
    durationMs = 3500,
    instant = false,
    z = 12,
  }) {
    const prepared = groups.map((group) => ({
      ...group,
      ecef: group.lines.map((line) => ground(line)),
      /* [west, south, east, north] per line, in degrees, for view culling. */
      boxes: group.lines.map((line) => {
        let w = Infinity;
        let s = Infinity;
        let e = -Infinity;
        let n = -Infinity;
        for (let k = 0; k < line.length; k += 2) {
          w = Math.min(w, line[k]);
          e = Math.max(e, line[k]);
          s = Math.min(s, line[k + 1]);
          n = Math.max(n, line[k + 1]);
        }
        return [w, s, e, n];
      }),
    }));
    const t0 = startAt(instant, durationMs);
    const state = { dim: 1, dimFrom: 1, dimTo: 1, dimAt: 0, dimMs: 0 };
    const dimNow = () =>
      state.dimFrom +
      (state.dimTo - state.dimFrom) *
        ease.inOut(progress(clock, state.dimAt, state.dimMs));
    return add({
      id,
      z,
      kind: 'layer',
      state,
      setDim(to, ms = 800, instantly = false) {
        state.dimFrom = instantly ? to : dimNow();
        state.dimTo = to;
        state.dimAt = clock.now();
        state.dimMs = instantly ? 0 : ms;
      },
      draw(c, project) {
        const t = ease.out(progress(clock, t0, durationMs));
        const dim = dimNow();
        c.save();
        if (t < 1 && centre) {
          const clip = toEcef(
            geoCircle(centre.lon, centre.lat, Math.max(1000, maxRadiusM * t)),
          );
          c.beginPath();
          tracePath(c, project, clip, 1, { close: true });
          c.clip();
        }
        c.lineJoin = 'round';
        c.lineCap = 'round';
        /* Lines wholly outside the view are not projected at all: zoomed in, most of them. */
        const view = viewer.camera.computeViewRectangle?.(
          viewer.scene.globe.ellipsoid,
        );
        const box = view
          ? [
              Cesium.Math.toDegrees(view.west) - 0.05,
              Cesium.Math.toDegrees(view.south) - 0.05,
              Cesium.Math.toDegrees(view.east) + 0.05,
              Cesium.Math.toDegrees(view.north) + 0.05,
            ]
          : null;
        for (const group of prepared) {
          c.beginPath();
          group.ecef.forEach((line, i) => {
            const b = group.boxes[i];
            if (
              box &&
              (b[2] < box[0] || b[0] > box[2] || b[3] < box[1] || b[1] > box[3])
            )
              return;
            tracePath(c, project, line, 1);
          });
          c.strokeStyle = hexToRgba(group.colour, (group.alpha ?? 0.8) * dim);
          c.lineWidth = group.width ?? 1;
          c.stroke();
        }
        c.restore();
      },
    });
  }

  /**
   * Marks with a shape: a cross for a hospital, an x for a blockage, a dot
   * sized by people for a populated cell. Each row carries its own colour
   * and size; rows appear in a stagger so a list of places arrives rather
   * than cuts in.
   */
  function marks({
    id,
    rows,
    shape = 'dot',
    sizePx = 5,
    colour = '#e8f5ef',
    z = 40,
    instant = false,
    revealMs = 1200,
    staggerMs = 0,
    halo = false,
  }) {
    const ecef = ground(rows.flatMap((row) => [row.lon, row.lat]));
    const t0 = startAt(instant, revealMs + staggerMs);
    const state = { alpha: 1, highlight: null };
    return add({
      id,
      z,
      kind: 'layer',
      state,
      draw(c, project) {
        const elapsed = clock.now() - t0;
        c.lineCap = 'round';
        for (let i = 0; i < rows.length; i += 1) {
          const row = rows[i];
          const local = instant
            ? 1
            : Math.max(
                0,
                Math.min(
                  1,
                  (elapsed - (staggerMs * i) / Math.max(1, rows.length)) /
                    Math.max(1, revealMs),
                ),
              );
          if (local <= 0) continue;
          const p = project(ecef, i);
          if (!p.visible) continue;
          const k = ease.out(local);
          const s = (row.size ?? sizePx) * (0.4 + 0.6 * k);
          const fill = row.colour ?? colour;
          const dim = state.highlight && !state.highlight(row) ? 0.25 : 1;
          const a = k * state.alpha * dim;
          if (halo) {
            c.beginPath();
            c.arc(p.x, p.y, s * 2.2, 0, Math.PI * 2);
            c.fillStyle = hexToRgba(fill, 0.14 * a);
            c.fill();
          }
          c.beginPath();
          if (shape === 'cross') {
            const arm = s;
            const w = Math.max(1.6, s * 0.42);
            c.rect(p.x - w / 2, p.y - arm, w, arm * 2);
            c.rect(p.x - arm, p.y - w / 2, arm * 2, w);
            c.fillStyle = hexToRgba(fill, a);
            c.fill();
            c.strokeStyle = `rgba(2,8,10,${0.8 * a})`;
            c.lineWidth = 1;
            c.stroke();
          } else if (shape === 'x') {
            c.moveTo(p.x - s, p.y - s);
            c.lineTo(p.x + s, p.y + s);
            c.moveTo(p.x + s, p.y - s);
            c.lineTo(p.x - s, p.y + s);
            c.strokeStyle = `rgba(2,8,10,${0.85 * a})`;
            c.lineWidth = 4;
            c.stroke();
            c.strokeStyle = hexToRgba(fill, a);
            c.lineWidth = 2;
            c.stroke();
          } else if (shape === 'diamond') {
            c.moveTo(p.x, p.y - s);
            c.lineTo(p.x + s, p.y);
            c.lineTo(p.x, p.y + s);
            c.lineTo(p.x - s, p.y);
            c.closePath();
            c.fillStyle = hexToRgba(fill, a);
            c.fill();
          } else {
            c.arc(p.x, p.y, s, 0, Math.PI * 2);
            c.fillStyle = hexToRgba(fill, 0.85 * a);
            c.fill();
          }
        }
      },
    });
  }

  /**
   * Seismic events that appear as a timeline reaches them. `hourOf(row)` is
   * the event's time; the item's `hour` is where the timeline stands.
   *
   * TIME HAS A HIERARCHY (Stage 9.2). Hundreds of identical dots said nothing
   * about when. Each event is drawn in one of four states, relative to where
   * the timeline stands and where the current move through time began:
   *
   *   OLD     before this move began: small, dim, desaturated — context.
   *   RECENT  inside this move: full colour.
   *   NEW     the last eighth of the move: larger, with an expanding ring.
   *   MAJOR   magnitude 6.5 or more, once reached: a white ring and a label,
   *           "M7.3 · 12 MAY", that stays while the layer is shown.
   */
  function events({
    id,
    rows,
    colour = '#ffb347',
    z = 35,
    hour = 0,
    instant = false,
    originMs = null,
    majorMagnitude = 6.5,
  }) {
    const ecef = ground(rows.flatMap((row) => [row[0], row[1]]));
    const state = {
      hour,
      from: hour,
      to: hour,
      windowStart: hour,
      at: clock.now(),
      ms: 0,
      highlight: null,
    };
    const hourNow = () =>
      state.from +
      (state.to - state.from) * progress(clock, state.at, state.ms);
    const majors = rows
      .map((row, i) => ({ row, i }))
      .filter(({ row }) => row[2] >= majorMagnitude)
      .map(({ row, i }) => {
        const when =
          originMs !== null ? new Date(originMs + row[4] * 3_600_000) : null;
        const date = when
          ? `${String(when.getUTCDate()).padStart(2, '0')} ${MONTHS[when.getUTCMonth()]}`
          : '';
        const node = el(
          'div',
          'brf-label brf-label--event',
          `M${row[2].toFixed(1)}${date ? ` · ${date}` : ''}`,
        );
        node.style.opacity = '0';
        dom.append(node);
        return { row, i, node, x: 0, y: 0, shown: false };
      });
    return add({
      id,
      z,
      kind: 'layer',
      state,
      /**
       * Move the timeline. Whatever had appeared before this move becomes
       * OLD; what appears during it is RECENT. On a cold rebuild the beats
       * are replayed instantly in order, so the window is the same.
       */
      seek(toHour, ms, instantly = false) {
        state.windowStart = state.to;
        state.from = instantly ? toHour : hourNow();
        state.to = toHour;
        state.at = clock.now();
        state.ms = instantly ? 0 : ms;
      },
      hourNow,
      draw(c, project) {
        const h = hourNow();
        const span = Math.max(0.5, (state.to - state.windowStart) / 8);
        for (let i = 0; i < rows.length; i += 1) {
          const [, , mag, , hours] = rows[i];
          if (hours > h) continue;
          const p = project(ecef, i);
          if (!p.visible) continue;
          const base = 1.5 + Math.max(0, mag - 3) * 1.6;
          const old = hours < state.windowStart - 1e-6;
          const age = h - hours;
          const fresh = old ? 0 : Math.max(0, 1 - age / span);
          const isHighlight = state.highlight && state.highlight(rows[i]);
          const major = mag >= majorMagnitude;
          const r = old && !major ? base * 0.8 : base * (1 + 0.4 * fresh);
          c.beginPath();
          c.arc(p.x, p.y, r, 0, Math.PI * 2);
          c.fillStyle = isHighlight
            ? hexToRgba('#ff5a5f', 0.9)
            : old
              ? hexToRgba('#c9a27a', major ? 0.55 : 0.2)
              : hexToRgba(colour, 0.7 + 0.3 * fresh);
          c.fill();
          if (fresh > 0) {
            c.beginPath();
            c.arc(p.x, p.y, r + 14 * (1 - fresh), 0, Math.PI * 2);
            c.strokeStyle = hexToRgba(colour, fresh * 0.85);
            c.lineWidth = 1.4;
            c.stroke();
          }
          if (major) {
            c.beginPath();
            c.arc(p.x, p.y, r + 2.5, 0, Math.PI * 2);
            c.strokeStyle = `rgba(245,250,248,${old ? 0.5 : 0.9})`;
            c.lineWidth = 1.4;
            c.stroke();
          }
        }
        for (const m of majors) {
          const p = project(ecef, m.i);
          m.shown = p.visible && m.row[4] <= h;
          m.x = p.x;
          m.y = p.y;
          m.old = m.row[4] < state.windowStart - 1e-6;
        }
      },
      place(_project, _now, { fadeOut }) {
        for (const m of majors) {
          m.node.style.opacity = m.shown
            ? String((m.old ? 0.55 : 1) * fadeOut)
            : '0';
          m.node.style.transform = `translate(${Math.round(m.x + 12)}px, ${Math.round(m.y - 10 - m.node.offsetHeight)}px)`;
        }
      },
      dispose() {
        for (const m of majors) m.node.remove();
      },
    });
  }

  /**
   * THE CLOCK ON SCREEN. Where a scene moves through time, a card says where
   * the timeline stands — DAY 17 · 12 MAY 2015 — and a ruler shows how far
   * along the sequence that is, with the main shock and the second major
   * shock marked. It reads the hour from `hourOf()` every frame, so it moves
   * exactly as the events do, and stops when the briefing pauses.
   */
  function timeCard({
    id,
    hourOf,
    originMs,
    spanDays = 20,
    ticks = [],
    screen = { x: 0.64, y: 0.075 },
    instant = false,
    durationMs = 500,
    z = 88,
  }) {
    const node = el('div', 'brf-timecard');
    const day = el('div', 'brf-timecard__day');
    const date = el('div', 'brf-timecard__date');
    const ruler = el('div', 'brf-timecard__ruler');
    const fill = el('div', 'brf-timecard__fill');
    const cursor = el('div', 'brf-timecard__cursor');
    ruler.append(fill, cursor);
    const tickNodes = ticks.map((tick) => {
      const n = el('div', `brf-timecard__tick ${tick.className ?? ''}`.trim());
      n.title = tick.label ?? '';
      n.style.left = `${Math.min(100, (tick.day / spanDays) * 100)}%`;
      ruler.append(n);
      return { tick, n };
    });
    const ends = el('div', 'brf-timecard__ends');
    ends.append(el('span', null, 'DAY 0'), el('span', null, `DAY ${spanDays}`));
    node.append(day, date, ruler, ends);
    dom.append(node);
    const t0 = startAt(instant, durationMs);
    return add({
      id,
      z,
      kind: 'ui',
      place(_project, _now, { width: W, height: H, fadeOut }) {
        const h = Math.max(0, hourOf());
        const d = Math.floor(h / 24);
        day.textContent =
          h < 48 ? `DAY ${d} · +${Math.floor(h)} H` : `DAY ${d}`;
        const when = new Date(originMs + h * 3_600_000);
        date.textContent = `${String(when.getUTCDate()).padStart(2, '0')} ${MONTHS[when.getUTCMonth()]} ${when.getUTCFullYear()} · ${String(when.getUTCHours()).padStart(2, '0')}:${String(when.getUTCMinutes()).padStart(2, '0')} UTC`;
        const share = Math.min(1, h / 24 / spanDays);
        fill.style.width = `${share * 100}%`;
        cursor.style.left = `${share * 100}%`;
        for (const { tick, n } of tickNodes)
          n.classList.toggle('is-reached', h / 24 >= tick.day);
        node.style.opacity = String(
          ease.out(progress(clock, t0, durationMs)) * fadeOut,
        );
        node.style.transform = `translate(${Math.round(screen.x * W)}px, ${Math.round(screen.y * H)}px)`;
      },
      dispose() {
        node.remove();
      },
    });
  }

  /** Expanding rings at a place, `count` of them, repeating while shown. */
  function pulse({
    id,
    lon,
    lat,
    colour = '#ff5a5f',
    maxPx = 70,
    periodMs = 1800,
    count = 3,
    z = 40,
    core = 5,
  }) {
    const ecef = ground([lon, lat]);
    const t0 = clock.now();
    return add({
      id,
      z,
      draw(c, project, now) {
        const p = project(ecef, 0);
        if (!p.visible) return;
        for (let k = 0; k < count; k += 1) {
          const phase = ((((now - t0) / periodMs + k / count) % 1) + 1) % 1;
          c.beginPath();
          c.arc(p.x, p.y, core + phase * maxPx, 0, Math.PI * 2);
          c.strokeStyle = hexToRgba(colour, (1 - phase) * 0.85);
          c.lineWidth = 2;
          c.stroke();
        }
        c.beginPath();
        c.arc(p.x, p.y, core, 0, Math.PI * 2);
        c.fillStyle = colour;
        c.shadowColor = colour;
        c.shadowBlur = 16;
        c.fill();
      },
    });
  }

  /** Four corner brackets closing onto a place. */
  function bracket({
    id,
    lon,
    lat,
    sizePx = 60,
    colour = '#e8f5ef',
    durationMs = 700,
    instant = false,
    z = 45,
  }) {
    const ecef = ground([lon, lat]);
    const t0 = startAt(instant, durationMs);
    return add({
      id,
      z,
      draw(c, project) {
        const p = project(ecef, 0);
        if (!p.visible) return;
        const t = ease.out(progress(clock, t0, durationMs));
        const half = sizePx * (1.8 - 0.8 * t) * 0.5;
        const arm = Math.max(8, sizePx * 0.22);
        c.strokeStyle = hexToRgba(colour, 0.25 + 0.75 * t);
        c.lineWidth = 1.6;
        c.beginPath();
        /* Each corner: an arm along x toward the centre, the corner, an arm along y. */
        for (const [sx, sy] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          const x = p.x + sx * half;
          const y = p.y + sy * half;
          c.moveTo(x - sx * arm, y);
          c.lineTo(x, y);
          c.lineTo(x, y - sy * arm);
        }
        c.stroke();
      },
    });
  }

  /** A polyline traced progressively, with a bright head while it travels. */
  function trace({
    id,
    line,
    colour = '#7fdcff',
    width: w = 3,
    durationMs = 2500,
    instant = false,
    z = 38,
    dashed = false,
  }) {
    const ecef = ground(line);
    const t0 = startAt(instant, durationMs);
    return add({
      id,
      z,
      draw(c, project) {
        const t = ease.inOut(progress(clock, t0, durationMs));
        c.beginPath();
        tracePath(c, project, ecef, t);
        c.strokeStyle = colour;
        c.lineWidth = w;
        c.lineCap = 'round';
        c.lineJoin = 'round';
        if (dashed) c.setLineDash([8, 6]);
        c.shadowColor = colour;
        c.shadowBlur = 8;
        c.stroke();
      },
    });
  }

  /** A faint graticule for the opening, drawn on the globe. */
  function graticule({
    id,
    stepDeg = 15,
    colour = 'rgba(120,200,170,0.10)',
    z = 2,
  }) {
    const lines = [];
    for (let lon = -180; lon < 180; lon += stepDeg) {
      const line = [];
      for (let lat = -80; lat <= 80; lat += 4) line.push(lon, lat);
      lines.push(toEcef(line));
    }
    for (let lat = -75; lat <= 75; lat += stepDeg) {
      const line = [];
      for (let lon = -180; lon <= 180; lon += 4) line.push(lon, lat);
      lines.push(toEcef(line));
    }
    return add({
      id,
      z,
      kind: 'layer',
      draw(c, project) {
        c.beginPath();
        for (const line of lines) tracePath(c, project, line, 1);
        c.strokeStyle = colour;
        c.lineWidth = 1;
        c.stroke();
      },
    });
  }

  /*
   * ---------------------------------------------------------------------
   * Text components (DOM, geo-anchored)
   * ---------------------------------------------------------------------
   */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  /** An evidence tag: SOURCE · CLASS, coloured by class. */
  function evidenceTag({ source, cls }) {
    const tag = el(
      'div',
      `brf-tag brf-tag--${String(cls)
        .toLowerCase()
        .replace(/[^a-z]+/g, '-')}`,
    );
    tag.append(
      el('span', 'brf-tag__source', source),
      el('span', 'brf-tag__class', String(cls).replace('_', ' ')),
    );
    return tag;
  }

  /**
   * A callout joined to a place by an elbow leader line. The line draws
   * first, then the box slides in, then its lines appear one by one.
   */
  function callout({
    id,
    lon,
    lat,
    title,
    lines = [],
    tag = null,
    dx = 90,
    dy = -70,
    durationMs = 900,
    instant = false,
    z = 60,
    tone = 'default',
    anchorDot = true,
  }) {
    const ecef = ground([lon, lat]);
    const box = el('div', `brf-callout brf-callout--${tone}`);
    if (title) box.append(el('div', 'brf-callout__title', title));
    const lineNodes = lines.map((text) => el('div', 'brf-callout__line', text));
    box.append(...lineNodes);
    if (tag) box.append(evidenceTag(tag));
    dom.append(box);
    const t0 = startAt(instant, durationMs);
    const place = { x: 0, y: 0, left: 0, top: 0, visible: false };
    return add({
      id,
      z,
      draw(c, project, _now, info) {
        const p = project(ecef, 0);
        place.visible = p.visible;
        place.x = p.x;
        place.y = p.y;
        if (!p.visible) return;
        const t = progress(clock, t0, durationMs);
        const lineT = ease.out(Math.min(1, t / 0.45));
        /* Where the box goes, kept in the frame; the leader ends at its near edge. */
        const w = box.offsetWidth;
        const h = box.offsetHeight;
        const kept = keptInFrame(
          dx >= 0 ? p.x + dx : p.x + dx - w,
          p.y + dy - h / 2,
          w,
          h,
          info,
        );
        place.left = kept.x;
        place.top = kept.y;
        const bx = dx >= 0 ? kept.x : kept.x + w;
        const by = kept.y + h / 2;
        const elbowX = p.x + (bx - p.x) * 0.35;
        c.strokeStyle = 'rgba(232,245,239,0.85)';
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(p.x, p.y);
        const segA = Math.hypot(elbowX - p.x, by - p.y);
        const segB = Math.abs(bx - elbowX);
        const total = segA + segB;
        const drawn = total * lineT;
        if (drawn <= segA) {
          const f = drawn / segA;
          c.lineTo(p.x + (elbowX - p.x) * f, p.y + (by - p.y) * f);
        } else {
          c.lineTo(elbowX, by);
          c.lineTo(elbowX + Math.sign(bx - elbowX || 1) * (drawn - segA), by);
        }
        c.stroke();
        if (anchorDot) {
          c.beginPath();
          c.arc(p.x, p.y, 3, 0, Math.PI * 2);
          c.fillStyle = '#e8f5ef';
          c.fill();
        }
      },
      place(_project, _now, { fadeOut }) {
        const t = progress(clock, t0, durationMs);
        const boxT = ease.out(Math.max(0, (t - 0.35) / 0.65));
        if (!place.visible) {
          box.style.opacity = '0';
          return;
        }
        box.style.transform = `translate(${Math.round(place.left)}px, ${Math.round(place.top)}px)`;
        box.style.opacity = String(boxT * fadeOut);
        lineNodes.forEach((node, k) => {
          node.style.opacity = String(
            Math.max(0, Math.min(1, (t - 0.5 - k * 0.12) / 0.2)),
          );
        });
      },
      dispose() {
        box.remove();
      },
    });
  }

  /** A place name set on the map. */
  function label({
    id,
    lon,
    lat,
    text,
    size = 'md',
    durationMs = 700,
    instant = false,
    z = 55,
    dx = 10,
    dy = -10,
  }) {
    const ecef = ground([lon, lat]);
    const node = el('div', `brf-label brf-label--${size}`, text);
    dom.append(node);
    const t0 = startAt(instant, durationMs);
    let visible = false;
    let x = 0;
    let y = 0;
    return add({
      id,
      z,
      draw(_c, project) {
        const p = project(ecef, 0);
        visible = p.visible;
        x = p.x;
        y = p.y;
      },
      place(_project, _now, { fadeOut }) {
        node.style.opacity = visible
          ? String(ease.out(progress(clock, t0, durationMs)) * fadeOut)
          : '0';
        /* A negative dx puts the label to the left of its anchor, as it does a callout. */
        const left = dx >= 0 ? x + dx : x + dx - node.offsetWidth;
        node.style.transform = `translate(${Math.round(left)}px, ${Math.round(y + dy - node.offsetHeight)}px)`;
      },
      dispose() {
        node.remove();
      },
    });
  }

  /**
   * A number that counts to its value, anchored to a place or pinned to the
   * screen. `format` turns the running value into text; the final frame
   * shows exactly the formatted artefact value.
   */
  function metric({
    id,
    value,
    format = (v) => String(Math.round(v)),
    label: caption = '',
    tag = null,
    lon = null,
    lat = null,
    screen = null,
    durationMs = 1600,
    instant = false,
    z = 65,
    size = 'lg',
    dx = 24,
    dy = -30,
    from = 0,
  }) {
    const ecef = lon !== null ? ground([lon, lat]) : null;
    const node = el('div', `brf-metric brf-metric--${size}`);
    const number = el('div', 'brf-metric__value');
    const text = el('div', 'brf-metric__label', caption);
    node.append(number, text);
    if (tag) node.append(evidenceTag(tag));
    dom.append(node);
    const t0 = startAt(instant, durationMs);
    let pos = { x: 0, y: 0, visible: true };
    return add({
      id,
      z,
      draw(_c, project) {
        if (ecef) {
          const p = project(ecef, 0);
          pos = { x: p.x + dx, y: p.y + dy, visible: p.visible };
        }
      },
      place(_project, _now, { width: W, height: H, fadeOut }) {
        const t = progress(clock, t0, durationMs);
        const current = t >= 1 ? value : from + (value - from) * ease.out(t);
        number.textContent = format(current, t >= 1);
        node.style.opacity = String(
          (pos.visible ? Math.min(1, t * 4) : 0) * fadeOut,
        );
        if (screen) {
          node.style.transform = `translate(${Math.round(screen.x * W)}px, ${Math.round(screen.y * H)}px)`;
        } else {
          node.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y - node.offsetHeight / 2)}px)`;
        }
      },
      dispose() {
        node.remove();
      },
    });
  }

  /** Full-width question card, typed, then held. */
  function question({ id, text, durationMs = 2800, instant = false, z = 90 }) {
    const node = el('div', 'brf-question');
    const inner = el('div', 'brf-question__text');
    node.append(inner);
    dom.append(node);
    const t0 = startAt(instant, durationMs);
    return add({
      id,
      z,
      kind: 'ui',
      place(_project, _now, { fadeOut }) {
        const t = progress(clock, t0, durationMs * 0.5);
        inner.textContent = text.slice(0, Math.ceil(text.length * t));
        node.style.opacity = String(Math.min(1, t * 3) * fadeOut);
      },
      dispose() {
        node.remove();
      },
    });
  }

  /** System text typed line by line, at a screen position. */
  function typed({
    id,
    lines,
    screen = { x: 0.06, y: 0.36 },
    durationMs = 1400,
    instant = false,
    z = 85,
    className = 'brf-typed',
    tag = null,
  }) {
    const node = el('div', className);
    const lineNodes = lines.map((line) => {
      const row = el('div', `brf-typed__line ${line.className ?? ''}`.trim());
      node.append(row);
      return { row, text: line.text ?? line };
    });
    /* A conclusion carries its class: the tag sits under the words it qualifies. */
    if (tag) node.append(evidenceTag(tag));
    dom.append(node);
    const t0 = startAt(instant, durationMs);
    const total = lineNodes.reduce((s, l) => s + String(l.text).length, 0);
    return add({
      id,
      z,
      kind: 'ui',
      place(_project, _now, { width: W, height: H, fadeOut }) {
        const t = progress(clock, t0, durationMs);
        let budget = Math.ceil(total * t);
        for (const { row, text } of lineNodes) {
          const shown = Math.min(String(text).length, budget);
          row.textContent = String(text).slice(0, shown);
          budget -= shown;
        }
        node.style.opacity = String(fadeOut);
        node.style.transform = `translate(${Math.round(screen.x * W)}px, ${Math.round(screen.y * H)}px)`;
      },
      dispose() {
        node.remove();
      },
    });
  }

  /*
   * THE BOTTOM BAND BELONGS TO THE CAPTION AND THE CONTROLS. A chart is placed
   * by its top edge, and grows as it builds (bars, a verdict banner, a larger
   * type size on tall screens), so on a 1280x720 screen the damage and
   * intensity charts ran down behind the caption and the control bar. Where a
   * chart would overlap either, it is lifted until it clears them, never above
   * the scene title.
   */
  const BAND_GAP = 10;
  const TITLE_CLEAR = 0.19;
  /*
   * The band the caption and the controls own, as rectangles in overlay
   * pixels. The caption types in word by word and can wrap to two lines, so
   * its band is reserved at two lines' height whatever it holds now: a chart
   * placed against the caption's current box jumped up when the line wrapped.
   */
  function bottomBand() {
    const origin = dom.getBoundingClientRect();
    const rel = (r) => ({
      l: r.left - origin.left,
      r: r.right - origin.left,
      t: r.top - origin.top,
      b: r.bottom - origin.top,
    });
    const band = [];
    const caption = document.querySelector('.brf-caption');
    const text = caption?.querySelector('.brf-caption__text');
    if (caption && text && caption.offsetParent !== null) {
      const box = rel(caption.getBoundingClientRect());
      const style = getComputedStyle(text);
      const line =
        parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.45;
      const pad =
        parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) || 20;
      band.push({ ...box, t: box.b - (2 * line + pad) });
    }
    const controls = document.querySelector('.brf-controls');
    if (controls && controls.offsetParent !== null)
      band.push(rel(controls.getBoundingClientRect()));
    return band;
  }
  /** The highest top edge of the band under a box spanning [left, left + w]. */
  function floorUnder(left, w, fallback) {
    const under = bottomBand().filter((r) => r.l < left + w && r.r > left);
    return under.length
      ? Math.min(...under.map((r) => r.t)) - BAND_GAP
      : fallback;
  }
  function liftedTop(wrap, top, left, info) {
    const box = wrap.getBoundingClientRect();
    if (!box.height) return top;
    const limit = floorUnder(left, box.width, info.height);
    if (top + box.height <= limit) return top;
    return Math.max(TITLE_CLEAR * info.height, limit - box.height);
  }

  /*
   * A CALLOUT STAYS IN THE FRAME. Placed beside its anchor, a callout could
   * leave the screen or land on the scene title when the camera framed its
   * anchor near an edge: the rescue result printed the hospital's name over
   * '32 · A ROUTE, BEFORE AND AFTER', half off the left edge. The box is kept
   * inside the frame, below the heading and above the caption and controls;
   * its leader line follows it.
   */
  const EDGE = 8;
  function keptInFrame(left, top, w, h, info) {
    const origin = dom.getBoundingClientRect();
    const rel = (node) => {
      if (!node || node.offsetParent === null) return null;
      const r = node.getBoundingClientRect();
      return r.height
        ? {
            l: r.left - origin.left,
            r: r.right - origin.left,
            t: r.top - origin.top,
            b: r.bottom - origin.top,
          }
        : null;
    };
    let x = Math.min(Math.max(left, EDGE), info.width - w - EDGE);
    let y = Math.max(top, EDGE);
    /*
     * Nor on a chart or a key. A place under a chart put its callout over the
     * chart's title and verdict (scene 18's Manbu and Sundar Bazar): the box
     * goes beside the panel, on the side it was meant for if there is room.
     */
    for (const node of dom.querySelectorAll('.brf-panel')) {
      const p = rel(node);
      if (!p || Number(node.style.opacity || 1) < 0.05) continue;
      if (x >= p.r || x + w <= p.l || y >= p.b || y + h <= p.t) continue;
      const right = p.r + EDGE;
      const leftOf = p.l - w - EDGE;
      const fitsRight = right + w <= info.width - EDGE;
      const fitsLeft = leftOf >= EDGE;
      const wantsRight = x + w / 2 >= (p.l + p.r) / 2;
      if (fitsRight && (wantsRight || !fitsLeft)) x = right;
      else if (fitsLeft) x = leftOf;
    }
    const heading = rel(document.querySelector('.brf-heading'));
    if (heading && x < heading.r && x + w > heading.l && y < heading.b)
      y = heading.b + EDGE;
    const floor = floorUnder(x, w, info.height - EDGE);
    if (y + h > floor) y = Math.max(EDGE, floor - h);
    return { x, y };
  }

  /** A screen-anchored DOM panel (a chart), sliding in. */
  function panel({
    id,
    node,
    screen = { x: 0.03, y: 0.62 },
    durationMs = 600,
    instant = false,
    z = 70,
    onPlace = null,
  }) {
    const wrap = el('div', 'brf-panel');
    wrap.append(node);
    dom.append(wrap);
    const t0 = startAt(instant, durationMs);
    return add({
      id,
      z,
      kind: 'ui',
      node,
      place(project, now, info) {
        const t = ease.out(progress(clock, t0, durationMs));
        const left = Math.round(screen.x * info.width);
        const top = liftedTop(wrap, screen.y * info.height, left, info);
        wrap.style.opacity = String(t * info.fadeOut);
        wrap.style.transform = `translate(${left}px, ${Math.round(top + (1 - t) * 16)}px)`;
        onPlace?.(project, now, info);
      },
      dispose() {
        wrap.remove();
      },
    });
  }

  frame = requestAnimationFrame(draw);

  return Object.freeze({
    root,
    items,
    get: (id) => items.get(id),
    remove,
    clear,
    outline,
    outsideMask,
    bands,
    points,
    network,
    marks,
    events,
    pulse,
    bracket,
    trace,
    graticule,
    callout,
    label,
    metric,
    question,
    typed,
    panel,
    evidenceTag,
    setFocus,
    timeCard,
    /** For QA: the terrain height the overlay draws a place at. */
    heightAt: (lon, lat) => heights.heightAt(lon, lat),
    get terrainHeights() {
      return heights.enabled;
    },
    /** Called every animation frame before drawing; the stage hooks in here. */
    setOnFrame(fn) {
      onFrame = fn;
    },
    /**
     * QA: hand the clock to a recorder, which advances it in fixed steps so a
     * capture is taken at an exact briefing time however slowly frames draw.
     */
    setDrivesClock(on) {
      drivesClock = Boolean(on);
    },
    holdRender,
    releaseRender,
    destroy() {
      destroyed = true;
      if (frame) cancelAnimationFrame(frame);
      removePreUpdate?.();
      removePostRender?.();
      for (const item of items.values()) item.dispose?.();
      items.clear();
      root.remove();
    },
  });
}
