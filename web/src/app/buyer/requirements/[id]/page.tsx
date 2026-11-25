import Link from "next/link";
import { notFound } from "next/navigation";
import { placeOrder } from "@/app/actions/orders";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, Empty, Grade, PageHeader } from "@/components/ui";
import { callProc, dbErrorMessage, query } from "@/lib/db";
import { date, kg, num, perKg } from "@/lib/format";
import { cropSpecs, listingQuality, requirementSpecs } from "@/lib/mongo";
import {
  constraintsToFilter, cosineSimilarityExpr, describeConstraint, formatAttr, unmetConstraints,
  type AttrValue, type Certification,
} from "@/lib/quality";
import { requireRole } from "@/lib/session";
import type { Match } from "@/lib/types";

type Requirement = {
  requirement_id: number; buyer_id: number; crop_name: string; quantity_kg: number; fulfilled_kg: number;
  max_price_per_kg: number; min_quality_grade: string; organic_only: number; max_distance_km: number;
  required_by: string; status: string;
};
type QualityInfo = {
  listing_id: number; attributes: Record<string, AttrValue>; certifications: Certification[];
  inspection?: { method: string; inspector?: string }; similarity: number | null;
};

export default async function RequirementMatchesPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("BUYER");
  const { id } = await params;

  const [req] = await query<Requirement>(
    `SELECT r.*, c.crop_name FROM requirements r JOIN crops c ON c.crop_id = r.crop_id
      WHERE r.requirement_id = ? AND r.buyer_id = ?`,
    [Number(id), session.userId],
  );
  if (!req) notFound();

  const [reqSpec, spec] = await Promise.all([
    requirementSpecs.findOne({ requirement_id: req.requirement_id }),
    cropSpecs.findOne({ crop: req.crop_name }),
  ]);
  const constraints = reqSpec?.constraints ?? {};
  const remaining = req.quantity_kg - req.fulfilled_kg;

  // 1. MySQL: hard filters + weighted score (sp_find_matches)
  let matches: Match[] = [];
  let error: string | null = null;
  if (req.status === "OPEN") {
    try {
      matches = await callProc<Match>("CALL sp_find_matches(?)", [req.requirement_id]);
    } catch (e) {
      error = dbErrorMessage(e);
    }
  }

  // 2. MongoDB: quality details, spec check and description similarity
  const ids = matches.map((m) => m.listing_id);
  const quality = new Map<number, QualityInfo>();
  const meetsSpec = new Set<number>();
  if (ids.length) {
    const [docs, meeting] = await Promise.all([
      listingQuality.aggregate<QualityInfo>([
        { $match: { listing_id: { $in: ids } } },
        { $project: {
          _id: 0, listing_id: 1, attributes: 1, certifications: 1, inspection: 1,
          similarity: reqSpec ? cosineSimilarityExpr("$embedding", reqSpec.embedding) : null,
        } },
      ]).toArray(),
      listingQuality
        .find({ listing_id: { $in: ids }, ...constraintsToFilter(constraints) }, { projection: { listing_id: 1 } })
        .toArray(),
    ]);
    for (const d of docs) quality.set(d.listing_id, d);
    for (const d of meeting) meetsSpec.add(d.listing_id);
  }

  // Quality-aware ranking: listings meeting the buyer's spec first, then by match score.
  const ranked = [...matches].sort(
    (a, b) => Number(meetsSpec.has(b.listing_id)) - Number(meetsSpec.has(a.listing_id)) || b.score - a.score,
  );
  const hasConstraints = Object.keys(constraints).length > 0;

  return (
    <>
      <PageHeader
        title={`${req.crop_name} – ${kg(req.quantity_kg)}`}
        subtitle={`Up to ${perKg(req.max_price_per_kg)} · grade ${req.min_quality_grade} or better${
          req.organic_only ? " · organic only" : ""
        } · within ${req.max_distance_km} km · needed by ${date(req.required_by)}`}
        action={<Link href="/buyer" className="btn-outline">← Back</Link>}
      />

      <div className="mb-6 space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Badge value={req.status} />
          <span className="text-stone-600">
            {kg(req.fulfilled_kg)} ordered · <strong>{kg(remaining)}</strong> still needed
          </span>
        </div>
        {reqSpec && (
          <div className="flex flex-wrap items-center gap-2 text-stone-600">
            {hasConstraints && <span className="font-medium text-stone-700">Quality spec:</span>}
            {Object.entries(constraints).map(([key, c]) => (
              <span key={key} className="rounded bg-soil-100 px-2 py-0.5 text-xs text-stone-700">
                {describeConstraint(key, c, spec ?? undefined)}
              </span>
            ))}
            <span className="italic">“{reqSpec.notes}”</span>
          </div>
        )}
      </div>

      <Card title="Ranked matches">
        {req.status !== "OPEN" ? (
          <Empty>This requirement is {req.status.toLowerCase()}.</Empty>
        ) : error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : ranked.length === 0 ? (
          <Empty>No listings meet these conditions right now. Try a higher price, lower grade or wider distance.</Empty>
        ) : (
          <ul className="space-y-3">
            {ranked.map((m, i) => {
              const q = quality.get(m.listing_id);
              const meets = meetsSpec.has(m.listing_id);
              const misses = q && !meets ? unmetConstraints(q.attributes, constraints, spec ?? undefined) : [];
              return (
                <li key={m.match_id} className={`rounded-lg border p-4 ${meets && hasConstraints ? "border-brand-200" : "border-stone-200"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-brand-50 text-center">
                        <div>
                          <div className="text-lg font-semibold leading-none text-brand-700">{num(m.score)}</div>
                          <div className="text-[10px] uppercase tracking-wide text-brand-700">score</div>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="font-medium">
                          #{i + 1} {m.farm_name}{" "}
                          <span className="font-normal text-stone-500">· {m.district} · {num(m.distance_km)} km</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
                          <span>{m.crop_name} {m.variety}</span>
                          <Grade grade={m.quality_grade} organic={m.is_organic} />
                          <span>{perKg(m.price_per_kg)}</span>
                          <span>· {kg(m.available_kg)} available</span>
                          <span>· harvested {date(m.harvest_date)}</span>
                        </div>
                        {q && (
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(q.attributes).map(([key, value]) => (
                              <span key={key} className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-700">
                                {formatAttr(spec?.attributes.find((a) => a.key === key), key, value)}
                              </span>
                            ))}
                            {q.inspection?.method === "LAB" && (
                              <span className="rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-700">
                                Lab tested{q.inspection.inspector ? ` · ${q.inspection.inspector}` : ""}
                              </span>
                            )}
                            {q.certifications.map((c) => (
                              <span key={c.name} className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700">{c.name}</span>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          {hasConstraints && (q ? (
                            meets ? (
                              <span className="font-medium text-brand-700">✓ Meets your quality spec</span>
                            ) : (
                              <span className="text-red-700">✗ Misses spec – {misses.join(", ")}</span>
                            )
                          ) : (
                            <span className="text-stone-500">No quality report</span>
                          ))}
                          {q?.similarity != null && (
                            <span className="text-stone-600">Description fit {Math.round(q.similarity * 100)}%</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <ActionForm action={placeOrder} submitLabel="Place order" inline>
                      <input type="hidden" name="listing_id" value={m.listing_id} />
                      <input type="hidden" name="requirement_id" value={req.requirement_id} />
                      <input
                        className="input w-32"
                        name="quantity_kg"
                        type="number"
                        min="1"
                        step="0.01"
                        defaultValue={Math.min(m.available_kg, remaining)}
                        aria-label="Quantity in kg"
                      />
                    </ActionForm>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="mt-4 text-xs text-stone-500">
        Score out of 100 from the <code>sp_find_matches</code> MySQL procedure: price 30 · quantity 25 · distance 20 ·
        freshness 15 · quality grade 10. Quality spec and description fit come from MongoDB.
      </p>
    </>
  );
}
