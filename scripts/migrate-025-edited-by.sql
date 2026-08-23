-- Migration 025 -- every row says when it last changed and who changed it.
--
-- updated_at existed already (migration 023) as the version a save is
-- checked against. This puts a name beside it and shows both, because with
-- two people working the same dashboard "who touched this last" is asked
-- far more often than anything the version guard answers.
--
-- The name is stored as TEXT rather than a staff id on purpose: it is a
-- record of who did it *at the time*, and it should keep saying that if
-- the person is later renamed or leaves. That is the opposite of the rule
-- expenses.staff_id follows, which points at a person the row is *about*.
--
-- Clients get updated_at here too -- they were left out of 023 because
-- nothing about them was being saved over.
--
-- Idempotent -- re-running it is a no-op.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_by TEXT

;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_by TEXT

;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()

;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS updated_by TEXT

;
