import "server-only";
import path from "node:path";
import modelSpec from "../../models/price_model.json";
import { query } from "./db";
import {
  MANDI_ROWS_SQL, mandiRowsParams, servingDate, suggestFromRows, type FullSpec, type PriceSuggestion, type SuggestInput,
} from "./price-suggest";

const spec = modelSpec as unknown as FullSpec;
const MODELS_DIR = path.join(process.cwd(), "models");

type Row = {
  product: string; variety_group: string; state: string; district: string; market_key: string; market: string;
  price_date: string; price: number;
};

/** Suggested price + calibrated 80% range for a farmer's crop, from government mandi prices in MySQL. */
export async function suggestMandiPrice(input: Omit<SuggestInput, "date"> & { date?: string }): Promise<PriceSuggestion> {
  const [{ latest }] = await query<{ latest: string | null }>("SELECT MAX(price_date) AS latest FROM mandi_prices");
  const date = input.date ?? servingDate(new Date().toISOString().slice(0, 10), latest, spec.horizon_days);
  const rows = await query<Row>(MANDI_ROWS_SQL, mandiRowsParams(spec, input, date));
  return suggestFromRows(spec, MODELS_DIR, rows, { ...input, date });
}
