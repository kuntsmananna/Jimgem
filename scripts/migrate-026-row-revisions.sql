-- 026 — an append-only history of every row, and one command to put a
-- change back.
--
-- Soft delete already covers "someone deleted the wrong order". This
-- covers the other half: a row *overwritten* — by a person, by a batch
-- action, or by a bug we only notice weeks later — where the previous
-- values exist nowhere. Every insert, update and delete on the tables
-- that hold real business data now appends the whole row, before and
-- after, to `row_revisions`.
--
-- Written as database triggers rather than as code in the app on purpose:
-- there is no write path to forget — a batch action, a migration, an
-- UPDATE typed into the Neon console at midnight all record themselves.
--
-- Idempotent: re-running replaces the functions and re-attaches the
-- triggers without touching what is already logged.

-- This declaration and db_snapshots' in migration 027 are repeated word
-- for word in src/lib/schema.sql, which is where a database built from
-- scratch gets them; both are IF NOT EXISTS, so whichever file runs first
-- wins and the other is a no-op. Keep the two copies identical -- drifted,
-- which constraints a database ends up with would depend on the order
-- somebody happened to run them in.
CREATE TABLE IF NOT EXISTS row_revisions (
  id BIGSERIAL PRIMARY KEY,
  -- Every row written by one save shares a transaction id, which is what
  -- makes "undo that save" a thing you can ask for: an order and its
  -- package lines and their flavours are four tables and one action.
  txid BIGINT NOT NULL,
  recorded_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  table_name TEXT NOT NULL,
  -- The primary key as JSON, because these tables do not agree on one:
  -- most have `id`, order_displays is keyed by a pair.
  row_key JSONB NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  before JSONB,
  after JSONB,
  changed_by TEXT
);

CREATE INDEX IF NOT EXISTS row_revisions_recorded_idx ON row_revisions (recorded_at DESC);
CREATE INDEX IF NOT EXISTS row_revisions_txid_idx ON row_revisions (txid);
CREATE INDEX IF NOT EXISTS row_revisions_row_idx ON row_revisions (table_name, row_key);

CREATE OR REPLACE FUNCTION record_revision() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  old_row JSONB := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  new_row JSONB := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  present JSONB := COALESCE(new_row, old_row);
  identity JSONB;
BEGIN
  -- An UPDATE that changed nothing is not history. Saves rewrite whole
  -- rows, so this is the common case and logging it would bury the ones
  -- that matter.
  IF TG_OP = 'UPDATE' AND old_row = new_row THEN
    RETURN NULL;
  END IF;

  -- A login hash is not history either, and this log keeps everything
  -- forever and shows it on a Settings pane. Dropping the column keeps
  -- the record of a name or username changing and stores no credential:
  -- an old bcrypt hash is exactly as crackable as the current one.
  IF TG_TABLE_NAME = 'staff' THEN
    old_row := old_row - 'password_hash';
    new_row := new_row - 'password_hash';
  END IF;

  -- The key columns this table was watched with, read off the row. One
  -- aggregate rather than a loop: this runs on every write in the
  -- database, and there is nothing here a loop says better.
  SELECT jsonb_object_agg(k, present -> k) INTO identity FROM unnest(TG_ARGV) AS k;

  INSERT INTO row_revisions (txid, table_name, row_key, action, before, after, changed_by)
  VALUES (
    txid_current(),
    TG_TABLE_NAME,
    identity,
    lower(TG_OP),
    old_row,
    new_row,
    -- Whoever the app stamped on the row, where the table records it.
    COALESCE(new_row ->> 'updated_by', old_row ->> 'updated_by')
  );
  RETURN NULL;
END;
$fn$;

-- Attach it. `watch_table` takes the key columns, so one function serves
-- tables that disagree about what identifies a row.
CREATE OR REPLACE FUNCTION watch_table(_table TEXT, VARIADIC _keys TEXT[]) RETURNS void
LANGUAGE plpgsql AS $fn$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS record_revision ON %I', _table);
  EXECUTE format(
    'CREATE TRIGGER record_revision AFTER INSERT OR UPDATE OR DELETE ON %I
       FOR EACH ROW EXECUTE FUNCTION record_revision(%s)',
    _table,
    (SELECT string_agg(quote_literal(k), ', ') FROM unnest(_keys) AS k)
  );
END;
$fn$;

SELECT watch_table('orders', 'id');
SELECT watch_table('order_package_lines', 'id');
SELECT watch_table('order_package_line_flavors', 'id');
SELECT watch_table('order_displays', 'order_id', 'display_option_id');
SELECT watch_table('expenses', 'id');
SELECT watch_table('clients', 'id');
SELECT watch_table('flavors', 'id');
SELECT watch_table('package_types', 'id');
SELECT watch_table('order_types', 'id');
SELECT watch_table('payment_methods', 'id');
SELECT watch_table('expense_categories', 'id');
SELECT watch_table('production_stages', 'id');
SELECT watch_table('display_options', 'id');
SELECT watch_table('delivery_options', 'id');
SELECT watch_table('content_presets', 'id');
SELECT watch_table('content_preset_flavors', 'id');
SELECT watch_table('prices', 'key');
SELECT watch_table('staff', 'id');
-- Deliberately not watched: sumit_documents and sumit_api_calls, which a
-- nightly sync rewrites in bulk and which are a mirror of someone else's
-- record anyway, and the legacy tables nothing reads.

-- Anything the log recorded before the rule above existed. A hash that
-- was already written stays crackable, so a re-run scrubs it; the log
-- keeps the rest of what those rows said. Idempotent -- rows without the
-- key are left alone by `-`.
UPDATE row_revisions
   SET before = before - 'password_hash',
       after = after - 'password_hash'
 WHERE table_name = 'staff'
   AND (before ? 'password_hash' OR after ? 'password_hash');

-- What happened lately, in the form you would want to read it.
--
-- Dropped and rebuilt rather than CREATE OR REPLACE: replacing a view can
-- only add columns at the end, so a re-run that changes the shape of this
-- one fails otherwise. It holds no data of its own, so dropping it costs
-- nothing
DROP VIEW IF EXISTS recent_changes;
CREATE VIEW recent_changes AS
SELECT
  -- The log's own key, so a reader has something single-column to
  -- identify a line by rather than assembling one out of four fields
  id,
  recorded_at,
  txid,
  table_name,
  row_key,
  action,
  changed_by,
  -- Only the fields that actually moved, so an update reads as the edit
  -- it was rather than as forty unchanged columns.
  CASE WHEN action = 'update' THEN (
    SELECT jsonb_object_agg(key, jsonb_build_array(before -> key, after -> key))
    FROM jsonb_object_keys(after) AS key
    WHERE before -> key IS DISTINCT FROM after -> key
  ) END AS changed
FROM row_revisions
ORDER BY id DESC;

-- Put one save back.
--
-- Reverses every row the transaction touched, newest first: an update
-- goes back to its `before`, an insert is deleted, a delete is
-- re-inserted with its original id. The undo is itself recorded, so
-- undoing the undo is the same command with the new transaction id.
--
-- An update is reversed field by field rather than as a delete-and-insert,
-- because deleting an order would cascade and take its package lines with
-- it — the thing this exists to protect.
--
-- The order of the reversal is not free. A cascading delete logs the
-- parent first and its children after, so rows come back parents-first —
-- forward through the log — or a flavour is re-inserted before the
-- package line it hangs off and the foreign key refuses it. Everything
-- else runs backwards through the log, so an insert of an order and then
-- its lines is undone children-first. Verified against a full
-- `DELETE FROM orders`, which is the case this exists for.
CREATE OR REPLACE FUNCTION undo_txid(_txid BIGINT) RETURNS INTEGER
LANGUAGE plpgsql AS $fn$
DECLARE
  revision RECORD;
  columns TEXT[];
  reverted INTEGER := 0;
BEGIN
  FOR revision IN
    SELECT * FROM row_revisions
     WHERE txid = _txid
     ORDER BY CASE WHEN action = 'delete' THEN 0 ELSE 1 END,
              CASE WHEN action = 'delete' THEN id ELSE -id END
  LOOP
    IF revision.action = 'insert' THEN
      EXECUTE format('DELETE FROM %I t WHERE to_jsonb(t) @> $1', revision.table_name)
        USING revision.row_key;
    ELSIF revision.action = 'delete' THEN
      EXECUTE format(
        'INSERT INTO %I SELECT * FROM jsonb_populate_record(NULL::%I, $1)',
        revision.table_name, revision.table_name
      ) USING revision.before;
    ELSE
      -- Every column the row had, named twice: once as the target list
      -- and once as the source, which is how a multi-column assignment
      -- takes a whole row from one subquery. Held as an array rather than
      -- a joined string that has to be split apart again for the second
      -- form — the split would come apart on a column name containing a
      -- comma, and there is no reason to make that possible.
      SELECT array_agg(quote_ident(c.column_name) ORDER BY c.ordinal_position)
        INTO columns
        FROM information_schema.columns c
       WHERE c.table_schema = 'public'
         AND c.table_name = revision.table_name
         AND c.is_generated = 'NEVER'
         AND revision.before ? c.column_name;
      EXECUTE format(
        'UPDATE %I t SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::%I, $1) r) WHERE to_jsonb(t) @> $2',
        revision.table_name,
        array_to_string(columns, ', '),
        'r.' || array_to_string(columns, ', r.'),
        revision.table_name
      ) USING revision.before, revision.row_key;
    END IF;
    reverted := reverted + 1;
  END LOOP;

  IF reverted = 0 THEN
    RAISE EXCEPTION 'No revisions recorded for transaction %', _txid;
  END IF;
  RETURN reverted;
END;
$fn$;
