/**
 * EXPLORE's map inspector: click anything on the map and ask what the
 * analysis knows about it.
 *
 * Before this, EXPLORE's only interaction was the control strip; the map
 * itself answered nothing. A click now becomes a ground position and a scale,
 * `pickAt` finds the object the viewer meant among the kinds the scene is
 * showing, and `describe` writes its card from artefact values. Where the
 * analysis holds nothing for an object, the card says so and why.
 *
 * WHAT IT DRAWS. Only three things, all its own: the government hospital
 * list on the road-network scenes (no explore layer shows it, and a health
 * facility cannot be inspected if it is not on the map), a ring on the
 * picked object, and the picked line or district outline. It never touches
 * the scene's layers.
 *
 * NO FIGURE ORIGINATES HERE. Every value on a card is read from an artefact;
 * the inspector only looks it up, by id or by position against the
 * artefact's own coordinates.
 */

import * as Cesium from 'cesium';
import { describe, pickAt } from '../../../nepal/briefing/inspect.js';
import { normaliseObservationDate } from '../../../nepal/analysis/damageLinkage.js';

const ACCESS_URL = '/data/analysis/nepal-2015-health-access.json';

/*
 * WHERE EACH KIND IS DRAWN decides which ground position a click is tested
 * against. Points and markers sit at sea level with depth testing off, so on
 * the terrain they are drawn where the sea-level position projects; lines
 * and polygons are clamped to the terrain. A click tested against the wrong
 * one misses by up to a kilometre on a pitched camera over the hills.
 */
const SEA_LEVEL_KINDS = new Set(['earthquake', 'damage', 'bridge', 'hospital']);

/** Explore scenes about the road network, where the hospital list is drawn. */
const HOSPITAL_SCENES = new Set(['network', 'route', 'scenarios']);
const EXPLORE = 'EXPLORE';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A small glyph drawn once and shared by every billboard of its kind. */
function glyph(draw, size = 24) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  return canvas;
}

const crossGlyph = () =>
  glyph((g, s) => {
    const m = s / 2;
    g.lineCap = 'square';
    g.strokeStyle = 'rgba(2, 8, 10, 0.9)';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(m, 5);
    g.lineTo(m, s - 5);
    g.moveTo(5, m);
    g.lineTo(s - 5, m);
    g.stroke();
    g.strokeStyle = '#e4f5ec';
    g.lineWidth = 2.5;
    g.stroke();
  }, 20);

const ringGlyph = () =>
  glyph((g, s) => {
    g.strokeStyle = 'rgba(2, 8, 10, 0.85)';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(s / 2, s / 2, s / 2 - 5, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = '#5dffb0';
    g.lineWidth = 2;
    g.stroke();
  }, 40);

const lineMid = (line) => line[Math.floor(line.length / 2)];

/**
 * @param {object} options
 * @param {object} options.viewer the Cesium viewer
 * @param {HTMLElement} options.host where the card and hint are mounted
 * @param {() => object} options.getContext the experience's `inspectContext()`
 * @param {(sceneId: string) => void} [options.onPlayScene] start the briefing at a scene
 * @param {() => void} [options.requestRender]
 * @param {typeof fetch} [options.fetchImpl]
 */
export function createExploreInspector({
  viewer,
  host,
  getContext,
  onPlayScene = null,
  requestRender = () => viewer?.scene?.requestRender?.(),
  fetchImpl = globalThis.fetch?.bind(globalThis),
  win = globalThis.window,
}) {
  const scene = viewer.scene;
  const billboards = scene.primitives.add(
    new Cesium.BillboardCollection({ scene }),
  );
  /* The picked line or outline, clamped to the terrain like the layer it marks. */
  let outlineEntities = [];
  const cross = crossGlyph();
  const ring = ringGlyph();
  let hospitalBillboards = [];
  let ringBillboard = null;

  let access = null;
  let accessPromise = null;
  let destroyed = false;
  let current = null;

  const root = el('div', 'brf-inspector');
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-live', 'polite');
  const hint = el(
    'div',
    'brf-inspector-hint',
    'CLICK ANY OBJECT ON THE MAP TO INSPECT IT',
  );
  hint.hidden = true;
  host.append(root, hint);

  function loadAccess() {
    if (access || accessPromise || !fetchImpl) return accessPromise;
    accessPromise = fetchImpl(ACCESS_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((json) => {
        access = json;
        refresh();
        return json;
      })
      .catch(() => {
        /* Without the artefact the cards say the access analysis is unavailable. */
        access = { results: null, unavailable: true };
        return access;
      });
    return accessPromise;
  }

  const results = () => access?.results ?? null;

  /* ------------------------------------------------------------ drawing */

  function setHospitals(on) {
    const wanted = on ? (results()?.display?.hospitals ?? []) : [];
    if (wanted.length === hospitalBillboards.length) return;
    for (const b of hospitalBillboards) billboards.remove(b);
    hospitalBillboards = wanted.map((h) =>
      billboards.add({
        position: Cesium.Cartesian3.fromDegrees(h.lon, h.lat),
        image: cross,
        scale: 0.8,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      }),
    );
    requestRender();
  }

  function highlight(hit) {
    for (const entity of outlineEntities) viewer.entities.remove(entity);
    outlineEntities = [];
    if (ringBillboard) {
      billboards.remove(ringBillboard);
      ringBillboard = null;
    }
    if (!hit) return requestRender();
    const { item, kind } = hit;
    const colour = Cesium.Color.fromCssColorString('#5dffb0');
    const addLine = (points) => {
      if (points.length < 2) return;
      outlineEntities.push(
        viewer.entities.add({
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(points.flat()),
            width: 3,
            material: colour,
            clampToGround: true,
          },
        }),
      );
    };
    let at = null;
    if (kind === 'district') {
      const g = item.geometry;
      const polygons =
        g?.type === 'MultiPolygon'
          ? g.coordinates
          : g?.type === 'Polygon'
            ? [g.coordinates]
            : [];
      for (const rings of polygons) addLine(rings[0]);
    } else if (item.line) {
      addLine(item.line);
    } else if (SEA_LEVEL_KINDS.has(kind)) at = [item.lon, item.lat];
    else at = hit.clickAt;
    if (at) {
      ringBillboard = billboards.add({
        position: Cesium.Cartesian3.fromDegrees(at[0], at[1]),
        image: ring,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
    }
    requestRender();
  }

  /* --------------------------------------------------------- candidates */

  /** What may be picked: only kinds the scene is showing, from data it has loaded. */
  function candidates(ctx) {
    const visible = new Set(ctx.visibleLayers);
    const data = ctx.data ?? {};
    const raw = ctx.intelligence?.raw ?? {};
    const r = results();
    const out = {};

    if (visible.has('seismic-events') && data.seismicEvents) {
      out.earthquake = data.seismicEvents.map((e) => ({
        ...e,
        lon: e.longitude,
        lat: e.latitude,
      }));
    } else if (visible.has('epicentre')) {
      const m = ctx.intelligence?.seismic?.mainShock;
      if (m)
        out.earthquake = [
          { ...m, lon: m.longitude, lat: m.latitude, hoursFromMainShock: 0 },
        ];
    }

    if (
      (visible.has('damage-points') || visible.has('proximity-rings')) &&
      data.unosat
    ) {
      out.damage = data.unosat.map((f) => ({
        ...f.properties,
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      }));
    }

    if (visible.has('blocked-roads') && data.nga?.blockedRoads) {
      const matched = new Map(
        (r?.display?.blockages ?? []).map((b) => [b.id, b.matched]),
      );
      out.blockage = data.nga.blockedRoads.features.map((f, i) => {
        const line =
          f.geometry.type === 'MultiLineString'
            ? f.geometry.coordinates.flat()
            : f.geometry.coordinates;
        const [lon, lat] = lineMid(line);
        return {
          lon,
          lat,
          sensedOn: normaliseObservationDate(f.properties.sensedOn),
          matched: r ? matched.get(`road-${i}`) : undefined,
        };
      });
    }

    if (visible.has('bridges-out')) {
      const whatIf = r?.bridgeWhatIf ?? [];
      out.bridge = (raw.infrastructure?.results?.bridges ?? []).map((b) => {
        /* The access analysis keyed its bridges by position; match on the same coordinates. */
        const w = whatIf.find(
          (x) =>
            Math.abs(x.lon - b.lon) < 1e-5 && Math.abs(x.lat - b.lat) < 1e-5,
        );
        return { ...b, whatIf: w?.matched ? w : null };
      });
    }

    if (visible.has('landslides'))
      out.landslide = raw.infrastructure?.results?.landslides ?? [];

    if (HOSPITAL_SCENES.has(ctx.sceneId) && r?.display?.hospitals)
      out.hospital = r.display.hospitals;

    if (
      (visible.has('route-baseline') || visible.has('route-damaged')) &&
      data.route
    ) {
      const { pair } = data.route;
      out.route = [data.route.baseline, data.route.damaged]
        .filter((path) => path?.coordinates?.length > 1)
        .map((path) => ({ ...pair, line: path.coordinates }));
    }

    if (visible.has('road-network') && data.graphEdges) {
      const seen = new Set();
      out.road = [];
      for (const edge of data.graphEdges) {
        const coords = edge.coordinates;
        if (!coords || coords.length < 2) continue;
        /* Each road is in the graph twice, once per direction; keep one. */
        const a = coords[0].join();
        const b = coords[coords.length - 1].join();
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.road.push({
          line: coords,
          highway: edge.highway,
          name: edge.name,
          ref: edge.ref,
        });
      }
    }

    if (data.districts) {
      const exposure = new Map(
        (raw.exposure?.results?.districtQuadrants ?? []).map((row) => [
          row.districtKey,
          row,
        ]),
      );
      const damage = new Map(
        (raw.damagePopulation?.results?.byDistrict ?? []).map((row) => [
          row.district,
          row,
        ]),
      );
      const byDistrict = new Map(
        (r?.byDistrict ?? []).map((row) => [row.district, row]),
      );
      out.district = data.districts.map((f) => ({
        name: f.properties.district,
        geometry: f.geometry,
        exposure: exposure.get(f.properties.districtKey) ?? null,
        damage: damage.get(f.properties.district) ?? null,
        access: r ? (byDistrict.get(f.properties.district) ?? null) : undefined,
      }));
    }
    return out;
  }

  /* --------------------------------------------------------------- card */

  function tagClass(cls) {
    return `brf-tag brf-tag--${String(cls)
      .toLowerCase()
      .replace(/[^a-z]+/g, '-')}`;
  }

  function showCard(card, screen) {
    root.replaceChildren();
    const head = el('div', 'brf-inspector__head');
    head.append(
      el(
        'span',
        'brf-inspector__kind',
        card.kind === 'none' ? 'MAP' : card.kind.toUpperCase(),
      ),
    );
    const close = el('button', 'brf-inspector__close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close the inspector');
    close.addEventListener('click', () => clear());
    head.append(close);
    root.append(head, el('div', 'brf-inspector__title', card.title));
    root.setAttribute('aria-label', card.title);
    if (card.rows.length) {
      const rows = el('dl', 'brf-inspector__rows');
      for (const [label, value] of card.rows)
        rows.append(el('dt', null, label), el('dd', null, value));
      root.append(rows);
    }
    if (card.tag) {
      const tag = el('div', tagClass(card.tag.cls));
      tag.append(
        el('span', 'brf-tag__source', card.tag.source),
        el('span', 'brf-tag__class', String(card.tag.cls).replace('_', ' ')),
      );
      root.append(tag);
    }
    root.append(el('p', 'brf-inspector__note', card.note));
    if (card.scene && onPlayScene) {
      const play = el(
        'button',
        'brf-inspector__play',
        '▶ PLAY THIS IN THE BRIEFING',
      );
      play.type = 'button';
      play.addEventListener('click', () => {
        const target = card.scene;
        clear();
        onPlayScene(target);
      });
      root.append(play);
    }
    root.hidden = false;
    place(screen);
  }

  /** Beside the click, kept clear of the scene rail and the detail panel. */
  function place(screen) {
    const box = host.getBoundingClientRect();
    const rail = host.querySelector('.ndi__rail')?.getBoundingClientRect();
    const panel = host.querySelector('.ndi__panel')?.getBoundingClientRect();
    const left = Math.max(
      box.left + 12,
      rail && rail.width > 0 ? rail.right + 12 : 0,
    );
    const right = Math.min(
      box.right - 12,
      panel && panel.width > 0 ? panel.left - 12 : Infinity,
    );
    const width = root.offsetWidth || 300;
    const height = root.offsetHeight || 220;
    let x = screen.x + 18;
    if (x + width > right) x = screen.x - 18 - width;
    x = Math.max(left, Math.min(x, right - width));
    const y = Math.max(
      box.top + 64,
      Math.min(screen.y - height / 2, box.bottom - height - 110),
    );
    root.style.left = `${Math.round(x - box.left)}px`;
    root.style.top = `${Math.round(y - box.top)}px`;
  }

  function clear() {
    current = null;
    root.hidden = true;
    highlight(null);
  }

  /* --------------------------------------------------------------- click */

  /** A ground position under the pointer, and the scale there in metres per pixel. */
  function located(cartesian) {
    if (!cartesian) return null;
    const carto = Cesium.Cartographic.fromCartesian(cartesian);
    const distance = Cesium.Cartesian3.distance(
      viewer.camera.positionWC,
      cartesian,
    );
    const fovy = viewer.camera.frustum?.fovy ?? Math.PI / 3;
    const pixels = scene.canvas.clientHeight || 720;
    return {
      lon: Cesium.Math.toDegrees(carto.longitude),
      lat: Cesium.Math.toDegrees(carto.latitude),
      metresPerPixel: (2 * distance * Math.tan(fovy / 2)) / pixels,
    };
  }

  /** The two grounds a click can mean: sea level (points) and the terrain (lines, areas). */
  function groundAt(position) {
    const seaLevel = located(
      viewer.camera.pickEllipsoid(position, scene.globe?.ellipsoid),
    );
    const ray = viewer.camera.getPickRay(position);
    const surface = located(ray && scene.globe?.pick(ray, scene)) ?? seaLevel;
    return seaLevel || surface ? { seaLevel, surface } : null;
  }

  /** Test each kind against the ground it is drawn on; a point still beats a line. */
  function pickBoth(ground, all) {
    const only = (test) =>
      Object.fromEntries(Object.entries(all).filter(([kind]) => test(kind)));
    const sea = ground.seaLevel
      ? pickAt({
          ...ground.seaLevel,
          candidates: only((kind) => SEA_LEVEL_KINDS.has(kind)),
        })
      : null;
    const land = ground.surface
      ? pickAt({
          ...ground.surface,
          candidates: only((kind) => !SEA_LEVEL_KINDS.has(kind)),
        })
      : null;
    const isPoint = (hit) => hit && !hit.item.line && hit.kind !== 'district';
    if (isPoint(sea) && isPoint(land))
      return sea.metres <= land.metres ? sea : land;
    if (isPoint(sea)) return sea;
    return land ?? sea;
  }

  async function onClick(event) {
    const ctx = getContext();
    if (!ctx || ctx.mode !== EXPLORE || ctx.suspended) return;
    const ground = groundAt(event.position);
    if (!ground) return clear();
    if (!access) await loadAccess();
    if (destroyed) return;
    const hit = pickBoth(ground, candidates(ctx));
    if (!hit) {
      current = null;
      highlight(null);
      showCard(
        describe({ kind: 'none', item: {} }),
        canvasToPage(event.position),
      );
      return;
    }
    const at = ground.surface ?? ground.seaLevel;
    hit.clickAt = [at.lon, at.lat];
    hit.sceneId = ctx.sceneId;
    current = hit;
    highlight(hit);
    const card = describe(hit, {
      mainShockId: ctx.intelligence?.seismic?.mainShock?.id,
      codCompiled: results()?.listAgreement?.codCompiled ?? null,
      osmInstant: results()?.listAgreement?.osmInstant ?? null,
      accessUnavailable: access?.unavailable === true,
    });
    showCard(card, canvasToPage(event.position));
  }

  function canvasToPage(position) {
    const rect = scene.canvas.getBoundingClientRect();
    return { x: rect.left + position.x, y: rect.top + position.y };
  }

  const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
  handler.setInputAction((event) => {
    void onClick(event);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  function onKey(event) {
    if (event.key === 'Escape' && !root.hidden) clear();
  }
  win?.addEventListener?.('keydown', onKey);

  /*
   * The hint sits at the foot of the map column, centred between the rail
   * and the panel: the top of the map carries the scenario band on the
   * scenes that have one.
   */
  function placeHint() {
    const box = host.getBoundingClientRect();
    const body = host.querySelector('.ndi__body')?.getBoundingClientRect();
    const rail = host.querySelector('.ndi__rail')?.getBoundingClientRect();
    const panel = host.querySelector('.ndi__panel')?.getBoundingClientRect();
    const left = rail?.width ? rail.right : box.left;
    const right = panel?.width ? panel.left : box.right;
    hint.style.left = `${Math.round((left + right) / 2 - box.left)}px`;
    hint.style.top = `${Math.round((body?.height ? body.bottom : box.bottom - 120) - box.top - 34)}px`;
  }
  win?.addEventListener?.('resize', placeHint);

  /** Follow the investigation: hide everything outside EXPLORE, draw hospitals where they belong. */
  function refresh() {
    if (destroyed) return;
    const ctx = getContext();
    const exploring = !!ctx && ctx.mode === EXPLORE && !ctx.suspended;
    hint.hidden = !exploring;
    if (exploring) placeHint();
    const wantHospitals = exploring && HOSPITAL_SCENES.has(ctx.sceneId);
    if (wantHospitals && !access) void loadAccess();
    setHospitals(wantHospitals);
    /* A card never outlives the scene it was opened on. */
    if (!exploring || (current && ctx.sceneId !== current.sceneId)) clear();
  }

  return Object.freeze({
    refresh,
    /** For QA: what the last click picked. */
    get current() {
      return current;
    },
    /**
     * For QA: where a position is drawn on the canvas, or null off screen —
     * at sea level for a point kind, on the terrain for a clamped one.
     */
    project(lon, lat, { onTerrain = false } = {}) {
      const height = onTerrain
        ? (scene.globe?.getHeight(Cesium.Cartographic.fromDegrees(lon, lat)) ??
          0)
        : 0;
      const at = scene.cartesianToCanvasCoordinates(
        Cesium.Cartesian3.fromDegrees(lon, lat, height),
      );
      return at ? { x: at.x, y: at.y } : null;
    },
    /** For QA: pick at a screen position as a click would. */
    clickAt: (x, y) => onClick({ position: new Cesium.Cartesian2(x, y) }),
    element: root,
    destroy() {
      destroyed = true;
      handler.destroy();
      win?.removeEventListener?.('keydown', onKey);
      win?.removeEventListener?.('resize', placeHint);
      highlight(null);
      scene.primitives.remove(billboards);
      root.remove();
      hint.remove();
    },
  });
}
