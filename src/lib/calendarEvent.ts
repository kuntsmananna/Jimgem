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
  stages: Map<string, ProductionStage>;
  /** Origin the "open in Gems" link points at, e.g. https://jimgem.vercel.app */
  appUrl: string;
}

/** The fields of a Google Calendar event this app writes. */
export interface CalendarEventBody {
  id: string;
  summary: string;
  location: string;
  description: string;
  start: { date: string };
  end: { date: string };
  status: "confirmed" | "tentative";
  transparency: "transparent";
}

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

/** "2026-11-23" → "2026-11-24". An all-day event's end is the day after. */
export function nextDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  // Date.UTC, not new Date(y, m, d): the server runs in UTC and a
  // local-time date is how a day goes missing across a clock change.
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

export function orderEvent(order: Order, ctx: EventContext): CalendarEventBody {
  const booked = isBooked(order, ctx.stages);
  const units = orderUnits(order.packageLines, ctx.unitsPerPackage);
  const customer = order.customer.trim() || "Order";

  // The title is what a month view has room for: who, and how much.
  const title = [customer, units > 0 ? `${units.toLocaleString("en-US")} units` : null].filter(Boolean).join(" · ");

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
  if (hasDelivery(order)) extras.push("Delivery");
  if (extras.length > 0) lines.push("", `Extras: ${extras.join(", ")}`);

  if (order.notes.trim()) lines.push("", order.notes.trim());
  lines.push("", `Open in Gems: ${new URL(`/orders?order=${order.key}`, ctx.appUrl).toString()}`);

  return {
    id: calendarEventId(order.key),
    // A quote may never happen: said in the title and drawn as tentative,
    // which Google renders as an outlined event rather than a solid one.
    summary: booked ? title : `Quote · ${title}`,
    location: order.location.trim(),
    description: lines.join("\n"),
    start: { date: order.date },
    end: { date: nextDay(order.date) },
    status: booked ? "confirmed" : "tentative",
    // An all-day event marked busy would block the whole day in anyone's
    // free/busy — shown as "free" so a booking never hides a meeting slot.
    transparency: "transparent",
  };
}

/**
 * A fingerprint of what an event says. A sync writes an order only when
 * this differs from the one stored for it, so an order nobody touched
 * costs no call to Google.
 */
export function eventHash(event: CalendarEventBody): string {
  return crypto.createHash("sha256").update(JSON.stringify(event)).digest("hex");
}
