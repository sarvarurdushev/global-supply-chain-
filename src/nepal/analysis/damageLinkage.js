/**
 * Stage 5 §5.10–§5.12 — joining observed damage to people and to the clock.
 *
 * Two joins live here and both are easy to get wrong in the same way: by
 * letting the name of the result claim more than the calculation did.
 *
 * PEOPLE. A population cell near an observed damage point tells us that the
 * modelled 2015 population surface places people close to a place where a
 * satellite analyst saw a damaged structure. It does not tell us that those
 * people's houses were damaged, that they were at home, or that they were
 * displaced. `populationNearDamage` returns a label containing the whole
 * spatial relationship, so quoting the number without the relationship is
 * awkward by design.
 *
 * TIME. The damage products carry up to three different dates — when the
 * imagery was taken, when the analyst drew the feature, and when the layer was
 * published — and a timeline that mixes them animates the response effort
 * rather than the earthquake. They are kept as separate clocks and the lags
 * between them are the result, not an inconvenience to be averaged away.
 */

import { toUtm } from '../geo/crs.js';

/* ------------------------------------------------------------------ *
 * §5.10 — population in a stated spatial relationship to observed damage.
 * ------------------------------------------------------------------ */

/**
 * Distances the population relationship is reported at, in metres.
 *
 * There is deliberately no zero band. A cell centre exactly coincident with a
 * damage point is a measure-zero event, so a "0 m" row would always read zero
 * and be mistaken for "nobody was at the damage". 500 m is half a cell: the
 * finest relationship a ~1 km population surface can express at all.
 */
export const PROXIMITY_BANDS_METRES = Object.freeze([
  500, 1000, 2000, 5000, 10000,
]);

/**
 * Population by distance to the nearest observed damage point.
 *
 * @param {Iterable<{lon:number, lat:number, people:number}>} cells
 * @param {Array<{coordinates:number[]}>} damagePoints
 * @param {object} [options]
 * @returns {object} population per band, cumulative, and the wording to use
 *
 * THE BANDS MEASURE CELL CENTRE TO DAMAGE POINT. Neither endpoint is a person:
 * one is the centre of a ~1 km cell a model placed people in, the other is a
 * structure an analyst digitised. The narrowest band, 500 m, is half a cell —
 * the finest distinction this population surface can carry.
 */
export function populationNearDamage(
  cells,
  damagePoints,
  { bands = PROXIMITY_BANDS_METRES } = {},
) {
  const maxDistance = Math.max(...bands);
  const cellMetres = Math.max(1000, maxDistance);
  /* Index the damage points so each population cell reads a 3x3 block. */
  const index = new Map();
  for (const point of damagePoints) {
    const { easting, northing } = toUtm(
      point.coordinates[0],
      point.coordinates[1],
    );
    const key = `${Math.floor(easting / cellMetres)}:${Math.floor(northing / cellMetres)}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push([easting, northing]);
  }
  const totals = new Map(bands.map((band) => [band, 0]));
  let beyond = 0;
  let total = 0;
  let cellsConsidered = 0;
  const cellsInBand = new Map(bands.map((band) => [band, 0]));
  for (const cell of cells) {
    total += cell.people;
    const { easting, northing } = toUtm(cell.lon, cell.lat);
    const col = Math.floor(easting / cellMetres);
    const row = Math.floor(northing / cellMetres);
    let best = Infinity;
    for (let dc = -1; dc <= 1; dc += 1) {
      for (let dr = -1; dr <= 1; dr += 1) {
        for (const [pe, pn] of index.get(`${col + dc}:${row + dr}`) ?? []) {
          const distance = Math.hypot(pe - easting, pn - northing);
          if (distance < best) best = distance;
        }
      }
    }
    if (!Number.isFinite(best) || best > maxDistance) {
      beyond += cell.people;
      continue;
    }
    cellsConsidered += 1;
    for (const band of bands) {
      if (best <= band) {
        totals.set(band, totals.get(band) + cell.people);
        cellsInBand.set(band, cellsInBand.get(band) + 1);
        /* Cumulative by construction: a cell inside 1 km is inside 2 km too. */
      }
    }
  }
  return Object.freeze({
    bands: Object.freeze(
      bands.map((band) =>
        Object.freeze({
          withinMetres: band,
          people: Math.round(totals.get(band)),
          cells: cellsInBand.get(band),
          cumulative: true,
        }),
      ),
    ),
    populationBeyondFurthestBand: Math.round(beyond),
    populationTotalConsidered: Math.round(total),
    cellsWithinFurthestBand: cellsConsidered,
    wording:
      'X people lived in ~1 km modelled population cells whose centre lies within D metres of an observed damage point. ' +
      'It is a statement about the overlap of a modelled population surface with a set of observed points — not about ' +
      'houses lost, people displaced or anyone harmed, none of which this project holds a source for.',
    forbidden: Object.freeze([
      'X people lost their homes',
      'X people were made homeless',
      'X people were affected',
      'X houses were destroyed (beyond the observed points themselves)',
    ]),
  });
}

/* ------------------------------------------------------------------ *
 * §5.11 — where people were against where damage was observed.
 * ------------------------------------------------------------------ */

/**
 * Quadrants over shared 1 km cells, with the variables defined here rather
 * than inherited from Stage 4.
 *
 * WHY THE DAMAGE THRESHOLD IS NOT A MEDIAN. Stage 4 split population at its
 * median because population is a continuous surface with a meaningful middle.
 * Observed damage is not: across the analysed cells the median damage count is
 * ZERO, so a median split would put every cell with a single observation into
 * the "high" group and call it a finding. The damage axis is therefore cut at
 * PRESENCE (any observed damage point) and again at the median count AMONG
 * CELLS THAT HAVE ANY, and both cuts are reported.
 *
 * WHAT "LOW DAMAGE" MEANS HERE. It means no damage point was OBSERVED in the
 * cell. Outside the areas the satellites examined that is not evidence of an
 * intact cell, and this function returns that caveat with the counts.
 */
export function damagePopulationQuadrants(
  cells,
  { populationThreshold = null, damageThreshold = 1 } = {},
) {
  const list = [...cells];
  const populations = list.map((cell) => cell.people).sort((a, b) => a - b);
  const medianPopulation = populations.length
    ? populations[Math.floor(populations.length / 2)]
    : 0;
  const cut = populationThreshold ?? medianPopulation;
  const quadrants = {
    HIGH_POPULATION_HIGH_DAMAGE: [],
    HIGH_POPULATION_LOW_DAMAGE: [],
    LOW_POPULATION_HIGH_DAMAGE: [],
    LOW_POPULATION_LOW_DAMAGE: [],
  };
  for (const cell of list) {
    const highPopulation = cell.people >= cut;
    const highDamage = cell.damage >= damageThreshold;
    const key = `${highPopulation ? 'HIGH' : 'LOW'}_POPULATION_${highDamage ? 'HIGH' : 'LOW'}_DAMAGE`;
    quadrants[key].push(cell);
  }
  const summarise = (group) =>
    Object.freeze({
      cells: group.length,
      people: Math.round(group.reduce((a, b) => a + b.people, 0)),
      damagePoints: group.reduce((a, b) => a + b.damage, 0),
      examples: Object.freeze(
        group
          .slice()
          .sort((a, b) => b.damage - a.damage || b.people - a.people)
          .slice(0, 5)
          .map((cell) =>
            Object.freeze({
              lon: Number(cell.lon.toFixed(4)),
              lat: Number(cell.lat.toFixed(4)),
              people: Math.round(cell.people),
              damage: cell.damage,
              district: cell.district ?? null,
            }),
          ),
      ),
    });
  return Object.freeze({
    cellsAnalysed: list.length,
    populationThreshold: Number(cut.toFixed(1)),
    populationThresholdBasis:
      populationThreshold === null
        ? 'Median modelled population across the analysed cells, computed here and independent of the damage axis.'
        : 'Supplied by the caller.',
    damageThreshold,
    damageThresholdBasis:
      damageThreshold === 1
        ? 'Presence of any observed damage point. A median split is meaningless on this axis because the median damage count across the analysed cells is zero.'
        : 'Count of observed damage points in the cell.',
    quadrants: Object.freeze({
      HIGH_POPULATION_HIGH_DAMAGE: summarise(
        quadrants.HIGH_POPULATION_HIGH_DAMAGE,
      ),
      HIGH_POPULATION_LOW_DAMAGE: summarise(
        quadrants.HIGH_POPULATION_LOW_DAMAGE,
      ),
      LOW_POPULATION_HIGH_DAMAGE: summarise(
        quadrants.LOW_POPULATION_HIGH_DAMAGE,
      ),
      LOW_POPULATION_LOW_DAMAGE: summarise(quadrants.LOW_POPULATION_LOW_DAMAGE),
    }),
    interpretation: Object.freeze({
      HIGH_POPULATION_HIGH_DAMAGE:
        'Many people, damage observed. The cells a response would prioritise, and the ones most likely to be over-represented because dense places are the ones satellites were tasked over.',
      HIGH_POPULATION_LOW_DAMAGE:
        'Many people, no damage observed. AMBIGUOUS: either the buildings held, or nobody looked here. Which of the two it is cannot be told from this dataset.',
      LOW_POPULATION_HIGH_DAMAGE:
        'Few people, damage observed. Sparse mountain settlement where a small number of structures were lost — the pattern that district totals hide.',
      LOW_POPULATION_LOW_DAMAGE:
        'Few people, no damage observed. Mostly cells that were never examined.',
    }),
    coverageCaveat:
      '"Low damage" in this analysis means NO DAMAGE POINT WAS OBSERVED IN THIS CELL. The UNOSAT product records damaged structures only, and publishes no footprint of the area examined, so an absence of points is not evidence of intact buildings. Every quadrant containing "LOW_DAMAGE" inherits this ambiguity.',
  });
}

/* ------------------------------------------------------------------ *
 * §5.12 — four clocks, kept apart.
 * ------------------------------------------------------------------ */

/** The event itself, from the USGS catalogue. Not derived from any product. */
export const EVENT_CLOCK = Object.freeze({
  mainShock: '2015-04-25T06:11:26Z',
  mainShockMagnitude: 7.8,
  largestAftershock: '2015-05-12T07:05:19Z',
  largestAftershockMagnitude: 7.3,
});

/**
 * Normalise the date formats the NGA layers ship in.
 *
 * The same column carries "04/28/2015", "4/29/2015" and "2015-04-29" in one
 * product. Parsing with `new Date()` would silently accept all three and, on
 * some runtimes, read the first two as day/month. The formats are therefore
 * matched explicitly and anything else is refused rather than guessed.
 */
export function normaliseObservationDate(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (match) {
    const month = match[1].padStart(2, '0');
    const day = match[2].padStart(2, '0');
    if (Number(month) > 12) return null;
    return `${match[3]}-${month}-${day}`;
  }
  return null;
}

/** Whole days between two ISO dates, or null if either is missing. */
export function daysBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const from = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

/**
 * Build the observation timeline: one row per clock, never merged.
 *
 * @param {Array<{product:string, acquired:string|null, produced:string|null, published:string|null, count:number}>} observations
 *
 * The output deliberately has no single "date" column. A caller that wants to
 * animate has to choose which clock it is animating and say so on the screen,
 * which is the point: an animation keyed on imagery dates shows when
 * satellites passed over, and one keyed on production dates shows how fast
 * analysts worked. Neither shows when buildings fell.
 */
export function observationTimeline(observations, event = EVENT_CLOCK) {
  const rows = observations.map((observation) => {
    const acquired = normaliseObservationDate(observation.acquired);
    const produced = normaliseObservationDate(observation.produced);
    const published = normaliseObservationDate(observation.published);
    return Object.freeze({
      product: observation.product,
      count: observation.count,
      acquired,
      produced,
      published,
      daysEventToAcquisition: daysBetween(event.mainShock, acquired),
      daysAcquisitionToProduction: daysBetween(acquired, produced),
      daysProductionToPublication: daysBetween(produced, published),
      daysEventToPublication: daysBetween(event.mainShock, published),
    });
  });
  rows.sort((a, b) => String(a.acquired).localeCompare(String(b.acquired)));
  const lag = (key) => {
    const values = rows
      .filter((row) => row[key] !== null)
      .flatMap((row) => new Array(row.count).fill(row[key]))
      .sort((a, b) => a - b);
    if (values.length === 0) return null;
    return Object.freeze({
      observations: values.length,
      min: values[0],
      median: values[Math.floor(values.length / 2)],
      max: values[values.length - 1],
    });
  };
  return Object.freeze({
    event,
    clocks: Object.freeze([
      {
        id: 'EARTHQUAKE',
        label: 'Ground shaking',
        meaning:
          'When the earthquake happened. The only clock that records the damage itself.',
      },
      {
        id: 'ACQUISITION',
        label: 'Imagery acquired',
        meaning:
          'When a satellite photographed the ground. Damage visible in it occurred at some point between the earthquake and this date.',
      },
      {
        id: 'PRODUCTION',
        label: 'Feature mapped',
        meaning:
          'When an analyst digitised the feature from that imagery. A measure of response speed, not of the event.',
      },
      {
        id: 'PUBLICATION',
        label: 'Layer published',
        meaning:
          'When the product reached users. What a responder could actually have seen.',
      },
    ]),
    rows: Object.freeze(rows),
    lags: Object.freeze({
      eventToAcquisition: lag('daysEventToAcquisition'),
      acquisitionToProduction: lag('daysAcquisitionToProduction'),
      productionToPublication: lag('daysProductionToPublication'),
      eventToPublication: lag('daysEventToPublication'),
    }),
    animationWarning:
      'These dates must not be animated as the progress of the disaster. A damage point dated 3 May does not mean a building fell on 3 May; it means the first usable image of that place was taken on 3 May. Cloud cover, satellite revisit intervals and tasking priorities drive this sequence at least as much as the earthquake does.',
  });
}
