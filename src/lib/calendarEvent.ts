import crypto from "crypto";
import {
  displayCount,
  hasDelivery,
  isBooked,
  orderUnits,
  packageLineLabel,
  type Order,
  type ProductionStage,
} from "./orderTypes";

/**
 * What one order looks like in a Google Calendar (v0.97).
 *
 * Pure — no database, no Google — so the whole of "what does Aviv see in
 * his calendar" is tested as data. `calendarSync.ts` decides *when* and
 * *where* to write; this decides *what*.
 *
 * **No money in it, on purpose.** A calendar is shared far more casually
 * than a dashboard — with a partner, an assistant, a family calendar — and
 * once an event is in Google it is out of this app's hands: Hide mode,
 * the staff redaction and the VAT switch reach none of it. What an event
 * carries is what the day needs: who, where, how many, what to make, what
 * goes with it, and a link back to the order for everything else.
 */

/** Everything an event is written from besides the order itself. */
export interface EventContext {
  unitsPerPackage: Map<number, number>;
  packageNames: Map<number, string>;
  flavorNames: Map<number, string>;
  displayNames: Map<number, string>;
  /** Delivery destinations by id, to name where a delivery is going. */
  deliveryNames: Map<number, string>;
  stages: Map<string, ProductionStage>;
  /** Origin the "open in Gems" link points at, e.g. https://jimgem.vercel.app */
  appUrl: string;
}

/** Where an event sits: a whole day, or a clock time in Israel. */
export type EventWhen = { date: string } | { dateTime: string; timeZone: string };

/** The fields of a Google Calendar event this app writes. */
export interface CalendarEventBody {
  id: string;
  summary: string;
  location: string;
  description: string;
  start: EventWhen;
  end: EventWhen;
  status: "confirmed" | "tentative";
  transparency: "transparent" | "opaque";
}

/** Every order's times are Israel's clock; Google is told so per event. */
export const TIME_ZONE = "Asia/Jerusalem";
/** An order has a start but no end, so an event is drawn this long. */
export const EVENT_MINUTES = 180;
/** And a delivery this long. */
export const DELIVERY_MINUTES = 60;

/**
 * The event's id in Google, derived from the order rather than stored.
 *
 * Google lets a client choose an event's id (lowercase a–v and digits,
 * five or more), and choosing it is what makes the sync safe to run twice
 * at once: two saves a second apart each start a sync, and both writing
 * order 42 land on the same event instead of making two. Every letter of
 * "gemsorder" is in that alphabet.
 */
export function calendarEventId(orderId: number | string): string {
  return `gemsorder${orderId}`;
}

/** The delivery's own event — "gemsdlv": every letter is in Google's a–v alphabet. */
export function deliveryEventId(orderId: number | string): string {
  return `gemsdlv${orderId}`;
}

/** "2026-11-23" → "2026-11-24". An all-day event's end is the day after. */
export function nextDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  // Date.UTC, not new Date(y, m, d): the server runs in UTC and a
  // local-time date is how a day goes missing across a clock change.
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

/**
 * A clock time `minutes` later, carried into the next day past midnight —
 * an event starting at 22:00 for three hours ends at 01:00 the day after.
 * Plain arithmetic on the wall clock: Google applies the time zone.
 */
export function laterOnClock(date: string, time: string, minutes: number): { date: string; time: string } {
  const [hours, mins] = time.split(":").map(Number);
  const total = hours * 60 + mins + minutes;
  const days = Math.floor(total / 1440);
  const rest = total - days * 1440;
  let day = date;
  for (let i = 0; i < days; i += 1) day = nextDay(day);
  const hh = String(Math.floor(rest / 60)).padStart(2, "0");
  const mm = String(rest % 60).padStart(2, "0");
  return { date: day, time: `${hh}:${mm}` };
}

/** Start and end for an order's day, timed when there is a time. */
function span(date: string, time: string | null, minutes: number): { start: EventWhen; end: EventWhen } {
  if (!time) return { start: { date }, end: { date: nextDay(date) } };
  const end = laterOnClock(date, time, minutes);
  return {
    start: { dateTime: `${date}T${time}:00`, timeZone: TIME_ZONE },
    end: { dateTime: `${end.date}T${end.time}:00`, timeZone: TIME_ZONE },
  };
}

/**
 * The events one order puts in a calendar: always the order itself, and a
 * delivery of its own when the order is delivered *and* has a delivery
 * time. An order with times sits at its hours; without, the event is an
 * all-day one as it always was. Each is led by a mark that reads at a
 * glance in a crowded week — 🎉 for the event, 🚚 for the van.
 */
export function orderEvents(order: Order, ctx: EventContext): CalendarEventBody[] {
  const booked = isBooked(order, ctx.stages);
  const units = orderUnits(order.packageLines, ctx.unitsPerPackage);
  const customer = order.customer.trim() || "Order";
  const unitsText = units > 0 ? `${units.toLocaleString("en-US")} units` : null;
  const link = `Open in Gems: ${new URL(`/orders?order=${order.key}`, ctx.appUrl).toString()}`;
  const status = booked ? "confirmed" : "tentative";
  const delivered = hasDelivery(order);
  const deliveryPlace =
    order.deliveryOptionId !== null ? ctx.deliveryNames.get(order.deliveryOptionId) ?? null : null;

  // The title is what a week view has room for: who, and how much. A quote
  // may never happen, so it says so and is drawn tentative (outlined).
  const title = [customer, unitsText].filter(Boolean).join(" · ");

  const lines: string[] = [];
  const stage = ctx.stages.get(order.productionStatus)?.label;
  if (stage) lines.push(`Status: ${stage}`);
  if (order.customerType) lines.push(`Type: ${order.customerType}`);
  if (order.guests) lines.push(`Guests: ${order.guests}`);

  if (order.packageLines.length > 0) {
    lines.push("", "What to make:");
    for (const line of order.packageLines) {
      const id = Number(line.packageTypeId);
      const label = packageLineLabel(line, ctx.unitsPerPackage, ctx.packageNames.get(id) ?? "package");
      const flavors = line.flavors
        .filter((entry) => entry.units > 0)
        .map((entry) => `${ctx.flavorNames.get(Number(entry.flavorId)) ?? "?"} ${entry.units}`)
        .join(", ");
      lines.push(`• ${label}${flavors ? ` — ${flavors}` : " — no flavours yet"}`);
    }
  }

  const extras: string[] = [];
  if (displayCount(order.displays) > 0) {
    extras.push(
      ...order.displays
        .filter((entry) => entry.quantity > 0)
        .map((entry) => `${ctx.displayNames.get(entry.optionId) ?? "Display"} ×${entry.quantity}`),
    );
  }
  if (order.waitresses) extras.push(`Waitresses ×${order.waitresses}`);
  if (order.kosher) extras.push("Kosher");
  if (delivered) {
    const when = order.deliveryTime ? ` at ${order.deliveryTime}` : "";
    extras.push(`Delivery${deliveryPlace ? ` to ${deliveryPlace}` : ""}${when}`);
  }
  if (extras.length > 0) lines.push("", `Extras: ${extras.join(", ")}`);

  if (order.notes.trim()) lines.push("", order.notes.trim());
  lines.push("", link);

  const events: CalendarEventBody[] = [
    {
      id: calendarEventId(order.key),
      summary: `🎉 ${booked ? "" : "Quote · "}${title}`,
      location: order.location.trim(),
      description: lines.join("\n"),
      ...span(order.date, order.eventTime, EVENT_MINUTES),
      status,
      // A timed event is time actually spent, so it shows as busy. An
      // all-day one would block the whole day in anyone's free/busy, so it
      // is shown as free — a booking never hides a meeting slot.
      transparency: order.eventTime ? "opaque" : "transparent",
    },
  ];

  if (delivered && order.deliveryTime) {
    const details = [
      `Delivery for ${customer}${deliveryPlace ? ` — ${deliveryPlace}` : ""}`,
      unitsText ? `Taking: ${unitsText}` : null,
      order.eventTime ? `The event starts at ${order.eventTime}` : null,
      "",
      link,
    ].filter((line): line is string => line !== null);
    events.push({
      id: deliveryEventId(order.key),
      summary: `🚚 ${booked ? "" : "Quote · "}Delivery · ${customer}`,
      location: order.location.trim(),
      description: details.join("\n"),
      ...span(order.date, order.deliveryTime, DELIVERY_MINUTES),
      status,
      transparency: "opaque",
    });
  }

  return events;
}

/**
 * A fingerprint of everything an order puts in the calendar. A sync writes
 * an order only when this differs from the one stored for it, so an order
 * nobody touched costs no call to Google.
 */
export function eventsHash(events: CalendarEventBody[]): string {
  return crypto.createHash("sha256").update(JSON.stringify(events)).digest("hex");
}
