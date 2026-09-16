# ML Methodology

Implemented in `src/supplychain/ml/`. Tested in `forecast.test.mjs` (22), `anomaly.test.mjs`
(14) and `cluster.test.mjs` (16).

## The rule: no model without a baseline

§26 of the brief requires ML output to be compared against a simple baseline. This is
implemented structurally, not as a convention: **`forecast()` cannot return a model result
without also returning the baselines it was measured against**, each with its own
out-of-sample backtest, and a `modelBeatsBaseline` field.

`modelBeatsBaseline: false` is a publishable result. It means use the baseline.

## Why the models are small

UN Comtrade annual data gives roughly 10–30 observations per series. That is far too few for
anything elaborate. An LSTM on 12 annual points is not machine learning; it is overfitting
with extra steps, and it would produce a confident-looking number with no information in it.

So the ceiling is deliberate:

- `holtForecast()` **throws** below 5 observations rather than fitting parameters that would
  be noise.
- `forecast()` **declines to claim validation** below 8 observations, because a
  rolling-origin backtest is not possible, and says so in `reason`.
- Below 2 observations it refuses entirely and returns `PUBLIC DATA INSUFFICIENT`.

## Forecasting

### Baselines

| Method | Definition | When it wins |
| --- | --- | --- |
| `naive` | Every future value = last observed | Random-walk series |
| `drift` | Extend the first-to-last slope | Trending series — a strong baseline for trade value |
| `mean` | Every future value = series mean | Flat noisy series |

### Model

Damped Holt linear-trend exponential smoothing:

```
level_t = α·y_t + (1-α)·(level_{t-1} + φ·trend_{t-1})
trend_t = β·(level_t - level_{t-1}) + (1-β)·φ·trend_{t-1}
ŷ_{t+h} = level_t + (Σ_{i=1..h} φ^i)·trend_t
```

α and β are fitted by **grid search** (step 0.05) minimising in-sample sum of squared
one-step errors. A grid is used rather than gradient descent because the surface is cheap,
the space is two-dimensional and bounded, and a grid cannot land in a bad local optimum or
fail to converge.

φ (damping, default 0.9) shrinks the trend with horizon. An undamped linear trend
extrapolated several years out produces absurd numbers; damped trend is the better default
in forecasting practice. A test asserts successive increments shrink over a 20-step horizon.

### Error metrics

| Metric | Note |
| --- | --- |
| **MASE** | **Headline.** Scale-free, defined when actuals are zero. **< 1 beat the in-sample naive method; ≥ 1 did not.** Null when the training series is flat (zero scale) |
| MAE | Used to rank candidates |
| RMSE | Penalises large errors |
| MAPE | Reported because non-specialists read it, but **null when any actual is zero** rather than silently skipping those terms |

### Validation

`backtest()` is **rolling-origin**: repeatedly fit on a prefix, predict the next `horizon`
points, accumulate genuinely out-of-sample errors. In-sample fit proves nothing and is never
reported as evidence the model works.

A fold the model declines to fit is counted in `skipped`, not treated as a failure — that is
the model correctly refusing to guess.

### Prediction intervals

From the standard deviation of in-sample residuals, widening as √h.

Every interval carries this caveat verbatim:

> This interval reflects in-sample residual variance only. It excludes parameter
> uncertainty, model misspecification, and structural change in the underlying trade
> relationship. Real coverage is lower than nominal, increasingly so at longer horizons.

### Stated model limitations

Attached to every forecast:

- MODEL OUTPUT. A forecast is not an observation.
- Fitted on 10–30 annual observations — a small sample for any time-series model.
- **Assumes the underlying trade relationship is stable.** Tariff changes, sanctions,
  conflict and technology shifts all break that assumption — and those are precisely the
  events this application exists to study. The forecast is least reliable exactly when it
  would be most interesting.

### Worked example, live data

Korea HS 8542 exports to World, 2015–2023 (nine sequential Comtrade calls):

```
METHOD         2024     2025     2026    out-of-sample MAE
naive          86.1     86.1     86.1    $21.24B
drift          90.4     94.6     98.9    $22.12B
mean           85.6     85.6     85.6    $22.16B
holt-damped    96.5     97.2     97.9    $16.31B     <- recommended
95% interval 2024: $51.9B .. $141.1B
```

The model genuinely beat every baseline here. The interval is very wide, which correctly
reflects a series that moved between $52B and $113B over nine years.

## Anomaly detection

### Robust statistics, and why

Detection uses **median and scaled median absolute deviation**, not mean and standard
deviation:

```
scaledMAD = median(|xᵢ - median(x)|) × 1.4826
robust z  = (xᵢ - median(x)) / scaledMAD
```

The constant 1.4826 makes MAD a consistent estimator of σ for normal data.

The reason is decisive: **a supply-chain series contains exactly the large outliers we are
hunting, and those outliers inflate the standard deviation enough to hide themselves.** A
test demonstrates this — in a series `[10, 11, 10, 12, 11, 10, 500]`, the classic z-score of
the 500 is about 2.3, invisible at any sane threshold, because it dragged the mean and SD up
itself. Its robust z is above 100.

### Two modes

- **`level`** — deviation from the series median. Right for a stationary series such as
  weekly port calls.
- **`change`** — deviation from the median **log** year-on-year change. Right for a trending
  series such as trade value, where a level test would flag every recent year for being
  larger.

Log changes are used rather than percentage changes because they are symmetric: a halving
and a doubling are equal and opposite, whereas −50% and +100% are not, which would bias
detection toward flagging increases.

### Cannot-assess is not no-anomalies

When the MAD is zero — more than half the series identical — the result is
`assessable: false` with an explanation, **not** an empty anomaly list. "We cannot tell" and
"nothing is wrong" are different claims and the API distinguishes them.

Series below 5 observations (change mode) or 4 (level mode) return
`PUBLIC DATA INSUFFICIENT`.

### Stated limitations

- **STATISTICAL, NOT CAUSAL.** A flagged point is unusual relative to the rest of the
  series. It identifies no cause, and **the absence of a flag does not mean nothing
  happened.**
- The threshold (default 3.5) is a convention, not a significance test. It carries no
  p-value.
- Annual trade series are short. A structural break early in the series shifts the baseline
  everything else is judged against.

## Clustering

### Two properties that matter more than the algorithm

**1. Determinism.** k-means depends on initialisation, so an un-seeded run gives a different
answer each time. An academic result that changes when you reload the page is not a result.
`kMeans()` takes an explicit seed and uses a deterministic mulberry32 PRNG. A test asserts
identical assignments and centroids across runs.

**2. Standardisation.** Features have wildly different scales — GDP in trillions beside
trade share in percent. Without standardisation, Euclidean distance is decided entirely by
the largest-magnitude feature and "clustering by trade structure" silently becomes
"clustering by GDP".

A test proves this concretely: with GDP interleaved so that the GDP split and the trade-share
split differ, unstandardised k-means recovers the GDP split across every seed tested and
never the trade-share split; standardised k-means recovers the trade-share split.

### Method

k-means with k-means++ initialisation on z-standardised features. Zero-variance features are
neutralised to 0 rather than dividing by zero. Empty clusters retain their previous centroid
rather than becoming NaN.

Centroids are reported in **original units**, so they can be read without mentally undoing
the standardisation.

### Silhouette

Mean silhouette is returned with every clustering, because it is the honest check on whether
structure exists:

| Score | Interpretation |
| --- | --- |
| ≥ 0.5 | Reasonable structure |
| 0.25–0.5 | Weak structure; the clusters may not be meaningful |
| < 0.25 | **No substantial structure. Treat these clusters as arbitrary.** |

Below 0.25 an extra limitation is appended stating the clusters should not be presented as
meaningful groups.

### Stated limitations

- MODEL OUTPUT. Clusters describe the supplied features; they are not a discovered fact.
- **k-means returns k clusters whether or not k clusters exist.** Read the silhouette first.
- Euclidean distance assumes independent, equally-important features. Trade indicators are
  correlated, so correlated features are effectively weighted more heavily.
- Deterministic for a given seed; a different seed can give a different partition. That is a
  property of k-means, not a bug.

## What is deliberately not implemented

| Not built | Why |
| --- | --- |
| Deep learning of any kind | 10–30 annual observations. It would overfit and look confident doing it |
| ARIMA with automatic order selection | Order selection on a series this short is unstable; damped Holt is more robust and more explainable |
| Seasonal decomposition | Annual data has no within-year seasonality to decompose. Reinstate with monthly Comtrade data |
| Causal inference on disruptions | Needs identification strategy and controls this project's data cannot support |
| Trained commodity-association classifier | No labelled ground truth exists. The evidence framework in `CONFIDENCE_METHODOLOGY.md` is used instead, which exposes its reasoning |
