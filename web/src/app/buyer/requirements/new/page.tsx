import { PageHeader } from "@/components/ui";
import { query } from "@/lib/db";
import { cropSpecs } from "@/lib/mongo";
import { requireRole } from "@/lib/session";
import type { Crop } from "@/lib/types";
import { RequirementForm } from "./RequirementForm";

export default async function NewRequirementPage() {
  await requireRole("BUYER");
  const [crops, specs] = await Promise.all([
    query<Crop>("SELECT crop_id, crop_name, category FROM crops ORDER BY crop_name"),
    cropSpecs.find({}, { projection: { _id: 0 } }).toArray(),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-3xl">
      <PageHeader title="New requirement" subtitle="Tell farmers what you need. Matching starts as soon as you post." />
      <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <RequirementForm crops={crops} specs={specs} today={today} />
      </div>
    </div>
  );
}
