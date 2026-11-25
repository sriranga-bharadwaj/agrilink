// Benchmarks CALL sp_find_matches(1) on a large listings table under three index setups:
//   composite  - idx_listings_match (crop_id, status, price_per_kg), as shipped
//   crop only  - composite hidden, plain index on crop_id (what a foreign key alone gives you)
//   no index   - composite hidden, nothing else on crop_id (full table scan)
// Times the whole procedure (delete old suggestions, filter + score, insert matches, ranked result),
// median of RUNS calls after WARMUP calls. Synthetic rows are removed afterwards.
//
// Data shape (fixed): ROWS listings, crops 1-10 uniform, farmers 1-6 uniform, 20% ACTIVE and
// 80% SOLD_OUT / EXPIRED / WITHDRAWN, price Rs 10-40/kg uniform, grade A/B/C uniform,
// harvested 0-9 days ago, available for 1-20 more days.
//
// Usage (Docker, throwaway project):
//   docker compose -p agrilink-bench run --rm web node scripts/bench/query-benchmark.mjs
import mysql from "mysql2/promise";

const ROWS = Number(process.env.ROWS ?? 100_000);
const WARMUP = 3;
const RUNS = 15;
const BATCH = 2_000;

const db = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});

// Deterministic pseudo-random numbers so every run uses the same data.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

async function load() {
  const statuses = ["ACTIVE", "SOLD_OUT", "EXPIRED", "WITHDRAWN", "SOLD_OUT"]; // 20% ACTIVE
  for (let done = 0; done < ROWS; done += BATCH) {
    const rows = [];
    for (let i = 0; i < Math.min(BATCH, ROWS - done); i++) {
      rows.push([
        1 + Math.floor(rand() * 6), 1 + Math.floor(rand() * 10), "BENCH",
        500 + Math.floor(rand() * 4500), (10 + rand() * 30).toFixed(2), pick(["A", "B", "C"]),
        rand() < 0.3, Math.floor(rand() * 10), 1 + Math.floor(rand() * 20), pick(statuses),
      ]);
    }
    await db.query(
      `INSERT INTO listings (farmer_id, crop_id, variety, quantity_kg, price_per_kg, quality_grade, is_organic,
                             harvest_date, available_until, status)
       VALUES ${rows.map(() => "(?, ?, ?, ?, ?, ?, ?, CURDATE() - INTERVAL ? DAY, CURDATE() + INTERVAL ? DAY, ?)").join(", ")}`,
      rows.flat(),
    );
  }
  await db.query("ANALYZE TABLE listings");
}

async function explain() {
  const [plan] = await db.query(
    `EXPLAIN SELECT l.listing_id FROM requirements r JOIN listings l ON l.crop_id = r.crop_id
      WHERE r.requirement_id = 1 AND l.status = 'ACTIVE' AND l.price_per_kg <= r.max_price_per_kg`);
  const l = plan.find((p) => p.table === "l");
  return `access=${l.type}, key=${l.key ?? "none"}, rows examined (est.)=${l.rows}`;
}

async function time(label) {
  for (let i = 0; i < WARMUP; i++) await db.query("CALL sp_find_matches(1)");
  const samples = [];
  let matches = 0;
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now();
    const [result] = await db.query("CALL sp_find_matches(1)");
    samples.push(performance.now() - t);
    matches = result[0].length;
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(RUNS / 2)];
  console.log(`${label.padEnd(10)} | median ${median.toFixed(1)} ms (min ${samples[0].toFixed(1)}, max ${samples.at(-1).toFixed(1)}) | ` +
    `${matches} matches | ${await explain()}`);
  return median;
}

try {
  const [[v]] = await db.query("SELECT VERSION() AS v");
  console.log(`MySQL ${v.v}; loading ${ROWS.toLocaleString()} synthetic listings...`);
  const t = performance.now();
  await load();
  const [[c]] = await db.query("SELECT COUNT(*) AS n, SUM(status = 'ACTIVE') AS active FROM listings");
  console.log(`listings: ${c.n} rows (${c.active} ACTIVE), loaded in ${((performance.now() - t) / 1000).toFixed(1)} s`);
  console.log(`timing CALL sp_find_matches(1): ${WARMUP} warm-up + ${RUNS} measured calls each\n`);

  const composite = await time("composite");
  await db.query("CREATE INDEX idx_bench_crop ON listings (crop_id)");
  await db.query("ALTER TABLE listings ALTER INDEX idx_listings_match INVISIBLE");
  const cropOnly = await time("crop only");
  await db.query("DROP INDEX idx_bench_crop ON listings");
  const none = await time("no index");

  console.log(`\ncomposite index vs crop_id-only: ${(cropOnly / composite).toFixed(1)}x faster`);
  console.log(`composite index vs no index:     ${(none / composite).toFixed(1)}x faster`);
} finally {
  await db.query("ALTER TABLE listings ALTER INDEX idx_listings_match VISIBLE");
  await db.query("DROP INDEX idx_bench_crop ON listings").catch(() => {});
  await db.query("DELETE FROM listings WHERE variety = 'BENCH'"); // their matches cascade
  await db.end();
}
