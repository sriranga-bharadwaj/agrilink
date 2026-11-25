// Integration tests for the MySQL procedures, triggers and constraints.
// Needs a database built from database/mysql/01-05 (Docker Compose or run_all.ps1).
import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { BUYER, Fixtures, OTHER_BUYER, POTATO, connectMysql, rejectsWith } from "./helpers.mjs";

let db;
let fx;
before(async () => {
  db = await connectMysql();
  fx = new Fixtures(db);
});
afterEach(() => fx.cleanup());
after(() => db.end());

describe("sp_find_matches", () => {
  it("returns only listings that pass every hard filter, ranked by score", async () => {
    const [result] = await db.query("CALL sp_find_matches(1)");
    const rows = result[0]; // CALL returns [resultSet, okPacket]
    const ids = rows.map((r) => r.listing_id);
    assert.ok(ids.includes(1) && ids.includes(2), "seed tomato listings 1 and 2 match requirement 1");
    assert.ok(!ids.includes(3), "listing 3 costs more than the buyer's Rs 20/kg limit");
    assert.ok(!ids.includes(13), "listing 13 is past its available_until date");
    for (const r of rows) {
      assert.equal(r.crop_name, "Tomato");
      assert.ok(r.price_per_kg <= 20 && ["A", "B"].includes(r.quality_grade) && r.distance_km <= 150);
      assert.ok(r.score >= 0 && r.score <= 100);
    }
    const scores = rows.map((r) => r.score);
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  });

  it("refuses a requirement that is not open", async () => {
    const req = await fx.requirement();
    await db.query("UPDATE requirements SET status = 'CANCELLED' WHERE requirement_id = ?", [req]);
    await rejectsWith(() => db.query("CALL sp_find_matches(?)", [req]), /Requirement is not open/);
  });
});

describe("sp_place_order", () => {
  it("reduces stock, copies the price and computes total_amount", async () => {
    const listing = await fx.listing({ qty: 100, price: 15 });
    const orderId = await fx.order(listing, 40);
    const order = await fx.row("orders", "order_id", orderId);
    assert.equal(order.status, "PLACED");
    assert.equal(order.price_per_kg, 15);
    assert.equal(order.total_amount, 600, "generated column = 40 kg x Rs 15");
    assert.equal((await fx.row("listings", "listing_id", listing)).available_kg, 60);
    const [history] = await db.query("SELECT old_status, new_status FROM order_status_history WHERE order_id = ?", [orderId]);
    assert.deepEqual(history, [{ old_status: null, new_status: "PLACED" }], "trg_orders_ai writes the first history row");
  });

  it("refuses to oversell and rolls everything back", async () => {
    const listing = await fx.listing({ qty: 100 });
    await rejectsWith(() => fx.order(listing, 150), /Only 100\.00 kg available/);
    assert.equal((await fx.row("listings", "listing_id", listing)).available_kg, 100);
    const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM orders WHERE listing_id = ?", [listing]);
    assert.equal(n, 0);
  });

  it("refuses a zero quantity", async () => {
    const listing = await fx.listing();
    await rejectsWith(() => fx.order(listing, 0), /Quantity must be greater than zero/);
  });

  it("marks the listing SOLD_OUT at 0 kg and refuses further orders", async () => {
    const listing = await fx.listing({ qty: 50 });
    await fx.order(listing, 50);
    assert.equal((await fx.row("listings", "listing_id", listing)).status, "SOLD_OUT", "trg_listings_bu");
    await rejectsWith(() => fx.order(listing, 1), /Listing is SOLD_OUT/);
  });

  it("fills the requirement and marks it FULFILLED when complete", async () => {
    const listing = await fx.listing({ qty: 100 });
    const req = await fx.requirement({ qty: 60 });
    await fx.order(listing, 20, { requirementId: req });
    let r = await fx.row("requirements", "requirement_id", req);
    assert.equal(r.fulfilled_kg, 20);
    assert.equal(r.status, "OPEN");
    await fx.order(listing, 40, { requirementId: req });
    r = await fx.row("requirements", "requirement_id", req);
    assert.equal(r.fulfilled_kg, 60);
    assert.equal(r.status, "FULFILLED");
  });

  it("refuses more than the requirement still needs, with no changes", async () => {
    const listing = await fx.listing({ qty: 100 });
    const req = await fx.requirement({ qty: 30 });
    await rejectsWith(() => fx.order(listing, 50, { requirementId: req }), /Requirement needs only 30\.00 kg more/);
    assert.equal((await fx.row("listings", "listing_id", listing)).available_kg, 100);
    assert.equal((await fx.row("requirements", "requirement_id", req)).fulfilled_kg, 0);
  });

  it("refuses another buyer's requirement and a crop mismatch", async () => {
    const tomato = await fx.listing();
    const potato = await fx.listing({ crop: POTATO });
    const req = await fx.requirement();
    await rejectsWith(() => fx.order(tomato, 10, { requirementId: req, buyer: OTHER_BUYER }),
      /Requirement does not belong to this buyer/);
    await rejectsWith(() => fx.order(potato, 10, { requirementId: req }), /Listing crop does not match requirement/);
    assert.equal((await fx.row("listings", "listing_id", potato)).available_kg, 100);
  });
});

describe("order lifecycle triggers", () => {
  it("blocks skipping steps and leaves the order unchanged", async () => {
    const orderId = await fx.order(await fx.listing(), 10);
    await rejectsWith(() => db.query("UPDATE orders SET status = 'DELIVERED' WHERE order_id = ?", [orderId]),
      /Invalid order status transition/);
    assert.equal((await fx.row("orders", "order_id", orderId)).status, "PLACED");
  });

  it("blocks changing an order's quantity", async () => {
    const orderId = await fx.order(await fx.listing(), 10);
    await rejectsWith(() => db.query("UPDATE orders SET quantity_kg = 5 WHERE order_id = ?", [orderId]),
      /Order quantity and listing cannot be changed/);
  });

  it("tracks delivery and audits every step from PLACED to DELIVERED", async () => {
    const orderId = await fx.order(await fx.listing(), 10);
    for (const status of ["CONFIRMED", "SHIPPED"]) {
      await db.query("UPDATE orders SET status = ? WHERE order_id = ?", [status, orderId]);
    }
    const [[d]] = await db.query(
      "SELECT DATEDIFF(expected_date, pickup_date) AS days, pickup_date = CURDATE() AS today, delivered_date FROM deliveries WHERE order_id = ?",
      [orderId]);
    assert.deepEqual(d, { days: 2, today: 1, delivered_date: null }, "SHIPPED creates the delivery row");

    await db.query("UPDATE orders SET status = 'DELIVERED' WHERE order_id = ?", [orderId]);
    const [[d2]] = await db.query("SELECT delivered_date = CURDATE() AS today FROM deliveries WHERE order_id = ?", [orderId]);
    assert.equal(d2.today, 1);
    const [history] = await db.query(
      "SELECT new_status FROM order_status_history WHERE order_id = ? ORDER BY history_id", [orderId]);
    assert.deepEqual(history.map((h) => h.new_status), ["PLACED", "CONFIRMED", "SHIPPED", "DELIVERED"]);
  });

  it("cancelling returns stock, reactivates a sold-out listing and reopens the requirement", async () => {
    const listing = await fx.listing({ qty: 50 });
    const req = await fx.requirement({ qty: 50 });
    const orderId = await fx.order(listing, 50, { requirementId: req });
    assert.equal((await fx.row("listings", "listing_id", listing)).status, "SOLD_OUT");
    assert.equal((await fx.row("requirements", "requirement_id", req)).status, "FULFILLED");

    await db.query("UPDATE orders SET status = 'CANCELLED' WHERE order_id = ?", [orderId]);
    const l = await fx.row("listings", "listing_id", listing);
    const r = await fx.row("requirements", "requirement_id", req);
    assert.deepEqual([l.available_kg, l.status], [50, "ACTIVE"]);
    assert.deepEqual([r.fulfilled_kg, r.status], [0, "OPEN"]);
  });
});

describe("reviews", () => {
  it("only allow the order's parties to review, once, after delivery", async () => {
    const orderId = await fx.order(await fx.listing(), 10);
    const review = (reviewer) =>
      db.query("INSERT INTO reviews (order_id, reviewer_id, rating) VALUES (?, ?, 5)", [orderId, reviewer]);

    await rejectsWith(() => review(BUYER), /Only delivered orders can be reviewed/);
    for (const status of ["CONFIRMED", "SHIPPED", "DELIVERED"]) {
      await db.query("UPDATE orders SET status = ? WHERE order_id = ?", [status, orderId]);
    }
    await review(BUYER);
    await rejectsWith(() => review(BUYER), /Duplicate entry/);
    await rejectsWith(() => review(OTHER_BUYER), /Reviewer is not part of this order/);
    await rejectsWith(
      () => db.query("INSERT INTO reviews (order_id, reviewer_id, rating) VALUES (?, 1, 9)", [orderId]),
      /chk_review_rating/);
  });
});

describe("listing constraints", () => {
  it("reject a future harvest date, a zero price and an end date before harvest", async () => {
    await rejectsWith(() => fx.listing({ harvestDaysAgo: -1 }), /Harvest date cannot be in the future/);
    await rejectsWith(() => fx.listing({ price: 0 }), /chk_listings_price/);
    await rejectsWith(() => fx.listing({ harvestDaysAgo: 3, untilDays: -5 }), /chk_listings_dates/);
  });

  it("sp_expire_stale expires listings past their available_until date", async () => {
    const listing = await fx.listing({ harvestDaysAgo: 10, untilDays: -1 });
    await db.query("CALL sp_expire_stale()");
    assert.equal((await fx.row("listings", "listing_id", listing)).status, "EXPIRED");
  });
});
