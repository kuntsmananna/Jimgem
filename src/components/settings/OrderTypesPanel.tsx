"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderType } from "@/lib/settings";

const DEFAULT_COLOR = "#f6d9a8";

/**
 * Settings → Lists → Order types. The kind of event an order is for,
 * with the colour its chip gets everywhere it appears.
 *
 * Orders store the type's *name*, not its id (see schema.sql), so
 * renaming one here also renames it on every order that used it —
 * otherwise those orders would quietly lose their type.
 */
export function OrderTypesPanel({ items }: { items: OrderType[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", color: DEFAULT_COLOR });
  const [editing, setEditing] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", color: DEFAULT_COLOR });
  const [busy, setBusy] = useState(false);

  async function send(url: string, method: string, body: unknown) {
    setBusy(true);
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    router.refresh();
  }

  async function submitNew() {
    if (!draft.name.trim()) return;
    await send("/api/settings/order-types", "POST", draft);
    setDraft({ name: "", color: DEFAULT_COLOR });
    setAdding(false);
  }

  async function submitEdit(id: number) {
    if (!editDraft.name.trim()) return;
    await send(`/api/settings/order-types/${id}`, "PATCH", editDraft);
    setEditing(null);
  }

  return (
    <section className="rounded-card border border-line bg-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-base font-bold text-ink">Order types</h2>
          <p className="mt-0.5 text-xs text-ink-soft">Shown as a coloured chip on every order.</p>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="rounded-full bg-black px-3 py-1 text-xs font-semibold text-cream"
        >
          {adding ? "Cancel" : "+ Add"}
        </button>
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.id}>
            {editing === item.id ? (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={`${item.name} colour`}
                  className="h-8 w-10 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent"
                  value={editDraft.color}
                  onChange={(e) => setEditDraft({ ...editDraft, color: e.target.value })}
                />
                <input
                  autoFocus
                  className="flex-1 rounded-lg border border-line px-2 py-1 text-sm"
                  value={editDraft.name}
                  onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                />
                <button
                  onClick={() => submitEdit(item.id)}
                  disabled={busy}
                  className="text-xs font-semibold text-accent disabled:opacity-40"
                >
                  Save
                </button>
                <button
                  onClick={() => send(`/api/settings/order-types/${item.id}`, "PATCH", { archive: true })}
                  disabled={busy}
                  className="text-xs font-semibold text-ink-soft hover:text-amber-700"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                className="hover-line flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left"
                onClick={() => {
                  setEditing(item.id);
                  setEditDraft({ name: item.name, color: item.color });
                }}
              >
                <span
                  className="keeps-color rounded-full px-2.5 py-0.5 text-[11px] font-bold text-ink"
                  style={{ background: item.color }}
                >
                  {item.name}
                </span>
                <span className="flex-1" />
                <span className="text-[11px] text-ink-soft">{item.color}</span>
              </button>
            )}
          </li>
        ))}
      </ul>

      {adding && (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="color"
            aria-label="New type colour"
            className="h-8 w-10 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent"
            value={draft.color}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
          />
          <input
            autoFocus
            placeholder="Type name"
            className="flex-1 rounded-lg border border-line px-2 py-1 text-sm"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <button
            onClick={submitNew}
            disabled={busy}
            className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-cream disabled:opacity-50"
          >
            Save
          </button>
        </div>
      )}
    </section>
  );
}
