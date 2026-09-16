/**
 * Staged supply chains (§16 of the brief).
 *
 * The brief asks for a drawing of
 *
 *   Mine → Processing → Factory → Port → Ship → Port → Distribution → Consumer
 *
 * and of the ten stages that shape expands to, this project can place five.
 * That gap is the whole design problem, because the tempting answer — draw a
 * plausible line from a plausible mine to a plausible factory — is exactly the
 * fabrication §42 forbids, and it would be the most convincing-looking part of
 * the picture.
 *
 * So a chain here is a sequence of stages where every stage carries its own
 * data class, and the ones nothing supports are PRESENT AND EMPTY rather than
 * omitted. A reader sees the whole shape of a supply chain and sees precisely
 * which parts of it this data can and cannot see:
 *
 *   EXTRACTION       ○ unavailable  mine and field locations are not open data
 *   PROCESSING       ○ unavailable  refineries and smelters, ditto
 *   MANUFACTURE      ○ unavailable  facility-level output is confidential
 *   ORIGIN           ● historical   the exporting country, from customs data
 *   LOAD PORT        ◐ inferred     the nearest major port to that country
 *   SEA TRANSIT      ◐ simulated    shortest path over the chokepoint network
 *   DISCHARGE PORT   ◐ inferred     nearest major port to the destination
 *   DESTINATION      ● historical   the importing country, from customs data
 *   DISTRIBUTION     ○ unavailable  inland freight is not open data
 *   CONSUMER         ○ unavailable  who actually uses it is not in trade data
 *
 * The LOAD PORT and DISCHARGE PORT stages deserve their own warning. "Nearest
 * major port to the country's label point" is a geometric guess, not a shipping
 * fact — Rotterdam is nearest to a great many European centroids and handles
 * cargo for none of the countries it is nearest to in any predictable share.
 * The stage says so, every time.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

import { haversineKm } from './geo.js';
import { DataClass, createProvenance } from './provenance.js';

/** The stages of a physical supply chain, in order. */
export const STAGE_KINDS = Object.freeze([
  'EXTRACTION',
  'PROCESSING',
  'MANUFACTURE',
  'ORIGIN',
  'LOAD_PORT',
  'SEA_TRANSIT',
  'DISCHARGE_PORT',
  'DESTINATION',
  'DISTRIBUTION',
  'CONSUMER',
]);

/**
 * Transport modes, and how each should be drawn.
 *
 * The visual grammar is the requirement: a reader must be able to tell a sea
 * leg from a land leg without consulting a key. Dash patterns carry that
 * because they survive colour-blindness and greyscale, and colour reinforces
 * rather than carries it.
 */
export const TRANSPORT_MODES = Object.freeze({
  SEA: {
    id: 'SEA',
    label: 'Sea',
    colour: '#2dd4bf',
    dash: null, // solid
    width: 2.5,
    note: 'Great-circle legs over the port and chokepoint network.',
  },
  LAND: {
    id: 'LAND',
    label: 'Land',
    colour: '#f0a830',
    dash: [8, 6],
    width: 2,
    note: 'A straight line to the nearest port. NOT a road or rail route — no open global freight network exists.',
  },
  AIR: {
    id: 'AIR',
    label: 'Air',
    colour: '#b07ae0',
    dash: [2, 6],
    width: 1.5,
    note: 'Used for high-value low-weight goods. This project cannot tell which consignments flew.',
  },
  UNKNOWN: {
    id: 'UNKNOWN',
    label: 'Unknown',
    colour: '#78909c',
    dash: [1, 8],
    width: 1,
    note: 'The mode is not recorded in any data this project holds.',
  },
});

/** Why each unavailable stage is unavailable. Stated once, reused everywhere. */
const MISSING_STAGES = Object.freeze({
  EXTRACTION: {
    name: 'Extraction or cultivation',
    because:
      'Mine, well and farm locations with output are not published as open data at global scale. USGS names national mineral production but not sites; FAOSTAT needs a key.',
    wouldNeed:
      'A licensed asset database (S&P Global, Wood Mackenzie) or per-country registries.',
  },
  PROCESSING: {
    name: 'Processing',
    because:
      'Refineries, smelters and mills are company assets. Their locations are partly mappable; their throughput is not.',
    wouldNeed: 'Commercial asset and capacity data.',
  },
  MANUFACTURE: {
    name: 'Manufacture',
    because:
      'Facility-level output is confidential. Public data reaches country × commodity and stops there.',
    wouldNeed: 'Company disclosures, or a commercial industrial database.',
  },
  SEA_TRANSIT: {
    name: 'Sea transit',
    because:
      'No maritime route has been computed for this pair yet. Run a route or a disruption scenario and the passages it crosses appear here.',
    wouldNeed: 'A computed path over the port and chokepoint network.',
  },
  DISTRIBUTION: {
    name: 'Inland distribution',
    because:
      'No open global road or rail freight network exists. Corridors are published per-operator in incompatible formats.',
    wouldNeed:
      'National freight statistics, or a commercial logistics network.',
  },
  CONSUMER: {
    name: 'Final consumer',
    because:
      'Trade data stops at the border. Who ultimately used a shipment is not recorded anywhere public.',
    wouldNeed: 'Bills of lading plus downstream sales data, all commercial.',
  },
});

/**
 * The nearest major port to a point.
 *
 * A GEOMETRIC nearest, which is not a shipping fact. Landlocked countries get
 * whichever coastal port happens to be closest, which may be in another country
 * entirely and may be the wrong sea. The caller must label it, and
 * `buildSupplyChain` does.
 *
 * @param {{lat:number, lon:number}} point
 * @param {Array<object>} ports
 * @returns {{port:object, distanceKm:number}|null}
 */
export function nearestPort(point, ports) {
  if (!Array.isArray(ports) || ports.length === 0) return null;
  if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lon)) return null;
  let best = null;
  let bestKm = Infinity;
  for (const port of ports) {
    const km = haversineKm(point, port);
    if (km < bestKm) {
      bestKm = km;
      best = port;
    }
  }
  return best ? { port: best, distanceKm: bestKm } : null;
}

/** A stage that exists, with a position. */
function knownStage(
  kind,
  { name, lat, lon, dataClass, basis = null, caveat = null },
) {
  return Object.freeze({
    kind,
    available: true,
    name,
    lat,
    lon,
    dataClass,
    basis,
    caveat,
  });
}

/** A stage nothing supports. */
function missingStage(kind) {
  const gap = MISSING_STAGES[kind];
  return Object.freeze({
    kind,
    available: false,
    name: gap.name,
    lat: null,
    lon: null,
    dataClass: DataClass.UNKNOWN,
    because: gap.because,
    wouldNeed: gap.wouldNeed,
  });
}

/**
 * Build a staged chain between two countries.
 *
 * @param {object} input
 * @param {{iso3:string,name:string,lat:number,lon:number}} input.origin exporter
 * @param {{iso3:string,name:string,lat:number,lon:number}} input.destination importer
 * @param {string} input.commodityLabel
 * @param {Array<object>} input.ports candidate ports
 * @param {Array<{name:string,lat:number,lon:number}>} [input.transitNodes]
 *   chokepoints on the sea path, if a route was computed
 * @param {string} input.retrievedAt
 * @returns {Readonly<object>}
 */
export function buildSupplyChain({
  origin,
  destination,
  commodityLabel,
  ports,
  transitNodes = [],
  retrievedAt,
}) {
  if (!origin?.iso3 || !destination?.iso3) {
    throw new TypeError(
      'buildSupplyChain requires an origin and a destination',
    );
  }

  const loadPort = nearestPort(origin, ports);
  const dischargePort = nearestPort(destination, ports);

  const portCaveat =
    'Nearest major port to the country’s label point. This is geometry, ' +
    'not a shipping record — the country may ship through somewhere else ' +
    'entirely, and for a landlocked country this port may be in another country.';

  const stages = [
    missingStage('EXTRACTION'),
    missingStage('PROCESSING'),
    missingStage('MANUFACTURE'),
    knownStage('ORIGIN', {
      name: origin.name,
      lat: origin.lat,
      lon: origin.lon,
      dataClass: DataClass.HISTORICAL,
      basis: 'Exporting country, from UN Comtrade customs statistics.',
      caveat:
        'Positioned at the country’s cartographic label point, not at any facility.',
    }),
  ];

  if (loadPort) {
    stages.push(
      knownStage('LOAD_PORT', {
        name: loadPort.port.name,
        lat: loadPort.port.lat,
        lon: loadPort.port.lon,
        dataClass: DataClass.INFERRED,
        basis: `NGA World Port Index, ${Math.round(loadPort.distanceKm)} km from the origin label point.`,
        caveat: portCaveat,
      }),
    );
  }

  if (transitNodes.length > 0) {
    for (const node of transitNodes) {
      stages.push(
        knownStage('SEA_TRANSIT', {
          name: node.name,
          lat: node.lat,
          lon: node.lon,
          dataClass: DataClass.SIMULATED,
          basis: 'On the shortest path over the port and chokepoint network.',
          caveat:
            'A geographic path. Whether a carrier sails it depends on schedules and capacity, which are commercial data.',
        }),
      );
    }
  } else {
    // The stage appears even with nothing to put in it. Dropping it would make
    // the chain look like it has no sea leg, when what it has is no route
    // computed yet — and showing the whole ten-stage shape is the point.
    stages.push(missingStage('SEA_TRANSIT'));
  }

  if (dischargePort) {
    stages.push(
      knownStage('DISCHARGE_PORT', {
        name: dischargePort.port.name,
        lat: dischargePort.port.lat,
        lon: dischargePort.port.lon,
        dataClass: DataClass.INFERRED,
        basis: `NGA World Port Index, ${Math.round(dischargePort.distanceKm)} km from the destination label point.`,
        caveat: portCaveat,
      }),
    );
  }

  stages.push(
    knownStage('DESTINATION', {
      name: destination.name,
      lat: destination.lat,
      lon: destination.lon,
      dataClass: DataClass.HISTORICAL,
      basis: 'Importing country, from UN Comtrade customs statistics.',
      caveat:
        'Positioned at the country’s cartographic label point, not at any facility.',
    }),
    missingStage('DISTRIBUTION'),
    missingStage('CONSUMER'),
  );

  // Legs join consecutive stages that both have a position. A leg spanning a
  // missing stage is NOT drawn: a line from the origin country straight to the
  // load port is honest, and one from an unknown mine to a known port is not.
  const placed = stages.filter((stage) => stage.available);
  const legs = [];
  for (let i = 0; i < placed.length - 1; i += 1) {
    const from = placed[i];
    const to = placed[i + 1];
    // A leg touching a port on one side and a country on the other is the
    // inland hop, which we cannot route: it is drawn as LAND and labelled.
    const isInland =
      (from.kind === 'ORIGIN' && to.kind === 'LOAD_PORT') ||
      (from.kind === 'DISCHARGE_PORT' && to.kind === 'DESTINATION');
    const mode = isInland ? TRANSPORT_MODES.LAND : TRANSPORT_MODES.SEA;
    legs.push(
      Object.freeze({
        from: {
          name: from.name,
          lat: from.lat,
          lon: from.lon,
          kind: from.kind,
        },
        to: { name: to.name, lat: to.lat, lon: to.lon, kind: to.kind },
        mode: mode.id,
        distanceKm: haversineKm(from, to),
        dataClass: isInland ? DataClass.UNKNOWN : DataClass.SIMULATED,
        caveat: mode.note,
      }),
    );
  }

  const totalKm = legs.reduce((sum, leg) => sum + leg.distanceKm, 0);
  const seaKm = legs
    .filter((leg) => leg.mode === 'SEA')
    .reduce((sum, leg) => sum + leg.distanceKm, 0);

  return Object.freeze({
    commodityLabel,
    origin: Object.freeze({ ...origin }),
    destination: Object.freeze({ ...destination }),
    stages: Object.freeze(stages),
    legs: Object.freeze(legs),
    /**
     * How many stage ENTRIES carry a position, and how many of the canonical
     * ten kinds could not be placed. The two differ whenever a chain crosses
     * more than one chokepoint, and the second is the meaningful figure.
     */
    stagesPlaced: placed.length,
    stagesMissing:
      STAGE_KINDS.length - new Set(placed.map((stage) => stage.kind)).size,
    totalKm,
    seaKm,
    provenance: createProvenance({
      dataClass: DataClass.INFERRED,
      source: 'Global Supply Chain Eye',
      dataset: `chain:${origin.iso3}->${destination.iso3}:${commodityLabel}`,
      license:
        'MIT (this project). Countries from UN Comtrade, ports NGA WPI (public domain).',
      method:
        'Countries from customs statistics; ports by nearest-neighbour from the ' +
        'country label point; sea legs as great-circle hops over the chokepoint ' +
        'network. Stages with no open data source are included and marked absent.',
      retrievedAt,
      confidence: 0.4,
      limitations: [
        // Counted against the CANONICAL ten, not against however many stage
        // entries this particular chain happens to have: a chain crossing
        // three chokepoints has twelve entries and is not therefore more
        // complete.
        `${STAGE_KINDS.length - new Set(placed.map((stage) => stage.kind)).size}` +
          ` of ${STAGE_KINDS.length} stages cannot be placed at all. Extraction,` +
          ' processing, manufacture, inland distribution and the final consumer' +
          ' are shown as gaps, not guessed at.',
        'Load and discharge ports are the geometrically nearest major port to ' +
          'each country’s label point. That is not a shipping record and ' +
          'will often be wrong for any specific consignment.',
        'Inland legs are straight lines, not routes. No open global road or ' +
          'rail freight network exists to route them over.',
        'Distances are great-circle and therefore lower bounds.',
        'This chain describes a COUNTRY PAIR, not a shipment. It does not mean ' +
          'any particular cargo took this path.',
      ],
    }),
  });
}

/** The mode record for a leg, falling back to UNKNOWN. */
export function transportMode(id) {
  return TRANSPORT_MODES[id] ?? TRANSPORT_MODES.UNKNOWN;
}
