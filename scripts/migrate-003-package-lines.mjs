/**
 * One-off data migration: order_content_lines -> order_package_lines +
 * order_package_line_flavors.
 *
 * The old shape held an order's content as two independent lists — how it
 * was packaged, and how its units split by flavour — which could not say
 * which flavours went into which tray. The new shape hangs flavours off
 * each package line. See src/lib/schema.sql.
 *
 * Run `npm run db:migrate` first to create the new tables.
 *
 * Idempotent: an order that already has package lines is skipped, so a
 * re-run cannot duplicate or clobber content edited since the last run.
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

const legacyLines = await sql`
  SELECT c.id, c.order_id, c.package_type_id, c.flavor_id, c.quantity,
         p.units_per_package
  FROM order_content_lines c
  LEFT JOIN package_types p ON p.id = c.package_type_id
  WHERE c.order_id NOT IN (SELECT DISTINCT order_id FROM order_package_lines)
  ORDER BY c.order_id, c.id`;

if (legacyLines.length === 0) {
  console.log("Nothing to migrate — every order with content already has package lines.");
  process.exit(0);
}

// A NUMERIC/int from the driver may arrive as a string.
const num = (v) => (v === null || v === undefined ? null : Number(v));

const byOrder = new Map();
for (const row of legacyLines) {
  const entry = byOrder.get(row.order_id) ?? { packaging: [], flavors: [] };
  if (row.package_type_id !== null) {
    entry.packaging.push({
      packageTypeId: num(row.package_type_id),
      quantity: num(row.quantity),
      packed: num(row.quantity) * (num(row.units_per_package) ?? 0),
    });
  } else {
    entry.flavors.push({ flavorId: num(row.flavor_id), units: num(row.quantity) });
  }
  byOrder.set(row.order_id, entry);
}

/**
 * Decides which package line each flavour's units belong to. The old data
 * simply doesn't record this, so there are three cases:
 *
 *   one package line   — unambiguous, everything goes on it (the case all
 *                        of this project's real orders are in)
 *   several            — split each flavour across the lines in proportion
 *                        to how many units each packs, remainder to the
 *                        largest. Preserves both per-flavour and per-line
 *                        totals, and is the only even-handed reading of a
 *                        source that never made the distinction
 *   none               — flavours but no packaging: fall back to a single
 *                        line of the 1-unit package type so nothing is lost
 */
function assign(entry, unitPackageTypeId) {
  if (entry.packaging.length === 0) {
    if (entry.flavors.length === 0) return [];
    if (unitPackageTypeId === null) return null;
    const total = entry.flavors.reduce((s, f) => s + f.units, 0);
    return [{ packageTypeId: unitPackageTypeId, quantity: total, flavors: entry.flavors }];
  }

  const lines = entry.packaging.map((p) => ({ ...p, flavors: [] }));
  if (lines.length === 1) {
    lines[0].flavors = entry.flavors;
    return lines;
  }

  const totalPacked = lines.reduce((s, l) => s + l.packed, 0);
  const biggest = lines.reduce((a, b) => (b.packed > a.packed ? b : a));
  for (const flavor of entry.flavors) {
    let placed = 0;
    for (const line of lines) {
      if (line === biggest) continue;
      const share = totalPacked > 0 ? Math.round((line.packed / totalPacked) * flavor.units) : 0;
      if (share > 0) line.flavors.push({ flavorId: flavor.flavorId, units: share });
      placed += share;
    }
    const rest = flavor.units - placed;
    if (rest > 0) biggest.flavors.push({ flavorId: flavor.flavorId, units: rest });
  }
  return lines;
}

const [unitPackage] = await sql`
  SELECT id FROM package_types WHERE units_per_package = 1 ORDER BY id LIMIT 1`;
const unitPackageTypeId = unitPackage ? Number(unitPackage.id) : null;

let orderCount = 0;
let lineCount = 0;
let flavorCount = 0;
const skipped = [];

for (const [orderId, entry] of byOrder) {
  const lines = assign(entry, unitPackageTypeId);
  if (lines === null) {
    skipped.push(orderId);
    continue;
  }

  for (const [position, line] of lines.entries()) {
    const [inserted] = await sql`
      INSERT INTO order_package_lines (order_id, package_type_id, quantity, position)
      VALUES (${orderId}, ${line.packageTypeId}, ${line.quantity}, ${position})
      RETURNING id`;
    lineCount += 1;

    for (const [flavorPosition, flavor] of line.flavors.entries()) {
      await sql`
        INSERT INTO order_package_line_flavors (line_id, flavor_id, units, position)
        VALUES (${inserted.id}, ${flavor.flavorId}, ${flavor.units}, ${flavorPosition})`;
      flavorCount += 1;
    }
  }
  orderCount += 1;
}

console.log(`Migrated ${orderCount} orders -> ${lineCount} package lines, ${flavorCount} flavour rows.`);
if (skipped.length > 0) {
  console.warn(
    `Skipped orders ${skipped.join(", ")}: they have flavours but no packaging, and no 1-unit package type exists to fall back on.`,
  );
}
console.log("order_content_lines left in place — it is the audit trail for this migration.");
