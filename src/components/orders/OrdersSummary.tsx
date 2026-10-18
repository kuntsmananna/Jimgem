"use client";

import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { deltaPercent, type OrderTotals } from "@/lib/orderScope";
import {
  isBooked,
  orderBalance,
  orderFlavorUnits,
  orderUnits,
  type Order,
  type ProductionStage,
} from "@/lib/orderTypes";
import type { Flavor } from "@/lib/settings";
import { useCanSeeMoney } from "@/components/RoleContext";
import { HoverCard } from "@/components/HoverCard";
import { count, currency } from "@/lib/money";

/**
 * The strip above the table and the board: what the orders on screen add
 * up to, one slim tile per figure, with the detail a hover away.
 *
 * It was a 140px rail of stacked cards beside the table (v0.71 and
 * before). As a strip it costs one 44px row instead of a column of the
 * page's width, and it deliberately has **no shadow and no colour** — the
 * figures summarise the list, and the list is what the page is for.
 *
 * Scoped, not global: it answers "what does this fortnight look like",
 * which is why it moves with the time scope and the filters rather than
 * restating the Dashboard's all-time figures.
 */
export function OrdersSummary({
  orders,
  totals,
  previous,
  scopeLabel,
  comparable,
  stages,
  unitsPerPackage,
  flavors,
}: {
  /** Exactly the list on screen — the same array the table renders. */
  orders: Order[];
  totals: OrderTotals;
  previous: OrderTotals;
  scopeLabel: string;
  /** False on "All time", where there is no previous window to compare with. */
  comparable: boolean;
  stages: Map<string, ProductionStage>;
  unitsPerPackage: Map<number, number>;
  flavors: Flavor[];
}) {
  const money = useCanSeeMoney();

  return (
    <div className={`motion-fade grid gap-2.5 ${money ? "grid-cols-4" : "grid-cols-2"}`}>
      {money && (
        <Tile
          label="Income"
          value={currency(totals.income)}
          aside={comparable ? <Delta current={totals.income} previous={previous.income} /> : null}
          detail={() => (
            <>
              <p>
                Booked orders in this window ({scopeLabel.toLowerCase()})
                {totals.offers > 0 && <>, leaving out {count(totals.offers)} offer{totals.offers > 1 ? "s" : ""}</>}.
              </p>
              {comparable && (
                <p className="mt-1.5">
                  The window before: <b className="text-cream">{currency(previous.income)}</b>
                </p>
              )}
            </>
          )}
        />
      )}
      {money && (
        <Tile
          label="Balance due"
          value={currency(balances(orders, stages).total)}
          detail={() => {
            const { owing } = balances(orders, stages);
            if (owing.length === 0) {
              return <p>{orders.length === 0 ? "Nothing is owed in this window." : "Every order here is paid in full."}</p>;
            }
            return (
              <>
                <p className="mb-1.5">Still owed on {count(owing.length)} order{owing.length > 1 ? "s" : ""}:</p>
                {owing.slice(0, 6).map((entry) => (
                  <p key={entry.key} className="flex justify-between gap-3">
                    <span className="truncate">{entry.customer || "(no name)"}</span>
                    <b className="shrink-0 text-cream tabular-nums">{currency(entry.balance)}</b>
                  </p>
                ))}
                {owing.length > 6 && <p className="mt-1 opacity-70">and {count(owing.length - 6)} more</p>}
              </>
            );
          }}
        />
      )}
      <Tile
        label="Orders"
        value={count(totals.orders)}
        aside={
          totals.offers > 0 ? (
            <span className="text-[11px] text-ink-soft">
              {count(totals.offers)} offer{totals.offers > 1 ? "s" : ""}
            </span>
          ) : comparable ? (
            <Delta current={totals.orders} previous={previous.orders} />
          ) : null
        }
        detail={() => {
          const byStage = new Map<string, number>();
          for (const order of orders) {
            const label = stages.get(order.productionStatus)?.label ?? order.productionStatus;
            byStage.set(label, (byStage.get(label) ?? 0) + 1);
          }
          if (byStage.size === 0) return <p>No orders in this window.</p>;
          return [...byStage].map(([label, n]) => (
            <p key={label} className="flex justify-between gap-3">
              <span>{label}</span>
              <b className="text-cream tabular-nums">{count(n)}</b>
            </p>
          ));
        }}
      />
      <Tile
        label="Units"
        value={count(totals.units)}
        aside={comparable ? <Delta current={totals.units} previous={previous.units} /> : null}
        align="right"
        detail={() => {
          const rows = flavourUnits(orders, unitsPerPackage, flavors);
          return (
            <>
              {rows.length === 0 && <p>No units in this window.</p>}
              {rows.map((row) => (
                <p key={row.name} className="flex justify-between gap-3">
                  <span className="truncate">{row.name}</span>
                  <b className="shrink-0 text-cream tabular-nums">{count(row.units)}</b>
                </p>
              ))}
              {totals.displays > 0 && (
                <p className="mt-1.5 border-t border-cream/15 pt-1.5">
                  Plus {count(totals.displays)} display{totals.displays > 1 ? "s" : ""} to set up
                </p>
              )}
            </>
          );
        }}
      />
    </div>
  );
}

/**
 * One figure: the label left, the number right, and whatever explains it
 * in a dark card on hover. The hover card is the shared `HoverCard`, which
 * portals to the page's top layer — a tile's detail can never be covered
 * by the table under it.
 */
function Tile({
  label,
  value,
  aside = null,
  detail,
  align = "left",
}: {
  label: string;
  value: string;
  aside?: ReactNode;
  detail: () => ReactNode;
  /** Which way the card leans — the last tile's opens leftward, off the edge. */
  align?: "left" | "right";
}) {
  return (
    <HoverCard
      width={250}
      height={220}
      tone="ink"
      placement={align === "right" ? "below-right" : "below-left"}
      className="min-w-0"
      render={() => <div className="flex flex-col gap-0.5 text-xs leading-relaxed text-cream/80">{detail()}</div>}
    >
      <div
        tabIndex={0}
        className="flex h-11 cursor-help items-center justify-between gap-2 rounded-2xl bg-card/45 px-4 shadow-[inset_0_0_0_1px_var(--color-line)] transition-colors hover:bg-card/80"
      >
        <span className="truncate text-xs font-semibold text-ink-soft">{label}</span>
        <span className="flex min-w-0 items-baseline gap-2">
          {aside}
          <span className="font-display text-xl leading-none font-extrabold tracking-tight tabular-nums">
            {value}
          </span>
        </span>
      </div>
    </HoverCard>
  );
}

/** Who still owes what, largest first — booked orders only; a quote owes nothing. */
function balances(orders: Order[], stages: Map<string, ProductionStage>) {
  const owing = orders
    .filter((order) => isBooked(order, stages))
    .map((order) => ({ key: order.key, customer: order.customer, balance: orderBalance(order) }))
    .filter((entry) => entry.balance > 0)
    .sort((a, b) => b.balance - a.balance);
  return { owing, total: owing.reduce((sum, entry) => sum + entry.balance, 0) };
}

/**
 * Units per flavour across the list, largest first, with whatever has no
 * flavour yet as one "Not decided" line — the packed units minus the ones
 * assigned, which is what the kitchen still has to be told.
 */
function flavourUnits(orders: Order[], unitsPerPackage: Map<number, number>, flavors: Flavor[]) {
  const names = new Map(flavors.map((flavor) => [String(flavor.id), flavor.name]));
  const byName = new Map<string, number>();
  let packed = 0;
  let assigned = 0;
  for (const order of orders) {
    packed += orderUnits(order.packageLines, unitsPerPackage);
    for (const entry of orderFlavorUnits(order.packageLines)) {
      const name = names.get(entry.flavorId) ?? "Unknown flavour";
      byName.set(name, (byName.get(name) ?? 0) + entry.units);
      assigned += entry.units;
    }
  }
  const rows = [...byName].map(([name, units]) => ({ name, units })).sort((a, b) => b.units - a.units);
  if (packed > assigned) rows.push({ name: "Not decided yet", units: packed - assigned });
  return rows;
}

/**
 * Up is not automatically good — this only says which way the number
 * moved, in the accent for more and amber for less, so it reads as
 * direction rather than as a verdict.
 */
function Delta({ current, previous }: { current: number; previous: number }) {
  const change = deltaPercent(current, previous);
  if (change === null) return null;
  const rounded = Math.round(change);
  if (rounded === 0) return <span className="text-[11px] font-semibold text-ink-soft">0%</span>;
  const up = rounded > 0;
  return (
    <span
      className={`flex items-center gap-0.5 text-[11px] font-bold tabular-nums ${up ? "text-accent" : "text-amber-700"}`}
    >
      {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
      {Math.abs(rounded)}%
    </span>
  );
}
