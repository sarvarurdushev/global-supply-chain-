/**
 * Coordinate reference systems for the Nepal study area.
 *
 * Two facts force this module to exist. The UNOSAT package ships geographic
 * WGS 84 and UTM Zone 45N inside the SAME archive, so an ingest that assumed
 * one CRS would place the NGA blocked roads in the Gulf of Guinea. And §5
 * requires distance and area to be computed in a projected system, because a
 * degree of longitude at 28 N is 0.88 of a degree of latitude and an area
 * computed in square degrees is not an area.
 *
 * Policy, stated once and enforced by the helpers below:
 *
 *   STORE and SERVE   EPSG:4326  (WGS 84 geographic)
 *   MEASURE           EPSG:32645 (WGS 84 / UTM zone 45N)
 *
 * Zone 45N spans 84 E to 90 E, which contains Kathmandu (85.3 E), the Gorkha
 * epicentre (84.7 E) and every damage AOI. Pokhara sits at 83.99 E, just
 * outside — `utmZoneFor` reports the true zone so that a caller measuring
 * there is told it is using a neighbouring zone's projection rather than
 * being quietly given a distorted number.
 */

/** WGS 84 ellipsoid. */
const A = 6378137.0;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const K0 = 0.9996;
const FALSE_EASTING = 500000;
const FALSE_NORTHING_SOUTH = 10000000;

export const EPSG_WGS84 = 4326;
/** The measurement CRS for this project. */
export const EPSG_UTM45N = 32645;
export const STUDY_AREA_ZONE = 45;

/** The zone a longitude really belongs to. */
export function utmZoneFor(lon) {
  return Math.floor(((((lon + 180) % 360) + 360) % 360) / 6) + 1;
}

/**
 * Geographic -> UTM.
 *
 * @param {number} lon degrees
 * @param {number} lat degrees
 * @param {number} [zone] defaults to the study-area zone, NOT the true zone —
 *   a study area must be measured in ONE projection or its internal distances
 *   do not compose
 * @returns {{easting:number, northing:number, zone:number, north:boolean, outsideZone:boolean}}
 */
export function toUtm(lon, lat, zone = STUDY_AREA_ZONE) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new TypeError(`toUtm needs finite degrees, got (${lon}, ${lat}).`);
  }
  const north = lat >= 0;
  const lonOrigin = (zone - 1) * 6 - 180 + 3;
  const rlat = (lat * Math.PI) / 180;
  const dLon = ((lon - lonOrigin) * Math.PI) / 180;

  const ep2 = E2 / (1 - E2);
  const N = A / Math.sqrt(1 - E2 * Math.sin(rlat) ** 2);
  const T = Math.tan(rlat) ** 2;
  const C = ep2 * Math.cos(rlat) ** 2;
  const Aa = Math.cos(rlat) * dLon;

  const M =
    A *
    ((1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256) * rlat -
      ((3 * E2) / 8 + (3 * E2 ** 2) / 32 + (45 * E2 ** 3) / 1024) *
        Math.sin(2 * rlat) +
      ((15 * E2 ** 2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * rlat) -
      ((35 * E2 ** 3) / 3072) * Math.sin(6 * rlat));

  const easting =
    K0 *
      N *
      (Aa +
        ((1 - T + C) * Aa ** 3) / 6 +
        ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * Aa ** 5) / 120) +
    FALSE_EASTING;

  let northing =
    K0 *
    (M +
      N *
        Math.tan(rlat) *
        (Aa ** 2 / 2 +
          ((5 - T + 9 * C + 4 * C ** 2) * Aa ** 4) / 24 +
          ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * Aa ** 6) / 720));
  if (!north) northing += FALSE_NORTHING_SOUTH;

  return {
    easting,
    northing,
    zone,
    north,
    outsideZone: utmZoneFor(lon) !== zone,
  };
}

/**
 * UTM -> geographic. This is the direction the NGA layers need.
 *
 * @returns {[number, number]} `[lon, lat]`, GeoJSON order
 */
export function fromUtm(
  easting,
  northing,
  zone = STUDY_AREA_ZONE,
  north = true,
) {
  if (!Number.isFinite(easting) || !Number.isFinite(northing)) {
    throw new TypeError(
      `fromUtm needs finite metres, got (${easting}, ${northing}).`,
    );
  }
  const x = easting - FALSE_EASTING;
  const y = north ? northing : northing - FALSE_NORTHING_SOUTH;
  const lonOrigin = (zone - 1) * 6 - 180 + 3;

  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const M = y / K0;
  const mu = M / (A * (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const ep2 = E2 / (1 - E2);
  const C1 = ep2 * Math.cos(phi1) ** 2;
  const T1 = Math.tan(phi1) ** 2;
  const N1 = A / Math.sqrt(1 - E2 * Math.sin(phi1) ** 2);
  const R1 = (A * (1 - E2)) / (1 - E2 * Math.sin(phi1) ** 2) ** 1.5;
  const D = x / (N1 * K0);

  const lat =
    phi1 -
    ((N1 * Math.tan(phi1)) / R1) *
      (D ** 2 / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) *
          D ** 6) /
          720);

  const lon =
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5) /
        120) /
    Math.cos(phi1);

  return [lonOrigin + (lon * 180) / Math.PI, (lat * 180) / Math.PI];
}

/** Reproject a GeoJSON geometry in place-free fashion, UTM -> WGS 84. */
export function geometryFromUtm(
  geometry,
  zone = STUDY_AREA_ZONE,
  north = true,
) {
  if (!geometry) return null;
  const convert = (position) => fromUtm(position[0], position[1], zone, north);
  return Object.freeze({
    type: geometry.type,
    coordinates: mapPositions(geometry.coordinates, convert),
  });
}

function mapPositions(coordinates, convert) {
  if (typeof coordinates[0] === 'number') return convert(coordinates);
  return coordinates.map((item) => mapPositions(item, convert));
}

/**
 * Planar distance in metres between two geographic points, via UTM.
 *
 * Correct to well under a metre inside a zone, which is far below the
 * positional accuracy of anything in this project, and unlike a haversine on a
 * sphere it composes with the areas computed below.
 */
export function distanceMetres(lonA, latA, lonB, latB, zone = STUDY_AREA_ZONE) {
  const a = toUtm(lonA, latA, zone);
  const b = toUtm(lonB, latB, zone);
  return Math.hypot(a.easting - b.easting, a.northing - b.northing);
}

/**
 * Area of a geographic ring in square metres, computed in UTM.
 *
 * The shoelace formula on longitude/latitude returns square degrees, which is
 * not a unit of area; at 28 N it over-reads by roughly 13 % in one axis alone.
 */
export function ringAreaSqMetres(ring, zone = STUDY_AREA_ZONE) {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  const projected = ring.map(([lon, lat]) => {
    const p = toUtm(lon, lat, zone);
    return [p.easting, p.northing];
  });
  let sum = 0;
  for (
    let i = 0, j = projected.length - 1;
    i < projected.length;
    j = i, i += 1
  ) {
    sum +=
      projected[j][0] * projected[i][1] - projected[i][0] * projected[j][1];
  }
  return Math.abs(sum / 2);
}
