"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBasket } from "lucide-react";
import { formatAmount, type ShoppingRow } from "@/lib/foodCost";
import { whenText } from "@/components/LastEdited";
import { writeOrNotify } from "@/components/saveError";
import { count } from "@/lib/money";
import { PANE } from "./pane";

const packs = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US");

/**
 * What the coming orders need from the shelf, against the last count.
 *
 * The count is typed in here, by whoever is standing at the shelf — the
 * kitchen, usually, which is why this lives on a page a staff login has.
 * Nothing deducts from it on its own (the owner's call): it says what was
 * there when somebody last looked, and when that was.
 */
export function ShoppingList({ rows, untraced }: { rows: ShoppingRow[]; untraced: number }) {
  return (
    <section className={PANE}>
      <h2 className="flex items-center gap-2 font-display text-base font-bold">
        <ShoppingBasket size={16} aria-hidden className="text-ink-soft" />
        Shopping list
      </h2>
      <p className="mt-0.5 text-xs text-ink-soft">
        What these orders take, against what is on the shelf. Tap a count to update it.
      </p>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm font-semibold text-ink-soft">
          No recipes cover these orders yet — add them in Settings → Flavors.
        </p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-bold tracking-[0.08em] text-ink-soft uppercase">
              <th className="pb-1.5 font-bold">Ingredient</th>
              <th className="pb-1.5 text-right font-bold">Needed</th>
              <th className="pb-1.5 text-right font-bold">On shelf</th>
              <th className="pb-1.5 text-right font-bold">To buy</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.ingredient.id} className="border-t border-line align-top">
                <td className="py-2 pr-2 font-semibold">{row.ingredient.name}</td>
                <td className="py-2 text-right tabular-nums">
                  <span className="font-semibold">{formatAmount(row.needed, row.ingredient.unit)}</span>
                  <span className="block text-xs text-ink-soft">≈ {packs(row.neededPacks)} packs</span>
                </td>
                <td className="py-2 text-right">
                  <StockCount row={row} />
                </td>
                <td className="py-2 pl-2 text-right">
                  {row.toBuy === null ? (
                    <span className="text-xs font-semibold text-ink-soft">count first</span>
                  ) : row.toBuy === 0 ? (
                    <span className="font-semibold text-accent">Enough</span>
                  ) : (
                    <span className="rounded-full bg-tile-peach px-2 py-0.5 font-display font-extrabold tabular-nums">
                      {row.toBuy} pack{row.toBuy === 1 ? "" : "s"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {untraced > 0 && rows.length > 0 && (
        <p className="mt-2 text-xs font-semibold text-ink-soft">
          Not counted in this list: {count(untraced)} units with no flavour or no recipe yet.
        </p>
      )}
    </section>
  );
}

/** The shelf count, edited in place. Packs, fractions allowed — half a bottle is real. */
function StockCount({ row }: { row: ShoppingRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const { ingredient } = row;

  async function commit() {
    setEditing(false);
    const value = draft.trim() === "" ? null : Number(draft);
    if (value !== null && (!Number.isFinite(value) || value < 0)) return;
    if (value === ingredient.onHand) return;
    setBusy(true);
    const ok = await writeOrNotify("count", `/api/prep/stock/${ingredient.id}`, "PATCH", { onHand: value });
    setBusy(false);
    if (ok) router.refresh();
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={0}
        step="0.5"
        inputMode="decimal"
        aria-label={`Packs of ${ingredient.name} on the shelf`}
        className="w-20 rounded-lg border border-line px-1.5 py-0.5 text-right tabular-nums max-md:py-2"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }
  return (
    <button
      disabled={busy}
      onClick={() => {
        setDraft(ingredient.onHand === null ? "" : String(ingredient.onHand));
        setEditing(true);
      }}
      className="rounded-lg px-1.5 py-0.5 text-right hover:bg-black/5 disabled:opacity-50 max-md:py-1.5"
    >
      <span className="block font-semibold tabular-nums">
        {ingredient.onHand === null ? "—" : `${packs(ingredient.onHand)} packs`}
      </span>
      {ingredient.countedAt && (
        <span className="block text-[11px] text-ink-soft">
          {whenText(ingredient.countedAt)}
          {ingredient.countedBy ? ` · ${ingredient.countedBy}` : ""}
        </span>
      )}
    </button>
  );
}
