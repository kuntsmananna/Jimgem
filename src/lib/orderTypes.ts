/**
 * Order types, labels, and pure helpers — split out from orders.ts so
 * client components can import them without pulling in orders.ts's
 * server-only dependencies (pg via db.ts, googleapis via googleSheets.ts).
 */

export type PaymentStatus = "unpaid" | "deposit" | "paid" | "comp" | "net40";
export type ProductionStatus = "queue" | "preparing" | "delivered";

/** How many units of one flavour sit inside one package line. */
export interface OrderLineFlavor {
  flavorId: string;
  units: number;
}

/**
 * One line of an order's content: a quantity of one package type, plus
 * the flavour split of *those* packages. An order is a list of these, so
 * "2 small trays of Gin & Tonic + 1 big tray of a mix" is two lines —
 * see schema.sql's order_package_lines for why flavours hang off the
 * line rather than off the order.
 */
export interface OrderPackageLine {
  packageTypeId: string;
  /** Number of packages, not units. */
  quantity: number;
  flavors: OrderLineFlavor[];
}

/** Units this line packs: its package count times that package's size. */
export function linePackedUnits(line: OrderPackageLine, unitsPerPackage: Map<number, number>): number {
  return line.quantity * (unitsPerPackage.get(Number(line.packageTypeId)) ?? 0);
}

/** Units on this line that have been given a flavour. */
export function lineAssignedUnits(line: OrderPackageLine): number {
  return line.flavors.reduce((sum, entry) => sum + entry.units, 0);
}

/**
 * Units this line packs but hasn't assigned a flavour to. Negative when
 * the flavours overshoot — callers that only want the gap should clamp,
 * but the sign is what tells the form which way it is out of balance.
 */
export function lineRemainingUnits(line: OrderPackageLine, unitsPerPackage: Map<number, number>): number {
  return linePackedUnits(line, unitsPerPackage) - lineAssignedUnits(line);
}

/** Total units in an order — the packed size of every line. */
export function orderUnits(lines: OrderPackageLine[], unitsPerPackage: Map<number, number>): number {
  return lines.reduce((sum, line) => sum + linePackedUnits(line, unitsPerPackage), 0);
}

/**
 * Units per flavour across the whole order. A flavour can appear on more
 * than one line (a mix in both a small and a big tray), so entries are
 * merged rather than concatenated — callers chart this directly and
 * would otherwise draw the same flavour twice.
 */
export function orderFlavorUnits(lines: OrderPackageLine[]): OrderLineFlavor[] {
  const totals = new Map<string, number>();
  for (const line of lines) {
    for (const entry of line.flavors) {
      totals.set(entry.flavorId, (totals.get(entry.flavorId) ?? 0) + entry.units);
    }
  }
  return [...totals].map(([flavorId, units]) => ({ flavorId, units }));
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
  /** Free text (פירוט) for Sheet orders; empty for DB orders, which use packageLines instead. */
  details: string;
  guests: number | null;
  deliveryCost: number | null;
  mirrors: number | null;
  packageLines: OrderPackageLine[];
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
  packageLines: OrderPackageLine[];
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
