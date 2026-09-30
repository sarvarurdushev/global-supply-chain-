#!/usr/bin/env node
/**
 * Stage 9 — health access before and after the observed road damage.
 *
 *   INPUT    data/processed: OSM roads and health facilities as at 2015-04-24,
 *            the DoHS/WHO facility list (2010), NGA blockages and bridges,
 *            WorldPop 2015 (1 km), ShakeMap contours, district boundaries,
 *            UNOSAT damage sites (for the named analysis areas)
 *   OUTPUT   data/analysis/nepal-2015-health-access.json
 *
 * The question, exactly: for the people in each populated 1 km cell of the
 * study envelope, how far along roads mapped the day before the earthquake
 * was the nearest hospital — and how did that distance change when the road
 * blockages and bridge losses observed in the following days are removed
 * from the network?
 *
 * What this is NOT, stated where the numbers are made:
 *   - not a travel time. No road speeds or surface conditions exist for
 *     April 2015 (Stage 5 data gap). Every figure is metres along mapped road;
 *   - not a record of anyone's journey, or of any rescue;
 *   - not a statement of what a hospital could do. The facility lists carry a
 *     type, never beds, staff or services, and none is invented here;
 *   - not complete. A road or hospital OpenStreetMap had not mapped is
 *     invisible, and the damaged network applies every observed blockage at
 *     once although they were observed on different days (a SCENARIO).
 *
 * The primary facility list is the Department of Health Services / WHO
 * list. It dates from 2010 — the most recent official list openly available —
 * and is labelled with that year wherever it is used. The OpenStreetMap
 * facilities as mapped on 2015-04-24 are run alongside it as a second,
 * independent list, and the two are compared rather than merged.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DataClass } from '../../src/nepal/registry.js';
import { createSpatialAnalysisRecord } from '../../src/nepal/analysis/methodology.js';
import { ResultClass } from '../../src/nepal/analysis/terminology.js';
import { contoursToRings, intensityAt, decodePopulationGrid } from '../../src/nepal/analysis/exposure.js';
import { pointInPolygon } from '../../src/nepal/geo/geometry.js';
import { normaliseObservationDate } from '../../src/nepal/analysis/damageLinkage.js';
import { SNAP_TOLERANCES_METRES, matchBlockagesToEdges } from '../../src/nepal/analysis/network.js';
import { buildCsr, buildNodeIndex, multiSourceDijkstra, pathToSource, snapToNode } from '../../src/nepal/access/routing.js';
import {
  CHANGE_ORDER,
  ChangeCategory,
  classifyChange,
  paretoFront,
  weightedMedian,
  weightingSensitivity,
} from '../../src/nepal/access/analysis.js';
import { FacilityTier } from '../../src/nepal/access/facilities.js';
import { haversineMetres, simplifyLine } from '../../src/nepal/access/network.js';
import { PROCESSED, REGISTRY, writeAnalysis } from '../lib/io.mjs';

const read = async (name) => JSON.parse(await readFile(path.join(PROCESSED, name), 'utf8'));

/* ------------------------------------------------------------ parameters */

/**
 * How far a populated cell's centre may be from a mapped junction and still
 * be given a road distance. A 1 km cell's centre is up to ~710 m from its
 * corner, so 2 km allows the cell plus a walking leg to the road; beyond it
 * the cell is reported as having NO MAPPED ROAD NEARBY rather than given a
 * number. Results are also reported at 1 km and 5 km.
 */
const ORIGIN_SNAP_METRES = 2000;
const ORIGIN_SNAP_CANDIDATES = [1000, 2000, 5000];

/** A facility further than this from any mapped junction is off the network and not a routing target. */
const FACILITY_SNAP_METRES = 1000;

/**
 * A change at or below this is SIMILAR. One kilometre is larger than the
 * error snapping two points to junctions introduces on these roads, and
 * smaller than any detour a driver would call one. Reported at 0.5 and 2 km.
 */
const SIMILAR_METRES = 1000;
const SIMILAR_CANDIDATES = [500, 1000, 2000];

/** The blockage-to-road tolerance ceiling, the same as Stage 5 and for the same reason. */
const SNAP_CEILING_METRES = 100;

/** A district enters the pressure comparison only if this share of its people lies inside the envelope. */
const DISTRICT_COVERAGE_FLOOR = 0.9;

const PRESSURE_KEYS = ['peopleMmi7', 'medianScenarioKm', 'disruptedShare'];
const PRESSURE_SCHEMES = [
  { id: 'equal', label: 'Equal weights', weights: { peopleMmi7: 1, medianScenarioKm: 1, disruptedShare: 1 } },
  { id: 'exposure-led', label: 'Shaking exposure weighted double', weights: { peopleMmi7: 2, medianScenarioKm: 1, disruptedShare: 1 } },
  { id: 'distance-led', label: 'Hospital distance weighted double', weights: { peopleMmi7: 1, medianScenarioKm: 2, disruptedShare: 1 } },
  { id: 'disruption-led', label: 'Road disruption weighted double', weights: { peopleMmi7: 1, medianScenarioKm: 1, disruptedShare: 2 } },
];

const km = (metres) => (Number.isFinite(metres) ? Number((metres / 1000).toFixed(2)) : null);
const round5 = (value) => Number(value.toFixed(5));
const pct = (part, whole) => (whole > 0 ? Number(((part / whole) * 100).toFixed(1)) : null);

/** The same knee rule Stage 5 used, so the two network results are comparable. */
function chooseSnapTolerance(curve) {
  let chosen = curve[0].toleranceMetres;
  for (let i = 1; i < curve.length; i += 1) {
    if (curve[i].toleranceMetres > SNAP_CEILING_METRES) break;
    if (curve[i].matchedShare - curve[i - 1].matchedShare >= 5) chosen = curve[i].toleranceMetres;
    else break;
  }
  return chosen;
}

/** Connected components by union-find, largest first. */
function componentSizes(nodeCount, edges, disabled = null) {
  const parent = new Int32Array(nodeCount).map((_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  edges.forEach(([a, b], e) => {
    if (disabled?.[e]) return;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  });
  const sizes = new Map();
  for (let i = 0; i < nodeCount; i += 1) sizes.set(find(i), (sizes.get(find(i)) ?? 0) + 1);
  return [...sizes.values()].sort((a, b) => b - a);
}

/** A route's coordinates, oriented from the origin junction to the facility. */
function pathCoordinates(pathEdges, startNode, edges, shapes) {
  const out = [];
  let at = startNode;
  for (const e of pathEdges) {
    const [from, to] = edges[e];
    const shape = from === at ? shapes[e] : [...shapes[e]].reverse();
    for (const position of out.length ? shape.slice(1) : shape) out.push(position);
    at = from === at ? to : from;
  }
  return simplifyLine(out, 25).map(([lon, lat]) => [round5(lon), round5(lat)]);
}

export async function analyseHealthAccess() {
  const networkFile = await read('nepal-2015-osm-access-network.json');
  const osmFacilitiesFile = await read('nepal-2015-osm-health-facilities.json');
  const codFile = await read('nepal-2010-health-facilities-dohs.json');
  const ngaFile = await read('nepal-2015-nga-infrastructure-damage.json');
  const populationFile = await read('nepal-2015-population-1km.json');
  const shakemapFile = await read('nepal-2015-shakemap-contours.json');
  const boundariesFile = await read('nepal-districts-adm2-2015.json');
  const unosatFile = await read('nepal-2015-unosat-damage-sites.json');
  /* The registry record holds the list's compilation date, read from the file's own metadata at ingest. */
  const codRecord = JSON.parse(await readFile(path.join(REGISTRY, 'dohs-who-nepal-health-facilities.json'), 'utf8'));

  const bbox = networkFile.data.bbox;
  const inBox = (lon, lat) => lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
  const rings = contoursToRings(shakemapFile.data.features);
  const districts = boundariesFile.data.features.map((feature) => ({
    district: feature.properties.district,
    bbox: feature.properties.bbox,
    geometry: feature.geometry,
  }));
  const districtOf = (lon, lat) => {
    for (const district of districts) {
      const box = district.bbox;
      if (box && (lon < box[0] || lon > box[2] || lat < box[1] || lat > box[3])) continue;
      if (pointInPolygon([lon, lat], district.geometry)) return district.district;
    }
    return null;
  };

  /* ---------------- the network ---------------- */

  const nodes = networkFile.data.nodes;
  const edges = networkFile.data.edges;
  /* Shapes are stored flat, [lon, lat, lon, lat, ...]; pairs are easier to walk. */
  const shapes = networkFile.data.edgeShapes.map((flat) => {
    const pairs = [];
    for (let i = 0; i < flat.length; i += 2) pairs.push([flat[i], flat[i + 1]]);
    return pairs;
  });
  const csr = buildCsr(nodes.length, edges);
  const nodeIndex = buildNodeIndex(nodes, 0.02);
  const baselineComponents = componentSizes(nodes.length, edges);

  /* ---------------- the observed damage, on this fuller network ---------------- */

  const blockages = [
    ...ngaFile.data.blockedRoads.features.map((feature, index) => ({ id: `road-${index}`, kind: 'blocked-road', geometry: feature.geometry, sensedOn: normaliseObservationDate(feature.properties.sensedOn) })),
    ...ngaFile.data.bridgesOut.features.map((feature, index) => ({ id: `bridge-${index}`, kind: 'bridge-out', geometry: feature.geometry, sensedOn: normaliseObservationDate(feature.properties.sensedOn) })),
  ];
  /* The Stage 5 matcher reads edges as {id, coordinates} and indexes ids ending "f". */
  const matcherGraph = { edges: () => shapes.map((coordinates, e) => ({ id: `${e}f`, coordinates })) };
  const matching = matchBlockagesToEdges(matcherGraph, blockages, { tolerances: SNAP_TOLERANCES_METRES });
  const snapMetres = chooseSnapTolerance(matching.curve);
  const matchedEdge = (match) =>
    match.edgeId && match.distanceMetres !== null && match.distanceMetres <= snapMetres ? Number.parseInt(match.edgeId, 10) : null;
  const disabled = new Uint8Array(edges.length);
  for (const match of matching.matches) {
    const e = matchedEdge(match);
    if (e !== null) disabled[e] = 1;
  }
  const damagedComponents = componentSizes(nodes.length, edges, disabled);
  const classNames = networkFile.data.classes;
  const matchedByClass = {};
  for (const match of matching.matches) {
    const e = matchedEdge(match);
    if (e === null) continue;
    const name = classNames[edges[e][3]] ?? 'unknown';
    matchedByClass[name] = (matchedByClass[name] ?? 0) + 1;
  }

  /* ---------------- facilities ---------------- */

  const snapFacility = (facility) => {
    const hit = snapToNode(nodeIndex, facility.lon, facility.lat, FACILITY_SNAP_METRES);
    return hit ? { ...facility, node: hit.node, snapMetres: Math.round(hit.metres) } : { ...facility, node: null, snapMetres: null };
  };
  const codInBox = codFile.data.facilities.filter((f) => inBox(f.lon, f.lat));
  const codHospitals = codInBox.filter((f) => f.tier === FacilityTier.HOSPITAL).map(snapFacility);
  const codClinical = codInBox.filter((f) => f.tier !== FacilityTier.NON_CLINICAL).map(snapFacility);
  const osmHospitals = osmFacilitiesFile.data.facilities.filter((f) => f.kind === 'hospital' && inBox(f.lon, f.lat)).map(snapFacility);

  const sourcesOf = (list) => list.filter((f) => f.node !== null).map((f) => ({ node: f.node, offsetMetres: f.snapMetres, facility: f }));
  const sets = {
    codHospital: sourcesOf(codHospitals),
    codClinical: sourcesOf(codClinical),
    osmHospital: sourcesOf(osmHospitals),
  };
  const search = {};
  for (const [id, sources] of Object.entries(sets)) {
    search[id] = {
      baseline: multiSourceDijkstra(csr, sources),
      scenario: multiSourceDijkstra(csr, sources, { disabled }),
    };
  }

  /* ---------------- origins: every populated cell in the envelope ---------------- */

  const districtTotals = new Map();
  const origins = [];
  for (const cell of decodePopulationGrid(populationFile.data)) {
    if (cell.people <= 0) continue;
    const district = districtOf(cell.lon, cell.lat);
    if (!district) continue;
    const totals = districtTotals.get(district) ?? { total: 0, inside: 0 };
    totals.total += cell.people;
    districtTotals.set(district, totals);
    if (!inBox(cell.lon, cell.lat)) continue;
    totals.inside += cell.people;
    const hit = snapToNode(nodeIndex, cell.lon, cell.lat, Math.max(...ORIGIN_SNAP_CANDIDATES));
    origins.push({
      lon: cell.lon,
      lat: cell.lat,
      people: cell.people,
      district,
      mmi: intensityAt(rings, cell.lon, cell.lat),
      node: hit?.node ?? null,
      snapMetres: hit ? hit.metres : Infinity,
    });
  }

  const accessOf = (origin, result) => {
    if (origin.node === null) return { metres: Infinity, facility: -1 };
    const d = result.dist[origin.node];
    return { metres: Number.isFinite(d) ? d + origin.snapMetres : Infinity, facility: result.source[origin.node] };
  };

  const categorise = (origin, setId, similarMetres) => {
    const before = accessOf(origin, search[setId].baseline);
    const after = accessOf(origin, search[setId].scenario);
    return {
      category: classifyChange(
        { baseMetres: before.metres, scenarioMetres: after.metres, baseFacility: before.facility, scenarioFacility: after.facility },
        { similarMetres },
      ),
      before,
      after,
    };
  };

  /* ---------------- population summaries ---------------- */

  const studyPeople = origins.reduce((sum, o) => sum + o.people, 0);
  const onRoad = (origin, snapLimit) => origin.node !== null && origin.snapMetres <= snapLimit;

  const summarise = (setId, snapLimit, similarMetres) => {
    const byCategory = Object.fromEntries(CHANGE_ORDER.map((c) => [c, 0]));
    let noRoad = 0;
    const baseValues = [];
    const scenValues = [];
    const weights = [];
    for (const origin of origins) {
      if (!onRoad(origin, snapLimit)) {
        noRoad += origin.people;
        continue;
      }
      const { category, before, after } = categorise(origin, setId, similarMetres);
      byCategory[category] += origin.people;
      baseValues.push(before.metres);
      scenValues.push(after.metres);
      weights.push(origin.people);
    }
    const connected = studyPeople - noRoad;
    return {
      originSnapMetres: snapLimit,
      similarMetres,
      peopleNoMappedRoadNearby: Math.round(noRoad),
      peopleNoMappedRoadNearbyShare: pct(noRoad, studyPeople),
      peopleWithRoad: Math.round(connected),
      byCategory: Object.fromEntries(CHANGE_ORDER.map((c) => [c, Math.round(byCategory[c])])),
      byCategoryShareOfRoadConnected: Object.fromEntries(CHANGE_ORDER.map((c) => [c, pct(byCategory[c], connected)])),
      medianBaselineKm: km(weightedMedian(baseValues, weights)),
      medianScenarioKm: km(weightedMedian(scenValues, weights)),
    };
  };

  const headline = {
    codHospital: summarise('codHospital', ORIGIN_SNAP_METRES, SIMILAR_METRES),
    osmHospital: summarise('osmHospital', ORIGIN_SNAP_METRES, SIMILAR_METRES),
    codClinical: summarise('codClinical', ORIGIN_SNAP_METRES, SIMILAR_METRES),
  };
  const sensitivity = [];
  for (const snapLimit of ORIGIN_SNAP_CANDIDATES) {
    for (const similarMetres of SIMILAR_CANDIDATES) {
      const s = summarise('codHospital', snapLimit, similarMetres);
      sensitivity.push({
        originSnapMetres: snapLimit,
        similarMetres,
        peopleWithRoad: s.peopleWithRoad,
        disrupted: s.byCategory.LONGER + s.byCategory.DIFFERENT_FACILITY + s.byCategory.DISCONNECTED,
        disconnected: s.byCategory.DISCONNECTED,
      });
    }
  }

  /* ---------------- by district ---------------- */

  const districtRows = new Map();
  for (const origin of origins) {
    const row =
      districtRows.get(origin.district) ??
      { district: origin.district, people: 0, peopleMmi7: 0, noRoad: 0, byCategory: Object.fromEntries(CHANGE_ORDER.map((c) => [c, 0])), base: [], scen: [], w: [] };
    row.people += origin.people;
    if (origin.mmi !== null && origin.mmi >= 7) row.peopleMmi7 += origin.people;
    if (!onRoad(origin, ORIGIN_SNAP_METRES)) row.noRoad += origin.people;
    else {
      const { category, before, after } = categorise(origin, 'codHospital', SIMILAR_METRES);
      row.byCategory[category] += origin.people;
      if (Number.isFinite(after.metres)) {
        row.base.push(before.metres);
        row.scen.push(after.metres);
        row.w.push(origin.people);
      }
    }
    districtRows.set(origin.district, row);
  }
  const byDistrict = [...districtRows.values()]
    .map((row) => {
      const totals = districtTotals.get(row.district);
      const connected = row.people - row.noRoad;
      const disrupted = row.byCategory.LONGER + row.byCategory.DIFFERENT_FACILITY + row.byCategory.DISCONNECTED;
      return {
        district: row.district,
        people: Math.round(row.people),
        coverageShare: Number((totals.inside / totals.total).toFixed(3)),
        peopleMmi7: Math.round(row.peopleMmi7),
        noMappedRoadShare: pct(row.noRoad, row.people),
        byCategory: Object.fromEntries(CHANGE_ORDER.map((c) => [c, Math.round(row.byCategory[c])])),
        disruptedShare: connected > 0 ? Number((disrupted / connected).toFixed(4)) : 0,
        medianBaselineKm: km(weightedMedian(row.base, row.w)),
        medianScenarioKm: km(weightedMedian(row.scen, row.w)),
      };
    })
    .sort((a, b) => a.district.localeCompare(b.district));

  /* ---------------- rescue-access pressure: Pareto first, weights second ---------------- */

  const comparable = byDistrict.filter((row) => row.coverageShare >= DISTRICT_COVERAGE_FLOOR && row.medianScenarioKm !== null);
  const pressureItems = comparable.map((row) => ({
    id: row.district,
    peopleMmi7: row.peopleMmi7,
    medianScenarioKm: row.medianScenarioKm,
    disruptedShare: row.disruptedShare,
  }));
  const front = paretoFront(pressureItems, PRESSURE_KEYS).map((item) => item.id).sort();
  const weighting = weightingSensitivity(pressureItems, PRESSURE_KEYS, PRESSURE_SCHEMES, { top: 5 });

  /* ---------------- named damage areas: the example routes ---------------- */

  const areaSums = new Map();
  for (const feature of unosatFile.features ?? unosatFile.data.features) {
    const name = feature.properties.settlement;
    if (!name || name === 'Nepal') continue;
    const [lon, lat] = feature.geometry.coordinates;
    const a = areaSums.get(name) ?? { name, lon: 0, lat: 0, n: 0 };
    a.lon += lon;
    a.lat += lat;
    a.n += 1;
    areaSums.set(name, a);
  }
  const hospitalName = (sourceIndex) => {
    const f = sets.codHospital[sourceIndex]?.facility;
    return f ? { id: f.id, type: f.type, district: f.district ?? districtOf(f.lon, f.lat), vdc: f.vdc, lon: f.lon, lat: f.lat } : null;
  };
  const base = search.codHospital.baseline;
  const scen = search.codHospital.scenario;
  const blockagePositions = (edgeIds) =>
    matching.matches
      .filter((m) => edgeIds.includes(matchedEdge(m)))
      .map((m) => {
        const b = blockages.find((item) => item.id === m.id);
        const c = b.geometry.type === 'Point' ? b.geometry.coordinates : b.geometry.coordinates[Math.floor(b.geometry.coordinates.length / 2)];
        return { id: m.id, kind: b.kind, sensedOn: b.sensedOn, lon: round5(c[0]), lat: round5(c[1]) };
      });
  /** Walks a path from its origin junction and returns the junction it ends on. */
  const endOf = (pathEdges, startNode) =>
    pathEdges.reduce((at, e) => (edges[e][0] === at ? edges[e][1] : edges[e][0]), startNode);

  /** Both routes from one junction, drawn, with the blockages that cut the first. */
  const traceFrom = (node, snapMetres) => {
    const reachableBefore = Number.isFinite(base.dist[node]);
    const reachableAfter = Number.isFinite(scen.dist[node]);
    const baseEdges = reachableBefore ? pathToSource(base, edges, node) : null;
    const scenEdges = reachableAfter ? pathToSource(scen, edges, node) : null;
    const cutting = baseEdges ? baseEdges.filter((e) => disabled[e]) : [];
    const leg = (result, pathEdges) => {
      if (!pathEdges) return { km: null, hospital: null, line: null, landsOnHospital: null };
      const source = result.source[node];
      return {
        km: km(result.dist[node] + snapMetres),
        hospital: hospitalName(source),
        line: pathCoordinates(pathEdges, node, edges, shapes),
        landsOnHospital: endOf(pathEdges, node) === sets.codHospital[source].node,
      };
    };
    const before = leg(base, baseEdges);
    const after = leg(scen, scenEdges);
    return {
      category: classifyChange(
        { baseMetres: reachableBefore ? base.dist[node] : Infinity, scenarioMetres: reachableAfter ? scen.dist[node] : Infinity, baseFacility: base.source[node], scenarioFacility: scen.source[node] },
        { similarMetres: SIMILAR_METRES },
      ),
      baseline: before,
      scenario: after,
      extraKm: before.km !== null && after.km !== null ? Number((after.km - before.km).toFixed(2)) : null,
      blockagesOnBaselineRoute: blockagePositions(cutting),
    };
  };

  /* Every named damage area: where its route went, and whether the damage changed it. */
  const areaRoutes = [...areaSums.values()]
    .filter((a) => a.n >= 20)
    .map((a) => {
      const lon = a.lon / a.n;
      const lat = a.lat / a.n;
      const hit = snapToNode(nodeIndex, lon, lat, ORIGIN_SNAP_METRES);
      if (!hit) return { area: a.name, sites: a.n, lon: round5(lon), lat: round5(lat), onNetwork: false, category: null };
      const traced = traceFrom(hit.node, hit.metres);
      return {
        area: a.name,
        sites: a.n,
        lon: round5(lon),
        lat: round5(lat),
        onNetwork: true,
        snapMetres: Math.round(hit.metres),
        category: traced.category,
        baseline: { km: traced.baseline.km, hospital: traced.baseline.hospital },
        scenario: { km: traced.scenario.km, hospital: traced.scenario.hospital },
        blockagesOnBaselineRoute: traced.blockagesOnBaselineRoute.length,
      };
    })
    .sort((a, b) => a.area.localeCompare(b.area));

  /*
   * The two example routes, chosen by rule from the populated cells: the
   * most populous cell whose route got longer or switched hospital, and the
   * most populous cell whose every mapped route was cut. Ties go to the
   * larger detour, then to position, so the choice is reproducible.
   */
  const candidatesFor = (categories) =>
    origins
      .filter((o) => onRoad(o, ORIGIN_SNAP_METRES))
      .map((o) => ({ o, c: categorise(o, 'codHospital', SIMILAR_METRES) }))
      .filter(({ c }) => categories.includes(c.category));
  /* How long the detours were, over the people who had one: the example is then a typical case, not the smallest. */
  const detoured = candidatesFor([ChangeCategory.LONGER, ChangeCategory.DIFFERENT_FACILITY]);
  const detourKm = detoured.map(({ c }) => (c.after.metres - c.before.metres) / 1000);
  const detourWeights = detoured.map(({ o }) => o.people);
  const detourDistribution = {
    people: Math.round(detourWeights.reduce((s, w) => s + w, 0)),
    medianExtraKm: detourKm.length ? Number(weightedMedian(detourKm, detourWeights).toFixed(2)) : null,
    maxExtraKm: detourKm.length ? Number(Math.max(...detourKm).toFixed(2)) : null,
  };
  const pickCell = (categories, minExtraKm = -Infinity) =>
    candidatesFor(categories)
      .filter(({ c }) => !Number.isFinite(c.after.metres) || (c.after.metres - c.before.metres) / 1000 >= minExtraKm)
      .sort(
        (a, b) =>
          b.o.people - a.o.people ||
          (b.c.after.metres - b.c.before.metres) - (a.c.after.metres - a.c.before.metres) ||
          a.o.lon - b.o.lon,
      )[0]?.o ?? null;
  const exampleFrom = (origin, rule) => {
    if (!origin) return null;
    const traced = traceFrom(origin.node, origin.snapMetres);
    /* Where a camera should stand to see both routes: the centre and span of their extent. */
    const all = [origin.lon, origin.lat, ...[traced.baseline.line, traced.scenario.line].filter(Boolean).flat(2)];
    const lons = all.filter((_, i) => i % 2 === 0);
    const lats = all.filter((_, i) => i % 2 === 1);
    const frame = {
      lon: round5((Math.min(...lons) + Math.max(...lons)) / 2),
      lat: round5((Math.min(...lats) + Math.max(...lats)) / 2),
      spanKm: Number((haversineMetres([Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]) / 1000).toFixed(1)),
      basis: 'centre and diagonal of the extent of the origin and both routes, for framing only',
    };
    return {
      selectionRule: rule,
      frame,
      origin: { lon: round5(origin.lon), lat: round5(origin.lat), district: origin.district, people: Math.round(origin.people), snapMetres: Math.round(origin.snapMetres), mmi: origin.mmi },
      ...traced,
    };
  };
  const exampleRoutes = {
    detourDistribution,
    detour: exampleFrom(
      pickCell([ChangeCategory.LONGER, ChangeCategory.DIFFERENT_FACILITY], detourDistribution.medianExtraKm ?? 0),
      'Among the 1 km cells whose nearest-hospital route became longer or switched hospital when the observed blockages are applied, the most populous one whose detour is at least the population-weighted median detour. A typical case, chosen by the pipeline, not by hand.',
    ),
    cut: exampleFrom(
      pickCell([ChangeCategory.DISCONNECTED]),
      'The most populous 1 km cell that had a mapped road route to a hospital before and none after the observed blockages are applied. Chosen by the pipeline, not by hand.',
    ),
  };
  /* ---------------- bridge what-if: each lost bridge on its own ---------------- */

  const bridgeWhatIf = matching.matches
    .filter((m) => m.kind === 'bridge-out')
    .map((m) => {
      const e = matchedEdge(m);
      const b = blockages.find((item) => item.id === m.id);
      if (e === null) return { id: m.id, lon: round5(b.geometry.coordinates[0]), lat: round5(b.geometry.coordinates[1]), matched: false, distanceMetres: m.distanceMetres };
      const only = new Uint8Array(edges.length);
      only[e] = 1;
      const alone = multiSourceDijkstra(csr, sets.codHospital, { disabled: only });
      let longer = 0;
      let cut = 0;
      for (const origin of origins) {
        if (!onRoad(origin, ORIGIN_SNAP_METRES)) continue;
        const before = accessOf(origin, search.codHospital.baseline);
        const after = accessOf(origin, alone);
        if (!Number.isFinite(before.metres)) continue;
        if (!Number.isFinite(after.metres)) cut += origin.people;
        else if (after.metres - before.metres > SIMILAR_METRES) longer += origin.people;
      }
      return {
        id: m.id,
        lon: round5(b.geometry.coordinates[0]),
        lat: round5(b.geometry.coordinates[1]),
        matched: true,
        distanceMetres: m.distanceMetres,
        roadClass: classNames[edges[e][3]] ?? null,
        taggedBridge: edges[e][4] === 1,
        peopleLonger: Math.round(longer),
        peopleCut: Math.round(cut),
      };
    });

  /* ---------------- do the two facility lists agree? ---------------- */

  const nearestMetres = (point, list) => Math.min(...list.map((f) => haversineMetres([point.lon, point.lat], [f.lon, f.lat])));
  const agreementBands = [500, 1000, 2000, 5000];
  const osmToCod = osmHospitals.map((f) => nearestMetres(f, codHospitals));
  const codToOsm = codHospitals.map((f) => nearestMetres(f, osmHospitals));
  const withinCurve = (values) => agreementBands.map((band) => ({ withinMetres: band, count: values.filter((v) => v <= band).length, share: pct(values.filter((v) => v <= band).length, values.length) }));
  const listAgreement = {
    envelope: bbox,
    /* When the government list was compiled, read from its own file metadata at ingest (see its registry record). */
    codCompiled: /(\d{4}-\d{2}-\d{2})/.exec(codRecord.temporalCoverage ?? '')?.[1] ?? null,
    osmInstant: networkFile.validation?.instant ?? null,
    codHospitals: codHospitals.length,
    osmHospitals: osmHospitals.length,
    codClinicalByTier: Object.fromEntries(
      [FacilityTier.HOSPITAL, FacilityTier.PRIMARY, FacilityTier.HEALTH_POST].map((tier) => [tier, codInBox.filter((f) => f.tier === tier).length]),
    ),
    osmNearestCodHospital: withinCurve(osmToCod),
    codNearestOsmHospital: withinCurve(codToOsm),
    offNetwork: {
      codHospitals: codHospitals.filter((f) => f.node === null).length,
      osmHospitals: osmHospitals.filter((f) => f.node === null).length,
      codClinical: codClinical.filter((f) => f.node === null).length,
    },
  };

  /* ---------------- display: what the briefing draws ---------------- */

  const grid = populationFile.data.grid;
  const cellKey = (o) => [Math.round((o.lon - grid.originLon) / grid.stepLon), Math.round((grid.originLat - o.lat) / grid.stepLat)];
  const display = {
    cellMetres: 1000,
    noRoadCellMetres: 3000,
    categories: CHANGE_ORDER,
    /*
     * Cells whose access CHANGED or never had a route: [lon, lat, people,
     * categoryIndex, baselineKm, scenarioKm]. SIMILAR cells are counted in
     * the results but not listed — they are most of the map and draw nothing.
     */
    cells: origins
      .filter((origin) => onRoad(origin, ORIGIN_SNAP_METRES))
      .map((origin) => ({ origin, ...categorise(origin, 'codHospital', SIMILAR_METRES) }))
      .filter(({ category }) => category !== ChangeCategory.SIMILAR)
      .map(({ origin, category, before, after }) => [round5(origin.lon), round5(origin.lat), Math.round(origin.people), CHANGE_ORDER.indexOf(category), km(before.metres), km(after.metres)]),
    /* People more than ORIGIN_SNAP from any mapped road, summed to a 3 km grid: [lon, lat, people]. */
    noRoad: [...origins
      .filter((origin) => !onRoad(origin, ORIGIN_SNAP_METRES))
      .reduce((cells, origin) => {
        const [col, row] = cellKey(origin);
        const key = `${Math.floor(col / 3)}:${Math.floor(row / 3)}`;
        const cell = cells.get(key) ?? { col: Math.floor(col / 3) * 3 + 1, row: Math.floor(row / 3) * 3 + 1, people: 0 };
        cell.people += origin.people;
        cells.set(key, cell);
        return cells;
      }, new Map())
      .values()]
      .map((cell) => [round5(grid.originLon + cell.col * grid.stepLon), round5(grid.originLat - cell.row * grid.stepLat), Math.round(cell.people)]),
    hospitals: codHospitals.map((f) => ({ id: f.id, type: f.type, district: f.district ?? districtOf(f.lon, f.lat), vdc: f.vdc, lon: f.lon, lat: f.lat, onNetwork: f.node !== null })),
    osmHospitals: osmHospitals.map((f) => ({ id: f.id, name: f.name, lon: f.lon, lat: f.lat })),
    blockages: matching.matches.map((m) => {
      const b = blockages.find((item) => item.id === m.id);
      const c = b.geometry.type === 'Point' ? b.geometry.coordinates : b.geometry.coordinates[Math.floor(b.geometry.coordinates.length / 2)];
      return { id: m.id, kind: b.kind, lon: round5(c[0]), lat: round5(c[1]), matched: matchedEdge(m) !== null };
    }),
  };

  /* ---------------- checks ---------------- */

  const h = headline.codHospital;
  const categorised = Object.values(h.byCategory).reduce((s, v) => s + v, 0);
  const shortened = origins.filter((o) => accessOf(o, search.codHospital.scenario).metres < accessOf(o, search.codHospital.baseline).metres - 1e-6).length;
  const curveMonotone = matching.curve.every((row, i) => i === 0 || row.matched >= matching.curve[i - 1].matched);
  const checks = [
    {
      name: 'Every populated cell in the envelope is accounted for exactly once',
      passed: Math.abs(h.peopleWithRoad + h.peopleNoMappedRoadNearby - Math.round(studyPeople)) <= 1,
      detail: `${h.peopleWithRoad} near a road + ${h.peopleNoMappedRoadNearby} not = ${Math.round(studyPeople)} in the envelope`,
    },
    {
      name: 'Removing edges never shortens a distance',
      passed: shortened === 0,
      detail: `${shortened} of ${origins.length} cells nearer after the blockages`,
    },
    {
      name: 'Category totals equal the road-connected population',
      passed: Math.abs(categorised - h.peopleWithRoad) <= CHANGE_ORDER.length,
      detail: `${categorised} categorised against ${h.peopleWithRoad} road-connected (rounding per category)`,
    },
    {
      name: 'The blockage match curve never falls as the tolerance widens',
      passed: curveMonotone,
      detail: matching.curve.map((row) => `${row.toleranceMetres} m: ${row.matched}`).join(', '),
    },
    {
      name: 'Each example route ends on the junction of the hospital its search reports',
      passed: [exampleRoutes.detour, exampleRoutes.cut].every(
        (route) => !route || [route.baseline, route.scenario].every((leg) => leg.line === null || leg.landsOnHospital === true),
      ),
      detail: 'Walked edge by edge from the origin junction',
    },
    {
      name: 'A cut example has a route before and none after',
      passed: !exampleRoutes.cut || (exampleRoutes.cut.baseline.km !== null && exampleRoutes.cut.scenario.km === null),
      detail: exampleRoutes.cut ? `${exampleRoutes.cut.baseline.km} km before, none after` : 'no cell was cut',
    },
  ];

  const sourceOf = (file) => ({
    datasetId: file.source.datasetId,
    license: file.source.license,
    redistribution: file.source.redistribution,
    attribution: file.source.attribution,
  });

  const analysis = {
    schemaVersion: 1,
    stage: 9,
    generatedAt: new Date().toISOString(),
    dataClass: DataClass.SCENARIO,
    criticalCaveat:
      'Distances along roads mapped in OpenStreetMap on 2015-04-24 — not travel times, not journeys, not hospital capacity. The damaged network applies every blockage observed between 26 April and early May as if all were present at once. Hospitals are those in the 2010 government list unless stated.',
    sources: [networkFile, osmFacilitiesFile, codFile, ngaFile, populationFile, shakemapFile, boundariesFile, unosatFile].map(sourceOf),
    validation: { passed: checks.every((c) => c.passed), checks },
    parameters: {
      originSnapMetres: ORIGIN_SNAP_METRES,
      facilitySnapMetres: FACILITY_SNAP_METRES,
      similarMetres: SIMILAR_METRES,
      blockageSnapMetres: snapMetres,
      districtCoverageFloor: DISTRICT_COVERAGE_FLOOR,
    },
    methodology: buildMethodology({ matching, snapMetres, headline, front, weighting, listAgreement, bbox, exampleRoutes }),
    results: {
      network: {
        instant: networkFile.validation?.instant ?? '2015-04-24T00:00:00Z',
        ways: networkFile.validation?.ways ?? null,
        nodes: nodes.length,
        edges: edges.length,
        lengthKm: networkFile.validation?.graphLengthKm ?? null,
        components: baselineComponents.length,
        largestComponentShare: Number((baselineComponents[0] / nodes.length).toFixed(3)),
        damagedComponents: damagedComponents.length,
        newComponents: damagedComponents.length - baselineComponents.length,
      },
      blockageMatching: {
        blockages: matching.blockages,
        curve: matching.curve,
        snapToleranceMetres: snapMetres,
        matched: matching.matches.filter((m) => matchedEdge(m) !== null).length,
        disabledEdges: disabled.reduce((s, v) => s + v, 0),
        matchedByRoadClass: matchedByClass,
        stage5MajorNetworkMatched: 21,
        note: 'Stage 5 matched 21 of 184 on the motorway-to-tertiary network. The fuller 2015 network, which includes the minor roads and tracks most blockages sat on, is what lets more of them attach.',
      },
      studyPopulation: Math.round(studyPeople),
      headline,
      sensitivity,
      byDistrict,
      pressure: {
        dataClass: DataClass.DERIVED,
        warning:
          'A comparison of measured conditions per district, not a record of where help was needed or went, and not a priority list. The Pareto set needs no weights; the weighted rankings exist only to show how much the order depends on them.',
        criteria: [
          { key: 'peopleMmi7', label: 'People inside modelled MMI VII or stronger', source: 'WorldPop 2015 × USGS ShakeMap' },
          { key: 'medianScenarioKm', label: 'Median distance to the nearest hospital, damaged network (km)', source: 'this analysis' },
          { key: 'disruptedShare', label: 'Share of road-connected people whose hospital access lengthened, switched or was cut', source: 'this analysis' },
        ],
        normalisation: 'min-max across the compared districts, per criterion',
        comparedDistricts: comparable.map((row) => row.district),
        excludedForCoverage: byDistrict.filter((row) => row.coverageShare < DISTRICT_COVERAGE_FLOOR).map((row) => ({ district: row.district, coverageShare: row.coverageShare })),
        paretoFront: front,
        schemes: PRESSURE_SCHEMES,
        weighting,
      },
      areaRoutes,
      exampleRoutes,
      bridgeWhatIf,
      listAgreement,
      /*
       * Airfields and helipads as OpenStreetMap held them the day before —
       * places an aircraft could land, not a record that any did. No flight,
       * helicopter or capacity is inferred from them.
       */
      airfields: (() => {
        const pick = (kind) =>
          osmFacilitiesFile.data.facilities
            .filter((f) => f.kind === kind && inBox(f.lon, f.lat))
            .map((f) => ({ id: f.id, name: f.name ?? null, lon: round5(f.lon), lat: round5(f.lat) }));
        const aerodromes = pick('aerodrome');
        const helipads = pick('helipad');
        return {
          instant: networkFile.validation?.instant ?? null,
          aerodromeCount: aerodromes.length,
          helipadCount: helipads.length,
          aerodromes,
          helipads,
          note: 'Mapped landing places as at 2015-04-24. Not a record of use; no flights, aircraft or capacities are inferred.',
        };
      })(),
      display,
      dataGaps: [
        { gap: 'Road speeds and surface condition for April 2015', consequence: 'Distances only; no travel time, isochrone or response time.', couldBeFilledBy: 'A contemporaneous Department of Roads inventory; not found in open form.' },
        { gap: 'Hospital capacity: beds, theatres, staff, damage to the hospital itself', consequence: 'A nearer hospital is not a better one. Nothing here ranks hospitals.', couldBeFilledBy: 'The 2015 Health Cluster facility-status reporting; not published as open data.' },
        { gap: 'A facility list current in April 2015', consequence: 'The 2010 government list may include closed facilities and miss new ones; OpenStreetMap is run alongside it to show the difference.', couldBeFilledBy: 'The DoHS Health Facility Registry for 2015; not openly downloadable.' },
        { gap: 'Air access: helicopter tasking and landing sites in use', consequence: 'Road distance understates access where helicopters were the actual route.', couldBeFilledBy: 'Logistics Cluster helicopter flight logs; not published as open data.' },
        { gap: 'When each blockage cleared', consequence: 'The damaged network is one snapshot with every blockage present.', couldBeFilledBy: 'Logistics Cluster access constraint updates; not machine-readable.' },
      ],
    },
  };

  const written = await writeAnalysis('nepal-2015-health-access.json', analysis);
  return { analysis, written };
}

function buildMethodology({ matching, snapMetres, headline, front, weighting, listAgreement, bbox, exampleRoutes }) {
  const coverage = `The access envelope ${bbox.join(', ')} — central Nepal from Gorkha to Dolakha — on roads mapped in OpenStreetMap by 2015-04-24.`;
  const inputs = [
    { dataset: 'osm-nepal-2015-access', role: 'every motorable road and health facility mapped by 2015-04-24' },
    { dataset: 'dohs-who-nepal-health-facilities', role: 'government health facility list (2010 vintage): the hospitals searched for' },
    { dataset: 'nga-nepal-2015-infrastructure-damage', role: 'observed blocked roads and bridges out' },
    { dataset: 'worldpop-npl-2015-unadj', role: 'where people lived (1 km)' },
  ];
  const h = headline.codHospital;
  return [
    createSpatialAnalysisRecord({
      id: 'access-blockage-matching-full-network',
      name: 'Observed blockages attached to the full 2015 road network',
      question: 'How many observed blockages sit on a road OpenStreetMap had mapped by April 2015, once minor roads and tracks are included?',
      inputs: inputs.slice(0, 1).concat(inputs[2]),
      spatialCoverage: coverage,
      method: 'The Stage 5 matcher, unchanged, run against the all-class network: each marker attaches to its nearest edge, reported across tolerances, with the tolerance taken from the knee of the curve and capped at 100 m.',
      formula: 'd(marker, edge) = min segment-to-segment distance in UTM 45N',
      parameters: { snapToleranceMetres: snapMetres, candidates: SNAP_TOLERANCES_METRES },
      parameterJustification: 'The same knee rule and ceiling Stage 5 used, so the two results differ only in the network.',
      outputs: ['match curve', 'matched blockages by road class', 'edges disabled'],
      visualisation: 'Blockage markers on the map, matched ones joined to the road they cut.',
      validation: `${matching.curve.find((row) => row.toleranceMetres === snapMetres)?.matched ?? 0} of ${matching.blockages} markers attach at ${snapMetres} m, against 21 on the Stage 5 major-road network.`,
      dataClass: DataClass.DERIVED,
      resultClass: ResultClass.DERIVED.id,
      limitations: [
        'A matched marker disables its whole junction-to-junction edge: right for connectivity, an over-statement for length.',
        'A marker that matches nothing sat on a road not mapped in April 2015; it is counted, not dropped.',
      ],
    }),
    createSpatialAnalysisRecord({
      id: 'access-hospital-distance',
      name: 'Distance to the nearest hospital, before and after the observed road damage',
      question: 'How far along mapped roads was the nearest hospital for the people in each 1 km cell, and how did the observed blockages change that?',
      inputs,
      spatialCoverage: coverage,
      method: 'One multi-source Dijkstra outward from every hospital in the 2010 list at once, over the undirected road graph, with and without the matched blockages; each populated cell joins at its nearest junction within the snap limit, adding that straight-line leg. People are counted, not cells.',
      formula: 'access(cell) = snap(cell) + min over hospitals h of [ network(junction(cell), junction(h)) + snap(h) ]',
      parameters: { originSnapMetres: ORIGIN_SNAP_METRES, facilitySnapMetres: FACILITY_SNAP_METRES, similarMetres: SIMILAR_METRES },
      parameterJustification:
        'A 1 km cell centre lies up to 710 m from its edge, so 2 km covers the cell and a walk to the road; beyond it the cell is reported as having no mapped road nearby. One kilometre separates a real change from snapping noise. Both are re-run at other values and the table is published.',
      outputs: ['people by change category', 'median distance before and after', 'the same for the OpenStreetMap hospitals and for any clinical facility'],
      visualisation: 'Populated cells coloured by change category; the example route traced before and after.',
      validation: `${h.peopleWithRoad} people within ${ORIGIN_SNAP_METRES / 1000} km of a mapped road; median ${h.medianBaselineKm} km before and ${h.medianScenarioKm} km after; removing edges never shortened any distance.`,
      dataClass: DataClass.SCENARIO,
      resultClass: ResultClass.SCENARIO.id,
      limitations: [
        'Distance, not time: no road speeds exist for the date.',
        'Every observed blockage is applied at once, although they were observed on different days and some cleared quickly.',
        'The hospital list is from 2010. A hospital opened by 2015 is missing; one closed is still counted.',
        'A nearer hospital is not a better one. No capacity, damage-to-hospital or service information is used, because none is available.',
      ],
    }),
    createSpatialAnalysisRecord({
      id: 'access-pressure-pareto',
      name: 'Rescue-access pressure by district: a Pareto set and its weighting sensitivity',
      question: 'Which districts combined the most people in strong shaking, the longest hospital distances and the most disrupted access — and how much does any ordering of them depend on the weights?',
      inputs,
      spatialCoverage: `${coverage} Districts with less than ${DISTRICT_COVERAGE_FLOOR * 100} per cent of their people inside the envelope are excluded, and listed.`,
      method: 'Three measured criteria per district. The Pareto set (no other district is at least as high on all three and higher on one) needs no weights. Four weighting schemes are then applied to min-max normalised criteria and the resulting ranks compared.',
      formula: 'score_s(d) = sum_k w_sk * (x_dk - min_k) / (max_k - min_k), ranked per scheme s',
      parameters: { schemes: PRESSURE_SCHEMES.map((s) => s.id), top: weighting.top },
      parameterJustification: 'No weighting is defensible on its own, so none is chosen: four are run and the rank spread is the result.',
      outputs: ['Pareto set', 'rank per scheme per district', 'districts in the top five under every scheme'],
      visualisation: 'Districts outlined on the map, the Pareto set marked, with a small rank-spread chart.',
      validation: `Pareto set: ${front.join(', ') || 'none'}. In the top ${weighting.top} under every scheme: ${weighting.stableTop.join(', ') || 'none'}.`,
      dataClass: DataClass.DERIVED,
      resultClass: ResultClass.DERIVED.id,
      limitations: [
        'NOT A PRIORITY LIST and not a record of where help went. It compares measured conditions.',
        'Each criterion inherits its own caveats: modelled shaking, 2010 hospitals, April-2015 roads.',
        'Min-max normalisation is sensitive to the extreme district; the Pareto set is not.',
      ],
    }),
    createSpatialAnalysisRecord({
      id: 'access-example-route',
      name: 'Two example routes to hospital, before and after',
      question: 'For the most populous cell whose route lengthened, and the most populous cell whose route was cut, what did the route look like before and after the observed blockages?',
      inputs,
      spatialCoverage: 'Two 1 km cells, chosen by a stated rule; plus a before-and-after table for every UNOSAT analysis area with at least 20 sites.',
      method: 'The predecessor chain of each search, traced from the area’s junction back to its nearest hospital and drawn from the edge geometry.',
      outputs: ['baseline line and length', 'damaged-network line and length', 'blockages on the baseline route'],
      visualisation: 'The two routes traced in turn, the cut marked where the first one fails.',
      validation: [
        exampleRoutes.detour && `Detour example (${exampleRoutes.detour.origin.district}): ${exampleRoutes.detour.baseline.km} km before, ${exampleRoutes.detour.scenario.km} km after.`,
        exampleRoutes.cut && `Cut example (${exampleRoutes.cut.origin.district}): ${exampleRoutes.cut.baseline.km} km before, no mapped route after.`,
        'Both routes end on the junction of the hospital their search reports.',
      ].filter(Boolean).join(' '),
      dataClass: DataClass.SCENARIO,
      resultClass: ResultClass.SCENARIO.id,
      limitations: [
        'An illustration of the method on one case, chosen by rule; not evidence of any journey that took place.',
        'The destination is the nearest hospital in the 2010 list, not necessarily the one anyone used.',
      ],
    }),
    createSpatialAnalysisRecord({
      id: 'access-facility-list-agreement',
      name: 'Do the 2010 government list and the April 2015 OpenStreetMap map agree on hospitals?',
      question: 'How many hospitals in each list have a counterpart in the other, and how far apart are they?',
      inputs: [inputs[0], inputs[1]],
      spatialCoverage: coverage,
      method: 'Nearest-neighbour great-circle distance from every hospital in one list to the other, reported as a curve over distance bands.',
      outputs: ['share of each list within 0.5, 1, 2 and 5 km of the other', 'hospitals off the mapped network'],
      visualisation: 'Both lists on the map in different marks; the curve in the detail panel.',
      validation: `${listAgreement.codHospitals} hospitals in the 2010 list and ${listAgreement.osmHospitals} tagged hospital in OpenStreetMap inside the envelope.`,
      dataClass: DataClass.DERIVED,
      resultClass: ResultClass.DESCRIPTIVE_STATISTIC.id,
      limitations: [
        'OpenStreetMap "hospital" often tags a clinic; the government list distinguishes types. Disagreement is partly definitional.',
        'Position error in either list is unknown; a counterpart within 500 m may still be a different facility.',
      ],
    }),
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const started = Date.now();
  const { analysis, written } = await analyseHealthAccess();
  const r = analysis.results;
  console.log(JSON.stringify({ pareto: r.pressure.paretoFront, stableTop: r.pressure.weighting.stableTop, examples: Object.fromEntries(Object.entries(r.exampleRoutes).map(([k, v]) => [k, v?.baseline ? { ...v, baseline: { ...v.baseline, line: v.baseline.line?.length }, scenario: { ...v.scenario, line: v.scenario.line?.length } } : v])), areas: r.areaRoutes.map((a) => [a.area, a.category, a.baseline?.km, a.scenario?.km]), bridges: r.bridgeWhatIf, agreement: r.listAgreement, validation: analysis.validation }, null, 1));
  console.log(written?.path ?? written, `${((Date.now() - started) / 1000).toFixed(1)} s`);
}
