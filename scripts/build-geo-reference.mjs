/**
 * Regenerate the bundled geographic reference tables.
 *
 *   node scripts/build-geo-reference.mjs
 *
 * Writes:
 *   src/supplychain/reference/countries.js   ISO3 -> label point, continent, M49
 *   src/supplychain/reference/ports.js       major ports from the NGA World Port Index
 *
 * Both sources are public domain. Output is committed so the application never
 * fetches reference geometry at startup.
 *
 * The 50m resolution is used rather than 110m. 110m omits microstates, and 55
 * UN Comtrade reporters had no position there — including Singapore, Hong Kong,
 * Malta and Bahrain, which are major trade hubs. Singapore alone is South
 * Korea's fourth-largest source of integrated circuits, so its arc was being
 * silently dropped from the globe.
 *
 * Country positions use Natural Earth's LABEL_X / LABEL_Y, which are
 * cartographer-placed label anchors rather than computed centroids. That matters:
 * a computed centroid puts Indonesia in the sea and Norway inside Sweden, which
 * would draw trade arcs from visibly wrong places.
 *
 * Ports are filtered to harbour sizes L and M. WPI's cargo-facility flags are
 * ~1% populated (see docs/DATA_AVAILABILITY_MATRIX.md §1.2), so they are NOT
 * carried through — only the fields measured to be reliable.
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPORTERS } from '../src/supplychain/reference/comtradeAreas.js';

const NATURAL_EARTH =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';
const WORLD_PORT_INDEX =
  'https://msi.nga.mil/api/publications/world-port-index?output=json';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'src', 'supplychain', 'reference');

/** Harbour sizes worth rendering as trade infrastructure. V and S are omitted. */
const PORT_SIZES = new Set(['L', 'M']);

const quote = (value) =>
  `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const round = (n, places = 4) => Number(Number(n).toFixed(places));

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function buildCountries(features, today) {
  const m49ByIso = new Map(REPORTERS.map((r) => [r.iso3, r.code]));
  const rows = [];
  const skipped = [];

  // Several ISO3 codes appear on more than one feature at 50m: Australia's
  // Indian Ocean Territories and Ashmore & Cartier both fall back to "AUS"
  // through ISO_A3_EH. Keeping whichever arrived last would put Australia's
  // label on Christmas Island. Candidates are therefore ranked, and the most
  // sovereign, most prominent feature wins.
  const best = new Map();
  for (const feature of features) {
    const p = feature.properties;
    // ISO_A3 is "-99" for disputed or unrecognised areas; ISO_A3_EH carries the
    // de-facto code in several of those cases.
    const direct = p.ISO_A3 && p.ISO_A3 !== '-99';
    const viaEh = p.ISO_A3_EH && p.ISO_A3_EH !== '-99';
    const iso3 = direct ? p.ISO_A3 : viaEh ? p.ISO_A3_EH : p.ADM0_A3;
    if (!iso3 || iso3 === '-99') {
      skipped.push(p.NAME);
      continue;
    }
    const lon = Number(p.LABEL_X);
    const lat = Number(p.LABEL_Y);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      skipped.push(p.NAME);
      continue;
    }
    // Lower is better: a direct ISO_A3 match beats an ISO_A3_EH fallback, and a
    // country beats a dependency. scalerank breaks remaining ties (1 is the
    // most prominent feature).
    const rank =
      (direct ? 0 : 10) +
      (/Dependency|Indeterminate/i.test(p.TYPE ?? '') ? 5 : 0) +
      (Number(p.scalerank) || 9);
    const candidate = {
      iso3,
      name: p.NAME,
      lat: round(lat),
      lon: round(lon),
      continent: p.CONTINENT ?? null,
      // null means the country does not report to UN Comtrade under this code.
      m49: m49ByIso.get(iso3) ?? null,
      rank,
    };
    const incumbent = best.get(iso3);
    if (!incumbent || candidate.rank < incumbent.rank) best.set(iso3, candidate);
  }
  for (const candidate of best.values()) {
    const { rank, ...row } = candidate;
    rows.push(row);
  }
  rows.sort((a, b) => a.iso3.localeCompare(b.iso3));

  const lines = [
    '/**',
    ' * Country reference points.',
    ' *',
    ' * Positions are Natural Earth LABEL_X / LABEL_Y — cartographer-placed label',
    ' * anchors, not computed centroids. A computed centroid falls in the sea for',
    ' * Indonesia and inside Sweden for Norway, which would draw trade arcs from',
    ' * visibly wrong places.',
    ' *',
    ' * `m49` is the UN Comtrade reporter code, or null where the country does not',
    ' * report. Null is meaningful: it is why some countries can only be seen',
    " * through their partners' mirror statistics.",
    ' *',
    ' * GENERATED FILE. Regenerate with `node scripts/build-geo-reference.mjs`.',
    ' *',
    ` * Source:  Natural Earth 50m admin_0 countries, retrieved ${today}`,
    ' * Licence: Public domain. "Made with Natural Earth" (courtesy credit)',
    ' *',
    ' * Portable: no Cesium, no Node, no browser globals.',
    ' */',
    '',
    '/** @type {ReadonlyArray<{iso3:string,name:string,lat:number,lon:number,continent:string|null,m49:number|null}>} */',
    'export const COUNTRIES = Object.freeze([',
  ];
  for (const r of rows) {
    lines.push(
      `  { iso3: ${quote(r.iso3)}, name: ${quote(r.name)}, lat: ${r.lat}, ` +
        `lon: ${r.lon}, continent: ${r.continent ? quote(r.continent) : 'null'}, ` +
        `m49: ${r.m49 ?? 'null'} },`,
    );
  }
  lines.push(']);', '');
  return { source: lines.join('\n'), count: rows.length, skipped };
}

function buildPorts(ports, today) {
  const rows = [];
  for (const p of ports) {
    if (!PORT_SIZES.has(p.harborSize)) continue;
    const lon = Number(p.xcoord);
    const lat = Number(p.ycoord);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    rows.push({
      id: `wpi:${p.portNumber}`,
      name: p.portName,
      country: p.countryCode ?? null,
      lat: round(lat),
      lon: round(lon),
      size: p.harborSize,
      harborType: p.harborType ?? null,
      // UN/LOCODE arrives space-separated ("KR PUS"); normalise to "KRPUS".
      unlocode: p.unloCode ? String(p.unloCode).replace(/\s+/g, '') : null,
      // Channel depth in feet. The best capacity proxy WPI reliably carries.
      channelDepthFt: Number.isFinite(Number(p.chDepth)) ? Number(p.chDepth) : null,
      // 'Y' | 'N' | 'U' — 'U' is genuinely unknown, never treat it as 'N'.
      rail: p.cmRail ?? 'U',
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));

  const large = rows.filter((r) => r.size === 'L').length;
  const lines = [
    '/**',
    ' * Major world ports.',
    ' *',
    " * Filtered from the NGA World Port Index to harbour sizes L and M. WPI's",
    ' * smaller classes (S and V) are mostly marinas and fishing harbours, which',
    ' * are not trade infrastructure.',
    ' *',
    ' * ONLY the fields measured to be reliably populated are carried through',
    ' * (see docs/DATA_AVAILABILITY_MATRIX.md §1.2). In particular the cargo',
    ' * facility flags — loContainer, loOilTerm, loSolidBulk, loRoro — are ~1%',
    ' * populated and are DELIBERATELY OMITTED. Port commodity specialization',
    ' * cannot be sourced from this dataset, and a 1%-populated field masquerading',
    ' * as a fact is worse than an acknowledged gap.',
    ' *',
    ' * `size` is a 4-level ordinal (L/M/S/V), NOT throughput. `channelDepthFt` is',
    ' * a physical capacity proxy, not a berth count or a TEU figure.',
    ' *',
    ' * `rail` is "Y", "N" or "U". About half of all rows are "U": absence of rail',
    ' * data is not evidence of absent rail.',
    ' *',
    ' * GENERATED FILE. Regenerate with `node scripts/build-geo-reference.mjs`.',
    ' *',
    ` * Source:  NGA World Port Index, retrieved ${today}`,
    ' * Licence: US Government public domain (17 U.S.C. 105)',
    ' *',
    ' * Portable: no Cesium, no Node, no browser globals.',
    ' */',
    '',
    `/** ${rows.length} ports (${large} large, ${rows.length - large} medium). */`,
    'export const MAJOR_PORTS = Object.freeze([',
  ];
  for (const r of rows) {
    lines.push(
      `  { id: ${quote(r.id)}, name: ${quote(r.name)}, ` +
        `country: ${r.country ? quote(r.country) : 'null'}, ` +
        `lat: ${r.lat}, lon: ${r.lon}, size: ${quote(r.size)}, ` +
        `harborType: ${r.harborType ? quote(r.harborType) : 'null'}, ` +
        `unlocode: ${r.unlocode ? quote(r.unlocode) : 'null'}, ` +
        `channelDepthFt: ${r.channelDepthFt ?? 'null'}, rail: ${quote(r.rail)} },`,
    );
  }
  lines.push(']);', '');
  return { source: lines.join('\n'), count: rows.length, large };
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);

  const [ne, wpi] = await Promise.all([
    fetchJson(NATURAL_EARTH),
    fetchJson(WORLD_PORT_INDEX),
  ]);

  const countries = buildCountries(ne.features, today);
  writeFileSync(path.join(OUT_DIR, 'countries.js'), countries.source);

  const ports = buildPorts(wpi.ports, today);
  writeFileSync(path.join(OUT_DIR, 'ports.js'), ports.source);

  console.log(
    `[geo-reference] ${countries.count} countries, ${ports.count} ports ` +
      `(${ports.large} large, ${ports.count - ports.large} medium)`,
  );
  if (countries.skipped.length > 0) {
    console.warn(
      `[geo-reference] ${countries.skipped.length} area(s) had no usable ISO3 ` +
        `and were skipped: ${countries.skipped.join(', ')}`,
    );
  }
}

main().catch((error) => {
  console.error(`[geo-reference] ${error.message}`);
  process.exitCode = 1;
});
