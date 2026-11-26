"""Phase 2 addendum: details for the serving decision, computed from the already-trained models
(nothing is retrained or re-tuned). Writes ml/reports/model_eval_details.md.
Usage: ml/.venv/Scripts/python ml/evaluate_details.py
"""
import json
import pickle
from pathlib import Path

import numpy as np
import pandas as pd

from train import BASELINES, LABELS, X, add_derived, cluster_bootstrap, predictions
from validate_data import table

ML = Path(__file__).resolve().parent
P2 = json.loads((ML / "artifacts" / "phase2.json").read_text(encoding="utf-8"))


def main():
    with open(ML / "data" / "models.pkl", "rb") as f:
        models = pickle.load(f)
    data = add_derived(pd.read_pickle(ML / "data" / "dataset.pkl"))
    test = data[data["split"] == "test"].reset_index(drop=True)
    preds = predictions(test, models)
    y, y_log = test["target_price"].to_numpy(), test["target_log_price"].to_numpy()
    choice = P2["serving_choice"]
    cqr = P2["cqr_log_correction"]

    served = np.array([preds[choice[p]["serve"]][i] for i, p in enumerate(test["product"])])
    lo = test["lag1"].to_numpy() + models["q10"].predict(X(test)) - test["product"].map(cqr).to_numpy()
    hi = test["lag1"].to_numpy() + models["q90"].predict(X(test)) + test["product"].map(cqr).to_numpy()

    md = ["# Phase 2: details for the serving decision\n",
          "Computed from the trained models; nothing was retrained or re-tuned after the test block was scored.\n",
          "## Calibration block: MAE in Rs/kg (this is what chose model vs baseline per product)\n"]
    md.append(table([{"product": p, **{LABELS[k]: f"{v:.2f}" for k, v in c["calibration_mae"].items()},
                      "rule picked": LABELS[c["serve"]]} for p, c in sorted(choice.items())],
                    ["product"] + [LABELS[k] for k in ["model"] + BASELINES] + ["rule picked"]))

    md.append("## Test block: the mix the app would serve (rule fixed before the test was scored)\n")
    rows = []
    for name, idx in [("All products", test.index)] + sorted(test.groupby("product").groups.items()):
        rows.append({"products": name, "served mix": f"{np.mean(np.abs(np.exp(served[idx]) - y[idx])):.2f}",
                     "model everywhere": f"{np.mean(np.abs(np.exp(preds['model'][idx]) - y[idx])):.2f}",
                     "last known price everywhere": f"{np.mean(np.abs(np.exp(preds['persistence'][idx]) - y[idx])):.2f}",
                     "30-day median everywhere": f"{np.mean(np.abs(np.exp(preds['median30'][idx]) - y[idx])):.2f}"})
    md.append(table(rows, ["products", "served mix", "model everywhere", "last known price everywhere",
                           "30-day median everywhere"]))

    md.append("## Groundnut, more decimals\n")
    g = test[test["product"] == "Groundnut"].index
    d, l, h = cluster_bootstrap(test.loc[g], preds["model"][g], preds["median30"][g])
    md.append(f"Model minus 30-day median: {d:+.3f} Rs/kg, 95% CI [{l:+.3f}, {h:+.3f}] over "
              f"{test.loc[g, ['market_key', 'vgroup', 'State']].drop_duplicates().shape[0]} series: **marginal**; "
              "the lower bound sits at zero.\n")

    md.append("## Does the range still cover the price when a baseline is shown as the suggestion?\n")
    md.append("The 80% range is for the actual price, so it stays valid whichever point is shown. "
              "This counts how often the shown point itself falls outside its range.\n")
    cov = []
    for p, idx in sorted(test.groupby("product").groups.items()):
        cov.append({"product": p, "shown point": LABELS[choice[p]["serve"]],
                    "point outside range": f"{np.mean((served[idx] < lo[idx]) | (served[idx] > hi[idx])):.1%}",
                    "actual price inside range": f"{np.mean((y_log[idx] >= lo[idx]) & (y_log[idx] <= hi[idx])):.0%}",
                    "median range width (% of shown point)": f"{np.median((np.exp(hi[idx]) - np.exp(lo[idx])) / np.exp(served[idx])):.0%}"})
    md.append(table(cov, ["product", "shown point", "point outside range", "actual price inside range",
                          "median range width (% of shown point)"]))

    # The serving rule the user chose after seeing the test results.
    pick = {p: min(["persistence", "median30"], key=lambda b: c["calibration_mae"][b]) for p, c in choice.items()}
    shown = np.array([preds[pick[p]][i] for i, p in enumerate(test["product"])])
    md.append("## Serving decision (user, after the test block was scored)\n")
    md.append("The app shows a **simple baseline as the suggested price** and the **model's CQR 80% range**. Per "
              "product the baseline is whichever of last known price / 30-day median scored better on the "
              "calibration block. Because the decision came after seeing the test results, the test numbers "
              "below describe this choice but are **not an unbiased estimate** of it.\n")
    rows = []
    for name, idx in [("All products", test.index)] + sorted(test.groupby("product").groups.items()):
        rows.append({"products": name,
                     "baseline shown": "per product" if name == "All products" else LABELS[pick[name]],
                     "test MAE Rs/kg": f"{np.mean(np.abs(np.exp(shown[idx]) - y[idx])):.2f}",
                     "shown point outside range": f"{np.mean((shown[idx] < lo[idx]) | (shown[idx] > hi[idx])):.1%}",
                     "actual price inside range": f"{np.mean((y_log[idx] >= lo[idx]) & (y_log[idx] <= hi[idx])):.0%}"})
    md.append(table(rows, ["products", "baseline shown", "test MAE Rs/kg", "shown point outside range",
                           "actual price inside range"]))

    md.append("## Caveats\n")
    md += ["- **Thin products.** Broken rice (12 series) and Groundnut (13 series) verdicts are indicative only: "
           "a bootstrap over so few series tends to give intervals that are too narrow.",
           "- **Removed rows.** The test block excludes 9 Belagavi tomato days (27 Oct to 18 Nov 2026) under the "
           "8x-jump rule chosen in Phase 1.",
           "- **Ranges are wide.** 80% coverage comes with a median width of about half the forecast (70% for Tomato): "
           "honest about how volatile mandi prices are a week ahead, but not a tight prediction.",
           "- **The test block is now spent.** Any change to the model, features or serving rule must be judged on "
           "months that have not been scored yet.",
           "- **ONNX in the app is not verified yet.** The export was checked in Python's onnxruntime only; the "
           "Node runtime check is part of Phase 5."]
    (ML / "reports" / "model_eval_details.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
