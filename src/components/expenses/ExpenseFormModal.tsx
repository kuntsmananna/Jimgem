"use client";

import { useState } from "react";
import type { Expense, ExpenseInput } from "@/lib/expenses";
import type { ExpenseCategory, PaymentMethod, StaffAccount } from "@/lib/settings";
import { Redo2, Undo2 } from "lucide-react";
import { LastEdited } from "@/components/LastEdited";
import { Modal } from "@/components/Modal";
import { useUndoable, useUndoShortcuts } from "@/components/useUndoable";
import { Field, TextInput, SelectInput } from "@/components/Field";
import { VAT_MODES, vatOn } from "@/lib/orderTypes";

const emptyDraft = (vatRate: number): ExpenseInput => ({
  date: new Date().toISOString().slice(0, 10),
  categoryId: 0,
  amount: 0,
  paymentMethodId: null,
  staffId: null,
  business: "",
  note: "",
  // Most receipts come from registered suppliers with VAT already inside
  // the price. The ones that don't are why this is a field.
  vatMode: "included",
  vatRate,
});

export function ExpenseFormModal({
  expense,
  categories,
  paymentMethods,
  staff,
  vatRate,
  onClose,
  onSaved,
}: {
  /** Omit to add a new expense, pass one to edit it. */
  expense?: Expense;
  categories: ExpenseCategory[];
  paymentMethods: PaymentMethod[];
  staff: StaffAccount[];
  /** Today's rate, copied onto the expense — see ExpenseInput.vatRate. */
  vatRate: number;
  onClose: () => void;
  /** Called with the expense's date on success, so the caller can jump to that period. */
  onSaved: (date: string) => void;
}) {
  const isEdit = !!expense;
  const form = useUndoable<ExpenseInput>(
    expense
      ? {
          date: expense.date,
          categoryId: expense.categoryId ?? 0,
          amount: expense.amount,
          paymentMethodId: expense.paymentMethodId,
          staffId: expense.staffId,
          business: expense.business,
          note: expense.note,
          vatMode: expense.vatMode,
          // The rate it was recorded at, not today's — the same
          // copy-not-link rule the order form follows.
          vatRate: expense.vatRate,
        }
      : emptyDraft(vatRate),
  );
  const draft = form.value;
  const setDraft = form.set;
  useUndoShortcuts(form.undo, form.redo);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);

  async function submit() {
    if (!draft.categoryId || draft.amount <= 0) return;
    setBusy(true);
    setConflict(null);
    // Editing sends the version this form was opened on, so a save built
    // on values someone else has since changed is refused rather than
    // written over theirs — see StaleWriteError in orders.ts.
    const response = await fetch(isEdit ? `/api/expenses/${expense.key}` : "/api/expenses", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isEdit ? { ...draft, expectedUpdatedAt: expense.updatedAt } : draft),
    });
    setBusy(false);
    if (response.status === 409) {
      // The popup stays open holding the draft: it is the only copy of
      // this work until it is written somewhere.
      setConflict(((await response.json()) as { error?: string }).error ?? "Someone else changed this expense.");
      return;
    }
    onSaved(draft.date);
  }

  return (
    <Modal title={isEdit ? "Edit expense" : "Add expense"} onClose={onClose}>
      <div className="fields-lit flex flex-col gap-3">
        <Field label="Date">
          <TextInput
            type="date"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          />
        </Field>
        <Field label="Category">
          <SelectInput
            value={draft.categoryId}
            onChange={(e) => setDraft({ ...draft, categoryId: Number(e.target.value) })}
          >
            <option value={0}>Select…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Amount ₪">
          <TextInput
            type="number"
            value={draft.amount}
            onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })}
          />
        </Field>
        {/* What the amount above already contains. A receipt from an
            unregistered supplier carries no VAT, and nothing about the
            number says so — which is why the report cannot strip VAT from
            a period without being told row by row. */}
        <Field label="VAT">
          <div className="flex flex-wrap items-center gap-1.5">
            {VAT_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                title={mode.hint}
                onClick={() => setDraft({ ...draft, vatMode: mode.id })}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  draft.vatMode === mode.id
                    ? "border-black bg-black text-cream"
                    : "border-line text-ink-soft hover:border-ink"
                }`}
              >
                {mode.label}
              </button>
            ))}
            {draft.amount > 0 && draft.vatMode !== "exempt" && (
              <span className="text-[11px] text-ink-soft">
                ₪{vatOn(draft.amount, draft.vatMode, draft.vatRate).net.toLocaleString()} before VAT
              </span>
            )}
          </div>
        </Field>
        <Field label="Payment method">
          <SelectInput
            value={draft.paymentMethodId ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                paymentMethodId: e.target.value ? Number(e.target.value) : null,
              })
            }
          >
            <option value="">—</option>
            {paymentMethods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Staff">
          <SelectInput
            value={draft.staffId ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                staffId: e.target.value ? Number(e.target.value) : null,
              })
            }
          >
            <option value="">—</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        {/* Who took the money, and what it bought — two questions, so two
            fields. The description used to answer both, which left the
            supplier buried mid-sentence and unsearchable. */}
        <Field label="Business">
          <TextInput
            value={draft.business}
            onChange={(e) => setDraft({ ...draft, business: e.target.value })}
          />
        </Field>
        <Field label="Description">
          <TextInput value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
        </Field>
        {/* Right-aligned, Save last — the same corner every popup uses. */}
        <div className="mt-2 flex items-center justify-end gap-2">
          {/* Same pair as the order form, in the same corner of the row. */}
          <span className="mr-auto flex items-center gap-0.5">
            <button
              onClick={form.undo}
              disabled={!form.canUndo}
              title="Undo (⌘Z)"
              aria-label="Undo"
              className="rounded-full p-1.5 text-ink-soft transition hover:bg-black/5 hover:text-ink disabled:opacity-25 disabled:hover:bg-transparent"
            >
              <Undo2 size={14} />
            </button>
            <button
              onClick={form.redo}
              disabled={!form.canRedo}
              title="Redo (⇧⌘Z)"
              aria-label="Redo"
              className="rounded-full p-1.5 text-ink-soft transition hover:bg-black/5 hover:text-ink disabled:opacity-25 disabled:hover:bg-transparent"
            >
              <Redo2 size={14} />
            </button>
          </span>
          {conflict && (
            <span className="text-xs font-semibold text-red-700" role="alert">
              {conflict}
            </span>
          )}
          <button
            onClick={onClose}
            className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-ink"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-full bg-black px-4 py-1.5 text-xs font-semibold text-cream disabled:opacity-50"
          >
            {isEdit ? "Save" : "Save expense"}
          </button>
        </div>
        {isEdit && <LastEdited at={expense.updatedAt} by={expense.updatedBy} />}
      </div>
    </Modal>
  );
}
