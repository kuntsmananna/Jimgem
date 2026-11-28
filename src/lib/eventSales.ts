/**
 * Selling at an event (v0.101, the register). A sale is priced **on the
 * server** from the event's own prices and deals — the register sends only
 * what was taken, never a price, so a tampered or stale screen cannot
 * charge anything the event does not say. Cash is paid on the spot; card
 * goes through a payment link (`createSaleLink`) and is paid when SUMIT
 * confirms it, through the same return page, ↻ check and nightly net as an
 * order's link.
 */

import { getDb, isMissingTable } from "./db";
import { getEvent } from "./events";
import { dealLabel, priceBasket, SELF_SERVICE, type BasketLine } from "./eventTypes";
import { createSaleLink, PaymentLinkError } from "./paymentLinks";
import { paymentPageUrl } from "./paymentLinkTypes";

export interface SaleItem {
  presetId: number;
  qty: number;
}

export type SaleStatus = "open" | "paid" | "cancelled";

export interface EventTally {
  available: boolean;
  /** Paid sales so far. */
  sales: number;
  takings: number;
  /** Boxes sold per preset, paid sales only. */
  sold: Record<number, number>;
}

/** What the register shows at the top and on each tile. */
export async function getEventTally(eventId: number): Promise<EventTally> {
  try {
    const { rows } = await getDb().query<{ items: SaleItem[]; total: string }>(
      "SELECT items, total FROM event_sales WHERE event_id = $1 AND status = 'paid'",
      [eventId],
    );
    const sold: Record<number, number> = {};
    let takings = 0;
    for (const row of rows) {
      takings += Number(row.total);
      for (const item of row.items ?? []) sold[item.presetId] = (sold[item.presetId] ?? 0) + item.qty;
    }
    return { available: true, sales: rows.length, takings: Math.round(takings * 100) / 100, sold };
  } catch (error) {
    if (isMissingTable(error, "event_sales")) return { available: false, sales: 0, takings: 0, sold: {} };
    throw error;
  }
}

/**
 * Records a sale. Cash comes back paid; card comes back open with the
 * customer's payment page address to show as a QR.
 */
export async function recordSale(input: {
  eventId: number;
  items: SaleItem[];
  method: "card" | "cash";
  seller?: string;
  appUrl: string;
  /** A self-service basket: no SUMIT page until the customer presses Pay. */
  lazy?: boolean;
}): Promise<{ id: number; total: number; status: SaleStatus; payUrl: string | null }> {
  const event = await getEvent(input.eventId);
  if (!event) throw new PaymentLinkError("That event no longer exists.");
  const price = new Map(event.products.map((p) => [p.presetId, p.price]));
  const items = input.items.filter((i) => i.qty > 0);
  if (items.length === 0) throw new PaymentLinkError("Nothing in the basket yet.");
  for (const item of items) {
    if (!price.has(item.presetId)) throw new PaymentLinkError("A box in the basket isn't on this event's table.");
  }
  const lines: BasketLine[] = items.map((i) => ({ presetId: i.presetId, qty: i.qty, unitPrice: price.get(i.presetId)! }));
  const priced = priceBasket(lines, event.deals);
  if (input.method === "card" && !(priced.total > 0)) throw new PaymentLinkError("There is nothing to charge.");
  const stored = lines.map((l) => ({ presetId: l.presetId, qty: l.qty, unitPrice: l.unitPrice }));

  const { rows } = await getDb().query<{ id: number }>(
    `INSERT INTO event_sales (event_id, items, subtotal, discount, total, deal, method, status, seller, paid_at)
     VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $8 = 'paid' THEN now() END)
     RETURNING id`,
    [
      input.eventId,
      JSON.stringify(stored),
      priced.subtotal,
      priced.discount,
      priced.total,
      priced.deal === null ? "" : dealLabel(event.deals[priced.deal]),
      input.method,
      input.method === "cash" ? "paid" : "open",
      input.seller ?? null,
    ],
  );
  const id = rows[0].id;
  if (input.method === "cash") return { id, total: priced.total, status: "paid", payUrl: null };

  const link = await createSaleLink(id, priced.total, input.appUrl, input.seller, { lazy: input.lazy });
  return { id, total: priced.total, status: "open", payUrl: paymentPageUrl(input.appUrl, link.token) };
}

/** A sale's state, for the register waiting on a card payment — a database read, no SUMIT call. */
export async function getSaleStatus(id: number): Promise<{ status: SaleStatus; total: number } | null> {
  const { rows } = await getDb().query<{ status: SaleStatus; total: string }>(
    "SELECT status, total FROM event_sales WHERE id = $1",
    [id],
  );
  return rows[0] ? { status: rows[0].status, total: Number(rows[0].total) } : null;
}

/**
 * The seller gave up on a card payment (the customer walked off), or took
 * cash for it instead: the sale is cancelled, or turned into a paid cash
 * sale, and its link stops taking payment — in one statement. A payment
 * that lands anyway is still recorded on the link by the usual checks.
 */
export async function settleOpenSale(id: number, how: "cancel" | "cash"): Promise<SaleStatus | null> {
  const { rows } = await getDb().query<{ status: SaleStatus }>(
    `WITH sale AS (
       UPDATE event_sales
          SET status = CASE WHEN $2 = 'cash' THEN 'paid' ELSE 'cancelled' END,
              method = CASE WHEN $2 = 'cash' THEN 'cash' ELSE method END,
              paid_at = CASE WHEN $2 = 'cash' THEN now() ELSE paid_at END
        WHERE id = $1 AND status = 'open'
        RETURNING status, payment_link_id
     ), link AS (
       UPDATE payment_links SET status = 'cancelled', updated_at = now()
        WHERE id = (SELECT payment_link_id FROM sale) AND status = 'open'
     )
     SELECT status FROM sale`,
    [id, how],
  );
  if (rows[0]) return rows[0].status;
  return (await getSaleStatus(id))?.status ?? null;
}


/**
 * How many baskets one stall's shop may open in ten minutes before it
 * refuses more. The shop is public and printed on a sign; a basket costs
 * no SUMIT call, but a script filling the table with open sales is still
 * worth stopping. Far above what a queue at a stall can produce.
 */
const SHOP_BASKETS_PER_10_MIN = 120;

export async function shopIsBusy(eventId: number): Promise<boolean> {
  const { rows } = await getDb().query<{ n: string }>(
    `SELECT count(*) AS n FROM event_sales
      WHERE event_id = $1 AND seller = $2 AND created_at > now() - interval '10 minutes'`,
    [eventId, SELF_SERVICE],
  );
  return Number(rows[0]?.n ?? 0) >= SHOP_BASKETS_PER_10_MIN;
}

/** What a customer's proof screen shows, found by their payment link's token. */
export interface SaleProof {
  saleId: number;
  eventName: string;
  selfService: boolean;
  items: SaleItem[];
  paidAt: string | null;
  handedAt: string | null;
}

export async function getSaleProof(linkToken: string): Promise<SaleProof | null> {
  // handed_at read through to_jsonb so a database without migration 042
  // answers "not handed over" rather than failing the thank-you page.
  const { rows } = await getDb().query<{
    id: number;
    name: string;
    seller: string | null;
    items: SaleItem[];
    paid_at: string | Date | null;
    handed_at: string | null;
  }>(
    `SELECT s.id, e.name, s.seller, s.items, s.paid_at, to_jsonb(s) ->> 'handed_at' AS handed_at
       FROM event_sales s
       JOIN payment_links l ON l.id = s.payment_link_id
       JOIN events e ON e.id = s.event_id
      WHERE l.token = $1`,
    [linkToken],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    saleId: row.id,
    eventName: row.name,
    selfService: row.seller === SELF_SERVICE,
    items: row.items ?? [],
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    handedAt: row.handed_at ? new Date(row.handed_at).toISOString() : null,
  };
}

/**
 * Staff tapped "handed over" on the customer's proof screen. Only a paid
 * sale, and only once — a second tap answers with the first one's time.
 */
export async function handOver(linkToken: string): Promise<string | null> {
  const { rows } = await getDb().query<{ handed_at: string | Date }>(
    `WITH done AS (
       UPDATE event_sales s SET handed_at = now()
         FROM payment_links l
        WHERE l.id = s.payment_link_id AND l.token = $1 AND s.status = 'paid' AND s.handed_at IS NULL
        RETURNING s.handed_at
     )
     SELECT handed_at FROM done
     UNION ALL
     SELECT s.handed_at FROM event_sales s JOIN payment_links l ON l.id = s.payment_link_id
      WHERE l.token = $1 AND s.handed_at IS NOT NULL
     LIMIT 1`,
    [linkToken],
  );
  return rows[0] ? new Date(rows[0].handed_at).toISOString() : null;
}
