import { getDb, isMissingTable, reportMissingTable } from "./db";

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
  /** Failed calls still count — SUMIT logs and meters them. */
  failed: number;
  /**
   * False when the log table isn't there yet — migration 020 hasn't been
   * run against this database. Everything else then reads as zero, which
   * is honest: nothing has been counted.
   */
  available: boolean;
}

const NOTHING_COUNTED: SumitUsage = {
  used: 0,
  budget: SUMIT_CALL_BUDGET,
  limit: SUMIT_MONTHLY_LIMIT,
  failed: 0,
  available: false,
};

/** The calendar month a call belongs to, as "YYYY-MM". */
function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * The month's count, held in the process.
 *
 * The gate runs before *every* SUMIT call, and asking the database each
 * time made a 90-call sync 90 aggregate scans over a table that same run
 * is growing. So the count is read once, then kept: `recordSumitCall`
 * increments it, and it is thrown away on a month rollover. Any read of
 * `getSumitUsage` — the Settings meter, once per render — re-seeds it from
 * the database, so a warm process that missed another instance's calls
 * corrects itself rather than drifting for as long as it stays up. The
 * 25-call reserve is what covers the drift in between.
 */
let counted: { period: string; used: number } | null = null;

/**
 * What this month has cost so far, asked of the database.
 *
 * Counted from our own log rather than asked of SUMIT — asking would
 * itself be a call, and there is no endpoint for it anyway.
 */
export async function getSumitUsage(): Promise<SumitUsage> {
  const db = getDb();
  let rows: { calls: string; failed: string }[];
  try {
    ({ rows } = await db.query<{ calls: string; failed: string }>(
      // `called_at >= date_trunc(...)` rather than `to_char(...) = 'YYYY-MM'`:
      // the same month, but a range the `sumit_api_calls_month_idx` index
      // migration 020 ships can actually be used for.
      `SELECT count(*) AS calls, count(*) FILTER (WHERE NOT ok) AS failed
         FROM sumit_api_calls
        WHERE called_at >= date_trunc('month', now())`,
    ));
  } catch (error) {
    if (!isMissingTable(error, "sumit_api_calls")) throw error;
    // Said in the server log once a process — `sumitPost` asks before
    // every SUMIT call, so logging each time would put a spare round trip
    // and a line of noise in front of all of them.
    await reportMissingTable("sumit_api_calls", "scripts/migrate-020-sumit-call-log.sql");
    // Deliberately not cached: the table's absence is a misconfiguration
    // about to be fixed, and a process that remembered it would keep the
    // meter dark for as long as it stayed warm after the migration ran.
    counted = null;
    return NOTHING_COUNTED;
  }
  const used = Number(rows[0]?.calls ?? 0);
  counted = { period: currentPeriod(), used };
  return {
    used,
    budget: SUMIT_CALL_BUDGET,
    limit: SUMIT_MONTHLY_LIMIT,
    failed: Number(rows[0]?.failed ?? 0),
    available: true,
  };
}

/**
 * The month's count as this process knows it — free once seeded.
 *
 * `available` is false only while the log table is missing, in which case
 * there is nothing to enforce and nothing to report.
 */
async function usedThisMonth(): Promise<{ used: number; available: boolean }> {
  const period = currentPeriod();
  if (counted?.period === period) return { used: counted.used, available: true };
  const usage = await getSumitUsage();
  return { used: usage.used, available: usage.available };
}

/**
 * How many calls this month has spent, including any still being written
 * to the log. Exact, and free after the first call of a run — which is
 * what lets the sync report what it cost rather than guessing.
 */
export async function sumitCallsUsed(): Promise<number> {
  const { used } = await usedThisMonth();
  return used;
}

/**
 * How many calls are left this month, for a caller about to make several.
 *
 * The document sync asks before it starts so it can fetch what it can
 * afford and stop, rather than dying halfway through a batch — a partial
 * sync that says what it skipped is far better than an exception.
 */
export async function remainingSumitCalls(): Promise<number> {
  const { used } = await usedThisMonth();
  return Math.max(0, SUMIT_CALL_BUDGET - used);
}

/** Refuses the call when the month is spent. Called by `sumitPost`, nowhere else. */
export async function assertWithinSumitBudget(): Promise<void> {
  const { used, available } = await usedThisMonth();
  // Nothing to enforce while the log table is missing: refusing every call
  // because the meter is unbuilt would be a worse failure than the one the
  // meter exists to prevent. `recordSumitCall` already swallows the same
  // absence, so calls simply go uncounted until the migration is run.
  if (available && used >= SUMIT_CALL_BUDGET) throw new SumitBudgetError(used);
}

/** Log writes in flight, so a burst can wait for its own record of itself. */
const pending = new Set<Promise<void>>();

/**
 * Records a call that was actually made.
 *
 * Counting is synchronous — the in-process figure is what the gate reads,
 * so it is right the instant the call is made — while the row is written
 * without being waited for. A sync spends its time on SUMIT and on the
 * document upserts, and blocking each call on its own INSERT put a Neon
 * round trip between every pair of them.
 *
 * Failures are recorded too, because SUMIT meters them: its own log shows
 * our rejected `SupplierPayment` query and a bad CRM read sitting in the
 * month's total alongside the successful ones.
 *
 * Never throws. A logging failure must not lose the caller's result, and
 * an uncounted call is a smaller problem than a broken sync.
 */
export function recordSumitCall(endpoint: string, ok: boolean, error?: string): void {
  const period = currentPeriod();
  counted = counted?.period === period ? { period, used: counted.used + 1 } : counted;

  const write = getDb()
    .query("INSERT INTO sumit_api_calls (endpoint, ok, error) VALUES ($1, $2, $3)", [
      endpoint,
      ok,
      error?.slice(0, 500) ?? null,
    ])
    .then(
      () => {},
      (failure) => {
        console.error("Failed to record a SUMIT call:", failure);
      },
    );
  pending.add(write);
  void write.finally(() => pending.delete(write));
}

/**
 * Waits for the log writes still in flight.
 *
 * Called at the end of anything that makes SUMIT calls. Without it a
 * serverless instance can be frozen the moment it answers, with the last
 * call of the request recorded nowhere — and an uncounted call is exactly
 * the one that pushes a later month past the ceiling.
 */
export async function flushSumitCalls(): Promise<void> {
  while (pending.size > 0) await Promise.all([...pending]);
}
