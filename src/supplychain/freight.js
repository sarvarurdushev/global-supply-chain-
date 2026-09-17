/**
 * Inland freight infrastructure, from OpenStreetMap.
 *
 * WHY THIS FILE EXISTS. Five of the ten supply-chain stages had no position, so
 * the route drew half a chain: a ship leg between two ports, and gaps where the
 * mine, the refinery, the railhead, the motorway and the freight airport should
 * be. The audit called that "no open global dataset for inland freight", which
 * was too quick. There is no open global dataset for inland freight TONNAGE.
 * The infrastructure itself is mapped, in detail, worldwide, under a licence
 * that allows this use — and the repository already had a validated Overpass
 * transport for it.
 *
 * WHAT IS REAL AND WHAT IS STILL MISSING. Measured on the live API before any of
 * this was written:
 *
 *   railway=rail + usage=main|branch   19,027 ways across the Rhine-Ruhr
 *   man_made=pipeline + substance      2.8 MB of geometry across Iraq/Kuwait
 *   landuse=quarry, man_made=mineshaft 92 sites in the Atacama, 63 named,
 *                                      tagged `resource=copper`
 *
 * So the LOCATIONS are real, surveyed and attributable. What no OSM tag carries
 * is how much moves: no tonne-km on a rail corridor, no throughput on a
 * pipeline, no annual output on a mine. Every record built here declares that
 * split rather than implying the second from the first, because a line drawn
 * between two real places invites exactly the reading it cannot support.
 *
 * COVERAGE IS UNEVEN AND THAT IS PART OF THE DATA. OSM is volunteer-surveyed.
 * Western Europe's rail network is close to complete; parts of central Africa
 * are close to empty. An empty result means "nobody has mapped this here", not
 * "there is nothing here", and the layers say so instead of showing a blank.
 *
 * Portable: no Cesium, no Node, no browser globals. Query construction and
 * decoding only — the transport is injected.
 */

import { DataClass, createProvenance } from './provenance.js';

/**
 * The widest box the Overpass proxy will accept, in degrees.
 *
 * `server/providers/overpass/constants.js` rejects anything above 12°, and the
 * traffic layer uses 10°. Freight corridors are continental, so this asks for
 * the full allowance and the callers clamp to it rather than having a request
 * refused at the proxy.
 */
export const MAX_BBOX_DEG = 12;

/** Overpass QL server-side timeout ceiling the proxy permits, in seconds. */
export const MAX_QL_TIMEOUT_SEC = 30;

/**
 * The freight networks, as query recipes.
 *
 * Each entry is the whole definition of one layer's data: what to ask OSM for,
 * what the result means, what it cannot tell you, and what it would take to
 * know the missing part. Keeping the caveat next to the query is deliberate —
 * they get read together or the caveat gets lost.
 */
export const FREIGHT_NETWORKS = Object.freeze({
  rail: Object.freeze({
    id: 'freight-rail',
    name: 'Freight Rail Corridors',
    kind: 'line',
    icon: '🛤',
    /*
     * `usage=main` is the tag surveyors use for a trunk line as opposed to a
     * siding, a yard headshunt or an industrial spur. Without it the query
     * returns every metre of track in a marshalling yard, which is both
     * enormous and useless at corridor scale: the Rhine-Ruhr probe came back
     * with 19,027 ways and 26 MB.
     */
    query: (bbox, timeoutSec) =>
      `[out:json][timeout:${timeoutSec}];(way["railway"="rail"]["usage"="main"](${bboxArgs(bbox)}););out geom qt;`,
    reads: 'Main-line railway, as surveyed by OpenStreetMap contributors.',
    affectsSupplyChain:
      'Rail is how bulk cargo crosses a continent between a port and an inland market. A corridor with no rail link moves its freight by road, which costs more per tonne and is more easily cut.',
    measures: [
      'where the main lines run',
      'gauge and electrification, where tagged',
    ],
    missing: [
      'tonne-kilometres, train counts and capacity utilisation',
      'which commodity any particular train is carrying',
    ],
    wouldNeed:
      'National rail-freight statistics (Eurostat rail_go_*, US STB waybill sample, China Railway yearbooks). Each is published per country, on its own schedule, in its own units, and none of them is a live feed.',
  }),
  roads: Object.freeze({
    id: 'freight-roads',
    name: 'Road Freight Corridors',
    kind: 'line',
    icon: '🛣',
    /*
     * Motorway and trunk only. `primary` and below is city and regional
     * traffic, which the inherited Road Traffic layer already covers at
     * metropolitan scale; this is the long-haul network.
     */
    query: (bbox, timeoutSec) =>
      `[out:json][timeout:${timeoutSec}];(way["highway"~"^(motorway|trunk)$"](${bboxArgs(bbox)}););out geom qt;`,
    reads:
      'Motorway and trunk road, as surveyed by OpenStreetMap contributors.',
    affectsSupplyChain:
      'Almost every container finishes its journey on a lorry. The trunk network is what connects a port to the places the cargo is actually going.',
    measures: ['where the long-haul roads run'],
    missing: [
      'freight volume, axle loads and heavy-goods-vehicle counts',
      'live congestion — that is the separate Road Traffic layer, and only in covered cities',
    ],
    wouldNeed:
      'Weigh-in-motion or toll-gantry counts. These exist per road operator, are usually commercial, and have no global aggregator.',
  }),
  pipelines: Object.freeze({
    id: 'pipelines',
    name: 'Oil & Gas Pipelines',
    kind: 'line',
    icon: '⛽',
    /*
     * `substance` filters out water mains, sewage and district heating, which
     * dominate `man_made=pipeline` in any populated bbox and are not supply
     * chain in the sense meant here.
     */
    query: (bbox, timeoutSec) =>
      `[out:json][timeout:${timeoutSec}];(way["man_made"="pipeline"]["substance"~"^(oil|gas|petroleum|natural_gas|fuel|hydrogen|cng|lng)$"](${bboxArgs(bbox)}););out geom qt;`,
    reads:
      'Oil, gas and fuel pipeline routes, as surveyed by OpenStreetMap contributors.',
    affectsSupplyChain:
      'A pipeline is a supply chain with no ship in it: it cannot be rerouted, so where it goes is a fixed dependency for everyone at the far end. It is also the reason a chokepoint can be bypassed — or cannot.',
    measures: [
      'where the pipelines run',
      'substance and operator, where tagged',
    ],
    missing: [
      'flow rate, direction, diameter-derived capacity and current utilisation',
      'whether a given pipeline is in service at all',
    ],
    wouldNeed:
      'Operator SCADA data or a regulator’s nomination system (for example ENTSOG’s transparency platform for EU gas). Nothing equivalent is published globally.',
  }),
  production: Object.freeze({
    id: 'production-sites',
    name: 'Mines, Quarries & Refineries',
    kind: 'point',
    icon: '⛏',
    /*
     * The extraction and processing stages the supply-chain route could not
     * place. `resource` is tagged on a good share of mines — the Atacama probe
     * came back with `resource=copper` on most of its 92 sites — which is what
     * lets a commodity actually be matched to a place rather than to a country
     * average.
     *
     * `out tags center` rather than `out geom`: a quarry is a polygon and its
     * centroid is what a marker needs. It keeps the payload small enough for a
     * 12° box.
     */
    query: (bbox, timeoutSec) => {
      const b = bboxArgs(bbox);
      return (
        `[out:json][timeout:${timeoutSec}];(` +
        `nwr["landuse"="quarry"](${b});` +
        `nwr["man_made"="mineshaft"](${b});` +
        `nwr["man_made"="works"](${b});` +
        `);out tags center qt;`
      );
    },
    reads:
      'Mines, quarries and industrial works, as surveyed by OpenStreetMap contributors.',
    affectsSupplyChain:
      'This is where the extraction and processing stages of a chain physically are. Until now the route drew a sea leg between two ports and left those stages empty, because nothing here could say where they were.',
    measures: [
      'where the sites are',
      'what a mine extracts and what a works produces, where tagged',
      'the operator, where tagged',
    ],
    missing: [
      'annual output, reserves, employment and whether the site is currently working',
      'which of a country’s exports came from which site',
    ],
    wouldNeed:
      'A facility-level production register. USGS Mineral Yearbooks and company reports carry output per mine but are annual PDFs, not an API, and they do not reconcile to OSM ids.',
  }),
});

/** Render a bbox as Overpass's `(south,west,north,east)` argument list. */
function bboxArgs({ south, west, north, east }) {
  return `${south},${west},${north},${east}`;
}

/**
 * Validate and clamp a viewport to what the proxy will accept.
 *
 * Returns null for anything unusable rather than throwing: the caller is a
 * camera-change handler, and a camera briefly pointing at the horizon should
 * skip a fetch, not raise.
 *
 * Clamping is centred, so a continental view fetches the middle 12° rather
 * than being refused outright.
 *
 * @param {{south:number,west:number,north:number,east:number}} bbox
 * @returns {{south:number,west:number,north:number,east:number,clamped:boolean}|null}
 */
export function clampBbox(bbox) {
  const { south, west, north, east } = bbox ?? {};
  if (![south, west, north, east].every(Number.isFinite)) return null;
  if (north <= south || east <= west) return null;
  if (south < -90 || north > 90 || west < -180 || east > 180) return null;

  let clamped = false;
  let s = south;
  let n = north;
  let w = west;
  let e = east;
  if (n - s > MAX_BBOX_DEG) {
    const mid = (n + s) / 2;
    s = mid - MAX_BBOX_DEG / 2;
    n = mid + MAX_BBOX_DEG / 2;
    clamped = true;
  }
  if (e - w > MAX_BBOX_DEG) {
    const mid = (e + w) / 2;
    w = mid - MAX_BBOX_DEG / 2;
    e = mid + MAX_BBOX_DEG / 2;
    clamped = true;
  }
  return { south: s, west: w, north: n, east: e, clamped };
}

/**
 * Build the Overpass query for one network over one viewport.
 *
 * @param {string} network key into FREIGHT_NETWORKS
 * @param {object} bbox
 * @param {number} [timeoutSec]
 * @returns {{query:string, bbox:object, network:object}|null}
 */
export function freightQuery(network, bbox, timeoutSec = 25) {
  const definition = FREIGHT_NETWORKS[network];
  if (!definition) return null;
  const box = clampBbox(bbox);
  if (!box) return null;
  const timeout = Math.min(
    MAX_QL_TIMEOUT_SEC,
    Math.max(1, Math.floor(timeoutSec)),
  );
  return {
    query: definition.query(box, timeout),
    bbox: box,
    network: definition,
  };
}

/** Tags worth carrying into a record, in the order a reader wants them. */
const LINE_TAGS = Object.freeze([
  'name',
  'operator',
  'substance',
  'gauge',
  'electrified',
  'usage',
  'ref',
  'railway',
  'highway',
  'man_made',
]);
const POINT_TAGS = Object.freeze([
  'name',
  'operator',
  'resource',
  'product',
  'landuse',
  'man_made',
  'industrial',
  'start_date',
]);

/**
 * Decode an Overpass response into freight line records.
 *
 * Ways with fewer than two points are dropped: they cannot be drawn, and a
 * one-point "corridor" is a mapping artefact rather than a short line.
 *
 * @param {object} payload raw Overpass JSON
 * @param {number} [maxLines] hard cap, newest-first is meaningless here so it
 *   is simply the first N — the caller's bbox is what bounds relevance
 * @returns {Array<object>}
 */
export function normalizeFreightLines(payload, maxLines = 4000) {
  const lines = [];
  for (const element of payload?.elements ?? []) {
    if (lines.length >= maxLines) break;
    if (element.type !== 'way') continue;
    const geometry = element.geometry;
    if (!Array.isArray(geometry) || geometry.length < 2) continue;
    const coordinates = geometry
      .filter(
        (point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lon),
      )
      .map((point) => [point.lon, point.lat]);
    if (coordinates.length < 2) continue;
    lines.push({
      osmId: `way/${element.id}`,
      coordinates,
      tags: pickTags(element.tags, LINE_TAGS),
    });
  }
  return lines;
}

/**
 * Decode an Overpass response into freight point records.
 *
 * `out tags center` gives a node its own lat/lon and a way or relation a
 * `center`, so both shapes are read here. Anything with neither is dropped: a
 * site with no position cannot be a site on a map.
 *
 * @param {object} payload raw Overpass JSON
 * @param {number} [maxPoints]
 * @returns {Array<object>}
 */
export function normalizeFreightPoints(payload, maxPoints = 1200) {
  const points = [];
  for (const element of payload?.elements ?? []) {
    if (points.length >= maxPoints) break;
    const lat = Number.isFinite(element?.lat)
      ? element.lat
      : element?.center?.lat;
    const lon = Number.isFinite(element?.lon)
      ? element.lon
      : element?.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const tags = pickTags(element.tags, POINT_TAGS);
    points.push({
      osmId: `${element.type}/${element.id}`,
      lat,
      lon,
      tags,
      kind: siteKind(element.tags),
    });
  }
  return points;
}

/**
 * What kind of production site this is.
 *
 * Derived from the tag that matched the query rather than guessed from the
 * name, so a works called "Escondida Refinery" is still reported as the tag
 * says it is.
 */
export function siteKind(tags = {}) {
  if (tags['landuse'] === 'quarry') return 'QUARRY';
  if (tags['man_made'] === 'mineshaft') return 'MINE';
  if (tags['man_made'] === 'works') return 'WORKS';
  return 'UNKNOWN';
}

/** Human-readable name for a site kind. */
export const SITE_KIND_LABELS = Object.freeze({
  QUARRY: 'Open-pit mine or quarry',
  MINE: 'Underground mine',
  WORKS: 'Industrial works or refinery',
  UNKNOWN: 'Mapped industrial site',
});

function pickTags(tags, keys) {
  if (!tags) return {};
  const out = {};
  for (const key of keys) {
    const value = tags[key];
    if (typeof value === 'string' && value.length > 0) out[key] = value;
  }
  return out;
}

/**
 * What a site is known to extract or produce, as free text or null.
 *
 * OSM's `resource` and `product` are semicolon-separated lists
 * (`gold;silver`), which is why this joins rather than returning the raw
 * string. Null when neither is tagged: a mine with no resource tag is a mine
 * whose commodity nobody recorded, and naming one would be inventing it.
 */
export function siteOutput(tags = {}) {
  const raw = tags['resource'] ?? tags['product'] ?? null;
  if (!raw) return null;
  const parts = raw
    .split(';')
    .map((part) => part.trim().replace(/_/g, ' '))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Provenance for one freight fetch.
 *
 * DataClass is HISTORICAL, not LIVE. OSM is a survey: a pipeline mapped in 2019
 * is still in the database in 2026 whether or not it still carries anything.
 * Calling it LIVE because the HTTP request was live is precisely the
 * mislabelling §23 exists to prevent.
 *
 * @param {object} input
 * @param {object} input.network entry from FREIGHT_NETWORKS
 * @param {object} input.bbox the box actually queried
 * @param {number} input.count records returned
 * @param {boolean} [input.clamped] the viewport was wider than the proxy allows
 * @param {string} input.retrievedAt
 */
export function freightProvenance({
  network,
  bbox,
  count,
  clamped = false,
  retrievedAt,
}) {
  const limitations = [
    'LOCATIONS ONLY. ' +
      network.missing
        .map((item) => item[0].toUpperCase() + item.slice(1))
        .join('. ') +
      '.',
    'VOLUNTEER COVERAGE. OpenStreetMap is surveyed by contributors, and how ' +
      'completely depends entirely on where you are looking. An empty result ' +
      'means nobody has mapped this here, not that there is nothing here.',
    'NO CURRENCY GUARANTEE. Features are added when someone surveys them and ' +
      'are rarely removed when they close. A mapped site may be disused.',
    `To measure throughput instead of position: ${network.wouldNeed}`,
  ];
  if (clamped) {
    limitations.push(
      `VIEW TRUNCATED. The camera covered more than ${MAX_BBOX_DEG}° and the ` +
        'query was narrowed to the middle of the view. Features outside that ' +
        'band were not requested.',
    );
  }
  return createProvenance({
    dataClass: DataClass.HISTORICAL,
    source: 'OpenStreetMap',
    dataset: `${network.name} within ${describeBbox(bbox)}`,
    license:
      'ODbL 1.0. © OpenStreetMap contributors — openstreetmap.org/copyright. ' +
      'Derived works must carry the same licence.',
    method:
      'Overpass API query for the tags that identify this network, bounded to ' +
      'the current view. Geometry is as contributors surveyed it; nothing is ' +
      'interpolated, smoothed or inferred.',
    retrievedAt,
    updateFrequency: 'continuous editing; no release schedule',
    // Position is well attested, and position is all this claims.
    confidence: 0.75,
    limitations,
    notes: `${count.toLocaleString()} features returned.`,
  });
}

function describeBbox({ south, west, north, east }) {
  const fmt = (value, positive, negative) =>
    `${Math.abs(value).toFixed(1)}°${value >= 0 ? positive : negative}`;
  return `${fmt(south, 'N', 'S')}–${fmt(north, 'N', 'S')}, ${fmt(west, 'E', 'W')}–${fmt(east, 'E', 'W')}`;
}
