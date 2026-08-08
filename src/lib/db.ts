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
