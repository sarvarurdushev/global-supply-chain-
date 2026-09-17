/**
 * Generate the bundled air-freight gateway dataset.
 *
 *   node scripts/build-air-gateways.mjs
 *
 * Writes src/supplychain/reference/airGateways.js.
 *
 * WHY THIS EXISTS. "Air cargo hubs" was one of the six things the audit marked
 * unavailable. That verdict conflated two questions. Where the world's major
 * airports are is public, precise and free: OurAirports publishes 86,084
 * records in the public domain, of which 1,174 are large airports and 1,152 of
 * those have scheduled service. What is NOT public is how many tonnes of
 * freight each one handles — ACI's cargo rankings are a paid publication, not a
 * feed — so this dataset ships the positions and says plainly that it is not a
 * ranking.
 *
 * WHAT GOES IN. `type=large_airport` with `scheduled_service=yes`. Scheduled
 * service is the filter that matters: a large airfield with no scheduled
 * traffic is not a freight gateway, and belly capacity on scheduled passenger
 * flights is a large share of how air freight actually moves.
 *
 * WHY IT IS BUNDLED RATHER THAN FETCHED. The CSV is about 12 MB. Filtered to
 * large scheduled airports and rounded to 3 decimal places (~100 m) it is well
 * under 100 KB, needs no network at runtime, and works offline — the same
 * reasoning as the bundled borders.
 *
 * LICENCE: OurAirports data is released into the public domain. No attribution
 * is required; it is given anyway, because a reader should be able to check it.
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE =
  'https://davidmegginson.github.io/ourairports-data/airports.csv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(
  ROOT,
  'src',
  'supplychain',
  'reference',
  'airGateways.js',
);

/** Decimal places kept. 3 is ~110 m at the equator, well inside a runway. */
const PRECISION = 3;

const round = (n) => Number(Number(n).toFixed(PRECISION));

/**
 * Split one CSV line.
 *
 * OurAirports quotes every field and escapes an embedded quote by doubling it
 * ("Dulles ""IAD""" ). A naive split on commas breaks on airport names that
 * contain one, which is common enough — "Chicago O'Hare International Airport,
 * Terminal 5" style records exist — that it is worth doing properly.
 */
function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
        continue;
      }
      cell += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ',') {
      cells.push(cell);
      cell = '';
      continue;
    }
    cell += char;
  }
  cells.push(cell);
  return cells;
}

const response = await fetch(SOURCE, {
  headers: { 'User-Agent': 'global-supply-chain-eye/build' },
});
if (!response.ok) {
  throw new Error(`OurAirports HTTP ${response.status}`);
}
const text = await response.text();
const lines = text.split('\n');
const header = parseCsvLine(lines[0]);
const col = (name) => {
  const index = header.indexOf(name);
  if (index < 0) throw new Error(`OurAirports column "${name}" is missing`);
  return index;
};
const iIdent = col('ident');
const iType = col('type');
const iName = col('name');
const iLat = col('latitude_deg');
const iLon = col('longitude_deg');
const iCountry = col('iso_country');
const iRegion = col('iso_region');
const iMunicipality = col('municipality');
const iScheduled = col('scheduled_service');
const iIata = col('iata_code');

const gateways = [];
let skippedNoPosition = 0;
for (let i = 1; i < lines.length; i += 1) {
  const line = lines[i];
  if (!line) continue;
  const cells = parseCsvLine(line);
  if (cells[iType] !== 'large_airport') continue;
  if (cells[iScheduled] !== 'yes') continue;
  const lat = Number(cells[iLat]);
  const lon = Number(cells[iLon]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    skippedNoPosition += 1;
    continue;
  }
  gateways.push({
    ident: cells[iIdent],
    iata: cells[iIata] || null,
    name: cells[iName],
    lat: round(lat),
    lon: round(lon),
    iso2: cells[iCountry],
    region: cells[iRegion] || null,
    city: cells[iMunicipality] || null,
  });
}
gateways.sort((a, b) => a.ident.localeCompare(b.ident));

const body = gateways
  .map(
    (g) =>
      `  Object.freeze(${JSON.stringify({
        ident: g.ident,
        iata: g.iata,
        name: g.name,
        lat: g.lat,
        lon: g.lon,
        iso2: g.iso2,
        region: g.region,
        city: g.city,
      })}),`,
  )
  .join('\n');

const file = `/**
 * Air-freight gateways — GENERATED, do not edit.
 *
 *   node scripts/build-air-gateways.mjs
 *
 * ${gateways.length} large airports with scheduled service, from OurAirports
 * (public domain). Coordinates rounded to ${PRECISION} decimal places.
 *
 * WHAT THIS IS NOT: a ranking of cargo airports. OurAirports records position,
 * identity and service status. It does not record freight tonnage, and no open
 * global source does — ACI's cargo rankings are a paid publication. So these
 * are the airports through which scheduled air freight can move, not a list of
 * the busiest ones, and the layer says so on every reading.
 *
 * "Large airport with scheduled service" is OurAirports' own classification,
 * not a judgement made here.
 */

export const AIR_GATEWAYS = Object.freeze([
${body}
]);

/** Where the data came from, for the layer's provenance block. */
export const AIR_GATEWAYS_SOURCE = Object.freeze({
  source: 'OurAirports',
  url: '${SOURCE}',
  license: 'Public domain. Credit: OurAirports — ourairports.com',
  filter: 'type=large_airport AND scheduled_service=yes',
  count: ${gateways.length},
  generatedFrom: 'airports.csv',
});
`;

writeFileSync(OUT, file);
console.log(
  `[air-gateways] ${gateways.length} gateways -> ${path.relative(ROOT, OUT)}` +
    (skippedNoPosition ? ` (${skippedNoPosition} skipped: no position)` : ''),
);
