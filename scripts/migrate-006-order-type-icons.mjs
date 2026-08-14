/**
 * One-off data migration: give the order types that already existed an
 * icon, so the new picker doesn't start with seven identical tags.
 *
 * Keys match lib/icons.ts's ORDER_TYPE_ICONS, and the mapping is the same
 * guess lib/icons.ts's EVENT_TYPES was already making for these Hebrew
 * names — this just moves it into data the owner can change.
 *
 * Idempotent: only fills icons that are still NULL, so a type re-iconed by
 * hand is never overwritten.
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

const ICONS = {
  "לקוח פרטי": "user",
  "חברת הפקה": "production",
  "חברת הייטק": "hitech",
  חתונה: "wedding",
  מעדניה: "store",
  "אירוע יח״צ": "party",
  'אירוע יח"צ': "party",
  "מסיבת רווקות": "party",
};

const pending = await sql`SELECT id, name FROM order_types WHERE icon IS NULL ORDER BY id`;
if (pending.length === 0) {
  console.log("Nothing to do — every order type already has an icon.");
  process.exit(0);
}

let updated = 0;
for (const row of pending) {
  const icon = ICONS[row.name.trim()] ?? "tag";
  await sql`UPDATE order_types SET icon = ${icon} WHERE id = ${row.id}`;
  console.log(`  ${row.name} -> ${icon}`);
  updated += 1;
}
console.log(`\nSet an icon on ${updated} order types.`);
