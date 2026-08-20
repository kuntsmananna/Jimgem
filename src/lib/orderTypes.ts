/**
 * Order types, labels, and pure helpers — split out from orders.ts so
 * client components can import them without pulling in orders.ts's
 * server-only dependencies (pg via db.ts, googleapis via googleSheets.ts).
 */


export type PaymentStatus = "unpaid" | "deposit" | "paid" | "comp" | "net40";
/**
 * A key into the owner's `production_stages` list, not a fixed set.
 *
 * It stays a bare string because the stages are editable: what a stage
 * *means* now lives on its row (`countsAsIncome`, `isFinal`) rather than
 * in a union the code can switch on.
 */
export type ProductionStatus = string;

/** One owner-managed production stage. Mirrors the `production_stages` row. */
export interface ProductionStage {
  id: number;
  /** Stored on every order. Fixed at creation, so renaming is free. */
  key: string;
  label: string;
  position: number;
  /**
   * False for a quote. Revenue, the Dashboard and the Biz Plan all skip
   * an order whose stage says this, so "an offer is not a sale" is a
   * property of the stage rather than a name the code tests for.
   */
  countsAsIncome: boolean;
  /** End of the line. The table's stage filter leaves these out by default. */
  isFinal: boolean;
  color: string;
  archivedAt: string | null;
}

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
  /**
   * A preset's price per package, copied when the preset was applied.
   *
   * Copied rather than looked up so repricing a preset cannot change an
   * order already booked — the same reason the recipe itself is copied
   * (see CLAUDE.md's note on content_presets). Null prices this line per
   * unit from the quantity tiers instead.
   */
  packagePrice?: number | null;
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
  /**
   * Legacy and unread: displays became a list (see `displays`), and
   * migration 012 folded every mirror count into an `order_displays` row.
   * Kept so that fold-in stays auditable.
   */
  mirrors: number | null;
  displays: OrderDisplay[];
  waitresses: number | null;
  kosher: boolean;
  packageLines: OrderPackageLine[];
  /**
   * What the jelly itself costs. The extras below are charged on top —
   * see `orderTotal`, which is what the order is actually worth.
   */
  totalAmount: number;
  deliveryCost: number | null;
  /** Which destination was picked, or null for a hand-typed amount. */
  deliveryOptionId: number | null;
  /** Legacy, like `mirrors` above — `displayCost` replaced it. */
  mirrorsCost: number | null;
  displayCost: number | null;
  waitressCost: number | null;
  kosherCost: number | null;
  /**
   * A discount off the whole order — a percentage of it when
   * `discountIsPercent`, shekels otherwise. Zero means none.
   *
   * Two fields rather than one resolved amount: "10% off" and "₪10 off"
   * are different promises, and keeping only the shekels would lose which
   * was agreed the moment anything else on the order changed.
   */
  discount: number;
  discountIsPercent: boolean;
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
  /**
   * Legacy and unread: displays became a list (see `displays`), and
   * migration 012 folded every mirror count into an `order_displays` row.
   * Kept so that fold-in stays auditable.
   */
  mirrors: number | null;
  displays: OrderDisplay[];
  waitresses: number | null;
  kosher: boolean;
  packageLines: OrderPackageLine[];
  totalAmount: number;
  deliveryCost: number | null;
  /** Which destination was picked, or null for a hand-typed amount. */
  deliveryOptionId: number | null;
  /** Legacy, like `mirrors` above — `displayCost` replaced it. */
  mirrorsCost: number | null;
  displayCost: number | null;
  waitressCost: number | null;
  kosherCost: number | null;
  /** See `Order.discount` — a percentage of the order, or shekels off it. */
  discount: number;
  discountIsPercent: boolean;
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

/**
 * Turns delivery on or off, and records which destination was picked.
 *
 * `optionId` null with delivery on is the hand-typed case: delivered, but
 * not to anywhere on the list, so the amount is whatever is entered.
 * Turning delivery off clears both — a destination on an order that is
 * not being delivered is a leftover, not a fact.
 */
export function withDelivery<T extends Pick<OrderInput, "deliveryCost" | "deliveryOptionId">>(
  order: T,
  on: boolean,
  optionId: number | null = null,
): T {
  if (!on) return { ...order, deliveryCost: null, deliveryOptionId: null };
  // Keeps a price already agreed, and opens at zero rather than guessing.
  return { ...order, deliveryCost: order.deliveryCost ?? 0, deliveryOptionId: optionId };
}

export const ORDER_EXTRAS = [
  {
    // Gated on the cost being set at all rather than on a separate flag:
    // null is "no delivery", and 0 is "we deliver, no charge" — a real
    // case and a different answer.
    id: "delivery",
    label: "Delivery",
    cost: "deliveryCost",
    priceKey: "delivery",
    // Flat: an order is delivered or it isn't, so there is nothing to
    // multiply the rate by.
    per: "flat",
    applies: (order: OrderInput) => hasDelivery(order),
    // The chosen destination's price when there is one, and the flat rate
    // when delivery is on without a destination — which is the case a
    // hand-typed amount starts from.
    standard: (order: OrderInput, rates: Rates) =>
      rates.deliveryOptions.find((option) => option.id === order.deliveryOptionId)?.price ??
      rates.prices.delivery,
  },
  {
    id: "display",
    label: "Display",
    cost: "displayCost",
    // No flat rate of its own: each display option carries a price, and an
    // order can hold several at once. This is why `standard` exists rather
    // than a `priceKey` every extra multiplies — see `Rates`.
    priceKey: null,
    per: "per item",
    applies: (order: OrderInput) => displayCount(order.displays) > 0,
    standard: (order: OrderInput, rates: Rates) => {
      const priceById = new Map(rates.displayOptions.map((o) => [o.id, o.price]));
      return order.displays.reduce(
        (sum, entry) => sum + (priceById.get(entry.optionId) ?? 0) * entry.quantity,
        0,
      );
    },
  },
  {
    id: "waitress",
    label: "Waitressing",
    cost: "waitressCost",
    priceKey: "waitress",
    per: "per waitress",
    applies: (order: OrderInput) => (order.waitresses ?? 0) > 0,
    standard: (order: OrderInput, rates: Rates) => rates.prices.waitress * (order.waitresses ?? 0),
  },
  {
    id: "kosher",
    label: "Kosher",
    cost: "kosherCost",
    priceKey: "kosher",
    per: "flat",
    applies: (order: OrderInput) => order.kosher,
    standard: (order: OrderInput, rates: Rates) => rates.prices.kosher,
  },
] as const satisfies readonly {
  id: string;
  label: string;
  cost: keyof OrderInput;
  /** Null when the extra prices itself from a list rather than a flat rate. */
  priceKey: PriceKey | null;
  per: string;
  applies: (order: OrderInput) => boolean;
  standard: (order: OrderInput, rates: Rates) => number;
}[];

/** How many display items an order carries in total, across its options. */
export function displayCount(displays: OrderDisplay[]): number {
  return displays.reduce((sum, entry) => sum + entry.quantity, 0);
}

/**
 * The owner's standard rates, kept in the `prices` table and edited in
 * Settings → Lists.
 *
 * A fixed set of keys rather than a list the owner adds to: each one is
 * wired to a specific field on the order, so a sixth key would have
 * nothing to price. `unit` is the odd one out — it multiplies the units
 * the Content tab packs rather than a count on the Details tab.
 */
export type PriceKey = UnitTierKey | "delivery" | "waitress" | "kosher";

export type Prices = Record<PriceKey, number>;

/** Prices nothing. What a database with no `prices` rows would mean. */
export const ZERO_PRICES: Prices = {
  unit_100: 0,
  unit_200: 0,
  unit_500: 0,
  unit_max: 0,
  delivery: 0,
  waitress: 0,
  kosher: 0,
};

/**
 * A named thing with a price, from one of the owner's lists.
 *
 * Displays and delivery destinations are different things that happen to
 * be recorded the same way, so they share the shape — and with it the
 * Settings pane and the CRUD in settings.ts. The aliases below are what
 * make a call site say which list it means.
 */
export interface PricedOption {
  id: number;
  name: string;
  price: number;
  position: number;
  archivedAt: string | null;
}

/** One thing an order can be displayed on. An order can carry several. */
export type DisplayOption = PricedOption;

/** Where an order is delivered to. An order picks at most one. */
export type DeliveryOption = PricedOption;

/** How many of one display option an order carries. */
export interface OrderDisplay {
  optionId: number;
  quantity: number;
}

/**
 * Everything the standard rates are made of.
 *
 * Bundled rather than passed as two arguments because they travel
 * together — every caller that prices an order needs both, and the next
 * priced thing should be able to join without changing five signatures.
 */
export interface Rates {
  prices: Prices;
  displayOptions: DisplayOption[];
  deliveryOptions: DeliveryOption[];
}

export type UnitTierKey = "unit_100" | "unit_200" | "unit_500" | "unit_max";

/**
 * What a unit of jelly costs, by how many the order is for.
 *
 * Ordered smallest first and matched on the first tier the order fits in,
 * so the boundaries read the way they are written: 100 units is priced at
 * the "up to 100" rate, 101 at the next one up.
 *
 * Only lines with no price of their own use these — a line copied from a
 * preset carries the preset's package price instead (see `jellyTotal`).
 */
export const UNIT_TIERS = [
  { key: "unit_100", label: "Up to 100", upTo: 100 },
  { key: "unit_200", label: "101 – 200", upTo: 200 },
  { key: "unit_500", label: "201 – 500", upTo: 500 },
  { key: "unit_max", label: "501 and up", upTo: Number.POSITIVE_INFINITY },
] as const satisfies readonly { key: UnitTierKey; label: string; upTo: number }[];

export function unitTierFor(units: number): UnitTierKey {
  return (UNIT_TIERS.find((tier) => units <= tier.upTo) ?? UNIT_TIERS[UNIT_TIERS.length - 1]).key;
}

/**
 * The add-on rates, for Settings' "Add-on prices" pane and the hint beside
 * an auto-filled amount. Derived from ORDER_EXTRAS so declaring an extra
 * there gives it a rate here.
 *
 * Jelly is not in this list: it is priced by quantity tier, which is its
 * own pane (see `UNIT_TIERS`).
 */
export const PRICE_FIELDS: { key: PriceKey; label: string; per: string }[] = ORDER_EXTRAS.flatMap(
  (extra) =>
    extra.priceKey === null ? [] : [{ key: extra.priceKey, label: extra.label, per: extra.per }],
);

/**
 * The jelly plus every extra that applies, before any discount.
 *
 * An extra is only counted when the thing itself is on the order, so
 * clearing the display count also drops its price rather than leaving a
 * charge for something no longer being supplied.
 */
export function orderSubtotal(order: OrderInput | Order): number {
  return ORDER_EXTRAS.reduce(
    (sum, extra) => sum + (extra.applies(order) ? (order[extra.cost] ?? 0) : 0),
    order.totalAmount,
  );
}

/**
 * What the discount comes to in shekels.
 *
 * A percentage is taken off the *whole* order rather than off the jelly
 * alone — that is what "10% off" means when it is offered to a customer.
 * Rounded here so the figure shown and the figure billed are the same
 * number.
 */
export function orderDiscount(order: OrderInput | Order): number {
  if (!order.discount) return 0;
  const off = order.discountIsPercent
    ? (orderSubtotal(order) * order.discount) / 100
    : order.discount;
  // Never more than the order is worth: a discount bigger than the total
  // is a typo, and paying the customer back is not what was meant.
  return Math.min(Math.round(off), orderSubtotal(order));
}

/**
 * What the order is worth, discount applied.
 *
 * Every figure downstream — the Kanban card, the hover card, the summary
 * rail's income, the Biz Plan's revenue — goes through this rather than
 * adding the parts up itself, so a discount cannot be respected in one
 * place and forgotten in another.
 */
export function orderTotal(order: OrderInput | Order): number {
  return orderSubtotal(order) - orderDiscount(order);
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
  rates: Rates,
  overridden: ReadonlySet<AmountKey>,
  jelly: number,
): OrderInput {
  const priced = { ...order };
  if (!overridden.has("jelly")) priced.totalAmount = jelly;
  for (const extra of ORDER_EXTRAS) {
    if (overridden.has(extra.id) || !extra.applies(order)) continue;
    priced[extra.cost] = Math.round(extra.standard(order, rates));
  }
  return priced;
}

/**
 * Does this order count as money the business has made?
 *
 * Answered by the order's *stage*, not by its name: a quote has a price on
 * it but nobody has agreed to pay it, and which stages mean that is the
 * owner's call now. Stated here rather than at each call site so the
 * Orders rail, the Dashboard and the Biz Plan cannot drift on what a sale
 * is.
 *
 * An unknown stage counts. A stage key with no row is a data problem, and
 * quietly dropping the order's money would hide it.
 */
export function isBooked(
  order: Pick<Order, "productionStatus">,
  stages: Map<string, ProductionStage>,
): boolean {
  return stages.get(order.productionStatus)?.countsAsIncome ?? true;
}

/** `key → stage`, for the lookups above. */
export function stageMap(stages: ProductionStage[]): Map<string, ProductionStage> {
  return new Map(stages.map((stage) => [stage.key, stage]));
}

/**
 * What the jelly on an order comes to.
 *
 * A line copied from a preset carries that preset's price per package and
 * is billed at `price × quantity`, whatever it holds. Every other line is
 * billed per unit at the tier the **whole order** falls into, so a
 * customer buying 600 units across three trays gets the 500-and-up rate
 * on all of them rather than three separate small-order rates.
 */
export function jellyTotal(
  lines: OrderPackageLine[],
  unitsPerPackage: Map<number, number>,
  prices: Prices,
): number {
  const unitRate = prices[unitTierFor(orderUnits(lines, unitsPerPackage))];
  return Math.round(
    lines.reduce(
      (sum, line) =>
        sum +
        (line.packagePrice !== null && line.packagePrice !== undefined
          ? line.packagePrice * line.quantity
          : unitRate * linePackedUnits(line, unitsPerPackage)),
      0,
    ),
  );
}

/**
 * What can be typed over on the money side: the jelly amount, or one of
 * the extras by id.
 *
 * Keyed by the *amount* rather than by a rate key, because the two do not
 * line up — jelly has four rates and one amount, and Display has a whole
 * list of rates behind one amount.
 */
export type AmountKey = "jelly" | (typeof ORDER_EXTRAS)[number]["id"];

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
