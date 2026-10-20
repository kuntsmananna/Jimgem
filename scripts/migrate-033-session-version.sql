-- 033 — ending a login's sessions.
--
-- A sign-in is a cookie that lasts two weeks, and until now nothing could
-- end one early: demoting somebody, or changing the password of someone
-- who has left, still left their open browser signed in until the cookie
-- ran out. session_version is copied into the cookie at sign-in and
-- compared on every request that reads data (currentRole in auth.ts).
-- Changing an account's role or password adds one to it, and every cookie
-- issued before that stops being accepted.
--
-- Starts at 0, which is also what a cookie issued before this column
-- existed reads as, so nobody is signed out by the migration itself.
--
-- Idempotent: re-running it is a no-op.

ALTER TABLE staff ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
