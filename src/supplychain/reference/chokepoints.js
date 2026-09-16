/**
 * Maritime chokepoints.
 *
 * Authored by this project (§17 of the brief). Unlike the generated reference
 * tables, this file is hand-written, so the discipline has to be explicit:
 *
 *  - Geography (position, the waters connected, the alternative routing) is
 *    recorded because it is a stable, verifiable geographic fact, and each entry
 *    carries `sources` naming where it can be checked.
 *  - Quantities (oil transit, container share, vessel counts) are **null**.
 *    The US EIA publishes chokepoint oil-transit volumes and UNCTAD publishes
 *    maritime trade volumes, but neither is integrated yet, and writing a
 *    remembered number here would be exactly the fabrication this project
 *    refuses. `transitVolume: null` means DATA UNAVAILABLE, and the UI renders
 *    it as such.
 *
 * `detourVia` names the geographic alternative, and `detourNote` says what is
 * known about it. Per docs/ROUTE_OPTIMIZATION.md these are GEOGRAPHIC
 * alternatives: that a route exists is not a claim that it is commercially
 * usable.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

import { DataClass, createProvenance } from '../provenance.js';

/**
 * Provenance shared by every chokepoint record.
 *
 * Classed HISTORICAL rather than LIVE: these are standing geographic facts, not
 * a live feed. Confidence is high for the geometry and irrelevant to the
 * quantities, which are absent.
 */
export const CHOKEPOINT_PROVENANCE = createProvenance({
  dataClass: DataClass.HISTORICAL,
  source: 'Global Supply Chain Eye curated dataset',
  dataset: 'reference/chokepoints',
  license: 'MIT (this project). Geographic facts; see per-record sources.',
  method:
    'Hand-authored from public geographic references. Positions are the ' +
    'commonly cited narrowest point or canal axis, rounded to ~0.01 degree.',
  updateFrequency: 'static',
  confidence: 0.95,
  limitations: [
    'Positions are representative points for a strait or canal, not surveyed ' +
      'boundaries. A chokepoint is a corridor, and a single coordinate is a ' +
      'simplification of one.',
    'Transit volumes, container shares and vessel counts are NOT included. ' +
      'The US EIA and UNCTAD publish figures of this kind; until they are ' +
      'integrated, those fields are null and must render as DATA UNAVAILABLE.',
    'Alternative routings are GEOGRAPHIC. Whether a carrier would use one ' +
      'depends on capacity, schedules and cost, which are commercial data this ' +
      'project does not hold.',
  ],
});

/**
 * @typedef {object} Chokepoint
 * @property {string} id
 * @property {string} name
 * @property {number} lat
 * @property {number} lon
 * @property {string[]} connects the waters it joins
 * @property {string[]} borderingCountries ISO3
 * @property {string} significance why it matters, in plain terms
 * @property {string|null} detourVia the geographic alternative, or null if none
 * @property {string|null} detourNote what is known about that alternative
 * @property {null} transitVolume DATA UNAVAILABLE — see module header
 * @property {string[]} sources where the geography can be checked
 */

/** @type {ReadonlyArray<Chokepoint>} */
export const CHOKEPOINTS = Object.freeze([
  Object.freeze({
    id: 'hormuz',
    name: 'Strait of Hormuz',
    lat: 26.57,
    lon: 56.25,
    connects: Object.freeze(['Persian Gulf', 'Gulf of Oman']),
    borderingCountries: Object.freeze(['IRN', 'OMN', 'ARE']),
    significance:
      'The only sea route from the Persian Gulf to the open ocean. Gulf crude ' +
      'and LNG exports have no alternative maritime exit.',
    detourVia: null,
    detourNote:
      'No maritime alternative exists. Limited overland pipeline capacity ' +
      'bypasses it (Saudi East-West, UAE Habshan-Fujairah), but pipeline ' +
      'capacity figures are not integrated here.',
    transitVolume: null,
    sources: Object.freeze([
      'US Energy Information Administration, World Oil Transit Chokepoints',
      'Natural Earth / general maritime geography',
    ]),
  }),
  Object.freeze({
    id: 'malacca',
    name: 'Strait of Malacca',
    lat: 2.5,
    lon: 101.0,
    connects: Object.freeze(['Indian Ocean', 'South China Sea']),
    borderingCountries: Object.freeze(['MYS', 'IDN', 'SGP', 'THA']),
    significance:
      'The shortest sea route between the Indian Ocean and East Asia, and the ' +
      'main artery for Middle East energy moving to China, Japan and Korea.',
    detourVia: 'Lombok and Makassar Straits, or the Sunda Strait',
    detourNote:
      'Geographic alternatives exist through the Indonesian archipelago but ' +
      'add distance and have their own depth and traffic constraints.',
    transitVolume: null,
    sources: Object.freeze([
      'US Energy Information Administration, World Oil Transit Chokepoints',
      'IMO traffic separation scheme, Strait of Malacca and Singapore',
    ]),
  }),
  Object.freeze({
    id: 'suez',
    name: 'Suez Canal',
    lat: 30.0,
    lon: 32.35,
    connects: Object.freeze(['Mediterranean Sea', 'Red Sea']),
    borderingCountries: Object.freeze(['EGY']),
    significance:
      'The sea route between Europe and Asia that avoids circumnavigating ' +
      'Africa. Artificial, and therefore closable.',
    detourVia: 'Cape of Good Hope',
    detourNote:
      'The Cape route is fully navigable and was the standard route before ' +
      '1869. It adds substantial distance on Asia-Europe voyages; the exact ' +
      'addition depends on the port pair and is computed per route by the ' +
      'routing engine rather than asserted here.',
    transitVolume: null,
    sources: Object.freeze([
      'Suez Canal Authority',
      'US Energy Information Administration, World Oil Transit Chokepoints',
    ]),
  }),
  Object.freeze({
    id: 'panama',
    name: 'Panama Canal',
    lat: 9.08,
    lon: -79.68,
    connects: Object.freeze(['Atlantic Ocean', 'Pacific Ocean']),
    borderingCountries: Object.freeze(['PAN']),
    significance:
      'Connects Atlantic and Pacific without rounding South America. Lock ' +
      'dimensions cap vessel size, and the locks depend on fresh water from ' +
      'Gatun Lake, so throughput is sensitive to drought.',
    detourVia: 'Strait of Magellan / Cape Horn, or the Suez routing',
    detourNote:
      'Both alternatives are far longer. For Asia-US East Coast traffic the ' +
      'Suez routing is the practical substitute rather than South America.',
    transitVolume: null,
    sources: Object.freeze([
      'Panama Canal Authority (ACP)',
      'US Energy Information Administration, World Oil Transit Chokepoints',
    ]),
  }),
  Object.freeze({
    id: 'bab-el-mandeb',
    name: 'Bab el-Mandeb',
    lat: 12.58,
    lon: 43.33,
    connects: Object.freeze(['Red Sea', 'Gulf of Aden']),
    borderingCountries: Object.freeze(['YEM', 'DJI', 'ERI']),
    significance:
      'The southern gate of the Red Sea. Suez traffic must pass it, so a ' +
      'disruption here removes the Suez routing even when the canal is open.',
    detourVia: 'Cape of Good Hope',
    detourNote:
      'Same alternative as Suez, for the same reason: the two are serial on ' +
      'the Europe-Asia route, so either closing forces the Cape.',
    transitVolume: null,
    sources: Object.freeze([
      'US Energy Information Administration, World Oil Transit Chokepoints',
    ]),
  }),
  Object.freeze({
    id: 'turkish-straits',
    name: 'Turkish Straits (Bosporus and Dardanelles)',
    lat: 41.12,
    lon: 29.07,
    connects: Object.freeze(['Black Sea', 'Mediterranean Sea']),
    borderingCountries: Object.freeze(['TUR']),
    significance:
      'The only sea route out of the Black Sea. Black Sea grain and Russian ' +
      'and Caspian crude exports depend on it. Passage is governed by the ' +
      '1936 Montreux Convention.',
    detourVia: null,
    detourNote:
      'No maritime alternative exists. Overland and pipeline routes bypass ' +
      'it at much lower volume.',
    transitVolume: null,
    sources: Object.freeze([
      'Montreux Convention Regarding the Regime of the Straits (1936)',
      'US Energy Information Administration, World Oil Transit Chokepoints',
    ]),
  }),
  Object.freeze({
    id: 'cape-of-good-hope',
    name: 'Cape of Good Hope',
    lat: -34.36,
    lon: 18.47,
    connects: Object.freeze(['Atlantic Ocean', 'Indian Ocean']),
    borderingCountries: Object.freeze(['ZAF']),
    significance:
      'Not a chokepoint in the restrictive sense — it is open ocean and cannot ' +
      'be closed. It is included because it is the standing alternative when ' +
      'Suez or Bab el-Mandeb is unavailable, and its capacity is effectively ' +
      'unlimited while its distance cost is not.',
    detourVia: null,
    detourNote:
      'This IS the detour. Its constraint is distance and weather exposure in ' +
      'the Southern Ocean, not width or depth.',
    transitVolume: null,
    sources: Object.freeze(['General maritime geography']),
  }),
  Object.freeze({
    id: 'danish-straits',
    name: 'Danish Straits',
    lat: 55.7,
    lon: 12.7,
    connects: Object.freeze(['Baltic Sea', 'North Sea']),
    borderingCountries: Object.freeze(['DNK', 'SWE']),
    significance:
      'The route out of the Baltic, carrying Russian and Baltic-state crude ' +
      'and refined product exports to the North Sea and beyond.',
    detourVia: null,
    detourNote:
      'The Kiel Canal shortcuts part of the passage but has lock dimension ' +
      'limits that exclude larger tankers.',
    transitVolume: null,
    sources: Object.freeze([
      'US Energy Information Administration, World Oil Transit Chokepoints',
    ]),
  }),
  Object.freeze({
    id: 'taiwan-strait',
    name: 'Taiwan Strait',
    lat: 24.5,
    lon: 119.5,
    connects: Object.freeze(['South China Sea', 'East China Sea']),
    borderingCountries: Object.freeze(['TWN', 'CHN']),
    significance:
      'The direct route along the East Asian seaboard between Southeast Asia ' +
      'and Northeast Asian ports. Also adjacent to the semiconductor ' +
      'manufacturing this application studies most closely.',
    detourVia: 'East of Taiwan, through the Philippine Sea',
    detourNote:
      'An open-ocean alternative exists to the east of Taiwan and adds ' +
      'comparatively little distance. The constraint here is not geography.',
    transitVolume: null,
    sources: Object.freeze(['General maritime geography']),
  }),
]);

/** @param {string} id @returns {Chokepoint|undefined} */
export function chokepoint(id) {
  return CHOKEPOINTS.find((c) => c.id === id);
}

/**
 * Chokepoints with no maritime alternative at all.
 *
 * These are the structurally critical ones: a closure cannot be routed around
 * at any distance cost, only substituted by non-maritime transport.
 *
 * @returns {ReadonlyArray<Chokepoint>}
 */
export function chokepointsWithoutAlternative() {
  return CHOKEPOINTS.filter(
    (c) => c.detourVia === null && c.id !== 'cape-of-good-hope',
  );
}
