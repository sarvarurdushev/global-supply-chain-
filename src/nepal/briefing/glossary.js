/**
 * The briefing's glossary: every acronym and technical term, in two layers.
 *
 *   plain   LEVEL 1 — what a first-time viewer needs, in one line. The
 *           briefing shows it on screen the first time a run meets the term
 *           (`term.show`), and the narration says the gist in words.
 *   detail  LEVEL 2 — how it is defined or computed, for the provenance
 *           panel (I), the in-app glossary (?) and the methodology docs.
 *
 * Definitions describe; they do not add figures. Every number the briefing
 * states still comes from an artefact.
 */

const entry = (term, expansion, plain, detail, kind) =>
  Object.freeze({ term, expansion, plain, detail, kind });

export const GLOSSARY = Object.freeze({
  /* ---------------------------------------------------------- sources */
  USGS: entry(
    'USGS',
    'United States Geological Survey',
    'The US government science agency that runs the world’s main public earthquake catalogue.',
    'Event locations, times, depths and moment magnitudes come from the USGS FDSN event service (ComCat), reviewed solutions; public domain (17 U.S.C. §105).',
    'source',
  ),
  ShakeMap: entry(
    'SHAKEMAP',
    'USGS ShakeMap',
    'A USGS model of how hard the ground shook at each place, built from the earthquake and the instruments that recorded it.',
    'ShakeMap interpolates recorded ground motion with ground-motion prediction equations and site amplification, and converts it to intensity. It is MODELLED, not observed at each place.',
    'source',
  ),
  WorldPop: entry(
    'WORLDPOP',
    'WorldPop 2015 population grid',
    'A modelled map of where people lived in 2015, about one value per 100 m square — an estimate, not a census count.',
    'WorldPop distributes census totals onto a grid with a random-forest model of settlement covariates. Aggregated here to 1 km cells; MODELLED.',
    'source',
  ),
  UNOSAT: entry(
    'UNOSAT',
    'UN Satellite Centre (UNITAR)',
    'The UN satellite-imagery team that mapped damaged buildings by looking at images taken after the earthquake.',
    'UNOSAT damage assessment for Nepal 2015: point records of damaged structures in four classes (destroyed, severe, moderate, possible), read from post-event imagery and not field-validated at publication. Records only what was found.',
    'source',
  ),
  Copernicus: entry(
    'COPERNICUS EMS',
    'Copernicus Emergency Management Service (EU), activation EMSR125',
    'The EU’s emergency-mapping service. In its areas it graded every building it could see, including undamaged ones.',
    'EMSR125 grading maps use EMS-98-style grades; only grades 1 and 5 were published for the areas used here, so classes do not align one-to-one with UNOSAT’s.',
    'source',
  ),
  NGA: entry(
    'NGA',
    'US National Geospatial-Intelligence Agency',
    'The US mapping agency whose analysts marked blocked roads, damaged bridges and landslides from imagery.',
    'NGA Nepal 2015 humanitarian products: road-blockage segments, bridge status and landslide polygons, each with an observation date.',
    'source',
  ),
  OSM: entry(
    'OSM',
    'OpenStreetMap',
    'The volunteer-built world map. We use its roads exactly as they were mapped the day before the earthquake.',
    'OpenStreetMap history snapshot at 2015-04-24; roads classed as main (motorway to tertiary) or minor and tracks. ODbL. Unmapped tracks existed and are not in the network.',
    'source',
  ),
  OCHA: entry(
    'OCHA COD-AB',
    'UN Office for the Coordination of Humanitarian Affairs — Common Operational Dataset, Administrative Boundaries',
    'The official district boundaries the UN and government used to count everything in 2015.',
    'Nepal admin level 3 (75 districts) as distributed on HDX; OFFICIAL.',
    'source',
  ),
  DOHS: entry(
    'DOHS',
    'Nepal Department of Health Services',
    'Nepal’s government health department, whose list of health facilities (compiled 2010) we use.',
    'DOHS/WHO health-facility list compiled 21 September 2010, the latest openly available; type and location only — no beds, staff or capacity.',
    'source',
  ),

  /* ---------------------------------------------------------- measures */
  magnitude: entry(
    'MAGNITUDE (M)',
    'Moment magnitude, Mw',
    'The size of the earthquake itself — one number for the whole event. Each step of one is about 32 times more energy.',
    'Moment magnitude from the seismic moment: Mw = (2/3)·log10(M0) − 10.7 (M0 in dyne·cm). Logarithmic; +1 Mw ≈ 31.6× energy.',
    'measure',
  ),
  depth: entry(
    'FOCAL DEPTH',
    'Depth of the hypocentre',
    'How far underground the rupture started. Shallow earthquakes shake the surface harder.',
    'Hypocentral depth from the USGS solution; shallow-crustal depths carry several kilometres of uncertainty and some are fixed by the network.',
    'measure',
  ),
  MMI: entry(
    'MMI',
    'Modified Mercalli Intensity',
    'How strongly shaking was felt at a place, and what it did to buildings. Roman numerals: VI strong, VII very strong, VIII severe.',
    'Macroseismic intensity scale (I–XII). ShakeMap’s MMI is computed from modelled peak ground motion, so it is MODELLED intensity, not a field survey.',
    'measure',
  ),
  intensityVsMagnitude: entry(
    'MAGNITUDE ≠ INTENSITY',
    'Size of the event vs shaking at a place',
    'Magnitude is one number for the earthquake. Intensity differs place to place: strongest near the rupture, weaker far away.',
    'Magnitude describes the source; intensity describes effects at a site and depends on distance, depth, geology and buildings.',
    'measure',
  ),
  completeness: entry(
    'CATALOGUE COMPLETENESS',
    'Completeness magnitude, Mc',
    'Below a certain size, small earthquakes stop being reliably recorded and listed. Counts below it are too low.',
    'Mc by maximum curvature = M4.0 (a lower bound for aftershock sequences). The count jumps 20.5× at M4, the signature of a reporting threshold.',
    'statistic',
  ),
  bValue: entry(
    'b-VALUE',
    'Gutenberg–Richter b-value',
    'How fast earthquakes get rarer as they get bigger. About 1 is typical: roughly ten times fewer for each step up in magnitude.',
    'Fit of log10 N(≥M) = a − b·M above Mc; here b = 0.80 (R² 0.97) from 305 events ≥ M4.0. MODEL FIT.',
    'statistic',
  ),
  Omori: entry(
    'OMORI LAW',
    'Modified Omori law, n(t) = K/(c + t)^p',
    'Aftershocks are most frequent right after the main shock and then fade. The p number says how fast they fade.',
    'Daily counts fitted to K/(c + t)^p before and after the 12 May M7.3; p ≈ 1 is typical. A low R² is reported as a weak fit, not hidden.',
    'statistic',
  ),
  aftershock: entry(
    'AFTERSHOCK',
    'An earthquake that follows a larger one nearby',
    'Smaller earthquakes that follow the main shock in the same area, sometimes for months.',
    'Here: catalogue events after the main shock within 300 km over one year (M ≥ 2.5). No declustering is applied.',
    'measure',
  ),
  quantile: entry(
    '75 % QUANTILE',
    'Upper-quartile threshold',
    'The value that only the top quarter of places exceed. “Dense” here means busier than three quarters of populated squares.',
    'Density threshold = 75th percentile of people per populated 1 km cell; computed from the data, not borrowed.',
    'statistic',
  ),
  median: entry(
    'MEDIAN',
    'The middle value',
    'Half of the cases are above it and half below. Unlike an average, a few extreme cases cannot drag it.',
    '50th percentile of the distribution.',
    'statistic',
  ),
  chiSquare: entry(
    'χ² TEST',
    'Chi-square test of independence',
    'A check of whether two things could be unrelated, with the pattern just chance. Here: chance is ruled out.',
    'Pearson χ² on the intensity-band × damage-class table; with thousands of sites even a weak link gives a tiny p-value, so the strength is judged separately (Cramér’s V).',
    'statistic',
  ),
  cramersV: entry(
    'CRAMÉR’S V',
    'Strength of association between two categories',
    'How strong a link is, from 0 (none) to 1 (total). About 0.1–0.2 is weak.',
    'V = √(χ² / (n·(k − 1))), k = min(rows, columns). Reported with χ², degrees of freedom and p in the provenance panel.',
    'statistic',
  ),
  gini: entry(
    'GINI',
    'Gini concentration coefficient',
    'How unevenly something is spread: 0 means evenly everywhere, 1 means all in one place.',
    'Gini over occupied 1 km cells of the UNOSAT site counts; describes where damage was MAPPED, not all damage.',
    'statistic',
  ),
  pValue: entry(
    'p-VALUE',
    'Probability under “no link”',
    'How likely a pattern this strong would be if there were no real link. Tiny means “not chance” — not “strong”.',
    'Probability of a test statistic at least as extreme under the null hypothesis.',
    'statistic',
  ),
  rSquared: entry(
    'R²',
    'Coefficient of determination',
    'How well a fitted curve follows the data: 1 is a perfect fit, near 0 is a poor one.',
    'Share of variance explained by the fitted model.',
    'statistic',
  ),

  /* ---------------------------------------------------------- methods */
  shortestPath: entry(
    'SHORTEST ROAD ROUTE',
    'Dijkstra shortest path on the mapped road network',
    'For each place, the computer finds the shortest way along mapped roads to the nearest hospital — then again with the blocked roads removed.',
    'One multi-source Dijkstra outward from every listed hospital at once, over the undirected 24 Apr 2015 OSM road graph, by length; each populated 1 km cell joins at its nearest junction. Distance, not travel time: no speeds, surfaces or traffic exist for the date.',
    'method',
  ),
  networkPieces: entry(
    'NETWORK PIECES',
    'Connected components of the road graph',
    'Groups of roads you can drive between without leaving the road. When a blockage splits a group, it becomes two pieces.',
    'Weakly connected components of the main-road graph before and after removing observed blockages.',
    'method',
  ),
  Pareto: entry(
    'PARETO SET',
    'Non-dominated districts',
    'The districts that no other district beats on every measure at once — a short list that needs no weighting choices.',
    'A district is in the set if no other is at least as high on all three criteria (exposure, distance, disruption) and higher on one.',
    'method',
  ),
  Spearman: entry(
    'SPEARMAN',
    'Spearman rank correlation',
    'Whether two rankings tend to go up together, from −1 to +1.',
    'Pearson correlation of ranks; used in the methodology for rank stability under different weights. Not stated in the briefing.',
    'statistic',
  ),
  spatialAssociation: entry(
    'SPATIAL ASSOCIATION',
    'Things found near each other',
    'Two things found close together. It does not show that one caused the other.',
    'Here: blockages within 50 m of a mapped landslide polygon; nearness only — neither product records a cause.',
    'method',
  ),

  /* ---------------------------------------------------------- evidence classes */
  OBSERVED: entry(
    'OBSERVED',
    'Evidence class',
    'Recorded by an instrument or an analyst — a measurement or a mapped observation, not calculated by us.',
    'Values taken as published by the source (USGS, UNOSAT, NGA, Copernicus, OSM).',
    'class',
  ),
  MODELLED: entry(
    'MODELLED',
    'Evidence class',
    'Estimated by a scientific model rather than measured at each place (shaking, population).',
    'Values from a source’s model (ShakeMap intensity, WorldPop population).',
    'class',
  ),
  DERIVED: entry(
    'DERIVED',
    'Evidence class',
    'Calculated by this analysis by combining sources — for example people inside strong shaking.',
    'Computed here from OBSERVED/MODELLED inputs with a recorded method.',
    'class',
  ),
  STATISTIC: entry(
    'STATISTIC',
    'Evidence class',
    'A summary number computed from the data — a median, a share, a test result.',
    'Descriptive or inferential statistic computed here; each has a methodology record.',
    'class',
  ),
  MODEL_FIT: entry(
    'MODEL FIT',
    'Evidence class',
    'A curve fitted to the data to describe its pattern. How good the fit is, is shown too.',
    'Parameters of a fitted model (Gutenberg–Richter, Omori) with goodness of fit.',
    'class',
  ),
  SCENARIO: entry(
    'SCENARIO',
    'Evidence class',
    'A what-if: what the road map implies if every observed blockage held at once. Not a record of what happened.',
    'Network simulation with all observed blockages applied simultaneously; clearance dates are unknown.',
    'class',
  ),
  OFFICIAL: entry(
    'OFFICIAL',
    'Evidence class',
    'A government or UN reference list or boundary, used as published.',
    'Administrative boundaries (OCHA COD-AB) and the DOHS facility list.',
    'class',
  ),
  DATA_GAP: entry(
    'DATA GAP',
    'Evidence class',
    'Where the data is missing or silent. A gap is not evidence that nothing happened.',
    'Places or questions no source covers; stated, not filled in.',
    'class',
  ),
});

/** The terms a run should explain, in the order the glossary lists them, for the in-app panel. */
export const GLOSSARY_ORDER = Object.freeze(Object.keys(GLOSSARY));
