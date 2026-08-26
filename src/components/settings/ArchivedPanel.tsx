"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import type { ArchivedItem } from "@/lib/settings";
import { PaneHeader } from "@/components/Pane";

/**
 * Settings → Data → Archived. Everything retired from every list, in one
 * place, with a way back.
 *
 * One panel rather than a "show archived" footer in each of the nine
 * panes: archiving is rare and restoring rarer, so nine disclosures would
 * be nine pieces of permanent clutter answering a question asked once. It
 * also means there is a single place to look when something has gone
 * missing from a dropdown, which is how the need actually presents itself.
 *
 * **Restore is the safe action and leads.** Delete is real — the row goes —
 * so it confirms first, and the database refuses it outright while any
 * order or expense still points at the row.
 */
export function ArchivedPanel({ items }: { items: ArchivedItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function send(method: "PATCH" | "DELETE", item: ArchivedItem) {
    setBusy(`${item.resource}:${item.id}`);
    setNote(null);
    const response = await fetch("/api/settings/archived", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: item.resource, id: item.id }),
    });
    setBusy(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setNote(body.error ?? "That didn't work.");
      return;
    }
    router.refresh();
  }

  return (
    <section className="rounded-card border border-line bg-card p-6">
      <PaneHeader title="Archived" description={<>
          Retired from their lists and hidden from every dropdown. Orders and expenses that already use
          one keep it.
        </>} />

      {note && (
        <p className="mt-3 rounded-lg bg-tile-peach px-3 py-2 text-xs font-semibold text-ink" role="status">
          {note}
        </p>
      )}

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">Nothing is archived.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-1.5">
          {items.map((item) => {
            const key = `${item.resource}:${item.id}`;
            return (
              <li key={key} className="group flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate px-2 text-ink">{item.label}</span>
                <span className="shrink-0 text-xs text-ink-soft">{item.listName}</span>
                <button
                  onClick={() => send("PATCH", item)}
                  disabled={busy === key}
                  title={`Restore ${item.label}`}
                  aria-label={`Restore ${item.label}`}
                  className="shrink-0 rounded-full p-1 text-ink-soft transition hover:bg-black/[0.06] hover:text-ink disabled:opacity-50"
                >
                  <RotateCcw size={13} />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete "${item.label}" for good? This cannot be undone.`)) {
                      send("DELETE", item);
                    }
                  }}
                  disabled={busy === key}
                  title={`Delete ${item.label}`}
                  aria-label={`Delete ${item.label}`}
                  className="reveals-on-hover shrink-0 rounded-full p-1 text-ink-soft opacity-0 transition group-hover:opacity-100 hover:bg-black/[0.06] hover:text-ink focus-visible:opacity-100 disabled:opacity-50"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
