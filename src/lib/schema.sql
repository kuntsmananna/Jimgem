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
