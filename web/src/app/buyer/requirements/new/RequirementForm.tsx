"use client";

import { useActionState, useState } from "react";
import { createRequirement } from "@/app/actions/requirements";
import { ConstraintInputs } from "@/components/AttributeInputs";
import type { CropSpec } from "@/lib/quality";
import type { Crop } from "@/lib/types";

export function RequirementForm({ crops, specs, today }: { crops: Crop[]; specs: CropSpec[]; today: string }) {
  const [state, formAction, pending] = useActionState(createRequirement, null);
  const [cropId, setCropId] = useState(crops[0]?.crop_id);
  const cropName = crops.find((c) => c.crop_id === cropId)?.crop_name;
  const spec = specs.find((s) => s.crop === cropName);

  return (
    <form action={formAction} className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Crop</label>
          <select className="input" name="crop_id" value={cropId} onChange={(e) => setCropId(Number(e.target.value))}>
            {crops.map((c) => <option key={c.crop_id} value={c.crop_id}>{c.crop_name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Quantity needed (kg)</label>
          <input className="input" name="quantity_kg" type="number" min="1" step="0.01" required />
        </div>
        <div>
          <label className="label">Maximum price (₹ per kg)</label>
          <input className="input" name="max_price_per_kg" type="number" min="0.01" step="0.01" required />
        </div>
        <div>
          <label className="label">Minimum grade</label>
          <select className="input" name="min_quality_grade" defaultValue="B">
            <option value="A">A – premium only</option>
            <option value="B">B or better</option>
            <option value="C">Any grade</option>
          </select>
        </div>
        <div>
          <label className="label">Maximum distance (km)</label>
          <input className="input" name="max_distance_km" type="number" min="1" max="3000" defaultValue="200" required />
        </div>
        <div>
          <label className="label">Needed by</label>
          <input className="input" name="required_by" type="date" min={today} required />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="organic_only" className="h-4 w-4 accent-brand-600" /> Organic only
        </label>
      </section>

      <section className="space-y-4 border-t border-stone-100 pt-6">
        <div>
          <h2 className="font-semibold">{cropName} quality specification</h2>
          <p className="text-sm text-stone-500">Listings are checked against these limits on the matches page.</p>
        </div>
        <ConstraintInputs key={cropName} spec={spec} />
        <div>
          <label className="label">What is it for?</label>
          <textarea
            className="input min-h-20"
            name="notes"
            required
            minLength={5}
            placeholder="e.g. Fully red, high pulp tomatoes for our ketchup line"
          />
          <p className="mt-1 text-xs text-stone-500">Compared with farmers&apos; descriptions to find the closest fit.</p>
        </div>
      </section>

      <button className="btn" disabled={pending}>{pending ? "Posting…" : "Post and find matches"}</button>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
