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
 * WHAT IT DRAWS. Only its own things: the government hospital list on the
 * road-network scenes (no explore layer shows it, and a health facility
 * cannot be inspected if it is not on the map), a ring on the picked object,
 * the picked line, district outline or matched road segment, a leader line
 * from the card to the object, and whatever the card's one active action
 * draws (a catchment, a route, a radius, a landslide, the cells one blockage
 * moves). It never touches the scene's layers.
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

const SVG_NS = 'http://www.w3.org/2000/svg';
const COLOURS = {
  kept: '#5dffb0',
  lost: '#ff3d6e',
  gained: '#ffb020',
  route: '#5dffb0',
  scenario: '#ffb020',
  blockage: '#ff3d6e',
  radius: '#7fdcff',
  effect: '#ffb020',
};

/** What an action's colours mean, shown under its figures. */
const ACTION_KEYS = {
  catchment: [[COLOURS.kept, 'NEAREST HOSPITAL BY ROAD · 3 KM BLOCKS']],
  scenario: [
    [COLOURS.kept, 'STILL NEAREST WITH THE BLOCKAGES'],
    [COLOURS.lost, 'NO LONGER NEAREST'],
    [COLOURS.gained, 'NEWLY NEAREST'],
  ],
  trace: [
    [COLOURS.route, 'ROUTE BEFORE'],
    [COLOURS.scenario, 'ROUTE WITH THE BLOCKAGES · DASHED'],
  ],
  effect: [[COLOURS.effect, 'CELLS WHOSE ACCESS CHANGES']],
};

/** A ground circle as a closed line of [lon, lat] pairs, for a radius drawn on the terrain. */
function circleLine(lon, lat, radiusKm, steps = 72) {
  const dLat = radiusKm / 110.54;
  const dLon = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return [lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)];
  });
}

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
  /* What the card's active action draws: points, lines and labels of its own. */
  const actionPoints = scene.primitives.add(
    new Cesium.PointPrimitiveCollection(),
  );
  let actionEntities = [];
  let actionBillboards = [];
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
  let lastScreen = { x: 0, y: 0 };

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
  /* The leader: a line from the card to the object it describes. */
  const leader = document.createElementNS(SVG_NS, 'svg');
  leader.setAttribute('class', 'brf-inspector-leader');
  leader.setAttribute('aria-hidden', 'true');
  const leaderLine = document.createElementNS(SVG_NS, 'line');
  const leaderDot = document.createElementNS(SVG_NS, 'circle');
  leaderDot.setAttribute('r', '4');
  leader.append(leaderLine, leaderDot);
  leader.style.display = 'none';
  host.append(leader, root, hint);

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
    else at = kind === 'blockage' ? [item.lon, item.lat] : hit.clickAt;
    /* A blockage shows the road segment the analysis matched it to, in red. */
    if (kind === 'blockage' && Array.isArray(item.segment)) {
      outlineEntities.push(
        viewer.entities.add({
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(item.segment.flat()),
            width: 6,
            material: Cesium.Color.fromCssColorString(COLOURS.blockage),
            clampToGround: true,
          },
        }),
      );
    }
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
      const detail = new Map(
        (r?.display?.blockages ?? []).map((b) => [b.id, b]),
      );
      const slides = raw.infrastructure?.results?.landslides ?? [];
      out.blockage = data.nga.blockedRoads.features.map((f, i) => {
        const line =
          f.geometry.type === 'MultiLineString'
            ? f.geometry.coordinates.flat()
            : f.geometry.coordinates;
        const [lon, lat] = lineMid(line);
        const d = r ? detail.get(`road-${i}`) : undefined;
        const slide = d?.nearestLandslide
          ? slides.find((item) => item.index === d.nearestLandslide.index)
          : null;
        return {
          ...(d ?? {}),
          id: `road-${i}`,
          lon,
          lat,
          sensedOn: normaliseObservationDate(f.properties.sensedOn),
          matched: d ? d.matched : undefined,
          /* The landslide's own position, from the infrastructure artefact. */
          landslideAt: slide ? [slide.lon, slide.lat] : null,
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
    if (card.actions?.length) {
      const bar = el('div', 'brf-inspector__actions');
      const result = el('div', 'brf-inspector__result');
      result.hidden = true;
      const buttons = card.actions.map((action) => {
        const button = el('button', 'brf-inspector__action');
        button.type = 'button';
        button.append(el('span', 'brf-inspector__action-label', action.label));
        if (!action.enabled) {
          button.disabled = true;
          button.append(el('span', 'brf-inspector__why', action.why));
        }
        button.setAttribute('aria-pressed', 'false');
        button.dataset.action = action.id;
        button.addEventListener('click', () => {
          const on = button.getAttribute('aria-pressed') !== 'true';
          for (const other of buttons)
            other.setAttribute('aria-pressed', 'false');
          clearAction();
          result.replaceChildren();
          result.hidden = !on;
          if (!on) return;
          button.setAttribute('aria-pressed', 'true');
          showActionResult(action, result);
          drawAction(action.id, current);
          place(lastScreen);
        });
        bar.append(button);
        return button;
      });
      root.append(bar, result);
    }
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
    lastScreen = screen;
    place(screen);
    updateLeader();
  }

  /** An action's own figures, read from the artefact by `describe`, under the buttons. */
  function showActionResult(action, box) {
    if (action.rows?.length) {
      const rows = el('dl', 'brf-inspector__rows');
      for (const [label, value] of action.rows)
        rows.append(el('dt', null, label), el('dd', null, value));
      box.append(rows);
    }
    const key = ACTION_KEYS[action.id];
    if (key) {
      const legend = el('div', 'brf-inspector__key');
      for (const [colour, label] of key) {
        const row = el('span', 'brf-inspector__key-row');
        const swatch = el('i', 'brf-inspector__swatch');
        swatch.style.background = colour;
        row.append(swatch, el('span', null, label));
        legend.append(row);
      }
      box.append(legend);
    }
    if (action.tag) {
      const tag = el('div', tagClass(action.tag.cls));
      tag.append(
        el('span', 'brf-tag__source', action.tag.source),
        el('span', 'brf-tag__class', String(action.tag.cls).replace('_', ' ')),
      );
      box.append(tag);
    }
  }

  /* ------------------------------------------------------------ actions */

  function clearAction() {
    for (const entity of actionEntities) viewer.entities.remove(entity);
    actionEntities = [];
    for (const b of actionBillboards) billboards.remove(b);
    actionBillboards = [];
    actionPoints.removeAll();
    requestRender();
  }

  const colourOf = (css, alpha = 1) =>
    Cesium.Color.fromCssColorString(css).withAlpha(alpha);

  function actionLine(points, css, { width = 4, dashed = false } = {}) {
    if (!points || points.length < 2) return;
    actionEntities.push(
      viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(points.flat()),
          width,
          material: dashed
            ? new Cesium.PolylineDashMaterialProperty({
                color: colourOf(css),
                dashLength: 14,
              })
            : colourOf(css),
          clampToGround: true,
        },
      }),
    );
  }

  function actionLabel([lon, lat], text, css) {
    actionEntities.push(
      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        label: {
          text,
          font: '600 12px "JetBrains Mono", monospace',
          fillColor: colourOf(css),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(10, -10),
          horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }),
    );
  }

  function actionPoint([lon, lat], css, size = 7, alpha = 0.85) {
    actionPoints.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      pixelSize: size,
      color: colourOf(css, alpha),
      outlineColor: colourOf('#02080a', 0.8),
      outlineWidth: 1,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });
  }

  /** The 3 km catchment blocks, as [lon, lat, before, after] rows. */
  function catchmentBlocks() {
    const g = results()?.display?.catchmentGrid;
    if (!g) return [];
    const rows = [];
    for (let i = 0; i < g.blocks.length; i += 4) {
      rows.push([
        g.originLon + g.blocks[i] * g.stepLon,
        g.originLat - g.blocks[i + 1] * g.stepLat,
        g.blocks[i + 2],
        g.blocks[i + 3],
      ]);
    }
    return rows;
  }

  /** Draw what one action shows. Every position is the artefact's own. */
  function drawAction(id, hit) {
    if (!hit) return;
    const { item } = hit;
    const r = results();
    if (id === 'catchment' || id === 'scenario') {
      const index = (r?.display?.hospitals ?? []).findIndex(
        (h) => h.id === item.id,
      );
      for (const [lon, lat, before, after] of catchmentBlocks()) {
        if (id === 'catchment') {
          if (before === index) actionPoint([lon, lat], COLOURS.kept);
        } else if (before === index && after === index)
          actionPoint([lon, lat], COLOURS.kept);
        else if (before === index) actionPoint([lon, lat], COLOURS.lost, 9);
        else if (after === index) actionPoint([lon, lat], COLOURS.gained, 9);
      }
    } else if (id === 'trace') {
      const areas = new Set([
        ...(item.damageAreasBefore ?? []),
        ...(item.damageAreasAfter ?? []),
      ]);
      for (const route of r?.display?.areaRouteLines ?? []) {
        if (!areas.has(route.area)) continue;
        actionLine(route.baseline, COLOURS.route, { width: 5 });
        actionLine(route.scenario, COLOURS.scenario, {
          width: 3,
          dashed: true,
        });
        const start = route.baseline?.[0] ?? route.scenario?.[0];
        if (start) {
          actionPoint(start, COLOURS.route, 10, 1);
          actionLabel(start, String(route.area).toUpperCase(), COLOURS.route);
        }
      }
    } else if (id === 'nearby') {
      actionLine(circleLine(item.lon, item.lat, 10), COLOURS.radius, {
        width: 3,
        dashed: true,
      });
      actionLabel([item.lon, item.lat + 10 / 110.54], '10 KM', COLOURS.radius);
    } else if (id === 'landslide' && item.landslideAt) {
      actionLine([[item.lon, item.lat], item.landslideAt], COLOURS.gained, {
        width: 3,
        dashed: true,
      });
      actionBillboards.push(
        billboards.add({
          position: Cesium.Cartesian3.fromDegrees(...item.landslideAt),
          image: ring,
          color: colourOf(COLOURS.gained),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }),
      );
      actionLabel(item.landslideAt, 'NEAREST MAPPED LANDSLIDE', COLOURS.gained);
    } else if (id === 'effect' && item.whatIf) {
      const cells = r?.display?.cells ?? [];
      for (const i of item.whatIf.cells ?? []) {
        const cell = cells[i];
        if (cell) actionPoint([cell[0], cell[1]], COLOURS.effect, 7);
      }
    }
    requestRender();
  }

  /* ------------------------------------------------------------ leader */

  function objectAt(hit) {
    if (!hit) return null;
    const { item, kind } = hit;
    if (kind === 'district' || item.line) return null;
    return {
      lon: item.lon,
      lat: item.lat,
      onTerrain: !SEA_LEVEL_KINDS.has(kind),
    };
  }

  function updateLeader() {
    const target = !root.hidden ? objectAt(current) : null;
    const at = target
      ? project(target.lon, target.lat, { onTerrain: target.onTerrain })
      : null;
    if (!at) {
      leader.style.display = 'none';
      return;
    }
    const box = host.getBoundingClientRect();
    const canvas = scene.canvas.getBoundingClientRect();
    const px = canvas.left - box.left + at.x;
    const py = canvas.top - box.top + at.y;
    const card = root.getBoundingClientRect();
    const left = card.left - box.left;
    const right = card.right - box.left;
    const x = px < left ? left : px > right ? right : left;
    const y = Math.max(
      card.top - box.top + 16,
      Math.min(py, card.bottom - box.top - 16),
    );
    leader.style.display = '';
    leader.setAttribute('width', String(box.width));
    leader.setAttribute('height', String(box.height));
    leaderLine.setAttribute('x1', String(x));
    leaderLine.setAttribute('y1', String(y));
    leaderLine.setAttribute('x2', String(px));
    leaderLine.setAttribute('y2', String(py));
    leaderDot.setAttribute('cx', String(px));
    leaderDot.setAttribute('cy', String(py));
  }
  const removePostRender = scene.postRender.addEventListener(updateLeader);

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
    leader.style.display = 'none';
    clearAction();
    highlight(null);
  }

  /* --------------------------------------------------------------- click */

  function project(lon, lat, { onTerrain = false } = {}) {
    const height = onTerrain
      ? (scene.globe?.getHeight(Cesium.Cartographic.fromDegrees(lon, lat)) ?? 0)
      : 0;
    const at = scene.cartesianToCanvasCoordinates(
      Cesium.Cartesian3.fromDegrees(lon, lat, height),
    );
    return at ? { x: at.x, y: at.y } : null;
  }

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
    clearAction();
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
    /** For QA: what the active action has drawn, and whether the leader line shows. */
    get drawn() {
      return {
        points: actionPoints.length,
        lines: actionEntities.length,
        markers: actionBillboards.length,
        leader: leader.style.display !== 'none',
      };
    },
    /**
     * For QA: where a position is drawn on the canvas, or null off screen —
     * at sea level for a point kind, on the terrain for a clamped one.
     */
    project,
    /** For QA: pick at a screen position as a click would. */
    clickAt: (x, y) => onClick({ position: new Cesium.Cartesian2(x, y) }),
    element: root,
    destroy() {
      destroyed = true;
      removePostRender();
      handler.destroy();
      clearAction();
      scene.primitives.remove(actionPoints);
      win?.removeEventListener?.('keydown', onKey);
      win?.removeEventListener?.('resize', placeHint);
      highlight(null);
      scene.primitives.remove(billboards);
      root.remove();
      hint.remove();
      leader.remove();
    },
  });
}
