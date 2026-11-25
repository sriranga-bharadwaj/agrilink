import { Card, Empty, Grade, PageHeader } from "@/components/ui";
import { query } from "@/lib/db";
import { embed } from "@/lib/embed";
import { date, kg, num, perKg } from "@/lib/format";
import { listingQuality } from "@/lib/mongo";
import { cosineSimilarityExpr } from "@/lib/quality";
import type { ActiveListing, Crop } from "@/lib/types";

// Listings whose description is closest in meaning to the query text.
async function semanticSearch(text: string): Promise<Map<number, number>> {
  const vector = await embed(text);
  const hits = await listingQuality
    .aggregate<{ listing_id: number; similarity: number }>([
      { $project: { _id: 0, listing_id: 1, similarity: cosineSimilarityExpr("$embedding", vector) } },
      { $match: { similarity: { $gte: 0.35 } } },
      { $sort: { similarity: -1 } },
      { $limit: 10 },
    ])
    .toArray();
  return new Map(hits.map((h) => [h.listing_id, h.similarity]));
}

type Summary = {
  crop_name: string; category: string; active_listings: number; supply_kg: number; min_price: number | null;
  avg_price: number | null; max_price: number | null; open_requirements: number; demand_kg: number;
  demand_supply_ratio: number | null;
};

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; crop?: string; grade?: string; organic?: string }>;
}) {
  const { crop, grade, organic } = await searchParams;
  const q = (await searchParams).q?.trim();

  const where: string[] = [];
  const params: unknown[] = [];
  const relevance = q ? await semanticSearch(q) : null;
  if (relevance) {
    where.push("listing_id IN (?)");
    params.push(relevance.size ? [...relevance.keys()] : [0]);
  }
  if (crop) { where.push("crop_name = ?"); params.push(crop); }
  if (grade) { where.push("quality_grade <= ?"); params.push(grade); } // ENUM order: A < B < C
  if (organic) where.push("is_organic = TRUE");

  const [listings, crops, summary] = await Promise.all([
    query<ActiveListing>(
      `SELECT * FROM v_active_listings ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY crop_name, price_per_kg`,
      params,
    ),
    query<Crop>("SELECT crop_id, crop_name, category FROM crops ORDER BY crop_name"),
    query<Summary>("SELECT * FROM v_crop_market_summary WHERE active_listings > 0 OR open_requirements > 0 ORDER BY crop_name"),
  ]);
  if (relevance) listings.sort((a, b) => relevance.get(b.listing_id)! - relevance.get(a.listing_id)!);

  return (
    <>
      <PageHeader title="Marketplace" subtitle="Fresh produce listed directly by farmers." />

      <form className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <div className="min-w-64 flex-1">
          <label className="label">Describe what you need</label>
          <input name="q" defaultValue={q ?? ""} className="input" placeholder="e.g. potatoes for making chips" />
        </div>
        <div>
          <label className="label">Crop</label>
          <select name="crop" defaultValue={crop ?? ""} className="input w-44">
            <option value="">All crops</option>
            {crops.map((c) => <option key={c.crop_id} value={c.crop_name}>{c.crop_name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Quality</label>
          <select name="grade" defaultValue={grade ?? ""} className="input w-40">
            <option value="">Any grade</option>
            <option value="A">A only</option>
            <option value="B">B or better</option>
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="organic" value="1" defaultChecked={!!organic} className="h-4 w-4 accent-brand-600" />
          Organic only
        </label>
        <button className="btn">Filter</button>
      </form>

      <div className="space-y-6">
        <Card title={q ? `Closest matches for “${q}” (${listings.length})` : `Active listings (${listings.length})`}>
          {listings.length === 0 ? (
            <Empty>No listings match these filters.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    {relevance && <th>Match</th>}
                    <th>Produce</th><th>Farm</th><th>Quality</th><th className="text-right">Available</th>
                    <th className="text-right">Price</th><th>Freshness</th><th>Until</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((l) => (
                    <tr key={l.listing_id}>
                      {relevance && (
                        <td className="font-medium text-brand-700">{Math.round(relevance.get(l.listing_id)! * 100)}%</td>
                      )}
                      <td className="font-medium">{l.crop_name} <span className="font-normal text-stone-500">{l.variety}</span></td>
                      <td>{l.farm_name}<div className="text-xs text-stone-500">{l.district}, {l.state}</div></td>
                      <td><Grade grade={l.quality_grade} organic={l.is_organic} /></td>
                      <td className="text-right">{kg(l.available_kg)}</td>
                      <td className="text-right">{perKg(l.price_per_kg)}</td>
                      <td className="min-w-32">
                        <div className="text-xs text-stone-600">{num(l.freshness_pct)}% · {l.days_since_harvest}d old</div>
                        <div className="mt-1 h-1.5 rounded bg-stone-100">
                          <div className="h-1.5 rounded bg-brand-500" style={{ width: `${l.freshness_pct}%` }} />
                        </div>
                      </td>
                      <td>{date(l.available_until)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Supply and demand by crop">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Crop</th><th className="text-right">Listings</th><th className="text-right">Supply</th>
                  <th className="text-right">Price range</th><th className="text-right">Requirements</th>
                  <th className="text-right">Demand</th><th className="text-right">Demand / supply</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.crop_name}>
                    <td className="font-medium">{s.crop_name}</td>
                    <td className="text-right">{s.active_listings}</td>
                    <td className="text-right">{kg(s.supply_kg)}</td>
                    <td className="text-right">{s.min_price == null ? "–" : `₹${num(s.min_price)}–${num(s.max_price)}`}</td>
                    <td className="text-right">{s.open_requirements}</td>
                    <td className="text-right">{kg(s.demand_kg)}</td>
                    <td className="text-right">{s.demand_supply_ratio == null ? "–" : num(s.demand_supply_ratio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
