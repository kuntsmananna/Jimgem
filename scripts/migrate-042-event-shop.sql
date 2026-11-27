-- 042 — the self-service stall (v0.102, events stage 3).
--
-- events.public_token is the address of the event's shop, printed on its
-- signs as a QR code — random, so the shops of events nobody has been
-- told about cannot be walked by counting ids. Back-filled for events
-- that already exist, and given by default to every new one.
--
-- event_sales.handed_at is when a member of staff tapped "handed over"
-- on a customer's proof screen, so the same screen shown twice reads as
-- already collected.
--
-- Idempotent: re-running it is a no-op.

ALTER TABLE events ADD COLUMN IF NOT EXISTS public_token TEXT;
UPDATE events SET public_token = substr(md5(random()::text || id::text || clock_timestamp()::text), 1, 20)
 WHERE public_token IS NULL;
ALTER TABLE events ALTER COLUMN public_token SET DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 20);
ALTER TABLE events ALTER COLUMN public_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS events_public_token_idx ON events (public_token);

ALTER TABLE event_sales ADD COLUMN IF NOT EXISTS handed_at TIMESTAMPTZ;
