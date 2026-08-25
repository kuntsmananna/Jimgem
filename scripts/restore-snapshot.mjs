#!/usr/bin/env node
/*
 * Turn a downloaded backup into the SQL that puts it back.
 *
 *   node scripts/restore-snapshot.mjs jimgem-backup-12.json > restore.sql
 *   node scripts/restore-snapshot.mjs backup.json --only orders,order_package_lines
 *
 * It prints SQL and touches nothing: the restore itself is a paste into
 * the database console, where it runs as one transaction that either
 * lands whole or not at all. That is deliberate — a restore is rare,
 * consequential, and worth reading before it runs. There is no "just do
 * it" flag for the same reason.
 *
 * The file carries the order its tables have to be written in (parents
 * before children), recorded when the snapshot was taken, so this works
 * against an empty database as well as a full one.
 */
import { readFileSync } from "node:fs";

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error("usage: node scripts/restore-snapshot.mjs <backup.json> [--only table,table]");
  process.exit(1);
}

const only = flagValue(flags, "--only")?.split(",").map((name) => name.trim());
const snapshot = JSON.parse(readFileSync(file, "utf8"));
const data = snapshot.data;
if (!data) {
  console.error("That file has no `data` — is it a Jimgem backup?");
  process.exit(1);
}
// Every backup carries the order its tables must be written back in;
// falling back to whatever order the keys happen to be in is the best
// that can be done for a file from before that was recorded.
const tableOrder = snapshot.tableOrder ?? Object.keys(data);

const tables = tableOrder.filter((table) => data[table] && (!only || only.includes(table)));

/** Not a bcrypt hash at all, so `compare` against it is always false. */
const UNUSABLE_HASH = "'!'";

const warnings = [];
const out = [];
out.push(`-- Restored from a Jimgem backup taken ${snapshot.takenAt} on ${snapshot.appVersion}.`);
out.push(`-- ${tables.length} tables, ${tables.reduce((n, t) => n + data[t].length, 0)} rows.`);
out.push(
  only
    ? "-- Partial restore: only the tables named on the command line are touched."
    : "-- Full restore: every table below is emptied first.",
);
out.push("BEGIN;");
// Emptied children-first, written parents-first. CASCADE would reach past
// the tables being restored, which for a partial restore is exactly the
// damage this is meant to undo.
for (const table of [...tables].reverse()) out.push(`DELETE FROM ${quoteName(table)};`);

for (const table of tables) {
  const rows = data[table];
  if (rows.length === 0) continue;
  const columns = Object.keys(rows[0]);
  /*
   * A downloaded backup has the login hashes stripped out of it (see
   * getSnapshotDocument), and staff.password_hash is NOT NULL — so the
   * rows are restored with a hash that cannot match anything, and both
   * logins are set again by hand afterwards. Failing closed: an account
   * nobody can sign into is the right state for one restored from a file
   * that never carried its password.
   */
  const blankedLogins = table === "staff" && !columns.includes("password_hash");
  if (blankedLogins) {
    columns.push("password_hash");
    warnings.push(
      `-- NOTE: ${rows.length} staff rows come back with no usable password (the download redacts it).`,
      "--       Set each one afterwards, e.g. from Settings > Team, before anyone tries to sign in.",
    );
  }
  // The column list is the same for every row of a table; built once
  // rather than re-quoted and re-joined a few thousand times.
  const columnList = columns.map(quoteName).join(", ");
  out.push("");
  out.push(`-- ${table}: ${rows.length} rows`);
  for (const row of rows) {
    out.push(
      `INSERT INTO ${quoteName(table)} (${columnList}) VALUES (${columns
        .map((column) =>
          blankedLogins && column === "password_hash" ? UNUSABLE_HASH : literal(row[column]),
        )
        .join(", ")});`,
    );
  }
  // The ids came back as they were, so the sequence behind them has to be
  // moved past the highest one or the next insert collides with history.
  // Only where there is an `id` at all: `prices` is keyed by its name, and
  // a max(id) over it fails when the statement is parsed, never mind run.
  if (columns.includes("id")) {
    out.push(
      `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT max(id) FROM ${quoteName(
        table,
      )}), 1)) WHERE pg_get_serial_sequence('${table}', 'id') IS NOT NULL;`,
    );
  }
}
out.push("");
out.push("COMMIT;");
// Warnings first, where they will be read, rather than buried mid-file.
console.log([...warnings, ...out].join("\n"));

function flagValue(argv, name) {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : argv[at + 1];
}

function quoteName(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/** Every value as SQL, with JSON left as JSON rather than flattened. */
function literal(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "object") return `${quote(JSON.stringify(value))}::jsonb`;
  return quote(String(value));
}

// A function declaration, not a const: the module's top-level code runs
// before it would be initialised.
function quote(text) {
  return `'${text.replace(/'/g, "''")}'`;
}
