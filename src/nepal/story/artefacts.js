/**
 * Typed access to the Stage 3–5 analytical artefacts.
 *
 * Pure. It takes parsed JSON and returns accessors; it never fetches, never
 * touches the filesystem, and never computes an analytical result.
 *
 * WHY THIS LAYER EXISTS AT ALL. A view that reads
 * `damage.results.damageByIntensity.independenceTest.cramersV` has memorised
 * the shape of an artefact, and the next person to restructure that artefact
 * breaks a panel silently — the value becomes `undefined` and renders as blank
 * rather than as an error. Every path lives here once, and `require()` throws
 * with the artefact and the path it wanted when one is missing. A missing
 * figure is a loud failure, not an empty card.
 *
 * WHAT IT MUST NEVER DO. It must not recompute anything. Stage 5's rule was
 * that a second analytical implementation in JavaScript is how two numbers
 * that should be identical start to differ, and a frontend is the easiest
 * place in the world to commit that. If a figure is not in an artefact, the
 * answer is that the analysis does not produce it — not that the browser
 * should work it out.
 */

/** The five Tier 1 artefacts, by the id the loader and scenes use. */
export const ANALYSIS_ARTEFACTS = Object.freeze({
  seismic: 'nepal-2015-seismic-analysis.json',
  exposure: 'nepal-2015-population-exposure.json',
  damage: 'nepal-2015-damage-analysis.json',
  infrastructure: 'nepal-2015-infrastructure-analysis.json',
  damagePopulation: 'nepal-2015-damage-population.json',
});

/** The ten Tier 2 processed artefacts, loaded per scene. */
export const PROCESSED_ARTEFACTS = Object.freeze({
  seismicEvents: 'nepal-2015-seismic.json',
  shakemap: 'nepal-2015-shakemap-contours.json',
  districts: 'nepal-districts-adm2-2015.json',
  population: 'nepal-2015-population-1km.json',
  unosat: 'nepal-2015-unosat-damage-sites.json',
  copernicus: 'nepal-2015-copernicus-grading.json',
  nga: 'nepal-2015-nga-infrastructure-damage.json',
  osmRoads: 'nepal-2015-osm-roads.json',
  blockageContext: 'nepal-2015-osm-blockage-context.json',
  ochaExposure: 'nepal-2015-ocha-district-exposure.json',
});

/**
 * Read a dotted path, throwing with both the artefact and the path when it is
 * absent.
 *
 * `null` is a legitimate analytical answer — "no comparison was measured" —
 * and passes. `undefined` means the path does not exist, which is a wiring bug.
 */
function require_(artefactId, source, path) {
  let value = source;
  const parts = path.split('.');
  for (let i = 0; i < parts.length; i += 1) {
    if (value === null || value === undefined) break;
    value = value[parts[i]];
  }
  if (value === undefined) {
    throw new TypeError(
      `Artefact "${artefactId}" has no value at "${path}". ` +
        'Either the artefact shape changed or this accessor is wrong; a figure must never render as blank.',
    );
  }
  return value;
}

/**
 * Wrap the five analysis artefacts.
 *
 * @param {Record<string, object>} parsed keyed by `ANALYSIS_ARTEFACTS` key
 */
export function createIntelligence(parsed) {
  const missing = Object.keys(ANALYSIS_ARTEFACTS).filter(
    (key) => !parsed?.[key],
  );
  if (missing.length > 0) {
    throw new TypeError(
      `Missing analysis artefacts: ${missing.join(', ')}. Tier 1 is not optional; every panel depends on it.`,
    );
  }
  const at = (key, path) => require_(key, parsed[key], path);

  return Object.freeze({
    raw: Object.freeze({ ...parsed }),

    /* ---------------- provenance, for the header and every panel -------- */

    stages: Object.freeze(
      Object.entries(parsed).map(([key, artefact]) =>
        Object.freeze({
          key,
          stage: artefact.stage,
          generatedAt: artefact.generatedAt,
          dataClass: artefact.dataClass,
          methodologyCount: artefact.methodology.length,
        }),
      ),
    ),

    /** Every methodology record across all five, for the provenance panel. */
    methodology: Object.freeze(
      Object.entries(parsed).flatMap(([key, artefact]) =>
        artefact.methodology.map((record) =>
          Object.freeze({ ...record, artefact: key }),
        ),
      ),
    ),

    /** One methodology record by its id, for a "why is this here?" link. */
    methodologyFor(id) {
      for (const artefact of Object.values(parsed)) {
        const found = artefact.methodology.find((record) => record.id === id);
        if (found) return found;
      }
      return null;
    },

    sources: Object.freeze(
      Object.values(parsed)
        .flatMap((artefact) => artefact.sources ?? [])
        .filter(
          (source, index, all) =>
            all.findIndex((other) => other.datasetId === source.datasetId) ===
            index,
        ),
    ),

    /* ---------------- Stage 3 — the earthquake -------------------------- */

    seismic: Object.freeze({
      mainShock: at('seismic', 'results.mainShock'),
      counts: at('seismic', 'results.counts'),
      magnitude: at('seismic', 'results.magnitude'),
      depth: at('seismic', 'results.depth'),
      temporal: at('seismic', 'results.temporal'),
      omori: at('seismic', 'results.omori'),
      largestEvents: at('seismic', 'results.largestEvents'),
      spatial: at('seismic', 'results.spatial'),
      gutenbergRichter: at('seismic', 'results.gutenbergRichter'),
      reportingThreshold: at('seismic', 'results.reportingThreshold'),
    }),

    /* ---------------- Stage 4 — who was under it ------------------------ */

    exposure: Object.freeze({
      definition: at('exposure', 'definitionOfExposure'),
      headlineThreshold: at(
        'exposure',
        'definitionOfExposure.headlineThreshold',
      ),
      intensity: at('exposure', 'results.intensity'),
      thresholdCurve: at('exposure', 'results.thresholdCurve'),
      quadrants: at('exposure', 'results.populationIntensityQuadrants'),
      districtQuadrants: at('exposure', 'results.districtQuadrants'),
      byDistrict: at('exposure', 'results.exposureAtHeadlineThreshold'),
      usableLevels: at('exposure', 'results.contours.usableLevels'),
      excludedContours: at('exposure', 'results.contours.excluded'),
      /** The sanctioned sentence for a threshold, straight from the artefact. */
      statementFor(threshold) {
        const row = at('exposure', 'results.thresholdCurve').find(
          (entry) => entry.threshold === threshold,
        );
        return row ? row.statement : null;
      },
    }),

    /* ---------------- Stage 5 — what was seen to break ------------------ */

    damage: Object.freeze({
      coverage: at('damage', 'coverageStatement'),
      reproduction: at('damage', 'results.unosat.reproduction'),
      composition: at('damage', 'results.unosat.composition'),
      classOrder: at('damage', 'results.unosat.classOrder'),
      byDistrict: at('damage', 'results.unosat.byDistrict'),
      bySensorDate: at('damage', 'results.unosat.bySensorDate'),
      byAnalysisArea: at('damage', 'results.unosat.byAnalysisArea'),
      severity: at('damage', 'results.severityIndex'),
      distribution: at('damage', 'results.spatialDistribution'),
      byIntensity: at('damage', 'results.damageByIntensity'),
      copernicus: at('damage', 'results.copernicus'),
      timeline: at('damage', 'results.observationTimeline'),
      crossSource: at('damage', 'results.crossSource'),
    }),

    infrastructure: Object.freeze({
      caveat: at('infrastructure', 'criticalCaveat'),
      geometry: at('infrastructure', 'results.geometry'),
      distribution: at('infrastructure', 'results.distribution'),
      bridges: at('infrastructure', 'results.bridges'),
      association: at('infrastructure', 'results.landslideRoadAssociation'),
      landslides: at('infrastructure', 'results.landslides'),
      network: at('infrastructure', 'results.network'),
      dataGaps: at('infrastructure', 'results.dataGaps'),
    }),

    people: Object.freeze({
      definition: at('damagePopulation', 'definitionOfTheRelationship'),
      proximity: at('damagePopulation', 'results.populationNearObservedDamage'),
      concentration: at('damagePopulation', 'results.concentration'),
      quadrants: at('damagePopulation', 'results.quadrants'),
      byDistrict: at('damagePopulation', 'results.byDistrict'),
    }),
  });
}

/**
 * The header figures, all read from the artefacts rather than asserted.
 *
 * `datasets` counts distinct source datasets actually cited by the artefacts,
 * not a number typed into a template. If an ingest is removed, this falls.
 */
export function headerState(
  intelligence,
  { loaded = 0, failed = 0, pending = 0, total = 0 } = {},
) {
  const checks = intelligence.stages.reduce(
    (acc, stage) => {
      const rows = intelligence.raw[stage.key]?.validation?.checks;
      if (!Array.isArray(rows)) return { ...acc, allCountable: false };
      return {
        passed: acc.passed + rows.filter((row) => row.passed).length,
        total: acc.total + rows.length,
        allCountable: acc.allCountable,
      };
    },
    { passed: 0, total: 0, allCountable: true },
  );
  return Object.freeze({
    caseId: 'NPL-2015-EQ',
    datasets: intelligence.sources.length,
    analyses: intelligence.methodology.length,
    checksPassed: checks.passed,
    checksTotal: checks.total,
    checksAllCountable: checks.allCountable,
    checksLabel: `${checks.passed}/${checks.total}${checks.allCountable ? '' : '*'}`,
    /*
     * READY means nothing is in the air, not that every dataset in the
     * catalogue has been fetched — most are never needed for the scene in
     * front of you. A settled failure is settled: it is reported in the panel
     * that needed it, and it does not hold the header at LOADING forever.
     */
    system: pending > 0 ? `LOADING ${loaded + failed}/${total}` : 'READY',
  });
}
