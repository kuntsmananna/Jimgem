// CLI runner for the same import the Settings button triggers — used to
// bootstrap the DB and to re-run the import without a browser session.
// See src/lib/sheetImport.ts for the semantics (additive, never
// overwrites rows already imported).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(path.join(__dirname, "../.env.local"), "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const { importFromSheet } = await import("../src/lib/sheetImport.js");

const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
if (!spreadsheetId) throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID not set in .env.local");

const result = await importFromSheet(spreadsheetId);
console.log(
  `Imported ${result.ordersImported} orders and ${result.expenseItemsImported} expense amounts. ` +
    `Left alone: ${result.ordersAlreadyPresent} orders and ${result.expenseItemsAlreadyPresent} expense amounts ` +
    `already present. Undated sheet rows, not importable: ${result.ordersUndated}.`,
);
