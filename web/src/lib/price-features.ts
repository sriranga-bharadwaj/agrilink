// As-of features for the mandi price model, a line-for-line port of ml/build_dataset.py
// (build_features, level_stats, premium_stats). Pure: no database, no Next.js imports, so the
// node:test parity tests can run it against the Python examples.

export type MandiRow = {
  product: string;
  variety_group: string;
  state: string;
  market_key: string;
  price_date: string; // YYYY-MM-DD
  price: number; // Rs/kg
};

export type SeriesKey = { product: string; vgroup: string; state: string; market_key: string };

export type PriceSpec = {
  horizon_days: number;
  levels: Record<string, string[]>; // level name -> key columns, most specific first
  usable_staleness_days: number;
  min_n30: number;
  market_premium: { window_days: number; min_days: number };
};

export type Features = {
  feature_level: string | null;
  obs_date: string | null; // date of the last price used (chosen level)
  values: Record<string, number>; // NaN where missing, like pandas
};

const DAY = 86_400_000;
const dayNum = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY);
const isoOf = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function std(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
}

// Python column names -> row fields.
const FIELD: Record<string, (r: MandiRow) => string> = {
  product: (r) => r.product, vgroup: (r) => r.variety_group, State: (r) => r.state, market_key: (r) => r.market_key,
};
const KEYVAL: Record<string, (k: SeriesKey) => string> = {
  product: (k) => k.product, vgroup: (k) => k.vgroup, State: (k) => k.state, market_key: (k) => k.market_key,
};

type Point = { day: number; lp: number };

/** Daily series for one key: median price per day, as log. */
function dailySeries(rows: MandiRow[], keys: string[], key: SeriesKey): Point[] {
  const byDay = new Map<number, number[]>();
  for (const r of rows) {
    if (!keys.every((k) => FIELD[k](r) === KEYVAL[k](key))) continue;
    const d = dayNum(r.price_date);
    (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(r.price);
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, ps]) => ({ day, lp: Math.log(median(ps)) }));
}

/** Index of the last point with day <= limit (and >= floor if given), like pandas merge_asof backward. */
function asofIndex(s: { day: number }[], limit: number, floor = -Infinity): number {
  let i = -1;
  for (let j = 0; j < s.length && s[j].day <= limit; j++) i = j;
  return i >= 0 && s[i].day >= floor ? i : -1;
}

/** pandas rolling(f"{w}D") at index i: values with day in (day_i - w, day_i]. */
function window(s: Point[], i: number, w: number): number[] {
  const out: number[] = [];
  for (let j = i; j >= 0 && s[j].day > s[i].day - w; j--) out.push(s[j].lp);
  return out;
}

function statsAt(s: Point[], i: number) {
  const w30 = window(s, i, 30);
  return {
    day: s[i].day,
    lag1: s[i].lp,
    lag2: i > 0 ? s[i - 1].lp : NaN,
    med7: median(window(s, i, 7)),
    med30: median(w30),
    med90: median(window(s, i, 90)),
    vol30: w30.length >= 3 ? std(w30) : NaN,
    n30: w30.length,
    yoy15: median(window(s, i, 15)),
  };
}

/** Rolling 365-day median of log(market / state price) on days both exist, as of `asOf`. */
function marketPremium(rows: MandiRow[], spec: PriceSpec, key: SeriesKey, asOf: number): number {
  const market = dailySeries(rows, spec.levels["market+variety"], key);
  const state = new Map(dailySeries(rows, spec.levels["state+variety"], key).map((p) => [p.day, p.lp]));
  const diff = market.filter((p) => state.has(p.day)).map((p) => ({ day: p.day, lp: p.lp - state.get(p.day)! }));
  const i = asofIndex(diff, asOf);
  if (i < 0) return 0;
  const w = window(diff, i, spec.market_premium.window_days);
  return w.length >= spec.market_premium.min_days ? median(w) : 0;
}

/** Features for series `key` on target date `date` (YYYY-MM-DD), using only rows dated <= date - horizon. */
export function computeFeatures(allRows: MandiRow[], spec: PriceSpec, key: SeriesKey, date: string): Features {
  const t = dayNum(date);
  const asOf = t - spec.horizon_days;
  const rows = allRows.filter((r) => dayNum(r.price_date) <= asOf); // nothing after t - h is ever read
  const v: Record<string, number> = {};
  let level: string | null = null;
  let obsDay: number | null = null;

  for (const [name, keys] of Object.entries(spec.levels)) {
    const s = dailySeries(rows, keys, key);
    const i = asofIndex(s, asOf);
    const st = i >= 0 ? statsAt(s, i) : null;
    if (level === null && st && asOf - st.day <= spec.usable_staleness_days && st.n30 >= spec.min_n30) {
      level = name;
      obsDay = st.day;
      for (const c of ["lag1", "lag2", "med7", "med30", "med90", "vol30", "n30"] as const) v[c] = st[c];
    }
    if (name === "state+variety") {
      v.state_med30 = st && asOf - st.day <= spec.usable_staleness_days ? st.med30 : NaN;
      const yoyDate = t - (365 - spec.horizon_days);
      const j = asofIndex(s, yoyDate, yoyDate - spec.horizon_days);
      v.yoy = j >= 0 ? statsAt(s, j).yoy15 : NaN;
    }
  }
  if (level === null) return { feature_level: null, obs_date: null, values: v };

  const when = new Date(t * DAY);
  const month = when.getUTCMonth() + 1;
  const doy = Math.round((t * DAY - Date.UTC(when.getUTCFullYear(), 0, 1)) / DAY) + 1;
  v.days_since = t - obsDay!;
  v.yoy_missing = Number.isNaN(v.yoy) ? 1 : 0;
  v.month_sin = Math.sin((2 * Math.PI * month) / 12);
  v.month_cos = Math.cos((2 * Math.PI * month) / 12);
  v.doy_sin = Math.sin((2 * Math.PI * doy) / 365.25);
  v.doy_cos = Math.cos((2 * Math.PI * doy) / 365.25);
  v.market_premium = marketPremium(rows, spec, key, asOf);
  return { feature_level: level, obs_date: isoOf(obsDay!), values: v };
}

/** Adds the difference-from-lag1 inputs the model was trained on (train.py DIFFS). */
export function withDerived(values: Record<string, number>, derived: Record<string, string>): Record<string, number> {
  const out = { ...values };
  for (const [name, col] of Object.entries(derived)) out[name] = values[col] - values.lag1;
  return out;
}
