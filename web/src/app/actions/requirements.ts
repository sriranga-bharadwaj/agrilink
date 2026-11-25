"use server";

import type { ResultSetHeader } from "mysql2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/ActionForm";
import { dbErrorMessage, pool, query } from "@/lib/db";
import { embed } from "@/lib/embed";
import { cropSpecs, requirementSpecs } from "@/lib/mongo";
import { constraintsFromForm } from "@/lib/quality";
import { requireRole } from "@/lib/session";

// The requirement row goes to MySQL; the buyer's crop-specific quality limits
// and an embedding of the notes go to MongoDB, keyed by requirement_id.
export async function createRequirement(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireRole("BUYER");
  const cropId = Number(formData.get("crop_id"));
  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length < 5) return { error: "Say briefly what the produce is for" };

  const [crop] = await query<{ crop_name: string }>("SELECT crop_name FROM crops WHERE crop_id = ?", [cropId]);
  if (!crop) return { error: "Unknown crop" };
  const spec = await cropSpecs.findOne({ crop: crop.crop_name });

  let requirementId: number;
  try {
    const [res] = await pool.execute<ResultSetHeader>(
      `INSERT INTO requirements (buyer_id, crop_id, quantity_kg, max_price_per_kg, min_quality_grade,
                                 organic_only, max_distance_km, required_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.userId,
        cropId,
        Number(formData.get("quantity_kg")),
        Number(formData.get("max_price_per_kg")),
        String(formData.get("min_quality_grade")),
        formData.get("organic_only") === "on",
        Number(formData.get("max_distance_km")),
        String(formData.get("required_by")),
      ],
    );
    requirementId = res.insertId;
  } catch (e) {
    return { error: dbErrorMessage(e) };
  }

  try {
    await requirementSpecs.insertOne({
      requirement_id: requirementId,
      buyer_id: session.userId,
      crop: crop.crop_name,
      constraints: spec ? constraintsFromForm(spec, formData) : {},
      notes,
      embedding: await embed(`${crop.crop_name}. ${notes}`),
      updated_at: new Date(),
    });
  } catch (e) {
    console.error(e);
    await query("DELETE FROM requirements WHERE requirement_id = ?", [requirementId]);
    return { error: "Could not save the quality specification, so the requirement was not created" };
  }

  revalidatePath("/buyer");
  redirect(`/buyer/requirements/${requirementId}`);
}

export async function cancelRequirement(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireRole("BUYER");
  await query("UPDATE requirements SET status = 'CANCELLED' WHERE requirement_id = ? AND buyer_id = ? AND status = 'OPEN'", [
    Number(formData.get("requirement_id")),
    session.userId,
  ]);
  revalidatePath("/buyer");
  return null;
}
