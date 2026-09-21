/**
 * ESRI shapefile geometry reader (.shp), paired with `readDbf` for attributes.
 *
 * Emits GeoJSON geometry so that everything downstream speaks one format. The
 * Z and M variants are read and their Z/M values DISCARDED with a note rather
 * than silently kept in a third ordinate, because the NGA layers in the Nepal
 * package are PolylineZ and PolygonZ whose Z is a placeholder, and carrying a
 * fake elevation into a 3D view would be worse than carrying none.
 */

/** Shape type codes. The Z/M variants share geometry with their base type. */
export const ShapeType = Object.freeze({
  NULL: 0,
  POINT: 1,
  POLYLINE: 3,
  POLYGON: 5,
  MULTIPOINT: 8,
  POINT_Z: 11,
  POLYLINE_Z: 13,
  POLYGON_Z: 15,
  MULTIPOINT_Z: 18,
  POINT_M: 21,
  POLYLINE_M: 23,
  POLYGON_M: 25,
  MULTIPOINT_M: 28,
});

const BASE = new Map([
  [ShapeType.POINT, 'Point'],
  [ShapeType.POINT_Z, 'Point'],
  [ShapeType.POINT_M, 'Point'],
  [ShapeType.MULTIPOINT, 'MultiPoint'],
  [ShapeType.MULTIPOINT_Z, 'MultiPoint'],
  [ShapeType.MULTIPOINT_M, 'MultiPoint'],
  [ShapeType.POLYLINE, 'LineString'],
  [ShapeType.POLYLINE_Z, 'LineString'],
  [ShapeType.POLYLINE_M, 'LineString'],
  [ShapeType.POLYGON, 'Polygon'],
  [ShapeType.POLYGON_Z, 'Polygon'],
  [ShapeType.POLYGON_M, 'Polygon'],
]);

/**
 * Read a .shp file into GeoJSON geometries.
 *
 * @param {ArrayBuffer|Uint8Array} bytes
 * @returns {{shapeType:number, kind:string, bbox:number[], geometries:Array<object|null>, hasZ:boolean}}
 */
export function readShp(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (view.getInt32(0, false) !== 9994) {
    throw new TypeError('Not a shapefile: bad file code.');
  }
  const shapeType = view.getInt32(32, true);
  const bbox = [
    view.getFloat64(36, true),
    view.getFloat64(44, true),
    view.getFloat64(52, true),
    view.getFloat64(60, true),
  ];
  const kind = BASE.get(shapeType) ?? null;
  const hasZ = [
    ShapeType.POINT_Z,
    ShapeType.POLYLINE_Z,
    ShapeType.POLYGON_Z,
    ShapeType.MULTIPOINT_Z,
  ].includes(shapeType);

  const geometries = [];
  let at = 100;
  while (at + 8 <= u8.length) {
    const contentWords = view.getInt32(at + 4, false);
    const contentStart = at + 8;
    const type = view.getInt32(contentStart, true);
    geometries.push(readGeometry(view, contentStart, type));
    at = contentStart + contentWords * 2;
  }
  return { shapeType, kind, bbox, geometries, hasZ };
}

function readGeometry(view, at, type) {
  switch (type) {
    case ShapeType.NULL:
      return null;
    case ShapeType.POINT:
    case ShapeType.POINT_Z:
    case ShapeType.POINT_M:
      return {
        type: 'Point',
        coordinates: [
          view.getFloat64(at + 4, true),
          view.getFloat64(at + 12, true),
        ],
      };
    case ShapeType.MULTIPOINT:
    case ShapeType.MULTIPOINT_Z:
    case ShapeType.MULTIPOINT_M: {
      const n = view.getInt32(at + 36, true);
      const coords = [];
      for (let i = 0; i < n; i += 1) {
        const p = at + 40 + i * 16;
        coords.push([view.getFloat64(p, true), view.getFloat64(p + 8, true)]);
      }
      return { type: 'MultiPoint', coordinates: coords };
    }
    case ShapeType.POLYLINE:
    case ShapeType.POLYLINE_Z:
    case ShapeType.POLYLINE_M:
    case ShapeType.POLYGON:
    case ShapeType.POLYGON_Z:
    case ShapeType.POLYGON_M: {
      const parts = readParts(view, at);
      const isPolygon = [
        ShapeType.POLYGON,
        ShapeType.POLYGON_Z,
        ShapeType.POLYGON_M,
      ].includes(type);
      if (!isPolygon) {
        return parts.length === 1
          ? { type: 'LineString', coordinates: parts[0] }
          : { type: 'MultiLineString', coordinates: parts };
      }
      /*
       * Shapefile polygons distinguish outer rings from holes by winding:
       * clockwise is an outer ring, counter-clockwise is a hole in the ring
       * that precedes it. GeoJSON needs that nesting made explicit, so a
       * flat list of rings would silently turn every hole into an island.
       */
      const polygons = [];
      for (const ring of parts) {
        if (signedArea(ring) >= 0) polygons.push([ring]);
        else if (polygons.length > 0) polygons[polygons.length - 1].push(ring);
        else polygons.push([ring]);
      }
      return polygons.length === 1
        ? { type: 'Polygon', coordinates: polygons[0] }
        : { type: 'MultiPolygon', coordinates: polygons };
    }
    default:
      throw new TypeError(`Unsupported shape type ${type}.`);
  }
}

function readParts(view, at) {
  const numParts = view.getInt32(at + 36, true);
  const numPoints = view.getInt32(at + 40, true);
  const partsAt = at + 44;
  const pointsAt = partsAt + numParts * 4;
  const starts = [];
  for (let i = 0; i < numParts; i += 1)
    starts.push(view.getInt32(partsAt + i * 4, true));
  const parts = [];
  for (let i = 0; i < numParts; i += 1) {
    const from = starts[i];
    const to = i + 1 < numParts ? starts[i + 1] : numPoints;
    const ring = [];
    for (let p = from; p < to; p += 1) {
      const o = pointsAt + p * 16;
      ring.push([view.getFloat64(o, true), view.getFloat64(o + 8, true)]);
    }
    parts.push(ring);
  }
  return parts;
}

/** Positive for a clockwise ring in shapefile (screen-style) ordering. */
function signedArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return sum / 2;
}

/**
 * Read the EPSG-relevant facts out of a .prj WKT string.
 *
 * Deliberately narrow: it answers "is this geographic WGS 84, or is it UTM,
 * and which zone", which is the only question the Nepal package poses. It
 * does not pretend to be a WKT parser.
 */
export function readPrj(wkt) {
  const text = String(wkt ?? '');
  const utm = /UTM_Zone_(\d+)([NS])/i.exec(text);
  if (utm) {
    const zone = Number(utm[1]);
    const north = utm[2].toUpperCase() === 'N';
    return Object.freeze({
      kind: 'projected',
      projection: 'UTM',
      zone,
      north,
      epsg: (north ? 32600 : 32700) + zone,
      wkt: text,
    });
  }
  if (/GEOGCS/i.test(text) && /WGS[_ ]?1984|WGS[_ ]?84/i.test(text)) {
    return Object.freeze({ kind: 'geographic', epsg: 4326, wkt: text });
  }
  return Object.freeze({ kind: 'unknown', epsg: null, wkt: text });
}
