-- Migration 017 — the local mirror of SUMIT's documents.
--
-- A mirror rather than a live read because the API offers nothing better:
-- /accounting/documents/list/ filters by type and date only, with no
-- customer filter and no "modified since". A per-client view therefore has
-- to bucket a window locally, and sync means re-pulling a window and
-- upserting on document_id.
--
-- value is gross. SUMIT's CompanyValue includes VAT -- verified against the
-- live account, where a document reporting ₪1,000 carries lines of ₪847 and
-- VAT of ₪153. net_value and vat_value come from a getdetails call per
-- revenue document, because the listing carries neither and dividing by the
-- standard rate would be wrong for anything not standard-rated.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS sumit_documents (
  document_id BIGINT PRIMARY KEY,
  document_number BIGINT,
  type TEXT NOT NULL,
  bucket TEXT NOT NULL,
  date DATE,
  due_date DATE,
  sumit_customer_id BIGINT,
  customer_name TEXT,
  client_id INTEGER REFERENCES clients(id),
  value NUMERIC(12, 2),
  net_value NUMERIC(12, 2),
  vat_value NUMERIC(12, 2),
  is_closed BOOLEAN,
  is_draft BOOLEAN,
  download_url TEXT,
  payment_url TEXT,
  external_reference TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
)

;

CREATE INDEX IF NOT EXISTS sumit_documents_client_idx ON sumit_documents (client_id)

;

CREATE INDEX IF NOT EXISTS sumit_documents_date_idx ON sumit_documents (date)

;
