import Link from "next/link";
import { cancelRequirement } from "@/app/actions/requirements";
import { ActionForm } from "@/components/ActionForm";
import { OrdersTable } from "@/components/OrdersTable";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { query } from "@/lib/db";
import { date, inr, kg, perKg } from "@/lib/format";
import { requireRole } from "@/lib/session";
import type { OrderRow } from "@/lib/types";

type Spend = { orders: number; kg_bought: number; total_spend: number; avg_price_per_kg: number };
type MyRequirement = {
  requirement_id: number; crop_name: string; quantity_kg: number; fulfilled_kg: number; max_price_per_kg: number;
  min_quality_grade: string; organic_only: number; max_distance_km: number; required_by: string; status: string;
  match_count: number;
};

export default async function BuyerDashboard() {
  const session = await requireRole("BUYER");

  const [[spend], requirements, orders] = await Promise.all([
    query<Spend>("SELECT orders, kg_bought, total_spend, avg_price_per_kg FROM v_buyer_spend WHERE buyer_id = ?", [session.userId]),
    query<MyRequirement>(
      `SELECT r.requirement_id, c.crop_name, r.quantity_kg, r.fulfilled_kg, r.max_price_per_kg, r.min_quality_grade,
              r.organic_only, r.max_distance_km, r.required_by, r.status,
              (SELECT COUNT(*) FROM matches m WHERE m.requirement_id = r.requirement_id) AS match_count
         FROM requirements r JOIN crops c ON c.crop_id = r.crop_id
        WHERE r.buyer_id = ?
        ORDER BY r.status = 'OPEN' DESC, r.required_by`,
      [session.userId],
    ),
    query<OrderRow>("SELECT * FROM v_order_details WHERE buyer_id = ? ORDER BY placed_at DESC, order_id DESC", [session.userId]),
  ]);

  return (
    <>
      <PageHeader
        title={`Welcome, ${session.name}`}
        subtitle="Post what you need and AgriLink ranks the farms that can supply it."
        action={<Link href="/buyer/requirements/new" className="btn">+ New requirement</Link>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Total spend" value={inr(spend?.total_spend ?? 0)} />
        <Stat label="Bought" value={kg(spend?.kg_bought ?? 0)} />
        <Stat label="Orders" value={spend?.orders ?? 0} hint="Excluding cancelled" />
        <Stat label="Avg price" value={perKg(spend?.avg_price_per_kg || null)} />
      </div>

      <div className="space-y-6">
        <Card title="My requirements">
          {requirements.length === 0 ? (
            <Empty>No requirements yet. Post one to get matched with farmers.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Crop</th><th>Progress</th><th>Max price</th><th>Quality</th><th>Within</th>
                    <th>Needed by</th><th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {requirements.map((r) => {
                    const pct = Math.round((100 * r.fulfilled_kg) / r.quantity_kg);
                    return (
                      <tr key={r.requirement_id}>
                        <td className="font-medium">{r.crop_name}</td>
                        <td className="min-w-40">
                          <div className="text-xs text-stone-600">{kg(r.fulfilled_kg)} of {kg(r.quantity_kg)}</div>
                          <div className="mt-1 h-1.5 rounded bg-stone-100">
                            <div className="h-1.5 rounded bg-brand-500" style={{ width: `${pct}%` }} />
                          </div>
                        </td>
                        <td>{perKg(r.max_price_per_kg)}</td>
                        <td>{r.min_quality_grade}+{r.organic_only ? ", organic" : ""}</td>
                        <td>{r.max_distance_km} km</td>
                        <td>{date(r.required_by)}</td>
                        <td><Badge value={r.status} /></td>
                        <td>
                          <div className="flex justify-end gap-2">
                            {r.status === "OPEN" && (
                              <>
                                <Link href={`/buyer/requirements/${r.requirement_id}`} className="btn-outline">
                                  Find matches
                                </Link>
                                <ActionForm action={cancelRequirement} submitLabel="Cancel" submitClassName="btn-danger" inline>
                                  <input type="hidden" name="requirement_id" value={r.requirement_id} />
                                </ActionForm>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="My orders">
          <OrdersTable orders={orders} view="BUYER" />
        </Card>
      </div>
    </>
  );
}
