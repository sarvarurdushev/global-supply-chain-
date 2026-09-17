/**
 * The disaster case catalogue — LEVEL 0.
 *
 * §2: "Instead of immediately showing one disaster, the user should first see a
 * list of natural disasters/events... The interface should make these feel like
 * investigatable cases, not simple cards."
 *
 * WHAT MAKES A CASE RATHER THAN A CARD. A card shows figures. A case shows what
 * can be investigated and what cannot, before the user commits to opening it:
 *
 *   - `dataAvailability` per dimension. A case where infrastructure damage is
 *     unmapped says so at the list level, so the user is not three zoom levels
 *     deep before discovering the panel is empty.
 *   - `investigates` — the question this specific case answers well. Gorkha is
 *     the case for "how does terrain decide who dies"; a coastal cyclone is the
 *     case for "why surge beats wind".
 *   - `zoomPath` — the named geography the investigation descends through, so
 *     the ladder is authored per case rather than guessed from a bounding box.
 *   - Confirmed figures separated from modelled ones. A recorded death toll and
 *     a PAGER alert level are different kinds of claim and never share a field.
 *
 * TWO KINDS OF CASE. Curated cases are authored here with citations, because a
 * historical event's recorded toll is not in any live API. Live cases arrive
 * from GDACS and USGS at runtime and carry whatever those feeds carry —
 * usually a modelled severity and no confirmed toll at all, which is exactly
 * what an event three hours old should look like.
 *
 * NOTHING HERE IS INVENTED. Every figure on a curated case carries a `source`
 * naming who published it. A dimension with no source is `UNAVAILABLE`, and
 * §5's labels are the only permitted states.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

import { DataClass } from '../supplychain/provenance.js';
import { hazardForGdacsCode, hazard } from './hazards.js';

/**
 * How much of an investigation a case can actually support, per dimension.
 *
 * §5: "If real-time data is unavailable, clearly label: historical data,
 * estimated data, modeled data, unavailable data."
 */
export const AVAILABILITY = Object.freeze({
  /** Measured or officially recorded, with a citation. */
  CONFIRMED: 'CONFIRMED',
  /** A published model's output — PAGER, GDACS severity, a hydraulic run. */
  MODELLED: 'MODELLED',
  /** A figure reported as approximate by its own source. */
  ESTIMATED: 'ESTIMATED',
  /** Real, but from an archive rather than a current feed. */
  HISTORICAL: 'HISTORICAL',
  /** A live feed is serving this right now. */
  LIVE: 'LIVE',
  /** No source. The panel says so and names what would be needed. */
  UNAVAILABLE: 'UNAVAILABLE',
});

/** The investigation dimensions a case is rated against, in panel order. */
export const DIMENSIONS = Object.freeze([
  Object.freeze({ id: 'hazard', name: 'Hazard extent and intensity' }),
  Object.freeze({ id: 'human', name: 'Human impact' }),
  Object.freeze({ id: 'infrastructure', name: 'Infrastructure damage' }),
  Object.freeze({ id: 'supplyChain', name: 'Supply-chain disruption' }),
  Object.freeze({ id: 'economic', name: 'Economic damage' }),
  Object.freeze({ id: 'response', name: 'Response and evacuation' }),
  Object.freeze({ id: 'evidence', name: 'Imagery and field evidence' }),
]);

/**
 * One rung of a case's geographic descent (§18).
 *
 * Authored per case rather than derived, because the meaningful geography is
 * not a function of the bounding box: Gorkha's story is Kathmandu Valley and
 * the Langtang corridor, not the centroid of the rupture.
 */
function rung({ level, name, kind, lat, lon, altKm, reveals, note = null }) {
  return Object.freeze({ level, name, kind, lat, lon, altKm, reveals, note });
}

/**
 * The curated cases.
 *
 * Deliberately small and deliberately cited. Each one exists because it
 * demonstrates something the platform is for, and each figure names its
 * publisher in the same object.
 */
export const CURATED_CASES = Object.freeze([
  Object.freeze({
    id: 'nepal-gorkha-2015',
    name: 'Gorkha Earthquake',
    hazardId: 'earthquake',
    country: 'Nepal',
    countryIso3: 'NPL',
    region: 'Gandaki and Bagmati Provinces, Kathmandu Valley',
    date: '2015-04-25',
    status: 'Recovery concluded; reconstruction largely complete',
    /** The question this case is the best available demonstration of. */
    investigates:
      'How mountain terrain decides who dies, who is cut off, and which corridor the aid has to travel.',
    /** The primary intensity measurement, from the hazard's own scale. */
    magnitude: Object.freeze({
      value: 7.8,
      unit: 'Mww',
      source: 'USGS us20002926',
    }),
    /** Officially recorded, not modelled. */
    confirmed: Object.freeze({
      deaths: Object.freeze({
        value: 8964,
        source: 'Government of Nepal, Post Disaster Needs Assessment 2015',
        availability: 'CONFIRMED',
      }),
      injured: Object.freeze({
        value: 22_302,
        source: 'Government of Nepal, Post Disaster Needs Assessment 2015',
        availability: 'CONFIRMED',
      }),
      housesDestroyed: Object.freeze({
        value: 602_257,
        source: 'Government of Nepal, Post Disaster Needs Assessment 2015',
        availability: 'CONFIRMED',
      }),
      economicLossUsd: Object.freeze({
        value: 7_000_000_000,
        source:
          'Government of Nepal PDNA 2015: total damage and loss of about USD 7.0 billion, roughly a third of GDP',
        availability: 'ESTIMATED',
      }),
    }),
    /** What a live model said at the time, kept separate from the above. */
    modelled: Object.freeze({
      populationAtDamagingIntensity: Object.freeze({
        value: 6_452_839,
        source: 'USGS PAGER: population at MMI VII or above',
        availability: 'MODELLED',
      }),
      fatalityAlert: Object.freeze({
        value: 'red',
        source: 'USGS PAGER fatality alert (1,000+ estimated)',
        availability: 'MODELLED',
      }),
      landslideAlert: Object.freeze({
        value: 'red',
        source: 'USGS ground-failure model, aggregate hazard 1,500',
        availability: 'MODELLED',
      }),
    }),
    /** The USGS event this case is wired to. */
    usgsEventId: 'us20002926',
    dataAvailability: Object.freeze({
      hazard: 'CONFIRMED',
      human: 'CONFIRMED',
      infrastructure: 'HISTORICAL',
      supplyChain: 'MODELLED',
      economic: 'ESTIMATED',
      response: 'MODELLED',
      evidence: 'HISTORICAL',
    }),
    /**
     * Why this case is worth the platform's effort, in one sentence a reader
     * can judge before opening it.
     */
    whyThisCase:
      'The most data-rich earthquake in the Himalaya: USGS published the shaking field, the rupture, the landslide model and population exposure, and the Government of Nepal published a full needs assessment against it. Almost every claim can be checked.',
    zoomPath: Object.freeze([
      rung({
        level: 0,
        name: 'World',
        kind: 'GLOBAL',
        lat: 20,
        lon: 60,
        altKm: 22_000,
        reveals: 'Where in the world this sits, before anything else.',
      }),
      rung({
        level: 1,
        name: 'South Asia',
        kind: 'REGION',
        lat: 26,
        lon: 82,
        altKm: 3200,
        reveals:
          'The Himalayan arc, and that Nepal sits on the collision boundary that makes these earthquakes.',
      }),
      rung({
        level: 2,
        name: 'Nepal',
        kind: 'COUNTRY',
        lat: 28.3,
        lon: 84.1,
        altKm: 900,
        reveals:
          'National borders drawn, neighbours distinguished, and the epicentre placed against the whole country.',
      }),
      rung({
        level: 3,
        name: 'Gandaki and Bagmati Provinces',
        kind: 'PROVINCE',
        lat: 28.1,
        lon: 84.9,
        altKm: 320,
        reveals:
          'The rupture ran east from the epicentre toward the Kathmandu Valley rather than radiating evenly, which is why the damage is where it is.',
      }),
      rung({
        level: 4,
        name: 'Kathmandu Valley',
        kind: 'DISTRICT',
        lat: 27.71,
        lon: 85.32,
        altKm: 90,
        reveals:
          'Three cities in one basin of soft sediment — Kathmandu, Patan, Bhaktapur — and the shaking each measured.',
      }),
      rung({
        level: 5,
        name: 'Kathmandu',
        kind: 'CITY',
        lat: 27.7017,
        lon: 85.3206,
        altKm: 22,
        reveals:
          '1,442,271 people in a city that shook at MMI 7.89. This is the city-level reading, not a regional average.',
        note: 'Position and intensity from the USGS PAGER exposure product.',
      }),
      rung({
        level: 6,
        name: 'Langtang corridor',
        kind: 'SITE',
        lat: 28.2135,
        lon: 85.5145,
        altKm: 12,
        reveals:
          'Where the landslides, not the shaking, did the killing — and where the only road north was buried.',
      }),
      rung({
        level: 7,
        name: 'Pasang Lhamu Highway',
        kind: 'INFRASTRUCTURE',
        lat: 28.0,
        lon: 85.35,
        altKm: 6,
        reveals:
          'A single corridor carrying everything between Kathmandu and the Chinese border, against the slopes above it.',
      }),
    ]),
  }),

  Object.freeze({
    id: 'bhote-koshi-2026',
    name: 'Bhote Koshi Outburst Flood',
    hazardId: 'flood',
    country: 'Nepal',
    countryIso3: 'NPL',
    region: 'Rasuwa District, Bagmati Province',
    date: '2026-08-26',
    status: 'Corridor reopened; reconstruction ongoing',
    investigates:
      'How one valley flood closed an international trade corridor, and what moved through it.',
    magnitude: Object.freeze({
      value: null,
      unit: 'flood depth',
      source:
        'No gauged discharge published for this reach. Reconstructed from geolocated field evidence.',
    }),
    confirmed: Object.freeze({}),
    modelled: Object.freeze({}),
    usgsEventId: null,
    /** The project's own event pack drives this one. */
    eventPackId: 'bhote-koshi-2026',
    dataAvailability: Object.freeze({
      hazard: 'HISTORICAL',
      human: 'UNAVAILABLE',
      infrastructure: 'HISTORICAL',
      supplyChain: 'MODELLED',
      economic: 'UNAVAILABLE',
      response: 'MODELLED',
      evidence: 'CONFIRMED',
    }),
    whyThisCase:
      'Built from geolocated witness media rather than an agency product, which makes it the case that shows what a reconstruction can and cannot support: the corridor and its timing are evidenced, the casualty and economic figures simply do not exist.',
    zoomPath: Object.freeze([
      rung({
        level: 0,
        name: 'World',
        kind: 'GLOBAL',
        lat: 20,
        lon: 60,
        altKm: 22_000,
        reveals: 'Where this sits globally.',
      }),
      rung({
        level: 1,
        name: 'South Asia',
        kind: 'REGION',
        lat: 27,
        lon: 84,
        altKm: 2600,
        reveals: 'The Himalayan front and the Nepal-China frontier.',
      }),
      rung({
        level: 2,
        name: 'Nepal',
        kind: 'COUNTRY',
        lat: 28.3,
        lon: 84.1,
        altKm: 900,
        reveals: 'The country, its borders, and the single northern corridor.',
      }),
      rung({
        level: 3,
        name: 'Bagmati Province',
        kind: 'PROVINCE',
        lat: 28.1,
        lon: 85.4,
        altKm: 260,
        reveals: 'The province the corridor crosses.',
      }),
      rung({
        level: 4,
        name: 'Rasuwa District',
        kind: 'DISTRICT',
        lat: 28.17,
        lon: 85.4,
        altKm: 80,
        reveals:
          'The district, the river and the road that share one valley floor.',
      }),
      rung({
        level: 5,
        name: 'Bhote Koshi valley',
        kind: 'CITY',
        lat: 28.2,
        lon: 85.42,
        altKm: 26,
        reveals: 'The valley reach the flood travelled down.',
      }),
      rung({
        level: 6,
        name: 'Rasuwagadhi',
        kind: 'SITE',
        lat: 28.2799,
        lon: 85.3777,
        altKm: 8,
        reveals: 'The border point itself, geoconfirmed from witness video.',
      }),
      rung({
        level: 7,
        name: 'Rasuwagadhi–Kerung crossing',
        kind: 'INFRASTRUCTURE',
        lat: 28.27,
        lon: 85.38,
        altKm: 5,
        reveals: 'The customs crossing, and what stops when it closes.',
      }),
    ]),
  }),
]);

/** Look up a curated case. */
export function curatedCase(id) {
  return CURATED_CASES.find((entry) => entry.id === id) ?? null;
}

/**
 * Turn a live GDACS event into a case.
 *
 * A live case is thin on purpose. An event three hours old has a modelled
 * alert level and no confirmed anything, and dressing it up to match a curated
 * case would be inventing the parts that take weeks to establish.
 *
 * @param {object} record a normalised GDACS record
 * @returns {object|null} null for a hazard type the registry does not model
 */
export function caseFromGdacs(record) {
  const type = hazardForGdacsCode(record?.eventType);
  if (!type) return null;
  const population = Number(record?.affectedPopulation);
  return Object.freeze({
    id: `gdacs:${record.id ?? record.eventId}`,
    name:
      record.name ?? `${type.name} — ${record.country ?? 'unknown location'}`,
    hazardId: type.id,
    country: record.country ?? null,
    countryIso3: null,
    region: record.region ?? null,
    date: record.date ?? record.fromDate ?? null,
    status: 'Live feed',
    investigates: type.question,
    magnitude: Object.freeze({
      value: Number.isFinite(record?.severityValue)
        ? record.severityValue
        : null,
      unit: record?.severityUnit ?? type.primaryScale,
      source: 'GDACS',
    }),
    /*
     * Empty, and that is the finding: a confirmed toll does not exist for a
     * live event. The explorer renders the absence rather than a zero.
     */
    confirmed: Object.freeze({}),
    modelled: Object.freeze({
      alertLevel: record?.alertLevel
        ? Object.freeze({
            value: record.alertLevel,
            source: 'GDACS modelled alert level',
            availability: 'MODELLED',
          })
        : null,
      affectedPopulation: Number.isFinite(population)
        ? Object.freeze({
            value: population,
            source: 'GDACS modelled affected population',
            availability: 'MODELLED',
          })
        : null,
    }),
    usgsEventId: null,
    latitude: record?.latitude ?? null,
    longitude: record?.longitude ?? null,
    dataAvailability: Object.freeze({
      hazard: 'LIVE',
      human: 'MODELLED',
      infrastructure: 'UNAVAILABLE',
      supplyChain: 'MODELLED',
      economic: 'UNAVAILABLE',
      response: 'UNAVAILABLE',
      evidence: 'UNAVAILABLE',
    }),
    whyThisCase:
      'A live alert. The hazard footprint is current, and everything that takes a field assessment — casualties, damage, economic loss — does not exist yet and is shown as absent rather than as zero.',
    /**
     * A generic ladder, built from the event's own position.
     *
     * Honest about being generic: a curated case names its provinces and its
     * corridor because someone chose them. A live one can only descend on
     * coordinates, and the rungs say so.
     */
    zoomPath: genericZoomPath(record),
    isLive: true,
  });
}

/**
 * The fallback descent for an event with no authored geography.
 *
 * Returns null when there is no position, because a ladder with no rungs is
 * worse than none: it would animate the camera to nowhere and look broken.
 */
export function genericZoomPath(record) {
  /*
   * `Number(null)` is 0, not NaN, so coercing first would turn a missing
   * position into 0,0 — Null Island, in the Gulf of Guinea. An event with no
   * coordinates would have been placed there and drawn as if it were real, so
   * the type is checked before the coercion.
   */
  const rawLat = record?.latitude;
  const rawLon = record?.longitude;
  if (typeof rawLat !== 'number' || typeof rawLon !== 'number') return null;
  const lat = rawLat;
  const lon = rawLon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const country = record?.country ?? 'the affected country';
  return Object.freeze([
    rung({
      level: 0,
      name: 'World',
      kind: 'GLOBAL',
      lat: 20,
      lon: 60,
      altKm: 22_000,
      reveals: 'Where in the world this sits.',
    }),
    rung({
      level: 1,
      name: 'Region',
      kind: 'REGION',
      lat,
      lon,
      altKm: 2800,
      reveals: 'The surrounding region and its neighbours.',
      note: 'Derived from the event position; this case has no authored regional geography.',
    }),
    rung({
      level: 2,
      name: country,
      kind: 'COUNTRY',
      lat,
      lon,
      altKm: 900,
      reveals:
        'The country and its borders, with the event placed against them.',
    }),
    rung({
      level: 4,
      name: 'Affected area',
      kind: 'DISTRICT',
      lat,
      lon,
      altKm: 120,
      reveals: 'The area around the reported position.',
      note: 'No province or district boundary is authored for a live case, so this rung is a radius rather than an administrative area.',
    }),
    rung({
      level: 6,
      name: 'Reported location',
      kind: 'SITE',
      lat,
      lon,
      altKm: 14,
      reveals: 'The coordinates the feed reported.',
      note: 'A feed position, not a surveyed impact site.',
    }),
  ]);
}

/**
 * Severity, for ordering the explorer.
 *
 * Deliberately crude and deliberately explained: a single ordering over
 * incomparable hazards is a convenience, not a measurement. Confirmed deaths
 * dominate because they are the one figure that means the same thing across
 * every hazard type; a modelled alert level is a weaker signal and ranks
 * below any confirmed toll.
 */
export function severityRank(entry) {
  const deaths = entry?.confirmed?.deaths?.value;
  if (Number.isFinite(deaths) && deaths > 0) {
    return {
      score: 1000 + Math.log10(deaths + 1) * 100,
      basis: 'confirmed deaths',
    };
  }
  const alertSeverity = { red: 3, orange: 2, yellow: 1, green: 0 };
  const alert =
    entry?.modelled?.fatalityAlert?.value ?? entry?.modelled?.alertLevel?.value;
  if (alert && alert in alertSeverity) {
    return {
      score: 500 + alertSeverity[alert] * 100,
      basis: 'modelled alert level',
    };
  }
  const population = entry?.modelled?.affectedPopulation?.value;
  if (Number.isFinite(population) && population > 0) {
    return {
      score: 200 + Math.log10(population + 1) * 10,
      basis: 'modelled affected population',
    };
  }
  return { score: 0, basis: 'no severity figure published' };
}

/**
 * How investigable a case is, as a fraction and a sentence.
 *
 * §2 asks for "data availability" on each case. This is that, computed rather
 * than asserted: the count of dimensions that have any source at all.
 */
export function investigability(entry) {
  const availability = entry?.dataAvailability ?? {};
  const rated = DIMENSIONS.map((dimension) => ({
    ...dimension,
    availability: availability[dimension.id] ?? AVAILABILITY.UNAVAILABLE,
  }));
  const supported = rated.filter(
    (item) => item.availability !== AVAILABILITY.UNAVAILABLE,
  );
  return Object.freeze({
    dimensions: Object.freeze(rated),
    supported: supported.length,
    total: DIMENSIONS.length,
    fraction: supported.length / DIMENSIONS.length,
    summary:
      supported.length === DIMENSIONS.length
        ? 'Every dimension has a source.'
        : `${supported.length} of ${DIMENSIONS.length} dimensions have a source. The rest are shown as unavailable, with what would be needed.`,
  });
}

/**
 * Build the explorer's list.
 *
 * Curated cases first regardless of score — they are the ones that can carry a
 * full investigation, and burying them under a week of green GDACS alerts
 * would make the platform look empty. Within each group, by severity.
 *
 * @param {object} [input]
 * @param {Array<object>} [input.liveRecords] normalised GDACS records
 * @param {string|null} [input.hazardFilter]
 * @param {string|null} [input.countryFilter]
 */
export function buildCatalogue({
  liveRecords = [],
  hazardFilter = null,
  countryFilter = null,
} = {}) {
  const live = liveRecords.map(caseFromGdacs).filter(Boolean);
  const decorate = (entry) => {
    const rank = severityRank(entry);
    return Object.freeze({
      ...entry,
      hazard: hazard(entry.hazardId),
      severity: rank,
      investigability: investigability(entry),
      /** Only a case with a ladder can actually be entered. */
      enterable: Array.isArray(entry.zoomPath) && entry.zoomPath.length > 1,
    });
  };
  const all = [...CURATED_CASES.map(decorate), ...live.map(decorate)];
  const filtered = all.filter((entry) => {
    if (hazardFilter && entry.hazardId !== hazardFilter) return false;
    if (
      countryFilter &&
      String(entry.country ?? '').toLowerCase() !== countryFilter.toLowerCase()
    ) {
      return false;
    }
    return true;
  });
  const curated = filtered.filter((entry) => !entry.isLive);
  const liveCases = filtered.filter((entry) => entry.isLive);
  const bySeverity = (a, b) => b.severity.score - a.severity.score;
  return Object.freeze({
    cases: Object.freeze([
      ...curated.sort(bySeverity),
      ...liveCases.sort(bySeverity),
    ]),
    counts: Object.freeze({
      total: filtered.length,
      curated: curated.length,
      live: liveCases.length,
    }),
    /** Hazard types actually present, for the filter chips. */
    hazardsPresent: Object.freeze([
      ...new Set(all.map((entry) => entry.hazardId)),
    ]),
    countriesPresent: Object.freeze([
      ...new Set(all.map((entry) => entry.country).filter(Boolean)),
    ]),
  });
}

/**
 * The data class a dimension's availability corresponds to.
 *
 * Keeps §5's labels and the existing provenance vocabulary in one mapping
 * rather than two that can drift.
 */
export function dataClassFor(availability) {
  switch (availability) {
    case AVAILABILITY.LIVE:
      return DataClass.LIVE;
    case AVAILABILITY.CONFIRMED:
    case AVAILABILITY.HISTORICAL:
      return DataClass.HISTORICAL;
    case AVAILABILITY.MODELLED:
      return DataClass.SIMULATED;
    case AVAILABILITY.ESTIMATED:
      return DataClass.INFERRED;
    default:
      return DataClass.UNKNOWN;
  }
}
