import { getDb } from "./db";
import {
  type OrderDisplay,
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
  delivery_option_id: number | null;
  mirrors_cost: string | null;
  display_cost: string | null;
  waitress_cost: string | null;
  kosher_cost: string | null;
  discount: string;
  discount_is_percent: boolean;
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
  package_price: string | null;
  position: number;
}

interface DbDisplayRow {
  order_id: number;
  display_option_id: number;
  quantity: number;
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
      packagePrice: money(row.package_price),
    });
    linesByOrder.set(row.order_id, list);
  }
  return linesByOrder;
}

/** NUMERIC arrives as a string, and an unset cost stays null rather than becoming 0. */
function money(value: string | null): number | null {
  return value !== null ? Number(value) : null;
}

/** Groups the flat join rows by order, for the read paths below. */
function nestDisplays(rows: DbDisplayRow[]): Map<number, OrderDisplay[]> {
  const byOrder = new Map<number, OrderDisplay[]>();
  for (const row of rows) {
    const list = byOrder.get(row.order_id) ?? [];
    list.push({ optionId: row.display_option_id, quantity: row.quantity });
    byOrder.set(row.order_id, list);
  }
  return byOrder;
}

function mapDbOrder(
  row: DbOrderRow,
  packageLines: OrderPackageLine[],
  displays: OrderDisplay[],
): Order {
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
    displays,
    waitresses: row.waitresses,
    kosher: row.kosher ?? false,
    packageLines,
    totalAmount: Number(row.total_amount),
    deliveryCost: money(row.delivery_cost),
    deliveryOptionId: row.delivery_option_id,
    mirrorsCost: money(row.mirrors_cost),
    displayCost: money(row.display_cost),
    waitressCost: money(row.waitress_cost),
    kosherCost: money(row.kosher_cost),
    discount: Number(row.discount),
    discountIsPercent: row.discount_is_percent,
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
  const [{ rows: orderRows }, { rows: lineRows }, { rows: flavorRows }, { rows: displayRows }] =
    await Promise.all([
      db.query<DbOrderRow>("SELECT * FROM orders ORDER BY date DESC, id DESC"),
      db.query<DbPackageLineRow>("SELECT * FROM order_package_lines"),
      db.query<DbLineFlavorRow>("SELECT * FROM order_package_line_flavors"),
      db.query<DbDisplayRow>("SELECT * FROM order_displays"),
    ]);

  const linesByOrder = nestPackageLines(lineRows, flavorRows);
  const displaysByOrder = nestDisplays(displayRows);
  return orderRows.map((row) =>
    mapDbOrder(row, linesByOrder.get(row.id) ?? [], displaysByOrder.get(row.id) ?? []),
  );
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
function toLineArrays(input: OrderInput) {
  const lines = input.packageLines;
  const flavors = lines.flatMap((line, linePosition) =>
    line.flavors.map((entry, position) => ({ linePosition, entry, position })),
  );
  return {
    packageTypeIds: lines.map((l) => Number(l.packageTypeId)),
    quantities: lines.map((l) => l.quantity),
    packagePrices: lines.map((l) => l.packagePrice ?? null),
    linePositions: lines.map((_, i) => i),
    flavorLinePositions: flavors.map((f) => f.linePosition),
    flavorIds: flavors.map((f) => Number(f.entry.flavorId)),
    flavorUnits: flavors.map((f) => f.entry.units),
    flavorPositions: flavors.map((f) => f.position),
    displayOptionIds: input.displays.map((d) => d.optionId),
    displayQuantities: input.displays.map((d) => d.quantity),
  };
}

/**
 * The order the array parameters are bound in.
 *
 * Same reason as ORDER_FIELDS above: the statements below used to number
 * their own `$n` by hand, so inserting one array meant renumbering every
 * later reference in two statements — and SQL runs a mis-numbered
 * statement perfectly happily.
 */
const LINE_ARRAYS = [
  "packageTypeIds",
  "quantities",
  "packagePrices",
  "linePositions",
  "flavorLinePositions",
  "flavorIds",
  "flavorUnits",
  "flavorPositions",
  "displayOptionIds",
  "displayQuantities",
] as const;

type LineArrays = ReturnType<typeof toLineArrays>;

/** `$n` for each array, given how many placeholders precede the first one. */
function arrayPlaceholders(offset: number): Record<(typeof LINE_ARRAYS)[number], string> {
  return Object.fromEntries(LINE_ARRAYS.map((name, i) => [name, after(offset + i)])) as Record<
    (typeof LINE_ARRAYS)[number],
    string
  >;
}

const arrayValues = (arrays: LineArrays) => LINE_ARRAYS.map((name) => arrays[name]);

/**
 * Every column an order writes, paired with where its value comes from.
 *
 * One list, because everything below is derived from it: the INSERT's
 * column list, its `$n` placeholders, the UPDATE's `SET col = $n` clause,
 * the values array, and the offset the line and flavour arrays start at.
 * Adding a column used to mean editing four of those in exact agreement,
 * and SQL runs a mis-numbered statement perfectly happily — writing a
 * quantity into a flavour id and saying nothing.
 */
const ORDER_FIELDS: { column: string; value: (input: OrderInput) => unknown }[] = [
  { column: "date", value: (i) => i.date },
  { column: "customer", value: (i) => i.customer },
  { column: "customer_type", value: (i) => i.customerType },
  { column: "location", value: (i) => i.location },
  { column: "guests", value: (i) => i.guests },
  { column: "mirrors", value: (i) => i.mirrors },
  { column: "waitresses", value: (i) => i.waitresses },
  { column: "kosher", value: (i) => i.kosher },
  { column: "delivery_cost", value: (i) => i.deliveryCost },
  { column: "delivery_option_id", value: (i) => i.deliveryOptionId },
  { column: "mirrors_cost", value: (i) => i.mirrorsCost },
  { column: "waitress_cost", value: (i) => i.waitressCost },
  { column: "kosher_cost", value: (i) => i.kosherCost },
  { column: "discount", value: (i) => i.discount },
  { column: "discount_is_percent", value: (i) => i.discountIsPercent },
  { column: "display_cost", value: (i) => i.displayCost },
  { column: "total_amount", value: (i) => i.totalAmount },
  { column: "deposit", value: (i) => i.deposit },
  { column: "payment_status", value: (i) => i.paymentStatus },
  { column: "production_status", value: (i) => i.productionStatus },
  { column: "notes", value: (i) => i.notes },
];

const ORDER_COLUMNS = ORDER_FIELDS.map((f) => f.column).join(", ");
const ORDER_PLACEHOLDERS = ORDER_FIELDS.map((_, i) => `$${i + 1}`).join(", ");
const ORDER_ASSIGNMENTS = ORDER_FIELDS.map((f, i) => `${f.column} = $${i + 1}`).join(", ");

function orderValues(input: OrderInput) {
  return ORDER_FIELDS.map((f) => f.value(input));
}

/** `after(1)` is the first placeholder past the order's own values. */
const after = (offset: number) => `$${ORDER_FIELDS.length + offset}`;

export async function createOrder(input: OrderInput): Promise<Order> {
  const db = getDb();
  const arrays = toLineArrays(input);
  const $ = arrayPlaceholders(1);

  const { rows } = await db.query<DbOrderRow>(
    `WITH new_order AS (
       INSERT INTO orders (${ORDER_COLUMNS})
       VALUES (${ORDER_PLACEHOLDERS})
       RETURNING *
     ), new_lines AS (
       INSERT INTO order_package_lines (order_id, package_type_id, quantity, package_price, position)
       SELECT new_order.id, t.pkg, t.qty, t.price, t.pos
       FROM new_order, unnest(${$.packageTypeIds}::int[], ${$.quantities}::int[], ${$.packagePrices}::numeric[], ${$.linePositions}::int[]) AS t(pkg, qty, price, pos)
       RETURNING id, position
     ), new_flavors AS (
       INSERT INTO order_package_line_flavors (line_id, flavor_id, units, position)
       SELECT new_lines.id, f.flavor_id, f.units, f.pos
       FROM unnest(${$.flavorLinePositions}::int[], ${$.flavorIds}::int[], ${$.flavorUnits}::int[], ${$.flavorPositions}::int[]) AS f(line_pos, flavor_id, units, pos)
       JOIN new_lines ON new_lines.position = f.line_pos
       RETURNING 1
     ), new_displays AS (
       INSERT INTO order_displays (order_id, display_option_id, quantity)
       SELECT new_order.id, d.option_id, d.qty
       FROM new_order, unnest(${$.displayOptionIds}::int[], ${$.displayQuantities}::int[]) AS d(option_id, qty)
       RETURNING 1
     )
     SELECT * FROM new_order`,
    [...orderValues(input), ...arrayValues(arrays)],
  );
  return mapDbOrder(rows[0], input.packageLines, input.displays);
}

export async function updateOrder(id: number, input: OrderInput): Promise<Order> {
  const db = getDb();
  const arrays = toLineArrays(input);
  // The id takes the first slot past the order's own values, so the
  // arrays start one later.
  const $ = arrayPlaceholders(2);
  const orderId = after(1);

  const { rows } = await db.query<DbOrderRow>(
    `WITH updated_order AS (
       UPDATE orders SET ${ORDER_ASSIGNMENTS}
       WHERE id = ${orderId}
       RETURNING *
     ), deleted_lines AS (
       -- Flavour rows go with them, via ON DELETE CASCADE.
       DELETE FROM order_package_lines WHERE order_id = ${orderId}
       RETURNING 1
     ), deleted_displays AS (
       DELETE FROM order_displays WHERE order_id = ${orderId}
       RETURNING 1
     ), new_lines AS (
       INSERT INTO order_package_lines (order_id, package_type_id, quantity, package_price, position)
       SELECT ${orderId}, t.pkg, t.qty, t.price, t.pos
       FROM unnest(${$.packageTypeIds}::int[], ${$.quantities}::int[], ${$.packagePrices}::numeric[], ${$.linePositions}::int[]) AS t(pkg, qty, price, pos)
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
       FROM unnest(${$.flavorLinePositions}::int[], ${$.flavorIds}::int[], ${$.flavorUnits}::int[], ${$.flavorPositions}::int[]) AS f(line_pos, flavor_id, units, pos)
       JOIN new_lines ON new_lines.position = f.line_pos
       RETURNING 1
     ), new_displays AS (
       INSERT INTO order_displays (order_id, display_option_id, quantity)
       SELECT ${orderId}, d.option_id, d.qty
       FROM unnest(${$.displayOptionIds}::int[], ${$.displayQuantities}::int[]) AS d(option_id, qty)
       -- Same guard, same reason: nothing links these to the delete above.
       WHERE (SELECT count(*) FROM deleted_displays) >= 0
       RETURNING 1
     )
     SELECT * FROM updated_order`,
    [...orderValues(input), id, ...arrayValues(arrays)],
  );
  return mapDbOrder(rows[0], input.packageLines, input.displays);
}

export async function deleteOrder(id: number): Promise<void> {
  const db = getDb();
  await db.query("DELETE FROM orders WHERE id = $1", [id]);
}

export async function duplicateOrder(id: number): Promise<Order> {
  const db = getDb();
  const [{ rows: orderRows }, { rows: lineRows }, { rows: flavorRows }, { rows: displayRows }] =
    await Promise.all([
      db.query<DbOrderRow>("SELECT * FROM orders WHERE id = $1", [id]),
      db.query<DbPackageLineRow>("SELECT * FROM order_package_lines WHERE order_id = $1", [id]),
      db.query<DbLineFlavorRow>(
        `SELECT f.* FROM order_package_line_flavors f
         JOIN order_package_lines l ON l.id = f.line_id
         WHERE l.order_id = $1`,
        [id],
      ),
      db.query<DbDisplayRow>("SELECT * FROM order_displays WHERE order_id = $1", [id]),
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
    displays: nestDisplays(displayRows).get(id) ?? [],
    waitresses: source.waitresses,
    kosher: source.kosher ?? false,
    packageLines: nestPackageLines(lineRows, flavorRows).get(id) ?? [],
    totalAmount: Number(source.total_amount),
    deliveryCost: money(source.delivery_cost),
    deliveryOptionId: source.delivery_option_id,
    displayCost: money(source.display_cost),
    mirrorsCost: money(source.mirrors_cost),
    waitressCost: money(source.waitress_cost),
    kosherCost: money(source.kosher_cost),
    discount: Number(source.discount),
    discountIsPercent: source.discount_is_percent,
    deposit: Number(source.deposit),
    paymentStatus: source.payment_status,
    productionStatus: source.production_status,
    notes: source.notes ?? "",
  });
}
