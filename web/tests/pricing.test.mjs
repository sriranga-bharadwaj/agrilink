// Training/serving parity: the TypeScript feature builder + ONNX in Node must reproduce the Python
// pipeline on the parity examples exported by ml/export_onnx.py. Uses the CSV, no database needed.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { before, describe, it } from "node:test";
import { csvObjects } from "../scripts/mysql/csv.mjs";
import { computeFeatures, withDerived } from "../src/lib/price-features.ts";
import { predictLogChange } from "../src/lib/price-model.ts";
import { MANDI_ROWS_SQL, mandiRowsParams, suggestFromRows } from "../src/lib/price-suggest.ts";
import { connectMysql } from "./helpers.mjs";

const WEB = path.resolve(import.meta.dirname, "..");
const MODELS = path.join(WEB, "models");
let spec;
let rows;

before(async () => {
  spec = JSON.parse(await readFile(path.join(MODELS, "price_model.json"), "utf8"));
  rows = csvObjects(await readFile(path.join(WEB, "data", "mandi_prices.csv"), "utf8"))
    .map((r) => ({ ...r, price: Number(r.price_per_kg) }));
});

const close = (a, b, tol) => (a === null || Number.isNaN(a) ? b === null : b !== null && Math.abs(a - b) <= tol);

describe("price model parity with Python", () => {
  it("rebuilds every as-of feature for the parity examples", () => {
    for (const ex of spec.parity_examples) {
      const k = ex.keys;
      const f = computeFeatures(rows, spec, { product: k.product, vgroup: k.vgroup, state: k.State, market_key: k.market_key }, ex.date);
      assert.equal(f.feature_level, k.feature_level, `${ex.date} ${k.product}/${k.market_key}: level`);
      for (const [name, want] of Object.entries(ex.features)) {
        assert.ok(close(f.values[name], want, 1e-9), `${ex.date} ${k.product}/${k.market_key}: ${name} got ${f.values[name]} want ${want}`);
      }
    }
  });

  it("rows fetched by the app's SQL give the same features as the exported data", async () => {
    const db = await connectMysql();
    try {
      for (const ex of spec.parity_examples) {
        const k = ex.keys;
        const input = { crop: k.product === "Broken rice" ? "Rice" : k.product, variety: k.product === "Broken rice" ? "broken rice" : "",
          state: k.State, district: "" };
        const [dbRows] = await db.query(MANDI_ROWS_SQL, mandiRowsParams(spec, input, ex.date));
        const key = { product: k.product, vgroup: k.vgroup, state: k.State, market_key: k.market_key };
        const f = computeFeatures(dbRows.map((r) => ({ ...r, price: Number(r.price) })), spec, key, ex.date);
        for (const [name, want] of Object.entries(ex.features)) {
          assert.ok(close(f.values[name], want, 1e-9), `${ex.date} ${k.product}/${k.market_key}: ${name} from MySQL`);
        }
      }
    } finally {
      await db.end();
    }
  });

  it("ONNX in Node reproduces the exported predictions", async () => {
    for (const ex of spec.parity_examples) {
      const k = ex.keys;
      const numeric = withDerived(Object.fromEntries(Object.entries(ex.features).map(([n, v]) => [n, v ?? NaN])), spec.inputs.derived);
      const got = await predictLogChange(MODELS, spec, {
        categorical: { product: k.product, State: k.State, vgroup: k.vgroup, feature_level: k.feature_level },
        numeric,
      }, ["point", "q10", "q90"]);
      for (const m of ["point", "q10", "q90"]) {
        assert.ok(Math.abs(got[m] - ex.expected_log_change[m]) < 1e-5,
          `${ex.date} ${k.product}/${k.market_key} ${m}: got ${got[m]} want ${ex.expected_log_change[m]}`);
      }
    }
  });
});

describe("price suggestion", () => {
  const suggest = async (input, date) => {
    const db = await connectMysql();
    try {
      const [dbRows] = await db.query(MANDI_ROWS_SQL, mandiRowsParams(spec, input, date));
      return suggestFromRows(spec, MODELS, dbRows.map((r) => ({ ...r, price: Number(r.price) })), { ...input, date });
    } finally {
      await db.end();
    }
  };

  it("suggests a price and an 80% range for a Kolar tomato farmer", async () => {
    const s = await suggest({ crop: "Tomato", variety: "Arka Rakshak", state: "Karnataka", district: "Kolar" }, "2026-11-25");
    assert.equal(s.ok, true);
    assert.equal(s.market, "Kolar APMC");
    assert.equal(s.basis, "last known price");
    assert.ok(s.dataUpTo <= "2026-11-18", "only prices at least 7 days old are used");
    assert.ok(s.price > 0 && s.low > 0 && s.low < s.high);
    assert.equal(s.coverage, 0.8);
  });

  it("is honest about crops without enough market data", async () => {
    const s = await suggest({ crop: "Grapes", variety: "", state: "Maharashtra", district: "Nashik" }, "2026-11-25");
    assert.equal(s.ok, false);
    assert.match(s.reason, /Not enough government market data for Grapes/);
  });
});
