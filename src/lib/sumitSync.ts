import { getDb } from "./db";
import { getClients, setSumitCustomerId } from "./clients";
import { normalizeClientName } from "./clientName";
import {
  documentBucket,
  documentTypeName,
  getDocumentDetails,
  listDocuments,
  type SumitDocument,
} from "./sumit";

/**
 * SUMIT → Postgres. The only module that imports the SUMIT client besides
 * the probe, which is what makes "no render path touches SUMIT" structural
 * rather than a rule to remember — the same shape `sheetImport.ts` gives
 * the Google Sheet.
 *
 * Sync is a **date window plus an upsert on DocumentID**, because the API
 * offers nothing better: `documents/list` filters by type and date only,
 * with no customer filter and no "modified since". Re-pulling a window is
 * therefore the only way to notice a document that changed, and the upsert
 * is what makes doing so cheap.
 */

/** How far back a routine sync looks. A full history is asked for explicitly. */
const DEFAULT_WINDOW_DAYS = 90;

/** Documents are dated forward sometimes — a window that ends today misses them. */
const FORWARD_DAYS = 365;

export interface SumitSyncResult {
  documents: number;
  revenueDetailed: number;
  clientsLinked: number;
  from: string;
  to: string;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Pulls a window of documents into `sumit_documents`.
 *
 * Revenue documents get one extra `getdetails` call each, for their net and
 * VAT: the listing carries only the gross value, and dividing it by the
 * standard rate would be wrong for anything not standard-rated. Only
 * revenue documents, because those are what the money views sum — a
 * delivery note's VAT breakdown would cost a call and answer nothing.
 */
export async function syncSumitDocuments(options: { windowDays?: number } = {}): Promise<SumitSyncResult> {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const from = isoDay(new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000));
  const to = isoDay(new Date(Date.now() + FORWARD_DAYS * 24 * 60 * 60 * 1000));

  const documents = await listDocuments({ dateFrom: from, dateTo: to, includeDrafts: true });
  const clientsLinked = await linkClientsByName(documents);
  const clientIdByCustomer = await clientIdsBySumitCustomer();

  let revenueDetailed = 0;
  const rows: unknown[][] = [];
  for (const document of documents) {
    const bucket = documentBucket(document.Type);
    let net: number | null = null;
    let vat: number | null = null;
    if (bucket === "revenue") {
      try {
        const details = await getDocumentDetails(document.DocumentID);
        const items = details.Items ?? [];
        net = items.reduce((total, item) => total + (item.TotalPrice ?? 0), 0);
        vat = items.reduce((total, item) => total + (item.VAT ?? 0), 0);
        revenueDetailed += 1;
      } catch {
        // One document refusing its details is not a reason to lose the
        // sync: the gross value is stored either way, and the next run
        // tries again.
      }
    }
    rows.push([
      document.DocumentID,
      document.DocumentNumber,
      documentTypeName(document.Type),
      bucket,
      document.Date ? document.Date.slice(0, 10) : null,
      document.DueDate ? document.DueDate.slice(0, 10) : null,
      document.CustomerID || null,
      document.CustomerName,
      document.CustomerID ? (clientIdByCustomer.get(document.CustomerID) ?? null) : null,
      document.CompanyValue ?? document.DocumentValue ?? 0,
      net,
      vat,
      document.IsClosed,
      document.IsDraft ?? false,
      document.DocumentDownloadURL,
      document.DocumentPaymentURL,
      document.ExternalReference,
    ]);
  }

  await upsertDocuments(rows);
  return { documents: rows.length, revenueDetailed, clientsLinked, from, to };
}

const COLUMNS = [
  "document_id",
  "document_number",
  "type",
  "bucket",
  "date",
  "due_date",
  "sumit_customer_id",
  "customer_name",
  "client_id",
  "value",
  "net_value",
  "vat_value",
  "is_closed",
  "is_draft",
  "download_url",
  "payment_url",
  "external_reference",
];

/**
 * In batches, because the HTTP driver is one round trip per statement and
 * a document at a time would spend the whole sync waiting. 50 rows × 17
 * columns stays well inside the parameter limit.
 */
async function upsertDocuments(rows: unknown[][]): Promise<void> {
  if (rows.length === 0) return;
  const db = getDb();
  const updates = COLUMNS.filter((column) => column !== "document_id")
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(", ");

  for (let start = 0; start < rows.length; start += 50) {
    const batch = rows.slice(start, start + 50);
    const values = batch
      .map(
        (_, row) =>
          `(${COLUMNS.map((_, column) => `$${row * COLUMNS.length + column + 1}`).join(", ")})`,
      )
      .join(", ");
    await db.query(
      `INSERT INTO sumit_documents (${COLUMNS.join(", ")}) VALUES ${values}
       ON CONFLICT (document_id) DO UPDATE SET ${updates}, synced_at = now()`,
      batch.flat(),
    );
  }
}

/** `sumit_customer_id → clients.id`, for pointing documents at a client. */
async function clientIdsBySumitCustomer(): Promise<Map<number, number>> {
  const db = getDb();
  const { rows } = await db.query<{ id: number; sumit_customer_id: string }>(
    "SELECT id, sumit_customer_id FROM clients WHERE sumit_customer_id IS NOT NULL",
  );
  return new Map(rows.map((row) => [Number(row.sumit_customer_id), row.id]));
}

/**
 * Stores the SUMIT customer id on clients whose name matches one **exactly**.
 *
 * This is the only way a client gets linked without someone doing it by
 * hand: SUMIT can't be searched, so the roster has to be reconstructed
 * from the documents themselves. Exact only, deliberately — against the
 * real account 13 of 73 order names matched this way and another 13 only
 * looked like they did (`פנטרה` against `פנטרה אבטחת מידע`), and those are
 * for a person to confirm on the Clients page.
 */
async function linkClientsByName(documents: SumitDocument[]): Promise<number> {
  const clients = await getClients(true);
  const unlinked = clients.filter((client) => client.sumitCustomerId === null);
  if (unlinked.length === 0) return 0;

  const customerByName = new Map<string, number>();
  for (const document of documents) {
    if (!document.CustomerID || !document.CustomerName) continue;
    customerByName.set(normalizeClientName(document.CustomerName), document.CustomerID);
  }

  let linked = 0;
  for (const client of unlinked) {
    const customerId = customerByName.get(normalizeClientName(client.name));
    if (customerId === undefined) continue;
    await setSumitCustomerId(client.id, customerId);
    linked += 1;
  }
  return linked;
}

export interface MirroredDocument {
  documentId: number;
  documentNumber: number | null;
  type: string;
  bucket: string;
  date: string | null;
  clientId: number | null;
  customerName: string;
  /** Gross — SUMIT's own value includes VAT. */
  value: number;
  netValue: number | null;
  isClosed: boolean;
  downloadUrl: string | null;
  paymentUrl: string | null;
}

interface DocumentRow {
  document_id: string;
  document_number: string | null;
  type: string;
  bucket: string;
  date: string | null;
  client_id: number | null;
  customer_name: string | null;
  value: string;
  net_value: string | null;
  is_closed: boolean | null;
  download_url: string | null;
  payment_url: string | null;
}

function mapDocument(row: DocumentRow): MirroredDocument {
  return {
    documentId: Number(row.document_id),
    documentNumber: row.document_number === null ? null : Number(row.document_number),
    type: row.type,
    bucket: row.bucket,
    date: row.date,
    clientId: row.client_id,
    customerName: row.customer_name ?? "",
    value: Number(row.value),
    netValue: row.net_value === null ? null : Number(row.net_value),
    isClosed: row.is_closed ?? false,
    downloadUrl: row.download_url,
    paymentUrl: row.payment_url,
  };
}

/** Every mirrored document, newest first — read from Postgres, never SUMIT. */
export async function getSumitDocuments(): Promise<MirroredDocument[]> {
  const db = getDb();
  const { rows } = await db.query<DocumentRow>(
    "SELECT * FROM sumit_documents ORDER BY date DESC NULLS LAST, document_id DESC",
  );
  return rows.map(mapDocument);
}

/** When the mirror last ran, or null if it never has. */
export async function getLastSumitSync(): Promise<string | null> {
  const db = getDb();
  const { rows } = await db.query<{ last: string | null }>(
    "SELECT max(synced_at)::text AS last FROM sumit_documents",
  );
  return rows[0]?.last ?? null;
}
