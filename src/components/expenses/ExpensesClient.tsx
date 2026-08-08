"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Expense, ExpenseInput, ExpensePeriod } from "@/lib/expenses";
import type { ExpenseCategory, PaymentMethod, StaffAccount } from "@/lib/settings";
import { DonutChart, type DonutSlice } from "@/components/charts/DonutChart";
import { EXPENSE_PALETTE } from "@/lib/chartPalette";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currency = (n: number) => `₪${nf.format(n)}`;

const emptyDraft = (): ExpenseInput => ({
  date: new Date().toISOString().slice(0, 10),
  categoryId: 0,
  amount: 0,
  paymentMethodId: null,
  staffId: null,
  note: "",
});

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
  const [draft, setDraft] = useState<ExpenseInput>(emptyDraft());
  const [busy, setBusy] = useState(false);

  const period = periods.find((p) => p.key === selectedKey) ?? periods[periods.length - 1];

  const categoryNameById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const paymentMethodNameById = useMemo(() => new Map(paymentMethods.map((m) => [m.id, m.name])), [paymentMethods]);
  const staffNameById = useMemo(() => new Map(staff.map((s) => [s.id, s.name])), [staff]);

  const slices: DonutSlice[] = useMemo(() => {
    const totals: Record<string, number> = { ...(period?.legacyTotals?.byCategory ?? {}) };
    for (const entry of period?.entries ?? []) {
      const name = categoryNameById.get(entry.categoryId) ?? "Other";
      totals[name] = (totals[name] ?? 0) + entry.amount;
    }
    return Object.entries(totals).map(([label, value], i) => ({
      label,
      value,
      color: EXPENSE_PALETTE[i % EXPENSE_PALETTE.length],
    }));
  }, [period, categoryNameById]);

  function refresh() {
    router.refresh();
  }

  async function submitNew() {
    if (!draft.categoryId || draft.amount <= 0) return;
    setBusy(true);
    await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setDraft(emptyDraft());
    setAdding(false);
    setBusy(false);
    refresh();
  }

  async function deleteEntry(id: number) {
    if (!confirm("Delete this expense?")) return;
    await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="grid grid-cols-[220px_1.6fr_1fr] gap-6">
      <section className="rounded-card border border-line bg-card p-4">
        <h2 className="px-2 font-display text-base font-bold text-ink">Periods</h2>
        <ul className="mt-2 flex flex-col gap-1">
          {periods.map((p) => (
            <li key={p.key}>
              <button
                onClick={() => setSelectedKey(p.key)}
                className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm ${
                  selectedKey === p.key ? "bg-black text-cream" : "text-ink hover:bg-black/5"
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

      <section className="rounded-card border border-line bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">{period?.label}</h2>
          <button
            onClick={() => setAdding((v) => !v)}
            className="rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-cream"
          >
            {adding ? "Cancel" : "+ Add expense"}
          </button>
        </div>

        {period?.isLegacy && (
          <p className="mt-2 rounded-lg bg-tile-peach px-3 py-2 text-xs font-medium text-ink">
            Legacy month — only a per-category total is available from the Sheet, no itemized entries.
          </p>
        )}

        {adding && (
          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-cream/50 p-4">
            <Field label="Date">
              <input
                type="date"
                className="input"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </Field>
            <Field label="Category">
              <select
                className="input"
                value={draft.categoryId}
                onChange={(e) => setDraft({ ...draft, categoryId: Number(e.target.value) })}
              >
                <option value={0}>Select…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount ₪">
              <input
                type="number"
                className="input w-24"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })}
              />
            </Field>
            <Field label="Payment method">
              <select
                className="input"
                value={draft.paymentMethodId ?? ""}
                onChange={(e) => setDraft({ ...draft, paymentMethodId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">—</option>
                {paymentMethods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Staff">
              <select
                className="input"
                value={draft.staffId ?? ""}
                onChange={(e) => setDraft({ ...draft, staffId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">—</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Note">
              <input className="input" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
            </Field>
            <button
              onClick={submitNew}
              disabled={busy}
              className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-cream disabled:opacity-50"
            >
              Save
            </button>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-1.5">
          {period?.entries.map((entry) => (
            <ExpenseRow
              key={entry.id}
              entry={entry}
              categoryName={categoryNameById.get(entry.categoryId) ?? "—"}
              paymentMethodName={entry.paymentMethodId ? paymentMethodNameById.get(entry.paymentMethodId) : undefined}
              staffName={entry.staffId ? staffNameById.get(entry.staffId) : undefined}
              onDelete={() => deleteEntry(entry.id)}
            />
          ))}
          {period?.entries.length === 0 && !period.isLegacy && (
            <p className="text-sm text-ink-soft">No expenses logged for this period yet.</p>
          )}
        </div>
      </section>

      <section className="rounded-card border border-line bg-card p-6">
        <h2 className="font-display text-base font-bold text-ink">Category breakdown</h2>
        <div className="mt-4">
          <DonutChart slices={slices} />
        </div>
      </section>
    </div>
  );
}

function ExpenseRow({
  entry,
  categoryName,
  paymentMethodName,
  staffName,
  onDelete,
}: {
  entry: Expense;
  categoryName: string;
  paymentMethodName?: string;
  staffName?: string;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm">
      <div className="flex items-center gap-4">
        <span className="w-20 text-ink-soft">{entry.date}</span>
        <span className="font-medium text-ink">{categoryName}</span>
        {paymentMethodName && <span className="text-xs text-ink-soft">{paymentMethodName}</span>}
        {staffName && <span className="text-xs text-ink-soft">{staffName}</span>}
        {entry.note && <span className="text-xs text-ink-soft">{entry.note}</span>}
      </div>
      <div className="flex items-center gap-3">
        <span className="font-semibold text-ink">{currency(entry.amount)}</span>
        <button onClick={onDelete} className="hidden text-xs font-semibold text-ink-soft hover:text-ink group-hover:block">
          Delete
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
      {label}
      {children}
    </label>
  );
}
