-- 032 — "what's new" popups, remembered per login.
--
-- The app announces a release once to each person, on their next visit,
-- and this is where it records that they have seen it. Per login rather
-- than per browser, so the same person on a phone and a laptop is told
-- once.
--
-- A table of its own rather than a column on staff: staff is watched by
-- row_revisions, and every dismissal would otherwise appear in Settings →
-- Data's change log as an edit to somebody's account. This table is not
-- watched — a dismissed popup is not data anyone restores.
--
-- Until this runs the popup simply never shows, rather than showing on
-- every page load with nowhere to record that it was closed.
--
-- Idempotent: re-running it is a no-op.

CREATE TABLE IF NOT EXISTS announcement_views (
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  announcement_id TEXT NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, announcement_id)
);
