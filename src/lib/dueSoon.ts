/**
 * Booked events coming up that have not been paid for yet.
 *
 * Client-safe and pure, like orderScope.ts. Money chased after the event
 * is money chased from somebody who already has what they paid for, so the
 * days before it are when a reminder is worth anything — and nothing in the
 * app said which orders those were until somebody went looking.
 */

import { isOpen, stillDue, type Order, type ProductionStage } from "./orderTypes";
import { daysAhead, inRange } from "./orderScope";

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
  const window = daysAhead(today, days);
  return orders
    .filter((order) => inRange(order.date, window) && isOpen(order, stages))
    .map((order) => ({ order, due: stillDue(order) }))
    .filter(({ due }) => due > 0)
    .sort((a, b) => a.order.date.localeCompare(b.order.date) || b.due - a.due);
}
