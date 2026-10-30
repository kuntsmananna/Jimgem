/**
 * Booked events coming up that have not been paid for yet.
 *
 * Client-safe and pure, like orderScope.ts. Money chased after the event
 * is money chased from somebody who already has what they paid for, so the
 * days before it are when a reminder is worth anything — and nothing in the
 * app said which orders those were until somebody went looking.
 */

import { isBooked, isoDate, stillDue, type Order, type ProductionStage } from "./orderTypes";

/** How far ahead "soon" looks: a week, the same horizon as the prep sheet. */
export const DUE_SOON_DAYS = 7;

export interface DueSoon {
  order: Order;
  due: number;
}

/**
 * Orders dated today to `days` ahead, booked (a quote owes nothing yet),
 * not finished, and still owing — soonest first, then the larger sum.
 * `stillDue` is the rule, so "Paid in full" with no deposit typed in is
 * never chased.
 */
export function dueSoon(
  orders: Order[],
  stages: Map<string, ProductionStage>,
  today: Date,
  days = DUE_SOON_DAYS,
): DueSoon[] {
  const from = isoDate(today);
  const end = new Date(today);
  end.setDate(end.getDate() + days - 1);
  const to = isoDate(end);
  return orders
    .filter((order) => order.date >= from && order.date <= to)
    .filter((order) => isBooked(order, stages) && !stages.get(order.productionStatus)?.isFinal)
    .map((order) => ({ order, due: stillDue(order) }))
    .filter(({ due }) => due > 0)
    .sort((a, b) => a.order.date.localeCompare(b.order.date) || b.due - a.due);
}
