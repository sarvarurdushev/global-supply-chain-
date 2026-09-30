/**
 * Geometry for the executive briefing: the shapes the briefing draws, cut to
 * the size a browser can animate.
 *
 *   INPUT   data/processed: districts, ShakeMap contours, UNOSAT damage sites,
 *           USGS events; data/analysis: seismic (for the named events)
 *   PROCESS national outline dissolved from the district polygons; every line
 *           simplified for drawing; points reduced to compact rows
 *   OUTPUT  data/analysis/nepal-2015-briefing-geometry.json
 *
 * NOTHING HERE IS A NEW RESULT. It is the same geometry the Stage 3–5
 * analyses used, simplified for drawing — no count, share or statistic is
 * computed in this file, and the briefing reads every figure it shows from
 * the analysis artefacts, never from these shapes. Simplification is for the
 * eye only: a district line moved by up to 300 m cannot change any number,
 * because no number is computed from it.
 *
 * WHY DISSOLVE THE OUTLINE HERE. The briefing opens by drawing Nepal's border
 * as a single line that travels around the country. The district polygons
 * share their edges exactly (they come from one topologically consistent
 * source), so the national border is precisely the set of edges that belong
 * to only one district. Doing that in the browser would be analysis in the
 * frontend; doing it here makes it a reproducible, inspectable artefact.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { contoursToRings, decodePopulationGrid, intensityAt } from '../../src/nepal/analysis/exposure.js';
import { damageGrid } from '../../src/nepal/analysis/damage.js';
import { simplifyLine } from '../../src/nepal/access/network.js';
import { pointInPolygon } from '../../src/nepal/geo/geometry.js';
import { ANALYSIS, PROCESSED, writeAnalysis } from '../lib/io.mjs';

const load = async (dir, name) => JSON.parse(await readFile(path.join(dir, name), 'utf8'));

const round5 = (value) => Math.round(value * 1e5) / 1e5;
const round4 = (value) => Math.round(value * 1e4) / 1e4;

const MAJOR_ROAD_CLASSES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
const flat = (ring) => ring.flatMap(([lon, lat]) => [round5(lon), round5(lat)]);

/** Every ring of a Polygon or MultiPolygon, outer and holes. */
function rings(geometry) {
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
  return [];
}

/**
 * The boundary of the union of polygons that share edges exactly: the edges
 * that occur once, chained back into rings. Exported for its test.
 */
export function dissolveOutline(polygonRings) {
  const k = ([lon, lat]) => `${lon.toFixed(5)},${lat.toFixed(5)}`;
  const count = new Map();
  const edges = [];
  for (const ring of polygonRings) {
    for (let i = 1; i < ring.length; i += 1) {
      const a = k(ring[i - 1]);
      const b = k(ring[i]);
      if (a === b) continue;
      const id = a < b ? `${a}|${b}` : `${b}|${a}`;
      count.set(id, (count.get(id) ?? 0) + 1);
      edges.push({ id, a, b, from: ring[i - 1], to: ring[i] });
    }
  }
  const outer = edges.filter((edge) => count.get(edge.id) === 1);
  const next = new Map();
  for (const edge of outer) {
    if (!next.has(edge.a)) next.set(edge.a, []);
    next.get(edge.a).push(edge);
  }
  const used = new Set();
  const result = [];
  for (const start of outer) {
    if (used.has(start)) continue;
    const chain = [start.from];
    let edge = start;
    while (edge && !used.has(edge)) {
      used.add(edge);
      chain.push(edge.to);
      edge = (next.get(edge.b) ?? []).find((candidate) => !used.has(candidate));
    }
    result.push(chain);
  }
  return result.sort((x, y) => y.length - x.length);
}

export async function buildBriefingGeometry() {
  const districts = await load(PROCESSED, 'nepal-districts-adm2-2015.json');
  const contours = await load(PROCESSED, 'nepal-2015-shakemap-contours.json');
  const unosat = await load(PROCESSED, 'nepal-2015-unosat-damage-sites.json');
  const seismicEvents = await load(PROCESSED, 'nepal-2015-seismic.json');
  const seismic = await load(ANALYSIS, 'nepal-2015-seismic-analysis.json');

  const allRings = districts.data.features.flatMap((feature) => rings(feature.geometry));
  const outline = dissolveOutline(allRings)
    /* The border proper, not slivers where two sources' edges differ by a hair. */
    .filter((ring) => ring.length > 200)
    .map((ring) => flat(simplifyLine(ring, 400)));

  const districtShapes = districts.data.features.map((feature) => ({
    name: feature.properties.district,
    key: feature.properties.districtKey,
    label: feature.properties.centroid.map(round5),
    rings: rings(feature.geometry)
      .filter((ring) => ring.length > 3)
      .map((ring) => flat(simplifyLine(ring, 300))),
  }));

  const shakeRings = contoursToRings(contours.data.features);
  const { levels } = shakeRings;
  const bands = levels.map(({ mmi, rings: levelRings }) => ({
    mmi,
    rings: levelRings.map((ring) => flat(simplifyLine(ring, 400))),
  }));

  const CLASSES = ['Destroyed', 'Severe Damage', 'Moderate Damage', 'Possible Damage'];
  const dates = [...new Set(unosat.data.features.map((f) => f.properties.sensorDate))].sort();
  const areas = [...new Set(unosat.data.features.map((f) => f.properties.settlement ?? '(unlabelled)'))].sort();
  const damage = unosat.data.features.map((f) => [
    round5(f.geometry.coordinates[0]),
    round5(f.geometry.coordinates[1]),
    CLASSES.indexOf(f.properties.damageClass),
    dates.indexOf(f.properties.sensorDate),
    areas.indexOf(f.properties.settlement ?? '(unlabelled)'),
  ]);
  /*
   * Where each analysis area is, as the mean of its own points — a label
   * position, drawn beside a count the damage analysis published.
   */
  const areaAnchors = areas.map((name, i) => {
    const pts = damage.filter((row) => row[4] === i);
    return {
      name,
      lon: round5(pts.reduce((s, row) => s + row[0], 0) / pts.length),
      lat: round5(pts.reduce((s, row) => s + row[1], 0) / pts.length),
    };
  });

  const events = seismicEvents.data.events.map((e) => [
    round5(e.longitude),
    round5(e.latitude),
    e.magnitude,
    Math.round(e.depthKm * 100) / 100,
    Math.round(e.hoursFromMainShock * 1000) / 1000,
  ]);

  const main = seismic.results.mainShock;
  /* Which district the epicentre falls in: a point-in-polygon test on the 2015 frame. */
  const epicentreDistrict =
    districts.data.features.find((feature) => pointInPolygon([main.longitude, main.latitude], feature.geometry))?.properties.district ?? null;
  const outlineLon = outline[0].filter((_, i) => i % 2 === 0);
  const outlineLat = outline[0].filter((_, i) => i % 2 === 1);
  const damageLon = damage.map((row) => row[0]);
  const damageLat = damage.map((row) => row[1]);
  const secondary = seismic.results.omori.secondary;
  const secondaryEvent = seismicEvents.data.events.find((e) => e.id === secondary.id);
  const kathmandu = districtShapes.find((d) => d.key === 'kathmandu');

  /*
   * The April 2015 road network, for drawing. Major classes keep their
   * shape to 150 m; minor roads and tracks of 500 m or more are kept to
   * 400 m and shorter stubs are dropped — at briefing scale they are pixels.
   * Every distance the briefing quotes comes from the health-access analysis,
   * which routed the full network; nothing is measured on these lines.
   */
  const network = await load(PROCESSED, 'nepal-2015-osm-access-network.json');
  const roadDraw = { major: [], minor: [] };
  network.data.edges.forEach(([, , metres, classIndex], e) => {
    const isMajor = MAJOR_ROAD_CLASSES.has(network.data.classes[classIndex]);
    if (!isMajor && metres < 500) return;
    const flatShape = network.data.edgeShapes[e];
    const pairs = [];
    for (let k = 0; k < flatShape.length; k += 2) pairs.push([flatShape[k], flatShape[k + 1]]);
    const simplified = simplifyLine(pairs, isMajor ? 150 : 400);
    (isMajor ? roadDraw.major : roadDraw.minor).push(simplified.flatMap(([lon, lat]) => [round4(lon), round4(lat)]));
  });

  /*
   * Where people lived, for drawing: the WorldPop 1 km cells summed into
   * 6 × 6 blocks (about 5 km). Each block also carries the people in cells the
   * exposure analysis puts in its HIGH SHAKING, HIGH DENSITY quadrant — with
   * that analysis' own threshold and density cut, read from its artefact, so
   * the map lights exactly the cells its figure counts.
   */
  const exposure = await load(ANALYSIS, 'nepal-2015-population-exposure.json');
  const quadrantParams = exposure.results.populationIntensityQuadrants.parameters;
  const populationFile = await load(PROCESSED, 'nepal-2015-population-1km.json');
  const grid = populationFile.data.grid;
  const blocks = new Map();
  for (const cell of decodePopulationGrid(populationFile.data)) {
    if (cell.people <= 0) continue;
    const col = Math.round((cell.lon - grid.originLon) / grid.stepLon);
    const row = Math.round((grid.originLat - cell.lat) / grid.stepLat);
    const key = `${Math.floor(col / 6)}:${Math.floor(row / 6)}`;
    const block = blocks.get(key) ?? { lon: 0, lat: 0, people: 0, highHigh: 0 };
    block.lon += cell.lon * cell.people;
    block.lat += cell.lat * cell.people;
    block.people += cell.people;
    const mmi = intensityAt(shakeRings, cell.lon, cell.lat);
    if (mmi !== null && mmi >= quadrantParams.intensityThreshold && cell.people >= quadrantParams.densityCutPeoplePerCell) {
      block.highHigh += cell.people;
    }
    blocks.set(key, block);
  }
  const populationBlocks = [...blocks.values()]
    .filter((block) => block.people >= 50)
    .map((block) => [round4(block.lon / block.people), round4(block.lat / block.people), Math.round(block.people), Math.round(block.highHigh)]);

  /* The 1 km damage grid, by the damage analysis' own function: busiest cell first. */
  const damageCells = damageGrid(
    unosat.data.features.map((f) => ({ coordinates: f.geometry.coordinates, damageClass: f.properties.damageClass })),
    { cellMetres: 1000 },
  ).cells.map((cell) => [cell.lon, cell.lat, cell.count]);

  /* Checks a wrong drawing would fail: they guard the shapes, not a result. */
  const [ring] = outline;
  const bandOrder = bands.map((band) => band.mmi);
  const outsideBox = damage.filter(
    ([lon, lat]) => lon < Math.min(...outlineLon) || lon > Math.max(...outlineLon) || lat < Math.min(...outlineLat) || lat > Math.max(...outlineLat),
  ).length;
  const checks = [
    {
      name: 'The dissolved national outline is one closed ring',
      passed: outline.length === 1 && ring[0] === ring[ring.length - 2] && ring[1] === ring[ring.length - 1],
      detail: `${outline.length} ring, ${ring.length / 2} positions`,
    },
    {
      name: 'Every district of the source boundaries is drawn',
      passed: districtShapes.length === districts.data.features.length,
      detail: `${districtShapes.length} of ${districts.data.features.length}`,
    },
    {
      name: 'Every damage point lies within the national outline’s extent',
      passed: outsideBox === 0,
      detail: `${damage.length} points, ${outsideBox} outside`,
    },
    {
      name: 'Shaking bands are ordered by intensity',
      passed: bandOrder.every((mmi, i) => i === 0 || mmi > bandOrder[i - 1]),
      detail: bandOrder.join(', '),
    },
    {
      name: 'The drawn damage grid holds every damage point',
      passed: damageCells.reduce((sum, cell) => sum + cell[2], 0) === damage.length,
      detail: `${damageCells.length} cells, ${damageCells.reduce((sum, cell) => sum + cell[2], 0)} points`,
    },
    {
      name: 'The drawn population blocks sum to the high-shaking, high-density figure the exposure analysis reports',
      passed:
        Math.abs(
          populationBlocks.reduce((sum, block) => sum + block[3], 0) -
            exposure.results.populationIntensityQuadrants.quadrants.find((q) => q.id === 'HIGH_INTENSITY_HIGH_DENSITY').people,
        ) <= populationBlocks.length,
      detail: `${populationBlocks.reduce((sum, block) => sum + block[3], 0)} drawn against ${exposure.results.populationIntensityQuadrants.quadrants.find((q) => q.id === 'HIGH_INTENSITY_HIGH_DENSITY').people} reported (block rounding)`,
    },
    {
      name: 'The drawn roads are a subset of the routed network',
      passed: roadDraw.major.length + roadDraw.minor.length > 0 && roadDraw.major.length + roadDraw.minor.length <= network.data.edges.length,
      detail: `${roadDraw.major.length} major and ${roadDraw.minor.length} minor edges drawn of ${network.data.edges.length} routed`,
    },
  ];

  const artefact = {
    schemaVersion: 1,
    stage: 9,
    artefact: 'briefing geometry',
    generatedAt: new Date().toISOString().slice(0, 10),
    dataClass: 'DERIVED',
    statement:
      'Drawing geometry only. Every shape is taken from a processed Stage 2 artefact and simplified for display; no figure is computed from it.',
    validation: { passed: checks.every((check) => check.passed), checks },
    /* No analytical record: nothing here is a result. The array is present so every analysis artefact has the same shape. */
    methodology: [],
    sources: [
      'data/processed/nepal-districts-adm2-2015.json',
      'data/processed/nepal-2015-shakemap-contours.json',
      'data/processed/nepal-2015-unosat-damage-sites.json',
      'data/processed/nepal-2015-seismic.json',
      'data/analysis/nepal-2015-seismic-analysis.json',
      'data/processed/nepal-2015-osm-access-network.json',
    ],
    simplification: {
      method: 'Douglas–Peucker on a local equirectangular projection',
      toleranceMetres: { outline: 400, districts: 300, shakemapBands: 400, majorRoads: 150, minorRoads: 400 },
      note: 'For drawing only. Areas, counts and memberships are never computed from these shapes.',
    },
    counts: { districts: districtShapes.length },
    /*
     * Framing anchors for the camera and places for labels. The centres are
     * midpoints of extents, used only to point the camera; the country labels
     * are cartographic placements, not data.
     */
    places: {
      epicentre: { lon: main.longitude, lat: main.latitude, id: main.id, district: epicentreDistrict },
      nepal: { lon: round5((Math.min(...outlineLon) + Math.max(...outlineLon)) / 2), lat: round5((Math.min(...outlineLat) + Math.max(...outlineLat)) / 2), basis: 'centre of the national outline’s extent' },
      damageCentre: { lon: round5((Math.min(...damageLon) + Math.max(...damageLon)) / 2), lat: round5((Math.min(...damageLat) + Math.max(...damageLat)) / 2), basis: 'centre of the UNOSAT observations’ extent' },
      shakeCentre: { lon: round5((main.longitude + kathmandu.label[0]) / 2), lat: round5((main.latitude + kathmandu.label[1]) / 2), basis: 'midpoint of the epicentre and Kathmandu' },
      india: { lon: 79.2, lat: 23.2, basis: 'cartographic label placement' },
      china: { lon: 88.5, lat: 32.2, basis: 'cartographic label placement' },
      secondary: { lon: secondaryEvent.longitude, lat: secondaryEvent.latitude, id: secondary.id },
      kathmandu: { lon: kathmandu.label[0], lat: kathmandu.label[1], basis: 'Kathmandu district label point (COD-AB centroid)' },
      accessCentre: {
        lon: round5((network.data.bbox[0] + network.data.bbox[2]) / 2),
        lat: round5((network.data.bbox[1] + network.data.bbox[3]) / 2),
        basis: 'centre of the health-access analysis envelope',
      },
    },
    outline,
    districts: districtShapes,
    shakemapBands: bands,
    damage: { fields: ['lon', 'lat', 'class', 'sensorDate', 'area'], classes: CLASSES, dates, areas, areaAnchors, rows: damage },
    seismicEvents: { fields: ['lon', 'lat', 'magnitude', 'depthKm', 'hoursFromMainShock'], rows: events },
    population: {
      fields: ['lon', 'lat', 'people', 'peopleHighShakingHighDensity'],
      blockCells: 6,
      minimumPeople: 50,
      note: 'People-weighted centre of each 6 × 6 block of WorldPop 2015 1 km cells; blocks under 50 people are not drawn.',
      rows: populationBlocks,
    },
    damageGrid: { fields: ['lon', 'lat', 'count'], cellMetres: 1000, order: 'busiest first', rows: damageCells },
    roads: { instant: '2015-04-24', majorClasses: [...MAJOR_ROAD_CLASSES], minorMinimumMetres: 500, major: roadDraw.major, minor: roadDraw.minor },
  };
  const written = await writeAnalysis('nepal-2015-briefing-geometry.json', artefact);
  return { written, outlineRings: outline.length, outlinePositions: outline.reduce((s, r) => s + r.length / 2, 0), districts: districtShapes.length, bands: bands.map((b) => `${b.mmi}:${b.rings.length}`), damage: damage.length, events: events.length, roads: { major: roadDraw.major.length, minor: roadDraw.minor.length } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(await buildBriefingGeometry(), null, 1));
}
