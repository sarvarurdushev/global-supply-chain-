/**
 * Network resilience metrics.
 *
 * §12 of the brief is explicit: these must never become unexplained "risk
 * scores". Every function here returns its inputs and its formula alongside the
 * number, and `methodology()` states the limitations in full. Nothing in this
 * module produces a single composite score, because a composite would hide
 * exactly the trade-offs a researcher needs to see.
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

/**
 * Degree centrality.
 *
 * Formula: C_D(v) = deg(v) / (n - 1)
 *
 * Normalised by the maximum possible degree in a simple graph so values are
 * comparable across networks of different size. Note this graph is a multigraph
 * (parallel edges by commodity are legitimate), so a node's raw degree can
 * exceed n - 1 and the normalised value can exceed 1. That is reported rather
 * than clamped, because clamping would silently hide multi-commodity structure.
 *
 * @param {object} graph
 * @returns {{metric:string, formula:string, values:Map<string, number>, raw:Map<string, number>, limitations:string[]}}
 */
export function degreeCentrality(graph) {
  const n = graph.nodeCount;
  const values = new Map();
  const raw = new Map();
  const denominator = n > 1 ? n - 1 : 1;
  for (const id of graph.nodeIds()) {
    const degree = graph.degree(id);
    raw.set(id, degree);
    values.set(id, degree / denominator);
  }
  return Object.freeze({
    metric: 'degree_centrality',
    formula: 'C_D(v) = deg(v) / (n - 1)',
    inputs: Object.freeze({ nodeCount: n }),
    values,
    raw,
    limitations: Object.freeze([
      'Counts links, not throughput. A port with many tiny relationships scores ' +
        'above a port with one enormous one.',
      'This is a multigraph: parallel edges per commodity mean a normalised ' +
        'value may exceed 1.',
      'Reflects only relationships present in the loaded data. Coverage gaps ' +
        'read as low centrality, not as missing data.',
    ]),
  });
}

/**
 * Weighted degree (strength).
 *
 * Formula: C_W(v) = Σ w(e) over all edges incident to v
 *
 * The weight accessor decides the unit — trade value in USD, volume in kg, or
 * capacity. Edges whose weight is unknown contribute 0 and are counted in
 * `unknownEdges`, so a low score caused by missing data is distinguishable from
 * a low score caused by genuinely small flows. That distinction matters: without
 * it, a data gap looks like an unimportant node.
 *
 * @param {object} graph
 * @param {(edge:object)=>number|null} [weightOf] defaults to trade value
 * @returns {{metric:string, formula:string, values:Map<string, number>, unknownEdges:Map<string, number>, limitations:string[]}}
 */
export function weightedDegree(graph, weightOf = (edge) => edge.value) {
  const values = new Map();
  const unknownEdges = new Map();
  for (const id of graph.nodeIds()) {
    values.set(id, 0);
    unknownEdges.set(id, 0);
  }
  for (const edge of graph.edges()) {
    const w = weightOf(edge);
    const known = typeof w === 'number' && Number.isFinite(w);
    for (const endpoint of [edge.from, edge.to]) {
      if (!values.has(endpoint)) continue;
      if (known) values.set(endpoint, values.get(endpoint) + w);
      else unknownEdges.set(endpoint, unknownEdges.get(endpoint) + 1);
    }
  }
  return Object.freeze({
    metric: 'weighted_degree',
    formula: 'C_W(v) = sum of w(e) over edges incident to v',
    inputs: Object.freeze({ weight: 'caller-supplied accessor' }),
    values,
    unknownEdges,
    limitations: Object.freeze([
      'Edges with an unknown weight contribute zero. Check unknownEdges before ' +
        'reading a low score as low importance.',
      'Units follow the accessor. Do not compare a USD-weighted score with a ' +
        'kg-weighted one.',
    ]),
  });
}

/**
 * Betweenness centrality by Brandes' algorithm.
 *
 * Formula: C_B(v) = Σ_{s≠v≠t} σ_st(v) / σ_st
 *
 * This is the metric that identifies chokepoints: a node with high betweenness
 * lies on a large share of shortest paths, so removing it forces many routes to
 * reroute. Brandes runs in O(nm) unweighted / O(nm + n² log n) weighted, versus
 * O(n³) for the naive pair-counting approach.
 *
 * The `weight` accessor switches between the two variants. Unweighted (default)
 * counts hops; weighted uses edge cost and runs the Dijkstra-based variant.
 *
 * @param {object} graph
 * @param {object} [options]
 * @param {((graph:object, edge:object)=>number)|null} [options.weight] null for hop-count
 * @param {boolean} [options.normalise=true] divide by (n-1)(n-2) for directed graphs
 * @returns {{metric:string, formula:string, values:Map<string, number>, limitations:string[]}}
 */
export function betweennessCentrality(graph, options = {}) {
  const { weight = null, normalise = true } = options;
  const ids = graph.nodeIds();
  const n = ids.length;
  const centrality = new Map(ids.map((id) => [id, 0]));

  for (const s of ids) {
    // Single-source shortest-path accumulation.
    const stack = [];
    const predecessors = new Map(ids.map((id) => [id, []]));
    const sigma = new Map(ids.map((id) => [id, 0]));
    const distance = new Map(ids.map((id) => [id, Infinity]));
    sigma.set(s, 1);
    distance.set(s, 0);

    if (weight === null) {
      // BFS variant.
      const queue = [s];
      let head = 0;
      while (head < queue.length) {
        const v = queue[head];
        head += 1;
        stack.push(v);
        for (const edge of graph.outEdges(v)) {
          const w = edge.to;
          if (!distance.has(w)) continue;
          if (distance.get(w) === Infinity) {
            distance.set(w, distance.get(v) + 1);
            queue.push(w);
          }
          if (distance.get(w) === distance.get(v) + 1) {
            sigma.set(w, sigma.get(w) + sigma.get(v));
            predecessors.get(w).push(v);
          }
        }
      }
    } else {
      // Dijkstra variant. A simple sorted frontier is adequate here because the
      // outer loop already dominates at O(n) iterations.
      const settled = new Set();
      const frontier = new Map([[s, 0]]);
      while (frontier.size > 0) {
        let v = null;
        let best = Infinity;
        for (const [id, d] of frontier) {
          if (d < best) {
            best = d;
            v = id;
          }
        }
        frontier.delete(v);
        if (settled.has(v)) continue;
        settled.add(v);
        stack.push(v);
        for (const edge of graph.outEdges(v)) {
          const w = edge.to;
          if (!distance.has(w) || settled.has(w)) continue;
          const cost = weight(graph, edge);
          if (!Number.isFinite(cost) || cost < 0) continue;
          const candidate = distance.get(v) + cost;
          if (candidate < distance.get(w)) {
            distance.set(w, candidate);
            sigma.set(w, sigma.get(v));
            predecessors.set(w, [v]);
            frontier.set(w, candidate);
          } else if (candidate === distance.get(w)) {
            sigma.set(w, sigma.get(w) + sigma.get(v));
            predecessors.get(w).push(v);
          }
        }
      }
    }

    // Back-propagate dependencies.
    const delta = new Map(ids.map((id) => [id, 0]));
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const w = stack[i];
      for (const v of predecessors.get(w)) {
        const share = (sigma.get(v) / sigma.get(w)) * (1 + delta.get(w));
        delta.set(v, delta.get(v) + share);
      }
      if (w !== s) centrality.set(w, centrality.get(w) + delta.get(w));
    }
  }

  if (normalise && n > 2) {
    const scale = 1 / ((n - 1) * (n - 2));
    for (const [id, value] of centrality) centrality.set(id, value * scale);
  }

  return Object.freeze({
    metric: 'betweenness_centrality',
    formula: 'C_B(v) = sum over s != v != t of sigma_st(v) / sigma_st',
    inputs: Object.freeze({
      variant:
        weight === null ? 'unweighted (hop count)' : 'weighted (Dijkstra)',
      normalised: normalise,
      nodeCount: n,
    }),
    values: centrality,
    limitations: Object.freeze([
      'Assumes flows follow shortest paths. Real cargo follows carrier ' +
        'schedules and contracts, which are commercial data we do not hold.',
      'Every origin-destination pair is weighted equally. Actual trade is ' +
        'heavily concentrated on a few pairs.',
      'Sensitive to network completeness: an unmapped alternative route inflates ' +
        'the betweenness of the routes we did map.',
    ]),
  });
}

/**
 * Herfindahl-Hirschman Index of concentration.
 *
 * Formula: HHI = Σ sᵢ² where sᵢ is share i as a fraction of the total.
 *
 * Returns a 0–1 value: 1/n for n equal shares, 1 for a single supplier. This is
 * the standard competition-authority measure, which makes it defensible in an
 * academic write-up. Note the US DOJ/FTC convention scales it to 0–10,000; we
 * keep 0–1 and state it, rather than half-applying a convention.
 *
 * @param {number[]} shares non-negative magnitudes, not required to sum to 1
 * @returns {{metric:string, formula:string, value:number|null, effectiveCount:number|null, interpretation:string, limitations:string[]}}
 */
export function herfindahlIndex(shares) {
  if (!Array.isArray(shares)) {
    throw new TypeError('shares must be an array of numbers');
  }
  const clean = shares.filter(
    (s) => typeof s === 'number' && Number.isFinite(s) && s > 0,
  );
  const total = clean.reduce((sum, s) => sum + s, 0);
  if (total <= 0) {
    return Object.freeze({
      metric: 'hhi',
      formula: 'HHI = sum of s_i^2, s_i = share_i / total',
      value: null,
      effectiveCount: null,
      interpretation: 'DATA UNAVAILABLE — no positive shares supplied',
      inputs: Object.freeze({ shareCount: 0 }),
      limitations: Object.freeze(['No data.']),
    });
  }
  const hhi = clean.reduce((sum, s) => sum + (s / total) ** 2, 0);
  return Object.freeze({
    metric: 'hhi',
    formula: 'HHI = sum of s_i^2, s_i = share_i / total',
    value: hhi,
    // The reciprocal of HHI is the "effective number" of equally-sized
    // participants, which is far easier to interpret than HHI itself.
    effectiveCount: 1 / hhi,
    interpretation: interpretHhi(hhi),
    inputs: Object.freeze({
      shareCount: clean.length,
      discarded: shares.length - clean.length,
      total,
    }),
    limitations: Object.freeze([
      'Scaled 0-1, not the 0-10,000 convention used by US antitrust agencies.',
      'Only counts shares present in the data. An unreported supplier reads as ' +
        'higher concentration than reality.',
      'Measures concentration, not substitutability. Two suppliers in the same ' +
        'earthquake zone are less independent than HHI suggests.',
    ]),
  });
}

function interpretHhi(hhi) {
  // Thresholds mirror the 1500/2500 points of the 0-10,000 convention, restated
  // on the 0-1 scale. They are conventional labels, not statistical findings.
  if (hhi < 0.15) return 'Unconcentrated';
  if (hhi < 0.25) return 'Moderately concentrated';
  return 'Highly concentrated';
}

/**
 * Concentration ratio CRn — the combined share of the n largest participants.
 *
 * Formula: CRn = Σ(n largest shares) / total
 *
 * Reported alongside HHI because the two disagree in informative ways: CR4 can
 * be high while HHI is moderate when four mid-sized suppliers dominate.
 *
 * @param {number[]} shares
 * @param {number} [n=4]
 * @returns {{metric:string, formula:string, value:number|null, n:number, limitations:string[]}}
 */
export function concentrationRatio(shares, n = 4) {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError('n must be a positive integer');
  }
  const clean = shares
    .filter((s) => typeof s === 'number' && Number.isFinite(s) && s > 0)
    .sort((a, b) => b - a);
  const total = clean.reduce((sum, s) => sum + s, 0);
  if (total <= 0) {
    return Object.freeze({
      metric: `cr${n}`,
      formula: `CR${n} = sum of the ${n} largest shares / total`,
      value: null,
      n,
      inputs: Object.freeze({ shareCount: 0 }),
      limitations: Object.freeze(['No data.']),
    });
  }
  const top = clean.slice(0, n).reduce((sum, s) => sum + s, 0);
  return Object.freeze({
    metric: `cr${n}`,
    formula: `CR${n} = sum of the ${n} largest shares / total`,
    value: top / total,
    n,
    inputs: Object.freeze({ shareCount: clean.length, total }),
    limitations: Object.freeze([
      `Ignores the distribution below the top ${n}.`,
      'Only counts shares present in the data.',
    ]),
  });
}

/**
 * Alternative-route availability for an origin-destination pair.
 *
 * Counts how many of the k best paths remain usable after the best path's
 * distinct intermediate nodes are removed one at a time, and reports the cost
 * penalty of the best surviving alternative.
 *
 * This deliberately answers a narrower question than "how resilient is this
 * route" — it answers "if one node on the current best route fails, does another
 * path exist, and how much worse is it". That is a question the data can
 * actually support.
 *
 * @param {object} graph
 * @param {string} source
 * @param {string} target
 * @param {object} deps
 * @param {Function} deps.kShortestPaths
 * @param {Function} deps.withScenario
 * @param {number} [k=5]
 * @returns {object}
 */
export function alternativeRouteAvailability(
  graph,
  source,
  target,
  { kShortestPaths, withScenario },
  k = 5,
) {
  const baseline = kShortestPaths(graph, source, target, k);
  if (baseline.length === 0) {
    return Object.freeze({
      metric: 'alternative_route_availability',
      value: null,
      interpretation: 'DATA UNAVAILABLE — no path exists in the loaded network',
      limitations: Object.freeze(['No baseline route to test.']),
    });
  }
  const best = baseline[0];
  const intermediates = best.path.slice(1, -1);
  const perNode = intermediates.map((nodeId) => {
    const scenario = withScenario(graph, { disabledNodes: [nodeId] });
    const rerouted = kShortestPaths(scenario, source, target, 1);
    if (rerouted.length === 0) {
      return Object.freeze({
        removedNode: nodeId,
        reroutable: false,
        costRatio: null,
      });
    }
    return Object.freeze({
      removedNode: nodeId,
      reroutable: true,
      costRatio: best.cost > 0 ? rerouted[0].cost / best.cost : null,
    });
  });
  const reroutable = perNode.filter((r) => r.reroutable).length;
  return Object.freeze({
    metric: 'alternative_route_availability',
    formula:
      'For each intermediate node on the best path, remove it and re-solve. ' +
      'Report the fraction that remain reroutable and the cost ratio.',
    value: intermediates.length === 0 ? 1 : reroutable / intermediates.length,
    inputs: Object.freeze({
      baselinePathCount: baseline.length,
      intermediateNodes: intermediates.length,
      k,
    }),
    perNode: Object.freeze(perNode),
    limitations: Object.freeze([
      'Single-node failures only. Correlated failures (a storm closing several ' +
        'ports at once) are not modelled here.',
      'Cost ratio is geographic, not commercial. See classifyAlternative().',
      'A route that exists in the data may not be commercially available.',
    ]),
  });
}

/**
 * Full methodology disclosure for the metrics in this module.
 *
 * §12 of the brief requires every score to publish formula, inputs, data sources
 * and limitations. This is the machine-readable form of that requirement, so the
 * provenance panel cannot drift from the implementation.
 *
 * @returns {Readonly<object>}
 */
export function methodology() {
  return Object.freeze({
    scope:
      'Topological metrics over the loaded supply-chain graph. None of these ' +
      'is a risk score, and none should be presented as one.',
    metrics: Object.freeze([
      'degree_centrality',
      'weighted_degree',
      'betweenness_centrality',
      'hhi',
      'crN',
      'alternative_route_availability',
    ]),
    sharedLimitations: Object.freeze([
      'Every metric measures the graph we loaded, not the world. Network ' +
        'coverage gaps propagate directly into the results.',
      'Trade edges derive from UN Comtrade, which lags 1-2 years. These are ' +
        'HISTORICAL structures, not current ones.',
      'Shortest-path assumptions substitute for carrier behaviour, which is ' +
        'commercial data this project does not hold.',
      'No metric here is combined into a composite score, deliberately. A ' +
        'composite would obscure which input drove the result.',
    ]),
  });
}
