/**
 * One-off data migration: jelly is priced per unit in four quantity
 * tiers instead of one flat rate, and a preset can carry a price of its
 * own.
 *
 * The four tier rates are seeded from whatever the single `unit` rate was,
 * so the change is a no-op for pricing until the owner sets them apart.
 * `unit` is then removed. `mirror` is deliberately left alone: migration
 * 012 reads it to price the "Mirror" display option that replaces it, and
 * deleting it here would run the pair out of order on a fresh database.
 *
 * A preset's price is *copied* onto an order line when the preset is
 * applied (`order_package_lines.package_price`), never looked up, so
 * repricing a preset can never change an order already booked.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS, ON CONFLICT DO NOTHING, and the
 * seed reads the old rate only while it still exists.
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

await sql`ALTER TABLE content_presets ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2)`;
await sql`ALTER TABLE order_package_lines ADD COLUMN IF NOT EXISTS package_price NUMERIC(10, 2)`;
console.log("Columns are in place.");

const [old] = await sql`SELECT amount FROM prices WHERE key = 'unit'`;
const carried = old ? Number(old.amount) : 0;
await sql`
  INSERT INTO prices (key, amount) VALUES
    ('unit_100', ${carried}), ('unit_200', ${carried}),
    ('unit_500', ${carried}), ('unit_max', ${carried})
  ON CONFLICT (key) DO NOTHING`;
console.log(`Tier rates seeded from the old flat rate (₪${carried}).`);

await sql`DELETE FROM prices WHERE key = 'unit'`;

const rates = await sql`SELECT key, amount FROM prices ORDER BY key`;
console.log("\nRates now:");
for (const r of rates) console.log(`  ${r.key.padEnd(10)} ₪${r.amount}`);
