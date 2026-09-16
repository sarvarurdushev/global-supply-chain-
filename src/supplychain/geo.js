/**
 * Geodesy for supply-chain route maths.
 *
 * Portable: no Cesium, no Node, no browser globals. The supply-chain engine must
 * run identically under `node --test`, in the browser and in a batch job, so it
 * cannot borrow Cesium's ellipsoid maths.
 *
 * Distances use the spherical-earth (haversine) model with the IUGG mean radius,
 * 6371.0088 km. Against WGS84 geodesics this carries up to ~0.5% error, which is
 * immaterial next to the uncertainty already present in the route model itself
 * (see docs/ROUTE_OPTIMIZATION.md §"Known error sources"). It is documented rather
 * than silently accepted.
 */

/** IUGG arithmetic mean radius of the WGS84 ellipsoid, in kilometres. */
export const EARTH_MEAN_RADIUS_KM = 6371.0088;

const DEG = Math.PI / 180;

/** Reject anything that is not a finite number. */
function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}

/**
 * Validate a geographic position.
 *
 * Coordinate validation is a hard requirement: a swapped lat/lon pair silently
 * produces a plausible-looking but wrong route, which is exactly the class of
 * error this project must not ship.
 *
 * @param {{lat:number, lon:number}} point
 * @returns {{lat:number, lon:number}} the same values, validated
 */
export function validatePoint(point) {
  if (!point || typeof point !== 'object') {
    throw new TypeError('A position requires { lat, lon }');
  }
  const lat = finite(point.lat, 'lat');
  const lon = finite(point.lon, 'lon');
  if (lat < -90 || lat > 90) {
    throw new RangeError(`lat out of range: ${lat}`);
  }
  if (lon < -180 || lon > 180) {
    throw new RangeError(`lon out of range: ${lon}`);
  }
  return { lat, lon };
}

/**
 * Great-circle distance between two positions, in kilometres.
 *
 * Uses haversine, which stays numerically stable for the short separations where
 * the spherical law of cosines degrades.
 *
 * @param {{lat:number, lon:number}} a
 * @param {{lat:number, lon:number}} b
 * @returns {number} kilometres
 */
export function haversineKm(a, b) {
  const p = validatePoint(a);
  const q = validatePoint(b);
  const dLat = (q.lat - p.lat) * DEG;
  const dLon = (q.lon - p.lon) * DEG;
  const lat1 = p.lat * DEG;
  const lat2 = q.lat * DEG;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * EARTH_MEAN_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Initial bearing from `a` to `b`, in degrees clockwise from true north.
 * @returns {number} 0 <= bearing < 360
 */
export function initialBearingDeg(a, b) {
  const p = validatePoint(a);
  const q = validatePoint(b);
  const lat1 = p.lat * DEG;
  const lat2 = q.lat * DEG;
  const dLon = (q.lon - p.lon) * DEG;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

/**
 * Total length of an ordered polyline, in kilometres.
 * A path of fewer than two points has zero length.
 *
 * @param {Array<{lat:number, lon:number}>} points
 * @returns {number} kilometres
 */
export function pathLengthKm(points) {
  if (!Array.isArray(points)) {
    throw new TypeError('A path requires an array of positions');
  }
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineKm(points[i - 1], points[i]);
  }
  return total;
}

/**
 * Interpolate along the great circle between two positions.
 *
 * Falls back to linear interpolation when the endpoints are (numerically)
 * coincident, where the spherical interpolation is undefined.
 *
 * @param {{lat:number, lon:number}} a
 * @param {{lat:number, lon:number}} b
 * @param {number} t 0 at `a`, 1 at `b`
 * @returns {{lat:number, lon:number}}
 */
export function interpolateGreatCircle(a, b, t) {
  const p = validatePoint(a);
  const q = validatePoint(b);
  finite(t, 't');
  const lat1 = p.lat * DEG;
  const lon1 = p.lon * DEG;
  const lat2 = q.lat * DEG;
  const lon2 = q.lon * DEG;
  const d = haversineKm(p, q) / EARTH_MEAN_RADIUS_KM;
  if (d < 1e-12) return { lat: p.lat, lon: p.lon };
  const sinD = Math.sin(d);
  const A = Math.sin((1 - t) * d) / sinD;
  const B = Math.sin(t * d) / sinD;
  const x =
    A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
  const y =
    A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
  const z = A * Math.sin(lat1) + B * Math.sin(lat2);
  return {
    lat: Math.atan2(z, Math.sqrt(x * x + y * y)) / DEG,
    lon: Math.atan2(y, x) / DEG,
  };
}

/**
 * Sample a great-circle arc as a polyline.
 *
 * Used to render maritime and air edges as curves rather than straight screen
 * lines, and to measure how close an edge passes to a chokepoint.
 *
 * @param {{lat:number, lon:number}} a
 * @param {{lat:number, lon:number}} b
 * @param {number} [segments=32]
 * @returns {Array<{lat:number, lon:number}>} segments + 1 positions
 */
export function greatCircleArc(a, b, segments = 32) {
  const n = Number.isInteger(segments) && segments > 0 ? segments : 32;
  const out = [];
  for (let i = 0; i <= n; i += 1) out.push(interpolateGreatCircle(a, b, i / n));
  return out;
}

/**
 * Estimated transit time for a leg, in hours.
 *
 * This is a MODELLED quantity, never an observed one: it is distance divided by
 * an assumed service speed, plus fixed port/handling time. Callers must badge the
 * result as modelled and expose the speed they assumed. See
 * docs/ROUTE_OPTIMIZATION.md for the speed table and its provenance.
 *
 * @param {number} distanceKm
 * @param {number} speedKnots average service speed
 * @param {number} [fixedHours=0] port, handling or border time
 * @returns {number} hours
 */
export function transitHours(distanceKm, speedKnots, fixedHours = 0) {
  finite(distanceKm, 'distanceKm');
  finite(speedKnots, 'speedKnots');
  finite(fixedHours, 'fixedHours');
  if (distanceKm < 0) throw new RangeError('distanceKm cannot be negative');
  if (speedKnots <= 0) throw new RangeError('speedKnots must be positive');
  if (fixedHours < 0) throw new RangeError('fixedHours cannot be negative');
  // 1 international nautical mile = 1.852 km exactly.
  return distanceKm / (speedKnots * 1.852) + fixedHours;
}
