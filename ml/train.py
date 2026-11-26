"""Phase 2: train the 7-day-ahead price model, calibrate its ranges and compare it honestly with baselines.

- The model predicts the log change from the last known price (as of t - 7). Point forecast:
  gradient boosting with absolute-error loss (the median). Ranges: two quantile models (10% / 90%).
- Hyperparameters are chosen by rolling-origin validation inside the training window only.
- The ranges are conformalized (CQR) on the calibration block for 80% nominal coverage.
- Whether each product is served by the model or by a baseline is decided on the calibration block.
- The test block is scored once, at the end: model and all baselines on identical rows, with a
  cluster (per-series) bootstrap 95% CI for the error difference, plus interval coverage.
Writes ml/reports/model_eval.md and ml/artifacts/phase2.json; the fitted pipelines go to ml/data/models.pkl.
Usage: ml/.venv/Scripts/python ml/train.py
"""
import itertools
import json
import pickle
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline, make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from build_dataset import SERIES
from validate_data import table

ML = Path(__file__).resolve().parent
P1 = json.loads((ML / "artifacts" / "phase1.json").read_text(encoding="utf-8"))
H = P1["horizon_days"]
ALPHA = 0.2                                   # 80% ranges
CQR_MIN_ROWS = 200                            # per-product CQR correction needs this many calibration rows
FOLDS, FOLD_DAYS = 3, 91
GRID = {"max_iter": [300, 600], "max_leaf_nodes": [15, 31], "min_samples_leaf": [50, 200]}
BOOT = 2000
SEED = 13

CAT = P1["categorical_features"]
# Raw as-of features plus their differences from the last known price (computed the same way when serving).
DIFFS = {"d_lag2": "lag2", "d_med7": "med7", "d_med30": "med30", "d_med90": "med90",
         "d_state30": "state_med30", "d_yoy": "yoy"}
NUM = ["lag1", "vol30", "n30", "days_since", "yoy_missing", "month_sin", "month_cos", "doy_sin", "doy_cos",
       "market_premium"] + list(DIFFS)


def add_derived(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    for new, col in DIFFS.items():
        df[new] = df[col] - df["lag1"]
    df["delta"] = df["target_log_price"] - df["lag1"]
    return df


def X(df):
    return df[CAT + NUM]


def onehot():
    return OneHotEncoder(handle_unknown="ignore", sparse_output=False)


def gbm(loss="absolute_error", quantile=None, **hp):
    kw = dict(loss=loss, learning_rate=0.05, early_stopping=False, random_state=SEED, **hp)
    if quantile is not None:
        kw["quantile"] = quantile
    return Pipeline([("prep", ColumnTransformer([("cat", onehot(), CAT)], remainder="passthrough")),
                     ("model", HistGradientBoostingRegressor(**kw))])


def ridge(alpha):
    num = make_pipeline(SimpleImputer(strategy="median"), StandardScaler())
    return Pipeline([("prep", ColumnTransformer([("cat", onehot(), CAT), ("num", num, NUM)])),
                     ("model", Ridge(alpha=alpha))])


def mae_rs(df, log_pred):
    return float(np.mean(np.abs(np.exp(log_pred) - df["target_price"].values)))


def folds(train: pd.DataFrame):
    end = train["date"].max()
    for k in range(FOLDS, 0, -1):
        v_end = end - pd.Timedelta(days=(k - 1) * FOLD_DAYS)
        v_start = v_end - pd.Timedelta(days=FOLD_DAYS - 1)
        fit = train[train["date"] <= v_start - pd.Timedelta(days=H + 1)]
        val = train[train["date"].between(v_start, v_end)]
        yield fit, val


def tune(train):
    results = []
    for values in itertools.product(*GRID.values()):
        hp = dict(zip(GRID, values))
        err = [mae_rs(val, val["lag1"].values + gbm(**hp).fit(X(fit), fit["delta"]).predict(X(val)))
               for fit, val in folds(train)]
        results.append({**hp, "cv_mae": float(np.mean(err)), "fold_maes": [round(e, 3) for e in err]})
        print("gbm", hp, round(np.mean(err), 3))
    best = min(results, key=lambda r: r["cv_mae"])
    ridge_res = []
    for a in [0.1, 1.0, 10.0, 100.0]:
        err = [mae_rs(val, val["lag1"].values + ridge(a).fit(X(fit), fit["delta"]).predict(X(val)))
               for fit, val in folds(train)]
        ridge_res.append({"alpha": a, "cv_mae": float(np.mean(err))})
    best_ridge = min(ridge_res, key=lambda r: r["cv_mae"])
    return {k: best[k] for k in GRID}, results, best_ridge["alpha"], ridge_res


def predictions(df, models) -> dict:
    """Log-price predictions of every method for the rows of df."""
    base = df["lag1"].values
    return {
        "model": base + models["point"].predict(X(df)),
        "persistence": base,
        "median30": df["med30"].values,
        "seasonal": np.where(df["yoy"].notna(), df["yoy"].values, base),
        "ridge": base + models["ridge"].predict(X(df)),
    }


BASELINES = ["persistence", "median30", "seasonal", "ridge"]
LABELS = {"model": "Gradient boosting (ours)", "persistence": "Last known price",
          "median30": "30-day median", "seasonal": "Same period last year*", "ridge": "Ridge regression"}


def scores(df, preds):
    y = df["target_price"].values
    out = {}
    for name, p in preds.items():
        err = np.abs(np.exp(p) - y)
        out[name] = {"mae": float(err.mean()), "mape": float(np.mean(err / y)) * 100}
    return out


def cluster_bootstrap(df, a, b, reps=BOOT, seed=SEED):
    """95% CI of mean(|err_a| - |err_b|) in Rs/kg, resampling whole series (keeps within-series correlation)."""
    y = df["target_price"].values
    d = np.abs(np.exp(a) - y) - np.abs(np.exp(b) - y)
    ids = df[SERIES].astype(str).agg("|".join, axis=1).values
    uniq, inv = np.unique(ids, return_inverse=True)
    sums, counts = np.bincount(inv, d), np.bincount(inv)
    rng = np.random.default_rng(seed)
    stats = []
    for _ in range(reps):
        pick = rng.integers(0, len(uniq), len(uniq))
        stats.append(sums[pick].sum() / counts[pick].sum())
    return float(d.mean()), float(np.percentile(stats, 2.5)), float(np.percentile(stats, 97.5))


def main():
    data = add_derived(pd.read_pickle(ML / "data" / "dataset.pkl"))
    train, cal, test = (data[data["split"] == s].reset_index(drop=True) for s in ["train", "calibration", "test"])
    print(f"train {len(train):,} | calibration {len(cal):,} | test {len(test):,}")

    hp, grid_results, ridge_alpha, ridge_results = tune(train)
    print("chosen", hp, "ridge alpha", ridge_alpha)
    models = {
        "point": gbm(**hp).fit(X(train), train["delta"]),
        "q10": gbm(loss="quantile", quantile=ALPHA / 2, **hp).fit(X(train), train["delta"]),
        "q90": gbm(loss="quantile", quantile=1 - ALPHA / 2, **hp).fit(X(train), train["delta"]),
        "ridge": ridge(ridge_alpha).fit(X(train), train["delta"]),
    }

    # ---- CQR on the calibration block (log space)
    def raw_interval(df):
        return df["lag1"].values + models["q10"].predict(X(df)), df["lag1"].values + models["q90"].predict(X(df))

    lo_c, hi_c = raw_interval(cal)
    conf = np.maximum(lo_c - cal["target_log_price"].values, cal["target_log_price"].values - hi_c)

    def cqr_q(s):
        n = len(s)
        return float(np.quantile(s, min(1.0, np.ceil((n + 1) * (1 - ALPHA)) / n), method="higher"))

    pooled_q = cqr_q(conf)
    cqr = {"pooled": pooled_q}
    for p, idx in cal.groupby("product").groups.items():
        cqr[p] = cqr_q(conf[idx]) if len(idx) >= CQR_MIN_ROWS else pooled_q

    # ---- serving choice per product, decided on the calibration block
    cal_preds = predictions(cal, models)
    choice = {}
    for p, idx in cal.groupby("product").groups.items():
        s = scores(cal.loc[idx], {k: v[idx] for k, v in cal_preds.items()})
        best_base = min(BASELINES, key=lambda b: s[b]["mae"])
        choice[p] = {"serve": "model" if s["model"]["mae"] < s[best_base]["mae"] else best_base,
                     "best_baseline_on_calibration": best_base,
                     "calibration_mae": {k: round(v["mae"], 3) for k, v in s.items()}}

    # ---- the one-time test evaluation
    test_preds = predictions(test, models)
    lo_t, hi_t = raw_interval(test)
    q_row = test["product"].map(lambda p: cqr.get(p, pooled_q)).values
    lo_cqr, hi_cqr = lo_t - q_row, hi_t + q_row
    y_log = test["target_log_price"].values

    rows, cis, cover = [], [], []
    groups = [("All products", test.index)] + sorted(test.groupby("product").groups.items())
    for name, idx in groups:
        sub = test.loc[idx]
        s = scores(sub, {k: v[idx] for k, v in test_preds.items()})
        best_base = choice[name]["best_baseline_on_calibration"] if name in choice else \
            min(BASELINES, key=lambda b: scores(cal, {b: cal_preds[b]})[b]["mae"])
        mean_d, lo, hi = cluster_bootstrap(sub, test_preds["model"][idx], test_preds[best_base][idx])
        rows.append({"products": name, "rows": len(sub), "series": sub[SERIES].drop_duplicates().shape[0],
                     **{LABELS[k]: f"{s[k]['mae']:.2f} ({s[k]['mape']:.0f}%)" for k in ["model"] + BASELINES}})
        cis.append({"products": name, "compared with (chosen on calibration)": LABELS[best_base],
                    "MAE difference, Rs/kg (model - baseline)": f"{mean_d:+.2f}",
                    "95% CI": f"[{lo:+.2f}, {hi:+.2f}]",
                    "verdict": "model better" if hi < 0 else ("baseline better" if lo > 0 else "no clear difference"),
                    "served by": LABELS[choice[name]["serve"]] if name in choice else ""})
        inside_raw = (y_log[idx] >= lo_t[idx]) & (y_log[idx] <= hi_t[idx])
        inside = (y_log[idx] >= lo_cqr[idx]) & (y_log[idx] <= hi_cqr[idx])
        width = np.median((np.exp(hi_cqr[idx]) - np.exp(lo_cqr[idx])) / np.exp(test_preds["model"][idx]))
        cover.append({"products": name, "rows": len(sub), "raw quantile coverage": f"{inside_raw.mean():.0%}",
                      "CQR coverage (target 80%)": f"{inside.mean():.0%}",
                      "median width (% of forecast)": f"{width:.0%}",
                      "CQR correction": "pooled" if name not in cqr or cqr.get(name) == pooled_q else "per product"})

    # ---- persist
    with open(ML / "data" / "models.pkl", "wb") as f:
        pickle.dump(models, f)
    (ML / "artifacts" / "phase2.json").write_text(json.dumps({
        "alpha": ALPHA, "hyperparameters": hp, "ridge_alpha": ridge_alpha, "cqr_log_correction": cqr,
        "serving_choice": choice, "numeric_features": NUM, "categorical_features": CAT, "derived": DIFFS,
        "target": "log(price_t) - lag1", "train_rows": len(train), "calibration_rows": len(cal), "test_rows": len(test),
    }, indent=2), encoding="utf-8")

    sp = P1["splits"]
    md = ["# Phase 2: model evaluation\n",
          f"Generated {date.today()}. Forecast horizon {H} days. Train {sp['train'][0]} to {sp['train'][1]} "
          f"({len(train):,} rows), calibration {sp['calibration'][0]} to {sp['calibration'][1]} ({len(cal):,}), "
          f"**test {sp['test'][0]} to {sp['test'][1]} ({len(test):,} rows, scored once)**.\n",
          "## Accuracy on the test block: MAE in Rs/kg (MAPE)\n",
          "Every method is scored on the same rows with the same information (prices up to t - 7).\n",
          table(rows, ["products", "rows", "series"] + [LABELS[k] for k in ["model"] + BASELINES]),
          "\\* Same period last year falls back to the last known price where last year is missing "
          f"({test['yoy'].isna().mean():.0%} of test rows).\n",
          "## Is the model really better? (per-series cluster bootstrap, "
          f"{BOOT:,} resamples)\n",
          "The comparison baseline is the best one **on the calibration block**, so the test block is not used "
          "to pick it. Negative = model has lower error.\n",
          table(cis, ["products", "compared with (chosen on calibration)", "MAE difference, Rs/kg (model - baseline)",
                      "95% CI", "verdict", "served by"]),
          "## 80% price ranges on the test block\n",
          "Raw = the 10%/90% quantile models alone. CQR = conformalized on the calibration block. Coverage on "
          "future data can differ from 80% because prices are not exchangeable over time.\n",
          table(cover, ["products", "rows", "raw quantile coverage", "CQR coverage (target 80%)",
                        "median width (% of forecast)", "CQR correction"]),
          "## Model selection (rolling-origin validation inside the training window)\n",
          f"{FOLDS} folds of {FOLD_DAYS} days at the end of the training window, each fitted on data ending "
          f"{H + 1} days before the fold. Learning rate 0.05, absolute-error loss.\n",
          table(sorted(grid_results, key=lambda r: r["cv_mae"]), list(GRID) + ["cv_mae", "fold_maes"]),
          f"Ridge alpha chosen the same way: {ridge_alpha} "
          f"({', '.join(f'{r['alpha']}: {r['cv_mae']:.3f}' for r in ridge_results)}).\n"]
    (ML / "reports" / "model_eval.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md[3:9]))


if __name__ == "__main__":
    main()
