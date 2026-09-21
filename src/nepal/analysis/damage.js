/**
 * Stage 5 — observed physical damage.
 *
 * Stage 3 measured the earthquake, Stage 4 measured who lived under it. This
 * module measures what was seen to break, and the hardest thing about it is
 * not arithmetic: it is refusing three tempting joins.
 *
 * THE FIRST REFUSAL: UNOSAT GIVES NO DENOMINATOR. The 4,583 UNOSAT records are
 * damage sites. There is no "undamaged building" record, and no published
 * footprint saying which areas were examined and found intact. So UNOSAT can
 * answer "how many damaged structures were seen, and where", and it cannot
 * answer "what fraction of buildings were damaged" — that requires knowing how
 * many buildings were looked at. Every UNOSAT-derived rate in here is
 * therefore a rate per unit AREA or per unit of ANOTHER dataset, never a
 * proportion of structures, and the naming says which.
 *
 * THE SECOND REFUSAL: COPERNICUS IS A DIFFERENT PRODUCT, NOT MORE OF THE SAME.
 * Copernicus EMSR125 grades every structure it examines inside a published
 * area of interest, including "Not Affected" — which means it DOES have a
 * denominator, and is the only source here that supports a damage rate. Its
 * vocabulary is its own ("Completely Destroyed", "Negligible to slight
 * damage"), it has no middle grades at all in this activation, and mapping it
 * onto UNOSAT's four classes would invent a correspondence neither agency
 * published. They are analysed separately and compared as products.
 *
 * THE THIRD REFUSAL: OBSERVED DAMAGE IS NOT A SAMPLE OF NEPAL. Both products
 * were tasked at places where damage was expected. Counting more damage inside
 * MMI VIII than inside MMI VI is partly a fact about the earthquake and partly
 * a fact about where the satellites were pointed, and no amount of statistics
 * separates those two without a coverage footprint. `damageByIntensity` returns
 * the association it can compute and the selection warning that governs how it
 * may be read; callers are expected to carry both.
 */

import { toUtm } from '../geo/crs.js';
import { distanceToPolygonDegrees, pointInPolygon } from '../geo/geometry.js';
import { chiSquareTest, concentrationCurve, gini, spearman } from './stats.js';

/**
 * UNOSAT's four damage classes, weakest first.
 *
 * The order is the only thing the source establishes about them. It is an
 * ORDINAL scale: "Destroyed" is worse than "Severe Damage", but the product
 * nowhere says by how much, and that missing interval is what makes §5.2 hard.
 */
export const UNOSAT_CLASSES = Object.freeze([
  'Possible Damage',
  'Moderate Damage',
  'Severe Damage',
  'Destroyed',
]);

/**
 * The counts published in the UNOSAT inventory, reproduced before anything
 * derived is computed.
 *
 * Kept as data rather than as a comment so the reproduction check is executed
 * on every run instead of being asserted once by a human who read a PDF.
 */
export const UNOSAT_PUBLISHED_COUNTS = Object.freeze({
  Destroyed: 2084,
  'Severe Damage': 1347,
  'Moderate Damage': 1057,
  'Possible Damage': 95,
});

/** Tally a categorical property across features, in a stated category order. */
export function tally(features, accessor, order = null) {
  const counts = new Map();
  for (const feature of features) {
    const key = accessor(feature);
    const label =
      key === null || key === undefined ? '(unlabelled)' : String(key);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const keys = order
    ? [...order, ...[...counts.keys()].filter((k) => !order.includes(k))]
    : [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
  const result = {};
  for (const key of keys) if (counts.has(key)) result[key] = counts.get(key);
  return Object.freeze(result);
}

/**
 * §5.1 — reproduce the published counts before computing anything from them.
 *
 * A reproduction that merely re-reads a number the ingest already validated
 * proves nothing, so this recounts from the feature geometry list and compares
 * class by class, reporting the differences rather than a boolean. If the
 * artefact ever drifts from the published inventory, the drift appears here
 * with its size instead of failing an assertion with no detail.
 */
export function reproduceUnosatCounts(
  features,
  published = UNOSAT_PUBLISHED_COUNTS,
) {
  const observed = tally(
    features,
    (f) => f.properties?.damageClass,
    UNOSAT_CLASSES,
  );
  const classes = [
    ...new Set([...Object.keys(published), ...Object.keys(observed)]),
  ];
  const differences = classes
    .map((name) => ({
      class: name,
      published: published[name] ?? 0,
      observed: observed[name] ?? 0,
      difference: (observed[name] ?? 0) - (published[name] ?? 0),
    }))
    .filter((row) => row.difference !== 0);
  const total = Object.values(observed).reduce((a, b) => a + b, 0);
  return Object.freeze({
    observed,
    published: Object.freeze({ ...published }),
    total,
    publishedTotal: Object.values(published).reduce((a, b) => a + b, 0),
    reproduced: differences.length === 0,
    differences: Object.freeze(differences),
  });
}

/** Percentage composition of a tally, to one decimal. */
export function composition(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0)
    return Object.freeze({ total: 0, shares: Object.freeze({}) });
  const shares = {};
  for (const [key, value] of Object.entries(counts)) {
    shares[key] = Number(((value / total) * 100).toFixed(1));
  }
  return Object.freeze({ total, shares: Object.freeze(shares) });
}

/* ------------------------------------------------------------------ *
 * §5.2 — severity, and why a single number is not enough.
 * ------------------------------------------------------------------ */

/**
 * Four weight schemes over the same ordinal classes.
 *
 * ONE SCHEME WOULD BE AN ARBITRARY CHOICE PRESENTED AS A MEASUREMENT. The
 * source gives an order and nothing else, so any interval between the classes
 * is imposed by the analyst. Rather than pick one and hide it, all four are
 * computed and the question becomes whether the ANSWER depends on the choice.
 * If the ranking of places is the same under all four, the ranking is a
 * property of the data; if it moves, the index is not usable and this module
 * says so instead of publishing the prettiest version.
 */
export const SEVERITY_SCHEMES = Object.freeze([
  {
    id: 'ordinal-linear',
    label: 'Equal ordinal steps (1/2/3/4)',
    rationale:
      'The minimum assumption that still produces a number: the classes are equally spaced. It is the default a reader would guess, which makes it the right baseline to test the others against.',
    weights: Object.freeze({
      'Possible Damage': 1,
      'Moderate Damage': 2,
      'Severe Damage': 3,
      Destroyed: 4,
    }),
  },
  {
    id: 'destroyed-only',
    label: 'Destroyed count only (0/0/0/1)',
    rationale:
      'The only weighting that needs no interval assumption at all, because it uses the classes as a single yes/no. If the ranking under this scheme matches the weighted ones, the weights were not doing the work.',
    weights: Object.freeze({
      'Possible Damage': 0,
      'Moderate Damage': 0,
      'Severe Damage': 0,
      Destroyed: 1,
    }),
  },
  {
    id: 'collapse-weighted',
    label: 'Collapse-weighted (0/1/3/5)',
    rationale:
      'Reflects the judgement that "Possible Damage" carries almost no information — 89 of its 95 records are flagged Uncertain in the source — while total collapse dominates. A deliberately opinionated shape, included to be argued with.',
    weights: Object.freeze({
      'Possible Damage': 0,
      'Moderate Damage': 1,
      'Severe Damage': 3,
      Destroyed: 5,
    }),
  },
  {
    id: 'geometric',
    label: 'Doubling steps (1/2/4/8)',
    rationale:
      'The opposite extreme to equal steps: each class twice the last. Included because if a ranking survives both equal and doubling steps, no intermediate shape can overturn it.',
    weights: Object.freeze({
      'Possible Damage': 1,
      'Moderate Damage': 2,
      'Severe Damage': 4,
      Destroyed: 8,
    }),
  },
]);

/** Weighted severity total and per-observation mean for one tally. */
export function severityScore(counts, weights) {
  let score = 0;
  let observations = 0;
  for (const [name, count] of Object.entries(counts)) {
    const weight = weights[name];
    if (weight === undefined) continue;
    score += weight * count;
    observations += count;
  }
  return Object.freeze({
    score,
    observations,
    mean: observations > 0 ? score / observations : null,
  });
}

/**
 * Score every unit under every scheme and measure whether the ranking moves.
 *
 * @param {Array<{id:string, counts:object}>} units places with class tallies
 * @returns {object} per-scheme scores, pairwise Spearman, and a verdict
 *
 * The verdict thresholds are stated rather than implied: rho >= 0.9 across
 * every pair is "the ranking does not depend on the weights", rho >= 0.7 is
 * "broadly stable, report the ranking with the caveat", and below that the
 * index is withheld. These are conventional bands for rank agreement, and the
 * point of naming them is that a reader can disagree with the band rather than
 * with a hidden judgement.
 */
export function severityRankStability(units, schemes = SEVERITY_SCHEMES) {
  /*
   * Too few units to rank. Without this, every pairwise Spearman comes back
   * null, `worst` never moves off its initial 1, and the function reports
   * ROBUST — a confident verdict computed from nothing, which is the exact
   * failure this module exists to prevent.
   */
  if (!Array.isArray(units) || units.length < 3) {
    return Object.freeze({
      units: units?.length ?? 0,
      schemes: Object.freeze([]),
      pairwise: Object.freeze([]),
      worstSpearman: null,
      topFiveByScheme: Object.freeze([]),
      topFiveAgreement: null,
      verdict: 'NOT_ENOUGH_UNITS',
      verdictMeaning:
        'Fewer than three units were supplied, so rank agreement between weighting schemes cannot be measured. No ordering is reported.',
    });
  }
  const scored = schemes.map((scheme) => ({
    scheme: scheme.id,
    label: scheme.label,
    scores: units.map(
      (unit) => severityScore(unit.counts, scheme.weights).score,
    ),
  }));
  const pairs = [];
  let worst = 1;
  for (let i = 0; i < scored.length; i += 1) {
    for (let j = i + 1; j < scored.length; j += 1) {
      const rho = spearman(scored[i].scores, scored[j].scores);
      pairs.push(
        Object.freeze({
          a: scored[i].scheme,
          b: scored[j].scheme,
          spearman: rho,
        }),
      );
      if (rho !== null && rho < worst) worst = rho;
    }
  }
  const topFive = scored.map((entry) =>
    Object.freeze(
      entry.scores
        .map((score, index) => ({ id: units[index].id, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((row) => row.id),
    ),
  );
  const topFiveAgreement =
    topFive.length > 1
      ? topFive
          .slice(1)
          .reduce(
            (shared, list) => shared.filter((id) => list.includes(id)),
            [...topFive[0]],
          ).length / Math.min(5, units.length)
      : 1;
  const verdict =
    worst >= 0.9 ? 'ROBUST' : worst >= 0.7 ? 'BROADLY_STABLE' : 'NOT_USABLE';
  return Object.freeze({
    units: units.length,
    schemes: Object.freeze(
      scored.map((entry) =>
        Object.freeze({
          ...entry,
          scores: Object.freeze(entry.scores),
        }),
      ),
    ),
    pairwise: Object.freeze(pairs),
    worstSpearman: worst,
    topFiveByScheme: Object.freeze(topFive),
    topFiveAgreement,
    verdict,
    verdictMeaning:
      verdict === 'ROBUST'
        ? 'The ordering of places is the same under every weighting tried, including the one that uses no weights at all. The ORDERING may be reported; the score itself is still an index, not a measurement.'
        : verdict === 'BROADLY_STABLE'
          ? 'The ordering mostly holds but individual places move between weightings. Report the ordering only with the schemes shown beside it.'
          : 'The ordering depends on weights the source does not justify. No severity index is reported for these units; the class composition is reported instead.',
  });
}

/* ------------------------------------------------------------------ *
 * §5.1 / §5.3 — where the damage is.
 * ------------------------------------------------------------------ */

/**
 * Bin damage points into a square grid measured in UTM 45N metres.
 *
 * CELL SIZE IS NOT A FREE CHOICE HERE. One kilometre is the resolution of the
 * WorldPop surface Stage 4 used (0.008333 degrees, about 819 m north-south at
 * this latitude), and §5.10 and §5.11 have to compare damage counts with
 * population on the same units. Picking a prettier number would make the two
 * layers incommensurable. The sensitivity to that choice is reported by
 * running the same function at 2 km and 5 km.
 */
export function damageGrid(points, { cellMetres = 1000 } = {}) {
  const cells = new Map();
  for (const point of points) {
    const [lon, lat] = point.coordinates;
    const { easting, northing } = toUtm(lon, lat);
    const col = Math.floor(easting / cellMetres);
    const row = Math.floor(northing / cellMetres);
    const id = `${col}:${row}`;
    let cell = cells.get(id);
    if (!cell) {
      cell = {
        id,
        col,
        row,
        easting: (col + 0.5) * cellMetres,
        northing: (row + 0.5) * cellMetres,
        count: 0,
        counts: {},
        lonSum: 0,
        latSum: 0,
      };
      cells.set(id, cell);
    }
    cell.count += 1;
    cell.lonSum += lon;
    cell.latSum += lat;
    const klass = point.damageClass ?? '(unlabelled)';
    cell.counts[klass] = (cell.counts[klass] ?? 0) + 1;
  }
  const list = [...cells.values()].map((cell) =>
    Object.freeze({
      id: cell.id,
      col: cell.col,
      row: cell.row,
      count: cell.count,
      counts: Object.freeze(cell.counts),
      /* The mean of the points inside, not the cell centre: a cell that holds
       * six points clustered in one corner should plot where they are. */
      lon: Number((cell.lonSum / cell.count).toFixed(5)),
      lat: Number((cell.latSum / cell.count).toFixed(5)),
    }),
  );
  list.sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  return Object.freeze({
    cellMetres,
    cellAreaSqKm: (cellMetres / 1000) ** 2,
    occupiedCells: list.length,
    points: points.length,
    cells: Object.freeze(list),
    /*
     * The only area this analysis can honestly quote. It is the area in which
     * damage WAS observed, not the area that was examined: a square kilometre
     * with no damage point is indistinguishable here from a square kilometre
     * nobody looked at.
     */
    observedFootprintSqKm: list.length * (cellMetres / 1000) ** 2,
    meanPerOccupiedCell: list.length > 0 ? points.length / list.length : null,
  });
}

/** §5.3 — how concentrated the observed damage is over its own grid. */
export function damageConcentration(grid) {
  const counts = grid.cells.map((cell) => cell.count);
  return Object.freeze({
    cellMetres: grid.cellMetres,
    occupiedCells: grid.occupiedCells,
    gini: gini(counts),
    curve: concentrationCurve(counts),
    maxCellCount: counts[0] ?? 0,
    medianCellCount: counts.length
      ? counts.slice().sort((a, b) => a - b)[Math.floor(counts.length / 2)]
      : null,
  });
}

/**
 * Attribute points to districts, with an explicit ledger of what did not land.
 *
 * The same discipline Stage 4 settled on: containment first, then a bounded
 * nearest-boundary fallback, and a count of everything that used the fallback.
 * A point silently assigned to a district is how a map becomes confidently
 * wrong, so the fallback distance is recorded per point class rather than
 * averaged away.
 */
export function attributeToDistricts(
  points,
  districts,
  { fallbackKm = 2 } = {},
) {
  /* Degrees, for the cheap candidate ranking; the winner is re-measured. */
  const fallbackDegrees = fallbackKm / 111.32;
  const byDistrict = new Map();
  const ledger = {
    contained: 0,
    nearest: 0,
    unplaced: 0,
    fallbackDistancesKm: [],
  };
  const unplaced = [];
  for (const point of points) {
    const [lon, lat] = point.coordinates;
    let name = null;
    for (const district of districts) {
      if (
        district.bbox &&
        (lon < district.bbox[0] ||
          lon > district.bbox[2] ||
          lat < district.bbox[1] ||
          lat > district.bbox[3])
      ) {
        continue;
      }
      if (pointInPolygon([lon, lat], district.geometry)) {
        name = district.district;
        break;
      }
    }
    if (name !== null) {
      ledger.contained += 1;
    } else {
      let best = null;
      let bestDistance = Infinity;
      for (const district of districts) {
        const distance = distanceToPolygonDegrees(
          [lon, lat],
          district.geometry,
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          best = district;
        }
      }
      if (best && bestDistance <= fallbackDegrees) {
        name = best.district;
        ledger.nearest += 1;
        ledger.fallbackDistancesKm.push(
          Number((bestDistance * 111.32).toFixed(2)),
        );
      } else {
        ledger.unplaced += 1;
        unplaced.push({
          lon,
          lat,
          nearestDistrict: best?.district ?? null,
          nearestKm: Number((bestDistance * 111.32).toFixed(2)),
        });
        continue;
      }
    }
    let entry = byDistrict.get(name);
    if (!entry) {
      entry = { district: name, count: 0, counts: {} };
      byDistrict.set(name, entry);
    }
    entry.count += 1;
    const klass = point.damageClass ?? '(unlabelled)';
    entry.counts[klass] = (entry.counts[klass] ?? 0) + 1;
  }
  const rows = [...byDistrict.values()]
    .map((entry) =>
      Object.freeze({ ...entry, counts: Object.freeze(entry.counts) }),
    )
    .sort((a, b) => b.count - a.count);
  const placed = ledger.contained + ledger.nearest;
  return Object.freeze({
    districts: Object.freeze(rows),
    ledger: Object.freeze({
      read: points.length,
      contained: ledger.contained,
      placedByNearestBoundary: ledger.nearest,
      unplaced: ledger.unplaced,
      placed,
      reconciles: placed + ledger.unplaced === points.length,
      fallbackKm,
      maxFallbackUsedKm: ledger.fallbackDistancesKm.length
        ? Math.max(...ledger.fallbackDistancesKm)
        : null,
    }),
    unplaced: Object.freeze(unplaced.slice(0, 20)),
  });
}

/* ------------------------------------------------------------------ *
 * §5.4 — damage against modelled shaking.
 * ------------------------------------------------------------------ */

/**
 * Damage points by modelled MMI band, with the association statistic and the
 * warning that governs it.
 *
 * `intensityOf` is injected rather than imported so this module never has to
 * know how contours are stored; Stage 4 already owns that.
 *
 * WHAT THE CHI-SQUARE HERE DOES AND DOES NOT TEST. It tests whether the MIX of
 * damage classes differs between intensity bands — that is, whether a damage
 * site inside MMI VIII is more likely to be "Destroyed" than one inside MMI VI.
 * It deliberately does NOT test whether there is more damage at higher
 * intensity, because the number of observations per band is set by where the
 * satellites were tasked, not by the earthquake. The first question the data
 * can answer; the second it cannot.
 */
export function damageByIntensity(points, intensityOf) {
  const bands = new Map();
  let outside = 0;
  const outsideCounts = {};
  for (const point of points) {
    const [lon, lat] = point.coordinates;
    const mmi = intensityOf(lon, lat);
    const klass = point.damageClass ?? '(unlabelled)';
    if (mmi === null || mmi === undefined) {
      outside += 1;
      outsideCounts[klass] = (outsideCounts[klass] ?? 0) + 1;
      continue;
    }
    let band = bands.get(mmi);
    if (!band) {
      band = { mmi, count: 0, counts: {} };
      bands.set(mmi, band);
    }
    band.count += 1;
    band.counts[klass] = (band.counts[klass] ?? 0) + 1;
  }
  const rows = [...bands.values()].sort((a, b) => a.mmi - b.mmi);
  const table = rows.map((band) =>
    UNOSAT_CLASSES.map((name) => band.counts[name] ?? 0),
  );
  const test =
    rows.length >= 2
      ? chiSquareTest(table)
      : Object.freeze({
          usable: false,
          reason: 'Fewer than two intensity bands contain damage observations.',
        });
  /*
   * The ordinal trend: does the share of the worst class rise with the band?
   * Spearman rather than Pearson because MMI is an ordered label — the step
   * from VI to VII is not the same physical increment as VII to VIII.
   */
  const destroyedShare = rows.map((band) =>
    band.count > 0 ? (band.counts.Destroyed ?? 0) / band.count : 0,
  );
  const trend =
    rows.length >= 3
      ? spearman(
          rows.map((band) => band.mmi),
          destroyedShare,
        )
      : null;
  return Object.freeze({
    bands: Object.freeze(
      rows.map((band, index) =>
        Object.freeze({
          ...band,
          counts: Object.freeze(band.counts),
          destroyedShare: Number((destroyedShare[index] * 100).toFixed(1)),
          composition: composition(band.counts).shares,
        }),
      ),
    ),
    outsideContours: outside,
    outsideCounts: Object.freeze(outsideCounts),
    classes: UNOSAT_CLASSES,
    contingencyTable: Object.freeze(table.map((row) => Object.freeze(row))),
    independenceTest: test,
    destroyedShareTrendSpearman: trend,
    selectionWarning:
      'OBSERVATION COUNTS PER BAND ARE NOT COMPARABLE ACROSS BANDS. Both damage products were tasked at places where damage was expected, so the number of sites inside a band measures satellite tasking as much as it measures shaking. Only the COMPOSITION within a band — the mix of damage classes among sites that were looked at — is read here, and even that inherits whatever bias governed which sites were digitised.',
  });
}

/* ------------------------------------------------------------------ *
 * §5.5 — Copernicus EMSR125, kept separate.
 * ------------------------------------------------------------------ */

/**
 * The Copernicus grading vocabulary as published, grouped without being
 * translated.
 *
 * `severityRank` is null wherever the label carries no damage judgement. That
 * is the difference between "this structure was examined and found intact"
 * and "this record has no usable grading", and collapsing the two would move
 * 2,453 records into the denominator or out of it depending on which way the
 * mistake went.
 */
export const COPERNICUS_GRADES = Object.freeze({
  'Not Affected': {
    group: 'GRADED_UNDAMAGED',
    severityRank: 0,
    emsGrade: null,
  },
  'Negligible to slight damage': {
    group: 'GRADED_DAMAGED',
    severityRank: 1,
    emsGrade: 1,
  },
  'Negligible to slight damage (EMS-98 grade 1)': {
    group: 'GRADED_DAMAGED',
    severityRank: 1,
    emsGrade: 1,
  },
  'Completely Destroyed': {
    group: 'GRADED_DAMAGED',
    severityRank: 5,
    emsGrade: 5,
  },
  'Completely Destroyed (EMS-98 grade 5)': {
    group: 'GRADED_DAMAGED',
    severityRank: 5,
    emsGrade: 5,
  },
  Unknown: { group: 'NOT_GRADED', severityRank: null, emsGrade: null },
  'Not Applicable': { group: 'NOT_GRADED', severityRank: null, emsGrade: null },
  Null: { group: 'NOT_GRADED', severityRank: null, emsGrade: null },
  '(empty)': { group: 'NOT_GRADED', severityRank: null, emsGrade: null },
});

/**
 * Per-AOI Copernicus summary, including the one thing UNOSAT cannot give: a
 * denominator.
 *
 * `destroyedShareOfGraded` divides by the records that carry a damage
 * judgement, not by every record in the AOI, because an "Unknown" grading is a
 * structure the analyst could not classify — leaving it in the denominator
 * would report a lower destruction rate purely because the imagery was poor.
 * Both denominators are returned so the difference is visible.
 */
export function copernicusByAoi(records) {
  const byAoi = new Map();
  for (const record of records) {
    const meta = COPERNICUS_GRADES[record.grading] ?? {
      group: 'NOT_GRADED',
      severityRank: null,
      emsGrade: null,
    };
    let entry = byAoi.get(record.aoi);
    if (!entry) {
      entry = {
        aoi: record.aoi,
        total: 0,
        graded: 0,
        damaged: 0,
        destroyed: 0,
        slight: 0,
        notAffected: 0,
        notGraded: 0,
        grades: {},
      };
      byAoi.set(record.aoi, entry);
    }
    entry.total += 1;
    entry.grades[record.grading] = (entry.grades[record.grading] ?? 0) + 1;
    if (meta.group === 'NOT_GRADED') entry.notGraded += 1;
    else {
      entry.graded += 1;
      if (meta.severityRank === 0) entry.notAffected += 1;
      else {
        entry.damaged += 1;
        if (meta.emsGrade === 5) entry.destroyed += 1;
        if (meta.emsGrade === 1) entry.slight += 1;
      }
    }
  }
  const rows = [...byAoi.values()]
    .map((entry) =>
      Object.freeze({
        ...entry,
        grades: Object.freeze(entry.grades),
        damagedShareOfGraded:
          entry.graded > 0
            ? Number(((entry.damaged / entry.graded) * 100).toFixed(1))
            : null,
        destroyedShareOfGraded:
          entry.graded > 0
            ? Number(((entry.destroyed / entry.graded) * 100).toFixed(1))
            : null,
        destroyedShareOfAllRecords:
          entry.total > 0
            ? Number(((entry.destroyed / entry.total) * 100).toFixed(1))
            : null,
        ungradedShare:
          entry.total > 0
            ? Number(((entry.notGraded / entry.total) * 100).toFixed(1))
            : null,
      }),
    )
    .sort((a, b) => b.total - a.total);
  const totals = rows.reduce(
    (acc, row) => ({
      total: acc.total + row.total,
      graded: acc.graded + row.graded,
      damaged: acc.damaged + row.damaged,
      destroyed: acc.destroyed + row.destroyed,
      notAffected: acc.notAffected + row.notAffected,
      notGraded: acc.notGraded + row.notGraded,
    }),
    {
      total: 0,
      graded: 0,
      damaged: 0,
      destroyed: 0,
      notAffected: 0,
      notGraded: 0,
    },
  );
  return Object.freeze({
    aois: Object.freeze(rows),
    totals: Object.freeze(totals),
    vocabularyNote:
      'Copernicus EMSR125 published only two damage grades for this activation — EMS-98 grade 1 (negligible to slight) and grade 5 (completely destroyed) — with no grade 2, 3 or 4 anywhere in the product. A grading scheme with a hole in the middle cannot be aligned with UNOSAT’s four-step scale, and this module does not attempt it.',
  });
}

/**
 * The comparison §5.5 and §5.14(H) ask for: two products, side by side, with
 * the reasons they are not interchangeable stated as data rather than prose.
 */
export function compareDamageProducts({ unosat, copernicus, nga }) {
  return Object.freeze({
    products: Object.freeze([
      Object.freeze({
        product: 'UNOSAT damage sites',
        unitObserved: 'Individual damaged structure, as a point',
        records: unosat.total,
        hasDenominator: false,
        denominatorNote:
          'Only damaged structures are recorded. There is no "examined and intact" record and no published examined-area footprint, so no proportion of buildings can be computed from this source.',
        vocabulary: UNOSAT_CLASSES,
        vocabularySteps: 4,
      }),
      Object.freeze({
        product: 'Copernicus EMSR125 grading',
        unitObserved:
          'Every structure inside a published area of interest, graded including undamaged',
        records: copernicus.totals.total,
        hasDenominator: true,
        denominatorNote: `${copernicus.totals.graded} of ${copernicus.totals.total} records carry a damage judgement, so a damage rate is computable within the areas of interest — and only within them.`,
        vocabulary: Object.freeze(Object.keys(COPERNICUS_GRADES)),
        vocabularySteps: 2,
      }),
      Object.freeze({
        product: 'NGA infrastructure damage',
        unitObserved: 'Blocked road segments, bridges out, landslide extents',
        records: nga.total,
        hasDenominator: false,
        denominatorNote:
          'A road with no reported blockage is a road with no OBSERVED blockage. The product does not publish which roads were checked, so "not blocked" cannot be inferred.',
        vocabulary: Object.freeze(['BLOCKED_ROAD', 'BRIDGE_OUT', 'LANDSLIDE']),
        vocabularySteps: 1,
      }),
    ]),
    whyNotMerged: Object.freeze([
      'The units differ: UNOSAT counts damaged structures, Copernicus grades all structures examined, NGA maps infrastructure features. Adding them would count different things in one total.',
      'The vocabularies differ in shape, not just in wording: UNOSAT has four ordered damage classes, Copernicus has two non-adjacent EMS-98 grades with nothing between them.',
      'The coverage differs: the two products overlap geographically but neither is a superset, and where they overlap a single collapsed building may appear in both, once as a point and once as a graded structure. A combined count would double-count it.',
      'Only Copernicus carries a denominator. A rate computed from UNOSAT and a rate computed from Copernicus are not the same quantity even when both are called a "damage rate".',
    ]),
  });
}
