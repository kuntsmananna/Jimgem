/**
 * One-off data migration: fold `orders.details` into `orders.notes`.
 *
 * `details` is the Sheet's פירוט column, copied in verbatim at import. It
 * showed up under the customer name in the Orders table as a field with
 * no label and no way to edit it, while `notes` — the field that *is*
 * editable — sat beside it holding a second Sheet column. Two free-text
 * fields, one of them read-only, is one too many.
 *
 * After this, notes carries the text and details is legacy: still stored
 * as the untouched original, but nothing reads it (same treatment as
 * order_overrides and order_content_lines).
 *
 * Merges rather than overwrites — 47 orders already had notes, mostly
 * "כולל מעמ". Order is details first, then any existing note, because
 * details is the description and the note is usually a short tag.
 *
 * Idempotent: an order whose notes already contain its details text is
 * skipped, so a re-run cannot append a second copy.
 *
 * Pass --dry to preview without writing.
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
const dryRun = process.argv.includes("--dry");

// position(... in ...) is a literal substring test, so text containing %
// or _ can't accidentally match the way it would with LIKE.
const pending = await sql`
  SELECT id, customer, btrim(coalesce(details, '')) AS details, btrim(coalesce(notes, '')) AS notes
  FROM orders
  WHERE btrim(coalesce(details, '')) <> ''
    AND position(btrim(coalesce(details, '')) in coalesce(notes, '')) = 0
  ORDER BY id`;

if (pending.length === 0) {
  console.log("Nothing to migrate — every order's details already sit in its notes.");
  process.exit(0);
}

const merged = (row) => (row.notes === "" ? row.details : `${row.details} · ${row.notes}`);

console.log(`${pending.length} orders to update.\n`);
for (const row of pending.slice(0, 5)) {
  console.log(`  #${row.id} ${row.customer}`);
  console.log(`    notes before: ${row.notes || "(empty)"}`);
  console.log(`    notes after:  ${merged(row)}`);
}
if (pending.length > 5) console.log(`  ... and ${pending.length - 5} more\n`);

if (dryRun) {
  console.log("\n--dry given, nothing written.");
  process.exit(0);
}

let updated = 0;
for (const row of pending) {
  await sql`UPDATE orders SET notes = ${merged(row)} WHERE id = ${row.id}`;
  updated += 1;
}

console.log(`\nUpdated ${updated} orders.`);
console.log("orders.details left in place — it stays the untouched original from the Sheet.");
