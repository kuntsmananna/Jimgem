/**
 * Events in Postgres (v0.100 event register, stage 1: setting one up).
 * See `eventTypes.ts` for the shapes and migration 040 for the tables.
 *
 * An event saves as a whole, in **one statement**, the way an order does
 * (this driver has no interactive transactions): the event row, then its
 * products — rows no longer listed deleted and the rest upserted, since
 * deleting and re-inserting the same key in sibling CTEs collides — and
 * its deals replaced outright, which is safe because each new deal gets a
 * new id. Every child CTE depends on the event row having matched, so a
 * stale save (`expectedUpdatedAt` no longer current) or a deleted event
 * writes nothing at all and is reported as a conflict.
 */

import { getDb, isMissingColumn, isMissingTable } from "./db";
import { StaleWriteError } from "./orders";
import type { DealKind, EventInput, EventStatus, PayMode, QrMode, SaleEvent } from "./eventTypes";

interface EventRow {
  id: number;
  name: string;
  date: string | Date;
  starts_at: string | null;
  ends_at: string | null;
  location: string;
  pay_mode: PayMode;
  qr_mode: QrMode;
  count_stock: boolean;
  seller_ids: number[] | null;
  status: EventStatus;
  notes: string;
  updated_at: string | Date;
  updated_by: string | null;
  /** Missing before migration 042. */
  public_token?: string | null;
  products: { preset_id: number; price: string | number; brought: number | null }[] | null;
  deals:
    | { kind: DealKind; min_qty: number; price: string | number | null; percent: string | number | null; preset_ids: number[] }[]
    | null;
}

const isoDay = (value: string | Date) =>
  typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
const clock = (value: string | null) => (value ? value.slice(0, 5) : null);
const num = (value: string | number | null) => (value === null ? null : Number(value));

function mapEvent(row: EventRow): SaleEvent {
  return {
    id: row.id,
    name: row.name,
    date: isoDay(row.date),
    startsAt: clock(row.starts_at),
    endsAt: clock(row.ends_at),
    location: row.location,
    payMode: row.pay_mode,
    qrMode: row.qr_mode,
    countStock: row.count_stock,
    sellerIds: row.seller_ids ?? [],
    status: row.status,
    notes: row.notes,
    updatedAt: new Date(row.updated_at).toISOString(),
    updatedBy: row.updated_by ?? "",
    publicToken: row.public_token ?? "",
    products: (row.products ?? []).map((p) => ({ presetId: p.preset_id, price: Number(p.price), brought: p.brought })),
    deals: (row.deals ?? []).map((d) => ({
      kind: d.kind,
      minQty: d.min_qty,
      price: num(d.price),
      percent: num(d.percent),
      presetIds: d.preset_ids ?? [],
    })),
  };
}

/** The event with its products and deals as two JSON arrays, in their saved order. */
const SELECT_EVENT = `
  SELECT e.*,
         COALESCE((SELECT json_agg(json_build_object('preset_id', p.preset_id, 'price', p.price, 'brought', p.brought)
                                   ORDER BY p.position)
                     FROM event_products p WHERE p.event_id = e.id), '[]') AS products,
         COALESCE((SELECT json_agg(json_build_object('kind', d.kind, 'min_qty', d.min_qty, 'price', d.price,
                                                     'percent', d.percent, 'preset_ids', d.preset_ids)
                                   ORDER BY d.position, d.id)
                     FROM event_deals d WHERE d.event_id = e.id), '[]') AS deals
    FROM events e`;

/** Every live event, soonest-dated last. Empty before migration 040. */
export async function getEvents(): Promise<{ available: boolean; events: SaleEvent[] }> {
  try {
    const { rows } = await getDb().query<EventRow>(
      `${SELECT_EVENT} WHERE e.deleted_at IS NULL ORDER BY e.date DESC, e.id DESC`,
    );
    return { available: true, events: rows.map(mapEvent) };
  } catch (error) {
    if (isMissingTable(error, "events")) return { available: false, events: [] };
    throw error;
  }
}

export async function getEvent(id: number): Promise<SaleEvent | null> {
  const { rows } = await getDb().query<EventRow>(`${SELECT_EVENT} WHERE e.id = $1 AND e.deleted_at IS NULL`, [id]);
  return rows[0] ? mapEvent(rows[0]) : null;
}

/**
 * The event a shop address names (v0.102). Null for a bad token, a deleted
 * event, or a database without migration 042 yet, where no shop exists.
 */
export async function getEventByToken(token: string): Promise<SaleEvent | null> {
  if (!/^[0-9a-f]{20}$/.test(token)) return null;
  try {
    const { rows } = await getDb().query<EventRow>(
      `${SELECT_EVENT} WHERE e.public_token = $1 AND e.deleted_at IS NULL`,
      [token],
    );
    return rows[0] ? mapEvent(rows[0]) : null;
  } catch (error) {
    if (isMissingColumn(error, "public_token")) return null;
    throw error;
  }
}

/** The children as JSON for `jsonb_to_recordset`, with their position. */
function childJson(input: EventInput) {
  return {
    products: JSON.stringify(
      input.products.map((p, position) => ({ preset_id: p.presetId, price: p.price, brought: p.brought, position })),
    ),
    deals: JSON.stringify(
      input.deals.map((d, position) => ({
        kind: d.kind,
        min_qty: d.minQty,
        price: d.price,
        percent: d.percent,
        preset_ids: d.presetIds,
        position,
      })),
    ),
  };
}

const PRODUCT_RECORDS = `jsonb_to_recordset($11::jsonb) AS x(preset_id int, price numeric, brought int, position int)`;
const DEAL_RECORDS = `jsonb_to_recordset($12::jsonb) AS x(kind text, min_qty int, price numeric, percent numeric, preset_ids int[], position int)`;

function eventValues(input: EventInput) {
  return [
    input.name,
    input.date,
    input.startsAt,
    input.endsAt,
    input.location,
    input.payMode,
    input.qrMode,
    input.countStock,
    input.sellerIds,
    input.status,
  ];
}

/** Creates an event with everything set up for it. Returns its id. */
export async function createEvent(input: EventInput, editor?: string): Promise<number> {
  const children = childJson(input);
  const { rows } = await getDb().query<{ id: number }>(
    `WITH ev AS (
       INSERT INTO events (name, date, starts_at, ends_at, location, pay_mode, qr_mode, count_stock, seller_ids, status, notes, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $13, $14)
       RETURNING id
     ), prod AS (
       INSERT INTO event_products (event_id, preset_id, price, brought, position)
       SELECT ev.id, x.preset_id, x.price, x.brought, x.position FROM ev, ${PRODUCT_RECORDS}
     ), deal AS (
       INSERT INTO event_deals (event_id, kind, min_qty, price, percent, preset_ids, position)
       SELECT ev.id, x.kind, x.min_qty, x.price, x.percent, COALESCE(x.preset_ids, '{}'), x.position FROM ev, ${DEAL_RECORDS}
     )
     SELECT id FROM ev`,
    [...eventValues(input), children.products, children.deals, input.notes, editor ?? null],
  );
  return rows[0].id;
}

/**
 * Saves an event over itself. With `expectedUpdatedAt`, a save over a
 * version somebody else has since saved is refused (StaleWriteError), the
 * order form's rule — two people set events up too.
 */
export async function updateEvent(id: number, input: EventInput, editor?: string, expectedUpdatedAt?: string): Promise<void> {
  const children = childJson(input);
  const { rows } = await getDb().query<{ id: number }>(
    `WITH ev AS (
       UPDATE events
          SET name = $1, date = $2, starts_at = $3, ends_at = $4, location = $5, pay_mode = $6, qr_mode = $7,
              count_stock = $8, seller_ids = $9, status = $10, notes = $13, updated_by = $14, updated_at = now()
        WHERE id = $15 AND deleted_at IS NULL AND ($16::timestamptz IS NULL OR updated_at = $16::timestamptz)
        RETURNING id
     ), gone AS (
       DELETE FROM event_products
        WHERE event_id IN (SELECT id FROM ev)
          AND NOT (preset_id = ANY (SELECT x.preset_id FROM ${PRODUCT_RECORDS}))
     ), prod AS (
       INSERT INTO event_products (event_id, preset_id, price, brought, position)
       SELECT ev.id, x.preset_id, x.price, x.brought, x.position FROM ev, ${PRODUCT_RECORDS}
       ON CONFLICT (event_id, preset_id) DO UPDATE
         SET price = EXCLUDED.price, brought = EXCLUDED.brought, position = EXCLUDED.position
     ), old_deals AS (
       DELETE FROM event_deals WHERE event_id IN (SELECT id FROM ev)
     ), deal AS (
       INSERT INTO event_deals (event_id, kind, min_qty, price, percent, preset_ids, position)
       SELECT ev.id, x.kind, x.min_qty, x.price, x.percent, COALESCE(x.preset_ids, '{}'), x.position FROM ev, ${DEAL_RECORDS}
     )
     SELECT id FROM ev`,
    [...eventValues(input), children.products, children.deals, input.notes, editor ?? null, id, expectedUpdatedAt ?? null],
  );
  if (rows.length === 0) {
    throw new StaleWriteError("event");
  }
}

/** Puts an event aside; nothing is destroyed, as with an order. */
export async function deleteEvent(id: number, editor?: string): Promise<void> {
  await getDb().query("UPDATE events SET deleted_at = now(), updated_by = $2 WHERE id = $1 AND deleted_at IS NULL", [
    id,
    editor ?? null,
  ]);
}
