import { getDb } from "./db";
import { vatOn, type VatMode } from "./orderTypes";

/**
 * An expense that repeats every month, and the job that carries it
 * forward.
 *
 * Rent, insurance, the accountant: the same cost on the same day of every
 * month, typed in again each time. Ticking "repeats monthly" on one makes
 * the ledger write next month's row itself, so what is predictable about
 * next month is a figure that can be read rather than one somebody has to
 * remember.
 *
 * **A generated row is an ordinary expense** — editable, deletable and
 * counted like any other, the same rule an imported order follows. It is
 * explicitly *not* a template: correcting October's rent corrects October,
 * and November is copied from whatever the series says last, so a rent
 * rise is entered once and then repeats at the new figure.
 *
 * Three rules hold the whole thing up, and each is enforced by the
 * database rather than by remembering to check:
 *
 * 1. **One row per series per month** — the unique index in migration 028.
 * 2. **A deleted row keeps its month.** That index covers deleted rows
 *    too, so deleting a generated October rent means "no rent in October",
 *    not "make it again tonight". This is the rule that makes the feature
 *    safe to leave running.
 * 3. **The newest row of a series decides whether it continues.** Untick
 *    "repeats monthly" on the latest row and the series ends; the rows
 *    behind it keep saying what they were, because they are history.
 */

/** A series' newest row — what the next month is copied from. */
interface SeriesHead {
  id: number;
  series: number;
  date: string;
  categoryId: number;
  amount: number;
  vatMode: VatMode;
  vatRate: number;
  recurring: boolean;
  /** Every month this series already has a row in, deleted ones included. */
  months: Set<string>;
  /** Set once the newest live row has been read — see getSeriesHeads. */
  headFound?: boolean;
}

interface SeriesRow {
  id: number;
  recurring_series: number;
  date: string;
  category_id: number;
  amount: string;
  vat_mode: VatMode | null;
  vat_rate: string | null;
  recurring: boolean | null;
}

/** "YYYY-MM" — the grain a series is counted in. */
const monthKey = (date: string) => date.slice(0, 7);

/** The month after `key`, as another "YYYY-MM". */
function nextMonth(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * The same day of the month, or the last day where that month is shorter —
 * a bill on the 31st falls on the 30th in November and the 28th in
 * February. `new Date(y, m, 0)` is the last day of month `m`.
 */
function sameDayIn(month: string, day: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

/** Every series, with its newest live row and the months it already covers. */
async function getSeriesHeads(): Promise<SeriesHead[]> {
  const db = getDb();
  // Deleted rows are read too, and the two things they are used for are
  // different: they are never copied forward, but they *do* hold their
  // month against regeneration. So the head is the newest row that is
  // still live, while the month set counts every row there has ever been.
  //
  // That split is what makes deleting one month mean what it says.
  // Deleting October's rent leaves October empty and still writes
  // November, because the head falls back to September rather than the
  // series being read as ended.
  const { rows } = await db.query<SeriesRow & { deleted_at: string | null }>(
    `SELECT id, recurring_series, date, category_id, amount, vat_mode, vat_rate, recurring, deleted_at
       FROM expenses
      WHERE recurring_series IS NOT NULL
      ORDER BY recurring_series, date DESC, id DESC`,
  );

  const bySeries = new Map<number, SeriesHead>();
  for (const row of rows) {
    let entry = bySeries.get(row.recurring_series);
    if (!entry) {
      // A placeholder until a live row is found: a series of nothing but
      // deleted rows is over, and `recurring: false` is how that is said.
      entry = {
        id: row.id,
        series: row.recurring_series,
        date: row.date,
        categoryId: row.category_id,
        amount: 0,
        vatMode: "included",
        vatRate: 0,
        recurring: false,
        months: new Set(),
      };
      bySeries.set(row.recurring_series, entry);
    }
    entry.months.add(monthKey(row.date));
    // The rows arrive newest first, so the first live one is the head and
    // every live row after it is older.
    if (!row.deleted_at && !entry.headFound) {
      entry.headFound = true;
      entry.id = row.id;
      entry.date = row.date;
      entry.categoryId = row.category_id;
      entry.amount = Number(row.amount);
      entry.vatMode = row.vat_mode ?? "included";
      entry.vatRate = Number(row.vat_rate ?? 0);
      entry.recurring = row.recurring ?? false;
    }
  }
  return [...bySeries.values()];
}

export interface RollForwardResult {
  /** How many rows were written. Zero is the normal answer most nights. */
  created: number;
  /** Which months got one, for the line the Settings pane prints. */
  months: string[];
  /** How many series are live — i.e. still repeating. */
  series: number;
  /**
   * Series whose newest row is further back than `MAX_CATCH_UP` months,
   * named by the month they stopped at. Reported rather than booked — see
   * the rule below.
   */
  tooFarBack: string[];
}

/**
 * How many months of gap this will fill in.
 *
 * Three, which covers the only case gap-filling is *for*: a nightly cron
 * that did not run for a night, or a week, or a month. It is deliberately
 * small, because the other way a gap appears is far more dangerous.
 *
 * Tick "repeats monthly" on a rent from a year ago — a perfectly natural
 * thing to do while tidying old rows — and a rule that filled every month
 * since would write twelve rents into twelve months that already have
 * their own, hand-entered, and inflate a year of costs by a rent a month.
 * Nothing on screen would look wrong: every figure still adds up, against
 * a ledger that is quietly false. Skipping is the safe failure in the
 * other direction, because a month that is missing a cost reads as light
 * and gets fixed, while a month with the cost twice reads as correct.
 *
 * So a series further back than this is **not booked at all**, and is
 * named in the result instead.
 */
const MAX_CATCH_UP = 3;

/**
 * Write the rows every live series is missing, up to and including the
 * month `today` falls in.
 *
 * Safe to run twice, and from two places at once: every insert carries
 * `ON CONFLICT DO NOTHING` against the one-row-per-month index, so a
 * second run writes nothing rather than doubling the month.
 */
export async function rollForwardRecurring(today = new Date()): Promise<RollForwardResult> {
  const heads = await getSeriesHeads();
  const live = heads.filter((head) => head.recurring);
  const thisMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;

  const db = getDb();
  const written: string[] = [];
  const tooFarBack: string[] = [];
  for (const head of live) {
    // Every month this series owes, oldest first.
    const owed: string[] = [];
    for (let month = nextMonth(monthKey(head.date)); month <= thisMonth; month = nextMonth(month)) {
      owed.push(month);
      // Stop counting rather than run to the end of a decade: the only
      // thing the length is used for is the check below.
      if (owed.length > MAX_CATCH_UP) break;
    }
    if (owed.length > MAX_CATCH_UP) {
      tooFarBack.push(monthKey(head.date));
      continue;
    }

    const day = Number(head.date.slice(8, 10));
    for (const month of owed) {
      if (head.months.has(month)) continue;
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO expenses (date, category_id, amount, payment_method_id, staff_id,
                               business, note, vat_mode, vat_rate, recurring, recurring_series, updated_by)
         SELECT $1, category_id, amount, payment_method_id, staff_id,
                business, note, vat_mode, vat_rate, true, recurring_series, 'Recurring'
           FROM expenses WHERE id = $2
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [sameDayIn(month, day), head.id],
      );
      if (rows.length > 0) written.push(month);
    }
  }

  return {
    created: written.length,
    months: [...new Set(written)].sort(),
    series: live.length,
    tooFarBack: [...new Set(tooFarBack)].sort(),
  };
}

export interface RecurringSummary {
  /** How many costs repeat every month. */
  series: number;
  /** What they come to per month, as charged. */
  total: number;
  /** The same with VAT taken out, for the net view. */
  netTotal: number;
}

/**
 * What a month of the predictable costs comes to — the figure this
 * feature was asked for.
 *
 * Summed **per series from its newest row**, never divided out of a
 * month's total: a month can hold a rent rise and the month before it, and
 * what repeats from here is the latest figure. Both conventions are summed
 * per row for the reason financials.ts states — these months straddle VAT
 * registration, so one divisor would be wrong for every exempt row.
 */
export async function getRecurringSummary(): Promise<RecurringSummary> {
  const live = (await getSeriesHeads()).filter((head) => head.recurring);
  return {
    series: live.length,
    total: live.reduce((sum, head) => sum + head.amount, 0),
    netTotal: live.reduce((sum, head) => sum + vatOn(head.amount, head.vatMode, head.vatRate).net, 0),
  };
}
