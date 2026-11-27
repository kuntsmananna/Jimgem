/**
 * Events — markets, fairs and pop-ups where ready-made boxes are sold on
 * the spot (v0.100 event register). The client-safe half, beside
 * `events.ts`, the way `orderTypes.ts` sits beside `orders.ts`: the
 * shapes, and the deal arithmetic the register, the customer's basket and
 * the server all have to agree on.
 */

export const PAY_MODES = ["staff", "self", "both"] as const;
export type PayMode = (typeof PAY_MODES)[number];

export const QR_MODES = ["product", "stall"] as const;
export type QrMode = (typeof QR_MODES)[number];

export const EVENT_STATUSES = ["draft", "ready"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/**
 * The four kinds of deal:
 *   bundle  — `minQty` boxes for `price` ("3 for ₪100"), repeating
 *   percent — `percent` off the eligible boxes once there are `minQty`
 *   free    — buy `minQty`, the next one is free ("4 + 1"), the cheapest free
 *   price   — a fixed `price` per box for the products it names
 */
export const DEAL_KINDS = ["bundle", "percent", "free", "price"] as const;
export type DealKind = (typeof DEAL_KINDS)[number];

export interface EventProduct {
  /** A content preset — a package with its mix of flavours already fixed. */
  presetId: number;
  /** This event's price for one box, copied in, never linked. */
  price: number;
  /** Boxes brought, when stock is counted; null when not. */
  brought: number | null;
}

export interface EventDeal {
  kind: DealKind;
  minQty: number;
  price: number | null;
  percent: number | null;
  /** The products it applies to; empty means every product on the table. */
  presetIds: number[];
}

export interface EventInput {
  name: string;
  /** "YYYY-MM-DD". */
  date: string;
  /** "HH:MM" or null. */
  startsAt: string | null;
  endsAt: string | null;
  location: string;
  payMode: PayMode;
  qrMode: QrMode;
  countStock: boolean;
  sellerIds: number[];
  status: EventStatus;
  notes: string;
  products: EventProduct[];
  deals: EventDeal[];
}

export interface SaleEvent extends EventInput {
  id: number;
  updatedAt: string;
  updatedBy: string;
}

/** A blank event for the New event screen. */
export function emptyEvent(date: string): EventInput {
  return {
    name: "",
    date,
    startsAt: null,
    endsAt: null,
    location: "",
    payMode: "both",
    qrMode: "product",
    countStock: true,
    sellerIds: [],
    status: "draft",
    notes: "",
    products: [],
    deals: [],
  };
}

/** One kind of box in a basket. */
export interface BasketLine {
  presetId: number;
  qty: number;
  /** The event's price for one. */
  unitPrice: number;
}

export interface BasketPrice {
  subtotal: number;
  discount: number;
  total: number;
  /** Which deal gave the discount, or null when none applied. */
  deal: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The price of every box a deal could touch, one entry per box. */
function eligibleBoxes(lines: BasketLine[], deal: EventDeal): number[] {
  const out: number[] = [];
  for (const line of lines) {
    if (deal.presetIds.length > 0 && !deal.presetIds.includes(line.presetId)) continue;
    for (let i = 0; i < line.qty; i++) out.push(line.unitPrice);
  }
  return out;
}

/** What one deal takes off this basket — never below zero. */
export function dealSaving(lines: BasketLine[], deal: EventDeal): number {
  const boxes = eligibleBoxes(lines, deal);
  const min = Math.max(1, deal.minQty);
  switch (deal.kind) {
    case "bundle": {
      if (deal.price === null) return 0;
      // The dearest boxes go into the bundles: that is the customer's best.
      const sorted = [...boxes].sort((a, b) => b - a);
      const groups = Math.floor(sorted.length / min);
      const covered = sorted.slice(0, groups * min).reduce((a, b) => a + b, 0);
      return Math.max(0, round2(covered - groups * deal.price));
    }
    case "percent": {
      if (deal.percent === null || boxes.length < min) return 0;
      return round2((boxes.reduce((a, b) => a + b, 0) * deal.percent) / 100);
    }
    case "free": {
      // Every (min + 1)th box is free, and the free ones are the cheapest.
      const sorted = [...boxes].sort((a, b) => a - b);
      const free = Math.floor(sorted.length / (min + 1));
      return round2(sorted.slice(0, free).reduce((a, b) => a + b, 0));
    }
    case "price": {
      if (deal.price === null) return 0;
      const price = deal.price;
      return round2(boxes.reduce((sum, unit) => sum + Math.max(0, unit - price), 0));
    }
  }
}

/**
 * A basket's price: the subtotal, then the **one** deal that saves the
 * customer most — never two at once, the owner's rule, so deals never
 * stack into a price nobody meant to offer.
 */
export function priceBasket(lines: BasketLine[], deals: EventDeal[]): BasketPrice {
  const subtotal = round2(lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0));
  let best = 0;
  let deal: number | null = null;
  deals.forEach((d, index) => {
    const saving = Math.min(subtotal, dealSaving(lines, d));
    if (saving > best) {
      best = saving;
      deal = index;
    }
  });
  return { subtotal, discount: best, total: round2(subtotal - best), deal };
}

/** A deal in a few words, for lists and the register — "3 for ₪100". */
export function dealLabel(deal: EventDeal): string {
  const shekels = (n: number | null) => `₪${(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  switch (deal.kind) {
    case "bundle":
      return `${deal.minQty} for ${shekels(deal.price)}`;
    case "percent":
      return `${deal.percent ?? 0}% off from ${deal.minQty}`;
    case "free":
      return `Buy ${deal.minQty}, get 1 free`;
    case "price":
      return `Special price ${shekels(deal.price)}`;
  }
}
