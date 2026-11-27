import Link from "next/link";
import { Plus } from "lucide-react";
import { requireAdminPage } from "@/lib/guard";
import { getEvents } from "@/lib/events";
import { getContentPresets } from "@/lib/settings";
import { todayIso, orderWeekday, formatOrderDate } from "@/lib/orderTypes";
import { MigrationNeeded } from "@/components/Pane";
import type { SaleEvent } from "@/lib/eventTypes";
import { getEventSummaries, type EventSummary } from "@/lib/eventStats";
import { EventStatsButton } from "@/components/events/EventsPane";
import { count, currency } from "@/lib/money";

export const dynamic = "force-dynamic";

const PAY_WORDS = { staff: "Staff rings it up", self: "Customers self-scan", both: "Staff + self-scan" } as const;

/**
 * Events (v0.100 event register): markets, fairs and pop-ups where boxes are
 * sold on the spot. Set one up here at the desk; the register opens on a
 * phone on the day (stage 2). Coming up first, soonest at the top; the
 * ones already held under them. Admins only — every event is priced.
 */
export default async function EventsPage() {
  const [, { available, events }, presets, summaries] = await Promise.all([
    requireAdminPage(),
    getEvents(),
    getContentPresets(),
    getEventSummaries(),
  ]);
  const takings = new Map(summaries.map((s) => [s.id, s]));
  const today = todayIso();
  const coming = events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const done = events.filter((e) => e.date < today);
  const presetName = new Map(presets.map((p) => [p.id, p.name]));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold">Events</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Markets, fairs and pop-ups where you sell on the spot. Set one up here; the register opens on a phone on
            the day.
          </p>
        </div>
        <Link
          href="/events/new"
          className="press flex h-11 items-center gap-2 rounded-full bg-black px-5 font-bold text-cream"
        >
          <Plus size={16} strokeWidth={2.6} aria-hidden /> New event
        </Link>
      </div>

      {!available && <MigrationNeeded script="scripts/migrate-040-events.sql" />}

      {available && events.length === 0 && (
        <p className="rounded-card border border-line bg-card px-6 py-10 text-center text-sm text-ink-soft">
          No events yet. Press <b className="text-ink">New event</b> to set up the first one.
        </p>
      )}

      {coming.length > 0 && (
        <section>
          <h2 className="mb-2.5 text-xs font-extrabold tracking-[0.12em] uppercase">Coming up</h2>
          <ul className="motion-stagger flex flex-col gap-2">
            {coming.map((event) => (
              <EventRow key={event.id} event={event} presetName={presetName} summary={takings.get(event.id)} />
            ))}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h2 className="mb-2.5 text-xs font-extrabold tracking-[0.12em] uppercase">Done</h2>
          <ul className="motion-stagger flex flex-col gap-2">
            {done.map((event) => (
              <EventRow key={event.id} event={event} presetName={presetName} summary={takings.get(event.id)} past />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function EventRow({
  event,
  presetName,
  summary,
  past = false,
}: {
  event: SaleEvent;
  presetName: Map<number, string>;
  summary?: EventSummary;
  past?: boolean;
}) {
  const sold = summary && summary.sales > 0 ? summary : null;
  const products = event.products.map((p) => presetName.get(p.presetId) ?? "A retired preset");
  const hours = event.startsAt ? `${event.startsAt}${event.endsAt ? `–${event.endsAt}` : ""}` : "";
  return (
    <li className="relative">
      <Link
        href={`/events/${event.id}`}
        className={`hover-line grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-4 rounded-card border border-line px-5 py-4 max-md:grid-cols-[64px_minmax(0,1fr)] ${
          past ? "bg-cream" : "bg-card"
        } ${sold ? "max-md:pe-24" : ""}`}
      >
        <span>
          <span className="block text-xs font-bold text-ink-soft">{orderWeekday(event.date)}</span>
          <span className="font-display block text-2xl font-extrabold">{formatOrderDate(event.date)}</span>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-base font-extrabold">{event.name}</span>
          <span className="block truncate text-sm text-ink-soft">
            {[hours, event.location, products.length ? `${products.length} products` : "No products yet"]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className={`flex items-center gap-2 max-md:col-span-2 max-md:justify-start ${sold ? "md:pe-24" : ""}`}>
          {sold ? (
            <span className="text-sm font-bold tabular-nums max-md:text-xs">
              {count(sold.sales)} customers · {currency(sold.takings)}
            </span>
          ) : (
            <span className="text-sm font-semibold text-ink-soft max-md:text-xs">{PAY_WORDS[event.payMode]}</span>
          )}
          <span
            className={`keeps-color rounded-full px-3 py-1 text-xs font-extrabold ${
              event.status === "ready" ? "bg-[#cfe0cf]" : "bg-tile-peach"
            }`}
          >
            {event.status === "ready" ? "Ready" : "Draft"}
          </span>
        </span>
      </Link>
      {/* Beside the link, not inside it: a button in an <a> is invalid,
          and the row itself opens the setup. */}
      {sold && <EventStatsButton eventId={event.id} className="absolute end-5 top-1/2 -translate-y-1/2 max-md:top-4 max-md:translate-y-0" />}
    </li>
  );
}
