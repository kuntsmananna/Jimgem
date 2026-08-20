/**
 * One-off data migration: a discount on an order, given either as a
 * percentage of the order or as a flat amount off it.
 *
 * Two columns rather than one signed number: "10% off" and "₪10 off" are
 * different promises to a customer, and storing only the resolved shekels
 * would lose which one was agreed the moment anything else on the order
 * changed.
 *
 * The discount comes off the whole order — jelly plus every extra — not
 * off the jelly alone, which is what "a discount on the order" means when
 * it is offered.
 *
 * Idempotent: both statements are ADD COLUMN IF NOT EXISTS, and the
 * default of 0 means no existing order changes value.
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

await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC(10, 2) NOT NULL DEFAULT 0`;
await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_is_percent BOOLEAN NOT NULL DEFAULT false`;
console.log("Columns are in place.");

const [row] = await sql`
  SELECT count(*)::int AS orders, count(*) FILTER (WHERE discount <> 0)::int AS discounted FROM orders`;
console.log(`${row.orders} orders, ${row.discounted} carrying a discount.`);
