# Supply-Chain Model

Implemented in `src/supplychain/graph.js` and `src/supplychain/centrality.js`. Tested in
`graph.test.mjs` (13 cases) and `centrality.test.mjs` (21 cases).

## Nodes and edges

The network is a **directed multigraph**. Parallel edges between the same pair are
legitimate and expected: Korea→Vietnam in semiconductors and Korea→Vietnam in automobiles are
different relationships that happen to share endpoints.

### Node types

`COUNTRY` · `REGION` · `PORT` · `AIRPORT` · `CHOKEPOINT` · `RAIL_TERMINAL` · `ROAD_HUB` ·
`BORDER_CROSSING` · `INDUSTRIAL_AREA` · `RESOURCE_REGION` · `LOGISTICS_HUB` · `CITY` ·
`MARKET`

### Edge types

`MARITIME_ROUTE` · `AIR_ROUTE` · `ROAD_ROUTE` · `RAIL_ROUTE` · `PIPELINE` ·
`TRADE_RELATIONSHIP` · `SUPPLY_RELATIONSHIP` · `INFERRED_LOGISTICS`

### Transport modes

`SEA` · `AIR` · `ROAD` · `RAIL` · `PIPE` · `STATISTICAL`

`STATISTICAL` is not a physical movement. A Comtrade trade relationship is a statistical
fact about value crossing a border, not a route — it has no distance, and
`edgeDistanceKm()` correctly returns `null` for it rather than zero.

## Provenance is mandatory

**`createNode()` and `createEdge()` both throw without a provenance record.** An
unattributed node cannot be constructed. This is the mechanism behind the brief's
requirement that every route, asset and relationship carry a visible provenance trail: it is
not possible to add an element to the graph without one.

Each edge additionally carries `source`, `timestamp` (through provenance `retrievedAt` and
`observedAt`), `confidence`, data type (`type`, `mode`) and historical/current status
(`dataClass`).

## Integrity rules

| Rule | Rationale |
| --- | --- |
| Duplicate node or edge id throws | Lookups would otherwise resolve arbitrarily |
| An edge endpoint that is not a declared node throws | A silently dropped edge produces a network that is quietly less connected than the data says — worse than a loud failure |
| Negative `distanceKm`, `capacity`, `value` or `volumeKg` throws | These are magnitudes |
| Graph is frozen after construction | See below |

## Immutability and scenarios

The graph is immutable. `withScenario(graph, { disabledNodes, disabledEdges, nodePenalties,
edgePenalties })` returns a **derived view** with the same shape, so every routing and
analytics function works identically on a baseline and on a scenario.

This is the mechanism that keeps a simulation from leaking into observed data. A test
asserts that after running three disruption scenarios, the baseline graph still has its
original node and edge counts and still resolves its original shortest path.

Penalty multipliers must be ≥ 1 and finite. A multiplier below 1 would make a disruption
appear beneficial, so it throws. Node penalties compound with edge penalties: a congested
port raises the cost of every edge touching it.

Scenarios compose — `withScenario(withScenario(g, a), b)` — so a combined scenario does not
need a special case.

## Network metrics

§12 of the brief is explicit that these must never become unexplained risk scores. **Every
function returns its formula, inputs and limitations alongside the number**, and a test
asserts that property across all of them. Nothing is combined into a composite, deliberately:
a composite would hide which input drove the result.

### Degree centrality

```
C_D(v) = deg(v) / (n - 1)
```

Because this is a multigraph, a normalised value may exceed 1. That is reported rather than
clamped — clamping would hide multi-commodity structure.

*Limitation:* counts links, not throughput. A port with many tiny relationships outranks a
port with one enormous one.

### Weighted degree (strength)

```
C_W(v) = Σ w(e) over edges incident to v
```

The weight accessor decides the unit (USD, kg, capacity).

**Edges with an unknown weight contribute zero but are counted separately in
`unknownEdges`.** Without that, a node that is poorly covered in the data is
indistinguishable from a node that is genuinely unimportant — a coverage gap would read as a
finding.

### Betweenness centrality (Brandes)

```
C_B(v) = Σ_{s≠v≠t} σ_st(v) / σ_st
```

Brandes' algorithm, in both an unweighted BFS variant and a weighted Dijkstra variant.
O(nm) / O(nm + n² log n) rather than the naive O(n³).

This is the metric that identifies chokepoints: high betweenness means a node lies on a
large share of shortest paths, so removing it forces many reroutes. A test verifies that
equal-cost alternatives split credit exactly 0.5/0.5.

*Limitations:*
- Assumes flows follow shortest paths. Real cargo follows carrier schedules and contracts.
- Weights every origin–destination pair equally. Actual trade is heavily concentrated.
- **Sensitive to network completeness**: an unmapped alternative route inflates the
  betweenness of the routes we did map. A chokepoint finding is partly a statement about our
  coverage.

### Concentration: HHI and CRn

```
HHI = Σ sᵢ²          where sᵢ = shareᵢ / total
CRn = Σ(n largest shares) / total
```

HHI is returned on a **0–1 scale**, not the 0–10,000 convention used by US antitrust
agencies — stated rather than half-applied. `effectiveCount = 1/HHI` is also returned,
because "3.5 effective suppliers" is far easier to read than "HHI 0.287".

Both are reported because they disagree informatively: CR4 can be high while HHI is moderate
when four mid-sized suppliers dominate. A test constructs exactly that case.

Empty or all-non-positive input returns `value: null` with
`interpretation: 'DATA UNAVAILABLE'` — never 0, which would read as perfect competition.
Non-finite and non-positive shares are discarded and **counted** in `inputs.discarded`.

*Limitation:* HHI measures concentration, not substitutability. Two suppliers in the same
earthquake zone are less independent than HHI suggests.

### Alternative-route availability

For each intermediate node on the best path, remove it and re-solve. Report the fraction
that remain reroutable and the cost ratio of the best survivor.

This deliberately answers a narrower question than "how resilient is this route" — it
answers "if one node on the current best route fails, does another path exist and how much
worse is it". That is a question the data can actually support.

*Limitation:* single-node failures only. Correlated failures are not modelled.

## Worked example, from live data

Korea's HS 8542 (integrated circuit) imports, 2023, from UN Comtrade — 108 partner rows,
partitioned into 105 individually-attributable countries plus 2 aggregates plus the World
total:

```
Other Asia, nes    $17.28B   [INFERRED -> Taiwan]
China              $16.82B
Japan               $5.06B
Singapore           $2.93B
USA                 $2.49B

HHI  = 0.2872  (Highly concentrated), effective suppliers = 3.5
CR4  = 80.4%
```

Note that the largest single source is an aggregate code requiring an inference, and that
the aggregates are excluded from the HHI base. Both facts would be invisible in a naive
summation, and both change what the number means.
