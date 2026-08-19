/**
 * One-off data migration: the owner's standard rates, and the "Offer"
 * production stage.
 *
 * `npm run db:migrate` creates both from schema.sql; this script exists so
 * a database already carrying orders can be brought forward without
 * re-running the whole file.
 *
 * Idempotent: the table creation and the seed are IF NOT EXISTS / ON
 * CONFLICT DO NOTHING, and the CHECK constraint is dropped before being
 * re-added, so a database that already allows 'offer' ends up unchanged.
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
  CREATE TABLE IF NOT EXISTS prices (
    key TEXT PRIMARY KEY,
    amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

// Seeded at zero, not at a guess: an invented rate would silently start
// pricing real orders. Zero prices nothing until the owner fills them in.
await sql`
  INSERT INTO prices (key, amount) VALUES
    ('unit', 0), ('delivery', 0), ('mirror', 0), ('waitress', 0), ('kosher', 0)
  ON CONFLICT (key) DO NOTHING`;
console.log("Prices table ready.");

/*
 * Postgres has no "ALTER CHECK", so the old constraint has to go first.
 * Its name is the default Postgres gives an inline column CHECK.
 */
await sql`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_production_status_check`;
await sql`
  ALTER TABLE orders ADD CONSTRAINT orders_production_status_check
    CHECK (production_status IN ('offer', 'queue', 'preparing', 'delivered'))`;
console.log("Production status now accepts 'offer'.");

const rates = await sql`SELECT key, amount FROM prices ORDER BY key`;
console.log("\nCurrent rates:");
for (const row of rates) console.log(`  ${row.key.padEnd(10)} ₪${row.amount}`);

const stages = await sql`
  SELECT production_status, count(*)::int AS n FROM orders GROUP BY 1 ORDER BY 1`;
console.log("\nOrders by stage:");
for (const row of stages) console.log(`  ${row.production_status.padEnd(10)} ${row.n}`);
