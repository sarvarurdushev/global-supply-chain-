/**
 * Douglas-Peucker line simplification, with the tolerance expressed in metres.
 *
 * Simplification is what broke the first attempt at this project's district
 * frame: the geoBoundaries file ships about fifty vertices per district, and
 * at that coarseness the Kathmandu polygon swallowed Lalitpur — a point in
 * Patan tested as being in the wrong district, and Lalitpur's population was
 * silently added to its neighbour's.
 *
 * So this module exists to simplify CAREFULLY and to make the cost visible.
 * The tolerance is in metres rather than degrees, because a degree is not a
 * distance and a tolerance that is reasonable in longitude at the equator is
 * 12% tighter in Nepal. Rings are never reduced below four positions, and the
 * caller is expected to verify containment afterwards rather than trust that
 * a smaller file still means the same thing.
 */

import { pointToSegmentDegrees } from './geometry.js';

/** Metres per degree of latitude; longitude is scaled by cos(lat). */
const METRES_PER_DEGREE_LAT = 110_574;

/**
 * Simplify one ring.
 *
 * @param {Array<[number, number]>} ring
 * @param {number} toleranceMetres
 * @param {number} latitude used to convert the tolerance into degrees
 */
export function simplifyRing(ring, toleranceMetres, latitude) {
  if (!Array.isArray(ring) || ring.length <= 4) return ring;
  /*
   * A degree of longitude shrinks with latitude. Using the tighter of the two
   * axes keeps the tolerance conservative rather than letting it stretch
   * east-west, which is the direction Nepal's districts are narrowest.
   */
  const metresPerDegreeLon =
    METRES_PER_DEGREE_LAT * Math.cos((latitude * Math.PI) / 180);
  const toleranceDegrees = toleranceMetres / Math.max(metresPerDegreeLon, 1);

  const closed =
    Math.abs(ring[0][0] - ring[ring.length - 1][0]) < 1e-12 &&
    Math.abs(ring[0][1] - ring[ring.length - 1][1]) < 1e-12;
  const working = closed ? ring.slice(0, -1) : ring;
  if (working.length <= 3) return ring;

  const keep = new Uint8Array(working.length);

  /*
   * A closed ring cannot be simplified as one chain.
   *
   * Douglas-Peucker measures every vertex against the chord between its two
   * anchors. On a closed ring, positions 0 and n-1 are ADJACENT, so that
   * chord is a few metres long and the distances measured against it are
   * meaningless — at a small tolerance everything is "far" and nothing is
   * removed, at a large one the chain collapses to two points and the ring is
   * destroyed. Both failures look like the algorithm working.
   *
   * So a closed ring is split at its two extreme points — position 0 and the
   * vertex farthest from it — and each half is simplified as an open chain.
   */
  let anchorB = 0;
  if (closed) {
    let farthest = -1;
    for (let i = 1; i < working.length; i += 1) {
      const distance = Math.hypot(
        working[i][0] - working[0][0],
        working[i][1] - working[0][1],
      );
      if (distance > farthest) {
        farthest = distance;
        anchorB = i;
      }
    }
  } else {
    anchorB = working.length - 1;
  }

  keep[0] = 1;
  keep[anchorB] = 1;
  if (closed) keep[working.length - 1] = 1;

  const simplifyChain = (first, last) => {
    const stack = [[first, last]];
    while (stack.length > 0) {
      const [from, to] = stack.pop();
      let worst = 0;
      let index = -1;
      for (let i = from + 1; i < to; i += 1) {
        const distance = pointToSegmentDegrees(
          working[i],
          working[from],
          working[to],
        );
        if (distance > worst) {
          worst = distance;
          index = i;
        }
      }
      if (index !== -1 && worst > toleranceDegrees) {
        keep[index] = 1;
        stack.push([from, index], [index, to]);
      }
    }
  };
  simplifyChain(0, anchorB);
  simplifyChain(anchorB, working.length - 1);

  const out = [];
  for (let i = 0; i < working.length; i += 1) if (keep[i]) out.push(working[i]);
  /* A ring needs three distinct positions plus the closing repeat. */
  if (out.length < 3) return ring;
  if (closed) out.push(out[0]);
  /*
   * Refuse a collapse.
   *
   * Three surviving positions can still be collinear, which is a ring with no
   * area — structurally valid and geometrically nothing. In a district frame
   * that silently deletes part of a polygon, and the total area check further
   * down the pipeline would not notice a few square metres going missing. If
   * simplification has flattened the ring, the original is kept instead.
   */
  if (closed) {
    const area = Math.abs(shoelace(out));
    /*
     * Two ways a ring can collapse. It can end up with no area at all — three
     * collinear positions — which the relative test below cannot catch when
     * the input was already degenerate. Or it can keep some area but lose
     * most of it, which means the tolerance was too coarse for this ring.
     * About 1e-14 square degrees is a tenth of a square metre at this
     * latitude: below that, the ring is nothing.
     */
    if (area < 1e-14) return ring;
    if (area < Math.abs(shoelace(ring)) * 0.5) return ring;
  }
  return out;
}

/** Twice the signed area of a ring, in square degrees. Sign and units are irrelevant here. */
function shoelace(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return sum / 2;
}

/** Simplify every ring of a polygon or multipolygon geometry. */
export function simplifyGeometry(geometry, toleranceMetres, latitude) {
  if (!geometry) return null;
  const simplifyRings = (rings) =>
    rings.map((ring) => simplifyRing(ring, toleranceMetres, latitude));
  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: simplifyRings(geometry.coordinates),
    };
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map(simplifyRings),
    };
  }
  return geometry;
}

/** Count the positions in a geometry, for reporting what simplification cost. */
export function countPositions(geometry) {
  let total = 0;
  const walk = (coordinates) => {
    if (!Array.isArray(coordinates)) return;
    if (typeof coordinates[0] === 'number') {
      total += 1;
      return;
    }
    for (const item of coordinates) walk(item);
  };
  walk(geometry?.coordinates);
  return total;
}
