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
import { dealLabel, priceBasket, type BasketLine } from "./eventTypes";
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

  const link = await createSaleLink(id, priced.total, input.appUrl, input.seller);
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
