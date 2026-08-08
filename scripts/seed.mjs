// Seeds the owner-editable value lists with real starting data (see
// CLAUDE.md / implementation plan for where these values came from —
// flavor colors from the owner's product photos, categories from the
// Sheet's own מעקב הוצאות tab). Safe to re-run: skips rows that already
// exist by name.
import { neon } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envContent = fs.readFileSync(path.join(__dirname, "../.env.local"), "utf8");
const dbUrl = envContent.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
if (!dbUrl) throw new Error("DATABASE_URL not set in .env.local");

const sql = neon(dbUrl);

const FLAVORS = [
  { name: "Gin & Tonic", glow: "#D4FF3D", base: "#A8C91E", shadow: "#5C6E0E", alcoholic: true },
  { name: "Lychee Martini", glow: "#FFFBEA", base: "#E8DCA8", shadow: "#8A7A3E", alcoholic: true },
  { name: "Kir Royale", glow: "#FF2D6B", base: "#8A1030", shadow: "#55071E", alcoholic: true },
  { name: "Spicy Margarita", glow: "#FF6B3D", base: "#E8501F", shadow: "#8F3010", alcoholic: true },
  { name: "Vodka Berry", glow: "#E82DC7", base: "#8A1878", shadow: "#55104A", alcoholic: true },
  { name: "Piña Colada Mocktail", glow: "#FFEB3B", base: "#E8B800", shadow: "#8F7200", alcoholic: false },
  { name: "Jasmine", glow: "#FFA940", base: "#E8720F", shadow: "#8F4409", alcoholic: true },
  { name: "Midori Sour", glow: "#7DFF3D", base: "#4A9418", shadow: "#2C5A0E", alcoholic: true },
];

const PACKAGE_TYPES = [
  { name: "Small tray", units: 50 },
  { name: "Big tray", units: 150 },
  { name: "Units", units: 1 },
];

const PAYMENT_METHODS = ["Cash", "Credit card"];

const EXPENSE_CATEGORIES = [
  "Waitressing",
  "Delivery",
  "Instagram & Branding",
  "Alcohol & Raw Materials",
  "Kitchen Equipment",
  "Packaging & Serving",
];

for (const f of FLAVORS) {
  await sql`
    INSERT INTO flavors (name, color_glow, color_base, color_shadow, is_alcoholic)
    VALUES (${f.name}, ${f.glow}, ${f.base}, ${f.shadow}, ${f.alcoholic})
    ON CONFLICT DO NOTHING
  `;
}

for (const p of PACKAGE_TYPES) {
  const existing = await sql`SELECT id FROM package_types WHERE name = ${p.name}`;
  if (existing.length === 0) {
    await sql`INSERT INTO package_types (name, units_per_package) VALUES (${p.name}, ${p.units})`;
  }
}

for (const name of PAYMENT_METHODS) {
  const existing = await sql`SELECT id FROM payment_methods WHERE name = ${name}`;
  if (existing.length === 0) {
    await sql`INSERT INTO payment_methods (name) VALUES (${name})`;
  }
}

for (const name of EXPENSE_CATEGORIES) {
  const existing = await sql`SELECT id FROM expense_categories WHERE name = ${name}`;
  if (existing.length === 0) {
    await sql`INSERT INTO expense_categories (name) VALUES (${name})`;
  }
}

const counts = await sql`
  SELECT
    (SELECT count(*) FROM flavors) AS flavors,
    (SELECT count(*) FROM package_types) AS package_types,
    (SELECT count(*) FROM payment_methods) AS payment_methods,
    (SELECT count(*) FROM expense_categories) AS expense_categories
`;
console.log("Seeded. Row counts:", counts[0]);
