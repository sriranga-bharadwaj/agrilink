import Link from "next/link";
import { withdrawListing } from "@/app/actions/listings";
import { ActionForm } from "@/components/ActionForm";
import { OrdersTable } from "@/components/OrdersTable";
import { Badge, Card, Empty, Grade, PageHeader, Stat } from "@/components/ui";
import { query } from "@/lib/db";
import { date, inr, kg, perKg } from "@/lib/format";
import { requireRole } from "@/lib/session";
import type { OrderRow } from "@/lib/types";

type Earnings = { orders: number; kg_sold: number; earned: number; pending: number; avg_rating: number | null };
type MyListing = {
  listing_id: number; crop_name: string; variety: string | null; quantity_kg: number; available_kg: number;
  price_per_kg: number; quality_grade: string; is_organic: number; harvest_date: string; available_until: string; status: string;
};
type Demand = {
  requirement_id: number; business_name: string; business_type: string; district: string; crop_name: string;
  remaining_kg: number; max_price_per_kg: number; min_quality_grade: string; organic_only: number; required_by: string;
};

export default async function FarmerDashboard() {
  const session = await requireRole("FARMER");

  const [[earnings], listings, orders, demand] = await Promise.all([
    query<Earnings>("SELECT orders, kg_sold, earned, pending, avg_rating FROM v_farmer_earnings WHERE farmer_id = ?", [session.userId]),
    query<MyListing>(
      `SELECT l.listing_id, c.crop_name, l.variety, l.quantity_kg, l.available_kg, l.price_per_kg, l.quality_grade,
              l.is_organic, l.harvest_date, l.available_until, l.status
         FROM listings l JOIN crops c ON c.crop_id = l.crop_id
        WHERE l.farmer_id = ?
        ORDER BY l.status = 'ACTIVE' DESC, l.created_at DESC`,
      [session.userId],
    ),
    query<OrderRow>("SELECT * FROM v_order_details WHERE farmer_id = ? ORDER BY placed_at DESC, order_id DESC", [session.userId]),
    // Open buyer demand for crops this farmer is currently selling
    query<Demand>(
      `SELECT * FROM v_open_requirements
        WHERE crop_name IN (SELECT c.crop_name FROM listings l JOIN crops c ON c.crop_id = l.crop_id
                             WHERE l.farmer_id = ? AND l.status = 'ACTIVE')
        ORDER BY required_by`,
      [session.userId],
    ),
  ]);

  return (
    <>
      <PageHeader
        title={`Welcome, ${session.name}`}
        subtitle="Your produce, orders and buyers looking for what you grow."
        action={<Link href="/farmer/listings/new" className="btn">+ New listing</Link>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Earned" value={inr(earnings?.earned ?? 0)} hint="Delivered orders" />
        <Stat label="Pending" value={inr(earnings?.pending ?? 0)} hint="Not yet delivered" />
        <Stat label="Sold" value={kg(earnings?.kg_sold ?? 0)} hint={`${earnings?.orders ?? 0} orders`} />
        <Stat label="Rating" value={earnings?.avg_rating ? `${earnings.avg_rating} ★` : "–"} hint="From buyers" />
      </div>

      <div className="space-y-6">
        <Card title="Orders received">
          <OrdersTable orders={orders} view="FARMER" />
        </Card>

        <Card title="My listings">
          {listings.length === 0 ? (
            <Empty>No listings yet. Add your first produce.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Produce</th><th>Quality</th><th className="text-right">Available</th>
                    <th className="text-right">Price</th><th>Harvested</th><th>Until</th><th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((l) => (
                    <tr key={l.listing_id}>
                      <td>{l.crop_name} <span className="text-stone-500">{l.variety}</span></td>
                      <td><Grade grade={l.quality_grade} organic={l.is_organic} /></td>
                      <td className="text-right">
                        {kg(l.available_kg)}
                        <div className="text-xs text-stone-500">of {kg(l.quantity_kg)}</div>
                      </td>
                      <td className="text-right">{perKg(l.price_per_kg)}</td>
                      <td>{date(l.harvest_date)}</td>
                      <td>{date(l.available_until)}</td>
                      <td><Badge value={l.status} /></td>
                      <td className="text-right">
                        {(l.status === "ACTIVE" || l.status === "SOLD_OUT") && (
                          <ActionForm action={withdrawListing} submitLabel="Withdraw" submitClassName="btn-outline" inline>
                            <input type="hidden" name="listing_id" value={l.listing_id} />
                          </ActionForm>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Buyers looking for your crops">
          {demand.length === 0 ? (
            <Empty>No open requirements for the crops you are selling.</Empty>
          ) : (
            <ul className="divide-y divide-stone-100">
              {demand.map((d) => (
                <li key={d.requirement_id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div>
                    <span className="font-medium">{d.business_name}</span>{" "}
                    <span className="text-stone-500">({d.business_type.toLowerCase()}, {d.district})</span>
                    <div className="text-stone-600">
                      Needs {kg(d.remaining_kg)} {d.crop_name} · up to {perKg(d.max_price_per_kg)} · grade {d.min_quality_grade}+
                      {d.organic_only ? " · organic only" : ""}
                    </div>
                  </div>
                  <span className="text-xs text-stone-500">by {date(d.required_by)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
