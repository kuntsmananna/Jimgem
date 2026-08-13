"use client";

import { formatOrderDate, type Order, type OrderInput } from "@/lib/orderTypes";
import type { Flavor, PackageType } from "@/lib/settings";
import { ContentChips } from "./ContentChips";
import { EditableCell } from "./EditableCell";
import { EventTypeChip } from "./EventTypeChip";
import { PaymentStatusSelect, ProductionStatusSelect } from "./StatusSelects";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currency = (n: number) => `₪${nf.format(n)}`;

/** Anything the row click must not hijack, because it does its own job. */
const INTERACTIVE = "button, input, select, textarea, a, label";

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

  async function saveField(order: Order, patch: Partial<OrderInput>) {
    // Every order is a DB row since the import change, so a single-field
    // patch is all the API needs — no full-row replace, no override path.
    await fetch(`/api/orders/${encodeURIComponent(order.key)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "patch", ...patch }),
    });
    onChanged();
  }

  /**
   * One guard for the whole row rather than a stopPropagation on each
   * cell: clicking a value edits it in place, clicking anywhere else
   * opens the details pane. Stated once, so a new column can't silently
   * hijack an edit by forgetting to opt out.
   */
  function handleRowClick(event: React.MouseEvent<HTMLTableRowElement>, key: string) {
    if ((event.target as HTMLElement).closest(INTERACTIVE)) return;
    onOpen(key);
  }

  return (
    <div className="max-h-[70vh] overflow-auto rounded-card border border-line bg-card">
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
        {/*
          Hover focus is pure CSS (see globals.css's .orders-rows): the
          hovered row comes forward and the rest recede. Tracking it in
          React state instead re-rendered all ~80 rows on every row-to-row
          mouse move.
        */}
        <tbody className="orders-rows">
          {orders.map((order) => {
            const isSelected = selectedKeys.has(order.key);
            const isOpen = openKey === order.key;

            return (
              <tr
                key={order.key}
                onClick={(e) => handleRowClick(e, order.key)}
                className={`group cursor-pointer border-b border-line/60 align-top ${isOpen ? "is-open" : ""}`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(order.key)}
                    aria-label={`Select ${order.customer || "order"}`}
                    // Revealed on hover so the column reads as data, not
                    // controls — but a ticked box always stays visible.
                    className={isSelected ? "" : "invisible group-hover:visible"}
                  />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <EditableCell
                    type="date"
                    displayValue={formatOrderDate(order.date)}
                    editValue={order.date}
                    onSave={(raw) => saveField(order, { date: raw })}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <EditableCell
                      displayValue={order.customer || "(no name)"}
                      editValue={order.customer}
                      onSave={(raw) => saveField(order, { customer: raw })}
                    />
                    {order.needsReview && (
                      <span
                        title="Best-effort parsed from legacy notes — please review"
                        className="keeps-color rounded-full bg-tile-peach px-1.5 py-0.5 text-[10px] font-bold text-ink"
                      >
                        review
                      </span>
                    )}
                  </div>
                  {/*
                    Notes, not the Sheet's raw `details`: the two used to be
                    separate free-text fields with only one of them editable,
                    which read as an unlabelled mystery line under the name.
                    Migration 004 folded details into notes, so this is now
                    the same text — editable from the order form.
                  */}
                  {order.notes && (
                    <p className="mt-0.5 max-w-[220px] text-xs text-ink-soft">{order.notes}</p>
                  )}
                </td>
                <td className="px-3 py-2">
                  <EditableCell
                    displayValue={
                      order.customerType.trim() ? <EventTypeChip value={order.customerType} /> : "—"
                    }
                    editValue={order.customerType}
                    onSave={(raw) => saveField(order, { customerType: raw })}
                  />
                </td>
                <td className="max-w-[160px] px-3 py-2">
                  <EditableCell
                    displayValue={order.location || "—"}
                    editValue={order.location}
                    onSave={(raw) => saveField(order, { location: raw })}
                  />
                </td>
                <td className="px-3 py-2">
                  <EditableCell
                    type="number"
                    displayValue={order.guests ?? "—"}
                    editValue={order.guests?.toString() ?? ""}
                    onSave={(raw) =>
                      saveField(order, {
                        guests: raw === "" ? null : Number(raw),
                      })
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <ContentChips lines={order.packageLines} flavors={flavors} packageTypes={packageTypes} />
                </td>
                <td className="px-3 py-2">
                  <EditableCell
                    type="number"
                    displayValue={order.mirrors ?? "—"}
                    editValue={order.mirrors?.toString() ?? ""}
                    onSave={(raw) =>
                      saveField(order, {
                        mirrors: raw === "" ? null : Number(raw),
                      })
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <EditableCell
                    type="number"
                    displayValue={order.deliveryCost !== null ? currency(order.deliveryCost) : "—"}
                    editValue={order.deliveryCost?.toString() ?? ""}
                    onSave={(raw) =>
                      saveField(order, {
                        deliveryCost: raw === "" ? null : Number(raw),
                      })
                    }
                  />
                </td>
                <td className="px-3 py-2 font-semibold">
                  <EditableCell
                    type="number"
                    displayValue={currency(order.totalAmount)}
                    editValue={String(order.totalAmount)}
                    onSave={(raw) => saveField(order, { totalAmount: Number(raw) || 0 })}
                  />
                </td>
                <td className="px-3 py-2">
                  <EditableCell
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
