"use client";

import { useState } from "react";
import { formatOrderDate, type Order, type OrderInput } from "@/lib/orderTypes";
import type { Flavor, PackageType } from "@/lib/settings";
import { eventType } from "@/lib/icons";
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
  openKey,
  onToggleSelect,
  onToggleAll,
  onChanged,
  onOpen,
}: {
  orders: Order[];
  flavors: Flavor[];
  packageTypes: PackageType[];
  selectedKeys: Set<string>;
  /** Row whose details pane is open — stays highlighted so you don't lose your place. */
  openKey: string | null;
  onToggleSelect: (key: string) => void;
  onToggleAll: () => void;
  onChanged: () => void;
  onOpen: (key: string) => void;
}) {
  const allSelected = orders.length > 0 && orders.every((o) => selectedKeys.has(o.key));
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

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
    <div
      className="max-h-[70vh] overflow-auto rounded-card border border-line bg-card"
      onMouseLeave={() => setHoveredKey(null)}
    >
      <table className="w-full min-w-[1400px] text-left text-sm">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b border-line text-xs font-semibold text-ink-soft">
            <th className="w-8 bg-card px-3 py-2">
              <input type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label="Select all" />
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
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const isSelected = selectedKeys.has(order.key);
            const isHovered = hoveredKey === order.key;
            const isOpen = openKey === order.key;
            // Hovering brings one row forward and lets the rest recede.
            // Kept gentle: the other rows stay readable, they just stop
            // competing for attention.
            const recede = hoveredKey !== null && !isHovered && !isOpen;
            const type = eventType(order.customerType);

            return (
              <tr
                key={order.key}
                onMouseEnter={() => setHoveredKey(order.key)}
                // Anything interactive inside the row stops the click
                // before it gets here, so clicking a cell still edits it
                // and only the dead space opens the pane.
                onClick={() => onOpen(order.key)}
                className={`cursor-pointer border-b border-line/60 align-top transition ${
                  isOpen ? "bg-accent/[0.07]" : isHovered ? "bg-black/[0.045]" : ""
                } ${recede ? "opacity-55" : ""}`}
              >
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(order.key)}
                    aria-label={`Select ${order.customer || "order"}`}
                    // Revealed on hover so the column reads as data, not
                    // controls — but a ticked box always stays visible.
                    className={isSelected || isHovered ? "" : "invisible"}
                  />
                </td>
                <td className="px-3 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <EditableCell
                    editable
                    type="date"
                    displayValue={formatOrderDate(order.date)}
                    editValue={order.date}
                    onSave={(raw) => saveField(order, { date: raw })}
                  />
                </td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1.5">
                    <EditableCell
                      editable
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
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <EditableCell
                    editable
                    displayValue={
                      type ? (
                        <span className="flex w-fit items-center gap-1 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-ink">
                          <type.Icon size={11} className="shrink-0" />
                          {type.label}
                        </span>
                      ) : (
                        "—"
                      )
                    }
                    editValue={order.customerType}
                    onSave={(raw) => saveField(order, { customerType: raw })}
                  />
                </td>
                <td className="max-w-[160px] px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <EditableCell
                    editable
                    displayValue={order.location || "—"}
                    editValue={order.location}
                    onSave={(raw) => saveField(order, { location: raw })}
                  />
                </td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <EditableCell
                    editable
                    type="number"
                    displayValue={order.guests ?? "—"}
                    editValue={order.guests?.toString() ?? ""}
                    onSave={(raw) => saveField(order, { guests: raw === "" ? null : Number(raw) })}
                  />
                </td>
                <td className="px-3 py-2">
                  <ContentChips lines={order.contentLines} flavors={flavors} packageTypes={packageTypes} />
                </td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <EditableCell
                    editable
                    type="number"
                    displayValue={order.mirrors ?? "—"}
                    editValue={order.mirrors?.toString() ?? ""}
                    onSave={(raw) => saveField(order, { mirrors: raw === "" ? null : Number(raw) })}
                  />
                </td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <EditableCell
                    editable
                    type="number"
                    displayValue={order.deliveryCost !== null ? currency(order.deliveryCost) : "—"}
                    editValue={order.deliveryCost?.toString() ?? ""}
                    onSave={(raw) => saveField(order, { deliveryCost: raw === "" ? null : Number(raw) })}
                  />
                </td>
                <td className="px-3 py-2 font-semibold" onClick={(e) => e.stopPropagation()}>
                  <EditableCell
                    editable
                    type="number"
                    displayValue={currency(order.totalAmount)}
                    editValue={String(order.totalAmount)}
                    onSave={(raw) => saveField(order, { totalAmount: Number(raw) || 0 })}
                  />
                </td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <EditableCell
                    editable
                    type="number"
                    displayValue={currency(order.deposit)}
                    editValue={String(order.deposit)}
                    onSave={(raw) => saveField(order, { deposit: Number(raw) || 0 })}
                  />
                </td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <PaymentStatusSelect order={order} onChanged={onChanged} />
                </td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <ProductionStatusSelect order={order} onChanged={onChanged} />
                </td>
              </tr>
            );
          })}
          {orders.length === 0 && (
            <tr>
              <td colSpan={13} className="px-3 py-8 text-center text-sm text-ink-soft">
                No orders match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
