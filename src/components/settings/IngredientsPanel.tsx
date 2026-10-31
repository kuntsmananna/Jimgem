"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { INGREDIENT_UNITS, formatAmount, type Ingredient, type IngredientUnit } from "@/lib/foodCost";
import { ArchiveButton } from "./ArchiveButton";
import { MigrationNeeded, PANE_ACTION_CLASS, PaneHeader } from "@/components/Pane";
import { writeOrNotify } from "@/components/saveError";
import { currencyExact } from "@/lib/money";

interface Draft {
  name: string;
  unit: IngredientUnit;
  packSize: string;
  packPrice: string;
}

const BLANK: Draft = { name: "", unit: "ml", packSize: "", packPrice: "" };

const FIELD = "rounded-lg border border-line px-2 py-1 text-sm max-md:py-2";

/**
 * The things bought to make jelly — a bottle, a bag — each with what one
 * pack holds and what it costs.
 *
 * A pack rather than a price per millilitre, because that is what is on
 * the receipt: "700 ml, ₪70" is typed as it reads, and the arithmetic per
 * measure is `foodCost.ts`'s job. The shelf count is not edited here — the
 * kitchen counts on the prep sheet, where the count is compared against
 * what the coming orders need.
 */
export function IngredientsPanel({ items, available }: { items: Ingredient[]; available: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [busy, setBusy] = useState(false);

  function open(target: Ingredient | "new") {
    if (target === "new") {
      setDraft(BLANK);
      setEditing("new");
    } else {
      setDraft({
        name: target.name,
        unit: target.unit,
        packSize: String(target.packSize),
        packPrice: target.packPrice ? String(target.packPrice) : "",
      });
      setEditing(target.id);
    }
  }

  async function save() {
    if (!draft.name.trim() || !(Number(draft.packSize) > 0)) return;
    setBusy(true);
    const ok =
      editing === "new"
        ? await writeOrNotify("ingredient", "/api/settings/ingredients", "POST", draft)
        : await writeOrNotify("ingredient", `/api/settings/ingredients/${editing}`, "PATCH", draft);
    setBusy(false);
    if (!ok) return;
    setEditing(null);
    router.refresh();
  }

  const form = (
    <div className="mt-2 flex flex-col gap-2 rounded-xl bg-ink/[0.04] p-3">
      <input
        autoFocus
        placeholder="Name — e.g. Vodka"
        className={`${FIELD} bg-card`}
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-soft">One pack holds</span>
        <input
          type="number"
          min={0}
          inputMode="decimal"
          aria-label="Pack size"
          placeholder="700"
          className={`${FIELD} w-20 bg-card text-right tabular-nums`}
          value={draft.packSize}
          onChange={(e) => setDraft({ ...draft, packSize: e.target.value })}
        />
        <select
          aria-label="Measure"
          className={`${FIELD} bg-card`}
          value={draft.unit}
          onChange={(e) => setDraft({ ...draft, unit: e.target.value as IngredientUnit })}
        >
          {INGREDIENT_UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
        <span className="text-ink-soft">and costs</span>
        <input
          type="number"
          min={0}
          inputMode="decimal"
          data-money
          aria-label="Pack price"
          placeholder="₪"
          className={`${FIELD} w-20 bg-card text-right tabular-nums`}
          value={draft.packPrice}
          onChange={(e) => setDraft({ ...draft, packPrice: e.target.value })}
        />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={() => setEditing(null)} className="rounded-full px-3 py-1 text-xs font-semibold text-ink-soft max-md:py-2">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={busy}
          className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-cream disabled:opacity-50 max-md:px-4 max-md:py-2"
        >
          Save
        </button>
      </div>
    </div>
  );

  return (
    <section className="rounded-card border border-line bg-card p-6">
      <PaneHeader
        title="Ingredients"
        description="What is bought to make jelly, by the pack. Recipes and the prep sheet's shopping list read from here."
        action={
          available && (
            <button onClick={() => (editing === "new" ? setEditing(null) : open("new"))} className={PANE_ACTION_CLASS}>
              {editing === "new" ? "Cancel" : "+ Add"}
            </button>
          )
        }
      />
      {!available ? (
        <MigrationNeeded script="scripts/migrate-034-ingredients.sql" />
      ) : (
        <>
          {editing === "new" && form}
          {items.length === 0 && editing !== "new" && (
            <p className="mt-3 text-sm text-ink-soft">Nothing yet. Add what goes into a batch — the alcohol, the gelatin, the sugar.</p>
          )}
          <ul className="mt-3 flex flex-col gap-1">
            {items.map((item) =>
              editing === item.id ? (
                <li key={item.id}>{form}</li>
              ) : (
                <li key={item.id} className="group flex items-center gap-2 text-sm">
                  <button
                    onClick={() => open(item)}
                    className="hover-line taps-to-edit flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left max-md:py-2"
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold">{item.name}</span>
                    <span className="shrink-0 text-xs text-ink-soft">{formatAmount(item.packSize, item.unit)}</span>
                    <span className="w-16 shrink-0 text-right font-semibold tabular-nums">
                      {item.packPrice ? currencyExact(item.packPrice) : "—"}
                    </span>
                  </button>
                  <ArchiveButton resource="ingredients" id={item.id} name={item.name} noun="ingredient" />
                </li>
              ),
            )}
          </ul>
        </>
      )}
    </section>
  );
}
