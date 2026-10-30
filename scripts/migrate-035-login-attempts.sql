-- 035 — sign-in attempts, so the app can slow a password guesser itself.
--
-- Until now the only thing standing between a guesser and the two
-- well-known usernames was a Vercel Firewall rule, outside this repo:
-- remove it and nothing was left. This is the `login_attempts` table the
-- notes always said the replacement would be. Each sign-in writes a row;
-- the login refuses to check a password once too many have failed
-- recently (see src/lib/loginThrottle.ts for the limits).
--
-- Rows older than a day are cleared as new ones are written, so the
-- table never grows past a day of sign-ins. Not watched by row_revisions:
-- it is a log of its own, and restoring it would mean nothing.
--
-- Idempotent: re-running it is a no-op.

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGSERIAL PRIMARY KEY,
  -- Lowercased, as typed — including names that are not accounts, which is
  -- exactly what a guesser types.
  username TEXT NOT NULL,
  -- The caller's address as the edge reported it.
  ip TEXT NOT NULL,
  ok BOOLEAN NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_attempts_at_idx ON login_attempts (at);
