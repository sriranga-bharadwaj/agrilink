"use server";

import type { ResultSetHeader } from "mysql2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/ActionForm";
import { dbErrorMessage, pool, query } from "@/lib/db";
import { embed } from "@/lib/embed";
import { cropSpecs, listingQuality } from "@/lib/mongo";
import { adjustmentFactor, adjustments, applyAdjustments, type Adjustment } from "@/lib/price-adjust";
import { suggestMandiPrice } from "@/lib/pricing";
import { attributesFromForm, type Certification } from "@/lib/quality";
import { requireRole } from "@/lib/session";

export type PriceSuggestionState =
  | null
  | { error: string }
  | {
      ok: true;
      price: number;
      low: number;
      high: number;
      coverage: number;
      mandi: { price: number; low: number; high: number; basis: string; market: string | null; state: string;
        product: string; varietyGroup: string; dataUpTo: string };
      adjustments: Adjustment[];
    };

// Suggested price for the listing being filled in: government mandi price (baseline + calibrated range
// from the model) for the farmer's district, then fixed listing rules (grade, organic, freshness, demand).
export async function suggestPrice(_prev: PriceSuggestionState, formData: FormData): Promise<PriceSuggestionState> {
  const session = await requireRole("FARMER");
  const cropId = Number(formData.get("crop_id"));
  const harvest = String(formData.get("harvest_date") ?? "");
  if (!harvest) return { error: "Enter the harvest date first" };

  const [[farmer], [crop], [market]] = await Promise.all([
    query<{ state: string; district: string }>("SELECT state, district FROM farmers WHERE farmer_id = ?", [session.userId]),
    query<{ crop_name: string; shelf_life_days: number }>(
      "SELECT crop_name, shelf_life_days FROM crops WHERE crop_id = ?", [cropId]),
    query<{ demand_supply_ratio: number | null }>(
      "SELECT demand_supply_ratio FROM v_crop_market_summary WHERE crop_id = ?", [cropId]),
  ]);
  if (!farmer || !crop) return { error: "Unknown farmer or crop" };

  try {
    const s = await suggestMandiPrice({
      crop: crop.crop_name, variety: String(formData.get("variety") ?? ""), state: farmer.state, district: farmer.district,
    });
    if (!s.ok) return { error: s.reason };
    const [{ days }] = await query<{ days: number }>("SELECT DATEDIFF(CURDATE(), ?) AS days", [harvest]);
    const list = adjustments({
      grade: String(formData.get("quality_grade")) as "A" | "B" | "C",
      organic: formData.get("is_organic") === "on",
      daysSinceHarvest: days,
      shelfLifeDays: crop.shelf_life_days,
      demandSupplyRatio: market?.demand_supply_ratio ?? null,
    });
    const adjusted = applyAdjustments(s.price, s.low, s.high, adjustmentFactor(list));
    return {
      ok: true, ...adjusted, coverage: s.coverage, adjustments: list,
      mandi: { price: s.price, low: s.low, high: s.high, basis: s.basis, market: s.market, state: farmer.state,
        product: s.product, varietyGroup: s.varietyGroup, dataUpTo: s.dataUpTo },
    };
  } catch (e) {
    return { error: dbErrorMessage(e) };
  }
}

// The listing row goes to MySQL (stock, price, orders); its crop-specific
// quality details and description embedding go to MongoDB, keyed by listing_id.
export async function createListing(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireRole("FARMER");
  const cropId = Number(formData.get("crop_id"));
  const variety = String(formData.get("variety") ?? "").trim() || null;
  const grade = String(formData.get("quality_grade")) as "A" | "B" | "C";
  const isOrganic = formData.get("is_organic") === "on";
  const description = String(formData.get("description") ?? "").trim();
  if (description.length < 10) return { error: "Add a short description (at least 10 characters)" };

  const [crop] = await query<{ crop_name: string }>("SELECT crop_name FROM crops WHERE crop_id = ?", [cropId]);
  if (!crop) return { error: "Unknown crop" };
  const spec = await cropSpecs.findOne({ crop: crop.crop_name });

  let listingId: number;
  try {
    // available_kg and status are set by trg_listings_bi; CHECK constraints
    // reject bad quantities, prices and dates.
    const [res] = await pool.execute<ResultSetHeader>(
      `INSERT INTO listings (farmer_id, crop_id, variety, quantity_kg, price_per_kg, quality_grade,
                             is_organic, harvest_date, available_until)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.userId, cropId, variety,
        Number(formData.get("quantity_kg")), Number(formData.get("price_per_kg")),
        grade, isOrganic,
        String(formData.get("harvest_date")), String(formData.get("available_until")),
      ],
    );
    listingId = res.insertId;
  } catch (e) {
    return { error: dbErrorMessage(e) };
  }

  const certifications: Certification[] = [];
  const certName = String(formData.get("cert_name") ?? "").trim();
  const certUntil = String(formData.get("cert_valid_until") ?? "");
  if (certName && certUntil) {
    certifications.push({
      name: certName,
      issuer: String(formData.get("cert_issuer") ?? "").trim() || "Self-declared",
      valid_until: new Date(certUntil),
    });
  }
  const inspector = String(formData.get("inspector") ?? "").trim();

  try {
    await listingQuality.insertOne({
      listing_id: listingId,
      farmer_id: session.userId,
      crop: crop.crop_name,
      variety,
      grade,
      is_organic: isOrganic,
      attributes: spec ? attributesFromForm(spec, formData) : {},
      certifications,
      inspection: {
        method: formData.get("inspection_method") === "LAB" ? "LAB" : "SELF",
        inspected_on: new Date(),
        ...(inspector && { inspector }),
      },
      description,
      embedding: await embed(`${crop.crop_name} ${variety ?? ""}. ${description}`),
      updated_at: new Date(),
    });
  } catch (e) {
    // Keep the two stores consistent: no quality document, no listing.
    console.error(e);
    await query("DELETE FROM listings WHERE listing_id = ?", [listingId]);
    return { error: "Could not save the quality details, so the listing was not created" };
  }

  revalidatePath("/farmer");
  redirect("/farmer");
}

export async function withdrawListing(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireRole("FARMER");
  await query(
    "UPDATE listings SET status = 'WITHDRAWN' WHERE listing_id = ? AND farmer_id = ? AND status IN ('ACTIVE','SOLD_OUT')",
    [Number(formData.get("listing_id")), session.userId],
  );
  revalidatePath("/farmer");
  return null;
}
