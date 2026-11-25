"use client";

import { useActionState, useState } from "react";
import { signup } from "@/app/actions/auth";
import { DISTRICTS } from "@/lib/locations";

const BUSINESS_TYPES = ["PROCESSOR", "RESTAURANT", "HOTEL", "RETAILER", "WHOLESALER", "EXPORTER"];

export function SignupForm() {
  const [role, setRole] = useState<"FARMER" | "BUYER">("FARMER");
  const [state, formAction, pending] = useActionState(signup, null);
  const farmer = role === "FARMER";

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(["FARMER", "BUYER"] as const).map((r) => (
          <label
            key={r}
            className={`cursor-pointer rounded-md border px-3 py-2 text-center text-sm font-medium ${
              role === r ? "border-brand-600 bg-brand-50 text-brand-700" : "border-stone-300 text-stone-600"
            }`}
          >
            <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />
            {r === "FARMER" ? "I sell produce" : "I buy produce"}
          </label>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Full name</label>
          <input className="input" name="full_name" required />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" name="phone" required pattern="[0-9+]{10,15}" placeholder="98xxxxxxxx" />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" name="email" type="email" required />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" name="password" type="password" required minLength={8} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">{farmer ? "Farm name" : "Business name"}</label>
          <input className="input" name="org_name" required />
        </div>
        <div>
          <label className="label">District</label>
          <select className="input" name="district" required defaultValue="">
            <option value="" disabled>Choose…</option>
            {DISTRICTS.map((d) => (
              <option key={d.district} value={d.district}>{d.district}, {d.state}</option>
            ))}
          </select>
        </div>
        {farmer ? (
          <>
            <div>
              <label className="label">Village</label>
              <input className="input" name="village" />
            </div>
            <div>
              <label className="label">Farm size (acres)</label>
              <input className="input" name="farm_size_acres" type="number" step="0.1" min="0.1" />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="label">Business type</label>
              <select className="input" name="business_type" required>
                {BUSINESS_TYPES.map((t) => (
                  <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">GSTIN (optional)</label>
              <input className="input" name="gstin" maxLength={15} />
            </div>
          </>
        )}
      </div>

      <button className="btn w-full" disabled={pending}>{pending ? "Creating…" : "Create account"}</button>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
