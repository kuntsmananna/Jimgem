// Read-only reconnaissance against SUMIT, run before any of the
// integration is built. It answers the questions the design depends on —
// how much of the SUMIT customer roster matches the orders already in
// Postgres, which month expense documents really start (that is the Google
// Sheet cutover), whether customers carry phone numbers, and what document
// types the business actually issues.
//
// It writes nothing: not to SUMIT, not to the database. Everything it
// learns is printed here.
//
//   npm run sumit:probe            (whole history)
//   npm run sumit:probe -- --from 2024-01-01
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Same .env.local loader as import-sheet.mts, but tolerant of the file's
// absence so the two keys can also come straight from the environment.
try {
  for (const line of readFileSync(path.join(__dirname, "../.env.local"), "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
} catch {
  console.log("No .env.local found — reading SUMIT_COMPANY_ID / SUMIT_API_KEY from the environment.");
}

const { listDocuments, listFolders, listEntities, documentTypeName, isExpenseDocument } =
  await import("../src/lib/sumit.js");
type SumitDocument = Awaited<ReturnType<typeof listDocuments>>[number];

const fromArg = process.argv.indexOf("--from");
const dateFrom = fromArg > -1 ? process.argv[fromArg + 1] : "2015-01-01";
const dateTo = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const shekels = new Intl.NumberFormat("en-IL", { maximumFractionDigits: 0 });
const money = (amount: number) => `₪${shekels.format(Math.round(amount))}`;
const heading = (title: string) => console.log(`\n\x1b[1m${title}\x1b[0m\n${"─".repeat(title.length)}`);
const month = (document: SumitDocument) => (document.Date ?? "").slice(0, 7) || "no date";

/**
 * The comparison key for "is this the same client". Deliberately loose —
 * quotes and geresh/gershayim, punctuation and double spaces are all noise
 * in a hand-typed Hebrew business name — but never fuzzy: a near match is
 * reported as a near match, for a human to confirm.
 */
function normalizeName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/["'`׳״]/g, "")
    .replace(/[\s,.\-–—_/]+/g, " ")
    .trim()
    .toLowerCase();
}

function tally<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) group.push(item);
    else groups.set(key(item), [item]);
  }
  return groups;
}

function table(rows: string[][]): void {
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => [...row[column]].length)));
  for (const row of rows) {
    console.log(row.map((cell, column) => cell.padEnd(widths[column])).join("  "));
  }
}

console.log(`SUMIT probe — company ${process.env.SUMIT_COMPANY_ID}, ${dateFrom} → ${dateTo}`);
console.log("Read-only: nothing is written to SUMIT or to the database.");

// ── Documents ────────────────────────────────────────────────────────────
const documents = await listDocuments({ dateFrom, dateTo, includeDrafts: true });
heading("Documents");
if (documents.length === 0) {
  console.log("None returned. Either the window is wrong or the key has no access to accounting.");
  process.exit(0);
}
const dates = documents.map((document) => document.Date ?? "").filter(Boolean).sort();
console.log(`${documents.length} documents, ${dates[0]?.slice(0, 10)} → ${dates.at(-1)?.slice(0, 10)}`);
console.log(`${documents.filter((document) => document.IsDraft).length} of them drafts.`);

heading("Type mix");
table([
  ["type", "count", "value", "closed", "has pay URL"],
  ...[...tally(documents, (document) => documentTypeName(document.Type))]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([type, group]) => [
      type,
      String(group.length),
      money(group.reduce((sum, document) => sum + (document.CompanyValue ?? 0), 0)),
      String(group.filter((document) => document.IsClosed).length),
      String(group.filter((document) => document.DocumentPaymentURL).length),
    ]),
]);

// ── Income vs expense, by month: this is where the Sheet cutover comes from
const expenses = documents.filter((document) => isExpenseDocument(document.Type));
const income = documents.filter((document) => !isExpenseDocument(document.Type));
const months = [...new Set(documents.map(month))].sort();
heading("By month");
table([
  ["month", "income docs", "income ₪", "expense docs", "expense ₪"],
  ...months.map((key) => {
    const monthIncome = income.filter((document) => month(document) === key);
    const monthExpenses = expenses.filter((document) => month(document) === key);
    return [
      key,
      String(monthIncome.length),
      money(monthIncome.reduce((sum, document) => sum + (document.CompanyValue ?? 0), 0)),
      String(monthExpenses.length),
      money(monthExpenses.reduce((sum, document) => sum + (document.CompanyValue ?? 0), 0)),
    ];
  }),
]);
const firstExpenseMonth = [...new Set(expenses.map(month))].sort()[0];
console.log(
  firstExpenseMonth
    ? `\nExpense documents start ${firstExpenseMonth} — proposed cutover: SUMIT is authoritative from that month on, the Sheet's legacy totals stay for earlier ones.`
    : "\nNo expense documents in this window — the expense sync has nothing to read yet.",
);

// ── Customers, as seen from documents ────────────────────────────────────
const customers = tally(
  documents.filter((document) => document.CustomerID),
  (document) => String(document.CustomerID),
);
heading("Customers (reconstructed from documents)");
console.log(`${customers.size} distinct CustomerIDs across ${documents.length} documents.`);
table([
  ["customer", "docs", "value"],
  ...[...customers.values()]
    .sort((a, b) => b.length - a.length)
    .slice(0, 10)
    .map((group) => [
      group[0].CustomerName ?? `#${group[0].CustomerID}`,
      String(group.length),
      money(group.reduce((sum, document) => sum + (document.CompanyValue ?? 0), 0)),
    ]),
]);

// ── The CRM folder — the only place a real customer list (with phone) lives
heading("CRM folders");
try {
  const folders = await listFolders();
  console.log(folders.map((folder) => `${folder.ID} ${folder.Name ?? ""}`).join("\n") || "none");
  const customersFolder = folders.find((folder) => /customer|לקוח/i.test(folder.Name ?? ""));
  if (customersFolder?.Name) {
    const entities = await listEntities(customersFolder.Name);
    heading(`Customer entities — folder "${customersFolder.Name}"`);
    console.log(`${entities.length} entities.`);
    const keys = [...new Set(entities.flatMap((entity) => Object.keys(entity.Properties ?? {})))];
    console.log(`Property keys: ${keys.join(", ") || "none (LoadProperties returned nothing)"}`);
    const phoneKeys = keys.filter((key) => /phone|mobile|טלפון|נייד/i.test(key));
    for (const key of phoneKeys) {
      const filled = entities.filter((entity) => {
        const value = entity.Properties?.[key];
        return value !== null && value !== undefined && String(value).trim() !== "";
      }).length;
      console.log(`  ${key}: ${filled}/${entities.length} filled (${Math.round((filled / entities.length) * 100)}%)`);
    }
    if (phoneKeys.length === 0) console.log("  No phone-shaped property — phone matching starts from Jimgem's side.");
  } else {
    console.log("No customers-looking folder; the roster comes from documents only.");
  }
} catch (error) {
  console.log(`CRM read failed: ${(error as Error).message}`);
  console.log("Not fatal — it only means the roster comes from documents rather than customer records.");
}

// ── Against the orders already in Postgres ───────────────────────────────
if (!process.env.DATABASE_URL) {
  heading("Orders comparison");
  console.log("DATABASE_URL not set — skipped.");
} else {
  try {
    const { getOrders } = await import("../src/lib/orders.js");
    const { orderTotal } = await import("../src/lib/orderTypes.js");
    const orders = await getOrders();
    heading("Orders in Postgres vs SUMIT customers");
    const orderNames = new Map<string, string>();
    for (const order of orders) {
      if (order.customer.trim()) orderNames.set(normalizeName(order.customer), order.customer);
    }
    const sumitNames = new Map<string, string>();
    for (const group of customers.values()) {
      const name = group[0].CustomerName;
      if (name?.trim()) sumitNames.set(normalizeName(name), name);
    }
    const matched = [...orderNames.keys()].filter((key) => sumitNames.has(key));
    const unmatchedOrders = [...orderNames].filter(([key]) => !sumitNames.has(key));
    const unmatchedSumit = [...sumitNames].filter(([key]) => !orderNames.has(key));
    console.log(
      `${orders.length} orders under ${orderNames.size} distinct names; ` +
        `${sumitNames.size} named SUMIT customers; ${matched.length} match exactly.`,
    );
    const near = unmatchedOrders.filter(([key]) =>
      [...sumitNames.keys()].some((other) => other.includes(key) || key.includes(other)),
    );
    console.log(`${near.length} more match loosely (one name contains the other) — those want confirming by hand.`);
    console.log(`\nIn orders, not in SUMIT (${unmatchedOrders.length}):`);
    console.log(unmatchedOrders.slice(0, 20).map(([, name]) => `  ${name}`).join("\n") || "  none");
    console.log(`\nIn SUMIT, not in orders (${unmatchedSumit.length}):`);
    console.log(unmatchedSumit.slice(0, 20).map(([, name]) => `  ${name}`).join("\n") || "  none");

    heading("Booked income vs invoiced, by month");
    const bookedByMonth = tally(
      orders.filter((order) => order.date),
      (order) => order.date.slice(0, 7),
    );
    table([
      ["month", "orders", "booked ₪", "SUMIT income ₪"],
      ...[...new Set([...bookedByMonth.keys(), ...income.map(month)])].sort().map((key) => {
        const booked = bookedByMonth.get(key) ?? [];
        const invoiced = income.filter((document) => month(document) === key);
        return [
          key,
          String(booked.length),
          money(booked.reduce((sum, order) => sum + orderTotal(order), 0)),
          money(invoiced.reduce((sum, document) => sum + (document.CompanyValue ?? 0), 0)),
        ];
      }),
    ]);
    console.log("\n(Orders carry the import year, not the Sheet's real one — early months will look off.)");
  } catch (error) {
    heading("Orders comparison");
    console.log(`Skipped: ${(error as Error).message}`);
  }
}

console.log("\nDone. Nothing was written.");
