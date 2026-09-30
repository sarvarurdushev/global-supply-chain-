/**
 * Charts that PERFORM: each is built empty and grows in steps the briefing
 * calls, with the map changing in the same beat.
 *
 * Every value drawn is handed in from a fact (see facts.js); nothing is
 * computed here except the width a value occupies. Animation reads the
 * briefing clock through `update()`, called every frame by the overlay, so a
 * paused briefing pauses a half-grown bar.
 */

import { ease, progress } from '../../../nepal/briefing/clock.js';

const SVG = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.append(node);
  return node;
}

function div(className, text, parent = null) {
  const node = document.createElement('div');
  node.className = className;
  if (text !== undefined) node.textContent = text;
  parent?.append(node);
  return node;
}

const group = (n) => Math.round(n).toLocaleString('en-GB');

/**
 * One segmented bar: classes revealed one at a time, each segment growing to
 * its share while its count counts. `highlight(key)` dims the others.
 */
export function createCompositionChart({
  clock,
  title,
  tag,
  classes,
  counts,
  shares,
  colours,
  total,
  widthPx = 520,
}) {
  const node = div('brf-chart brf-chart--composition');
  const head = div('brf-chart__head', null, node);
  div('brf-chart__title', title, head);
  if (tag) head.append(tag);
  const plot = svg(
    'svg',
    {
      width: widthPx,
      height: 44,
      viewBox: `0 0 ${widthPx} 44`,
      class: 'brf-chart__svg',
    },
    node,
  );
  const rows = div('brf-chart__rows', null, node);
  const totalRow = div('brf-chart__total', null, node);

  const segments = classes.map((key) => {
    const rect = svg(
      'rect',
      { x: 0, y: 6, height: 32, width: 0, rx: 2, fill: colours[key] },
      plot,
    );
    const row = div('brf-chart__row', null, rows);
    const swatch = div('brf-chart__swatch', null, row);
    swatch.style.background = colours[key];
    div('brf-chart__key', key.toUpperCase(), row);
    const count = div('brf-chart__count', '', row);
    const share = div('brf-chart__share', '', row);
    row.style.opacity = '0';
    return { key, rect, row, count, share, at: null, ms: 1200 };
  });
  let highlighted = null;
  let totalAt = null;

  return {
    node,
    reveal(k, { instant = false, ms = 1200 } = {}) {
      const s = segments[k];
      if (!s) return;
      s.ms = ms;
      s.at = instant ? clock.now() - ms - 1 : clock.now();
    },
    revealAll({ instant = false } = {}) {
      segments.forEach((_, k) => this.reveal(k, { instant }));
      totalAt = instant ? clock.now() - 1000 : clock.now();
    },
    showTotal({ instant = false } = {}) {
      totalAt = instant ? clock.now() - 1000 : clock.now();
    },
    highlight(key) {
      highlighted = key ?? null;
    },
    update() {
      let x = 0;
      for (const s of segments) {
        const t = s.at === null ? 0 : ease.out(progress(clock, s.at, s.ms));
        const full = (shares[s.key] / 100) * widthPx;
        const w = full * t;
        s.rect.setAttribute('x', String(x));
        s.rect.setAttribute('width', String(Math.max(0, w - (w > 3 ? 2 : 0))));
        const dim = highlighted && highlighted !== s.key;
        s.rect.setAttribute('opacity', dim ? '0.25' : '1');
        s.row.style.opacity = s.at === null ? '0' : dim ? '0.35' : '1';
        s.count.textContent = s.at === null ? '' : group(counts[s.key] * t);
        s.share.textContent =
          s.at === null || t < 1 ? '' : `${shares[s.key].toFixed(1)} %`;
        x += full;
      }
      const tt = totalAt === null ? 0 : progress(clock, totalAt, 800);
      totalAt === null
        ? (totalRow.textContent = '')
        : (totalRow.textContent = `${group(total * tt)} OBSERVATIONS · FOUR CLASSES`);
    },
  };
}

/**
 * One stacked bar per intensity band, each 100 % tall, split by damage class
 * — so the eye reads COMPOSITION within a band, which is the only thing the
 * damage analysis says is comparable across bands.
 */
export function createIntensityChart({
  clock,
  title,
  tag,
  bands,
  classes,
  colours,
  heightPx = 190,
  barPx = 74,
}) {
  const node = div('brf-chart brf-chart--intensity');
  const head = div('brf-chart__head', null, node);
  div('brf-chart__title', title, head);
  if (tag) head.append(tag);
  const width = bands.length * (barPx + 46) + 20;
  const body = div('brf-chart__body', undefined, node);
  const plot = svg(
    'svg',
    {
      width,
      height: heightPx + 62,
      viewBox: `0 0 ${width} ${heightPx + 62}`,
      class: 'brf-chart__svg',
    },
    body,
  );
  /* The colour key: the class order is the stack order, bottom first. */
  const key = div('brf-chart__key', undefined, body);
  for (const name of [...classes].reverse()) {
    const row = div('brf-chart__key-row', undefined, key);
    div('brf-chart__swatch', undefined, row).style.background = colours[name];
    div('brf-chart__key-label', name.toUpperCase(), row);
  }
  div('brf-chart__key-note', 'LABEL = DESTROYED SHARE', key);
  const foot = div('brf-chart__foot', '', node);

  const columns = bands.map((band, i) => {
    const x = 20 + i * (barPx + 46);
    const parts = classes.map((key) => ({
      key,
      rect: svg(
        'rect',
        { x, width: barPx, y: heightPx, height: 0, fill: colours[key] },
        plot,
      ),
    }));
    const label = svg(
      'text',
      {
        x: x + barPx / 2,
        y: heightPx + 18,
        'text-anchor': 'middle',
        class: 'brf-chart__axis',
      },
      plot,
    );
    label.textContent = `MMI ${band.mmi}`;
    /* The base each share is a share of, so a small band reads as small. */
    const base = svg(
      'text',
      {
        x: x + barPx / 2,
        y: heightPx + 34,
        'text-anchor': 'middle',
        class: 'brf-chart__axis brf-chart__axis--muted',
      },
      plot,
    );
    base.textContent = `N = ${group(band.count)}`;
    const share = svg(
      'text',
      {
        x: x + barPx / 2,
        y: 0,
        'text-anchor': 'middle',
        class: 'brf-chart__value',
      },
      plot,
    );
    const ring = svg(
      'rect',
      {
        x: x - 5,
        y: -4,
        width: barPx + 10,
        height: heightPx + 8,
        fill: 'none',
        stroke: '#e8f5ef',
        'stroke-width': 1.5,
        opacity: 0,
      },
      plot,
    );
    return { band, parts, share, ring };
  });
  let grownAt = null;
  let sharesAt = null;
  let focus = null;

  return {
    node,
    grow({ instant = false } = {}) {
      grownAt = instant ? clock.now() - 2000 : clock.now();
    },
    showShares({ instant = false } = {}) {
      sharesAt = instant ? clock.now() - 1000 : clock.now();
    },
    focus(mmi) {
      focus = mmi;
    },
    setFoot(text) {
      foot.textContent = text;
    },
    update() {
      const t = grownAt === null ? 0 : ease.out(progress(clock, grownAt, 1600));
      const st = sharesAt === null ? 0 : progress(clock, sharesAt, 700);
      for (const col of columns) {
        /* Destroyed at the bottom, so the share being compared sits on one baseline. */
        let y = heightPx;
        for (const part of col.parts) {
          const h = (col.band.composition[part.key] / 100) * heightPx * t;
          y -= h;
          part.rect.setAttribute('y', String(y));
          part.rect.setAttribute('height', String(Math.max(0, h - 1)));
        }
        const destroyed = col.band.composition.Destroyed;
        const top = heightPx - (destroyed / 100) * heightPx;
        col.share.setAttribute('y', String(top - 6));
        col.share.textContent = st > 0 ? `${destroyed.toFixed(1)} %` : '';
        col.share.setAttribute('opacity', String(st));
        col.ring.setAttribute('opacity', focus === col.band.mmi ? '1' : '0');
      }
    },
  };
}

/**
 * A legend that builds row by row: the intensity scale, introduced as the
 * bands appear. Rows are handed in from the exposure artefact's own
 * `meaning` for each band.
 */
export function createLegendChart({ clock, title, tag, rows }) {
  const node = div('brf-chart brf-chart--legend');
  const head = div('brf-chart__head', null, node);
  div('brf-chart__title', title, head);
  if (tag) head.append(tag);
  const items = rows.map((row) => {
    const line = div('brf-legend__row', null, node);
    const kind = row.glyph
      ? ' brf-chart__swatch--glyph'
      : row.dashed
        ? ' brf-chart__swatch--dashed'
        : '';
    const swatch = div(`brf-chart__swatch${kind}`, row.glyph ?? null, line);
    if (row.glyph) swatch.style.color = row.colour;
    else if (!row.dashed) swatch.style.background = row.colour;
    div('brf-legend__label', row.label, line);
    div('brf-legend__sub', row.sub, line);
    line.style.opacity = '0';
    return { line, at: null };
  });
  let focus = null;
  return {
    node,
    revealAll({ instant = false } = {}) {
      items.forEach((item, k) => {
        item.at = instant ? clock.now() - 5000 : clock.now() + k * 350;
      });
    },
    focus(index) {
      focus = index ?? null;
    },
    update() {
      items.forEach((item, k) => {
        const t = item.at === null ? 0 : progress(clock, item.at, 450);
        const dim = focus !== null && focus !== k;
        item.line.style.opacity = String(t * (dim ? 0.35 : 1));
        item.line.style.transform = `translateX(${(1 - t) * -12}px)`;
      });
    },
  };
}

/**
 * Horizontal bars that grow one after another: a distribution read off an
 * artefact list (magnitude bands, damage by area). Each bar's label and
 * figure are handed in already formatted; the bar length is the only thing
 * computed here, as a share of the largest value.
 */
export function createBarsChart({
  clock,
  title,
  tag,
  rows,
  colour = '#3cf2a0',
  widthPx = 300,
  staggerMs = 260,
}) {
  const node = div('brf-chart brf-chart--bars');
  const head = div('brf-chart__head', null, node);
  div('brf-chart__title', title, head);
  if (tag) head.append(tag);
  const max = Math.max(...rows.map((row) => row.value), 1);
  const items = rows.map((row) => {
    const line = div('brf-bars__row', null, node);
    div('brf-bars__label', row.label, line);
    const track = div('brf-bars__track', null, line);
    track.style.width = `${widthPx}px`;
    const bar = div('brf-bars__bar', null, track);
    bar.style.background = row.colour ?? colour;
    const figure = div('brf-bars__value', '', line);
    line.style.opacity = '0';
    return { row, line, bar, figure, at: null };
  });
  let focus = null;
  return {
    node,
    revealAll({ instant = false } = {}) {
      items.forEach((item, k) => {
        item.at = instant ? clock.now() - 5000 : clock.now() + k * staggerMs;
      });
    },
    focus(index) {
      focus = index ?? null;
    },
    update() {
      items.forEach((item, k) => {
        const t =
          item.at === null ? 0 : ease.out(progress(clock, item.at, 900));
        const dim = focus !== null && focus !== k;
        item.line.style.opacity = String(Math.min(1, t * 3) * (dim ? 0.35 : 1));
        item.bar.style.width = `${(item.row.value / max) * 100 * t}%`;
        item.figure.textContent = t >= 1 ? item.row.display : '';
      });
    },
  };
}

/**
 * Where each district ranks under each weighting: one row per district, a
 * dot per scheme, a line from best to worst rank. The spread IS the result —
 * a district whose dots scatter is one whose place depends on the weights.
 */
export function createRankChart({
  clock,
  title,
  tag,
  rows,
  maxRank,
  widthPx = 260,
  schemeColours,
}) {
  const node = div('brf-chart brf-chart--ranks');
  const head = div('brf-chart__head', null, node);
  div('brf-chart__title', title, head);
  if (tag) head.append(tag);
  const rowPx = 18;
  const height = rows.length * rowPx + 22;
  const plot = svg(
    'svg',
    {
      width: widthPx + 130,
      height,
      viewBox: `0 0 ${widthPx + 130} ${height}`,
      class: 'brf-chart__svg',
    },
    node,
  );
  const x = (rank) => 120 + ((rank - 1) / Math.max(1, maxRank - 1)) * widthPx;
  const axis = svg(
    'text',
    { x: 120, y: height - 4, class: 'brf-chart__axis brf-chart__axis--muted' },
    plot,
  );
  axis.textContent = 'RANK 1';
  const axisEnd = svg(
    'text',
    {
      x: 120 + widthPx,
      y: height - 4,
      'text-anchor': 'end',
      class: 'brf-chart__axis brf-chart__axis--muted',
    },
    plot,
  );
  axisEnd.textContent = `${maxRank}`;
  const items = rows.map((row, k) => {
    const y = 12 + k * rowPx;
    const label = svg(
      'text',
      { x: 0, y: y + 4, class: 'brf-chart__axis' },
      plot,
    );
    label.textContent = `${row.pareto ? '◆ ' : ''}${row.label}`;
    const span = svg(
      'line',
      {
        x1: x(row.best),
        x2: x(row.best),
        y1: y,
        y2: y,
        stroke: 'rgba(228,245,236,0.45)',
        'stroke-width': 2,
      },
      plot,
    );
    const dots = row.ranks.map((rank, s) =>
      svg('circle', { cx: x(rank), cy: y, r: 0, fill: schemeColours[s] }, plot),
    );
    return { row, label, span, dots, y };
  });
  let at = null;
  return {
    node,
    revealAll({ instant = false } = {}) {
      at = instant ? clock.now() - 5000 : clock.now();
    },
    update() {
      items.forEach((item, k) => {
        const t = at === null ? 0 : ease.out(progress(clock, at + k * 90, 700));
        item.label.setAttribute('opacity', String(t));
        item.span.setAttribute(
          'x2',
          String(x(item.row.best) + (x(item.row.worst) - x(item.row.best)) * t),
        );
        item.dots.forEach((dot) => dot.setAttribute('r', String(4 * t)));
      });
    },
  };
}
