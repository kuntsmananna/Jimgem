import { getDb } from "./db";
import { MONTH_NAMES_EN } from "./financials";
import { getExpenseCategories, getPaymentMethods, getStaff } from "./settings";
import { vatOn, type VatMode } from "./orderTypes";

export interface Expense {
  /** The DB row id, as a string. Every expense is a row. */
  key: string;
  /**
   * Where it came from. Provenance only: an expense imported from the
   * Sheet is an ordinary editable row like any other, the same rule
   * `orders.source` follows. The Sheet is not the record any more.
   */
  source: "db" | "sheet";
  /** "YYYY-MM-DD". A Sheet-derived one is dated to the 1st of its month — the finest grain that source has. */
  date: string;
  categoryName: string;
  /** The ids behind those names, so a row can be edited without looking them up again. */
  categoryId: number;
  paymentMethodId: number | null;
  staffId: number | null;
  amount: number;
  paymentMethodName: string | null;
  staffName: string | null;
  note: string;
  /**
   * How VAT sits inside `amount` — the same three modes an order carries.
   * A receipt from a registered supplier has VAT inside it and one from an
   * unregistered supplier has none, and the amount alone says nothing
   * about which, so a report that strips VAT has to be told per row.
   */
  vatMode: VatMode;
  /** The rate in percent (18, not 0.18), as it stood when recorded. */
  vatRate: number;
  /** What the expense cost the business with VAT taken out of it. */
  netAmount: number;
  /** True when `note` is a best-effort, unverified match from a Sheet comment — see financials.ts's SheetExpenseItem. */
  noteUnverified: boolean;
}

export interface ExpenseInput {
  date: string;
  categoryId: number;
  amount: number;
  paymentMethodId: number | null;
  staffId: number | null;
  note: string;
  vatMode: VatMode;
  vatRate: number;
}

interface DbExpenseRow {
  id: number;
  date: string;
  category_id: number;
  amount: string;
  payment_method_id: number | null;
  staff_id: number | null;
  note: string | null;
  sheet_key: string | null;
  vat_mode: VatMode | null;
  vat_rate: string | null;
}

function mapExpense(
  row: DbExpenseRow,
  categoryNameById: Map<number, string>,
  paymentMethodNameById: Map<number, string>,
  staffNameById: Map<number, string>,
): Expense {
  return {
    key: String(row.id),
    source: row.sheet_key ? "sheet" : "db",
    date: row.date,
    categoryName: categoryNameById.get(row.category_id) ?? "Other",
    categoryId: row.category_id,
    paymentMethodId: row.payment_method_id,
    staffId: row.staff_id,
    amount: Number(row.amount),
    paymentMethodName: row.payment_method_id ? (paymentMethodNameById.get(row.payment_method_id) ?? null) : null,
    staffName: row.staff_id ? (staffNameById.get(row.staff_id) ?? null) : null,
    note: row.note ?? "",
    vatMode: row.vat_mode ?? "included",
    vatRate: Number(row.vat_rate ?? 0),
    // Recorded amounts are what was actually paid, so the mode says how
    // to take VAT back out rather than how to add it on.
    netAmount: vatOn(Number(row.amount), row.vat_mode ?? "included", Number(row.vat_rate ?? 0)).net,
    noteUnverified: false,
  };
}

async function getNameMaps() {
  const [categories, paymentMethods, staff] = await Promise.all([
    // Archived included: these resolve the names of expenses already
    // recorded, and archiving a category must not blank out its rows.
    getExpenseCategories(true),
    getPaymentMethods(true),
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
  vat_mode: VatMode | null;
  vat_rate: string | null;
  sheet_key: string | null;
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
    `INSERT INTO expenses (date, category_id, amount, payment_method_id, staff_id, note, vat_mode, vat_rate)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [input.date, input.categoryId, input.amount, input.paymentMethodId, input.staffId, input.note, input.vatMode, input.vatRate],
  );
  return mapSingleExpense(rows[0]);
}

export async function updateExpense(id: number, input: ExpenseInput): Promise<Expense> {
  const db = getDb();
  const { rows } = await db.query<RawDbExpenseRow>(
    `UPDATE expenses SET date = $1, category_id = $2, amount = $3, payment_method_id = $4, staff_id = $5, note = $6,
            vat_mode = $7, vat_rate = $8
     WHERE id = $9
     RETURNING *`,
    [input.date, input.categoryId, input.amount, input.paymentMethodId, input.staffId, input.note, input.vatMode, input.vatRate, id],
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
  entries: Expense[];
}

/**
 * Every expense, grouped by month.
 *
 * Reads the `expenses` table alone. It used to merge in the Sheet's
 * per-category monthly totals as read-only entries, because the Sheet was
 * still the record for anything before the dashboard existed. It isn't any
 * more: migration 018 turned each of those into a real row, so they are
 * corrected here like anything else and `legacy_expense_items` is kept
 * only so that fold-in stays auditable.
 */
export async function getExpensePeriods(): Promise<ExpensePeriod[]> {
  const expenses = await getDbExpenses();

  const byMonth = new Map<string, Expense[]>();
  for (const expense of expenses) {
    const key = expense.date.slice(0, 7);
    const list = byMonth.get(key) ?? [];
    list.push(expense);
    byMonth.set(key, list);
  }

  const periods: ExpensePeriod[] = Array.from(byMonth.keys())
    .sort()
    .map((key) => ({
      key,
      // "June 2026": the year is back. It was dropped while every row was
      // one season, and a list of expenses now spans more than one.
      label: `${MONTH_NAMES_EN[Number(key.split("-")[1]) - 1]} ${key.split("-")[0]}`,
      entries: byMonth.get(key) ?? [],
    }));

  periods.push({ key: "general", label: "General / All time", entries: expenses });

  return periods;
}

