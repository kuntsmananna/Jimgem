/**
 * The kitchen's prep sheet: what the coming days' orders add up to.
 *
 * Client-safe like orderTypes.ts — pure functions over orders the page
 * already has, so the window can change in the browser without a round
 * trip and the arithmetic can be tested without a database.
 *
 * The orders themselves already say everything; what nobody had was the
 * sum. "How much Gin & Tonic do we make this week" was answered by reading
 * every order and adding it up in one's head, which is the job a list of
 * thirty orders is worst at.
 */

import {
  isoDate,
  linePackedUnits,
  isCustomLine,
  type Order,
  type ProductionStage,
} from "./orderTypes";

export type PrepWindowId = "today" | "3d" | "7d" | "14d";

/** How far ahead the sheet looks. A week by default — the kitchen's horizon. */
export const PREP_WINDOWS: { id: PrepWindowId; label: string; days: number }[] = [
  { id: "today", label: "Today", days: 1 },
  { id: "3d", label: "3 days", days: 3 },
  { id: "7d", label: "7 days", days: 7 },
  { id: "14d", label: "14 days", days: 14 },
];

/** The last day a window reaches, inclusive. */
export function prepWindowEnd(from: Date, days: number): string {
  const end = new Date(from);
  end.setDate(end.getDate() + days - 1);
  return isoDate(end);
}

/**
 * The orders the kitchen has to make in the window, earliest first.
 *
 * A finished order is out — it has been made. A quote is out unless asked
 * for: it may never land, and making jelly for it is how stock gets
 * wasted. An unknown stage counts, the rule `isBooked` follows, since a
 * stage row gone missing is a data problem and not a reason to skip an
 * order.
 */
export function prepOrders(
  orders: Order[],
  stages: Map<string, ProductionStage>,
  { from, to, includeQuotes }: { from: string; to: string; includeQuotes: boolean },
): Order[] {
  return orders
    .filter((order) => order.date >= from && order.date <= to)
    .filter((order) => {
      const stage = stages.get(order.productionStatus);
      if (stage?.isFinal) return false;
      return includeQuotes || (stage?.countsAsIncome ?? true);
    })
    .sort((a, b) => a.date.localeCompare(b.date) || Number(a.key) - Number(b.key));
}

export interface PrepSummary {
  orderCount: number;
  /** Everything the orders pack. */
  units: number;
  /** Units no flavour has been given yet — the mix still to be decided. */
  unassigned: number;
  /** Units per flavour, largest first. */
  flavors: { flavorId: string; units: number }[];
  /** Packages per package type, largest package first. Event totals are not packages. */
  packages: { packageTypeId: string; packages: number }[];
  /** Units ordered as one-off event totals rather than packages. */
  eventUnits: number;
  /** Displays per option, most first. */
  displays: { optionId: number; quantity: number }[];
  waitresses: number;
  kosherOrders: number;
  deliveries: number;
}

/**
 * The orders, added up.
 *
 * Unassigned is counted **per line and only where a line is short** — an
 * overfilled line elsewhere does not cancel it, the same rule the order
 * form's coverage chip follows. A short line and a long one are two
 * problems, not a balanced order.
 */
export function summarizePrep(orders: Order[], unitsPerPackage: Map<number, number>): PrepSummary {
  const flavors = new Map<string, number>();
  const packages = new Map<string, number>();
  const displays = new Map<number, number>();
  let units = 0;
  let unassigned = 0;
  let eventUnits = 0;
  let waitresses = 0;
  let kosherOrders = 0;
  let deliveries = 0;

  for (const order of orders) {
    for (const line of order.packageLines) {
      const packed = linePackedUnits(line, unitsPerPackage);
      units += packed;
      let assigned = 0;
      for (const entry of line.flavors) {
        assigned += entry.units;
        flavors.set(entry.flavorId, (flavors.get(entry.flavorId) ?? 0) + entry.units);
      }
      unassigned += Math.max(0, packed - assigned);
      if (isCustomLine(line, unitsPerPackage)) eventUnits += packed;
      else packages.set(line.packageTypeId, (packages.get(line.packageTypeId) ?? 0) + line.quantity);
    }
    for (const display of order.displays) {
      displays.set(display.optionId, (displays.get(display.optionId) ?? 0) + display.quantity);
    }
    waitresses += order.waitresses ?? 0;
    if (order.kosher) kosherOrders += 1;
    if (order.deliveryCost !== null) deliveries += 1;
  }

  return {
    orderCount: orders.length,
    units,
    unassigned,
    flavors: [...flavors]
      .filter(([, n]) => n > 0)
      .map(([flavorId, n]) => ({ flavorId, units: n }))
      .sort((a, b) => b.units - a.units),
    packages: [...packages]
      .filter(([, n]) => n > 0)
      .map(([packageTypeId, n]) => ({ packageTypeId, packages: n }))
      .sort(
        (a, b) =>
          (unitsPerPackage.get(Number(b.packageTypeId)) ?? 0) - (unitsPerPackage.get(Number(a.packageTypeId)) ?? 0),
      ),
    eventUnits,
    displays: [...displays]
      .filter(([, n]) => n > 0)
      .map(([optionId, quantity]) => ({ optionId, quantity }))
      .sort((a, b) => b.quantity - a.quantity),
    waitresses,
    kosherOrders,
    deliveries,
  };
}

/** The orders grouped by day, in order — the sheet's second half. */
export function prepDays(orders: Order[]): { date: string; orders: Order[] }[] {
  const days: { date: string; orders: Order[] }[] = [];
  for (const order of orders) {
    const last = days[days.length - 1];
    if (last?.date === order.date) last.orders.push(order);
    else days.push({ date: order.date, orders: [order] });
  }
  return days;
}
