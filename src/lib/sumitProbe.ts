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
import {
  listDocuments,
  listFolders,
  listEntities,
  getEntity,
  documentTypeName,
  documentBucket,
  isExpenseDocument,
  EXPENSE_DOCUMENT_TYPES,
  type SumitDocument,
} from "./sumit";

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
      ["type", "means", "count", "value", "closed", "has pay URL"],
      ...[...groupBy(documents, (document) => documentTypeName(document.Type))]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([type, group]) => [
          type,
          documentBucket(group[0].Type),
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
  // Revenue is the billed bucket alone. Adding the receipts to it counts
  // the same money twice, and a delivery note or payment request is not
  // income at all.
  const income = documents.filter((document) => documentBucket(document.Type) === "revenue");
  const collections = documents.filter((document) => documentBucket(document.Type) === "collection");
  section("By month");
  out.push(
    table([
      ["month", "billed docs", "billed ₪", "collected ₪", "expense docs", "expense ₪"],
      ...[...new Set(documents.map(monthOf))].sort().map((month) => {
        const inMonth = <T extends SumitDocument>(list: T[]) => list.filter((document) => monthOf(document) === month);
        return [
          month,
          String(inMonth(income).length),
          money(sumValue(inMonth(income))),
          money(sumValue(inMonth(collections))),
          String(inMonth(expenses).length),
          money(sumValue(inMonth(expenses))),
        ];
      }),
    ]),
  );
  out.push(`\nBilled total ${money(sumValue(income))} — that is the revenue figure, credit notes included.`);
  // The unfiltered listing above may simply not return supplier-side
  // documents. Asking for them by type is what tells "you have none" apart
  // from "the endpoint didn't offer them".
  if (expenses.length === 0) {
    section("Expense documents, asked for by type");
    // One type at a time: the endpoint rejects the whole query over a
    // single unsupported type, so asking for them together tells you
    // nothing about the rest. And twice — a document carrying no date of
    // its own is excluded by a date range however wide it is.
    for (const type of EXPENSE_DOCUMENT_TYPES) {
      const counts: string[] = [];
      for (const [label, window] of [
        ["in window", { dateFrom, dateTo }],
        ["undated", {}],
      ] as const) {
        try {
          const found = await listDocuments({ ...window, types: [type], includeDrafts: true });
          counts.push(`${label} ${found.length}${found.length ? ` (${money(sumValue(found))})` : ""}`);
        } catch (error) {
          counts.push(`${label} — ${(error as Error).message.replace(/^SUMIT \S+ failed \(\d\): /, "")}`);
        }
      }
      out.push(`${type}: ${counts.join(", ")}`);
    }
  }

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
    // Folders are matched by exact name: a loose match picked
    // "כרטיסי אשראי ללקוחות" over "לקוחות" and read the wrong list.
    // "מסמכים" is every document as an entity — if expense documents
    // exist but documents/list won't return them, the count here exceeds
    // what the accounting endpoint reported.
    const wanted = [
      "לקוחות",
      "מסמכים",
      "הוצאות",
      "פריטי הוצאות",
      "קבצי הוצאות",
      "חשבוניות ספקים",
      "חשבוניות ותשלומים לספקים",
      "ספקים",
    ];
    for (const name of wanted) {
      const folder = folders.find((candidate) => candidate.Name?.trim() === name);
      if (!folder) {
        out.push(`${name}: no such folder`);
        continue;
      }
      try {
        // By ID rather than display name — listentities rejected a name.
        const entities = await listEntities(String(folder.ID));
        out.push(`\n${name} (${folder.ID}): ${entities.length} entities`);
        if (name === "מסמכים" && entities.length !== documents.length) {
          out.push(
            `  ⚠ documents/list returned ${documents.length} — a gap of ${entities.length - documents.length} means documents exist that the accounting endpoint will not list.`,
          );
        }
        // A spread rather than the first: the newest receipt may simply
        // not have been processed yet, which looks identical to a folder
        // that never carries amounts at all.
        const ids = entities.map((entity) => entity.ID).filter((id): id is number => Boolean(id));
        const sample = [...ids.slice(0, 3), ...ids.slice(-3)].filter((id, index, all) => all.indexOf(id) === index);
        const fieldCounts = new Map<string, number>();
        for (const id of sample) {
          const full = await getEntity(id, true);
          if (!full) continue;
          for (const key of Object.keys(full)) fieldCounts.set(key, (fieldCounts.get(key) ?? 0) + 1);
          // The file blob is the one field whose contents say nothing.
          const trimmed = Object.fromEntries(
            Object.entries(full).filter(([key]) => key !== "Accounting_File" && key !== "Properties"),
          );
          out.push(`  #${id}: ${JSON.stringify(trimmed).slice(0, 900)}`);
        }
        if (fieldCounts.size > 0) {
          out.push(`  fields seen: ${[...fieldCounts].map(([key, count]) => `${key}(${count})`).join(", ")}`);
        }
            } catch (error) {
        out.push(`\n${name} (${folder.ID}): read failed — ${(error as Error).message}`);
      }
    }
  } catch (error) {
    out.push(`Folder list failed: ${(error as Error).message}`);
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
    out.push(`${near.length} more match loosely (one name contains the other) — those want confirming by hand:`);
    for (const [key, name] of near.slice(0, 25)) {
      const candidates = [...sumitNames].filter(([other]) => other.includes(key) || key.includes(other));
      out.push(`  ${name}  →  ${candidates.map(([, other]) => other).join(" | ")}`);
    }
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
