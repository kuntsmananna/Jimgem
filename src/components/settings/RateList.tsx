"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export interface Rate {
  /** Unique within one list — which row is being edited. */
  id: string;
  label: string;
  /** How the rate is charged, e.g. "per unit". */
  hint: string;
  /** Null or zero shows as "—": nothing has been set, and ₪0 claims it is free. */
  amount: number | null;
  save: (amount: number) => Promise<void>;
  /** Optional trailing control, e.g. an archive button. Revealed on hover. */
  action?: ReactNode;
}

/**
 * A list of amounts, each edited in place.
 *
 * Shared by the jelly and add-on prices panes, which are the same control
 * over different rows — and the same one the preset prices use. One row
 * shape whether reading or editing, with only the last cell swapping and
 * the box exactly the width of the figure it replaces: anything wider
 * squeezed the name and the hint out of a column that is a third of the
 * tab.
 */
export function RateList({ rows }: { rows: Rate[] }) {
  const router = useRouter();
  // Only the row being typed into is held locally, so a save landing
  // elsewhere is never overwritten by stale state here.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function commit(row: Rate) {
    const amount = Number(draft);
    setEditing(null);
    // An unparseable or negative entry is dropped rather than sent —
    // reverting on screen says so faster than a rejected request.
    if (!Number.isFinite(amount) || amount < 0 || amount === (row.amount ?? 0)) return;
    setBusy(true);
    await row.save(amount);
    setBusy(false);
    router.refresh();
  }

  return (
    <ul className="mt-3 flex flex-col gap-1.5">
      {rows.map((row) => (
        <li key={row.id} className="group flex items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 truncate px-2 text-ink">{row.label}</span>
          <span className="shrink-0 text-xs text-ink-soft">{row.hint}</span>
          {editing === row.id ? (
            <input
              autoFocus
              type="number"
              min={0}
              aria-label={`${row.label} price`}
              /* See the button below: these two have to agree on a phone. */
              className="w-16 shrink-0 rounded-lg border border-line px-1.5 py-0.5 text-right text-sm tabular-nums max-md:w-20 max-md:py-2"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commit(row)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit(row);
                // Escape has to clear `editing` without saving, so it
                // cannot just let the blur handler run.
                if (e.key === "Escape") setEditing(null);
              }}
            />
          ) : (
            <button
              disabled={busy}
              aria-label={`Edit ${row.label} price`}
              /*
               * `max-md:text-base` is not decoration. An amount is shown by
               * this button and edited by the input above, and the unlayered
               * phone rule in globals.css sizes every `input` to 16px while
               * leaving a `button` at the inherited 14px — so without this
               * the number visibly grew the moment it was tapped, inside a
               * fixed-width box. The two widths and paddings match for the
               * same reason.
               */
              className="w-16 shrink-0 rounded-lg px-1.5 py-0.5 text-right font-semibold tabular-nums text-ink hover:bg-black/[0.05] disabled:opacity-50 max-md:w-20 max-md:py-2 max-md:text-base"
              onClick={() => {
                setEditing(row.id);
                setDraft(String(row.amount ?? 0));
              }}
            >
              {row.amount ? `₪${row.amount.toLocaleString()}` : "—"}
            </button>
          )}
          {row.action}
        </li>
      ))}
    </ul>
  );
}

/** Sends one amount to a settings resource. Shared by both price panes. */
export async function patchRate(url: string, body: Record<string, unknown>): Promise<void> {
  await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
