-- 037 — each admin's own Google Calendar, kept in step with the orders.
--
-- Aviv wanted the orders in his Google Calendar, updated when an order
-- changes rather than once a day. Each admin connects their own calendar
-- from Settings → Team. The app makes a calendar of its own inside their
-- Google account ("Gems orders") and writes one all-day event per order
-- into it, so nothing it writes ever touches the rest of their calendar.
--
-- calendar_connections is one row per admin who has connected.
-- refresh_token is what lets the app write to that calendar later without
-- asking again. It is a credential, so it is stripped from any downloaded
-- backup (src/lib/backup.ts) and the table is deliberately NOT watched by
-- row_revisions, which keeps every value it ever saw. Null means the
-- connection needs to be made again.
--
-- calendar_events remembers, per admin and per order, a fingerprint of
-- the event last written. A sync writes only the orders whose fingerprint
-- has changed, so an untouched order costs nothing. No foreign key to
-- orders: an order that disappears must still be found here so its event
-- can be taken down.
--
-- Idempotent: re-running it is a no-op.

CREATE TABLE IF NOT EXISTS calendar_connections (
  staff_id INTEGER PRIMARY KEY REFERENCES staff(id) ON DELETE CASCADE,
  google_email TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  refresh_token TEXT,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar_events (
  staff_id INTEGER NOT NULL REFERENCES calendar_connections(staff_id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, order_id)
);
