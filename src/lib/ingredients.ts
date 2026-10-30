import { getDb, isMissingTable, reportMissingTable } from "./db";
import { isoStamp } from "./stamp";
import type { FlavorRecipe, Ingredient, IngredientUnit } from "./foodCost";

/**
 * The ingredients list, the flavour recipes and the shelf count.
 *
 * Server-only (it reads the database); the arithmetic over what it returns
 * is `foodCost.ts`, which the browser can import. See migration 034.
 */

interface IngredientRow {
  id: number;
  name: string;
  unit: string;
  pack_size: string | number;
  pack_price: string | number;
  on_hand: string | number | null;
  counted_at: string | Date | null;
  counted_by: string | null;
  archived_at: string | Date | null;
}

function mapIngredient(row: IngredientRow): Ingredient {
  return {
    id: row.id,
    name: row.name,
    unit: (["ml", "g", "pcs"].includes(row.unit) ? row.unit : "pcs") as IngredientUnit,
    packSize: Number(row.pack_size),
    packPrice: Number(row.pack_price),
    onHand: row.on_hand === null ? null : Number(row.on_hand),
    countedAt: row.counted_at ? isoStamp(row.counted_at) : null,
    countedBy: row.counted_by,
    archivedAt: row.archived_at ? isoStamp(row.archived_at) : null,
  };
}

/**
 * Everything the cost and stock figures are made of, in one read.
 *
 * `available` is false until migration 034 has been run, and the lists
 * come back empty — the pages that use them say so rather than going down
 * (the same degrading the SUMIT meter and the backups pane do; see db.ts).
 */
export async function getIngredientData(
  includeArchived = false,
): Promise<{ available: boolean; ingredients: Ingredient[]; recipes: FlavorRecipe[] }> {
  const db = getDb();
  try {
    const [ingredients, recipes, items] = await Promise.all([
      db.query<IngredientRow>(
        includeArchived
          ? "SELECT * FROM ingredients ORDER BY name"
          : "SELECT * FROM ingredients WHERE archived_at IS NULL ORDER BY name",
      ),
      db.query<{ flavor_id: number; batch_units: number }>("SELECT flavor_id, batch_units FROM flavor_recipes"),
      db.query<{ flavor_id: number; ingredient_id: number; amount: string | number }>(
        "SELECT flavor_id, ingredient_id, amount FROM flavor_recipe_items ORDER BY ingredient_id",
      ),
    ]);
    const byFlavor = new Map<number, FlavorRecipe>(
      recipes.rows.map((r) => [r.flavor_id, { flavorId: r.flavor_id, batchUnits: r.batch_units, items: [] }]),
    );
    for (const item of items.rows) {
      byFlavor.get(item.flavor_id)?.items.push({ ingredientId: item.ingredient_id, amount: Number(item.amount) });
    }
    return { available: true, ingredients: ingredients.rows.map(mapIngredient), recipes: [...byFlavor.values()] };
  } catch (error) {
    for (const table of ["ingredients", "flavor_recipes", "flavor_recipe_items"]) {
      if (isMissingTable(error, table)) {
        await reportMissingTable(table, "migrate-034-ingredients.sql");
        return { available: false, ingredients: [], recipes: [] };
      }
    }
    throw error;
  }
}

export interface IngredientInput {
  name: string;
  unit: IngredientUnit;
  packSize: number;
  packPrice: number;
}

export async function createIngredient(input: IngredientInput, editor?: string): Promise<Ingredient> {
  const { rows } = await getDb().query<IngredientRow>(
    `INSERT INTO ingredients (name, unit, pack_size, pack_price, updated_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.name, input.unit, input.packSize, input.packPrice, editor ?? null],
  );
  return mapIngredient(rows[0]);
}

export async function updateIngredient(id: number, input: IngredientInput, editor?: string): Promise<Ingredient> {
  const { rows } = await getDb().query<IngredientRow>(
    `UPDATE ingredients
     SET name = $2, unit = $3, pack_size = $4, pack_price = $5, updated_at = now(), updated_by = $6
     WHERE id = $1 RETURNING *`,
    [id, input.name, input.unit, input.packSize, input.packPrice, editor ?? null],
  );
  return mapIngredient(rows[0]);
}

export async function archiveIngredient(id: number): Promise<void> {
  await getDb().query("UPDATE ingredients SET archived_at = now() WHERE id = $1", [id]);
}

/**
 * Records a shelf count. Its own write, separate from editing the row,
 * because the kitchen counts and an admin prices — and a count must never
 * carry a price along with it.
 */
export async function setIngredientStock(id: number, onHand: number | null, editor?: string): Promise<void> {
  await getDb().query(
    `UPDATE ingredients
     SET on_hand = $2, counted_at = now(), counted_by = $3, updated_at = now(), updated_by = $3
     WHERE id = $1 AND archived_at IS NULL`,
    [id, onHand, editor ?? null],
  );
}

/**
 * Replaces one flavour's recipe — its batch size and every item — in one
 * statement, since this driver has no transactions (see db.ts). An empty
 * list removes the recipe entirely.
 */
export async function saveRecipe(
  flavorId: number,
  batchUnits: number,
  items: { ingredientId: number; amount: number }[],
  editor?: string,
): Promise<void> {
  const db = getDb();
  if (items.length === 0) {
    await db.query("DELETE FROM flavor_recipes WHERE flavor_id = $1", [flavorId]);
    return;
  }
  await db.query(
    `WITH recipe AS (
       INSERT INTO flavor_recipes (flavor_id, batch_units, updated_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (flavor_id) DO UPDATE
         SET batch_units = EXCLUDED.batch_units, updated_at = now(), updated_by = EXCLUDED.updated_by
       RETURNING flavor_id
     ),
     -- Only the items no longer in the recipe: deleting a row and
     -- inserting its key again in one statement collides, since sibling
     -- CTEs see the same snapshot.
     dropped AS (
       DELETE FROM flavor_recipe_items WHERE flavor_id = $1 AND ingredient_id <> ALL($4::int[])
     )
     INSERT INTO flavor_recipe_items (flavor_id, ingredient_id, amount)
     SELECT recipe.flavor_id, item.ingredient_id, item.amount
     FROM recipe, unnest($4::int[], $5::numeric[]) AS item (ingredient_id, amount)
     ON CONFLICT (flavor_id, ingredient_id) DO UPDATE SET amount = EXCLUDED.amount`,
    [flavorId, batchUnits, editor ?? null, items.map((i) => i.ingredientId), items.map((i) => i.amount)],
  );
}
