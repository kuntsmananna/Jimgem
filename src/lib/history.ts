import { getDb } from "./db";

/**
 * The row-by-row history, read back.
 *
 * Written by database triggers rather than by this app (see
 * `scripts/migrate-026-row-revisions.sql`), which is what makes it
 * complete: a batch action, a migration and an UPDATE typed into the Neon
 * console all record themselves. Nothing here writes to it.
 */
export interface RecentChange {
  recordedAt: string;
  /**
   * Every row written by one save shares this. It is what `undo_txid()`
   * takes, so it is shown rather than hidden — putting a change back is a
   * deliberate, typed-out act, not a button.
   */
  txid: string;
  table: string;
  rowKey: Record<string, unknown>;
  action: "insert" | "update" | "delete";
  changedBy: string | null;
  /** For an update: field name to [before, after]. Null otherwise. */
  changed: Record<string, [unknown, unknown]> | null;
}

export interface History {
  /** False until migration 026 has been run against this database. */
  available: boolean;
  changes: RecentChange[];
  /** How much is on record, and since when. */
  total: number;
  since: string | null;
}

export async function getHistory(limit = 12): Promise<History> {
  const db = getDb();
  try {
    const [recent, extent] = await Promise.all([
      db.query<{
        recorded_at: string;
        txid: string;
        table_name: string;
        row_key: Record<string, unknown>;
        action: RecentChange["action"];
        changed_by: string | null;
        changed: Record<string, [unknown, unknown]> | null;
      }>(`SELECT * FROM recent_changes LIMIT $1`, [limit]),
      db.query<{ total: string; since: string | null }>(
        `SELECT count(*) AS total, min(recorded_at) AS since FROM row_revisions`,
      ),
    ]);

    return {
      available: true,
      changes: recent.rows.map((row) => ({
        recordedAt: new Date(row.recorded_at).toISOString(),
        txid: String(row.txid),
        table: row.table_name,
        rowKey: row.row_key,
        action: row.action,
        changedBy: row.changed_by,
        changed: row.changed,
      })),
      total: Number(extent.rows[0]?.total ?? 0),
      since: extent.rows[0]?.since ? new Date(extent.rows[0].since).toISOString() : null,
    };
  } catch {
    // The migration that builds it ships with the code and is run by hand,
    // so the two are briefly out of step. A pane that says "not built yet"
    // is a better answer than a Settings page that will not load.
    return { available: false, changes: [], total: 0, since: null };
  }
}
