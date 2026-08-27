"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, CalendarRange, Columns3, Copy, ListChecks, Plus, SlidersHorizontal, Table2, Trash2, Wallet, X, type LucideIcon } from "lucide-react";
import {
  PAYMENT_STATUS_LABEL,
  isBooked,
  orderBalance,
  stageMap,
  unitsPerPackageMap,
  type Order,
  type PaymentStatus,
  type Rates,
  type ProductionStatus,
} from "@/lib/orderTypes";
import type { ContentPreset, Flavor, PackageType } from "@/lib/settings";
import type { Client } from "@/lib/clients";
import { SCOPES, inRange, previousRange, scopeRange, totalOf, type ScopeId } from "@/lib/orderScope";
import { useStages } from "@/components/ProductionStagesContext";
import { useVatView } from "@/components/VatViewContext";
import { OrdersSummary } from "./OrdersSummary";
import { OrdersTable } from "./OrdersTable";
import { OrdersKanban } from "./OrdersKanban";
import { OrdersCalendar, type CalendarMode } from "./OrdersCalendar";
import { OrderFormModal } from "./OrderFormModal";
import { FilterDropdown, SelectDropdown, type FilterOption } from "./Dropdown";
import { SearchInput, matchesSearch } from "@/components/SearchInput";
import { useIsMobile } from "@/components/useMediaQuery";
import { OrdersMobileList } from "./OrdersMobileList";
import { Sheet } from "@/components/Sheet";
import { UndoToast, useUndoToast } from "@/components/UndoToast";
import { ClientModal } from "@/components/clients/ClientModal";
import { looksLikeSameClient } from "@/lib/clientName";

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
  clients,
  rates,
}: {
  orders: Order[];
  flavors: Flavor[];
  packageTypes: PackageType[];
  presets: ContentPreset[];
  /** Everyone on file, for the order form's customer picker. */
  clients: Client[];
  rates: Rates;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stages = useStages();
  const [view, setView] = useState<View>("table");
  const [paymentFilter, setPaymentFilter] = useState<Set<PaymentStatus>>(new Set());
  // The next fortnight by default: the page is a work queue first and an
  // archive second, and 74 orders spanning a year buries the ones due.
  const [scope, setScope] = useState<ScopeId>("14d");
  // The calendar navigates by its own month, so on that view the left slot
  // shows how to read the grid instead of which orders are in play.
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("month");
  /**
   * Which stages are in play. Starts on every stage the owner has *not*
   * marked final, because 62 of 79 orders are delivered and the page is
   * about what still needs doing until you ask for the archive.
   *
   * Read from the stage list once, at mount: changing it later would
   * silently reset a filter someone had set by hand.
   */
  const [stageFilter, setStageFilter] = useState<Set<ProductionStatus>>(
    () => new Set(stages.filter((stage) => !stage.isFinal).map((stage) => stage.key)),
  );
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  /** The phone's Filters sheet — the three dropdowns have nowhere else to go. */
  const [filtersOpen, setFiltersOpen] = useState(false);
  // The Dashboard's Latest orders list links here with ?order=<key> to
  // open that order's pane directly. Read once on mount: arriving from
  // that link is a navigation, so the component mounts fresh.
  const [openKey, setOpenKey] = useState<string | null>(() => searchParams.get("order"));
  const [query, setQuery] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  /**
   * The client whose card is open over the table.
   *
   * Opened here rather than by navigating to /clients: the question a
   * customer name raises is "who is this?", asked while working the orders
   * list — and answering it by throwing the page away, with its scope, its
   * search and its scroll position, is a poor trade for one lookup.
   */
  const [openClientId, setOpenClientId] = useState<number | null>(null);
  const undoToast = useUndoToast();
  const [batchNote, setBatchNote] = useState<string | null>(null);

  /**
   * Free text, applied before every other filter and therefore to every
   * view — the board and the calendar included. A search that only
   * narrowed the table would be a different page's control.
   *
   * It reads the fields an order is actually remembered by: who it is
   * for, what kind of event, where it is going, and the note. Not the
   * money or the dates, which have columns and a scope of their own.
   */
  const needle = query.trim();
  const bySearch = useMemo(
    () =>
      orders.filter((o) => matchesSearch(query, [o.customer, o.customerType, o.location, o.notes])),
    [orders, query],
  );

  const byPayment = useMemo(
    () => bySearch.filter((o) => paymentFilter.size === 0 || paymentFilter.has(o.paymentStatus)),
    [bySearch, paymentFilter],
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
  // list one window back, in whichever VAT convention the nav is set to.
  const { forOrder } = useVatView();
  const unitsPerPackage = unitsPerPackageMap(packageTypes);
  /*
   * A phone gets a different tree, not a different stylesheet: the table
   * is fifteen columns of `EditableCell` and hiding it in CSS would still
   * build all of it. The desktop half also carries `max-md:hidden`, so
   * during the frame before this hook has an answer the page shows
   * nothing rather than a 1100px table.
   */
  const mobile = useIsMobile();

  /*
   * How many of the three filters are narrowing anything, for the badge on
   * the phone's Filters button. Behind a sheet, a filter left on is a
   * filter nobody can see — and the stage one *starts* on, holding every
   * stage but Delivered, so "why is that order missing" would otherwise
   * have no visible cause at all.
   */
  const narrowedCount =
    (scope !== "all" ? 1 : 0) +
    (paymentFilter.size > 0 ? 1 : 0) +
    (stageFilter.size > 0 && stageFilter.size < stages.length ? 1 : 0);

  const stageIndex = stageMap(stages);
  const totals = totalOf(inScope, unitsPerPackage, stageIndex, forOrder);
  const previousTotals = totalOf(
    previous === null ? [] : source.filter((o) => inRange(o.date, previous)),
    unitsPerPackage,
    stageIndex,
    forOrder,
  );

  const openOrder = openKey ? (orders.find((o) => o.key === openKey) ?? null) : null;
  const openClient = openClientId === null ? null : (clients.find((c) => c.id === openClientId) ?? null);

  /*
   * What the open client's card shows.
   *
   * Derived plainly, not through `useMemo`. It is a filter over the orders
   * already on screen and runs only while a card is open, which is cheaper
   * than the memo would have been anyway — and `eslint-plugin-react-hooks`
   * rejected the memo outright: depending on the per-render `stageIndex`
   * map is memoisation it cannot prove safe, and one such memo makes it
   * give up on the whole component.
   */
  const clientCard = openClient && {
    lines: orders
      .filter((order) => order.clientId === openClient.id)
      .map((order) => {
        const booked = isBooked(order, stageIndex);
        return {
          key: order.key,
          date: order.date,
          customer: order.customer,
          customerType: order.customerType,
          balance: booked ? orderBalance(order) : 0,
        };
      }),
    similar: clients.filter(
      (other) => other.id !== openClient.id && looksLikeSameClient(other.name, openClient.name),
    ),
  };

  const paymentOptions = useMemo(
    () =>
      optionsWithCounts(
        PAYMENT_STATUS_LABEL,
        orders.map((o) => o.paymentStatus),
      ),
    [orders],
  );

  const stageOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const order of orders) {
      counts.set(order.productionStatus, (counts.get(order.productionStatus) ?? 0) + 1);
    }
    // Only live stages are offered, but one still holding orders stays on
    // the list so those rows can be found rather than filtered into
    // nowhere.
    return stages
      .filter((stage) => !stage.archivedAt || (counts.get(stage.key) ?? 0) > 0)
      .map((stage) => ({ value: stage.key, label: stage.label, count: counts.get(stage.key) ?? 0 }));
  }, [orders, stages]);

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

  /**
   * Deletes, and offers the way back.
   *
   * No confirmation in front of it any more: an order is put aside rather
   * than destroyed (migration 024), so the honest control is an Undo
   * afterwards rather than a dialog asking everyone to prove they meant it
   * every time — which is the one that gets clicked through unread.
   *
   * The ids are captured before the batch clears the selection, because
   * they are what Undo has to restore.
   */
  async function batchDelete() {
    const ids = Array.from(selectedKeys).map(Number);
    const count = ids.length;
    await runBatch({ action: "delete" }, "deleted");
    undoToast.show(`${count} ${count === 1 ? "order" : "orders"} deleted`, async () => {
      await fetch("/api/orders/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", ids }),
      });
      setBatchNote(null);
      refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <UndoToast offer={undoToast.offer} onDismiss={undoToast.dismiss} />

      {/*
        Their card, over the table. The orders it lists come from the ones
        already on this page rather than a second read, and it gets no
        `documents` — the Orders page does not load SUMIT's mirror, and the
        section hides itself rather than reporting nothing synced.
      */}
      {openClient && clientCard && (
        <ClientModal
          client={openClient}
          orders={clientCard.lines}
          similar={clientCard.similar}
          onClose={() => setOpenClientId(null)}
          onSaved={() => {
            setOpenClientId(null);
            refresh();
          }}
        />
      )}
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
          clients={clients}
          rates={rates}
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
          clients={clients}
          rates={rates}
          onClose={closePane}
          onSaved={() => {
            closePane();
            refresh();
          }}
        />
      )}

      {/*
        One toolbar row: filters, view switcher, add. Previously two rows —
        a switcher row plus ten filter pills — which cost a lot of vertical
        space above the table for controls used occasionally.

        It spans the page rather than riding inside the content column. It
        used to sit in the column, which put "Add order" on the table's
        right edge where the rail begins — but the column is not the same
        width in every view (the calendar drops the rail and takes the
        page), so everything in the toolbar shifted as the view changed.
        A control that moves out from under the cursor that just pressed
        it is worse than a button not quite meeting an edge.

        Three columns rather than two flanking `flex-1`s: `1fr auto 1fr`
        with both sides allowed to shrink puts the switcher at the exact
        centre of the page whatever the filters beside it happen to
        contain. As flex children the flanks would not shrink past their
        own contents, so the wider group won and nudged the middle across
        — a little, but visibly, and differently on the calendar.
      */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 max-md:hidden">
        {/* When and what, together on the left: which orders are in play
            at all, then which of those. The calendar has no time scope —
            it navigates itself — so its first slot says how the grid is
            drawn instead.

            All three are the same dropdown, and each wears an icon
            instead of its written name: the value is what changes and
            what gets read, while "Payment:" and "Status:" were fixed
            text costing more width than the values beside them. The
            word survives as the pill's title and its accessible name.
            The scope used to be four pills, which spent most of the
            toolbar on a control changed a few times a day and left
            nothing to centre the view switcher in. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {view === "calendar" ? (
            // Two options, both always worth seeing — a toggle says
            // that at a glance where a dropdown hides half of it.
            <PillGroup items={CALENDAR_MODES} value={calendarMode} onChange={setCalendarMode} />
          ) : (
            <SelectDropdown
              label="When"
              icon={<CalendarRange size={13} />}
              options={SCOPES}
              value={scope}
              onChange={setScope}
              // "All time" narrows nothing, so it reads as unset.
              active={scope !== "all"}
            />
          )}
          <FilterDropdown
            label="Payment"
            icon={<Wallet size={13} />}
            options={paymentOptions}
            selected={paymentFilter}
            onChange={setPaymentFilter}
          />
          <FilterDropdown
            label="Status"
            icon={<ListChecks size={13} />}
            options={stageOptions}
            selected={stageFilter}
            onChange={setStageFilter}
          />
        </div>

        {/* The middle column, and so the centre of the page: the view
            is what the whole page is, so it sits in the middle rather
            than in a corner — and stays there when the view changes. */}
        <PillGroup items={VIEWS} value={view} onChange={setView} />

        {/* Search sits in the gap between the view switcher and Add
            order, rather than at the head of the filters: it is the
            widest net on the page — it runs before every filter and
            narrows the board and the calendar too — and the left group
            is already three controls that each narrow the one before. */}
        <div className="flex min-w-0 items-center justify-end gap-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search orders"
            label="Search orders by customer, type, location or note"
            className="w-48"
          />
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-full bg-black px-4 py-2 text-sm font-semibold whitespace-nowrap text-cream"
          >
            <Plus size={15} />
            Add order
          </button>
        </div>
      </div>

      {/*
        The phone's toolbar. Search stays on the surface — it is the widest
        net on the page and the one control used constantly — and the three
        dropdowns go behind Filters, which says how many are narrowing
        anything so a forgotten filter cannot quietly hide an order. There
        is no view switcher: the board and the calendar are not offered on
        a phone, so the list is the page.
      */}
      <div className="flex items-center gap-2 md:hidden">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search orders"
          label="Search orders by customer, type, location or note"
          className="min-w-0 flex-1"
        />
        <button
          onClick={() => setFiltersOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-semibold text-ink-soft"
        >
          <SlidersHorizontal size={14} />
          Filters
          {narrowedCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-black px-1 text-[10px] font-bold text-cream">
              {narrowedCount}
            </span>
          )}
        </button>
      </div>

      {/*
        What the list on screen adds up to, across the width of it.

        The desktop rail is a column of right-aligned figures meant to be
        compared down its length, which a phone has no room for — but these
        are the numbers that answer "is this a busy fortnight", and that
        question does not stop being asked away from a desk. Tiles rather
        than a line of small text, because at 11px they read as a caption on
        the search bar rather than as the figures they are.

        The scope leads and is a control, not a label: it is the thing most
        likely to be changed while looking at these numbers, and it was
        otherwise buried in the Filters sheet with no sign that the list was
        showing a window at all.
      */}
      {/*
        Two by two, not four across: at 390px a quarter-width tile is about
        80px, which truncates a five-figure income to "₪18,…" and wraps the
        scope pill onto two lines. Half the width is enough for both, and a
        second row costs less than a figure nobody can read.
      */}
      <div className="grid grid-cols-2 gap-2 md:hidden">
        <div className="flex flex-col justify-between rounded-2xl bg-ink/[0.06] px-2.5 py-2">
          <span className="text-[10px] font-bold tracking-[0.08em] text-ink-soft uppercase">When</span>
          <div className="-mx-1 mt-0.5">
            <SelectDropdown
              label="When"
              options={SCOPES}
              value={scope}
              onChange={setScope}
              active={scope !== "all"}
            />
          </div>
        </div>
        <Figure label="Units" value={totals.units.toLocaleString("en-US")} />
        <Figure label="Orders" value={String(totals.orders)} />
        <Figure label="Income" value={`₪${totals.income.toLocaleString("en-US")}`} />
      </div>

      {filtersOpen && (
        <Sheet title="Filters" onClose={() => setFiltersOpen(false)}>
          {/*
            The same three controls the desktop toolbar carries, stacked and
            labelled. Their written names come back here: in the toolbar an
            icon stands in for the word because the row is short of width,
            and a sheet has nothing but width.
          */}
          <div className="flex flex-col gap-4 px-5 pb-6">
            <FilterRow label="When">
              <SelectDropdown
                label="When"
                icon={<CalendarRange size={13} />}
                options={SCOPES}
                value={scope}
                onChange={setScope}
                active={scope !== "all"}
              />
            </FilterRow>
            <FilterRow label="Payment">
              <FilterDropdown
                label="Payment"
                icon={<Wallet size={13} />}
                options={paymentOptions}
                selected={paymentFilter}
                onChange={setPaymentFilter}
              />
            </FilterRow>
            <FilterRow label="Status">
              <FilterDropdown
                label="Status"
                icon={<ListChecks size={13} />}
                options={stageOptions}
                selected={stageFilter}
                onChange={setStageFilter}
              />
            </FilterRow>
          </div>
        </Sheet>
      )}

      {/*
        Add order, as the one thing you might arrive at this page wanting to
        do. Above the bottom bar and clear of the home indicator, because
        "take an order on the spot" is half the reason the phone layout
        exists — in a toolbar it would be one more thing to find.
      */}
      <button
        onClick={() => setAdding(true)}
        aria-label="Add order"
        className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-black text-cream shadow-xl md:hidden"
      >
        <Plus size={22} />
      </button>

    {/*
      The summary rides beside the table and the board, not the calendar,
      which navigates by its own month and would otherwise carry two
      different windows at once — and which wants every pixel of the page
      for its grid.
    */}
    <div className="flex items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-5">

        {/*
          Both halves take the same `inScope` array — the mobile list is a
          renderer, not a second filtering path — and each is hidden at the
          other's width as well as gated on the hook, so neither can flash
          before hydration has an opinion.
        */}
        {view === "table" && mobile && (
          <div className="md:hidden">
            <OrdersMobileList
              orders={inScope}
              unitsPerPackage={unitsPerPackage}
              onOpen={setOpenKey}
              emptyNote={
                needle && bySearch.length === 0
                  ? `Nothing matches “${needle}”.`
                  : filtered.length > 0
                    ? `No orders in ${scopeLabel.toLowerCase()}. Try a wider time scope.`
                    : "No orders yet."
              }
            />
          </div>
        )}

        {view === "table" && !mobile && (
          <OrdersTable
            orders={inScope}
            flavors={flavors}
            packageTypes={packageTypes}
            presets={presets}
            selectedKeys={selectedKeys}
            openKey={openKey}
            onToggleSelect={toggleSelect}
            onToggleAll={toggleAll}
            onChanged={refresh}
            onOpen={setOpenKey}
            onOpenClient={setOpenClientId}
            emptyNote={
              // A search that finds nothing is its own answer: pointing
              // at the time scope would send you widening a window that
              // was never the reason the table is empty.
              needle && bySearch.length === 0
                ? `Nothing matches “${needle}”.`
                : filtered.length > 0
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
           *
           * Gone entirely on the calendar, which takes the whole page
           * for its grid. Nothing in the toolbar moves when it does,
           * because the toolbar is no longer inside this row.
           *
           * Desktop only — the phone gets the one-line strip above the
           * list instead, since a column of figures needs a column.
           */
          className="w-[140px] shrink-0 max-md:hidden"
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
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-6 max-md:bottom-24">
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
              label="Status"
              disabled={batchBusy}
              options={Object.fromEntries(
                stages.filter((stage) => !stage.archivedAt).map((stage) => [stage.key, stage.label]),
              )}
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

/**
 * One filter in the phone's Filters sheet: the name, and the control.
 *
 * The written name is back because there is room for it. In the desktop
 * toolbar each of these wears an icon instead — the value is what changes
 * and what gets read, and "Payment:" cost more width than the value beside
 * it — but that trade only makes sense in a row fighting for space.
 */
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-semibold text-ink-soft">{label}</span>
      {children}
    </div>
  );
}

/**
 * One figure in the phone's summary row.
 *
 * A low-contrast fill rather than a bordered card: four bordered boxes in a
 * row above a list of bordered cards is a lot of edges for a small screen,
 * and these are a summary of what is below rather than four more things to
 * read.
 */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col justify-between rounded-2xl bg-ink/[0.06] px-2.5 py-2">
      <span className="text-[10px] font-bold tracking-[0.08em] text-ink-soft uppercase">{label}</span>
      <span className="mt-0.5 truncate font-display text-[17px] leading-none font-extrabold tabular-nums">
        {value}
      </span>
    </div>
  );
}
