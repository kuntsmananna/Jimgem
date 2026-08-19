/**
 * Order types, labels, and pure helpers — split out from orders.ts so
 * client components can import them without pulling in orders.ts's
 * server-only dependencies (pg via db.ts, googleapis via googleSheets.ts).
 */


export type PaymentStatus = "unpaid" | "deposit" | "paid" | "comp" | "net40";
export type ProductionStatus = "offer" | "queue" | "preparing" | "delivered";

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
  if (remaining > 0) return [...flavors, { flavorId, units: remaining }];

  // The tray is already full. Picking a flavour has to put some of it in
  // there — adding a zero-unit row looked like the click had been ignored,
  // and left you hand-reducing another flavour first to make room.
  return makeRoomFor(flavors, flavorId, packed);
}

/**
 * Fits one more flavour into a full package: the newcomer takes an equal
 * share and everything already there is scaled down proportionally into
 * what's left, so a deliberate 70/30 becomes 47/20/33 rather than being
 * flattened to thirds.
 *
 * Largest-remainder rounding, so the parts still add up to the package
 * exactly — plain rounding loses or invents units a cube at a time.
 */
function makeRoomFor(
  flavors: OrderLineFlavor[],
  flavorId: string,
  packed: number,
): OrderLineFlavor[] {
  const assigned = flavors.reduce((sum, f) => sum + f.units, 0);
  // Nothing to take from — an unsized package, or flavours all at zero.
  if (packed <= 0 || assigned <= 0) return [...flavors, { flavorId, units: Math.max(0, packed) }];

  const share = Math.floor(packed / (flavors.length + 1));
  const rest = packed - share;

  const exact = flavors.map((f) => (f.units / assigned) * rest);
  const scaled = flavors.map((f, i) => ({ flavorId: f.flavorId, units: Math.floor(exact[i]) }));

  let spare = rest - scaled.reduce((sum, f) => sum + f.units, 0);
  const byFraction = exact
    .map((value, i) => ({ i, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (const { i } of byFraction) {
    if (spare <= 0) break;
    scaled[i].units += 1;
    spare -= 1;
  }

  return [...scaled, { flavorId, units: share }];
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
 * The `id → unitsPerPackage` lookup every unit calculation needs. Built
 * identically at a dozen call sites before this existed.
 */
export function unitsPerPackageMap(
  packageTypes: { id: number; unitsPerPackage: number }[],
): Map<number, number> {
  return new Map(packageTypes.map((p) => [p.id, p.unitsPerPackage]));
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
  mirrors: number | null;
  waitresses: number | null;
  kosher: boolean;
  packageLines: OrderPackageLine[];
  /**
   * What the jelly itself costs. The extras below are charged on top —
   * see `orderTotal`, which is what the order is actually worth.
   */
  totalAmount: number;
  deliveryCost: number | null;
  mirrorsCost: number | null;
  waitressCost: number | null;
  kosherCost: number | null;
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
  mirrors: number | null;
  waitresses: number | null;
  kosher: boolean;
  packageLines: OrderPackageLine[];
  totalAmount: number;
  deliveryCost: number | null;
  mirrorsCost: number | null;
  waitressCost: number | null;
  kosherCost: number | null;
  deposit: number;
  paymentStatus: PaymentStatus;
  productionStatus: ProductionStatus;
  notes: string;
}

/**
 * The extras an order can be charged for, each paired with the field that
 * says whether it applies at all. Declared once so the order sheet, the
 * total and any future consumer can't disagree about what counts.
 *
 * `applies` is the gate: a cost box only appears once the thing itself is
 * on the order, so an order with no mirrors never shows a mirrors price.
 */
/**
 * Delivery is stored as a nullable cost rather than a flag: `null` is no
 * delivery, and `0` is "we deliver, no charge" — a real case and a
 * different answer. These two say so once, so no caller has to remember
 * that a 0 written for "no" silently promises free delivery.
 */
export function hasDelivery(order: Pick<OrderInput, "deliveryCost">): boolean {
  return order.deliveryCost !== null;
}

export function withDelivery<T extends Pick<OrderInput, "deliveryCost">>(order: T, on: boolean): T {
  // Keeps a price already agreed when toggling back on, and opens at zero
  // rather than guessing one.
  return { ...order, deliveryCost: on ? (order.deliveryCost ?? 0) : null };
}

export const ORDER_EXTRAS = [
  {
    // Gated like the rest, on the cost being set at all rather than on a
    // separate flag: null is "no delivery", and 0 is "we deliver, no
    // charge" — which is a real case and a different answer.
    id: "delivery",
    label: "Delivery",
    cost: "deliveryCost",
    priceKey: "delivery",
    // Flat: an order is delivered or it isn't, so there is nothing to
    // multiply the rate by.
    per: "flat",
    applies: (order: OrderInput) => hasDelivery(order),
    quantity: () => 1,
  },
  {
    id: "mirrors",
    label: "Mirrors",
    cost: "mirrorsCost",
    priceKey: "mirror",
    per: "per mirror",
    applies: (order: OrderInput) => (order.mirrors ?? 0) > 0,
    quantity: (order: OrderInput) => order.mirrors ?? 0,
  },
  {
    id: "waitress",
    label: "Waitressing",
    cost: "waitressCost",
    priceKey: "waitress",
    per: "per waitress",
    applies: (order: OrderInput) => (order.waitresses ?? 0) > 0,
    quantity: (order: OrderInput) => order.waitresses ?? 0,
  },
  {
    id: "kosher",
    label: "Kosher",
    cost: "kosherCost",
    priceKey: "kosher",
    per: "flat",
    applies: (order: OrderInput) => order.kosher,
    quantity: () => 1,
  },
] as const satisfies readonly {
  id: string;
  label: string;
  cost: keyof OrderInput;
  priceKey: PriceKey;
  /** How the rate is charged, for the Settings label. */
  per: string;
  applies: (order: OrderInput) => boolean;
  quantity: (order: OrderInput) => number;
}[];

/**
 * The owner's standard rates, kept in the `prices` table and edited in
 * Settings → Lists.
 *
 * A fixed set of keys rather than a list the owner adds to: each one is
 * wired to a specific field on the order, so a sixth key would have
 * nothing to price. `unit` is the odd one out — it multiplies the units
 * the Content tab packs rather than a count on the Details tab.
 */
export type PriceKey = "unit" | "delivery" | "mirror" | "waitress" | "kosher";

export type Prices = Record<PriceKey, number>;

/** Prices nothing. What a database with no `prices` rows would mean. */
export const ZERO_PRICES: Prices = { unit: 0, delivery: 0, mirror: 0, waitress: 0, kosher: 0 };

/**
 * Every rate with the words to describe it, for the Settings panel and
 * for the hint beside an auto-filled amount. Derived from ORDER_EXTRAS
 * where it can be, so adding an extra there gives it a rate here.
 */
export const PRICE_FIELDS: { key: PriceKey; label: string; per: string }[] = [
  { key: "unit", label: "Jelly", per: "per unit" },
  ...ORDER_EXTRAS.map((extra) => ({ key: extra.priceKey as PriceKey, label: extra.label, per: extra.per })),
];

/**
 * What the order is worth: the jelly plus every extra that applies.
 *
 * An extra is only counted when the thing itself is on the order, so
 * clearing the mirror count also drops its price rather than leaving a
 * charge for something no longer being supplied.
 */
export function orderTotal(order: OrderInput | Order): number {
  return ORDER_EXTRAS.reduce(
    (sum, extra) => sum + (extra.applies(order) ? (order[extra.cost] ?? 0) : 0),
    order.totalAmount,
  );
}

/**
 * The order with every un-overridden amount filled in from the owner's
 * standard rates: jelly at the unit price, and each extra at its rate
 * times however many of it the order has.
 *
 * Pure, and applied as a *derived* value rather than written into the
 * form's state — `draft` stays what was typed, and this is what gets
 * shown and saved. That is what keeps the money side correct when the
 * Content tab changes the unit count on a tab the user isn't looking at,
 * with no effect to run and nothing to keep in step.
 *
 * `overridden` holds the keys someone has typed an amount into by hand.
 * Those are left exactly as they are — a rate is a starting point, and an
 * agreed price has to survive changing the guest count.
 *
 * An extra that doesn't apply is skipped rather than zeroed, so turning
 * mirrors off and on again doesn't wipe a price that was agreed.
 */
export function repriceOrder(
  order: OrderInput,
  prices: Prices,
  overridden: ReadonlySet<PriceKey>,
  units: number,
): OrderInput {
  const priced = { ...order };
  if (!overridden.has("unit")) priced.totalAmount = Math.round(prices.unit * units);
  for (const extra of ORDER_EXTRAS) {
    if (overridden.has(extra.priceKey) || !extra.applies(order)) continue;
    priced[extra.cost] = Math.round(prices[extra.priceKey] * extra.quantity(order));
  }
  return priced;
}

/** Still owed once the deposit is taken off the full total. */
export function orderBalance(order: OrderInput | Order): number {
  return orderTotal(order) - order.deposit;
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  deposit: "Deposit paid",
  paid: "Paid in full",
  comp: "Free / comp",
  net40: "Net+40 days",
};

export const PRODUCTION_STATUS_LABEL: Record<ProductionStatus, string> = {
  /**
   * Quoted, not booked. It sits before Queue because that is the order
   * work actually happens in, and everything downstream — the Kanban
   * columns, the table's dropdown — takes its order from this object.
   */
  offer: "Offer",
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
