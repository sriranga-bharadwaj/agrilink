"use client";

import { useActionState, useState } from "react";
import { createListing, suggestPrice, type PriceSuggestionState } from "@/app/actions/listings";
import { AttributeInputs } from "@/components/AttributeInputs";
import type { CropSpec } from "@/lib/quality";
import type { Crop } from "@/lib/types";

const rs = (x: number) => `₹${x.toFixed(2)}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function SuggestionCard({ s, onUse }: { s: NonNullable<PriceSuggestionState>; onUse: (price: string) => void }) {
  if ("error" in s) return <p className="rounded-md bg-stone-50 p-3 text-sm text-stone-700">{s.error}</p>;
  const m = s.mandi;
  return (
    <div className="space-y-3 rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-brand-700">Suggested price</div>
          <div className="text-2xl font-semibold text-stone-900">{rs(s.price)}<span className="text-base font-normal">/kg</span></div>
          <div className="text-stone-600">
            {Math.round(s.coverage * 100)}% range {rs(s.low)} – {rs(s.high)}
          </div>
        </div>
        <button type="button" className="btn" onClick={() => onUse(s.price.toFixed(2))}>Use this price</button>
      </div>
      <ul className="space-y-1 text-stone-700">
        <li>
          <span className="font-medium">Mandi basis:</span> {m.product}
          {m.varietyGroup !== "Common" && ` (${m.varietyGroup})`}{" "}
          {m.market ? `at ${m.market}` : `across ${m.state} (no recent prices from your mandi)`}: {m.basis} {rs(m.price)}/kg,
          range {rs(m.low)} – {rs(m.high)}. Government prices up to {day(m.dataUpTo)}.
        </li>
        <li>
          <span className="font-medium">Listing rules:</span>{" "}
          {s.adjustments.map((a) => `${a.label} ${a.pct > 0 ? "+" : ""}${a.pct}%`).join(" · ")}
        </li>
      </ul>
      <p className="text-xs text-stone-500">
        The range comes from a model trained on Agmarknet mandi prices: in held-out months, about 80% of actual
        prices a week later fell inside it. The listing rules are fixed adjustments, not part of the model.
      </p>
    </div>
  );
}

export function ListingForm({ crops, specs, today }: { crops: Crop[]; specs: CropSpec[]; today: string }) {
  const [state, formAction, pending] = useActionState(createListing, null);
  const [suggestion, suggestAction, suggesting] = useActionState(suggestPrice, null);
  const [price, setPrice] = useState("");
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
            <label className="label" htmlFor="price_per_kg">Price (₹ per kg)</label>
            <div className="flex gap-2">
              <input className="input" id="price_per_kg" name="price_per_kg" type="number" min="0.01" step="0.01"
                required value={price} onChange={(e) => setPrice(e.target.value)} />
              <button className="btn-outline whitespace-nowrap" formAction={suggestAction} formNoValidate disabled={suggesting}>
                {suggesting ? "Checking…" : "Suggest a price"}
              </button>
            </div>
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
        {suggestion && <SuggestionCard s={suggestion} onUse={setPrice} />}
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
