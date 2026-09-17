import type { Order, OrderInput, OrderMoney, Rates } from "./orderTypes";
import type { ContentPreset } from "./settings";

/**
 * Taking the money out of what a staff account is sent.
 *
 * **Not the same job as not drawing it.** A page's React Server Component
 * payload carries whatever the server handed the component, whether or not
 * anything renders it — so a total hidden with a class is a total still
 * sitting in the response, one View Source away. These functions run on the
 * server, before the data reaches the tree, so the figure is not there to
 * find.
 *
 * What is left behind is deliberately still *usable*: an order keeps its
 * units, its flavours, its stage and everything about the event, because
 * the order list is the page a staff account is here for. Only amounts go.
 *
 * Type-only imports, so this stays free of the database and can be read
 * from anywhere without dragging a driver with it.
 */

/**
 * One order with every amount removed.
 *
 * Two details are not obvious:
 *
 * `deliveryCost` keeps its **null-ness** and loses only its value.
 * `hasDelivery` is `deliveryCost !== null`, so blanking it to null would
 * tell the kitchen an order needs no delivery — a fact about the job, not
 * about the money, and the one thing on this list they most need to be
 * right.
 *
 * `paymentStatus` is a placeholder rather than a claim. Whether a customer
 * has paid is money, so it goes; the type has no "unknown", and nothing in
 * a staff account's tree draws it. It cannot come back the other way
 * either — a staff save takes every money column from the stored row, not
 * from the body (see `withStoredMoney`).
 */
export function redactOrder(order: Order): Order {
  return {
    ...order,
    totalAmount: 0,
    deliveryCost: order.deliveryCost === null ? null : 0,
    mirrorsCost: null,
    displayCost: null,
    waitressCost: null,
    kosherCost: null,
    discount: 0,
    discountIsPercent: false,
    deposit: 0,
    paymentStatus: "unpaid",
    packageLines: order.packageLines.map((line) => ({ ...line, packagePrice: null })),
  };
}

export const redactOrders = (orders: Order[]): Order[] => orders.map(redactOrder);

/**
 * The standard rates, with nothing left to price from.
 *
 * The lists themselves stay: a destination's *name* and a display type's
 * *name* are what an order says it needs, and dropping the rows would
 * leave the order form unable to name what is already on the order.
 */
export function redactRates(rates: Rates): Rates {
  return {
    prices: Object.fromEntries(Object.keys(rates.prices).map((key) => [key, 0])) as Rates["prices"],
    displayOptions: rates.displayOptions.map((option) => ({ ...option, price: 0 })),
    deliveryOptions: rates.deliveryOptions.map((option) => ({ ...option, price: 0 })),
  };
}

/** A preset keeps its recipe — the mix is kitchen work — and loses its price. */
export const redactPresets = (presets: ContentPreset[]): ContentPreset[] =>
  presets.map((preset) => ({ ...preset, price: null }));

/**
 * Every money column of a save, taken from the order as it stands rather
 * than from the body that arrived.
 *
 * This is what makes a staff account's edit safe to accept. The order form
 * sends the *whole* order, so a save from a tree that was never shown the
 * money would otherwise write the zeros it was given over the real figures
 * — the redaction above turning into data loss the moment somebody marked
 * an order delivered.
 *
 * Merging server-side rather than refusing the save is the difference
 * between a kitchen that can move an order along and one that cannot. It
 * is also the enforcement: nothing the client sends in these fields is
 * read at all, so there is no payload that reprices an order.
 */
export function withStoredMoney(input: OrderInput, stored: OrderMoney): OrderInput {
  return {
    ...input,
    totalAmount: stored.totalAmount,
    deliveryCost: stored.deliveryCost,
    deliveryOptionId: stored.deliveryOptionId,
    mirrorsCost: stored.mirrorsCost,
    displayCost: stored.displayCost,
    waitressCost: stored.waitressCost,
    kosherCost: stored.kosherCost,
    discount: stored.discount,
    discountIsPercent: stored.discountIsPercent,
    vatMode: stored.vatMode,
    vatRate: stored.vatRate,
    deposit: stored.deposit,
    paymentStatus: stored.paymentStatus,
    // A package line's price is copied from a preset when it is applied,
    // and a staff account has no preset prices to copy — so a line it adds
    // carries none and falls back to the tiers, which is the correct
    // answer rather than a zero that would price the jelly at nothing.
    packageLines: input.packageLines.map((line) => ({ ...line, packagePrice: line.packagePrice ?? null })),
  };
}

/** The money fields an inline table edit must never name on a staff account. */
export const MONEY_FIELDS = [
  "totalAmount",
  "deliveryCost",
  "mirrorsCost",
  "displayCost",
  "waitressCost",
  "kosherCost",
  "discount",
  "discountIsPercent",
  "deposit",
  "paymentStatus",
  "vatMode",
  "vatRate",
] as const;
