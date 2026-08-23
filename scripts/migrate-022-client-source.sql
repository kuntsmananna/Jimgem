-- Migration 022 — where a client came from.
--
-- Instagram, a Google search, a friend, a wedding they ate at. Free text
-- rather than a list, like orders.customer and expenses.business: the real
-- answer is usually a sentence ("saw us at Noa's wedding"), and a list
-- would force it into whichever bucket is nearest.
--
-- Nothing is back-filled. Where a client came from is only ever known by
-- asking, and guessing it from an order would put words in their mouth.
--
-- Idempotent -- re-running it is a no-op.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS source TEXT

;
