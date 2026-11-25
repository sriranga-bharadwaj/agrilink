import { reviewOrder, updateOrderStatus } from "@/app/actions/orders";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Empty } from "@/components/ui";
import { date, inr, kg, perKg } from "@/lib/format";
import type { OrderRow } from "@/lib/types";

const FARMER_NEXT: Record<string, { status: string; label: string } | undefined> = {
  PLACED: { status: "CONFIRMED", label: "Confirm" },
  CONFIRMED: { status: "SHIPPED", label: "Mark shipped" },
  SHIPPED: { status: "DELIVERED", label: "Mark delivered" },
};

export function OrdersTable({ orders, view }: { orders: OrderRow[]; view: "FARMER" | "BUYER" }) {
  if (orders.length === 0) return <Empty>No orders yet.</Empty>;

  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>{view === "FARMER" ? "Buyer" : "Farmer"}</th>
            <th>Produce</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Amount</th>
            <th>Status</th>
            <th>Delivery</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const next = FARMER_NEXT[o.status];
            const cancellable = o.status === "PLACED" || o.status === "CONFIRMED";
            return (
              <tr key={o.order_id}>
                <td className="text-stone-500">{o.order_id}</td>
                <td>{view === "FARMER" ? o.buyer : o.farmer}</td>
                <td>
                  {o.crop_name} <span className="text-stone-500">{o.variety}</span>
                </td>
                <td className="text-right">{kg(o.quantity_kg)}</td>
                <td className="text-right">
                  {inr(o.total_amount)}
                  <div className="text-xs text-stone-500">{perKg(o.price_per_kg)}</div>
                </td>
                <td><Badge value={o.status} /></td>
                <td className="text-xs text-stone-600">
                  {o.delivered_date ? `Delivered ${date(o.delivered_date)}` : o.expected_date ? `ETA ${date(o.expected_date)}` : "–"}
                </td>
                <td>
                  <div className="flex flex-wrap justify-end gap-2">
                    {view === "FARMER" && next && (
                      <ActionForm action={updateOrderStatus} submitLabel={next.label} submitClassName="btn-outline" inline>
                        <input type="hidden" name="order_id" value={o.order_id} />
                        <input type="hidden" name="status" value={next.status} />
                      </ActionForm>
                    )}
                    {cancellable && (
                      <ActionForm action={updateOrderStatus} submitLabel="Cancel" submitClassName="btn-danger" inline>
                        <input type="hidden" name="order_id" value={o.order_id} />
                        <input type="hidden" name="status" value="CANCELLED" />
                      </ActionForm>
                    )}
                    {view === "BUYER" && o.status === "DELIVERED" && (
                      <ActionForm action={reviewOrder} submitLabel="Rate" submitClassName="btn-outline" inline>
                        <input type="hidden" name="order_id" value={o.order_id} />
                        <select name="rating" className="input w-20 py-1" defaultValue="5">
                          {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} ★</option>)}
                        </select>
                      </ActionForm>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
