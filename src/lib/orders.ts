import {
  getSheetValuesWithFormatting,
  type CellData,
  type RgbColor,
} from "./googleSheets";
import { parseOrderDetails } from "./flavorParser";
import { getDb } from "./db";
import {
  type PaymentStatus,
  type ProductionStatus,
  type OrderContentLine,
  type Order,
  type OrderInput,
} from "./orderTypes";

export const ORDERS_TAB = "הזמנות (באחריות אביב)";

// Re-exported so existing server-side call sites (`@/lib/orders`) keep
// working unchanged — client components should import these (and the
// pure orderMonth/orderDay helpers) from `@/lib/orderTypes` directly to
// avoid pulling this module's server-only deps (pg, googleapis) into a
// client bundle.
export type { PaymentStatus, ProductionStatus, OrderContentLine, Order, OrderInput };
export { PAYMENT_STATUS_LABEL, PRODUCTION_STATUS_LABEL, orderMonth, orderDay } from "./orderTypes";

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function classifyColor(color: RgbColor | undefined): PaymentStatus {
  if (!color) return "unpaid";
  const r = Math.round(color.red * 255);
  const g = Math.round(color.green * 255);
  const b = Math.round(color.blue * 255);

  if (r === 0 && g === 255 && b === 0) return "paid";
  if (r === 255 && g === 0 && b === 255) return "comp";
  if (r === 255 && g === 255 && b === 0) return "deposit";
  if (r === 0 && g === 255 && b === 255) return "net40";
  return "unpaid"; // white or any other/unrecognized color
}

function isMonthDivider(cells: CellData[]): boolean {
  const first = cells[0];
  if (!first?.backgroundColor) return false;
  const { red, green, blue } = first.backgroundColor;
  return red === 0 && green === 0 && blue === 0;
}

function isBlankRow(cells: CellData[]): boolean {
  const hasCustomer = cells[1]?.value?.trim();
  const hasAmount = cells[7]?.value?.trim();
  return !hasCustomer && !hasAmount;
}

/**
 * Parses the Orders tab into Order records. Only the importer calls this
 * — pages read Postgres via getOrders() and never touch the Sheet (see
 * sheetImport.ts).
 */
export async function getSheetOrders(spreadsheetId: string): Promise<Order[]> {
  const range = `${ORDERS_TAB}!A1:K1000`;
  const rows = await getSheetValuesWithFormatting(spreadsheetId, range);
  if (rows.length === 0) return [];

  const orders: Order[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    if (!cells || cells.length === 0) continue;
    if (isMonthDivider(cells)) continue;
    if (isBlankRow(cells)) continue;

    const get = (idx: number) => cells[idx]?.value ?? "";
    const details = get(4);
    const parsed = parseOrderDetails(details);

    orders.push({
      key: `sheet:${i + 1}`,
      source: "sheet",
      date: get(0),
      customer: get(1),
      customerType: get(2),
      location: get(3),
      details,
      guests: parsed.guests,
      deliveryCost: parsed.deliveryCost,
      mirrors: parsed.mirrors,
      contentLines: [],
      totalAmount: parseAmount(get(7)),
      deposit: parseAmount(get(8)),
      paymentStatus: classifyColor(cells[0]?.backgroundColor),
      // Not tracked for historical Sheet orders unless a production status
      // was explicitly set via the dashboard — merged in by getMergedOrders.
      productionStatus: null,
      notes: get(6),
      needsReview: parsed.needsReview,
    });
  }

  return orders;
}

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
  await db.query(
    `UPDATE orders SET ${assignments.join(", ")} WHERE id = $1`,
    [id, ...entries.map(([, value]) => value)],
  );
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
  package_type_id: number;
  flavor_id: number | null;
  quantity: number;
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
    list.push({
      packageTypeId: String(line.package_type_id),
      flavorId: line.flavor_id !== null ? String(line.flavor_id) : null,
      quantity: line.quantity,
    });
    linesByOrder.set(line.order_id, list);
  }

  return orderRows.map((row) => mapDbOrder(row, linesByOrder.get(row.id) ?? []));
}

export async function setProductionStatus(id: number, status: ProductionStatus): Promise<void> {
  const db = getDb();
  await db.query("UPDATE orders SET production_status = $1 WHERE id = $2", [status, id]);
}

export async function setPaymentStatus(id: number, status: PaymentStatus): Promise<void> {
  const db = getDb();
  await db.query("UPDATE orders SET payment_status = $1 WHERE id = $2", [status, id]);
}

/**
 * Splits content lines into 3 parallel arrays for `unnest()` — Neon's HTTP
 * driver has no interactive multi-statement transactions (see db.ts), so
 * an order and its content lines are written atomically via a single SQL
 * statement with chained CTEs instead of BEGIN/COMMIT.
 */
function toLineArrays(contentLines: OrderContentLine[]) {
  return {
    packageTypeIds: contentLines.map((l) => Number(l.packageTypeId)),
    flavorIds: contentLines.map((l) => (l.flavorId !== null ? Number(l.flavorId) : null)),
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
    contentLines: lineRows.map((line) => ({
      packageTypeId: String(line.package_type_id),
      flavorId: line.flavor_id !== null ? String(line.flavor_id) : null,
      quantity: line.quantity,
    })),
    totalAmount: Number(source.total_amount),
    deposit: Number(source.deposit),
    paymentStatus: source.payment_status,
    productionStatus: source.production_status,
    notes: source.notes ?? "",
  });
}
