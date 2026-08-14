/**
 * One-off data migration: seed `order_types` from the customer types
 * already present on orders.
 *
 * Order type used to be free text copied from the Sheet's "סוג לקוח"
 * column. It is now a managed list with a colour each, chosen in
 * Settings. Rather than start empty and leave every existing order
 * looking untyped, this creates an entry for each distinct value in use.
 *
 * Colours are a starting palette, deliberately muted so the table doesn't
 * turn into a highlighter — the owner is expected to change them.
 *
 * Idempotent: entries are matched by name and skipped if present, so a
 * re-run adds only types that appeared since.
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

// Cycled in order of how common each type is, so the most-used ones get
// the most distinguishable colours.
const PALETTE = ["#f6d9a8", "#c7e6dc", "#dfd4f2", "#cfe0bc", "#f2d4d4", "#d4e2f2", "#eadcc4"];

const inUse = await sql`
  SELECT btrim(customer_type) AS name, count(*)::int AS n
  FROM orders
  WHERE btrim(coalesce(customer_type, '')) <> ''
  GROUP BY 1
  ORDER BY n DESC`;

if (inUse.length === 0) {
  console.log("No customer types on any order — nothing to seed.");
  process.exit(0);
}

const existing = new Set((await sql`SELECT name FROM order_types`).map((r) => r.name));

let created = 0;
for (const [index, row] of inUse.entries()) {
  if (existing.has(row.name)) {
    console.log(`  skip   ${row.name} (already in the list)`);
    continue;
  }
  await sql`
    INSERT INTO order_types (name, color, position)
    VALUES (${row.name}, ${PALETTE[index % PALETTE.length]}, ${index})`;
  console.log(`  create ${row.name.padEnd(16)} ${PALETTE[index % PALETTE.length]}  (${row.n} orders)`);
  created += 1;
}

console.log(`\nCreated ${created} order types, skipped ${inUse.length - created}.`);
console.log("orders.customer_type is unchanged — types match by name, so no order lost its type.");
