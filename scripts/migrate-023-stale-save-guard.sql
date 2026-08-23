-- Migration 023 -- an order and an expense know when they last changed.
--
-- Two people work this dashboard, and saving writes the whole row. Anna
-- opens order 38, Aviv edits it and saves, Anna saves the copy she opened
-- five minutes ago: his change is gone, silently, because her form still
-- held the old values. Nothing in the row said it had moved underneath her.
--
-- updated_at is that fact. A save sends the timestamp its form loaded with
-- and the UPDATE matches on it, so a stale write changes nothing and is
-- reported instead of applied.
--
-- Existing rows get now() from the default, which is honest enough: it
-- says "not known to have changed since this migration ran", and the first
-- real edit replaces it.
--
-- TIMESTAMPTZ(3), not the default microseconds. The value round-trips
-- through JSON and a JavaScript Date, which holds milliseconds -- so a
-- microsecond-precision timestamp would come back a fraction short of what
-- is stored and every save would report a conflict that isn't there.
--
-- Idempotent -- re-running it is a no-op.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()

;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()

;
