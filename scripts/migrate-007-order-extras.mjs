/**
 * One-off data migration: the columns behind the order extras — waitress
 * count, kosher flag, and a price for each of waitressing, mirrors and
 * kosher. Delivery already had `delivery_cost`.
 *
 * `npm run db:migrate` creates these from schema.sql; this script exists
 * so a database can be brought forward without re-running the whole file,
 * and reports what an order's total now comes to so the delivery change
 * can be eyeballed (see CLAUDE.md — delivery is now added to the total
 * rather than sitting outside it).
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

await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS waitresses INTEGER`;
await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS kosher BOOLEAN NOT NULL DEFAULT false`;
await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS waitress_cost NUMERIC(10, 2)`;
await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS mirrors_cost NUMERIC(10, 2)`;
await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS kosher_cost NUMERIC(10, 2)`;
console.log("Columns are in place.");

const affected = await sql`
  SELECT id, customer, total_amount, delivery_cost
  FROM orders
  WHERE delivery_cost IS NOT NULL AND delivery_cost <> 0
  ORDER BY date DESC`;

if (affected.length === 0) {
  console.log("\nNo order carries a delivery cost, so no total changes meaning.");
} else {
  console.log(
    `\n${affected.length} orders carry a delivery cost. Delivery now adds to the total`,
    "rather than sitting outside it, so each of these is worth that much more:",
  );
  for (const row of affected) {
    const was = Number(row.total_amount);
    const delivery = Number(row.delivery_cost);
    console.log(`  #${row.id} ${row.customer}: ${was} + ${delivery} = ${was + delivery}`);
  }
  console.log("\nIf the amount already included delivery, clear the delivery field on those orders.");
}
