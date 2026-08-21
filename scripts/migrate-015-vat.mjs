// Migration 015 — VAT on orders and expenses.
//
// Adds vat_mode / vat_rate to both tables and stamps the back catalogue by
// date: Gems Cocktail Bites registered as a business when it started using
// SUMIT on 2026-06-23, so anything dated before that was genuinely exempt
// and everything since carries VAT inside the agreed price.
//
// The boundary is imperfect on purpose. `orders.date` is the *event* date,
// not the invoice date, so an event in July quoted in May lands on the
// wrong side of it — but a rule that can be corrected one order at a time
// beats a guess spread silently across the whole table, and the mode is an
// ordinary editable field.
//
// Idempotent: re-running only stamps rows still at the column default.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(path.join(__dirname, "../.env.local"), "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const REGISTERED_FROM = "2026-06-23";
const RATE = 18;

const sql = neon(process.env.DATABASE_URL);

await sql.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_mode TEXT NOT NULL DEFAULT 'included'`);
await sql.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5, 2) NOT NULL DEFAULT 0`);
await sql.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vat_mode TEXT NOT NULL DEFAULT 'included'`);
await sql.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5, 2) NOT NULL DEFAULT 0`);
await sql.query(`INSERT INTO prices (key, amount) VALUES ('vat_rate', $1) ON CONFLICT (key) DO NOTHING`, [RATE]);

// Only rows still at the default rate of 0 are touched, so a row already
// stamped -- by an earlier run, or corrected by hand since -- is left alone.
for (const table of ["orders", "expenses"]) {
  const { rows } = await sql.query(
    `UPDATE ${table}
        SET vat_mode = CASE WHEN date < $1 THEN 'exempt' ELSE 'included' END,
            vat_rate = CASE WHEN date < $1 THEN 0 ELSE $2 END
      WHERE vat_rate = 0 AND vat_mode = 'included'
      RETURNING date < $1 AS was_exempt`,
    [REGISTERED_FROM, RATE],
  );
  const exempt = rows.filter((row) => row.was_exempt).length;
  console.log(`${table}: ${rows.length} stamped — ${exempt} exempt, ${rows.length - exempt} VAT-inclusive at ${RATE}%.`);
}

console.log("Done. Rows already carrying a rate were left alone.");
