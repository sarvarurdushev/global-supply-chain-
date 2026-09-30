/**
 * The stage: turns a timeline action into something the viewer sees or
 * hears. The director decides WHEN; this decides WHAT.
 *
 * Every action takes `{ instant }`. Played, it animates on the briefing
 * clock and resolves when the animation ends. Instant, it lands in its final
 * state immediately — which is how a skip, a BACK or a jump rebuilds a beat's
 * starting frame without replaying its animations (see director.js).
 *
 * Figures come from facts (`book`), places from the briefing geometry, and
 * colours from the same ramps the explore map uses. The stage computes
 * nothing that is then shown as a result.
 */

import * as Cesium from 'cesium';
import { fillTemplate, formatValue } from '../../../nepal/briefing/facts.js';
import { progress } from '../../../nepal/briefing/clock.js';
import { interpolateView } from '../../../nepal/briefing/flight.js';
import { DAMAGE_COLOURS, MMI_COLOURS } from '../../../nepal/story/mapModel.js';
import {
  createCompositionChart,
  createIntensityChart,
  createLegendChart,
} from './charts.js';

const FLIGHT_HOLD = 'nepal-briefing-flight';

/*
 * Act V colours. Hospitals are a white cross on a teal halo — deliberately
 * not a red cross, which is a protected emblem. Change categories follow the
 * analysis' CHANGE_ORDER: SIMILAR, LONGER, DIFFERENT_FACILITY, DISCONNECTED,
 * NO_BASELINE_PATH.
 */
export const ACCESS_COLOURS = Object.freeze({
  hospital: '#f2fffa',
  offNetwork: '#7d8a86',
  osmHospital: '#7fdcff',
  blockage: '#ff8c42',
  unmatched: '#8b8f93',
  noRoad: '#4cc9f0',
  baseline: '#3cf2a0',
  scenario: '#ffb020',
  cut: '#ff3d6e',
});
export const ACCESS_CATEGORY_COLOURS = Object.freeze([
  '#5b6b66',
  '#ffb020',
  '#f4d35e',
  '#ff3d6e',
  '#9b8cff',
]);

/**
 * @param {object} input
 * @param {object} input.viewer Cesium viewer
 * @param {object} input.overlay from `createBriefingOverlay`
 * @param {object} input.clock the briefing clock
 * @param {object} input.book fact book (facts.js)
 * @param {object} input.geometry the briefing geometry artefact
 * @param {object} input.narrator from `createNarrator`
 * @param {object} input.sound from `createSoundBed`
 * @param {object} input.captions from `createCaptions`
 */
export function createBriefingStage({
  viewer,
  overlay,
  clock,
  book,
  geometry,
  narrator,
  sound,
  captions,
  holdRender = () => {},
  releaseRender = () => {},
  requestRender = () => {},
  veil = null,
}) {
  const charts = new Map();
  /** The flight in progress; it advances with the briefing clock. */
  let flight = null;
  const pendingRemovals = new Set();

  /* ------------------------------------------------------------ places */

  /** A value inside a fact: `{ fact: 'access.cut', path: ['baseline', 'line'] }`. */
  function factAt({ fact, path = [] }) {
    let value = book.value(fact);
    for (const key of path) value = value?.[key];
    if (value === undefined || value === null)
      throw new Error(`Fact ${fact} has no ${path.join('.')}.`);
    return value;
  }

  function place(ref) {
    if (!ref) return null;
    if (typeof ref === 'object' && ref.fact) {
      const at = factAt(ref);
      if (!Number.isFinite(at.lon))
        throw new Error(
          `Fact ${ref.fact}.${(ref.path ?? []).join('.')} is not a place.`,
        );
      return at;
    }
    if (typeof ref === 'object' && Number.isFinite(ref.lon)) return ref;
    const text = String(ref);
    if (geometry.places[text]) return geometry.places[text];
    if (text.startsWith('district:')) {
      const key = text.slice('district:'.length);
      const d = geometry.districts.find((item) => item.key === key);
      if (!d) throw new Error(`No district "${key}" in the briefing geometry.`);
      return { lon: d.label[0], lat: d.label[1] };
    }
    if (text.startsWith('area:')) {
      const name = text.slice('area:'.length);
      const a = geometry.damage.areaAnchors.find((item) => item.name === name);
      if (!a)
        throw new Error(`No analysis area "${name}" in the briefing geometry.`);
      return a;
    }
    throw new Error(`Unknown place "${text}".`);
  }

  /** A fact's value, optionally one field of it. */
  function factValue(id, key, subKey) {
    const fact = book.get(id);
    let value = fact.value;
    if (key !== undefined) value = value?.[key];
    if (subKey !== undefined) value = value?.[subKey];
    if (value === undefined)
      throw new Error(
        `Fact ${id}${key !== undefined ? `.${key}` : ''}${subKey !== undefined ? `.${subKey}` : ''} is undefined.`,
      );
    return { fact, value };
  }

  const tagFor = (fact, override) =>
    override === false
      ? null
      : (override ?? { source: fact.source, cls: fact.cls });

  const text = (value) =>
    value === undefined || value === null ? value : fillTemplate(value, book);

  /* ------------------------------------------------------------ camera */

  /*
   * The camera flies on the BRIEFING clock (see flight.js): each frame sets
   * the view for the current briefing time. PAUSE therefore freezes a move
   * where it is, a speed change applies mid-move, and a skip lands the view
   * without a flight to cancel.
   */

  /** The view the stage last set; null until the briefing moves the camera. */
  let view = null;

  /**
   * `spanFactor` frames a place that carries its own extent (a route's
   * `frame.spanKm`): the camera stands that many spans away.
   */
  function targetView({
    to,
    rangeKm = 1200,
    heading = 0,
    pitch = -90,
    spanFactor = null,
  }) {
    const target = place(to);
    const km =
      spanFactor && Number.isFinite(target.spanKm)
        ? Math.max(40, target.spanKm * spanFactor)
        : rangeKm;
    return {
      lon: target.lon,
      lat: target.lat,
      range: km * 1000,
      heading,
      pitch,
    };
  }

  function applyView(v) {
    const camera = viewer.camera;
    camera.lookAt(
      Cesium.Cartesian3.fromDegrees(v.lon, v.lat, 0),
      new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(v.heading),
        Cesium.Math.toRadians(v.pitch),
        v.range,
      ),
    );
    camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    view = v;
    requestRender();
  }

  /**
   * Where the camera is looking now. Mid-flight that is the flight's own
   * view; otherwise it is read from the globe, because explore may have moved
   * the camera since the briefing last did.
   */
  function viewFromCamera() {
    if (flight && view) return view;
    const camera = viewer.camera;
    camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    const canvas = viewer.scene.canvas;
    const centre = new Cesium.Cartesian2(
      canvas.clientWidth / 2,
      canvas.clientHeight / 2,
    );
    const hit = camera.pickEllipsoid(centre, viewer.scene.globe.ellipsoid);
    const heading = Cesium.Math.toDegrees(camera.heading);
    const pitch = Cesium.Math.toDegrees(camera.pitch);
    if (hit) {
      const ground = Cesium.Cartographic.fromCartesian(hit);
      return {
        lon: Cesium.Math.toDegrees(ground.longitude),
        lat: Cesium.Math.toDegrees(ground.latitude),
        range: Cesium.Cartesian3.distance(camera.position, hit),
        heading,
        pitch,
      };
    }
    if (view) return view;
    const here = camera.positionCartographic;
    return {
      lon: Cesium.Math.toDegrees(here.longitude),
      lat: Cesium.Math.toDegrees(here.latitude),
      range: here.height,
      heading,
      pitch: -90,
    };
  }

  function setView(params) {
    flight = null;
    applyView(targetView(params));
  }

  function fly(params, durationMs, resolve) {
    const from = viewFromCamera();
    finishFlight(false);
    holdRender(FLIGHT_HOLD);
    flight = {
      from,
      to: targetView(params),
      startedAt: clock.now(),
      durationMs,
      resolve,
    };
    stepFlight();
  }

  /** Ends the flight in progress: landed plays the lock cue; either way it resolves. */
  function finishFlight(landed) {
    const current = flight;
    if (!current) return;
    flight = null;
    if (landed) {
      applyView(current.to);
      sound.cue('lock');
    }
    releaseRender(FLIGHT_HOLD);
    requestRender();
    current.resolve();
  }

  /** Called every frame, after the clock has advanced. */
  function stepFlight() {
    if (!flight) return;
    const t = progress(clock, flight.startedAt, flight.durationMs);
    if (t >= 1) {
      finishFlight(true);
      return;
    }
    applyView(interpolateView(flight.from, flight.to, t));
  }
  overlay.setOnFrame?.(stepFlight);

  /* ------------------------------------------------------------ layers */

  const layers = {
    graticule: () => overlay.graticule({ id: 'graticule' }),
    outline: ({ instant, duration = 3000, colour = '#3cf2a0', fill = null }) =>
      overlay.outline({
        id: 'outline',
        rings: geometry.outline,
        durationMs: duration,
        instant,
        colour,
        width: 2.2,
        glow: 12,
        fill,
        z: 22,
      }),
    mask: ({ instant, duration = 1200, alpha = 0.42 }) =>
      overlay.outsideMask({
        id: 'mask',
        rings: geometry.outline,
        alpha,
        durationMs: duration,
        instant,
      }),
    districts: ({ instant, duration = 3000 }) =>
      overlay.outline({
        id: 'districts',
        rings: geometry.districts.flatMap((d) => d.rings),
        durationMs: duration,
        instant,
        colour: 'rgba(160,230,200,0.55)',
        width: 0.8,
        glow: 0,
        z: 18,
      }),
    'district-focus': ({
      instant,
      duration = 1200,
      keys = [],
      colour = '#e8f5ef',
    }) =>
      overlay.outline({
        id: 'district-focus',
        rings: geometry.districts
          .filter((d) => keys.includes(d.key))
          .flatMap((d) => d.rings),
        durationMs: duration,
        instant,
        colour,
        width: 1.8,
        glow: 6,
        z: 21,
      }),
    bands: ({ instant, duration = 4500, minMmi = 4.5 }) =>
      overlay.bands({
        id: 'bands',
        levels: geometry.shakemapBands
          .filter((band) => band.mmi >= minMmi)
          .map((band) => ({
            ...band,
            colour: MMI_COLOURS[band.mmi] ?? '#888888',
          })),
        centre: place('epicentre'),
        durationMs: duration,
        instant,
      }),
    damage: ({ instant, duration = 1200 }) =>
      overlay.points({
        id: 'damage',
        rows: geometry.damage.rows,
        colours: geometry.damage.classes.map((name) => DAMAGE_COLOURS[name]),
        radius: 2.6,
        revealMs: duration,
        instant,
      }),
    events: ({ instant, hour = 0 }) =>
      overlay.events({
        id: 'events',
        rows: geometry.seismicEvents.rows,
        hour,
        instant,
      }),

    /* ---- Act V: roads, hospitals and access (health-access artefact) ---- */
    roads: ({
      instant,
      duration = 3500,
      centre = 'damageCentre',
      radiusKm = 320,
    }) =>
      overlay.network({
        id: 'roads',
        groups: [
          {
            lines: geometry.roads.minor,
            colour: '#8fa9a0',
            width: 0.7,
            alpha: 0.5,
          },
          {
            lines: geometry.roads.major,
            colour: '#f1e3b5',
            width: 1.4,
            alpha: 0.9,
          },
        ],
        centre: place(centre),
        maxRadiusM: radiusKm * 1000,
        durationMs: duration,
        instant,
      }),
    hospitals: ({ instant, duration = 1800 }) =>
      overlay.marks({
        id: 'hospitals',
        rows: book.value('access.display').hospitals.map((h) => ({
          ...h,
          colour: h.onNetwork
            ? ACCESS_COLOURS.hospital
            : ACCESS_COLOURS.offNetwork,
        })),
        shape: 'cross',
        sizePx: 6,
        halo: true,
        revealMs: 500,
        staggerMs: duration,
        instant,
        z: 46,
      }),
    'osm-hospitals': ({ instant, duration = 1400 }) =>
      overlay.marks({
        id: 'osm-hospitals',
        rows: book.value('access.display').osmHospitals,
        shape: 'dot',
        sizePx: 2.2,
        colour: ACCESS_COLOURS.osmHospital,
        revealMs: 400,
        staggerMs: duration,
        instant,
        z: 44,
      }),
    blockages: ({ instant, duration = 2200 }) =>
      overlay.marks({
        id: 'blockages',
        rows: book.value('access.display').blockages.map((b) => ({
          ...b,
          colour: b.matched
            ? ACCESS_COLOURS.blockage
            : ACCESS_COLOURS.unmatched,
          size: b.matched ? 5 : 3.5,
        })),
        shape: 'x',
        revealMs: 400,
        staggerMs: duration,
        instant,
        z: 48,
      }),
    /* Cells whose hospital access changed, sized by people: a display scale, not a value. */
    'access-cells': ({
      instant,
      duration = 1600,
      categories = null,
      id = 'access-cells',
    }) =>
      overlay.marks({
        id,
        rows: book
          .value('access.display')
          .cells.filter((c) => !categories || categories.includes(c[3]))
          .map(([lon, lat, people, category]) => ({
            lon,
            lat,
            category,
            colour: ACCESS_CATEGORY_COLOURS[category],
            size: Math.min(6, 1.6 + Math.sqrt(people) / 14),
          })),
        shape: 'dot',
        revealMs: 600,
        staggerMs: duration,
        instant,
        z: 34,
      }),
    'no-road': ({ instant, duration = 2000 }) =>
      overlay.marks({
        id: 'no-road',
        rows: book.value('access.display').noRoad.map(([lon, lat, people]) => ({
          lon,
          lat,
          size: Math.min(5, 1 + Math.sqrt(people) / 22),
        })),
        shape: 'dot',
        colour: ACCESS_COLOURS.noRoad,
        revealMs: 700,
        staggerMs: duration,
        instant,
        z: 32,
      }),
  };

  function filterLayer(action, instant) {
    const item = overlay.get(action.id ?? action.layer);
    if (!item) return;
    if (action.layer === 'damage') {
      const on = new Set(
        action.classes ?? geometry.damage.classes.map((_, k) => k),
      );
      geometry.damage.classes.forEach((_, k) =>
        item.setAlpha(
          k,
          on.has(k) ? 1 : (action.dim ?? 0.07),
          action.duration ?? 700,
          instant,
        ),
      );
      item.state.filter = action.sensorDates
        ? (row) => action.sensorDates.includes(geometry.damage.dates[row[3]])
        : null;
    }
    if (action.layer === 'bands')
      item.state.highlight = action.highlight ?? null;
    if (action.layer === 'roads')
      item.setDim(action.dim ?? 1, action.duration ?? 800, instant);
    if (action.layer === 'access-cells') {
      item.state.highlight = action.categories
        ? (row) => action.categories.includes(row.category)
        : null;
    }
    if (
      ['hospitals', 'blockages', 'no-road', 'osm-hospitals'].includes(
        action.layer,
      )
    ) {
      item.state.alpha = action.alpha ?? 1;
    }
    if (action.layer === 'events') {
      item.state.highlight = action.minMagnitude
        ? (row) => row[2] >= action.minMagnitude
        : null;
    }
  }

  /* ------------------------------------------------------------ annotations */

  function drawAnnotation(action, instant) {
    const { kind, id } = action;
    const where = action.anchor ? place(action.anchor) : null;
    const duration = action.duration;
    switch (kind) {
      case 'callout': {
        const fact = action.fact ? book.get(action.fact) : null;
        return overlay.callout({
          id,
          lon: where.lon,
          lat: where.lat,
          title: text(action.title),
          lines: (action.lines ?? []).map(text),
          tag: action.tag ?? (fact ? tagFor(fact) : null),
          dx: action.dx,
          dy: action.dy,
          durationMs: duration,
          instant,
          tone: action.tone,
        });
      }
      case 'label':
        return overlay.label({
          id,
          lon: where.lon,
          lat: where.lat,
          text: text(action.text),
          size: action.size,
          durationMs: duration,
          instant,
          dx: action.dx,
          dy: action.dy,
        });
      case 'bracket':
        return overlay.bracket({
          id,
          lon: where.lon,
          lat: where.lat,
          sizePx: action.size,
          durationMs: duration,
          instant,
          colour: action.colour,
        });
      case 'pulse':
        return overlay.pulse({
          id,
          lon: where.lon,
          lat: where.lat,
          colour: action.colour,
          maxPx: action.maxPx,
          count: action.count,
        });
      case 'typed':
        return overlay.typed({
          id,
          lines: action.lines.map((line) =>
            typeof line === 'string'
              ? text(line)
              : { ...line, text: text(line.text) },
          ),
          screen: action.screen,
          durationMs: duration,
          instant,
          className: action.className,
        });
      case 'trace': {
        /* A route from the analysis arrives as [[lon, lat], …]; the overlay draws flat pairs. */
        const line = action.line?.fact
          ? factAt(action.line).flat()
          : action.line;
        return overlay.trace({
          id,
          line,
          colour: action.colour,
          width: action.width,
          durationMs: duration,
          instant,
          dashed: action.dashed,
        });
      }
      default:
        throw new Error(`Unknown annotation kind "${kind}".`);
    }
  }

  function countMetric(action, instant) {
    const { fact, value } = factValue(action.fact, action.key, action.subKey);
    const where = action.anchor ? place(action.anchor) : null;
    const format = action.format ?? 'int';
    return overlay.metric({
      id: action.id,
      value,
      format: (v, final) => formatValue(final ? value : v, format),
      label: text(action.label ?? ''),
      tag: tagFor(fact, action.tag),
      lon: where?.lon ?? null,
      lat: where?.lat ?? null,
      screen: action.screen ?? null,
      durationMs: action.duration ?? 1600,
      instant,
      size: action.size,
      dx: action.dx,
      dy: action.dy,
    });
  }

  /* ------------------------------------------------------------ charts */

  function enterChart(action, instant) {
    let chart;
    if (action.chart === 'composition') {
      const counts = book.value('damage.counts');
      const shares = book.value('damage.shares');
      const fact = book.get('damage.counts');
      chart = createCompositionChart({
        clock,
        title: 'OBSERVED DAMAGE BY CLASS',
        tag: overlay.evidenceTag(tagFor(fact)),
        classes: [
          'Destroyed',
          'Severe Damage',
          'Moderate Damage',
          'Possible Damage',
        ],
        counts,
        shares,
        total: book.value('damage.total'),
        colours: DAMAGE_COLOURS,
      });
    } else if (action.chart === 'intensity') {
      const fact = book.get('damage.byIntensity');
      chart = createIntensityChart({
        clock,
        title: 'DAMAGE CLASS MIX BY MODELLED INTENSITY',
        tag: overlay.evidenceTag(tagFor(fact)),
        bands: fact.value,
        classes: [
          'Destroyed',
          'Severe Damage',
          'Moderate Damage',
          'Possible Damage',
        ],
        colours: DAMAGE_COLOURS,
      });
    } else if (action.chart === 'mmiLegend') {
      const fact = book.get('exposure.bands');
      const levels = action.levels ?? [8, 7.5, 7, 6.5, 6];
      chart = createLegendChart({
        clock,
        title: 'MODELLED SHAKING — MERCALLI INTENSITY',
        tag: overlay.evidenceTag({ source: 'USGS SHAKEMAP', cls: 'MODELLED' }),
        rows: levels
          .map((mmi) => fact.value.find((band) => band.mmi === mmi))
          .filter(Boolean)
          .map((band) => ({
            colour: MMI_COLOURS[band.mmi],
            label: `MMI ${band.meaning.roman}`,
            sub: band.meaning.perceived.toUpperCase(),
          }))
          .concat(
            action.contours === false
              ? []
              : [
                  {
                    dashed: true,
                    label: 'BELOW MMI VI',
                    sub: 'CONTOUR LINES ONLY',
                  },
                ],
          ),
      });
    } else if (action.chart === 'legend') {
      /* A key authored with the scene; every label is a template filled from facts. */
      chart = createLegendChart({
        clock,
        title: text(action.title),
        tag: action.tag ? overlay.evidenceTag(action.tag) : null,
        rows: action.rows.map((row) => ({
          colour:
            row.category !== undefined
              ? ACCESS_CATEGORY_COLOURS[row.category]
              : (ACCESS_COLOURS[row.colour] ?? row.colour),
          glyph: row.glyph ?? null,
          dashed: row.dashed ?? false,
          label: text(row.label),
          sub: text(row.sub ?? ''),
        })),
      });
    } else throw new Error(`Unknown chart "${action.chart}".`);
    charts.set(action.id, chart);
    overlay.panel({
      id: action.id,
      node: chart.node,
      screen: action.screen ?? { x: 0.03, y: 0.62 },
      instant,
      onPlace: () => chart.update(),
    });
    return chart;
  }

  function updateChart(action, instant) {
    const chart = charts.get(action.id);
    if (!chart) return;
    const op = action.op;
    if (op === 'reveal')
      chart.reveal(action.index, { instant, ms: action.duration ?? 1200 });
    else if (op === 'revealAll') chart.revealAll({ instant });
    else if (op === 'total') chart.showTotal({ instant });
    else if (op === 'grow') chart.grow({ instant });
    else if (op === 'shares') chart.showShares({ instant });
    else if (op === 'focus') chart.focus(action.mmi ?? action.index ?? null);
    else if (op === 'foot') chart.setFoot(text(action.text));
    else throw new Error(`Unknown chart op "${op}".`);
  }

  /* ------------------------------------------------------------ dispatch */

  function after(ms, fn, instant) {
    if (instant) return;
    const id = Symbol('removal');
    pendingRemovals.add(id);
    clock.after(ms, () => {
      if (!pendingRemovals.has(id)) return;
      pendingRemovals.delete(id);
      fn();
    });
  }

  const handlers = {
    'camera.fly': (action, instant) => {
      if (instant) {
        setView(action);
        return undefined;
      }
      return new Promise((resolve) =>
        fly(action, action.duration ?? 3000, resolve),
      );
    },
    'camera.hold': () => undefined,
    veil: (action, instant) =>
      veil?.set(action.opacity ?? 0, instant ? 0 : (action.duration ?? 1500)),
    'layer.show': (action, instant) => {
      const make = layers[action.layer];
      if (!make) throw new Error(`Unknown layer "${action.layer}".`);
      make({ ...action, instant });
    },
    'layer.hide': (action, instant) =>
      overlay.remove(action.id ?? action.layer, { instant }),
    'layer.filter': (action, instant) => filterLayer(action, instant),
    'layer.animate': (action, instant) => {
      const make = layers[action.layer];
      make({ ...action, instant });
    },
    'annotation.draw': (action, instant) => {
      drawAnnotation(action, instant);
      if (action.holdMs)
        after(action.holdMs, () => overlay.remove(action.id), instant);
    },
    'annotation.remove': (action, instant) =>
      overlay.remove(action.id, { instant }),
    'annotation.clear': (action, instant) =>
      overlay.clear({ instant, keep: action.keep ?? [] }),
    'metric.count': (action, instant) => countMetric(action, instant),
    'chart.enter': (action, instant) => enterChart(action, instant),
    'chart.update': (action, instant) => updateChart(action, instant),
    'chart.highlight': (action) =>
      charts.get(action.id)?.highlight(action.key ?? null),
    'chart.exit': (action, instant) => {
      overlay.remove(action.id, { instant });
      charts.delete(action.id);
    },
    'caption.show': (action) => captions.show(text(action.text)),
    'caption.hide': () => captions.show(null),
    'question.show': (action, instant) => {
      if (instant) return;
      overlay.question({
        id: 'question',
        text: text(action.text),
        durationMs: action.duration ?? 2800,
      });
      after(
        (action.duration ?? 2800) + (action.holdMs ?? 1200),
        () => overlay.remove('question'),
        false,
      );
    },
    'title.type': (action, instant) =>
      drawAnnotation(
        { ...action, kind: 'typed', id: action.id ?? 'title' },
        instant,
      ),
    'timeline.seek': (action, instant) => {
      const item = overlay.get(action.layer ?? 'events');
      item?.seek(action.toHour, action.duration ?? 4000, instant);
    },
    'audio.cue': (action, instant) => {
      if (!instant) sound.cue(action.cue);
    },
    'route.trace': (action, instant) =>
      drawAnnotation({ ...action, kind: 'trace' }, instant),
  };

  return {
    place,
    get hasVoice() {
      return narrator.available;
    },
    async enterScene(scene, { instant }) {
      pendingRemovals.clear();
      overlay.clear({ instant, keep: scene.keep ?? [] });
      for (const id of [...charts.keys()])
        if (!(scene.keep ?? []).includes(id)) charts.delete(id);
      captions.show(null);
      for (const action of scene.setup ?? []) {
        if (action.id && overlay.get(action.id)) continue;
        if (
          action.layer &&
          overlay.get(action.id ?? action.layer) &&
          action.type === 'layer.show'
        )
          continue;
        await handlers[action.type]?.(action, true);
      }
    },
    run(action, { instant }) {
      const handler = handlers[action.type];
      if (!handler)
        throw new Error(`The stage has no handler for "${action.type}".`);
      const result = handler(action, instant);
      if (instant) return undefined;
      /* An action that animates resolves when its animation has run. */
      const ms = action.type === 'camera.fly' ? 0 : (action.duration ?? 0);
      return Promise.all([result, ms > 0 ? clock.wait(ms) : null]);
    },
    caption: (value) => captions.show(value ? text(value) : null),
    speak: (line, options) => narrator.speak(text(line), options),
    cancel() {
      /* A skipped flight resolves where it is; the next beat sets its own view. */
      finishFlight(false);
      narrator.cancel();
    },
    pause() {
      narrator.pause();
      sound.suspend();
      /* The clock has stopped, so the flight has too; no need to keep rendering. */
      if (flight) releaseRender(FLIGHT_HOLD);
    },
    resume() {
      narrator.resume();
      sound.resume();
      if (flight) holdRender(FLIGHT_HOLD);
    },
    /** The view the briefing last set, for QA and for handing back to explore. */
    get view() {
      return view;
    },
    destroy() {
      pendingRemovals.clear();
      charts.clear();
    },
  };
}
