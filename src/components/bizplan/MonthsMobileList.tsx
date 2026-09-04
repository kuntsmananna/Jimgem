"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { MonthlyFinancials } from "@/lib/financials";
import { Figure } from "@/components/Figure";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currency = (n: number) => `₪${nf.format(n)}`;

/**
 * Which month opens on arrival.
 *
 * The current one, because that is the month being worked and the figure
 * anyone opening this page on a phone came for. When it carries no
 * activity yet — `getYearlyFinancials` only returns months with revenue or
 * expenses, so early in a month there may be no row at all — the most
 * recent month opens instead, which beats arriving at a page where every
 * card is shut.
 *
 * Safe to read the clock here: this component is only ever mounted on the
 * client (the server renders the desktop table), so there is no render to
 * disagree with.
 */
function defaultOpenMonth(months: MonthlyFinancials[]): number | null {
  const now = new Date().getMonth() + 1;
  return months.find((m) => m.month === now)?.month ?? months.at(-1)?.month ?? null;
}

/**
 * The year on a phone: one card per month, opening to its detail.
 *
 * The desktop table is seven columns at `min-w-[720px]`, so on a 390px
 * screen reading one month means dragging the page twice its own width
 * sideways. A card carries the month and its profit — the two things the
 * year is scanned for — and **folds the rest behind a tap**: revenue,
 * expenses, margin, orders and units are what you go looking for once a
 * month has caught your eye, not what you scan twelve rows of.
 *
 * The chevron is what says so. Without it a card that happens to open is
 * indistinguishable from one that does nothing, which is the same reason
 * the Settings rows gained `.taps-to-edit`.
 *
 * Rendered from the same `tableRows` array the table takes, so this is a
 * *renderer* and not a second filtering path — "Hide months with no data"
 * keeps working without knowing this exists.
 */
export function MonthsMobileList({ months }: { months: MonthlyFinancials[] }) {
  const [openMonth, setOpenMonth] = useState<number | null>(() => defaultOpenMonth(months));

  if (months.length === 0) {
    return <p className="px-1 py-6 text-sm text-ink-soft">No data yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {months.map((m) => {
        const open = openMonth === m.month;
        const margin = m.revenue > 0 ? (m.profit / m.revenue) * 100 : 0;
        return (
          <div key={m.month} className="rounded-card border border-line bg-cream/40">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenMonth(open ? null : m.month)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left"
            >
              <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">
                {m.monthLabel}
              </span>
              {/*
                Red when negative. The desktop table colours nothing and
                does not need to — in a column of right-aligned currency a
                minus sign is unmissable — but on a card it is one
                character in a line of prose, and a loss is the one thing
                on this page nobody should scroll past. The colour is the
                one the Dashboard's KPI delta already uses for it.
              */}
              <span
                className={`shrink-0 text-[15px] font-bold tabular-nums ${
                  m.profit < 0 ? "text-red-700" : "text-ink"
                }`}
              >
                {currency(m.profit)}
              </span>
              <ChevronDown
                size={16}
                aria-hidden
                className={`shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>

            {open && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line/60 px-4 py-3 text-xs">
                <Figure label="Revenue" value={currency(m.revenue)} />
                <Figure label="Expenses" value={currency(m.expenses)} />
                <Figure label="Margin" value={`${margin.toFixed(0)}%`} />
                <Figure label="Orders" value={nf.format(m.orderCount)} />
                <Figure label="Units sold" value={nf.format(m.unitsSold)} />
              </dl>
            )}
          </div>
        );
      })}
    </div>
  );
}
