/**
 * What events sold, for the reports and the statistics popup (v0.103,
 * events stage 4). Paid sales only, everywhere: an open card sale may
 * never be paid, and a cancelled one never was.
 *
 * Event takings count as **revenue** in the Dashboard and the Biz Plan —
 * by the event's date, since that is when the boxes went — but not as
 * orders: a sale at a stall is a customer, not a booking, and counting
 * them as orders would halve the average order value the Biz Plan divides
 * out. Their VAT is the business's current rate, included in the price:
 * every event is after the business registered, and a stall's price is
 * what the customer pays.
 */

import { getDb, isMissingTable } from "./db";
import { SELF_SERVICE } from "./eventSales";

const VAT_RATE = `COALESCE((SELECT amount FROM prices WHERE key = 'vat_rate'), 0)`;

/** Boxes in a sale's items, as jelly units — each box its preset's package size. */
const SALE_UNITS = `(SELECT COALESCE(sum((i ->> 'qty')::int * COALESCE(pt.units_per_package, 0)), 0)
     FROM jsonb_array_elements(s.items) i
     LEFT JOIN content_presets cp ON cp.id = (i ->> 'presetId')::int
     LEFT JOIN package_types pt ON pt.id = cp.package_type_id)`;

export interface EventMonth {
  month: number;
  /** What customers paid, VAT included. */
  total: number;
  netTotal: number;
  sales: number;
  units: number;
}

/** Paid event takings per month of one year. Empty before migration 041. */
export async function getEventMonths(year: number): Promise<EventMonth[]> {
  try {
    const { rows } = await getDb().query<{ month: number; total: string; net: string; sales: string; units: string }>(
      `SELECT extract(month FROM e.date)::int AS month,
              sum(s.total) AS total,
              sum(s.total / (1 + ${VAT_RATE} / 100)) AS net,
              count(*) AS sales,
              sum(${SALE_UNITS}) AS units
         FROM event_sales s JOIN events e ON e.id = s.event_id
        WHERE s.status = 'paid' AND e.deleted_at IS NULL AND extract(year FROM e.date) = $1
        GROUP BY 1 ORDER BY 1`,
      [year],
    );
    return rows.map((r) => ({
      month: r.month,
      total: Number(r.total),
      netTotal: Math.round(Number(r.net) * 100) / 100,
      sales: Number(r.sales),
      units: Number(r.units),
    }));
  } catch (error) {
    if (isMissingTable(error, "event_sales")) return [];
    throw error;
  }
}

/** One event as a row in a list: what it took and how many it served. */
export interface EventSummary {
  id: number;
  name: string;
  date: string;
  location: string;
  sales: number;
  takings: number;
  netTakings: number;
}

/** Every live event with its paid takings, newest first — `year` narrows it. */
export async function getEventSummaries(year?: number): Promise<EventSummary[]> {
  try {
    const { rows } = await getDb().query<{
      id: number;
      name: string;
      date: string | Date;
      location: string;
      sales: string;
      takings: string;
      net: string;
    }>(
      `SELECT e.id, e.name, e.date, e.location,
              count(s.id) AS sales,
              COALESCE(sum(s.total), 0) AS takings,
              COALESCE(sum(s.total / (1 + ${VAT_RATE} / 100)), 0) AS net
         FROM events e
         LEFT JOIN event_sales s ON s.event_id = e.id AND s.status = 'paid'
        WHERE e.deleted_at IS NULL AND ($1::int IS NULL OR extract(year FROM e.date) = $1)
        GROUP BY e.id ORDER BY e.date DESC, e.id DESC`,
      [year ?? null],
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      date: typeof r.date === "string" ? r.date.slice(0, 10) : r.date.toISOString().slice(0, 10),
      location: r.location,
      sales: Number(r.sales),
      takings: Number(r.takings),
      netTakings: Math.round(Number(r.net) * 100) / 100,
    }));
  } catch (error) {
    if (isMissingTable(error, "event_sales") || isMissingTable(error, "events")) return [];
    throw error;
  }
}

/** One paid sale, as the popup lists it. */
export interface StatsSale {
  id: number;
  /** Israel's wall clock, "HH:MM". */
  time: string;
  /** Minutes since midnight, Israel time — for the timeline. */
  minute: number;
  items: { presetId: number; qty: number }[];
  deal: string;
  how: "card" | "cash" | "self";
  total: number;
  discount: number;
}

export interface EventStats {
  sales: StatsSale[];
  /** The business's VAT rate, in percent — for the net figure. */
  vatRate: number;
}

const ISRAEL_CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jerusalem",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Every paid sale of one event, oldest first. */
export async function getEventStats(eventId: number): Promise<EventStats> {
  const db = getDb();
  const [{ rows }, vat] = await Promise.all([
    db.query<{
      id: number;
      at: string | Date;
      items: { presetId: number; qty: number }[];
      deal: string;
      method: "card" | "cash";
      seller: string | null;
      total: string;
      discount: string;
    }>(
      `SELECT id, COALESCE(paid_at, created_at) AS at, items, deal, method, seller, total, discount
         FROM event_sales WHERE event_id = $1 AND status = 'paid' ORDER BY COALESCE(paid_at, created_at), id`,
      [eventId],
    ),
    db.query<{ amount: string }>("SELECT amount FROM prices WHERE key = 'vat_rate'"),
  ]);
  return {
    vatRate: Number(vat.rows[0]?.amount ?? 0),
    sales: rows.map((r) => {
      const time = ISRAEL_CLOCK.format(new Date(r.at));
      const [h, m] = time.split(":").map(Number);
      return {
        id: r.id,
        time,
        minute: h * 60 + m,
        items: (r.items ?? []).map((i) => ({ presetId: i.presetId, qty: i.qty })),
        deal: r.deal,
        how: r.seller === SELF_SERVICE ? "self" : r.method,
        total: Number(r.total),
        discount: Number(r.discount),
      };
    }),
  };
}
