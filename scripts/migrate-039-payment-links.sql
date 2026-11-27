-- 039 — payment links: a SUMIT payment page for an order, shared by
-- WhatsApp, email or a QR code.
--
-- One row per link. `token` is what the customer's URL carries
-- (/pay/<token>), random and unguessable; it is also sent to SUMIT as the
-- payment's ExternalIdentifier, which is how a payment found later in
-- SUMIT's own list is matched back to its link. `kind` says what was asked
-- for — the deposit, the balance, the whole order or an amount typed by
-- hand — and `amount` is the figure asked, gross. `sumit_url` is SUMIT's
-- hosted page, which expires (240 hours at most), so `sumit_expires_at`
-- says when a fresh one has to be made.
--
-- A link is `open` until it is paid or cancelled. The paid fields are
-- what SUMIT reported: its payment id, the document (the receipt) it
-- issued, and the amount actually charged. `order_id` is nullable so the
-- event register can use the same table later.
--
-- Watched by row_revisions like every other table holding real data.
-- Idempotent: re-running it is a no-op.

CREATE TABLE IF NOT EXISTS payment_links (
  id SERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  order_id INTEGER REFERENCES orders(id),
  kind TEXT NOT NULL CHECK (kind IN ('deposit', 'balance', 'full', 'custom')),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  sumit_url TEXT,
  sumit_expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'cancelled')),
  sumit_payment_id BIGINT,
  sumit_document_id BIGINT,
  paid_amount NUMERIC(10, 2),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  created_by TEXT,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS payment_links_order_idx ON payment_links (order_id);

SELECT watch_table('payment_links', 'id');
