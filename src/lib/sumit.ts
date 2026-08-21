/**
 * SUMIT (formerly OfficeGuy) REST client — the only module that reads the
 * SUMIT credentials, the same rule googleSheets.ts follows for the Google
 * service account. Nothing else should touch SUMIT_COMPANY_ID /
 * SUMIT_API_KEY, and neither may ever carry a NEXT_PUBLIC_ prefix.
 *
 * Every SUMIT call is a POST whose *body* carries the credentials — there
 * is no header auth and no GET, so `sumitPost` is the whole protocol.
 *
 * Read-only so far. The integration's first phase only pulls documents
 * out of SUMIT (see scripts/sumit-probe.mts); nothing here writes to it.
 */

const API_BASE = "https://api.sumit.co.il";

/** Paging maxes out at 1000 per page (Core_Typed.Paging). */
const PAGE_SIZE = 1000;

/** Guard against an unbounded loop if HasNextPage ever lies. */
const MAX_PAGES = 200;

interface SumitCredentials {
  CompanyID: number;
  APIKey: string;
}

function credentials(): SumitCredentials {
  const companyId = process.env.SUMIT_COMPANY_ID;
  const apiKey = process.env.SUMIT_API_KEY;
  if (!companyId || !apiKey) {
    throw new Error("SUMIT_COMPANY_ID and SUMIT_API_KEY are not set. See .env.local.example.");
  }
  const id = Number(companyId);
  if (!Number.isFinite(id)) {
    throw new Error(`SUMIT_COMPANY_ID must be numeric, got "${companyId}".`);
  }
  return { CompanyID: id, APIKey: apiKey };
}

interface SumitEnvelope<T> {
  Status: string | number;
  UserErrorMessage: string | null;
  TechnicalErrorDetails: string | null;
  Data: T | null;
}

/**
 * One SUMIT call. The envelope reports failure in its body with an HTTP
 * 200, so the Status check — not `res.ok` — is what catches a bad key or a
 * rejected request. Status serializes as either "Success" or 0 depending
 * on the endpoint, hence the two-way comparison.
 */
export async function sumitPost<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ...body, Credentials: credentials() }),
  });
  if (!response.ok) {
    throw new Error(`SUMIT ${path} returned HTTP ${response.status} ${response.statusText}`);
  }
  const envelope = (await response.json()) as SumitEnvelope<T>;
  const status = String(envelope.Status);
  if (status !== "Success" && status !== "0") {
    const detail = envelope.UserErrorMessage ?? envelope.TechnicalErrorDetails ?? "no detail given";
    throw new Error(`SUMIT ${path} failed (${status}): ${detail}`);
  }
  return envelope.Data as T;
}

/**
 * Document types, in the enum's own order — the index *is* the numeric
 * value, so this doubles as the number → name lookup. SUMIT returns the
 * name in JSON, but the API accepts either, and older responses have been
 * seen carrying the number.
 */
export const DOCUMENT_TYPES = [
  "Invoice",
  "InvoiceAndReceipt",
  "Receipt",
  "ProformaInvoice",
  "DonationReceipt",
  "CreditInvoice",
  "CreditInvoiceAndReceipt",
  "CreditReceipt",
  "Order",
  "DeliveryNote",
  "GoodsReturnNote",
  "PurchasingOrder",
  "PriceQuotation",
  "PaymentRequest",
  "CreditDonationReceipt",
  "ExpenseInvoiceReceipt",
  "ExpenseInvoice",
  "ExpenseReceipt",
  "ExpenseRequest",
  "CreditExpenseInvoiceReceipt",
  "CreditExpenseInvoice",
  "CreditExpenseReceipt",
  "SupplierPayment",
] as const;

export type SumitDocumentType = (typeof DOCUMENT_TYPES)[number];

export function documentTypeName(type: string | number | null): string {
  if (type === null) return "Unknown";
  if (typeof type === "number") return DOCUMENT_TYPES[type] ?? `Unknown(${type})`;
  const numeric = Number(type);
  if (Number.isInteger(numeric) && type.trim() !== "") {
    return DOCUMENT_TYPES[numeric] ?? `Unknown(${type})`;
  }
  // The OpenAPI doc renders enums as "Invoice (0)"; tolerate that shape too.
  return type.replace(/\s*\(\d+\)$/, "");
}

/**
 * What a document type *means*, which is not the same as whether it
 * carries a number. Summing every non-expense document double-counts:
 * a Receipt is the payment of an Invoice already counted, and a
 * DeliveryNote or PaymentRequest is not money at all.
 *
 *   revenue     what was actually billed — the only bucket to sum as income
 *   collection  money arriving against revenue already billed
 *   quote       asked for, not agreed
 *   logistics   goods moving, no money
 *   expense     the supplier side
 */
export type DocumentBucket = "revenue" | "collection" | "quote" | "logistics" | "expense";

const BUCKETS: Record<string, DocumentBucket> = {
  Invoice: "revenue",
  InvoiceAndReceipt: "revenue",
  CreditInvoice: "revenue",
  CreditInvoiceAndReceipt: "revenue",
  DonationReceipt: "revenue",
  CreditDonationReceipt: "revenue",
  Receipt: "collection",
  CreditReceipt: "collection",
  PaymentRequest: "collection",
  ProformaInvoice: "quote",
  PriceQuotation: "quote",
  Order: "logistics",
  DeliveryNote: "logistics",
  GoodsReturnNote: "logistics",
  PurchasingOrder: "logistics",
};

export function documentBucket(type: string | number | null): DocumentBucket {
  return BUCKETS[documentTypeName(type)] ?? "expense";
}

/** The supplier side of the ledger: every Expense* type plus SupplierPayment. */
export function isExpenseDocument(type: string | number | null): boolean {
  return documentBucket(type) === "expense";
}

/**
 * The supplier-side types documents/list will actually accept.
 * SupplierPayment is in the enum but the endpoint rejects it outright
 * ("Document type not supported"), and one bad entry fails the whole
 * query rather than being ignored.
 */
export const EXPENSE_DOCUMENT_TYPES = DOCUMENT_TYPES.filter((type) => type.includes("Expense"));

/** A credit note reverses the document it credits, so its value is negative to us. */
export function isCreditDocument(type: string | number | null): boolean {
  return documentTypeName(type).startsWith("Credit");
}

/** One row of /accounting/documents/list/ (Accounting_Typed_ListDocumentsDocument). */
export interface SumitDocument {
  DocumentID: number;
  DocumentNumber: number | null;
  Type: string | number;
  Date: string | null;
  DueDate: string | null;
  CustomerID: number;
  CustomerName: string | null;
  Description: string | null;
  /** Expense invoice number, for supplier-side documents. */
  ExternalReference: string | null;
  DocumentValue: number | null;
  /** Value in ILS, whatever the document's own currency. */
  CompanyValue: number | null;
  IsClosed: boolean | null;
  IsDraft: boolean | null;
  DocumentDownloadURL: string | null;
  /** What a "send the client a pay link" button would hand out. */
  DocumentPaymentURL: string | null;
  AssignmentNumber: string | null;
}

interface ListDocumentsResponse {
  Documents: SumitDocument[] | null;
  HasNextPage: boolean;
}

function isoDate(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString().slice(0, 10);
}

/**
 * Every document in a date window, paged out in full.
 *
 * Note what the endpoint can *not* do: there is no customer filter and no
 * "modified since". A document belongs to a customer only by the
 * CustomerID on the row, so per-client views are built by pulling a window
 * and bucketing locally, and sync is by date window plus upsert on
 * DocumentID.
 */
export async function listDocuments(
  options: {
    /** Omit both dates to ask without a date filter — a document with no
     * date of its own is excluded by a range, however wide. */
    dateFrom?: Date | string;
    dateTo?: Date | string;
    types?: readonly SumitDocumentType[];
    includeDrafts?: boolean;
  },
): Promise<SumitDocument[]> {
  const documents: SumitDocument[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await sumitPost<ListDocumentsResponse>("/accounting/documents/list/", {
      DateFrom: options.dateFrom ? isoDate(options.dateFrom) : null,
      DateTo: options.dateTo ? isoDate(options.dateTo) : null,
      DocumentTypes: options.types ?? null,
      IncludeDrafts: options.includeDrafts ?? false,
      Paging: { StartIndex: page * PAGE_SIZE, PageSize: PAGE_SIZE },
    });
    documents.push(...(data.Documents ?? []));
    if (!data.HasNextPage) break;
  }
  return documents;
}

export interface SumitFolder {
  ID: number;
  Name: string | null;
}

export async function listFolders(): Promise<SumitFolder[]> {
  const data = await sumitPost<{ Folders: SumitFolder[] | null }>("/crm/schema/listfolders/", {});
  return data.Folders ?? [];
}

export interface SumitEntity {
  ID: number | null;
  Folder: string | null;
  Properties: Record<string, unknown> | null;
}

/**
 * CRM entities in a folder. This is the only way to read a customer list —
 * /accounting/customers/ has create and update but no list or search, so
 * the customers folder is where a roster (with phone and email) comes from.
 */
export async function listEntities(folder: string, loadProperties = true): Promise<SumitEntity[]> {
  const entities: SumitEntity[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await sumitPost<{ Entities: SumitEntity[] | null; HasNextPage: boolean }>(
      "/crm/data/listentities/",
      {
        Folder: folder,
        LoadProperties: loadProperties,
        Paging: { StartIndex: page * PAGE_SIZE, PageSize: PAGE_SIZE },
      },
    );
    entities.push(...(data.Entities ?? []));
    if (!data.HasNextPage) break;
  }
  return entities;
}

/**
 * One CRM entity with its fields. listEntities returns entities whose
 * Properties come back empty; getentity is what carries the actual
 * fields, which is the only way to learn a folder's shape.
 */
export async function getEntity(
  entityId: number,
  includeIncoming = false,
): Promise<Record<string, unknown> | null> {
  const data = await sumitPost<{ Entity: Record<string, unknown> | null }>("/crm/data/getentity/", {
    EntityID: entityId,
    IncludeFields: true,
    // Entities pointing *at* this one — how a receipt file would reveal
    // the expense record made from it.
    IncludeIncomingProperties: includeIncoming,
  });
  return data.Entity;
}

/** One line of a document — what `getdetails` returns per item. */
export interface SumitDocumentItem {
  Quantity: number | null;
  UnitPrice: number | null;
  TotalPrice: number | null;
  /** VAT in ILS, stated separately from TotalPrice. */
  VAT: number | null;
  Description: string | null;
}

export interface SumitDocumentDetails {
  Document: { DocumentValue: number | null; CompanyValue: number | null; Type: string | number } | null;
  Items: SumitDocumentItem[] | null;
}

export function getDocumentDetails(documentId: number): Promise<SumitDocumentDetails> {
  return sumitPost<SumitDocumentDetails>("/accounting/documents/getdetails/", { DocumentID: documentId });
}

/** The company's VAT rate on a date — 0.18 style, not 18. */
export async function getVatRate(date?: Date | string): Promise<number> {
  const data = await sumitPost<{ Rate: number }>("/accounting/general/getvatrate/", {
    Date: date ? isoDate(date) : null,
  });
  return data.Rate;
}
