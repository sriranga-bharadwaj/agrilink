"use server";

import type { ResultSetHeader } from "mysql2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/ActionForm";
import { dbErrorMessage, pool, query } from "@/lib/db";
import { embed } from "@/lib/embed";
import { cropSpecs, listingQuality } from "@/lib/mongo";
import { attributesFromForm, type Certification } from "@/lib/quality";
import { requireRole } from "@/lib/session";

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
