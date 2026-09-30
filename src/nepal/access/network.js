/**
 * The access network: roads as a routable junction graph, and the facilities
 * reached over it.
 *
 * PURE. Bytes in the pipeline, arrays here. Nothing touches a network, a file
 * or a browser, so every rule below is a unit test.
 *
 * A JUNCTION IS WHERE ROADS MEET. OpenStreetMap ways share nodes where they
 * connect, and `out geom` reports those shared nodes at identical
 * coordinates, so a coordinate that appears in two or more ways (or twice in
 * one) is a junction, and so is every way's first and last position. Each way
 * is cut at its junctions into edges; everything between two junctions is
 * shape, not topology. Coordinates are compared at 6 decimals (~0.1 m), the
 * precision the Stage 2 reader already stores.
 */

const EARTH_RADIUS_M = 6371008.8;

export function haversineMetres([lon1, lat1], [lon2, lat2]) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

const key = ([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`;

/**
 * Douglas–Peucker on a local equirectangular projection, for drawing only.
 * Edge LENGTH is always measured on the unsimplified line.
 */
export function simplifyLine(coordinates, toleranceMetres = 12) {
  if (coordinates.length <= 2) return coordinates.slice();
  const lat0 = (coordinates[0][1] * Math.PI) / 180;
  const kx = 111320 * Math.cos(lat0);
  const ky = 110540;
  const xy = coordinates.map(([lon, lat]) => [lon * kx, lat * ky]);
  const keep = new Uint8Array(coordinates.length);
  keep[0] = 1;
  keep[coordinates.length - 1] = 1;
  const stack = [[0, coordinates.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let worst = -1;
    let at = -1;
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const dx = bx - ax;
    const dy = by - ay;
    const length2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i += 1) {
      const [px, py] = xy[i];
      let t = length2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / length2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > toleranceMetres) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return coordinates.filter((_, i) => keep[i]);
}

/**
 * Reduce ways to a junction graph.
 *
 * @param {Array<{osmId:number, coordinates:number[][], tags:{highway:string, bridge?:string}}>} segments
 * @returns {{nodes:number[][], edges:Array<{from:number,to:number,m:number,highway:string,bridge:boolean,osmId:number,shape:number[]}>}}
 */
export function buildJunctionGraph(segments, { simplifyMetres = 12 } = {}) {
  const uses = new Map();
  for (const segment of segments) {
    const coords = segment.coordinates;
    coords.forEach((position, i) => {
      const k = key(position);
      const weight = i === 0 || i === coords.length - 1 ? 2 : 1;
      uses.set(k, (uses.get(k) ?? 0) + weight);
    });
  }
  const index = new Map();
  const nodes = [];
  const nodeFor = (position) => {
    const k = key(position);
    let id = index.get(k);
    if (id === undefined) {
      id = nodes.length;
      index.set(k, id);
      nodes.push([
        Number(position[0].toFixed(6)),
        Number(position[1].toFixed(6)),
      ]);
    }
    return id;
  };
  const edges = [];
  for (const segment of segments) {
    const coords = segment.coordinates;
    let start = 0;
    for (let i = 1; i < coords.length; i += 1) {
      const junction =
        i === coords.length - 1 || (uses.get(key(coords[i])) ?? 0) >= 2;
      if (!junction) continue;
      const piece = coords.slice(start, i + 1);
      let metres = 0;
      for (let j = 1; j < piece.length; j += 1)
        metres += haversineMetres(piece[j - 1], piece[j]);
      const from = nodeFor(piece[0]);
      const to = nodeFor(piece[piece.length - 1]);
      if (from !== to && metres > 0) {
        edges.push({
          from,
          to,
          m: Math.round(metres * 10) / 10,
          highway: segment.tags.highway,
          bridge:
            segment.tags.bridge !== undefined && segment.tags.bridge !== 'no',
          osmId: segment.osmId,
          shape: simplifyLine(piece, simplifyMetres).flatMap(([lon, lat]) => [
            Number(lon.toFixed(5)),
            Number(lat.toFixed(5)),
          ]),
        });
      }
      start = i;
    }
  }
  return { nodes, edges };
}

/**
 * What kind of facility an OpenStreetMap tag set describes, or null.
 *
 * The order matters: a feature tagged both `amenity=hospital` and
 * `healthcare=clinic` is taken at the amenity's word, because that is the tag
 * the renderer and most mappers used in 2015.
 */
export function classifyFacility(tags = {}) {
  const amenity = tags.amenity;
  const healthcare = tags.healthcare;
  const aeroway = tags.aeroway;
  if (amenity === 'hospital' || (!amenity && healthcare === 'hospital'))
    return 'hospital';
  if (
    amenity === 'clinic' ||
    (!amenity && ['clinic', 'centre'].includes(healthcare))
  )
    return 'clinic';
  if (amenity === 'health_post' || amenity === 'health_centre')
    return 'health_post';
  if (
    amenity === 'doctors' ||
    (!amenity && ['doctor', 'doctors'].includes(healthcare))
  )
    return 'doctors';
  if (healthcare && !amenity) return 'healthcare_other';
  if (aeroway === 'aerodrome') return 'aerodrome';
  if (aeroway === 'airstrip') return 'airstrip';
  if (aeroway === 'helipad' || aeroway === 'heliport') return 'helipad';
  return null;
}
