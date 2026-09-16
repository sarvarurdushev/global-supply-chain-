/**
 * Resolving UN Comtrade area codes, including the ones that need a caveat.
 *
 * The plain lookup tables live in `comtradeAreas.js` (generated). This module
 * adds the interpretation rules — in particular the handling of aggregate and
 * "not elsewhere specified" codes, which is where naive trade analysis goes
 * wrong most often.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

import { REPORTERS, PARTNERS } from './comtradeAreas.js';
import { AssociationClass } from '../provenance.js';

/** The M49 code Comtrade uses for "all partners combined". */
export const WORLD_CODE = 0;

/**
 * "Other Asia, not elsewhere specified".
 *
 * This code matters more than any other single code in this project, so it is
 * documented at length rather than hidden in a lookup.
 *
 * Taiwan does not report to UN Comtrade and is absent from the reporter list
 * (verified against the live reference file). It IS present in the partner list
 * as code 158 "Taiwan, Province of China" — but partners overwhelmingly do not
 * use it. In practice they report trade with Taiwan under code 490.
 *
 * Measured example (UN Comtrade preview, retrieved 2026-09-16):
 *   South Korea, HS 8542 (electronic integrated circuits), 2023, IMPORTS
 *     partner 490 "Other Asia, nes"  =  $17,283,314,290
 *     partner 156 China              =  $16,816,793,018
 *     partner 158 Taiwan             =  no rows returned
 *
 * So Korea's largest source of integrated circuits is only visible at all if you
 * know to read code 490. Attributing 490 to Taiwan is a well-founded INFERENCE —
 * it is the standard reading in trade economics — but it is NOT a fact stated by
 * the data, because 490 nominally also covers other unspecified Asian areas.
 *
 * `interpretArea()` therefore returns it as an inference with its evidence,
 * never as a verified Taiwan figure.
 */
export const OTHER_ASIA_NES_CODE = 490;

const reporterByCode = new Map(REPORTERS.map((r) => [r.code, r]));
const reporterByIso = new Map(REPORTERS.map((r) => [r.iso3, r]));
const partnerByCode = new Map(PARTNERS.map((p) => [p.code, p]));

/**
 * Areas that no longer exist — e.g. "Tanganyika (...1964)", "Peninsula Malaysia
 * (...1963)". Comtrade retains them so historical series remain queryable.
 *
 * There are 29 such reporters and 30 such partners. A time series that spans one
 * of these dates changes what it is measuring partway through, so the UI must
 * flag them rather than presenting "Tanganyika" as a current trading partner.
 */
const DEFUNCT_NAME = /\(\.\.\.\d{4}\)/;

/**
 * Aggregate or non-specific partner codes.
 *
 * Summing these alongside individual countries double-counts, so callers
 * building a country-level view must exclude them.
 *
 * Detection uses two signals present in the reference data itself:
 *   - `isGroup` (which Comtrade sets only for World), and
 *   - a name ending in ", nes" — "not elsewhere specified" — which marks all 16
 *     residual regional buckets, including "Other Asia, nes".
 *
 * An earlier version of this code keyed off an underscore-prefixed ISO
 * placeholder. That was WRONG: `_KS` is Kosovo and `_MI` is Midway Islands,
 * both real territories, while several genuine aggregates use ordinary-looking
 * codes such as `A49` and `E29`. The ISO field is also not unique across
 * partners (codes 473 and 636 both carry `A79`), so it cannot be used as a key.
 */
export const AGGREGATE_PARTNER_CODES = Object.freeze(
  new Set(
    PARTNERS.filter((p) => p.isGroup || /,\s*nes$/i.test(p.name)).map(
      (p) => p.code,
    ),
  ),
);

/** @param {number} code @returns {object|undefined} */
export function reporter(code) {
  return reporterByCode.get(code);
}

/** @param {string} iso3 @returns {object|undefined} */
export function reporterByIso3(iso3) {
  return reporterByIso.get(iso3);
}

/** @param {number} code @returns {object|undefined} */
export function partner(code) {
  return partnerByCode.get(code);
}

/**
 * Whether an area reports its own trade statistics to Comtrade.
 *
 * A false answer here is the reason a country's trade can only be seen through
 * its partners' mirror statistics.
 *
 * @param {number} code
 * @returns {boolean}
 */
export function isReporter(code) {
  return reporterByCode.has(code);
}

/**
 * Whether a partner code is an aggregate that must not be summed alongside
 * individual countries.
 * @param {number} code
 * @returns {boolean}
 */
export function isAggregatePartner(code) {
  return AGGREGATE_PARTNER_CODES.has(code);
}

/**
 * Whether an area is a defunct historical entity.
 *
 * @param {number} code
 * @returns {boolean}
 */
export function isDefunctArea(code) {
  const area = partnerByCode.get(code) ?? reporterByCode.get(code);
  return area ? DEFUNCT_NAME.test(area.name) : false;
}

/**
 * Interpret a partner code, exposing any caveat that attaches to it.
 *
 * @param {number} code
 * @returns {Readonly<{code:number, name:string, iso3:string|null, isAggregate:boolean, association:string, caveat:string|null, evidence:string[]}>}
 */
export function interpretArea(code) {
  if (code === OTHER_ASIA_NES_CODE) {
    return Object.freeze({
      code,
      name: 'Other Asia, nes',
      iso3: null,
      isAggregate: true,
      // Not VERIFIED: the data does not say "Taiwan", we are reading it as such.
      association: AssociationClass.INFERRED,
      likelyMeans: 'Taiwan',
      caveat:
        'Code 490 "Other Asia, not elsewhere specified" is read in trade ' +
        'economics as predominantly Taiwan, which does not report to UN ' +
        'Comtrade and is rarely recorded by partners under its own code 158. ' +
        'This is an inference, not a statement by the data: 490 nominally also ' +
        'covers other unspecified Asian areas.',
      evidence: Object.freeze([
        'Taiwan is absent from the UN Comtrade reporter list.',
        'Partner code 158 (Taiwan) returns no rows for major reporters.',
        'Code 490 carries flows consistent in scale with Taiwan trade.',
      ]),
    });
  }

  const known = partnerByCode.get(code);
  if (!known) {
    return Object.freeze({
      code,
      name: `Unknown area ${code}`,
      iso3: null,
      isAggregate: false,
      association: AssociationClass.UNKNOWN,
      caveat: 'This area code is not in the Comtrade reference table.',
      evidence: Object.freeze([]),
    });
  }

  const aggregate = isAggregatePartner(code);
  const defunct = DEFUNCT_NAME.test(known.name);
  const caveats = [];
  if (aggregate) {
    caveats.push(
      'This is an aggregate or non-specific area code. Do not sum it ' +
        'alongside individual countries.',
    );
  }
  if (defunct) {
    caveats.push(
      'This area no longer exists. It appears only in historical series, and a ' +
        'series spanning its dissolution changes what it measures partway through.',
    );
  }
  return Object.freeze({
    code,
    name: known.name,
    iso3: known.iso3,
    isAggregate: aggregate,
    isDefunct: defunct,
    association: aggregate
      ? AssociationClass.INFERRED
      : AssociationClass.VERIFIED,
    caveat: caveats.length > 0 ? caveats.join(' ') : null,
    evidence: Object.freeze([]),
  });
}

/**
 * Split partner rows into individually-attributable countries and aggregates.
 *
 * Callers building a country-level trade view use `countries`; callers reporting
 * a total use `aggregates` separately, and must say which they used.
 *
 * @param {Array<{partnerCode:number}>} rows
 * @returns {{countries:Array<object>, aggregates:Array<object>, world:object|null}}
 */
export function partitionPartners(rows) {
  const countries = [];
  const aggregates = [];
  let world = null;
  for (const row of rows) {
    if (row.partnerCode === WORLD_CODE) world = row;
    else if (isAggregatePartner(row.partnerCode)) aggregates.push(row);
    else countries.push(row);
  }
  return { countries, aggregates, world };
}
