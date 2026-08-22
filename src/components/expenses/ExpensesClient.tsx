"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Expense, ExpensePeriod } from "@/lib/expenses";
import type { ExpenseCategory, PaymentMethod, StaffAccount } from "@/lib/settings";
import { DonutChart, type DonutSlice } from "@/components/charts/DonutChart";
import { LineChart } from "@/components/charts/LineChart";
import { EXPENSE_PALETTE, SERIES_COLORS } from "@/lib/chartPalette";
import { CalendarDays, ChevronsLeft, ChevronsRight, CreditCard, Maximize2, Plus, Trash2, UserRound } from "lucide-react";
import { expenseCategoryIconElement } from "@/lib/icons";
import { formatOrderDate } from "@/lib/orderTypes";
import { EditableCell } from "@/components/orders/EditableCell";
import { FilterDropdown } from "@/components/orders/Dropdown";
import { ExpenseFormModal } from "./ExpenseFormModal";
import { useVatView } from "@/components/VatViewContext";
import {
  EXPENSE_PANES_COOKIE,
  serializeCollapsedPanes,
  type ExpensePane,
} from "@/lib/expensePanes";

/**
 * Amounts carry their agorot when they have any — ₪12,344.67 — and drop
 * the ".00" when they don't, so a column of round numbers stays quiet.
 */
const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const currency = (n: number) => `₪${money.format(n)}`;

export function ExpensesClient({
  periods,
  categories,
  paymentMethods,
  staff,
  vatRate,
  collapsedPanes,
}: {
  periods: ExpensePeriod[];
  categories: ExpenseCategory[];
  paymentMethods: PaymentMethod[];
  staff: StaffAccount[];
  /** Today's VAT rate, stamped onto a new expense. */
  vatRate: number;
  /** Folded when the page loaded, read from the cookie — see expensePanes.ts. */
  collapsedPanes: ExpensePane[];
}) {
  const router = useRouter();
  const defaultPeriod = periods.find((p) => p.key !== "general" && p.entries.length > 0)?.key ?? periods[0]?.key;
  const [selectedKey, setSelectedKey] = useState<string>(defaultPeriod ?? "general");
  const [adding, setAdding] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  /** Empty means every category — the same default the Orders filters use. */
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<ExpensePane>>(() => new Set(collapsedPanes));

  /**
   * Fold a side pane away, or bring it back.
   *
   * Written straight to the cookie rather than through a route and a
   * `router.refresh()`: nothing on the server depends on this — the page
   * only reads it to decide what to paint first — so re-rendering the page
   * to change a grid template would cost a round trip for nothing.
   */
  function togglePane(pane: ExpensePane) {
    const next = new Set(collapsed);
    if (!next.delete(pane)) next.add(pane);
    setCollapsed(next);
    document.cookie = `${EXPENSE_PANES_COOKIE}=${serializeCollapsedPanes(next)}; path=/; max-age=31536000; samesite=lax`;
  }

  const period = periods.find((p) => p.key === selectedKey) ?? periods[periods.length - 1];
  // Per expense, not per total: a receipt from an unregistered supplier
  // carries no VAT, so a month holding both has no single divisor.
  const { forExpense, label: vatLabel } = useVatView();

  const entries = useMemo(
    () =>
      (period?.entries ?? []).filter(
        (entry) => categoryFilter.size === 0 || categoryFilter.has(entry.categoryName),
      ),
    [period, categoryFilter],
  );

  const slices: DonutSlice[] = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const entry of entries) {
      totals[entry.categoryName] = (totals[entry.categoryName] ?? 0) + forExpense(entry);
    }
    return Object.entries(totals).map(([label, value], i) => ({
      label,
      value,
      color: EXPENSE_PALETTE[i % EXPENSE_PALETTE.length],
    }));
  }, [entries, forExpense]);

  // Counted before the filter is applied, so a category's number doesn't
  // vanish the moment you filter to another one.
  const countByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of period?.entries ?? []) {
      counts.set(entry.categoryName, (counts.get(entry.categoryName) ?? 0) + 1);
    }
    return counts;
  }, [period]);

  const total = entries.reduce((sum, entry) => sum + forExpense(entry), 0);

  /** The five that account for most of the period, biggest first. */
  const biggest = useMemo(
    () => [...entries].sort((a, b) => forExpense(b) - forExpense(a)).slice(0, 5),
    [entries, forExpense],
  );

  /**
   * The period's spend as it accumulates, one point per day that has an
   * expense on it. Cumulative rather than daily: what a period is asked is
   * how fast it is adding up, and most days are simply empty.
   */
  const cumulative = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const entry of entries) {
      if (!entry.date) continue;
      byDay.set(entry.date, (byDay.get(entry.date) ?? 0) + forExpense(entry));
    }
    const days = [...byDay.keys()].sort();
    const values: number[] = [];
    for (const day of days) {
      values.push((values.at(-1) ?? 0) + (byDay.get(day) ?? 0));
    }
    return { labels: days.map((day) => formatOrderDate(day)), values };
  }, [entries, forExpense]);
  const editing = editingKey === null ? null : (entries.find((entry) => entry.key === editingKey) ?? null);

  function refresh() {
    router.refresh();
  }

  async function deleteEntry(key: string) {
    if (!confirm("Delete this expense?")) return;
    await fetch(`/api/expenses/${key}`, { method: "DELETE" });
    refresh();
  }

  /**
   * One field of one expense, sent as a whole row.
   *
   * The route takes a complete `ExpenseInput`, so an inline edit merges its
   * one change into everything else the row already holds rather than
   * needing a partial-update path of its own.
   */
  async function patch(entry: Expense, change: Partial<Record<string, unknown>>) {
    await fetch(`/api/expenses/${entry.key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: entry.date,
        categoryId: entry.categoryId,
        amount: entry.amount,
        paymentMethodId: entry.paymentMethodId,
        staffId: entry.staffId,
        business: entry.business,
        note: entry.note,
        vatMode: entry.vatMode,
        vatRate: entry.vatRate,
        ...change,
      }),
    });
    refresh();
  }

  const periodsFolded = collapsed.has("periods");
  const chartsFolded = collapsed.has("charts");

  return (
    // The breakdown pane gives up width to the list: a donut reads fine
    // small, and the list is where every column had to fight for room.
    // Either flank folds to a rail, and the middle takes what it leaves —
    // the template is computed rather than written as a class, because
    // Tailwind cannot generate one that changes at runtime.
    <div
      className="grid gap-6"
      style={{
        gridTemplateColumns: `${periodsFolded ? RAIL_WIDTH : "200px"} 2.2fr ${chartsFolded ? RAIL_WIDTH : "0.85fr"}`,
      }}
    >
      {periodsFolded ? (
        <PaneRail label={period?.label ?? "Periods"} side="left" onExpand={() => togglePane("periods")} />
      ) : (
        <section className="min-w-0 rounded-card border border-line bg-card p-4">
          <div className="flex items-center justify-between gap-1 px-2">
            <h2 className="font-display text-base font-bold text-ink">Periods</h2>
            <FoldButton side="left" title="Fold the periods away" onClick={() => togglePane("periods")} />
          </div>
          <ul className="mt-2 flex flex-col gap-1">
            {periods.map((p) => (
              <li key={p.key}>
                <button
                  onClick={() => setSelectedKey(p.key)}
                  className={`hover-line flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm ${
                    selectedKey === p.key ? "bg-black text-cream" : "text-ink"
                  }`}
                >
                  <span>{p.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="min-w-0 rounded-card border border-line bg-card p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="font-display text-lg font-bold text-ink">{period?.label}</h2>
            {/* Which convention these figures are in, beside them rather
                than in a settings pane — the switch is in the nav and its
                effect is here. */}
            <span className="text-sm font-semibold text-ink tabular-nums">{currency(total)}</span>
            <span className="text-[11px] font-semibold text-ink-soft">{vatLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <FilterDropdown
              label="Category"
              options={categories
                .filter((category) => countByCategory.has(category.name))
                .map((category) => ({
                  value: category.name,
                  label: category.name,
                  count: countByCategory.get(category.name) ?? 0,
                }))}
              selected={categoryFilter}
              onChange={setCategoryFilter}
            />
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-cream"
            >
              <Plus size={13} />
              Add expense
            </button>
          </div>
        </div>


        {(adding || editing) && (
          <ExpenseFormModal
            expense={editing ?? undefined}
            categories={categories}
            paymentMethods={paymentMethods}
            staff={staff}
            vatRate={vatRate}
            onClose={() => {
              setAdding(false);
              setEditingKey(null);
            }}
            onSaved={(date) => {
              setAdding(false);
              setEditingKey(null);
              if (!editing) setSelectedKey(date.slice(0, 7));
              refresh();
            }}
          />
        )}

        <div className="mt-4 flex flex-col gap-1.5">
          {entries.map((entry) => (
            <ExpenseRow
              key={entry.key}
              entry={entry}
              value={forExpense(entry)}
              categories={categories}
              paymentMethods={paymentMethods}
              staff={staff}
              onOpen={() => setEditingKey(entry.key)}
              onPatch={(change) => patch(entry, change)}
              onDelete={() => deleteEntry(entry.key)}
            />
          ))}
          {entries.length === 0 && (
            <p className="text-sm text-ink-soft">
              {categoryFilter.size > 0
                ? "Nothing in those categories this period."
                : "No expenses logged for this period yet."}
            </p>
          )}
        </div>
      </section>

      {chartsFolded ? (
        <PaneRail label="Charts" side="right" onExpand={() => togglePane("charts")} />
      ) : (
        <div className="flex min-w-0 flex-col gap-6">
          <section className="min-w-0 rounded-card border border-line bg-card p-6">
            {/* The fold sits on the first card's heading because it is the
                top of the column — one control for all three, where the eye
                already is when it reaches them. */}
            <div className="flex items-center justify-between gap-1">
              <h2 className="font-display text-base font-bold text-ink">Category breakdown</h2>
              <FoldButton side="right" title="Fold the charts away" onClick={() => togglePane("charts")} />
            </div>
            <div className="mt-4">
              <DonutChart slices={slices} />
            </div>
          </section>

          {/*
            Where the money went, biggest first. A donut answers "which
            category", this answers "which expense" — the one that is usually
            behind a month looking heavier than it should.
          */}
          <section className="min-w-0 rounded-card border border-line bg-card p-6">
            <h2 className="font-display text-base font-bold text-ink">Biggest expenses</h2>
            <ul className="mt-3 flex flex-col">
              {biggest.map((entry) => (
                <li key={entry.key}>
                  <button
                    onClick={() => setEditingKey(entry.key)}
                    className="hover-line flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">
                      {entry.business || entry.note || entry.categoryName}
                    </span>
                    <span className="shrink-0 text-xs font-bold text-ink tabular-nums">
                      {currency(forExpense(entry))}
                    </span>
                  </button>
                </li>
              ))}
              {biggest.length === 0 && <p className="text-sm text-ink-soft">Nothing in this period.</p>}
            </ul>
          </section>

          {/*
            Cumulative, not per-day: the question a period asks is "how fast
            is this adding up", and a bar per day answers a different one —
            most days are empty, and the ones that aren't say nothing about
            where the total is heading.
          */}
          <section className="min-w-0 rounded-card border border-line bg-card p-6">
            <h2 className="font-display text-base font-bold text-ink">Spend so far</h2>
            <p className="mt-0.5 mb-3 text-xs text-ink-soft">Adding up across the period.</p>
            {cumulative.values.length > 1 ? (
              <LineChart
                series={[{ label: "Spent", color: SERIES_COLORS.jasmine, values: cumulative.values }]}
                xLabels={cumulative.labels}
                height={150}
              />
            ) : (
              <p className="text-sm text-ink-soft">Not enough dated expenses to plot yet.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/** Wide enough for the fold arrow plus its target — see PaneRail. */
const RAIL_WIDTH = "2.5rem";

/**
 * A folded pane, still on the page.
 *
 * The whole rail is the button that brings it back, and it carries the
 * pane's name turned on its side: a bare arrow says something is hidden
 * without saying what, and the periods rail says which period is showing,
 * which is the one thing the pane was answering while it was open.
 *
 * The label reads bottom-to-top (`vertical-rl` turned 180°), the way a
 * book spine does.
 */
function PaneRail({
  label,
  side,
  onExpand,
}: {
  label: string;
  /** Which flank it sits on — the arrow points back out toward the pane. */
  side: "left" | "right";
  onExpand: () => void;
}) {
  const Arrow = side === "left" ? ChevronsRight : ChevronsLeft;
  return (
    <button
      onClick={onExpand}
      title={`Show ${label}`}
      aria-label={`Show ${label}`}
      className="flex min-w-0 flex-col items-center gap-3 rounded-card border border-line bg-card py-3 text-ink-soft transition hover:bg-black/5 hover:text-ink"
    >
      <Arrow size={15} />
      <span
        className="truncate text-[11px] font-bold tracking-[0.14em] uppercase"
        style={{ writingMode: "vertical-rl", rotate: "180deg" }}
      >
        {label}
      </span>
    </button>
  );
}

/** The fold control inside an open pane, pointing at the edge it folds to. */
function FoldButton({
  side,
  title,
  onClick,
}: {
  side: "left" | "right";
  title: string;
  onClick: () => void;
}) {
  const Arrow = side === "left" ? ChevronsLeft : ChevronsRight;
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="rounded-full p-1 text-ink-soft transition hover:bg-black/5 hover:text-ink"
    >
      <Arrow size={15} />
    </button>
  );
}

/**
 * One expense, as columns rather than a run of text.
 *
 * The order is what the eye needs in the order it needs it: **when**, in
 * what **category**, **which business** — the line's subject, set darker
 * than anything around it — and then **what it bought**, quieter beside
 * it. Those last two were one field until an expense could name its
 * supplier, which made a single string answer two questions and left the
 * shop buried mid-sentence. Who paid and how ride right, just before the
 * amount, because they qualify the expense rather than identify it; both
 * are chips with an icon, so they read as attributes at a glance instead
 * of two more strings.
 *
 * The date drops its year. Everything here is one season, and the year
 * repeated on every row is four characters of noise per line.
 *
 * Clicking the row opens it for editing; the fields that get corrected
 * most — the description and the amount — are also editable in place, so
 * a typo doesn't need a popup.
 */
function ExpenseRow({
  entry,
  value,
  categories,
  paymentMethods,
  staff,
  onOpen,
  onPatch,
  onDelete,
}: {
  entry: Expense;
  /** The amount in the current VAT convention — see ExpensesClient. */
  value: number;
  categories: ExpenseCategory[];
  paymentMethods: PaymentMethod[];
  staff: StaffAccount[];
  onOpen: () => void;
  onPatch: (change: Record<string, unknown>) => Promise<void>;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={(event) => {
        // Only a click on the row itself opens it — the inline editors and
        // the trash are interactive elements of their own, and swallowing
        // their clicks here would make editing a field open a popup over it.
        if ((event.target as HTMLElement).closest("button, input, select, a")) return;
        onOpen();
      }}
      className="hover-line group grid min-w-0 cursor-pointer grid-cols-[5.25rem_9rem_minmax(0,1fr)_minmax(0,1.6fr)_auto_auto] items-center gap-x-2 rounded-xl border border-line px-3 py-2 text-sm"
    >
      {/*
        Date, description and amount are the row: when, what for, what it
        cost. Everything else qualifies those three and is set quieter.

        No year — the period says which one, and repeating it on every row
        is noise down the column.
      */}
      <DateCell date={entry.date} onChange={(date) => onPatch({ date })} onOpen={onOpen} />

      {/* A chip, because a category is a class the row belongs to rather
          than a value it holds — the same reasoning the order type chip
          follows on the Orders table. */}
      <span className="min-w-0">
        <EditableCell
          chip
          displayValue={<CategoryChip name={entry.categoryName} />}
          editValue={String(entry.categoryId)}
          options={categories.map((category) => ({ value: String(category.id), label: category.name }))}
          onSave={(raw) => onPatch({ categoryId: Number(raw) })}
        />
      </span>

      {/* Who took the money — the subject of the line, and what the eye
          lands on when scanning for a supplier. */}
      <span className="min-w-0">
        <EditableCell
          displayValue={
            <span className="block truncate font-semibold text-ink">
              {entry.business || <span className="font-normal text-ink-soft/60">Add a business</span>}
            </span>
          }
          editValue={entry.business}
          onSave={(raw) => onPatch({ business: raw })}
        />
      </span>

      {/* What it bought, and only that. It used to carry the supplier too,
          which made one field answer two questions and left neither
          readable down a column. */}
      <span className="min-w-0">
        <EditableCell
          displayValue={
            <span className="block truncate text-ink-soft">
              {entry.note || <span className="text-ink-soft/60">Add a description</span>}
            </span>
          }
          editValue={entry.note}
          onSave={(raw) => onPatch({ note: raw })}
        />
      </span>

      {/* Who and how, right-aligned against the amount: they qualify the
          expense rather than identify it. Both stay on one line — "+ who"
          broke over two in a narrow column and read as two controls. */}
      <span className="flex shrink-0 items-center justify-end gap-1.5">
        <EditableCell
          chip
          displayValue={
            entry.staffName ? (
              <AttributeChip icon={<UserRound size={11} />} label={entry.staffName} />
            ) : (
              <AddChip label="who" />
            )
          }
          editValue={String(entry.staffId ?? "")}
          options={[
            { value: "", label: "—" },
            ...staff.map((person) => ({ value: String(person.id), label: person.name })),
          ]}
          onSave={(raw) => onPatch({ staffId: raw ? Number(raw) : null })}
        />
        <EditableCell
          chip
          displayValue={
            entry.paymentMethodName ? (
              <AttributeChip icon={<CreditCard size={11} />} label={entry.paymentMethodName} />
            ) : (
              <AddChip label="how" />
            )
          }
          editValue={String(entry.paymentMethodId ?? "")}
          options={[
            { value: "", label: "—" },
            ...paymentMethods.map((method) => ({ value: String(method.id), label: method.name })),
          ]}
          onSave={(raw) => onPatch({ paymentMethodId: raw ? Number(raw) : null })}
        />
      </span>

      <span className="flex shrink-0 items-center gap-1">
        <span className="w-[6.5rem] text-right text-[15px] font-bold text-ink tabular-nums">
          <EditableCell
            displayValue={<span className="block text-right">{currency(value)}</span>}
            editValue={String(entry.amount)}
            type="number"
            onSave={(raw) => onPatch({ amount: Number(raw) })}
          />
        </span>
        <button
          onClick={onDelete}
          title="Delete this expense"
          aria-label="Delete this expense"
          className="invisible rounded-full p-1.5 text-ink-soft transition group-hover:visible hover:bg-cream/20 hover:text-cream"
        >
          <Trash2 size={13} />
        </button>
      </span>
    </div>
  );
}

/**
 * The date, with the control that changes it.
 *
 * The circle appears on hover and opens the browser's own date picker —
 * a date is picked from a calendar, not typed, and a bare text cell that
 * happened to accept a date was neither. The input sits under the button
 * rather than beside it: `showPicker()` needs a real date input, and one
 * that is only a target would take space on every row for nothing.
 */
function DateCell({
  date,
  onChange,
  onOpen,
}: {
  date: string;
  onChange: (date: string) => void;
  onOpen: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <span className="font-semibold text-ink tabular-nums">{formatOrderDate(date)}</span>
      <span className="relative">
        <button
          onClick={() => input.current?.showPicker()}
          title="Change the date"
          aria-label="Change the date"
          className="invisible rounded-full p-1 text-ink-soft transition group-hover:visible hover:bg-cream/20 hover:text-cream"
        >
          <CalendarDays size={13} />
        </button>
        <input
          ref={input}
          type="date"
          value={date}
          onChange={(event) => event.target.value && onChange(event.target.value)}
          // Present for the picker to anchor to, and no larger than the
          // button it hides behind.
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          tabIndex={-1}
          aria-hidden
        />
      </span>
      {/* Opening the row rides here rather than beside the trash: two
          icons a few pixels apart, one of them destructive, is a mis-click
          waiting to happen. It used to be a column of its own between the
          date and the category, which spent a column and a gutter — most
          of the empty stretch between them — on a hover-only affordance. */}
      <button
        onClick={onOpen}
        title="Open this expense"
        aria-label="Open this expense"
        className="invisible rounded-full p-1 text-ink-soft transition group-hover:visible hover:bg-cream/20 hover:text-cream"
      >
        <Maximize2 size={13} />
      </button>
    </span>
  );
}

function CategoryChip({ name }: { name: string }) {
  return (
    <span className="chip-neutral inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium text-ink-soft">
      <span className="shrink-0">{expenseCategoryIconElement(name)}</span>
      <span className="truncate">{name}</span>
    </span>
  );
}

function AttributeChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="chip-neutral inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold text-ink-soft">
      {icon}
      {label}
    </span>
  );
}

/**
 * The empty half of an attribute — a button rather than a hint, because
 * that is what it is. One line always: "+ who" wrapped onto two in a
 * narrow column and read as two separate controls.
 */
function AddChip({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border border-dashed border-current px-1.5 py-0.5 text-[10px] font-semibold text-ink-soft/60">
      + {label}
    </span>
  );
}
