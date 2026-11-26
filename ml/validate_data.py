"""Phase 0, step 3: coverage and quality report for downloaded Agmarknet variety-wise prices.
Reads every CSV in ml/data/ (data.gov.in export format) and writes ml/reports/data_coverage.md.
Usage: ml/.venv/Scripts/python ml/validate_data.py
"""
import glob
from datetime import date
from pathlib import Path

import pandas as pd

from crops import BUYER_DISTRICTS, COMMODITY_TO_CROP, CROPS, FARMER_DISTRICTS

ML = Path(__file__).resolve().parent
OUT = ML / "reports" / "data_coverage.md"

# Go / no-go rules, fixed before looking at per-series results (see the approved plan).
WINDOW_YEARS = 3       # judge recent history only
MIN_SPAN_DAYS = 730    # >= 2 years between first and last observation inside the window
MIN_OBS_DAYS = 250     # distinct observed days inside the window
MAX_GAP_DAYS = 60      # longest gap between observations inside the window
MIN_CROPS_GO = 5       # overall go needs at least this many of the 10 crops


COLUMNS = ["Arrival_Date", "Commodity", "Commodity_Code", "District", "Grade", "Market",
           "Max_Price", "Min_Price", "Modal_Price", "State", "Variety"]


import re

# Spelling variants of the same mandi seen in the exports (after removing "APMC" and punctuation).
MARKET_ALIASES = {
    "bhagepalli": "bagepalli",
    "gauribidanur": "gowribidanoor",
    "mulbagal": "mulabagilu",
    "binnymillffvbengaluru": "binnymillbengaluru",
    "binnymillfvbengaluru": "binnymillbengaluru",
}


def market_key(name: str) -> str:
    """One key per physical mandi: drops the 'APMC' rename (late 2025), case, spacing and punctuation."""
    key = re.sub(r"[^a-z]", "", re.sub(r"\bapmc\b", "", str(name).lower()))
    return MARKET_ALIASES.get(key, key)


def load() -> pd.DataFrame:
    """Reads every variety-wise export in ml/data/ (other datasets are skipped) and drops rows repeated across files."""
    candidates = sorted(glob.glob(str(ML / "data" / "*.csv")) + glob.glob(str(ML / "data" / "raw" / "*.csv")))
    frames, files = [], []
    for f in candidates:
        part = pd.read_csv(f)
        if set(COLUMNS) <= set(part.columns):
            frames.append(part[COLUMNS])
            files.append(f)
        else:
            print(f"skipped {Path(f).name}: not the variety-wise layout")
    raw = pd.concat(frames, ignore_index=True)
    df = raw.drop_duplicates().reset_index(drop=True)
    print(f"{len(files)} files, {len(raw):,} rows, {len(raw) - len(df):,} duplicate rows dropped")
    df["date"] = pd.to_datetime(df["Arrival_Date"], format="%d/%m/%Y", errors="coerce")
    for c in ["Min_Price", "Max_Price", "Modal_Price"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df["crop"] = df["Commodity"].map(COMMODITY_TO_CROP)
    df["market_key"] = df["Market"].map(market_key)
    return df, files


def series_stats(g: pd.DataFrame, start: pd.Timestamp) -> dict:
    days = pd.Series(sorted(g.loc[g["date"] >= start, "date"].unique()))
    if days.empty:
        return {"obs_days": 0, "span_days": 0, "max_gap": None, "first": None, "last": None}
    gaps = days.diff().dt.days.dropna()
    return {
        "obs_days": len(days),
        "span_days": (days.iloc[-1] - days.iloc[0]).days,
        "max_gap": int(gaps.max()) if len(gaps) else 0,
        "first": days.iloc[0].date(),
        "last": days.iloc[-1].date(),
    }


def passes(s: dict) -> bool:
    return s["span_days"] >= MIN_SPAN_DAYS and s["obs_days"] >= MIN_OBS_DAYS and (s["max_gap"] or 0) <= MAX_GAP_DAYS


def table(rows: list[dict], cols: list[str]) -> str:
    if not rows:
        return "_none_\n"
    out = "| " + " | ".join(cols) + " |\n|" + "---|" * len(cols) + "\n"
    for r in rows:
        out += "| " + " | ".join("" if r.get(c) is None else str(r.get(c)) for c in cols) + " |\n"
    return out


def main():
    df, files = load()
    end = df["date"].max()
    start = end - pd.DateOffset(years=WINDOW_YEARS)
    ours = df[df["crop"].notna()].copy()

    md = [f"# Phase 0: data coverage report\n",
          f"Generated {date.today()} from {len(files)} file(s): " + ", ".join(f"`{Path(f).name}`" for f in files) + "\n",
          "## 1. What the download contains\n",
          f"- Rows after removing rows repeated across files: **{len(df):,}**; unparseable dates: {df['date'].isna().sum()}",
          f"- Dates: {df['date'].min().date()} to **{end.date()}**",
          f"- States: {df['State'].value_counts().to_dict()}",
          f"- Districts: {df['District'].value_counts().to_dict()}",
          f"- Markets ({df['Market'].nunique()}): {df['Market'].value_counts().to_dict()}",
          f"- Commodities: {df['Commodity'].nunique()} (of which {ours['Commodity'].nunique()} map to AgriLink crops)\n"]

    # Focus districts
    present = set(df["District"].str.strip().str.lower())
    md.append("## 2. AgriLink focus districts\n")
    md.append(table([{"district": d, "role": role, "in data": "yes" if d.lower() in present else "**no**"}
                     for role, ds in [("farmer", FARMER_DISTRICTS), ("buyer hub", BUYER_DISTRICTS)] for d in ds],
                    ["district", "role", "in data"]))

    # Data quality on our crops
    dup_keys = ["date", "Market", "Commodity", "Variety", "Grade"]
    crop_median = ours.groupby("crop")["Modal_Price"].transform("median")
    dq = {
        "modal outside [min, max]": int(((ours["Modal_Price"] < ours["Min_Price"]) | (ours["Modal_Price"] > ours["Max_Price"])).sum()),
        "modal <= 0 or missing": int((ours["Modal_Price"].fillna(0) <= 0).sum()),
        "suspected unit error (< 2% or > 50x crop median)": int(((ours["Modal_Price"] < 0.02 * crop_median) | (ours["Modal_Price"] > 50 * crop_median)).sum()),
        "duplicate (date, market, commodity, variety, grade)": int(ours.duplicated(dup_keys).sum()),
        "rows (our crops)": len(ours),
    }
    md.append("## 3. Data quality (AgriLink crops only)\n")
    md.append(table([{"check": k, "rows": v} for k, v in dq.items()], ["check", "rows"]))

    # Per-crop summary and series at three levels
    md.append(f"## 4. Coverage by crop\n\nGo/no-go is judged on the last {WINDOW_YEARS} years "
              f"({start.date()} to {end.date()}). A series passes with span >= {MIN_SPAN_DAYS} days, "
              f">= {MIN_OBS_DAYS} observed days and no gap > {MAX_GAP_DAYS} days.\n")
    crop_rows, series_rows, verdict = [], [], {}
    for crop in CROPS:
        g = ours[ours["crop"] == crop]
        if g.empty:
            crop_rows.append({"crop": crop, "rows": 0, "verdict": "**no data**"})
            verdict[crop] = False
            continue
        state_level = series_stats(g, start)
        # Series are keyed by the normalised market, so a renamed mandi stays one series.
        market_series = [dict(level="market", key=m, **series_stats(s, start)) for m, s in g.groupby("market_key")]
        variety_series = [dict(level="market+variety", key=f"{m} / {v}", **series_stats(s, start))
                          for (m, v), s in g.groupby(["market_key", "Variety"])]
        ok_series = [s for s in market_series + variety_series if passes(s)]
        ok = passes(state_level) or bool(ok_series)
        verdict[crop] = ok
        crop_rows.append({
            "crop": crop, "rows": len(g), "first": g["date"].min().date(), "last": g["date"].max().date(),
            "obs days (window, state)": state_level["obs_days"], "max gap (window)": state_level["max_gap"],
            "markets": g["market_key"].nunique(), "varieties": g["Variety"].nunique(),
            "passing series": len(ok_series), "verdict": "pass" if ok else "**fail**",
        })
        for s in sorted(market_series + variety_series, key=lambda s: -s["obs_days"])[:6]:
            series_rows.append({"crop": crop, **s, "passes": "yes" if passes(s) else "no"})
        md_var = g.groupby(["Variety", "Grade"]).size().sort_values(ascending=False).head(6)
        crop_rows[-1]["top variety / grade"] = "; ".join(f"{v} / {gr} ({n})" for (v, gr), n in md_var.items())

    md.append(table(crop_rows, ["crop", "rows", "first", "last", "obs days (window, state)", "max gap (window)",
                                "markets", "varieties", "passing series", "verdict"]))
    md.append("### Varieties and grades (top 6 per crop)\n")
    md.append(table(crop_rows, ["crop", "top variety / grade"]))
    md.append("### Best series per crop (window)\n")
    md.append(table(series_rows, ["crop", "level", "key", "obs_days", "span_days", "max_gap", "first", "last", "passes"]))

    # Market renames / spelling variants: the same mandi under several names.
    renames = []
    for key, g in df.groupby("market_key"):
        names = g.groupby("Market")["date"].agg(["min", "max"]).sort_values("min")
        if len(names) > 1:
            renames.append({"market": key, "names (first - last date)": "; ".join(
                f"{n.strip()} ({r['min'].date()} - {r['max'].date()})" for n, r in names.iterrows())})
    md.append("## 5. Findings that affect modelling\n")
    md.append(f"**Market renames.** {len(renames)} mandis appear under more than one name, mostly the late-2025 "
              "switch to \"<name> APMC\" plus spelling variants. Coverage above already merges them by a normalised "
              "market key; Phase 1 must use the same key, otherwise each series shows an artificial gap.\n")
    md.append(table(renames, ["market", "names (first - last date)"]))
    generic = ours["Variety"].isin(["Other"] + list(ours["Commodity"].unique())).mean()
    md.append(f"\n**Variety detail is thin.** {generic:.0%} of rows for AgriLink crops have a generic variety "
              "(\"Other\" or just the commodity name), so variety-aware modelling will mostly fall back to crop level.\n")
    md.append("**District labels need checking.** Every row says district = Chikmagalur, but market Bagepalli is in "
              "Chikkaballapur district. The export's district field may reflect the download filter, not the market.\n")

    n_ok = sum(verdict.values())
    farmer_cover = [d for d in FARMER_DISTRICTS if d.lower() in present]
    md.append("## 6. Verdict\n")
    md.append(f"- Crops passing: **{n_ok} / {len(CROPS)}** ({', '.join(c for c, v in verdict.items() if v) or 'none'})")
    md.append(f"- Rule for overall go: >= {MIN_CROPS_GO} crops pass **and** data covers the markets the app serves.")
    md.append(f"- AgriLink farmer districts covered: **{len(farmer_cover)} / {len(FARMER_DISTRICTS)}** {farmer_cover}")
    go = n_ok >= MIN_CROPS_GO and len(farmer_cover) > 0
    md.append(f"- **Overall: {'GO' if go else 'NO-GO (yet)'}**")
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("\n".join(md) + "\n", encoding="utf-8")
    print(f"wrote {OUT}; crops passing {n_ok}/{len(CROPS)}; farmer districts covered {len(farmer_cover)}; overall {'GO' if go else 'NO-GO'}")


if __name__ == "__main__":
    main()
