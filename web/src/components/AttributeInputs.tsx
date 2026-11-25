"use client";

import type { CropSpec } from "@/lib/quality";

// Inputs for a crop's quality measurements (listing form): attr_<key>
export function AttributeInputs({ spec }: { spec?: CropSpec }) {
  if (!spec) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {spec.attributes.map((a) => (
        <div key={a.key}>
          <label className="label">
            {a.label} {a.unit && <span className="font-normal text-stone-500">({a.unit})</span>}
          </label>
          {a.type === "number" ? (
            <input className="input" name={`attr_${a.key}`} type="number" step="any" min={a.min} max={a.max} />
          ) : a.type === "enum" ? (
            <select className="input" name={`attr_${a.key}`} defaultValue="">
              <option value="">Not measured</option>
              {a.values?.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          ) : (
            <select className="input" name={`attr_${a.key}`} defaultValue="">
              <option value="">Not measured</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          )}
        </div>
      ))}
    </div>
  );
}

// Inputs for a buyer's quality limits (requirement form): min_/max_/in_/eq_<key>
export function ConstraintInputs({ spec }: { spec?: CropSpec }) {
  if (!spec) return null;
  return (
    <div className="space-y-3">
      {spec.attributes.map((a) => (
        <div key={a.key} className="grid items-center gap-2 sm:grid-cols-[180px_1fr]">
          <span className="text-sm font-medium text-stone-700">
            {a.label} {a.unit && <span className="font-normal text-stone-500">({a.unit})</span>}
          </span>
          {a.type === "number" ? (
            <div className="flex items-center gap-2">
              <input className="input" name={`min_${a.key}`} type="number" step="any" placeholder="min" />
              <span className="text-stone-400">–</span>
              <input className="input" name={`max_${a.key}`} type="number" step="any" placeholder="max" />
            </div>
          ) : a.type === "enum" ? (
            <div className="flex flex-wrap gap-3">
              {a.values?.map((v) => (
                <label key={v} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name={`in_${a.key}`} value={v} className="h-4 w-4 accent-brand-600" /> {v}
                </label>
              ))}
            </div>
          ) : (
            <select className="input" name={`eq_${a.key}`} defaultValue="">
              <option value="">Any</option>
              <option value="true">Must be yes</option>
              <option value="false">Must be no</option>
            </select>
          )}
        </div>
      ))}
      <p className="text-xs text-stone-500">Leave blank for no limit.</p>
    </div>
  );
}
