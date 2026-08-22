"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PackageType } from "@/lib/settings";
import { packageTypeIconElement } from "@/lib/icons";
import { ArchiveButton } from "./ArchiveButton";
import { PANE_ACTION_CLASS, PaneHeader } from "./Pane";

export function PackageTypesPanel({ items }: { items: PackageType[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", unitsPerPackage: "" });
  const [editing, setEditing] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", unitsPerPackage: "" });
  const [busy, setBusy] = useState(false);

  async function submitNew() {
    if (!draft.name.trim() || !draft.unitsPerPackage) return;
    setBusy(true);
    await fetch("/api/settings/package-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setDraft({ name: "", unitsPerPackage: "" });
    setAdding(false);
    setBusy(false);
    router.refresh();
  }

  async function submitEdit(id: number) {
    setBusy(true);
    await fetch(`/api/settings/package-types/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editDraft),
    });
    setEditing(null);
    setBusy(false);
    router.refresh();
  }

  return (
    <section className="rounded-card border border-line bg-card p-6">
      <PaneHeader title="Package types" action={<button
          onClick={() => setAdding((v) => !v)}
          className={PANE_ACTION_CLASS}
        >
          {adding ? "Cancel" : "+ Add"}
        </button>} />

      <ul className="mt-3 flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.id} className="group flex items-center gap-2 text-sm">
            {editing === item.id ? (
              <>
                <input
                  autoFocus
                  className="flex-1 rounded-lg border border-line px-2 py-1 text-sm"
                  value={editDraft.name}
                  onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                />
                <input
                  type="number"
                  className="w-20 rounded-lg border border-line px-2 py-1 text-sm"
                  value={editDraft.unitsPerPackage}
                  onChange={(e) => setEditDraft({ ...editDraft, unitsPerPackage: e.target.value })}
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
                className="hover-line flex flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left text-ink"
                onClick={() => {
                  setEditing(item.id);
                  setEditDraft({ name: item.name, unitsPerPackage: String(item.unitsPerPackage) });
                }}
              >
                {/* The same mark the order form and the presets use, so a
                    package reads as the same thing wherever it appears. */}
                <span className="shrink-0 text-ink-soft">{packageTypeIconElement(item.unitsPerPackage, 14)}</span>
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="shrink-0 text-xs text-ink-soft">{item.unitsPerPackage} units</span>
              </button>
            )}
            {editing !== item.id && (
              <ArchiveButton resource="package-types" id={item.id} name={item.name} noun="package type" />
            )}
          </li>
        ))}
      </ul>

      {adding && (
        <div className="mt-3 flex gap-2">
          <input
            autoFocus
            placeholder="Name"
            className="flex-1 rounded-lg border border-line px-2 py-1 text-sm"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <input
            type="number"
            placeholder="Units"
            className="w-20 rounded-lg border border-line px-2 py-1 text-sm"
            value={draft.unitsPerPackage}
            onChange={(e) => setDraft({ ...draft, unitsPerPackage: e.target.value })}
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
