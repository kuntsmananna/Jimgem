"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import type { Flavor } from "@/lib/settings";
import { flavorUnitCosts, type FlavorRecipe, type Ingredient } from "@/lib/foodCost";
import { isMixFlavor } from "@/lib/flavorStyle";
import { cubeColors } from "@/components/JellyLoader";
import { PaneHeader } from "@/components/Pane";
import { writeOrNotify } from "@/components/saveError";
import { currencyPerUnit } from "@/lib/money";

const FIELD = "rounded-lg border border-line bg-card px-2 py-1 text-sm max-md:py-2";

/** The draft's lines that say something — the same rows the preview prices and the save sends. */
function draftItems(draft: DraftRecipe): { ingredientId: number; amount: number }[] {
  return draft.items
    .map((i) => ({ ingredientId: Number(i.ingredientId), amount: Number(i.amount) }))
    .filter((i) => i.ingredientId > 0 && i.amount > 0);
}

interface DraftRecipe {
  batchUnits: string;
  items: { ingredientId: string; amount: string }[];
}

/**
 * What goes into a batch of each flavour, and what one jelly comes to.
 *
 * Written the way a kitchen writes it down — "a batch of 30 takes 300 ml
 * of vodka" — and the cost of one jelly worked out from the ingredients'
 * pack prices. That per-unit cost is what the order form's money rail
 * multiplies out, and the amounts are what the prep sheet's shopping list
 * adds up.
 */
export function RecipesPanel({
  flavors,
  ingredients,
  recipes,
  available,
}: {
  flavors: Flavor[];
  ingredients: Ingredient[];
  recipes: FlavorRecipe[];
  available: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftRecipe>({ batchUnits: "", items: [] });
  const [busy, setBusy] = useState(false);

  const costs = useMemo(() => flavorUnitCosts(recipes, ingredients, flavors), [recipes, ingredients, flavors]);
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.flavorId, r])), [recipes]);
  const recipeOf = (id: number) => recipeById.get(id);
  const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);

  // What the draft would cost, live, so a recipe is priced as it is typed.
  const draftCost = useMemo(() => {
    if (open === null) return null;
    const batch = Number(draft.batchUnits);
    const items = draftItems(draft);
    if (!(batch > 0) || items.length === 0) return null;
    return flavorUnitCosts([{ flavorId: open, batchUnits: batch, items }], ingredients, flavors)[String(open)] ?? null;
  }, [open, draft, ingredients, flavors]);

  function edit(flavor: Flavor) {
    const recipe = recipeOf(flavor.id);
    setDraft({
      batchUnits: String(recipe?.batchUnits ?? 30),
      items: recipe?.items.map((i) => ({ ingredientId: String(i.ingredientId), amount: String(i.amount) })) ?? [
        { ingredientId: "", amount: "" },
      ],
    });
    setOpen(flavor.id);
  }

  async function save() {
    if (open === null) return;
    const items = draftItems(draft);
    setBusy(true);
    const ok = await writeOrNotify("recipe", `/api/settings/recipes/${open}`, "PUT", {
      batchUnits: Number(draft.batchUnits) || 1,
      items,
    });
    setBusy(false);
    if (!ok) return;
    setOpen(null);
    router.refresh();
  }

  const setItem = (at: number, patch: Partial<DraftRecipe["items"][number]>) =>
    setDraft({ ...draft, items: draft.items.map((item, i) => (i === at ? { ...item, ...patch } : item)) });

  return (
    <section className="rounded-card border border-line bg-card p-6">
      <PaneHeader title="Recipes" description="What one batch of each flavour takes, and what a jelly costs to make." />
      {!available ? null : ingredients.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">Add the ingredients first — a recipe is made of them.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {flavors.map((flavor) => {
            const recipe = recipeOf(flavor.id);
            const cost = costs[String(flavor.id)];
            const borrowed = isMixFlavor(flavor) && !recipe && cost !== undefined;
            return (
              <li key={flavor.id}>
                {open === flavor.id ? (
                  <div className="flex flex-col gap-2 rounded-xl bg-ink/[0.04] p-3">
                    <p className="flex items-center gap-2 font-semibold">
                      <span aria-hidden className="jelly-cube h-3.5 w-3.5" style={cubeColors(flavor)} />
                      {flavor.name}
                    </p>
                    <label className="flex items-center gap-2 text-sm text-ink-soft">
                      One batch makes
                      <input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        className={`${FIELD} w-20 text-right text-ink tabular-nums`}
                        value={draft.batchUnits}
                        onChange={(e) => setDraft({ ...draft, batchUnits: e.target.value })}
                      />
                      units, and takes:
                    </label>
                    {draft.items.map((item, at) => {
                      const unit = ingredientById.get(Number(item.ingredientId))?.unit;
                      return (
                        <div key={at} className="flex items-center gap-2">
                          <select
                            aria-label="Ingredient"
                            className={`${FIELD} min-w-0 flex-1`}
                            value={item.ingredientId}
                            onChange={(e) => setItem(at, { ingredientId: e.target.value })}
                          >
                            <option value="">Choose…</option>
                            {ingredients
                              .filter((i) => !i.archivedAt || i.id === Number(item.ingredientId))
                              .map((i) => (
                              <option
                                key={i.id}
                                value={i.id}
                                // One line per ingredient: a second would replace the first.
                                disabled={draft.items.some((other, o) => o !== at && other.ingredientId === String(i.id))}
                              >
                                {i.name}
                              </option>
                              ))}
                          </select>
                          <input
                            type="number"
                            min={0}
                            inputMode="decimal"
                            aria-label="Amount"
                            className={`${FIELD} w-20 text-right tabular-nums`}
                            value={item.amount}
                            onChange={(e) => setItem(at, { amount: e.target.value })}
                          />
                          <span className="w-7 text-xs text-ink-soft">{unit ?? ""}</span>
                          <button
                            onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== at) })}
                            aria-label="Remove this ingredient"
                            className="rounded-full p-1.5 text-ink-soft hover:bg-black/5 max-md:p-2.5"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        onClick={() => setDraft({ ...draft, items: [...draft.items, { ingredientId: "", amount: "" }] })}
                        className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-ink-soft hover:bg-black/5 max-md:py-2"
                      >
                        <Plus size={13} /> Ingredient
                      </button>
                      <span className="text-sm font-semibold" data-money>
                        {draftCost === null ? "" : `${currencyPerUnit(draftCost)} a jelly`}
                      </span>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setOpen(null)} className="rounded-full px-3 py-1 text-xs font-semibold text-ink-soft max-md:py-2">
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
                ) : (
                  <button
                    onClick={() => edit(flavor)}
                    className="hover-line taps-to-edit flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm max-md:py-2"
                  >
                    <span aria-hidden className="jelly-cube h-3 w-3 shrink-0" style={cubeColors(flavor)} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{flavor.name}</span>
                    <span className="shrink-0 text-xs text-ink-soft">
                      {recipe
                        ? `${recipe.items.length} ingredient${recipe.items.length === 1 ? "" : "s"} · batch of ${recipe.batchUnits}`
                        : borrowed
                          ? "an even mix of the others"
                          : "No recipe yet"}
                    </span>
                    <span className="w-14 shrink-0 text-right font-semibold tabular-nums">
                      {cost === undefined ? "—" : currencyPerUnit(cost)}
                    </span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
