/**
 * On-demand Google Sheet → Postgres import.
 *
 * Pages used to read the Sheet live on every render. They now read
 * Postgres only, and the Sheet is touched exactly when someone presses
 * "Import from Google Sheet" in Settings. The Sheet remains read-only —
 * this moves data one way, into the DB, and never writes back.
 *
 * Re-import is additive and non-destructive: a Sheet row that has already
 * been imported is skipped outright, so edits made in the dashboard are
 * never overwritten by a later import. Idempotency comes from
 * `orders.sheet_row` and `legacy_expense_items.sheet_key` (see schema.sql).
 */

import { getDb } from "./db";
import { getSheetOrders } from "./orders";
import { getSheetMonthlyExpenses } from "./financials";

export interface ImportResult {
  ordersImported: number;
  /** Sheet rows whose order is already in the DB — left untouched. */
  ordersAlreadyPresent: number;
  /**
   * Sheet rows with no usable date. Undated rows were already excluded
   * from every rollup back when pages read the Sheet directly (see
   * financials.ts's getMonthlyRevenue), so importing them would only add
   * orders nothing can place in time.
   */
  ordersUndated: number;
  expenseItemsImported: number;
  expenseItemsAlreadyPresent: number;
}

/**
 * Sheet dates are "D/M" with no year — the Sheet covers a single season
 * and the app only ever works in months and days (see orderTypes.ts's
 * orderMonth/orderDay, and financials.ts, which rolls up by month). The
 * year is therefore never displayed; it exists only because `orders.date`
 * is a real DATE column. Stamping the import year keeps forward-booked
 * rows (an October order entered in August) on the right side of today.
 */
function toIsoDate(sheetDate: string, year: number): string | null {
  const match = sheetDate.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

interface OverrideRow {
  order_key: string;
  customer: string | null;
  customer_type: string | null;
  location: string | null;
  guests: number | null;
  delivery_cost: string | null;
  mirrors: number | null;
  total_amount: string | null;
  deposit: string | null;
  payment_status: string | null;
  production_status: string | null;
  notes: string | null;
}

/**
 * Edits made from the dashboard back when Sheet orders had no DB row of
 * their own were recorded in `order_overrides` (now legacy — see
 * schema.sql). Folding them in here is what makes the very first import
 * non-destructive: without it, an order the owner had already corrected
 * would come back in with the Sheet's stale values.
 */
async function getOverridesBySheetRow(): Promise<Map<number, OverrideRow>> {
  const db = getDb();
  const { rows } = await db.query<OverrideRow>("SELECT * FROM order_overrides");
  const map = new Map<number, OverrideRow>();
  for (const row of rows) {
    const match = row.order_key.match(/^sheet:(\d+)$/);
    if (match) map.set(Number(match[1]), row);
  }
  return map;
}

async function importOrders(spreadsheetId: string, year: number) {
  const db = getDb();
  const [sheetOrders, overrides, { rows: existingRows }] = await Promise.all([
    getSheetOrders(spreadsheetId),
    getOverridesBySheetRow(),
    getDb().query<{ sheet_row: number }>("SELECT sheet_row FROM orders WHERE sheet_row IS NOT NULL"),
  ]);

  const alreadyImported = new Set(existingRows.map((row) => row.sheet_row));

  let imported = 0;
  let alreadyPresent = 0;
  let undated = 0;

  for (const order of sheetOrders) {
    const sheetRow = Number(order.key.replace("sheet:", ""));
    if (alreadyImported.has(sheetRow)) {
      alreadyPresent++;
      continue;
    }

    const date = toIsoDate(order.date, year);
    if (date === null) {
      undated++;
      continue;
    }

    const override = overrides.get(sheetRow);
    const pick = <T>(overridden: T | null | undefined, parsed: T): T =>
      overridden !== null && overridden !== undefined ? overridden : parsed;
    const pickNumber = (overridden: string | number | null, parsed: number): number =>
      overridden !== null ? Number(overridden) : parsed;

    await db.query(
      `INSERT INTO orders
         (date, customer, customer_type, location, guests, delivery_cost, mirrors,
          total_amount, deposit, payment_status, production_status, notes,
          sheet_row, details, needs_review)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (sheet_row) WHERE sheet_row IS NOT NULL DO NOTHING`,
      [
        date,
        pick(override?.customer, order.customer),
        pick(override?.customer_type, order.customerType),
        pick(override?.location, order.location),
        pick(override?.guests, order.guests),
        override?.delivery_cost != null ? Number(override.delivery_cost) : order.deliveryCost,
        pick(override?.mirrors, order.mirrors),
        pickNumber(override?.total_amount ?? null, order.totalAmount),
        pickNumber(override?.deposit ?? null, order.deposit),
        pick(override?.payment_status, order.paymentStatus),
        override?.production_status ?? "queue",
        pick(override?.notes, order.notes),
        sheetRow,
        order.details,
        order.needsReview,
      ],
    );
    imported++;
  }

  return { imported, alreadyPresent, undated };
}

async function importExpenses(spreadsheetId: string) {
  const db = getDb();
  const [months, { rows: existingRows }] = await Promise.all([
    getSheetMonthlyExpenses(spreadsheetId),
    db.query<{ sheet_key: string }>("SELECT sheet_key FROM legacy_expense_items"),
  ]);

  const alreadyImported = new Set(existingRows.map((row) => row.sheet_key));

  const pending = months.flatMap((month) =>
    month.items
      .filter((item) => !alreadyImported.has(item.key))
      .map((item) => ({ month: month.month, item })),
  );
  const alreadyPresent = months.reduce((sum, month) => sum + month.items.length, 0) - pending.length;

  if (pending.length > 0) {
    // One statement with unnest() rather than a loop: Neon's HTTP driver
    // has no interactive transactions (see db.ts), and a per-item round
    // trip over HTTP would make a full import needlessly slow.
    await db.query(
      `INSERT INTO legacy_expense_items (sheet_key, month, category_name, amount, description)
       SELECT * FROM unnest($1::text[], $2::int[], $3::text[], $4::numeric[], $5::text[])
       ON CONFLICT (sheet_key) DO NOTHING`,
      [
        pending.map((p) => p.item.key),
        pending.map((p) => p.month),
        pending.map((p) => p.item.category),
        pending.map((p) => p.item.amount),
        pending.map((p) => p.item.description),
      ],
    );
  }

  return { imported: pending.length, alreadyPresent };
}

/** Pulls any Sheet rows not yet in the DB. Existing rows are left untouched. */
export async function importFromSheet(spreadsheetId: string): Promise<ImportResult> {
  const year = new Date().getFullYear();
  const orders = await importOrders(spreadsheetId, year);
  const expenses = await importExpenses(spreadsheetId);

  return {
    ordersImported: orders.imported,
    ordersAlreadyPresent: orders.alreadyPresent,
    ordersUndated: orders.undated,
    expenseItemsImported: expenses.imported,
    expenseItemsAlreadyPresent: expenses.alreadyPresent,
  };
}
