-- 038 — when an order's event starts, and when its delivery is due.
--
-- An order had a date and nothing finer, so in a calendar it could only be
-- an all-day event. event_time places it at its hour; delivery_time, read
-- only while the order has a delivery, becomes a second calendar event of
-- its own (src/lib/calendarEvent.ts). Both are Israel local clock times
-- with no zone, the way the orders' dates already are.
--
-- Nullable and back-filled with nothing: nobody has ever said what time an
-- existing order starts, and a guessed hour in someone's calendar is worse
-- than an all-day one. Every order save writes both, so run this before
-- shipping the code that uses them.
--
-- Idempotent: re-running it is a no-op.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS event_time TIME;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_time TIME;
