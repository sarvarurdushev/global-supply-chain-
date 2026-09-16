# Confidence Methodology

Implemented in `src/supplychain/provenance.js`. Tested in `provenance.test.mjs`.

## The central caveat

**These bands are methodological labels, not probabilities.** A confidence of 0.82 does not
mean "correct 82 times out of 100". It means the supporting evidence satisfies the criteria
of the STRONG band. Nothing in this project calibrates these numbers against outcomes,
because there is no ground-truth dataset of verified commodity associations to calibrate
against. The UI states this alongside any score it shows.

## Data classes

Every value carries exactly one. They are never merged, and a value with no known class is
`UNKNOWN`, never `LIVE`.

| Class | Badge | Meaning |
| --- | --- | --- |
| `LIVE` | 🟢 | Fresh public telemetry, within the source's stated update period |
| `HISTORICAL` | 🔵 | Archived or published observation. Real, but not current |
| `INFERRED` | 🟡 | Derived from combining public datasets. Not directly observed |
| `SIMULATED` | 🟠 | Produced by a scenario or model run. Did not happen |
| `UNKNOWN` | ⚪ | Insufficient evidence. Displayed as a gap, never as a value |

### The LIVE guard

`createProvenance()` throws when a caller classes UN Comtrade, World Bank, IMF, OECD or NGA
World Port Index data as `LIVE`. Those sources lag their reference periods by months to
years, so the badge would be a factual misstatement. This is a hard error rather than a
lint, because the failure mode — trade data rendered with the same styling as live AIS — is
exactly the misrepresentation the project must not commit.

## Bands

| Band | Score | Meaning |
| --- | --- | --- |
| `DOCUMENTED` | ≥ 0.95 | Directly documented by a source that states the fact |
| `STRONG` | 0.80–0.94 | Strong multi-source evidence |
| `MODERATE` | 0.60–0.79 | Moderate inference |
| `WEAK` | 0.40–0.59 | Weak inference |
| `INSUFFICIENT` | < 0.40 | **Not displayed as a meaningful inference** |

`DISPLAY_FLOOR = 0.40`. Below it, `displayable` is false and the UI must render a data gap
rather than a number.

## Combining evidence

Noisy-OR over supporting evidence, with a multiplicative penalty for contradicting evidence:

```
support     = 1 - Π(1 - wᵢ)     over evidence where supports === true
contradict  = Π(1 - wⱼ)         over evidence where supports === false
score       = support × contradict
```

Noisy-OR is chosen because independent weak signals should accumulate — two separate
datasets each weakly indicating the same association is stronger than either alone — while
no quantity of weak evidence reaches certainty. A test asserts that fifty independent 0.1
signals stay strictly below 1.

### The independence assumption, stated because it is load-bearing

The formula treats evidence items as **conditionally independent**. They frequently are not:
port specialization and trade statistics both partly reflect the same underlying economy, so
counting them as two independent signals double-counts shared information.

**This makes every combined score an optimistic upper bound.** The application surfaces this
caveat in the provenance panel. A more defensible treatment would need a dependency
structure between evidence types, which would itself need empirical grounding this project
does not have.

## Commodity association classes

| Class | Rule |
| --- | --- |
| `VERIFIED` | Requires a single piece of evidence of kind `direct-documentation` **and** a combined score ≥ 0.95 |
| `INFERRED` | Combined score ≥ 0.60 |
| `ESTIMATED` | Combined score ≥ 0.40 |
| `UNKNOWN` | Below 0.40 — not displayed as an inference |

### Why VERIFIED needs direct documentation

No accumulation of indirect signals can reach `VERIFIED`, however large. A test asserts that
twenty independent 0.5-weight route signals — which combine to a score above 0.99 — still
classify as `INFERRED`, not `VERIFIED`.

This is the specific guard against the failure mode §6 of the brief names: *"This specific
ship contains 40,000 tons of semiconductor material."* That claim requires a source that
says so. Vessel route, port specialization, destination and fleet association are
circumstantial, and circumstantial evidence does not become documentation by piling up.

## Aggregate and non-specific area codes

`src/supplychain/reference/areas.js` applies the same discipline to trade data itself.

UN Comtrade's code 490, "Other Asia, not elsewhere specified", is read in trade economics as
predominantly Taiwan — Taiwan does not report to Comtrade, and partners rarely record it
under its own code 158. Measured on 2026-09-16, Korea's largest 2023 source of HS 8542 is
code 490 at $17.28B, ahead of China at $16.82B, while code 158 returns no rows at all.

`interpretArea(490)` therefore returns `association: INFERRED` with `likelyMeans: 'Taiwan'`
and its evidence attached — **never a verified Taiwan figure**. The code nominally also
covers other unspecified Asian areas, and the data does not say "Taiwan".

The 16 residual `", nes"` buckets and the World total are flagged as aggregates so a caller
cannot sum them alongside individual countries and double-count. 29 reporters and 30
partners are flagged as defunct historical entities, so a series spanning a dissolution
cannot silently change what it measures.

## Freshness

`freshness(observedAtMs, expectedPeriodMs)` returns `nominal`, `stale` or `unavailable`.
Three missed update periods is the stale threshold, matching the tolerance the inherited
layers already apply to polling feeds. The vocabulary deliberately mirrors
`src/data/feedState.js` so supply-chain layers report freshness the same way inherited
layers do.

## Data gaps

`dataGap(reason, whatWouldBeNeeded)` returns a value, not a sentinel. Rendering it produces
`DATA UNAVAILABLE` together with the reason and a statement of what data would close the
gap. §31 of the brief is explicit that this is more valuable academically than fabricated
completeness, and making it a value rather than a convention is what stops a null becoming a
zero downstream.
