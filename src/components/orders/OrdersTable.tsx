"use client";

import {
  formatOrderDate,
  hasDelivery,
  isBooked,
  stageMap,
  orderUnits,
  unitsPerPackageMap,
  withDelivery,
  type Order,
  type OrderInput,
} from "@/lib/orderTypes";
import type { Flavor, PackageType } from "@/lib/settings";
import { Info } from "lucide-react";
import { UnitsIcon } from "@/lib/icons";
import { useOrderTypes } from "@/components/OrderTypesContext";
import { useStages } from "@/components/ProductionStagesContext";
import { HoverCard } from "@/components/HoverCard";
import { ContentHoverCard } from "./ContentHoverCard";
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
  emptyNote,
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
  /** What to say when nothing is in view — names the active time scope. */
  emptyNote: string;
}) {
  // From the app-layout provider rather than a prop — see OrderTypesContext.
  const orderTypes = useOrderTypes();
  // A row is provisional when its stage says it is not income yet — the
  // owner's flag, not the word "offer", so a second quote-like stage gets
  // the same treatment without another special case here.
  const stageIndex = stageMap(useStages());
  const unitsPerPackage = unitsPerPackageMap(packageTypes);
  // Built once rather than per row: the list is the same for all 74 of
  // them, and a fresh array per row also denies the cell any reuse.
  const typeOptions = orderTypes
    // Archived types stay out of the picker. A row already carrying one
    // keeps it — `EditableCell` adds the current value when it is missing.
    .filter((type) => !type.archivedAt)
    .map((type) => ({ value: type.name, label: type.name }));
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
      {/*
        1100px is just under what these fifteen columns actually need, so
        the floor only catches the empty-state row rather than quietly
        setting the table's width. It used to be 1400, which forced a
        horizontal scrollbar on any laptop under ~1600px wide even though
        the columns fit in far less.
      */}
      <table className="w-full min-w-[1100px] text-left text-sm">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b border-line text-[11px] font-semibold text-ink-soft">
            <th className="w-6 bg-card px-2 py-2">
              <input type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label="Select all" />
            </th>
            <th className="bg-card px-2 py-2">Status</th>
            <th className="bg-card px-2 py-2">Date</th>
            <th className="bg-card px-2 py-2">Customer</th>
            <th className="bg-card px-2 py-2">Type</th>
            <th className="bg-card px-2 py-2">Location</th>
            <th className="bg-card px-2 py-2">Guests</th>
            <th className="bg-card px-2 py-2">Units</th>
            <th className="bg-card px-2 py-2">Mirrors</th>
            <th className="bg-card px-2 py-2">Waitress</th>
            <th className="bg-card px-2 py-2">Kosher</th>
            <th className="bg-card px-2 py-2">Delivery</th>
            <th className="bg-card px-2 py-2">Amount</th>
            <th className="bg-card px-2 py-2">Deposit</th>
            <th className="bg-card px-2 py-2">Payment</th>
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
                // `is-offer` marks a quote rather than a booking — see
                // globals.css for the dashed edge that says so, which has
                // to survive the row turning black on hover.
                className={`group cursor-pointer border-b border-line/60 align-top ${isOpen ? "is-open" : ""} ${
                  isBooked(order, stageIndex) ? "" : "is-offer"
                }`}
              >
                <td className="px-2 py-2">
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
                {/* Status leads the row: it is what the table is scanned
                    by, and as the last column it sat past the fold on a
                    laptop. It is the one cell that is neither a pill nor
                    plain text — a squared chip in the stage's own colour,
                    so it reads as the row's state rather than as another
                    of its values. */}
                <td className="px-2 py-2">
                  <ProductionStatusSelect order={order} onChanged={onChanged} />
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  <EditableCell
                    type="date"
                    displayValue={formatOrderDate(order.date)}
                    editValue={order.date}
                    onSave={(raw) => saveField(order, { date: raw })}
                  />
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-1.5">
                    <EditableCell
                      displayValue={order.customer || "(no name)"}
                      editValue={order.customer}
                      onSave={(raw) => saveField(order, { customer: raw })}
                    />
                    {/*
                      The note lives behind an icon rather than under the
                      name. As a second line it set the row's height off the
                      longest note in view — three lines for one order pushed
                      every other row apart — and it is a detail you go
                      looking for, not one you scan.

                      Notes, not the Sheet's raw `details`: migration 004
                      folded those together, so this is the same text the
                      order form edits.
                    */}
                    {order.notes && <NoteHint note={order.notes} />}
                    {order.needsReview && (
                      <span
                        title="Best-effort parsed from legacy notes — please review"
                        className="keeps-color rounded-full bg-tile-peach px-1.5 py-0.5 text-[10px] font-bold text-ink"
                      >
                        review
                      </span>
                    )}
                  </div>

                </td>
                <td className="px-2 py-2">
                  <EditableCell
                    displayValue={
                      order.customerType.trim() ? <EventTypeChip value={order.customerType} /> : "—"
                    }
                    editValue={order.customerType}
                    // The owner's list from Settings, not free text: a typed
                    // variant would render uncoloured and silently become a
                    // type of its own.
                    options={typeOptions}
                    onSave={(raw) => saveField(order, { customerType: raw })}
                  />
                </td>
                <td className="max-w-[130px] px-2 py-2">
                  <EditableCell
                    displayValue={order.location || "—"}
                    editValue={order.location}
                    onSave={(raw) => saveField(order, { location: raw })}
                  />
                </td>
                <td className="px-2 py-2">
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
                <td className="px-2 py-2">
                  {/* The count is the scannable number; the packages and
                      their flavours are a hover away. The dotted underline
                      is what says so — a row of bare numerals gives no
                      reason to point at one. */}
                  <ContentHoverCard
                    lines={order.packageLines}
                    flavors={flavors}
                    packageTypes={packageTypes}
                    className="w-fit"
                  >
                    <UnitsCell units={orderUnits(order.packageLines, unitsPerPackage)} />
                  </ContentHoverCard>
                </td>
                <td className="px-2 py-2">
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
                <td className="px-2 py-2">
                  <EditableCell
                    type="number"
                    displayValue={order.waitresses ?? "—"}
                    editValue={order.waitresses?.toString() ?? ""}
                    onSave={(raw) =>
                      saveField(order, {
                        waitresses: raw === "" ? null : Number(raw),
                      })
                    }
                  />
                </td>
                <td className="px-2 py-2">
                  <YesNoCell value={order.kosher} onSave={(kosher) => saveField(order, { kosher })} />
                </td>
                <td className="px-2 py-2">
                  {/* Whether there is delivery, not what it costs — the
                      price lives with the other extras on the order
                      sheet's money side. */}
                  <YesNoCell
                    value={hasDelivery(order)}
                    onSave={(on) => saveField(order, withDelivery(order, on))}
                  />
                </td>
                <td className="px-2 py-2 font-semibold">
                  <EditableCell
                    type="number"
                    displayValue={currency(order.totalAmount)}
                    editValue={String(order.totalAmount)}
                    onSave={(raw) => saveField(order, { totalAmount: Number(raw) || 0 })}
                  />
                </td>
                <td className="px-2 py-2">
                  <EditableCell
                    type="number"
                    displayValue={currency(order.deposit)}
                    editValue={String(order.deposit)}
                    onSave={(raw) => saveField(order, { deposit: Number(raw) || 0 })}
                  />
                </td>
                <td className="px-2 py-2">
                  <PaymentStatusSelect order={order} onChanged={onChanged} />
                </td>
              </tr>
            );
          })}
          {orders.length === 0 && (
            <tr>
              {/* Names the window rather than saying "no matches": the
                  default scope is the next fortnight, and a quiet season
                  otherwise reads as the page being broken. */}
              <td colSpan={15} className="px-2 py-8 text-center text-sm text-ink-soft">
                {emptyNote}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The order's note, one hover away.
 *
 * `cursor-help` and the outlined icon are the whole affordance: a filled
 * mark would read as a status, and this is neither good news nor bad.
 */
function NoteHint({ note }: { note: string }) {
  return (
    <HoverCard
      width={260}
      height={160}
      className="shrink-0"
      render={() => (
        <p className="text-xs leading-relaxed whitespace-pre-wrap text-ink">{note}</p>
      )}
    >
      <Info size={13} className="cursor-help text-ink-soft" aria-label="Has a note" />
    </HoverCard>
  );
}

/**
 * A yes/no column, editing as a dropdown.
 *
 * `EditableCell` speaks strings, so the boolean has to be encoded
 * somewhere — here, once, rather than at each column that needs one.
 * Yes/No rather than a tick, because in a checkbox column "no" and
 * "nobody has asked yet" look identical.
 */
const YES_NO = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
];

function YesNoCell({ value, onSave }: { value: boolean; onSave: (value: boolean) => Promise<void> }) {
  return (
    <EditableCell
      displayValue={value ? "Yes" : "No"}
      editValue={value ? "yes" : "no"}
      options={YES_NO}
      onSave={(raw) => onSave(raw === "yes")}
    />
  );
}

/**
 * The order's size as one number, standing in for the package-and-flavour
 * chips that used to fill this column. Those chips truncated on anything
 * with more than a line or two, and the total — the thing the column is
 * scanned for — was the part that got pushed out.
 *
 * The dotted underline is the affordance: `ContentHoverCard` wraps this
 * and spells the packages out, but a bare numeral gives no reason to point
 * at it. Nothing is underlined when there is nothing to elaborate on.
 */
function UnitsCell({ units }: { units: number }) {
  if (units <= 0) return <span className="text-ink-soft">—</span>;
  return (
    <span
      title="Hover for packages and flavours"
      className="flex w-fit cursor-help items-center gap-1.5 border-b border-dotted border-ink-soft/60 pb-px font-semibold tabular-nums"
    >
      <UnitsIcon size={12} className="shrink-0 text-ink-soft" />
      {nf.format(units)}
    </span>
  );
}
