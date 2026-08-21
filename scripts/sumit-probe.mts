// CLI runner for the same read-only probe the Settings → Data button
// runs. See src/lib/sumitProbe.ts for what it reports and why.
//
//   npm run sumit:probe
//   npm run sumit:probe -- --from 2024-01-01
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Same .env.local loader as import-sheet.mts, but tolerant of the file's
// absence so the keys can also come straight from the environment.
try {
  for (const line of readFileSync(path.join(__dirname, "../.env.local"), "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
} catch {
  console.log("No .env.local found — reading SUMIT_COMPANY_ID / SUMIT_API_KEY from the environment.");
}

const { runSumitProbe } = await import("../src/lib/sumitProbe.js");

const fromArg = process.argv.indexOf("--from");
console.log(await runSumitProbe(fromArg > -1 ? { dateFrom: process.argv[fromArg + 1] } : {}));
