-- Migration 015 — VAT on orders and expenses, as plain SQL.
--
-- The same thing scripts/migrate-015-vat.mjs does, for pasting into a
-- database console when there is no terminal to run Node from. Safe to
-- re-run: the columns use IF NOT EXISTS, the seed is ON CONFLICT DO
-- NOTHING, and the stamping only touches rows still at the default.
--
-- 2026-06-23 is when the business registered for VAT, so anything earlier
-- was genuinely exempt. The boundary is imperfect on purpose: orders.date
-- is the *event* date, not the invoice date, so an event in July quoted in
-- May lands on the wrong side of it. The mode is an editable field, and a
-- rule you can correct one order at a time beats a guess spread silently
-- across the whole table.

ALTER TABLE orders   ADD COLUMN IF NOT EXISTS vat_mode TEXT NOT NULL DEFAULT 'included';
ALTER TABLE orders   ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5, 2) NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vat_mode TEXT NOT NULL DEFAULT 'included';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5, 2) NOT NULL DEFAULT 0;

INSERT INTO prices (key, amount) VALUES ('vat_rate', 18) ON CONFLICT (key) DO NOTHING;

UPDATE orders
   SET vat_mode = CASE WHEN date < DATE '2026-06-23' THEN 'exempt' ELSE 'included' END,
       vat_rate = CASE WHEN date < DATE '2026-06-23' THEN 0 ELSE 18 END
 WHERE vat_rate = 0 AND vat_mode = 'included';

UPDATE expenses
   SET vat_mode = CASE WHEN date < DATE '2026-06-23' THEN 'exempt' ELSE 'included' END,
       vat_rate = CASE WHEN date < DATE '2026-06-23' THEN 0 ELSE 18 END
 WHERE vat_rate = 0 AND vat_mode = 'included';

-- What it did, for checking the split looks right:
SELECT 'orders' AS table, vat_mode, count(*), min(date), max(date) FROM orders   GROUP BY vat_mode
UNION ALL
SELECT 'expenses',        vat_mode, count(*), min(date), max(date) FROM expenses GROUP BY vat_mode;
