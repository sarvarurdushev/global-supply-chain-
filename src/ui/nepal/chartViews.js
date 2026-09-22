/**
 * The charts, as inline SVG in the case's own visual language.
 *
 * NO CHART LIBRARY, AND NOT FOR PURITY. A library arrives with its own
 * typography, its own legend, its own tooltip and its own idea of what a chart
 * looks like, and the first job here is that these do NOT look like a generic
 * dashboard. The forms needed are bars, a step line, a fitted curve and four
 * tracks; the geometry for all of them is already computed, tested and pure in
 * `nepal/story/charts.js`, so what is left is turning numbers into elements.
 *
 * THE RULES THESE FOLLOW, and each one is a thing that goes wrong otherwise:
 *
 *   - Grid and axis rules are SOLID hairlines one shade off the surface. A
 *     dashed gridline reads as a threshold or a projection when it is neither.
 *   - No number on every mark. The axis, the hover layer and one or two
 *     direct labels carry it.
 *   - Text wears text tokens. A value never takes its series' colour; a small
 *     coloured mark beside it carries the identity instead.
 *   - Stacked segments are separated by a 2px gap of the surface, never by a
 *     border drawn around them.
 *   - A label goes inside a segment only when it fits with padding, and
 *     outside it otherwise.
 *   - Every chart has a hover layer, and the hit target is bigger than the
 *     mark.
 *   - The container includes the axis band, so no chart grows its own
 *     scrollbar.
 *
 * COLOUR IS THE IDENTITY'S, and it was validated rather than eyeballed: the
 * Omori pair separates at ΔE 23.0 under deuteranopia, the four clocks at 8.3,
 * and all of them clear 3:1 against the panel. See the Stage 8 report for the
 * measurements and for the one ramp they forced a change to.
 */

import {
  RESULT_CLASS_PRESENTATION,
  ResultClass,
} from '../../nepal/story/resultClass.js';
import { DAMAGE_COLOURS } from '../../nepal/story/mapModel.js';

const NS = 'http://www.w3.org/2000/svg';

/** Build an SVG element. `createElement` would make an unrendered HTML node. */
export function s(tag, attrs = {}, children = []) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'text') node.textContent = String(value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, String(value));
  }
  for (const child of [].concat(children)) if (child) node.appendChild(child);
  return node;
}

/** Plot-unit (0..100) to pixel mappers for one chart box. */
function box({ width, height, pad }) {
  const left = pad.left;
  const top = pad.top;
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  return {
    width,
    height,
    plotWidth: w,
    plotHeight: h,
    x: (u) => left + (u / 100) * w,
    y: (u) => top + h - (u / 100) * h,
    left,
    top,
    right: left + w,
    bottom: top + h,
  };
}

/** A hairline rule. Solid, always. */
function rule(x1, y1, x2, y2, opacity = 1) {
  return s('line', {
    x1,
    y1,
    x2,
    y2,
    stroke: 'var(--gx-line)',
    'stroke-width': 1,
    opacity,
    'shape-rendering': 'crispEdges',
  });
}

function axisLabel(x, y, text, { anchor = 'middle', dim = true } = {}) {
  return s('text', {
    x,
    y,
    text,
    'text-anchor': anchor,
    fill: dim ? 'var(--gx-text-faint)' : 'var(--gx-text-dim)',
    'font-family': 'var(--font-mono)',
    'font-size': 9,
  });
}

/**
 * The legend. Present whenever a chart carries two or more series.
 *
 * It is HTML rather than SVG so the chips are the same ones the panel uses
 * everywhere else — a legend that invents its own swatch style is the first
 * step towards a chart that belongs to a library instead of to this product.
 */
function legend(series) {
  const wrap = document.createElement('div');
  wrap.className = 'ndi-chart__legend';
  for (const entry of series) {
    const item = document.createElement('span');
    item.className = 'ndi-chart__legend-item';
    const swatch = document.createElement('span');
    swatch.className = `ndi-chart__swatch${entry.dashed ? ' is-dashed' : ''}`;
    swatch.style.background = entry.colour;
    const label = document.createElement('span');
    label.textContent = entry.label;
    const klass = document.createElement('span');
    klass.className = 'ndi-chart__legend-class';
    klass.textContent =
      RESULT_CLASS_PRESENTATION[entry.resultClass]?.label ?? '';
    item.append(swatch, label, klass);
    wrap.append(item);
  }
  return wrap;
}

/** A chart frame: title, optional legend, the SVG, and a caption. */
function frame({ title, note, svgNode, series = null, caption = null }) {
  const figure = document.createElement('figure');
  figure.className = 'ndi-chart';
  const head = document.createElement('figcaption');
  head.className = 'ndi-chart__head';
  const name = document.createElement('span');
  name.className = 'ndi-chart__title';
  name.textContent = title;
  head.append(name);
  if (note) {
    const sub = document.createElement('span');
    sub.className = 'ndi-chart__note';
    sub.textContent = note;
    head.append(sub);
  }
  figure.append(head);
  if (series?.length >= 2) figure.append(legend(series));
  figure.append(svgNode);
  if (caption) {
    const foot = document.createElement('p');
    foot.className = 'ndi-chart__caption';
    foot.textContent = caption;
    figure.append(foot);
  }
  return figure;
}

/**
 * The hover layer.
 *
 * One invisible rect per mark, always at least 10px wide, so a 2px bar is
 * still catchable. The readout is a sibling element rather than a floating
 * tooltip: at presentation distance a tooltip that follows the pointer is
 * unreadable, and a fixed readout line can be seen from the back of a room.
 */
function hoverable(node, readout, text) {
  node.addEventListener('mouseenter', () => {
    readout.textContent = text;
  });
  node.addEventListener('focus', () => {
    readout.textContent = text;
  });
  return node;
}

function readoutLine(initial) {
  const line = document.createElement('p');
  line.className = 'ndi-chart__readout';
  line.textContent = initial;
  return line;
}

/* ------------------------------------------------------------------ *
 * Scene 03 — the sequence
 * ------------------------------------------------------------------ */

const SIZE = { width: 344, height: 132 };

/**
 * Daily counts on a log axis, with the two anchors that shape the sequence.
 *
 * `onRange` is the cross-filter: clicking an anchor or a bar sets the map's
 * time cutoff, so the chart drives the globe rather than sitting beside it.
 */
export function sequenceChart(
  model,
  { onCutoff = null, eventTime = null } = {},
) {
  if (!model) return null;
  const b = box({ ...SIZE, pad: { left: 26, right: 10, top: 14, bottom: 20 } });
  const readout = readoutLine(
    `${model.total} events · peak ${model.peak} in one day`,
  );
  const parts = [];

  for (const tick of model.yTicks) {
    parts.push(rule(b.left, b.y(tick.y), b.right, b.y(tick.y), 0.55));
    parts.push(
      axisLabel(b.left - 6, b.y(tick.y) + 3, tick.count, { anchor: 'end' }),
    );
  }
  parts.push(rule(b.left, b.bottom, b.right, b.bottom));
  for (const tick of model.ticks) {
    parts.push(axisLabel(b.x(tick.x), b.bottom + 12, `${tick.day}d`));
  }

  /* The anchors first, so bars sit over their rules rather than under them. */
  for (const anchor of model.anchors) {
    parts.push(
      s('line', {
        x1: b.x(anchor.x),
        y1: b.top - 2,
        x2: b.x(anchor.x),
        y2: b.bottom,
        stroke: anchor.id === 'main' ? 'var(--gx-neon)' : 'var(--gx-amber)',
        'stroke-width': 1.5,
        opacity: 0.55,
      }),
    );
    parts.push(
      s('text', {
        x: b.x(anchor.x) + 4,
        y: b.top + 7,
        text: anchor.label,
        fill: 'var(--gx-text-dim)',
        'font-family': 'var(--font-mono)',
        'font-size': 9,
      }),
    );
  }

  const barWidth = Math.max(
    1.5,
    b.plotWidth / Math.max(1, model.lastDay) - 0.6,
  );
  for (const bar of model.bars) {
    const height = Math.max(1, (bar.height / 100) * b.plotHeight);
    parts.push(
      s('rect', {
        x: b.x(bar.x) - barWidth / 2,
        y: b.bottom - height,
        width: barWidth,
        height,
        fill: 'var(--gx-green)',
        rx: Math.min(1.5, barWidth / 2),
      }),
    );
    /* A hit target wider than the mark, so a 2px bar is still catchable. */
    const hit = s('rect', {
      x: b.x(bar.x) - 5,
      y: b.top,
      width: 10,
      height: b.plotHeight,
      fill: 'transparent',
      tabindex: onCutoff ? 0 : null,
      role: onCutoff ? 'button' : null,
      'aria-label': `Day ${bar.day}, ${bar.count} events`,
      style: onCutoff ? 'cursor:pointer' : null,
    });
    hoverable(
      hit,
      readout,
      `Day ${bar.day} · ${bar.count} event${bar.count === 1 ? '' : 's'}`,
    );
    if (onCutoff && eventTime) {
      const at = new Date(
        Date.parse(eventTime) + bar.day * 86_400_000,
      ).toISOString();
      hit.addEventListener('click', () => onCutoff(at));
      hit.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') onCutoff(at);
      });
    }
    parts.push(hit);
  }

  const svgNode = s(
    'svg',
    {
      viewBox: `0 0 ${SIZE.width} ${SIZE.height}`,
      class: 'ndi-chart__svg',
      role: 'img',
      'aria-label': `Daily earthquake counts over ${model.lastDay} days`,
    },
    parts,
  );

  const figure = frame({
    title: 'Events per day',
    note: 'log scale',
    svgNode,
    caption: model.windowed
      ? `First ${model.lastDay} days. ${model.beyondWindow} later events are outside this window, through day ${model.fullSpan}.`
      : `All ${model.fullSpan} days of the catalogue.`,
  });
  figure.append(readout);
  return figure;
}

/** A banded distribution. One hue; the highlighted band is the finding. */
export function bandChart(
  model,
  { title, note = null, caption = null, unit = '' },
) {
  if (!model) return null;
  const b = box({ ...SIZE, pad: { left: 26, right: 10, top: 10, bottom: 30 } });
  const readout = readoutLine(`${model.total.toLocaleString('en-GB')} total`);
  const parts = [rule(b.left, b.bottom, b.right, b.bottom)];

  const slot = b.plotWidth / model.bars.length;
  const width = slot * 0.62;
  for (const bar of model.bars) {
    const x = b.left + slot * (bar.index + 0.5);
    const height = Math.max(1, (bar.height / 100) * b.plotHeight);
    parts.push(
      s('rect', {
        x: x - width / 2,
        y: b.bottom - height,
        width,
        height,
        /*
         * ONE HUE FOR EVERY BAR. Colouring each bar darker-where-bigger would
         * double-encode the length as hue and spend the only free channel on
         * information the bar already carries. The highlight is the exception,
         * and it means something: this band is the data-quality finding.
         */
        fill: bar.highlighted ? 'var(--gx-amber)' : 'var(--gx-emerald)',
        rx: 2,
      }),
    );
    parts.push(axisLabel(x, b.bottom + 12, bar.label));
    /* Direct-label selectively: the extremes and the highlighted band only. */
    if (bar.highlighted || bar.count === model.peak) {
      parts.push(
        s('text', {
          x,
          y: b.bottom - height - 4,
          text: bar.count.toLocaleString('en-GB'),
          'text-anchor': 'middle',
          fill: 'var(--gx-text)',
          'font-family': 'var(--font-mono)',
          'font-size': 10,
        }),
      );
    }
    const hit = s('rect', {
      x: b.left + slot * bar.index,
      y: b.top,
      width: slot,
      height: b.plotHeight,
      fill: 'transparent',
      tabindex: 0,
      'aria-label': `${bar.label}: ${bar.count} ${unit}`.trim(),
    });
    hoverable(
      hit,
      readout,
      `${bar.label} · ${bar.count.toLocaleString('en-GB')} ${unit} (${bar.share.toFixed(1)}%)`.trim(),
    );
    parts.push(hit);
  }

  const figure = frame({
    title,
    note,
    svgNode: s(
      'svg',
      {
        viewBox: `0 0 ${SIZE.width} ${SIZE.height}`,
        class: 'ndi-chart__svg',
        role: 'img',
        'aria-label': title,
      },
      parts,
    ),
    caption,
  });
  figure.append(readout);
  return figure;
}

/**
 * Observed counts against the fitted Omori curve.
 *
 * The two series are the point of the chart, so both are named in the legend
 * WITH their result class, and the fitted one is dashed as well as violet —
 * identity is never carried by colour alone.
 */
export function omoriChart(model) {
  if (!model) return null;
  const b = box({ ...SIZE, pad: { left: 26, right: 10, top: 14, bottom: 20 } });
  const readout = readoutLine(
    `p = ${model.pValue} · R² = ${model.rSquared.toFixed(2)} · ${model.daysFitted} days fitted`,
  );
  const parts = [];

  for (const tick of model.yTicks) {
    parts.push(rule(b.left, b.y(tick.y), b.right, b.y(tick.y), 0.55));
    parts.push(
      axisLabel(b.left - 6, b.y(tick.y) + 3, tick.count, { anchor: 'end' }),
    );
  }
  parts.push(rule(b.left, b.bottom, b.right, b.bottom));
  for (const tick of model.ticks) {
    parts.push(axisLabel(b.x(tick.x), b.bottom + 12, `${tick.day}d`));
  }

  const barWidth = Math.max(2, b.plotWidth / Math.max(1, model.lastDay) - 1.5);
  for (const point of model.observed.points) {
    const height = Math.max(1, (point.y / 100) * b.plotHeight);
    parts.push(
      s('rect', {
        x: b.x(point.x) - barWidth / 2,
        y: b.bottom - height,
        width: barWidth,
        height,
        fill: 'var(--gx-green)',
        rx: 1.5,
      }),
    );
    const hit = s('rect', {
      x: b.x(point.x) - 5,
      y: b.top,
      width: 10,
      height: b.plotHeight,
      fill: 'transparent',
      tabindex: 0,
      'aria-label': `Day ${point.day}, ${point.count} observed`,
    });
    hoverable(hit, readout, `Day ${point.day} · ${point.count} observed`);
    parts.push(hit);
  }

  const d = model.fitted.points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'}${b.x(point.x).toFixed(2)},${b.y(point.y).toFixed(2)}`,
    )
    .join(' ');
  parts.push(
    s('path', {
      d,
      fill: 'none',
      stroke: 'var(--gx-violet)',
      'stroke-width': 2,
      'stroke-dasharray': '5 3',
      'stroke-linecap': 'round',
    }),
  );

  const figure = frame({
    title: 'Aftershock decay',
    note: `${model.segment === 'whole' ? 'whole window' : model.segment === 'beforeSecondary' ? 'before 12 May' : 'after 12 May'}`,
    svgNode: s(
      'svg',
      {
        viewBox: `0 0 ${SIZE.width} ${SIZE.height}`,
        class: 'ndi-chart__svg',
        role: 'img',
        'aria-label': 'Observed aftershocks against the fitted Omori curve',
      },
      parts,
    ),
    series: [
      {
        label: 'Observed',
        colour: 'var(--gx-green)',
        resultClass: ResultClass.OBSERVED,
      },
      {
        label: 'Omori fit',
        colour: 'var(--gx-violet)',
        resultClass: ResultClass.MODEL_FIT,
        dashed: true,
      },
    ],
    caption: model.fitted.exceedsPlot
      ? 'The fitted curve leaves the top of the plot at t=0: the model predicts a rate no day recorded. The plot keeps the observed scale rather than rescaling to the model.'
      : null,
  });
  figure.append(readout);
  return figure;
}

/**
 * The three fits, compared.
 *
 * THE FINDING IS THE SHAPE, not the numbers: the whole-window fit is visibly
 * worse than the segment before 12 May, which is the evidence for splitting
 * the sequence at all. So R² is a bar and not only a figure.
 */
export function omoriQualityChart(rows) {
  if (!rows?.length) return null;
  const wrap = document.createElement('div');
  wrap.className = 'ndi-chart__quality';
  for (const row of rows) {
    const line = document.createElement('div');
    line.className = `ndi-chart__quality-row${row.id === 'beforeSecondary' ? ' is-best' : ''}`;
    const label = document.createElement('span');
    label.className = 'ndi-chart__quality-label';
    label.textContent = row.label;
    const track = document.createElement('span');
    track.className = 'ndi-chart__quality-track';
    const fill = document.createElement('span');
    fill.className = 'ndi-chart__quality-fill';
    fill.style.width = `${row.quality.toFixed(1)}%`;
    track.append(fill);
    const value = document.createElement('span');
    value.className = 'ndi-chart__quality-value';
    value.textContent = `R² ${row.rSquared.toFixed(2)} · p ${row.pValue}`;
    line.append(label, track, value);
    line.title = `${row.daysFitted} days fitted`;
    wrap.append(line);
  }
  return frame({
    title: 'Fit quality',
    note: 'higher R² is a better fit',
    svgNode: wrap,
    caption:
      'A single fit across a sequence with two large events applies a one-main-shock model to a two-main-shock sequence. The segmented fits are the defensible numbers.',
  });
}

/* ------------------------------------------------------------------ *
 * Scene 08 — composition
 * ------------------------------------------------------------------ */

/*
 * THE MAP'S OWN RAMP, not a copy of it. A chart legend that drifts from the
 * map it sits beside is worse than no legend: the reader learns one mapping
 * and then reads the other one.
 */
const DAMAGE_FILL = DAMAGE_COLOURS;

/**
 * The four classes as one bar.
 *
 * `onClass` is the cross-filter: clicking a segment filters the damage points
 * on the map to that class, and clicking the active one clears it.
 */
export function compositionChart(
  model,
  { onClass = null, active = null } = {},
) {
  if (!model) return null;
  const width = 344;
  const height = 34;
  const readout = readoutLine(
    `${model.total.toLocaleString('en-GB')} observations across four classes`,
  );
  const parts = [];
  const GAP = 2;

  for (const segment of model.segments) {
    const x = (segment.offset / 100) * width;
    const w = Math.max(1, (segment.width / 100) * width - GAP);
    const dim = active !== null && active !== segment.label;
    parts.push(
      s('rect', {
        x,
        y: 0,
        width: w,
        height,
        fill: DAMAGE_FILL[segment.label] ?? 'var(--gx-emerald)',
        opacity: dim ? 0.32 : 1,
        rx: 2,
      }),
    );
    /* Inside only when it fits; the tail classes go to the legend below. */
    if (segment.labelFits) {
      parts.push(
        s('text', {
          x: x + 7,
          y: height / 2 + 4,
          text: segment.count.toLocaleString('en-GB'),
          fill: '#04070a',
          'font-family': 'var(--font-mono)',
          'font-size': 11,
          'font-weight': 600,
        }),
      );
    }
    const hit = s('rect', {
      x,
      y: 0,
      width: Math.max(10, w),
      height,
      fill: 'transparent',
      tabindex: onClass ? 0 : null,
      role: onClass ? 'button' : null,
      'aria-pressed': onClass ? String(active === segment.label) : null,
      'aria-label': `${segment.label}: ${segment.count} observations, ${segment.share.toFixed(1)} percent`,
      style: onClass ? 'cursor:pointer' : null,
    });
    hoverable(
      hit,
      readout,
      `${segment.label} · ${segment.count.toLocaleString('en-GB')} (${segment.share.toFixed(1)}%)`,
    );
    if (onClass) {
      const pick = () =>
        onClass(active === segment.label ? null : segment.label);
      hit.addEventListener('click', pick);
      hit.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') pick();
      });
    }
    parts.push(hit);
  }

  const figure = frame({
    title: 'Damage class composition',
    note: onClass ? 'click to filter the map' : null,
    svgNode: s(
      'svg',
      {
        viewBox: `0 0 ${width} ${height}`,
        class: 'ndi-chart__svg is-bar',
        role: 'img',
        'aria-label': 'Damage class composition',
      },
      parts,
    ),
    /*
     * THE COUNT IS IN THE LEGEND, NOT ONLY IN THE BAR. A 2.1% segment is far
     * too narrow to hold "95" with padding, so without this the smallest
     * class — the one a reader is most likely to ask about — had its number
     * nowhere on screen at all. The skill's rule is that a label which does
     * not fit moves to the legend or the tooltip; it does not evaporate.
     */
    series: model.segments.map((segment) => ({
      label: `${segment.label} ${segment.count.toLocaleString('en-GB')} · ${segment.share.toFixed(1)}%`,
      colour: DAMAGE_FILL[segment.label],
      resultClass: ResultClass.OBSERVED,
    })),
    caption: model.mismatch,
  });
  figure.append(readout);
  return figure;
}

/** Districts, by what was surveyed — never presented as a national ranking. */
export function districtChart(
  model,
  { onDistrict = null, active = null } = {},
) {
  if (!model) return null;
  const rowHeight = 17;
  const width = 344;
  const height = model.bars.length * rowHeight;
  const labelWidth = 104;
  const readout = readoutLine(
    `${model.surveyed} of ${model.districtsInCountry} districts carry any observation`,
  );
  const parts = [];

  model.bars.forEach((bar, index) => {
    const y = index * rowHeight;
    const w = Math.max(2, (bar.width / 100) * (width - labelWidth - 46));
    const dim = active !== null && active !== bar.label;
    parts.push(
      s('text', {
        x: labelWidth - 8,
        y: y + 12,
        text: bar.label,
        'text-anchor': 'end',
        fill: dim ? 'var(--gx-text-faint)' : 'var(--gx-text-dim)',
        'font-family': 'var(--font-sans)',
        'font-size': 11,
      }),
    );
    parts.push(
      s('rect', {
        x: labelWidth,
        y: y + 3,
        width: w,
        height: rowHeight - 7,
        fill: 'var(--gx-emerald)',
        opacity: dim ? 0.35 : 1,
        rx: 2,
      }),
    );
    parts.push(
      s('text', {
        x: labelWidth + w + 6,
        y: y + 12,
        text: bar.count.toLocaleString('en-GB'),
        fill: 'var(--gx-text)',
        'font-family': 'var(--font-mono)',
        'font-size': 10,
      }),
    );
    const hit = s('rect', {
      x: 0,
      y,
      width,
      height: rowHeight,
      fill: 'transparent',
      tabindex: onDistrict ? 0 : null,
      role: onDistrict ? 'button' : null,
      'aria-label': `${bar.label}: ${bar.count} observations`,
      style: onDistrict ? 'cursor:pointer' : null,
    });
    hoverable(
      hit,
      readout,
      `${bar.label} · ${bar.count.toLocaleString('en-GB')} observations`,
    );
    if (onDistrict) {
      const pick = () => onDistrict(active === bar.label ? null : bar.label);
      hit.addEventListener('click', pick);
      hit.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') pick();
      });
    }
    parts.push(hit);
  });

  const figure = frame({
    title: 'Observations by district',
    note: 'surveyed districts only',
    svgNode: s(
      'svg',
      {
        viewBox: `0 0 ${width} ${height}`,
        class: 'ndi-chart__svg',
        role: 'img',
        'aria-label': 'Observations by district',
      },
      parts,
    ),
    caption: `This ranks what was SURVEYED. ${model.surveyed} of ${model.districtsInCountry} districts carry any UNOSAT observation, so a district's absence here is a gap in coverage and not a finding about the ground.`,
  });
  figure.append(readout);
  return figure;
}

/* ------------------------------------------------------------------ *
 * Scene 16 — four clocks
 * ------------------------------------------------------------------ */

const CLOCK_COLOUR = Object.freeze({
  EARTHQUAKE: 'var(--gx-red)',
  ACQUISITION: 'var(--gx-cyan)',
  PRODUCTION: 'var(--gx-green)',
  PUBLICATION: 'var(--gx-amber)',
});

/**
 * Four tracks on ONE time axis.
 *
 * Offsetting the tracks would destroy the comparison that is the whole point:
 * the earthquake is one instant on day 0, and everything that lets anybody
 * study it arrives over the following days. The distance between the top track
 * and the bottom one IS the finding.
 */
export function clockChart(model, { onClock = null, active = null } = {}) {
  if (!model) return null;
  const width = 344;
  const trackHeight = 30;
  const labelWidth = 96;
  const height = model.tracks.length * trackHeight + 18;
  const plotLeft = labelWidth;
  const plotWidth = width - labelWidth - 12;
  const at = (x) => plotLeft + (x / 100) * plotWidth;
  const readout = readoutLine(
    'The earthquake is one instant. Everything we know about it arrived later.',
  );
  const parts = [];

  for (const tick of model.ticks) {
    parts.push(
      rule(at(tick.x), 2, at(tick.x), model.tracks.length * trackHeight, 0.5),
    );
    parts.push(
      axisLabel(
        at(tick.x),
        model.tracks.length * trackHeight + 13,
        `day ${tick.day}`,
      ),
    );
  }

  model.tracks.forEach((track, index) => {
    const y = index * trackHeight + trackHeight / 2;
    const colour = CLOCK_COLOUR[track.id] ?? 'var(--gx-emerald)';
    const dim = active !== null && active !== track.id;

    /* Direct-labelled, always: four series means labels are not optional. */
    parts.push(
      s('text', {
        x: labelWidth - 10,
        y: y + 4,
        text: track.label,
        'text-anchor': 'end',
        fill: dim ? 'var(--gx-text-faint)' : 'var(--gx-text)',
        'font-family': 'var(--font-sans)',
        'font-size': 11,
      }),
    );
    parts.push(rule(plotLeft, y, plotLeft + plotWidth, y, 0.4));
    if (track.span && track.span.to > track.span.from) {
      parts.push(
        s('rect', {
          x: at(track.span.from),
          y: y - 3,
          width: Math.max(2, at(track.span.to) - at(track.span.from)),
          height: 6,
          fill: colour,
          opacity: dim ? 0.18 : 0.28,
          rx: 3,
        }),
      );
    }
    for (const mark of track.marks) {
      parts.push(
        s('circle', {
          cx: at(mark.x),
          cy: y,
          r: 4,
          fill: colour,
          opacity: dim ? 0.35 : 1,
          /* A 2px surface ring, because these marks overlap heavily. */
          stroke: 'var(--gx-panel)',
          'stroke-width': 2,
        }),
      );
    }
    const hit = s('rect', {
      x: 0,
      y: index * trackHeight,
      width,
      height: trackHeight,
      fill: 'transparent',
      tabindex: onClock ? 0 : null,
      role: onClock ? 'button' : null,
      'aria-label': `${track.label}: ${track.meaning}`,
      style: onClock ? 'cursor:pointer' : null,
    });
    const first = track.marks[0];
    const last = track.marks[track.marks.length - 1];
    hoverable(
      hit,
      readout,
      track.marks.length > 1
        ? `${track.label} · ${track.marks.length} products, day ${first.day.toFixed(1)} to ${last.day.toFixed(1)}`
        : `${track.label} · ${first?.source ?? ''} · day ${first?.day.toFixed(1) ?? '—'}`,
    );
    if (onClock) {
      const pick = () => onClock(active === track.id ? null : track.id);
      hit.addEventListener('click', pick);
      hit.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') pick();
      });
    }
    parts.push(hit);
  });

  const figure = frame({
    title: 'Four clocks',
    note: onClock ? 'click a track for its source' : null,
    svgNode: s(
      'svg',
      {
        viewBox: `0 0 ${width} ${height}`,
        class: 'ndi-chart__svg',
        role: 'img',
        'aria-label':
          'Four clocks: when the damage happened and when each dataset recorded it',
      },
      parts,
    ),
    series: model.tracks.map((track) => ({
      label: track.label,
      colour: CLOCK_COLOUR[track.id],
      resultClass: track.resultClass,
    })),
    caption:
      'Every track dates the SAME damage. The gap between the first and the last is how long it took for the evidence to exist.',
  });
  figure.append(readout);
  return figure;
}

export { DAMAGE_FILL, CLOCK_COLOUR };
