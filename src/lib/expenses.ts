import { getDb } from "./db";
import { getSheetMonthlyExpenses, MONTH_NAMES_EN, type MonthlyExpenses } from "./financials";

export interface Expense {
  id: number;
  date: string;
  categoryId: number;
  amount: number;
  paymentMethodId: number | null;
  staffId: number | null;
  note: string;
}

export interface ExpenseInput {
  date: string;
  categoryId: number;
  amount: number;
  paymentMethodId: number | null;
  staffId: number | null;
  note: string;
}

interface DbExpenseRow {
  id: number;
  date: string;
  category_id: number;
  amount: string;
  payment_method_id: number | null;
  staff_id: number | null;
  note: string | null;
}

function mapExpense(row: DbExpenseRow): Expense {
  return {
    id: row.id,
    date: row.date,
    categoryId: row.category_id,
    amount: Number(row.amount),
    paymentMethodId: row.payment_method_id,
    staffId: row.staff_id,
    note: row.note ?? "",
  };
}

/** Dashboard-created itemized expenses only — legacy Sheet months have no line-item detail. */
export async function getDbExpenses(): Promise<Expense[]> {
  const db = getDb();
  const { rows } = await db.query<DbExpenseRow>("SELECT * FROM expenses ORDER BY date DESC, id DESC");
  return rows.map(mapExpense);
}

export async function createExpense(input: ExpenseInput): Promise<Expense> {
  const db = getDb();
  const { rows } = await db.query<DbExpenseRow>(
    `INSERT INTO expenses (date, category_id, amount, payment_method_id, staff_id, note)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [input.date, input.categoryId, input.amount, input.paymentMethodId, input.staffId, input.note],
  );
  return mapExpense(rows[0]);
}

export async function updateExpense(id: number, input: ExpenseInput): Promise<Expense> {
  const db = getDb();
  const { rows } = await db.query<DbExpenseRow>(
    `UPDATE expenses SET date = $1, category_id = $2, amount = $3, payment_method_id = $4, staff_id = $5, note = $6
     WHERE id = $7
     RETURNING *`,
    [input.date, input.categoryId, input.amount, input.paymentMethodId, input.staffId, input.note, id],
  );
  return mapExpense(rows[0]);
}

export async function deleteExpense(id: number): Promise<void> {
  const db = getDb();
  await db.query("DELETE FROM expenses WHERE id = $1", [id]);
}

export interface ExpensePeriod {
  /** "YYYY-MM" for a real month, or "general" for the all-time/undated bucket. */
  key: string;
  label: string;
  /** True when this period has no itemized DB detail — only a Sheet legacy total per category. */
  isLegacy: boolean;
  entries: Expense[];
  legacyTotals: MonthlyExpenses | null;
}

/**
 * Groups DB expenses by month and attaches each Sheet month's legacy
 * category totals (no itemized detail available for those, by design —
 * see CLAUDE.md's Database section on the Sheet/DB split).
 */
export async function getExpensePeriods(spreadsheetId: string): Promise<ExpensePeriod[]> {
  const [dbExpenses, legacyMonths] = await Promise.all([
    getDbExpenses(),
    getSheetMonthlyExpenses(spreadsheetId),
  ]);

  const now = new Date();
  const byMonth = new Map<string, Expense[]>();
  for (const expense of dbExpenses) {
    const d = new Date(expense.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const list = byMonth.get(key) ?? [];
    list.push(expense);
    byMonth.set(key, list);
  }

  const currentYear = now.getFullYear();
  const legacyByMonth = new Map(legacyMonths.map((m) => [m.month, m]));

  const monthKeys = new Set<string>([
    ...byMonth.keys(),
    ...legacyMonths.map((m) => `${currentYear}-${String(m.month).padStart(2, "0")}`),
  ]);

  const periods: ExpensePeriod[] = Array.from(monthKeys)
    .sort()
    .map((key) => {
      const month = Number(key.split("-")[1]);
      const entries = byMonth.get(key) ?? [];
      return {
        key,
        label: `${MONTH_NAMES_EN[month - 1]} ${key.split("-")[0]}`,
        isLegacy: entries.length === 0 && legacyByMonth.has(month),
        entries,
        legacyTotals: legacyByMonth.get(month) ?? null,
      };
    });

  periods.push({
    key: "general",
    label: "General / All time",
    isLegacy: false,
    entries: dbExpenses,
    legacyTotals: null,
  });

  return periods;
}
