-- Jimgem V1 schema. Google Sheets stays read-only (see CLAUDE.md) — this
-- Postgres DB holds everything the Sheet can't: dashboard-created orders/
-- expenses, owner-editable value lists, and staff logins.

CREATE TABLE IF NOT EXISTS staff (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS flavors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  color_glow TEXT NOT NULL,
  color_base TEXT NOT NULL,
  color_shadow TEXT NOT NULL,
  is_alcoholic BOOLEAN NOT NULL DEFAULT true,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS package_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  units_per_package INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The kind of event an order is for. Was free text typed straight into
-- the Sheet's "סוג לקוח" column, which is why orders.customer_type is
-- still text: this table gives the owner a managed list with a colour
-- each, and orders match it by name rather than by id, so a Sheet import
-- can keep writing whatever the Sheet says without a foreign key
-- rejecting it. An unrecognised value still shows, just uncoloured.
CREATE TABLE IF NOT EXISTS order_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#e7dbcc',
  position INTEGER NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Icon key from the fixed set in lib/icons.ts, chosen in Settings. A key
-- that isn't in that set falls back to a neutral tag rather than breaking,
-- same rule the rest of the icon lookups follow.
ALTER TABLE order_types ADD COLUMN IF NOT EXISTS icon TEXT;

CREATE TABLE IF NOT EXISTS expense_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  customer TEXT NOT NULL,
  customer_type TEXT,
  location TEXT,
  guests INTEGER,
  delivery_cost NUMERIC(10, 2),
  mirrors INTEGER,
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  deposit NUMERIC(10, 2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'deposit', 'paid', 'comp', 'net40')),
  production_status TEXT NOT NULL DEFAULT 'queue'
    CHECK (production_status IN ('queue', 'preparing', 'delivered')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Import provenance for orders brought over from the Google Sheet (see
-- sheetImport.ts). sheet_row is the 1-based row the order came from, and
-- is what makes re-import idempotent: a row already present is skipped,
-- never overwritten, so dashboard edits always win. NULL for orders
-- created in the dashboard. details/needs_review carry the Sheet's
-- free-text פירוט column and the best-effort parser's confidence flag
-- (see flavorParser.ts) so nothing is lost at import time.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sheet_row INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS details TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS orders_sheet_row_idx ON orders (sheet_row) WHERE sheet_row IS NOT NULL;

-- An order's content is described along two axes, entered as two lists in
-- the order form: how it is packaged, and how the units split by flavour.
-- One row is one entry on one of those lists, never both:
--
--   packaging line  package_type_id set, flavor_id NULL, quantity = packages
--   flavour line    flavor_id set, package_type_id NULL, quantity = units
--
-- Total units come from the packaging lines alone, the flavour breakdown
-- from the flavour lines alone, so neither double-counts the other. The
-- form requires the two to agree before it will save.
CREATE TABLE IF NOT EXISTS order_content_lines (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  package_type_id INTEGER REFERENCES package_types(id),
  flavor_id INTEGER REFERENCES flavors(id),
  quantity INTEGER NOT NULL
);

ALTER TABLE order_content_lines ALTER COLUMN package_type_id DROP NOT NULL;

-- Exactly one of the two axes per row. Named so a re-run is idempotent.
ALTER TABLE order_content_lines DROP CONSTRAINT IF EXISTS order_content_lines_one_axis;
ALTER TABLE order_content_lines ADD CONSTRAINT order_content_lines_one_axis
  CHECK ((package_type_id IS NULL) <> (flavor_id IS NULL));

-- An order is a list of package lines, one per tray/box ordered, and each
-- line carries its own flavour split. That shape exists because a single
-- order routinely mixes them: two small trays of one flavour beside one
-- big tray of a four-way mix. The older order_content_lines below could
-- not express it — it held one flavour split for the whole order.
--
--   order_package_lines        one row = "2 x Small tray", quantity = packages
--   order_package_line_flavors one row = "40 units of Gin and Tonic" on that line
--
-- Units are stored, never percentages: a percentage is an input mode in
-- the form (see PackageLineEditor), and resolving it to units at entry
-- time keeps a saved order's meaning fixed when a package type's
-- units_per_package is later edited.
CREATE TABLE IF NOT EXISTS order_package_lines (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  package_type_id INTEGER NOT NULL REFERENCES package_types(id),
  quantity INTEGER NOT NULL,
  -- Display order within the order, so a re-read returns the lines in the
  -- sequence they were entered rather than by insertion id.
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_package_line_flavors (
  id SERIAL PRIMARY KEY,
  line_id INTEGER NOT NULL REFERENCES order_package_lines(id) ON DELETE CASCADE,
  flavor_id INTEGER NOT NULL REFERENCES flavors(id),
  units INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS order_package_lines_order_idx ON order_package_lines (order_id);
CREATE INDEX IF NOT EXISTS order_package_line_flavors_line_idx ON order_package_line_flavors (line_id);

-- Owner-editable presets ("Mix small" = a small tray of the house mix),
-- managed in Settings and offered as one-click chips in the order form.
--
-- A recipe is stored as proportions, not units, which is what lets one
-- preset serve any quantity. Applying a preset copies it into ordinary
-- editable order lines — it is a starting point, never a live link, so
-- editing a preset afterwards cannot rewrite orders already booked.
CREATE TABLE IF NOT EXISTS content_presets (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  package_type_id INTEGER NOT NULL REFERENCES package_types(id),
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_preset_flavors (
  id SERIAL PRIMARY KEY,
  preset_id INTEGER NOT NULL REFERENCES content_presets(id) ON DELETE CASCADE,
  flavor_id INTEGER NOT NULL REFERENCES flavors(id),
  -- Percent of the preset's package. The set is expected to total 100,
  -- enforced in the form rather than here, so a half-finished recipe can
  -- still be saved and come back to.
  share NUMERIC(6, 3) NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS content_preset_flavors_preset_idx ON content_preset_flavors (preset_id);

-- LEGACY, superseded by order_package_lines above — nothing reads this
-- table anymore. It held an order's content as two independent lists
-- (packaging on one axis, flavours on the other), which could not say
-- which flavours went in which tray. The 003 migration folded every row
-- into the new per-line shape. Kept rather than dropped so that fold-in
-- stays auditable, same as order_overrides below.
--
--   packaging line  package_type_id set, flavor_id NULL, quantity = packages
--   flavour line    flavor_id set, package_type_id NULL, quantity = units
CREATE TABLE IF NOT EXISTS order_content_lines (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  package_type_id INTEGER REFERENCES package_types(id),
  flavor_id INTEGER REFERENCES flavors(id),
  quantity INTEGER NOT NULL
);

ALTER TABLE order_content_lines ALTER COLUMN package_type_id DROP NOT NULL;

-- Exactly one of the two axes per row. Named so a re-run is idempotent.
ALTER TABLE order_content_lines DROP CONSTRAINT IF EXISTS order_content_lines_one_axis;
ALTER TABLE order_content_lines ADD CONSTRAINT order_content_lines_one_axis
  CHECK ((package_type_id IS NULL) <> (flavor_id IS NULL));

-- LEGACY, retained for history only — nothing reads this table anymore.
-- It dates from when pages read the Sheet live on every render and a
-- Sheet row had no DB row to edit, so dashboard edits were stored here
-- as field-level overrides keyed "sheet:<row-number>". Orders are now
-- imported into `orders` on demand instead (see sheetImport.ts), and the
-- first import folded every override recorded here into the imported row.
-- Kept rather than dropped so that fold-in remains auditable.
CREATE TABLE IF NOT EXISTS order_overrides (
  order_key TEXT PRIMARY KEY,
  customer TEXT,
  customer_type TEXT,
  location TEXT,
  guests INTEGER,
  delivery_cost NUMERIC(10, 2),
  mirrors INTEGER,
  total_amount NUMERIC(10, 2),
  deposit NUMERIC(10, 2),
  payment_status TEXT
    CHECK (payment_status IS NULL OR payment_status IN ('unpaid', 'deposit', 'paid', 'comp', 'net40')),
  production_status TEXT
    CHECK (production_status IS NULL OR production_status IN ('queue', 'preparing', 'delivered')),
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Expense amounts imported from the Sheet's expense-tracking tab. The
-- Sheet stores each category as a loose stack of amounts with no per-row
-- date or description (see CLAUDE.md), so one row here is one
-- (month, category, amount) cell — the finest grain the source actually
-- has. sheet_key is that cell's coordinates, and makes re-import
-- idempotent the same way orders.sheet_row does. Kept separate from
-- `expenses` because these are not itemized and can't be edited: the
-- Expenses page badges them as legacy totals rather than pretending they
-- are real line items.
CREATE TABLE IF NOT EXISTS legacy_expense_items (
  id SERIAL PRIMARY KEY,
  sheet_key TEXT NOT NULL UNIQUE,
  month INTEGER NOT NULL,
  category_name TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  -- Best-effort match from a Sheet cell comment. See financials.ts's
  -- SheetExpenseItem for why it is only ever an unverified guess.
  -- (Avoid semicolons in this file's comments — migrate.mjs splits
  -- statements on them, so one inside a comment truncates a statement.)
  description TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  category_id INTEGER NOT NULL REFERENCES expense_categories(id),
  amount NUMERIC(10, 2) NOT NULL,
  payment_method_id INTEGER REFERENCES payment_methods(id),
  staff_id INTEGER REFERENCES staff(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
