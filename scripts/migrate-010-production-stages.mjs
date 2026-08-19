/**
 * One-off data migration: the production stages become an owner-managed
 * list instead of four names hardcoded in a CHECK constraint.
 *
 * Orders keep storing the stage's `key`, so nothing on the orders table
 * has to be rewritten — only the constraint that pinned the set of
 * allowed keys goes away.
 *
 * The two behaviours that used to be spelled against particular names
 * move onto the rows: `counts_as_income` is false for a quote, and
 * `is_final` marks the stage the table's default filter leaves out.
 *
 * Idempotent: CREATE IF NOT EXISTS, ON CONFLICT DO NOTHING, and a DROP
 * CONSTRAINT IF EXISTS.
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

await sql`
  CREATE TABLE IF NOT EXISTS production_stages (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    counts_as_income BOOLEAN NOT NULL DEFAULT true,
    is_final BOOLEAN NOT NULL DEFAULT false,
    color TEXT NOT NULL DEFAULT '#e7dbcc',
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

await sql`
  INSERT INTO production_stages (key, label, position, counts_as_income, is_final, color) VALUES
    ('offer', 'Offer', 0, false, false, '#efe7dd'),
    ('queue', 'Queue', 1, true, false, '#e4e9f2'),
    ('preparing', 'Preparing', 2, true, false, '#f6d9a8'),
    ('delivered', 'Delivered', 3, true, true, '#cfe0bc')
  ON CONFLICT (key) DO NOTHING`;
console.log("Stages seeded.");

await sql`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_production_status_check`;
console.log("The fixed stage list is no longer enforced by a constraint.");

const stages = await sql`SELECT key, label, position, counts_as_income, is_final FROM production_stages ORDER BY position`;
console.log("\nStages:");
for (const s of stages) {
  const flags = [s.counts_as_income ? "income" : "not income", s.is_final ? "final" : ""].filter(Boolean);
  console.log(`  ${String(s.position).padEnd(2)} ${s.key.padEnd(12)} ${s.label.padEnd(12)} ${flags.join(", ")}`);
}

// Any order sitting on a key with no stage row would vanish from the
// board, so say so rather than let it be discovered later.
const orphans = await sql`
  SELECT o.production_status, count(*)::int AS n
  FROM orders o LEFT JOIN production_stages s ON s.key = o.production_status
  WHERE s.key IS NULL GROUP BY 1`;
console.log(orphans.length === 0 ? "\nEvery order's stage resolves." : `\nOrders on an unknown stage: ${JSON.stringify(orphans)}`);
