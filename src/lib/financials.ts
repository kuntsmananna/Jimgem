import { getSheetValues } from "./googleSheets";
import { getMergedOrders, orderMonth, type Order } from "./orders";
import { getDb } from "./db";
import { getPackageTypes, getExpenseCategories } from "./settings";

const EXPENSE_TAB = "מעקב הוצאות (באחריות אנה)";

const MONTH_NAMES_HE = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];
export const MONTH_NAMES_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const EXPENSE_CATEGORY_COLUMNS = [
  { index: 1, name: "Waitressing" },
  { index: 2, name: "Delivery" },
  { index: 3, name: "Instagram & Branding" },
  { index: 4, name: "Alcohol & Raw Materials" },
  { index: 5, name: "Kitchen Equipment" },
  { index: 6, name: "Packaging & Serving" },
] as const;

export interface MonthlyExpenses {
  month: number; // 1-12
  byCategory: Record<string, number>;
  total: number;
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
export async function getSheetMonthlyExpenses(
  spreadsheetId: string,
): Promise<MonthlyExpenses[]> {
  const rows = await getSheetValues(spreadsheetId, `${EXPENSE_TAB}!A1:J200`);
  if (rows.length === 0) return [];

  // Find every month-label row: a lone populated cell in column A matching
  // a known Hebrew month name, nothing else in the row.
  const monthRowIndices: { row: number; month: number }[] = [];
  rows.forEach((row, i) => {
    const label = row[0]?.trim();
    if (!label) return;
    const monthIdx = MONTH_NAMES_HE.indexOf(label);
    if (monthIdx === -1) return;
    const restEmpty = row.slice(1).every((c) => !c || !c.trim());
    if (restEmpty) monthRowIndices.push({ row: i, month: monthIdx + 1 });
  });

  const results: MonthlyExpenses[] = [];

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

    const byCategory: Record<string, number> = {};
    for (const cat of EXPENSE_CATEGORY_COLUMNS) byCategory[cat.name] = 0;

    block.forEach((row, i) => {
      if (i === lastNonEmpty) return; // skip the totals row
      for (const cat of EXPENSE_CATEGORY_COLUMNS) {
        byCategory[cat.name] += parseNum(row[cat.index]);
      }
    });

    const total = Object.values(byCategory).reduce((a, b) => a + b, 0);
    results.push({ month: monthRowIndices[m].month, byCategory, total });
  }

  return results;
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
 */
export async function getMonthlyRevenue(
  orders: Order[],
  packageUnitsById: Map<number, number>,
): Promise<MonthlyRevenue[]> {
  const byMonth = new Map<number, MonthlyRevenue>();

  for (const order of orders) {
    const month = orderMonth(order);
    if (month === null) continue; // undated rows (e.g. early placeholder entries) excluded
    const existing = byMonth.get(month) ?? { month, total: 0, orderCount: 0, unitsSold: 0 };
    existing.total += order.totalAmount;
    existing.orderCount += 1;
    for (const line of order.contentLines) {
      existing.unitsSold += line.quantity * (packageUnitsById.get(Number(line.packageTypeId)) ?? 0);
    }
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

  const { rows } = await db.query<{ date: string; category_id: number; amount: string }>(
    "SELECT date, category_id, amount FROM expenses",
  );

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
export async function getYearlyFinancials(spreadsheetId: string): Promise<MonthlyFinancials[]> {
  const [orders, sheetExpenses, dbExpenses, packageTypes] = await Promise.all([
    getMergedOrders(spreadsheetId),
    getSheetMonthlyExpenses(spreadsheetId),
    getDbExpensesForRollup(),
    getPackageTypes(),
  ]);
  const packageUnitsById = new Map(packageTypes.map((p) => [p.id, p.unitsPerPackage]));
  const revenue = await getMonthlyRevenue(orders, packageUnitsById);

  const expensesByMonth = new Map<number, { total: number; byCategory: Record<string, number> }>();
  for (const sheetMonth of sheetExpenses) {
    expensesByMonth.set(sheetMonth.month, { total: sheetMonth.total, byCategory: { ...sheetMonth.byCategory } });
  }
  for (const dbExpense of dbExpenses) {
    const existing = expensesByMonth.get(dbExpense.month) ?? { total: 0, byCategory: {} };
    existing.total += dbExpense.amount;
    existing.byCategory[dbExpense.categoryName] = (existing.byCategory[dbExpense.categoryName] ?? 0) + dbExpense.amount;
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
