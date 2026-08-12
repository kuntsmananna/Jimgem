"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Columns3, Copy, Plus, Table2, Trash2, X, type LucideIcon } from "lucide-react";
import {
  PAYMENT_STATUS_LABEL,
  PRODUCTION_STATUS_LABEL,
  type Order,
  type PaymentStatus,
  type ProductionStatus,
} from "@/lib/orderTypes";
import type { Flavor, PackageType } from "@/lib/settings";
import { OrdersTable } from "./OrdersTable";
import { OrdersKanban } from "./OrdersKanban";
import { OrdersCalendar } from "./OrdersCalendar";
import { OrderFormModal } from "./OrderFormModal";
import { OrderDetailsPane } from "./OrderDetailsPane";
import { FilterDropdown, type FilterOption } from "./FilterDropdown";

type View = "table" | "kanban" | "calendar";

const VIEWS: { value: View; label: string; Icon: LucideIcon }[] = [
  { value: "table", label: "Table", Icon: Table2 },
  { value: "kanban", label: "Kanban", Icon: Columns3 },
  { value: "calendar", label: "Calendar", Icon: CalendarDays },
];

/** Dropdown options with a live count of how many orders carry each value. */
function optionsWithCounts<T extends string>(labels: Record<T, string>, values: T[]): FilterOption<T>[] {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return (Object.keys(labels) as T[]).map((value) => ({
    value,
    label: labels[value],
    count: counts.get(value) ?? 0,
  }));
}

export function OrdersClient({
  orders,
  flavors,
  packageTypes,
}: {
  orders: Order[];
  flavors: Flavor[];
  packageTypes: PackageType[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<View>("table");
  const [paymentFilter, setPaymentFilter] = useState<Set<PaymentStatus>>(new Set());
  const [productionFilter, setProductionFilter] = useState<Set<ProductionStatus>>(new Set());
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  // The Dashboard's Latest orders list links here with ?order=<key> to
  // open that order's pane directly. Read once on mount: arriving from
  // that link is a navigation, so the component mounts fresh.
  const [openKey, setOpenKey] = useState<string | null>(() => searchParams.get("order"));
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchNote, setBatchNote] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      orders
        .filter((o) => paymentFilter.size === 0 || paymentFilter.has(o.paymentStatus))
        .filter((o) => productionFilter.size === 0 || productionFilter.has(o.productionStatus)),
    [orders, paymentFilter, productionFilter],
  );

  const openOrder = openKey ? (orders.find((o) => o.key === openKey) ?? null) : null;

  const paymentOptions = useMemo(
    () =>
      optionsWithCounts(
        PAYMENT_STATUS_LABEL,
        orders.map((o) => o.paymentStatus),
      ),
    [orders],
  );
  const productionOptions = useMemo(
    () =>
      optionsWithCounts(
        PRODUCTION_STATUS_LABEL,
        orders.map((o) => o.productionStatus),
      ),
    [orders],
  );

  function refresh() {
    router.refresh();
  }

  /** Also drops ?order= so refreshing doesn't reopen a pane you closed. */
  function closePane() {
    setOpenKey(null);
    if (searchParams.get("order")) router.replace("/orders");
  }

  function toggleSelect(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelectedKeys((prev) =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map((o) => o.key)),
    );
  }

  async function runBatch(body: Record<string, unknown>, verb: string) {
    setBatchBusy(true);
    setBatchNote(null);
    const response = await fetch("/api/orders/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...body,
        ids: Array.from(selectedKeys).map(Number),
      }),
    });
    const result = await response.json();
    setBatchBusy(false);
    // Report partial success rather than silently dropping the failures.
    setBatchNote(
      result.failed > 0
        ? `${result.succeeded} ${verb}, ${result.failed} couldn't be.`
        : `${result.succeeded} ${verb}.`,
    );
    setSelectedKeys(new Set());
    refresh();
  }

  async function batchDelete() {
    const count = selectedKeys.size;
    if (!confirm(`Delete ${count} ${count === 1 ? "order" : "orders"}? This can't be undone.`)) return;
    await runBatch({ action: "delete" }, "deleted");
  }

  return (
    <div className="flex flex-col gap-5">
      {/*
        One toolbar row: filters, view switcher, add. Previously two rows
        — a switcher row plus ten filter pills — which cost a lot of
        vertical space above the table for controls used occasionally.
      */}
      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2">
          <FilterDropdown
            label="Payment"
            options={paymentOptions}
            selected={paymentFilter}
            onChange={setPaymentFilter}
          />
          <FilterDropdown
            label="Production"
            options={productionOptions}
            selected={productionFilter}
            onChange={setProductionFilter}
          />
        </div>

        <div className="flex items-center gap-1 rounded-full bg-card p-1">
          {VIEWS.map(({ value, label, Icon }) => (
            <button
              key={value}
              onClick={() => setView(value)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                view === value ? "bg-black text-cream" : "text-ink-soft hover:text-ink"
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-1 justify-end">
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-full bg-black px-4 py-2 text-sm font-semibold text-cream"
          >
            <Plus size={15} />
            Add order
          </button>
        </div>
      </div>

      {batchNote && (
        <p className="text-xs font-semibold text-ink-soft">
          {batchNote}{" "}
          <button onClick={() => setBatchNote(null)} className="text-ink-soft/70 underline">
            dismiss
          </button>
        </p>
      )}

      {adding && (
        <OrderFormModal
          flavors={flavors}
          packageTypes={packageTypes}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}

      {openOrder && (
        <OrderDetailsPane
          order={openOrder}
          flavors={flavors}
          packageTypes={packageTypes}
          onClose={closePane}
          onSaved={() => {
            closePane();
            refresh();
          }}
        />
      )}

      {view === "table" && (
        <OrdersTable
          orders={filtered}
          flavors={flavors}
          packageTypes={packageTypes}
          selectedKeys={selectedKeys}
          openKey={openKey}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          onChanged={refresh}
          onOpen={setOpenKey}
        />
      )}
      {view === "kanban" && (
        <OrdersKanban
          orders={filtered}
          flavors={flavors}
          packageTypes={packageTypes}
          onChanged={refresh}
          onOpen={setOpenKey}
        />
      )}
      {view === "calendar" && <OrdersCalendar orders={filtered} />}

      {/*
        Floating rather than inline: an action bar that appears in the flow
        pushes the table down the moment you tick a row, moving the very
        rows you are selecting.
      */}
      {selectedKeys.size > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-6">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2 shadow-2xl">
            <span className="text-sm font-semibold text-ink">{selectedKeys.size} selected</span>

            <span className="mx-1 h-5 w-px bg-line" />
            <BatchSelect
              label="Payment"
              disabled={batchBusy}
              options={PAYMENT_STATUS_LABEL}
              onPick={(status) => runBatch({ action: "paymentStatus", status }, "updated")}
            />
            <BatchSelect
              label="Production"
              disabled={batchBusy}
              options={PRODUCTION_STATUS_LABEL}
              onPick={(status) => runBatch({ action: "productionStatus", status }, "updated")}
            />

            <span className="mx-1 h-5 w-px bg-line" />
            <button
              disabled={batchBusy}
              onClick={() => runBatch({ action: "duplicate" }, "duplicated")}
              className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink hover:bg-black/5 disabled:opacity-50"
            >
              <Copy size={13} />
              Duplicate
            </button>
            <button
              disabled={batchBusy}
              onClick={batchDelete}
              className="flex items-center gap-1.5 rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 size={13} />
              Delete
            </button>

            <button
              onClick={() => setSelectedKeys(new Set())}
              aria-label="Clear selection"
              className="ml-1 rounded-full p-1 text-ink-soft hover:bg-black/5 hover:text-ink"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BatchSelect<T extends string>({
  label,
  options,
  onPick,
  disabled,
}: {
  label: string;
  options: Record<T, string>;
  onPick: (value: T) => void;
  disabled: boolean;
}) {
  return (
    <select
      disabled={disabled}
      value=""
      onChange={(e) => e.target.value && onPick(e.target.value as T)}
      className="rounded-full border border-line bg-cream px-3 py-1 text-xs font-semibold text-ink outline-none disabled:opacity-50"
    >
      <option value="">{label}…</option>
      {(Object.keys(options) as T[]).map((value) => (
        <option key={value} value={value}>
          {options[value]}
        </option>
      ))}
    </select>
  );
}
