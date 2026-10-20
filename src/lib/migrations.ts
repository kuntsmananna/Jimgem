import { getDb } from "./db";

/**
 * Which of the hand-run migrations this database has had.
 *
 * Migrations here are pasted into the Neon console from the `.sql` twins
 * in `scripts/`, not run by a tool, so nothing records that one ran — and
 * "did I paste 031 into the right branch?" was answered by waiting to see
 * what broke. A table of runs would only know about runs made after it
 * existed, and only if every future paste remembered to write to it.
 *
 * So this asks the database what each migration *leaves behind* — a
 * table, a column, an index, a function, a trigger — which is true of
 * every migration ever run and needs nothing from the person pasting.
 * Presence is the right test because every migration is idempotent and
 * `CREATE … IF NOT EXISTS`: if its marker is there, running it again would
 * change nothing structural. A migration that only moves data (021's
 * August baseline, the early folds) leaves nothing to look for and is
 * listed as such rather than guessed at.
 *
 * **Adding a migration: add its entry here**, with the last thing it
 * creates as the marker, so a half-pasted script reads as not run.
 */
type Marker =
  | { table: string }
  | { column: [table: string, column: string] }
  | { index: string }
  | { fn: string }
  | { trigger: [name: string, table: string] };

interface MigrationEntry {
  id: string;
  title: string;
  /** The file to paste, relative to the repo. */
  script: string;
  /** All of these must exist. Empty means a data-only migration. */
  markers: Marker[];
}

export const MIGRATIONS: MigrationEntry[] = [
  { id: "007", title: "Order extras", script: "scripts/migrate-007-order-extras.mjs", markers: [{ column: ["orders", "kosher_cost"] }] },
  { id: "008", title: "Prices", script: "scripts/migrate-008-prices-and-offer.mjs", markers: [{ table: "prices" }] },
  { id: "009", title: "Archiving lists", script: "scripts/migrate-009-archive-value-lists.mjs", markers: [{ column: ["payment_methods", "archived_at"] }] },
  { id: "010", title: "Production stages", script: "scripts/migrate-010-production-stages.mjs", markers: [{ table: "production_stages" }] },
  { id: "011", title: "Preset prices", script: "scripts/migrate-011-jelly-prices.mjs", markers: [{ column: ["order_package_lines", "package_price"] }] },
  { id: "012", title: "Display options", script: "scripts/migrate-012-display-options.mjs", markers: [{ table: "order_displays" }] },
  { id: "013", title: "Order discount", script: "scripts/migrate-013-order-discount.mjs", markers: [{ column: ["orders", "discount_is_percent"] }] },
  { id: "014", title: "Delivery options", script: "scripts/migrate-014-delivery-options.mjs", markers: [{ column: ["orders", "delivery_option_id"] }] },
  { id: "015", title: "VAT", script: "scripts/migrate-015-vat.sql", markers: [{ column: ["orders", "vat_rate"] }, { column: ["expenses", "vat_rate"] }] },
  { id: "016", title: "Clients", script: "scripts/migrate-016-clients.sql", markers: [{ column: ["orders", "client_id"] }, { fn: "jimgem_normalize_name" }] },
  { id: "017", title: "SUMIT documents", script: "scripts/migrate-017-sumit-documents.sql", markers: [{ index: "sumit_documents_client_idx" }] },
  { id: "018", title: "Every expense a row", script: "scripts/migrate-018-materialize-legacy-expenses.sql", markers: [{ index: "expenses_sheet_key_idx" }] },
  { id: "019", title: "Expense business", script: "scripts/migrate-019-expense-business.sql", markers: [{ column: ["expenses", "business"] }] },
  { id: "020", title: "SUMIT call meter", script: "scripts/migrate-020-sumit-call-log.sql", markers: [{ index: "sumit_api_calls_month_idx" }] },
  { id: "021", title: "SUMIT August baseline", script: "scripts/migrate-021-sumit-august-baseline.sql", markers: [] },
  { id: "022", title: "Where clients came from", script: "scripts/migrate-022-client-source.sql", markers: [{ column: ["clients", "source"] }] },
  { id: "023", title: "Stale-save guard", script: "scripts/migrate-023-stale-save-guard.sql", markers: [{ column: ["orders", "updated_at"] }, { column: ["expenses", "updated_at"] }] },
  { id: "024", title: "Delete with Undo", script: "scripts/migrate-024-soft-delete.sql", markers: [{ index: "orders_live_idx" }, { index: "expenses_live_idx" }] },
  { id: "025", title: "Last edited by", script: "scripts/migrate-025-edited-by.sql", markers: [{ column: ["orders", "updated_by"] }, { column: ["clients", "updated_by"] }] },
  {
    id: "026",
    title: "Change log",
    script: "scripts/migrate-026-row-revisions.sql",
    markers: [{ fn: "undo_txid" }, { trigger: ["record_revision", "orders"] }],
  },
  { id: "027", title: "Nightly backups", script: "scripts/migrate-027-snapshots.sql", markers: [{ index: "db_snapshots_taken_idx" }] },
  { id: "028", title: "Monthly expenses", script: "scripts/migrate-028-recurring-expenses.sql", markers: [{ index: "expenses_recurring_month_idx" }] },
  { id: "029", title: "To-do list", script: "scripts/migrate-029-tasks.sql", markers: [{ index: "tasks_open_idx" }] },
  { id: "030", title: "Staff roles", script: "scripts/migrate-030-staff-roles.sql", markers: [{ column: ["staff", "role"] }] },
  { id: "031", title: "How an order was paid", script: "scripts/migrate-031-order-payment-method.sql", markers: [{ column: ["orders", "payment_method_id"] }] },
  { id: "032", title: "What's new, per person", script: "scripts/migrate-032-announcement-views.sql", markers: [{ table: "announcement_views" }] },
  { id: "033", title: "Ending a session early", script: "scripts/migrate-033-session-version.sql", markers: [{ column: ["staff", "session_version"] }] },
];

export type MigrationState = "applied" | "missing" | "data-only";

export interface MigrationStatus {
  id: string;
  title: string;
  script: string;
  state: MigrationState;
}

/** Every migration's state, from five catalogue reads made side by side. */
export async function getMigrationStatus(): Promise<MigrationStatus[]> {
  const db = getDb();
  const [tables, columns, indexes, functions, triggers] = await Promise.all([
    db.query<{ name: string }>(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public'",
    ),
    db.query<{ name: string }>(
      "SELECT table_name || '.' || column_name AS name FROM information_schema.columns WHERE table_schema = 'public'",
    ),
    db.query<{ name: string }>("SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public'"),
    db.query<{ name: string }>(
      "SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'",
    ),
    db.query<{ name: string }>(
      "SELECT tgname || '@' || c.relname AS name FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal",
    ),
  ]);
  const has = {
    table: new Set(tables.rows.map((r) => r.name)),
    column: new Set(columns.rows.map((r) => r.name)),
    index: new Set(indexes.rows.map((r) => r.name)),
    fn: new Set(functions.rows.map((r) => r.name)),
    trigger: new Set(triggers.rows.map((r) => r.name)),
  };
  const present = (marker: Marker): boolean => {
    if ("table" in marker) return has.table.has(marker.table);
    if ("column" in marker) return has.column.has(marker.column.join("."));
    if ("index" in marker) return has.index.has(marker.index);
    if ("fn" in marker) return has.fn.has(marker.fn);
    return has.trigger.has(marker.trigger.join("@"));
  };
  return MIGRATIONS.map(({ id, title, script, markers }) => ({
    id,
    title,
    script,
    state: markers.length === 0 ? "data-only" : markers.every(present) ? "applied" : "missing",
  }));
}
