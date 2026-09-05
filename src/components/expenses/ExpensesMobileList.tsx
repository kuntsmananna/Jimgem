"use client";

import type { Expense } from "@/lib/expenses";
import { expenseCategoryIconElement } from "@/lib/icons";
import { formatOrderDate } from "@/lib/orderTypes";
import { currencyExact } from "@/lib/money";

/**
 * The Expenses list on a phone: one card per expense.
 *
 * The desktop row is a six-column template about 34rem wide with three
 * hover-revealed controls in it, none of which a phone can reach. A card
 * carries the four things an expense is scanned for — who took the money,
 * what class of thing it was, when, and how much — and **everything else
 * is behind a tap**: the staff member, the payment method, the VAT mode
 * and the delete all live in the record.
 *
 * The business leads because it is the row's subject: an expense is
 * remembered as "the tray supplier", not as "Packaging". The description
 * follows it, quieter, on the second line beside the date.
 *
 * **A row with no business is led by its description instead.** Half the
 * imported back catalogue has none — `expenses.business` was added late and
 * deliberately back-fills nothing — so a literal reading put "No business
 * yet" in bold at the top of card after card, announcing an absence in the
 * one position the card has for a subject while the line that says what was
 * actually bought sat quiet underneath it. The note is only repeated below
 * when the business is what led.
 *
 * No inline editing, the same rule the Orders cards follow: ten cells that
 * edit in place on a laptop are announced by a hover a phone cannot
 * perform, so the whole card opens the expense instead.
 */
export function ExpensesMobileList({
  entries,
  amountOf,
  onOpen,
  emptyNote,
}: {
  /** Already searched and filtered — the same array the desktop rows take. */
  entries: Expense[];
  /** The amount in the current VAT convention — see `useVatView`. */
  amountOf: (entry: Expense) => number;
  onOpen: (key: string) => void;
  emptyNote: string;
}) {
  if (entries.length === 0) {
    return <p className="px-1 py-6 text-sm text-ink-soft">{emptyNote}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry) => (
        <button
          key={entry.key}
          onClick={() => onOpen(entry.key)}
          className="w-full rounded-card border border-line bg-card px-4 py-3 text-left"
        >
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 truncate text-[15px] font-bold">
              {entry.business || entry.note || (
                <span className="font-semibold text-ink-soft/60">Untitled expense</span>
              )}
            </p>
            {/* The category as a chip, because it is a class the expense
                belongs to rather than a value it holds — the same
                reasoning the desktop row and the Orders type chip
                follow. */}
            <span className="chip-neutral flex shrink-0 items-center gap-1.5 rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-medium text-ink-soft">
              <span className="shrink-0">{expenseCategoryIconElement(entry.categoryName)}</span>
              {entry.categoryName}
            </span>
          </div>

          <div className="mt-2 flex items-baseline gap-2 text-xs text-ink-soft">
            {/* No year: the period picker above says which one, and
                repeating it on every card is noise down the list. */}
            <span className="shrink-0 tabular-nums">{formatOrderDate(entry.date)}</span>
            {/* Only where the business led — otherwise this is the very
                line already set as the subject above. */}
            {entry.business && entry.note && (
              <span className="min-w-0 flex-1 truncate">{entry.note}</span>
            )}
            <span className="flex-1" />
            <span className="shrink-0 text-sm font-bold text-ink tabular-nums">
              {currencyExact(amountOf(entry))}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
