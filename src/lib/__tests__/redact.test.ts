import { describe, expect, it } from "vitest";
import { redactOrder, redactPresets, redactRates, withStoredMoney } from "../redact";
import { hasDelivery, orderTotal, ZERO_PRICES, type Order, type OrderInput, type Rates } from "../orderTypes";

/*
 * Why these are worth a test.
 *
 * Redaction is a **negative** property — the interesting thing is what is
 * *not* there — and nothing on screen reports it. A money column added to
 * `Order` next month and forgotten here leaks in silence: the page looks
 * identical, and the figure sits in the payload where nobody thinks to
 * look. So the check is not "the fields I remembered are zero", it is a
 * sweep of every number on the order.
 *
 * `withStoredMoney` is the other side of the same coin. Get it wrong and a
 * staff account marking an order delivered writes the zeros it was shown
 * over the real figures — a redaction that turns into data loss.
 */

const ORDER: Order = {
  key: "1",
  source: "db",
  date: "2026-08-14",
  customer: "Noa",
  clientId: 3,
  customerType: "Wedding",
  location: "Tel Aviv",
  details: "",
  guests: 120,
  mirrors: 2,
  displays: [{ optionId: 1, quantity: 2 }],
  waitresses: 1,
  kosher: true,
  packageLines: [
    { packageTypeId: "1", quantity: 2, flavors: [{ flavorId: "1", units: 18 }], packagePrice: 320 },
  ],
  totalAmount: 5400,
  deliveryCost: 250,
  deliveryOptionId: 4,
  mirrorsCost: 200,
  displayCost: 300,
  waitressCost: 400,
  kosherCost: 150,
  discount: 10,
  discountIsPercent: true,
  vatMode: "included",
  vatRate: 18,
  deposit: 1000,
  paymentStatus: "deposit",
  productionStatus: "queue",
  notes: "no nuts",
  needsReview: false,
  updatedAt: "2026-08-01T10:00:00.000Z",
  updatedBy: "Anna",
};

/** Every money-ish key on an order, as one list this test owns. */
const AMOUNTS = [
  "totalAmount",
  "mirrorsCost",
  "displayCost",
  "waitressCost",
  "kosherCost",
  "discount",
  "deposit",
] as const;

describe("redactOrder", () => {
  const redacted = redactOrder(ORDER);

  it("leaves no amount behind", () => {
    // Zero or null — the nullable cost columns are blanked rather than
    // zeroed, and both say the same thing. What matters is that no key
    // carries a figure.
    for (const key of AMOUNTS) expect(redacted[key] ?? 0, key).toBe(0);
    expect(redacted.packageLines[0].packagePrice).toBeNull();
  });

  it("is worth nothing, by the app's own arithmetic", () => {
    // The strongest single assertion here: whatever `orderTotal` adds up
    // — jelly, extras, discount — comes to zero, so a money field this
    // test forgot would still have to survive that sum to leak.
    expect(orderTotal(redacted)).toBe(0);
  });

  it("keeps whether the order needs delivering", () => {
    // `hasDelivery` is `deliveryCost !== null`, so blanking it to null
    // would tell the kitchen an order needs no delivery. That is a fact
    // about the job, not about the money.
    expect(hasDelivery(redacted)).toBe(true);
    expect(redacted.deliveryCost).toBe(0);
    expect(hasDelivery(redactOrder({ ...ORDER, deliveryCost: null }))).toBe(false);
  });

  it("keeps everything the order list is read for", () => {
    expect(redacted.customer).toBe("Noa");
    expect(redacted.date).toBe(ORDER.date);
    expect(redacted.location).toBe(ORDER.location);
    expect(redacted.productionStatus).toBe("queue");
    expect(redacted.guests).toBe(120);
    expect(redacted.kosher).toBe(true);
    expect(redacted.waitresses).toBe(1);
    expect(redacted.displays).toEqual(ORDER.displays);
    expect(redacted.notes).toBe("no nuts");
    // The flavour split is kitchen work and survives whole.
    expect(redacted.packageLines[0].flavors).toEqual(ORDER.packageLines[0].flavors);
    expect(redacted.packageLines[0].quantity).toBe(2);
  });

  it("does not mutate the order it was given", () => {
    expect(ORDER.totalAmount).toBe(5400);
    expect(ORDER.packageLines[0].packagePrice).toBe(320);
  });
});

describe("redactRates", () => {
  const rates: Rates = {
    prices: { ...ZERO_PRICES, waitress: 400, kosher: 150, unit_100: 12 },
    displayOptions: [{ id: 1, name: "Mirror", price: 150, position: 0, archivedAt: null }],
    deliveryOptions: [{ id: 4, name: "Tel Aviv", price: 250, position: 0, archivedAt: null }],
  };
  const redacted = redactRates(rates);

  it("prices nothing", () => {
    for (const value of Object.values(redacted.prices)) expect(value).toBe(0);
    expect(redacted.displayOptions[0].price).toBe(0);
    expect(redacted.deliveryOptions[0].price).toBe(0);
  });

  it("keeps the lists themselves", () => {
    // A destination's name is what an order says it needs; dropping the
    // rows would leave the form unable to name what is already on it.
    expect(redacted.deliveryOptions[0].name).toBe("Tel Aviv");
    expect(redacted.displayOptions[0].name).toBe("Mirror");
  });
});

describe("redactPresets", () => {
  it("keeps the recipe and drops the price", () => {
    const [preset] = redactPresets([
      { id: 1, name: "Mix small", packageTypeId: 1, flavors: [{ flavorId: 2, share: 1 }], price: 320 },
    ]);
    expect(preset.price).toBeNull();
    expect(preset.flavors).toEqual([{ flavorId: 2, share: 1 }]);
  });
});

describe("withStoredMoney", () => {
  /** What a staff account's form sends back: the order, with zeros for money. */
  const sent: OrderInput = { ...redactOrder(ORDER), productionStatus: "delivered" };
  const merged = withStoredMoney(sent, ORDER);

  it("puts every stored amount back", () => {
    for (const key of AMOUNTS) expect(merged[key], key).toBe(ORDER[key]);
    expect(merged.deliveryCost).toBe(250);
    expect(merged.deliveryOptionId).toBe(4);
    expect(merged.discountIsPercent).toBe(true);
    expect(merged.vatMode).toBe("included");
    expect(merged.vatRate).toBe(18);
    expect(merged.paymentStatus).toBe("deposit");
  });

  it("is worth exactly what it was worth before the round trip", () => {
    expect(orderTotal(merged)).toBe(orderTotal(ORDER));
  });

  it("keeps the change that was actually being made", () => {
    expect(merged.productionStatus).toBe("delivered");
  });

  it("leaves a new line priced from the tiers rather than at zero", () => {
    const withNewLine: OrderInput = {
      ...sent,
      packageLines: [{ packageTypeId: "1", quantity: 1, flavors: [], packagePrice: null }],
    };
    expect(withStoredMoney(withNewLine, ORDER).packageLines[0].packagePrice).toBeNull();
  });
});
