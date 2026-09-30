/**
 * Every figure the briefing shows or speaks, as a named path into an
 * artefact.
 *
 * NO NUMBER ORIGINATES IN THE FRONTEND. A scene never contains "13.84 M"; it
 * contains `{ fact: 'exposure.mmi6' }`, and this module reads the value from
 * the Stage 3–5 artefact at load time, together with where it came from and
 * what class of claim it is. The script generator reads the same paths from
 * the same files, so the script and the product cannot disagree. A path that
 * does not resolve throws, naming the fact — a wrong path is a wiring bug,
 * not a zero.
 */

const f = (artefact, path, meta) =>
  Object.freeze({ artefact, path: Object.freeze(path), ...meta });

const USGS = { source: 'USGS', cls: 'OBSERVED' };
const SHAKE = { source: 'USGS SHAKEMAP × WORLDPOP', cls: 'DERIVED' };
const UNOSAT = { source: 'UNOSAT', cls: 'OBSERVED' };

export const FACTS = Object.freeze({
  'quake.magnitude': f('seismic', ['results', 'mainShock', 'magnitude'], {
    ...USGS,
    record: 'seismic-magnitude-distribution',
  }),
  'quake.magType': f('seismic', ['results', 'mainShock', 'magType'], USGS),
  'quake.depthKm': f('seismic', ['results', 'mainShock', 'depthKm'], {
    ...USGS,
    record: 'seismic-depth-distribution',
  }),
  'quake.time': f('seismic', ['results', 'mainShock', 'time'], USGS),
  'quake.place': f('seismic', ['results', 'mainShock', 'place'], USGS),
  'quake.lon': f('seismic', ['results', 'mainShock', 'longitude'], USGS),
  'quake.lat': f('seismic', ['results', 'mainShock', 'latitude'], USGS),
  'quake.id': f('seismic', ['results', 'mainShock', 'id'], USGS),

  'seq.total': f('seismic', ['results', 'counts', 'total'], {
    ...USGS,
    record: 'seismic-temporal-series',
  }),
  'seq.firstDay': f('seismic', ['results', 'temporal', 'firstDayCount'], {
    ...USGS,
    record: 'seismic-temporal-series',
  }),
  'seq.firstWeek': f('seismic', ['results', 'temporal', 'firstWeekCount'], {
    ...USGS,
    record: 'seismic-temporal-series',
  }),
  'seq.hourly': f('seismic', ['results', 'temporal', 'firstThreeDaysHourly'], {
    ...USGS,
    record: 'seismic-temporal-series',
  }),
  'seq.daily': f('seismic', ['results', 'omori', 'whole', 'points'], {
    ...USGS,
    record: 'seismic-temporal-series',
  }),
  'seq.largest': f('seismic', ['results', 'largestEvents'], USGS),
  'seq.extentKm': f('seismic', ['results', 'spatial', 'extentEastWestKm'], {
    ...USGS,
    record: 'seismic-spatial-distribution',
  }),
  'seq.bands': f('seismic', ['results', 'magnitude', 'bands'], {
    ...USGS,
    record: 'seismic-magnitude-distribution',
  }),
  'seq.secondary': f('seismic', ['results', 'omori', 'secondary'], USGS),
  'omori.whole': f('seismic', ['results', 'omori', 'whole'], {
    source: 'USGS · OMORI FIT',
    cls: 'MODEL_FIT',
    record: 'seismic-omori-decay',
  }),
  'omori.before': f('seismic', ['results', 'omori', 'beforeSecondary'], {
    source: 'USGS · OMORI FIT',
    cls: 'MODEL_FIT',
    record: 'seismic-omori-decay',
  }),
  'omori.after': f('seismic', ['results', 'omori', 'afterSecondary'], {
    source: 'USGS · OMORI FIT',
    cls: 'MODEL_FIT',
    record: 'seismic-omori-decay',
  }),

  'exposure.bands': f('exposure', ['results', 'intensity', 'bands'], {
    ...SHAKE,
    record: 'exposure-population-by-intensity',
  }),
  'exposure.mmi6': f(
    'exposure',
    ['results', 'exposureTotalsByThreshold', '6', 'totalExposed'],
    { ...SHAKE, record: 'exposure-population-by-intensity' },
  ),
  'exposure.mmi7': f(
    'exposure',
    ['results', 'exposureTotalsByThreshold', '7', 'totalExposed'],
    { ...SHAKE, record: 'exposure-population-by-intensity' },
  ),
  'exposure.mmi8': f(
    'exposure',
    ['results', 'exposureTotalsByThreshold', '8', 'totalExposed'],
    { ...SHAKE, record: 'exposure-population-by-intensity' },
  ),
  'exposure.districts': f(
    'exposure',
    ['results', 'exposureAtHeadlineThreshold', 'districts'],
    { ...SHAKE, record: 'exposure-by-district' },
  ),
  'exposure.quadrants': f(
    'exposure',
    ['results', 'populationIntensityQuadrants'],
    { ...SHAKE, record: 'exposure-population-intensity-quadrants' },
  ),

  'damage.total': f('damage', ['results', 'unosat', 'reproduction', 'total'], {
    ...UNOSAT,
    record: 'damage-unosat-counts',
  }),
  'damage.counts': f(
    'damage',
    ['results', 'unosat', 'reproduction', 'observed'],
    { ...UNOSAT, record: 'damage-unosat-counts' },
  ),
  'damage.shares': f('damage', ['results', 'unosat', 'composition', 'shares'], {
    ...UNOSAT,
    cls: 'STATISTIC',
    record: 'damage-unosat-counts',
  }),
  'damage.bySensorDate': f('damage', ['results', 'unosat', 'bySensorDate'], {
    ...UNOSAT,
    record: 'damage-unosat-counts',
  }),
  'damage.byArea': f('damage', ['results', 'unosat', 'byAnalysisArea'], {
    ...UNOSAT,
    record: 'damage-unosat-counts',
  }),
  'damage.byDistrict': f('damage', ['results', 'unosat', 'byDistrict'], {
    ...UNOSAT,
    record: 'damage-unosat-counts',
  }),
  'damage.byIntensity': f('damage', ['results', 'damageByIntensity', 'bands'], {
    source: 'UNOSAT × USGS SHAKEMAP',
    cls: 'STATISTIC',
    record: 'damage-by-intensity',
  }),
  'damage.independence': f(
    'damage',
    ['results', 'damageByIntensity', 'independenceTest'],
    {
      source: 'UNOSAT × USGS SHAKEMAP',
      cls: 'STATISTIC',
      record: 'damage-by-intensity',
    },
  ),
  'damage.withinArea': f(
    'damage',
    ['results', 'damageByIntensity', 'withinAnalysisArea'],
    {
      source: 'UNOSAT × USGS SHAKEMAP',
      cls: 'STATISTIC',
      record: 'damage-by-intensity',
    },
  ),
  'damage.withinAreaVerdict': f(
    'damage',
    ['results', 'damageByIntensity', 'withinAreaVerdict'],
    {
      source: 'UNOSAT × USGS SHAKEMAP',
      cls: 'STATISTIC',
      record: 'damage-by-intensity',
    },
  ),
  'damage.selectionWarning': f(
    'damage',
    ['results', 'damageByIntensity', 'selectionWarning'],
    {
      source: 'UNOSAT × USGS SHAKEMAP',
      cls: 'STATISTIC',
      record: 'damage-by-intensity',
    },
  ),
  'damage.grid1km': f(
    'damage',
    ['results', 'spatialDistribution', 'grids', 0],
    { ...UNOSAT, cls: 'STATISTIC', record: 'damage-spatial-concentration' },
  ),
  'damage.destroyed': f(
    'damage',
    ['results', 'unosat', 'reproduction', 'observed', 'Destroyed'],
    { ...UNOSAT, record: 'damage-unosat-counts' },
  ),
  'damage.severe': f(
    'damage',
    ['results', 'unosat', 'reproduction', 'observed', 'Severe Damage'],
    { ...UNOSAT, record: 'damage-unosat-counts' },
  ),
  'damage.moderate': f(
    'damage',
    ['results', 'unosat', 'reproduction', 'observed', 'Moderate Damage'],
    { ...UNOSAT, record: 'damage-unosat-counts' },
  ),
  'damage.possible': f(
    'damage',
    ['results', 'unosat', 'reproduction', 'observed', 'Possible Damage'],
    { ...UNOSAT, record: 'damage-unosat-counts' },
  ),
  'damage.shareDestroyed': f(
    'damage',
    ['results', 'unosat', 'composition', 'shares', 'Destroyed'],
    { ...UNOSAT, cls: 'STATISTIC', record: 'damage-unosat-counts' },
  ),
  'damage.shareSevere': f(
    'damage',
    ['results', 'unosat', 'composition', 'shares', 'Severe Damage'],
    { ...UNOSAT, cls: 'STATISTIC', record: 'damage-unosat-counts' },
  ),
  'damage.shareModerate': f(
    'damage',
    ['results', 'unosat', 'composition', 'shares', 'Moderate Damage'],
    { ...UNOSAT, cls: 'STATISTIC', record: 'damage-unosat-counts' },
  ),
  'damage.sharePossible': f(
    'damage',
    ['results', 'unosat', 'composition', 'shares', 'Possible Damage'],
    { ...UNOSAT, cls: 'STATISTIC', record: 'damage-unosat-counts' },
  ),
  'damage.areaManbu': f(
    'damage',
    ['results', 'unosat', 'byAnalysisArea', 'Manbu Area'],
    { ...UNOSAT, record: 'damage-unosat-counts' },
  ),
  'damage.manbu': f(
    'damage',
    [
      'results',
      'damageByIntensity',
      'withinAnalysisArea',
      { find: { area: 'Manbu Area' } },
    ],
    {
      source: 'UNOSAT × USGS SHAKEMAP',
      cls: 'STATISTIC',
      record: 'damage-by-intensity',
    },
  ),
  'damage.sundarBazar': f(
    'damage',
    [
      'results',
      'damageByIntensity',
      'withinAnalysisArea',
      { find: { area: 'Sundar Bazar' } },
    ],
    {
      source: 'UNOSAT × USGS SHAKEMAP',
      cls: 'STATISTIC',
      record: 'damage-by-intensity',
    },
  ),
  'exposure.kathmandu': f(
    'exposure',
    [
      'results',
      'exposureAtHeadlineThreshold',
      'districts',
      { find: { districtKey: 'kathmandu' } },
    ],
    { ...SHAKE, record: 'exposure-by-district' },
  ),
  'geo.districtCount': f('geometry', ['counts', 'districts'], {
    source: 'OCHA COD-AB',
    cls: 'OFFICIAL',
  }),

  /* Stage 9 health access: distances along roads mapped on 2015-04-24, hospitals from the 2010 government list. */
  /* Scenes 11, 16, 20: who met the strongest shaking, where damage piled up, and where nobody recorded it. */
  'exposure.highHigh': f(
    'exposure',
    [
      'results',
      'populationIntensityQuadrants',
      'quadrants',
      { find: { id: 'HIGH_INTENSITY_HIGH_DENSITY' } },
    ],
    { ...SHAKE, record: 'exposure-population-intensity-quadrants' },
  ),
  'exposure.quadrantParams': f(
    'exposure',
    ['results', 'populationIntensityQuadrants', 'parameters'],
    {
      ...SHAKE,
      record: 'exposure-population-intensity-quadrants',
    },
  ),
  'damage.gridHalf': f(
    'damage',
    [
      'results',
      'spatialDistribution',
      'grids',
      0,
      'concentration',
      'curve',
      'points',
      { find: { share: 0.5 } },
    ],
    { ...UNOSAT, cls: 'STATISTIC', record: 'damage-spatial-concentration' },
  ),
  'damage.gridEighty': f(
    'damage',
    [
      'results',
      'spatialDistribution',
      'grids',
      0,
      'concentration',
      'curve',
      'points',
      { find: { share: 0.8 } },
    ],
    { ...UNOSAT, cls: 'STATISTIC', record: 'damage-spatial-concentration' },
  ),
  'coverage.unrecorded': f(
    'damagePopulation',
    [
      'results',
      'quadrants',
      'byPresence',
      'quadrants',
      'HIGH_POPULATION_LOW_DAMAGE',
    ],
    {
      source: 'WORLDPOP × UNOSAT',
      cls: 'DATA GAP',
      record: 'damage-population-quadrants',
    },
  ),
  'coverage.recorded': f(
    'damagePopulation',
    [
      'results',
      'quadrants',
      'byPresence',
      'quadrants',
      'HIGH_POPULATION_HIGH_DAMAGE',
    ],
    {
      source: 'WORLDPOP × UNOSAT',
      cls: 'DERIVED',
      record: 'damage-population-quadrants',
    },
  ),
  'coverage.universe': f(
    'damagePopulation',
    ['results', 'concentration', 'universe'],
    {
      source: 'WORLDPOP × UNOSAT',
      cls: 'DERIVED',
      record: 'damage-population-concentration',
    },
  ),

  /* Scenes 25–26: the Stage 5 major-road network result, beside the fuller 2015 network. */
  'infra.baseline': f('infrastructure', ['results', 'network', 'baseline'], {
    source: 'OSM 2015 MAJOR ROADS',
    cls: 'OBSERVED',
    record: 'infrastructure-network-disruption',
  }),
  'infra.damaged': f('infrastructure', ['results', 'network', 'damaged'], {
    source: 'OSM 2015 × NGA',
    cls: 'SCENARIO',
    record: 'infrastructure-network-disruption',
  }),
  'infra.routes': f('infrastructure', ['results', 'network', 'routes'], {
    source: 'OSM 2015 × NGA',
    cls: 'SCENARIO',
    record: 'infrastructure-network-disruption',
  }),
  'infra.destinations': f(
    'infrastructure',
    ['results', 'network', 'destinations'],
    {
      source: 'OCHA COD-AB',
      cls: 'DERIVED',
      record: 'infrastructure-network-disruption',
    },
  ),
  'infra.detour': f(
    'infrastructure',
    ['results', 'network', 'routes', 'routes', { find: { outcome: 'DETOUR' } }],
    {
      source: 'OSM 2015 × NGA',
      cls: 'SCENARIO',
      record: 'infrastructure-network-disruption',
    },
  ),
  'infra.gaps': f('infrastructure', ['results', 'dataGaps'], {
    source: 'STAGE 5',
    cls: 'DATA GAP',
  }),
  'access.gaps': f('access', ['results', 'dataGaps'], {
    source: 'STAGE 9',
    cls: 'DATA GAP',
  }),

  /* FULL-run scenes: the sequence's distributions, the damage record's shape, a second product, the infrastructure layers. */
  'seq.depthBands': f('seismic', ['results', 'depth', 'bands'], {
    ...USGS,
    record: 'seismic-depth-distribution',
  }),
  'seq.gr': f('seismic', ['results', 'gutenbergRichter'], {
    source: 'USGS · GUTENBERG–RICHTER FIT',
    cls: 'MODEL_FIT',
    record: 'seismic-magnitude-distribution',
  }),
  'seq.completeness': f('seismic', ['results', 'completeness'], {
    source: 'USGS',
    cls: 'STATISTIC',
    record: 'seismic-magnitude-distribution',
  }),
  'exposure.total': f(
    'exposure',
    ['results', 'intensity', 'totalPopulationConsidered'],
    {
      source: 'WORLDPOP 2015',
      cls: 'DERIVED',
      record: 'exposure-population-by-intensity',
    },
  ),
  'damage.byDate': f('damage', ['results', 'unosat', 'bySensorDate'], {
    ...UNOSAT,
    record: 'damage-unosat-counts',
  }),
  'damage.lags': f('damage', ['results', 'observationTimeline', 'lags'], {
    source: 'UNOSAT × NGA × COPERNICUS',
    cls: 'STATISTIC',
    record: 'damage-observation-timeline',
  }),
  'damage.event': f('damage', ['results', 'observationTimeline', 'event'], {
    ...USGS,
  }),
  'copernicus.totals': f('damage', ['results', 'copernicus', 'totals'], {
    source: 'COPERNICUS EMSR125',
    cls: 'OBSERVED',
    record: 'damage-copernicus-grading',
  }),
  'copernicus.grades': f('damage', ['results', 'copernicus', 'grades'], {
    source: 'COPERNICUS EMSR125',
    cls: 'OBSERVED',
    record: 'damage-copernicus-grading',
  }),
  'copernicus.kathmandu': f(
    'damage',
    ['results', 'copernicus', 'grades', { find: { aoi: 'KATHMANDU' } }],
    {
      source: 'COPERNICUS EMSR125',
      cls: 'OBSERVED',
      record: 'damage-copernicus-grading',
    },
  ),
  'copernicus.bharatpur': f(
    'damage',
    ['results', 'copernicus', 'grades', { find: { aoi: 'BHARATPUR' } }],
    {
      source: 'COPERNICUS EMSR125',
      cls: 'OBSERVED',
      record: 'damage-copernicus-grading',
    },
  ),
  'infra.geometry': f(
    'infrastructure',
    ['results', 'geometry', 'blockedRoads'],
    { source: 'NGA', cls: 'OBSERVED', record: 'infrastructure-geometry-check' },
  ),
  'infra.association': f(
    'infrastructure',
    ['results', 'landslideRoadAssociation', 'headline'],
    {
      source: 'NGA',
      cls: 'DERIVED',
      record: 'infrastructure-road-landslide-association',
    },
  ),
  'infra.landslides': f('infrastructure', ['results', 'landslides'], {
    source: 'NGA',
    cls: 'OBSERVED',
    record: 'infrastructure-geometry-check',
  }),
  'infra.bridges': f('infrastructure', ['results', 'bridges'], {
    source: 'NGA',
    cls: 'OBSERVED',
    record: 'infrastructure-network-disruption',
  }),
  'dp.gorkha': f(
    'damagePopulation',
    ['results', 'byDistrict', { find: { district: 'Gorkha' } }],
    {
      source: 'UNOSAT × WORLDPOP',
      cls: 'DERIVED',
      record: 'damage-population-quadrants',
    },
  ),
  'access.airfields': f('access', ['results', 'airfields'], {
    source: 'OPENSTREETMAP · 24 APR 2015',
    cls: 'OBSERVED',
    record: 'access-hospital-distance',
  }),

  'access.display': f('access', ['results', 'display'], {
    source: 'OSM 2015 × DOHS 2010 × NGA',
    cls: 'SCENARIO',
    record: 'access-hospital-distance',
  }),
  'access.params': f('access', ['parameters'], {
    source: 'THIS ANALYSIS',
    cls: 'DERIVED',
    record: 'access-hospital-distance',
  }),
  'access.network': f('access', ['results', 'network'], {
    source: 'OSM 2015-04-24',
    cls: 'OBSERVED',
    record: 'access-hospital-distance',
  }),
  'access.study': f('access', ['results', 'studyPopulation'], {
    source: 'WORLDPOP 2015',
    cls: 'DERIVED',
    record: 'access-hospital-distance',
  }),
  'access.hospital': f('access', ['results', 'headline', 'codHospital'], {
    source: 'OSM 2015 × DOHS 2010 × NGA',
    cls: 'SCENARIO',
    record: 'access-hospital-distance',
  }),
  'access.matching': f('access', ['results', 'blockageMatching'], {
    source: 'NGA × OSM 2015',
    cls: 'DERIVED',
    record: 'access-blockage-matching-full-network',
  }),
  'access.lists': f('access', ['results', 'listAgreement'], {
    source: 'DOHS 2010 × OSM 2015',
    cls: 'DERIVED',
    record: 'access-facility-list-agreement',
  }),
  'access.codNearOsm500': f(
    'access',
    [
      'results',
      'listAgreement',
      'codNearestOsmHospital',
      { find: { withinMetres: 500 } },
    ],
    {
      source: 'DOHS 2010 × OSM 2015',
      cls: 'DERIVED',
      record: 'access-facility-list-agreement',
    },
  ),
  'access.detour': f('access', ['results', 'exampleRoutes', 'detour'], {
    source: 'OSM 2015 × DOHS 2010 × NGA',
    cls: 'SCENARIO',
    record: 'access-example-route',
  }),
  'access.cut': f('access', ['results', 'exampleRoutes', 'cut'], {
    source: 'OSM 2015 × DOHS 2010 × NGA',
    cls: 'SCENARIO',
    record: 'access-example-route',
  }),
  'access.detours': f(
    'access',
    ['results', 'exampleRoutes', 'detourDistribution'],
    {
      source: 'OSM 2015 × DOHS 2010 × NGA',
      cls: 'SCENARIO',
      record: 'access-hospital-distance',
    },
  ),
  'access.areaRoutes': f('access', ['results', 'areaRoutes'], {
    source: 'UNOSAT × OSM 2015 × NGA',
    cls: 'SCENARIO',
    record: 'access-example-route',
  }),
  'access.areaSummary': f('access', ['results', 'areaRouteSummary'], {
    source: 'UNOSAT × OSM 2015 × NGA',
    cls: 'SCENARIO',
    record: 'access-example-route',
  }),
  'access.manbu': f(
    'access',
    ['results', 'areaRoutes', { find: { area: 'Manbu Area' } }],
    {
      source: 'UNOSAT × OSM 2015',
      cls: 'DERIVED',
      record: 'access-example-route',
    },
  ),
  'access.gorkha': f(
    'access',
    ['results', 'byDistrict', { find: { district: 'Gorkha' } }],
    {
      source: 'OSM 2015 × WORLDPOP',
      cls: 'DERIVED',
      record: 'access-hospital-distance',
    },
  ),
  'access.mostDisrupted': f('access', ['results', 'mostDisrupted'], {
    source: 'OSM 2015 × DOHS 2010 × NGA',
    cls: 'SCENARIO',
    record: 'access-hospital-distance',
  }),
  'access.mostDisruptedNames': f('access', ['results', 'mostDisruptedNames'], {
    source: 'OSM 2015 × DOHS 2010 × NGA',
    cls: 'SCENARIO',
    record: 'access-hospital-distance',
  }),
  'access.pressure': f('access', ['results', 'pressure'], {
    source: 'THIS ANALYSIS',
    cls: 'DERIVED',
    record: 'access-pressure-pareto',
  }),
  'access.bridges': f('access', ['results', 'bridgeWhatIf'], {
    source: 'OSM 2015 × DOHS 2010 × NGA',
    cls: 'SCENARIO',
    record: 'access-hospital-distance',
  }),
  'access.pareto': f('access', ['results', 'pressure', 'paretoFront'], {
    source: 'THIS ANALYSIS',
    cls: 'DERIVED',
    record: 'access-pressure-pareto',
  }),
  'access.stableTop': f(
    'access',
    ['results', 'pressure', 'weighting', 'stableTop'],
    {
      source: 'THIS ANALYSIS',
      cls: 'DERIVED',
      record: 'access-pressure-pareto',
    },
  ),
  'geo.epicentreDistrict': f('geometry', ['places', 'epicentre', 'district'], {
    source: 'USGS × COD-AB',
    cls: 'DERIVED',
  }),
  /* The summary's plain answers, selected by the geometry pipeline from published figures. */
  'summary.shaking': f('geometry', ['summary', 'strongestShaking'], {
    source: 'USGS SHAKEMAP × COD-AB',
    cls: 'DERIVED',
    record: 'exposure-by-district',
  }),
  'summary.damageAreas': f('geometry', ['summary', 'damageAreas'], {
    ...UNOSAT,
    record: 'damage-unosat-counts',
  }),
  'summary.nga': f('geometry', ['summary', 'ngaObservations'], {
    source: 'NGA',
    cls: 'OBSERVED',
    record: 'infrastructure-geometry-check',
  }),
});

/** A path step: a key, an index, or `{ find: {field: value} }` into an array. */
function step(value, key) {
  if (key && typeof key === 'object' && key.find) {
    if (!Array.isArray(value)) return undefined;
    return value.find((item) =>
      Object.entries(key.find).every(([k, v]) => item?.[k] === v),
    );
  }
  return value?.[key];
}

const describe = (path) =>
  path
    .map((key) =>
      key && typeof key === 'object'
        ? `[${Object.entries(key.find)
            .map(([k, v]) => `${k}=${v}`)
            .join(',')}]`
        : key,
    )
    .join('.');

/** Read one fact from the raw artefacts, with its provenance attached. */
export function resolveFact(raw, id) {
  const def = FACTS[id];
  if (!def) throw new Error(`Unknown fact "${id}".`);
  const source = raw?.[def.artefact];
  if (!source)
    throw new Error(
      `Fact "${id}" needs the ${def.artefact} artefact, which is not loaded.`,
    );
  let value = source;
  for (const key of def.path) {
    value = step(value, key);
    if (value === undefined) {
      throw new Error(
        `Fact "${id}": ${def.artefact} has no ${describe(def.path)}.`,
      );
    }
  }
  return Object.freeze({ id, value, ...def, pathText: describe(def.path) });
}

/** A resolver bound to one set of loaded artefacts. */
export function createFactBook(raw) {
  const cache = new Map();
  const get = (id) => {
    if (!cache.has(id)) cache.set(id, resolveFact(raw, id));
    return cache.get(id);
  };
  return Object.freeze({
    get,
    value: (id) => get(id).value,
    has: (id) => Boolean(FACTS[id] && raw?.[FACTS[id].artefact]),
  });
}

/*
 * ------------------------------------------------------------------------
 * Formatting. Presentation of a value, never a new value: a format may round
 * and group, and may not add, divide or combine.
 * ------------------------------------------------------------------------
 */

const grouped = (n, digits = 0) =>
  Number(n).toLocaleString('en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export const FORMATS = Object.freeze({
  /** ['Gorkha', 'Dhading'] → 'GORKHA · DHADING' */
  list: (v) => v.map((item) => String(item).toUpperCase()).join(' · '),
  /** ['Gorkha', 'Dhading', 'Rasuwa'] → 'Gorkha, Dhading and Rasuwa' — for the voice. */
  names: (v) =>
    v.length > 1
      ? `${v.slice(0, -1).join(', ')} and ${v[v.length - 1]}`
      : String(v[0] ?? ''),
  /** 0.75 → "75 %" — a share written as a percentage. */
  shareToPct: (v) => `${grouped(v * 100, 0)} %`,
  /** 2000 (metres) → "2 KM" — a unit, not a new value. */
  kmFromMetres: (v) => `${grouped(v / 1000, v % 1000 === 0 ? 0 : 1)} KM`,
  /** 2000 (metres) → "2 kilometres" — for the voice. */
  kmWordsFromMetres: (v) =>
    `${grouped(v / 1000, v % 1000 === 0 ? 0 : 1)} kilometres`,
  int: (v) => grouped(Math.round(v)),
  dec1: (v) => grouped(v, 1),
  dec2: (v) => grouped(v, 2),
  dec3: (v) => grouped(v, 3),
  pct1: (v) => `${grouped(v, 1)} %`,
  /** 13,835,518 → "13.84 M" */
  mega2: (v) => `${grouped(v / 1e6, 2)} M`,
  /** 13,835,518 → "13.8 million" — for the voice. */
  millionWords: (v) => `${grouped(v / 1e6, 1)} million`,
  /** 235,116 → "235 K" */
  kilo: (v) => `${grouped(Math.round(v / 1000))} K`,
  /** 235,116 → "235 thousand" */
  thousandWords: (v) => `${grouped(Math.round(v / 1000))} thousand`,
  /** 2015-04-25T06:11:25.950Z → "06:11:25 UTC" */
  utcTime: (v) => `${String(v).slice(11, 19)} UTC`,
  /** → "25 APR 2015" */
  dateShort: (v) => {
    const d = new Date(v);
    return `${String(d.getUTCDate()).padStart(2, '0')} ${['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  },
  /** 2.7599e-52 → "2.8 × 10⁻⁵²" */
  sci: (v) => {
    const [mantissa, exponent] = Number(v).toExponential(1).split('e');
    const sup = String(Number(exponent)).replace(
      /[-0-9]/g,
      (c) => '⁻⁰¹²³⁴⁵⁶⁷⁸⁹'['-0123456789'.indexOf(c)],
    );
    return `${mantissa} × 10${sup}`;
  },
  /** → "25 April 2015" */
  dateLong: (v) => {
    const d = new Date(v);
    return `${d.getUTCDate()} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  },
  /** → "06:11 UTC" */
  utcHM: (v) => `${String(v).slice(11, 16)} UTC`,
  upper: (v) => String(v).toUpperCase(),
  raw: (v) => String(v),
});

export function formatValue(value, format = 'raw') {
  const fn = FORMATS[format];
  if (!fn) throw new Error(`Unknown format "${format}".`);
  return fn(value);
}

/**
 * Fill `{fact.id|format}` and `{fact.id.sub.path|format}` placeholders.
 * The sub-path lets a line quote one field of a structured fact —
 * `{damage.counts.Destroyed|int}`.
 */
export function fillTemplate(text, book) {
  return String(text ?? '').replace(
    /\{([a-zA-Z0-9_.]+)(?:\|([a-zA-Z0-9]+))?\}/g,
    (_, ref, format) => {
      const parts = ref.split('.');
      for (let n = parts.length; n >= 2; n -= 1) {
        const id = parts.slice(0, n).join('.');
        if (!FACTS[id]) continue;
        let value = book.value(id);
        for (const key of parts.slice(n)) {
          value = value?.[key];
          if (value === undefined)
            throw new Error(
              `Template {${ref}}: ${id} has no ${parts.slice(n).join('.')}.`,
            );
        }
        return formatValue(value, format ?? 'raw');
      }
      throw new Error(`Template {${ref}} names no fact.`);
    },
  );
}
