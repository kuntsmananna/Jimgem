-- Migration 019 — an expense records the business it was paid to.
--
-- `note` carried whatever was known about a row: sometimes the supplier,
-- sometimes what was bought, usually a run of both. They are two different
-- questions -- who took the money and what it bought -- and only one of
-- them can be the subject of the line, so the supplier gets a column and
-- `note` becomes the description alone.
--
-- Nothing is back-filled out of `note`: a name is not reliably separable
-- from a description by punctuation, and half-parsing every row would
-- leave the owner correcting more lines than typing them.
--
-- Free text rather than a list, like orders.customer: a receipt names its
-- shop, and a one-off supplier must never be a reason a row cannot save.
--
-- Idempotent -- re-running it is a no-op.

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS business TEXT

;
