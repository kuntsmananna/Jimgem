-- Migration 024 -- delete puts a row aside rather than destroying it.
--
-- Deleting was final: one mis-click on the wrong row and the order, its
-- package lines and its flavour split were gone, with nothing to recover
-- them from. deleted_at makes the delete reversible for as long as anyone
-- cares to reverse it -- the row keeps its id, so its lines, its client and
-- any SUMIT document still point at the same order when it comes back.
--
-- Every read filters `deleted_at IS NULL`, with one deliberate exception:
-- the Sheet importer looks at every order row including deleted ones, or
-- deleting an imported order would simply re-import it on the next run.
--
-- Nothing purges these. At this size the cost of keeping them is nothing,
-- and "deleted last March" is a question that gets asked.
--
-- Idempotent -- re-running it is a no-op.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(3)

;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(3)

;

-- Partial, because every read wants the live rows and only the recovery
-- path wants the others.
CREATE INDEX IF NOT EXISTS orders_live_idx ON orders (date DESC) WHERE deleted_at IS NULL

;

CREATE INDEX IF NOT EXISTS expenses_live_idx ON expenses (date DESC) WHERE deleted_at IS NULL

;
