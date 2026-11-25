// Shared test fixtures. Opens its own connections (the app's db.ts / mongo.ts are server-only).
import { MongoClient } from "mongodb";
import mysql from "mysql2/promise";

export const BUYER = 7;       // FreshBite Foods (seed)
export const OTHER_BUYER = 8; // Hotel Kaveri Grand (seed)
export const FARMER = 1;      // Gowda Tomato Farm (seed)
export const TOMATO = 1;
export const POTATO = 3;

export function connectMysql() {
  return mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    decimalNumbers: true, dateStrings: true,
  });
}

export function connectMongo() {
  const client = new MongoClient(process.env.MONGODB_URI);
  return { client, db: client.db(process.env.MONGODB_DB) };
}

// Creates rows owned by one test and removes them (and their orders) afterwards.
export class Fixtures {
  constructor(db) {
    this.db = db;
    this.listings = [];
    this.requirements = [];
  }

  async listing({ qty = 100, price = 15, grade = "A", crop = TOMATO, harvestDaysAgo = 0, untilDays = 5 } = {}) {
    const [res] = await this.db.query(
      `INSERT INTO listings (farmer_id, crop_id, variety, quantity_kg, price_per_kg, quality_grade,
                             harvest_date, available_until)
       VALUES (?, ?, 'TEST', ?, ?, ?, CURDATE() - INTERVAL ? DAY, CURDATE() + INTERVAL ? DAY)`,
      [FARMER, crop, qty, price, grade, harvestDaysAgo, untilDays],
    );
    this.listings.push(res.insertId);
    return res.insertId;
  }

  async requirement({ qty = 100, maxPrice = 20, buyer = BUYER, crop = TOMATO } = {}) {
    const [res] = await this.db.query(
      `INSERT INTO requirements (buyer_id, crop_id, quantity_kg, max_price_per_kg, min_quality_grade, required_by)
       VALUES (?, ?, ?, ?, 'C', CURDATE() + INTERVAL 7 DAY)`,
      [buyer, crop, qty, maxPrice],
    );
    this.requirements.push(res.insertId);
    return res.insertId;
  }

  // CALL sp_place_order and return the new order id.
  async order(listingId, qty, { requirementId = null, buyer = BUYER } = {}) {
    await this.db.query("CALL sp_place_order(?, ?, ?, ?, @order_id)", [buyer, listingId, requirementId, qty]);
    const [[row]] = await this.db.query("SELECT @order_id AS id");
    return row.id;
  }

  async row(table, idColumn, id) {
    const [[row]] = await this.db.query(`SELECT * FROM ${table} WHERE ${idColumn} = ?`, [id]);
    return row;
  }

  async cleanup() {
    if (this.listings.length) {
      // reviews, history and deliveries cascade from orders; matches cascade from listings
      await this.db.query("DELETE FROM orders WHERE listing_id IN (?)", [this.listings]);
      await this.db.query("DELETE FROM listings WHERE listing_id IN (?)", [this.listings]);
    }
    if (this.requirements.length) {
      await this.db.query("DELETE FROM orders WHERE requirement_id IN (?)", [this.requirements]);
      await this.db.query("DELETE FROM requirements WHERE requirement_id IN (?)", [this.requirements]);
    }
    this.listings = [];
    this.requirements = [];
  }
}

// Asserts that fn() fails with a MySQL error whose message matches `pattern`.
export async function rejectsWith(fn, pattern) {
  const assert = (await import("node:assert/strict")).default;
  await assert.rejects(fn, (err) => {
    assert.match(err.sqlMessage ?? err.message, pattern);
    return true;
  });
}
