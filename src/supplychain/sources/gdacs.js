/**
 * GDACS event client.
 *
 * The Global Disaster Alert and Coordination System, run jointly by the
 * European Commission and the UN, publishes a live GeoJSON feed of disaster
 * events with no API key. It is the source that makes §15's event layer
 * possible after ACLED and EM-DAT both turned out to need registered accounts
 * (docs/DATA_AVAILABILITY_MATRIX.md §3).
 *
 * What it covers and what it does not, stated because the difference matters:
 *
 *   COVERED      earthquakes, tropical cyclones, floods, volcanoes, droughts,
 *                wildfires — natural hazards with a modelled alert level.
 *   NOT COVERED  strikes, port closures, sanctions, trade restrictions,
 *                conflict. Those are the human-caused disruptions §15 also
 *                asks for, and GDACS does not carry them. The layer says so
 *                rather than implying the absence of a strike marker means no
 *                strike occurred.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

import { DataClass, createProvenance } from '../provenance.js';
import { validatePoint } from '../geo.js';

export const GDACS_BASE = 'https://www.gdacs.org/gdacsapi/api';

/** Attribution required alongside any displayed GDACS figure. */
export const GDACS_ATTRIBUTION =
  'Source: GDACS — Global Disaster Alert and Coordination System (European Commission / UN)';

/** GDACS hazard type codes, with readable labels. */
export const EVENT_TYPES = Object.freeze({
  EQ: 'Earthquake',
  TC: 'Tropical cyclone',
  FL: 'Flood',
  VO: 'Volcano',
  DR: 'Drought',
  WF: 'Wildfire',
});

/**
 * GDACS alert levels, ordered by severity.
 *
 * These are GDACS's own modelled assessment of likely humanitarian impact, not
 * a measurement of the hazard itself. A Green earthquake can still be a large
 * earthquake in an unpopulated area.
 */
export const ALERT_LEVELS = Object.freeze(['Green', 'Orange', 'Red']);

/** Numeric rank for sorting and filtering. Unknown levels sort lowest. */
export function alertRank(level) {
  const index = ALERT_LEVELS.indexOf(level);
  return index === -1 ? -1 : index;
}

/** Thrown when GDACS rejects or malforms a response. */
export class GdacsError extends Error {
  constructor(message, { status = null } = {}) {
    super(message);
    this.name = 'GdacsError';
    this.status = status;
    this.retryable = status === 429 || (status !== null && status >= 500);
  }
}

/**
 * Normalize one GDACS feature.
 *
 * Returns null for a feature that cannot be trusted, so the caller can count
 * rejections rather than silently ingesting junk.
 *
 * @param {object} feature
 * @returns {object|null}
 */
export function normalizeEvent(feature) {
  if (!feature || typeof feature !== 'object') return null;
  const p = feature.properties;
  if (!p || typeof p !== 'object') return null;

  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lon = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  try {
    validatePoint({ lat, lon });
  } catch {
    return null;
  }

  const eventType = String(p.eventtype ?? '');
  if (!eventType) return null;
  const eventId =
    p.eventid === undefined || p.eventid === null ? null : String(p.eventid);
  if (!eventId) return null;

  const severity = p.severitydata ?? {};
  return Object.freeze({
    // Episode id distinguishes successive updates of the same event; including
    // it keeps a re-issued cyclone advisory from colliding with the original.
    id: `gdacs:${eventType}:${eventId}:${p.episodeid ?? '0'}`,
    eventId,
    eventType,
    eventLabel: EVENT_TYPES[eventType] ?? eventType,
    name: String(p.eventname || p.name || p.description || 'Unnamed event'),
    lat,
    lon,
    // GDACS's modelled impact assessment, not a hazard measurement.
    alertLevel: ALERT_LEVELS.includes(p.alertlevel) ? p.alertlevel : null,
    alertScore: Number.isFinite(Number(p.alertscore))
      ? Number(p.alertscore)
      : null,
    country: p.country ? String(p.country) : null,
    iso3: p.iso3 ? String(p.iso3) : null,
    affectedIso3: Object.freeze(
      Array.isArray(p.affectedcountries)
        ? p.affectedcountries.map((c) => c?.iso3).filter(Boolean)
        : [],
    ),
    fromDate: p.fromdate ?? null,
    toDate: p.todate ?? null,
    isCurrent: p.iscurrent === true || p.iscurrent === 'true',
    severity: Number.isFinite(Number(severity.severity))
      ? Number(severity.severity)
      : null,
    severityText: severity.severitytext ? String(severity.severitytext) : null,
    severityUnit: severity.severityunit ? String(severity.severityunit) : null,
    reportUrl: p.url?.report ? String(p.url.report) : null,
  });
}

/**
 * Validate and normalize a full GDACS response.
 *
 * @param {unknown} payload
 * @returns {{events:Array<object>, rejected:number}}
 */
export function normalizeEventFeed(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new GdacsError('Malformed GDACS response: not an object');
  }
  if (!Array.isArray(payload.features)) {
    throw new GdacsError('Malformed GDACS response: features is not an array');
  }
  const events = [];
  let rejected = 0;
  for (const feature of payload.features) {
    const event = normalizeEvent(feature);
    if (event) events.push(event);
    else rejected += 1;
  }
  // Most severe first: an operator scanning the list wants Red at the top.
  events.sort((a, b) => alertRank(b.alertLevel) - alertRank(a.alertLevel));
  return { events, rejected };
}

/**
 * Provenance for a GDACS result set.
 *
 * LIVE is legitimate here — unlike trade data, this is a current-hazard feed.
 */
export function gdacsProvenance({ dataset, retrievedAt, rejected = 0 }) {
  const limitations = [
    'GDACS covers NATURAL HAZARDS only: earthquakes, cyclones, floods, ' +
      'volcanoes, droughts and wildfires. It does NOT carry strikes, port ' +
      'closures, sanctions, trade restrictions or conflict, so the absence of ' +
      'a marker is not evidence that nothing happened.',
    'Alert level is GDACS’s modelled estimate of likely humanitarian ' +
      'impact, not a measurement of the hazard. A Green earthquake may still ' +
      'be a large earthquake in an unpopulated area.',
    'The feed returns recent events only. It is not a historical archive, and ' +
      'it cannot be used to reconstruct a past period.',
  ];
  if (rejected > 0) {
    limitations.push(
      `${rejected} feature(s) failed validation and were discarded.`,
    );
  }
  return createProvenance({
    dataClass: DataClass.LIVE,
    source: 'GDACS',
    dataset,
    license: `GDACS terms of use. ${GDACS_ATTRIBUTION}`,
    method:
      'Direct read of the public GDACS event feed, validated and normalized.',
    retrievedAt,
    updateFrequency: 'continuous; events are re-issued as episodes',
    confidence: 0.9,
    limitations,
  });
}

/**
 * Create a GDACS source.
 *
 * @param {object} [options]
 * @param {(url:string, init?:object)=>Promise<Response>} [options.fetchImpl]
 * @param {string} [options.baseUrl]
 * @param {()=>string} [options.now]
 * @returns {{getEvents:Function}}
 */
export function createGdacsSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  baseUrl = GDACS_BASE,
  now = () => new Date().toISOString(),
} = {}) {
  return {
    /**
     * Current events.
     *
     * @param {object} [options]
     * @param {AbortSignal} [options.signal]
     * @returns {Promise<{events:Array<object>, rejected:number, provenance:object}>}
     */
    async getEvents({ signal } = {}) {
      signal?.throwIfAborted();
      const url = `${baseUrl}/events/geteventlist/EVENTS4APP`;
      const response = await fetchImpl(url, { signal });
      signal?.throwIfAborted();
      if (!response.ok) {
        throw new GdacsError(`GDACS HTTP ${response.status}`, {
          status: response.status,
        });
      }
      const payload = await response.json();
      signal?.throwIfAborted();
      const { events, rejected } = normalizeEventFeed(payload);
      return {
        events,
        rejected,
        provenance: gdacsProvenance({
          dataset: url,
          retrievedAt: now(),
          rejected,
        }),
      };
    },
  };
}

/**
 * Link events to the supply-chain infrastructure near them.
 *
 * This is the §15 requirement to "connect events to supply-chain nodes where
 * evidence exists", and the wording of that requirement is the whole design:
 * proximity is evidence of EXPOSURE, not of impact. A cyclone 200 km from a
 * port may close it for a week or miss it entirely, and this function cannot
 * tell the difference. It returns distances and says so.
 *
 * @param {object} input
 * @param {Array<object>} input.events
 * @param {Array<{id:string,name:string,lat:number,lon:number}>} input.nodes
 * @param {(a:object,b:object)=>number} input.distanceKm
 * @param {number} [input.radiusKm=500]
 * @param {number} [input.maxPerEvent=5]
 * @returns {Array<object>} events with a `nearby` array attached
 */
export function linkEventsToNodes({
  events,
  nodes,
  distanceKm,
  radiusKm = 500,
  maxPerEvent = 5,
}) {
  if (!Array.isArray(events) || !Array.isArray(nodes)) {
    throw new TypeError('events and nodes must be arrays');
  }
  if (typeof distanceKm !== 'function') {
    throw new TypeError('a distanceKm function is required');
  }
  return events.map((event) => {
    const nearby = [];
    for (const node of nodes) {
      const km = distanceKm(
        { lat: event.lat, lon: event.lon },
        { lat: node.lat, lon: node.lon },
      );
      if (km <= radiusKm) {
        nearby.push({
          id: node.id,
          name: node.name,
          distanceKm: km,
          kind: node.kind ?? null,
        });
      }
    }
    nearby.sort((a, b) => a.distanceKm - b.distanceKm);
    return Object.freeze({
      ...event,
      nearby: Object.freeze(nearby.slice(0, maxPerEvent)),
      nearbyCount: nearby.length,
      // Named so a caller cannot mistake it for an impact assessment.
      proximityCaveat:
        'Proximity indicates EXPOSURE, not impact. This says the ' +
        'infrastructure is near the event, not that it was affected.',
    });
  });
}
