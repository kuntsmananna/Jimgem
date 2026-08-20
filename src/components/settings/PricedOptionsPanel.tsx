"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PricedOption } from "@/lib/orderTypes";
import { ArchiveButton } from "./ArchiveButton";
import { RateList, patchRate } from "./RateList";

/**
 * A list of named things with a price each — displays, and delivery
 * destinations.
 *
 * One component for both because they are recorded identically and read
 * the same way: a price list you occasionally add a row to. Each is why
 * its side of the order has no single rate in the add-on prices pane —
 * the price is whichever row the order points at.
 */
export function PricedOptionsPanel({
  title,
  description,
  resource,
  noun,
  items,
}: {
  title: string;
  description: string;
  /** The `/api/settings/<resource>` segment, e.g. "displays". */
  resource: string;
  /** What one row is called, for the archive confirmation. */
  noun: string;
  items: PricedOption[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", price: "" });
  const [busy, setBusy] = useState(false);

  async function submitNew() {
    if (!draft.name.trim()) return;
    setBusy(true);
    await fetch(`/api/settings/${resource}`, {
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
          <h2 className="font-display text-base font-bold text-ink">{title}</h2>
          <p className="mt-0.5 text-xs text-ink-soft">{description}</p>
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
          save: (price) => patchRate(`/api/settings/${resource}/${item.id}`, { name: item.name, price }),
          action: <ArchiveButton resource={resource} id={item.id} name={item.name} noun={noun} />,
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
