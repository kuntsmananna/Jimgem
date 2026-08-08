// One-off migration: broadens order_production_status (Sheet-order
// production-status-only) into order_overrides (any editable field on a
// Sheet order, still never writing to the Sheet itself). Safe to re-run —
// every statement is idempotent (IF NOT EXISTS / conditional rename).
import { neon } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envContent = fs.readFileSync(path.join(__dirname, "../.env.local"), "utf8");
const dbUrl = envContent.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
if (!dbUrl) throw new Error("DATABASE_URL not set in .env.local");

const sql = neon(dbUrl);

const tableExists = async (name) => {
  const rows = await sql`SELECT 1 FROM information_schema.tables WHERE table_name = ${name}`;
  return rows.length > 0;
};

if ((await tableExists("order_production_status")) && !(await tableExists("order_overrides"))) {
  await sql`ALTER TABLE order_production_status RENAME TO order_overrides`;
  console.log("Renamed order_production_status -> order_overrides");
}

const columnExists = async (table, column) => {
  const rows = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}
  `;
  return rows.length > 0;
};

if (await columnExists("order_overrides", "status")) {
  await sql`ALTER TABLE order_overrides RENAME COLUMN status TO production_status`;
  await sql`ALTER TABLE order_overrides ALTER COLUMN production_status DROP NOT NULL`;
  await sql`ALTER TABLE order_overrides ALTER COLUMN production_status DROP DEFAULT`;
  console.log("Renamed status -> production_status, made nullable");
}

await sql`ALTER TABLE order_overrides ADD COLUMN IF NOT EXISTS customer TEXT`;
await sql`ALTER TABLE order_overrides ADD COLUMN IF NOT EXISTS customer_type TEXT`;
await sql`ALTER TABLE order_overrides ADD COLUMN IF NOT EXISTS location TEXT`;
await sql`ALTER TABLE order_overrides ADD COLUMN IF NOT EXISTS guests INTEGER`;
await sql`ALTER TABLE order_overrides ADD COLUMN IF NOT EXISTS delivery_cost NUMERIC(10, 2)`;
await sql`ALTER TABLE order_overrides ADD COLUMN IF NOT EXISTS mirrors INTEGER`;
await sql`ALTER TABLE order_overrides ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10, 2)`;
await sql`ALTER TABLE order_overrides ADD COLUMN IF NOT EXISTS deposit NUMERIC(10, 2)`;
await sql`ALTER TABLE order_overrides ADD COLUMN IF NOT EXISTS payment_status TEXT`;
await sql`ALTER TABLE order_overrides ADD COLUMN IF NOT EXISTS notes TEXT`;
console.log("Ensured override columns exist");

const rows = await sql`SELECT * FROM order_overrides`;
console.log("Final order_overrides contents:", rows);
