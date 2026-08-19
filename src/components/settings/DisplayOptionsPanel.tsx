"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DisplayOption } from "@/lib/orderTypes";
import { ArchiveButton } from "./ArchiveButton";
import { RateList, patchRate } from "./RateList";

/**
 * Settings → Lists → Display. What an order can be shown on, each with
 * its own price.
 *
 * It replaced a plain mirror count on the order: there is more than one
 * kind of display, they do not cost the same, and an order can carry
 * several at once. That is also why Display has no single rate in the
 * add-on prices pane — its price is the sum of what the order actually
 * holds.
 */
export function DisplayOptionsPanel({ items }: { items: DisplayOption[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", price: "" });
  const [busy, setBusy] = useState(false);

  async function submitNew() {
    if (!draft.name.trim()) return;
    setBusy(true);
    await fetch("/api/settings/displays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setDraft({ name: "", price: "" });
    setAdding(false);
    setBusy(false);
    router.refresh();
  }

  return (
    <section className="rounded-card border border-line bg-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-base font-bold text-ink">Display</h2>
          <p className="mt-0.5 text-xs text-ink-soft">An order can carry several at once.</p>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="rounded-full bg-black px-3 py-1 text-xs font-semibold text-cream"
        >
          {adding ? "Cancel" : "+ Add"}
        </button>
      </div>

      {/* A price list first — which is how this pane is read — with the
          retire button riding in each row's action slot. */}
      <RateList
        rows={items.map((item) => ({
          id: String(item.id),
          label: item.name,
          hint: "each",
          amount: item.price,
          save: (price) => patchRate(`/api/settings/displays/${item.id}`, { name: item.name, price }),
          action: (
            <ArchiveButton resource="displays" id={item.id} name={item.name} noun="display option" />
          ),
        }))}
      />

      {adding && (
        <div className="mt-3 flex gap-2">
          <input
            autoFocus
            placeholder="Name"
            className="min-w-0 flex-1 rounded-lg border border-line px-2 py-1 text-sm"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <input
            type="number"
            min={0}
            placeholder="₪"
            className="w-16 rounded-lg border border-line px-2 py-1 text-right text-sm"
            value={draft.price}
            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
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
