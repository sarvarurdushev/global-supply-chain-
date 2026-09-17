/**
 * Basin-level water stress, from WRI Aqueduct 4.0.
 *
 * WHY THIS FILE EXISTS. `environment.js` carried this limitation, in those
 * words: "Water stress is a river-basin property, not a country property.
 * China's figure averages the water-rich south with the water-scarce north, and
 * the north is where the wheat is. WRI Aqueduct publishes water stress by
 * basin, which is the right resolution, and is a bulk download rather than an
 * API. It is not integrated here."
 *
 * The first two sentences are right. The third was wrong. Esri's Living Atlas
 * hosts Aqueduct 4.0 as a queryable feature service — keyless, CC BY 4.0, and
 * serving `access-control-allow-origin: *` so a browser can read it directly.
 * It answers both a point query and a country query.
 *
 * WHAT IT MAKES POSSIBLE, measured on the live service before this was written:
 *
 *   China, national (World Bank)      20.2%
 *   Guangzhou basin, Pearl River       1.6%   Low
 *   Beijing basin                     93.7%   Extremely High
 *   Hebei basin (pfaf 431648)      1,969.3%   Extremely High
 *
 * The national average is not wrong; it is answering a different question from
 * the one a reader asking about wheat is asking. Both are shown now, together,
 * with the gap between them named.
 *
 * TWO TRAPS IN THIS DATASET, both of which would have produced fabricated
 * numbers if taken at face value:
 *
 *   SENTINELS. `bws_raw` uses 9999 for "arid and low water use" and -9999 for
 *   "no data". Rendering those as percentages prints "999,900% water stress",
 *   which is not a number that exists. They are classified, never arithmetic.
 *
 *   WITHDRAWAL ABOVE 100% IS REAL. Hebei's 1,969% is not an error: the North
 *   China Plain withdraws nearly twenty times its renewable supply by mining
 *   groundwater. Clamping it to 100% would hide the most important thing the
 *   dataset says.
 *
 * ONE SHAPE TRAP. A basin that crosses a provincial border appears once per
 * province, with the same `pfaf_id` and the same figures. Deduplication is by
 * `pfaf_id`, or a top-ten list turns into the same basin three times.
 *
 * Portable: no Cesium, no Node, no browser globals. Query construction and
 * decoding only; the transport is injected.
 */

import { DataClass, createProvenance } from './provenance.js';

/** The Living Atlas feature service. Layer 1 is Baseline Annual, by basin. */
export const AQUEDUCT_ENDPOINT =
  'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/aqueduct_water_risk/FeatureServer/1/query';

/**
 * Sentinel magnitude.
 *
 * Aqueduct encodes "arid and low water use" as 9999 and "no data" as -9999 in
 * every `*_raw` field. Anything at or beyond that magnitude is a code, not a
 * measurement.
 */
export const SENTINEL_MAGNITUDE = 9999;

/** Aqueduct's own published band labels, in descending severity. */
export const AQUEDUCT_BANDS = Object.freeze([
  Object.freeze({
    label: 'Extremely High (>80%)',
    level: 'EXTREMELY_HIGH',
    plain: 'Extremely high',
  }),
  Object.freeze({
    label: 'High (40-80%)',
    level: 'HIGH',
    plain: 'High',
  }),
  Object.freeze({
    label: 'Medium - High (20-40%)',
    level: 'MEDIUM_HIGH',
    plain: 'Medium to high',
  }),
  Object.freeze({
    label: 'Low - Medium (10-20%)',
    level: 'LOW_MEDIUM',
    plain: 'Low to medium',
  }),
  Object.freeze({ label: 'Low (<10%)', level: 'LOW', plain: 'Low' }),
  Object.freeze({
    label: 'Arid and Low Water Use',
    level: 'ARID_LOW_USE',
    plain: 'Arid, but little water is withdrawn',
  }),
  Object.freeze({ label: 'No Data', level: 'NO_DATA', plain: 'Not measured' }),
]);

const BAND_BY_LABEL = new Map(AQUEDUCT_BANDS.map((band) => [band.label, band]));

/** Severity order for ranking. NO_DATA and ARID sort last, not as "worst". */
const SEVERITY = Object.freeze({
  EXTREMELY_HIGH: 5,
  HIGH: 4,
  MEDIUM_HIGH: 3,
  LOW_MEDIUM: 2,
  LOW: 1,
  ARID_LOW_USE: 0,
  NO_DATA: -1,
});

/** The fields worth asking for. Everything else is a different indicator. */
const OUT_FIELDS = [
  'pfaf_id',
  'name_0',
  'name_1',
  'bws_raw',
  'bws_label',
  'bwd_label',
  'iav_label',
  'sev_label',
  'gtd_label',
  'drr_label',
  'area_km2',
].join(',');

/**
 * Build the URL for "which basin is this point in?".
 *
 * @param {{lat:number, lon:number}} point
 * @returns {string|null} null for an unusable point
 */
export function basinAtPointUrl({ lat, lon } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: OUT_FIELDS,
    returnGeometry: 'false',
    f: 'json',
  });
  return `${AQUEDUCT_ENDPOINT}?${params}`;
}

/**
 * Build the URL for "which basins in this country are worst?".
 *
 * The `where` clause excludes the sentinels server-side rather than filtering
 * them out here, so the row budget is spent on real measurements. `name_0` is
 * Aqueduct's own country field and it holds English names, not ISO codes.
 *
 * @param {object} input
 * @param {string} input.countryName Aqueduct's `name_0` value
 * @param {number} [input.limit]
 * @returns {string|null}
 */
export function stressedBasinsUrl({ countryName, limit = 40 } = {}) {
  if (typeof countryName !== 'string' || countryName.length === 0) return null;
  /*
   * Escaping for an ArcGIS SQL string literal: double the single quotes.
   * "Cote d'Ivoire" is a real value in this field, and without this the clause
   * is malformed and the service answers 400.
   */
  const escaped = countryName.replace(/'/g, "''");
  const params = new URLSearchParams({
    where: `name_0='${escaped}' AND bws_raw > -${SENTINEL_MAGNITUDE} AND bws_raw < ${SENTINEL_MAGNITUDE}`,
    outFields: OUT_FIELDS,
    orderByFields: 'bws_raw DESC',
    resultRecordCount: String(Math.max(1, Math.min(200, Math.floor(limit)))),
    returnGeometry: 'false',
    f: 'json',
  });
  return `${AQUEDUCT_ENDPOINT}?${params}`;
}

/**
 * Is this value a real measurement rather than one of Aqueduct's codes?
 *
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isMeasured(raw) {
  return Number.isFinite(raw) && Math.abs(raw) < SENTINEL_MAGNITUDE;
}

/**
 * Classify a basin row.
 *
 * `bws_raw` is a FRACTION of renewable supply withdrawn, so 0.937 is 93.7% and
 * 19.69 is 1,969%. The band comes from Aqueduct's own `bws_label` rather than
 * being recomputed from the number, so this project is reporting their
 * classification instead of inventing a parallel one.
 *
 * @param {object} attributes one feature's attributes
 * @returns {Readonly<object>|null} null when the row has no basin id
 */
export function readBasin(attributes) {
  if (!attributes || !Number.isFinite(attributes.pfaf_id)) return null;
  const raw = attributes.bws_raw;
  const measured = isMeasured(raw);
  const band =
    BAND_BY_LABEL.get(attributes.bws_label) ?? BAND_BY_LABEL.get('No Data');
  return Object.freeze({
    basinId: attributes.pfaf_id,
    country: attributes.name_0 ?? null,
    province: attributes.name_1 ?? null,
    areaKm2: Number.isFinite(attributes.area_km2) ? attributes.area_km2 : null,
    /** Withdrawal as a PERCENTAGE of renewable supply, or null when coded. */
    withdrawalPercent: measured ? raw * 100 : null,
    level: band.level,
    label: band.label,
    plainLabel: band.plain,
    severity: SEVERITY[band.level] ?? -1,
    /** The other Aqueduct indicators, as their published labels. */
    depletion: attributes.bwd_label ?? null,
    interannualVariability: attributes.iav_label ?? null,
    seasonalVariability: attributes.sev_label ?? null,
    groundwaterDecline: attributes.gtd_label ?? null,
    droughtRisk: attributes.drr_label ?? null,
    /*
     * Why there is no number, when there is no number. Said explicitly so a
     * panel prints a reason rather than an empty cell.
     */
    unmeasuredReason: measured
      ? null
      : band.level === 'ARID_LOW_USE'
        ? 'Aqueduct classifies this basin as arid with low water use. There is little renewable water and little withdrawal, so a withdrawal ratio would be meaningless rather than high.'
        : 'Aqueduct has no baseline water-stress measurement for this basin.',
  });
}

/**
 * Decode a feature-service response into ranked, deduplicated basins.
 *
 * Deduplication by `pfaf_id` is required, not tidying: a basin crossing a
 * provincial border is returned once per province with identical figures, so a
 * top-ten list becomes the same basin three times without it. The provinces are
 * collected onto the surviving row, because "the Hebei/Shandong/Tianjin basin"
 * is more use to a reader than any one of those names alone.
 *
 * @param {object} payload raw ArcGIS JSON
 * @param {number} [limit]
 * @returns {Array<object>}
 */
export function readBasins(payload, limit = 12) {
  if (payload?.error) return [];
  const byId = new Map();
  for (const feature of payload?.features ?? []) {
    const basin = readBasin(feature?.attributes);
    if (!basin) continue;
    const existing = byId.get(basin.basinId);
    if (existing) {
      if (basin.province && !existing.provinces.includes(basin.province)) {
        existing.provinces.push(basin.province);
      }
      continue;
    }
    byId.set(basin.basinId, {
      ...basin,
      provinces: basin.province ? [basin.province] : [],
    });
  }
  return [...byId.values()]
    .sort(
      (a, b) =>
        b.severity - a.severity ||
        (b.withdrawalPercent ?? -1) - (a.withdrawalPercent ?? -1),
    )
    .slice(0, Math.max(1, Math.floor(limit)))
    .map((basin) =>
      Object.freeze({ ...basin, provinces: Object.freeze(basin.provinces) }),
    );
}

/**
 * State the gap between a country's average and its worst basin.
 *
 * This is the finding, and it is the reason the module exists. A reader looking
 * at 20.2% for China and a wheat-import question needs to be told, in a
 * sentence, that the basin the wheat grows in is at 1,969%.
 *
 * Returns null when there is nothing to contrast — no basins, or no national
 * figure to compare them with. A one-sided comparison is not a finding.
 *
 * @param {object} input
 * @param {number|null} input.nationalPercent World Bank withdrawal, % of internal
 * @param {Array<object>} input.basins from readBasins()
 * @param {string} input.countryName
 * @returns {Readonly<object>|null}
 */
export function nationalAverageGap({ nationalPercent, basins, countryName }) {
  const measured = (basins ?? []).filter(
    (basin) => basin.withdrawalPercent !== null,
  );
  if (measured.length === 0) return null;
  const worst = measured[0];
  if (!Number.isFinite(nationalPercent)) {
    return Object.freeze({
      worst,
      nationalPercent: null,
      ratio: null,
      finding:
        `${countryName}’s most-stressed basin withdraws ` +
        `${formatPercent(worst.withdrawalPercent)} of its renewable water. ` +
        'There is no national figure here to compare that with.',
    });
  }
  const ratio =
    nationalPercent > 0 ? worst.withdrawalPercent / nationalPercent : null;
  return Object.freeze({
    worst,
    nationalPercent,
    ratio,
    finding:
      `${countryName} withdraws ${formatPercent(nationalPercent)} of its ` +
      'renewable water as a national average. Its most-stressed river basin' +
      (worst.provinces?.length
        ? ` — in ${worst.provinces.slice(0, 3).join(', ')} —`
        : '') +
      ` withdraws ${formatPercent(worst.withdrawalPercent)}` +
      (Number.isFinite(ratio) && ratio >= 2
        ? `, about ${Math.round(ratio)} times the national figure.`
        : '.') +
      ' A national average is the wrong resolution for a question about one crop or one factory.',
  });
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return 'an unknown share';
  if (value >= 100) return `${Math.round(value).toLocaleString()}%`;
  return `${value.toFixed(1)}%`;
}

/**
 * Provenance for a basin reading.
 *
 * @param {object} input
 * @param {string} input.scope what was asked for, in words
 * @param {number} input.count basins returned
 * @param {string} input.retrievedAt
 */
export function basinProvenance({ scope, count, retrievedAt }) {
  return createProvenance({
    dataClass: DataClass.HISTORICAL,
    source: 'WRI Aqueduct 4.0, via the Esri Living Atlas feature service',
    dataset: `baseline annual water risk by river basin — ${scope}`,
    license:
      'CC BY 4.0. Aqueduct 4.0, World Resources Institute (WRI). Hosted by Esri.',
    method:
      'Feature-service query for baseline water stress by Pfafstetter basin. ' +
      'Bands are Aqueduct’s own published classification, not recomputed here. ' +
      'Rows are deduplicated by basin id, because a basin crossing a provincial ' +
      'border is returned once per province.',
    retrievedAt,
    updateFrequency:
      'Aqueduct is republished every few years; 4.0 is the current release',
    confidence: 0.7,
    limitations: [
      'A BASELINE, NOT A READING FOR TODAY. Aqueduct models long-run average ' +
        'conditions. It does not say whether a basin is in drought this month.',
      'SENTINEL CODES. Aqueduct writes 9,999 for "arid and low water use" and ' +
        '-9,999 for "no data". Those rows are reported as classifications with ' +
        'no percentage, never as numbers.',
      'WITHDRAWAL ABOVE 100% IS REAL, not an error: it means a basin is mining ' +
        'groundwater or living on water that falls elsewhere. Hebei’s figure is ' +
        'close to 2,000%.',
      'MODELLED, NOT METERED. The withdrawal and supply terms come from a ' +
        'hydrological model, not from gauges in every river.',
      'NO CAUSAL CLAIM. This is exposure. Whether a harvest or a shipment ' +
        'actually fails depends on storage, policy and weather this project ' +
        'does not model.',
    ],
    notes: `${count} basin${count === 1 ? '' : 's'} returned.`,
  });
}
