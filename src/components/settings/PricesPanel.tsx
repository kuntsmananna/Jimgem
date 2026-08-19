"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PRICE_FIELDS, type PriceKey, type Prices } from "@/lib/orderTypes";

/**
 * Settings → Lists → Prices. The owner's standard rates, which fill an
 * order's money side as it is typed (see `repriceOrder`).
 *
 * No add or remove: the keys are fixed in code because each one is wired
 * to a field on the order, so this is five amounts rather than a list.
 * That is also why it edits in place with no "+ Add" button — the panel
 * is only ever the same five rows.
 */
export function PricesPanel({ prices }: { prices: Prices }) {
  const router = useRouter();
  // Only the row being typed into is held locally; everything else reads
  // from the server value, so a save landing elsewhere isn't overwritten.
  const [editing, setEditing] = useState<PriceKey | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(key: PriceKey) {
    const amount = Number(draft);
    setEditing(null);
    // An unparseable or negative entry is dropped rather than sent: the
    // route rejects it anyway, and reverting on screen says so faster.
    if (!Number.isFinite(amount) || amount < 0 || amount === prices[key]) return;
    setBusy(true);
    await fetch("/api/settings/prices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, amount }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <section className="rounded-card border border-line bg-card p-6">
      <div>
        <h2 className="font-display text-base font-bold text-ink">Prices</h2>
        <p className="mt-0.5 text-xs text-ink-soft">
          Standard rates. Every order starts from these and can still be changed on the order itself.
        </p>
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {PRICE_FIELDS.map((field) => (
          <li key={field.key} className="flex items-center gap-2 text-sm">
            {editing === field.key ? (
              <>
                <span className="flex-1 px-2 text-ink">{field.label}</span>
                <input
                  autoFocus
                  type="number"
                  min={0}
                  aria-label={`${field.label} price`}
                  className="w-24 rounded-lg border border-line px-2 py-1 text-right text-sm tabular-nums"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => save(field.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") save(field.key);
                    // Escape has to clear `editing` without saving, so it
                    // cannot just let the blur handler run.
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
              </>
            ) : (
              <button
                disabled={busy}
                className="hover-line flex flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left text-ink disabled:opacity-50"
                onClick={() => {
                  setEditing(field.key);
                  setDraft(String(prices[field.key]));
                }}
              >
                <span className="min-w-0 flex-1 truncate">{field.label}</span>
                <span className="shrink-0 text-xs text-ink-soft">{field.per}</span>
                {/* A rate of zero is left blank rather than shown as ₪0:
                    nothing has been set, and "₪0" claims it is free. */}
                <span className="w-16 shrink-0 text-right font-semibold tabular-nums">
                  {prices[field.key] > 0 ? `₪${prices[field.key].toLocaleString()}` : "—"}
                </span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
