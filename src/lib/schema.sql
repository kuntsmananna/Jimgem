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
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  archived_at TIMESTAMPTZ,
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
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The production stages an order moves through, owner-editable in
-- Settings. Orders store the stage's `key`, not its label, so renaming a
-- stage costs nothing and cannot retype the orders that use it.
-- Two flags carry the behaviour that used to be hardcoded against the
-- names 'offer' and 'delivered'
--   counts_as_income  a quote is not a sale, so it stays out of revenue
--   is_final          finished work is archive, so the table's default
--                     stage filter leaves it out
CREATE TABLE IF NOT EXISTS production_stages (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  counts_as_income BOOLEAN NOT NULL DEFAULT true,
  is_final BOOLEAN NOT NULL DEFAULT false,
  color TEXT NOT NULL DEFAULT '#e7dbcc',
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO production_stages (key, label, position, counts_as_income, is_final, color) VALUES
  ('offer', 'Offer', 0, false, false, '#efe7dd'),
  ('queue', 'Queue', 1, true, false, '#e4e9f2'),
  ('preparing', 'Preparing', 2, true, false, '#f6d9a8'),
  ('delivered', 'Delivered', 3, true, true, '#cfe0bc')
ON CONFLICT (key) DO NOTHING;

-- What an order can be displayed on or in, each with its own price. It
-- replaced a plain `mirrors` count on the order: there is more than one
-- kind of display and they do not cost the same, and an order can carry
-- several at once
CREATE TABLE IF NOT EXISTS display_options (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Where an order is delivered to, each with its own price. An order picks
-- at most one, and can still be given a hand-typed amount instead -- see
-- orders.delivery_option_id and delivery_cost
CREATE TABLE IF NOT EXISTS delivery_options (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_displays (
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  display_option_id INTEGER NOT NULL REFERENCES display_options(id),
  quantity INTEGER NOT NULL,
  PRIMARY KEY (order_id, display_option_id)
);

-- The owner's standard rates, one row per priced thing, used to fill an
-- order's money side as it is typed. A fixed set of keys rather than a
-- list the owner adds to, because each key is wired to a specific field
-- on the order and a new one would have nothing to price.
-- Every amount stays editable per order, so these are a starting point
-- and never a constraint.
CREATE TABLE IF NOT EXISTS prices (
  key TEXT PRIMARY KEY,
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO prices (key, amount) VALUES
  ('unit_100', 0), ('unit_200', 0), ('unit_500', 0), ('unit_max', 0),
  ('delivery', 0), ('waitress', 0), ('kosher', 0), ('vat_rate', 18)
ON CONFLICT (key) DO NOTHING;

-- The owner's client list, and the only place a SUMIT customer id can
-- live. SUMIT's /accounting/customers/ has create and update but no list
-- and no search, so a client that exists there can only be found again by
-- an id we stored when it was created
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  sumit_customer_id BIGINT UNIQUE,
  notes TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every SUMIT document we have seen, mirrored locally.
--
-- A mirror rather than a live read for two reasons. /accounting/documents/
-- list/ filters by type and date only -- there is no customer filter and no
-- "modified since" -- so a per-client view has to bucket a window locally;
-- and nothing on a render path may call SUMIT, the same rule the Google
-- Sheet follows. Sync is a date window plus an upsert on document_id
CREATE TABLE IF NOT EXISTS sumit_documents (
  document_id BIGINT PRIMARY KEY,
  document_number BIGINT,
  type TEXT NOT NULL,
  -- revenue / collection / quote / logistics / expense, from documentBucket
  bucket TEXT NOT NULL,
  date DATE,
  due_date DATE,
  sumit_customer_id BIGINT,
  customer_name TEXT,
  client_id INTEGER REFERENCES clients(id),
  -- value is gross: SUMIT's CompanyValue includes VAT (verified against the
  -- live account -- lines plus their stated VAT equal it). net_value and
  -- vat_value come from getdetails, per revenue document, because the
  -- listing carries neither and dividing by the standard rate would be
  -- wrong for anything not standard-rated
  value NUMERIC(12, 2),
  net_value NUMERIC(12, 2),
  vat_value NUMERIC(12, 2),
  is_closed BOOLEAN,
  is_draft BOOLEAN,
  download_url TEXT,
  payment_url TEXT,
  external_reference TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sumit_documents_client_idx ON sumit_documents (client_id);
CREATE INDEX IF NOT EXISTS sumit_documents_date_idx ON sumit_documents (date);

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
  production_status TEXT NOT NULL DEFAULT 'queue',
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
ALTER TABLE orders ADD COLUMN IF NOT EXISTS waitresses INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kosher BOOLEAN NOT NULL DEFAULT false;

-- What the extras are charged for. Each is nullable and separate from the
-- count beside it, because how many waitresses an event needs and what
-- they cost are two different decisions, often made at different times.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS waitress_cost NUMERIC(10, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mirrors_cost NUMERIC(10, 2);

-- `mirrors` and `mirrors_cost` are legacy and unread since displays became
-- a list -- migration 012 folded each order's mirror count into an
-- order_displays row. Kept, not dropped, so that fold-in stays auditable
ALTER TABLE orders ADD COLUMN IF NOT EXISTS display_cost NUMERIC(10, 2);

-- A discount off the whole order. `discount` is read as a percentage when
-- `discount_is_percent`, and as shekels otherwise -- zero means none
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_is_percent BOOLEAN NOT NULL DEFAULT false;

-- Which delivery option was chosen, if any. NULL with a non-null
-- delivery_cost is a hand-typed amount
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_option_id INTEGER REFERENCES delivery_options(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kosher_cost NUMERIC(10, 2);

-- How VAT applies to the order, and the rate it was booked at. The rate
-- is copied onto the row rather than read from prices at display time --
-- rates change, and an order agreed at one must not silently reprice
-- when the country changes the other. 'included' is the default because
-- that is what a registered business quotes
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_mode TEXT NOT NULL DEFAULT 'included';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5, 2) NOT NULL DEFAULT 0;

-- Which client the order belongs to. Nullable, and orders.customer stays
-- free text beside it: the same rule customer_type follows, so a Sheet
-- import can never be rejected by a name not on the list
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id);

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
-- `package_price` is a preset's price, copied at the moment the preset
-- was applied. NULL means price this line per unit from the quantity
-- tiers in `prices` instead
CREATE TABLE IF NOT EXISTS order_package_lines (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  package_type_id INTEGER NOT NULL REFERENCES package_types(id),
  quantity INTEGER NOT NULL,
  package_price NUMERIC(10, 2),
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
-- `price` is what one package of this preset costs. An order that uses
-- the preset copies the number onto its line, so repricing a preset never
-- changes an order already booked
CREATE TABLE IF NOT EXISTS content_presets (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  package_type_id INTEGER NOT NULL REFERENCES package_types(id),
  price NUMERIC(10, 2),
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

-- The same two columns an order carries, for the same reason: a receipt
-- from a registered supplier has VAT inside it, one from an unregistered
-- supplier has none, and the amount alone says nothing about which
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vat_mode TEXT NOT NULL DEFAULT 'included';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5, 2) NOT NULL DEFAULT 0;
