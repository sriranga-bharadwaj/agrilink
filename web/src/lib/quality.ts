// Crop-specific quality model stored in MongoDB. Pure helpers only, so this
// file can be used by client components and the Node scripts too.

export type AttrSpec = {
  key: string;
  label: string;
  type: "number" | "enum" | "boolean";
  unit?: string;
  min?: number;
  max?: number;
  values?: string[];
};

export type CropSpec = { crop: string; attributes: AttrSpec[] };

export type AttrValue = number | string | boolean;

export type Certification = { name: string; issuer: string; valid_until: Date | string };

export type ListingQuality = {
  listing_id: number;
  farmer_id: number;
  crop: string;
  variety: string | null;
  grade: "A" | "B" | "C";
  is_organic: boolean;
  attributes: Record<string, AttrValue>;
  certifications: Certification[];
  inspection: { method: "SELF" | "LAB"; inspected_on: Date | string; inspector?: string };
  description: string;
  embedding: number[];
  updated_at: Date;
};

// Buyer's per-attribute limits, e.g. { brix: { min: 4.5 }, ripeness: { in: ["red"] } }
export type Constraint = { min?: number; max?: number; in?: string[]; eq?: boolean };
export type Constraints = Record<string, Constraint>;

export type RequirementSpec = {
  requirement_id: number;
  buyer_id: number;
  crop: string;
  constraints: Constraints;
  notes: string;
  embedding: number[];
  updated_at: Date;
};

// Constraints -> MongoDB filter on the listing_quality.attributes sub-document.
export function constraintsToFilter(constraints: Constraints): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  for (const [key, c] of Object.entries(constraints)) {
    const cond: Record<string, unknown> = {};
    if (c.min != null) cond.$gte = c.min;
    if (c.max != null) cond.$lte = c.max;
    if (c.in?.length) cond.$in = c.in;
    if (c.eq != null) cond.$eq = c.eq;
    if (Object.keys(cond).length) filter[`attributes.${key}`] = cond;
  }
  return filter;
}

// Which constraints a listing misses, as readable text (used to explain a failed spec).
export function unmetConstraints(attrs: Record<string, AttrValue>, constraints: Constraints, spec?: CropSpec): string[] {
  const misses: string[] = [];
  for (const [key, c] of Object.entries(constraints)) {
    const v = attrs[key];
    const label = spec?.attributes.find((a) => a.key === key)?.label ?? key;
    const ok =
      v != null &&
      (c.min == null || (typeof v === "number" && v >= c.min)) &&
      (c.max == null || (typeof v === "number" && v <= c.max)) &&
      (!c.in?.length || c.in.includes(String(v))) &&
      (c.eq == null || v === c.eq);
    if (!ok) misses.push(`${label}: ${v ?? "not reported"}`);
  }
  return misses;
}

export function describeConstraint(key: string, c: Constraint, spec?: CropSpec): string {
  const attr = spec?.attributes.find((a) => a.key === key);
  const label = attr?.label ?? key;
  const unit = attr?.unit ? ` ${attr.unit}` : "";
  if (c.min != null && c.max != null) return `${label} ${c.min}–${c.max}${unit}`;
  if (c.min != null) return `${label} ≥ ${c.min}${unit}`;
  if (c.max != null) return `${label} ≤ ${c.max}${unit}`;
  if (c.in?.length) return `${label}: ${c.in.join(" / ")}`;
  if (c.eq != null) return `${label}: ${c.eq ? "yes" : "no"}`;
  return label;
}

export function formatAttr(attr: AttrSpec | undefined, key: string, value: AttrValue): string {
  const label = attr?.label ?? key;
  if (typeof value === "boolean") return `${label}: ${value ? "yes" : "no"}`;
  return `${label}: ${value}${attr?.unit ? ` ${attr.unit}` : ""}`;
}

// Cosine similarity as an aggregation expression. Vectors are L2-normalised,
// so this is the dot product: pair elements with $zip, sum products with $reduce.
export function cosineSimilarityExpr(field: string, query: number[]) {
  return {
    $reduce: {
      input: { $zip: { inputs: [field, { $literal: query }] } },
      initialValue: 0,
      in: {
        $add: ["$$value", { $multiply: [{ $arrayElemAt: ["$$this", 0] }, { $arrayElemAt: ["$$this", 1] }] }],
      },
    },
  };
}

// Reads crop-specific attribute inputs named attr_<key> from a form.
export function attributesFromForm(spec: CropSpec, formData: FormData): Record<string, AttrValue> {
  const attrs: Record<string, AttrValue> = {};
  for (const a of spec.attributes) {
    const raw = formData.get(`attr_${a.key}`);
    if (raw == null || raw === "") continue;
    if (a.type === "number") attrs[a.key] = Number(raw);
    else if (a.type === "boolean") attrs[a.key] = raw === "true";
    else attrs[a.key] = String(raw);
  }
  return attrs;
}

// Reads constraint inputs (min_<key>, max_<key>, in_<key>, eq_<key>) from a form.
export function constraintsFromForm(spec: CropSpec, formData: FormData): Constraints {
  const constraints: Constraints = {};
  for (const a of spec.attributes) {
    const c: Constraint = {};
    if (a.type === "number") {
      const min = formData.get(`min_${a.key}`);
      const max = formData.get(`max_${a.key}`);
      if (min) c.min = Number(min);
      if (max) c.max = Number(max);
    } else if (a.type === "enum") {
      const values = formData.getAll(`in_${a.key}`).map(String);
      if (values.length) c.in = values;
    } else {
      const eq = formData.get(`eq_${a.key}`);
      if (eq) c.eq = eq === "true";
    }
    if (Object.keys(c).length) constraints[a.key] = c;
  }
  return constraints;
}
