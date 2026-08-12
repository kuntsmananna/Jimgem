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

/** Total units in an order, from its packaging lines. */
export function orderUnits(
  contentLines: OrderContentLine[],
  unitsPerPackage: Map<number, number>,
): number {
  return contentLines.reduce(
    (sum, line) =>
      line.kind === "package" ? sum + line.quantity * (unitsPerPackage.get(Number(line.packageTypeId)) ?? 0) : sum,
    0,
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
  productionStatus: ProductionStatus | null;
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

/** Reduces an Order down to the shape the write API expects — used whenever a single field changes but the API needs the full row. */
export function orderToInput(order: Order): OrderInput {
  return {
    date: order.date,
    customer: order.customer,
    customerType: order.customerType,
    location: order.location,
    guests: order.guests,
    deliveryCost: order.deliveryCost,
    mirrors: order.mirrors,
    contentLines: order.contentLines,
    totalAmount: order.totalAmount,
    deposit: order.deposit,
    paymentStatus: order.paymentStatus,
    productionStatus: order.productionStatus ?? "queue",
    notes: order.notes,
  };
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
export function orderMonth(order: Order): number | null {
  const match = order.date.trim().match(/^\d{4}-(\d{2})-\d{2}$/);
  return match ? Number(match[1]) : null;
}

/** Day-of-month an order falls on — for chronological sort within a month. */
export function orderDay(order: Order): number | null {
  const match = order.date.trim().match(/^\d{4}-\d{2}-(\d{2})$/);
  return match ? Number(match[1]) : null;
}

/**
 * "D/M", the way the business writes dates in the Sheet. The stored year
 * is an artefact of `orders.date` being a real DATE column — the Sheet
 * has no year and the app never works in more than one (see
 * sheetImport.ts), so showing it would be inventing precision.
 */
export function formatOrderDate(isoDate: string): string {
  const match = isoDate.trim().match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `${Number(match[2])}/${Number(match[1])}` : isoDate;
}
