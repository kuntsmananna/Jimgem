import { getDb } from "./db";
import { getLegacyExpenseItems, MONTH_NAMES_EN, type MonthlyExpenses } from "./financials";
import { getExpenseCategories, getPaymentMethods, getStaff } from "./settings";

export interface Expense {
  /** DB row id (string) for dashboard-created expenses, or a "sheet-expense:<row>:<col>" key for Sheet-derived ones. */
  key: string;
  source: "db" | "sheet";
  /** "YYYY-MM-DD" for DB expenses; "YYYY-MM" for Sheet ones — the Sheet has no per-item day (see CLAUDE.md). */
  date: string;
  categoryName: string;
  amount: number;
  paymentMethodName: string | null;
  staffName: string | null;
  note: string;
  /** True when `note` is a best-effort, unverified match from a Sheet comment — see financials.ts's SheetExpenseItem. */
  noteUnverified: boolean;
  /** False for Sheet-derived items — there's no DB row to edit or delete. */
  editable: boolean;
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

function mapExpense(
  row: DbExpenseRow,
  categoryNameById: Map<number, string>,
  paymentMethodNameById: Map<number, string>,
  staffNameById: Map<number, string>,
): Expense {
  return {
    key: String(row.id),
    source: "db",
    date: row.date,
    categoryName: categoryNameById.get(row.category_id) ?? "Other",
    amount: Number(row.amount),
    paymentMethodName: row.payment_method_id ? (paymentMethodNameById.get(row.payment_method_id) ?? null) : null,
    staffName: row.staff_id ? (staffNameById.get(row.staff_id) ?? null) : null,
    note: row.note ?? "",
    noteUnverified: false,
    editable: true,
  };
}

async function getNameMaps() {
  const [categories, paymentMethods, staff] = await Promise.all([
    getExpenseCategories(),
    getPaymentMethods(),
    getStaff(),
  ]);
  return {
    categoryNameById: new Map(categories.map((c) => [c.id, c.name])),
    paymentMethodNameById: new Map(paymentMethods.map((m) => [m.id, m.name])),
    staffNameById: new Map(staff.map((s) => [s.id, s.name])),
  };
}

/** Dashboard-created itemized expenses only — call getExpensePeriods for the full merged view. */
async function getDbExpenses(): Promise<Expense[]> {
  const db = getDb();
  const [{ rows }, names] = await Promise.all([
    db.query<DbExpenseRow>("SELECT * FROM expenses ORDER BY date DESC, id DESC"),
    getNameMaps(),
  ]);
  return rows.map((row) => mapExpense(row, names.categoryNameById, names.paymentMethodNameById, names.staffNameById));
}

interface RawDbExpenseRow {
  id: number;
  date: string;
  category_id: number;
  amount: string;
  payment_method_id: number | null;
  staff_id: number | null;
  note: string | null;
}

/** For createExpense/updateExpense's return value — resolves names for just the one affected row. */
async function mapSingleExpense(row: RawDbExpenseRow): Promise<Expense> {
  const names = await getNameMaps();
  return mapExpense(row, names.categoryNameById, names.paymentMethodNameById, names.staffNameById);
}

export async function createExpense(input: ExpenseInput): Promise<Expense> {
  const db = getDb();
  const { rows } = await db.query<RawDbExpenseRow>(
    `INSERT INTO expenses (date, category_id, amount, payment_method_id, staff_id, note)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [input.date, input.categoryId, input.amount, input.paymentMethodId, input.staffId, input.note],
  );
  return mapSingleExpense(rows[0]);
}

export async function updateExpense(id: number, input: ExpenseInput): Promise<Expense> {
  const db = getDb();
  const { rows } = await db.query<RawDbExpenseRow>(
    `UPDATE expenses SET date = $1, category_id = $2, amount = $3, payment_method_id = $4, staff_id = $5, note = $6
     WHERE id = $7
     RETURNING *`,
    [input.date, input.categoryId, input.amount, input.paymentMethodId, input.staffId, input.note, id],
  );
  return mapSingleExpense(rows[0]);
}

export async function deleteExpense(id: number): Promise<void> {
  const db = getDb();
  await db.query("DELETE FROM expenses WHERE id = $1", [id]);
}

export interface ExpensePeriod {
  /** "YYYY-MM" for a real month, or "general" for the all-time bucket. */
  key: string;
  label: string;
  /** True when every entry in this period comes from the Sheet (no dashboard-created expenses that month). */
  isLegacy: boolean;
  entries: Expense[];
  legacyTotals: MonthlyExpenses | null;
}

/**
 * Groups DB expenses by month and mixes in each Sheet month's per-category
 * amounts as read-only entries — the Sheet has no per-row date or
 * description (see CLAUDE.md), so each is dated to the 1st of its month
 * and labeled by category alone, which is the finest grain actually
 * recoverable from the source data.
 */
export async function getExpensePeriods(): Promise<ExpensePeriod[]> {
  const [dbExpenses, legacyMonths] = await Promise.all([
    getDbExpenses(),
    getLegacyExpenseItems(),
  ]);

  const now = new Date();
  const currentYear = now.getFullYear();

  const byMonth = new Map<string, Expense[]>();
  for (const expense of dbExpenses) {
    const d = new Date(expense.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const list = byMonth.get(key) ?? [];
    list.push(expense);
    byMonth.set(key, list);
  }
  for (const month of legacyMonths) {
    const key = `${currentYear}-${String(month.month).padStart(2, "0")}`;
    const list = byMonth.get(key) ?? [];
    for (const item of month.items) {
      list.push({
        key: item.key,
        source: "sheet",
        date: key,
        categoryName: item.category,
        amount: item.amount,
        paymentMethodName: null,
        staffName: null,
        note: item.description ?? "",
        noteUnverified: item.description !== null,
        editable: false,
      });
    }
    byMonth.set(key, list);
  }

  const legacyByMonth = new Map(legacyMonths.map((m) => [m.month, m]));

  const periods: ExpensePeriod[] = Array.from(byMonth.keys())
    .sort()
    .map((key) => {
      const month = Number(key.split("-")[1]);
      const entries = byMonth.get(key) ?? [];
      return {
        key,
        label: `${MONTH_NAMES_EN[month - 1]} ${key.split("-")[0]}`,
        isLegacy: entries.every((e) => e.source === "sheet"),
        entries: entries.sort((a, b) => (a.source === b.source ? 0 : a.source === "db" ? -1 : 1)),
        legacyTotals: legacyByMonth.get(month) ?? null,
      };
    });

  const combinedLegacyTotals: MonthlyExpenses = legacyMonths.reduce<MonthlyExpenses>(
    (acc, m) => {
      const byCategory: Record<string, number> = { ...acc.byCategory };
      for (const [cat, amount] of Object.entries(m.byCategory)) {
        byCategory[cat] = (byCategory[cat] ?? 0) + amount;
      }
      return { month: 0, byCategory, total: acc.total + m.total, items: [...acc.items, ...m.items] };
    },
    { month: 0, byCategory: {}, total: 0, items: [] },
  );

  periods.push({
    key: "general",
    label: "General / All time",
    isLegacy: false,
    entries: [...dbExpenses, ...combinedLegacyTotals.items.map((item) => ({
      key: item.key,
      source: "sheet" as const,
      date: "",
      categoryName: item.category,
      amount: item.amount,
      paymentMethodName: null,
      staffName: null,
      note: item.description ?? "",
      noteUnverified: item.description !== null,
      editable: false,
    }))],
    legacyTotals: legacyMonths.length > 0 ? combinedLegacyTotals : null,
  });

  return periods;
}
