"use client";

import { ArrowDownRight, ArrowUpRight, Package, Receipt, Sparkles } from "lucide-react";
import { deltaPercent, type OrderTotals } from "@/lib/orderScope";
import { UnitsIcon } from "@/lib/icons";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/**
 * The rail beside the table and the board: what the orders currently on
 * screen add up to, and how that compares with the window just before.
 *
 * Scoped, not global — it answers "what does this fortnight look like",
 * which is why it changes with the time scope rather than restating the
 * Dashboard's all-time figures.
 */
export function OrdersSummary({
  totals,
  previous,
  scopeLabel,
  comparable,
}: {
  totals: OrderTotals;
  previous: OrderTotals;
  scopeLabel: string;
  /** False on "All time", where there is no previous window to compare with. */
  comparable: boolean;
}) {
  const tiles = [
    { key: "units", label: "Units", value: nf.format(totals.units), icon: <UnitsIcon size={13} /> },
    { key: "orders", label: "Orders", value: nf.format(totals.orders), icon: <Package size={13} /> },
    { key: "mirrors", label: "Mirrors", value: nf.format(totals.mirrors), icon: <Sparkles size={13} /> },
    {
      key: "income",
      label: "Income",
      value: `₪${nf.format(totals.income)}`,
      icon: <Receipt size={13} />,
    },
  ] as const;

  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-[10px] font-bold tracking-[0.1em] text-ink-soft uppercase">{scopeLabel}</p>
      {tiles.map((tile) => (
        <section key={tile.key} className="rounded-2xl border border-line bg-card p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-soft">
            <span className="text-ink-soft">{tile.icon}</span>
            {tile.label}
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-2xl leading-none font-extrabold tabular-nums text-ink">
              {tile.value}
            </span>
            {comparable && <Delta current={totals[tile.key]} previous={previous[tile.key]} />}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * Up is not automatically good — this only says which way the number
 * moved, in the accent for more and amber for less, so it reads as
 * direction rather than as a verdict.
 */
function Delta({ current, previous }: { current: number; previous: number }) {
  const change = deltaPercent(current, previous);

  if (change === null) {
    return (
      <span className="text-[11px] font-semibold text-ink-soft" title="Nothing in the previous period">
        —
      </span>
    );
  }

  const rounded = Math.round(change);
  if (rounded === 0) {
    return (
      <span className="text-[11px] font-semibold text-ink-soft" title="Unchanged">
        0%
      </span>
    );
  }

  const up = rounded > 0;
  return (
    <span
      title={`${nf.format(previous)} in the previous period`}
      className={`flex items-center gap-0.5 text-[11px] font-bold tabular-nums ${
        up ? "text-accent" : "text-amber-700"
      }`}
    >
      {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
      {Math.abs(rounded)}%
    </span>
  );
}
