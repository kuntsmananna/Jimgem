/**
 * Read-only reconnaissance against SUMIT, run before the integration is
 * designed. It answers the questions that design depends on: how much of
 * the SUMIT customer roster matches the orders already in Postgres, which
 * month expense documents start (that is the Google Sheet cutover),
 * whether customers carry phone numbers, and what document types the
 * business actually issues.
 *
 * It writes nothing — not to SUMIT, not to the database. The whole result
 * is the text report it returns, rendered in Settings → Data and printed
 * by scripts/sumit-probe.mts.
 *
 * A report, not a page: it is deliberately one text block rather than a
 * designed panel, because it is a throwaway diagnostic whose output is
 * meant to be copied out and read once, not lived with.
 */
import { listDocuments, listFolders, listEntities, documentTypeName, isExpenseDocument, type SumitDocument } from "./sumit";

const shekels = new Intl.NumberFormat("en-IL", { maximumFractionDigits: 0 });
const money = (amount: number) => `₪${shekels.format(Math.round(amount))}`;
const monthOf = (document: SumitDocument) => (document.Date ?? "").slice(0, 7) || "no date";
const sumValue = (documents: SumitDocument[]) =>
  documents.reduce((total, document) => total + (document.CompanyValue ?? 0), 0);

/**
 * The comparison key for "is this the same client". Deliberately loose —
 * quotes and geresh/gershayim, punctuation and doubled spaces are all
 * noise in a hand-typed Hebrew business name — but never fuzzy: a near
 * match is reported as a near match, for a human to confirm.
 */
function normalizeName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/["'`׳״]/g, "")
    .replace(/[\s,.\-–—_/]+/g, " ")
    .trim()
    .toLowerCase();
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const existing = groups.get(key(item));
    if (existing) existing.push(item);
    else groups.set(key(item), [item]);
  }
  return groups;
}

/** Fixed-width columns, so the report survives being pasted anywhere. */
function table(rows: string[][]): string {
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => [...row[column]].length)));
  return rows.map((row) => row.map((cell, column) => cell.padEnd(widths[column])).join("  ")).join("\n");
}

export interface SumitProbeOptions {
  /** Defaults to the whole history worth asking about. */
  dateFrom?: string;
}

export async function runSumitProbe(options: SumitProbeOptions = {}): Promise<string> {
  const dateFrom = options.dateFrom ?? "2015-01-01";
  // A year ahead: documents can be dated forward, and a missed one would
  // silently shrink every total below.
  const dateTo = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const out: string[] = [];
  const section = (title: string) => out.push(`\n${title}\n${"─".repeat(title.length)}`);

  out.push(`SUMIT probe — company ${process.env.SUMIT_COMPANY_ID}, ${dateFrom} → ${dateTo}`);
  out.push("Read-only: nothing was written to SUMIT or to the database.");

  const documents = await listDocuments({ dateFrom, dateTo, includeDrafts: true });
  section("Documents");
  if (documents.length === 0) {
    out.push("None returned. Either the window is wrong or the key has no access to accounting.");
    return out.join("\n");
  }
  const dates = documents.map((document) => document.Date ?? "").filter(Boolean).sort();
  out.push(`${documents.length} documents, ${dates[0]?.slice(0, 10)} → ${dates.at(-1)?.slice(0, 10)}`);
  out.push(`${documents.filter((document) => document.IsDraft).length} of them drafts.`);

  section("Type mix");
  out.push(
    table([
      ["type", "count", "value", "closed", "has pay URL"],
      ...[...groupBy(documents, (document) => documentTypeName(document.Type))]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([type, group]) => [
          type,
          String(group.length),
          money(sumValue(group)),
          String(group.filter((document) => document.IsClosed).length),
          String(group.filter((document) => document.DocumentPaymentURL).length),
        ]),
    ]),
  );

  // Income against expense, month by month — this is where the Sheet
  // cutover comes from: the month SUMIT's expenses start is the month its
  // numbers should replace the Sheet's legacy totals.
  const expenses = documents.filter((document) => isExpenseDocument(document.Type));
  const income = documents.filter((document) => !isExpenseDocument(document.Type));
  section("By month");
  out.push(
    table([
      ["month", "income docs", "income ₪", "expense docs", "expense ₪"],
      ...[...new Set(documents.map(monthOf))].sort().map((month) => {
        const monthIncome = income.filter((document) => monthOf(document) === month);
        const monthExpenses = expenses.filter((document) => monthOf(document) === month);
        return [
          month,
          String(monthIncome.length),
          money(sumValue(monthIncome)),
          String(monthExpenses.length),
          money(sumValue(monthExpenses)),
        ];
      }),
    ]),
  );
  const firstExpenseMonth = [...new Set(expenses.map(monthOf))].sort()[0];
  out.push(
    firstExpenseMonth
      ? `\nExpense documents start ${firstExpenseMonth} — proposed cutover: SUMIT is authoritative from that month on, the Sheet's legacy totals stay for earlier ones.`
      : "\nNo expense documents in this window — the expense sync has nothing to read yet.",
  );

  // /accounting/customers/ has no list or search, so the roster is
  // whatever the documents say it is.
  const customers = groupBy(
    documents.filter((document) => document.CustomerID),
    (document) => String(document.CustomerID),
  );
  section("Customers (reconstructed from documents)");
  out.push(`${customers.size} distinct CustomerIDs across ${documents.length} documents.`);
  out.push(
    table([
      ["customer", "docs", "value"],
      ...[...customers.values()]
        .sort((a, b) => b.length - a.length)
        .slice(0, 10)
        .map((group) => [
          group[0].CustomerName ?? `#${group[0].CustomerID}`,
          String(group.length),
          money(sumValue(group)),
        ]),
    ]),
  );

  // The CRM folder is the only place a real customer record — with phone
  // and email — can be read from.
  section("CRM folders");
  try {
    const folders = await listFolders();
    out.push(folders.map((folder) => `${folder.ID} ${folder.Name ?? ""}`).join("\n") || "none");
    const customersFolder = folders.find((folder) => /customer|לקוח/i.test(folder.Name ?? ""));
    if (customersFolder?.Name) {
      const entities = await listEntities(customersFolder.Name);
      section(`Customer entities — folder "${customersFolder.Name}"`);
      out.push(`${entities.length} entities.`);
      const keys = [...new Set(entities.flatMap((entity) => Object.keys(entity.Properties ?? {})))];
      out.push(`Property keys: ${keys.join(", ") || "none (LoadProperties returned nothing)"}`);
      const phoneKeys = keys.filter((key) => /phone|mobile|טלפון|נייד/i.test(key));
      for (const key of phoneKeys) {
        const filled = entities.filter((entity) => {
          const value = entity.Properties?.[key];
          return value !== null && value !== undefined && String(value).trim() !== "";
        }).length;
        const percent = entities.length ? Math.round((filled / entities.length) * 100) : 0;
        out.push(`  ${key}: ${filled}/${entities.length} filled (${percent}%)`);
      }
      if (phoneKeys.length === 0) {
        out.push("  No phone-shaped property — phone matching starts from Jimgem's side.");
      }
    } else {
      out.push("No customers-looking folder; the roster comes from documents only.");
    }
  } catch (error) {
    out.push(`CRM read failed: ${(error as Error).message}`);
    out.push("Not fatal — it only means the roster comes from documents rather than customer records.");
  }

  section("Orders in Postgres vs SUMIT customers");
  try {
    const [{ getOrders }, { orderTotal }] = await Promise.all([import("./orders"), import("./orderTypes")]);
    const orders = await getOrders();
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
    const near = unmatchedOrders.filter(([key]) =>
      [...sumitNames.keys()].some((other) => other.includes(key) || key.includes(other)),
    );
    out.push(
      `${orders.length} orders under ${orderNames.size} distinct names; ` +
        `${sumitNames.size} named SUMIT customers; ${matched.length} match exactly.`,
    );
    out.push(`${near.length} more match loosely (one name contains the other) — those want confirming by hand.`);
    out.push(`\nIn orders, not in SUMIT (${unmatchedOrders.length}):`);
    out.push(unmatchedOrders.slice(0, 20).map(([, name]) => `  ${name}`).join("\n") || "  none");
    out.push(`\nIn SUMIT, not in orders (${unmatchedSumit.length}):`);
    out.push(unmatchedSumit.slice(0, 20).map(([, name]) => `  ${name}`).join("\n") || "  none");

    section("Booked income vs invoiced, by month");
    const bookedByMonth = groupBy(
      orders.filter((order) => order.date),
      (order) => order.date.slice(0, 7),
    );
    out.push(
      table([
        ["month", "orders", "booked ₪", "SUMIT income ₪"],
        ...[...new Set([...bookedByMonth.keys(), ...income.map(monthOf)])].sort().map((month) => {
          const booked = bookedByMonth.get(month) ?? [];
          const invoiced = income.filter((document) => monthOf(document) === month);
          return [
            month,
            String(booked.length),
            money(booked.reduce((total, order) => total + orderTotal(order), 0)),
            money(sumValue(invoiced)),
          ];
        }),
      ]),
    );
    out.push("\n(Imported orders carry the import year, not the Sheet's real one — early months will look off.)");
  } catch (error) {
    out.push(`Skipped: ${(error as Error).message}`);
  }

  return out.join("\n");
}
