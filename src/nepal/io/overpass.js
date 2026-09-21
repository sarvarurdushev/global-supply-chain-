/**
 * Reader for Overpass API JSON, for the road network Stage 5 routes on.
 *
 * Pure, like every other reader here: it takes a parsed response and returns
 * normalised segments. The tiling, the HTTP and the caching live in the
 * pipeline.
 *
 * WHY THIS PROJECT ASKS OVERPASS FOR 2015 AND NOT FOR TODAY. OpenStreetMap's
 * coverage of Nepal was transformed by the earthquake itself: the Humanitarian
 * OpenStreetMap Team activation added tens of thousands of features in the
 * weeks after 25 April 2015. A network downloaded today therefore contains
 * roads that were not mapped when the event happened, and some that did not
 * exist. Routing observed 2015 blockages over a 2026 network would measure a
 * road system that was never disrupted. Overpass's attic data — the database
 * as at a stated instant — lets the ingest ask for the network as it stood at
 * 2015-04-24T00:00:00Z, the day before the earthquake, which is the only
 * baseline that can be called a baseline.
 */

/** The road classes that carry movement between places, not within them. */
export const STRATEGIC_HIGHWAY_CLASSES = Object.freeze([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'motorway_link',
  'trunk_link',
  'primary_link',
  'secondary_link',
  'tertiary_link',
]);

/** The tags kept on each segment. Everything else is discarded at ingest. */
const KEPT_TAGS = Object.freeze([
  'highway',
  'name',
  'name:en',
  'ref',
  'bridge',
  'tunnel',
  'surface',
  'oneway',
  'maxspeed',
  'layer',
]);

/**
 * Normalise Overpass `out geom` ways into `{osmId, coordinates, tags}`.
 *
 * @param {object} payload a parsed Overpass JSON response
 * @param {object} [options]
 * @param {(issue:object)=>void} [options.onIssue] receives every rejection
 * @returns {{segments:Array<object>, read:number, kept:number, dropped:number}}
 *
 * Deduplication is by OSM way id, because a way whose nodes straddle a tile
 * boundary is returned in full by every tile it touches. Counting it twice
 * would inflate the network length and, worse, create duplicate edges that a
 * betweenness calculation would read as parallel capacity.
 */
export function parseOverpassWays(
  payload,
  { onIssue = () => {}, seen = new Set() } = {},
) {
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  const segments = [];
  let read = 0;
  let dropped = 0;
  for (const element of elements) {
    if (element?.type !== 'way') continue;
    read += 1;
    if (seen.has(element.id)) {
      dropped += 1;
      onIssue({ reason: 'duplicate way across tiles', id: element.id });
      continue;
    }
    const geometry = element.geometry;
    if (!Array.isArray(geometry) || geometry.length < 2) {
      dropped += 1;
      onIssue({ reason: 'way has fewer than two positions', id: element.id });
      continue;
    }
    /*
     * Overpass marks positions it could not resolve — a way clipped by the
     * bbox in an attic query can carry them. A null in the middle of a
     * polyline is a hole, and joining across it would invent a road, so the
     * whole way is refused rather than silently shortened.
     */
    if (
      geometry.some(
        (position) =>
          !Number.isFinite(position?.lon) || !Number.isFinite(position?.lat),
      )
    ) {
      dropped += 1;
      onIssue({ reason: 'way has unresolved positions', id: element.id });
      continue;
    }
    const tags = {};
    for (const key of KEPT_TAGS) {
      if (element.tags?.[key] !== undefined) tags[key] = element.tags[key];
    }
    if (!tags.highway) {
      dropped += 1;
      onIssue({ reason: 'way carries no highway tag', id: element.id });
      continue;
    }
    seen.add(element.id);
    segments.push({
      osmId: element.id,
      coordinates: geometry.map((position) => [
        Number(position.lon.toFixed(6)),
        Number(position.lat.toFixed(6)),
      ]),
      tags,
    });
  }
  return { segments, read, kept: segments.length, dropped };
}

/** Read the `out count` form, used to size a query before downloading it. */
export function parseOverpassCount(payload) {
  const element = (payload?.elements ?? []).find(
    (item) => item?.type === 'count',
  );
  if (!element) return null;
  return {
    ways: Number(element.tags?.ways ?? 0),
    nodes: Number(element.tags?.nodes ?? 0),
    relations: Number(element.tags?.relations ?? 0),
    total: Number(element.tags?.total ?? 0),
  };
}

/** The timestamp of the database the response was served from. */
export function overpassBaseTimestamp(payload) {
  return payload?.osm3s?.timestamp_osm_base ?? null;
}
