import { getDb, isMissingTable, reportMissingTable } from "./db";
import { isoStamp } from "./stamp";

/**
 * The row-by-row history, read back.
 *
 * Written by database triggers rather than by this app (see
 * `scripts/migrate-026-row-revisions.sql`), which is what makes it
 * complete: a batch action, a migration and an UPDATE typed into the Neon
 * console all record themselves. Nothing here writes to it.
 */
export interface RecentChange {
  /** `row_revisions.id` — the log's own key, and the row's React key. */
  id: string;
  recordedAt: string;
  /**
   * Every row written by one save shares this. It is what `undo_txid()`
   * takes, so it is shown rather than hidden — putting a change back is a
   * deliberate, typed-out act, not a button.
   */
  txid: string;
  /** "Order 41", "Package 7" — the row as the owner would name it. */
  subject: string;
  action: "insert" | "update" | "delete";
  changedBy: string | null;
  /** For an update: the fields that moved, already worded. Empty otherwise. */
  changed: string[];
}

export interface History {
  /** False until migration 026 has been run against this database. */
  available: boolean;
  changes: RecentChange[];
  /** How much is on record, and since when. */
  total: number;
  since: string | null;
}

/*
 * Table names as the owner would say them, and here rather than in the
 * pane: what a row is called is a fact about the data, and the pane is
 * one reader of it. Anything not named falls back to its table name with
 * the underscores taken out, so a table added later reads adequately
 * rather than not at all — the same rule `icons.ts` follows for the two
 * lookups the owner can add keys to.
 */
const SUBJECTS: Record<string, string> = {
  orders: "Order",
  order_package_lines: "Package",
  order_package_line_flavors: "Flavour",
  order_displays: "Display",
  expenses: "Expense",
  clients: "Client",
  flavors: "Flavour",
  package_types: "Package type",
  order_types: "Order type",
  payment_methods: "Payment method",
  expense_categories: "Expense category",
  production_stages: "Status",
  display_options: "Display option",
  delivery_options: "Delivery option",
  content_presets: "Preset",
  content_preset_flavors: "Preset flavour",
  prices: "Price",
  staff: "Staff",
};

/**
 * The stamps every save writes. They are the answer to "who and when",
 * which each row already carries at its end — listing them among the
 * fields that moved would bury the edit under its own bookkeeping.
 */
const BOOKKEEPING = new Set(["updated_at", "updated_by"]);

export async function getHistory(limit = 12): Promise<History> {
  const db = getDb();
  try {
    const [recent, extent] = await Promise.all([
      db.query<{
        id: string;
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
        id: String(row.id),
        recordedAt: isoStamp(row.recorded_at),
        txid: String(row.txid),
        subject: `${SUBJECTS[row.table_name] ?? row.table_name.replace(/_/g, " ")} ${Object.values(
          row.row_key,
        ).join("/")}`,
        action: row.action,
        changedBy: row.changed_by,
        changed: Object.entries(row.changed ?? {})
          .filter(([field]) => !BOOKKEEPING.has(field))
          .map(([field, [before, after]]) => `${field.replace(/_/g, " ")}: ${show(before)} → ${show(after)}`),
      })),
      total: Number(extent.rows[0]?.total ?? 0),
      since: isoStamp(extent.rows[0]?.since) || null,
    };
  } catch (error) {
    if (!isMissingTable(error, "row_revisions") && !isMissingTable(error, "recent_changes")) throw error;
    await reportMissingTable("row_revisions", "scripts/migrate-026-row-revisions.sql");
    return { available: false, changes: [], total: 0, since: null };
  }
}

const show = (value: unknown) =>
  value === null || value === undefined || value === "" ? "—" : String(value);
