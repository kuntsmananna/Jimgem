"use client";

import { useState } from "react";
import type { ExpenseInput } from "@/lib/expenses";
import type { ExpenseCategory, PaymentMethod, StaffAccount } from "@/lib/settings";
import { Modal } from "@/components/Modal";

const emptyDraft = (): ExpenseInput => ({
  date: new Date().toISOString().slice(0, 10),
  categoryId: 0,
  amount: 0,
  paymentMethodId: null,
  staffId: null,
  note: "",
});

export function ExpenseFormModal({
  categories,
  paymentMethods,
  staff,
  onClose,
  onSaved,
}: {
  categories: ExpenseCategory[];
  paymentMethods: PaymentMethod[];
  staff: StaffAccount[];
  onClose: () => void;
  /** Called with the expense's date on success, so the caller can jump to that period. */
  onSaved: (date: string) => void;
}) {
  const [draft, setDraft] = useState<ExpenseInput>(emptyDraft());
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!draft.categoryId || draft.amount <= 0) return;
    setBusy(true);
    await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setBusy(false);
    onSaved(draft.date);
  }

  return (
    <Modal title="Add expense" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label="Date">
          <input
            type="date"
            className="input"
            placeholder=" "
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
            className="input"
            placeholder=" "
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
        <div className="mt-2 flex gap-2">
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-full bg-black px-4 py-1.5 text-xs font-semibold text-cream disabled:opacity-50"
          >
            Save expense
          </button>
          <button onClick={onClose} className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-ink">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
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
