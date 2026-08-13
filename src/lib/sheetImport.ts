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
 *
 * Every Sheet *reader* lives in this module, and nothing else imports it.
 * That is what keeps "no render path touches the Sheet" true structurally
 * rather than by convention: `googleSheets.ts` (and with it `googleapis`)
 * is reachable only from here, so a page cannot pull it in by accident.
 */

import { getDb } from "./db";
import {
  getSheetValues,
  getSheetValuesWithFormatting,
  getFileComments,
  type CellData,
  type RgbColor,
} from "./googleSheets";
import { parseOrderDetails } from "./flavorParser";
import { MONTH_NAMES_HE, EXPENSE_CATEGORY_COLUMNS, type SheetExpenseItem } from "./financials";
import type { PaymentStatus } from "./orderTypes";

const ORDERS_TAB = "הזמנות (באחריות אביב)";
const EXPENSE_TAB = "מעקב הוצאות (באחריות אנה)";

export interface ImportResult {
  ordersImported: number;
  /** Sheet rows whose order is already in the DB — left untouched. */
  ordersAlreadyPresent: number;
  /**
   * Sheet rows with no usable date. Undated rows were already excluded
   * from every rollup back when pages read the Sheet directly, so
   * importing them would only add orders nothing can place in time.
   */
  ordersUndated: number;
  expenseItemsImported: number;
  expenseItemsAlreadyPresent: number;
}

// ---------------------------------------------------------------------------
// Reading the Orders tab
// ---------------------------------------------------------------------------

/** A parsed Sheet row, in the shape the import needs. Not an `Order` — it has no DB id. */
interface SheetOrder {
  sheetRow: number;
  date: string;
  customer: string;
  customerType: string;
  location: string;
  details: string;
  guests: number | null;
  deliveryCost: number | null;
  mirrors: number | null;
  totalAmount: number;
  deposit: number;
  paymentStatus: PaymentStatus;
  notes: string;
  needsReview: boolean;
}

/**
 * The Sheet's description and note columns as one note. Description
 * first: it's the substance, and the note is usually a short tag like
 * "כולל מעמ". Must stay in step with migrate-004's merge, so an order
 * imported today reads the same as one imported before it.
 */
function joinNote(details: string, note: string): string {
  const parts = [details.trim(), note.trim()].filter((part) => part !== "");
  return parts.join(" · ");
}

function parseAmount(raw: string): number {
  const n = Number(raw.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

/** Payment status is encoded as the row's background colour, not a column. */
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

/** Fully black rows are month dividers, not orders. */
function isMonthDivider(cells: CellData[]): boolean {
  const color = cells[0]?.backgroundColor;
  return !!color && color.red === 0 && color.green === 0 && color.blue === 0;
}

function isBlankRow(cells: CellData[]): boolean {
  return !cells[1]?.value?.trim() && !cells[7]?.value?.trim();
}

async function readSheetOrders(spreadsheetId: string): Promise<SheetOrder[]> {
  const rows = await getSheetValuesWithFormatting(spreadsheetId, `${ORDERS_TAB}!A1:K1000`);

  const orders: SheetOrder[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    if (!cells || cells.length === 0) continue;
    if (isMonthDivider(cells)) continue;
    if (isBlankRow(cells)) continue;

    const get = (idx: number) => cells[idx]?.value ?? "";
    const details = get(4);
    const parsed = parseOrderDetails(details);

    orders.push({
      sheetRow: i + 1,
      date: get(0),
      customer: get(1),
      customerType: get(2),
      location: get(3),
      details,
      guests: parsed.guests,
      deliveryCost: parsed.deliveryCost,
      mirrors: parsed.mirrors,
      totalAmount: parseAmount(get(7)),
      deposit: parseAmount(get(8)),
      paymentStatus: classifyColor(cells[0]?.backgroundColor),
      // The Sheet keeps its description (פירוט) and its note in separate
      // columns. They arrive as one editable note, matching what migration
      // 004 did to the rows imported before this — otherwise every future
      // import would recreate the unlabelled, uneditable second field that
      // change removed. `details` still stores the description untouched.
      notes: joinNote(details, get(6)),
      needsReview: parsed.needsReview,
    });
  }

  return orders;
}

// ---------------------------------------------------------------------------
// Reading the Expense Tracking tab
// ---------------------------------------------------------------------------

interface SheetExpenseMonth {
  month: number;
  items: SheetExpenseItem[];
}

function parseNum(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function isRowEmpty(row: string[]): boolean {
  return row.every((cell) => !cell || !cell.trim());
}

/**
 * The sheet's own per-month "totals" row is unreliable — cross-checking
 * against the raw category columns shows June's totals row has a formula
 * bug (its Waitressing figure is folded into a different cell), while
 * July/August happen to compute correctly. Rather than trust a row that's
 * sometimes wrong, this sums the raw category columns directly and only
 * uses the sheet's totals row to identify *which* row to exclude from
 * that sum (it's always the last non-empty row before a month boundary).
 */
async function readSheetExpenses(spreadsheetId: string): Promise<SheetExpenseMonth[]> {
  const [rows, comments] = await Promise.all([
    getSheetValues(spreadsheetId, `${EXPENSE_TAB}!A1:J200`),
    getFileComments(spreadsheetId),
  ]);
  if (rows.length === 0) return [];

  // Only usable when a quoted value has exactly one comment — a value with
  // multiple comments can't be attributed to a single cell with confidence.
  const commentCountByValue = new Map<string, number>();
  const commentByValue = new Map<string, string>();
  for (const comment of comments) {
    if (!comment.quotedValue) continue;
    commentCountByValue.set(comment.quotedValue, (commentCountByValue.get(comment.quotedValue) ?? 0) + 1);
    commentByValue.set(comment.quotedValue, comment.content);
  }

  // Find every month-label row: a lone populated cell in column A matching
  // a known Hebrew month name, nothing else in the row.
  const monthRowIndices: { row: number; month: number }[] = [];
  rows.forEach((row, i) => {
    const label = row[0]?.trim();
    if (!label) return;
    const monthIdx = MONTH_NAMES_HE.indexOf(label);
    if (monthIdx === -1) return;
    if (row.slice(1).every((c) => !c || !c.trim())) monthRowIndices.push({ row: i, month: monthIdx + 1 });
  });

  const results: SheetExpenseMonth[] = [];

  for (let m = 0; m < monthRowIndices.length; m++) {
    const start = monthRowIndices[m].row + 1;
    const end = m + 1 < monthRowIndices.length ? monthRowIndices[m + 1].row : rows.length;
    const block = rows.slice(start, end);

    // Last non-empty row in the block is the sheet's own totals row —
    // exclude it from our sum so we don't double-count.
    let lastNonEmpty = -1;
    for (let i = 0; i < block.length; i++) {
      if (!isRowEmpty(block[i])) lastNonEmpty = i;
    }

    const rawCells: {
      row: number;
      col: number;
      rawValue: string;
      category: string;
      amount: number;
    }[] = [];
    block.forEach((row, i) => {
      if (i === lastNonEmpty) return; // skip the totals row
      for (const cat of EXPENSE_CATEGORY_COLUMNS) {
        const rawValue = row[cat.index]?.trim();
        if (!rawValue) continue;
        const amount = parseNum(rawValue);
        if (amount === 0) continue;
        rawCells.push({
          row: start + i,
          col: cat.index,
          rawValue,
          category: cat.name,
          amount,
        });
      }
    });

    // A raw value repeated within the same month can't be matched to a
    // single cell with confidence either, even if its comment count is 1.
    const cellCountByValue = new Map<string, number>();
    for (const cell of rawCells) {
      cellCountByValue.set(cell.rawValue, (cellCountByValue.get(cell.rawValue) ?? 0) + 1);
    }

    results.push({
      month: monthRowIndices[m].month,
      items: rawCells.map((cell) => {
        const isUnambiguous =
          cellCountByValue.get(cell.rawValue) === 1 && commentCountByValue.get(cell.rawValue) === 1;
        return {
          key: `sheet-expense:${cell.row}:${cell.col}`,
          category: cell.category,
          amount: cell.amount,
          description: isUnambiguous ? (commentByValue.get(cell.rawValue) ?? null) : null,
        };
      }),
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Importing
// ---------------------------------------------------------------------------

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
  payment_status: PaymentStatus | null;
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
async function getOverridesBySheetRow(db: ReturnType<typeof getDb>): Promise<Map<number, OverrideRow>> {
  const { rows } = await db.query<OverrideRow>("SELECT * FROM order_overrides");
  const map = new Map<number, OverrideRow>();
  for (const row of rows) {
    const match = row.order_key.match(/^sheet:(\d+)$/);
    if (match) map.set(Number(match[1]), row);
  }
  return map;
}

/**
 * An override column arrives as a numeric string; the parsed Sheet value
 * is already a number. Nullability is preserved — `delivery_cost` is
 * genuinely optional on an order, so an absent one must stay NULL rather
 * than becoming a real ₪0 charge.
 */
function numberOr<T extends number | null>(overridden: string | null | undefined, parsed: T): number | T {
  return overridden != null ? Number(overridden) : parsed;
}

async function importOrders(spreadsheetId: string, year: number) {
  const db = getDb();
  const [sheetOrders, overrides, { rows: existingRows }] = await Promise.all([
    readSheetOrders(spreadsheetId),
    getOverridesBySheetRow(db),
    db.query<{ sheet_row: number }>("SELECT sheet_row FROM orders WHERE sheet_row IS NOT NULL"),
  ]);

  const alreadyImportedRows = new Set(existingRows.map((row) => row.sheet_row));

  const pending: {
    order: SheetOrder;
    date: string;
    override: OverrideRow | undefined;
  }[] = [];
  let alreadyPresent = 0;
  let undated = 0;

  for (const order of sheetOrders) {
    if (alreadyImportedRows.has(order.sheetRow)) {
      alreadyPresent++;
      continue;
    }
    const date = toIsoDate(order.date, year);
    if (date === null) {
      undated++;
      continue;
    }
    pending.push({ order, date, override: overrides.get(order.sheetRow) });
  }

  if (pending.length > 0) {
    // One statement with unnest() rather than a per-row INSERT loop: every
    // db.query is its own HTTP round trip on Neon's driver (see db.ts), so
    // a loop would serialize ~80 requests on a first import.
    await db.query(
      `INSERT INTO orders
         (date, customer, customer_type, location, guests, delivery_cost, mirrors,
          total_amount, deposit, payment_status, production_status, notes,
          sheet_row, details, needs_review)
       SELECT * FROM unnest(
         $1::date[], $2::text[], $3::text[], $4::text[], $5::int[], $6::numeric[], $7::int[],
         $8::numeric[], $9::numeric[], $10::text[], $11::text[], $12::text[],
         $13::int[], $14::text[], $15::boolean[])
       ON CONFLICT (sheet_row) WHERE sheet_row IS NOT NULL DO NOTHING`,
      [
        pending.map((p) => p.date),
        pending.map((p) => p.override?.customer ?? p.order.customer),
        pending.map((p) => p.override?.customer_type ?? p.order.customerType),
        pending.map((p) => p.override?.location ?? p.order.location),
        pending.map((p) => p.override?.guests ?? p.order.guests),
        pending.map((p) => numberOr(p.override?.delivery_cost, p.order.deliveryCost)),
        pending.map((p) => p.override?.mirrors ?? p.order.mirrors),
        pending.map((p) => numberOr(p.override?.total_amount, p.order.totalAmount)),
        pending.map((p) => numberOr(p.override?.deposit, p.order.deposit)),
        pending.map((p) => p.override?.payment_status ?? p.order.paymentStatus),
        pending.map((p) => p.override?.production_status ?? "queue"),
        pending.map((p) => p.override?.notes ?? p.order.notes),
        pending.map((p) => p.order.sheetRow),
        pending.map((p) => p.order.details),
        pending.map((p) => p.order.needsReview),
      ],
    );
  }

  return { imported: pending.length, alreadyPresent, undated };
}

async function importExpenses(spreadsheetId: string) {
  const db = getDb();
  const [months, { rows: existingRows }] = await Promise.all([
    readSheetExpenses(spreadsheetId),
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
  // Different tabs, different tables, no shared state — so the two Sheet
  // reads overlap instead of queueing behind each other.
  const [orders, expenses] = await Promise.all([
    importOrders(spreadsheetId, year),
    importExpenses(spreadsheetId),
  ]);

  return {
    ordersImported: orders.imported,
    ordersAlreadyPresent: orders.alreadyPresent,
    ordersUndated: orders.undated,
    expenseItemsImported: expenses.imported,
    expenseItemsAlreadyPresent: expenses.alreadyPresent,
  };
}
