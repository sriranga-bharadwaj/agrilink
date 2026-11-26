"""Phase 1: leakage-safe dataset for a 7-day-ahead mandi price forecast.

Target: log modal price (Rs/kg) of one series (product + variety group + state + market) on day t.
Features: only observations dated <= t - H (H = 7), so nothing the model sees could not have been
known a week before the price it predicts. Fitted pieces (variety groups, market premiums) are
learned from the training window only. Writes:
  ml/data/dataset.pkl            features + target + split (gitignored)
  ml/artifacts/phase1.json       split dates, variety groups, market premiums, feature list
  ml/reports/dataset_report.md   counts, coverage, leakage checks
Usage: ml/.venv/Scripts/python ml/build_dataset.py
"""
import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from validate_data import load, table

ML = Path(__file__).resolve().parent

H = 7                                  # forecast horizon (days)
PRODUCTS = ["Tomato", "Onion", "Potato", "Rice", "Broken rice", "Groundnut"]  # passed the Phase 0 gate
TARGET_START = pd.Timestamp("2015-01-01")
TEST_DAYS = CAL_DAYS = 91
USABLE_STALENESS = 21                  # a level is usable if its latest observation is <= 21 days before t-H
MIN_N30 = 3                            # ... and it has >= 3 observations in its 30-day window
VARIETY_MIN_ROWS = 1000                # named varieties with fewer training rows become "Other"
SPIKE_LOG = np.log(3)                  # flag (never drop) moves > 3x vs the trailing 30-day median
PREMIUM_MIN_DAYS = 30

LEVELS = {                             # fallback order: most specific first
    "market+variety": ["product", "vgroup", "State", "market_key"],
    "market+product": ["product", "State", "market_key"],
    "state+variety": ["product", "vgroup", "State"],
    "state+product": ["product", "State"],
}
SERIES = LEVELS["market+variety"]
NUMERIC = ["lag1", "lag2", "med7", "med30", "med90", "vol30", "n30", "days_since",
           "state_med30", "yoy", "yoy_missing", "month_sin", "month_cos", "doy_sin", "doy_cos", "market_premium"]
CATEGORICAL = ["product", "State", "vgroup", "feature_level"]


# ---------------------------------------------------------------- cleaning (row-local only)
def clean(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    d = df[df["product"].isin(PRODUCTS)].copy()
    counts = {"rows in scope": len(d)}
    non_faq = d["Grade"].eq("Non-FAQ")
    counts["dropped: Non-FAQ (below-standard grade)"] = int(non_faq.sum())
    d = d[~non_faq]
    bad = (d["Modal_Price"] <= 0) | (d["Modal_Price"] < d["Min_Price"]) | (d["Modal_Price"] > d["Max_Price"])
    counts["dropped: modal <= 0 or outside [min, max]"] = int(bad.sum())
    d = d[~bad & d["date"].notna()]
    d["price"] = d["Modal_Price"] / 100.0                     # Rs/quintal -> Rs/kg
    d["vraw"] = d["Variety"].astype(str).str.strip().str.lower()
    generic = {"other", "local"}
    d["generic"] = d["vraw"].isin(generic) | (d["vraw"] == d["Commodity"].str.strip().str.lower()) \
        | (d["vraw"] == d["crop"].str.lower())
    counts["rows kept"] = len(d)
    return d[["date", "State", "District", "market_key", "Market", "crop", "product", "vraw", "generic", "price"]], counts


def split_dates(end: pd.Timestamp) -> dict:
    test_start = end - pd.Timedelta(days=TEST_DAYS - 1)
    cal_end = test_start - pd.Timedelta(days=H + 1)
    cal_start = cal_end - pd.Timedelta(days=CAL_DAYS - 1)
    train_end = cal_start - pd.Timedelta(days=H + 1)
    return {"train": (TARGET_START, train_end), "calibration": (cal_start, cal_end), "test": (test_start, end)}


def fit_variety_groups(train_rows: pd.DataFrame) -> dict:
    named = train_rows[~train_rows["generic"]]
    counts = named.groupby(["product", "vraw"]).size()
    return {p: sorted(v for (pp, v), n in counts.items() if pp == p and n >= VARIETY_MIN_ROWS) for p in PRODUCTS}


def assign_vgroup(d: pd.DataFrame, groups: dict) -> pd.Series:
    keep = {(p, v) for p, vs in groups.items() for v in vs}
    return pd.Series(np.where(d["generic"], "Common",
                              [v.title() if (p, v) in keep else "Other" for p, v in zip(d["product"], d["vraw"])]),
                     index=d.index)


# ---------------------------------------------------------------- series and features
def daily(d: pd.DataFrame, keys: list[str]) -> pd.DataFrame:
    s = d.groupby(keys + ["date"], as_index=False)["price"].median()
    s["lp"] = np.log(s["price"])
    return s.sort_values(keys + ["date"]).reset_index(drop=True)


def level_stats(series: pd.DataFrame, keys: list[str]) -> pd.DataFrame:
    """Per observation date d of each series: stats over windows ending at d (inclusive)."""
    out = []
    for _, g in series.groupby(keys, sort=False):
        x = g.set_index("date")["lp"]
        r = g[keys + ["date"]].copy()
        r["lag1"] = x.values
        r["lag2"] = x.shift(1).values
        for w in (7, 30, 90):
            r[f"med{w}"] = x.rolling(f"{w}D").median().values
        r["vol30"] = x.rolling("30D", min_periods=3).std().values
        r["n30"] = x.rolling("30D").count().values
        r["yoy15"] = x.rolling("15D").median().values
        out.append(r)
    return pd.concat(out, ignore_index=True).rename(columns={"date": "obs_date"})


def asof_join(left: pd.DataFrame, stats: pd.DataFrame, keys: list[str], on: str, tolerance=None) -> pd.DataFrame:
    left = left.sort_values(on)
    right = stats.sort_values("obs_date")
    return pd.merge_asof(left, right, left_on=on, right_on="obs_date", by=keys, direction="backward",
                         tolerance=tolerance)


def build_features(rows: pd.DataFrame, targets: pd.DataFrame, premiums: dict) -> pd.DataFrame:
    """Features for `targets` (SERIES keys + date) computed from `rows` (cleaned, vgroup assigned)."""
    t = targets.copy()
    t["as_of"] = t["date"] - pd.Timedelta(days=H)
    t["rid"] = np.arange(len(t))
    chosen = pd.DataFrame(index=t["rid"])
    chosen["feature_level"] = None
    for level, keys in LEVELS.items():
        st = level_stats(daily(rows, keys), keys)
        m = asof_join(t[["rid", "as_of"] + keys], st, keys, "as_of").set_index("rid").reindex(t["rid"])
        usable = m["obs_date"].notna() & ((m["as_of"] - m["obs_date"]).dt.days <= USABLE_STALENESS) & (m["n30"] >= MIN_N30)
        take = usable & chosen["feature_level"].isna()
        for c in ["lag1", "lag2", "med7", "med30", "med90", "vol30", "n30", "obs_date"]:
            if c not in chosen:
                chosen[c] = pd.Series(pd.NaT if c == "obs_date" else np.nan, index=chosen.index)
            chosen.loc[take, c] = m.loc[take, c]
        chosen.loc[take, "feature_level"] = level
        if level == "state+variety":
            # Context features from the state series of the same product + variety group.
            fresh = m["obs_date"].notna() & ((m["as_of"] - m["obs_date"]).dt.days <= USABLE_STALENESS)
            chosen["state_med30"] = m["med30"].where(fresh)
            y = t[["rid"] + keys].assign(yoy_date=t["date"] - pd.Timedelta(days=365 - H))
            ym = asof_join(y, st, keys, "yoy_date", tolerance=pd.Timedelta(days=H)).set_index("rid").reindex(t["rid"])
            chosen["yoy"] = ym["yoy15"]
    f = t.set_index("rid").join(chosen)
    f["days_since"] = (f["date"] - pd.to_datetime(f["obs_date"])).dt.days
    f["yoy_missing"] = f["yoy"].isna().astype(float)
    month, doy = f["date"].dt.month, f["date"].dt.dayofyear
    f["month_sin"], f["month_cos"] = np.sin(2 * np.pi * month / 12), np.cos(2 * np.pi * month / 12)
    f["doy_sin"], f["doy_cos"] = np.sin(2 * np.pi * doy / 365.25), np.cos(2 * np.pi * doy / 365.25)
    f["market_premium"] = [premiums.get("|".join(k), 0.0) for k in f[SERIES].itertuples(index=False)]
    return f.reset_index(drop=True)


def fit_market_premiums(rows: pd.DataFrame, train_end: pd.Timestamp) -> dict:
    """log(market price / state price) for the same product, variety group and date, training window only."""
    tr = rows[rows["date"] <= train_end]
    m = daily(tr, SERIES).merge(daily(tr, LEVELS["state+variety"]), on=LEVELS["state+variety"] + ["date"],
                                suffixes=("", "_state"))
    m["diff"] = m["lp"] - m["lp_state"]
    agg = m.groupby(SERIES)["diff"].agg(["median", "size"])
    agg = agg[agg["size"] >= PREMIUM_MIN_DAYS]
    return {"|".join(k): round(float(v), 6) for k, v in agg["median"].items()}


def flag_spikes(series: pd.DataFrame) -> pd.Series:
    """True where a value is > 3x away from the median of the previous 30 days of the same series."""
    flags = []
    for _, g in series.groupby(SERIES, sort=False):
        prev = g.set_index("date")["lp"].rolling("30D", closed="left").median()
        flags.append(pd.Series((g["lp"].values - prev.values) > SPIKE_LOG, index=g.index)
                     | pd.Series((prev.values - g["lp"].values) > SPIKE_LOG, index=g.index))
    return pd.concat(flags).reindex(series.index)


# ---------------------------------------------------------------- leakage checks
def leakage_check(rows, targets, premiums, built, n=150, seed=7) -> dict:
    """Recompute features for sampled targets from raw rows truncated at t - H; they must be identical."""
    sample = targets.sample(n=min(n, len(targets)), random_state=seed)
    worst, mismatches = 0.0, 0
    for _, tr in sample.iterrows():
        cut = rows[(rows["product"] == tr["product"]) & (rows["date"] <= tr["date"] - pd.Timedelta(days=H))]
        if cut.empty:
            continue
        one = build_features(cut, pd.DataFrame([tr[SERIES + ["date"]]]), premiums).iloc[0]
        full = built[(built[SERIES] == tr[SERIES]).all(axis=1) & (built["date"] == tr["date"])].iloc[0]
        for c in NUMERIC:
            a, b = one[c], full[c]
            if pd.isna(a) and pd.isna(b):
                continue
            if pd.isna(a) != pd.isna(b) or abs(float(a) - float(b)) > 1e-9:
                mismatches += 1
                worst = max(worst, float("inf") if pd.isna(a) != pd.isna(b) else abs(float(a) - float(b)))
        if one["feature_level"] != full["feature_level"]:
            mismatches += 1
    return {"sampled targets": len(sample), "mismatched values": mismatches, "max abs difference": worst}


def boundary_check() -> dict:
    """Hand-built series: an observation at t-7 must be used, one at t-6 must not."""
    t0 = pd.Timestamp("2025-06-30")
    base = {"State": "Karnataka", "District": "X", "market_key": "m", "Market": "M", "crop": "Tomato",
            "product": "Tomato", "vraw": "tomato", "generic": True, "vgroup": "Common"}
    hist = [dict(base, date=t0 - pd.Timedelta(days=d), price=10.0) for d in range(30, 8, -3)]
    rows = pd.DataFrame(hist + [dict(base, date=t0 - pd.Timedelta(days=7), price=20.0),
                                dict(base, date=t0 - pd.Timedelta(days=6), price=999.0),
                                dict(base, date=t0, price=50.0)])
    f = build_features(rows, pd.DataFrame([dict(product="Tomato", vgroup="Common", State="Karnataka",
                                                 market_key="m", date=t0)]), {}).iloc[0]
    return {"t-7 observation used as lag1": bool(np.isclose(f["lag1"], np.log(20.0))),
            "t-6 and t observations ignored": bool(f["med90"] < np.log(999.0) and f["lag1"] < np.log(50.0)),
            "days_since == 7": int(f["days_since"]) == 7}


# ---------------------------------------------------------------- main
def main():
    raw, _ = load()
    rows, clean_counts = clean(raw)
    end = rows["date"].max()
    splits = split_dates(end)
    train_end = splits["train"][1]

    groups = fit_variety_groups(rows[rows["date"] <= train_end])
    rows["vgroup"] = assign_vgroup(rows, groups)
    premiums = fit_market_premiums(rows, train_end)

    series = daily(rows, SERIES)
    series["spike"] = flag_spikes(series)
    targets = series[series["date"] >= TARGET_START][SERIES + ["date", "lp", "price", "spike"]].copy()
    targets["split"] = None
    for name, (a, b) in splits.items():
        targets.loc[targets["date"].between(a, b), "split"] = name
    targets = targets[targets["split"].notna()].reset_index(drop=True)

    built = build_features(rows, targets[SERIES + ["date"]], premiums)
    built = built.merge(targets[SERIES + ["date", "lp", "price", "spike", "split"]], on=SERIES + ["date"])
    no_history = built["feature_level"].isna()
    dataset = built[~no_history].rename(columns={"lp": "target_log_price", "price": "target_price"})

    (ML / "data").mkdir(exist_ok=True)
    dataset.to_pickle(ML / "data" / "dataset.pkl")

    leak = leakage_check(rows, targets[SERIES + ["date"]].merge(dataset[SERIES + ["date"]]), premiums, dataset)
    bound = boundary_check()

    (ML / "artifacts").mkdir(exist_ok=True)
    (ML / "artifacts" / "phase1.json").write_text(json.dumps({
        "horizon_days": H, "products": PRODUCTS,
        "splits": {k: [str(a.date()), str(b.date())] for k, (a, b) in splits.items()},
        "levels": LEVELS, "usable_staleness_days": USABLE_STALENESS, "min_n30": MIN_N30,
        "variety_groups": groups, "variety_min_rows": VARIETY_MIN_ROWS,
        "market_premiums": premiums, "numeric_features": NUMERIC, "categorical_features": CATEGORICAL,
    }, indent=2), encoding="utf-8")

    # ---- report
    md = ["# Phase 1: dataset report\n",
          f"Generated {date.today()}. Horizon **h = {H} days**: every feature uses observations dated <= t - {H}.\n",
          "## Splits (by target date, with a gap of h days between blocks)\n",
          table([{"split": k, "from": a.date(), "to": b.date()} for k, (a, b) in splits.items()], ["split", "from", "to"]),
          "## Cleaning (row-local rules only; nothing fitted on future data)\n",
          table([{"step": k, "rows": f"{v:,}"} for k, v in clean_counts.items()], ["step", "rows"]),
          f"Price spikes are **flagged, not dropped** (> 3x away from the trailing 30-day median of the same series), "
          "so real tomato and onion surges stay in the test set.\n",
          "## Variety groups (fitted on the training window)\n",
          table([{"product": p, "named groups (>= %d training rows)" % VARIETY_MIN_ROWS: ", ".join(v.title() for v in vs) or "none",
                  "rows labelled Common (generic)": f"{rows[rows['product'] == p]['vgroup'].eq('Common').mean():.0%}"}
                 for p, vs in groups.items()],
                ["product", "named groups (>= %d training rows)" % VARIETY_MIN_ROWS, "rows labelled Common (generic)"]),
          "## Rows and series per split\n"]
    per = []
    for (p, s), g in dataset.groupby(["product", "split"]):
        per.append({"product": p, "split": s, "rows": f"{len(g):,}", "series": g[SERIES].drop_duplicates().shape[0],
                    "spikes flagged": int(g["spike"].sum())})
    md.append(table(sorted(per, key=lambda r: (r["product"], ["train", "calibration", "test"].index(r["split"]))),
                    ["product", "split", "rows", "series", "spikes flagged"]))
    md.append(f"Targets dropped because no level had usable history at t - {H}: **{int(no_history.sum()):,}** "
              f"of {len(built):,}.\n")
    md.append("## Feature level used (share of rows)\n")
    lv = dataset.groupby("split")["feature_level"].value_counts(normalize=True).unstack().fillna(0)
    md.append(table([{"split": s, **{c: f"{lv.loc[s, c]:.1%}" for c in lv.columns}} for s in ["train", "calibration", "test"]],
                    ["split"] + list(lv.columns)))
    md.append("## Feature missingness (all splits)\n")
    md.append(table([{"feature": c, "missing": f"{dataset[c].isna().mean():.1%}"} for c in NUMERIC], ["feature", "missing"]))
    md.append(f"Market premiums fitted on training data: {len(premiums)} series (unseen markets get 0, i.e. the state price).\n")
    md.append("## Leakage checks\n")
    md.append("**Recompute from truncated data.** For sampled targets, the raw rows were cut at t - h *before* any "
              "step (daily aggregation, rolling windows, fallback choice), and the features were rebuilt and compared.\n")
    md.append(table([{"check": k, "result": v} for k, v in leak.items()], ["check", "result"]))
    md.append("**Boundary cases** on a hand-built series:\n")
    md.append(table([{"check": k, "passed": v} for k, v in bound.items()], ["check", "passed"]))
    ok = leak["mismatched values"] == 0 and all(bound.values())
    md.append(f"\n**Leakage checks: {'PASS' if ok else 'FAIL'}**")
    (ML / "reports" / "dataset_report.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print(f"dataset rows {len(dataset):,} | leakage {'PASS' if ok else 'FAIL'} {leak} {bound}")


if __name__ == "__main__":
    main()
