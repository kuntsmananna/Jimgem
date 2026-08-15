import { getDb } from "./db";
import {
  type PaymentStatus,
  type ProductionStatus,
  type OrderLineFlavor,
  type OrderPackageLine,
  type Order,
  type OrderInput,
} from "./orderTypes";

// Re-exported so existing server-side call sites (`@/lib/orders`) keep
// working unchanged — client components should import these (and the
// pure orderMonth/orderDay helpers) from `@/lib/orderTypes` directly to
// avoid pulling this module's server-only deps into a client bundle.
export type { PaymentStatus, ProductionStatus, OrderLineFlavor, OrderPackageLine, Order, OrderInput };
export {
  PAYMENT_STATUS_LABEL,
  PRODUCTION_STATUS_LABEL,
  orderMonth,
  orderDay,
  orderUnits,
  orderFlavorUnits,
  linePackedUnits,
  lineAssignedUnits,
  lineRemainingUnits,
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
  | "mirrors"
  | "waitresses"
  | "kosher"
  | "deliveryCost"
  | "mirrorsCost"
  | "waitressCost"
  | "kosherCost"
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
  mirrors: "mirrors",
  waitresses: "waitresses",
  kosher: "kosher",
  deliveryCost: "delivery_cost",
  mirrorsCost: "mirrors_cost",
  waitressCost: "waitress_cost",
  kosherCost: "kosher_cost",
  totalAmount: "total_amount",
  deposit: "deposit",
  paymentStatus: "payment_status",
  productionStatus: "production_status",
  notes: "notes",
};

/** Patches individual fields on one order, leaving its content lines untouched. */
export async function updateOrderFields(
  id: number,
  patch: Partial<Record<EditableField, string | number | boolean | null>>,
): Promise<void> {
  const entries = (Object.entries(patch) as [EditableField, string | number | boolean | null][]).filter(
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
  mirrors: number | null;
  waitresses: number | null;
  kosher: boolean;
  delivery_cost: string | null;
  mirrors_cost: string | null;
  waitress_cost: string | null;
  kosher_cost: string | null;
  total_amount: string;
  deposit: string;
  payment_status: PaymentStatus;
  production_status: ProductionStatus;
  notes: string | null;
  sheet_row: number | null;
  details: string | null;
  needs_review: boolean;
}

interface DbPackageLineRow {
  id: number;
  order_id: number;
  package_type_id: number;
  quantity: number;
  position: number;
}

interface DbLineFlavorRow {
  line_id: number;
  flavor_id: number;
  units: number;
  position: number;
}

/**
 * Nests flat line and flavour rows into the shape the app works in.
 * Shared by every read path so the two-query fetch is written once.
 */
function nestPackageLines(
  lineRows: DbPackageLineRow[],
  flavorRows: DbLineFlavorRow[],
): Map<number, OrderPackageLine[]> {
  const flavorsByLine = new Map<number, OrderLineFlavor[]>();
  for (const row of [...flavorRows].sort((a, b) => a.position - b.position)) {
    const list = flavorsByLine.get(row.line_id) ?? [];
    list.push({ flavorId: String(row.flavor_id), units: row.units });
    flavorsByLine.set(row.line_id, list);
  }

  const linesByOrder = new Map<number, OrderPackageLine[]>();
  for (const row of [...lineRows].sort((a, b) => a.position - b.position)) {
    const list = linesByOrder.get(row.order_id) ?? [];
    list.push({
      packageTypeId: String(row.package_type_id),
      quantity: row.quantity,
      flavors: flavorsByLine.get(row.id) ?? [],
    });
    linesByOrder.set(row.order_id, list);
  }
  return linesByOrder;
}

/** NUMERIC arrives as a string, and an unset cost stays null rather than becoming 0. */
function money(value: string | null): number | null {
  return value !== null ? Number(value) : null;
}

function mapDbOrder(row: DbOrderRow, packageLines: OrderPackageLine[]): Order {
  return {
    key: String(row.id),
    source: row.sheet_row !== null ? "sheet" : "db",
    date: row.date,
    customer: row.customer,
    customerType: row.customer_type ?? "",
    location: row.location ?? "",
    details: row.details ?? "",
    guests: row.guests,
    mirrors: row.mirrors,
    waitresses: row.waitresses,
    kosher: row.kosher ?? false,
    packageLines,
    totalAmount: Number(row.total_amount),
    deliveryCost: money(row.delivery_cost),
    mirrorsCost: money(row.mirrors_cost),
    waitressCost: money(row.waitress_cost),
    kosherCost: money(row.kosher_cost),
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
  const [{ rows: orderRows }, { rows: lineRows }, { rows: flavorRows }] = await Promise.all([
    db.query<DbOrderRow>("SELECT * FROM orders ORDER BY date DESC, id DESC"),
    db.query<DbPackageLineRow>("SELECT * FROM order_package_lines"),
    db.query<DbLineFlavorRow>("SELECT * FROM order_package_line_flavors"),
  ]);

  const linesByOrder = nestPackageLines(lineRows, flavorRows);
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
 * Flattens the nested package lines into parallel arrays for `unnest()` —
 * Neon's HTTP driver has no interactive multi-statement transactions (see
 * db.ts), so an order and its content are written atomically via a single
 * SQL statement with chained CTEs instead of BEGIN/COMMIT.
 *
 * Flavours are flattened alongside their line's `position` rather than a
 * line id, because the ids don't exist until the statement runs. The
 * insert joins the two back together on that position, which works
 * because a position is unique within one order.
 */
function toLineArrays(lines: OrderPackageLine[]) {
  const flavors = lines.flatMap((line, linePosition) =>
    line.flavors.map((entry, position) => ({ linePosition, entry, position })),
  );
  return {
    packageTypeIds: lines.map((l) => Number(l.packageTypeId)),
    quantities: lines.map((l) => l.quantity),
    linePositions: lines.map((_, i) => i),
    flavorLinePositions: flavors.map((f) => f.linePosition),
    flavorIds: flavors.map((f) => Number(f.entry.flavorId)),
    flavorUnits: flavors.map((f) => f.entry.units),
    flavorPositions: flavors.map((f) => f.position),
  };
}

const ORDER_COLUMNS = `date, customer, customer_type, location, guests, mirrors, waitresses,
          kosher, delivery_cost, mirrors_cost, waitress_cost, kosher_cost,
          total_amount, deposit, payment_status, production_status, notes`;

/** Order matches ORDER_COLUMNS and the UPDATE below — keep all three in step. */
function orderValues(input: OrderInput) {
  return [
    input.date,
    input.customer,
    input.customerType,
    input.location,
    input.guests,
    input.mirrors,
    input.waitresses,
    input.kosher,
    input.deliveryCost,
    input.mirrorsCost,
    input.waitressCost,
    input.kosherCost,
    input.totalAmount,
    input.deposit,
    input.paymentStatus,
    input.productionStatus,
    input.notes,
  ];
}

/**
 * How many placeholders `orderValues` occupies. The line and flavour
 * arrays are numbered from it rather than written out, so adding a column
 * to an order can't silently shift them onto the wrong parameter — which
 * is a bug SQL happily runs.
 */
const ORDER_VALUE_COUNT = 17;
const ORDER_PLACEHOLDERS = Array.from({ length: ORDER_VALUE_COUNT }, (_, i) => `$${i + 1}`).join(", ");
/** `after(1)` is the first placeholder past the order's own values. */
const after = (offset: number) => `$${ORDER_VALUE_COUNT + offset}`;

export async function createOrder(input: OrderInput): Promise<Order> {
  const db = getDb();
  const arrays = toLineArrays(input.packageLines);

  const { rows } = await db.query<DbOrderRow>(
    `WITH new_order AS (
       INSERT INTO orders (${ORDER_COLUMNS})
       VALUES (${ORDER_PLACEHOLDERS})
       RETURNING *
     ), new_lines AS (
       INSERT INTO order_package_lines (order_id, package_type_id, quantity, position)
       SELECT new_order.id, t.pkg, t.qty, t.pos
       FROM new_order, unnest(${after(1)}::int[], ${after(2)}::int[], ${after(3)}::int[]) AS t(pkg, qty, pos)
       RETURNING id, position
     ), new_flavors AS (
       INSERT INTO order_package_line_flavors (line_id, flavor_id, units, position)
       SELECT new_lines.id, f.flavor_id, f.units, f.pos
       FROM unnest(${after(4)}::int[], ${after(5)}::int[], ${after(6)}::int[], ${after(7)}::int[]) AS f(line_pos, flavor_id, units, pos)
       JOIN new_lines ON new_lines.position = f.line_pos
       RETURNING 1
     )
     SELECT * FROM new_order`,
    [
      ...orderValues(input),
      arrays.packageTypeIds,
      arrays.quantities,
      arrays.linePositions,
      arrays.flavorLinePositions,
      arrays.flavorIds,
      arrays.flavorUnits,
      arrays.flavorPositions,
    ],
  );
  return mapDbOrder(rows[0], input.packageLines);
}

export async function updateOrder(id: number, input: OrderInput): Promise<Order> {
  const db = getDb();
  const arrays = toLineArrays(input.packageLines);

  const { rows } = await db.query<DbOrderRow>(
    `WITH updated_order AS (
       UPDATE orders SET
         date = $1, customer = $2, customer_type = $3, location = $4, guests = $5,
         mirrors = $6, waitresses = $7, kosher = $8, delivery_cost = $9,
         mirrors_cost = $10, waitress_cost = $11, kosher_cost = $12,
         total_amount = $13, deposit = $14, payment_status = $15,
         production_status = $16, notes = $17
       WHERE id = ${after(1)}
       RETURNING *
     ), deleted_lines AS (
       -- Flavour rows go with them, via ON DELETE CASCADE.
       DELETE FROM order_package_lines WHERE order_id = ${after(1)}
       RETURNING 1
     ), new_lines AS (
       INSERT INTO order_package_lines (order_id, package_type_id, quantity, position)
       SELECT ${after(1)}, t.pkg, t.qty, t.pos
       FROM unnest(${after(2)}::int[], ${after(3)}::int[], ${after(4)}::int[]) AS t(pkg, qty, pos)
       -- always-true condition on deleted_lines: CTEs with no data dependency
       -- between them run in an unspecified order, so this forces the delete
       -- to happen before the insert (otherwise it could wipe out the new rows)
       WHERE (SELECT count(*) FROM deleted_lines) >= 0
       RETURNING id, position
     ), new_flavors AS (
       -- No such guard needed here: the join on new_lines is a real data
       -- dependency, so this cannot run before the lines exist.
       INSERT INTO order_package_line_flavors (line_id, flavor_id, units, position)
       SELECT new_lines.id, f.flavor_id, f.units, f.pos
       FROM unnest(${after(5)}::int[], ${after(6)}::int[], ${after(7)}::int[], ${after(8)}::int[]) AS f(line_pos, flavor_id, units, pos)
       JOIN new_lines ON new_lines.position = f.line_pos
       RETURNING 1
     )
     SELECT * FROM updated_order`,
    [
      ...orderValues(input),
      id,
      arrays.packageTypeIds,
      arrays.quantities,
      arrays.linePositions,
      arrays.flavorLinePositions,
      arrays.flavorIds,
      arrays.flavorUnits,
      arrays.flavorPositions,
    ],
  );
  return mapDbOrder(rows[0], input.packageLines);
}

export async function deleteOrder(id: number): Promise<void> {
  const db = getDb();
  await db.query("DELETE FROM orders WHERE id = $1", [id]);
}

export async function duplicateOrder(id: number): Promise<Order> {
  const db = getDb();
  const [{ rows: orderRows }, { rows: lineRows }, { rows: flavorRows }] = await Promise.all([
    db.query<DbOrderRow>("SELECT * FROM orders WHERE id = $1", [id]),
    db.query<DbPackageLineRow>("SELECT * FROM order_package_lines WHERE order_id = $1", [id]),
    db.query<DbLineFlavorRow>(
      `SELECT f.* FROM order_package_line_flavors f
       JOIN order_package_lines l ON l.id = f.line_id
       WHERE l.order_id = $1`,
      [id],
    ),
  ]);
  const source = orderRows[0];
  if (!source) throw new Error(`Order ${id} not found`);

  return createOrder({
    date: source.date,
    customer: source.customer,
    customerType: source.customer_type ?? "",
    location: source.location ?? "",
    guests: source.guests,
    mirrors: source.mirrors,
    waitresses: source.waitresses,
    kosher: source.kosher ?? false,
    packageLines: nestPackageLines(lineRows, flavorRows).get(id) ?? [],
    totalAmount: Number(source.total_amount),
    deliveryCost: money(source.delivery_cost),
    mirrorsCost: money(source.mirrors_cost),
    waitressCost: money(source.waitress_cost),
    kosherCost: money(source.kosher_cost),
    deposit: Number(source.deposit),
    paymentStatus: source.payment_status,
    productionStatus: source.production_status,
    notes: source.notes ?? "",
  });
}
