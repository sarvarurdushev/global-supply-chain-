/**
 * Seismic analysis of the 2015 Gorkha sequence.
 *
 * Pure functions over the validated event list from
 * `data/processed/nepal-2015-seismic.json`. Nothing here fetches, and nothing
 * here writes: the pipeline does both, so every statistic below is testable
 * against a fixture.
 *
 * Two of these are standard seismology rather than descriptive statistics —
 * the Gutenberg-Richter b-value and the Omori decay exponent — and both are
 * reported with the caveat that actually governs them: a catalogue is
 * incomplete below some magnitude, and fitting through that incompleteness
 * produces a confident wrong answer. The completeness magnitude is therefore
 * estimated first and the fits are restricted to events above it.
 */

/** Magnitude bands used throughout, matching the brief's M4-5 / M5-6 / M6-7 / M7+. */
export const MAGNITUDE_BANDS = Object.freeze([
  { label: 'M2.5-4', min: 2.5, max: 4 },
  { label: 'M4-5', min: 4, max: 5 },
  { label: 'M5-6', min: 5, max: 6 },
  { label: 'M6-7', min: 6, max: 7 },
  { label: 'M7+', min: 7, max: Infinity },
]);

/**
 * Depth bands. The boundaries are the seismological convention, not round
 * numbers: shallow crustal events are conventionally those above 70 km, and
 * the Main Himalayan Thrust ruptures in the top ~25 km.
 */
export const DEPTH_BANDS = Object.freeze([
  { label: '0-10 km', min: 0, max: 10 },
  { label: '10-20 km', min: 10, max: 20 },
  { label: '20-35 km', min: 20, max: 35 },
  { label: '35-70 km', min: 35, max: 70 },
  { label: '70 km+', min: 70, max: Infinity },
]);

function band(bands, value) {
  if (!Number.isFinite(value)) return null;
  return bands.find((b) => value >= b.min && value < b.max) ?? null;
}

/** Count events per magnitude band, plus the summary statistics. */
export function magnitudeDistribution(events) {
  const counts = new Map(MAGNITUDE_BANDS.map((b) => [b.label, 0]));
  const magnitudes = [];
  for (const event of events) {
    const hit = band(MAGNITUDE_BANDS, event.magnitude);
    if (hit) counts.set(hit.label, counts.get(hit.label) + 1);
    magnitudes.push(event.magnitude);
  }
  magnitudes.sort((a, b) => a - b);
  return Object.freeze({
    bands: Object.freeze(
      MAGNITUDE_BANDS.map((b) =>
        Object.freeze({ ...b, count: counts.get(b.label) }),
      ),
    ),
    total: events.length,
    min: magnitudes[0] ?? null,
    max: magnitudes[magnitudes.length - 1] ?? null,
    median: median(magnitudes),
    mean: magnitudes.length
      ? Number(
          (magnitudes.reduce((s, m) => s + m, 0) / magnitudes.length).toFixed(
            3,
          ),
        )
      : null,
  });
}

/**
 * Count events per depth band.
 *
 * Events with no depth are counted separately and never treated as 0 km — a
 * missing depth at the surface would put an earthquake in the wrong band and
 * flatten the distribution toward shallow.
 */
export function depthDistribution(events) {
  const counts = new Map(DEPTH_BANDS.map((b) => [b.label, 0]));
  const depths = [];
  let missing = 0;
  for (const event of events) {
    if (!Number.isFinite(event.depthKm)) {
      missing += 1;
      continue;
    }
    const hit = band(DEPTH_BANDS, event.depthKm);
    if (hit) counts.set(hit.label, counts.get(hit.label) + 1);
    depths.push(event.depthKm);
  }
  depths.sort((a, b) => a - b);
  return Object.freeze({
    bands: Object.freeze(
      DEPTH_BANDS.map((b) =>
        Object.freeze({ ...b, count: counts.get(b.label) }),
      ),
    ),
    withDepth: depths.length,
    missingDepth: missing,
    min: depths[0] ?? null,
    max: depths[depths.length - 1] ?? null,
    median: median(depths),
    mean: depths.length
      ? Number((depths.reduce((s, d) => s + d, 0) / depths.length).toFixed(2))
      : null,
  });
}

/**
 * Events per time bucket after the main shock, with a running total.
 *
 * Buckets are hours for the first three days and days thereafter, because an
 * aftershock sequence decays by orders of magnitude over that span and a
 * single uniform bucket width either hides the first day or produces hundreds
 * of empty ones.
 */
export function temporalSeries(events, { mainShockMs }) {
  const hourly = new Map();
  const daily = new Map();
  let beforeMainShock = 0;
  for (const event of events) {
    const hours = (event.timeMs - mainShockMs) / 3_600_000;
    if (hours < 0) {
      beforeMainShock += 1;
      continue;
    }
    if (hours < 72) {
      const bucket = Math.floor(hours);
      hourly.set(bucket, (hourly.get(bucket) ?? 0) + 1);
    }
    const day = Math.floor(hours / 24);
    daily.set(day, (daily.get(day) ?? 0) + 1);
  }
  const toSeries = (map, span) => {
    const keys = [...map.keys()].sort((a, b) => a - b);
    let cumulative = 0;
    return keys.map((key) => {
      cumulative += map.get(key);
      return { [span]: key, count: map.get(key), cumulative };
    });
  };
  return Object.freeze({
    beforeMainShock,
    firstThreeDaysHourly: Object.freeze(toSeries(hourly, 'hour')),
    daily: Object.freeze(toSeries(daily, 'day')),
    firstDayCount: [...hourly.entries()]
      .filter(([h]) => h < 24)
      .reduce((s, [, c]) => s + c, 0),
    firstWeekCount: [...daily.entries()]
      .filter(([d]) => d < 7)
      .reduce((s, [, c]) => s + c, 0),
  });
}

/**
 * Magnitude of completeness, by the maximum-curvature method.
 *
 * The magnitude at which the catalogue stops recording everything that
 * happened. Below it, counts fall not because fewer earthquakes occurred but
 * because smaller ones were missed — masked by the coda of larger events in
 * the hours after a main shock, or below the network's detection floor.
 *
 * Maximum curvature takes the mode of the non-cumulative magnitude
 * distribution: the bin holding the most events is the last one that is
 * plausibly complete. It is the standard first estimate and is known to
 * UNDER-estimate Mc for aftershock sequences, so the returned value carries
 * that warning rather than being presented as exact.
 */
export function completenessMagnitude(events, { binWidth = 0.1 } = {}) {
  if (events.length === 0) return null;
  const counts = new Map();
  for (const event of events) {
    const bin = Number(
      (Math.round(event.magnitude / binWidth) * binWidth).toFixed(2),
    );
    counts.set(bin, (counts.get(bin) ?? 0) + 1);
  }
  let best = null;
  for (const [bin, count] of counts) {
    if (
      !best ||
      count > best.count ||
      (count === best.count && bin < best.bin)
    ) {
      best = { bin, count };
    }
  }
  return Object.freeze({
    mc: best.bin,
    method:
      'maximum curvature (mode of the non-cumulative magnitude distribution)',
    binWidth,
    eventsInModalBin: best.count,
    caveat:
      'Maximum curvature is known to under-estimate the completeness magnitude for aftershock sequences, where small events are masked by the coda of larger ones. Treat it as a lower bound.',
  });
}

/**
 * Gutenberg-Richter b-value: log10 N(>=M) = a - b*M.
 *
 * Fitted by least squares on the CUMULATIVE distribution above the
 * completeness magnitude. A b near 1.0 is typical of tectonic seismicity; a
 * much lower b would suggest a catalogue dominated by large events, which for
 * a truncated aftershock catalogue usually means the fit is being run through
 * incompleteness rather than that the crust is unusual.
 *
 * Returns null when too few events survive the completeness cut to fit
 * anything, rather than returning a line through three points.
 */
export function gutenbergRichter(
  events,
  { mc = null, binWidth = 0.1, minPoints = 5 } = {},
) {
  const threshold = mc ?? completenessMagnitude(events)?.mc ?? null;
  if (threshold === null) return null;
  const above = events.filter((event) => event.magnitude >= threshold);
  if (above.length < 10) return null;

  const maxMagnitude = Math.max(...above.map((e) => e.magnitude));
  const points = [];
  for (
    let m = threshold;
    m <= maxMagnitude;
    m = Number((m + binWidth).toFixed(2))
  ) {
    const n = above.filter((event) => event.magnitude >= m).length;
    /* log10(0) is undefined; a bin with nothing in it carries no information. */
    if (n > 0)
      points.push({ magnitude: m, cumulative: n, log10: Math.log10(n) });
  }
  if (points.length < minPoints) return null;

  const { slope, intercept, r2 } = leastSquares(
    points.map((p) => [p.magnitude, p.log10]),
  );
  return Object.freeze({
    bValue: Number((-slope).toFixed(3)),
    aValue: Number(intercept.toFixed(3)),
    rSquared: Number(r2.toFixed(4)),
    completenessMagnitude: threshold,
    eventsUsed: above.length,
    pointsFitted: points.length,
    points: Object.freeze(points.map((p) => Object.freeze(p))),
    formula:
      'log10 N(>=M) = a - b*M, least squares on the cumulative distribution above Mc',
    interpretation:
      'b near 1.0 is typical of tectonic seismicity. A markedly lower b in a short aftershock catalogue usually indicates the fit is running through catalogue incompleteness rather than a real property of the crust.',
  });
}

/**
 * Modified Omori decay: n(t) = K / (t + c)^p.
 *
 * Fitted in log-log space on aftershock RATE per day, which is the form the
 * law is stated in. `c` is held at a small fixed value rather than fitted,
 * because fitting three parameters to a few dozen daily counts produces a
 * number with no meaning, and the choice is reported.
 *
 * p near 1.0 is typical. This is a fit to a rate that is itself noisy at low
 * counts, so it is reported with its R-squared and never without.
 */
export function omoriDecay(events, { mainShockMs, c = 0.1, minDays = 5 } = {}) {
  const perDay = new Map();
  for (const event of events) {
    const days = (event.timeMs - mainShockMs) / 86_400_000;
    if (days <= 0) continue;
    const bucket = Math.floor(days);
    perDay.set(bucket, (perDay.get(bucket) ?? 0) + 1);
  }
  const points = [...perDay.entries()]
    .filter(([, count]) => count > 0)
    .map(([day, count]) => ({
      day,
      count,
      /* Rate at the bucket's midpoint, in events per day. */
      x: Math.log10(day + 0.5 + c),
      y: Math.log10(count),
    }))
    .sort((a, b) => a.day - b.day);
  if (points.length < minDays) return null;

  const { slope, intercept, r2 } = leastSquares(points.map((p) => [p.x, p.y]));
  return Object.freeze({
    pValue: Number((-slope).toFixed(3)),
    kValue: Number((10 ** intercept).toFixed(3)),
    cFixedAt: c,
    rSquared: Number(r2.toFixed(4)),
    daysFitted: points.length,
    points: Object.freeze(
      points.map((p) => Object.freeze({ day: p.day, count: p.count })),
    ),
    formula:
      'n(t) = K / (t + c)^p, fitted by least squares on log10(rate) against log10(t + c)',
    interpretation:
      'p near 1.0 is typical of aftershock decay. c is held fixed rather than fitted: three free parameters against a few dozen daily counts would produce a number without meaning.',
  });
}

/** Spatial spread of the sequence relative to the main shock. */
export function spatialDistribution(events, { mainShockId }) {
  const distances = events
    .filter((event) => event.id !== mainShockId)
    .map((event) => event.distanceFromEpicentreKm)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const event of events) {
    west = Math.min(west, event.longitude);
    east = Math.max(east, event.longitude);
    south = Math.min(south, event.latitude);
    north = Math.max(north, event.latitude);
  }
  return Object.freeze({
    bbox: Object.freeze([west, south, east, north]),
    /* The rupture propagated east; the extent below reflects that. */
    extentEastWestKm: Number(
      ((east - west) * 111.32 * Math.cos((28 * Math.PI) / 180)).toFixed(1),
    ),
    extentNorthSouthKm: Number(((north - south) * 110.57).toFixed(1)),
    aftershockCount: distances.length,
    distanceFromEpicentreKm: Object.freeze({
      min: distances[0] ?? null,
      median: median(distances),
      max: distances[distances.length - 1] ?? null,
      within50km: distances.filter((d) => d <= 50).length,
      within100km: distances.filter((d) => d <= 100).length,
      within200km: distances.filter((d) => d <= 200).length,
    }),
  });
}

/** The largest events in the sequence, main shock included, by magnitude. */
export function largestEvents(events, limit = 10) {
  return Object.freeze(
    [...events]
      .sort((a, b) => b.magnitude - a.magnitude)
      .slice(0, limit)
      .map((event) =>
        Object.freeze({
          id: event.id,
          magnitude: event.magnitude,
          time: event.time,
          hoursFromMainShock: event.hoursFromMainShock,
          depthKm: event.depthKm,
          distanceFromEpicentreKm: event.distanceFromEpicentreKm,
          place: event.place,
          longitude: event.longitude,
          latitude: event.latitude,
        }),
      ),
  );
}

/** Ordinary least squares on `[x, y]` pairs, with the coefficient of determination. */
export function leastSquares(pairs) {
  const n = pairs.length;
  const meanX = pairs.reduce((s, [x]) => s + x, 0) / n;
  const meanY = pairs.reduce((s, [, y]) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const [x, y] of pairs) {
    sxy += (x - meanX) * (y - meanY);
    sxx += (x - meanX) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;
  let ssRes = 0;
  let ssTot = 0;
  for (const [x, y] of pairs) {
    ssRes += (y - (intercept + slope * x)) ** 2;
    ssTot += (y - meanY) ** 2;
  }
  return { slope, intercept, r2: ssTot === 0 ? 1 : 1 - ssRes / ssTot };
}

function median(sorted) {
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  return Number(value.toFixed(3));
}

/**
 * Omori decay fitted around the largest aftershock, not through it.
 *
 * Fitting one decay law across the whole year gives p = 0.42 with an
 * R-squared of 0.44 for this sequence — a bad fit, and the bad fit is the
 * finding rather than a nuisance. Omori's law describes decay from ONE main
 * shock. The M7.3 of 12 May, seventeen days in, restarted the sequence, so a
 * single fit is applying the wrong model and the residual says so.
 *
 * Split at that event and the first window returns p = 1.07 with an R-squared
 * of 0.72, which is what aftershock decay normally looks like.
 *
 * All three fits are returned. The whole-window one is kept precisely because
 * it is poor: it is the evidence for segmenting, and hiding it would turn a
 * reasoned decision into an unexplained one.
 */
export function omoriSegmented(
  events,
  { mainShockMs, secondaryEvent, c = 0.1 } = {},
) {
  const whole = omoriDecay(events, { mainShockMs, c });
  if (!secondaryEvent) {
    return Object.freeze({
      whole,
      beforeSecondary: null,
      afterSecondary: null,
      secondary: null,
    });
  }
  const before = events.filter((event) => event.timeMs < secondaryEvent.timeMs);
  const after = events.filter((event) => event.timeMs > secondaryEvent.timeMs);
  return Object.freeze({
    whole,
    /* Days from the main shock at which the sequence was reset. */
    secondary: Object.freeze({
      id: secondaryEvent.id,
      magnitude: secondaryEvent.magnitude,
      time: secondaryEvent.time,
      daysFromMainShock: Number(
        ((secondaryEvent.timeMs - mainShockMs) / 86_400_000).toFixed(2),
      ),
    }),
    beforeSecondary: omoriDecay(before, { mainShockMs, c, minDays: 4 }),
    /* Re-zeroed on the secondary event: it is the main shock of its own sequence. */
    afterSecondary: omoriDecay(after, {
      mainShockMs: secondaryEvent.timeMs,
      c,
      minDays: 4,
    }),
    interpretation:
      'A single Omori fit across a sequence with two large events applies a one-main-shock model to a two-main-shock sequence. The segmented fits are the defensible numbers; the whole-window fit is reported because its poor quality is the evidence for splitting.',
  });
}

/**
 * How much the b-value depends on where the completeness cut is placed.
 *
 * Maximum curvature returns Mc = 4.0 for this catalogue, which is the modal
 * bin — but the magnitude histogram has a cliff at exactly M4.0 (41 events at
 * 4.0 against 2 at 3.9), the signature of a REPORTING threshold rather than a
 * detection limit. The true completeness of a teleseismic catalogue in Nepal
 * is higher, so the b-value fitted at Mc = 4.0 is probably biased.
 *
 * Rather than choose one cut and present the result as a measurement, the
 * b-value is reported across a range of plausible cuts, and the spread is
 * reported with it. A b quoted to three decimals from a catalogue this size
 * would be false precision.
 */
export function bValueSensitivity(
  events,
  { cuts = [4.0, 4.2, 4.4, 4.5, 4.6, 4.8] } = {},
) {
  const fits = [];
  for (const mc of cuts) {
    const fit = gutenbergRichter(events, { mc });
    if (!fit) continue;
    fits.push({
      completenessMagnitude: mc,
      bValue: fit.bValue,
      rSquared: fit.rSquared,
      eventsUsed: fit.eventsUsed,
    });
  }
  if (fits.length === 0) return null;
  const values = fits.map((fit) => fit.bValue);
  return Object.freeze({
    fits: Object.freeze(fits.map((fit) => Object.freeze(fit))),
    range: Object.freeze([Math.min(...values), Math.max(...values)]),
    spread: Number((Math.max(...values) - Math.min(...values)).toFixed(3)),
    interpretation:
      'b falls monotonically as the completeness cut rises, which is what happens when a fit that included incomplete bins is progressively cleaned. The spread across plausible cuts is the honest uncertainty on b from this catalogue; a single value quoted to three decimals is not.',
  });
}

/**
 * Detect a reporting threshold: a magnitude below which the catalogue falls
 * off a cliff rather than tapering.
 *
 * Returns the magnitude where the count drops by more than `dropFactor` from
 * one bin to the one below, which is what a hard reporting cut looks like and
 * what a detection limit does not.
 */
export function reportingThreshold(
  events,
  { binWidth = 0.1, dropFactor = 5 } = {},
) {
  const counts = new Map();
  for (const event of events) {
    const bin = Number(
      (Math.round(event.magnitude / binWidth) * binWidth).toFixed(1),
    );
    counts.set(bin, (counts.get(bin) ?? 0) + 1);
  }
  const bins = [...counts.entries()].sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < bins.length; i += 1) {
    const [belowBin, belowCount] = bins[i - 1];
    const [bin, count] = bins[i];
    if (count >= belowCount * dropFactor && count >= 10) {
      return Object.freeze({
        magnitude: bin,
        countAtThreshold: count,
        countBelow: belowCount,
        ratio: Number((count / Math.max(belowCount, 1)).toFixed(1)),
        note: `Counts jump by a factor of ${(count / Math.max(belowCount, 1)).toFixed(1)} at M${bin}. A detection limit produces a taper; a jump this sharp is a reporting threshold, and the catalogue should be treated as incomplete below it regardless of what maximum curvature returns.`,
      });
    }
  }
  return null;
}
