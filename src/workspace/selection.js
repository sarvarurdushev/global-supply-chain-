/**
 * What a globe selection means, in the panel's terms.
 *
 * Split out of `globeAdapter.js` so it can be tested without Cesium — the
 * adapter itself imports Cesium and therefore cannot be loaded under plain
 * Node, and this is where all the logic worth testing lives.
 *
 * THE CONTRACT, which every layer in this application follows when it publishes
 * a selection through `src/data/contextStore.js`:
 *
 *   { id, layerId, layerName, source, label, latitude, longitude, properties }
 *
 * `properties` is flat text by design. The layers keep it that way because the
 * voice payload runs it through a cleaner that drops nested objects, and that
 * makes it exactly the shape a facts list wants.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

/** Tracking layers, and the param each uses to name its followed subject. */
export const TRACKING_PARAMS = Object.freeze([
  ['flights', 'selectedFlightsTrackingId'],
  ['military', 'selectedMilitaryTrackingId'],
  ['satellites', 'selectedSatTrackingId'],
]);

/**
 * Human-readable kind for a selection, from the layer that published it.
 *
 * Falls back to the raw layer id rather than guessing a friendly word: a wrong
 * noun on a selection card is worse than an unfamiliar one.
 */
const KIND_BY_LAYER = Object.freeze({
  flights: 'Aircraft',
  military: 'Military aircraft',
  'ais-live-vessels': 'Vessel',
  satellites: 'Satellite',
  'supply-ports': 'Port',
  chokepoints: 'Chokepoint',
  'supply-events': 'Hazard event',
  'trade-flows': 'Trade flow',
  transit: 'Transit vehicle',
  earthquakes: 'Earthquake',
});

/** The workspace nav item a selection should switch the panel to. */
const NAV_BY_LAYER = Object.freeze({
  flights: 'aircraft',
  military: 'aircraft',
  'ais-live-vessels': 'ships',
  satellites: 'satellites',
  transit: 'trains',
  'supply-ports': 'hubs',
  chokepoints: 'chokepoints',
  'supply-events': 'events',
});

/**
 * Cargo is the question every vessel selection provokes, and AIS cannot answer
 * it. Saying so on the card is cheaper than letting a user conclude the app
 * simply failed to load it.
 */
const CAVEAT_BY_LAYER = Object.freeze({
  'ais-live-vessels':
    'AIS carries no cargo field. Vessel type narrows the category; it is not a manifest.',
  flights:
    'ADS-B carries no payload information. Route is from the flight plan where one is broadcast.',
  'supply-events': 'Proximity to infrastructure is exposure, not impact.',
});

/**
 * Humanise a `properties` key for display.
 *
 * The layers use terse camelCase keys (`speedKt`, `icao24`, `vesselType`).
 * Splitting on case and capitalising is enough — and a small allow-list covers
 * the acronyms that a naive split mangles into "Icao 24".
 */
const PROPERTY_LABELS = Object.freeze({
  mmsi: 'MMSI',
  icao24: 'ICAO24',
  imo: 'IMO',
  unlocode: 'UN/LOCODE',
  iso3: 'ISO3',
  speedKt: 'Speed',
  altitudeM: 'Altitude',
  noradId: 'NORAD ID',
});

function propertyLabel(key) {
  if (PROPERTY_LABELS[key]) return PROPERTY_LABELS[key];
  // Sentence case, not title case: "Harbor size" sits beside "Position" and
  // "Feed" without looking like a heading. Splitting camelCase leaves the inner
  // capital behind, so it is lowered explicitly.
  const spaced = String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Turn a context record into what the panel shows.
 *
 * READS THE REAL CONTRACT, which every layer in this application follows:
 *
 *   { id, layerId, layerName, source, label, latitude, longitude, properties }
 *
 * `properties` is already flat text by design — the layers keep it that way
 * because the voice payload runs it through a cleaner that drops nested
 * objects — so it is exactly the shape a facts list wants and is rendered
 * wholesale rather than cherry-picked.
 *
 * An earlier version of this function invented its own field names (`lat`,
 * `speedKnots`, `vesselType`) and read none of the above. A vessel selection
 * showed its id and nothing else, which looked like a feed problem.
 *
 * @param {object} record a context-store record
 * @returns {object|null}
 */
export function describeSelection(record) {
  if (!record?.id) return null;
  const layerId = record.layerId ?? null;

  const facts = {};
  const put = (label, value) => {
    if (value === null || value === undefined) return;
    const text = String(value).trim();
    // Layers write '' for a field they could not determine. An empty row is
    // worse than an absent one: it reads as a value of nothing.
    if (!text) return;
    facts[label] = text;
  };

  for (const [key, value] of Object.entries(record.properties ?? {})) {
    if (typeof value === 'object') continue;
    put(propertyLabel(key), value);
  }
  put(
    'Position',
    Number.isFinite(record.latitude) && Number.isFinite(record.longitude)
      ? `${record.latitude.toFixed(3)}, ${record.longitude.toFixed(3)}`
      : null,
  );
  put('Feed', record.source);

  return Object.freeze({
    id: String(record.id),
    layerId,
    kind: KIND_BY_LAYER[layerId] ?? record.layerName ?? layerId ?? 'Selection',
    label: record.label ?? record.name ?? String(record.id),
    latitude: Number.isFinite(record.latitude) ? record.latitude : null,
    longitude: Number.isFinite(record.longitude) ? record.longitude : null,
    facts,
    caveat: CAVEAT_BY_LAYER[layerId] ?? null,
    navId: NAV_BY_LAYER[layerId] ?? null,
  });
}
