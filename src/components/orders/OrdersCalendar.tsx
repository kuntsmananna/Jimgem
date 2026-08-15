"use client";

import { useMemo, useState } from "react";
import { orderUnits, type Order } from "@/lib/orderTypes";
import type { Flavor, PackageType } from "@/lib/settings";
import { OrderHoverCard } from "./OrderHoverCard";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Month for scanning the season, week for working a few days in detail.
 *
 * There is deliberately no hour axis on the week view: `orders.date` is a
 * DATE column and the Sheet has no times either (see CLAUDE.md), so an
 * hours grid would have nothing real to place orders against. Week is a
 * roomier day column instead. Adding a time to orders is what would
 * unlock a true hour axis.
 */
type CalendarMode = "month" | "week";

/** How many orders a month cell shows before collapsing the rest behind "+N more". */
const MONTH_CELL_PILLS = 3;

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

function startOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Anchored to the 1st before shifting, so stepping from the 31st doesn't
 * skip a short month the way a naive setMonth would.
 */
function addMonths(date: Date, months: number): Date {
  const d = startOfMonth(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isoDay(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * The weeks covering a whole month, each as 7 days running Sun-Sat. Weeks
 * are padded out with the neighbouring months' days so every row is full
 * — those are dimmed rather than blanked, because an order landing on the
 * 1st of next month is still worth seeing from this one.
 */
function weeksOfMonth(anchor: Date): Date[][] {
  const first = startOfMonth(anchor);
  // Day 0 of the next month is the last day of this one.
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const weeks: Date[][] = [];
  // Runs while a week still begins inside the month, so the grid is 4-6
  // rows as the month actually needs rather than a fixed six with an
  // empty band on short months.
  for (let cursor = startOfWeek(first); cursor <= last; cursor = addDays(cursor, 7)) {
    const start = cursor;
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }
  return weeks;
}

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

  const [mode, setMode] = useState<CalendarMode>("month");
  /**
   * Opens on today. A calendar is read as "where am I now", and the month
   * of the newest order — which it used to open on — could be one nobody
   * had asked about. Today's cell is marked hard enough to find at a
   * glance, and Prev/Next reach the rest.
   *
   * One anchor for both modes, so switching keeps you where you were.
   */
  const [anchor, setAnchor] = useState(() => new Date());
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const today = new Date();

  const ordersOn = (day: Date) => dated.filter((o) => sameDay(o.date, day));

  const weekStart = startOfWeek(anchor);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const label =
    mode === "month"
      ? anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : rangeLabel(weekStart, addDays(weekStart, 6));

  function step(direction: -1 | 1) {
    setExpandedDay(null);
    setAnchor((current) =>
      mode === "month" ? addMonths(current, direction) : addDays(current, direction * 7),
    );
  }

  return (
    <section className="rounded-card border border-line bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg font-bold text-ink">{label}</h2>
          <div className="flex gap-0.5 rounded-full bg-cream p-0.5">
            {(["month", "week"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                onClick={() => {
                  setMode(option);
                  setExpandedDay(null);
                }}
                className={`rounded-full px-3 py-1 text-xs font-bold capitalize transition ${
                  mode === option ? "bg-black text-cream" : "text-ink-soft hover:text-ink"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <NavButton onClick={() => step(-1)}>← Prev {mode}</NavButton>
          <NavButton
            onClick={() => {
              setAnchor(new Date());
              setExpandedDay(null);
            }}
          >
            Today
          </NavButton>
          <NavButton onClick={() => step(1)}>Next {mode} →</NavButton>
        </div>
      </div>

      {mode === "month" ? (
        <div className="mt-4">
          <div className="grid grid-cols-7 gap-2 pb-1">
            {WEEKDAY_LABELS.map((weekday) => (
              <p key={weekday} className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                {weekday}
              </p>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {weeksOfMonth(anchor).map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-7 gap-2">
                {week.map((day) => {
                  const dayOrders = ordersOn(day);
                  const key = isoDay(day);
                  const expanded = expandedDay === key;
                  const visible = expanded ? dayOrders : dayOrders.slice(0, MONTH_CELL_PILLS);
                  const hidden = dayOrders.length - visible.length;
                  const outside = day.getMonth() !== anchor.getMonth();
                  const isToday = sameDay(day, today);

                  return (
                    <div
                      key={key}
                      // Today gets a tinted ground and a ring on top of the
                      // border: a single accent hairline sitting in a grid of
                      // hairlines was easy to miss, and finding today is the
                      // first thing the view is used for.
                      className={`min-h-[104px] rounded-xl border p-1.5 ${
                        isToday
                          ? "border-accent bg-accent/[0.07] ring-1 ring-accent"
                          : "border-line"
                      } ${outside ? "opacity-40" : ""}`}
                    >
                      <p className="px-0.5 text-xs font-bold text-ink-soft">
                        {isToday ? (
                          <span className="-mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-cream">
                            {day.getDate()}
                          </span>
                        ) : (
                          day.getDate()
                        )}
                      </p>
                      <div className="mt-1 flex flex-col gap-1">
                        {visible.map(({ order }) => (
                          <CompactPill
                            key={order.key}
                            order={order}
                            units={orderUnits(order.packageLines, unitsPerPackage)}
                            flavors={flavors}
                            packageTypes={packageTypes}
                            onOpen={onOpen}
                          />
                        ))}
                        {hidden > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpandedDay(key)}
                            className="px-1 text-left text-[10px] font-bold text-ink-soft hover:text-ink"
                          >
                            +{hidden} more
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-7 gap-3">
          {weekDays.map((day, i) => {
            const dayOrders = ordersOn(day);
            const isToday = sameDay(day, today);
            return (
              <div
                key={i}
                className={`min-h-[420px] rounded-xl border p-2 ${
                  isToday ? "border-accent bg-accent/[0.07] ring-1 ring-accent" : "border-line"
                }`}
              >
                <p className="flex items-center gap-1.5 text-xs font-bold text-ink-soft">
                  {WEEKDAY_LABELS[i]}{" "}
                  {isToday ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-cream">
                      {day.getDate()}
                    </span>
                  ) : (
                    <span>{day.getDate()}</span>
                  )}
                </p>
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {dayOrders.map(({ order }) => {
                    // Package lines only — adding each line's flavour split on
                    // top would double-count the packages it describes.
                    const units = orderUnits(order.packageLines, unitsPerPackage);
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
                          <p className="truncate font-semibold text-ink">
                            {order.customer || "(no name)"}
                          </p>
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
      )}
    </section>
  );
}

/**
 * A month cell is a seventh of the page wide, so the pill carries the
 * customer alone — location and money stay in the hover card, which every
 * calendar pill already has (see CLAUDE.md's Orders page notes on why
 * pills show no money).
 */
function CompactPill({
  order,
  units,
  flavors,
  packageTypes,
  onOpen,
}: {
  order: Order;
  units: number;
  flavors: Flavor[];
  packageTypes: PackageType[];
  onOpen: (key: string) => void;
}) {
  return (
    <OrderHoverCard
      order={order}
      flavors={flavors}
      packageTypes={packageTypes}
      className="hover-line cursor-pointer rounded-md bg-cream px-1.5 py-1"
    >
      <button type="button" onClick={() => onOpen(order.key)} className="block w-full text-left">
        <p className="truncate text-[11px] font-semibold text-ink">{order.customer || "(no name)"}</p>
        {units > 0 && <p className="text-[10px] text-ink-soft">{units}u</p>}
      </button>
    </OrderHoverCard>
  );
}

/** "29 Jun – 5 Jul 2026", collapsing the parts both ends share. */
function rangeLabel(from: Date, to: Date): string {
  const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
  const left = from.toLocaleDateString("en-US", sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" });
  const right = to.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
  return `${left} – ${right}`;
}

function NavButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border border-line px-3 py-1 text-xs font-semibold capitalize text-ink hover:bg-black/5"
    >
      {children}
    </button>
  );
}
