/**
 * One-off data migration: `archived_at` on the three owner-managed lists
 * that did not have one — package types, payment methods and expense
 * categories.
 *
 * They archive rather than delete for the same reason flavors do: an
 * order references its package type and an expense its category, so a
 * hard delete would either orphan those rows or cascade and take real
 * history with it. Archiving takes the value out of every picker while
 * leaving what already used it exactly as recorded.
 *
 * Idempotent: every statement is ADD COLUMN IF NOT EXISTS.
 */
import { neon } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envContent = fs.readFileSync(path.join(__dirname, "../.env.local"), "utf8");
const dbUrl = envContent.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
if (!dbUrl) throw new Error("DATABASE_URL not set in .env.local");

const sql = neon(dbUrl);

await sql`ALTER TABLE package_types ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`;
await sql`ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`;
await sql`ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`;
console.log("Columns are in place.");

for (const table of ["package_types", "payment_methods", "expense_categories", "order_types", "flavors"]) {
  // sql.query, not the tagged template: the table name is interpolated
  // here, and a template placeholder would send it as a bound value.
  const [row] = await sql.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE archived_at IS NOT NULL)::int AS archived
     FROM ${table}`,
  );
  console.log(`  ${table.padEnd(20)} ${row.total} rows, ${row.archived} archived`);
}
