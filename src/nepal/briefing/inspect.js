/**
 * What is under the pointer, and what the analysis can say about it.
 *
 * EXPLORE's inspector. A click becomes a ground position and a scale (metres
 * per screen pixel); this finds the object the viewer meant — the nearest
 * point of a visible kind within a few pixels, else a line, else the district
 * underneath — and describes it with values read from the artefacts. Where
 * the analysis holds nothing for that object, the card says so and why,
 * rather than showing an empty panel or inventing a figure.
 *
 * Pure: plain objects in, plain objects out. The UI supplies the candidates
 * from what it has loaded and what is visible.
 */

import { FORMATS } from './facts.js';

const EARTH_RADIUS_M = 6_371_008.8;
const RAD = Math.PI / 180;

export function metresBetween(lon1, lat1, lon2, lat2) {
  const dφ = (lat2 - lat1) * RAD;
  const dλ = (lon2 - lon1) * RAD;
  const h =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance from a point to a polyline of [lon, lat] pairs, on a local plane. */
export function pointToLineMetres(lon, lat, line) {
  const kx = 111_320 * Math.cos(lat * RAD);
  const ky = 110_540;
  let best = Infinity;
  for (let i = 1; i < line.length; i += 1) {
    const ax = (line[i - 1][0] - lon) * kx;
    const ay = (line[i - 1][1] - lat) * ky;
    const bx = (line[i][0] - lon) * kx;
    const by = (line[i][1] - lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    const t =
      len > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  if (line.length === 1) best = metresBetween(lon, lat, line[0][0], line[0][1]);
  return best;
}

function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}

/** Point in a GeoJSON Polygon or MultiPolygon geometry. */
export function inGeometry(lon, lat, geometry) {
  const polygons =
    geometry?.type === 'MultiPolygon'
      ? geometry.coordinates
      : geometry?.type === 'Polygon'
        ? [geometry.coordinates]
        : [];
  return polygons.some(
    (rings) =>
      rings.length > 0 &&
      inRing(lon, lat, rings[0]) &&
      !rings.slice(1).some((hole) => inRing(lon, lat, hole)),
  );
}

/** The kinds, in the order a tie is broken: a small precise thing beats a big vague one. */
export const INSPECT_ORDER = Object.freeze([
  'hospital',
  'bridge',
  'blockage',
  'landslide',
  'earthquake',
  'damage',
  'route',
  'road',
  'district',
]);
const POINT_KINDS = new Set([
  'hospital',
  'bridge',
  'blockage',
  'landslide',
  'earthquake',
  'damage',
]);

/**
 * The object under the pointer.
 * @param {object} input
 * @param {number} input.lon
 * @param {number} input.lat
 * @param {number} input.metresPerPixel the camera's scale at the click
 * @param {Record<string, Array<object>>} input.candidates per kind: points
 *   carry lon/lat, lines carry `line` ([lon, lat] pairs), districts carry
 *   `geometry`
 * @param {number} [input.pointPx] hit radius for points, in pixels
 * @param {number} [input.linePx] hit radius for lines, in pixels
 */
export function pickAt({
  lon,
  lat,
  metresPerPixel,
  candidates,
  pointPx = 14,
  linePx = 8,
}) {
  const pointTolerance = Math.min(
    20_000,
    Math.max(120, pointPx * metresPerPixel),
  );
  const lineTolerance = Math.min(8_000, Math.max(60, linePx * metresPerPixel));
  let best = null;
  for (const kind of INSPECT_ORDER) {
    const items = candidates[kind] ?? [];
    if (kind === 'district') continue;
    const tolerance = POINT_KINDS.has(kind) ? pointTolerance : lineTolerance;
    for (const item of items) {
      const metres = POINT_KINDS.has(kind)
        ? metresBetween(lon, lat, item.lon, item.lat)
        : pointToLineMetres(lon, lat, item.line);
      if (metres > tolerance) continue;
      /* A point kind wins over any line kind; within a family the nearer wins. */
      const rank = POINT_KINDS.has(kind) ? 0 : 1;
      if (
        !best ||
        rank < best.rank ||
        (rank === best.rank && metres < best.metres)
      )
        best = { kind, item, metres, rank };
    }
  }
  if (best)
    return {
      kind: best.kind,
      item: best.item,
      metres: Math.round(best.metres),
    };
  const district = (candidates.district ?? []).find((d) =>
    inGeometry(lon, lat, d.geometry),
  );
  return district ? { kind: 'district', item: district, metres: 0 } : null;
}

const fmt = (value, format) =>
  value === null || value === undefined ? '—' : FORMATS[format](value);

/**
 * The card for a picked object: title, rows of figures read from the
 * artefacts, the class of the claim, and — where the analysis has nothing to
 * say — the reason, stated.
 * @param {{kind:string, item:object}} hit
 * @param {object} context artefact values the card may read (see the UI)
 */
export function describe(hit, context = {}) {
  const { kind, item } = hit;
  switch (kind) {
    case 'earthquake': {
      const main = item.id && item.id === context.mainShockId;
      return {
        kind,
        title: `${main ? 'MAIN SHOCK · ' : ''}M${fmt(item.magnitude, 'dec1')} EARTHQUAKE`,
        rows: [
          ['DEPTH', `${fmt(item.depthKm, 'dec1')} KM`],
          [
            'AFTER THE MAIN SHOCK',
            main ? '—' : `${fmt(item.hoursFromMainShock, 'dec1')} HOURS`,
          ],
          ['USGS ID', String(item.id ?? '—').toUpperCase()],
        ],
        tag: { source: 'USGS', cls: 'OBSERVED' },
        note: 'Catalogue event. Its location and magnitude are USGS’s; nothing is re-estimated here.',
        scene: main ? 'main-shock' : 'seismic-sequence',
      };
    }
    case 'damage':
      return {
        kind,
        title: String(item.damageClass ?? 'DAMAGE SITE').toUpperCase(),
        rows: [
          [
            'IMAGE DATE',
            item.sensorDate ? fmt(item.sensorDate, 'dateShort') : '—',
          ],
          ['ANALYSIS AREA', String(item.settlement ?? '—').toUpperCase()],
          ['FIELD-VALIDATED', String(item.fieldValidated ?? '—').toUpperCase()],
        ],
        tag: { source: 'UNOSAT', cls: 'OBSERVED' },
        note: 'One structure read from imagery. The product records damaged structures only, so a site says nothing about its undamaged neighbours.',
        scene: 'damage-composition',
      };
    case 'blockage':
      return {
        kind,
        title: 'BLOCKED ROAD',
        rows: [
          ['OBSERVED', item.sensedOn ? fmt(item.sensedOn, 'dateShort') : '—'],
          [
            'ON A ROAD MAPPED IN 2015',
            item.matched === undefined
              ? 'NOT TESTED'
              : item.matched
                ? 'YES'
                : 'NO — NOT ON THE MAP',
          ],
        ],
        tag: { source: 'NGA', cls: 'OBSERVED' },
        note: 'A marker of where a road was cut, not of how much road was lost. When it reopened is not recorded.',
        scene: 'blockages',
      };
    case 'bridge':
      return {
        kind,
        title: 'BRIDGE OUT',
        rows: [
          ['DISTRICT', String(item.district ?? '—').toUpperCase()],
          ['OBSERVED', item.sensedOn ? fmt(item.sensedOn, 'dateShort') : '—'],
          [
            'MODELLED SHAKING',
            item.mmi !== undefined && item.mmi !== null
              ? `MMI ${fmt(item.mmi, 'dec1')}`
              : '—',
          ],
          [
            'ALONE, IN THE SCENARIO',
            !item.whatIf
              ? 'NOT ON A MAPPED ROAD — NO WHAT-IF'
              : item.whatIf.peopleCut > 0
                ? `${fmt(item.whatIf.peopleCut, 'int')} PEOPLE CUT OFF`
                : `${fmt(item.whatIf.peopleLonger, 'int')} PEOPLE ON A LONGER ROUTE`,
          ],
        ],
        tag: {
          source: 'NGA × OSM 2015',
          cls: item.whatIf ? 'SCENARIO' : 'OBSERVED',
        },
        note: item.whatIf
          ? 'The what-if removes only this bridge and leaves every other road open.'
          : 'The bridge does not sit on a road mapped the day before, so removing it changes no mapped route and there is nothing to model.',
        scene: 'bridge-what-if',
      };
    case 'landslide':
      return {
        kind,
        title: 'LANDSLIDE',
        rows: [
          [
            'AREA',
            item.areaHectares !== undefined
              ? `${fmt(item.areaHectares, 'dec1')} HA`
              : '—',
          ],
          ['DISTRICT', String(item.district ?? '—').toUpperCase()],
          [
            'NEAREST BLOCKED ROAD',
            item.nearestBlockedRoadMetres !== undefined
              ? `${fmt(item.nearestBlockedRoadMetres, 'int')} M`
              : '—',
          ],
          [
            'PEOPLE WITHIN 1 KM',
            item.peopleWithin1Km !== undefined
              ? fmt(item.peopleWithin1Km, 'int')
              : '—',
          ],
        ],
        tag: { source: 'NGA × WORLDPOP', cls: 'DERIVED' },
        note: 'Nearness to a blocked road is an association in space; neither product records a cause.',
        scene: 'landslides',
      };
    case 'hospital':
      return {
        kind,
        title: String(item.type ?? 'HEALTH FACILITY').toUpperCase(),
        rows: [
          ['DISTRICT', String(item.district ?? '—').toUpperCase()],
          ['PLACE', String(item.vdc ?? '—').toUpperCase()],
          [
            'ON THE MAPPED ROAD NETWORK',
            item.onNetwork === undefined
              ? '—'
              : item.onNetwork
                ? 'YES'
                : 'NO — OVER 1 KM FROM ANY MAPPED ROAD',
          ],
          [
            'LIST',
            `GOVERNMENT, COMPILED ${context.codCompiled ? fmt(context.codCompiled, 'dateShort') : '—'}`,
          ],
        ],
        tag: { source: 'DOHS / WHO', cls: 'OFFICIAL' },
        note: 'No beds, staff or capacity exist in the list, and none is shown. Distances were measured from people to their nearest hospital, not per hospital.',
        scene: 'facility-map',
      };
    case 'route':
      return {
        kind,
        title: String(item.label ?? 'ROUTE').toUpperCase(),
        rows: [
          [
            'BEFORE',
            item.baselineKm !== null && item.baselineKm !== undefined
              ? `${fmt(item.baselineKm, 'dec1')} KM`
              : 'NO ROUTE',
          ],
          [
            'WITH THE OBSERVED BLOCKAGES',
            item.damagedKm !== null && item.damagedKm !== undefined
              ? `${fmt(item.damagedKm, 'dec1')} KM`
              : 'NO ROUTE',
          ],
          ['OUTCOME', String(item.outcome ?? '—').replace(/_/g, ' ')],
        ],
        tag: { source: 'OSM 2015 × NGA', cls: 'SCENARIO' },
        note: 'Distance along mapped roads, not travel time. Every observed blockage is applied at once.',
        scene: 'district-routes',
      };
    case 'road':
      return {
        kind,
        title: `ROAD · ${String(item.highway ?? 'UNCLASSIFIED').toUpperCase()}`,
        rows: [
          [
            'MAPPED BY',
            context.osmInstant ? fmt(context.osmInstant, 'dateShort') : '—',
          ],
          ['NAME', String(item.name ?? item.ref ?? 'UNNAMED').toUpperCase()],
        ],
        tag: { source: 'OPENSTREETMAP', cls: 'OBSERVED' },
        note: 'No condition, surface, speed or traffic exists for this road in April 2015, so none is shown. The analysis uses it only as a link in the network.',
        scene: 'map-was-thin',
      };
    case 'district': {
      const e = item.exposure ?? {};
      /* null: outside the analysis; undefined: the analysis did not load. */
      const a = item.access;
      const rows = [
        [
          'MODELLED POPULATION',
          e.population !== undefined ? fmt(e.population, 'int') : '—',
        ],
        [
          'INSIDE MMI VI OR STRONGER',
          e.exposed !== undefined ? fmt(e.exposed, 'int') : '—',
        ],
        [
          'PEAK MODELLED SHAKING',
          e.maxMmi !== undefined && e.maxMmi !== null
            ? `MMI ${fmt(e.maxMmi, 'dec1')}`
            : '—',
        ],
        [
          'MAPPED DAMAGE SITES',
          item.damage
            ? fmt(item.damage.damagePoints, 'int')
            : 'NOT IN THE DAMAGE PRODUCT',
        ],
      ];
      if (a) {
        rows.push([
          'SHARE INSIDE THE ACCESS STUDY AREA',
          fmt(a.coverageShare, 'shareToPct'),
        ]);
        rows.push([
          'NO MAPPED ROAD NEARBY',
          a.noMappedRoadShare !== null ? fmt(a.noMappedRoadShare, 'pct1') : '—',
        ]);
        rows.push([
          'MEDIAN KM TO HOSPITAL, BEFORE → AFTER',
          a.medianBaselineKm !== null
            ? `${fmt(a.medianBaselineKm, 'dec1')} → ${fmt(a.medianScenarioKm, 'dec1')}`
            : '—',
        ]);
      } else
        rows.push([
          'HEALTH ACCESS',
          a === undefined || context.accessUnavailable
            ? 'ACCESS ANALYSIS NOT LOADED'
            : 'OUTSIDE THE ANALYSIS AREA',
        ]);
      return {
        kind,
        title: String(item.name ?? 'DISTRICT').toUpperCase(),
        rows,
        tag: { source: 'COD-AB × WORLDPOP × USGS', cls: 'DERIVED' },
        note: a
          ? 'Access is distance along roads mapped the day before, to hospitals in the government list.'
          : a === undefined || context.accessUnavailable
            ? 'The health-access artefact did not load, so no access figure can be shown.'
            : 'This district lies outside the envelope the health-access analysis covered.',
        scene: 'people-meet-shaking',
      };
    }
    default:
      return {
        kind,
        title: 'NOTHING HERE',
        rows: [],
        tag: null,
        note: 'No object the analysis covers is under the pointer.',
        scene: null,
      };
  }
}
