/**
 * Order types, labels, and pure helpers — split out from orders.ts so
 * client components can import them without pulling in orders.ts's
 * server-only dependencies (pg via db.ts, googleapis via googleSheets.ts).
 */

export type PaymentStatus = "unpaid" | "deposit" | "paid" | "comp" | "net40";
export type ProductionStatus = "queue" | "preparing" | "delivered";

export interface OrderContentLine {
  packageTypeId: string;
  flavorId: string | null; // null = "Mix"
  quantity: number;
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
