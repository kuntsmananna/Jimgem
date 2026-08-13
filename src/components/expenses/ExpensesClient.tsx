"use client";

import { createElement, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Expense, ExpensePeriod } from "@/lib/expenses";
import type { ExpenseCategory, PaymentMethod, StaffAccount } from "@/lib/settings";
import { DonutChart, type DonutSlice } from "@/components/charts/DonutChart";
import { EXPENSE_PALETTE } from "@/lib/chartPalette";
import { Plus, Trash2 } from "lucide-react";
import { expenseCategoryIcon } from "@/lib/icons";
import { ExpenseFormModal } from "./ExpenseFormModal";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currency = (n: number) => `₪${nf.format(n)}`;

export function ExpensesClient({
  periods,
  categories,
  paymentMethods,
  staff,
}: {
  periods: ExpensePeriod[];
  categories: ExpenseCategory[];
  paymentMethods: PaymentMethod[];
  staff: StaffAccount[];
}) {
  const router = useRouter();
  const defaultPeriod = periods.find((p) => p.key !== "general" && p.entries.length > 0)?.key ?? periods[0]?.key;
  const [selectedKey, setSelectedKey] = useState<string>(defaultPeriod ?? "general");
  const [adding, setAdding] = useState(false);

  const period = periods.find((p) => p.key === selectedKey) ?? periods[periods.length - 1];

  const slices: DonutSlice[] = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const entry of period?.entries ?? []) {
      totals[entry.categoryName] = (totals[entry.categoryName] ?? 0) + entry.amount;
    }
    return Object.entries(totals).map(([label, value], i) => ({
      label,
      value,
      color: EXPENSE_PALETTE[i % EXPENSE_PALETTE.length],
    }));
  }, [period]);

  function refresh() {
    router.refresh();
  }

  async function deleteEntry(key: string) {
    if (!confirm("Delete this expense?")) return;
    await fetch(`/api/expenses/${key}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="grid grid-cols-[220px_1.6fr_1fr] gap-6">
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
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">{period?.label}</h2>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-cream"
          >
            <Plus size={13} />
            Add expense
          </button>
        </div>

        {period?.isLegacy && (
          <p className="mt-2 rounded-lg bg-tile-peach px-3 py-2 text-xs font-medium text-ink">
            Legacy month — the Sheet has no per-item date or description, so these are shown by category and
            amount only.
          </p>
        )}

        {adding && (
          <ExpenseFormModal
            categories={categories}
            paymentMethods={paymentMethods}
            staff={staff}
            onClose={() => setAdding(false)}
            onSaved={(date) => {
              setAdding(false);
              setSelectedKey(date.slice(0, 7));
              refresh();
            }}
          />
        )}

        <div className="mt-4 flex flex-col gap-1.5">
          {period?.entries.map((entry) => (
            <ExpenseRow key={entry.key} entry={entry} onDelete={() => deleteEntry(entry.key)} />
          ))}
          {period?.entries.length === 0 && (
            <p className="text-sm text-ink-soft">No expenses logged for this period yet.</p>
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

/*
 * createElement rather than `const Icon = …; <Icon />`: the icon is
 * selected from a fixed lookup table, not constructed, but the JSX form
 * is indistinguishable from defining a component mid-render and trips
 * react-hooks/static-components.
 */
function CategoryIcon({ name }: { name: string }) {
  return createElement(expenseCategoryIcon(name), { size: 13, className: "shrink-0 text-ink-soft" });
}

function ExpenseRow({ entry, onDelete }: { entry: Expense; onDelete: () => void }) {
  return (
    <div className="hover-line group flex min-w-0 items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-sm">
      <div className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden">
        <span className="shrink-0 w-20 text-ink-soft">{entry.source === "db" ? entry.date : "—"}</span>
        <span className="flex shrink-0 items-center gap-1.5 font-medium text-ink">
          <CategoryIcon name={entry.categoryName} />
          {entry.categoryName}
        </span>
        {entry.paymentMethodName && <span className="shrink-0 text-xs text-ink-soft">{entry.paymentMethodName}</span>}
        {entry.staffName && <span className="shrink-0 text-xs text-ink-soft">{entry.staffName}</span>}
        {entry.note && (
          <span
            className={`min-w-0 truncate text-xs ${entry.noteUnverified ? "italic text-ink-soft/70" : "text-ink-soft"}`}
            title={
              (entry.noteUnverified
                ? "Best-effort match from a Sheet comment — not verified, double-check before relying on it. "
                : "") + entry.note
            }
          >
            {entry.note}
            {entry.noteUnverified && <span className="ml-1 font-semibold not-italic">(unverified)</span>}
          </span>
        )}
        {entry.source === "sheet" && (
          <span className="keeps-color shrink-0 rounded-full bg-tile-peach px-1.5 py-0.5 text-[10px] font-bold text-ink">
            sheet
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="font-semibold text-ink">{currency(entry.amount)}</span>
        {entry.editable && (
          <button
            onClick={onDelete}
            className="hidden items-center gap-1 text-xs font-semibold text-ink-soft hover:text-ink group-hover:flex"
          >
            <Trash2 size={12} />
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
