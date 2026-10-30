-- 034 — ingredients, recipes and stock.
--
-- What a jelly costs to make, and what the shelf needs for the orders
-- coming up. Three tables, all new, so nothing already there changes:
--
--   ingredients          the things bought — a bottle of vodka, a bag of
--                        gelatin — each with its pack size and price, and
--                        how many packs are on the shelf right now
--   flavor_recipes       how many jelly units one batch of a flavour makes
--   flavor_recipe_items  what goes into that batch, in each ingredient's
--                        own measure
--
-- A batch rather than "per unit" because that is how a recipe is written
-- down in a kitchen: 250 ml of vodka makes 30 cubes, not 8.33 ml per cube.
--
-- Stock is counted by hand and never deducted automatically: the owner's
-- call, since a wrong recipe or a mis-sized order would move the count
-- without anyone seeing it. The prep sheet compares the count against what
-- the coming orders need.
--
-- Idempotent: re-running it is a no-op.

CREATE TABLE IF NOT EXISTS ingredients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  -- What a recipe measures it in. A fixed set so amounts can be added up.
  unit TEXT NOT NULL DEFAULT 'ml' CHECK (unit IN ('ml', 'g', 'pcs')),
  -- How much of that measure one pack holds: a 700 ml bottle is 700.
  pack_size NUMERIC(12, 3) NOT NULL DEFAULT 1 CHECK (pack_size > 0),
  -- What one pack costs, as paid.
  pack_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (pack_price >= 0),
  -- Packs on the shelf at the last count, fractions allowed (half a
  -- bottle). Null until somebody has counted.
  on_hand NUMERIC(12, 3) CHECK (on_hand >= 0),
  counted_at TIMESTAMPTZ(3),
  counted_by TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS flavor_recipes (
  flavor_id INTEGER PRIMARY KEY REFERENCES flavors(id) ON DELETE CASCADE,
  -- Jelly units one batch makes.
  batch_units INTEGER NOT NULL DEFAULT 1 CHECK (batch_units > 0),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS flavor_recipe_items (
  flavor_id INTEGER NOT NULL REFERENCES flavor_recipes(flavor_id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  -- How much of the ingredient's measure one batch takes.
  amount NUMERIC(12, 3) NOT NULL CHECK (amount > 0),
  PRIMARY KEY (flavor_id, ingredient_id)
);

CREATE INDEX IF NOT EXISTS flavor_recipe_items_ingredient_idx ON flavor_recipe_items (ingredient_id);

-- Watched like every other table that holds real data — "who changed the
-- vodka price" is answerable from Settings -> Data. See 029 for why this
-- is a DO block.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'watch_table') THEN
    PERFORM watch_table('ingredients', 'id');
    PERFORM watch_table('flavor_recipes', 'flavor_id');
    PERFORM watch_table('flavor_recipe_items', 'flavor_id', 'ingredient_id');
  END IF;
END
$$;
