# Phase 2: details for the serving decision

Computed from the trained models; nothing was retrained or re-tuned after the test block was scored.

## Calibration block: MAE in Rs/kg (this is what chose model vs baseline per product)

| product | Gradient boosting (ours) | Last known price | 30-day median | Same period last year* | Ridge regression | rule picked |
|---|---|---|---|---|---|---|
| Broken rice | 1.85 | 1.91 | 1.74 | 3.48 | 2.10 | 30-day median |
| Groundnut | 5.76 | 6.67 | 6.25 | 6.67 | 6.72 | Gradient boosting (ours) |
| Onion | 2.35 | 2.38 | 3.80 | 3.49 | 2.62 | Gradient boosting (ours) |
| Potato | 1.92 | 2.21 | 2.02 | 5.42 | 2.12 | Gradient boosting (ours) |
| Rice | 6.69 | 7.10 | 6.97 | 9.11 | 7.07 | Gradient boosting (ours) |
| Tomato | 3.38 | 3.42 | 4.69 | 10.41 | 3.47 | Gradient boosting (ours) |

## Test block: the mix the app would serve (rule fixed before the test was scored)

| products | served mix | model everywhere | last known price everywhere | 30-day median everywhere |
|---|---|---|---|---|
| All products | 4.40 | 4.41 | 4.29 | 4.79 |
| Broken rice | 2.12 | 2.54 | 2.96 | 2.12 |
| Groundnut | 7.99 | 7.99 | 7.68 | 7.19 |
| Onion | 4.26 | 4.26 | 3.85 | 5.51 |
| Potato | 2.08 | 2.08 | 2.32 | 2.05 |
| Rice | 7.69 | 7.69 | 7.63 | 7.29 |
| Tomato | 3.62 | 3.62 | 3.68 | 3.61 |

## Groundnut, more decimals

Model minus 30-day median: +0.808 Rs/kg, 95% CI [+0.005, +2.689] over 13 series: **marginal**; the lower bound sits at zero.

## Does the range still cover the price when a baseline is shown as the suggestion?

The 80% range is for the actual price, so it stays valid whichever point is shown. This counts how often the shown point itself falls outside its range.

| product | shown point | point outside range | actual price inside range | median range width (% of shown point) |
|---|---|---|---|---|
| Broken rice | 30-day median | 0.0% | 92% | 38% |
| Groundnut | Gradient boosting (ours) | 0.0% | 76% | 32% |
| Onion | Gradient boosting (ours) | 0.0% | 88% | 45% |
| Potato | Gradient boosting (ours) | 0.9% | 84% | 39% |
| Rice | Gradient boosting (ours) | 0.2% | 78% | 34% |
| Tomato | Gradient boosting (ours) | 0.0% | 78% | 70% |

## Serving decision (user, after the test block was scored)

The app shows a **simple baseline as the suggested price** and the **model's CQR 80% range**. Per product the baseline is whichever of last known price / 30-day median scored better on the calibration block. Because the decision came after seeing the test results, the test numbers below describe this choice but are **not an unbiased estimate** of it.

| products | baseline shown | test MAE Rs/kg | shown point outside range | actual price inside range |
|---|---|---|---|---|
| All products | per product | 4.16 | 2.0% | 83% |
| Broken rice | 30-day median | 2.12 | 0.0% | 92% |
| Groundnut | 30-day median | 7.19 | 2.9% | 76% |
| Onion | Last known price | 3.85 | 0.9% | 88% |
| Potato | 30-day median | 2.05 | 5.7% | 84% |
| Rice | 30-day median | 7.29 | 4.2% | 78% |
| Tomato | Last known price | 3.68 | 0.2% | 78% |

## Caveats

- **Thin products.** Broken rice (12 series) and Groundnut (13 series) verdicts are indicative only: a bootstrap over so few series tends to give intervals that are too narrow.
- **Removed rows.** The test block excludes 9 Belagavi tomato days (27 Oct to 18 Nov 2026) under the 8x-jump rule chosen in Phase 1.
- **Ranges are wide.** 80% coverage comes with a median width of about half the forecast (70% for Tomato): honest about how volatile mandi prices are a week ahead, but not a tight prediction.
- **The test block is now spent.** Any change to the model, features or serving rule must be judged on months that have not been scored yet.
- **ONNX in the app is not verified yet.** The export was checked in Python's onnxruntime only; the Node runtime check is part of Phase 5.
