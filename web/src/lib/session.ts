import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type Role = "FARMER" | "BUYER" | "ADMIN";
export type Session = { userId: number; role: Role; name: string };

const COOKIE = "agrilink_session";

function sign(payload: string) {
  return createHmac("sha256", process.env.SESSION_SECRET!).update(payload).digest("base64url");
}

export async function createSession(session: Session) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    // HTTPS-only in production; SESSION_COOKIE_SECURE=false allows plain-HTTP runs such as Docker on localhost.
    secure: process.env.NODE_ENV === "production" && process.env.SESSION_COOKIE_SECURE !== "false",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
}

export async function requireRole(role: Role): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== role) redirect(homeFor(session.role));
  return session;
}

export function homeFor(role: Role) {
  return role === "FARMER" ? "/farmer" : role === "BUYER" ? "/buyer" : "/market";
}
