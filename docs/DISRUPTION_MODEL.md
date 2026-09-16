# Disruption Model

Implemented in `src/supplychain/disruption.js`. Tested in `disruption.test.mjs` (17 cases).

## Everything here is SIMULATED

Every record this module returns carries `dataClass: SIMULATED` and the limitation
**"MODEL OUTPUT, NOT AN OBSERVATION. This scenario did not occur."** A caller cannot render
a simulation with the same styling as an observation, because the data class travels with
the result.

## The two primitives

Every disruption kind reduces to one of two operations on the graph:

1. **Disable** a node or edge — remove it from traversal entirely.
2. **Penalise** a node or edge — keep it, multiply its traversal cost by ≥ 1.

`DisruptionKind` enumerates ten named kinds (port closure, canal closure, strait disruption,
border closure, natural disaster, facility outage, route closure, capacity reduction, trade
restriction, congestion), but **the distinction between a strike and a storm lives in the
scenario's metadata and duration, not in different physics**. Pretending otherwise would be
false precision: the network model cannot represent the difference.

## Capacity reduction

`reduceNodeCapacity(nodeId, fraction)` models a capacity cut as a cost multiplier:

```
multiplier = 1 / (1 - fraction)
```

Halving capacity doubles the effective cost of using the node.

**This is a queueing-free linear approximation and the returned `assumptions` say so.** Real
delay grows non-linearly as utilisation approaches capacity — a port at 95% of capacity is
far worse than 5% slower. Modelling that properly needs an M/M/c or M/G/1 queue and arrival
rate data this project does not have. The linear form is used because it is transparent, not
because it is right.

## Before and after

`simulateDisruption(graph, disruption, source, target)` solves the same routing problem on
the baseline graph and on the scenario view, and reports:

| Field | Meaning |
| --- | --- |
| `before` / `after` | Full route descriptions: path, node names, edge ids, modes, cost, distance, modelled hours, transshipments |
| `delta.additionalDistanceKm` | after − before |
| `delta.distanceRatio` | after ÷ before |
| `delta.additionalHours` | Modelled, using the speed table below |
| `delta.additionalTransshipments` | Change in intermediate node count |
| `delta.costRatio` | Scenario cost ÷ baseline cost |
| `alternatives` | Up to k paths in the scenario, each classified per `ROUTE_OPTIMIZATION.md` |

Because both solves run through the same code on the same weight function, the comparison is
like-for-like rather than two different computations.

### Two outcomes that are not failures

- **No baseline route.** `reachableBefore: false`, and the note reads `DATA UNAVAILABLE`.
  There is nothing to compare.
- **The pair is severed.** `reachableAfter: false`. The note says the disruption severs the
  pair **"in the loaded network"**, and adds that this "is not the same as no alternative
  existing in the world". That distinction is the difference between a finding and an
  overclaim.

## Modelled transit time

`estimateRouteHours()` is distance ÷ assumed service speed, plus fixed handling time at each
intermediate node.

| Mode | Assumed speed (knots) |
| --- | --- |
| SEA | 14 |
| AIR | 450 |
| ROAD | 35 |
| RAIL | 25 |
| PIPE | 5 |
| STATISTICAL | 14 |

Plus `DEFAULT_NODE_HANDLING_HOURS = 24` per intermediate node.

**These are model assumptions, not measurements.** They are representative commercial
service speeds, not values for any specific vessel, flight or service. 14 knots sits within
the range typical of container-ship slow steaming; it is not a measured fleet average, and
this project does not have the AIS history to compute one. Every result returns its
`timeAssumptions` so the figures can be challenged, and a caller can override the table.

`estimateRouteHours()` returns `null` when any leg's distance or mode is unknown, rather than
skipping the leg and under-reporting.

## Propagation

`propagate(graph, disruption, maxDepth)` walks outward from the disrupted elements by
breadth-first search over **both** outgoing and incoming edges, and tiers nodes:

| Tier | Depth |
| --- | --- |
| `DIRECT` | 0 — nodes disabled or penalised by the scenario |
| `SECONDARY` | 1 hop |
| `TERTIARY` | 2 hops |
| `BEYOND` | 3+ |

It also returns `exposedCountries`, the sorted distinct countries of all reached nodes.

### What tier membership does and does not mean

The returned provenance states it explicitly: **"Topological reach only. Tier membership
does NOT mean a node will suffer an impact, only that it is connected within N hops."**

This is the single easiest result in the project to over-read. Three further limitations are
attached to every propagation result:

- **Unweighted.** A hop across a trivial trade relationship counts the same as a hop across
  a dominant one.
- **No timing.** Real propagation has lead times and inventory buffers. A disruption whose
  effects arrive in eighteen months is not the same as one that bites next week, and this
  model cannot tell them apart.
- **No attenuation.** Real shocks dissipate with distance through a network. Here they do
  not.

## Scenario comparison

`compareScenarios()` ranks scenarios worst-first for the WHAT IF panel: severed pairs first,
then by cost ratio. A test asserts the baseline graph is unchanged after comparing three
scenarios — the immutability that makes before/after honest.

## What this model does not do

- **No economic consequence.** Estimating GDP or welfare impact needs input-output or CGE
  modelling and elasticities well beyond open data at this granularity. The model reports
  network-topological exposure and explicitly refuses to translate it into money.
- **No recovery dynamics.** Every scenario is a steady-state comparison. There is no
  time-to-recovery, no backlog clearance, no rerouting cost.
- **No correlated failures.** Scenarios disable what they are told to. A storm that closes
  four ports at once must be authored as one scenario listing four nodes; the model will not
  infer the correlation.
- **No behavioural response.** Shippers reroute, hold inventory, substitute suppliers and
  renegotiate. None of that is represented.
