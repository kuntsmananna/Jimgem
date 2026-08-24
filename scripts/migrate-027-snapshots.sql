-- 027 — a nightly copy of the whole database, kept in the database.
--
-- The revision log (026) answers "put that change back". This answers the
-- other question: "the numbers have been wrong for a while and I don't
-- know since when" — a whole-database picture taken every night, which
-- can be read, compared and restored from long after the change that
-- broke something scrolled out of anyone's memory.
--
-- Deliberately stored *in* the database it copies. That sounds circular,
-- and for one failure — losing the Neon project itself — it is: Neon's
-- own point-in-time restore covers that, and each snapshot downloads as a
-- file for anyone who wants a copy somewhere else. What this covers is the
-- likelier disaster by far: the data is still there and some of it is
-- wrong.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS db_snapshots (
  id SERIAL PRIMARY KEY,
  taken_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  -- Which build took it. A snapshot is restored by code, and knowing
  -- which version wrote it is how you know whether a column has moved
  -- since.
  app_version TEXT NOT NULL,
  -- 'nightly' or 'manual' — one is the safety net, the other is someone
  -- about to do something they are nervous about.
  kind TEXT NOT NULL DEFAULT 'nightly',
  -- Table name to row count, so the list can be read at a glance and a
  -- night that suddenly holds half the orders is visible without opening
  -- anything.
  row_counts JSONB NOT NULL,
  bytes INTEGER NOT NULL,
  data JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS db_snapshots_taken_idx ON db_snapshots (taken_at DESC);
