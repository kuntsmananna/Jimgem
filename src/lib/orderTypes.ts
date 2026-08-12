/**
 * Order types, labels, and pure helpers — split out from orders.ts so
 * client components can import them without pulling in orders.ts's
 * server-only dependencies (pg via db.ts, googleapis via googleSheets.ts).
 */

export type PaymentStatus = "unpaid" | "deposit" | "paid" | "comp" | "net40";
export type ProductionStatus = "queue" | "preparing" | "delivered";

/**
 * One entry on one of the order form's two content lists. Packaging and
 * flavour are separate axes of the same order — see schema.sql's
 * order_content_lines for why they are never combined on one row.
 */
export type OrderContentLine =
  | { kind: "package"; packageTypeId: string; quantity: number }
  | { kind: "flavor"; flavorId: string; quantity: number };

/**
 * Total units in an order, from its packaging lines — a packaging line's
 * quantity counts packages, so it needs the per-package size.
 */
export function orderUnits(contentLines: OrderContentLine[], unitsPerPackage: Map<number, number>): number {
  return contentLines.reduce(
    (sum, line) =>
      line.kind === "package"
        ? sum + line.quantity * (unitsPerPackage.get(Number(line.packageTypeId)) ?? 0)
        : sum,
    0,
  );
}

/**
 * Units per flavour in an order. The counterpart to orderUnits, and kept
 * beside it so the asymmetry stays in one place: a flavour line's
 * quantity is already in units, so unlike a packaging line it needs no
 * conversion.
 */
export function orderFlavorUnits(contentLines: OrderContentLine[]): { flavorId: string; units: number }[] {
  return contentLines.flatMap((line) =>
    line.kind === "flavor" ? [{ flavorId: line.flavorId, units: line.quantity }] : [],
  );
}

export interface Order {
  /** DB row id. Every order is a DB row — Sheet rows are imported (see sheetImport.ts). */
  key: string;
  /**
   * Where the order originally came from. Provenance only: an imported
   * order is an ordinary editable DB row like any other, and both kinds
   * store their date the same way.
   */
  source: "sheet" | "db";
  /** "YYYY-MM-DD". */
  date: string;
  customer: string;
  customerType: string;
  location: string;
  /** Free text (פירוט) for Sheet orders; empty for DB orders, which use contentLines instead. */
  details: string;
  guests: number | null;
  deliveryCost: number | null;
  mirrors: number | null;
  contentLines: OrderContentLine[];
  totalAmount: number;
  deposit: number;
  paymentStatus: PaymentStatus;
  /** Never null: `orders.production_status` is NOT NULL DEFAULT 'queue'. */
  productionStatus: ProductionStatus;
  notes: string;
  /** True when best-effort parsing of a Sheet row's פירוט text found little/nothing reliable. */
  needsReview: boolean;
}

export interface OrderInput {
  date: string;
  customer: string;
  customerType: string;
  location: string;
  guests: number | null;
  deliveryCost: number | null;
  mirrors: number | null;
  contentLines: OrderContentLine[];
  totalAmount: number;
  deposit: number;
  paymentStatus: PaymentStatus;
  productionStatus: ProductionStatus;
  notes: string;
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  deposit: "Deposit paid",
  paid: "Paid in full",
  comp: "Free / comp",
  net40: "Net+40 days",
};

export const PRODUCTION_STATUS_LABEL: Record<ProductionStatus, string> = {
  queue: "Queue",
  preparing: "Preparing",
  delivered: "Delivered",
};

/**
 * Every order date is "YYYY-MM-DD" (see db.ts's DATE type parser
 * override). Sheet rows arrive as "D/M" and are given a year at import
 * time — see sheetImport.ts for why the year is never surfaced.
 */
function parseIsoDate(isoDate: string): { month: number; day: number } | null {
  const match = isoDate.trim().match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? { month: Number(match[1]), day: Number(match[2]) } : null;
}

export function orderMonth(order: Order): number | null {
  return parseIsoDate(order.date)?.month ?? null;
}

/** Day-of-month an order falls on — for chronological sort within a month. */
export function orderDay(order: Order): number | null {
  return parseIsoDate(order.date)?.day ?? null;
}

/**
 * "D/M", the way the business writes dates in the Sheet. The stored year
 * is an artefact of `orders.date` being a real DATE column — the Sheet
 * has no year and the app never works in more than one (see
 * sheetImport.ts), so showing it would be inventing precision.
 */
export function formatOrderDate(isoDate: string): string {
  const parsed = parseIsoDate(isoDate);
  return parsed ? `${parsed.day}/${parsed.month}` : isoDate;
}
