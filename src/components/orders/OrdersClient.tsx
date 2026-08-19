"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Columns3, Copy, Plus, Table2, Trash2, X, type LucideIcon } from "lucide-react";
import {
  PAYMENT_STATUS_LABEL,
  PRODUCTION_STATUS_LABEL,
  unitsPerPackageMap,
  type Order,
  type PaymentStatus,
  type Prices,
  type ProductionStatus,
} from "@/lib/orderTypes";
import type { ContentPreset, Flavor, PackageType } from "@/lib/settings";
import { SCOPES, inRange, previousRange, scopeRange, totalOf, type ScopeId } from "@/lib/orderScope";
import { OrdersSummary } from "./OrdersSummary";
import { OrdersTable } from "./OrdersTable";
import { OrdersKanban } from "./OrdersKanban";
import { OrdersCalendar, type CalendarMode } from "./OrdersCalendar";
import { OrderFormModal } from "./OrderFormModal";
import { FilterDropdown, SelectDropdown, type FilterOption } from "./Dropdown";

type View = "table" | "kanban" | "calendar";

const VIEWS: { id: View; label: string; Icon: LucideIcon }[] = [
  { id: "table", label: "Table", Icon: Table2 },
  { id: "kanban", label: "Kanban", Icon: Columns3 },
  { id: "calendar", label: "Calendar", Icon: CalendarDays },
];

const CALENDAR_MODES: { id: CalendarMode; label: string }[] = [
  { id: "month", label: "Monthly" },
  { id: "week", label: "Weekly" },
];

/**
 * The toolbar's segmented pills — time scope, calendar mode, view — which
 * were three copies of the same markup differing only in which state they
 * read. An `icon` is optional because only the view switcher carries one.
 */
function PillGroup<T extends string>({
  items,
  value,
  onChange,
}: {
  items: readonly { id: T; label: string; Icon?: LucideIcon }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex w-fit items-center gap-1 rounded-full bg-card p-1">
      {items.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap transition ${
            value === id ? "bg-black text-cream" : "text-ink-soft hover:text-ink"
          }`}
        >
          {Icon && <Icon size={14} />}
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * The stages the page opens on: everything except Delivered.
 *
 * Derived from the label map rather than listed out, so a stage added
 * later is visible by default — an order sitting in a stage nobody has
 * heard of should show up, not hide.
 */
const ACTIVE_STAGES = (Object.keys(PRODUCTION_STATUS_LABEL) as ProductionStatus[]).filter(
  (stage) => stage !== "delivered",
);

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
  presets,
  prices,
}: {
  orders: Order[];
  flavors: Flavor[];
  packageTypes: PackageType[];
  presets: ContentPreset[];
  prices: Prices;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<View>("table");
  const [paymentFilter, setPaymentFilter] = useState<Set<PaymentStatus>>(new Set());
  // The next fortnight by default: the page is a work queue first and an
  // archive second, and 74 orders spanning a year buries the ones due.
  const [scope, setScope] = useState<ScopeId>("14d");
  // The calendar navigates by its own month, so on that view the left slot
  // shows how to read the grid instead of which orders are in play.
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("month");
  /**
   * Which stages are in play. Starts on everything except Delivered
   * rather than empty, because 62 of 79 orders are delivered and the page
   * is about what still needs doing until you ask for the archive.
   *
   * That default used to be a Delivered on/off toggle, which could only
   * ever answer one question. As a filter it answers all of them — show
   * me the offers, show me what is being prepared — for the same width.
   */
  const [stageFilter, setStageFilter] = useState<Set<ProductionStatus>>(
    () => new Set(ACTIVE_STAGES),
  );
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  // The Dashboard's Latest orders list links here with ?order=<key> to
  // open that order's pane directly. Read once on mount: arriving from
  // that link is a navigation, so the component mounts fresh.
  const [openKey, setOpenKey] = useState<string | null>(() => searchParams.get("order"));
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchNote, setBatchNote] = useState<string | null>(null);

  const byPayment = useMemo(
    () => orders.filter((o) => paymentFilter.size === 0 || paymentFilter.has(o.paymentStatus)),
    [orders, paymentFilter],
  );

  /**
   * Table and calendar narrow to the chosen stages. Kanban does not use
   * this: it *is* the production board, its columns already are the
   * stages, and hiding one would leave the board unable to show work it
   * is meant to be tracking.
   */
  const filtered = useMemo(
    () => byPayment.filter((o) => stageFilter.size === 0 || stageFilter.has(o.productionStatus)),
    [byPayment, stageFilter],
  );

  /*
    Read once per render rather than per call, so every scope boundary and
    every total on this pass is measured from the same instant.
  */
  const today = new Date();
  const range = scopeRange(scope, today);
  const previous = previousRange(scope, today);
  const scopeLabel = SCOPES.find((s) => s.id === scope)?.label ?? "";

  /**
   * What this view is working from, before the scope narrows it. Kanban
   * keeps its Delivered column, which is the only difference between the
   * two lists — so the choice is made once here rather than at each of
   * the four places that used to repeat the ternary.
   */
  const source = view === "kanban" ? byPayment : filtered;
  const inScope = source.filter((o) => inRange(o.date, range));

  // The summary describes exactly the list on screen, against the same
  // list one window back.
  const unitsPerPackage = unitsPerPackageMap(packageTypes);
  const totals = totalOf(inScope, unitsPerPackage);
  const previousTotals = totalOf(
    previous === null ? [] : source.filter((o) => inRange(o.date, previous)),
    unitsPerPackage,
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

  const stageOptions = useMemo(
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

  /** Over what the table actually shows, so the scope can't select rows off screen. */
  function toggleAll() {
    setSelectedKeys((prev) =>
      prev.size === inScope.length ? new Set() : new Set(inScope.map((o) => o.key)),
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
          presets={presets}
          prices={prices}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}

      {/*
        One popup for both adding and editing — the side pane it replaced
        is still in the tree (OrderDetailsPane) but nothing routes to it,
        so editing behaves identically wherever you start from.
      */}
      {openOrder && (
        <OrderFormModal
          order={openOrder}
          flavors={flavors}
          packageTypes={packageTypes}
          presets={presets}
          prices={prices}
          onClose={closePane}
          onSaved={() => {
            closePane();
            refresh();
          }}
        />
      )}

      {/*
        The summary rides beside the table and the board, not the calendar:
        a calendar navigates by its own month, so a rail counting a
        different window next to it would be two answers to one question.
      */}
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {/*
            One toolbar row: filters, view switcher, add. Previously two rows
            — a switcher row plus ten filter pills — which cost a lot of
            vertical space above the table for controls used occasionally.

            It rides inside the table column rather than spanning the page, so
            the summary rail beside it starts at the very top instead of at the
            table's first row. That also puts "Add order" on the table's right
            edge, where the rail begins.
          */}
          <div className="flex flex-wrap items-center gap-3">
            {/* When and what, together on the left: which orders are in play
                at all, then which of those. The calendar has no time scope —
                it navigates itself — so its first slot says how the grid is
                drawn instead.

                All three are the same dropdown. The scope used to be four
                pills, which spent most of the toolbar on a control changed
                a few times a day and left nothing to centre the view
                switcher in. */}
            <div className="flex flex-1 flex-wrap items-center gap-2">
              {view === "calendar" ? (
                // Two options, both always worth seeing — a toggle says
                // that at a glance where a dropdown hides half of it.
                <PillGroup items={CALENDAR_MODES} value={calendarMode} onChange={setCalendarMode} />
              ) : (
                <SelectDropdown
                  label="When"
                  options={SCOPES}
                  value={scope}
                  onChange={setScope}
                  // "All time" narrows nothing, so it reads as unset.
                  active={scope !== "all"}
                />
              )}
              <FilterDropdown
                label="Payment"
                options={paymentOptions}
                selected={paymentFilter}
                onChange={setPaymentFilter}
              />
              <FilterDropdown
                label="Stage"
                options={stageOptions}
                selected={stageFilter}
                onChange={setStageFilter}
              />
            </div>

            {/* Centred between the two flanks, which both take an equal
                share of the free space — the view is what the whole page
                is, so it sits in the middle rather than in a corner. */}
            <PillGroup items={VIEWS} value={view} onChange={setView} />

            <div className="flex flex-1 justify-end">
              <button
                onClick={() => setAdding(true)}
                className="flex items-center gap-1.5 rounded-full bg-black px-4 py-2 text-sm font-semibold whitespace-nowrap text-cream"
              >
                <Plus size={15} />
                Add order
              </button>
            </div>
          </div>

          {view === "table" && (
            <OrdersTable
              orders={inScope}
              flavors={flavors}
              packageTypes={packageTypes}
              selectedKeys={selectedKeys}
              openKey={openKey}
              onToggleSelect={toggleSelect}
              onToggleAll={toggleAll}
              onChanged={refresh}
              onOpen={setOpenKey}
              emptyNote={
                filtered.length > 0
                  ? `No orders in ${scopeLabel.toLowerCase()}. Try a wider time scope.`
                  : "No orders match these filters."
              }
            />
          )}
          {view === "kanban" && (
            <OrdersKanban
              orders={inScope}
              flavors={flavors}
              packageTypes={packageTypes}
              onChanged={refresh}
              onOpen={setOpenKey}
            />
          )}
          {view === "calendar" && (
            <OrdersCalendar
              orders={filtered}
              flavors={flavors}
              packageTypes={packageTypes}
              mode={calendarMode}
              onOpen={setOpenKey}
            />
          )}
        </div>

        {view !== "calendar" && (
          <aside
            /*
             * A fixed 140px rather than a share of the page. It was 15%,
             * which on a 13" laptop spent 180px on four short numbers and
             * took them from the table beside it — the one thing on this
             * page that genuinely needs the width.
             */
            className="w-[140px] shrink-0"
          >
            <OrdersSummary
              totals={totals}
              previous={previousTotals}
              scopeLabel={scopeLabel}
              comparable={previous !== null}
            />
          </aside>
        )}
      </div>

      {/*
        Floating rather than inline: an action bar that appears in the flow
        pushes the table down the moment you tick a row, moving the very
        rows you are selecting.
      */}
      {selectedKeys.size > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-6">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-black px-4 py-2 text-cream shadow-2xl">
            <span className="text-sm font-semibold">{selectedKeys.size} selected</span>

            <span className="mx-1 h-5 w-px bg-cream/25" />
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

            <span className="mx-1 h-5 w-px bg-cream/25" />
            <button
              disabled={batchBusy}
              onClick={() => runBatch({ action: "duplicate" }, "duplicated")}
              className="flex items-center gap-1.5 rounded-full border border-cream/30 px-3 py-1 text-xs font-semibold text-cream transition hover:bg-cream hover:text-ink disabled:opacity-50"
            >
              <Copy size={13} />
              Duplicate
            </button>
            <button
              disabled={batchBusy}
              onClick={batchDelete}
              className="flex items-center gap-1.5 rounded-full border border-red-400/50 px-3 py-1 text-xs font-semibold text-red-300 transition hover:bg-red-500 hover:text-white disabled:opacity-50"
            >
              <Trash2 size={13} />
              Delete
            </button>

            <button
              onClick={() => setSelectedKeys(new Set())}
              aria-label="Clear selection"
              className="ml-1 rounded-full p-1 text-cream/70 transition hover:bg-cream/20 hover:text-cream"
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
      className="rounded-full border border-cream/30 bg-transparent px-3 py-1 text-xs font-semibold text-cream outline-none disabled:opacity-50 [&>option]:text-ink"
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
