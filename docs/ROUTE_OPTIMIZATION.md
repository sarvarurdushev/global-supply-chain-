# Route Optimization

Implemented in `src/supplychain/routing.js` and `src/supplychain/geo.js`. Tested in
`routing.test.mjs` (21 cases) and `geo.test.mjs` (12 cases).

## The framing that governs everything here

Every path this module produces is a **geographic alternative**: a route that exists in the
network we loaded. It is not a statement that the route is commercially usable.

`classifyAlternative()` enforces the distinction §13 of the brief demands:

| Label | Condition |
| --- | --- |
| `OPERATIONALLY_VALIDATED_ALTERNATIVE` | Every leg carries **both** capacity and observed utilisation |
| `GEOGRAPHIC_ALTERNATIVE` | Anything less — and it names each missing input |

In practice this project's public sources never satisfy the first condition for maritime
routes, because carrier capacity, schedules and freight rates are commercial data. So in
practice every maritime alternative we produce is labelled `GEOGRAPHIC_ALTERNATIVE`, and the
UI says so. That is the honest answer, not a limitation to be worked around.

## Algorithms

| Algorithm | Use | Complexity |
| --- | --- | --- |
| Dijkstra | Single shortest path | O((V + E) log V) with a binary heap |
| A* | Single shortest path, geographic heuristic | Same worst case, fewer expansions in practice |
| Yen's k-shortest loopless paths | "What alternative routes exist" | O(k · V · (E + V log V)) |

### Dijkstra

Standard, over a binary min-heap. A sorted-array frontier is O(n) per insert and dominates
runtime past a few thousand edges, which is well within the size of a global port network.

Supports `blockedNodes` and `blockedEdges`, which is what lets Yen's reuse it for spur paths
without rebuilding the graph.

### A* and heuristic admissibility

The default heuristic is the great-circle distance from a node to the target. It is
**admissible** — it never overestimates — whenever:

- the weight function is distance in kilometres, **and**
- every scenario penalty multiplier is ≥ 1.

Both hold by construction: `withScenario()` throws on a multiplier below 1. Under those
conditions A* returns the same optimal path as Dijkstra, verified by a test that runs both
over a Busan→Rotterdam network and asserts identical paths and costs.

**With a non-distance weight function the caller must supply a matching heuristic**, or pass
`heuristic: () => 0` to degrade to Dijkstra. An inadmissible heuristic silently returns
suboptimal paths — no error, just a wrong answer — so this is documented on the function
itself, not only here.

When either endpoint has no position the heuristic returns 0, which is the only admissible
fallback: any positive guess could overestimate.

### Yen's k-shortest paths

Yields loopless paths in non-decreasing cost order, so the second path is genuinely the best
alternative rather than an arbitrary other route. That property is what makes "what is the
next best route if this one closes" a meaningful question.

Tests assert non-decreasing cost, distinctness, and looplessness.

## Cost and the treatment of unknowns

`distanceCost(graph, edge)` returns `distanceKm × scenarioPenalty`, and returns **`Infinity`
when the distance is unknown**.

This matters more than it looks. The alternative — treating an unknown distance as zero —
would make edges of unknown length look free, and every shortest path would route through
the least well-documented parts of the network. Returning Infinity excludes the edge, so a
gap in the data reads as a gap rather than as a shortcut.

For the same reason `routeDistanceKm()` returns `null` if any leg's distance is unknown,
rather than summing the known legs and under-reporting.

Negative costs throw. Dijkstra and A* both assume non-negativity, and silently accepting a
negative edge returns a confidently wrong path.

## Geodesy and its error

Distances use the spherical-earth haversine formula with the IUGG mean radius,
**6371.0088 km**.

Haversine is used rather than the spherical law of cosines because it stays numerically
stable at small separations, and rather than a WGS84 geodesic (Vincenty/Karney) because the
latter adds a dependency and iteration for accuracy the rest of the model cannot use.

### Known error sources

| Source | Magnitude | Note |
| --- | --- | --- |
| Spherical vs WGS84 ellipsoid | up to ~0.5% | Largest at high latitudes and for long east-west routes |
| Great-circle vs actual sailed route | **10–30%** | Ships follow traffic separation schemes, avoid shallows, and route around weather. This dominates. |
| Port position as a point | a few km | WPI gives a single coordinate per port, not a berth |
| Chord sampling in `greatCircleArc` | < 0.1% at 32 segments | Verified by test |

**The ellipsoid error is an order of magnitude smaller than the great-circle-versus-sailed-route
error**, so refining the geodesy would not meaningfully improve the answer. Both are stated
rather than silently accepted. Any distance this project reports is a lower bound on the
distance actually sailed.

## Transit time

`transitHours(distanceKm, speedKnots, fixedHours)` converts distance at 1 international
nautical mile = 1.852 km exactly.

Transit time is **MODELLED**, never observed. It is distance divided by an assumed service
speed plus fixed handling time. The assumed speeds are in `docs/DISRUPTION_MODEL.md`, and
every result that uses them carries the assumptions in its `timeAssumptions` field so a
reader can disagree with them.

## Transshipments

`transshipmentCount(route)` counts intermediate nodes — `path.length - 2`. Endpoints do not
count. It is a structural count, not an operational one: it does not know whether cargo
actually changes vessel at a given node.

## What this module does not do

- **It does not know about carrier networks.** Real cargo follows service loops and
  contracts, not least-cost paths through a topological network.
- **It does not model capacity.** A path exists or it does not; there is no notion of a
  route being full.
- **It does not model cost.** Distance is a proxy for cost, and a poor one — a short route
  through a congested canal with high transit fees may cost more than a long one.
- **It does not know about seasonal routing.** Arctic routes, monsoon avoidance and ice
  class are all absent.
