/**
 * The Orders page's time scope: which slice of the calendar the table,
 * the board and the summary are all talking about.
 *
 * Client-safe like orderTypes.ts — pure functions over the "YYYY-MM-DD"
 * strings `orders.date` already arrives as (see db.ts's DATE parser). ISO
 * strings compare correctly with `<=`, so no Date objects are built per
 * order and no timezone can shift a boundary.
 */

import { orderTotal, orderUnits, type Order } from "./orderTypes";

export type ScopeId = "14d" | "month" | "nextMonth" | "all";

/**
 * Forward-looking by default: the page is about what still has to be
 * made, and 14 days is the horizon the kitchen actually works to.
 */
export const SCOPES: { id: ScopeId; label: string }[] = [
  { id: "14d", label: "14 days" },
  { id: "month", label: "This month" },
  { id: "nextMonth", label: "Next month" },
  { id: "all", label: "All time" },
];

/** Inclusive at both ends. */
export interface DateRange {
  from: string;
  to: string;
}

function iso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function monthRange(anchor: Date, offset: number): DateRange {
  const first = new Date(anchor.getFullYear(), anchor.getMonth() + offset, 1);
  // Day 0 of the following month is the last day of this one.
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  return { from: iso(first), to: iso(last) };
}

/** The window a scope covers, or null for "all time" — no bounds at all. */
export function scopeRange(id: ScopeId, today: Date): DateRange | null {
  switch (id) {
    case "14d":
      return { from: iso(today), to: iso(addDays(today, 13)) };
    case "month":
      return monthRange(today, 0);
    case "nextMonth":
      return monthRange(today, 1);
    case "all":
      return null;
  }
}

/**
 * The window immediately before the scope, for the summary's change
 * figures — the 14 days just gone, last month, this month.
 *
 * The same scope measured from one window earlier, rather than a second
 * switch that has to be kept in step with the first. Null for "all time",
 * which has nothing before it. Anchoring the month cases to the 1st is
 * safe because `monthRange` only reads the year and month.
 */
export function previousRange(id: ScopeId, today: Date): DateRange | null {
  if (id === "all") return null;
  const oneWindowBack =
    id === "14d" ? addDays(today, -14) : new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return scopeRange(id, oneWindowBack);
}

/** A null range means unbounded, so everything is in it. */
export function inRange(date: string, range: DateRange | null): boolean {
  return range === null || (date >= range.from && date <= range.to);
}

export interface OrderTotals {
  units: number;
  orders: number;
  mirrors: number;
  income: number;
}

export function totalOf(orders: Order[], unitsPerPackage: Map<number, number>): OrderTotals {
  return orders.reduce<OrderTotals>(
    (totals, order) => ({
      units: totals.units + orderUnits(order.packageLines, unitsPerPackage),
      orders: totals.orders + 1,
      mirrors: totals.mirrors + (order.mirrors ?? 0),
      // What the order is worth, extras included — the same figure the
      // order sheet calls Total. Summing the bare `total_amount` column
      // made the rail disagree with the popup it links to.
      income: totals.income + orderTotal(order),
    }),
    { units: 0, orders: 0, mirrors: 0, income: 0 },
  );
}

/**
 * Change against the previous window, as a percentage.
 *
 * Null when there is nothing to divide by: a period that starts from zero
 * has no percentage change, and rendering "+100%" for the first order of
 * a month would state a comparison that wasn't made.
 */
export function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
