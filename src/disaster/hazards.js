/**
 * The hazard-type registry.
 *
 * §21 of the brief, and the reason the rest of the platform can stay generic:
 * "Create an extensible architecture so new disaster types can be added without
 * rebuilding the application." And §3's harder rule — "Do NOT use the same
 * visualisation for every disaster."
 *
 * So a hazard type is DATA, not code. Each entry declares:
 *
 *   what it is            the plain-language name and the question it answers
 *   how it is drawn       the ordered geometry layers, each with its own kind
 *                         (contour band, perimeter, path, point field, depth
 *                         surface, source-and-propagation) — this is what makes
 *                         an earthquake look nothing like a cyclone
 *   what it measures      the primary intensity scale, its units and bands
 *   its timeline shape    the phases that actually apply. An earthquake has no
 *                         forecast cone; a cyclone has days of them. A drought
 *                         has no T+1 hour.
 *   its secondary hazards what it causes, because that is usually what does the
 *                         damage (an earthquake's landslides, a cyclone's surge)
 *   its data adapters     which source can supply each piece, and whether that
 *                         source is wired yet
 *
 * A new type is a new object in HAZARD_TYPES. Nothing else changes: the zoom
 * ladder, the timeline, the impact views and the response engine all read this
 * registry rather than switching on a type string.
 *
 * ADAPTERS THAT ARE NOT WIRED ARE DECLARED, NOT FAKED. §20: "If an API is
 * unavailable, create a clean data adapter/interface so real data can be
 * connected later." Every `adapters` entry carries a `status`, and `PLANNED`
 * means the interface exists and the integration point is named — it never
 * means the UI invents a value.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

/**
 * How a geometry layer is rendered. The renderer switches on this, so adding a
 * hazard type never requires touching the renderer.
 */
export const GEOMETRY_KIND = Object.freeze({
  /** Nested bands from an intensity field — ShakeMap MMI, rainfall totals. */
  CONTOUR_BANDS: 'CONTOUR_BANDS',
  /** A single closed boundary that grows over time — fire, flood, inundation. */
  PERIMETER: 'PERIMETER',
  /** A line the hazard travelled — storm track, lahar, debris flow. */
  PATH: 'PATH',
  /** Discrete located events — aftershocks, hotspots, damage reports. */
  POINT_FIELD: 'POINT_FIELD',
  /** A surface with a third value at each point — flood depth, ash load. */
  DEPTH_SURFACE: 'DEPTH_SURFACE',
  /** A polygon of the rupture or vent itself. */
  SOURCE_GEOMETRY: 'SOURCE_GEOMETRY',
  /** Expanding rings from a source — tsunami travel time. */
  PROPAGATION: 'PROPAGATION',
  /** A zone classified rather than measured — hazard susceptibility. */
  SUSCEPTIBILITY: 'SUSCEPTIBILITY',
});

/** Whether a declared adapter can actually be called today. */
export const ADAPTER_STATUS = Object.freeze({
  /** Wired, keyless and verified against the live service. */
  LIVE: 'LIVE',
  /** Wired, but the data it returns is an archived snapshot. */
  ARCHIVED: 'ARCHIVED',
  /** Interface defined, integration point named, not connected. */
  PLANNED: 'PLANNED',
});

/**
 * The canonical timeline phases (§4).
 *
 * A hazard type selects the subset that applies to it rather than every type
 * pretending to have all nine. `offsetHours` is relative to T-0.
 */
export const TIMELINE_PHASES = Object.freeze({
  'T-72h': { offsetHours: -72, label: 'T-72h', heading: 'Forecast' },
  'T-24h': { offsetHours: -24, label: 'T-24h', heading: 'Early warning' },
  'T-1h': { offsetHours: -1, label: 'T-1h', heading: 'Immediate precursors' },
  'T-0': { offsetHours: 0, label: 'T-0', heading: 'Onset' },
  'T+1h': { offsetHours: 1, label: 'T+1h', heading: 'Initial impact' },
  'T+6h': {
    offsetHours: 6,
    label: 'T+6h',
    heading: 'Infrastructure disruption',
  },
  'T+12h': { offsetHours: 12, label: 'T+12h', heading: 'Rescue operations' },
  'T+24h': {
    offsetHours: 24,
    label: 'T+24h',
    heading: 'Humanitarian consequences',
  },
  'T+48h': { offsetHours: 48, label: 'T+48h', heading: 'Supply-chain effects' },
  'T+7d': { offsetHours: 168, label: 'T+7d', heading: 'Recovery' },
  'T+30d': { offsetHours: 720, label: 'T+30d', heading: 'Reconstruction' },
});

/**
 * Intensity bands, per scale.
 *
 * Published scales only — Modified Mercalli, Saffir-Simpson, the Volcanic
 * Explosivity Index, the EF scale. Nothing invented here, because a band
 * boundary this project made up would put a colour on a map that no agency
 * would recognise.
 */
export const INTENSITY_SCALES = Object.freeze({
  MMI: Object.freeze({
    id: 'MMI',
    name: 'Modified Mercalli Intensity',
    units: 'MMI',
    authority: 'USGS',
    reads: 'How hard the ground shook where people were standing.',
    /*
     * The official USGS ShakeMap colour ramp. Kept because a reader who has
     * seen a ShakeMap before will recognise it, and inventing a green ramp for
     * shaking intensity would make the map prettier and less useful.
     */
    bands: Object.freeze([
      { value: 1, label: 'I', name: 'Not felt', colour: '#ffffff' },
      { value: 2, label: 'II', name: 'Weak', colour: '#bfccff' },
      { value: 3, label: 'III', name: 'Weak', colour: '#9999ff' },
      { value: 4, label: 'IV', name: 'Light', colour: '#80ffff' },
      { value: 5, label: 'V', name: 'Moderate', colour: '#7df894' },
      { value: 6, label: 'VI', name: 'Strong', colour: '#ffff00' },
      { value: 7, label: 'VII', name: 'Very strong', colour: '#ffc800' },
      { value: 8, label: 'VIII', name: 'Severe', colour: '#ff9100' },
      { value: 9, label: 'IX', name: 'Violent', colour: '#ff0000' },
      { value: 10, label: 'X+', name: 'Extreme', colour: '#c80000' },
    ]),
  }),
  SAFFIR_SIMPSON: Object.freeze({
    id: 'SAFFIR_SIMPSON',
    name: 'Saffir-Simpson hurricane wind scale',
    units: 'category',
    authority: 'NOAA / NHC',
    reads: 'Sustained wind speed, banded by the damage it causes.',
    bands: Object.freeze([
      { value: 0, label: 'TS', name: 'Tropical storm', colour: '#7df894' },
      { value: 1, label: '1', name: '119–153 km/h', colour: '#ffff00' },
      { value: 2, label: '2', name: '154–177 km/h', colour: '#ffc800' },
      { value: 3, label: '3', name: '178–208 km/h', colour: '#ff9100' },
      { value: 4, label: '4', name: '209–251 km/h', colour: '#ff0000' },
      { value: 5, label: '5', name: '252+ km/h', colour: '#c80000' },
    ]),
  }),
  FLOOD_DEPTH: Object.freeze({
    id: 'FLOOD_DEPTH',
    name: 'Flood depth',
    units: 'm',
    authority: 'Copernicus EMS / national agencies',
    reads: 'How deep the water stood, which decides what survives it.',
    bands: Object.freeze([
      {
        value: 0.5,
        label: '<0.5 m',
        name: 'Passable on foot',
        colour: '#c7ecff',
      },
      {
        value: 1,
        label: '0.5–1 m',
        name: 'Ground floors flooded',
        colour: '#74c7ec',
      },
      { value: 2, label: '1–2 m', name: 'Vehicles lost', colour: '#2d9bd6' },
      {
        value: 4,
        label: '2–4 m',
        name: 'Single storeys submerged',
        colour: '#1b6fa8',
      },
      {
        value: 99,
        label: '>4 m',
        name: 'Structural destruction',
        colour: '#0d3f66',
      },
    ]),
  }),
  FIRE_RADIATIVE_POWER: Object.freeze({
    id: 'FIRE_RADIATIVE_POWER',
    name: 'Fire radiative power',
    units: 'MW',
    authority: 'NASA FIRMS',
    reads: 'How much energy the fire front is releasing.',
    bands: Object.freeze([
      { value: 10, label: '<10 MW', name: 'Low', colour: '#ffe066' },
      { value: 50, label: '10–50 MW', name: 'Moderate', colour: '#ffb020' },
      { value: 200, label: '50–200 MW', name: 'High', colour: '#ff6b1a' },
      { value: 9999, label: '>200 MW', name: 'Extreme', colour: '#ff2020' },
    ]),
  }),
  VEI: Object.freeze({
    id: 'VEI',
    name: 'Volcanic Explosivity Index',
    units: 'VEI',
    authority: 'Smithsonian GVP',
    reads: 'Erupted volume, on a logarithmic scale.',
    bands: Object.freeze([
      { value: 1, label: '1', name: 'Gentle', colour: '#7df894' },
      { value: 2, label: '2', name: 'Explosive', colour: '#ffff00' },
      { value: 3, label: '3', name: 'Severe', colour: '#ffc800' },
      { value: 4, label: '4', name: 'Cataclysmic', colour: '#ff9100' },
      { value: 5, label: '5+', name: 'Paroxysmal', colour: '#ff0000' },
    ]),
  }),
  EF: Object.freeze({
    id: 'EF',
    name: 'Enhanced Fujita scale',
    units: 'EF',
    authority: 'NOAA / NWS',
    reads: 'Tornado intensity, inferred from the damage it left.',
    bands: Object.freeze([
      { value: 0, label: 'EF0', name: '105–137 km/h', colour: '#7df894' },
      { value: 1, label: 'EF1', name: '138–178 km/h', colour: '#ffff00' },
      { value: 2, label: 'EF2', name: '179–218 km/h', colour: '#ffc800' },
      { value: 3, label: 'EF3', name: '219–266 km/h', colour: '#ff9100' },
      { value: 4, label: 'EF4', name: '267–322 km/h', colour: '#ff0000' },
      { value: 5, label: 'EF5', name: '>322 km/h', colour: '#c80000' },
    ]),
  }),
  SPI: Object.freeze({
    id: 'SPI',
    name: 'Standardised Precipitation Index',
    units: 'SPI',
    authority: 'WMO',
    reads: 'How far rainfall has fallen below the long-run normal.',
    /*
     * The US Drought Monitor D1-D4 thresholds. Each `value` is the ceiling of
     * its band — SPI at or below it falls in that band — so the table runs
     * from least to most severe and the classifier walks it backwards.
     *
     * An earlier version used a -99 sentinel for the worst band, which made
     * an exceptional drought classify as merely extreme: nothing is ever at
     * or below -99, so the band could not be reached. A test caught it.
     */
    bands: Object.freeze([
      { value: -0.8, label: 'D1', name: 'Moderate drought', colour: '#ffe066' },
      { value: -1.3, label: 'D2', name: 'Severe drought', colour: '#ffb020' },
      { value: -1.6, label: 'D3', name: 'Extreme drought', colour: '#e2703a' },
      {
        value: -2,
        label: 'D4',
        name: 'Exceptional drought',
        colour: '#8c2f0d',
      },
    ]),
  }),
  HEAT_INDEX: Object.freeze({
    id: 'HEAT_INDEX',
    name: 'Heat index',
    units: '°C apparent',
    authority: 'NOAA',
    reads: 'Temperature as the body experiences it, with humidity.',
    bands: Object.freeze([
      { value: 27, label: '27–32', name: 'Caution', colour: '#ffe066' },
      { value: 32, label: '32–41', name: 'Extreme caution', colour: '#ffb020' },
      { value: 41, label: '41–54', name: 'Danger', colour: '#ff6b1a' },
      { value: 99, label: '>54', name: 'Extreme danger', colour: '#ff2020' },
    ]),
  }),
  RUNOUT: Object.freeze({
    id: 'RUNOUT',
    name: 'Landslide runout susceptibility',
    units: 'probability',
    authority: 'USGS ground-failure models',
    reads: 'How likely the slope was to fail where it did.',
    bands: Object.freeze([
      { value: 0.02, label: 'Low', name: 'Unlikely', colour: '#7df894' },
      { value: 0.1, label: 'Moderate', name: 'Possible', colour: '#ffff00' },
      { value: 0.3, label: 'High', name: 'Likely', colour: '#ff9100' },
      { value: 1, label: 'Very high', name: 'Near-certain', colour: '#ff0000' },
    ]),
  }),
});

/**
 * Build one geometry-layer declaration.
 *
 * `answers` is required and is the discipline: a layer that cannot say which
 * question it answers is decoration, and §11 applies the same rule to 3D.
 */
function geometry({
  id,
  name,
  kind,
  answers,
  scale = null,
  adapter = null,
  requiresTerrain = false,
  timeVarying = false,
}) {
  if (!id || !name || !kind || !answers) {
    throw new TypeError(
      `geometry "${id}" must declare id, name, kind and answers`,
    );
  }
  if (!GEOMETRY_KIND[kind]) {
    throw new TypeError(`geometry "${id}" has unknown kind "${kind}"`);
  }
  return Object.freeze({
    id,
    name,
    kind,
    answers,
    scale,
    adapter,
    requiresTerrain,
    timeVarying,
  });
}

/** Build one adapter declaration. */
function adapter({
  id,
  source,
  provides,
  status,
  endpoint = null,
  note = null,
}) {
  if (!ADAPTER_STATUS[status]) {
    throw new TypeError(`adapter "${id}" has unknown status "${status}"`);
  }
  return Object.freeze({ id, source, provides, status, endpoint, note });
}

/**
 * The hazard types.
 *
 * Ordered roughly by how much of the world's disaster burden each carries, so
 * the explorer's default ordering is not arbitrary.
 */
export const HAZARD_TYPES = Object.freeze({
  earthquake: Object.freeze({
    id: 'earthquake',
    name: 'Earthquake',
    icon: '◈',
    gdacsCode: 'EQ',
    question: 'How hard did the ground shake, where, and what did that reach?',
    primaryScale: 'MMI',
    /*
     * Ordered outside-in, which is also the order the zoom ladder reveals
     * them: the intensity field covers a country, the rupture covers a
     * province, the aftershocks and landslides are local.
     */
    geometries: Object.freeze([
      geometry({
        id: 'mmi-contours',
        name: 'Shaking intensity',
        kind: 'CONTOUR_BANDS',
        scale: 'MMI',
        answers: 'How far did damaging shaking reach, and how hard?',
        adapter: 'usgs-shakemap',
      }),
      geometry({
        id: 'rupture',
        name: 'Fault rupture',
        kind: 'SOURCE_GEOMETRY',
        answers: 'Which fault moved, and over what length?',
        adapter: 'usgs-finite-fault',
      }),
      geometry({
        id: 'aftershocks',
        name: 'Aftershocks',
        kind: 'POINT_FIELD',
        answers: 'Where is the sequence still active, and for how long?',
        adapter: 'usgs-catalogue',
        timeVarying: true,
      }),
      geometry({
        id: 'landslide-hazard',
        name: 'Landslide susceptibility',
        kind: 'SUSCEPTIBILITY',
        scale: 'RUNOUT',
        answers:
          'Why did the roads fail where they did? In mountains the slides, not the shaking, close the corridor.',
        adapter: 'usgs-ground-failure',
        requiresTerrain: true,
      }),
      geometry({
        id: 'felt-reports',
        name: 'Felt reports',
        kind: 'POINT_FIELD',
        answers: 'Where did people actually report feeling it?',
        adapter: 'usgs-dyfi',
      }),
    ]),
    /** An earthquake has no forecast: it starts at T-0. */
    phases: Object.freeze([
      'T-0',
      'T+1h',
      'T+6h',
      'T+12h',
      'T+24h',
      'T+48h',
      'T+7d',
      'T+30d',
    ]),
    secondaryHazards: Object.freeze([
      'Landslides on steep slopes',
      'Liquefaction on soft sediment',
      'Aftershocks collapsing weakened structures',
      'Glacial-lake and landslide-dam outburst floods',
    ]),
    adapters: Object.freeze([
      adapter({
        id: 'usgs-catalogue',
        source: 'USGS Earthquake Hazards Program',
        provides: 'event, magnitude, depth, epicentre, aftershock sequence',
        status: 'LIVE',
        endpoint: 'https://earthquake.usgs.gov/fdsnws/event/1/query',
      }),
      adapter({
        id: 'usgs-shakemap',
        source: 'USGS ShakeMap',
        provides: 'MMI intensity contours as GeoJSON, peak ground acceleration',
        status: 'LIVE',
        endpoint: 'product/shakemap/.../download/cont_mmi.json',
      }),
      adapter({
        id: 'usgs-pager',
        source: 'USGS PAGER',
        provides:
          'population exposed per MMI band, fatality and economic alert levels, per-city shaking',
        status: 'LIVE',
        endpoint: 'product/losspager/.../pager.xml',
      }),
      adapter({
        id: 'usgs-finite-fault',
        source: 'USGS finite-fault inversion',
        provides: 'rupture plane geometry and slip distribution',
        status: 'LIVE',
        endpoint: 'product/finite-fault/.../FFM.geojson',
      }),
      adapter({
        id: 'usgs-ground-failure',
        source: 'USGS ground-failure models (Jessee 2017, Godt 2008)',
        provides: 'landslide and liquefaction hazard and population alerts',
        status: 'LIVE',
        endpoint: 'product/ground-failure/.../info.json',
      }),
      adapter({
        id: 'usgs-dyfi',
        source: 'USGS Did You Feel It',
        provides: 'crowdsourced felt intensity by 10 km cell',
        status: 'LIVE',
        endpoint: 'product/dyfi/.../dyfi_geo_10km.geojson',
      }),
      adapter({
        id: 'copernicus-ems-eq',
        source: 'Copernicus Emergency Management Service',
        provides: 'rapid-mapping damage-grading vectors from satellite imagery',
        status: 'PLANNED',
        note: 'Activations are published per event as zipped vector packages rather than a queryable API. Integration point: src/disaster/sources/copernicus.js.',
      }),
    ]),
  }),

  flood: Object.freeze({
    id: 'flood',
    name: 'Flood',
    icon: '≈',
    gdacsCode: 'FL',
    question: 'How far did the water reach, how deep, and what did it cut off?',
    primaryScale: 'FLOOD_DEPTH',
    geometries: Object.freeze([
      geometry({
        id: 'flood-extent',
        name: 'Flood extent',
        kind: 'PERIMETER',
        answers: 'What was under water, and when?',
        adapter: 'copernicus-ems-flood',
        timeVarying: true,
      }),
      geometry({
        id: 'flood-depth',
        name: 'Flood depth',
        kind: 'DEPTH_SURFACE',
        scale: 'FLOOD_DEPTH',
        answers:
          'Why did this district lose its ground floors and the next one not? Depth decides that, and extent alone cannot show it.',
        adapter: 'copernicus-ems-flood',
        requiresTerrain: true,
      }),
      geometry({
        id: 'flood-path',
        name: 'Flow path',
        kind: 'PATH',
        answers: 'Which valley did the water travel down?',
        adapter: 'event-reconstruction',
        timeVarying: true,
      }),
      geometry({
        id: 'catchment',
        name: 'Contributing catchment',
        kind: 'SUSCEPTIBILITY',
        answers:
          'Why here? Terrain shows the water that fell elsewhere arriving in one place.',
        adapter: 'terrain',
        requiresTerrain: true,
      }),
    ]),
    phases: Object.freeze([
      'T-72h',
      'T-24h',
      'T-1h',
      'T-0',
      'T+1h',
      'T+6h',
      'T+12h',
      'T+24h',
      'T+48h',
      'T+7d',
    ]),
    secondaryHazards: Object.freeze([
      'Bridge scour and road washout',
      'Landslides on saturated slopes',
      'Water-borne disease in displacement camps',
      'Cropland loss and later food-price effects',
    ]),
    adapters: Object.freeze([
      adapter({
        id: 'gdacs-flood',
        source: 'GDACS (European Commission / UN)',
        provides:
          'live flood alerts with modelled severity and affected population',
        status: 'LIVE',
        endpoint: 'GDACS GeoJSON event feed',
      }),
      adapter({
        id: 'event-reconstruction',
        source: 'Project event pack, from geolocated field evidence',
        provides: 'flood corridor geometry and a timed reconstruction',
        status: 'ARCHIVED',
        endpoint: 'public/events/<event-id>/event.json',
        note: 'Reconstructed from geolocated witness media, not from a hydraulic model. Labelled as a reconstruction wherever it is drawn.',
      }),
      adapter({
        id: 'copernicus-ems-flood',
        source: 'Copernicus EMS rapid mapping',
        provides: 'satellite-derived flood extent and depth vectors',
        status: 'PLANNED',
        note: 'Per-activation vector packages, not an API. Integration point: src/disaster/sources/copernicus.js.',
      }),
      adapter({
        id: 'glofas',
        source: 'GloFAS (Copernicus global flood awareness)',
        provides: 'river discharge forecasts, for the T-72h and T-24h phases',
        status: 'PLANNED',
        note: 'Requires a Climate Data Store account. Integration point: src/disaster/sources/glofas.js.',
      }),
      adapter({
        id: 'terrain',
        source: 'Cesium World Terrain',
        provides: 'elevation, for depth surfaces and catchment reasoning',
        status: 'LIVE',
      }),
    ]),
  }),

  wildfire: Object.freeze({
    id: 'wildfire',
    name: 'Wildfire',
    icon: '▲',
    gdacsCode: 'WF',
    question:
      'Where is the fire front, which way is it moving, and what is ahead of it?',
    primaryScale: 'FIRE_RADIATIVE_POWER',
    geometries: Object.freeze([
      geometry({
        id: 'fire-perimeter',
        name: 'Fire perimeter',
        kind: 'PERIMETER',
        answers: 'What has already burned?',
        adapter: 'firms',
        timeVarying: true,
      }),
      geometry({
        id: 'active-front',
        name: 'Active detections',
        kind: 'POINT_FIELD',
        scale: 'FIRE_RADIATIVE_POWER',
        answers: 'Where is it burning right now, and how hard?',
        adapter: 'firms',
        timeVarying: true,
      }),
      geometry({
        id: 'spread-vector',
        name: 'Spread direction',
        kind: 'PATH',
        answers: 'Which settlements are downwind, and how long do they have?',
        adapter: 'wind',
        timeVarying: true,
      }),
      geometry({
        id: 'fuel',
        name: 'Vegetation and fuel',
        kind: 'SUSCEPTIBILITY',
        answers: 'Why did it run here and stop there?',
        adapter: 'landcover',
      }),
    ]),
    phases: Object.freeze([
      'T-24h',
      'T-0',
      'T+6h',
      'T+12h',
      'T+24h',
      'T+48h',
      'T+7d',
    ]),
    secondaryHazards: Object.freeze([
      'Smoke plumes reaching cities far downwind',
      'Post-fire debris flows on bare slopes',
      'Transmission-line shutdowns',
    ]),
    adapters: Object.freeze([
      adapter({
        id: 'firms',
        source: 'NASA FIRMS (VIIRS / MODIS)',
        provides:
          'active fire detections with radiative power and acquisition time',
        status: 'LIVE',
        endpoint: 'FIRMS area API',
      }),
      adapter({
        id: 'wind',
        source: 'Open-Meteo',
        provides: 'wind speed and direction at the fire, for spread reasoning',
        status: 'PLANNED',
        note: 'Keyless and reachable. Integration point: src/disaster/sources/weather.js.',
      }),
      adapter({
        id: 'landcover',
        source: 'Copernicus Global Land Cover',
        provides: 'fuel classification',
        status: 'PLANNED',
        note: 'Raster tiles rather than vectors. Integration point: src/disaster/sources/landcover.js.',
      }),
    ]),
  }),

  cyclone: Object.freeze({
    id: 'cyclone',
    name: 'Cyclone / Typhoon / Hurricane',
    icon: '🌀',
    gdacsCode: 'TC',
    question:
      'Where did the storm go, how strong was it, and what did the surge reach?',
    primaryScale: 'SAFFIR_SIMPSON',
    geometries: Object.freeze([
      geometry({
        id: 'storm-track',
        name: 'Storm track',
        kind: 'PATH',
        scale: 'SAFFIR_SIMPSON',
        answers: 'Where did the centre pass, and at what strength?',
        adapter: 'gdacs-tc',
        timeVarying: true,
      }),
      geometry({
        id: 'wind-swath',
        name: 'Wind field',
        kind: 'CONTOUR_BANDS',
        scale: 'SAFFIR_SIMPSON',
        answers: 'How wide was the damaging wind, not just the eye?',
        adapter: 'gdacs-tc',
        timeVarying: true,
      }),
      geometry({
        id: 'surge',
        name: 'Storm surge',
        kind: 'DEPTH_SURFACE',
        scale: 'FLOOD_DEPTH',
        answers:
          'Surge kills more people than wind. Coastal elevation shows which streets it could reach.',
        adapter: 'surge-model',
        requiresTerrain: true,
      }),
      geometry({
        id: 'rainfall',
        name: 'Rainfall total',
        kind: 'CONTOUR_BANDS',
        answers: 'Where did the inland flooding come from?',
        adapter: 'gpm',
      }),
    ]),
    phases: Object.freeze([
      'T-72h',
      'T-24h',
      'T-1h',
      'T-0',
      'T+6h',
      'T+24h',
      'T+48h',
      'T+7d',
    ]),
    secondaryHazards: Object.freeze([
      'Storm surge inundation',
      'Inland river flooding from rainfall',
      'Landslides in saturated uplands',
      'Extended power and telecoms loss',
    ]),
    adapters: Object.freeze([
      adapter({
        id: 'gdacs-tc',
        source: 'GDACS tropical-cyclone feed',
        provides: 'track points, category and alert level',
        status: 'LIVE',
        endpoint: 'GDACS GeoJSON event feed',
      }),
      adapter({
        id: 'surge-model',
        source: 'National meteorological agency surge products',
        provides: 'modelled inundation depth',
        status: 'PLANNED',
        note: 'Published per basin and per agency. Integration point: src/disaster/sources/surge.js.',
      }),
      adapter({
        id: 'gpm',
        source: 'NASA GPM IMERG',
        provides: 'half-hourly precipitation grids',
        status: 'PLANNED',
        note: 'Requires an Earthdata login. Integration point: src/disaster/sources/gpm.js.',
      }),
    ]),
  }),

  landslide: Object.freeze({
    id: 'landslide',
    name: 'Landslide',
    icon: '⛰',
    gdacsCode: null,
    question: 'Which slope failed, what did it bury, and what did it cut?',
    primaryScale: 'RUNOUT',
    geometries: Object.freeze([
      geometry({
        id: 'slide-body',
        name: 'Slide body',
        kind: 'PERIMETER',
        answers: 'What moved, and where did it stop?',
        adapter: 'event-reconstruction',
      }),
      geometry({
        id: 'runout-path',
        name: 'Runout path',
        kind: 'PATH',
        answers:
          'What stood in the path between the failure and where the debris stopped? The runout, not the scar, is what buries a road or a settlement.',
        adapter: 'event-reconstruction',
      }),
      geometry({
        id: 'slope',
        name: 'Slope and terrain',
        kind: 'SUSCEPTIBILITY',
        scale: 'RUNOUT',
        answers:
          'Why this slope? Gradient and saturation are the whole explanation, and neither is visible in plan view.',
        adapter: 'terrain',
        requiresTerrain: true,
      }),
    ]),
    phases: Object.freeze(['T-24h', 'T-0', 'T+1h', 'T+6h', 'T+24h', 'T+7d']),
    secondaryHazards: Object.freeze([
      'Valley blockage and landslide-dam outburst',
      'Isolation of settlements above the failure',
      'Loss of the only road in a mountain corridor',
    ]),
    adapters: Object.freeze([
      adapter({
        id: 'event-reconstruction',
        source: 'Project event pack, from geolocated field evidence',
        provides: 'slide geometry and runout',
        status: 'ARCHIVED',
        endpoint: 'public/events/<event-id>/event.json',
      }),
      adapter({
        id: 'terrain',
        source: 'Cesium World Terrain',
        provides: 'elevation and derived slope',
        status: 'LIVE',
      }),
      adapter({
        id: 'nasa-global-landslide',
        source: 'NASA Global Landslide Catalog',
        provides:
          'historical reported landslides with trigger and fatality counts',
        status: 'PLANNED',
        note: 'Published as a CSV/API on NASA open data. Integration point: src/disaster/sources/landslideCatalog.js.',
      }),
    ]),
  }),

  tsunami: Object.freeze({
    id: 'tsunami',
    name: 'Tsunami',
    icon: '〜',
    gdacsCode: 'TS',
    question:
      'Where did the wave come from, when did it arrive, and how far inland?',
    primaryScale: 'FLOOD_DEPTH',
    geometries: Object.freeze([
      geometry({
        id: 'source',
        name: 'Generating earthquake',
        kind: 'SOURCE_GEOMETRY',
        answers: 'What displaced the water?',
        adapter: 'usgs-catalogue',
      }),
      geometry({
        id: 'travel-time',
        name: 'Wave propagation',
        kind: 'PROPAGATION',
        answers: 'How much warning did each coastline actually have?',
        adapter: 'ptwc',
        timeVarying: true,
      }),
      geometry({
        id: 'inundation',
        name: 'Inundation extent',
        kind: 'PERIMETER',
        answers: 'How far inland did the water reach?',
        adapter: 'copernicus-ems-flood',
      }),
      geometry({
        id: 'coastal-relief',
        name: 'Coastal elevation',
        kind: 'DEPTH_SURFACE',
        answers:
          'Why did one bay flood and the next not? Coastal shape focuses a wave, and only terrain shows it.',
        adapter: 'terrain',
        requiresTerrain: true,
      }),
    ]),
    phases: Object.freeze(['T-0', 'T+1h', 'T+6h', 'T+12h', 'T+24h', 'T+7d']),
    secondaryHazards: Object.freeze([
      'Port destruction and shipping suspension',
      'Coastal industrial and fuel contamination',
      'Complete loss of low-lying settlements',
    ]),
    adapters: Object.freeze([
      adapter({
        id: 'usgs-catalogue',
        source: 'USGS Earthquake Hazards Program',
        provides: 'generating event location, magnitude and mechanism',
        status: 'LIVE',
        endpoint: 'https://earthquake.usgs.gov/fdsnws/event/1/query',
      }),
      adapter({
        id: 'ptwc',
        source: 'Pacific Tsunami Warning Center',
        provides: 'travel-time contours and observed wave heights',
        status: 'PLANNED',
        note: 'Bulletins are text and image products. Integration point: src/disaster/sources/tsunami.js.',
      }),
      adapter({
        id: 'copernicus-ems-flood',
        source: 'Copernicus EMS rapid mapping',
        provides: 'satellite-derived inundation extent',
        status: 'PLANNED',
        note: 'Per-activation vector packages, not an API. Integration point: src/disaster/sources/copernicus.js.',
      }),
      adapter({
        id: 'terrain',
        source: 'Cesium World Terrain',
        provides: 'coastal elevation',
        status: 'LIVE',
      }),
    ]),
  }),

  volcano: Object.freeze({
    id: 'volcano',
    name: 'Volcanic eruption',
    icon: '▲',
    gdacsCode: 'VO',
    question:
      'What erupted, where did the material go, and what is downslope or downwind?',
    primaryScale: 'VEI',
    geometries: Object.freeze([
      geometry({
        id: 'vent',
        name: 'Vent',
        kind: 'SOURCE_GEOMETRY',
        answers:
          'Which vent is erupting, and how high above the valleys is it? Everything downslope and downwind is measured from here.',
        adapter: 'gvp',
      }),
      geometry({
        id: 'ash-plume',
        name: 'Ash plume',
        kind: 'CONTOUR_BANDS',
        answers: 'Which airspace and farmland is downwind?',
        adapter: 'vaac',
        timeVarying: true,
      }),
      geometry({
        id: 'lahar',
        name: 'Lahar and flow paths',
        kind: 'PATH',
        answers:
          'Lahars follow valleys, so the villages at risk are not the nearest ones. Terrain decides which.',
        adapter: 'terrain',
        requiresTerrain: true,
      }),
      geometry({
        id: 'exclusion',
        name: 'Exclusion zone',
        kind: 'PERIMETER',
        answers: 'Who has been told to leave?',
        adapter: 'national-agency',
      }),
    ]),
    phases: Object.freeze([
      'T-72h',
      'T-24h',
      'T-0',
      'T+6h',
      'T+24h',
      'T+48h',
      'T+7d',
      'T+30d',
    ]),
    secondaryHazards: Object.freeze([
      'Aviation disruption across a continent',
      'Lahars months after the eruption ends',
      'Ashfall collapsing roofs and killing crops',
    ]),
    adapters: Object.freeze([
      adapter({
        id: 'gvp',
        source: 'Smithsonian Global Volcanism Program',
        provides: 'volcano identity, elevation, eruption history and VEI',
        status: 'PLANNED',
        note: 'Weekly reports plus a downloadable database. Integration point: src/disaster/sources/volcano.js.',
      }),
      adapter({
        id: 'vaac',
        source: 'Volcanic Ash Advisory Centres',
        provides: 'ash-cloud advisories and forecast plume polygons',
        status: 'PLANNED',
        note: 'The nine VAACs publish advisories as text bulletins plus KML, each on its own schedule and server. Integration point: src/disaster/sources/volcano.js.',
      }),
      adapter({
        id: 'national-agency',
        source: 'National volcanological agency',
        provides: 'alert level and official exclusion zones',
        status: 'PLANNED',
        note: 'One agency per volcano-bearing country, with no common format. Integration point: src/disaster/sources/volcano.js.',
      }),
      adapter({
        id: 'terrain',
        source: 'Cesium World Terrain',
        provides: 'elevation, for flow-path reasoning',
        status: 'LIVE',
      }),
    ]),
  }),

  drought: Object.freeze({
    id: 'drought',
    name: 'Drought',
    icon: '◌',
    gdacsCode: 'DR',
    question:
      'Where has the rain failed, for how long, and what does that region grow?',
    primaryScale: 'SPI',
    geometries: Object.freeze([
      geometry({
        id: 'deficit',
        name: 'Precipitation deficit',
        kind: 'CONTOUR_BANDS',
        scale: 'SPI',
        answers: 'Which areas are below normal, and by how much?',
        adapter: 'gdacs-drought',
        timeVarying: true,
      }),
      geometry({
        id: 'cropland',
        name: 'Affected cropland',
        kind: 'SUSCEPTIBILITY',
        answers: 'What is actually at stake here?',
        adapter: 'landcover',
      }),
      geometry({
        id: 'basin-stress',
        name: 'River-basin water stress',
        kind: 'SUSCEPTIBILITY',
        answers:
          'Was this basin already withdrawing more than it renews before the rain failed?',
        adapter: 'aqueduct',
      }),
    ]),
    /* A drought has no hour-scale onset. Its phases are seasons. */
    phases: Object.freeze(['T-72h', 'T-0', 'T+7d', 'T+30d']),
    secondaryHazards: Object.freeze([
      'Crop failure and later food-price shocks',
      'Livestock loss and pastoral displacement',
      'Hydropower shortfall',
      'Wildfire conditions',
    ]),
    adapters: Object.freeze([
      adapter({
        id: 'gdacs-drought',
        source: 'GDACS drought feed',
        provides: 'drought alerts with modelled severity',
        status: 'LIVE',
      }),
      adapter({
        id: 'aqueduct',
        source: 'WRI Aqueduct 4.0 via the Esri Living Atlas',
        provides: 'baseline water stress by river basin',
        status: 'LIVE',
        endpoint: 'aqueduct_water_risk/FeatureServer/1/query',
      }),
      adapter({
        id: 'landcover',
        source: 'World Bank agricultural-land indicators',
        provides: 'agricultural land share, as national context',
        status: 'LIVE',
      }),
    ]),
  }),

  extremeHeat: Object.freeze({
    id: 'extremeHeat',
    name: 'Extreme heat',
    icon: '☀',
    gdacsCode: null,
    question:
      'How hot, for how many consecutive days, and who could not escape it?',
    primaryScale: 'HEAT_INDEX',
    geometries: Object.freeze([
      geometry({
        id: 'heat-field',
        name: 'Heat index',
        kind: 'CONTOUR_BANDS',
        scale: 'HEAT_INDEX',
        answers: 'Where did apparent temperature reach dangerous levels?',
        adapter: 'weather',
        timeVarying: true,
      }),
      geometry({
        id: 'urban-heat',
        name: 'Urban heat island',
        kind: 'SUSCEPTIBILITY',
        answers:
          'Why is the death toll concentrated in a few neighbourhoods? Built surface and missing shade, not the regional temperature.',
        adapter: 'landcover',
      }),
    ]),
    phases: Object.freeze(['T-72h', 'T-24h', 'T-0', 'T+24h', 'T+7d']),
    secondaryHazards: Object.freeze([
      'Excess mortality concentrated in the elderly and outdoor workers',
      'Grid failure from cooling demand',
      'Crop and livestock loss',
    ]),
    adapters: Object.freeze([
      adapter({
        id: 'weather',
        source: 'Open-Meteo historical and forecast API',
        provides: 'temperature, humidity and derived heat index',
        status: 'PLANNED',
        note: 'Keyless and reachable. Integration point: src/disaster/sources/weather.js.',
      }),
      adapter({
        id: 'landcover',
        source: 'Copernicus Global Land Cover',
        provides: 'built-surface fraction',
        status: 'PLANNED',
        note: 'Raster tiles rather than vectors. Integration point: src/disaster/sources/landcover.js.',
      }),
    ]),
  }),

  tornado: Object.freeze({
    id: 'tornado',
    name: 'Tornado',
    icon: '⌖',
    gdacsCode: null,
    question:
      'Where did it touch down, how far did it track, and how strong was it?',
    primaryScale: 'EF',
    geometries: Object.freeze([
      geometry({
        id: 'damage-path',
        name: 'Damage path',
        kind: 'PATH',
        scale: 'EF',
        answers: 'What was in the corridor, and how wide was it?',
        adapter: 'nws',
      }),
      geometry({
        id: 'damage-points',
        name: 'Damage survey points',
        kind: 'POINT_FIELD',
        scale: 'EF',
        answers: 'How was the rating actually determined?',
        adapter: 'nws',
      }),
    ]),
    phases: Object.freeze(['T-1h', 'T-0', 'T+1h', 'T+6h', 'T+24h', 'T+7d']),
    secondaryHazards: Object.freeze([
      'Debris blocking the only access road',
      'Loss of local medical capacity at the moment it is needed',
    ]),
    adapters: Object.freeze([
      adapter({
        id: 'nws',
        source: 'NOAA / National Weather Service damage-assessment toolkit',
        provides: 'surveyed damage paths and EF ratings',
        status: 'PLANNED',
        note: 'US coverage only. Integration point: src/disaster/sources/nws.js.',
      }),
    ]),
  }),

  avalanche: Object.freeze({
    id: 'avalanche',
    name: 'Avalanche',
    icon: '◺',
    gdacsCode: null,
    question: 'Which slope released, and what was below it?',
    primaryScale: 'RUNOUT',
    geometries: Object.freeze([
      geometry({
        id: 'release-zone',
        name: 'Release zone',
        kind: 'PERIMETER',
        answers: 'Where did the slab fail?',
        adapter: 'national-agency',
      }),
      geometry({
        id: 'runout',
        name: 'Runout',
        kind: 'PATH',
        answers:
          'How far down the slope did it travel, and across which road or building? Runout distance follows the terrain gradient, so a plan view cannot show it.',
        adapter: 'terrain',
        requiresTerrain: true,
      }),
    ]),
    phases: Object.freeze(['T-24h', 'T-0', 'T+1h', 'T+6h', 'T+24h']),
    secondaryHazards: Object.freeze([
      'Pass closure isolating valleys for weeks',
      'Repeat release onto rescue teams',
    ]),
    adapters: Object.freeze([
      adapter({
        id: 'national-agency',
        source: 'National avalanche warning services',
        provides: 'danger level and observed release events',
        status: 'PLANNED',
        note: 'EAWS publishes a common danger scale but each service serves its own bulletins. Integration point: src/disaster/sources/avalanche.js.',
      }),
      adapter({
        id: 'terrain',
        source: 'Cesium World Terrain',
        provides: 'slope and runout geometry',
        status: 'LIVE',
      }),
    ]),
  }),

  severeStorm: Object.freeze({
    id: 'severeStorm',
    name: 'Severe storm',
    icon: '⚡',
    gdacsCode: null,
    question:
      'What did the wind, hail and rain reach, and what stopped working?',
    primaryScale: 'SAFFIR_SIMPSON',
    geometries: Object.freeze([
      geometry({
        id: 'storm-cells',
        name: 'Storm cells',
        kind: 'POINT_FIELD',
        answers: 'Where was the severe weather?',
        adapter: 'weather',
        timeVarying: true,
      }),
      geometry({
        id: 'wind-swath',
        name: 'Wind swath',
        kind: 'CONTOUR_BANDS',
        answers: 'Which corridor took the damaging gusts?',
        adapter: 'weather',
        timeVarying: true,
      }),
    ]),
    phases: Object.freeze(['T-24h', 'T-1h', 'T-0', 'T+6h', 'T+24h', 'T+7d']),
    secondaryHazards: Object.freeze([
      'Distribution-network power loss',
      'Flash flooding in urban drainage',
      'Transport and aviation disruption',
    ]),
    adapters: Object.freeze([
      adapter({
        id: 'weather',
        source: 'Open-Meteo / national meteorological services',
        provides: 'observed and forecast wind, rain and hail',
        status: 'PLANNED',
        note: 'Open-Meteo is keyless and reachable; severe-weather warnings are per country. Integration point: src/disaster/sources/weather.js.',
      }),
    ]),
  }),
});

/** Every hazard type, in registry order. */
export const HAZARD_LIST = Object.freeze(Object.values(HAZARD_TYPES));

/** Look up a hazard type by id. */
export function hazard(id) {
  return HAZARD_TYPES[id] ?? null;
}

/**
 * Map a GDACS event-type code onto a hazard type.
 *
 * GDACS covers six of the twelve. The rest arrive from their own sources or
 * from a curated event pack, and returning null is the honest answer for a
 * code this registry does not model rather than guessing at the nearest match.
 */
export function hazardForGdacsCode(code) {
  if (!code) return null;
  return (
    HAZARD_LIST.find(
      (entry) => entry.gdacsCode === String(code).toUpperCase(),
    ) ?? null
  );
}

/** The intensity scale a hazard measures itself on. */
export function scaleFor(hazardId) {
  const entry = hazard(hazardId);
  if (!entry) return null;
  return INTENSITY_SCALES[entry.primaryScale] ?? null;
}

/**
 * Classify a value on a scale.
 *
 * Returns the first band whose threshold the value has reached, or null for a
 * value that is not a number — an unmeasured intensity must not fall into the
 * lowest band, because "not measured" and "low" are different findings.
 */
export function classifyIntensity(scaleId, value) {
  const scale = INTENSITY_SCALES[scaleId];
  if (!scale || !Number.isFinite(value)) return null;
  /*
   * SPI runs negative and worsens downwards, so its bands are ordered
   * descending and the comparison has to flip. Detected from the scale's own
   * band ordering rather than special-cased by id, so a future descending
   * scale works without another branch here.
   */
  const descending =
    scale.bands.length > 1 && scale.bands[1].value < scale.bands[0].value;
  const match = descending
    ? [...scale.bands].reverse().find((band) => value <= band.value)
    : scale.bands.find((band) => value <= band.value);
  const band = match ?? scale.bands[scale.bands.length - 1];
  return Object.freeze({ ...band, scale: scale.id, scaleName: scale.name });
}

/** The ordered timeline phases a hazard type actually has. */
export function phasesFor(hazardId) {
  const entry = hazard(hazardId);
  if (!entry) return [];
  return entry.phases
    .map((key) => {
      const phase = TIMELINE_PHASES[key];
      return phase ? Object.freeze({ key, ...phase }) : null;
    })
    .filter(Boolean);
}

/**
 * The geometry layers for a hazard, optionally filtered to what is drawable.
 *
 * `onlyWired` drops layers whose adapter is PLANNED, which is what a renderer
 * wants: the declaration stays in the registry and reaches the Sources panel,
 * but nothing tries to draw a layer with no data behind it.
 */
export function geometriesFor(hazardId, { onlyWired = false } = {}) {
  const entry = hazard(hazardId);
  if (!entry) return [];
  if (!onlyWired) return [...entry.geometries];
  const wired = new Set(
    entry.adapters
      .filter((item) => item.status !== ADAPTER_STATUS.PLANNED)
      .map((item) => item.id),
  );
  return entry.geometries.filter(
    (geo) => !geo.adapter || wired.has(geo.adapter),
  );
}

/**
 * Every adapter across every hazard type, deduplicated by id+source.
 *
 * This is what the SOURCES / DATA PROVENANCE section renders (§20), including
 * the PLANNED ones — a named integration point is information, and hiding it
 * is how a reader concludes the platform forgot rather than that the data is
 * not connected yet.
 */
export function allAdapters() {
  const seen = new Map();
  for (const entry of HAZARD_LIST) {
    for (const item of entry.adapters) {
      const key = `${item.id}::${item.source}`;
      if (seen.has(key)) {
        seen.get(key).hazards.push(entry.id);
        continue;
      }
      seen.set(key, { ...item, hazards: [entry.id] });
    }
  }
  return [...seen.values()].map((item) =>
    Object.freeze({ ...item, hazards: Object.freeze(item.hazards) }),
  );
}
