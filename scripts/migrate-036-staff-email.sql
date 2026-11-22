-- 036 — an email on each login, so a person can sign in with the address
-- they already know instead of their short username.
--
-- Both founders typed their Gmail address at the sign-in box and were
-- refused, because the account is `anna` / `aviv` and the lookup matched
-- the username exactly — "Incorrect username or password" for a password
-- that was never wrong. This lets a login match on username OR email (see
-- src/lib/auth.ts), so either one gets them in.
--
-- Nullable, and back-fills nothing on purpose: an address is personal, is
-- not derivable from a username, and belongs to the person — so it is set
-- from Settings → Team, not written into a committed file.
--
-- The unique index is on lower(email) so two accounts cannot claim the
-- same address in different case, and partial so the many rows with no
-- email yet do not all collide on NULL.
--
-- Idempotent: re-running it is a no-op.

ALTER TABLE staff ADD COLUMN IF NOT EXISTS email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS staff_email_lower_idx
  ON staff (lower(email))
  WHERE email IS NOT NULL;
