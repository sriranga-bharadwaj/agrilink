# AgriLink price model (ml/)

Offline pipeline behind the **Suggest a price** button. It trains on real government mandi (wholesale) prices from Agmarknet and exports ONNX models that the Next.js app runs with `onnxruntime-node`. Python is needed only to reproduce the model. Docker and CI use the committed outputs in `web/models/` and `web/data/`.

## What the app shows, and why

The app shows a **simple baseline as the suggested price**, plus the **model's calibrated 80% range**:
- **Baseline:** the last known mandi price, or the 30-day median. For each product, whichever scored better on the calibration months.
- **Range:** what the gradient-boosting model contributes.

In an honest comparison, the model **did not beat** "last week's price" a week ahead, but its calibrated range covered 83% of actual prices in held-out months. The numbers are in [reports/model_eval.md](reports/model_eval.md) and [reports/model_eval_details.md](reports/model_eval_details.md).

## Reproduce

Requires Python 3.12, plus a free [data.gov.in](https://data.gov.in) account if you want the API.

```bash
python -m venv ml/.venv
ml/.venv/Scripts/python -m pip install -r ml/requirements.txt
```

**1. Get the data.**
- The data.gov.in API returned HTTP 502 throughout this project; see [reports/api_notes.md](reports/api_notes.md).
- So the data came from the dataset page instead: [Variety-wise Daily Market Prices Data of Commodity](https://data.gov.in/resource/variety-wise-daily-market-prices-data-commodity), exported as CSV, one file per district.
- Put the CSVs in `ml/data/` (git-ignored). The exports used here covered Kolar, Chikkaballapur, Hassan, Mandya, Belagavi, Chikmagalur, Bengaluru, Mysuru, Tumakuru, Nashik and Thane.
- For the API route, put `DATA_GOV_IN_API_KEY=...` in `ml/.env` (git-ignored) and run `python ml/probe_api.py`.

**2. Run the pipeline in order.** Each step writes a report.

| Step | Script | Output |
|---|---|---|
| Phase 0 gate: coverage, gaps, varieties, data quality, go/no-go | `validate_data.py` | `reports/data_coverage.md` |
| Phase 1 dataset: cleaning, variety groups, 7-day-ahead features, splits, leakage checks | `build_dataset.py` | `reports/dataset_report.md`, `artifacts/phase1.json` |
| Phase 2 model: tuning, CQR ranges, baselines, bootstrap CIs | `train.py` | `reports/model_eval.md`, `artifacts/phase2.json` |
| Decision details from the trained models (no retraining) | `evaluate_details.py` | `reports/model_eval_details.md` |
| ONNX export and full-test-set check against sklearn | `export_onnx.py` | `web/models/*.onnx`, `web/models/price_model.json`, `reports/onnx_export.md` |
| Cleaned recent rows for serving (loaded into MySQL `mandi_prices`) | `export_serving_data.py` | `web/data/mandi_prices.csv` |

Run each with `ml/.venv/Scripts/python ml/<script>`.

## Design rules

1. **No time leakage.**
   - The model forecasts **7 days ahead**, and every feature uses only prices dated on or before *t − 7*.
   - Variety groups are fitted on the training window only.
   - The market premium is a rolling as-of value.
   - Train, calibration and test are split by date, with 7-day gaps between them.
   - A check rebuilds sampled features from data truncated at *t − 7* (before any processing) and compares them; there are also boundary tests.
   - The app repeats the same checks in `web/tests/pricing.test.mjs`.
2. **Categorical encoding.**
   - Product, state, variety group and feature level are one-hot encoded inside the sklearn pipeline, so the ONNX graph contains the encoding.
   - Markets are never ordinal codes. They enter as a learned price premium over the state.
3. **Variety-aware data.**
   - Series never mix products (Rice vs Broken rice, toor dal vs whole toor) or variety groups.
   - Features fall back from market+variety to market, then state+variety, then state.
4. **Calibrated ranges.** Conformalized quantile regression is calibrated on its own date block, and actual coverage is reported on held-out future months.
5. **Honest baselines.**
   - The four baselines are scored on identical rows with the same information.
   - Each baseline used for comparison was chosen on calibration, not on test, and comes with a per-series cluster bootstrap 95% CI.
   - The test block was scored once.

## Data cleaning decisions

- **Dropped:**
  - modal price outside [min, max]
  - Non-FAQ (below-standard) grade
  - prices outside ₹0.5–₹1000/kg
  - prices more than 8× away from the series' previous-30-day median
- Every drop rule looks only backwards in time and is applied identically to all splits. The 8× rule was the user's choice, and it removed 9 Belagavi tomato days from the test block.
- **Merged:** markets renamed in late 2025 ("Kolar" → "Kolar APMC") and spelling variants are merged under one market key.

## Data licence

Agmarknet prices published on data.gov.in under the [Government Open Data License – India](https://data.gov.in/government-open-data-license-india). Source: Directorate of Marketing & Inspection, Ministry of Agriculture & Farmers Welfare, Government of India.
