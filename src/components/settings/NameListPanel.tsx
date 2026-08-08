"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NameListPanel({
  title,
  resource,
  items,
}: {
  title: string;
  resource: "payment-methods" | "expense-categories";
  items: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitNew() {
    if (!draft.trim()) return;
    setBusy(true);
    await fetch(`/api/settings/${resource}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: draft }),
    });
    setDraft("");
    setAdding(false);
    setBusy(false);
    router.refresh();
  }

  async function submitEdit(id: number) {
    if (!editDraft.trim()) return;
    setBusy(true);
    await fetch(`/api/settings/${resource}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editDraft }),
    });
    setEditing(null);
    setBusy(false);
    router.refresh();
  }

  return (
    <section className="rounded-card border border-line bg-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-bold text-ink">{title}</h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="rounded-full bg-black px-3 py-1 text-xs font-semibold text-cream"
        >
          {adding ? "Cancel" : "+ Add"}
        </button>
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-sm">
            {editing === item.id ? (
              <>
                <input
                  autoFocus
                  className="flex-1 rounded-lg border border-line px-2 py-1 text-sm"
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitEdit(item.id)}
                />
                <button
                  onClick={() => submitEdit(item.id)}
                  disabled={busy}
                  className="text-xs font-semibold text-accent"
                >
                  Save
                </button>
              </>
            ) : (
              <button
                className="flex-1 rounded-lg px-2 py-1 text-left text-ink hover:bg-black/5"
                onClick={() => {
                  setEditing(item.id);
                  setEditDraft(item.name);
                }}
              >
                {item.name}
              </button>
            )}
          </li>
        ))}
      </ul>

      {adding && (
        <div className="mt-3 flex gap-2">
          <input
            autoFocus
            className="flex-1 rounded-lg border border-line px-2 py-1 text-sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitNew()}
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
