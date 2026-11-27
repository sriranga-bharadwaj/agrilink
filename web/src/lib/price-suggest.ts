// Turns mandi price rows into a price suggestion: a simple baseline as the suggested price and the model's
// calibrated 80% range (ml/reports/model_eval_details.md). No Next.js imports, so tests can call it.
// Explicit .ts extensions so the node:test suite (Node type stripping) can load these files directly.
import { computeFeatures, withDerived, type MandiRow, type PriceSpec } from "./price-features.ts";
import { predictLogChange, type ModelSpec } from "./price-model.ts";

export type FullSpec = PriceSpec & ModelSpec & {
  products: string[];
  variety_groups: Record<string, string[]>;
  interval: { alpha: number; cqr_log_correction: Record<string, number> };
  suggested_price: { baseline: Record<string, "persistence" | "median30"> };
};

export type SuggestInput = { crop: string; variety: string; state: string; district: string; date: string };

export type PriceSuggestion =
  | { ok: false; reason: string }
  | {
      ok: true;
      product: string;
      varietyGroup: string;
      market: string | null; // mandi used, or null when only state-wide prices were usable
      level: string;
      dataUpTo: string;
      price: number;
      basis: "last known price" | "30-day median";
      low: number;
      high: number;
      coverage: number;
    };

const DAY = 86_400_000;
export const shiftDate = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** Date to forecast for: today, or newest data + horizon when the data is older than that. */
// shortcut: mandi_prices is a frozen export, so without this every suggestion fails ~4 weeks after it;
// refresh web/data/mandi_prices.csv (ml/export_serving_data.py) to make suggestions current again.
export function servingDate(today: string, latest: string | null, horizon: number): string {
  const fromData = latest ? shiftDate(latest, horizon) : today;
  return fromData < today ? fromData : today;
}

// Longest look-back of any feature: 365-day market premium and same-period-last-year, plus slack.
export const LOOKBACK_DAYS = 400;

// Rows for one product in one state, between `from` and `asOf` (= date - horizon): nothing newer is read.
export const MANDI_ROWS_SQL = `
  SELECT product, variety_group, state, district, market_key, market, price_date, price_per_kg AS price
    FROM mandi_prices
   WHERE product = ? AND state = ? AND price_date BETWEEN ? AND ?
   ORDER BY price_date, mandi_price_id`;

/** Query parameters for MANDI_ROWS_SQL. */
export function mandiRowsParams(spec: FullSpec, input: Omit<SuggestInput, "date">, date: string) {
  const asOf = shiftDate(date, -spec.horizon_days);
  const product = productFor(spec, input.crop, input.variety) ?? input.crop;
  return [product, input.state, shiftDate(asOf, -LOOKBACK_DAYS), asOf];
}

// Python str.title(): "1st sort" -> "1St Sort", "beelary-red" -> "Beelary-Red".
const pyTitle = (s: string) => s.replace(/(^|[^a-z])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
const norm = (s: string) => s.toLowerCase().replace(/\bapmc\b/g, "").replace(/[^a-z]/g, "");

export function productFor(spec: FullSpec, crop: string, variety: string): string | null {
  const product = crop === "Rice" && /broken/i.test(variety) ? "Broken rice" : crop;
  return spec.products.includes(product) ? product : null;
}

export function varietyGroupFor(spec: FullSpec, product: string, variety: string): string {
  const v = variety.trim().toLowerCase();
  return spec.variety_groups[product]?.includes(v) ? pyTitle(v) : "Common";
}

/** The farmer's mandi: the one named after their district, else the busiest one in it over the last 90 days. */
function pickMarket(rows: (MandiRow & { district: string; market: string })[], district: string, asOf: string) {
  const inDistrict = rows.filter((r) => norm(r.district) === norm(district));
  if (!inDistrict.length) return null;
  const recent = inDistrict.filter((r) => r.price_date > shiftDate(asOf, -90));
  const counts = new Map<string, number>();
  for (const r of recent.length ? recent : inDistrict) counts.set(r.market_key, (counts.get(r.market_key) ?? 0) + 1);
  const key = counts.has(norm(district)) ? norm(district) : [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const latest = inDistrict.filter((r) => r.market_key === key).at(-1)!;
  return { key, name: latest.market };
}

/** `rows`: mandi rows for the product in the farmer's state, dated <= input.date - horizon, oldest first. */
export async function suggestFromRows(
  spec: FullSpec, modelsDir: string, rows: (MandiRow & { district: string; market: string })[], input: SuggestInput,
): Promise<PriceSuggestion> {
  const product = productFor(spec, input.crop, input.variety);
  if (!product) return { ok: false, reason: `Not enough government market data for ${input.crop} to suggest a price.` };
  const vgroup = varietyGroupFor(spec, product, input.variety);
  const market = pickMarket(rows, input.district, shiftDate(input.date, -spec.horizon_days));
  const key = { product, vgroup, state: input.state, market_key: market?.key ?? "" };

  const f = computeFeatures(rows, spec, key, input.date);
  if (!f.feature_level) return { ok: false, reason: `No recent ${product} prices from mandis in ${input.state}.` };

  const v = f.values;
  const q = await predictLogChange(modelsDir, spec, {
    categorical: { product, State: input.state, vgroup, feature_level: f.feature_level },
    numeric: withDerived(v, spec.inputs.derived),
  }, ["q10", "q90"]);
  const c = spec.interval.cqr_log_correction[product] ?? spec.interval.cqr_log_correction.pooled;
  const baseline = spec.suggested_price.baseline[product];

  return {
    ok: true,
    product,
    varietyGroup: vgroup,
    market: f.feature_level.startsWith("market") ? market?.name ?? null : null,
    level: f.feature_level,
    dataUpTo: f.obs_date!,
    price: Math.exp(baseline === "persistence" ? v.lag1 : v.med30),
    basis: baseline === "persistence" ? "last known price" : "30-day median",
    low: Math.exp(v.lag1 + q.q10 - c),
    high: Math.exp(v.lag1 + q.q90 + c),
    coverage: 1 - spec.interval.alpha,
  };
}
