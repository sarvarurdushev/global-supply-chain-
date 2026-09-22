/**
 * Chart geometry, as data.
 *
 * Pure: no DOM, no SVG strings, no colours-by-name. It turns an artefact into
 * scales, bars, points and ticks in a unit-free plot box, and the view renders
 * that. Same split as `mapModel.js`, for the same reason: the interesting
 * failures in a chart are the ones an axis hides — a log scale that swallows a
 * zero, a bar that leaves the plot, a bin whose label does not match its own
 * range. Those are claims, and they can be tested here.
 *
 * NO CHART LIBRARY. The forms needed are bars, a step line, a fitted curve and
 * four Gantt-like tracks. That is a few hundred lines of arithmetic against a
 * dependency that would arrive with its own typography, its own legend and its
 * own idea of what a chart looks like — precisely the generic-dashboard look
 * these scenes must not have.
 *
 * EVERY SERIES CARRIES ITS RESULT CLASS. A fitted Omori curve and the observed
 * counts it is fitted to are drawn on one axis, and the whole point of the
 * scene is that they are different kinds of thing. The class rides with the
 * series so the view cannot forget which is which.
 */

import { ResultClass } from './resultClass.js';

/** A plot box in abstract units. The view supplies real pixels. */
export const PLOT = Object.freeze({ width: 100, height: 100 });

/** Linear scale from a data domain to the plot's 0..100. */
export function scaleLinear([min, max], [lo, hi] = [0, 100]) {
  const span = max - min;
  return (value) => {
    if (!Number.isFinite(value) || span === 0) return lo;
    return lo + ((value - min) / span) * (hi - lo);
  };
}

/**
 * Log scale, for counts that run from 1 to 88 in one series.
 *
 * ZERO IS NOT PLOTTED, IT IS REPORTED. log(0) is negative infinity, and the
 * usual fix — quietly clamping zero to the axis floor — draws "no events that
 * day" as "one event that day". The zero days are returned separately so the
 * view can mark them as gaps rather than as data.
 */
export function scaleLog([min, max], [lo, hi] = [0, 100]) {
  const lmin = Math.log10(Math.max(1, min));
  const lmax = Math.log10(Math.max(10, max));
  const span = lmax - lmin;
  return (value) => {
    if (!(value > 0) || span === 0) return lo;
    return lo + ((Math.log10(value) - lmin) / span) * (hi - lo);
  };
}

/** Round, human tick values across a domain. */
export function niceTicks([min, max], count = 4) {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ??
    magnitude * 10;
  const out = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) {
    out.push(Number(t.toFixed(6)));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Scene 03 — the seismic sequence
 * ------------------------------------------------------------------ */

/**
 * Daily event counts, with the two anchors that give the sequence its shape.
 *
 * THE DAY AXIS IS NOT COMPRESSED. The artefact's `daily` series is sparse —
 * it holds only days that had an event — so plotting it index-by-index would
 * squeeze an eleven-month tail into the same width as the first fortnight and
 * invent a rhythm the earthquake did not have. Days are placed by their real
 * offset and missing days are gaps.
 */
export const SEQUENCE_WINDOW_DAYS = 60;

export function sequenceBars(seismic, { maxDay = SEQUENCE_WINDOW_DAYS } = {}) {
  const daily = seismic?.temporal?.daily ?? [];
  if (daily.length === 0) return null;
  const fullSpan = daily[daily.length - 1].day;
  /*
   * A SIXTY-DAY DEFAULT, AND THE REST IS NAMED, NOT DROPPED.
   *
   * The catalogue runs to day 356 and 85% of it falls inside the first sixty
   * days. Drawn across the full year the two anchors land at x=0 and x=5 —
   * the 25 April main shock and the 12 May M7.3 squashed into the left
   * twentieth of the plot with eleven empty months beside them, which is the
   * opposite of making the temporal structure visible. So the default window
   * is the sequence, `beyondWindow` counts what it excludes, and the control
   * opens it to the whole catalogue.
   */
  const lastDay = maxDay === null ? fullSpan : Math.min(maxDay, fullSpan);
  const beyondWindow = daily
    .filter((row) => row.day > lastDay)
    .reduce((sum, row) => sum + row.count, 0);
  const peak = daily
    .filter((row) => row.day <= lastDay)
    .reduce((top, row) => Math.max(top, row.count), 0);
  const x = scaleLinear([0, lastDay]);
  const y = scaleLog([1, peak], [0, 100]);

  const mainShock = seismic?.mainShock;
  const secondary = seismic?.omori?.secondary;
  return Object.freeze({
    kind: 'sequence',
    resultClass: ResultClass.OBSERVED,
    lastDay,
    fullSpan,
    beyondWindow,
    windowed: lastDay < fullSpan,
    peak,
    total: daily.reduce((sum, row) => sum + row.count, 0),
    bars: Object.freeze(
      daily
        .filter((row) => row.day <= lastDay && row.count > 0)
        .map((row) =>
          Object.freeze({
            day: row.day,
            count: row.count,
            x: x(row.day),
            height: y(row.count),
          }),
        ),
    ),
    /*
     * The two events the sequence is organised around. Drawn as rules across
     * the plot rather than as taller bars, because the claim is "the sequence
     * restarted here", not "this day had more events".
     */
    anchors: Object.freeze(
      [
        mainShock && {
          id: 'main',
          label: `M${mainShock.magnitude}`,
          date: mainShock.time,
          day: 0,
          x: x(0),
        },
        secondary && {
          id: 'secondary',
          label: `M${secondary.magnitude}`,
          date: secondary.time,
          day: Math.round(secondary.daysFromMainShock),
          x: x(Math.round(secondary.daysFromMainShock)),
        },
      ].filter(Boolean),
    ),
    ticks: Object.freeze(
      niceTicks([0, lastDay], 5).map((day) => ({ day, x: x(day) })),
    ),
    yTicks: Object.freeze(
      [1, 10, 100]
        .filter((n) => n <= Math.max(10, peak))
        .map((n) => ({ count: n, y: y(n) })),
    ),
  });
}

/**
 * A banded distribution — magnitude or depth — as bars.
 *
 * `highlight` marks the band a caveat is about. Scene 03's magnitude chart
 * uses it for the reporting threshold: the M4–5 band holds 270 of 316 events
 * and the band below it holds 10, and that cliff is the data-quality finding,
 * not a decoration. It is marked rather than hidden.
 */
export function bandBars(bands, { highlight = null, total = null } = {}) {
  const rows = bands ?? [];
  if (rows.length === 0) return null;
  const peak = rows.reduce((top, row) => Math.max(top, row.count), 0);
  const y = scaleLinear([0, peak], [0, 100]);
  const sum = total ?? rows.reduce((acc, row) => acc + row.count, 0);
  return Object.freeze({
    kind: 'bands',
    resultClass: ResultClass.DESCRIPTIVE_STATISTIC,
    peak,
    total: sum,
    bars: Object.freeze(
      rows.map((row, index) =>
        Object.freeze({
          index,
          label: row.label,
          count: row.count,
          share: sum > 0 ? (row.count / sum) * 100 : 0,
          height: y(row.count),
          highlighted: highlight !== null && row.label === highlight,
          min: row.min ?? null,
          max: row.max ?? null,
        }),
      ),
    ),
  });
}

/**
 * Observed daily counts against a fitted Omori curve.
 *
 * ONE AXIS. Both series are counts per day, so they share a scale — which is
 * what makes the comparison honest and is why a second y-axis would be a lie
 * here rather than a convenience.
 *
 * The fit is evaluated from the artefact's own published parameters, not
 * re-fitted: `n(t) = K / (t + c)^p`. Re-deriving K and p in the browser would
 * be a second analytical implementation of the thing Stage 3 already did.
 */
export function omoriSeries(omori, { segment = 'beforeSecondary' } = {}) {
  const fit = omori?.[segment];
  if (!fit?.points?.length) return null;
  const points = fit.points;
  const lastDay = points[points.length - 1].day;
  const peak = points.reduce((top, row) => Math.max(top, row.count), 0);
  const x = scaleLinear([0, lastDay]);
  const y = scaleLog([1, peak], [0, 100]);

  /*
   * The published curve, sampled across the fitted window.
   *
   * IT LEAVES THE TOP OF THE PLOT AND THAT IS REPORTED. At t=0 the fit gives
   * K/c^p — for the pre-12-May segment that is about 310 events a day against
   * an observed peak of 88, so the curve is clipped to the plot rather than
   * allowed to escape it, and `exceedsPlot` tells the view to show where it
   * left. Rescaling the whole chart to fit the curve's first instant would
   * flatten every observed bar to nothing, which trades the data for the
   * model — exactly backwards for a scene about telling them apart.
   */
  const curve = [];
  const steps = 60;
  let exceedsPlot = false;
  for (let i = 0; i <= steps; i += 1) {
    const day = (i / steps) * lastDay;
    const rate = fit.kValue / (day + fit.cFixedAt) ** fit.pValue;
    const plotted = y(rate);
    if (plotted > 100) exceedsPlot = true;
    curve.push(
      Object.freeze({
        day,
        rate,
        x: x(day),
        y: Math.min(100, plotted),
        clipped: plotted > 100,
      }),
    );
  }

  return Object.freeze({
    kind: 'omori',
    segment,
    daysFitted: fit.daysFitted,
    pValue: fit.pValue,
    rSquared: fit.rSquared,
    kValue: fit.kValue,
    cFixedAt: fit.cFixedAt,
    lastDay,
    peak,
    observed: Object.freeze({
      resultClass: ResultClass.OBSERVED,
      label: 'Observed',
      points: Object.freeze(
        points.map((row) =>
          Object.freeze({
            day: row.day,
            count: row.count,
            x: x(row.day),
            y: y(row.count),
          }),
        ),
      ),
      /* Days inside the window with no event. Marked, never plotted as one. */
      zeroDays: Object.freeze(
        Array.from({ length: Math.floor(lastDay) + 1 }, (_, day) => day)
          .filter((day) => !points.some((row) => row.day === day))
          .map((day) => ({ day, x: x(day) })),
      ),
    }),
    fitted: Object.freeze({
      resultClass: ResultClass.MODEL_FIT,
      label: 'Omori fit',
      exceedsPlot,
      points: Object.freeze(curve),
    }),
    ticks: Object.freeze(
      niceTicks([0, lastDay], 4).map((day) => ({ day, x: x(day) })),
    ),
    yTicks: Object.freeze(
      [1, 10, 100]
        .filter((n) => n <= Math.max(10, peak))
        .map((n) => ({ count: n, y: y(n) })),
    ),
  });
}

/** The two fits side by side — the finding Scene 03 exists to show. */
export function omoriComparison(omori) {
  if (!omori) return null;
  const rows = [
    ['whole', 'Whole window', omori.whole],
    ['beforeSecondary', 'Before 12 May', omori.beforeSecondary],
    ['afterSecondary', 'After 12 May', omori.afterSecondary],
  ].filter(([, , fit]) => fit);
  return Object.freeze(
    rows.map(([id, label, fit]) =>
      Object.freeze({
        id,
        label,
        pValue: fit.pValue,
        rSquared: fit.rSquared,
        daysFitted: fit.daysFitted,
        /* A bar for R², so "much stronger" is visible and not only stated. */
        quality: Math.max(0, Math.min(1, fit.rSquared)) * 100,
      }),
    ),
  );
}

/* ------------------------------------------------------------------ *
 * Scene 08 — observed damage composition
 * ------------------------------------------------------------------ */

/**
 * The damage classes as one part-to-whole bar.
 *
 * A STACKED BAR, NOT FOUR CARDS. Four numbers in four boxes make the reader do
 * the division; one bar shows the composition in a glance, which is what the
 * scene asks for. Ordered worst-last, following the artefact's own class order
 * rather than sorting by size — the classes have a meaning and it is not
 * "biggest first".
 */
export function damageComposition(composition, classOrder, byDistrict) {
  const shares = composition?.shares;
  if (!shares) return null;
  const order = classOrder ?? Object.keys(shares);

  /*
   * THE COUNTS ARE SUMMED, NEVER DERIVED FROM THE SHARES.
   *
   * The artefact publishes `shares` rounded to one decimal and a `total`, but
   * no per-class count. Multiplying 45.5% by 4,583 gives 2,085.3 where the
   * true count is 2,084 — a figure on screen that no source holds, arrived at
   * by arithmetic on a rounded number. The per-district breakdown carries the
   * exact counts, so they are summed from there and cross-checked against the
   * published total and the published shares. A mismatch is REPORTED, not
   * absorbed: `mismatch` is what the view must state rather than draw over.
   */
  const counts = {};
  for (const row of byDistrict ?? []) {
    for (const [name, value] of Object.entries(row.counts ?? {})) {
      counts[name] = (counts[name] ?? 0) + value;
    }
  }
  const total = order.reduce((sum, name) => sum + (counts[name] ?? 0), 0);
  const mismatch =
    composition.total !== undefined && total !== composition.total
      ? `Class counts sum to ${total}; the artefact publishes ${composition.total}.`
      : null;
  let offset = 0;
  const segments = order.map((name) => {
    const count = counts[name] ?? 0;
    const share = total > 0 ? (count / total) * 100 : 0;
    const segment = Object.freeze({
      label: name,
      count,
      share,
      offset,
      width: share,
      /* A label only fits inside a segment wider than about a tenth. */
      labelFits: share >= 11,
    });
    offset += share;
    return segment;
  });
  return Object.freeze({
    kind: 'composition',
    resultClass: ResultClass.OBSERVED,
    total,
    mismatch,
    /* Each class's published share, so the view can show both if they differ. */
    publishedShares: Object.freeze({ ...shares }),
    segments: Object.freeze(segments),
  });
}

/**
 * Damage by district, as a ranked bar.
 *
 * NOT A NATIONAL RANKING, AND IT SAYS SO. Nine of seventy-five districts carry
 * any UNOSAT observation, so this is a ranking of what was SURVEYED. The
 * `surveyed` and `total` counts ride along so the view is obliged to state
 * them, and the chart is deliberately labelled by district rather than by
 * position — no "1st, 2nd, 3rd".
 */
export function damageByDistrict(
  byDistrict,
  { districtsInCountry = 75, limit = 9 } = {},
) {
  const rows = [...(byDistrict ?? [])]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
  if (rows.length === 0) return null;
  const peak = rows[0].count;
  const y = scaleLinear([0, peak], [0, 100]);
  return Object.freeze({
    kind: 'districts',
    resultClass: ResultClass.OBSERVED,
    surveyed: byDistrict.length,
    districtsInCountry,
    peak,
    bars: Object.freeze(
      rows.map((row) =>
        Object.freeze({
          label: row.district,
          count: row.count,
          width: y(row.count),
          counts: row.counts ?? null,
        }),
      ),
    ),
  });
}

/* ------------------------------------------------------------------ *
 * Scene 16 — four clocks
 * ------------------------------------------------------------------ */

/**
 * Four temporal tracks: when it happened, and when we found out.
 *
 * THIS IS PROVENANCE, NOT A SCHEDULE. Every track is the same damage, dated by
 * a different clock, and the gap between the first track and the last is the
 * scene's whole argument. So the tracks share one time axis — offsetting them
 * would destroy the comparison that is the point.
 *
 * The axis starts at the earthquake, because every lag in the artefact is
 * measured from it and a reader should be able to read those lags straight off
 * the chart.
 */
export function clockTracks(timeline, { clocks = null } = {}) {
  const rows = timeline?.rows ?? [];
  const defs = clocks ?? timeline?.clocks ?? [];
  if (rows.length === 0 || defs.length === 0) return null;

  /* The artefact dates the event by its main shock, not by a `time` field. */
  const event = Date.parse(timeline.event?.mainShock ?? timeline.event);
  if (!Number.isFinite(event)) return null;

  const FIELD = {
    EARTHQUAKE: null,
    ACQUISITION: 'acquired',
    PRODUCTION: 'produced',
    PUBLICATION: 'published',
  };

  const days = (iso) => (Date.parse(iso) - event) / 86_400_000;
  const all = [];
  const tracks = defs.map((clock) => {
    const field = FIELD[clock.id];
    const marks = field
      ? rows
          .map((row) => ({ row, value: row[field] }))
          .filter((entry) => entry.value)
          .map((entry) => ({
            day: days(entry.value),
            date: entry.value,
            source: entry.row.product ?? null,
            /* How many observations this product dates at this instant. */
            features: entry.row.count ?? null,
          }))
      : [
          {
            day: 0,
            date: timeline.event?.mainShock ?? timeline.event,
            source: `USGS main shock M${timeline.event?.mainShockMagnitude ?? ''}`,
            features: null,
          },
        ];
    for (const mark of marks) all.push(mark.day);
    return { clock, marks };
  });

  const lastDay = Math.max(1, Math.ceil(Math.max(...all)));
  const x = scaleLinear([0, lastDay]);
  return Object.freeze({
    kind: 'clocks',
    lastDay,
    event: timeline.event?.mainShock ?? null,
    tracks: Object.freeze(
      tracks.map((track, index) =>
        Object.freeze({
          id: track.clock.id,
          index,
          label: track.clock.label,
          meaning: track.clock.meaning,
          /* The earthquake is the only observed-at-the-time clock. */
          resultClass:
            track.clock.id === 'EARTHQUAKE'
              ? ResultClass.OBSERVED
              : ResultClass.OFFICIAL,
          marks: Object.freeze(
            track.marks
              .map((mark) => Object.freeze({ ...mark, x: x(mark.day) }))
              .sort((a, b) => a.day - b.day),
          ),
          span:
            track.marks.length > 1
              ? Object.freeze({
                  from: x(Math.min(...track.marks.map((m) => m.day))),
                  to: x(Math.max(...track.marks.map((m) => m.day))),
                })
              : null,
        }),
      ),
    ),
    ticks: Object.freeze(
      niceTicks([0, lastDay], 4).map((day) => ({ day, x: x(day) })),
    ),
  });
}
