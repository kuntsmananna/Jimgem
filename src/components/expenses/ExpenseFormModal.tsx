"use client";

import { useState } from "react";
import type { Expense, ExpenseInput } from "@/lib/expenses";
import type { ExpenseCategory, PaymentMethod, StaffAccount } from "@/lib/settings";
import { Receipt, Trash2 } from "lucide-react";
import { LastEdited } from "@/components/LastEdited";
import { UndoRedo } from "@/components/UndoRedo";
import { saveError } from "@/components/saveError";
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
  // A one-off unless it says otherwise: almost every expense is.
  recurring: false,
});

/**
 * The two answers to "does this come back", in the order they are true:
 * almost every expense is a one-off.
 */
const RECURRENCE = [
  { recurring: false, label: "One-off" },
  { recurring: true, label: "Monthly" },
] as const;

/**
 * "1st", "2nd", "23rd" — the day of the month this expense falls on, so
 * the form says what ticking Monthly actually books rather than leaving it
 * to be discovered next month. A day past the 28th is clamped by
 * `sameDayIn` in recurringExpenses.ts where the month is shorter.
 */
function ordinal(date: string): string {
  const day = Number(date.slice(8, 10));
  if (!day) return "same day";
  const teen = day % 100 >= 11 && day % 100 <= 13;
  const suffix = teen ? "th" : ["th", "st", "nd", "rd"][day % 10] ?? "th";
  return `${day}${suffix}`;
}

export function ExpenseFormModal({
  expense,
  categories,
  paymentMethods,
  staff,
  vatRate,
  onClose,
  onSaved,
  onDelete,
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
  /**
   * Delete this expense. Drawn below the breakpoint only: the desktop row
   * carries a trash of its own, revealed on hover, and a phone has no
   * hover and no room on the card for a 20px destructive target.
   */
  onDelete?: () => void;
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
          recurring: expense.recurring,
        }
      : emptyDraft(vatRate),
  );
  const draft = form.value;
  const setDraft = form.set;
  useUndoShortcuts(form.undo, form.redo);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  /*
    Whether Save has been pressed yet.

    The two required fields are marked only after it has. Before that
    nothing is wrong — the form has just been opened, and a category
    outlined in red before anybody has touched it is the form telling
    someone off for not having finished typing.
  */
  const [attempted, setAttempted] = useState(false);

  /*
    What the row cannot be saved without.

    Both are genuine: an expense with no category cannot be reported on at
    all, and one with no amount is not an expense. Everything else on this
    form is optional by design — a receipt from a shop with no name still
    has to be enterable, which is why `business` is free text and why the
    list stopped requiring it.

    This used to be the same condition, written inline in `submit`, that
    silently `return`ed — so pressing Save on a half-filled form did
    nothing at all and said nothing about why.
  */
  const missingCategory = !draft.categoryId;
  const missingAmount = !(draft.amount > 0);

  async function submit() {
    if (missingCategory || missingAmount) {
      setAttempted(true);
      setFailed(null);
      return;
    }
    setBusy(true);
    setFailed(null);
    // Editing sends the version this form was opened on, so a save built
    // on values someone else has since changed is refused rather than
    // written over theirs — see StaleWriteError in orders.ts.
    const response = await fetch(isEdit ? `/api/expenses/${expense.key}` : "/api/expenses", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isEdit ? { ...draft, expectedUpdatedAt: expense.updatedAt } : draft),
    });
    setBusy(false);
    // The popup stays open holding the draft: it is the only copy of
    // this work until it is written somewhere — on a refused save and on
    // a failed one alike.
    const failure = await saveError(response, "expense");
    if (failure) {
      setFailed(failure);
      return;
    }
    onSaved(draft.date);
  }

  return (
    <Modal title={isEdit ? "Edit expense" : "Add expense"} icon={<Receipt size={17} />} onClose={onClose}>
      <div className="fields-lit flex flex-col gap-3">
        <Field label="Date">
          <TextInput
            type="date"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          />
        </Field>
        <Field label="Category" error={attempted && missingCategory ? "Pick a category" : undefined}>
          <SelectInput
            value={draft.categoryId}
            // A red edge on the box as well as the label: the label says
            // which field, the box says where to tap.
            className={attempted && missingCategory ? "border-red-600" : ""}
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
        <Field label="Amount ₪" error={attempted && missingAmount ? "Enter what it cost" : undefined}>
          <TextInput
            type="number"
            value={draft.amount}
            className={attempted && missingAmount ? "border-red-600" : ""}
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
        {/*
          Whether this cost comes back every month.

          Two chips rather than a checkbox, and worded as what the expense
          *is* rather than as a setting being switched on: "One-off" is the
          answer for almost every row, and a lone unticked box reads as
          something left undone. It wears the VAT row's treatment because
          it is the same kind of statement — a fact about the expense that
          the amount cannot tell you.

          Changing it is safe in both directions: ticking it starts the
          series from this row, and unticking the newest row of a series
          ends it without touching the months already booked.
        */}
        <Field label="Repeats">
          <div className="flex flex-wrap items-center gap-1.5">
            {RECURRENCE.map((option) => (
              <button
                key={String(option.recurring)}
                type="button"
                onClick={() => setDraft({ ...draft, recurring: option.recurring })}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  draft.recurring === option.recurring
                    ? "border-black bg-black text-cream"
                    : "border-line text-ink-soft hover:border-ink"
                }`}
              >
                {option.label}
              </button>
            ))}
            {draft.recurring && (
              <span className="text-[11px] text-ink-soft">
                Booked again on the {ordinal(draft.date)} of every month
              </span>
            )}
          </div>
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
        {/* The same row as the order form's: the caption at the left where
            it costs no height, the undo pair and anything the form has to
            say beside it, then Save last in the corner every popup uses.
            The spacer is unconditional because the caption is not. */}
        {/*
          Wrapping below the breakpoint, like the order form's own save
          row. Left unwrapped, this row holds a delete button, the "last
          edited" caption, the undo pair and two buttons in about 310px,
          and the caption — a `<p>`, so it shrinks to its longest word —
          was squeezed into five lines.
        */}
        <div className="mt-2 flex items-center gap-2 max-md:flex-wrap max-md:gap-y-2">
          {/* First in the row and so as far from Save as it goes — where
              the client card puts Archive, for the same reason. */}
          {isEdit && onDelete && (
            <button
              onClick={onDelete}
              title="Delete this expense"
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft md:hidden"
            >
              <Trash2 size={13} />
              Delete
            </button>
          )}
          {isEdit && <LastEdited at={expense.updatedAt} by={expense.updatedBy} />}
          <UndoRedo form={form} />
          {failed && (
            <span className="text-xs font-semibold text-red-700" role="alert">
              {failed}
            </span>
          )}
          {/* The same sentence the order form uses for its one required
              field, so a blocked save says why in the place the eye is
              already going — beside the button that did not work. */}
          {attempted && (missingCategory || missingAmount) && !failed && (
            <span className="text-xs font-semibold text-red-700" role="alert">
              {missingCategory && missingAmount
                ? "Add a category and an amount to save"
                : missingCategory
                  ? "Pick a category to save"
                  : "Add an amount to save"}
            </span>
          )}
          <span className="flex-1 max-md:basis-full" />
          <button
            onClick={onClose}
            className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-ink max-md:flex-1 max-md:py-2.5 max-md:text-sm"
          >
            Cancel
          </button>
          {/*
            Never disabled for a missing field. A greyed-out Save is the
            other way to block a form, and it is the worse one: it stops
            the press that would have explained itself, so the answer to
            "why can't I save" is that nothing happens at all — which is
            exactly what this form did before.
          */}
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-full bg-black px-4 py-1.5 text-xs font-semibold text-cream disabled:opacity-50 max-md:flex-1 max-md:py-2.5 max-md:text-sm"
          >
            {isEdit ? "Save" : "Save expense"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
