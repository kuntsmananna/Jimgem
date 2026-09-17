-- Migration 030 — what a login is allowed to see.
--
-- Two roles. An **admin** is what every account has been until now: the
-- whole dashboard, money included. A **staff** account is the kitchen and
-- the floor — the order list, an order's details, and the shared to-do
-- list, and no money anywhere.
--
-- The column is added with a default of 'admin' and then the default is
-- changed to 'staff'. That is deliberate and it is two different
-- questions:
--
--   * The back-fill has to say what the rows already there are, and they
--     are Anna and Aviv, who are admins. There is no way to tell them
--     apart from a future account at ALTER time, so the default at that
--     moment is what says it.
--   * From then on, a row inserted without a role must be the *least*
--     privileged thing it could be. A permission that defaults open is
--     one forgotten INSERT away from handing out the accounts.
--
-- Idempotent, like every migration here: re-running it is a no-op.

ALTER TABLE staff ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin';

-- From here on, unstated means least privilege.
ALTER TABLE staff ALTER COLUMN role SET DEFAULT 'staff';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'staff_role_check'
  ) THEN
    ALTER TABLE staff ADD CONSTRAINT staff_role_check
      CHECK (role IN ('admin', 'staff'));
  END IF;
END $$;
