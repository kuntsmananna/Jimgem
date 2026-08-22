-- Migration 018 — legacy Sheet expenses become real rows.
--
-- They were synthesised at read time from legacy_expense_items: a month's
-- total per category, with no day, no payment method, no staff, and no way
-- to edit them. That made sense while the Google Sheet was still the
-- record. It isn't any more -- the dashboard is -- so every one of them
-- becomes an ordinary expenses row that can be corrected like any other.
--
-- Each keeps its sheet_key, which is both provenance and what makes this
-- re-runnable: a row already materialised is skipped rather than doubled.
--
-- Dated to the 1st of its month, because that is the finest grain the
-- Sheet actually has. The year comes from when it was imported, the same
-- stamp orders carry.

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS sheet_key TEXT

;

CREATE UNIQUE INDEX IF NOT EXISTS expenses_sheet_key_idx ON expenses (sheet_key) WHERE sheet_key IS NOT NULL

;

-- A category the Sheet used but the dashboard's list never had.
INSERT INTO expense_categories (name)
SELECT DISTINCT l.category_name
  FROM legacy_expense_items l
 WHERE NOT EXISTS (SELECT 1 FROM expense_categories c WHERE c.name = l.category_name)

;

INSERT INTO expenses (date, category_id, amount, note, vat_mode, vat_rate, sheet_key)
SELECT make_date(EXTRACT(year FROM l.imported_at)::int, l.month, 1),
       c.id,
       l.amount,
       coalesce(l.description, ''),
       CASE
         WHEN make_date(EXTRACT(year FROM l.imported_at)::int, l.month, 1) < DATE '2026-06-23'
         THEN 'exempt' ELSE 'included'
       END,
       CASE
         WHEN make_date(EXTRACT(year FROM l.imported_at)::int, l.month, 1) < DATE '2026-06-23'
         THEN 0 ELSE 18
       END,
       l.sheet_key
  FROM legacy_expense_items l
  JOIN expense_categories c ON c.name = l.category_name
 WHERE NOT EXISTS (SELECT 1 FROM expenses e WHERE e.sheet_key = l.sheet_key)

;

SELECT count(*) FILTER (WHERE sheet_key IS NOT NULL) AS from_the_sheet,
       count(*) FILTER (WHERE sheet_key IS NULL) AS entered_here,
       count(*) AS total
  FROM expenses

;
