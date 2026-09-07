-- 028 — an expense that repeats every month.
--
-- Rent, insurance, the accountant: costs that arrive on the same day for
-- the same amount and were being typed in again every month. Marking one
-- "repeats monthly" makes the ledger carry it forward on its own, so next
-- month's predictable spend is a figure you can read rather than one you
-- have to remember.
--
-- **A generated row is an ordinary expense.** It is editable, deletable
-- and countable exactly like a typed one — the same rule an imported
-- order follows. What it is not is a template: correcting October's rent
-- corrects October, and November is copied from whatever the series says
-- last.
--
-- Two columns rather than a separate `recurring_expenses` table. A
-- recurring cost *is* an expense in every month it lands in, and a
-- template beside the ledger would be a second place for an amount to
-- live and disagree.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurring BOOLEAN NOT NULL DEFAULT false;

-- Which series this row belongs to: the id of the expense that started
-- it. A row entered by hand and marked recurring points at itself; every
-- row generated from it points at the same id. Null for a one-off, which
-- is almost every expense.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurring_series INTEGER REFERENCES expenses(id);

-- One row per series per month, and **deleted rows still hold their
-- slot**. That is the whole safety of the thing: deleting a generated
-- October rent has to mean "no rent in October", not "make it again
-- tonight", and a partial index over live rows only would have meant the
-- second. It is also what makes the roll-forward idempotent -- running it
-- twice, or from two places at once, inserts nothing the second time.
CREATE UNIQUE INDEX IF NOT EXISTS expenses_recurring_month_idx
  ON expenses (recurring_series, (date_trunc('month', date::timestamp)))
  WHERE recurring_series IS NOT NULL;

-- Reading "what repeats" means finding the newest row of each series, so
-- the ordering that answers it gets an index of its own.
CREATE INDEX IF NOT EXISTS expenses_recurring_series_idx
  ON expenses (recurring_series, date DESC, id DESC)
  WHERE recurring_series IS NOT NULL;
