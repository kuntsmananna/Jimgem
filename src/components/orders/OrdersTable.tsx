"use client";

import { type Order, type OrderInput } from "@/lib/orderTypes";
import type { Flavor, PackageType } from "@/lib/settings";
import { ContentChips } from "./ContentChips";
import { EditableCell } from "./EditableCell";
import { PaymentStatusSelect, ProductionStatusSelect } from "./StatusSelects";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currency = (n: number) => `₪${nf.format(n)}`;

export function OrdersTable({
  orders,
  flavors,
  packageTypes,
  selectedKeys,
  onToggleSelect,
  onToggleAll,
  onChanged,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  orders: Order[];
  flavors: Flavor[];
  packageTypes: PackageType[];
  selectedKeys: Set<string>;
  onToggleSelect: (key: string) => void;
  onToggleAll: () => void;
  onChanged: () => void;
  onEdit: (order: Order) => void;
  onDuplicate: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const allSelected = orders.length > 0 && orders.every((o) => selectedKeys.has(o.key));

  async function saveField(order: Order, patch: Partial<OrderInput>) {
    // Every order is a DB row since the import change, so a single-field
    // patch is all the API needs — no full-row replace, no override path.
    await fetch(`/api/orders/${encodeURIComponent(order.key)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    onChanged();
  }

  return (
    <div className="max-h-[70vh] overflow-auto rounded-card border border-line bg-card">
      <table className="w-full min-w-[1400px] text-left text-sm">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b border-line text-xs font-semibold text-ink-soft">
            <th className="w-8 bg-card px-3 py-2">
              <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
            </th>
            <th className="bg-card px-3 py-2">Date</th>
            <th className="bg-card px-3 py-2">Customer</th>
            <th className="bg-card px-3 py-2">Type</th>
            <th className="bg-card px-3 py-2">Location</th>
            <th className="bg-card px-3 py-2">Guests</th>
            <th className="bg-card px-3 py-2">Content</th>
            <th className="bg-card px-3 py-2">Mirrors</th>
            <th className="bg-card px-3 py-2">Delivery</th>
            <th className="bg-card px-3 py-2">Amount</th>
            <th className="bg-card px-3 py-2">Deposit</th>
            <th className="bg-card px-3 py-2">Payment</th>
            <th className="bg-card px-3 py-2">Production</th>
            <th className="bg-card px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const editable = true;
            const dateEditable = true;
            return (
              <tr key={order.key} className="border-b border-line/60 align-top hover:bg-black/[0.02]">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedKeys.has(order.key)}
                    onChange={() => onToggleSelect(order.key)}
                  />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <EditableCell
                    editable={dateEditable}
                    type="date"
                    displayValue={order.date}
                    editValue={order.date}
                    onSave={(raw) => saveField(order, { date: raw })}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <EditableCell
                      editable={editable}
                      displayValue={order.customer || "(no name)"}
                      editValue={order.customer}
                      onSave={(raw) => saveField(order, { customer: raw })}
                    />
                    {order.needsReview && (
                      <span
                        title="Best-effort parsed from legacy notes — please review"
                        className="rounded-full bg-tile-peach px-1.5 py-0.5 text-[10px] font-bold text-ink"
                      >
                        review
                      </span>
                    )}
                  </div>
                  {order.details && <p className="mt-0.5 max-w-[220px] text-xs text-ink-soft">{order.details}</p>}
                </td>
                <td className="px-3 py-2">
                  <EditableCell
                    editable={editable}
                    displayValue={order.customerType || "—"}
                    editValue={order.customerType}
                    onSave={(raw) => saveField(order, { customerType: raw })}
                  />
                </td>
                <td className="px-3 py-2 max-w-[160px]">
                  <EditableCell
                    editable={editable}
                    displayValue={order.location || "—"}
                    editValue={order.location}
                    onSave={(raw) => saveField(order, { location: raw })}
                  />
                </td>
                <td className="px-3 py-2">
                  <EditableCell
                    editable={editable}
                    type="number"
                    displayValue={order.guests ?? "—"}
                    editValue={order.guests?.toString() ?? ""}
                    onSave={(raw) => saveField(order, { guests: raw === "" ? null : Number(raw) })}
                  />
                </td>
                <td className="px-3 py-2">
                  <ContentChips lines={order.contentLines} flavors={flavors} packageTypes={packageTypes} />
                </td>
                <td className="px-3 py-2">
                  <EditableCell
                    editable={editable}
                    type="number"
                    displayValue={order.mirrors ?? "—"}
                    editValue={order.mirrors?.toString() ?? ""}
                    onSave={(raw) => saveField(order, { mirrors: raw === "" ? null : Number(raw) })}
                  />
                </td>
                <td className="px-3 py-2">
                  <EditableCell
                    editable={editable}
                    type="number"
                    displayValue={order.deliveryCost !== null ? currency(order.deliveryCost) : "—"}
                    editValue={order.deliveryCost?.toString() ?? ""}
                    onSave={(raw) => saveField(order, { deliveryCost: raw === "" ? null : Number(raw) })}
                  />
                </td>
                <td className="px-3 py-2 font-semibold">
                  <EditableCell
                    editable={editable}
                    type="number"
                    displayValue={currency(order.totalAmount)}
                    editValue={String(order.totalAmount)}
                    onSave={(raw) => saveField(order, { totalAmount: Number(raw) || 0 })}
                  />
                </td>
                <td className="px-3 py-2">
                  <EditableCell
                    editable={editable}
                    type="number"
                    displayValue={currency(order.deposit)}
                    editValue={String(order.deposit)}
                    onSave={(raw) => saveField(order, { deposit: Number(raw) || 0 })}
                  />
                </td>
                <td className="px-3 py-2">
                  <PaymentStatusSelect order={order} onChanged={onChanged} />
                </td>
                <td className="px-3 py-2">
                  <ProductionStatusSelect order={order} onChanged={onChanged} />
                </td>
                <td className="px-3 py-2">
                  {order.source === "db" && (
                    <div className="flex gap-2 text-xs font-semibold text-ink-soft">
                      <button onClick={() => onEdit(order)} className="hover:text-ink">
                        Edit
                      </button>
                      <button onClick={() => onDuplicate(Number(order.key))} className="hover:text-ink">
                        Duplicate
                      </button>
                      <button onClick={() => onDelete(Number(order.key))} className="hover:text-ink">
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {orders.length === 0 && <p className="p-6 text-sm text-ink-soft">No orders match this filter.</p>}
    </div>
  );
}
