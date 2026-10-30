"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRing, ChevronDown } from "lucide-react";
import { formatOrderDate, orderWeekday, todayIso } from "@/lib/orderTypes";
import { DUE_SOON_DAYS, type DueSoon } from "@/lib/dueSoon";
import { currency } from "@/lib/money";

/**
 * "These events are this week and still owe" — one line, which opens into
 * the orders it means.
 *
 * Shared by the Orders page, where a row opens the order in place, and the
 * Dashboard, where it links to it. Folded by default: it is a reminder,
 * and a list of five unpaid orders on arrival is a page somebody learns to
 * scroll past. Draws nothing when nothing is owed, so it is only ever on
 * screen when there is something to do.
 */
export function DueSoonStrip({
  items,
  onOpen,
}: {
  items: DueSoon[];
  /** Open the order where it is. Without it each row links to the Orders page. */
  onOpen?: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  const total = items.reduce((sum, item) => sum + item.due, 0);
  const today = todayIso();

  return (
    <section className="rounded-card bg-tile-peach/60 shadow-[inset_0_0_0_1px_var(--color-line)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm max-md:py-3"
      >
        <BellRing size={16} aria-hidden className="shrink-0" />
        <span className="min-w-0 flex-1 font-semibold">
          {items.length === 1 ? "1 event" : `${items.length} events`} in the next {DUE_SOON_DAYS} days still{" "}
          {items.length === 1 ? "owes" : "owe"} <span className="font-display font-extrabold tabular-nums">{currency(total)}</span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-ink-soft">{open ? "Hide" : "Show"}</span>
        <ChevronDown size={14} aria-hidden className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="flex flex-col gap-1 px-2 pb-2">
          {items.map(({ order, due }) => {
            const body = (
              <>
                <span className={`w-20 shrink-0 text-xs font-bold ${order.date === today ? "text-accent" : "text-ink-soft"}`}>
                  {order.date === today ? "Today" : `${orderWeekday(order.date)} ${formatOrderDate(order.date)}`}
                </span>
                <span data-private className="min-w-0 flex-1 truncate font-semibold">
                  {order.customer || "No name"}
                </span>
                <span className="shrink-0 font-display font-extrabold text-due tabular-nums">{currency(due)}</span>
              </>
            );
            const row = "hover-line flex w-full items-center gap-3 rounded-lg bg-card/70 px-2.5 py-1.5 text-left text-sm max-md:py-2.5";
            return (
              <li key={order.key}>
                {onOpen ? (
                  <button type="button" onClick={() => onOpen(order.key)} className={row}>
                    {body}
                  </button>
                ) : (
                  <Link href={`/orders?order=${order.key}`} className={row}>
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
