import { getDb } from "./db";
import {
  type PaymentStatus,
  type ProductionStatus,
  type OrderContentLine,
  type Order,
  type OrderInput,
} from "./orderTypes";

// Re-exported so existing server-side call sites (`@/lib/orders`) keep
// working unchanged — client components should import these (and the
// pure orderMonth/orderDay helpers) from `@/lib/orderTypes` directly to
// avoid pulling this module's server-only deps into a client bundle.
export type { PaymentStatus, ProductionStatus, OrderContentLine, Order, OrderInput };
export {
  PAYMENT_STATUS_LABEL,
  PRODUCTION_STATUS_LABEL,
  orderMonth,
  orderDay,
  orderUnits,
  orderFlavorUnits,
} from "./orderTypes";

/**
 * Fields editable one at a time from the Orders table's inline cells.
 * Every order is a DB row now (Sheet rows are imported, see
 * sheetImport.ts), so these are just column names — unlike the old
 * override path, which could only patch Sheet-sourced orders.
 */
export type EditableField =
  | "date"
  | "customer"
  | "customerType"
  | "location"
  | "guests"
  | "deliveryCost"
  | "mirrors"
  | "totalAmount"
  | "deposit"
  | "paymentStatus"
  | "productionStatus"
  | "notes";

const COLUMN_FOR_FIELD: Record<EditableField, string> = {
  date: "date",
  customer: "customer",
  customerType: "customer_type",
  location: "location",
  guests: "guests",
  deliveryCost: "delivery_cost",
  mirrors: "mirrors",
  totalAmount: "total_amount",
  deposit: "deposit",
  paymentStatus: "payment_status",
  productionStatus: "production_status",
  notes: "notes",
};

/** Patches individual fields on one order, leaving its content lines untouched. */
export async function updateOrderFields(
  id: number,
  patch: Partial<Record<EditableField, string | number | null>>,
): Promise<void> {
  const entries = (Object.entries(patch) as [EditableField, string | number | null][]).filter(
    ([field]) => field in COLUMN_FOR_FIELD,
  );
  if (entries.length === 0) return;

  const db = getDb();
  const assignments = entries.map(([field], i) => `${COLUMN_FOR_FIELD[field]} = $${i + 2}`);
  await db.query(`UPDATE orders SET ${assignments.join(", ")} WHERE id = $1`, [
    id,
    ...entries.map(([, value]) => value),
  ]);
}

interface DbOrderRow {
  id: number;
  date: string;
  customer: string;
  customer_type: string | null;
  location: string | null;
  guests: number | null;
  delivery_cost: string | null;
  mirrors: number | null;
  total_amount: string;
  deposit: string;
  payment_status: PaymentStatus;
  production_status: ProductionStatus;
  notes: string | null;
  sheet_row: number | null;
  details: string | null;
  needs_review: boolean;
}

interface DbContentLineRow {
  order_id: number;
  package_type_id: number | null;
  flavor_id: number | null;
  quantity: number;
}

/** Which axis a row describes is decided by which column is set — see schema.sql. */
function mapContentLine(row: DbContentLineRow): OrderContentLine {
  return row.package_type_id !== null
    ? {
        kind: "package",
        packageTypeId: String(row.package_type_id),
        quantity: row.quantity,
      }
    : {
        kind: "flavor",
        flavorId: String(row.flavor_id),
        quantity: row.quantity,
      };
}

function mapDbOrder(row: DbOrderRow, contentLines: OrderContentLine[]): Order {
  return {
    key: String(row.id),
    source: row.sheet_row !== null ? "sheet" : "db",
    date: row.date,
    customer: row.customer,
    customerType: row.customer_type ?? "",
    location: row.location ?? "",
    details: row.details ?? "",
    guests: row.guests,
    deliveryCost: row.delivery_cost !== null ? Number(row.delivery_cost) : null,
    mirrors: row.mirrors,
    contentLines,
    totalAmount: Number(row.total_amount),
    deposit: Number(row.deposit),
    paymentStatus: row.payment_status,
    productionStatus: row.production_status,
    notes: row.notes ?? "",
    needsReview: row.needs_review,
  };
}

/**
 * Every order, from Postgres alone. Sheet rows land here via
 * sheetImport.ts, so there is no read-time merge and no live Sheet call
 * on the render path any more.
 */
export async function getOrders(): Promise<Order[]> {
  const db = getDb();
  const [{ rows: orderRows }, { rows: lineRows }] = await Promise.all([
    db.query<DbOrderRow>("SELECT * FROM orders ORDER BY date DESC, id DESC"),
    db.query<DbContentLineRow>("SELECT * FROM order_content_lines"),
  ]);

  const linesByOrder = new Map<number, OrderContentLine[]>();
  for (const line of lineRows) {
    const list = linesByOrder.get(line.order_id) ?? [];
    list.push(mapContentLine(line));
    linesByOrder.set(line.order_id, list);
  }

  return orderRows.map((row) => mapDbOrder(row, linesByOrder.get(row.id) ?? []));
}

/**
 * Set-at-a-time status writes and deletes. One statement over `= ANY()`
 * rather than a query per id: every db.query is its own HTTP round trip
 * (see db.ts), so a select-all batch would otherwise fire ~80 of them at
 * once. Each returns the number of rows actually affected, which is what
 * lets callers report partial success.
 */
async function affectedRows(text: string, params: unknown[]): Promise<number> {
  const { rows } = await getDb().query<{ id: number }>(text, params);
  return rows.length;
}

export function setPaymentStatusMany(ids: number[], status: PaymentStatus): Promise<number> {
  return affectedRows("UPDATE orders SET payment_status = $1 WHERE id = ANY($2) RETURNING id", [status, ids]);
}

export function setProductionStatusMany(ids: number[], status: ProductionStatus): Promise<number> {
  return affectedRows("UPDATE orders SET production_status = $1 WHERE id = ANY($2) RETURNING id", [
    status,
    ids,
  ]);
}

export function deleteOrdersMany(ids: number[]): Promise<number> {
  return affectedRows("DELETE FROM orders WHERE id = ANY($1) RETURNING id", [ids]);
}

/**
 * Splits content lines into 3 parallel arrays for `unnest()` — Neon's HTTP
 * driver has no interactive multi-statement transactions (see db.ts), so
 * an order and its content lines are written atomically via a single SQL
 * statement with chained CTEs instead of BEGIN/COMMIT.
 */
function toLineArrays(contentLines: OrderContentLine[]) {
  return {
    packageTypeIds: contentLines.map((l) => (l.kind === "package" ? Number(l.packageTypeId) : null)),
    flavorIds: contentLines.map((l) => (l.kind === "flavor" ? Number(l.flavorId) : null)),
    quantities: contentLines.map((l) => l.quantity),
  };
}

export async function createOrder(input: OrderInput): Promise<Order> {
  const db = getDb();
  const { packageTypeIds, flavorIds, quantities } = toLineArrays(input.contentLines);

  const { rows } = await db.query<DbOrderRow>(
    `WITH new_order AS (
       INSERT INTO orders
         (date, customer, customer_type, location, guests, delivery_cost, mirrors,
          total_amount, deposit, payment_status, production_status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *
     ), inserted_lines AS (
       INSERT INTO order_content_lines (order_id, package_type_id, flavor_id, quantity)
       SELECT new_order.id, t.pkg, t.flv, t.qty
       FROM new_order, unnest($13::int[], $14::int[], $15::int[]) AS t(pkg, flv, qty)
       RETURNING 1
     )
     SELECT * FROM new_order`,
    [
      input.date,
      input.customer,
      input.customerType,
      input.location,
      input.guests,
      input.deliveryCost,
      input.mirrors,
      input.totalAmount,
      input.deposit,
      input.paymentStatus,
      input.productionStatus,
      input.notes,
      packageTypeIds,
      flavorIds,
      quantities,
    ],
  );
  return mapDbOrder(rows[0], input.contentLines);
}

export async function updateOrder(id: number, input: OrderInput): Promise<Order> {
  const db = getDb();
  const { packageTypeIds, flavorIds, quantities } = toLineArrays(input.contentLines);

  const { rows } = await db.query<DbOrderRow>(
    `WITH updated_order AS (
       UPDATE orders SET
         date = $1, customer = $2, customer_type = $3, location = $4, guests = $5,
         delivery_cost = $6, mirrors = $7, total_amount = $8, deposit = $9,
         payment_status = $10, production_status = $11, notes = $12
       WHERE id = $13
       RETURNING *
     ), deleted_lines AS (
       DELETE FROM order_content_lines WHERE order_id = $13
       RETURNING 1
     ), inserted_lines AS (
       INSERT INTO order_content_lines (order_id, package_type_id, flavor_id, quantity)
       SELECT $13, t.pkg, t.flv, t.qty
       FROM unnest($14::int[], $15::int[], $16::int[]) AS t(pkg, flv, qty)
       -- always-true condition on deleted_lines: CTEs with no data dependency
       -- between them run in an unspecified order, so this forces the delete
       -- to happen before the insert (otherwise it could wipe out the new rows)
       WHERE (SELECT count(*) FROM deleted_lines) >= 0
       RETURNING 1
     )
     SELECT * FROM updated_order`,
    [
      input.date,
      input.customer,
      input.customerType,
      input.location,
      input.guests,
      input.deliveryCost,
      input.mirrors,
      input.totalAmount,
      input.deposit,
      input.paymentStatus,
      input.productionStatus,
      input.notes,
      id,
      packageTypeIds,
      flavorIds,
      quantities,
    ],
  );
  return mapDbOrder(rows[0], input.contentLines);
}

export async function deleteOrder(id: number): Promise<void> {
  const db = getDb();
  await db.query("DELETE FROM orders WHERE id = $1", [id]);
}

export async function duplicateOrder(id: number): Promise<Order> {
  const db = getDb();
  const [{ rows: orderRows }, { rows: lineRows }] = await Promise.all([
    db.query<DbOrderRow>("SELECT * FROM orders WHERE id = $1", [id]),
    db.query<DbContentLineRow>("SELECT * FROM order_content_lines WHERE order_id = $1", [id]),
  ]);
  const source = orderRows[0];
  if (!source) throw new Error(`Order ${id} not found`);

  return createOrder({
    date: source.date,
    customer: source.customer,
    customerType: source.customer_type ?? "",
    location: source.location ?? "",
    guests: source.guests,
    deliveryCost: source.delivery_cost !== null ? Number(source.delivery_cost) : null,
    mirrors: source.mirrors,
    contentLines: lineRows.map(mapContentLine),
    totalAmount: Number(source.total_amount),
    deposit: Number(source.deposit),
    paymentStatus: source.payment_status,
    productionStatus: source.production_status,
    notes: source.notes ?? "",
  });
}
