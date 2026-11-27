/**
 * Payment links (v0.99): a SUMIT payment page for an order, sent to the
 * customer by WhatsApp, email or a QR code.
 *
 * The customer is given **our** address (`/pay/<token>`), never SUMIT's.
 * SUMIT's page expires after at most 240 hours and is made for one
 * payment, while ours stays the same: it shows what is being paid for,
 * sends the customer on to a SUMIT page made fresh if the old one has run
 * out, and says "paid" once it is. The QR code on a phone screen and the
 * link in a message therefore never go stale.
 *
 * **A payment is believed only once SUMIT says so.** SUMIT sends the
 * customer back to `/pay/<token>/done` with its payment id in the query,
 * but anyone can type a URL, so the return page asks SUMIT about that id
 * (`getPayment`) and checks it is valid and carries this link's token
 * before anything is written. A customer who pays and closes the tab never
 * comes back at all, so the nightly cron runs `reconcileOpenLinks` — one
 * `payments/list` call covering every open link — and an admin can press
 * Check on a link for the same answer at once.
 *
 * Paying updates the order in the same statement that marks the link paid:
 * the amount is added to the deposit (which is what "paid so far" means
 * here), the status becomes Paid in full once the deposit covers the total
 * and Deposit paid before that, and Paid by becomes the credit-card method
 * where the owner's list has one. The `status <> 'paid'` guard is what
 * makes a return and the nightly check racing each other count it once.
 *
 * Every SUMIT call is metered (sumitBudget.ts). A link costs one call to
 * make and usually one to confirm; a reopened, expired one costs one more.
 */

import { randomBytes } from "node:crypto";
import { getDb, isMissingTable } from "./db";
import { getOrderById } from "./orders";
import { getClientById } from "./clients";
import { formatOrderDate, orderTotal, type Order } from "./orderTypes";
import { beginPaymentRedirect, getPayment, listValidPayments, type SumitPayment } from "./sumit";
import { flushSumitCalls } from "./sumitBudget";
import {
  PAYMENT_LINK_KIND_HEBREW,
  paymentPageUrl,
  type PaymentLink,
  type PaymentLinkKind,
  type PaymentLinkStatus,
} from "./paymentLinkTypes";

/** SUMIT's ceiling for a hosted page. */
const EXPIRATION_HOURS = 240;

/** A SUMIT page this close to running out is replaced rather than sent. */
const EXPIRY_MARGIN_MS = 30 * 60 * 1000;

/** Who the app names as the editor of a row SUMIT's answer changed. */
const SUMIT_EDITOR = "SUMIT";

interface LinkRow {
  id: number;
  token: string;
  order_id: number | null;
  kind: PaymentLinkKind;
  amount: string;
  sumit_url: string | null;
  sumit_expires_at: Date | null;
  status: PaymentLinkStatus;
  sumit_payment_id: string | null;
  sumit_document_id: string | null;
  paid_amount: string | null;
  paid_at: Date | null;
  created_at: Date;
  created_by: string | null;
}

function mapLink(row: LinkRow): PaymentLink {
  return {
    id: row.id,
    token: row.token,
    orderId: row.order_id,
    kind: row.kind,
    amount: Number(row.amount),
    status: row.status,
    paidAmount: row.paid_amount === null ? null : Number(row.paid_amount),
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    sumitDocumentId: row.sumit_document_id ? Number(row.sumit_document_id) : null,
    createdAt: new Date(row.created_at).toISOString(),
    createdBy: row.created_by ?? "",
  };
}

/** A refusal worth showing as it is — the caller answers 400 with it. */
export class PaymentLinkError extends Error {}

/** Every link an order has had, newest first. Empty before migration 039. */
export async function getLinksForOrder(orderId: number): Promise<{ available: boolean; links: PaymentLink[] }> {
  try {
    const { rows } = await getDb().query<LinkRow>(
      "SELECT * FROM payment_links WHERE order_id = $1 ORDER BY created_at DESC",
      [orderId],
    );
    return { available: true, links: rows.map(mapLink) };
  } catch (error) {
    if (isMissingTable(error, "payment_links")) return { available: false, links: [] };
    throw error;
  }
}

async function linkByToken(token: string): Promise<LinkRow | null> {
  // A token is 24 URL-safe characters; anything else is not one of ours,
  // and is answered without a query.
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  try {
    const { rows } = await getDb().query<LinkRow>("SELECT * FROM payment_links WHERE token = $1", [token]);
    return rows[0] ?? null;
  } catch (error) {
    if (isMissingTable(error, "payment_links")) return null;
    throw error;
  }
}

async function linkById(id: number): Promise<LinkRow | null> {
  const { rows } = await getDb().query<LinkRow>("SELECT * FROM payment_links WHERE id = $1", [id]);
  return rows[0] ?? null;
}

/** The order and its client, as SUMIT needs them. */
async function orderFor(orderId: number) {
  const order = await getOrderById(orderId);
  if (!order) throw new PaymentLinkError("That order no longer exists.");
  const client = order.clientId ? ((await getClientById(order.clientId)) ?? undefined) : undefined;
  return { order, client };
}

/**
 * Who pays and for what, as SUMIT and the customer's page need it — an
 * order's client, or an event sale's walk-in customer (v0.101).
 */
interface ChargeTarget {
  customer: { id: number | null; name: string; phone?: string | null; email?: string | null };
  itemName: string;
  description: string;
  vatRate?: number;
  /** For the customer's page. */
  customerName: string;
  date: string;
  receiptByEmail: boolean;
  items: { name: string; qty: number }[];
}

function orderTarget(kind: PaymentLinkKind, order: Order, client: Awaited<ReturnType<typeof orderFor>>["client"]): ChargeTarget {
  return {
    customer: {
      id: client?.sumitCustomerId ?? null,
      name: client?.name || order.customer || "לקוח",
      phone: client?.phone,
      email: client?.email,
    },
    // One income item per kind of charge, reused — see beginPaymentRedirect.
    itemName: `${PAYMENT_LINK_KIND_HEBREW[kind]} — הזמנת Gems`,
    description: `${order.customer} · ${formatOrderDate(order.date)}`,
    vatRate: order.vatMode === "exempt" ? 0 : undefined,
    customerName: order.customer,
    date: formatOrderDate(order.date),
    receiptByEmail: !!client?.email,
    items: [],
  };
}

/** An event sale's target: no client, a walk-in — "לקוח מזדמן" to SUMIT. */
async function saleTarget(saleId: number): Promise<ChargeTarget | null> {
  const { rows } = await getDb().query<{ name: string; date: string | Date; items: { presetId: number; qty: number }[]; names: Record<string, string> | null }>(
    `SELECT e.name, e.date, s.items,
            (SELECT json_object_agg(p.id, p.name) FROM content_presets p
              WHERE p.id IN (SELECT (i ->> 'presetId')::int FROM jsonb_array_elements(s.items) i)) AS names
       FROM event_sales s JOIN events e ON e.id = s.event_id
      WHERE s.id = $1`,
    [saleId],
  );
  const row = rows[0];
  if (!row) return null;
  const date = formatOrderDate(typeof row.date === "string" ? row.date.slice(0, 10) : row.date.toISOString().slice(0, 10));
  const items = (row.items ?? []).map((i) => ({ name: row.names?.[String(i.presetId)] ?? "Gems", qty: i.qty }));
  return {
    customer: { id: null, name: "לקוח מזדמן" },
    itemName: "רכישה באירוע — Gems",
    description: `${row.name} · ${items.map((i) => `${i.qty}× ${i.name}`).join(", ")}`.slice(0, 250),
    customerName: "",
    date,
    receiptByEmail: false,
    items,
  };
}

/** The target behind a stored link: its order, else the sale that points at it. */
async function targetForLink(row: LinkRow): Promise<ChargeTarget | null> {
  if (row.order_id !== null) {
    const found = await orderFor(row.order_id).catch(() => null);
    return found ? orderTarget(row.kind, found.order, found.client) : null;
  }
  const { rows } = await getDb().query<{ id: number }>("SELECT id FROM event_sales WHERE payment_link_id = $1", [row.id]);
  return rows[0] ? saleTarget(rows[0].id) : null;
}

/** Asks SUMIT for a page for this link. One metered call. */
async function sumitPageFor(
  link: { token: string; amount: number },
  target: ChargeTarget,
  appUrl: string,
): Promise<{ url: string; expiresAt: Date }> {
  const page = paymentPageUrl(appUrl, link.token);
  const url = await beginPaymentRedirect({
    customer: target.customer,
    items: [{ name: target.itemName, description: target.description, unitPrice: link.amount }],
    externalIdentifier: link.token,
    redirectUrl: `${page}/done`,
    cancelUrl: `${page}?cancelled=1`,
    expirationHours: EXPIRATION_HOURS,
    emailReceiptTo: target.customer.email || null,
    vatRate: target.vatRate,
  });
  return { url, expiresAt: new Date(Date.now() + EXPIRATION_HOURS * 3600 * 1000) };
}

/**
 * Makes a link for an order. SUMIT is asked first and the row written
 * after, so a refusal (Billing not enabled, the month's budget spent)
 * leaves nothing behind but the error.
 */
export async function createPaymentLink(input: {
  orderId: number;
  kind: PaymentLinkKind;
  amount: number;
  appUrl: string;
  editor?: string;
}): Promise<PaymentLink> {
  const amount = Math.round(input.amount * 100) / 100;
  if (!(amount > 0)) throw new PaymentLinkError("The amount has to be more than ₪0.");
  const { order, client } = await orderFor(input.orderId);
  const total = orderTotal(order);
  // Asking for more than the order comes to is a typo, not a request.
  if (total > 0 && amount > total + 0.5) {
    throw new PaymentLinkError("That is more than the whole order comes to.");
  }

  const token = randomBytes(18).toString("base64url");
  try {
    const page = await sumitPageFor({ token, amount }, orderTarget(input.kind, order, client), input.appUrl);
    const { rows } = await getDb().query<LinkRow>(
      `INSERT INTO payment_links (token, order_id, kind, amount, sumit_url, sumit_expires_at, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING *`,
      [token, input.orderId, input.kind, amount, page.url, page.expiresAt, input.editor ?? null],
    );
    return mapLink(rows[0]);
  } finally {
    await flushSumitCalls();
  }
}

export async function cancelPaymentLink(id: number, editor?: string): Promise<void> {
  await getDb().query(
    "UPDATE payment_links SET status = 'cancelled', updated_at = now(), updated_by = $2 WHERE id = $1 AND status = 'open'",
    [id, editor ?? null],
  );
}

/** What the customer's page shows — no more than the link and its order. */
export interface PublicPaymentLink {
  token: string;
  kind: PaymentLinkKind;
  amount: number;
  status: PaymentLinkStatus;
  paidAmount: number | null;
  paidAt: string | null;
  customer: string;
  /** "D/M". */
  date: string;
  receiptByEmail: boolean;
  /** What an event sale took; empty for an order. */
  items: { name: string; qty: number }[];
}

export async function getPublicLink(token: string): Promise<PublicPaymentLink | null> {
  const row = await linkByToken(token);
  if (!row) return null;
  const target = await targetForLink(row);
  if (!target) return null;
  const link = mapLink(row);
  return {
    token: link.token,
    kind: link.kind,
    amount: link.amount,
    status: link.status,
    paidAmount: link.paidAmount,
    paidAt: link.paidAt,
    customer: target.customerName,
    date: target.date,
    receiptByEmail: target.receiptByEmail,
    items: target.items,
  };
}

/**
 * Where the Pay button sends the customer: the SUMIT page on file, or a
 * new one when that has run out. Null when there is nothing to pay.
 */
export async function sumitUrlForCustomer(token: string, appUrl: string): Promise<string | null> {
  const row = await linkByToken(token);
  if (!row || row.status !== "open") return null;
  const expires = row.sumit_expires_at ? new Date(row.sumit_expires_at).getTime() : 0;
  if (row.sumit_url && expires - Date.now() > EXPIRY_MARGIN_MS) return row.sumit_url;

  const target = await targetForLink(row);
  if (!target) return null;
  try {
    const page = await sumitPageFor({ token: row.token, amount: Number(row.amount) }, target, appUrl);
    await getDb().query("UPDATE payment_links SET sumit_url = $2, sumit_expires_at = $3 WHERE id = $1", [
      row.id,
      page.url,
      page.expiresAt,
    ]);
    return page.url;
  } finally {
    await flushSumitCalls();
  }
}

/** Whether a SUMIT payment is this link's, paid. */
function paymentMatches(payment: SumitPayment | null, row: LinkRow): payment is SumitPayment {
  if (!payment || !payment.ValidPayment) return false;
  return payment.ExternalIdentifier === row.token;
}

/**
 * The return page's looser test, for a SUMIT that leaves ExternalIdentifier
 * out of a payment ("when available", its schema says). Only here, where
 * the payment's id came from SUMIT's own redirect to this link's address:
 * a valid payment of this link's amount, made since the link was created.
 * The payments list (the cron, ↻ Check) has no such id to lean on, so it
 * keeps the strict test.
 */
function returnMatches(payment: SumitPayment | null, row: LinkRow): payment is SumitPayment {
  if (!payment || !payment.ValidPayment) return false;
  if (payment.ExternalIdentifier) return payment.ExternalIdentifier === row.token;
  const sameAmount = Math.abs(payment.Amount - Number(row.amount)) < 0.01;
  const made = payment.Date ? new Date(payment.Date).getTime() : NaN;
  const since = new Date(row.created_at).getTime() - 24 * 3600 * 1000;
  return sameAmount && Number.isFinite(made) && made >= since;
}

/**
 * Records a confirmed payment, on the link and its order, once — see the
 * header. The order's total is worked out here (it is `orderTotal`'s
 * arithmetic, which lives in TypeScript) and handed to the statement.
 */
async function markPaid(row: LinkRow, payment: SumitPayment): Promise<void> {
  let total = 0;
  if (row.order_id !== null) {
    const order = await getOrderById(row.order_id);
    total = order ? orderTotal(order) : 0;
  }
  const paid = Number.isFinite(payment.Amount) && payment.Amount > 0 ? payment.Amount : Number(row.amount);
  await getDb().query(
    `WITH link AS (
       UPDATE payment_links
          SET status = 'paid', sumit_payment_id = $2, sumit_document_id = NULLIF($3, 0),
              paid_amount = $4, paid_at = now(), updated_at = now(), updated_by = $6
        WHERE id = $1 AND status <> 'paid'
        RETURNING order_id, paid_amount
     ), sale AS (
       UPDATE event_sales SET status = 'paid', paid_at = now()
        WHERE payment_link_id = $1 AND status <> 'paid' AND EXISTS (SELECT 1 FROM link)
     ), card AS (
       SELECT id FROM payment_methods
        WHERE archived_at IS NULL
          AND (name ILIKE '%אשראי%' OR name ILIKE '%כרטיס%' OR name ILIKE '%credit%' OR name ILIKE '%card%')
        ORDER BY id LIMIT 1
     )
     UPDATE orders o
        SET deposit = o.deposit + link.paid_amount,
            payment_status = CASE
              WHEN $5::numeric > 0 AND o.deposit + link.paid_amount >= $5::numeric - 0.5 THEN 'paid'
              WHEN o.payment_status IN ('paid', 'comp') THEN o.payment_status
              ELSE 'deposit' END,
            payment_method_id = COALESCE((SELECT id FROM card), o.payment_method_id),
            updated_at = now(), updated_by = $6
       FROM link
      WHERE o.id = link.order_id AND o.deleted_at IS NULL`,
    [row.id, payment.ID, payment.DocumentID ?? 0, paid, total, SUMIT_EDITOR],
  );

  // The SUMIT customer this payment landed on, kept for next time — only
  // where the client has none yet. A clash with another client's id is
  // left for a person to sort out, not fought over here.
  if (row.order_id !== null && payment.CustomerID) {
    await getDb()
      .query(
        `UPDATE clients SET sumit_customer_id = $2
          WHERE id = (SELECT client_id FROM orders WHERE id = $1) AND sumit_customer_id IS NULL`,
        [row.order_id, payment.CustomerID],
      )
      .catch(() => undefined);
  }
}

/**
 * The customer's return from SUMIT. Already paid → nothing to ask; else
 * one `payments/get` for the id the return carries. Returns the link's
 * state after.
 */
/**
 * Payment ids this process has already asked SUMIT about for a link, so a
 * reloaded thank-you page (or a made-up id) does not spend a metered call
 * each time. Per instance and short-lived — the cron and ↻ Check are the
 * net for anything it lets slip.
 */
const askedRecently = new Map<string, number>();
const ASK_AGAIN_MS = 10 * 60 * 1000;

export async function confirmReturn(token: string, paymentId: number | null): Promise<PaymentLinkStatus | null> {
  const row = await linkByToken(token);
  if (!row) return null;
  if (row.status === "paid" || paymentId === null) return row.status;
  const key = `${row.id}:${paymentId}`;
  const now = Date.now();
  if ((askedRecently.get(key) ?? 0) > now - ASK_AGAIN_MS) return row.status;
  askedRecently.set(key, now);
  if (askedRecently.size > 500) askedRecently.clear();
  try {
    const payment = await getPayment(paymentId);
    if (!returnMatches(payment, row)) return row.status;
    await markPaid(row, payment);
    return "paid";
  } finally {
    await flushSumitCalls();
  }
}

/**
 * An admin's Check on one link: by SUMIT's payment id where the return
 * left one, else through the payments list from the day it was made.
 */
export async function checkPaymentLink(id: number): Promise<PaymentLinkStatus | null> {
  const row = await linkById(id);
  if (!row) return null;
  if (row.status === "paid") return "paid";
  try {
    const payments = row.sumit_payment_id
      ? [await getPayment(Number(row.sumit_payment_id))]
      : await listValidPayments(dayBefore(new Date(row.created_at)), new Date());
    const payment = payments.find((p) => paymentMatches(p, row));
    if (!payment) return row.status;
    await markPaid(row, payment);
    return "paid";
  } finally {
    await flushSumitCalls();
  }
}

/**
 * The nightly net: every link still open whose SUMIT page could still have
 * been paid, checked against one list of SUMIT's payments. Costs nothing
 * on a night with no open links, one call otherwise.
 */
export async function reconcileOpenLinks(): Promise<{ open: number; paid: number }> {
  let rows: LinkRow[];
  try {
    ({ rows } = await getDb().query<LinkRow>(
      `SELECT * FROM payment_links
        WHERE status = 'open' AND sumit_url IS NOT NULL
          AND sumit_expires_at > now() - interval '1 day'
        ORDER BY created_at`,
    ));
  } catch (error) {
    if (isMissingTable(error, "payment_links")) return { open: 0, paid: 0 };
    throw error;
  }
  if (rows.length === 0) return { open: 0, paid: 0 };
  try {
    const payments = await listValidPayments(dayBefore(new Date(rows[0].created_at)), new Date());
    let paid = 0;
    for (const row of rows) {
      const payment = payments.find((p) => paymentMatches(p, row));
      if (!payment) continue;
      await markPaid(row, payment);
      paid += 1;
    }
    return { open: rows.length, paid };
  } finally {
    await flushSumitCalls();
  }
}

/** A day's slack either side, since SUMIT's dates are its own clock's. */
function dayBefore(date: Date): Date {
  return new Date(date.getTime() - 24 * 3600 * 1000);
}

/**
 * A card payment for an event sale (v0.101): the sale row is written
 * first (open), SUMIT is asked for a page, then the link is stored and the
 * sale pointed at it. A refusal from SUMIT leaves the sale open with no
 * link, which the register shows as a failure and can cancel.
 */
export async function createSaleLink(saleId: number, amount: number, appUrl: string, editor?: string): Promise<PaymentLink> {
  const target = await saleTarget(saleId);
  if (!target) throw new PaymentLinkError("That sale no longer exists.");
  const token = randomBytes(18).toString("base64url");
  try {
    const page = await sumitPageFor({ token, amount }, target, appUrl);
    const { rows } = await getDb().query<LinkRow>(
      `WITH link AS (
         INSERT INTO payment_links (token, order_id, kind, amount, sumit_url, sumit_expires_at, created_by, updated_by)
         VALUES ($1, NULL, 'sale', $2, $3, $4, $5, $5) RETURNING *
       ), sale AS (
         UPDATE event_sales SET payment_link_id = (SELECT id FROM link) WHERE id = $6
       )
       SELECT * FROM link`,
      [token, amount, page.url, page.expiresAt, editor ?? null, saleId],
    );
    return mapLink(rows[0]);
  } finally {
    await flushSumitCalls();
  }
}
