import { getDb } from "./db";

/**
 * SUMIT's calls are metered, and the meter is small.
 *
 * The plan includes **250 API calls a month**; past that they cost ₪0.09
 * each. That is a real constraint on design, not a footnote: the first
 * version of the document sync re-fetched every invoice's details on every
 * run, which would have spent 3,000 calls a month — twelve times the
 * allowance — without anything looking broken.
 *
 * So every call is counted before it is made, and refused once the
 * month's ceiling is reached. The point is not to save the ₪0.09. It is
 * that a limit nobody can see is a limit you discover by exceeding it.
 */

/** What the plan includes. */
export const SUMIT_MONTHLY_LIMIT = 250;

/**
 * Held back from the ceiling, because our count is not the whole truth:
 * the card terminal makes its own calls (`creditguy/gateway/...`, a
 * handful a month) and they come out of the same allowance. Ours stops
 * early so theirs never fails.
 */
const RESERVE = 25;

export const SUMIT_CALL_BUDGET = SUMIT_MONTHLY_LIMIT - RESERVE;

/** Thrown instead of calling SUMIT when the month's budget is spent. */
export class SumitBudgetError extends Error {
  constructor(used: number) {
    super(
      `SUMIT's monthly call budget is spent — ${used} of ${SUMIT_CALL_BUDGET} used ` +
        `(the plan allows ${SUMIT_MONTHLY_LIMIT}, and ${RESERVE} are held back for the card terminal). ` +
        `It resets on the 1st. Calls past the plan cost ₪0.09 each.`,
    );
    this.name = "SumitBudgetError";
  }
}

export interface SumitUsage {
  used: number;
  budget: number;
  limit: number;
  /** What the month has spent, by endpoint, heaviest first. */
  byEndpoint: { endpoint: string; calls: number }[];
  /** Failed calls still count — SUMIT logs and meters them. */
  failed: number;
  /**
   * False when the log table isn't there yet — migration 020 hasn't been
   * run against this database. Everything else then reads as zero, which
   * is honest: nothing has been counted.
   */
  available: boolean;
}

/**
 * Is this the log table simply not existing yet?
 *
 * A migration that ships with the code but is run by hand against the
 * database means the two are briefly out of step, and the meter is the
 * one thing on Settings that must not take the page down with it — nine
 * other panes have nothing to do with SUMIT. Postgres says 42P01 for an
 * undefined table; the message is checked too, because the HTTP driver
 * does not always carry the code through.
 */
function isMissingCallLog(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  const message = error instanceof Error ? error.message : String(error);
  return code === "42P01" || /sumit_api_calls.*does not exist/i.test(message);
}

const NOTHING_COUNTED: SumitUsage = {
  used: 0,
  budget: SUMIT_CALL_BUDGET,
  limit: SUMIT_MONTHLY_LIMIT,
  byEndpoint: [],
  failed: 0,
  available: false,
};

/** The calendar month a call belongs to, as "YYYY-MM". */
function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * What this month has cost so far.
 *
 * Counted from our own log rather than asked of SUMIT — asking would
 * itself be a call, and there is no endpoint for it anyway.
 */
export async function getSumitUsage(): Promise<SumitUsage> {
  const db = getDb();
  let rows: { endpoint: string; calls: string; failed: string }[];
  try {
    ({ rows } = await db.query<{ endpoint: string; calls: string; failed: string }>(
      `SELECT endpoint, count(*) AS calls, count(*) FILTER (WHERE NOT ok) AS failed
         FROM sumit_api_calls
        WHERE to_char(called_at, 'YYYY-MM') = $1
        GROUP BY endpoint
        ORDER BY count(*) DESC`,
      [currentPeriod()],
    ));
  } catch (error) {
    if (!isMissingCallLog(error)) throw error;
    /*
     * Say so in the log, and name the database while doing it.
     *
     * Degrading quietly is right for the page and wrong for diagnosis: a
     * missing table here is almost always the migration having been run
     * against a different Neon branch, and the one fact that settles it is
     * which database the app is actually talking to. One extra query, only
     * on the path that is already broken.
     */
    try {
      const { rows } = await db.query<{ db: string; schema: string }>(
        "SELECT current_database() AS db, current_schema() AS schema",
      );
      console.error(
        `SUMIT call log missing: no sumit_api_calls in ${rows[0]?.db}.${rows[0]?.schema} — ` +
          "run scripts/migrate-020-sumit-call-log.sql against that database.",
      );
    } catch {
      console.error("SUMIT call log missing: sumit_api_calls does not exist.");
    }
    return NOTHING_COUNTED;
  }
  const byEndpoint = rows.map((row) => ({ endpoint: row.endpoint, calls: Number(row.calls) }));
  return {
    used: byEndpoint.reduce((sum, row) => sum + row.calls, 0),
    budget: SUMIT_CALL_BUDGET,
    limit: SUMIT_MONTHLY_LIMIT,
    byEndpoint,
    failed: rows.reduce((sum, row) => sum + Number(row.failed), 0),
    available: true,
  };
}

/**
 * How many calls are left this month, for a caller about to make several.
 *
 * The document sync asks before it starts so it can fetch what it can
 * afford and stop, rather than dying halfway through a batch — a partial
 * sync that says what it skipped is far better than an exception.
 */
export async function remainingSumitCalls(): Promise<number> {
  const { used, budget } = await getSumitUsage();
  return Math.max(0, budget - used);
}

/** Refuses the call when the month is spent. Called by `sumitPost`, nowhere else. */
export async function assertWithinSumitBudget(): Promise<void> {
  const { used, budget, available } = await getSumitUsage();
  // Nothing to enforce while the log table is missing: refusing every call
  // because the meter is unbuilt would be a worse failure than the one the
  // meter exists to prevent. `recordSumitCall` already swallows the same
  // absence, so calls simply go uncounted until the migration is run.
  if (available && used >= budget) throw new SumitBudgetError(used);
}

/**
 * Records a call that was actually made.
 *
 * Failures are recorded too, because SUMIT meters them: its own log shows
 * our rejected `SupplierPayment` query and a bad CRM read sitting in the
 * month's total alongside the successful ones.
 *
 * Never throws. A logging failure must not lose the caller's result, and
 * an uncounted call is a smaller problem than a broken sync.
 */
export async function recordSumitCall(endpoint: string, ok: boolean, error?: string): Promise<void> {
  try {
    await getDb().query(
      "INSERT INTO sumit_api_calls (endpoint, ok, error) VALUES ($1, $2, $3)",
      [endpoint, ok, error?.slice(0, 500) ?? null],
    );
  } catch (failure) {
    console.error("Failed to record a SUMIT call:", failure);
  }
}
