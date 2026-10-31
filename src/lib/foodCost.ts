/**
 * What a jelly costs to make, and what the shelf needs for the orders
 * coming up.
 *
 * Client-safe like orderTypes.ts: pure arithmetic over the ingredients
 * list and the flavour recipes, so the order form, the prep sheet and the
 * Settings pane all compute the same figures, and a test can check them
 * without a database.
 *
 * Two rules run through all of it:
 *
 * - **A figure nothing can price is left out and counted, never guessed.**
 *   A flavour with no recipe, or units with no flavour yet, are reported as
 *   "N units not costed" beside the total rather than priced at some
 *   average — a plausible number that is quietly wrong is the failure this
 *   app keeps refusing.
 * - **MIX borrows.** A flavour named MIX is an assortment of the others
 *   (see flavorStyle.ts). If it has no recipe of its own it is costed and
 *   shopped for as an even mix of every flavour that has one, which is
 *   what the tray preview draws it as.
 */

import { isMixFlavor } from "./flavorStyle";
import { lineAssignedUnits, linePackedUnits, type OrderPackageLine } from "./orderTypes";

/** What a recipe measures an ingredient in — the one list, also what the database's CHECK allows. */
export const INGREDIENT_UNITS = ["ml", "g", "pcs"] as const;
export type IngredientUnit = (typeof INGREDIENT_UNITS)[number];

export interface Ingredient {
  id: number;
  name: string;
  unit: IngredientUnit;
  /** How much of `unit` one pack holds. */
  packSize: number;
  /** What one pack costs. Zero for a staff viewer, who is not sent it. */
  packPrice: number;
  /** Packs on the shelf at the last count; null until counted. */
  onHand: number | null;
  countedAt: string | null;
  countedBy: string | null;
  archivedAt: string | null;
}

/** One flavour's recipe: what one batch of `batchUnits` jelly units takes. */
export interface FlavorRecipe {
  flavorId: number;
  batchUnits: number;
  items: { ingredientId: number; amount: number }[];
}

/** Per jelly unit, ingredient id → amount in that ingredient's measure. */
type PerUnit = Map<number, number>;

function perUnit(recipe: FlavorRecipe): PerUnit {
  const out: PerUnit = new Map();
  if (recipe.batchUnits <= 0) return out;
  for (const item of recipe.items) out.set(item.ingredientId, item.amount / recipe.batchUnits);
  return out;
}

/**
 * Each flavour's amounts per jelly unit, with MIX filled in from the
 * others where it has no recipe of its own. A flavour missing from the map
 * has nothing to go on.
 */
export function perUnitRecipes(
  recipes: FlavorRecipe[],
  flavors: { id: number; name: string }[],
): Map<number, PerUnit> {
  const out = new Map<number, PerUnit>();
  for (const recipe of recipes) {
    if (recipe.items.length > 0) out.set(recipe.flavorId, perUnit(recipe));
  }
  const mixIds = new Set(flavors.filter(isMixFlavor).map((f) => f.id));
  const others = [...out.entries()].filter(([id]) => !mixIds.has(id));
  for (const flavor of flavors) {
    if (!mixIds.has(flavor.id) || out.has(flavor.id) || others.length === 0) continue;
    const mix: PerUnit = new Map();
    for (const [, amounts] of others) {
      for (const [ingredientId, amount] of amounts) {
        mix.set(ingredientId, (mix.get(ingredientId) ?? 0) + amount / others.length);
      }
    }
    out.set(flavor.id, mix);
  }
  return out;
}

/** What one unit of each measure costs: a pack's price over its size. */
function pricePerMeasure(ingredients: Ingredient[]): Map<number, number> {
  return new Map(ingredients.map((i) => [i.id, i.packSize > 0 ? i.packPrice / i.packSize : 0]));
}

/**
 * What one jelly unit of each flavour costs to make, keyed by flavour id
 * as a string — the shape order lines carry it in. A flavour that has no
 * recipe, or whose recipe uses an ingredient no longer on the list, is not
 * in the map.
 */
export function flavorUnitCosts(
  recipes: FlavorRecipe[],
  ingredients: Ingredient[],
  flavors: { id: number; name: string }[],
): Record<string, number> {
  const prices = pricePerMeasure(ingredients);
  const out: Record<string, number> = {};
  for (const [flavorId, amounts] of perUnitRecipes(recipes, flavors)) {
    let cost = 0;
    let known = true;
    for (const [ingredientId, amount] of amounts) {
      const price = prices.get(ingredientId);
      if (price === undefined) known = false;
      else cost += amount * price;
    }
    if (known) out[String(flavorId)] = cost;
  }
  return out;
}

/**
 * What the jelly on an order costs to make.
 *
 * `uncosted` is every unit the figure leaves out: units on a flavour with
 * no cost, and units on a line that no flavour has been given yet. The
 * caller says so beside the figure.
 */
export function linesFoodCost(
  lines: OrderPackageLine[],
  unitsPerPackage: Map<number, number>,
  unitCosts: Record<string, number>,
): { cost: number; uncosted: number } {
  let cost = 0;
  let uncosted = 0;
  for (const line of lines) {
    for (const entry of line.flavors) {
      const unitCost = unitCosts[entry.flavorId];
      if (unitCost === undefined) uncosted += entry.units;
      else cost += unitCost * entry.units;
    }
    uncosted += Math.max(0, linePackedUnits(line, unitsPerPackage) - lineAssignedUnits(line));
  }
  return { cost: Math.round(cost * 100) / 100, uncosted };
}

export interface ShoppingRow {
  ingredient: Ingredient;
  /** In the ingredient's measure. */
  needed: number;
  /** Packs the orders need, fractions and all. */
  neededPacks: number;
  /** Packs to buy — whole ones, after what is on the shelf. Null until counted. */
  toBuy: number | null;
}

/**
 * What the coming orders need from the shelf, ingredient by ingredient,
 * against the last count.
 *
 * Packs to buy are whole packs — nobody buys 0.4 of a bottle — and null
 * where nobody has counted yet, because "buy everything" and "buy
 * nothing" would both be guesses. Units nothing can be traced to (no
 * flavour, no recipe) come back as `untraced` so the sheet can say the
 * list is short by that much.
 */
export function shoppingList(
  flavorUnits: { flavorId: string; units: number }[],
  unassigned: number,
  recipes: FlavorRecipe[],
  ingredients: Ingredient[],
  flavors: { id: number; name: string }[],
): { rows: ShoppingRow[]; untraced: number } {
  const perUnitByFlavor = perUnitRecipes(recipes, flavors);
  const needed = new Map<number, number>();
  let untraced = unassigned;
  for (const { flavorId, units } of flavorUnits) {
    const amounts = perUnitByFlavor.get(Number(flavorId));
    if (!amounts || amounts.size === 0) {
      untraced += units;
      continue;
    }
    for (const [ingredientId, amount] of amounts) {
      needed.set(ingredientId, (needed.get(ingredientId) ?? 0) + amount * units);
    }
  }

  const rows: ShoppingRow[] = [];
  for (const ingredient of ingredients) {
    const amount = needed.get(ingredient.id) ?? 0;
    if (amount <= 0) continue;
    const neededPacks = amount / ingredient.packSize;
    rows.push({
      ingredient,
      needed: amount,
      neededPacks,
      // A hair of tolerance so 2.0000001 packs is not "buy 3".
      toBuy: ingredient.onHand === null ? null : Math.max(0, Math.ceil(neededPacks - ingredient.onHand - 1e-6)),
    });
  }
  rows.sort((a, b) => (b.toBuy ?? -1) - (a.toBuy ?? -1) || a.ingredient.name.localeCompare(b.ingredient.name));
  return { rows, untraced };
}

/** "1.5 L", "750 ml", "2.4 kg", "12 pcs" — an amount as a kitchen writes it. */
export function formatAmount(amount: number, unit: IngredientUnit): string {
  const round = (n: number) => (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString("en-US");
  if (unit === "ml" && amount >= 1000) return `${round(amount / 1000)} L`;
  if (unit === "g" && amount >= 1000) return `${round(amount / 1000)} kg`;
  return `${round(amount)} ${unit}`;
}
