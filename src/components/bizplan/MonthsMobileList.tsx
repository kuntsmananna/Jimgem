"use client";

import type { MonthlyFinancials } from "@/lib/financials";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currency = (n: number) => `₪${nf.format(n)}`;

/**
 * The year on a phone: one card per month.
 *
 * The desktop table is seven columns at `min-w-[720px]` inside an
 * `overflow-x-auto`, so on a 390px screen reading one month means dragging
 * the page twice its own width sideways. A card carries the same seven
 * figures with nothing hidden behind a tap — this page is a report, so
 * folding a column into a record the way the Orders card does would leave
 * the figure unreachable rather than one press away.
 *
 * **Profit leads on the month's own line**, because it is what the page is
 * read for, with the margin beside it as a chip; revenue, expenses, orders
 * and units follow in a quieter labelled grid.
 *
 * Rendered from the same `tableRows` array the table takes, so this is a
 * *renderer* and not a second filtering path — "Hide months with no data"
 * keeps working without knowing this exists.
 */
export function MonthsMobileList({ months }: { months: MonthlyFinancials[] }) {
  if (months.length === 0) {
    return <p className="px-1 py-6 text-sm text-ink-soft">No data yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {months.map((m) => {
        const margin = m.revenue > 0 ? (m.profit / m.revenue) * 100 : 0;
        return (
          <div key={m.month} className="rounded-card border border-line bg-cream/40 px-4 py-3">
            <div className="flex items-baseline gap-2">
              <p className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">{m.monthLabel}</p>
              {/* The margin as a chip rather than a fifth labelled cell: it
                  qualifies the profit beside it rather than standing as a
                  figure of its own. */}
              <span className="keeps-color shrink-0 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-bold text-ink-soft tabular-nums">
                {margin.toFixed(0)}%
              </span>
              {/*
                Red when negative. The desktop table colours nothing and does
                not need to — in a column of right-aligned currency a minus
                sign is unmissable — but on a card it is one character in a
                line of prose, and a loss is the single thing on this page
                nobody should scroll past. The colour is the one the
                Dashboard's KPI delta already uses for the same meaning.
              */}
              <span
                className={`shrink-0 text-[15px] font-bold tabular-nums ${
                  m.profit < 0 ? "text-red-700" : "text-ink"
                }`}
              >
                {currency(m.profit)}
              </span>
            </div>

            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <Figure label="Revenue" value={currency(m.revenue)} />
              <Figure label="Expenses" value={currency(m.expenses)} />
              <Figure label="Orders" value={nf.format(m.orderCount)} />
              <Figure label="Units sold" value={nf.format(m.unitsSold)} />
            </dl>
          </div>
        );
      })}
    </div>
  );
}

/** A labelled figure: the label quiet, the number in the row's own ink. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="shrink-0 text-ink-soft">{label}</dt>
      <dd className="min-w-0 truncate font-semibold text-ink tabular-nums">{value}</dd>
    </div>
  );
}
