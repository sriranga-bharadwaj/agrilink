"""Phase 3: export the cleaned mandi rows the app needs for live suggestions to web/data/mandi_prices.csv.

Rows go through exactly the Phase 1 pipeline (row-local cleaning, training-window variety groups,
removal of impossible prices and 8x jumps), so the app computes features from the same rows the model
was trained and evaluated on. Only recent rows are exported: features look back at most about 13 months
(365-day market premium, same-period-last-year), so data from SINCE onwards is enough.
Usage: ml/.venv/Scripts/python ml/export_serving_data.py
"""
from pathlib import Path

import pandas as pd

from build_dataset import assign_vgroup, clean, drop_errors, fit_variety_groups, split_dates
from validate_data import load

ML = Path(__file__).resolve().parent
OUT = ML.parent / "web" / "data" / "mandi_prices.csv"
SINCE = pd.Timestamp("2024-06-01")


def main():
    raw, _ = load()
    rows, _ = clean(raw)
    train_end = split_dates(rows["date"].max())["train"][1]
    rows["vgroup"] = assign_vgroup(rows, fit_variety_groups(rows[rows["date"] <= train_end]))
    rows, _ = drop_errors(rows)
    out = rows[rows["date"] >= SINCE].rename(columns={
        "date": "price_date", "vgroup": "variety_group", "State": "state", "District": "district",
        "Market": "market", "price": "price_per_kg"})
    out["market"] = out["market"].str.strip()
    out = out[["price_date", "product", "variety_group", "state", "district", "market_key", "market", "price_per_kg"]]
    out = out.sort_values(["product", "state", "market_key", "price_date"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False, date_format="%Y-%m-%d", float_format="%.6g")
    print(f"wrote {OUT}: {len(out):,} rows, {out['price_date'].min().date()} to {out['price_date'].max().date()}, "
          f"{OUT.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
