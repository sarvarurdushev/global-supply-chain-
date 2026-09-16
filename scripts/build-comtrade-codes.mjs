/**
 * Regenerate the bundled UN Comtrade reference tables.
 *
 *   node scripts/build-comtrade-codes.mjs
 *
 * Writes:
 *   src/supplychain/reference/comtradeAreas.js   reporter + partner area codes
 *   src/supplychain/reference/commodities.js     HS headings + commodity groups
 *
 * The public preview endpoint returns null description fields (measured; see
 * docs/DATA_AVAILABILITY_MATRIX.md §1.1), so codes have to be resolved against
 * these local tables. Comtrade publishes them as static reference files that
 * need no API key.
 *
 * Re-run when Comtrade revises its classification, and commit the result — the
 * application must not fetch reference data at startup.
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REFERENCE_BASE = 'https://comtradeapi.un.org/files/v1/app/reference';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'src', 'supplychain', 'reference');

/**
 * Commodity groups offered by the application's selector (§6 of the brief),
 * each mapped to real HS 2022 headings.
 *
 * Only the mapping is authored here. Every human-readable description is taken
 * verbatim from Comtrade's H6 file, because a paraphrased commodity definition
 * silently changes what the trade figures mean.
 */
const GROUPS = [
  ['crude-oil', 'Crude oil', 'ENERGY', ['2709'], 'upstream'],
  ['refined-petroleum', 'Refined petroleum', 'ENERGY', ['2710'], 'midstream'],
  ['lng', 'LNG and petroleum gases', 'ENERGY', ['2711'], 'upstream'],
  ['coal', 'Coal', 'ENERGY', ['2701'], 'upstream'],
  ['iron-ore', 'Iron ore', 'METALS', ['2601'], 'upstream'],
  ['steel', 'Steel (flat-rolled)', 'METALS', ['7208'], 'midstream'],
  ['copper', 'Copper', 'METALS', ['2603', '7403'], 'upstream'],
  ['aluminium-oxide', 'Alumina', 'METALS', ['2818'], 'midstream'],
  ['gold', 'Gold', 'METALS', ['7108'], 'upstream'],
  ['lithium-and-alkali', 'Lithium and other alkali metals', 'CRITICAL_MINERALS', ['2805'], 'upstream'],
  ['rare-earths', 'Rare-earth compounds', 'CRITICAL_MINERALS', ['2846', '2805'], 'upstream'],
  ['semiconductors', 'Semiconductors (integrated circuits)', 'ELECTRONICS', ['8542'], 'midstream'],
  ['semiconductor-devices', 'Semiconductor devices and LEDs', 'ELECTRONICS', ['8541'], 'midstream'],
  ['semiconductor-equipment', 'Semiconductor manufacturing equipment', 'ELECTRONICS', ['8486'], 'upstream'],
  ['semiconductor-gases', 'Industrial and rare gases', 'ELECTRONICS', ['2804'], 'upstream'],
  ['computers', 'Computers and data-processing machines', 'ELECTRONICS', ['8471'], 'downstream'],
  ['telecoms', 'Telephones and communication apparatus', 'ELECTRONICS', ['8517'], 'downstream'],
  ['wire-and-cable', 'Insulated wire and optical fibre cable', 'ELECTRONICS', ['8544'], 'midstream'],
  ['batteries', 'Batteries and accumulators', 'ENERGY_TRANSITION', ['8507'], 'midstream'],
  ['automobiles', 'Motor cars', 'AUTOMOTIVE', ['8703'], 'downstream'],
  ['auto-parts', 'Motor vehicle parts', 'AUTOMOTIVE', ['8708'], 'midstream'],
  ['pharmaceuticals', 'Medicaments', 'PHARMA', ['3004'], 'downstream'],
  ['machinery', 'Machinery with individual functions', 'MACHINERY', ['8479'], 'midstream'],
  ['wheat', 'Wheat', 'AGRICULTURE', ['1001'], 'upstream'],
  ['maize', 'Maize', 'AGRICULTURE', ['1005'], 'upstream'],
  ['soybeans', 'Soya beans', 'AGRICULTURE', ['1201'], 'upstream'],
  ['aircraft', 'Aircraft and spacecraft', 'TRANSPORT_EQUIPMENT', ['8802'], 'downstream'],
  ['ships', 'Cargo and passenger ships', 'TRANSPORT_EQUIPMENT', ['8901'], 'downstream'],
];

const quote = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

async function fetchJson(name) {
  const response = await fetch(`${REFERENCE_BASE}/${name}`);
  if (!response.ok) {
    throw new Error(`${name}: HTTP ${response.status}`);
  }
  const payload = await response.json();
  const rows = payload?.results ?? payload;
  if (!Array.isArray(rows)) throw new Error(`${name}: unexpected shape`);
  return rows;
}

function buildAreas(reporters, partners, today) {
  const lines = [
    '/**',
    ' * UN Comtrade area code tables.',
    ' *',
    ' * Comtrade identifies countries by UN M49 numeric code, and the public preview',
    ' * endpoint returns `reporterISO`, `partnerISO` and `reporterDesc` as NULL',
    ' * (measured; see docs/DATA_AVAILABILITY_MATRIX.md §1.1). Codes must therefore be',
    ' * resolved locally, which is what this table is for.',
    ' *',
    ' * GENERATED FILE. Regenerate with `node scripts/build-comtrade-codes.mjs`.',
    ' *',
    ` * Source:    UN Comtrade reference files, retrieved ${today}`,
    ' *            https://comtradeapi.un.org/files/v1/app/reference/Reporters.json',
    ' *            https://comtradeapi.un.org/files/v1/app/reference/partnerAreas.json',
    ' * Licence:   UN Comtrade terms of use',
    ' *',
    ' * Portable: no Cesium, no Node, no browser globals.',
    ' */',
    '',
    '/** Areas that report their own trade to Comtrade. */',
    'export const REPORTERS = Object.freeze([',
  ];
  for (const r of reporters) {
    lines.push(
      `  { code: ${r.code}, iso3: ${quote(r.iso3)}, name: ${quote(r.name)} },`,
    );
  }
  lines.push(']);', '');
  lines.push(
    '/** Areas that may appear as a trade partner, including non-reporting areas. */',
    'export const PARTNERS = Object.freeze([',
  );
  for (const p of partners) {
    const iso = p.iso3 ? quote(p.iso3) : 'null';
    lines.push(
      `  { code: ${p.code}, iso3: ${iso}, name: ${quote(p.name)}, isGroup: ${p.isGroup} },`,
    );
  }
  lines.push(']);', '');
  return lines.join('\n');
}

function buildCommodities(headingText, today) {
  const lines = [
    '/**',
    ' * Commodity registry.',
    ' *',
    " * Maps the application's commodity selector (§6 of the brief) onto real HS 2022",
    ' * (H6) headings. Every description below is the official HS heading text, taken',
    ' * verbatim from the UN Comtrade H6 reference file — not paraphrased, because a',
    ' * paraphrased commodity definition silently changes what the trade figures mean.',
    ' *',
    ' * A group may map to several headings (copper ore and refined copper are',
    " * different headings but one commodity story). Summing a group's headings is",
    ' * legitimate; summing across groups is not, because headings overlap in places',
    ' * (e.g. rare earths appear under both 2846 and 2805).',
    ' *',
    ' * GENERATED FILE. Regenerate with `node scripts/build-comtrade-codes.mjs`.',
    ' *',
    ` * Source:  UN Comtrade H6 classification reference, retrieved ${today}`,
    ' *          https://comtradeapi.un.org/files/v1/app/reference/H6.json',
    ' * Licence: UN Comtrade terms of use',
    ' *',
    ' * Portable: no Cesium, no Node, no browser globals.',
    ' */',
    '',
    '/** Official HS 2022 heading text, keyed by 4-digit heading. */',
    'export const HS_HEADINGS = Object.freeze({',
  ];
  const seen = new Set();
  const missing = [];
  for (const [, , , codes] of GROUPS) {
    for (const code of codes) {
      if (seen.has(code)) continue;
      seen.add(code);
      const text = headingText(code);
      if (!text) {
        missing.push(code);
        continue;
      }
      lines.push(`  ${quote(code)}: ${quote(text)},`);
    }
  }
  lines.push('});', '');
  lines.push('/** Commodity groups offered by the selector. */');
  lines.push('export const COMMODITY_GROUPS = Object.freeze([');
  for (const [key, label, sector, codes, stage] of GROUPS) {
    const usable = codes.filter((c) => headingText(c));
    if (usable.length === 0) continue;
    lines.push('  {');
    lines.push(`    key: ${quote(key)},`);
    lines.push(`    label: ${quote(label)},`);
    lines.push(`    sector: ${quote(sector)},`);
    lines.push(`    stage: ${quote(stage)},`);
    lines.push(`    hsHeadings: Object.freeze([${usable.map(quote).join(', ')}]),`);
    lines.push('  },');
  }
  lines.push(']);', '');
  return { source: lines.join('\n'), missing };
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);

  const [rawReporters, rawPartners, rawH6] = await Promise.all([
    fetchJson('Reporters.json'),
    fetchJson('partnerAreas.json'),
    fetchJson('H6.json'),
  ]);

  const reporters = rawReporters
    .filter((r) => !r.isGroup)
    .map((r) => ({
      code: Number(r.reporterCode),
      iso3: r.reporterCodeIsoAlpha3 || null,
      name: r.reporterDesc,
    }))
    .sort((a, b) => a.code - b.code);

  const partners = rawPartners
    .map((p) => ({
      code: Number(p.PartnerCode),
      iso3: p.PartnerCodeIsoAlpha3 || null,
      name: p.PartnerDesc,
      isGroup: Boolean(p.isGroup),
    }))
    .sort((a, b) => a.code - b.code);

  const h6 = new Map(rawH6.map((x) => [x.id, x.text]));
  // Comtrade prefixes each heading with "NNNN - "; strip it.
  const headingText = (code) => {
    const text = h6.get(code);
    if (!text) return null;
    const dash = text.indexOf(' - ');
    return dash === -1 ? text : text.slice(dash + 3);
  };

  writeFileSync(
    path.join(OUT_DIR, 'comtradeAreas.js'),
    buildAreas(reporters, partners, today),
  );
  const { source, missing } = buildCommodities(headingText, today);
  writeFileSync(path.join(OUT_DIR, 'commodities.js'), source);

  console.log(
    `[comtrade-codes] ${reporters.length} reporters, ${partners.length} partners, ` +
      `${GROUPS.length} commodity groups`,
  );
  if (missing.length > 0) {
    // Not fatal: Comtrade does revise headings, and a dropped code is visible
    // in the generated file. But it must be announced, not swallowed.
    console.warn(
      `[comtrade-codes] WARNING: ${missing.length} HS heading(s) absent from the ` +
        `current classification and dropped: ${missing.join(', ')}`,
    );
  }
}

main().catch((error) => {
  console.error(`[comtrade-codes] ${error.message}`);
  process.exitCode = 1;
});
