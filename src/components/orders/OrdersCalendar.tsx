"use client";

import { useMemo, useState } from "react";
import { orderUnits, type Order } from "@/lib/orderTypes";
import type { Flavor, PackageType } from "@/lib/settings";
import { OrderHoverCard } from "./OrderHoverCard";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function orderDate(order: Order): Date | null {
  const date = new Date(`${order.date}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
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
 * True weekly calendar (Sun-Sat). The pills themselves stay money-free by
 * design (see CLAUDE.md's Orders page notes) — customer, address, unit
 * count. The full order, money included, is a hover away.
 */
export function OrdersCalendar({
  orders,
  flavors,
  packageTypes,
  onOpen,
}: {
  orders: Order[];
  flavors: Flavor[];
  packageTypes: PackageType[];
  onOpen: (key: string) => void;
}) {
  const unitsPerPackage = useMemo(
    () => new Map(packageTypes.map((p) => [p.id, p.unitsPerPackage])),
    [packageTypes],
  );

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
                  // Packaging lines only — summing every content line
                  // would add the flavour split on top of the packages it
                  // describes, double-counting the whole order.
                  const units = orderUnits(order.contentLines, unitsPerPackage);
                  return (
                    <OrderHoverCard
                      key={order.key}
                      order={order}
                      flavors={flavors}
                      packageTypes={packageTypes}
                      className="hover-line cursor-pointer rounded-lg bg-cream px-2 py-1.5 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => onOpen(order.key)}
                        className="block w-full text-left"
                      >
                        <p className="truncate font-semibold text-ink">{order.customer || "(no name)"}</p>
                        {order.location && <p className="truncate text-ink-soft">{order.location}</p>}
                        {units > 0 && <p className="text-ink-soft">{units} units</p>}
                      </button>
                    </OrderHoverCard>
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
