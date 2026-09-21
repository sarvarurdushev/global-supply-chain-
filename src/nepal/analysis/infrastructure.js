/**
 * Stage 5 §5.6–§5.7 — observed infrastructure damage, and what it can support.
 *
 * The single most important thing measured in this file is not a distance. It
 * is the SHAPE of the NGA blocked-road features: 179 lines totalling under
 * twenty kilometres, with a median length of about sixty-five metres. These
 * are obstruction markers drawn where an analyst saw a blockage in imagery,
 * not the extents of closed routes. Reading "179 blocked roads" as "179 roads
 * were closed along their length" overstates the source by orders of
 * magnitude, and `blockedRoadGeometryCheck` measures the numbers that make
 * that statement checkable rather than asserted.
 *
 * The second is the tolerance in `roadLandslideAssociation`. A buffer distance
 * chosen to make a percentage look good is the classic way to manufacture a
 * spatial finding, so the tolerance here is derived from the geometry's own
 * resolution, computed at run time from the features being analysed, and every
 * result is reported as a curve across tolerances rather than a single number.
 */

import { toUtm, ringAreaSqMetres } from '../geo/crs.js';

/* ------------------------------------------------------------------ *
 * Planar measurement, all in EPSG:32645.
 * ------------------------------------------------------------------ */

/** Project a ring or line of geographic positions into UTM 45N metres. */
function project(positions) {
  return positions.map(([lon, lat]) => {
    const { easting, northing } = toUtm(lon, lat);
    return [easting, northing];
  });
}

/** Length of a polyline in metres. */
export function polylineLengthMetres(coordinates) {
  const points = project(coordinates);
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(
      points[i][0] - points[i - 1][0],
      points[i][1] - points[i - 1][1],
    );
  }
  return total;
}

/** Area of a GeoJSON Polygon or MultiPolygon in square metres, holes removed. */
export function polygonAreaSqMetres(geometry) {
  const polygons =
    geometry?.type === 'MultiPolygon'
      ? geometry.coordinates
      : geometry?.type === 'Polygon'
        ? [geometry.coordinates]
        : [];
  let total = 0;
  for (const rings of polygons) {
    rings.forEach((ring, index) => {
      const area = ringAreaSqMetres(ring);
      total += index === 0 ? area : -area;
    });
  }
  return total;
}

/** Shortest distance between two planar segments, 0 if they cross. */
export function segmentToSegmentMetres(p1, p2, q1, q2) {
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const r = sub(p2, p1);
  const s = sub(q2, q1);
  const denominator = cross(r, s);
  const qp = sub(q1, p1);
  if (denominator !== 0) {
    const t = cross(qp, s) / denominator;
    const u = cross(qp, r) / denominator;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(
    pointToSegmentMetres(p1, q1, q2),
    pointToSegmentMetres(p2, q1, q2),
    pointToSegmentMetres(q1, p1, p2),
    pointToSegmentMetres(q2, p1, p2),
  );
}

/** Shortest distance from a planar point to a planar segment. */
export function pointToSegmentMetres([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Even-odd containment for a planar point in a planar ring. */
function pointInRing([x, y], ring) {
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
 * Shortest distance in metres from a polyline to a polygon, 0 when they touch,
 * cross, or the line lies inside.
 *
 * Exact on the projected geometry rather than sampled: a line that passes
 * through a slide between two widely spaced vertices would be missed by a
 * vertex-sampling test, and those are precisely the features of interest.
 */
export function polylineToPolygonMetres(lineCoordinates, polygonGeometry) {
  const line = project(lineCoordinates);
  const polygons =
    polygonGeometry?.type === 'MultiPolygon'
      ? polygonGeometry.coordinates
      : polygonGeometry?.type === 'Polygon'
        ? [polygonGeometry.coordinates]
        : [];
  let best = Infinity;
  for (const rings of polygons) {
    const projected = rings.map(project);
    const outer = projected[0];
    const holes = projected.slice(1);
    for (const point of line) {
      if (
        pointInRing(point, outer) &&
        !holes.some((hole) => pointInRing(point, hole))
      ) {
        return 0;
      }
    }
    for (const ring of projected) {
      for (let i = 1; i < ring.length; i += 1) {
        for (let j = 1; j < line.length; j += 1) {
          const distance = segmentToSegmentMetres(
            line[j - 1],
            line[j],
            ring[i - 1],
            ring[i],
          );
          if (distance < best) best = distance;
          if (best === 0) return 0;
        }
      }
    }
  }
  return best;
}

/** Shortest distance in metres from a point to a polygon, 0 when inside. */
export function pointToPolygonMetres([lon, lat], polygonGeometry) {
  const { easting, northing } = toUtm(lon, lat);
  const point = [easting, northing];
  const polygons =
    polygonGeometry?.type === 'MultiPolygon'
      ? polygonGeometry.coordinates
      : polygonGeometry?.type === 'Polygon'
        ? [polygonGeometry.coordinates]
        : [];
  let best = Infinity;
  for (const rings of polygons) {
    const projected = rings.map(project);
    const [outer, ...holes] = projected;
    if (
      pointInRing(point, outer) &&
      !holes.some((hole) => pointInRing(point, hole))
    ) {
      return 0;
    }
    for (const ring of projected) {
      for (let i = 1; i < ring.length; i += 1) {
        best = Math.min(
          best,
          pointToSegmentMetres(point, ring[i - 1], ring[i]),
        );
      }
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * §5.6 — what the NGA features actually are.
 * ------------------------------------------------------------------ */

const quantile = (values, p) => {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[
    Math.min(
      sorted.length - 1,
      Math.max(0, Math.floor(p * (sorted.length - 1))),
    )
  ];
};

/**
 * Measure the blocked-road features before describing them.
 *
 * Returns the numbers §5.9's caveat rests on: how long the features are, how
 * far apart their vertices sit, and how much road length they cover in total.
 * The caveat is then a statement about measurements rather than an opinion.
 */
export function blockedRoadGeometryCheck(features) {
  const lengths = features.map((feature) =>
    polylineLengthMetres(feature.geometry.coordinates),
  );
  const vertexCounts = features.map(
    (feature) => feature.geometry.coordinates.length,
  );
  const spacings = [];
  for (const feature of features) {
    const points = project(feature.geometry.coordinates);
    for (let i = 1; i < points.length; i += 1) {
      spacings.push(
        Math.hypot(
          points[i][0] - points[i - 1][0],
          points[i][1] - points[i - 1][1],
        ),
      );
    }
  }
  const totalMetres = lengths.reduce((a, b) => a + b, 0);
  return Object.freeze({
    features: features.length,
    totalLengthKm: Number((totalMetres / 1000).toFixed(2)),
    lengthMetres: Object.freeze({
      min: Math.round(quantile(lengths, 0)),
      p25: Math.round(quantile(lengths, 0.25)),
      median: Math.round(quantile(lengths, 0.5)),
      p75: Math.round(quantile(lengths, 0.75)),
      max: Math.round(quantile(lengths, 1)),
    }),
    vertices: Object.freeze({
      min: Math.min(...vertexCounts),
      median: quantile(vertexCounts, 0.5),
      max: Math.max(...vertexCounts),
    }),
    vertexSpacingMetres: Object.freeze({
      p10: Number(quantile(spacings, 0.1).toFixed(1)),
      median: Number(quantile(spacings, 0.5).toFixed(1)),
      p90: Number(quantile(spacings, 0.9).toFixed(1)),
    }),
    interpretation:
      `These ${features.length} features carry ${(totalMetres / 1000).toFixed(1)} km of line geometry in total, with a median feature length of ` +
      `${Math.round(quantile(lengths, 0.5))} m. A feature of that length is an OBSTRUCTION MARKER at a place where an analyst saw a ` +
      'blockage, not the extent of a closed route. Any statement about how much road was unusable must come from the network the marker ' +
      'sits on, never from the marker’s own length.',
  });
}

/** Total area and size distribution of the landslide polygons. */
export function landslideGeometryCheck(features) {
  const areas = features.map((feature) =>
    polygonAreaSqMetres(feature.geometry),
  );
  const radii = areas.map((area) => Math.sqrt(area / Math.PI));
  const total = areas.reduce((a, b) => a + b, 0);
  return Object.freeze({
    features: features.length,
    totalAreaHectares: Number((total / 1e4).toFixed(1)),
    totalAreaSqKm: Number((total / 1e6).toFixed(3)),
    areaSqMetres: Object.freeze({
      min: Math.round(quantile(areas, 0)),
      median: Math.round(quantile(areas, 0.5)),
      p90: Math.round(quantile(areas, 0.9)),
      max: Math.round(quantile(areas, 1)),
    }),
    /*
     * The radius of a circle of the same area. It is the characteristic size
     * of a mapped slide, and it is the measurement the association tolerance
     * below is anchored to.
     */
    equivalentRadiusMetres: Object.freeze({
      min: Math.round(quantile(radii, 0)),
      median: Math.round(quantile(radii, 0.5)),
      p90: Math.round(quantile(radii, 0.9)),
      max: Math.round(quantile(radii, 1)),
    }),
  });
}

/* ------------------------------------------------------------------ *
 * §5.7 — road and landslide, spatially associated.
 * ------------------------------------------------------------------ */

/** The tolerances the association is reported across, in metres. */
export const ASSOCIATION_TOLERANCES_METRES = Object.freeze([
  0, 25, 50, 100, 250, 500, 1000,
]);

/**
 * Derive the headline tolerance from the geometry instead of choosing it.
 *
 * Two measurements bound it. BELOW the resolution of the geometry, a distance
 * is digitising noise: the road lines carry a median vertex spacing of about
 * fourteen metres, so nothing finer than that is meaningful. ABOVE the
 * characteristic size of a mapped slide — the median equivalent radius, about
 * fifty metres — a "nearby" landslide is one whose mapped extent does not
 * reach the road, and associating them would assert an unmapped runout path
 * that the source does not publish.
 *
 * The headline is therefore the median landslide equivalent radius, rounded to
 * the nearest 25 m, and the full curve is reported beside it so a reader who
 * prefers a different rule can read their own number off it.
 */
export function deriveAssociationTolerance(roadCheck, landslideCheck) {
  const floor = roadCheck.vertexSpacingMetres.median;
  const characteristic = landslideCheck.equivalentRadiusMetres.median;
  const headline = Math.max(25, Math.round(characteristic / 25) * 25);
  return Object.freeze({
    headlineMetres: headline,
    geometryFloorMetres: floor,
    landslideCharacteristicRadiusMetres: characteristic,
    justification:
      `The blocked-road lines have a median vertex spacing of ${floor} m, so a separation smaller than that is digitising noise rather than ` +
      `a measured gap. The mapped landslides have a median equivalent radius of ${characteristic} m, which is the distance over which a slide ` +
      `of typical mapped size extends from its own centre. A tolerance of ${headline} m therefore means "the road lies within about one ` +
      'landslide-width of the mapped slide extent". It is a resolution-based tolerance, not a runout model: no debris travel distance is ' +
      'claimed, and the association is reported across the whole tolerance curve so the sensitivity is visible.',
  });
}

/**
 * How much observed road disruption is spatially associated with an observed
 * landslide.
 *
 * NOTE THE WORD. "Spatially associated with" is not "caused by". The NGA
 * products record a blockage and a slide as separate observations, at separate
 * dates in several cases, with no field linking them. A road beside a slide
 * may have been blocked by that slide, by a different slide nobody mapped, by
 * a collapsed building, or by pavement failure. This function measures
 * proximity; it does not measure cause, and nothing downstream may upgrade it.
 */
export function roadLandslideAssociation(
  roadFeatures,
  landslideFeatures,
  tolerances = ASSOCIATION_TOLERANCES_METRES,
) {
  const distances = roadFeatures.map((road) => {
    let best = Infinity;
    let nearest = null;
    landslideFeatures.forEach((slide, index) => {
      const distance = polylineToPolygonMetres(
        road.geometry.coordinates,
        slide.geometry,
      );
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    });
    return {
      distance: best,
      nearestLandslide: nearest,
      lengthMetres: polylineLengthMetres(road.geometry.coordinates),
    };
  });
  const totalLength = distances.reduce((a, b) => a + b.lengthMetres, 0);
  const curve = tolerances.map((tolerance) => {
    const matched = distances.filter((row) => row.distance <= tolerance);
    return Object.freeze({
      toleranceMetres: tolerance,
      features: matched.length,
      featureShare: Number(
        ((matched.length / distances.length) * 100).toFixed(1),
      ),
      lengthMetres: Math.round(matched.reduce((a, b) => a + b.lengthMetres, 0)),
      lengthShare: Number(
        (
          (matched.reduce((a, b) => a + b.lengthMetres, 0) / totalLength) *
          100
        ).toFixed(1),
      ),
    });
  });
  const finite = distances.map((row) => row.distance).filter(Number.isFinite);
  return Object.freeze({
    roadFeatures: roadFeatures.length,
    landslideFeatures: landslideFeatures.length,
    curve: Object.freeze(curve),
    distanceMetres: Object.freeze({
      min: Math.round(quantile(finite, 0)),
      p25: Math.round(quantile(finite, 0.25)),
      median: Math.round(quantile(finite, 0.5)),
      p75: Math.round(quantile(finite, 0.75)),
      max: Math.round(quantile(finite, 1)),
    }),
    perRoad: Object.freeze(
      distances.map((row) =>
        Object.freeze({
          distanceMetres: Number.isFinite(row.distance)
            ? Math.round(row.distance)
            : null,
          nearestLandslide: row.nearestLandslide,
          lengthMetres: Math.round(row.lengthMetres),
        }),
      ),
    ),
    causalityNote:
      'Every figure here is a measured separation between two independently mapped features. The NGA products contain no field linking a blockage to a slide, and in several cases the two were observed on different dates. "Spatially associated with" is the strongest claim the data supports.',
  });
}

/**
 * The reverse direction: how many mapped landslides lie near a mapped blockage.
 *
 * Worth reporting because the two shares answer different questions. A high
 * road-side share with a low slide-side share would mean a few large slides
 * account for most blockages; the opposite would mean most slides fell
 * somewhere no road was reported blocked.
 */
export function landslideRoadAssociation(
  landslideFeatures,
  roadFeatures,
  tolerances = ASSOCIATION_TOLERANCES_METRES,
) {
  const distances = landslideFeatures.map((slide) => {
    let best = Infinity;
    for (const road of roadFeatures) {
      const distance = polylineToPolygonMetres(
        road.geometry.coordinates,
        slide.geometry,
      );
      if (distance < best) best = distance;
    }
    return best;
  });
  return Object.freeze({
    landslideFeatures: landslideFeatures.length,
    curve: Object.freeze(
      tolerances.map((tolerance) => {
        const matched = distances.filter(
          (distance) => distance <= tolerance,
        ).length;
        return Object.freeze({
          toleranceMetres: tolerance,
          features: matched,
          featureShare: Number(((matched / distances.length) * 100).toFixed(1)),
        });
      }),
    ),
    distanceMetres: Object.freeze({
      min: Math.round(quantile(distances, 0)),
      median: Math.round(quantile(distances, 0.5)),
      max: Math.round(quantile(distances, 1)),
    }),
  });
}

/**
 * Group observed infrastructure damage by district and by modelled intensity.
 *
 * `districtOf` and `intensityOf` are injected so this module never learns how
 * boundaries or contours are stored.
 */
export function infrastructureByArea(
  features,
  { districtOf, intensityOf, pointOf },
) {
  const byDistrict = new Map();
  const byIntensity = new Map();
  for (const feature of features) {
    const [lon, lat] = pointOf(feature);
    const district = districtOf(lon, lat) ?? '(outside the district layer)';
    const mmi = intensityOf(lon, lat);
    const key =
      mmi === null || mmi === undefined ? 'outside contours' : `MMI ${mmi}`;
    const length =
      feature.geometry.type === 'LineString'
        ? polylineLengthMetres(feature.geometry.coordinates)
        : 0;
    const area =
      feature.geometry.type === 'Polygon' ||
      feature.geometry.type === 'MultiPolygon'
        ? polygonAreaSqMetres(feature.geometry)
        : 0;
    for (const [map, id] of [
      [byDistrict, district],
      [byIntensity, key],
    ]) {
      let entry = map.get(id);
      if (!entry) {
        entry = { id, count: 0, lengthMetres: 0, areaSqMetres: 0 };
        map.set(id, entry);
      }
      entry.count += 1;
      entry.lengthMetres += length;
      entry.areaSqMetres += area;
    }
  }
  const finish = (map, sortByKey) => {
    const rows = [...map.values()].map((entry) =>
      Object.freeze({
        id: entry.id,
        count: entry.count,
        lengthMetres: Math.round(entry.lengthMetres),
        areaHectares: Number((entry.areaSqMetres / 1e4).toFixed(2)),
      }),
    );
    rows.sort(
      sortByKey
        ? (a, b) => a.id.localeCompare(b.id)
        : (a, b) => b.count - a.count,
    );
    return Object.freeze(rows);
  };
  return Object.freeze({
    byDistrict: finish(byDistrict, false),
    byIntensity: finish(byIntensity, true),
  });
}

/**
 * The representative position of a feature, for joining lines and polygons to
 * a district or a contour.
 *
 * The MIDPOINT BY LENGTH, not the average of the vertices: a line whose
 * vertices bunch at one end has a vertex mean that sits away from its middle,
 * and for a 65 m obstruction marker the difference is irrelevant while for a
 * 1.2 km one it is not.
 */
export function representativePosition(geometry) {
  if (geometry.type === 'Point') return geometry.coordinates;
  if (geometry.type === 'LineString') {
    const coordinates = geometry.coordinates;
    const points = project(coordinates);
    const segments = [];
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      const length = Math.hypot(
        points[i][0] - points[i - 1][0],
        points[i][1] - points[i - 1][1],
      );
      segments.push(length);
      total += length;
    }
    let travelled = 0;
    for (let i = 0; i < segments.length; i += 1) {
      if (travelled + segments[i] >= total / 2) {
        const t = segments[i] === 0 ? 0 : (total / 2 - travelled) / segments[i];
        const [lon1, lat1] = coordinates[i];
        const [lon2, lat2] = coordinates[i + 1];
        return [lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t];
      }
      travelled += segments[i];
    }
    return coordinates[0];
  }
  const rings =
    geometry.type === 'MultiPolygon'
      ? geometry.coordinates[0]
      : geometry.coordinates;
  const ring = rings[0];
  let lon = 0;
  let lat = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    lon += ring[i][0];
    lat += ring[i][1];
  }
  const n = ring.length - 1;
  return [lon / n, lat / n];
}
