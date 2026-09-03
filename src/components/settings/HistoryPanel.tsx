import { FilePlus2, PencilLine, Trash2 } from "lucide-react";
import { MigrationNeeded, PaneHeader } from "@/components/Pane";
import { InfoTip } from "@/components/InfoTip";
import { dayText, whenText } from "@/components/LastEdited";
import type { History } from "@/lib/history";

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
 *
 * No `"use client"`: it has no state and nothing to click, so it renders
 * on the server and the wording of a row — what a table is called, which
 * fields count as a change — stays in `lib/history.ts` beside the data
 * rather than shipping to the browser.
 */
export function HistoryPanel({ history }: { history: History }) {
  return (
    <section className="min-w-0 rounded-card border border-line bg-card p-6">
      <PaneHeader title="Recent changes" description="Every edit, insert and delete, as the database saw it." />

      <div className="flex items-start gap-2">
        <p className="text-xs text-ink-soft">
          {history.available
            ? `${history.total.toLocaleString()} changes on record${
                history.since ? ` since ${dayText(history.since)}` : ""
              }.`
            : "Not built yet."}
        </p>
        <InfoTip
          label="How to put a change back"
          text="Each save is one transaction id. Running SELECT undo_txid(<id>) in the database console reverses everything that save touched — an order and its package lines and flavours together — and records the reversal as its own change, so it can be undone in turn."
        />
      </div>

      {!history.available && <MigrationNeeded script="scripts/migrate-026-row-revisions.sql" />}

      {history.changes.length > 0 && (
        <ul className="mt-3 divide-y divide-line/60">
          {history.changes.map((change) => (
            <li key={change.id} className="hover-line flex items-baseline gap-2 rounded-lg px-2 py-1.5 text-xs max-md:flex-wrap">
              <span className="shrink-0 self-center text-ink-soft">{ACTION_ICON[change.action]}</span>
              <span className="font-semibold whitespace-nowrap">{change.subject}</span>
              <span className="min-w-0 flex-1 truncate text-ink-soft">{summarise(change)}</span>
              <span className="shrink-0 text-ink-soft">
                {change.changedBy ? `${change.changedBy} · ` : ""}
                {whenText(change.recordedAt)}
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

/** An update reads as the fields that moved; the other two say so plainly. */
function summarise(change: History["changes"][number]): string {
  if (change.action === "insert") return "added";
  if (change.action === "delete") return "removed";
  return change.changed.length > 0 ? change.changed.join(", ") : "saved, nothing moved";
}
