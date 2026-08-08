"use client";

import { orderDay, orderMonth, type Order } from "@/lib/orderTypes";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Agenda-style calendar (grouped by month/day, not a true Sun-Sat grid) —
 * Sheet order dates carry no year (see orderTypes.ts), so a real weekday
 * grid can't be positioned reliably. No money or payment status shown
 * here by design (see CLAUDE.md's Orders page notes).
 */
export function OrdersCalendar({ orders }: { orders: Order[] }) {
  const byMonth = new Map<number, Map<number, Order[]>>();
  for (const order of orders) {
    const month = orderMonth(order);
    const day = orderDay(order);
    if (month === null) continue;
    const days = byMonth.get(month) ?? new Map<number, Order[]>();
    const list = days.get(day ?? 0) ?? [];
    list.push(order);
    days.set(day ?? 0, list);
    byMonth.set(month, days);
  }

  const months = Array.from(byMonth.keys()).sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-6">
      {months.map((month) => {
        const days = Array.from(byMonth.get(month)!.entries()).sort((a, b) => a[0] - b[0]);
        return (
          <section key={month} className="rounded-card border border-line bg-card p-6">
            <h2 className="font-display text-base font-bold text-ink">{MONTH_NAMES[month - 1]}</h2>
            <div className="mt-3 grid grid-cols-5 gap-3">
              {days.map(([day, dayOrders]) => (
                <div key={day} className="rounded-xl border border-line p-3">
                  <p className="text-xs font-bold text-ink-soft">{day > 0 ? day : "?"}</p>
                  <div className="mt-1 flex flex-col gap-1.5">
                    {dayOrders.map((order) => {
                      const units = order.contentLines.reduce((sum, l) => sum + l.quantity, 0);
                      return (
                        <div key={order.key} className="rounded-lg bg-cream px-2 py-1.5 text-xs" title={order.location}>
                          <p className="font-semibold text-ink">{order.customer || "(no name)"}</p>
                          {order.location && <p className="truncate text-ink-soft">{order.location}</p>}
                          {units > 0 && <p className="text-ink-soft">{units} units</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {months.length === 0 && <p className="text-sm text-ink-soft">No dated orders to show.</p>}
    </div>
  );
}
