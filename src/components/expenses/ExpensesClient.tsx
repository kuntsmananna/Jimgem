"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Expense, ExpensePeriod } from "@/lib/expenses";
import type { ExpenseCategory, PaymentMethod, StaffAccount } from "@/lib/settings";
import { DonutChart, type DonutSlice } from "@/components/charts/DonutChart";
import { EXPENSE_PALETTE } from "@/lib/chartPalette";
import { CreditCard, Plus, Trash2, UserRound } from "lucide-react";
import { expenseCategoryIconElement } from "@/lib/icons";
import { formatOrderDate } from "@/lib/orderTypes";
import { EditableCell } from "@/components/orders/EditableCell";
import { FilterDropdown } from "@/components/orders/Dropdown";
import { ExpenseFormModal } from "./ExpenseFormModal";
import { useVatView } from "@/components/VatViewContext";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currency = (n: number) => `₪${nf.format(n)}`;

export function ExpensesClient({
  periods,
  categories,
  paymentMethods,
  staff,
  vatRate,
}: {
  periods: ExpensePeriod[];
  categories: ExpenseCategory[];
  paymentMethods: PaymentMethod[];
  staff: StaffAccount[];
  /** Today's VAT rate, stamped onto a new expense. */
  vatRate: number;
}) {
  const router = useRouter();
  const defaultPeriod = periods.find((p) => p.key !== "general" && p.entries.length > 0)?.key ?? periods[0]?.key;
  const [selectedKey, setSelectedKey] = useState<string>(defaultPeriod ?? "general");
  const [adding, setAdding] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  /** Empty means every category — the same default the Orders filters use. */
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());

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
        note: entry.note,
        vatMode: entry.vatMode,
        vatRate: entry.vatRate,
        ...change,
      }),
    });
    refresh();
  }

  return (
    // The breakdown pane gives up width to the list: a donut reads fine
    // small, and the list is where every column had to fight for room.
    <div className="grid grid-cols-[200px_2.2fr_0.85fr] gap-6">
      <section className="min-w-0 rounded-card border border-line bg-card p-4">
        <h2 className="px-2 font-display text-base font-bold text-ink">Periods</h2>
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
                {p.isLegacy && (
                  <span className={`text-[10px] font-bold ${selectedKey === p.key ? "text-cream/70" : "text-ink-soft"}`}>
                    legacy
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="min-w-0 rounded-card border border-line bg-card p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="font-display text-lg font-bold text-ink">{period?.label}</h2>
            {/* Which convention these figures are in, beside them rather
                than in a settings pane — the switch is in the nav and its
                effect is here. */}
            <span className="text-[11px] font-semibold text-ink-soft">{vatLabel}</span>
            <span className="text-sm font-semibold text-ink tabular-nums">{currency(total)}</span>
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

        {period?.isLegacy && (
          <p className="mt-2 rounded-lg bg-tile-peach px-3 py-2 text-xs font-medium text-ink">
            Legacy month — the Sheet has no per-item date or description, so these are shown by category and
            amount only.
          </p>
        )}

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
              onOpen={() => entry.editable && setEditingKey(entry.key)}
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

      <section className="min-w-0 rounded-card border border-line bg-card p-6">
        <h2 className="font-display text-base font-bold text-ink">Category breakdown</h2>
        <div className="mt-4">
          <DonutChart slices={slices} />
        </div>
      </section>
    </div>
  );
}

/**
 * One expense, as columns rather than a run of text.
 *
 * The order is what the eye needs in the order it needs it: **when**, in
 * what **category**, then **what it was for** — which is the line's
 * subject and is set larger and darker than anything around it. Who paid
 * and how ride right, just before the amount, because they qualify the
 * expense rather than identify it; both are chips with an icon, so they
 * read as attributes at a glance instead of two more strings.
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
  const editable = entry.editable;

  return (
    <div
      onClick={(event) => {
        // Only a click on the row itself opens it — the inline editors and
        // the trash are interactive elements of their own, and swallowing
        // their clicks here would make editing a field open a popup over it.
        if ((event.target as HTMLElement).closest("button, input, select, a")) return;
        onOpen();
      }}
      className={`hover-line group grid min-w-0 grid-cols-[3.2rem_9rem_1fr_auto_6.5rem_1.5rem] items-center gap-3 rounded-xl border border-line px-3 py-2 text-sm ${
        editable ? "cursor-pointer" : ""
      }`}
    >
      {/* No year: the app works one season at a time, and the year on
          every row is noise repeated down the column. */}
      <span className="shrink-0 text-xs text-ink-soft tabular-nums">
        {entry.source === "db" ? formatOrderDate(entry.date) : "—"}
      </span>

      {/* A chip, because a category is a class the row belongs to rather
          than a value it holds — the same reasoning the order type chip
          follows on the Orders table. */}
      <span className="min-w-0">
        {editable ? (
          <EditableCell
            displayValue={<CategoryChip name={entry.categoryName} />}
            editValue={String(entry.categoryId ?? "")}
            options={categories.map((category) => ({ value: String(category.id), label: category.name }))}
            onSave={(raw) => onPatch({ categoryId: Number(raw) })}
          />
        ) : (
          <CategoryChip name={entry.categoryName} />
        )}
      </span>

      {/* The subject of the line, and the one thing that says what this
          expense actually was. Everything else on the row qualifies it. */}
      <span className="min-w-0">
        {editable ? (
          <EditableCell
            displayValue={
              <span className="block truncate font-semibold text-ink">
                {entry.note || <span className="font-normal text-ink-soft/60">Add a description</span>}
              </span>
            }
            editValue={entry.note}
            onSave={(raw) => onPatch({ note: raw })}
          />
        ) : (
          <span
            className={`block truncate ${entry.noteUnverified ? "text-ink-soft/70 italic" : "font-semibold text-ink"}`}
            title={
              (entry.noteUnverified
                ? "Best-effort match from a Sheet comment — not verified, double-check before relying on it. "
                : "") + entry.note
            }
          >
            {entry.note || "—"}
            {entry.noteUnverified && <span className="ml-1 font-semibold not-italic">(unverified)</span>}
          </span>
        )}
      </span>

      {/* Who and how, right-aligned against the amount: they qualify the
          expense rather than identify it, so they sit closest to the
          number and read as attributes, not as more text. */}
      <span className="flex shrink-0 items-center justify-end gap-1.5">
        {editable ? (
          <>
            {/* Both editable in place, and both offer a blank: an expense
                can genuinely have no staff and no recorded method, and a
                picker that cannot be emptied makes a guess permanent. */}
            <EditableCell
              displayValue={
                entry.staffName ? (
                  <AttributeChip icon={<UserRound size={11} />} label={entry.staffName} />
                ) : (
                  <span className="text-[10px] text-ink-soft/50 group-hover:text-cream/60">+ who</span>
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
              displayValue={
                entry.paymentMethodName ? (
                  <AttributeChip icon={<CreditCard size={11} />} label={entry.paymentMethodName} />
                ) : (
                  <span className="text-[10px] text-ink-soft/50 group-hover:text-cream/60">+ how</span>
                )
              }
              editValue={String(entry.paymentMethodId ?? "")}
              options={[
                { value: "", label: "—" },
                ...paymentMethods.map((method) => ({ value: String(method.id), label: method.name })),
              ]}
              onSave={(raw) => onPatch({ paymentMethodId: raw ? Number(raw) : null })}
            />
          </>
        ) : (
          <>
            {entry.staffName && <AttributeChip icon={<UserRound size={11} />} label={entry.staffName} />}
            {entry.paymentMethodName && (
              <AttributeChip icon={<CreditCard size={11} />} label={entry.paymentMethodName} />
            )}
          </>
        )}
        {entry.source === "sheet" && (
          <span className="keeps-color shrink-0 rounded-full bg-tile-peach px-1.5 py-0.5 text-[10px] font-bold text-ink">
            sheet
          </span>
        )}
      </span>

      <span className="text-right font-semibold text-ink tabular-nums">
        {editable ? (
          <EditableCell
            displayValue={<span className="block text-right">{currency(value)}</span>}
            editValue={String(entry.amount)}
            type="number"
            onSave={(raw) => onPatch({ amount: Number(raw) })}
          />
        ) : (
          currency(value)
        )}
      </span>

      {/* Inside the row, in its own column, so the amounts above and below
          stay in line whether or not a row is hovered. The icon alone —
          on a trash can, the word is the icon. */}
      <span className="flex justify-end">
        {editable && (
          <button
            onClick={onDelete}
            title="Delete this expense"
            aria-label="Delete this expense"
            className="hidden text-ink-soft transition hover:text-ink group-hover:block"
          >
            <Trash2 size={13} />
          </button>
        )}
      </span>
    </div>
  );
}

function CategoryChip({ name }: { name: string }) {
  return (
    <span className="chip-neutral inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-black/5 px-2 py-0.5 text-xs font-semibold text-ink">
      <span className="shrink-0 text-ink-soft">{expenseCategoryIconElement(name)}</span>
      <span className="truncate">{name}</span>
    </span>
  );
}

function AttributeChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="chip-neutral inline-flex shrink-0 items-center gap-1 rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold text-ink-soft">
      {icon}
      {label}
    </span>
  );
}
