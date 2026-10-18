-- 031 — how an order was paid.
--
-- An order names a payment method from the same owner-managed list an
-- expense already uses (Settings → Lists → Payment methods), so there is
-- one list to keep and not two that drift apart.
--
-- Informational only: nothing is computed from it. VAT stays what the
-- order's own vat_mode says, and the Dashboard and Biz Plan figures do not
-- change with the method.
--
-- Idempotent: re-running it is a no-op.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method_id INTEGER REFERENCES payment_methods(id);

-- The three methods orders are paid by, added only where no live row of
-- that name exists already (case and spacing ignored), so a list the owner
-- has already filled in is left exactly as it is.
INSERT INTO payment_methods (name)
SELECT wanted.name
FROM (VALUES ('Cash'), ('Credit card'), ('Bank transfer')) AS wanted(name)
WHERE NOT EXISTS (
  SELECT 1 FROM payment_methods pm
  WHERE pm.archived_at IS NULL
    AND lower(regexp_replace(pm.name, '\s+', ' ', 'g')) = lower(wanted.name)
);
