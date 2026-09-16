/**
 * Inline SVG charts for the supply-chain console.
 *
 * Written by hand rather than pulled from a charting library. The build already
 * warns on chunks above 1500 kB (docs/PROJECT_ARCHITECTURE_AUDIT.md §9) and the
 * chart vocabulary needed here is small: a value-ranked bar list, a time series
 * with a forecast band, and a before/after comparison. A library would add
 * hundreds of kilobytes to draw three shapes.
 *
 * Every chart returns an SVG element and is pure: same input, same output, no
 * listeners, no timers. Interaction is attached by the caller.
 */

const NS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}, text = null) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== null && value !== undefined)
      node.setAttribute(key, String(value));
  }
  if (text !== null) node.textContent = text;
  return node;
}

/**
 * Format a USD value compactly without losing the order of magnitude.
 * @param {number} value
 * @returns {string}
 */
export function formatUsd(value) {
  if (!Number.isFinite(value)) return 'n/a';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

/**
 * Horizontal bar chart of ranked values.
 *
 * Bars are linearly scaled here, unlike the globe arcs: in a ranked list the
 * reader is comparing adjacent bars directly, and a square-root scale would
 * misrepresent a 2:1 ratio as 1.4:1.
 *
 * @param {object} input
 * @param {Array<{label:string, value:number, accent?:string, note?:string}>} input.rows
 * @param {number} [input.width]
 * @param {number} [input.rowHeight]
 * @param {(row:object, index:number)=>void} [input.onSelect]
 * @returns {SVGElement}
 */
export function barChart({
  rows,
  width = 320,
  rowHeight = 26,
  onSelect = null,
}) {
  const height = Math.max(rowHeight, rows.length * rowHeight) + 4;
  const svg = el('svg', {
    class: 'sc-chart sc-bar-chart',
    viewBox: `0 0 ${width} ${height}`,
    width: '100%',
    height,
    role: 'img',
  });
  if (rows.length === 0) {
    svg.appendChild(
      el('text', { x: 8, y: 18, class: 'sc-chart-empty' }, 'DATA UNAVAILABLE'),
    );
    return svg;
  }

  const max = Math.max(...rows.map((r) => r.value));
  const labelWidth = Math.round(width * 0.4);
  const barArea = width - labelWidth - 62;

  rows.forEach((row, index) => {
    const y = index * rowHeight;
    const group = el('g', {
      class: 'sc-bar-row',
      tabindex: onSelect ? '0' : null,
    });
    if (row.note)
      group.appendChild(el('title', {}, `${row.label} — ${row.note}`));

    group.appendChild(
      el(
        'text',
        {
          x: 0,
          y: y + rowHeight / 2 + 4,
          class: 'sc-bar-label',
          'clip-path': `inset(0 0 0 0)`,
        },
        row.label.length > 22 ? `${row.label.slice(0, 21)}…` : row.label,
      ),
    );
    const barWidth = max > 0 ? Math.max(1, (row.value / max) * barArea) : 1;
    group.appendChild(
      el('rect', {
        x: labelWidth,
        y: y + 5,
        width: barWidth,
        height: rowHeight - 12,
        rx: 2,
        fill: row.accent ?? 'var(--sc-verified)',
        opacity: 0.85,
      }),
    );
    group.appendChild(
      el(
        'text',
        {
          x: width,
          y: y + rowHeight / 2 + 4,
          class: 'sc-bar-value',
          'text-anchor': 'end',
        },
        formatUsd(row.value),
      ),
    );
    if (onSelect) {
      group.style.cursor = 'pointer';
      group.addEventListener('click', () => onSelect(row, index));
      group.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(row, index);
        }
      });
    }
    svg.appendChild(group);
  });
  return svg;
}

/**
 * Time series with an optional forecast continuation and interval band.
 *
 * The forecast is drawn dashed and the interval shaded, so the boundary between
 * observation and model is visible without reading the legend. That separation
 * is a requirement (§23), not a style choice.
 *
 * @param {object} input
 * @param {Array<{period:number|string, value:number}>} input.observed
 * @param {Array<{period:number|string, value:number}>} [input.forecast]
 * @param {{lower:number[], upper:number[]}} [input.interval]
 * @param {number} [input.width]
 * @param {number} [input.height]
 * @returns {SVGElement}
 */
export function timeSeriesChart({
  observed,
  forecast = [],
  interval = null,
  width = 320,
  height = 150,
}) {
  const svg = el('svg', {
    class: 'sc-chart sc-series-chart',
    viewBox: `0 0 ${width} ${height}`,
    width: '100%',
    height,
    role: 'img',
  });
  if (!observed || observed.length === 0) {
    svg.appendChild(
      el('text', { x: 8, y: 20, class: 'sc-chart-empty' }, 'DATA UNAVAILABLE'),
    );
    return svg;
  }

  const pad = { left: 44, right: 8, top: 10, bottom: 20 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const all = [...observed, ...forecast];
  const values = [
    ...all.map((p) => p.value),
    ...(interval?.lower ?? []),
    ...(interval?.upper ?? []),
  ].filter(Number.isFinite);
  // Always include zero: a trade series starting the y-axis at its own minimum
  // exaggerates every wiggle into a cliff.
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const x = (i) =>
    pad.left + (all.length <= 1 ? plotW / 2 : (i / (all.length - 1)) * plotW);
  const y = (v) => pad.top + plotH - ((v - min) / span) * plotH;

  // Axis.
  svg.appendChild(
    el('line', {
      x1: pad.left,
      y1: pad.top + plotH,
      x2: width - pad.right,
      y2: pad.top + plotH,
      class: 'sc-axis',
    }),
  );
  svg.appendChild(
    el(
      'text',
      { x: 0, y: pad.top + 8, class: 'sc-axis-label' },
      formatUsd(max),
    ),
  );
  svg.appendChild(
    el(
      'text',
      { x: 0, y: pad.top + plotH, class: 'sc-axis-label' },
      formatUsd(min),
    ),
  );

  // Interval band, drawn first so the lines sit on top.
  if (interval && forecast.length > 0) {
    const start = observed.length - 1;
    const upper = [];
    const lower = [];
    // Anchor the band at the last observation so it fans out from a known point.
    upper.push(`${x(start)},${y(observed[observed.length - 1].value)}`);
    for (let i = 0; i < forecast.length; i += 1) {
      upper.push(`${x(start + 1 + i)},${y(interval.upper[i])}`);
    }
    for (let i = forecast.length - 1; i >= 0; i -= 1) {
      lower.push(`${x(start + 1 + i)},${y(interval.lower[i])}`);
    }
    lower.push(`${x(start)},${y(observed[observed.length - 1].value)}`);
    svg.appendChild(
      el('polygon', {
        points: [...upper, ...lower].join(' '),
        class: 'sc-interval-band',
      }),
    );
  }

  // Observed line.
  svg.appendChild(
    el('polyline', {
      points: observed.map((p, i) => `${x(i)},${y(p.value)}`).join(' '),
      class: 'sc-series-observed',
    }),
  );
  observed.forEach((p, i) => {
    const dot = el('circle', {
      cx: x(i),
      cy: y(p.value),
      r: 2.5,
      class: 'sc-series-dot',
    });
    dot.appendChild(el('title', {}, `${p.period}: ${formatUsd(p.value)}`));
    svg.appendChild(dot);
  });

  // Forecast line, dashed and continuous with the last observation.
  if (forecast.length > 0) {
    const start = observed.length - 1;
    const points = [`${x(start)},${y(observed[observed.length - 1].value)}`];
    forecast.forEach((p, i) =>
      points.push(`${x(start + 1 + i)},${y(p.value)}`),
    );
    svg.appendChild(
      el('polyline', { points: points.join(' '), class: 'sc-series-forecast' }),
    );
    forecast.forEach((p, i) => {
      const dot = el('circle', {
        cx: x(start + 1 + i),
        cy: y(p.value),
        r: 2.5,
        class: 'sc-series-dot sc-series-dot-forecast',
      });
      dot.appendChild(
        el('title', {}, `${p.period} (modelled): ${formatUsd(p.value)}`),
      );
      svg.appendChild(dot);
    });
  }

  // Period labels at the ends only; a crowded axis is worse than a sparse one.
  svg.appendChild(
    el(
      'text',
      { x: pad.left, y: height - 6, class: 'sc-axis-label' },
      String(observed[0].period),
    ),
  );
  svg.appendChild(
    el(
      'text',
      {
        x: width - pad.right,
        y: height - 6,
        class: 'sc-axis-label',
        'text-anchor': 'end',
      },
      String(all[all.length - 1].period),
    ),
  );
  return svg;
}

/**
 * Before/after comparison bar, for the WHAT IF panel.
 *
 * @param {object} input
 * @param {number} input.before
 * @param {number} input.after
 * @param {string} input.unit
 * @param {number} [input.width]
 * @returns {SVGElement}
 */
export function beforeAfterChart({ before, after, unit, width = 320 }) {
  const height = 62;
  const svg = el('svg', {
    class: 'sc-chart sc-ba-chart',
    viewBox: `0 0 ${width} ${height}`,
    width: '100%',
    height,
    role: 'img',
  });
  const max = Math.max(before, after) || 1;
  const barArea = width - 96;

  const draw = (label, value, y, cls) => {
    svg.appendChild(
      el('text', { x: 0, y: y + 11, class: 'sc-bar-label' }, label),
    );
    svg.appendChild(
      el('rect', {
        x: 52,
        y,
        width: Math.max(1, (value / max) * barArea),
        height: 14,
        rx: 2,
        class: cls,
      }),
    );
    svg.appendChild(
      el(
        'text',
        { x: width, y: y + 11, class: 'sc-bar-value', 'text-anchor': 'end' },
        `${Math.round(value).toLocaleString()} ${unit}`,
      ),
    );
  };
  draw('BEFORE', before, 8, 'sc-ba-before');
  draw('AFTER', after, 34, 'sc-ba-after');
  return svg;
}
