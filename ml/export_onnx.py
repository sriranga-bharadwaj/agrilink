"""Phase 2 export: the fitted point / q10 / q90 pipelines (one-hot encoding included) to ONNX for the
Next.js app, plus web/models/price_model.json with everything serving needs and parity examples.
Each ONNX model is checked against sklearn on the parity rows before anything is written.
Usage: ml/.venv/Scripts/python ml/export_onnx.py
"""
import json
import pickle
from pathlib import Path

import numpy as np
import onnxruntime as ort
import pandas as pd
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType, StringTensorType

from train import CAT, DIFFS, NUM, X, add_derived

import onnx.helper as onnx_helper

# skl2onnx 1.20 + scikit-learn 1.9 pass numpy booleans in integer attribute lists (e.g. which branch
# missing values follow), which onnx rejects. Cast them to 0/1; the parity check below verifies the result.
_make_attribute = onnx_helper.make_attribute


def _make_attribute_bools_as_ints(key, value, *args, **kwargs):
    if isinstance(value, (list, tuple, np.ndarray)) and any(isinstance(v, (bool, np.bool_)) for v in value):
        value = [int(v) for v in value]
    return _make_attribute(key, value, *args, **kwargs)


onnx_helper.make_attribute = _make_attribute_bools_as_ints

ML = Path(__file__).resolve().parent
OUT = ML.parent / "web" / "models"
P1 = json.loads((ML / "artifacts" / "phase1.json").read_text(encoding="utf-8"))
P2 = json.loads((ML / "artifacts" / "phase2.json").read_text(encoding="utf-8"))
OPSET = {"": 17, "ai.onnx.ml": 3}
BASE_NUMERIC = ["lag1", "lag2", "med7", "med30", "med90", "vol30", "n30", "days_since", "state_med30", "yoy",
                "yoy_missing", "month_sin", "month_cos", "doy_sin", "doy_cos", "market_premium"]


def onnx_inputs(df: pd.DataFrame) -> dict:
    feeds = {c: df[c].astype(str).to_numpy().reshape(-1, 1) for c in CAT}
    feeds.update({c: df[c].to_numpy(dtype=np.float32).reshape(-1, 1) for c in NUM})
    return feeds


def main():
    with open(ML / "data" / "models.pkl", "rb") as f:
        models = pickle.load(f)
    data = add_derived(pd.read_pickle(ML / "data" / "dataset.pkl"))
    test = data[data["split"] == "test"]

    # Parity rows: every product, every feature level, and rows with missing values.
    parity = pd.concat([
        test.groupby("product", group_keys=False).apply(lambda g: g.sample(min(3, len(g)), random_state=1)),
        test.groupby("feature_level", group_keys=False).apply(lambda g: g.sample(min(2, len(g)), random_state=2)),
        test[test["yoy"].isna()].sample(4, random_state=3),
        test[test["state_med30"].isna()].head(2),
    ]).drop_duplicates(SERIES_DATE := ["product", "vgroup", "State", "market_key", "date"])

    # ONNX tree ensembles store split thresholds in float32 (skl2onnx cannot emit a float64 version of this
    # model), so a few inputs that sit on a threshold take the other branch. The ONNX model is what the app
    # serves, so it is measured on the whole test block and its outputs are the parity ground truth.
    types = [(c, StringTensorType([None, 1])) for c in CAT] + [(c, FloatTensorType([None, 1])) for c in NUM]
    OUT.mkdir(parents=True, exist_ok=True)
    expected, report = {}, {}
    y = test["target_price"].to_numpy()
    for name in ["point", "q10", "q90"]:
        onx = convert_sklearn(models[name], initial_types=types, target_opset=OPSET)
        sess = ort.InferenceSession(onx.SerializeToString(), providers=["CPUExecutionProvider"])
        got_all = sess.run(None, onnx_inputs(test))[0].ravel()
        diff = np.abs(got_all - models[name].predict(X(test)))
        report[name] = {"test_rows": len(test), "rows_differing_over_1e-4": int((diff > 1e-4).sum()),
                        "max_abs_log_diff": float(diff.max()), "mean_abs_log_diff": float(diff.mean())}
        if name == "point":
            base = test["lag1"].to_numpy()
            report[name]["test_mae_rs_onnx"] = float(np.mean(np.abs(np.exp(base + got_all) - y)))
            report[name]["test_mae_rs_sklearn"] = float(np.mean(np.abs(np.exp(base + models[name].predict(X(test))) - y)))
        if diff.mean() > 1e-3 or diff.max() > 0.1:
            raise SystemExit(f"{name}: ONNX differs from sklearn too much {report[name]}; not exporting")
        (OUT / f"price_{name}.onnx").write_bytes(onx.SerializeToString())
        expected[name] = sess.run(None, onnx_inputs(parity))[0].ravel()
    print(json.dumps(report, indent=1))

    examples = []
    for i, (_, r) in enumerate(parity.iterrows()):
        examples.append({
            "keys": {k: r[k] for k in ["product", "vgroup", "State", "market_key", "feature_level"]},
            "date": str(r["date"].date()),
            "features": {c: (None if pd.isna(r[c]) else float(r[c])) for c in BASE_NUMERIC},
            "expected_log_change": {k: float(v[i]) for k, v in expected.items()},
            "expected_price": float(np.exp(r["lag1"] + expected["point"][i])),
        })

    (OUT / "price_model.json").write_text(json.dumps({
        "description": "7-day-ahead mandi price model (Agmarknet). Inputs are as-of features; outputs are the "
                       "log change from lag1. price = exp(lag1 + output).",
        "horizon_days": P1["horizon_days"],
        "data": {"source": "Agmarknet variety-wise daily prices via data.gov.in (Open Government Data License - India)",
                 "splits": P1["splits"]},
        "products": P1["products"],
        "levels": P1["levels"], "usable_staleness_days": P1["usable_staleness_days"], "min_n30": P1["min_n30"],
        "variety_groups": P1["variety_groups"], "market_premium": P1["market_premium"],
        "inputs": {"categorical": CAT, "numeric": NUM, "derived": DIFFS,
                   "dtype": "categorical as string [n,1], numeric as float32 [n,1]"},
        "models": {"point": "price_point.onnx", "q10": "price_q10.onnx", "q90": "price_q90.onnx"},
        "interval": {"alpha": P2["alpha"], "cqr_log_correction": P2["cqr_log_correction"]},
        "suggested_price": {
            "rule": "show a simple baseline as the suggested price and the model's CQR 80% range around the "
                    "actual price; per product the baseline is whichever of last known price / 30-day median "
                    "had the lower MAE on the calibration block",
            "decided": "by the user after the test block was scored (the model did not beat the baselines), "
                       "so the test score of this mix is not an unbiased estimate",
            "baseline": {p: min(["persistence", "median30"], key=lambda b: c["calibration_mae"][b])
                         for p, c in P2["serving_choice"].items()},
            "baseline_features": {"persistence": "lag1", "median30": "med30"},
        },
        "onnx_vs_sklearn_max_abs_diff": report,
        "parity_examples": examples,
    }, indent=2, default=str), encoding="utf-8")
    md = ["# ONNX export check\n",
          "ONNX tree ensembles keep split thresholds in float32 (skl2onnx cannot export this model in float64), so "
          "inputs that sit exactly on a threshold can take the other branch. The exported models were run on the "
          "whole test block and compared with sklearn. **The app serves the ONNX models, and its parity tests use "
          "the ONNX outputs as ground truth.**\n",
          "| model | test rows | rows differing > 1e-4 (log) | max abs diff (log) | mean abs diff (log) |",
          "|---|---|---|---|---|"]
    md += [f"| {k} | {v['test_rows']} | {v['rows_differing_over_1e-4']} | {v['max_abs_log_diff']:.4f} | "
           f"{v['mean_abs_log_diff']:.6f} |" for k, v in report.items()]
    md.append(f"\nTest MAE of the point forecast: ONNX Rs {report['point']['test_mae_rs_onnx']:.3f}/kg vs "
              f"sklearn Rs {report['point']['test_mae_rs_sklearn']:.3f}/kg.")
    (ML / "reports" / "onnx_export.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(examples)} parity examples)")


if __name__ == "__main__":
    main()
