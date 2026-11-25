"use server";

import bcrypt from "bcryptjs";
import type { ResultSetHeader } from "mysql2";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/components/ActionForm";
import { dbErrorMessage, pool, query } from "@/lib/db";
import { findDistrict } from "@/lib/locations";
import { createSession, destroySession, homeFor, type Role } from "@/lib/session";

export async function login(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const [user] = await query<{ user_id: number; full_name: string; role: Role; password_hash: string }>(
    "SELECT user_id, full_name, role, password_hash FROM users WHERE email = ?",
    [email],
  );
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return { error: "Wrong email or password" };
  }

  await createSession({ userId: user.user_id, role: user.role, name: user.full_name });
  redirect(homeFor(user.role));
}

// Creates the user and its farmer/buyer profile in one transaction.
export async function signup(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const role = String(formData.get("role")) as Role;
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const orgName = String(formData.get("org_name") ?? "").trim();
  const location = findDistrict(String(formData.get("district") ?? ""));

  if (role !== "FARMER" && role !== "BUYER") return { error: "Choose farmer or buyer" };
  if (!fullName || !email || !orgName) return { error: "Fill in all required fields" };
  if (password.length < 8) return { error: "Password must be at least 8 characters" };
  if (!location) return { error: "Choose a district" };

  const conn = await pool.getConnection();
  let userId: number;
  try {
    await conn.beginTransaction();
    const [res] = await conn.execute<ResultSetHeader>(
      "INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)",
      [fullName, email, phone, await bcrypt.hash(password, 10), role],
    );
    userId = res.insertId;

    if (role === "FARMER") {
      await conn.execute(
        `INSERT INTO farmers (farmer_id, farm_name, village, district, state, latitude, longitude, farm_size_acres)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, orgName, String(formData.get("village") ?? "") || null, location.district, location.state,
         location.lat, location.lon, Number(formData.get("farm_size_acres")) || null],
      );
    } else {
      await conn.execute(
        `INSERT INTO buyers (buyer_id, business_name, business_type, gstin, district, state, latitude, longitude)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, orgName, String(formData.get("business_type")), String(formData.get("gstin") ?? "") || null,
         location.district, location.state, location.lat, location.lon],
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    const err = e as { code?: string };
    if (err.code === "ER_DUP_ENTRY") return { error: "Email, phone or GSTIN is already registered" };
    return { error: dbErrorMessage(e) };
  } finally {
    conn.release();
  }

  await createSession({ userId, role, name: fullName });
  redirect(homeFor(role));
}

export async function logout() {
  await destroySession();
  redirect("/");
}
