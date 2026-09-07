import { getDb } from "./db";
import { MONTH_NAMES_EN } from "./financials";
import { getExpenseCategories, getPaymentMethods, getStaff } from "./settings";
import { vatOn, type VatMode } from "./orderTypes";
import { bind, StaleWriteError } from "./orders";
import { isoStamp } from "./stamp";

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
  /**
   * Who the money went to. Free text, like `orders.customer`: a supplier
   * is named on a receipt rather than chosen from a list, and a one-off
   * shop must never be a reason a row cannot be saved.
   */
  business: string;
  /** What it bought, and only that — the business above says who took it. */
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
  /**
   * This cost repeats every month — rent, insurance, the accountant.
   *
   * A flag on an ordinary expense rather than a template beside the
   * ledger: a recurring cost *is* an expense in each month it lands in,
   * and a second place for the amount to live is a second place for it to
   * be wrong. `rollForwardRecurring` in recurringExpenses.ts is what turns
   * the flag into next month's row.
   */
  recurring: boolean;
  /**
   * Which series this row belongs to — the id of the expense that started
   * it, which for a hand-marked one is its own. Null for a one-off.
   *
   * Not editable and not shown: it exists so the roll-forward can ask
   * "does this series already have a row in November", which the unique
   * index in migration 028 then enforces.
   */
  recurringSeries: number | null;
  /**
   * When the row last changed. Sent back with a save so the UPDATE can
   * match on it and refuse to write over someone else's edit — see
   * `StaleWriteError` in orders.ts.
   */
  updatedAt: string;
  /** Who saved it last, by name — see Order.updatedBy. */
  updatedBy: string;
}

export interface ExpenseInput {
  date: string;
  categoryId: number;
  amount: number;
  paymentMethodId: number | null;
  staffId: number | null;
  business: string;
  note: string;
  vatMode: VatMode;
  vatRate: number;
  /** See Expense.recurring. A new expense is a one-off unless it says otherwise. */
  recurring: boolean;
}

interface DbExpenseRow {
  id: number;
  date: string;
  category_id: number;
  amount: string;
  payment_method_id: number | null;
  staff_id: number | null;
  business: string | null;
  note: string | null;
  sheet_key: string | null;
  vat_mode: VatMode | null;
  vat_rate: string | null;
  recurring: boolean | null;
  recurring_series: number | null;
  /** A Date from the driver — see isoStamp in stamp.ts. */
  updated_at: string | Date;
  updated_by: string | null;
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
    business: row.business ?? "",
    note: row.note ?? "",
    vatMode: row.vat_mode ?? "included",
    vatRate: Number(row.vat_rate ?? 0),
    // Recorded amounts are what was actually paid, so the mode says how
    // to take VAT back out rather than how to add it on.
    netAmount: vatOn(Number(row.amount), row.vat_mode ?? "included", Number(row.vat_rate ?? 0)).net,
    noteUnverified: false,
    recurring: row.recurring ?? false,
    recurringSeries: row.recurring_series ?? null,
    updatedAt: isoStamp(row.updated_at),
    updatedBy: row.updated_by ?? "",
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
    // Deleted expenses are put aside, not destroyed — migration 024.
    db.query<DbExpenseRow>("SELECT * FROM expenses WHERE deleted_at IS NULL ORDER BY date DESC, id DESC"),
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
  business: string | null;
  note: string | null;
  recurring: boolean | null;
  recurring_series: number | null;
  updated_at: string | Date;
  updated_by: string | null;
}

/** For createExpense/updateExpense's return value — resolves names for just the one affected row. */
async function mapSingleExpense(row: RawDbExpenseRow): Promise<Expense> {
  const names = await getNameMaps();
  return mapExpense(row, names.categoryNameById, names.paymentMethodNameById, names.staffNameById);
}

export async function createExpense(input: ExpenseInput, editor?: string): Promise<Expense> {
  const db = getDb();
  const { rows } = await db.query<RawDbExpenseRow>(
    `INSERT INTO expenses (date, category_id, amount, payment_method_id, staff_id, business, note, vat_mode, vat_rate, recurring, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [input.date, input.categoryId, input.amount, input.paymentMethodId, input.staffId, input.business, input.note, input.vatMode, input.vatRate, input.recurring, editor ?? null],
  );
  return mapSingleExpense(await startSeries(rows[0]));
}

/**
 * A row marked "repeats monthly" and belonging to no series yet starts
 * one, pointing at itself.
 *
 * A second statement rather than a CTE beside the INSERT, and that is
 * forced rather than chosen: data-modifying CTEs all run against the same
 * snapshot, so an UPDATE sitting next to an INSERT cannot see the row that
 * INSERT just wrote. Checked before writing it this way.
 *
 * The failure mode if the second statement never runs is benign — a
 * recurring row with no series simply does not repeat, and saving it again
 * links it — which is why this does not need the transaction it cannot
 * have (see db.ts: the driver is stateless per HTTP request).
 */
async function startSeries(row: RawDbExpenseRow): Promise<RawDbExpenseRow> {
  if (!row.recurring || row.recurring_series !== null) return row;
  const db = getDb();
  const { rows } = await db.query<RawDbExpenseRow>(
    "UPDATE expenses SET recurring_series = id WHERE id = $1 AND recurring_series IS NULL RETURNING *",
    [row.id],
  );
  return rows[0] ?? row;
}

/**
 * `expectedUpdatedAt` is the version the form was built from: pass it and
 * a save whose row has since changed is refused rather than applied over
 * the other person's edit. Omit it and the write is unconditional.
 */
export async function updateExpense(
  id: number,
  input: ExpenseInput,
  expectedUpdatedAt?: string,
  /** Who is saving, for the "last edited by" line. */
  editor?: string,
): Promise<Expense> {
  const db = getDb();
  const values: unknown[] = [
    input.date,
    input.categoryId,
    input.amount,
    input.paymentMethodId,
    input.staffId,
    input.business,
    input.note,
    input.vatMode,
    input.vatRate,
    input.recurring,
    id,
  ];
  const editorAt = bind(values, editor ?? null);
  const fresh = expectedUpdatedAt ? ` AND updated_at = ${bind(values, expectedUpdatedAt)}` : "";
  const { rows } = await db.query<RawDbExpenseRow>(
    `UPDATE expenses SET date = $1, category_id = $2, amount = $3, payment_method_id = $4, staff_id = $5,
            business = $6, note = $7, vat_mode = $8, vat_rate = $9, recurring = $10, updated_at = now(),
            updated_by = ${editorAt}
     WHERE id = $11${fresh}
     RETURNING *`,
    values,
  );
  if (rows.length === 0) throw new StaleWriteError("expense");
  // Ticking "repeats monthly" on an expense that was a one-off starts its
  // series here. Unticking deliberately leaves the series alone: the
  // roll-forward reads the *newest* row of a series, so a series whose
  // latest row is no longer recurring has ended, and the rows behind it
  // keep saying what they were.
  return mapSingleExpense(await startSeries(rows[0]));
}

/**
 * Puts the expense aside rather than destroying it: the row keeps its id,
 * so restoring it brings back the same expense — see migration 024.
 */
export async function deleteExpense(id: number): Promise<void> {
  const db = getDb();
  await db.query("UPDATE expenses SET deleted_at = now() WHERE id = $1", [id]);
}

/** The other direction, for the Undo beside "Expense deleted". */
export async function restoreExpense(id: number): Promise<void> {
  const db = getDb();
  await db.query("UPDATE expenses SET deleted_at = NULL WHERE id = $1", [id]);
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

