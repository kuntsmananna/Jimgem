-- Migration 021 — August's calls, from before the meter existed.
--
-- The call log (migration 020) only counts what it saw, and it was created
-- on 22 August. SUMIT's own log says the month had already spent 328 calls
-- by then -- the probe and two document syncs, which is what prompted the
-- meter in the first place. A meter reading 0 for a month that is already
-- over its 250 is worse than no meter at all, so those calls are entered
-- here as one row each, which is the shape this table stores.
--
-- Nothing clears them afterwards and nothing needs to: usage is counted
-- per calendar month, so they leave the meter by themselves on 1 September.
--
-- Idempotent -- re-running inserts nothing, because the guard looks for
-- the baseline's own endpoint name.

INSERT INTO sumit_api_calls (called_at, endpoint, ok, error)
SELECT
  timestamptz '2026-08-01 12:00:00+00',
  'before the meter (SUMIT''s own August log)',
  true,
  NULL
FROM generate_series(1, 328)
WHERE NOT EXISTS (
  SELECT 1 FROM sumit_api_calls
   WHERE endpoint = 'before the meter (SUMIT''s own August log)'
)

;
