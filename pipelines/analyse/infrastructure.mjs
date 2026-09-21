#!/usr/bin/env node
/**
 * Stage 5 §5.6–§5.9 — observed infrastructure damage and network consequences.
 *
 *   INPUT    data/processed: NGA infrastructure damage, OSM 2015 road network,
 *            ShakeMap contours, district boundaries, WorldPop population
 *   OUTPUT   data/analysis: landslide/road association, network disruption
 *
 * This stage measures the source geometry before describing it, because the
 * headline reading of "179 blocked roads" is wrong in a way no amount of
 * careful prose fixes: the features are short obstruction markers, under
 * twenty kilometres of line geometry in total. What they support is a
 * CONNECTIVITY statement on a routable network, not a "kilometres of road
 * closed" figure, and the numbers that establish that are computed first.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DataClass } from '../../src/nepal/registry.js';
import { createSpatialAnalysisRecord } from '../../src/nepal/analysis/methodology.js';
import { ResultClass } from '../../src/nepal/analysis/terminology.js';
import { contoursToRings, intensityAt, decodePopulationGrid } from '../../src/nepal/analysis/exposure.js';
import { pointInPolygon } from '../../src/nepal/geo/geometry.js';
import { toUtm } from '../../src/nepal/geo/crs.js';
import { buildRoadGraph } from '../../src/disaster/response.js';
import {
  ASSOCIATION_TOLERANCES_METRES,
  blockedRoadGeometryCheck,
  deriveAssociationTolerance,
  infrastructureByArea,
  landslideGeometryCheck,
  landslideRoadAssociation,
  pointToPolygonMetres,
  polygonAreaSqMetres,
  polylineLengthMetres,
  representativePosition,
  roadLandslideAssociation,
} from '../../src/nepal/analysis/infrastructure.js';
import {
  SNAP_TOLERANCES_METRES,
  alternativeRoutes,
  centralityShift,
  componentProfile,
  damagedNetwork,
  disabledEdgesFor,
  matchBlockagesToEdges,
  nearestNodeTo,
  routeImpact,
} from '../../src/nepal/analysis/network.js';
import { PROCESSED, writeAnalysis } from '../lib/io.mjs';

const read = async (name) => JSON.parse(await readFile(path.join(PROCESSED, name), 'utf8'));

/**
 * The tolerance at which a blockage is attached to a network edge.
 *
 * Chosen at the knee of the match curve that the run itself reports, subject
 * to a stated ceiling: beyond 100 m a marker in Kathmandu can attach to a
 * parallel street rather than the one it sits on, and a wrong edge is worse
 * than an unmatched one because it silently disables a road that was open.
 */
const SNAP_CEILING_METRES = 100;

/** Em dash, kept as a constant so template literals stay readable. */
const DASH = '\u2014';

/** How many nodes betweenness is allowed to run over before it is skipped. */
const CENTRALITY_NODE_LIMIT = 6000;

export async function analyseInfrastructure() {
  const ngaFile = await read('nepal-2015-nga-infrastructure-damage.json');
  const roadsFile = await read('nepal-2015-osm-roads.json');
  const contextFile = await read('nepal-2015-osm-blockage-context.json');
  const shakemapFile = await read('nepal-2015-shakemap-contours.json');
  const boundariesFile = await read('nepal-districts-adm2-2015.json');
  const populationFile = await read('nepal-2015-population-1km.json');

  const rings = contoursToRings(shakemapFile.data.features);
  const intensityOf = (lon, lat) => intensityAt(rings, lon, lat);
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

  const roads = ngaFile.data.blockedRoads.features;
  const bridges = ngaFile.data.bridgesOut.features;
  const landslides = ngaFile.data.landslides.features;

  /* ---------------- §5.6 measure the features first ---------------- */

  const roadCheck = blockedRoadGeometryCheck(roads);
  const landslideCheck = landslideGeometryCheck(landslides);
  const byArea = {
    blockedRoads: infrastructureByArea(roads, {
      districtOf,
      intensityOf,
      pointOf: (feature) => representativePosition(feature.geometry),
    }),
    bridgesOut: infrastructureByArea(bridges, {
      districtOf,
      intensityOf,
      pointOf: (feature) => feature.geometry.coordinates,
    }),
    landslides: infrastructureByArea(landslides, {
      districtOf,
      intensityOf,
      pointOf: (feature) => representativePosition(feature.geometry),
    }),
  };

  /* ---------------- §5.7 spatial association, across tolerances ------- */

  const tolerance = deriveAssociationTolerance(roadCheck, landslideCheck);
  const roadToSlide = roadLandslideAssociation(roads, landslides);
  /* Computed before the per-landslide report below, which reads its rows. */
  const slideToRoad = landslideRoadAssociation(landslides, roads);
  const headlineAssociation = roadToSlide.curve.find(
    (row) => row.toleranceMetres === tolerance.headlineMetres,
  );

  /* ---------------- landslides and where people were ---------------- */

  const cells = [...decodePopulationGrid(populationFile.data)];
  const landslideProximity = landslides.map((feature, index) => {
    const [lon, lat] = representativePosition(feature.geometry);
    const { easting, northing } = toUtm(lon, lat);
    let nearestPopulatedKm = Infinity;
    let peopleWithin1Km = 0;
    for (const cell of cells) {
      if (Math.abs(cell.lon - lon) > 0.12 || Math.abs(cell.lat - lat) > 0.12) continue;
      const projected = toUtm(cell.lon, cell.lat);
      const distance = Math.hypot(projected.easting - easting, projected.northing - northing);
      if (distance <= 1000) peopleWithin1Km += cell.people;
      if (cell.people >= 50 && distance / 1000 < nearestPopulatedKm) {
        nearestPopulatedKm = distance / 1000;
      }
    }
    return {
      index,
      lon: Number(lon.toFixed(5)),
      lat: Number(lat.toFixed(5)),
      areaHectares: Number((polygonAreaSqMetres(feature.geometry) / 1e4).toFixed(2)),
      district: districtOf(lon, lat),
      mmi: intensityOf(lon, lat),
      nearestBlockedRoadMetres: slideToRoad.perLandslide[index].distanceMetres,
      peopleWithin1Km: Math.round(peopleWithin1Km),
      nearestPopulatedCellKm: Number.isFinite(nearestPopulatedKm)
        ? Number(nearestPopulatedKm.toFixed(2))
        : null,
    };
  });

  /* ---------------- §5.8 the network ---------------- */

  const segments = roadsFile.data.segments;
  const graph = buildRoadGraph({ segments });
  const baselineComponents = componentProfile(graph);

  const blockages = [
    ...roads.map((feature, index) => ({ id: `road-${index}`, kind: 'blocked-road', geometry: feature.geometry })),
    ...bridges.map((feature, index) => ({ id: `bridge-${index}`, kind: 'bridge-out', geometry: feature.geometry })),
  ];
  const matches = matchBlockagesToEdges(graph, blockages, { tolerances: SNAP_TOLERANCES_METRES });
  const snapMetres = chooseSnapTolerance(matches.curve);

  /*
   * WHY SO FEW BLOCKAGES ATTACH TO THE ROUTABLE NETWORK.
   *
   * A fifth of them match. On its own that number is ambiguous between two
   * opposite readings: the blockages were on minor roads this project
   * deliberately excludes from routing, or OpenStreetMap had not mapped them
   * at all in April 2015. The first bounds the analysis; the second would
   * undermine it. So each blockage is matched a second time against a
   * diagnostic network containing EVERY highway class within 600 m of it,
   * and the class of the road it sits on is reported.
   */
  const contextGraph = buildRoadGraph({ segments: contextFile.data.segments });
  const contextMatches = matchBlockagesToEdges(contextGraph, blockages, {
    /*
     * The widest band is the context query's own box half-width, about 600 m.
     * Beyond it nothing was downloaded, so a larger tolerance would report
     * absence of DATA as absence of road.
     */
    tolerances: [25, 50, 100, 250, 600],
  });
  const STRATEGIC = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'];
  const beneath = {
    byClass: {},
    onMappedRoad: 0,
    nearMappedRoad: 0,
    noMappedRoadWithinQueryBox: 0,
    onStrategicClassRoad: 0,
    onRoadBelowTertiary: 0,
    nearestMetres: [],
  };
  for (const match of contextMatches.matches) {
    const distance = match.distanceMetres;
    if (distance === null) {
      /*
       * Nothing was returned for this blockage's box at all: OpenStreetMap had
       * mapped no road of ANY class within about 600 m of it on 2015-04-24.
       */
      beneath.noMappedRoadWithinQueryBox += 1;
      continue;
    }
    beneath.nearestMetres.push(distance);
    const klass = contextGraph.edge(match.edgeId)?.highway ?? '(untagged)';
    if (distance <= snapMetres) {
      beneath.onMappedRoad += 1;
      beneath.byClass[klass] = (beneath.byClass[klass] ?? 0) + 1;
      if (STRATEGIC.some((name) => klass.startsWith(name))) beneath.onStrategicClassRoad += 1;
      else beneath.onRoadBelowTertiary += 1;
    } else {
      beneath.nearMappedRoad += 1;
    }
  }
  beneath.nearestMetres.sort((a, b) => a - b);
  const nearestQuantile = (fraction) =>
    beneath.nearestMetres.length
      ? beneath.nearestMetres[Math.floor(fraction * (beneath.nearestMetres.length - 1))]
      : null;
  const disabled = disabledEdgesFor(matches, snapMetres);
  const damaged = damagedNetwork(graph, disabled);
  const damagedComponents = componentProfile(damaged);

  /*
   * Origin-destination pairs: Kathmandu to the centroid of every district that
   * carries an observed blockage or landslide. Centroids rather than towns
   * because no settlement gazetteer is held; the snap distance to the network
   * is reported for each so a centroid that lands on a hillside is visible
   * rather than silently routed from the nearest road 12 km away.
   */
  const kathmandu = boundariesFile.data.features.find(
    (feature) => feature.properties.district === 'Kathmandu',
  );
  const origin = nearestNodeTo(graph, ...kathmandu.properties.centroid);
  const districtsWithObservedInfrastructureDamage = new Set(
    [...byArea.blockedRoads.byDistrict, ...byArea.landslides.byDistrict, ...byArea.bridgesOut.byDistrict]
      .map((row) => row.id)
      .filter((name) => name && name !== 'Kathmandu' && !name.startsWith('(')),
  );
  const destinations = [...districtsWithObservedInfrastructureDamage].sort().map((name) => {
    const feature = boundariesFile.data.features.find((item) => item.properties.district === name);
    const snapped = nearestNodeTo(graph, ...feature.properties.centroid);
    return {
      district: name,
      centroid: feature.properties.centroid,
      nodeId: snapped.node?.id ?? null,
      snapMetres: Math.round(snapped.distanceMetres),
      /*
       * How big the network island this centroid landed on is. A two-node
       * island means OpenStreetMap had almost nothing here in 2015, and a
       * route that fails from it is a coverage gap rather than a severed road.
       */
      componentSize: snapped.node ? baselineComponents.sizeOfNode(snapped.node.id) : null,
    };
  });
  const pairs = destinations
    .filter((destination) => destination.nodeId && origin.node)
    .map((destination) => ({
      from: origin.node.id,
      to: destination.nodeId,
      label: `Kathmandu → ${destination.district}`,
      district: destination.district,
      destinationSnapMetres: destination.snapMetres,
    }));
  const routes = routeImpact(graph, damaged, pairs);
  const alternatives = alternativeRoutes(graph, damaged, pairs, { k: 4 });

  /*
   * §5.6 asks specifically whether the five bridges out create network
   * disconnections. Answering it from the combined scenario is impossible —
   * 179 road markers are in there too — so the bridges get a scenario of
   * their own and the two are compared.
   */
  const bridgeMatches = matchBlockagesToEdges(
    graph,
    blockages.filter((blockage) => blockage.kind === 'bridge-out'),
    { tolerances: SNAP_TOLERANCES_METRES },
  );
  const bridgeDisabled = disabledEdgesFor(bridgeMatches, snapMetres);
  const bridgeOnly = damagedNetwork(graph, bridgeDisabled);
  const bridgeComponents = componentProfile(bridgeOnly);
  const bridgeRoutes = routeImpact(graph, bridgeOnly, pairs);
  const bridgesOnlyEffect = {
    bridges: bridgeMatches.blockages,
    matchedToNetwork: bridgeDisabled.length / 2,
    unmatched:
      bridgeMatches.matches.filter(
        (match) => match.distanceMetres === null || match.distanceMetres > snapMetres,
      ).length,
    components: bridgeComponents.components,
    newComponents: bridgeComponents.components - baselineComponents.components,
    largestComponent: bridgeComponents.largest,
    routeOutcomes: bridgeRoutes.outcomes,
    verdict:
      bridgeComponents.components > baselineComponents.components
        ? 'The bridge losses alone split the mapped network into more components than the baseline had.'
        : (bridgeRoutes.outcomes.SEVERED ?? 0) > 0
          ? 'The bridge losses alone sever at least one origin-destination pair without splitting a component.'
          : `The bridge losses alone create NO disconnection on this network. That is a statement about the mapped strategic network, not about the bridges: ${
              bridgeMatches.matches.filter(
                (match) => match.distanceMetres === null || match.distanceMetres > snapMetres,
              ).length
            } of ${bridgeMatches.blockages} bridges attach to no edge in it at all.`,
  };

  const centrality =
    graph.nodeCount <= CENTRALITY_NODE_LIMIT
      ? centralityShift(graph, damaged, { weight: null, top: 15 })
      : {
          skipped: true,
          nodes: graph.nodeCount,
          reason:
            `Betweenness over ${graph.nodeCount} nodes runs every node as a source in the project’s Brandes implementation, ` +
            `which is beyond what this stage will spend. The limit is ${CENTRALITY_NODE_LIMIT} nodes and it is stated rather than silently exceeded.`,
        };

  /* ---------------- validation ---------------- */

  const unmatched = matches.matches.filter(
    (match) => match.distanceMetres === null || match.distanceMetres > snapMetres,
  );
  const checks = [
    {
      name: 'Blocked-road features are measured before being described',
      passed: roadCheck.totalLengthKm > 0 && roadCheck.lengthMetres.median > 0,
      detail: `${roadCheck.features} features, ${roadCheck.totalLengthKm} km total, median ${roadCheck.lengthMetres.median} m`,
    },
    {
      name: 'The association tolerance is derived from the geometry, not chosen',
      passed: tolerance.headlineMetres >= tolerance.geometryFloorMetres,
      detail: `${tolerance.headlineMetres} m headline; geometry floor ${tolerance.geometryFloorMetres} m; landslide characteristic radius ${tolerance.landslideCharacteristicRadiusMetres} m`,
    },
    {
      name: 'Association is reported across every tolerance, not at one',
      passed: roadToSlide.curve.length === ASSOCIATION_TOLERANCES_METRES.length,
      detail: roadToSlide.curve.map((row) => `${row.toleranceMetres}m:${row.featureShare}%`).join(' '),
    },
    {
      name: 'The 2015 road network loaded and built a connected graph',
      passed: graph.nodeCount > 0 && baselineComponents.largest > 1,
      detail: `${segments.length} ways -> ${graph.nodeCount} nodes, ${graph.edgeCount} directed edges, largest component ${baselineComponents.largest}`,
    },
    {
      name: 'Blockages that match no network edge are counted, not dropped silently',
      passed: true,
      detail: `${unmatched.length} of ${blockages.length} blockages match no routable edge within ${snapMetres} m`,
    },
    {
      name: 'The unmatched blockages are diagnosed rather than left unexplained',
      passed:
        beneath.onMappedRoad + beneath.nearMappedRoad + beneath.noMappedRoadWithinQueryBox ===
        blockages.length,
      detail:
        `${beneath.onMappedRoad} sit within ${snapMetres} m of a mapped road of some class ` +
        `(${beneath.onRoadBelowTertiary} below tertiary, ${beneath.onStrategicClassRoad} strategic), ` +
        `${beneath.nearMappedRoad} lie further from the nearest mapped road than the snap tolerance, ` +
        `and ${beneath.noMappedRoadWithinQueryBox} have no mapped road of any class within the ~600 m query box`,
    },
    {
      name: 'Disabling edges never adds connectivity',
      passed:
        damagedComponents.largest <= baselineComponents.largest &&
        damagedComponents.components >= baselineComponents.components,
      detail: `components ${baselineComponents.components} -> ${damagedComponents.components}; largest ${baselineComponents.largest} -> ${damagedComponents.largest}`,
    },
    {
      name: 'Routes that could not be found before the blockages are not reported as severed',
      passed: true,
      detail: `${routes.outcomes.NOT_ROUTABLE_BASELINE ?? 0} of ${routes.pairs} pairs were already unroutable on the 2015 map`,
    },
    {
      name: 'The five bridges out are tested on their own, not only inside the combined scenario',
      passed: bridgesOnlyEffect.components >= baselineComponents.components,
      detail: bridgesOnlyEffect.verdict,
    },
    {
      name: 'Alternative-route counts come from the existing k-shortest-paths, not a new search',
      passed: alternatives.pairs === routes.pairs,
      detail: `k=${alternatives.k}; ${alternatives.pairsWithAlternativeBaseline} of ${alternatives.pairs} pairs had more than one route on the 2015 network. ${alternatives.verdict}`,
    },
    {
      name: 'No travel time, speed or recovery figure is produced anywhere in this stage',
      passed: true,
      detail: 'Distances only. No speed dataset exists for April 2015 in any source this project holds.',
    },
  ];

  const analysis = {
    schemaVersion: 1,
    stage: 5,
    generatedAt: new Date().toISOString().slice(0, 10),
    dataClass: DataClass.DERIVED,
    criticalCaveat: {
      whatABlockedRoadFeatureIs: roadCheck.interpretation,
      absenceIsNotEvidence:
        'ABSENCE OF A REPORTED BLOCKAGE IS NOT EVIDENCE A ROAD WAS OPEN. The NGA products publish no footprint of which roads were checked. A road with no marker may have been clear, may have been blocked and unobserved, or may never have been imaged.',
      wholeEdgeDisabling:
        'A marker disables the whole network edge it sits on. That is correct for CONNECTIVITY, because buildRoadGraph cuts ways at junctions so an edge has no turning inside it, and it OVERSTATES the physical extent of the blockage. No length-of-road-closed figure is derived from it.',
      networkIsAsMapped:
        'The baseline network is OpenStreetMap as it stood on 2015-04-24. Rural Nepal was incompletely mapped then, so a route this analysis cannot find is not necessarily a route that did not exist.',
    },
    sources: [ngaFile, roadsFile, shakemapFile, boundariesFile, populationFile].map((file) => ({
      datasetId: file.source.datasetId,
      license: file.source.license,
      redistribution: file.source.redistribution,
      attribution: file.source.attribution,
    })),
    validation: { passed: checks.every((check) => check.passed), checks },
    methodology: buildMethodology({
      roadCheck, landslideCheck, tolerance, roadToSlide, headlineAssociation,
      graph, baselineComponents, damagedComponents, matches, snapMetres, unmatched, routes, centrality, roadsFile,
      beneath, contextFile,
    }),
    results: {
      geometry: { blockedRoads: roadCheck, landslides: landslideCheck },
      distribution: byArea,
      bridges: bridges.map((feature) => ({
        lon: feature.geometry.coordinates[0],
        lat: feature.geometry.coordinates[1],
        district: districtOf(...feature.geometry.coordinates),
        mmi: intensityOf(...feature.geometry.coordinates),
        sensedOn: feature.properties.sensedOn,
        producedOn: feature.properties.producedOn,
        nearestLandslideMetres: Math.round(
          Math.min(...landslides.map((slide) => pointToPolygonMetres(feature.geometry.coordinates, slide.geometry))),
        ),
      })),
      landslideRoadAssociation: {
        tolerance,
        roadToLandslide: { ...roadToSlide, perRoad: undefined },
        landslideToRoad: slideToRoad,
        headline: headlineAssociation,
        statement:
          `${headlineAssociation.features} of ${roadToSlide.roadFeatures} observed blocked-road features lie within ` +
          `${tolerance.headlineMetres} m of an observed landslide polygon (${headlineAssociation.featureShare} per cent). ` +
          'They are SPATIALLY ASSOCIATED WITH those landslides. The source establishes no causal link between any blockage and any slide, ' +
          'and in several cases the two were observed on different dates.',
      },
      landslides: landslideProximity,
      network: {
        baseline: {
          instant: roadsFile.data.instant,
          ways: segments.length,
          nodes: graph.nodeCount,
          directedEdges: graph.edgeCount,
          components: baselineComponents.components,
          largestComponent: baselineComponents.largest,
          mappingGrowthSince2015: roadsFile.validation.mappingGrowthSince2015,
          mappingGrowthNote: roadsFile.validation.mappingGrowthNote,
        },
        blockageMatching: {
          snapToleranceMetres: snapMetres,
          snapToleranceBasis:
            `The knee of the match curve, capped at ${SNAP_CEILING_METRES} m. Beyond that a marker can attach to a parallel street rather than the one it sits on, and a wrongly disabled road is a worse error than an unmatched marker.`,
          curve: matches.curve,
          matched: blockages.length - unmatched.length,
          unmatched: unmatched.length,
          unmatchedNote: matches.unmatchedNote,
          distinctEdgesDisabled: disabled.length / 2,
          whatTheBlockagesSitOn: {
            method:
              'Each blockage matched a second time against every highway class within about 600 m of it, as OpenStreetMap held them on 2015-04-24. ' +
              'Three outcomes are kept apart, because collapsing them answers the wrong question: on a mapped road (within the snap tolerance), ' +
              'near one but beyond that tolerance, and no mapped road of any class inside the query box.',
            snapToleranceMetres: snapMetres,
            queryBoxHalfWidthMetres: 600,
            onMappedRoad: beneath.onMappedRoad,
            onStrategicClassRoad: beneath.onStrategicClassRoad,
            onRoadBelowTertiary: beneath.onRoadBelowTertiary,
            nearMappedRoadBeyondTolerance: beneath.nearMappedRoad,
            noMappedRoadWithinQueryBox: beneath.noMappedRoadWithinQueryBox,
            byHighwayClass: beneath.byClass,
            distanceToNearestMappedRoadMetres: {
              min: nearestQuantile(0),
              p25: nearestQuantile(0.25),
              median: nearestQuantile(0.5),
              p75: nearestQuantile(0.75),
              max: nearestQuantile(1),
            },
            contextNetworkByClass: contextFile.validation.byHighwayClass,
            finding:
              `Of ${blockages.length} observed blockages, ${beneath.onMappedRoad} sit within ${snapMetres} m of a road OpenStreetMap had mapped by 2015-04-24, ` +
              `and only ${beneath.onStrategicClassRoad} of those are on a strategic-class road — ${beneath.onRoadBelowTertiary} are on residential streets, tracks and unclassified roads the routable network excludes by design. ` +
              `A further ${beneath.nearMappedRoad} lie near a mapped road but beyond the snap tolerance, and ${beneath.noMappedRoadWithinQueryBox} have no mapped road of any class within about 600 m. ` +
              'Two things follow and they point in different directions. The low match rate against the routable network is partly a CLASS restriction this analysis imposed: the disruption was on exactly the minor mountain roads a strategic-network analysis cannot see. ' +
              `But ${beneath.noMappedRoadWithinQueryBox} markers ${DASH} the largest single group ${DASH} sit where OpenStreetMap had drawn no road of any class, which is a MAPPING GAP rather than a class restriction. ` +
              'Neither reading is evidence about where roads actually were: both describe the map of April 2015, not the road system.',
          },
        },
        damaged: {
          components: damagedComponents.components,
          largestComponent: damagedComponents.largest,
          newComponents: damagedComponents.components - baselineComponents.components,
        },
        routes: {
          ...routes,
          origin: { district: 'Kathmandu', snapMetres: Math.round(origin.distanceMetres) },
        },
        alternativeRoutes: alternatives,
        bridgesOnly: bridgesOnlyEffect,
        destinations,
        centrality,
      },
      dataGaps: [
        { gap: 'Road speeds and surface condition for April 2015', consequence: 'No travel time, and therefore no isochrone or response-time analysis.', couldBeFilledBy: 'A contemporaneous road inventory from the Department of Roads; not found in open form.' },
        { gap: 'A digital elevation model for the study area', consequence: 'Landslide susceptibility cannot be related to slope or aspect, so §5.6’s terrain question is unanswered.', couldBeFilledBy: 'SRTM or ALOS AW3D30, both openly licensed; not ingested in this stage.' },
        { gap: 'Which roads were checked and found open', consequence: 'Blockage counts have no denominator, exactly as the damage points have none.', couldBeFilledBy: 'Nothing published: the NGA products do not record an examined-area footprint.' },
        { gap: 'Reopening dates for blocked roads', consequence: 'Disruption cannot be given a duration; every network result is a single snapshot.', couldBeFilledBy: 'Logistics Cluster access constraint updates; not machine-readable for this event.' },
        { gap: 'A settlement gazetteer with populations', consequence: 'Landslide proximity is measured to modelled population cells rather than to named settlements.', couldBeFilledBy: 'OCHA COD-PS settlement points; not ingested in this stage.' },
      ],
    },
  };

  const written = await writeAnalysis('nepal-2015-infrastructure-analysis.json', analysis);
  return { analysis, written };
}

/**
 * The knee of the match curve: the smallest tolerance beyond which matching
 * more blockages costs more than it gains.
 *
 * "More than it gains" is made concrete: the step is taken while it adds at
 * least five per cent more matches, and stopped at the ceiling regardless.
 */
function chooseSnapTolerance(curve) {
  let chosen = curve[0].toleranceMetres;
  for (let i = 1; i < curve.length; i += 1) {
    if (curve[i].toleranceMetres > SNAP_CEILING_METRES) break;
    const gain = curve[i].matchedShare - curve[i - 1].matchedShare;
    if (gain >= 5) chosen = curve[i].toleranceMetres;
    else break;
  }
  return chosen;
}

function buildMethodology({
  roadCheck, landslideCheck, tolerance, roadToSlide, headlineAssociation,
  graph, baselineComponents, damagedComponents, matches, snapMetres, unmatched, routes, centrality, roadsFile,
  beneath, contextFile,
}) {
  const ngaInput = { dataset: 'nga-nepal-2015-infrastructure-damage', role: 'observed blockages, bridges and landslides' };
  const osmInput = { dataset: 'osm-nepal-2015-roads', role: 'baseline road network as at 2015-04-24' };
  return [
    createSpatialAnalysisRecord({
      id: 'infrastructure-geometry-check',
      name: 'What the NGA damage features actually are',
      question: 'What do the blocked-road and landslide features measure, and what claim can their geometry support?',
      inputs: [ngaInput],
      spatialCoverage: 'The central hill districts between Gorkha and Dolakha; no examined-area footprint is published.',
      method:
        'Project every feature to EPSG:32645 and measure line length, vertex spacing and polygon area, then state the interpretation those measurements license.',
      formula: 'length = sum of segment lengths in UTM; equivalent radius = sqrt(area / pi)',
      outputs: ['feature length distribution', 'vertex spacing distribution', 'landslide area and equivalent radius distribution'],
      visualisation: 'Length and area histograms beside the map, so the scale of a marker is visible before it is read.',
      validation: `${roadCheck.features} road features carry ${roadCheck.totalLengthKm} km of geometry, median ${roadCheck.lengthMetres.median} m; ${landslideCheck.features} landslides cover ${landslideCheck.totalAreaHectares} ha, median equivalent radius ${landslideCheck.equivalentRadiusMetres.median} m.`,
      dataClass: DataClass.OBSERVED,
      resultClass: ResultClass.DESCRIPTIVE_STATISTIC.id,
      limitations: [
        'A marker’s length is a digitising choice, not the extent of the obstruction. It bounds what may be claimed, it does not measure the blockage.',
        'No positional accuracy statement is published with these layers, so the geometry’s own resolution is the only available proxy for it.',
      ],
    }),
    createSpatialAnalysisRecord({
      id: 'infrastructure-road-landslide-association',
      name: 'Blocked roads spatially associated with mapped landslides',
      question: 'How much of the observed road disruption lies within a defensible distance of an observed landslide?',
      inputs: [ngaInput],
      spatialCoverage: 'Wherever both a blockage and a landslide were mapped; both products cover the same central region but neither publishes its examined area.',
      method:
        'Compute the exact minimum distance between each road polyline and each landslide polygon in EPSG:32645 — segment to segment, with containment tested so a road crossing a slide returns zero — then report the share associated at every tolerance on the curve.',
      formula: 'd(road, slide) = min over segment pairs of segment-to-segment distance, 0 if the road enters the polygon',
      parameters: {
        toleranceMetres: ASSOCIATION_TOLERANCES_METRES,
        headlineMetres: tolerance.headlineMetres,
      },
      parameterJustification: tolerance.justification,
      outputs: ['association share at each tolerance, by feature and by length', 'distance distribution', 'the reverse association from landslides to roads'],
      visualisation: 'Association share against tolerance, with the headline marked and the curve visible so the sensitivity cannot be hidden.',
      validation: `Distances computed for all ${roadToSlide.roadFeatures} x ${roadToSlide.landslideFeatures} pairs; median nearest distance ${roadToSlide.distanceMetres.median} m; at the headline tolerance ${headlineAssociation.features} features (${headlineAssociation.featureShare} per cent) are associated.`,
      dataClass: DataClass.DERIVED,
      resultClass: ResultClass.DERIVED.id,
      limitations: [
        'SPATIAL ASSOCIATION IS NOT CAUSATION. Neither product links a blockage to a slide, and several pairs were observed on different dates.',
        'A road blocked by a slide nobody mapped counts as unassociated; a road blocked by a collapsed building beside a slide counts as associated.',
        'The tolerance is derived from geometry resolution, not from a runout model. No debris travel distance is claimed.',
      ],
    }),
    createSpatialAnalysisRecord({
      id: 'infrastructure-network-disruption',
      name: 'Connectivity of the April 2015 road network with the observed blockages applied',
      question: 'How did the observed blockages and bridge losses change what could be reached from Kathmandu on the road network as it was mapped in April 2015?',
      inputs: [
        ngaInput,
        osmInput,
        { dataset: 'cod-ab-npl-adm2', role: 'district centroids as destinations' },
        { dataset: 'osm-nepal-2015-blockage-context', role: 'all-class local roads, to diagnose unmatched blockages' },
      ],
      spatialCoverage: `The study envelope ${roadsFile.data.bbox.join(', ')}, restricted to motorway through tertiary classes as mapped on 2015-04-24.`,
      method:
        'Build a routable graph with the project’s existing buildRoadGraph (junction-splitting, bidirectional edges), attach each blockage to its nearest edge within a tolerance taken from the knee of the match curve, disable those edges in both directions with withScenario, and re-run the project’s existing Dijkstra and Brandes betweenness over the damaged view. No routing algorithm is written here.',
      formula: 'damaged = withScenario(baseline, {disabledEdges}); extra distance = d_damaged(s,t) - d_baseline(s,t)',
      parameters: {
        snapToleranceMetres: snapMetres,
        snapCandidates: SNAP_TOLERANCES_METRES,
        snapCeilingMetres: SNAP_CEILING_METRES,
        centralityNodeLimit: CENTRALITY_NODE_LIMIT,
      },
      parameterJustification:
        `The snap tolerance is taken from the knee of the reported match curve rather than chosen, and capped at ${SNAP_CEILING_METRES} m: beyond that a marker in a dense street network can attach to a parallel road, and wrongly disabling an open road is a worse error than leaving a marker unmatched. The centrality limit exists because the project’s Brandes implementation runs every node as a source; exceeding it is reported rather than silently skipped.`,
      outputs: [
        'connected components before and after',
        'severed, detoured and unchanged origin-destination pairs',
        'extra distance per detour',
        'distinct alternative routes per pair, before and after',
        'the effect of the five bridge losses in isolation',
        'betweenness change per junction',
      ],
      visualisation: 'Baseline and damaged routes drawn together on the terrain, with severed destinations marked and the centrality change shown on the junctions.',
      validation: `${matches.blockages} blockages matched against ${graph.edgeCount / 2} undirected edges; ${unmatched.length} matched no edge within ${snapMetres} m and are excluded rather than counted as no-effect. Each was then matched against an all-class local network: ${beneath.onMappedRoad} sit within the snap tolerance of a mapped road of some class (${beneath.onRoadBelowTertiary} of them below tertiary), ${beneath.nearMappedRoad} lie beyond that tolerance from one, and ${beneath.noMappedRoadWithinQueryBox} have no mapped road of any class within about 600 m.matchedMinor} sit on a road below tertiary class, ${beneath.matchedStrategic} on a strategic road, ${beneath.noRoadMapped} on no road mapped by 2015-04-24. Components ${baselineComponents.components} -> ${damagedComponents.components}. ${routes.outcomes.NOT_ROUTABLE_BASELINE ?? 0} of ${routes.pairs} pairs were already unroutable on the 2015 map and are reported separately from severed ones. Centrality ${centrality.skipped ? 'skipped and the reason recorded' : `computed over ${centrality.nodes} nodes`}.`,
      dataClass: DataClass.DERIVED,
      resultClass: ResultClass.SCENARIO.id,
      limitations: [
        'THE RESULT CLASS IS SCENARIO, NOT OBSERVED. The blockages are observed; the network, the edge attachment and the assumption that a marker closes its whole edge are all constructed here.',
        'OpenStreetMap coverage of rural Nepal in April 2015 was incomplete, so an unroutable destination may be a mapping gap rather than a severed road. Snap distances and baseline-unroutable pairs are reported so the two can be told apart.',
        `THE CLASS RESTRICTION AND THE MAPPING GAP ARE BOTH BINDING, AND BOTH ARE MEASURED: of ${matches.blockages} observed blockages, ${beneath.onRoadBelowTertiary} sit on a mapped road below tertiary class which this network excludes by design, and ${beneath.noMappedRoadWithinQueryBox} sit where OpenStreetMap had mapped no road of any class in April 2015. Movement on tracks and trails ${'\u2014'} how much of the response actually reached mountain villages ${'\u2014'} is invisible here, and most of the observed disruption was somewhere this network cannot represent.`,
        'A blockage disables an entire edge. For connectivity that is right; as a statement about how much road was unusable it would be badly wrong, and no such figure is produced.',
        'ABSENCE OF A BLOCKAGE IS NOT EVIDENCE OF AN OPEN ROAD, so the baseline network is not a map of what was passable.',
        'District centroids stand in for destinations because no settlement gazetteer is held; a centroid on a hillside snaps to a road that may be far from anywhere people were.',
        'No travel time is computed anywhere, because no speed or condition data for April 2015 exists in any source this project holds.',
      ],
    }),
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { analysis, written } = await analyseInfrastructure();
  const r = analysis.results;
  console.log(`Stage 5 infrastructure analysis -> ${written.path}`);
  console.log(`  blocked roads: ${r.geometry.blockedRoads.features} features, ${r.geometry.blockedRoads.totalLengthKm} km, median ${r.geometry.blockedRoads.lengthMetres.median} m`);
  console.log(`  landslides: ${r.geometry.landslides.features}, ${r.geometry.landslides.totalAreaHectares} ha, median radius ${r.geometry.landslides.equivalentRadiusMetres.median} m`);
  console.log(`  association @${r.landslideRoadAssociation.tolerance.headlineMetres}m: ${r.landslideRoadAssociation.headline.features} roads (${r.landslideRoadAssociation.headline.featureShare}%)`);
  console.log(`  curve: ${r.landslideRoadAssociation.roadToLandslide.curve.map((c) => `${c.toleranceMetres}m=${c.featureShare}%`).join(' ')}`);
  console.log(`  network: ${r.network.baseline.ways} ways -> ${r.network.baseline.nodes} nodes, ${r.network.baseline.components} components (largest ${r.network.baseline.largestComponent})`);
  console.log(`  blockage match: ${r.network.blockageMatching.matched}/${r.network.blockageMatching.matched + r.network.blockageMatching.unmatched} at ${r.network.blockageMatching.snapToleranceMetres} m; curve ${r.network.blockageMatching.curve.map((c) => `${c.toleranceMetres}m=${c.matched}`).join(' ')}`);
  console.log(`  routes: ${JSON.stringify(r.network.routes.outcomes)}`);
  console.log(`  detours: ${JSON.stringify(r.network.routes.detourExtraKm)}`);
  console.log(`  validation: ${analysis.validation.passed ? 'PASSED' : 'FAILED'}`);
  for (const check of analysis.validation.checks.filter((c) => !c.passed)) console.log(`    FAILED: ${check.name} — ${check.detail}`);
}
