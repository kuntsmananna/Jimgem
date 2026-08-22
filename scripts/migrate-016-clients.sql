-- Migration 016 — the client list, backfilled from the orders already here.
--
-- One client per distinct customer name, matched the way clientName.ts
-- matches: case-folded, quotes and geresh/gershayim dropped, punctuation
-- and doubled spaces collapsed. That is deliberately exact-only. A *near*
-- match -- בילדוטס against בילדוטס בע"מ -- is left as two clients for a
-- person to merge on the Clients page, because only a person can tell a
-- longer legal name from a different customer with a similar one.
--
-- Safe to re-run: clients are only created for names that have none, and
-- only orders with no client_id are linked.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id);

-- The same normalisation as normalizeClientName, in SQL.
CREATE OR REPLACE FUNCTION jimgem_normalize_name(input TEXT) RETURNS TEXT AS $$
  SELECT lower(btrim(regexp_replace(regexp_replace(input, '["''`׳״]', '', 'g'), '[\s,.\-–—_/]+', ' ', 'g')))
$$ LANGUAGE SQL IMMUTABLE

;

INSERT INTO clients (name)
SELECT DISTINCT ON (jimgem_normalize_name(o.customer)) btrim(o.customer)
  FROM orders o
 WHERE btrim(o.customer) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM clients c WHERE jimgem_normalize_name(c.name) = jimgem_normalize_name(o.customer)
   )
 ORDER BY jimgem_normalize_name(o.customer), btrim(o.customer)

;

UPDATE orders o
   SET client_id = c.id
  FROM clients c
 WHERE o.client_id IS NULL
   AND jimgem_normalize_name(c.name) = jimgem_normalize_name(o.customer)

;

-- What it did, and what is left to merge by hand: pairs where one name
-- contains the other are the ones worth looking at.
SELECT count(*) AS clients_total,
       count(*) FILTER (WHERE sumit_customer_id IS NOT NULL) AS linked_to_sumit
  FROM clients

;

SELECT a.name AS client, b.name AS looks_like_the_same
  FROM clients a
  JOIN clients b
    ON a.id < b.id
   AND (jimgem_normalize_name(a.name) LIKE '%' || jimgem_normalize_name(b.name) || '%'
     OR jimgem_normalize_name(b.name) LIKE '%' || jimgem_normalize_name(a.name) || '%')
 ORDER BY a.name

;
