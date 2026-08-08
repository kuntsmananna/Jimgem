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
  /** "sheet:<row>" for Sheet-sourced orders, DB id for dashboard-created ones. */
  key: string;
  source: "sheet" | "db";
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
 * Month (1-12) an order falls in, regardless of source — Sheet dates are
 * "D/M" (no year, matching the rest of this codebase's single-year
 * assumption for V1), DB dates are "YYYY-MM-DD" (see db.ts's DATE type
 * parser override).
 */
export function orderMonth(order: Order): number | null {
  if (order.source === "sheet") {
    const match = order.date.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
    if (!match) return null;
    const month = Number(match[2]);
    return month >= 1 && month <= 12 ? month : null;
  }
  const match = order.date.trim().match(/^\d{4}-(\d{2})-\d{2}$/);
  return match ? Number(match[1]) : null;
}

/** Day-of-month an order falls on, regardless of source — for chronological sort within a month. */
export function orderDay(order: Order): number | null {
  if (order.source === "sheet") {
    const match = order.date.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
    return match ? Number(match[1]) : null;
  }
  const match = order.date.trim().match(/^\d{4}-\d{2}-(\d{2})$/);
  return match ? Number(match[1]) : null;
}
