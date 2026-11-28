"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart3, ChevronRight } from "lucide-react";
import { useVatView } from "@/components/VatViewContext";
import { count, currency } from "@/lib/money";
import { formatOrderDate, orderWeekday } from "@/lib/orderTypes";
import type { EventSummary } from "@/lib/eventStats";
import { EventStatsModal } from "./EventStatsModal";

/**
 * The statistics popup behind a button (v0.103), for a row that is
 * already a link elsewhere — the Events page's rows open the event's setup.
 */
export function EventStatsButton({ eventId, className = "" }: { eventId: number; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`press flex h-9 items-center gap-1.5 rounded-full border border-line bg-card px-3.5 text-sm font-bold ${className}`}
      >
        <BarChart3 size={15} aria-hidden />
        Stats
      </button>
      {open && <EventStatsModal eventId={eventId} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * One row per event — the owner's ask, beside the months on the Dashboard
 * and the Biz Plan (v0.103): its date, name, customers and takings, each
 * opening the statistics popup. Takings follow the VAT switch. Drawn only
 * when the year has events, so a year without any looks as it did.
 */
export function EventsPane({ events, year }: { events: EventSummary[]; year: number }) {
  const [open, setOpen] = useState<number | null>(null);
  const { label, forEvent } = useVatView();
  if (events.length === 0) return null;
  const total = events.reduce((sum, e) => sum + forEvent(e), 0);
  return (
    <section className="rounded-card border border-line bg-card p-6 max-md:p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-base font-bold text-ink">Events in {year}</h2>
        <Link href="/events" className="text-sm font-semibold text-accent hover:underline">
          All events →
        </Link>
      </div>
      <p className="mt-0.5 text-xs text-ink-soft">
        Takings are in the revenue above · {currency(total)} {label}
      </p>
      <ul className="motion-stagger mt-3 flex flex-col gap-1.5">
        {events.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => setOpen(e.id)}
              className="hover-line grid w-full grid-cols-[84px_minmax(0,1fr)_auto_auto_16px] items-center gap-4 rounded-2xl border border-line/70 px-4 py-2.5 text-start max-md:grid-cols-[minmax(0,1fr)_auto_16px] max-md:gap-x-3"
            >
              <span className="text-sm max-md:hidden">
                <span className="text-xs font-bold text-ink-soft">{orderWeekday(e.date)}</span>{" "}
                <span className="font-bold">{formatOrderDate(e.date)}</span>
              </span>
              <span className="min-w-0">
                <span className="block truncate font-bold" dir="auto">
                  {e.name}
                </span>
                <span className="block truncate text-xs text-ink-soft md:hidden">
                  {orderWeekday(e.date)} {formatOrderDate(e.date)} · {count(e.sales)} customers
                </span>
              </span>
              <span className="text-sm text-ink-soft tabular-nums max-md:hidden">{count(e.sales)} customers</span>
              <span className="font-bold tabular-nums">{currency(forEvent(e))}</span>
              <ChevronRight size={16} className="text-ink-soft" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {open !== null && <EventStatsModal eventId={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
