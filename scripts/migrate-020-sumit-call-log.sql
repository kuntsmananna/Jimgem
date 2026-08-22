-- Migration 020 — count what SUMIT costs.
--
-- The plan includes 250 API calls a month and charges 0.09 ILS beyond it.
-- August ran to 328 before anyone noticed, because nothing in the app
-- could see the meter. This table is that meter: every call is recorded
-- here, and sumitPost refuses to make one once the month's budget is
-- spent.
--
-- Failed calls count too -- SUMIT's own log shows a rejected query sitting
-- in the month's total beside the successful ones -- so ok is recorded
-- rather than filtered.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS sumit_api_calls (
  id BIGSERIAL PRIMARY KEY,
  called_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  endpoint TEXT NOT NULL,
  ok BOOLEAN NOT NULL,
  error TEXT
)

;

CREATE INDEX IF NOT EXISTS sumit_api_calls_month_idx ON sumit_api_calls (called_at)

;
