// Unit tests for the fixed listing rules applied on top of the mandi-based suggestion.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adjustmentFactor, adjustments, applyAdjustments } from "../src/lib/price-adjust.ts";

const base = { grade: "B", organic: false, daysSinceHarvest: 0, shelfLifeDays: 10, demandSupplyRatio: 0.8 };

describe("listing adjustments", () => {
  it("a fresh grade B listing in a balanced market is not adjusted", () => {
    assert.equal(adjustmentFactor(adjustments(base)), 1);
  });

  it("grade, organic and demand compound", () => {
    const list = adjustments({ ...base, grade: "A", organic: true, demandSupplyRatio: 1.4 });
    assert.deepEqual(list.map((a) => a.pct), [10, 20, 0, 5]);
    assert.ok(Math.abs(adjustmentFactor(list) - 1.1 * 1.2 * 1.05) < 1e-12);
  });

  it("freshness discount grows with shelf life used and stops at -20%", () => {
    const pct = (days) => adjustments({ ...base, daysSinceHarvest: days }).find((a) => a.label.startsWith("Freshness")).pct;
    assert.equal(pct(5), -10);
    assert.equal(pct(10), -20);
    assert.equal(pct(30), -20);
  });

  it("low demand and grade C reduce the price; unknown demand is ignored", () => {
    assert.deepEqual(adjustments({ ...base, grade: "C", demandSupplyRatio: 0.3 }).map((a) => a.pct), [-15, 0, -5]);
    assert.equal(adjustments({ ...base, demandSupplyRatio: null }).length, 2);
  });

  it("scales the price and both ends of the range by the same factor", () => {
    assert.deepEqual(applyAdjustments(20, 16, 25, 1.1), { price: 22, low: 17.6, high: 27.5 });
  });
});
