/**
 * Plain-language taxonomy for the supply-chain workspace.
 *
 * THE PROBLEM THIS SOLVES: the inherited interface names things for the person
 * who built them. "Orbital Watch", "Thermal Threat Board", "Run Log",
 * "Omniscience Pullback" — each is memorable and none of them tells a new user
 * what they would get by clicking. A label that has to be explained out loud is
 * a broken label.
 *
 * Every name here answers "what will I see?" before it tries to sound like
 * anything. Where the old name is still useful as a subtitle it is kept as
 * `formerly`, so an existing user is not stranded, and a test holds the two
 * lists in agreement so a rename cannot be half-applied.
 *
 * The glossary is the other half: supply-chain work has real jargon —
 * chokepoint, mirror statistics, HHI — that cannot be renamed away because it
 * IS the vocabulary of the field. Those get a one-sentence definition attached
 * to the term wherever it appears, rather than a link to a page nobody opens.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

/* ------------------------------------------------------------------ *
 * Renames
 * ------------------------------------------------------------------ */

/**
 * Scenes, renamed.
 *
 * `id` is the recipe id in `src/scenes/recipes.js` and must not drift — the
 * director keys saved projects off it. Only what the user reads changes.
 */
export const SCENE_NAMES = Object.freeze([
  Object.freeze({
    id: 'flights-radar',
    formerly: 'Global Flights Radar',
    name: 'Air Cargo & Aircraft Tracking',
    summary: 'Live aircraft worldwide, from ADS-B broadcasts.',
    investigates: 'Which aircraft are flying now, and where they are going.',
    icon: '✈',
  }),
  Object.freeze({
    id: 'orbital-watch',
    formerly: 'Orbital Watch',
    name: 'Satellite Tracking',
    summary: 'Satellites currently overhead, from public orbital elements.',
    investigates: 'What is in orbit above a region right now.',
    icon: '🛰',
  }),
  Object.freeze({
    id: 'thermal-threats',
    formerly: 'Thermal Threat Board',
    name: 'Active Fires & Heat Detection',
    summary: 'Thermal anomalies detected by satellite (NASA FIRMS).',
    investigates:
      'Where fires are burning near farmland, ports and transport corridors.',
    icon: '▲',
  }),
  Object.freeze({
    id: 'city-overload',
    formerly: 'City Overload',
    name: 'Urban Transport Density',
    summary: 'Ground transport and city infrastructure at close range.',
    investigates: 'How dense the movement is inside one metropolitan area.',
    icon: '🚦',
  }),
  Object.freeze({
    id: 'omniscience-pullback',
    formerly: 'Omniscience Pullback',
    name: 'Everything At Once — Wide View',
    summary: 'All active layers, pulled back to a whole-planet view.',
    investigates: 'How the separate layers overlap globally.',
    icon: '🌍',
  }),
  Object.freeze({
    id: 'bhote-koshi-nepal-scene',
    formerly: 'Nepal Flood Incident',
    name: 'Nepal Flood — Corridor Disruption',
    summary:
      'A 2026 flood on the Bhote Koshi, followed through to the trade corridor it cut.',
    investigates:
      'How one flood closed a border crossing, and what moves through it.',
    icon: '⚠',
  }),
  Object.freeze({
    id: 'supply-chain-eye-semiconductors',
    formerly: null,
    name: 'Semiconductors — Where They Come From',
    summary:
      'A guided route from world trade down to the chokepoint that carries it.',
    investigates:
      'Who supplies integrated circuits, and what would interrupt them.',
    icon: '🔲',
  }),
]);

/** Look up a scene's plain-language record by recipe id. */
export function sceneName(id) {
  return SCENE_NAMES.find((entry) => entry.id === id) ?? null;
}

/**
 * Map layers, renamed and described.
 *
 * `available: false` means the layer genuinely has no data behind it in this
 * project. It still appears — hiding a gap is how a user ends up believing the
 * absence of a marker means the absence of a thing — but it renders its
 * `missing` explanation instead of an empty map.
 */
export const LAYER_NAMES = Object.freeze([
  // --- what moves ---
  Object.freeze({
    id: 'ais-live-vessels',
    name: 'Ships',
    group: 'What Moves',
    summary: 'Live vessel positions from AIS broadcasts.',
    icon: '🚢',
    available: true,
  }),
  Object.freeze({
    id: 'flights',
    name: 'Aircraft',
    group: 'What Moves',
    summary: 'Live aircraft positions from ADS-B broadcasts.',
    icon: '✈',
    available: true,
  }),
  Object.freeze({
    id: 'satellites',
    name: 'Satellites',
    group: 'What Moves',
    summary: 'Orbital positions propagated from public elements.',
    icon: '🛰',
    available: true,
  }),
  Object.freeze({
    id: 'transit',
    name: 'City Transit',
    group: 'What Moves',
    summary: 'Scheduled city transit vehicles, where a feed is published.',
    icon: '🚆',
    available: true,
    caveat:
      'This is URBAN transit, not freight rail. It cannot show a container train crossing a continent.',
  }),
  Object.freeze({
    id: 'traffic',
    name: 'Road Traffic',
    group: 'What Moves',
    summary: 'Road congestion in covered metropolitan areas.',
    icon: '🚦',
    available: true,
    caveat: 'City-scale only. There is no global road-freight feed here.',
  }),
  /*
   * The inherited layers that are not supply chain.
   *
   * They are in the tray, so they are tabs a reader has to understand, and
   * "MAPPED ALPR CAMERAS" or "SPACE MISSIONS (30d)" told them nothing about
   * what would appear or where it came from. They are named and described here
   * for the same reason as everything else: the tray reads its labels out of
   * this file, so a layer absent from it is a row with no description.
   *
   * Several carry caveats because their names promise more than their coverage
   * delivers — which is the specific complaint the renaming work was for.
   */
  Object.freeze({
    id: 'military',
    name: 'Military Flights',
    group: 'What Moves',
    summary:
      'Aircraft whose broadcast identity matches a known military operator.',
    icon: '\u2708',
    available: true,
    caveat:
      'Only aircraft that choose to broadcast. Anything operating dark is absent, so an empty map is not evidence of an empty sky.',
  }),
  Object.freeze({
    id: 'bikeshare',
    name: 'Bike Share',
    group: 'Places',
    summary: 'Public bike-share docks and how many bikes are free.',
    icon: '\u{1f6b2}',
    available: true,
    caveat:
      'City-scale and only where an operator publishes a GBFS feed. Nothing to do with freight.',
  }),
  Object.freeze({
    id: 'cctv',
    name: 'Traffic Cameras',
    group: 'Places',
    summary:
      'Public road cameras, with the latest frame where an agency publishes one.',
    icon: '\u{1f4f7}',
    available: true,
    caveat:
      'Public highway and city cameras only. Inherited from God\u2019s Eye View and unrelated to trade data.',
  }),
  Object.freeze({
    id: 'alpr-cameras',
    name: 'Mapped ALPR Cameras',
    group: 'Places',
    summary:
      'Locations of automated number-plate readers, as mapped by researchers.',
    icon: '\u25ce',
    available: true,
    caveat:
      'Reported locations of surveillance equipment, not a live feed and not readings from it. Inherited, and unrelated to supply chains.',
  }),
  Object.freeze({
    id: 'military-installations',
    name: 'Mapped Installations',
    group: 'Places',
    summary: 'Military sites recorded in open mapping data.',
    icon: '\u25a3',
    available: true,
    caveat:
      'Open-source map records of fixed sites. No activity, no status, and nothing about any shipment.',
  }),
  Object.freeze({
    id: 'rocket-launches',
    name: 'Space Launches (30 days)',
    group: 'Places',
    summary: 'Recent and upcoming orbital launches and their sites.',
    icon: '\u{1f680}',
    available: true,
  }),
  Object.freeze({
    id: 'directions',
    name: 'Route Planner',
    group: 'Places',
    summary: 'Point-to-point driving directions on the globe.',
    icon: '\u27a4',
    available: true,
    caveat:
      'A road route between two points you pick. Not a freight route and not costed.',
  }),
  Object.freeze({
    id: 'radio',
    name: 'Live Radio',
    group: 'Places',
    summary:
      'Public internet radio stations, placed where they broadcast from.',
    icon: '\u{1f4fa}',
    available: true,
  }),
  // --- fixed infrastructure ---
  Object.freeze({
    id: 'country-borders',
    name: 'Country Borders',
    group: 'Fixed Infrastructure',
    summary: 'National frontiers, so you can tell where you are.',
    icon: '\u2b21',
    available: true,
    caveat:
      'An orientation aid simplified to about 1 km, following Natural Earth\u2019s editorial boundary decisions. Not an authority on any frontier.',
  }),
  Object.freeze({
    id: 'supply-ports',
    name: 'Ports',
    group: 'Fixed Infrastructure',
    summary: '417 major ports from the NGA World Port Index.',
    icon: '⚓',
    available: true,
  }),
  Object.freeze({
    id: 'chokepoints',
    name: 'Strategic Chokepoints',
    group: 'Fixed Infrastructure',
    summary: 'Straits and canals that concentrate global shipping.',
    icon: '◈',
    available: true,
  }),
  Object.freeze({
    id: 'telegeography-submarine-cables',
    name: 'Submarine Cables',
    group: 'Fixed Infrastructure',
    summary: 'Undersea data cables.',
    icon: '〰',
    available: true,
  }),
  Object.freeze({
    id: 'local-datacenters',
    name: 'Data Centers',
    group: 'Fixed Infrastructure',
    summary: 'Mapped data-centre sites.',
    icon: '▣',
    available: true,
  }),
  Object.freeze({
    id: 'local-dams',
    name: 'Dams',
    group: 'Fixed Infrastructure',
    summary: 'Mapped dams and reservoirs.',
    icon: '▬',
    available: true,
  }),
  // --- trade ---
  Object.freeze({
    id: 'supply-chain',
    name: 'Supply Chain Route',
    group: 'Trade',
    summary:
      'One product\u2019s journey between two countries, stage by stage.',
    icon: '\u26d3',
    available: true,
    caveat:
      'Five of its ten stages have no open data source and are shown as gaps. Ports are the nearest major port to each country, which is geometry rather than a shipping record.',
  }),
  Object.freeze({
    id: 'trade-flows',
    name: 'Trade Flows',
    group: 'Trade',
    summary: 'Who ships a commodity to whom, drawn as arcs.',
    icon: '↔',
    available: true,
    caveat: 'Annual customs data, 1–2 years behind. Never live.',
  }),
  // --- disruption ---
  Object.freeze({
    id: 'supply-events',
    name: 'Hazard Events',
    group: 'Disruption',
    summary: 'Live natural hazards near ports and chokepoints.',
    icon: '⚠',
    available: true,
    caveat:
      'Natural hazards only. No strikes, closures, sanctions or conflict — an empty map is not evidence that nothing happened.',
  }),
  Object.freeze({
    id: 'earthquakes',
    name: 'Earthquakes',
    group: 'Disruption',
    summary: 'Recent seismic events from USGS.',
    icon: '◎',
    available: true,
  }),
  Object.freeze({
    id: 'local-firms',
    name: 'Active Fires',
    group: 'Disruption',
    summary: 'Satellite-detected thermal anomalies (NASA FIRMS).',
    icon: '▲',
    available: true,
  }),
  // --- inland freight infrastructure ---
  /*
   * These five were listed under "Not Available" with a note about what would
   * be needed. That was too quick a verdict, and it conflated two questions:
   * where the infrastructure IS, and how much moves through it. The first is
   * mapped worldwide under a licence that permits this use; only the second is
   * closed. Each entry below ships the position and states the missing half in
   * its caveat, rather than declaring the whole thing absent.
   */
  Object.freeze({
    id: 'freight-rail',
    name: 'Freight Rail Corridors',
    group: 'Inland Freight',
    summary:
      'Main-line railway in the current view, surveyed by OpenStreetMap.',
    icon: '\u{1f6e4}',
    available: true,
    caveat:
      'Routes only \u2014 no tonne-kilometres, train counts or capacity, because OpenStreetMap records none. Loads what is in view, so zoom in to a region first.',
  }),
  Object.freeze({
    id: 'freight-roads',
    name: 'Road Freight Corridors',
    group: 'Inland Freight',
    summary:
      'Motorway and trunk road in the current view, surveyed by OpenStreetMap.',
    icon: '\u{1f6e3}',
    available: true,
    caveat:
      'Routes only \u2014 no freight volume or axle loads. Live congestion is the separate Road Traffic layer, and only in covered cities.',
  }),
  Object.freeze({
    id: 'pipelines',
    name: 'Oil & Gas Pipelines',
    group: 'Inland Freight',
    summary:
      'Oil, gas and fuel pipeline routes in the current view, surveyed by OpenStreetMap.',
    icon: '\u26fd',
    available: true,
    caveat:
      'Routes only \u2014 no flow rate, direction or capacity, and no way to tell whether a mapped pipeline is still in service.',
  }),
  Object.freeze({
    id: 'production-sites',
    name: 'Mines, Quarries & Refineries',
    group: 'Inland Freight',
    summary:
      'Extraction and processing sites in the current view, with what they dig up where it is tagged.',
    icon: '\u26cf',
    available: true,
    caveat:
      'Positions and commodity tags only \u2014 no output, reserves or whether the site is currently working. A mapped mine may be disused.',
  }),
  Object.freeze({
    id: 'air-cargo-hubs',
    name: 'Air Freight Gateways',
    group: 'Inland Freight',
    summary:
      '1,152 large airports with scheduled service, where air freight can move.',
    icon: '\u{1f6ec}',
    available: true,
    caveat:
      'NOT a cargo ranking. No open source publishes airport freight tonnage, so every marker is the same size and none is marked busier than another.',
  }),
  Object.freeze({
    id: 'access-roads',
    name: 'Access Roads',
    group: 'Inland Freight',
    summary:
      'Every road a vehicle can reach a settlement on \u2014 motorway down to secondary.',
    icon: '\u2aeb',
    available: true,
    caveat:
      'The network rescue and evacuation route over, not the freight network. It says where roads are, never whether one is currently passable.',
  }),
  // --- the disaster investigation ---
  Object.freeze({
    id: 'hazard-geometry',
    name: 'Hazard',
    group: 'Disaster',
    summary:
      'The open event\u2019s own shape: shaking bands, rupture, flood path, burn perimeter.',
    icon: '\u25c8',
    available: true,
    caveat:
      'Drawn from the responsible agency\u2019s published geometry for the open case, and empty until one is open. It is the hazard\u2019s extent, never a map of damage.',
  }),
  Object.freeze({
    id: 'terrain-3d',
    name: 'Terrain & Elevation',
    group: 'Disaster',
    summary: 'Real elevation under the map, so a valley reads as a valley.',
    icon: '\u26f0',
    available: true,
    caveat:
      'Vertical exaggeration above 1\u00d7 makes slopes readable and makes every height wrong by that multiplier. The active multiplier is stated in the reading.',
  }),
  // --- gaps, shown rather than hidden ---
  Object.freeze({
    id: 'gap:freight-volume',
    name: 'Freight Volumes & Capacity',
    group: 'Not Available',
    summary:
      'How much actually moves on a rail corridor, a road, a pipeline or through an airport.',
    icon: '\u2696',
    available: false,
    missing:
      'This is the honest remaining gap, and it is narrower than "no inland freight data". The infrastructure is mapped and drawn. What no open global source publishes is throughput: tonne-kilometres by corridor, heavy-goods counts by road, pipeline flow rates, airport cargo tonnage. Each exists per operator, per regulator or per national statistics office, on its own schedule and in its own units, and several are sold rather than published.',
  }),
  Object.freeze({
    id: 'gap:facility-output',
    name: 'Facility-Level Production Output',
    group: 'Not Available',
    summary: 'Annual tonnes or units from a named mine, refinery or factory.',
    icon: '\u2699',
    available: false,
    missing:
      'Mines, quarries, works and refineries are mapped and drawn, with their commodity where a surveyor tagged it. Output per site is company-reported in annual PDFs (USGS Mineral Yearbooks, company filings) that do not reconcile to OpenStreetMap ids. Export value is used as a labelled proxy in Analyze \u2192 Resource, and a proxy is not a measurement.',
  }),
]);

/** Look up a layer's plain-language record by layer id. */
export function layerName(id) {
  return LAYER_NAMES.find((entry) => entry.id === id) ?? null;
}

/**
 * Controls, renamed.
 *
 * Every one of these was a bare verb with no object: "Start" what? "Export" to
 * where? "Run Log" — noun or command? A button label should survive being read
 * out of context.
 */
export const CONTROL_NAMES = Object.freeze({
  start: { formerly: 'Start', name: 'Play Investigation' },
  stop: { formerly: 'Stop', name: 'Stop' },
  next: { formerly: 'Next', name: 'Next Step' },
  previous: { formerly: 'Prev', name: 'Previous Step' },
  pause: { formerly: null, name: 'Pause' },
  restart: { formerly: null, name: 'Restart' },
  exportPresets: { formerly: 'Export Presets', name: 'Save Investigation…' },
  importPresets: { formerly: 'Import', name: 'Open Saved Investigation…' },
  runLog: { formerly: 'Run Log', name: 'Playback Report' },
  editDetails: { formerly: 'Edit Details', name: 'Rename Investigation' },
  shareScene: { formerly: 'Share Scene', name: 'Copy Shareable Link' },
  captureShot: { formerly: 'Capture Shot', name: 'Add Step From This View' },
  updateShot: { formerly: 'Update Shot', name: 'Replace Step With This View' },
  investigate: { formerly: 'Investigate', name: 'Show Trade Flows' },
  resetView: { formerly: null, name: 'Reset View' },
  stopTracking: { formerly: null, name: 'Stop Following' },
});

/** The renamed label for a control key. */
export function controlName(key) {
  return CONTROL_NAMES[key]?.name ?? key;
}

/* ------------------------------------------------------------------ *
 * Glossary
 * ------------------------------------------------------------------ */

/**
 * Terms that cannot be renamed away, because they are the field's vocabulary.
 *
 * One sentence each. A definition a user has to read twice has failed, and a
 * paragraph will not be read at all.
 */
export const GLOSSARY = Object.freeze({
  chokepoint: {
    term: 'Chokepoint',
    short:
      'A narrow stretch of sea or land that a large share of world trade has to pass through.',
    more: 'There is usually an alternative, and it is usually much longer. That difference is the reason chokepoints matter.',
  },
  'trade route': {
    term: 'Trade route',
    short: 'The path goods travel between a supplier and a destination.',
    more: 'Routes here are drawn between real ports and chokepoints, but they are geographic paths — not the schedule a carrier actually sails.',
  },
  'supply dependency': {
    term: 'Supply dependency',
    short: 'How much a country relies on outside suppliers for something.',
    more: 'Measured here as the share of imports coming from each partner. A high share from one partner is a concentrated dependency.',
  },
  hhi: {
    term: 'HHI (concentration)',
    short:
      'A 0-to-1 score for how concentrated supply is: near 0 is spread across many suppliers, near 1 is one supplier.',
    more: 'Above 0.25 is conventionally called highly concentrated. 1 ÷ HHI gives the "effective number of suppliers" — a friendlier way to read the same number.',
  },
  cr4: {
    term: 'CR4',
    short: 'The share of the total held by the four largest suppliers.',
    more: 'A blunter companion to HHI. 80% CR4 means four countries account for four-fifths of the flow.',
  },
  'mirror statistics': {
    term: 'Mirror statistics',
    short:
      "Seeing a country's trade through what its partners report, because it does not report itself.",
    more: 'Taiwan is the case that matters here: it is not a UN Comtrade reporter, so it appears only inside partner-reported aggregate codes.',
  },
  'aggregate code': {
    term: 'Aggregate code',
    short:
      'A customs code covering a group of places rather than one country, such as "Other Asia, nes".',
    more: '"nes" means not elsewhere specified. Reading one as a single country is an inference, and this app labels it as one.',
  },
  teu: {
    term: 'TEU',
    short:
      'Twenty-foot Equivalent Unit — the standard way to count shipping containers.',
    more: 'One 40-foot container is 2 TEU. Port and country throughput is reported in TEU per year.',
  },
  'hs code': {
    term: 'HS code',
    short:
      'The international product-classification number customs authorities use.',
    more: 'HS 8542 is integrated circuits; HS 2709 is crude oil. The first two digits are the chapter, and more digits mean a narrower product.',
  },
  chokepoint_exposure: {
    term: 'Exposure',
    short: 'Being near something, which is not the same as being affected.',
    more: 'A cyclone 200 km from a port may close it for a week or miss it entirely. This app reports the distance and refuses to guess which.',
  },
  'geographic alternative': {
    term: 'Geographic alternative',
    short:
      'A route that exists on the map, with no claim that a carrier would or could actually sail it.',
    more: 'Validating a route commercially needs schedules, slot capacity and rates, all of which are paid data. So the label stays "geographic".',
  },
  provenance: {
    term: 'Provenance',
    short:
      'Where a number came from, how it was derived, and what it cannot tell you.',
    more: 'Every figure in this app carries one. If you disagree with a result, open it — the disagreement is usually about the method, not the number.',
  },
});

/**
 * The glossary entry for a term, matched case-insensitively.
 *
 * @param {string} term
 * @returns {object|null}
 */
export function glossary(term) {
  if (typeof term !== 'string') return null;
  return GLOSSARY[term.trim().toLowerCase()] ?? null;
}

/* ------------------------------------------------------------------ *
 * Legend
 * ------------------------------------------------------------------ */

/**
 * What every symbol on the globe means.
 *
 * Grouped so the legend can be read a section at a time instead of as one long
 * list of glyphs. `swatch` is a CSS colour so the legend draws the real mark
 * rather than describing it.
 */
export const LEGEND = Object.freeze([
  Object.freeze({
    group: 'Places',
    entries: Object.freeze([
      { mark: '⚓', label: 'Port', swatch: '#4fc3f7' },
      { mark: '◈', label: 'Chokepoint', swatch: '#ff8a65' },
      { mark: '●', label: 'Producer / exporter', swatch: '#66bb6a' },
      { mark: '○', label: 'Importer / consumer', swatch: '#90a4ae' },
    ]),
  }),
  Object.freeze({
    group: 'Movement',
    entries: Object.freeze([
      { mark: '✈', label: 'Aircraft', swatch: '#ffd54f' },
      { mark: '🚢', label: 'Vessel', swatch: '#4dd0e1' },
      { mark: '🛰', label: 'Satellite', swatch: '#b39ddb' },
      { mark: '━', label: 'Maritime route', swatch: '#4dd0e1' },
      { mark: '┄', label: 'Alternative route (geographic)', swatch: '#ffb74d' },
    ]),
  }),
  Object.freeze({
    group: 'Disruption',
    entries: Object.freeze([
      { mark: '⚠', label: 'Hazard event', swatch: '#ff7043' },
      { mark: '✕', label: 'Closed in this scenario', swatch: '#ef5350' },
    ]),
  }),
  Object.freeze({
    group: 'How sure is this?',
    entries: Object.freeze([
      { mark: '●', label: 'LIVE — happening now', swatch: '#66bb6a' },
      { mark: '●', label: 'HISTORICAL — 1–2 years old', swatch: '#4fc3f7' },
      {
        mark: '●',
        label: 'INFERRED — derived, not reported',
        swatch: '#ffb74d',
      },
      { mark: '●', label: 'SIMULATED — a model result', swatch: '#ba68c8' },
      { mark: '○', label: 'UNAVAILABLE — no data exists', swatch: '#78909c' },
    ]),
  }),
]);

/* ------------------------------------------------------------------ *
 * Data classes
 * ------------------------------------------------------------------ */

/**
 * How a data class should be shown, in words a non-specialist reads correctly.
 *
 * The engine's own `DataClass` is the authority on what a figure IS; this is
 * only how it gets presented. Keeping them separate means a wording change
 * cannot alter a classification.
 */
export const DATA_CLASS_PRESENTATION = Object.freeze({
  LIVE: {
    label: 'LIVE',
    plain: 'Happening now',
    colour: '#66bb6a',
    means: 'Read from a feed within the last few minutes.',
  },
  HISTORICAL: {
    label: 'HISTORICAL',
    // Deliberately not "1-2 years old": that is the Comtrade lag, and this
    // class also covers World Bank series that stop in 2009 and standing
    // geographic facts that do not age at all. The actual lag belongs in each
    // result's own provenance, where it can be specific.
    plain: 'A past measurement',
    colour: '#4fc3f7',
    means:
      'Recorded at a stated time in the past and accurate for then, not for today. How far back varies by source — the provenance says.',
  },
  INFERRED: {
    label: 'INFERRED',
    plain: 'Worked out, not reported',
    colour: '#ffb74d',
    means:
      'Derived from something else. The reasoning is attached and can be disagreed with.',
  },
  SIMULATED: {
    label: 'SIMULATED',
    plain: 'A model result',
    colour: '#ba68c8',
    means:
      'Produced by this app’s model from real geography. It is a calculation, not an observation.',
  },
  UNKNOWN: {
    label: 'UNAVAILABLE',
    plain: 'No data',
    colour: '#78909c',
    means: 'Nothing open covers this. What would be needed is stated.',
  },
});

/**
 * Presentation for a data class, falling back to UNKNOWN.
 *
 * Accepts the analytical vocabulary as well as this module's own. The Stage 3-5
 * artefacts carry OBSERVED / OFFICIAL / DERIVED / MODEL_FIT / ESTIMATE /
 * SCENARIO, which predate nothing here but describe the same idea more
 * precisely; a panel handed one of those must not fall through to "No data".
 * The canonical presentation lives in `src/nepal/story/resultClass.js`; this
 * map is the older five-class view of the same thing, kept so every existing
 * badge keeps rendering.
 */
const ANALYTICAL_TO_LEGACY = Object.freeze({
  OBSERVED: 'HISTORICAL',
  OFFICIAL: 'HISTORICAL',
  DESCRIPTIVE_STATISTIC: 'INFERRED',
  DERIVED: 'INFERRED',
  MODEL_FIT: 'SIMULATED',
  ESTIMATE: 'INFERRED',
  SCENARIO: 'SIMULATED',
  DATA_GAP: 'UNKNOWN',
});

export function dataClassPresentation(dataClass) {
  if (DATA_CLASS_PRESENTATION[dataClass])
    return DATA_CLASS_PRESENTATION[dataClass];
  const legacy = ANALYTICAL_TO_LEGACY[dataClass];
  if (legacy) return DATA_CLASS_PRESENTATION[legacy];
  return DATA_CLASS_PRESENTATION.UNKNOWN;
}
