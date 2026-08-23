/**
 * A timestamp column, as one string.
 *
 * Lives on its own rather than in `orders.ts` because clients and expenses
 * read the same columns: a date helper is not something a client module
 * should have to reach into orders for.
 */
/**
 * The row's version as one string, whatever the driver handed over.
 *
 * `timestamptz` arrives as a JS `Date`, which holds milliseconds — which
 * is why the column is `TIMESTAMPTZ(3)`: at the default microsecond
 * precision the value that goes back to Postgres is a fraction short of
 * the one stored, and every save reports a conflict that isn't there.
 */
export function isoStamp(value: string | Date | null | undefined): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }
  if (!value) return reportUnstampable(value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? reportUnstampable(value) : parsed.toISOString();
}

/**
 * An empty string, and a line in the log saying why — once.
 *
 * This is a caption. A row whose stamp cannot be read should print nothing
 * (`LastEdited` renders null for an empty one) and a version that cannot
 * be read simply skips the stale-save check; neither is a reason to take
 * the page down, which is exactly what throwing here did the first time a
 * row arrived without the column. Logged once per process, because if one
 * row is missing it, thousands are.
 */
let reportedUnstampable = false;

function reportUnstampable(value: unknown): string {
  if (!reportedUnstampable) {
    reportedUnstampable = true;
    console.error(
      `A row's updated_at could not be read (${JSON.stringify(value)}) — the column is probably missing. ` +
        "Run scripts/migrate-023-stale-save-guard.sql and 025 against this database.",
    );
  }
  return "";
}

