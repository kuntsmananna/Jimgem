"use client";

import { useMemo, useState } from "react";
import { orderDay, orderMonth, type Order } from "@/lib/orderTypes";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Sheet order dates carry no year (see orderTypes.ts) — assumed to fall in
 * the current year for calendar positioning, consistent with the rest of
 * this codebase's single-year assumption for V1. DB orders have real
 * ISO dates and are parsed as-is.
 */
function orderDate(order: Order): Date | null {
  if (order.source === "db") {
    const d = new Date(`${order.date}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const month = orderMonth(order);
  const day = orderDay(order);
  if (month === null || day === null) return null;
  return new Date(new Date().getFullYear(), month - 1, day);
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * True weekly calendar (Sun-Sat). No money or payment status shown by
 * design (see CLAUDE.md's Orders page notes) — address and unit count
 * instead.
 */
export function OrdersCalendar({ orders }: { orders: Order[] }) {
  const dated = useMemo(
    () =>
      orders
        .map((order) => ({ order, date: orderDate(order) }))
        .filter((o): o is { order: Order; date: Date } => o.date !== null),
    [orders],
  );

  const initialWeekStart = useMemo(() => {
    const mostRecent = dated.reduce<Date | null>(
      (latest, o) => (latest === null || o.date > latest ? o.date : latest),
      null,
    );
    return startOfWeek(mostRecent ?? new Date());
  }, [dated]);

  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const today = new Date();

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const monthLabel = weekStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <section className="rounded-card border border-line bg-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">{monthLabel}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink hover:bg-black/5"
          >
            ← Prev week
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink hover:bg-black/5"
          >
            Today
          </button>
          <button
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink hover:bg-black/5"
          >
            Next week →
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-3">
        {days.map((day, i) => {
          const dayOrders = dated.filter((o) => sameDay(o.date, day));
          const isToday = sameDay(day, today);
          return (
            <div key={i} className={`min-h-[160px] rounded-xl border p-2 ${isToday ? "border-accent" : "border-line"}`}>
              <p className="text-xs font-bold text-ink-soft">
                {WEEKDAY_LABELS[i]} <span className={isToday ? "text-accent" : ""}>{day.getDate()}</span>
              </p>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {dayOrders.map(({ order }) => {
                  const units = order.contentLines.reduce((sum, l) => sum + l.quantity, 0);
                  return (
                    <div key={order.key} className="rounded-lg bg-cream px-2 py-1.5 text-xs" title={order.location}>
                      <p className="truncate font-semibold text-ink">{order.customer || "(no name)"}</p>
                      {order.location && <p className="truncate text-ink-soft">{order.location}</p>}
                      {units > 0 && <p className="text-ink-soft">{units} units</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
