"use client";

import { useActionState, useState } from "react";
import { createListing } from "@/app/actions/listings";
import { AttributeInputs } from "@/components/AttributeInputs";
import type { CropSpec } from "@/lib/quality";
import type { Crop } from "@/lib/types";

export function ListingForm({ crops, specs, today }: { crops: Crop[]; specs: CropSpec[]; today: string }) {
  const [state, formAction, pending] = useActionState(createListing, null);
  const [cropId, setCropId] = useState(crops[0]?.crop_id);
  const cropName = crops.find((c) => c.crop_id === cropId)?.crop_name;
  const spec = specs.find((s) => s.crop === cropName);

  return (
    <form action={formAction} className="space-y-6">
      <section className="space-y-4">
        <h2 className="font-semibold">Produce</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Crop</label>
            <select className="input" name="crop_id" value={cropId} onChange={(e) => setCropId(Number(e.target.value))}>
              {crops.map((c) => <option key={c.crop_id} value={c.crop_id}>{c.crop_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Variety</label>
            <input className="input" name="variety" placeholder="e.g. Arka Rakshak" />
          </div>
          <div>
            <label className="label">Quantity (kg)</label>
            <input className="input" name="quantity_kg" type="number" min="1" step="0.01" required />
          </div>
          <div>
            <label className="label">Price (₹ per kg)</label>
            <input className="input" name="price_per_kg" type="number" min="0.01" step="0.01" required />
          </div>
          <div>
            <label className="label">Overall grade</label>
            <select className="input" name="quality_grade" defaultValue="A">
              <option value="A">A – premium</option>
              <option value="B">B – standard</option>
              <option value="C">C – processing</option>
            </select>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="is_organic" className="h-4 w-4 accent-brand-600" /> Certified organic
          </label>
          <div>
            <label className="label">Harvest date</label>
            <input className="input" name="harvest_date" type="date" max={today} defaultValue={today} required />
          </div>
          <div>
            <label className="label">Available until</label>
            <input className="input" name="available_until" type="date" min={today} required />
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-stone-100 pt-6">
        <div>
          <h2 className="font-semibold">{cropName} quality details</h2>
          <p className="text-sm text-stone-500">Measurements buyers use to check their specifications. Fill what you know.</p>
        </div>
        <AttributeInputs key={cropName} spec={spec} />
        <div>
          <label className="label">Description</label>
          <textarea
            className="input min-h-24"
            name="description"
            required
            minLength={10}
            placeholder="Colour, size, how it was grown and packed, what it is best used for…"
          />
          <p className="mt-1 text-xs text-stone-500">Used for semantic search, so describe it the way a buyer would.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Inspection</label>
            <select className="input" name="inspection_method" defaultValue="SELF">
              <option value="SELF">Self-assessed</option>
              <option value="LAB">Lab tested</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Lab / inspector (optional)</label>
            <input className="input" name="inspector" />
          </div>
          <div>
            <label className="label">Certificate (optional)</label>
            <input className="input" name="cert_name" placeholder="e.g. NPOP Organic" />
          </div>
          <div>
            <label className="label">Issued by</label>
            <input className="input" name="cert_issuer" />
          </div>
          <div>
            <label className="label">Valid until</label>
            <input className="input" name="cert_valid_until" type="date" min={today} />
          </div>
        </div>
      </section>

      <button className="btn" disabled={pending}>{pending ? "Publishing…" : "Publish listing"}</button>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
