// Loads web/data/mandi_prices.csv into the mandi_prices table, unless it already has rows.
// Usage (from web/): npm run mandi:load      (Docker runs it in the seed service)
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";
import { parseCsv } from "./csv.mjs";

const BATCH = 2000;
const CROP_OF_PRODUCT = { "Broken rice": "Rice" };

const db = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});
try {
  const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM mandi_prices");
  if (n > 0) {
    console.log(`mandi_prices already has ${n} rows; skipping.`);
  } else {
    const [header, ...lines] = parseCsv(await readFile(new URL("../../data/mandi_prices.csv", import.meta.url), "utf8"));
    const col = Object.fromEntries(header.map((h, i) => [h, i]));
    const [crops] = await db.query("SELECT crop_id, crop_name FROM crops");
    const cropId = Object.fromEntries(crops.map((c) => [c.crop_name, c.crop_id]));

    const values = lines.map((r) => {
      const product = r[col.product];
      const id = cropId[CROP_OF_PRODUCT[product] ?? product];
      if (!id) throw new Error(`No crop row for product ${product}`);
      return [id, product, r[col.variety_group], r[col.state], r[col.district], r[col.market_key], r[col.market],
        r[col.price_date], r[col.price_per_kg]];
    });
    for (let i = 0; i < values.length; i += BATCH) {
      await db.query(
        `INSERT INTO mandi_prices (crop_id, product, variety_group, state, district, market_key, market,
                                   price_date, price_per_kg) VALUES ?`,
        [values.slice(i, i + BATCH)],
      );
    }
    console.log(`Loaded ${values.length} mandi price rows.`);
  }
} finally {
  await db.end();
}
