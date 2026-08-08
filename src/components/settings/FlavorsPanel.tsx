"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Flavor } from "@/lib/settings";

function flavorGradient(f: Pick<Flavor, "colorGlow" | "colorBase" | "colorShadow">) {
  return `radial-gradient(circle at -15% -15%, ${f.colorGlow}, ${f.colorBase} 55%, ${f.colorShadow} 100%)`;
}

const emptyDraft = { name: "", colorGlow: "#D4FF3D", colorBase: "#A8C91E", colorShadow: "#5C6E0E", isAlcoholic: true };

export function FlavorsPanel({ flavors }: { flavors: Flavor[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function submitNew() {
    if (!draft.name.trim()) return;
    setBusyId(-1);
    await fetch("/api/settings/flavors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setDraft(emptyDraft);
    setAdding(false);
    setBusyId(null);
    router.refresh();
  }

  async function archive(id: number) {
    setBusyId(id);
    await fetch(`/api/settings/flavors/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archive: true }),
    });
    setBusyId(null);
    router.refresh();
  }

  return (
    <section className="rounded-card border border-line bg-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">Flavors</h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-cream"
        >
          {adding ? "Cancel" : "+ Add flavor"}
        </button>
      </div>

      {adding && (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-cream/50 p-4">
          <div>
            <label className="text-xs font-semibold text-ink-soft">Name</label>
            <input
              className="mt-1 block rounded-lg border border-line px-2 py-1 text-sm"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          {(["colorGlow", "colorBase", "colorShadow"] as const).map((field) => (
            <div key={field}>
              <label className="text-xs font-semibold text-ink-soft">
                {field.replace("color", "")}
              </label>
              <input
                type="color"
                className="mt-1 block h-8 w-10 rounded border border-line"
                value={draft[field]}
                onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
              />
            </div>
          ))}
          <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
            <input
              type="checkbox"
              checked={draft.isAlcoholic}
              onChange={(e) => setDraft({ ...draft, isAlcoholic: e.target.checked })}
            />
            Alcoholic
          </label>
          <button
            onClick={submitNew}
            disabled={busyId === -1}
            className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-cream disabled:opacity-50"
          >
            Save
          </button>
        </div>
      )}

      <div className="mt-4 grid grid-cols-4 gap-3">
        {flavors.map((f) => (
          <div key={f.id} className="rounded-xl border border-line p-3">
            <div
              className="h-16 w-full rounded-lg"
              style={{ background: flavorGradient(f) }}
            />
            <p className="mt-2 text-sm font-semibold text-ink">{f.name}</p>
            <p className="text-xs text-ink-soft">{f.isAlcoholic ? "Alcoholic" : "Non-alcoholic"}</p>
            <button
              onClick={() => archive(f.id)}
              disabled={busyId === f.id}
              className="mt-2 text-xs font-semibold text-ink-soft underline decoration-dotted hover:text-ink disabled:opacity-50"
            >
              Archive
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
