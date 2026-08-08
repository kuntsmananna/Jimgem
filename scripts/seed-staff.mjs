// One-time bootstrap for the first two login accounts (see CLAUDE.md /
// Authentication — this is deliberately not automatic on every deploy;
// run it once, note the printed passwords, then change them via Settings.
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envContent = fs.readFileSync(path.join(__dirname, "../.env.local"), "utf8");
const dbUrl = envContent.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
if (!dbUrl) throw new Error("DATABASE_URL not set in .env.local");

const sql = neon(dbUrl);

function randomPassword() {
  return crypto.randomBytes(9).toString("base64url"); // 12 chars, url-safe
}

const STAFF = [
  { name: "Anna", username: "anna" },
  { name: "Aviv", username: "aviv" },
];

console.log("Temporary credentials — note these down now, they won't be shown again:\n");

for (const s of STAFF) {
  const existing = await sql`SELECT id FROM staff WHERE username = ${s.username}`;
  if (existing.length > 0) {
    console.log(`${s.name} (${s.username}): already exists, skipped`);
    continue;
  }
  const password = randomPassword();
  const hash = await bcrypt.hash(password, 10);
  await sql`INSERT INTO staff (name, username, password_hash) VALUES (${s.name}, ${s.username}, ${hash})`;
  console.log(`${s.name}: username="${s.username}"  password="${password}"`);
}
