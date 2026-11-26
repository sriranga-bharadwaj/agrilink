// Listing adjustments on top of the mandi-based suggestion. These are fixed rules, not learned from data:
// the model only knows wholesale mandi prices, not this farmer's grade, certification or freshness.

export type AdjustInput = {
  grade: "A" | "B" | "C";
  organic: boolean;
  daysSinceHarvest: number;
  shelfLifeDays: number;
  demandSupplyRatio: number | null; // open demand kg / listed supply kg for the crop on AgriLink
};

export type Adjustment = { label: string; pct: number };

const GRADE_PCT = { A: 10, B: 0, C: -15 } as const;
const ORGANIC_PCT = 20;
const MAX_FRESHNESS_PCT = -20;
const DEMAND_PCT = 5;

export function adjustments(a: AdjustInput): Adjustment[] {
  const out: Adjustment[] = [{ label: `Grade ${a.grade}`, pct: GRADE_PCT[a.grade] }];
  if (a.organic) out.push({ label: "Certified organic", pct: ORGANIC_PCT });
  const age = Math.min(1, Math.max(0, a.daysSinceHarvest) / a.shelfLifeDays);
  out.push({ label: `Freshness (${a.daysSinceHarvest} of ${a.shelfLifeDays} shelf-life days used)`,
    pct: Math.round(MAX_FRESHNESS_PCT * age * 10) / 10 || 0 }); // || 0 turns -0 into 0 (shown as "0%")
  if (a.demandSupplyRatio !== null && a.demandSupplyRatio > 1) {
    out.push({ label: `AgriLink demand exceeds supply (${a.demandSupplyRatio.toFixed(2)}x)`, pct: DEMAND_PCT });
  } else if (a.demandSupplyRatio !== null && a.demandSupplyRatio < 0.5) {
    out.push({ label: `AgriLink supply exceeds demand (${a.demandSupplyRatio.toFixed(2)}x)`, pct: -DEMAND_PCT });
  }
  return out;
}

/** Combined multiplier: adjustments compound. */
export function adjustmentFactor(list: Adjustment[]): number {
  return list.reduce((f, a) => f * (1 + a.pct / 100), 1);
}

/** Applies the factor to the suggested price and both ends of the range (the range keeps its meaning:
 *  market-price uncertainty, scaled to this listing; the rules themselves add no uncertainty estimate). */
export function applyAdjustments(price: number, low: number, high: number, factor: number) {
  const round = (x: number) => Math.round(x * 100) / 100;
  return { price: round(price * factor), low: round(low * factor), high: round(high * factor) };
}
