# Limitations

The honest framing of this project, per §49 of the brief:

> **An open-data global supply-chain intelligence and simulation platform.**

It is **not** a system with global supply-chain visibility. No open-data system is. This
document states what it cannot do, in one place, without hedging.

## 1. The single most important limitation

**AIS does not broadcast cargo.**

A vessel transmits position, course, speed, navigational status, vessel type and a
self-declared destination string. It does not transmit what it is carrying. Manifest data —
bills of lading — is commercial (Panjiva, ImportGenius) and not open.

Therefore this system can never tell you what is on a specific ship. The most it can
honestly produce is an **INFERRED commodity association** with its evidence exposed and its
confidence stated, and `classifyAssociation()` structurally prevents such an inference from
ever reaching `VERIFIED` without direct documentation.

Any system that claims otherwise from public data is fabricating.

## 2. Trade data is historical, never live

UN Comtrade annual data lags its reference period by **1–2 years**. Monthly data lags by
months. There is no such thing as a live trade flow in open data.

This is enforced in code: `createProvenance()` throws if a caller classes Comtrade, World
Bank, IMF, OECD or NGA WPI data as `LIVE`.

**Consequence for the Time Machine:** scrubbing the timeline moves through *historical trade
data*, not historical telemetry. Historical AIS and ADS-B archives are commercial; God's Eye
View retains only short recent tracks. A past vessel position cannot be reconstructed.

## 3. Taiwan

Taiwan does not report to UN Comtrade and is absent from the reporter list. It exists as
partner code 158, but partners rarely use it — in practice they report trade with Taiwan
under code 490, "Other Asia, not elsewhere specified".

Measured 2026-09-16: Korea's largest 2023 source of HS 8542 is code 490 at $17.28B, ahead of
China at $16.82B. Code 158 returns no rows.

So the data is reachable, but only through an **inference** about what code 490 means, and
only as **mirror statistics** from partners rather than Taiwan's own reporting. For a
project whose flagship scenario is semiconductors, this is a structural gap sitting exactly
where it hurts most. It is surfaced in the UI, never silently resolved.

## 4. Port data has a hole where specialization should be

NGA's World Port Index is authoritative, public domain, and gives 2,951 ports with 100%
coordinate coverage and 86% UN/LOCODE coverage.

But its cargo-facility flags are **~1% populated** (measured: `loContainer` has 32 `Y`, 14
`N`, and **2,905 `U`**). Container cranes: 4 ports. Max vessel draft: 3%.

So WPI tells us where ports are and roughly how big and deep they are. It does **not** tell
us what they specialize in. The "port specialization" evidence line in the brief's §6 example
cannot be sourced from it, and port→commodity association is reported as `UNKNOWN` rather
than inferred from a 1%-populated field.

Container throughput in TEU is worse: authoritative rankings are commercial (Lloyd's List,
Drewry, Alphaliner). We use `harborSize` and `chDepth` as an explicitly-labelled **physical
scale proxy**, never as throughput.

## 5. Alternative routes are geographic, not commercial

We can establish that a path exists in the network. We cannot establish that a carrier would
sail it, has capacity on it, or could do so at a viable cost — that needs schedules, slot
capacity and freight rates, all commercial.

Every maritime alternative this system produces is therefore labelled
`GEOGRAPHIC_ALTERNATIVE`, with each missing input named. See `docs/ROUTE_OPTIMIZATION.md`.

## 6. Distances are lower bounds

Great-circle distance under-measures actual sailed distance by roughly **10–30%**: ships
follow traffic separation schemes, avoid shallows, and route around weather. The spherical-
vs-ellipsoid error (~0.5%) is an order of magnitude smaller and not worth fixing first.

Transit times are **modelled** — distance ÷ an assumed service speed plus assumed handling
time — never observed. The assumed speeds are published in `docs/DISRUPTION_MODEL.md` and
travel with every result.

## 7. Disruption results are topology, not consequence

`propagate()` returns nodes within N hops of a disruption. **Tier membership does not mean a
node will suffer.** The model has no weighting by relationship size, no timing, no inventory
buffers, no attenuation, and no behavioural response.

**No economic consequence is estimated anywhere in this project.** Translating a network
disruption into GDP or price impact needs input-output or CGE modelling and elasticities far
beyond open data at this granularity. The system reports network-topological exposure and
refuses to convert it into money.

## 8. Every metric describes the graph we loaded, not the world

Network coverage gaps propagate directly into results:

- An unmapped alternative route **inflates** the betweenness of the routes we did map, so a
  chokepoint finding is partly a statement about our own coverage.
- An unreported supplier **inflates** measured concentration.
- A node with poorly-covered edges looks unimportant on weighted degree — which is why
  `weightedDegree()` returns `unknownEdges` separately.
- "The disruption severs this pair" means *in our network*, which is not the same as in the
  world. The API note says exactly that.

## 9. Confidence scores are labels, not probabilities

A confidence of 0.82 means the evidence satisfies the STRONG band's criteria. It does **not**
mean 82% likely to be correct. Nothing here is calibrated against outcomes, because no
ground-truth dataset of verified commodity associations exists to calibrate against.

Additionally, the noisy-OR combination assumes evidence items are conditionally independent.
They often are not, which makes every combined score an **optimistic upper bound**.

## 10. Forecasts are least reliable when most interesting

The forecasting models assume the underlying trade relationship is stable. Tariff changes,
sanctions, conflict and technology shifts all break that assumption — and those are exactly
the events this application exists to study.

Sample sizes are 10–30 annual observations. Prediction intervals cover residual variance
only, excluding parameter uncertainty and structural change, so real coverage is below
nominal and increasingly so at longer horizons.

## 11. Features not built because the data does not exist

From `docs/DATA_AVAILABILITY_MATRIX.md` §3, each marked BLOCKED or DATA-LIMITED with the
gate question it fails:

| Feature | Blocking reality |
| --- | --- |
| Per-vessel cargo | AIS carries no cargo field |
| Global real-time truck/rail freight | No open global source |
| Factory / fab-level capacity | Company-confidential |
| Port container throughput (TEU) | Commercial (Lloyd's List, Drewry) |
| Port commodity specialization | WPI fields ~1% populated |
| Real-time trade flows | Comtrade lags 1–2 years |
| Operationally validated alternatives | Carrier data is commercial |
| Historical telemetry replay | AIS/ADS-B archives are commercial |
| Quantified economic impact | Needs I-O/CGE modelling |
| Tariff and NTM analysis | WTO API returned 401; needs a subscription key |
| Conflict and disaster event feeds | ACLED and EM-DAT require registered accounts |
| Commercial feasibility of new infrastructure | Needs engineering and cost studies |

Infrastructure siting output is labelled **NETWORK-BASED CANDIDATE LOCATION**, never a
recommendation.

## 12. Inherited limitations

From God's Eye View (see `docs/PROJECT_ARCHITECTURE_AUDIT.md` §9):

- **Licence encumbrance.** The repository as shipped carries two NonCommercial datasets
  (TeleGeography CC BY-NC-SA 3.0, Bhote Koshi CC BY-NC 4.0). Neither can be deleted without
  code and test changes. See `docs/DATA_LICENSE_MATRIX.md` §4.
- **OpenSky is non-commercial** research/education only.
- **Page-scoped singleton state** means one application per page, so side-by-side dual-globe
  scenario comparison is not available without extraction work.
- **Node engine pin** (`>=24.14`) versus this environment's Node 22. The portable suite runs
  clean, but the two GC-bracketed allocation microbenchmarks self-skip, so the allocation
  regression gate is **not** running here. Any allocation claim must be re-verified on
  Node 24.
- **Bundle size** already warns above 1500 kB on several chunks.
- **Fragile upstreams**: Overpass returned no status in probing; GDELT returned 429 on first
  call; Nominatim and FOSSGIS OSRM are 1 req/s by policy.

## 13. Scope of what has been built

Phases 1, 2, 3, 7, 8 and 9 are complete and tested: the audit, the preserved God's Eye View
base, the provenance and graph model, the routing and disruption engines, the network
analytics, the trade and economic data clients, and the ML layer.

Phases 4, 5 (UI), 6 (UI), 10, 11 and 12 — trade visualization, the supply-chain graph UI,
live/historical fusion in the interface, the event layer, voice actions and polish — are
**not built**. `docs/PHASED_PLAN.md` tracks this. Nothing in the interface claims otherwise,
because there is no supply-chain interface yet.
