-- 040 — events: markets, fairs and pop-ups where boxes are sold on the
-- spot. This is the setup half (v1.0 event register, stage 1): what an
-- event is, what it sells at what price, and its deals. Sales come later.
--
-- events is one row per event. pay_mode says how customers pay there
-- (staff rings it up, they self-scan, or both) and qr_mode, for
-- self-service, whether each product carries its own QR or the stall has
-- one. count_stock turns on the brought/left counts. seller_ids are the
-- staff accounts selling, as an array because the list is short and only
-- ever read whole. status is draft until somebody says it is ready.
--
-- event_products is what is on the table, a content preset each (a preset
-- is already a package plus a fixed mix of flavours, which is exactly what
-- a ready-made box is), with the price for this event copied in, never
-- linked, and how many were brought when stock is counted.
--
-- event_deals are the price rules. kind is bundle (min_qty boxes for
-- price), percent (percent off from min_qty boxes), free (buy min_qty, get
-- one free) or price (a fixed price for one product). preset_ids limits a
-- deal to some products, empty meaning all of them.
--
-- All three are watched by row_revisions and events soft-delete like an
-- order. Idempotent: re-running it is a no-op.

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  starts_at TIME,
  ends_at TIME,
  location TEXT NOT NULL DEFAULT '',
  pay_mode TEXT NOT NULL DEFAULT 'both' CHECK (pay_mode IN ('staff', 'self', 'both')),
  qr_mode TEXT NOT NULL DEFAULT 'product' CHECK (qr_mode IN ('product', 'stall')),
  count_stock BOOLEAN NOT NULL DEFAULT true,
  seller_ids INTEGER[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_by TEXT,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS event_products (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  preset_id INTEGER NOT NULL REFERENCES content_presets(id),
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  brought INTEGER CHECK (brought IS NULL OR brought >= 0),
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, preset_id)
);

CREATE TABLE IF NOT EXISTS event_deals (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('bundle', 'percent', 'free', 'price')),
  min_qty INTEGER NOT NULL DEFAULT 1 CHECK (min_qty >= 1),
  price NUMERIC(10, 2) CHECK (price IS NULL OR price >= 0),
  percent NUMERIC(5, 2) CHECK (percent IS NULL OR (percent > 0 AND percent <= 100)),
  preset_ids INTEGER[] NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS event_deals_event_idx ON event_deals (event_id);

SELECT watch_table('events', 'id');
SELECT watch_table('event_products', 'event_id', 'preset_id');
SELECT watch_table('event_deals', 'id');
