import { getOrders, orderMonth, orderUnits, type Order } from "./orders";
import { isBooked, orderNet, orderTotal, stageMap, vatOn, type VatMode } from "./orderTypes";
import type { VatView } from "./vatView";
import { getDb } from "./db";
import { getPackageTypes, getExpenseCategories, getProductionStages } from "./settings";

/** Month labels as the Sheet writes them — used by the importer to find month blocks. */
export const MONTH_NAMES_HE = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];
export const MONTH_NAMES_EN = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const EXPENSE_CATEGORY_COLUMNS = [
  { index: 1, name: "Waitressing" },
  { index: 2, name: "Delivery" },
  { index: 3, name: "Instagram & Branding" },
  { index: 4, name: "Alcohol & Raw Materials" },
  { index: 5, name: "Kitchen Equipment" },
  { index: 6, name: "Packaging & Serving" },
] as const;

export interface SheetExpenseItem {
  /** "sheet-expense:<row>:<col>" — stable per cell, used as a React key and for future overrides. */
  key: string;
  category: string;
  amount: number;
  /**
   * Best-effort description pulled from a Google Sheets comment on this
   * cell — the Drive API's comment anchor has no resolvable cell
   * reference (see googleSheets.ts's getFileComments), so this is only
   * ever set when the cell's raw value is unique within its month AND
   * exactly one comment quotes that same value. Always shown as an
   * unverified guess, never asserted as fact — a wrong guess here would
   * misattribute one real expense's description to a different one.
   */
  description: string | null;
}

export interface MonthlyExpenses {
  month: number; // 1-12
  byCategory: Record<string, number>;
  total: number;
  /**
   * Every individual category-column amount for the month — the Sheet has
   * no per-row date/description (see CLAUDE.md), so this is the finest
   * grain actually recoverable: one item per (month, category, amount).
   */
  items: SheetExpenseItem[];
}

/** Legacy Sheet expense amounts, as imported into the DB (see sheetImport.ts). */
export async function getLegacyExpenseItems(): Promise<MonthlyExpenses[]> {
  const db = getDb();
  const { rows } = await db.query<{
    sheet_key: string;
    month: number;
    category_name: string;
    amount: string;
    description: string | null;
  }>("SELECT * FROM legacy_expense_items ORDER BY month, id");

  const byMonth = new Map<number, MonthlyExpenses>();
  for (const row of rows) {
    const month = byMonth.get(row.month) ?? {
      month: row.month,
      byCategory: {},
      total: 0,
      items: [],
    };
    const amount = Number(row.amount);
    month.byCategory[row.category_name] = (month.byCategory[row.category_name] ?? 0) + amount;
    month.total += amount;
    month.items.push({
      key: row.sheet_key,
      category: row.category_name,
      amount,
      description: row.description,
    });
    byMonth.set(row.month, month);
  }

  return Array.from(byMonth.values()).sort((a, b) => a.month - b.month);
}

export interface MonthlyRevenue {
  month: number;
  /** What was charged, VAT included where the order carries it. */
  total: number;
  /**
   * The same months with VAT taken back out — what the business actually
   * earned, since VAT collected is money held for the state.
   *
   * Carried alongside `total` rather than replacing it because the app
   * shows either, and it is summed **per order** rather than divided out
   * of the month: these months straddle the date the business registered,
   * so a single divisor would be wrong for every exempt order in them.
   */
  netTotal: number;
  orderCount: number;
  unitsSold: number;
}

/**
 * Revenue/order-count/units-sold per month from the full merged order set
 * (Sheet + DB — dashboard-created orders count too, see CLAUDE.md's
 * Database section on the two-source-of-truth merge). Units sold only
 * reflects orders with structured content lines (DB orders always have
 * them; Sheet orders' historical פירוט text isn't reliably parsed into
 * line items — see flavorParser.ts — so legacy months will undercount).
 *
 * **Offers are left out entirely**, not just out of the revenue figure.
 * This is the financial report, and a quote is not a sale; counting one in
 * `orderCount` while leaving its money out would quietly deflate the
 * average order value the Biz Plan divides out of these two. The Orders
 * page's rail makes the opposite choice on purpose — there the counts are
 * an operational "what is in this window" — and says so where it does.
 */
export async function getMonthlyRevenue(
  orders: Order[],
  packageUnitsById: Map<number, number>,
): Promise<MonthlyRevenue[]> {
  // Archived stages included: an order can sit in a stage since retired,
  // and it still has to be classified as a sale or a quote.
  const stages = stageMap(await getProductionStages(true));
  const byMonth = new Map<number, MonthlyRevenue>();

  for (const order of orders) {
    if (!isBooked(order, stages)) continue; // a quote is not a sale — see above
    const month = orderMonth(order);
    if (month === null) continue; // undated rows (e.g. early placeholder entries) excluded
    const existing = byMonth.get(month) ?? {
      month,
      total: 0,
      netTotal: 0,
      orderCount: 0,
      unitsSold: 0,
    };
    // What the order is actually worth: jelly plus every extra it carries,
    // less any discount. It summed the bare `total_amount` column, which
    // is only the jelly — so revenue reported here disagreed with the
    // figure the order sheet, the Kanban card and the summary rail all
    // showed for the same order.
    existing.total += orderTotal(order);
    existing.netTotal += orderNet(order);
    existing.orderCount += 1;
    existing.unitsSold += orderUnits(order.packageLines, packageUnitsById);
    byMonth.set(month, existing);
  }

  return Array.from(byMonth.values()).sort((a, b) => a.month - b.month);
}

interface DbExpenseForRollup {
  month: number;
  categoryName: string;
  /** What was paid, VAT included where the receipt carried it. */
  amount: number;
  /** The same with VAT taken out, per row — see getYearlyFinancials. */
  netAmount: number;
}

/** Dashboard-created expenses, grouped for folding into the Sheet's legacy monthly totals. */
async function getDbExpensesForRollup(): Promise<DbExpenseForRollup[]> {
  const db = getDb();
  // Archived included — this map is what keeps an expense's category
  // resolvable, and a row whose category is missing is dropped below.
  const categories = await getExpenseCategories(true);
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  const { rows } = await db.query<{
    date: string;
    category_id: number;
    amount: string;
    vat_mode: VatMode | null;
    vat_rate: string | null;
  }>("SELECT date, category_id, amount, vat_mode, vat_rate FROM expenses WHERE deleted_at IS NULL");

  return rows
    .map((row) => {
      const match = row.date.trim().match(/^\d{4}-(\d{2})-\d{2}$/);
      const month = match ? Number(match[1]) : null;
      const categoryName = categoryNameById.get(row.category_id);
      if (month === null || !categoryName) return null;
      const amount = Number(row.amount);
      return {
        month,
        categoryName,
        amount,
        // Taken out per row, because a receipt from an unregistered
        // supplier carries no VAT and a month holding both has no single
        // divisor.
        netAmount: vatOn(amount, row.vat_mode ?? "included", Number(row.vat_rate ?? 0)).net,
      };
    })
    .filter((row): row is DbExpenseForRollup => row !== null);
}

export interface MonthlyFinancials {
  month: number;
  monthLabel: string;
  revenue: number;
  orderCount: number;
  expenses: number;
  expensesByCategory: Record<string, number>;
  profit: number;
  unitsSold: number;
}

/**
 * Net profit per month = revenue − recorded expenses, full-year rollup for
 * Biz Plan and Dashboard.
 *
 * `vatView` decides which convention every figure comes back in, and both
 * sides of the subtraction follow it — reporting net revenue against gross
 * costs would understate profit by the VAT on every purchase. Converted
 * per order and per expense before they are added, never by dividing a
 * month's total: these months straddle the date the business registered,
 * so one divisor would be wrong for every exempt row in them.
 */
export async function getYearlyFinancials(vatView: VatView = "gross"): Promise<MonthlyFinancials[]> {
  const net = vatView === "net";
  const [orders, dbExpenses, packageTypes] = await Promise.all([
    getOrders(),
    // The Sheet's monthly totals are no longer read here: migration 018
    // turned each into a real expenses row, so adding them again would
    // count every pre-dashboard cost twice.
    getDbExpensesForRollup(),
    // Archived included: units sold is computed from stored package
    // lines, which can reference a package type since retired.
    getPackageTypes(true),
  ]);
  const packageUnitsById = new Map(packageTypes.map((p) => [p.id, p.unitsPerPackage]));
  const revenue = await getMonthlyRevenue(orders, packageUnitsById);

  const expensesByMonth = new Map<number, { total: number; byCategory: Record<string, number> }>();
  for (const dbExpense of dbExpenses) {
    const existing = expensesByMonth.get(dbExpense.month) ?? {
      total: 0,
      byCategory: {},
    };
    const amount = net ? dbExpense.netAmount : dbExpense.amount;
    existing.total += amount;
    existing.byCategory[dbExpense.categoryName] =
      (existing.byCategory[dbExpense.categoryName] ?? 0) + amount;
    expensesByMonth.set(dbExpense.month, existing);
  }

  const months = new Set<number>([...revenue.map((r) => r.month), ...expensesByMonth.keys()]);

  return Array.from(months)
    .sort((a, b) => a - b)
    .map((month) => {
      const rev = revenue.find((r) => r.month === month);
      const exp = expensesByMonth.get(month);
      const revenueTotal = (net ? rev?.netTotal : rev?.total) ?? 0;
      const expensesTotal = exp?.total ?? 0;
      return {
        month,
        monthLabel: MONTH_NAMES_EN[month - 1],
        revenue: revenueTotal,
        orderCount: rev?.orderCount ?? 0,
        expenses: expensesTotal,
        expensesByCategory: exp?.byCategory ?? {},
        profit: revenueTotal - expensesTotal,
        unitsSold: rev?.unitsSold ?? 0,
      };
    });
}
