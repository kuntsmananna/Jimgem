/**
 * Order types, labels, and pure helpers — split out from orders.ts so
 * client components can import them without pulling in orders.ts's
 * server-only dependencies (pg via db.ts, googleapis via googleSheets.ts).
 */

import type { Flavor } from "./settings";
import { isMixFlavor } from "./flavorStyle";

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

/**
 * Whole units split as evenly as a tray allows, with the remainder dealt
 * out one unit at a time. Integer arithmetic because a cube cannot be
 * cut: 50 units across 3 flavours is 17/17/16, never 16.67 each.
 */
export function evenSplit(flavorIds: string[], total: number): OrderLineFlavor[] {
  if (flavorIds.length === 0) return [];
  const base = Math.floor(Math.max(0, total) / flavorIds.length);
  let rest = Math.max(0, total) - base * flavorIds.length;
  return flavorIds.map((flavorId) => {
    const extra = rest > 0 ? 1 : 0;
    rest -= extra;
    return { flavorId, units: base + extra };
  });
}

/**
 * Sets one flavour's units, adding or removing it as needed. Pure, and
 * shared by the order form and Settings' preset editor so the two can't
 * drift on what "set this to zero" means.
 */
export function setFlavorUnits(
  flavors: OrderLineFlavor[],
  flavorId: string,
  units: number,
): OrderLineFlavor[] {
  if (units <= 0) return flavors.filter((f) => f.flavorId !== flavorId);
  if (flavors.some((f) => f.flavorId === flavorId)) {
    return flavors.map((f) => (f.flavorId === flavorId ? { ...f, units } : f));
  }
  return [...flavors, { flavorId, units }];
}

/**
 * Picks a flavour in or out.
 *
 * While `autoSplit` holds, the package is re-divided equally between
 * whatever is now selected — two flavours are halves, three are thirds —
 * which is how a mixed tray gets described out loud. Once someone has set
 * a number by hand the caller turns that off, and a new pick then takes
 * only what is unassigned and leaves the rest alone.
 */
export function toggleFlavorUnits(
  flavors: OrderLineFlavor[],
  flavorId: string,
  { autoSplit, packed }: { autoSplit: boolean; packed: number },
): OrderLineFlavor[] {
  const selected = flavors.some((f) => f.flavorId === flavorId);

  if (autoSplit) {
    const ids = selected
      ? flavors.filter((f) => f.flavorId !== flavorId).map((f) => f.flavorId)
      : [...flavors.map((f) => f.flavorId), flavorId];
    return evenSplit(ids, packed);
  }
  if (selected) return flavors.filter((f) => f.flavorId !== flavorId);

  const remaining = packed - flavors.reduce((sum, f) => sum + f.units, 0);
  return [...flavors, { flavorId, units: Math.max(0, remaining) }];
}

/**
 * A preset's stored proportions as concrete units of one package.
 *
 * Rounding drift lands on the largest share so a full recipe totals the
 * package exactly — but only when the shares actually add up to 100. A
 * half-finished recipe stays half-empty rather than having the missing
 * 40% dumped onto one flavour.
 */
export function presetUnits(
  shares: { flavorId: number; share: number }[],
  packed: number,
): OrderLineFlavor[] {
  const units = shares.map((s) => ({
    flavorId: String(s.flavorId),
    units: Math.round((s.share / 100) * packed),
  }));
  const totalShare = shares.reduce((sum, s) => sum + s.share, 0);
  const drift = packed - units.reduce((sum, u) => sum + u.units, 0);
  if (units.length > 0 && drift !== 0 && Math.abs(totalShare - 100) < 0.5) {
    const biggest = units.reduce((a, b) => (b.units > a.units ? b : a));
    biggest.units += drift;
  }
  return units;
}

/**
 * Turns "N units of MIX" into N units spread evenly over every real
 * flavour, so a mixed package reads as what it actually contains — an
 * assortment — rather than as a block of one invented colour.
 *
 * A view-time transform, never stored: the saved order keeps its single
 * MIX line, because "a mix" is genuinely what was ordered and choosing
 * the exact split is a kitchen decision. Lives here rather than inside
 * the preview so any surface that draws flavours can honour it.
 */
export function expandMixFlavors(entries: OrderLineFlavor[], flavors: Flavor[]): OrderLineFlavor[] {
  const mixIds = new Set(flavors.filter(isMixFlavor).map((f) => String(f.id)));
  if (!entries.some((e) => mixIds.has(e.flavorId))) return entries;

  const spreadIds = flavors.filter((f) => !isMixFlavor(f) && !f.archivedAt).map((f) => String(f.id));
  if (spreadIds.length === 0) return entries;

  const totals = new Map<string, number>();
  for (const entry of entries.flatMap((entry) =>
    mixIds.has(entry.flavorId) ? evenSplit(spreadIds, entry.units) : [entry],
  )) {
    totals.set(entry.flavorId, (totals.get(entry.flavorId) ?? 0) + entry.units);
  }
  return [...totals].map(([flavorId, units]) => ({ flavorId, units }));
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
  /**
   * The Sheet's פירוט cell, exactly as imported. **Legacy and unread** —
   * migration 004 folded this text into `notes`, which is the editable
   * field the UI shows, and the importer now does the same for new rows.
   * Kept as the untouched original so the fold-in stays auditable, same
   * as order_overrides and order_content_lines. Don't add reads of it.
   */
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
