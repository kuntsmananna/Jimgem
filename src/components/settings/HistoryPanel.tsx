"use client";

import { FilePlus2, PencilLine, Trash2 } from "lucide-react";
import { PaneHeader } from "@/components/Pane";
import { InfoTip } from "@/components/InfoTip";
import type { History, RecentChange } from "@/lib/history";

/**
 * What has changed lately, row by row.
 *
 * The database records this itself — a trigger on every table that holds
 * real data — so nothing can write without appearing here, including a
 * batch action and a statement typed straight into the database console.
 * This pane is the window onto it: enough to answer "who changed that, and
 * when" without a query, and to show the transaction id that puts it back.
 *
 * Putting it back stays a typed command rather than a button. Undo lives
 * in the forms, where a mistake is a minute old; this is the layer for a
 * mistake found weeks later, where the right move is to look first.
 */
export function HistoryPanel({ history }: { history: History }) {
  return (
    <section className="min-w-0 rounded-card border border-line bg-card p-6">
      <PaneHeader title="Recent changes" description="Every edit, insert and delete, as the database saw it." />

      <div className="flex items-start gap-2">
        <p className="text-xs text-ink-soft">
          {history.available
            ? `${history.total.toLocaleString()} changes on record${
                history.since ? ` since ${SINCE.format(new Date(history.since))}` : ""
              }.`
            : "Not built yet."}
        </p>
        <InfoTip
          label="How to put a change back"
          text="Each save is one transaction id. Running SELECT undo_txid(<id>) in the database console reverses everything that save touched — an order and its package lines and flavours together — and records the reversal as its own change, so it can be undone in turn."
        />
      </div>

      {!history.available && (
        <p className="mt-3 rounded-xl bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900">
          Run <code className="font-mono">scripts/migrate-026-row-revisions.sql</code> against the database to
          start recording.
        </p>
      )}

      {history.changes.length > 0 && (
        <ul className="mt-3 divide-y divide-line/60">
          {history.changes.map((change) => (
            <li key={`${change.txid}-${change.recordedAt}-${change.table}-${JSON.stringify(change.rowKey)}`}
                className="hover-line flex items-baseline gap-2 rounded-lg px-2 py-1.5 text-xs">
              <span className="shrink-0 self-center text-ink-soft">{ACTION_ICON[change.action]}</span>
              <span className="font-semibold whitespace-nowrap">{label(change)}</span>
              <span className="min-w-0 flex-1 truncate text-ink-soft">{summarise(change)}</span>
              <span className="shrink-0 text-ink-soft">
                {change.changedBy ? `${change.changedBy} · ` : ""}
                {WHEN.format(new Date(change.recordedAt))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const ACTION_ICON = {
  insert: <FilePlus2 size={13} />,
  update: <PencilLine size={13} />,
  delete: <Trash2 size={13} />,
} as const;

/*
 * Table names as the owner would say them. Anything not named here shows
 * its table name with the underscores taken out, so a table added later
 * reads adequately rather than not at all.
 */
const NAMES: Record<string, string> = {
  orders: "Order",
  order_package_lines: "Package",
  order_package_line_flavors: "Flavour",
  order_displays: "Display",
  expenses: "Expense",
  clients: "Client",
  flavors: "Flavour",
  package_types: "Package type",
  order_types: "Order type",
  payment_methods: "Payment method",
  expense_categories: "Expense category",
  production_stages: "Status",
  display_options: "Display option",
  delivery_options: "Delivery option",
  content_presets: "Preset",
  content_preset_flavors: "Preset flavour",
  prices: "Price",
  staff: "Staff",
};

function label(change: RecentChange): string {
  const name = NAMES[change.table] ?? change.table.replace(/_/g, " ");
  const id = Object.values(change.rowKey).join("/");
  return `${name} ${id}`;
}

/** An update reads as the fields that moved; the other two say so plainly. */
function summarise(change: RecentChange): string {
  if (change.action === "insert") return "added";
  if (change.action === "delete") return "removed";
  const fields = Object.entries(change.changed ?? {})
    // The stamps are on every save and are never the answer to "what
    // changed" — they are the answer to "who and when", which is already
    // at the end of the row.
    .filter(([field]) => field !== "updated_at" && field !== "updated_by")
    .map(([field, [before, after]]) => `${field.replace(/_/g, " ")}: ${show(before)} → ${show(after)}`);
  return fields.length > 0 ? fields.join(", ") : "saved, nothing moved";
}

const show = (value: unknown) =>
  value === null || value === undefined || value === "" ? "—" : String(value);

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const SINCE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
