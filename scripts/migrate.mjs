// One-off schema migration runner. Uses Neon's HTTP driver, same as the
// app itself (see src/lib/db.ts). Safe to re-run: every statement in
// schema.sql is `CREATE TABLE IF NOT EXISTS`.
import { neon } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envContent = fs.readFileSync(path.join(__dirname, "../.env.local"), "utf8");
const dbUrl = envContent.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
if (!dbUrl) throw new Error("DATABASE_URL not set in .env.local");

const sql = neon(dbUrl);
const schema = fs.readFileSync(path.join(__dirname, "../src/lib/schema.sql"), "utf8");

// Neon's HTTP driver runs one statement per call — split the schema file
// on statement-terminating semicolons, stripping full-line comments first
// so a comment block preceding a statement doesn't hide the statement
// behind it.
const statements = schema
  .split(";")
  .map((chunk) =>
    chunk
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter((s) => s.length > 0);

const tables = await Promise.resolve().then(async () => {
  for (const stmt of statements) {
    await sql.query(stmt);
  }
  return sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`;
});

console.log(`Applied ${statements.length} statements.`);
console.log("Tables:", tables.map((r) => r.table_name).join(", "));
