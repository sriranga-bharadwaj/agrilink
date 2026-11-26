# Phase 2: model evaluation

Generated 2026-11-26. Forecast horizon 7 days. Train 2015-01-01 to 2026-05-13 (157,061 rows), calibration 2026-05-21 to 2026-08-19 (5,058), **test 2026-08-27 to 2026-11-25 (5,076 rows, scored once)**.

## Accuracy on the test block: MAE in Rs/kg (MAPE)

Every method is scored on the same rows with the same information (prices up to t - 7).

| products | rows | series | Gradient boosting (ours) | Last known price | 30-day median | Same period last year* | Ridge regression |
|---|---|---|---|---|---|---|---|
| All products | 5076 | 183 | 4.41 (15%) | 4.29 (16%) | 4.79 (16%) | 9.14 (29%) | 4.87 (16%) |
| Broken rice | 123 | 12 | 2.54 (9%) | 2.96 (11%) | 2.12 (7%) | 4.20 (17%) | 2.74 (11%) |
| Groundnut | 139 | 13 | 7.99 (12%) | 7.68 (12%) | 7.19 (11%) | 8.59 (14%) | 7.74 (12%) |
| Onion | 1989 | 59 | 4.26 (12%) | 3.85 (11%) | 5.51 (15%) | 10.80 (27%) | 5.34 (14%) |
| Potato | 739 | 22 | 2.08 (11%) | 2.32 (13%) | 2.05 (11%) | 5.10 (30%) | 2.21 (12%) |
| Rice | 834 | 47 | 7.69 (15%) | 7.63 (18%) | 7.29 (15%) | 14.17 (25%) | 7.95 (17%) |
| Tomato | 1252 | 30 | 3.62 (23%) | 3.68 (24%) | 3.61 (24%) | 6.10 (38%) | 3.54 (23%) |

\* Same period last year falls back to the last known price where last year is missing (35% of test rows).

## Is the model really better? (per-series cluster bootstrap, 2,000 resamples)

The comparison baseline is the best one **on the calibration block**, so the test block is not used to pick it. Negative = model has lower error.

| products | compared with (chosen on calibration) | MAE difference, Rs/kg (model - baseline) | 95% CI | verdict | served by |
|---|---|---|---|---|---|
| All products | Last known price | +0.12 | [-0.13, +0.39] | no clear difference |  |
| Broken rice | 30-day median | +0.42 | [+0.14, +0.84] | baseline better | 30-day median |
| Groundnut | 30-day median | +0.81 | [+0.00, +2.69] | baseline better | Gradient boosting (ours) |
| Onion | Last known price | +0.41 | [+0.25, +0.60] | baseline better | Gradient boosting (ours) |
| Potato | 30-day median | +0.03 | [-0.27, +0.37] | no clear difference | Gradient boosting (ours) |
| Rice | 30-day median | +0.40 | [-0.11, +0.90] | no clear difference | Gradient boosting (ours) |
| Tomato | Last known price | -0.06 | [-0.24, +0.16] | no clear difference | Gradient boosting (ours) |

## 80% price ranges on the test block

Raw = the 10%/90% quantile models alone. CQR = conformalized on the calibration block. Coverage on future data can differ from 80% because prices are not exchangeable over time.

| products | rows | raw quantile coverage | CQR coverage (target 80%) | median width (% of forecast) | CQR correction |
|---|---|---|---|---|---|
| All products | 5076 | 74% | 83% | 48% | pooled |
| Broken rice | 123 | 84% | 92% | 38% | pooled |
| Groundnut | 139 | 70% | 76% | 32% | pooled |
| Onion | 1989 | 75% | 88% | 45% | per product |
| Potato | 739 | 81% | 84% | 39% | per product |
| Rice | 834 | 65% | 78% | 34% | per product |
| Tomato | 1252 | 75% | 78% | 70% | per product |

## Model selection (rolling-origin validation inside the training window)

3 folds of 91 days at the end of the training window, each fitted on data ending 8 days before the fold. Learning rate 0.05, absolute-error loss.

| max_iter | max_leaf_nodes | min_samples_leaf | cv_mae | fold_maes |
|---|---|---|---|---|
| 600 | 31 | 200 | 3.059874557507912 | [2.791, 3.572, 2.817] |
| 300 | 31 | 200 | 3.070148757400091 | [2.801, 3.591, 2.819] |
| 600 | 31 | 50 | 3.08340655140195 | [2.821, 3.617, 2.812] |
| 300 | 31 | 50 | 3.0885085504793928 | [2.831, 3.622, 2.812] |
| 600 | 15 | 200 | 3.1149016721444323 | [2.839, 3.683, 2.822] |
| 300 | 15 | 200 | 3.120997622078018 | [2.843, 3.692, 2.828] |
| 600 | 15 | 50 | 3.123260890421948 | [2.836, 3.702, 2.832] |
| 300 | 15 | 50 | 3.124338789238543 | [2.837, 3.703, 2.834] |

Ridge alpha chosen the same way: 100.0 (0.1: 3.244, 1.0: 3.244, 10.0: 3.243, 100.0: 3.242).

