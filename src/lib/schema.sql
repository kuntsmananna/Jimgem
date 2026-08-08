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

CREATE TABLE IF NOT EXISTS order_content_lines (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  package_type_id INTEGER NOT NULL REFERENCES package_types(id),
  flavor_id INTEGER REFERENCES flavors(id), -- NULL = "Mix"
  quantity INTEGER NOT NULL
);

-- Production status for Sheet-sourced orders only (Sheet rows have no id
-- of their own). order_key is "sheet:<row-number>". DB-native orders
-- carry production_status directly on the orders row above instead.
CREATE TABLE IF NOT EXISTS order_production_status (
  order_key TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'queue'
    CHECK (status IN ('queue', 'preparing', 'delivered')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
