import { neon, types, type NeonQueryFunction } from "@neondatabase/serverless";

// Same DATE-column gotcha as `pg` (and this driver reuses pg-types under
// the hood) — return DATE columns as plain "YYYY-MM-DD" strings instead of
// JS Date objects (OID 1082 = date). See orders.ts/expenses.ts, which
// depend on this string format for both Sheet and DB date parsing.
types.setTypeParser(1082, (value) => value);

export interface QueryResult<T> {
  rows: T[];
}

/**
 * Neon's HTTP driver — chosen over `pg` (raw TCP) because it's Neon's own
 * recommended driver for serverless deployments (avoids TCP connection-pool
 * exhaustion across function invocations on Vercel) and because raw-TCP
 * database connections aren't usable in this project's dev sandbox. It's
 * stateless per request (no interactive multi-statement transactions), so
 * anything that needs atomicity across statements uses a single SQL
 * statement with chained CTEs instead of BEGIN/COMMIT — see orders.ts's
 * createOrder/updateOrder for the pattern.
 */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

let sql: NeonQueryFunction<false, false> | undefined;

export function getDb(): Db {
  if (!sql) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set. See .env.local.example.");
    }
    sql = neon(connectionString);
  }

  return {
    async query<T>(text: string, params: unknown[] = []) {
      const rows = (await sql!.query(text, params)) as T[];
      return { rows };
    },
  };
}

/**
 * Is this error simply a table that isn't there yet?
 *
 * Migrations ship with the code and are run by hand against the database,
 * so the two are briefly out of step — and the pane that noticed should
 * say so rather than taking eight unrelated panes down with it. Every
 * caller that degrades on a missing table asks here, because the check is
 * not obvious: Postgres says 42P01, but the HTTP driver does not always
 * carry the code through, so the message is tested too.
 *
 * Named per table on purpose. A bare catch would report a connection
 * failure, a permission error or a typo in the query as "run the
 * migration", which sends the owner to re-run something already applied
 * while the real fault goes unmentioned. Anything else is rethrown.
 */
export function isMissingTable(error: unknown, table: string): boolean {
  const code = (error as { code?: string })?.code;
  const message = error instanceof Error ? error.message : String(error);
  return (
    (code === "42P01" && message.includes(table)) ||
    new RegExp(`${table}.*does not exist`, "i").test(message)
  );
}

/** Tables already reported, so the diagnostic is written once a process. */
const reported = new Set<string>();

/**
 * Say in the server log that a table is missing, and name the database
 * while doing it.
 *
 * Degrading quietly is right for the page and wrong for diagnosis: a
 * missing table is almost always the migration having been run against a
 * different Neon branch, and the one fact that settles it is which
 * database the app is actually talking to. One extra query, only on the
 * path that is already broken, and only the first time — a table's
 * absence cannot change mid-process.
 */
export async function reportMissingTable(table: string, migration: string): Promise<void> {
  if (reported.has(table)) return;
  reported.add(table);
  try {
    const { rows } = await getDb().query<{ db: string; schema: string }>(
      "SELECT current_database() AS db, current_schema() AS schema",
    );
    console.error(
      `Missing table ${table} in ${rows[0]?.db}.${rows[0]?.schema} — run ${migration} against that database.`,
    );
  } catch {
    console.error(`Missing table ${table} — run ${migration} against that database.`);
  }
}
