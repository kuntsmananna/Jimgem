import { getOrders, orderMonth, orderUnits, type Order } from "./orders";
import { isBooked } from "./orderTypes";
import { getDb } from "./db";
import { getPackageTypes, getExpenseCategories } from "./settings";

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
  total: number;
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
  const byMonth = new Map<number, MonthlyRevenue>();

  for (const order of orders) {
    if (!isBooked(order)) continue; // a quote is not a sale — see above
    const month = orderMonth(order);
    if (month === null) continue; // undated rows (e.g. early placeholder entries) excluded
    const existing = byMonth.get(month) ?? {
      month,
      total: 0,
      orderCount: 0,
      unitsSold: 0,
    };
    existing.total += order.totalAmount;
    existing.orderCount += 1;
    existing.unitsSold += orderUnits(order.packageLines, packageUnitsById);
    byMonth.set(month, existing);
  }

  return Array.from(byMonth.values()).sort((a, b) => a.month - b.month);
}

interface DbExpenseForRollup {
  month: number;
  categoryName: string;
  amount: number;
}

/** Dashboard-created expenses, grouped for folding into the Sheet's legacy monthly totals. */
async function getDbExpensesForRollup(): Promise<DbExpenseForRollup[]> {
  const db = getDb();
  const categories = await getExpenseCategories();
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  const { rows } = await db.query<{
    date: string;
    category_id: number;
    amount: string;
  }>("SELECT date, category_id, amount FROM expenses");

  return rows
    .map((row) => {
      const match = row.date.trim().match(/^\d{4}-(\d{2})-\d{2}$/);
      const month = match ? Number(match[1]) : null;
      const categoryName = categoryNameById.get(row.category_id);
      if (month === null || !categoryName) return null;
      return { month, categoryName, amount: Number(row.amount) };
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

/** Net profit per month = revenue − recorded expenses, full-year rollup for Biz Plan and Dashboard. */
export async function getYearlyFinancials(): Promise<MonthlyFinancials[]> {
  const [orders, sheetExpenses, dbExpenses, packageTypes] = await Promise.all([
    getOrders(),
    getLegacyExpenseItems(),
    getDbExpensesForRollup(),
    getPackageTypes(),
  ]);
  const packageUnitsById = new Map(packageTypes.map((p) => [p.id, p.unitsPerPackage]));
  const revenue = await getMonthlyRevenue(orders, packageUnitsById);

  const expensesByMonth = new Map<number, { total: number; byCategory: Record<string, number> }>();
  for (const sheetMonth of sheetExpenses) {
    expensesByMonth.set(sheetMonth.month, {
      total: sheetMonth.total,
      byCategory: { ...sheetMonth.byCategory },
    });
  }
  for (const dbExpense of dbExpenses) {
    const existing = expensesByMonth.get(dbExpense.month) ?? {
      total: 0,
      byCategory: {},
    };
    existing.total += dbExpense.amount;
    existing.byCategory[dbExpense.categoryName] =
      (existing.byCategory[dbExpense.categoryName] ?? 0) + dbExpense.amount;
    expensesByMonth.set(dbExpense.month, existing);
  }

  const months = new Set<number>([...revenue.map((r) => r.month), ...expensesByMonth.keys()]);

  return Array.from(months)
    .sort((a, b) => a - b)
    .map((month) => {
      const rev = revenue.find((r) => r.month === month);
      const exp = expensesByMonth.get(month);
      const revenueTotal = rev?.total ?? 0;
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
