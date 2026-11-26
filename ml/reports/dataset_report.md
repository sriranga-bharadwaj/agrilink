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

## Data-entry errors removed (per series-day, judged against the previous 30 days only)

Rules (user decision): price outside Rs 0.5-1000/kg, or more than 8x above/below the median of the same series over the previous 30 days. Applied identically to every split.

| split | impossible price | 8x jump |
|---|---|---|
| before 2015 | 24 | 21 |
| test | 0 | 9 |
| train | 23 | 57 |

| product | state | market | date | split | price | previous 30-day median | reason |
|---|---|---|---|---|---|---|---|
| Tomato | Karnataka | belgaum | 2026-10-27 | test | 2.80 | 37.42 | 8x jump |
| Tomato | Karnataka | belgaum | 2026-10-28 | test | 2.50 | 35.00 | 8x jump |
| Tomato | Karnataka | belgaum | 2026-10-29 | test | 3.00 | 32.40 | 8x jump |
| Tomato | Karnataka | belgaum | 2026-10-30 | test | 3.50 | 30.00 | 8x jump |
| Tomato | Karnataka | belgaum | 2026-10-31 | test | 2.50 | 30.00 | 8x jump |
| Tomato | Karnataka | belgaum | 2026-11-02 | test | 3.00 | 30.00 | 8x jump |
| Tomato | Karnataka | belgaum | 2026-11-04 | test | 2.50 | 27.39 | 8x jump |
| Tomato | Karnataka | belgaum | 2026-11-13 | test | 2.00 | 28.00 | 8x jump |
| Tomato | Karnataka | belgaum | 2026-11-18 | test | 3.00 | 28.98 | 8x jump |

Smaller moves (3x-8x) are **flagged, not dropped**, so real surges stay in the test set.

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
| Broken rice | train | 4,569 | 24 | 1 |
| Broken rice | calibration | 129 | 14 | 0 |
| Broken rice | test | 123 | 12 | 0 |
| Groundnut | train | 3,404 | 33 | 2 |
| Groundnut | calibration | 143 | 10 | 0 |
| Groundnut | test | 139 | 13 | 0 |
| Onion | train | 61,146 | 122 | 150 |
| Onion | calibration | 2,029 | 51 | 2 |
| Onion | test | 1,989 | 59 | 2 |
| Potato | train | 18,816 | 42 | 26 |
| Potato | calibration | 743 | 22 | 2 |
| Potato | test | 739 | 22 | 1 |
| Rice | train | 23,306 | 97 | 15 |
| Rice | calibration | 722 | 49 | 2 |
| Rice | test | 834 | 47 | 1 |
| Tomato | train | 45,820 | 51 | 788 |
| Tomato | calibration | 1,292 | 32 | 3 |
| Tomato | test | 1,252 | 30 | 7 |

Targets dropped because no level had usable history at t - 7: **160** of 167,355.

## Feature level used (share of rows)

| split | market+product | market+variety | state+product | state+variety |
|---|---|---|---|---|
| train | 2.2% | 93.5% | 0.4% | 3.8% |
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

`market_premium` is the median log(market / state price) over the 365 days before t - h (0 when fewer than 30 matched days), so it is covered by the leakage check below.

## Target price range (Rs/kg)

| product | split | min | median | max |
|---|---|---|---|---|
| Broken rice | calibration | 16.00 | 23.00 | 35.00 |
| Broken rice | test | 16.00 | 24.00 | 66.60 |
| Broken rice | train | 8.00 | 19.50 | 96.00 |
| Groundnut | calibration | 37.50 | 47.93 | 93.40 |
| Groundnut | test | 36.08 | 57.01 | 119.05 |
| Groundnut | train | 8.45 | 43.27 | 150.00 |
| Onion | calibration | 5.32 | 20.10 | 70.00 |
| Onion | test | 10.00 | 40.00 | 70.00 |
| Onion | train | 0.50 | 13.75 | 166.27 |
| Potato | calibration | 3.00 | 15.00 | 110.00 |
| Potato | test | 6.50 | 17.50 | 55.50 |
| Potato | train | 2.38 | 15.00 | 90.00 |
| Rice | calibration | 17.00 | 40.10 | 154.74 |
| Rice | test | 18.00 | 45.02 | 192.50 |
| Rice | train | 9.00 | 32.90 | 164.50 |
| Tomato | calibration | 4.50 | 15.00 | 50.00 |
| Tomato | test | 2.00 | 14.00 | 55.50 |
| Tomato | train | 0.50 | 10.00 | 290.00 |

## Where calibration and test rows come from (rows per state)

| product | split | Karnataka | Maharashtra |
|---|---|---|---|
| Broken rice | calibration | 129 | 0 |
| Broken rice | test | 123 | 0 |
| Groundnut | calibration | 134 | 9 |
| Groundnut | test | 131 | 8 |
| Onion | calibration | 666 | 1363 |
| Onion | test | 664 | 1325 |
| Potato | calibration | 658 | 85 |
| Potato | test | 634 | 105 |
| Rice | calibration | 707 | 15 |
| Rice | test | 722 | 112 |
| Tomato | calibration | 1053 | 239 |
| Tomato | test | 1038 | 214 |

## Spike-flagged calibration and test rows (20)

Kept in the data. `lag1` is the last price known at t - h, for comparison.

| product | state | market | variety | date | split | price | last known (t-h) | ratio |
|---|---|---|---|---|---|---|---|---|
| Onion | Karnataka | arasikere | Common | 2026-06-15 | calibration | 70.00 | 7.00 | 10.0x |
| Onion | Karnataka | arasikere | Common | 2026-08-03 | calibration | 40.00 | 10.00 | 4.0x |
| Onion | Karnataka | hassan | Common | 2026-09-08 | test | 10.00 | 30.14 | 0.3x |
| Onion | Karnataka | hassan | Common | 2026-09-25 | test | 10.28 | 26.00 | 0.4x |
| Potato | Karnataka | chickkaballapura | Common | 2026-06-12 | calibration | 3.00 | 10.00 | 0.3x |
| Potato | Karnataka | kolar | Common | 2026-07-05 | calibration | 110.00 | 11.00 | 10.0x |
| Potato | Karnataka | hassan | Common | 2026-11-16 | test | 39.99 | 10.00 | 4.0x |
| Rice | Karnataka | mysuru | Fine | 2026-05-22 | calibration | 74.50 | 49.00 | 1.5x |
| Rice | Karnataka | mysuru | Fine | 2026-05-27 | calibration | 72.90 | 77.50 | 0.9x |
| Rice | Karnataka | chintamani | Sona | 2026-10-22 | test | 21.80 | 70.00 | 0.3x |
| Tomato | Karnataka | srinivasapur | Common | 2026-07-05 | calibration | 5.33 | 10.00 | 0.5x |
| Tomato | Karnataka | tumakuru | Common | 2026-07-17 | calibration | 5.00 | 14.50 | 0.3x |
| Tomato | Karnataka | tumakuru | Common | 2026-07-18 | calibration | 5.10 | 14.50 | 0.4x |
| Tomato | Karnataka | belgaum | Common | 2026-09-07 | test | 2.00 | 12.50 | 0.2x |
| Tomato | Karnataka | belur | Hybrid | 2026-09-09 | test | 39.03 | 15.00 | 2.6x |
| Tomato | Karnataka | tumakuru | Common | 2026-10-06 | test | 24.00 | 9.60 | 2.5x |
| Tomato | Karnataka | tumakuru | Common | 2026-10-07 | test | 26.00 | 9.60 | 2.7x |
| Tomato | Karnataka | arasikere | Common | 2026-10-09 | test | 40.00 | 10.00 | 4.0x |
| Tomato | Maharashtra | nasik | Common | 2026-10-23 | test | 2.75 | 5.05 | 0.5x |
| Tomato | Maharashtra | pimpalgaonbaswant | Common | 2026-10-23 | test | 4.05 | 7.55 | 0.5x |

**Thin products.** Broken rice and Groundnut have only about 130 calibration and 130 test rows each, spread over about a dozen series, so their accuracy and coverage numbers will be noisy.

## Leakage checks

**Recompute from truncated data.** For sampled targets, the raw rows were cut at t - h *before* any step (daily aggregation, rolling windows, fallback choice), and the features were rebuilt and compared.

| check | result |
|---|---|
| sampled targets | 137 |
| strata (split / level: n) | calibration / market+product: 12; calibration / market+variety: 12; calibration / state+product: 12; calibration / state+variety: 12; test / market+product: 12; test / market+variety: 12; test / state+product: 5; test / state+variety: 12; train / market+product: 12; train / market+variety: 12; train / state+product: 12; train / state+variety: 12 |
| mismatched values | 0 |
| max abs difference | 0.0 |

**Boundary cases** on a hand-built series:

| check | passed |
|---|---|
| t-7 observation used as lag1 = log 20 | True |
| lag2 = log 10 (the t-9 value) | True |
| n30 = 9 (t-6 and t excluded) | True |
| med7 = log 10 (values at t-12, t-9, t-7) | True |
| days_since = 7 | True |


**Leakage checks: PASS**
