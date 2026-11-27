-- 041 — event sales: one row per customer served at an event (v0.101,
-- the register). items is what they took, as JSON lines of preset, count
-- and the event's price for one, copied in at the moment of sale.
-- subtotal, discount and total are what the register worked out
-- (priceBasket), deal names the deal that gave the discount. method is
-- card (paid through a payment link, payment_link_id) or cash. status is
-- open while a card payment is awaited, paid once it is, cancelled when
-- the seller abandons it.
--
-- payment_links gains a fifth kind, sale, for a link that belongs to an
-- event sale rather than an order (its order_id is null).
--
-- Watched by row_revisions. Idempotent: re-running it is a no-op.

CREATE TABLE IF NOT EXISTS event_sales (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  items JSONB NOT NULL DEFAULT '[]',
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  deal TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL CHECK (method IN ('card', 'cash')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'cancelled')),
  payment_link_id INTEGER REFERENCES payment_links(id),
  seller TEXT,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS event_sales_event_idx ON event_sales (event_id);
CREATE INDEX IF NOT EXISTS event_sales_link_idx ON event_sales (payment_link_id);

ALTER TABLE payment_links DROP CONSTRAINT IF EXISTS payment_links_kind_check;
ALTER TABLE payment_links ADD CONSTRAINT payment_links_kind_check
  CHECK (kind IN ('deposit', 'balance', 'full', 'custom', 'sale'));

SELECT watch_table('event_sales', 'id');
