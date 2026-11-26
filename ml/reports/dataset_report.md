# Phase 1: dataset report

Generated 2026-11-26. Horizon **h = 7 days**: every feature uses observations dated <= t - 7.

## Splits (by target date, with a gap of h days between blocks)

| split | from | to |
|---|---|---|
| train | 2015-01-01 | 2026-05-13 |
| calibration | 2026-05-21 | 2026-08-19 |
| test | 2026-08-27 | 2026-11-25 |

## Cleaning (row-local rules only; nothing fitted on future data)

| step | rows |
|---|---|
| rows in scope | 289,616 |
| dropped: Non-FAQ (below-standard grade) | 421 |
| dropped: modal <= 0 or outside [min, max] | 103 |
| rows kept | 289,092 |

Price spikes are **flagged, not dropped** (> 3x away from the trailing 30-day median of the same series), so real tomato and onion surges stay in the test set.

## Variety groups (fitted on the training window)

| product | named groups (>= 1000 training rows) | rows labelled Common (generic) |
|---|---|---|
| Tomato | Hybrid | 98% |
| Onion | 1St Sort, 2Nd Sort, Beelary-Red, Pole, Red | 66% |
| Potato | Jalander | 94% |
| Rice | 1009 Kar, Coarse, Dappa, Fine, Hansa, Jaya, Medium, Sarbati Raw, Sona | 16% |
| Broken rice | Broken Rice | 0% |
| Groundnut | none | 64% |

## Rows and series per split

| product | split | rows | series | spikes flagged |
|---|---|---|---|---|
| Broken rice | train | 4,571 | 24 | 4 |
| Broken rice | calibration | 129 | 14 | 0 |
| Broken rice | test | 123 | 12 | 0 |
| Groundnut | train | 3,404 | 33 | 2 |
| Groundnut | calibration | 143 | 10 | 0 |
| Groundnut | test | 139 | 13 | 0 |
| Onion | train | 61,172 | 122 | 174 |
| Onion | calibration | 2,029 | 51 | 2 |
| Onion | test | 1,989 | 59 | 2 |
| Potato | train | 18,824 | 42 | 34 |
| Potato | calibration | 743 | 22 | 2 |
| Potato | test | 739 | 22 | 1 |
| Rice | train | 23,308 | 97 | 17 |
| Rice | calibration | 722 | 49 | 2 |
| Rice | test | 834 | 47 | 1 |
| Tomato | train | 45,862 | 51 | 805 |
| Tomato | calibration | 1,292 | 32 | 3 |
| Tomato | test | 1,261 | 30 | 16 |

Targets dropped because no level had usable history at t - 7: **160** of 167,444.

## Feature level used (share of rows)

| split | market+product | market+variety | state+product | state+variety |
|---|---|---|---|---|
| train | 2.2% | 93.6% | 0.4% | 3.8% |
| calibration | 1.0% | 95.9% | 0.3% | 2.7% |
| test | 2.0% | 94.3% | 0.1% | 3.6% |

## Feature missingness (all splits)

| feature | missing |
|---|---|
| lag1 | 0.0% |
| lag2 | 0.0% |
| med7 | 0.0% |
| med30 | 0.0% |
| med90 | 0.0% |
| vol30 | 0.0% |
| n30 | 0.0% |
| days_since | 0.0% |
| state_med30 | 0.5% |
| yoy | 6.1% |
| yoy_missing | 0.0% |
| month_sin | 0.0% |
| month_cos | 0.0% |
| doy_sin | 0.0% |
| doy_cos | 0.0% |
| market_premium | 0.0% |

Market premiums fitted on training data: 298 series (unseen markets get 0, i.e. the state price).

## Leakage checks

**Recompute from truncated data.** For sampled targets, the raw rows were cut at t - h *before* any step (daily aggregation, rolling windows, fallback choice), and the features were rebuilt and compared.

| check | result |
|---|---|
| sampled targets | 150 |
| mismatched values | 0 |
| max abs difference | 0.0 |

**Boundary cases** on a hand-built series:

| check | passed |
|---|---|
| t-7 observation used as lag1 | True |
| t-6 and t observations ignored | True |
| days_since == 7 | True |


**Leakage checks: PASS**
