/**
 * Geometry validation, run at ingest.
 *
 * §19 asks for invalid coordinates and geometries to be caught rather than
 * carried. The checks are ordered from cheapest to most specific, and every
 * failure names itself so the quality log can group by cause.
 */

import { Issue } from '../quality.js';

/** Nepal's envelope with a margin, used to catch CRS and axis-order errors. */
export const NEPAL_BBOX = Object.freeze([79.5, 25.5, 89.0, 31.0]);

/** A position is two finite numbers inside the valid geographic range. */
export function validatePosition(position) {
  if (!Array.isArray(position) || position.length < 2) {
    return {
      ok: false,
      code: Issue.MISSING_COORDINATE,
      reason: 'position is not a pair',
    };
  }
  const [lon, lat] = position;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return {
      ok: false,
      code: Issue.MISSING_COORDINATE,
      reason: 'non-finite coordinate',
    };
  }
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    /*
     * Name the likely cause. In this project an out-of-range coordinate is
     * almost never a typo: it is a projected coordinate read as degrees,
     * because the UNOSAT package ships UTM 45N and geographic WGS 84 side by
     * side. "out of range (244411, 3014211)" sends a reader hunting for a bad
     * record; naming the CRS sends them to the actual fault.
     */
    const looksProjected = Math.abs(lon) > 1000 || Math.abs(lat) > 1000;
    return {
      ok: false,
      code: Issue.INVALID_COORDINATE,
      reason: looksProjected
        ? `out of range (${lon}, ${lat}) — these look like projected metres read as degrees; check the CRS`
        : `out of range (${lon}, ${lat})`,
    };
  }
  /*
   * Null Island. A real datum can put a point at exactly (0,0), but no
   * feature in a Nepal dataset can, so it is always a missing-value sentinel
   * that survived as a number.
   */
  if (lon === 0 && lat === 0) {
    return {
      ok: false,
      code: Issue.INVALID_COORDINATE,
      reason: 'null island (0,0)',
    };
  }
  return { ok: true };
}

/** Is the position inside a bounding box? Used to catch un-reprojected data. */
export function insideBbox(position, bbox = NEPAL_BBOX) {
  const [lon, lat] = position;
  return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

/**
 * Validate a GeoJSON geometry.
 *
 * Returns `{ok, code, reason, positions}`; `positions` is the count checked,
 * so a caller can report how much geometry a dataset actually carries.
 */
export function validateGeometry(geometry, { bbox = NEPAL_BBOX } = {}) {
  if (!geometry || typeof geometry !== 'object') {
    return {
      ok: false,
      code: Issue.INVALID_GEOMETRY,
      reason: 'null geometry',
      positions: 0,
    };
  }
  const positions = [];
  collect(geometry.coordinates, positions);
  if (positions.length === 0) {
    return {
      ok: false,
      code: Issue.INVALID_GEOMETRY,
      reason: 'geometry has no coordinates',
      positions: 0,
    };
  }
  for (const position of positions) {
    const check = validatePosition(position);
    if (!check.ok) return { ...check, positions: positions.length };
  }
  /* Degenerate shapes: a line of one point, a ring that is not closed. */
  if (/LineString$/.test(geometry.type)) {
    const lines =
      geometry.type === 'LineString'
        ? [geometry.coordinates]
        : geometry.coordinates;
    for (const line of lines) {
      if (line.length < 2) {
        return {
          ok: false,
          code: Issue.INVALID_GEOMETRY,
          reason: 'line with fewer than 2 points',
          positions: positions.length,
        };
      }
    }
  }
  if (/Polygon$/.test(geometry.type)) {
    const polygons =
      geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry.coordinates;
    for (const rings of polygons) {
      for (const ring of rings) {
        if (ring.length < 4) {
          return {
            ok: false,
            code: Issue.INVALID_GEOMETRY,
            reason: 'ring with fewer than 4 positions',
            positions: positions.length,
          };
        }
      }
    }
  }
  const outside = positions.filter((position) => !insideBbox(position, bbox));
  if (outside.length === positions.length) {
    return {
      ok: false,
      code: Issue.OUT_OF_STUDY_AREA,
      reason: `entirely outside the study area (first at ${outside[0][0].toFixed(4)}, ${outside[0][1].toFixed(4)}) — check the CRS`,
      positions: positions.length,
    };
  }
  return {
    ok: true,
    positions: positions.length,
    partiallyOutside: outside.length > 0,
  };
}

function collect(coordinates, out) {
  if (!Array.isArray(coordinates)) return;
  if (typeof coordinates[0] === 'number') {
    out.push(coordinates);
    return;
  }
  for (const item of coordinates) collect(item, out);
}

/**
 * A stable key for duplicate detection.
 *
 * Rounded to about a centimetre: two records of the same building digitised in
 * separate passes differ in the last decimals, and treating them as distinct
 * inflates a damage count.
 */
export function geometryKey(geometry) {
  const positions = [];
  collect(geometry?.coordinates, positions);
  return `${geometry?.type}:${positions.map(([lon, lat]) => `${lon.toFixed(7)},${lat.toFixed(7)}`).join(';')}`;
}

/** Bounding box of a geometry, `[west, south, east, north]`. */
export function geometryBbox(geometry) {
  const positions = [];
  collect(geometry?.coordinates, positions);
  if (positions.length === 0) return null;
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lon, lat] of positions) {
    if (lon < w) w = lon;
    if (lon > e) e = lon;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  return [w, s, e, n];
}

/** Representative point: a vertex centroid, adequate for labels and joins. */
export function representativePoint(geometry) {
  const positions = [];
  collect(geometry?.coordinates, positions);
  if (positions.length === 0) return null;
  let lon = 0;
  let lat = 0;
  for (const position of positions) {
    lon += position[0];
    lat += position[1];
  }
  return [lon / positions.length, lat / positions.length];
}

/**
 * Point-in-polygon by ray casting, holes respected.
 *
 * Used for the district join. Operates on geographic coordinates because a
 * containment test is topological — it does not measure anything, so it does
 * not need a projected CRS.
 */
export function pointInPolygon(position, polygon) {
  const rings =
    polygon?.type === 'MultiPolygon'
      ? polygon.coordinates
      : polygon?.type === 'Polygon'
        ? [polygon.coordinates]
        : null;
  if (!rings) return false;
  for (const parts of rings) {
    if (!parts?.length) continue;
    if (!inRing(position, parts[0])) continue;
    let inHole = false;
    for (let h = 1; h < parts.length; h += 1) {
      if (inRing(position, parts[h])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Shortest distance from a point to a line segment, in degrees.
 *
 * Used only to rank candidates, never to report a distance, so working in
 * degrees is adequate and avoids projecting every vertex of every district
 * for every cell. The winner is re-measured in metres by the caller if the
 * actual distance matters.
 */
export function pointToSegmentDegrees([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Shortest distance from a point to a polygon's boundary, in degrees.
 *
 * Measured against SEGMENTS rather than vertices. With about fifty vertices
 * per district the edges are tens of kilometres long, so a nearest-vertex
 * test can rank a distant district ahead of the one the point actually sits
 * beside.
 */
export function distanceToPolygonDegrees(position, geometry) {
  const polygons =
    geometry?.type === 'MultiPolygon'
      ? geometry.coordinates
      : geometry?.type === 'Polygon'
        ? [geometry.coordinates]
        : [];
  let best = Infinity;
  for (const rings of polygons) {
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i += 1) {
        const distance = pointToSegmentDegrees(position, ring[i - 1], ring[i]);
        if (distance < best) best = distance;
      }
    }
  }
  return best;
}
