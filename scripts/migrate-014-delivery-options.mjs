/**
 * One-off data migration: delivery can be picked from a named list with a
 * price each, instead of only ever being a hand-typed amount.
 *
 * `orders.delivery_option_id` records which one was chosen. It stays NULL
 * for the orders that already carry a typed `delivery_cost`, which is
 * exactly what "delivered, amount entered by hand" means — so nothing
 * existing has to be guessed at or rewritten.
 *
 * No options are seeded: their names are destinations only the owner
 * knows, and an invented one would start pricing real orders.
 *
 * Idempotent: CREATE IF NOT EXISTS and ADD COLUMN IF NOT EXISTS.
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
  CREATE TABLE IF NOT EXISTS delivery_options (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_option_id INTEGER REFERENCES delivery_options(id)`;
console.log("Table and column are in place.");

const [row] = await sql`
  SELECT count(*) FILTER (WHERE delivery_cost IS NOT NULL)::int AS delivered,
         count(*) FILTER (WHERE delivery_option_id IS NOT NULL)::int AS on_an_option
  FROM orders`;
console.log(`${row.delivered} orders have delivery, ${row.on_an_option} of them on a named option.`);
