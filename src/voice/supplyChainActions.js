/**
 * Supply-chain voice action handlers (§29, §30).
 *
 * These execute STRUCTURED APPLICATION ACTIONS against the supply-chain
 * console. They never answer from the model's own knowledge — every response is
 * assembled from what the console actually loaded, and when the console has
 * loaded nothing the handler says so rather than describing trade from memory.
 *
 * That is the property the inherited voice architecture already has
 * (`analyst_query` runs over `getAnalystRecords()` snapshots) and the one that
 * matters most here: a voice assistant that improvises trade figures would
 * undo every guarantee the rest of this project makes.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

import { COMMODITY_GROUPS } from '../supplychain/reference/commodities.js';
import { COUNTRIES } from '../supplychain/reference/countries.js';
import { CHOKEPOINTS } from '../supplychain/reference/chokepoints.js';

/** Resolve a spoken commodity phrase onto a commodity group key. */
export function resolveCommodity(spoken) {
  if (typeof spoken !== 'string' || spoken.trim() === '') return null;
  const needle = spoken.trim().toLowerCase();
  const exact = COMMODITY_GROUPS.find((g) => g.key === needle);
  if (exact) return exact;
  const byLabel = COMMODITY_GROUPS.find(
    (g) => g.label.toLowerCase() === needle,
  );
  if (byLabel) return byLabel;
  // Speech gives "semiconductors", "chips", "crude oil" rather than slugs.
  const loose = COMMODITY_GROUPS.find(
    (g) =>
      g.label.toLowerCase().includes(needle) ||
      g.key.replace(/-/g, ' ').includes(needle) ||
      needle.includes(g.key.replace(/-/g, ' ')),
  );
  return loose ?? null;
}

/** Resolve a spoken country phrase onto a country record. */
export function resolveCountry(spoken) {
  if (typeof spoken !== 'string' || spoken.trim() === '') return null;
  const needle = spoken.trim().toLowerCase();
  if (/^[a-z]{3}$/.test(needle)) {
    const byIso = COUNTRIES.find((c) => c.iso3.toLowerCase() === needle);
    if (byIso) return byIso;
  }
  const exact = COUNTRIES.find((c) => c.name.toLowerCase() === needle);
  if (exact) return exact;
  return COUNTRIES.find((c) => c.name.toLowerCase().includes(needle)) ?? null;
}

/** Resolve a spoken chokepoint phrase onto a chokepoint record. */
export function resolveChokepoint(spoken) {
  if (typeof spoken !== 'string' || spoken.trim() === '') return null;
  const needle = spoken.trim().toLowerCase();
  const exact = CHOKEPOINTS.find((c) => c.id === needle);
  if (exact) return exact;
  return (
    CHOKEPOINTS.find(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        needle.includes(c.id.replace(/-/g, ' ')),
    ) ?? null
  );
}

/**
 * Build the action handlers.
 *
 * @param {object} deps
 * @param {object} deps.console a supply-chain console instance
 * @returns {Record<string, (args:object)=>Promise<object>|object>}
 */
export function createSupplyChainActions({ console: panel }) {
  if (!panel?.run) {
    throw new TypeError('Supply-chain actions require a console instance');
  }

  return {
    /** "Show semiconductor trade for Korea." */
    async show_trade_flows(args = {}) {
      const group = resolveCommodity(args.commodity);
      if (!group) {
        return {
          ok: false,
          spoken: `I do not have a commodity called ${args.commodity}. I can show ${COMMODITY_GROUPS.slice(
            0,
            4,
          )
            .map((g) => g.label)
            .join(', ')} and others.`,
        };
      }
      panel.setCommodity(group.key);

      if (args.country) {
        const country = resolveCountry(args.country);
        if (!country) {
          return {
            ok: false,
            spoken: `I could not find a country called ${args.country}.`,
          };
        }
        if (country.m49 === null) {
          // The Taiwan case, and the honest answer to it.
          return {
            ok: false,
            spoken:
              `${country.name} does not report trade to UN Comtrade, so I cannot ` +
              'show its own figures. Its trade is only visible through what its ' +
              'partners report.',
          };
        }
        panel.setReporter(country.iso3);
      }
      if (args.direction)
        panel.setFlow(args.direction === 'exports' ? 'X' : 'M');
      if (Number.isInteger(args.year)) panel.setYear(args.year);

      await panel.run();
      const state = panel.getState();
      if (state.error)
        return { ok: false, spoken: `The trade query failed: ${state.error}` };
      const summary = panel.describeResult?.();
      return {
        ok: true,
        spoken:
          summary ??
          `Showing ${group.label} for ${state.reporter}, ${state.year}.`,
      };
    },

    /** "Simulate a Suez Canal disruption." */
    simulate_supply_disruption(args = {}) {
      const point = resolveChokepoint(args.chokepoint);
      if (!point) {
        return {
          ok: false,
          spoken: `I do not have a chokepoint called ${args.chokepoint}.`,
        };
      }
      const scenario = panel.simulate(point.id);
      if (!scenario) {
        return {
          ok: false,
          spoken: `${point.name} is not part of the demonstration routing network.`,
        };
      }
      const { result } = scenario;
      // Every spoken result states that this is a model, not an observation.
      if (!result.reachableBefore) {
        return {
          ok: true,
          spoken:
            `Simulated closure of ${point.name}. There is no baseline route ` +
            'between these nodes in the loaded network, so I cannot compare.',
        };
      }
      if (!result.reachableAfter) {
        return {
          ok: true,
          spoken:
            `Simulated closure of ${point.name}. This severs the route entirely ` +
            'in the loaded network. That is a model result, not an observation, ' +
            'and no alternative in our data does not mean none exists in the world.',
        };
      }
      const extraKm = Math.round(
        result.delta.additionalDistanceKm,
      ).toLocaleString();
      const extraDays = (result.delta.additionalHours / 24).toFixed(1);
      return {
        ok: true,
        spoken:
          `Simulated closure of ${point.name}. The route reroutes via ` +
          `${result.after.nodeNames.slice(1, -1).join(', ')}, adding ${extraKm} ` +
          `kilometres and about ${extraDays} modelled days. This is a model ` +
          'result and the alternative is geographic, not commercially validated.',
      };
    },

    /** "Show me 2019." */
    async set_trade_period(args = {}) {
      if (!panel.setYear(args.year)) {
        return {
          ok: false,
          spoken: `I only have trade data for 2015 through 2023, not ${args.year}.`,
        };
      }
      const state = panel.getState();
      if (state.hasResult) await panel.run();
      return { ok: true, spoken: `Time machine set to ${args.year}.` };
    },

    /** "Why do you think that?" */
    explain_trade_evidence() {
      const evidence = panel.describeEvidence?.();
      if (!evidence) {
        return {
          ok: false,
          spoken: 'Nothing is loaded yet, so there is no evidence to explain.',
        };
      }
      return { ok: true, spoken: evidence };
    },
  };
}
