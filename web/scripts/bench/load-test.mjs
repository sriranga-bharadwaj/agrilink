// Concurrency test for sp_place_order: many simultaneous purchases of one listing.
// Each round creates a listing with STOCK_KG, opens CONNECTIONS separate MySQL connections,
// then fires one ORDER_KG purchase per connection at the same moment. Demand exceeds stock,
// so exactly STOCK_KG / ORDER_KG orders must succeed and the rest must be refused.
//
// A control round runs the same harness with a naive read-then-write (no row lock) to show
// that the harness really races and that the lock is what prevents overselling.
//
// Usage (Docker, throwaway project):
//   docker compose -p agrilink-bench run --rm web node scripts/bench/load-test.mjs
import mysql from "mysql2/promise";

const CONNECTIONS = Number(process.env.CONNECTIONS ?? 100);
const ROUNDS = Number(process.env.ROUNDS ?? 5);
const STOCK_KG = 1000;
const ORDER_KG = 25;
const BUYER_ID = 7; // FreshBite Foods (seed data)
const EXPECTED = STOCK_KG / ORDER_KG;

const config = {
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  decimalNumbers: true,
};
const admin = await mysql.createConnection(config);

async function createListing() {
  const [res] = await admin.query(
    `INSERT INTO listings (farmer_id, crop_id, variety, quantity_kg, price_per_kg, quality_grade,
                           harvest_date, available_until)
     VALUES (1, 1, 'LOADTEST', ?, 15, 'A', CURDATE(), CURDATE() + INTERVAL 5 DAY)`,
    [STOCK_KG],
  );
  return res.insertId;
}

// Locked path: the real stored procedure.
async function lockedBuy(conn, listingId) {
  await conn.query("CALL sp_place_order(?, ?, NULL, ?, @order_id)", [BUYER_ID, listingId, ORDER_KG]);
}

// Control path: check stock, then write back the value read earlier (no FOR UPDATE).
async function naiveBuy(conn, listingId) {
  const [[row]] = await conn.query("SELECT available_kg, price_per_kg FROM listings WHERE listing_id = ?", [listingId]);
  if (row.available_kg < ORDER_KG) throw new Error(`Only ${row.available_kg} kg available`);
  await conn.query("UPDATE listings SET available_kg = ? WHERE listing_id = ?", [row.available_kg - ORDER_KG, listingId]);
  await conn.query(
    "INSERT INTO orders (buyer_id, listing_id, quantity_kg, price_per_kg) VALUES (?, ?, ?, ?)",
    [BUYER_ID, listingId, ORDER_KG, row.price_per_kg],
  );
}

function classify(err) {
  const msg = err.sqlMessage ?? err.message;
  if (/kg available|Listing is SOLD_OUT/.test(msg)) return "refused (out of stock)";
  if (err.code === "ER_LOCK_DEADLOCK") return "deadlock";
  if (err.code === "ER_LOCK_WAIT_TIMEOUT") return "lock wait timeout";
  return `other: ${msg}`;
}

async function round(kind, buy) {
  const listingId = await createListing();
  // Open every connection before firing, so all purchases really overlap.
  const conns = await Promise.all(Array.from({ length: CONNECTIONS }, () => mysql.createConnection(config)));
  const started = performance.now();
  const results = await Promise.allSettled(conns.map((c) => buy(c, listingId)));
  const elapsed = performance.now() - started;
  await Promise.all(conns.map((c) => c.end()));

  const outcomes = {};
  for (const r of results) {
    const key = r.status === "fulfilled" ? "succeeded" : classify(r.reason);
    outcomes[key] = (outcomes[key] ?? 0) + 1;
  }
  const [[l]] = await admin.query("SELECT available_kg, status FROM listings WHERE listing_id = ?", [listingId]);
  const [[o]] = await admin.query(
    "SELECT COUNT(*) AS orders, COALESCE(SUM(quantity_kg), 0) AS sold FROM orders WHERE listing_id = ?", [listingId]);
  const [[h]] = await admin.query(
    `SELECT COUNT(*) AS rows_ FROM order_status_history WHERE order_id IN (SELECT order_id FROM orders WHERE listing_id = ?)`,
    [listingId]);

  const oversoldKg = Math.max(0, o.sold - STOCK_KG);
  const checks = {
    successesAsExpected: outcomes.succeeded === EXPECTED,
    stockNeverNegative: l.available_kg >= 0,
    soldPlusRemainingEqualsStock: o.sold + l.available_kg === STOCK_KG,
    oneHistoryRowPerOrder: h.rows_ === o.orders,
  };
  console.log(
    `${kind.padEnd(7)} | ${CONNECTIONS} calls, ${ORDER_KG} kg each, stock ${STOCK_KG} kg | ` +
    `${JSON.stringify(outcomes)} | orders ${o.orders}, sold ${o.sold} kg, left ${l.available_kg} kg (${l.status}), ` +
    `oversold ${oversoldKg} kg | ${elapsed.toFixed(0)} ms | ` +
    (Object.values(checks).every(Boolean) ? "ALL CHECKS PASS" : `FAILED: ${Object.keys(checks).filter((k) => !checks[k]).join(", ")}`),
  );
  return { listingId, checks, oversoldKg, outcomes };
}

const created = [];
try {
  const [[v]] = await admin.query("SELECT VERSION() AS v");
  console.log(`MySQL ${v.v}; expecting exactly ${EXPECTED} successful orders per round\n`);
  const locked = [], naive = [];
  for (let i = 0; i < ROUNDS; i++) {
    const r = await round("locked", lockedBuy); created.push(r.listingId); locked.push(r);
  }
  for (let i = 0; i < ROUNDS; i++) {
    const r = await round("naive", naiveBuy); created.push(r.listingId); naive.push(r);
  }
  const passed = locked.filter((r) => Object.values(r.checks).every(Boolean)).length;
  console.log(`\nsp_place_order: ${passed}/${ROUNDS} rounds passed all checks; ` +
    `total oversold ${locked.reduce((s, r) => s + r.oversoldKg, 0)} kg over ${ROUNDS * CONNECTIONS} calls.`);
  console.log(`naive control: total oversold ${naive.reduce((s, r) => s + r.oversoldKg, 0)} kg over ${ROUNDS * CONNECTIONS} calls.`);
} finally {
  if (created.length) {
    await admin.query("DELETE FROM orders WHERE listing_id IN (?)", [created]); // history rows cascade
    await admin.query("DELETE FROM listings WHERE listing_id IN (?)", [created]);
  }
  await admin.end();
}
