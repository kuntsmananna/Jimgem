import { getDb } from "./db";
import { APP_VERSION_LABEL } from "./version";

/**
 * How many nightly snapshots to keep.
 *
 * Two weeks is the window in which "when did this go wrong?" is still a
 * question anyone can answer from memory — past that, the revision log is
 * the better tool, since it says what changed rather than only what the
 * database looked like. Fourteen copies of a business this size is a few
 * megabytes.
 */
const KEEP = 14;

/**
 * Tables a snapshot deliberately leaves out.
 *
 * `row_revisions` is the history itself: copying it into every snapshot
 * would square the storage and give back nothing a restore needs.
 * `db_snapshots` for the obvious reason. The two legacy tables are
 * unread — they are kept as an audit trail of folds already applied, and
 * they never change again.
 */
const SKIP = new Set(["row_revisions", "db_snapshots", "order_content_lines", "order_overrides"]);

/**
 * The order a restore has to insert in, parents before children.
 *
 * Recorded at capture time rather than worked out at restore time, because
 * a restore may be reading this file into an empty database — or into a
 * different one, months later — where there are no foreign keys to ask.
 * Kahn's algorithm over the live constraints; a cycle (there are none
 * today) leaves the rest sorted and appends what it could not place.
 */
function dependencyOrder(tables: string[], edges: { child: string; parent: string }[]): string[] {
  const waiting = new Map(tables.map((table) => [table, new Set<string>()]));
  for (const { child, parent } of edges) {
    if (child !== parent && waiting.has(child) && waiting.has(parent)) waiting.get(child)!.add(parent);
  }

  const ordered: string[] = [];
  while (waiting.size > 0) {
    const ready = [...waiting.entries()].filter(([, parents]) => parents.size === 0).map(([table]) => table);
    if (ready.length === 0) {
      ordered.push(...waiting.keys());
      break;
    }
    for (const table of ready) {
      ordered.push(table);
      waiting.delete(table);
    }
    for (const parents of waiting.values()) for (const table of ready) parents.delete(table);
  }
  return ordered;
}

export interface SnapshotSummary {
  id: number;
  takenAt: string;
  appVersion: string;
  kind: string;
  rowCounts: Record<string, number>;
  bytes: number;
}

/**
 * Everything, as one JSON document.
 *
 * The table list is read from the database rather than written out here,
 * so a table added next month is in the backup the same night — a list in
 * code is a list that goes stale exactly when it matters. Ordered by name
 * only for a stable, diffable file; a restore works out its own order from
 * the foreign keys.
 */
export async function captureSnapshot(kind: "nightly" | "manual" = "nightly"): Promise<SnapshotSummary> {
  const db = getDb();
  const { rows: tables } = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );

  const data: Record<string, unknown[]> = {};
  const rowCounts: Record<string, number> = {};
  for (const { table_name: table } of tables) {
    if (SKIP.has(table)) continue;
    // The table name comes from information_schema, not from anything a
    // caller typed, and is quoted on the way in regardless.
    const { rows } = await db.query(`SELECT * FROM "${table.replace(/"/g, '""')}"`);
    data[table] = rows;
    rowCounts[table] = rows.length;
  }

  const { rows: edges } = await db.query<{ child: string; parent: string }>(
    `SELECT conrelid::regclass::text AS child, confrelid::regclass::text AS parent
       FROM pg_constraint WHERE contype = 'f'`,
  );

  const document = JSON.stringify({
    takenAt: new Date().toISOString(),
    appVersion: APP_VERSION_LABEL,
    tableOrder: dependencyOrder(Object.keys(data), edges),
    data,
  });
  const { rows } = await db.query<{ id: number; taken_at: string }>(
    `INSERT INTO db_snapshots (app_version, kind, row_counts, bytes, data)
     VALUES ($1, $2, $3::jsonb, $4, $5::jsonb) RETURNING id, taken_at`,
    [APP_VERSION_LABEL, kind, JSON.stringify(rowCounts), document.length, document],
  );

  // Pruned after the write, never before: a run that fails leaves the
  // older copies where they are rather than making room for nothing.
  await db.query(
    `DELETE FROM db_snapshots WHERE id NOT IN (
       SELECT id FROM db_snapshots ORDER BY taken_at DESC LIMIT $1
     )`,
    [KEEP],
  );

  return {
    id: rows[0]!.id,
    takenAt: new Date(rows[0]!.taken_at).toISOString(),
    appVersion: APP_VERSION_LABEL,
    kind,
    rowCounts,
    bytes: document.length,
  };
}

/**
 * The list, without the payloads — a snapshot is most of a megabyte and
 * the pane only ever shows its shape.
 */
export async function listSnapshots(): Promise<SnapshotSummary[]> {
  const db = getDb();
  try {
    const { rows } = await db.query<{
      id: number;
      taken_at: string;
      app_version: string;
      kind: string;
      row_counts: Record<string, number>;
      bytes: number;
    }>(
      `SELECT id, taken_at, app_version, kind, row_counts, bytes
         FROM db_snapshots ORDER BY taken_at DESC`,
    );
    return rows.map((row) => ({
      id: row.id,
      takenAt: new Date(row.taken_at).toISOString(),
      appVersion: row.app_version,
      kind: row.kind,
      rowCounts: row.row_counts,
      bytes: row.bytes,
    }));
  } catch {
    // Migration 027 not run against this database yet. The pane says so
    // rather than taking the Settings page down with it — the same rule
    // the SUMIT meter follows.
    return [];
  }
}

/** One snapshot's payload, as the JSON text it was stored as. */
export async function getSnapshotDocument(id: number): Promise<string | null> {
  const db = getDb();
  const { rows } = await db.query<{ data: unknown }>(`SELECT data FROM db_snapshots WHERE id = $1`, [id]);
  if (rows.length === 0) return null;
  return JSON.stringify(rows[0]!.data);
}

/** Whether the snapshot table exists at all — see `listSnapshots`. */
export async function snapshotsAvailable(): Promise<boolean> {
  const db = getDb();
  const { rows } = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'db_snapshots'
     ) AS exists`,
  );
  return rows[0]?.exists === true;
}
