"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/components/ActionForm";
import { dbErrorMessage, pool, query } from "@/lib/db";
import { getSession, requireRole } from "@/lib/session";

// Places an order through sp_place_order, which locks the listing row and
// commits or rolls back as one transaction.
export async function placeOrder(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireRole("BUYER");
  const listingId = Number(formData.get("listing_id"));
  const requirementId = formData.get("requirement_id") ? Number(formData.get("requirement_id")) : null;
  const quantity = Number(formData.get("quantity_kg"));

  const conn = await pool.getConnection();
  try {
    await conn.query("CALL sp_place_order(?, ?, ?, ?, @order_id)", [session.userId, listingId, requirementId, quantity]);
    const [rows] = await conn.query("SELECT @order_id AS order_id");
    const orderId = (rows as { order_id: number }[])[0].order_id;
    revalidatePath("/buyer");
    if (requirementId) revalidatePath(`/buyer/requirements/${requirementId}`);
    return { ok: `Order #${orderId} placed for ${quantity} kg` };
  } catch (e) {
    return { error: dbErrorMessage(e) };
  } finally {
    conn.release();
  }
}

// Farmers move orders forward; buyers can cancel. The allowed transitions are
// enforced by trg_orders_bu, and trg_orders_au restores stock on cancel.
export async function updateOrderStatus(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: "Please log in" };
  const orderId = Number(formData.get("order_id"));
  const status = String(formData.get("status"));

  const [order] = await query<{ buyer_id: number; farmer_id: number }>(
    "SELECT o.buyer_id, l.farmer_id FROM orders o JOIN listings l ON l.listing_id = o.listing_id WHERE o.order_id = ?",
    [orderId],
  );
  const allowed =
    order &&
    ((session.role === "FARMER" && order.farmer_id === session.userId && ["CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"].includes(status)) ||
      (session.role === "BUYER" && order.buyer_id === session.userId && status === "CANCELLED"));
  if (!allowed) return { error: "Not allowed" };

  try {
    await query("UPDATE orders SET status = ? WHERE order_id = ?", [status, orderId]);
  } catch (e) {
    return { error: dbErrorMessage(e) };
  }
  revalidatePath(session.role === "FARMER" ? "/farmer" : "/buyer");
  return null;
}

export async function reviewOrder(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { error: "Please log in" };
  try {
    // trg_reviews_bi checks the order is delivered and the reviewer is part of it.
    await query("INSERT INTO reviews (order_id, reviewer_id, rating, comment) VALUES (?, ?, ?, ?)", [
      Number(formData.get("order_id")),
      session.userId,
      Number(formData.get("rating")),
      String(formData.get("comment") ?? "").trim() || null,
    ]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "ER_DUP_ENTRY") return { error: "You already reviewed this order" };
    return { error: dbErrorMessage(e) };
  }
  revalidatePath("/buyer");
  return { ok: "Thanks for the review" };
}
