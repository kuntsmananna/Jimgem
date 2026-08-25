import { getDb, isMissingTable, reportMissingTable } from "./db";
import { isoStamp } from "./stamp";
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

  /*
   * Every table at once, not one after another.
   *
   * Each read is its own HTTP round trip on this driver, so twenty-one of
   * them in sequence is a second of doing nothing but waiting. They do not
   * depend on each other, and reading them concurrently also *narrows* the
   * window the copy is taken across rather than widening it: a snapshot
   * spread over a second is less of one picture than a snapshot spread
   * over a few milliseconds.
   */
  const wanted = tables.map(({ table_name }) => table_name).filter((table) => !SKIP.has(table));
  const contents = await Promise.all(
    // The table name comes from information_schema, not from anything a
    // caller typed, and is quoted on the way in regardless.
    wanted.map((table) => db.query(`SELECT * FROM "${table.replace(/"/g, '""')}"`)),
  );

  const data: Record<string, unknown[]> = {};
  const rowCounts: Record<string, number> = {};
  wanted.forEach((table, at) => {
    data[table] = contents[at]!.rows;
    rowCounts[table] = contents[at]!.rows.length;
  });

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
    // Bytes, not `document.length`: that counts UTF-16 units, and a
    // Hebrew customer name is one unit and two bytes — so the size the
    // pane prints would read up to half of what the copy actually is.
    [APP_VERSION_LABEL, kind, JSON.stringify(rowCounts), Buffer.byteLength(document), document],
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
    takenAt: isoStamp(rows[0]!.taken_at),
    appVersion: APP_VERSION_LABEL,
    kind,
    rowCounts,
    bytes: Buffer.byteLength(document),
  };
}

/**
 * The list, without the payloads — a snapshot is most of a megabyte and
 * the pane only ever shows its shape.
 *
 * `available` rides inside the answer rather than being a second question
 * asked of `information_schema`, which is how `getSumitUsage` and
 * `getHistory` report the same thing: one query knows both, and two
 * mechanisms for one fact can disagree — the pane would then read
 * "nothing taken yet, the first lands tonight", which is the most
 * reassuring of the possible answers, in the case where something is
 * actually wrong.
 */
export interface Snapshots {
  /** False until migration 027 has been run against this database. */
  available: boolean;
  snapshots: SnapshotSummary[];
}

export async function listSnapshots(): Promise<Snapshots> {
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
      // Every column but `data`, which is the whole point of the table and
      // has no business crossing the wire to draw a list.
      `SELECT id, taken_at, app_version, kind, row_counts, bytes
         FROM db_snapshots ORDER BY taken_at DESC`,
    );
    return {
      available: true,
      snapshots: rows.map((row) => ({
        id: row.id,
        takenAt: isoStamp(row.taken_at),
        appVersion: row.app_version,
        kind: row.kind,
        rowCounts: row.row_counts,
        bytes: row.bytes,
      })),
    };
  } catch (error) {
    if (!isMissingTable(error, "db_snapshots")) throw error;
    await reportMissingTable("db_snapshots", "scripts/migrate-027-snapshots.sql");
    return { available: false, snapshots: [] };
  }
}

/**
 * One snapshot's payload, as a file to keep somewhere else — with the
 * login hashes taken out of it.
 *
 * The stored copy holds every column, because a restore has to put the
 * accounts back as they were. A *downloaded* copy is a different thing:
 * it is meant to leave, onto a laptop and into whatever the owner keeps
 * it in, and nothing that leaves should carry `staff.password_hash`.
 * Two known usernames and an offline bcrypt hash is a password-cracking
 * exercise, not a backup.
 *
 * So a restore from a downloaded file comes back with both logins blank
 * and they are set again by hand — one statement, against two accounts,
 * on the rare day the whole database has to be rebuilt from a file. See
 * scripts/restore-snapshot.mjs, which says so where it matters.
 *
 * Redacted here rather than at capture, because the hash sitting inside
 * the database it already lives in is not an exposure; the copy walking
 * out of the building is.
 */
export async function getSnapshotDocument(id: number): Promise<string | null> {
  const db = getDb();
  // `data::text` rather than `data`: only the staff rows need touching,
  // and the driver would otherwise parse a megabyte of JSON into objects
  // for the sake of a couple of fields.
  const { rows } = await db.query<{ data: string }>(
    // Rebuilt in the database rather than in Node: only the staff rows
    // are touched, and the alternative is parsing a megabyte of JSON into
    // objects for the sake of one field. The CASE leaves a document that
    // has no staff array exactly as it is — `jsonb_set` would otherwise
    // add an empty one that was never in the backup.
    `SELECT CASE
              WHEN data -> 'data' ? 'staff' THEN jsonb_set(
                data,
                '{data,staff}',
                COALESCE(
                  (SELECT jsonb_agg(person - 'password_hash')
                     FROM jsonb_array_elements(data -> 'data' -> 'staff') AS person),
                  '[]'::jsonb
                )
              )
              ELSE data
            END::text AS data
       FROM db_snapshots WHERE id = $1`,
    [id],
  );
  return rows[0]?.data ?? null;
}
