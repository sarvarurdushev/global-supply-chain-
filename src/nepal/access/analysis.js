/**
 * Health access before and after the observed road damage: the pure parts.
 *
 * The question is narrow and stated exactly: for people in each populated
 * 1 km cell, how far was the nearest hospital along roads mapped on
 * 2015-04-24, and how did that distance change when the roads and bridges
 * observed blocked in the days after the earthquake are removed? It is a
 * DISTANCE along MAPPED roads. It is not a travel time, not a statement that
 * anyone travelled, and not a measure of what the hospital could do.
 *
 * "Rescue-access pressure" combines three measured things per district and
 * is presented first as a Pareto set — the districts no other district beats
 * on every criterion — because that needs no weights. A weighted composite is
 * computed only to show how much the ORDER depends on the weights, never as a
 * score to be read on its own.
 */

/** How one origin's nearest-hospital access changed between the two networks. */
export const ChangeCategory = Object.freeze({
  SIMILAR: 'SIMILAR',
  LONGER: 'LONGER',
  DIFFERENT_FACILITY: 'DIFFERENT_FACILITY',
  DISCONNECTED: 'DISCONNECTED',
  NO_BASELINE_PATH: 'NO_BASELINE_PATH',
});

export const CHANGE_ORDER = Object.freeze([
  ChangeCategory.SIMILAR,
  ChangeCategory.LONGER,
  ChangeCategory.DIFFERENT_FACILITY,
  ChangeCategory.DISCONNECTED,
  ChangeCategory.NO_BASELINE_PATH,
]);

/**
 * @param {{baseMetres:number, scenarioMetres:number, baseFacility:number, scenarioFacility:number}} row
 *   Infinity and -1 where no facility is reachable
 * @param {{similarMetres:number}} options change at or below this is SIMILAR
 */
export function classifyChange(row, { similarMetres }) {
  const reachableBefore = Number.isFinite(row.baseMetres);
  const reachableAfter = Number.isFinite(row.scenarioMetres);
  if (!reachableBefore) return ChangeCategory.NO_BASELINE_PATH;
  if (!reachableAfter) return ChangeCategory.DISCONNECTED;
  if (row.scenarioMetres - row.baseMetres <= similarMetres)
    return ChangeCategory.SIMILAR;
  return row.scenarioFacility === row.baseFacility
    ? ChangeCategory.LONGER
    : ChangeCategory.DIFFERENT_FACILITY;
}

/**
 * The value below which half the weight lies. Infinite values sort last, so
 * a median can itself be "unreachable" when more than half the people are.
 */
export function weightedMedian(values, weights) {
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return null;
  let running = 0;
  for (const i of order) {
    running += weights[i];
    if (running >= total / 2) return values[i];
  }
  return values[order[order.length - 1]];
}

/**
 * Items no other item beats on every key (higher is "more" on all keys).
 * An item is dominated when another is at least as high on every key and
 * strictly higher on one.
 */
export function paretoFront(items, keys) {
  const dominated = (a, b) =>
    keys.every((k) => b[k] >= a[k]) && keys.some((k) => b[k] > a[k]);
  return items.filter((a) => !items.some((b) => b !== a && dominated(a, b)));
}

/** Min-max scaling of each key to [0, 1] across the items; a constant key scales to 0. */
export function minMaxNormalise(items, keys) {
  const range = Object.fromEntries(
    keys.map((k) => {
      const values = items.map((item) => item[k]);
      return [k, [Math.min(...values), Math.max(...values)]];
    }),
  );
  return items.map((item) => ({
    ...item,
    normalised: Object.fromEntries(
      keys.map((k) => {
        const [lo, hi] = range[k];
        return [k, hi > lo ? (item[k] - lo) / (hi - lo) : 0];
      }),
    ),
  }));
}

/**
 * Rank the items under each weighting and report how far each item's rank
 * moves. The point is the spread, not any one ranking.
 * @param {Array<object>} items each with `id` and the keys
 * @param {string[]} keys
 * @param {Array<{id:string, weights:Record<string, number>}>} schemes
 * @param {{top:number}} options
 */
export function weightingSensitivity(items, keys, schemes, { top = 5 } = {}) {
  const scaled = minMaxNormalise(items, keys);
  const rankings = schemes.map((scheme) => {
    const total = keys.reduce((sum, k) => sum + scheme.weights[k], 0);
    const scored = scaled
      .map((item) => ({
        id: item.id,
        score: keys.reduce(
          (sum, k) => sum + (scheme.weights[k] / total) * item.normalised[k],
          0,
        ),
      }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return {
      scheme: scheme.id,
      order: scored.map((row) => row.id),
      scores: scored,
    };
  });
  const perItem = items.map((item) => {
    const ranks = rankings.map((r) => r.order.indexOf(item.id) + 1);
    return {
      id: item.id,
      ranks: Object.fromEntries(rankings.map((r, i) => [r.scheme, ranks[i]])),
      bestRank: Math.min(...ranks),
      worstRank: Math.max(...ranks),
      inTopUnderEveryScheme: ranks.every((rank) => rank <= top),
      inTopUnderSomeScheme: ranks.some((rank) => rank <= top),
    };
  });
  return {
    top,
    rankings: rankings.map(({ scheme, order }) => ({ scheme, order })),
    perItem,
    stableTop: perItem
      .filter((row) => row.inTopUnderEveryScheme)
      .map((row) => row.id),
    sometimesTop: perItem
      .filter((row) => row.inTopUnderSomeScheme && !row.inTopUnderEveryScheme)
      .map((row) => row.id),
  };
}
