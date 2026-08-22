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
}

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
  const { rows } = await db.query<{ endpoint: string; calls: string; failed: string }>(
    `SELECT endpoint, count(*) AS calls, count(*) FILTER (WHERE NOT ok) AS failed
       FROM sumit_api_calls
      WHERE to_char(called_at, 'YYYY-MM') = $1
      GROUP BY endpoint
      ORDER BY count(*) DESC`,
    [currentPeriod()],
  );
  const byEndpoint = rows.map((row) => ({ endpoint: row.endpoint, calls: Number(row.calls) }));
  return {
    used: byEndpoint.reduce((sum, row) => sum + row.calls, 0),
    budget: SUMIT_CALL_BUDGET,
    limit: SUMIT_MONTHLY_LIMIT,
    byEndpoint,
    failed: rows.reduce((sum, row) => sum + Number(row.failed), 0),
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
  const { used, budget } = await getSumitUsage();
  if (used >= budget) throw new SumitBudgetError(used);
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
