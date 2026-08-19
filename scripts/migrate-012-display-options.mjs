/**
 * One-off data migration: "mirrors" becomes "display" — an owner-managed
 * list of things an order can be shown on, each with its own price, and
 * an order can carry several at once.
 *
 * The existing mirror counts are folded into `order_displays` against a
 * seeded "Mirror" option priced at whatever the old `mirror` rate was, so
 * no order loses what it had. `orders.mirrors` and `orders.mirrors_cost`
 * are kept rather than dropped, so the fold-in stays auditable — the same
 * treatment order_overrides and order_content_lines got.
 *
 * Idempotent: CREATE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, and the
 * fold-in is an ON CONFLICT DO NOTHING insert.
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
  CREATE TABLE IF NOT EXISTS display_options (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
await sql`
  CREATE TABLE IF NOT EXISTS order_displays (
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    display_option_id INTEGER NOT NULL REFERENCES display_options(id),
    quantity INTEGER NOT NULL,
    PRIMARY KEY (order_id, display_option_id)
  )`;
await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS display_cost NUMERIC(10, 2)`;
console.log("Tables and columns are in place.");

/*
 * Three options because the owner asked for three; only the first is
 * seeded with a price, since it is the one that replaces a charge that
 * already existed. The other two open at zero rather than at a guess.
 */
const [oldRate] = await sql`SELECT amount FROM prices WHERE key = 'mirror'`;
const mirrorPrice = oldRate ? Number(oldRate.amount) : 0;
await sql`
  INSERT INTO display_options (name, price, position)
  SELECT * FROM (VALUES
    ('Mirror', ${mirrorPrice}::numeric, 0),
    ('Stand', 0::numeric, 1),
    ('Tray', 0::numeric, 2)
  ) AS seed(name, price, position)
  WHERE NOT EXISTS (SELECT 1 FROM display_options)`;

const [mirror] = await sql`SELECT id FROM display_options WHERE name = 'Mirror' ORDER BY id LIMIT 1`;
if (mirror) {
  const folded = await sql`
    INSERT INTO order_displays (order_id, display_option_id, quantity)
    SELECT id, ${mirror.id}, mirrors FROM orders WHERE mirrors IS NOT NULL AND mirrors > 0
    ON CONFLICT (order_id, display_option_id) DO NOTHING
    RETURNING order_id`;
  console.log(`Folded ${folded.length} mirror counts into order_displays.`);
}

// The old per-order mirror charge becomes the display charge, but only
// where nothing has been written to the new column yet.
const moved = await sql`
  UPDATE orders SET display_cost = mirrors_cost
  WHERE mirrors_cost IS NOT NULL AND display_cost IS NULL
  RETURNING id`;
console.log(`Carried ${moved.length} mirror charges over to display_cost.`);

// The rate has moved onto the option, so the flat key is done.
await sql`DELETE FROM prices WHERE key = 'mirror'`;

const options = await sql`SELECT name, price, position FROM display_options ORDER BY position`;
console.log("\nDisplay options:");
for (const o of options) console.log(`  ${o.name.padEnd(10)} ₪${o.price}`);
const [totals] = await sql`SELECT count(*)::int AS rows, coalesce(sum(quantity), 0)::int AS units FROM order_displays`;
console.log(`\norder_displays: ${totals.rows} rows, ${totals.units} items total`);
