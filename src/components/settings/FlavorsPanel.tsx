"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Flavor } from "@/lib/settings";
import { Modal } from "@/components/Modal";

function flavorGradient(f: Pick<Flavor, "colorGlow" | "colorBase" | "colorShadow">) {
  return `radial-gradient(circle at -15% -15%, ${f.colorGlow}, ${f.colorBase} 55%, ${f.colorShadow} 100%)`;
}

interface Draft {
  name: string;
  colorGlow: string;
  colorBase: string;
  colorShadow: string;
  isAlcoholic: boolean;
}

const emptyDraft: Draft = { name: "", colorGlow: "#D4FF3D", colorBase: "#A8C91E", colorShadow: "#5C6E0E", isAlcoholic: true };

function draftFromFlavor(f: Flavor): Draft {
  return { name: f.name, colorGlow: f.colorGlow, colorBase: f.colorBase, colorShadow: f.colorShadow, isAlcoholic: f.isAlcoholic };
}

function FlavorFormModal({
  flavor,
  onClose,
  onSaved,
}: {
  flavor?: Flavor;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!flavor;
  const [draft, setDraft] = useState<Draft>(flavor ? draftFromFlavor(flavor) : emptyDraft);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!draft.name.trim()) return;
    setBusy(true);
    if (isEdit) {
      await fetch(`/api/settings/flavors/${flavor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
    } else {
      await fetch("/api/settings/flavors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
    }
    setBusy(false);
    onSaved();
  }

  return (
    <Modal title={isEdit ? "Edit flavor" : "Add flavor"} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div
          className="h-20 w-full rounded-lg"
          style={{ background: flavorGradient(draft) }}
        />
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
          Name
          <input
            className="input"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <div className="flex gap-4">
          {(["colorGlow", "colorBase", "colorShadow"] as const).map((field) => (
            <label key={field} className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
              {field.replace("color", "")}
              <input
                type="color"
                className="h-9 w-14 rounded border border-line"
                value={draft[field]}
                onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
          <input
            type="checkbox"
            checked={draft.isAlcoholic}
            onChange={(e) => setDraft({ ...draft, isAlcoholic: e.target.checked })}
          />
          Alcoholic
        </label>
        <div className="flex gap-2">
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-full bg-black px-4 py-1.5 text-xs font-semibold text-cream disabled:opacity-50"
          >
            {isEdit ? "Save changes" : "Save flavor"}
          </button>
          <button onClick={onClose} className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-ink">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function FlavorsPanel({ flavors }: { flavors: Flavor[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Flavor | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  function refresh() {
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
    refresh();
  }

  return (
    <section className="rounded-card border border-line bg-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">Flavors</h2>
        <button
          onClick={() => setAdding(true)}
          className="rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-cream"
        >
          + Add flavor
        </button>
      </div>

      {adding && (
        <FlavorFormModal
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}
      {editing && (
        <FlavorFormModal
          flavor={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      <div className="mt-4 grid grid-cols-4 gap-3">
        {flavors.map((f) => (
          <div key={f.id} className="rounded-xl border border-line p-3">
            <button className="block w-full" onClick={() => setEditing(f)}>
              <div className="h-16 w-full rounded-lg" style={{ background: flavorGradient(f) }} />
            </button>
            <p className="mt-2 text-sm font-semibold text-ink">{f.name}</p>
            <p className="text-xs text-ink-soft">{f.isAlcoholic ? "Alcoholic" : "Non-alcoholic"}</p>
            <div className="mt-2 flex gap-3 text-xs font-semibold">
              <button onClick={() => setEditing(f)} className="text-ink-soft hover:text-ink">
                Edit
              </button>
              <button
                onClick={() => archive(f.id)}
                disabled={busyId === f.id}
                className="text-ink-soft underline decoration-dotted hover:text-ink disabled:opacity-50"
              >
                Archive
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
