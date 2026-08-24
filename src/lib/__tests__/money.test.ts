import { describe, expect, it } from "vitest";
import {
  jellyTotal,
  orderBalance,
  orderDiscount,
  orderNet,
  orderSubtotal,
  orderTotal,
  orderUnits,
  orderVat,
  repriceOrder,
  unitTierFor,
  vatOn,
  ZERO_PRICES,
  type OrderInput,
  type OrderPackageLine,
  type Prices,
  type Rates,
} from "../orderTypes";

/*
 * Why these and not the components around them.
 *
 * Everything here is arithmetic on an order, and a mistake in it does not
 * announce itself: the screen still shows a plausible figure, the report
 * still adds up, and the error is found — if at all — weeks later in the
 * bank. That is the bug class worth pinning down, and it is exactly the
 * part that needs no database and no browser to test.
 */

const PRICES: Prices = { ...ZERO_PRICES, unit_100: 10, unit_200: 9, unit_500: 8, unit_max: 7, waitress: 300, kosher: 500, vat_rate: 18 };
const option = (id: number, name: string, price: number) => ({ id, name, price, position: 0, archivedAt: null });
const RATES: Rates = {
  prices: PRICES,
  displayOptions: [option(1, "Mirror", 150)],
  deliveryOptions: [option(7, "Tel Aviv", 120)],
};

/** An order with nothing on it, for a test to change one thing about. */
function anOrder(over: Partial<OrderInput> = {}): OrderInput {
  return {
    date: "2026-08-01",
    customer: "Dana",
    clientId: null,
    customerType: "",
    location: "",
    guests: null,
    mirrors: null,
    displays: [],
    waitresses: null,
    kosher: false,
    packageLines: [],
    totalAmount: 1000,
    deliveryCost: null,
    deliveryOptionId: null,
    mirrorsCost: null,
    displayCost: null,
    waitressCost: null,
    kosherCost: null,
    discount: 0,
    discountIsPercent: false,
    vatMode: "exempt",
    vatRate: 18,
    deposit: 0,
    paymentStatus: "unpaid",
    productionStatus: "queued",
    notes: "",
    ...over,
  };
}

const line = (over: Partial<OrderPackageLine> = {}): OrderPackageLine => ({
  // Package type ids are strings on a line and numbers in the size map —
  // see `linePackedUnits`, which bridges them.
  packageTypeId: "1",
  quantity: 1,
  packagePrice: null,
  flavors: [],
  ...over,
});

describe("vatOn", () => {
  it("takes VAT out of a price that already includes it", () => {
    // The documented real case: a document reporting ₪1,000 carries lines
    // of ₪847 and VAT of ₪153.
    expect(vatOn(1000, "included", 18)).toEqual({ net: 847, vat: 153, gross: 1000 });
  });

  it("adds VAT on top of a price quoted before it", () => {
    expect(vatOn(1000, "added", 18)).toEqual({ net: 1000, vat: 180, gross: 1180 });
  });

  it("leaves an exempt amount alone", () => {
    expect(vatOn(1000, "exempt", 18)).toEqual({ net: 1000, vat: 0, gross: 1000 });
  });

  it("always has the three figures add up", () => {
    // Rounding is where this goes wrong, so try every rate against an
    // amount that does not divide cleanly.
    for (const amount of [1, 7, 99, 333, 1234, 98765]) {
      for (const mode of ["included", "added", "exempt"] as const) {
        const { net, vat, gross } = vatOn(amount, mode, 18);
        expect(net + vat).toBe(gross);
      }
    }
  });

  it("treats a zero rate as exempt rather than dividing by one and hoping", () => {
    expect(vatOn(1000, "included", 0)).toEqual({ net: 1000, vat: 0, gross: 1000 });
  });
});

describe("orderSubtotal", () => {
  it("adds only the extras the order actually has", () => {
    // Costs are set for all four, but only kosher applies.
    const order = anOrder({
      kosher: true,
      kosherCost: 500,
      waitressCost: 300,
      displayCost: 150,
      deliveryCost: null,
    });
    expect(orderSubtotal(order)).toBe(1500);
  });

  it("counts delivery at zero as delivery, and null as none", () => {
    expect(orderSubtotal(anOrder({ deliveryCost: 0 }))).toBe(1000);
    expect(orderSubtotal(anOrder({ deliveryCost: 120 }))).toBe(1120);
    expect(orderSubtotal(anOrder({ deliveryCost: null }))).toBe(1000);
  });
});

describe("orderDiscount", () => {
  it("takes a percentage off the whole order, extras included", () => {
    const order = anOrder({ kosher: true, kosherCost: 500, discount: 10, discountIsPercent: true });
    expect(orderDiscount(order)).toBe(150);
  });

  it("takes shekels off as shekels", () => {
    expect(orderDiscount(anOrder({ discount: 150, discountIsPercent: false }))).toBe(150);
  });

  it("never gives more back than the order is worth", () => {
    expect(orderDiscount(anOrder({ discount: 5000, discountIsPercent: false }))).toBe(1000);
    expect(orderDiscount(anOrder({ discount: 200, discountIsPercent: true }))).toBe(1000);
  });
});

describe("orderTotal and orderNet", () => {
  it("charges the customer the discounted figure", () => {
    const order = anOrder({ discount: 10, discountIsPercent: true, vatMode: "exempt" });
    expect(orderTotal(order)).toBe(900);
  });

  it("earns less than it charges once VAT is inside the price", () => {
    const order = anOrder({ vatMode: "included", vatRate: 18 });
    expect(orderTotal(order)).toBe(1000);
    expect(orderNet(order)).toBe(847);
    expect(orderVat(order)).toBe(153);
  });

  it("charges more than it earns when VAT is added on top", () => {
    const order = anOrder({ vatMode: "added", vatRate: 18 });
    expect(orderTotal(order)).toBe(1180);
    expect(orderNet(order)).toBe(1000);
  });

  it("earns exactly what it charges on an exempt order", () => {
    const order = anOrder({ vatMode: "exempt" });
    expect(orderNet(order)).toBe(orderTotal(order));
  });

  it("applies the discount before VAT, not after", () => {
    const order = anOrder({ vatMode: "added", vatRate: 18, discount: 10, discountIsPercent: true });
    // 1000 − 10% = 900, then 18% on top.
    expect(orderTotal(order)).toBe(1062);
  });

  it("leaves the balance as the total less the deposit", () => {
    const order = anOrder({ vatMode: "exempt", deposit: 400 });
    expect(orderBalance(order)).toBe(600);
  });
});

describe("unit tiers", () => {
  it("puts each quantity in its own band", () => {
    expect(unitTierFor(1)).toBe("unit_100");
    expect(unitTierFor(100)).toBe("unit_100");
    expect(unitTierFor(101)).toBe("unit_200");
    expect(unitTierFor(200)).toBe("unit_200");
    expect(unitTierFor(201)).toBe("unit_500");
    expect(unitTierFor(500)).toBe("unit_500");
    expect(unitTierFor(501)).toBe("unit_max");
    expect(unitTierFor(10_000)).toBe("unit_max");
  });
});

describe("jellyTotal", () => {
  const perPackage = new Map([[1, 9], [2, 100]]);

  it("prices the whole order at one tier, not each line at its own", () => {
    // 600 units across two lines: every unit takes the 500-and-up rate.
    const lines = [line({ packageTypeId: "2", quantity: 5 }), line({ packageTypeId: "2", quantity: 1 })];
    expect(orderUnits(lines, perPackage)).toBe(600);
    expect(jellyTotal(lines, perPackage, PRICES)).toBe(600 * 7);
  });

  it("bills a preset line at its copied price, however much it holds", () => {
    const lines = [line({ packageTypeId: "1", quantity: 3, packagePrice: 250 })];
    expect(jellyTotal(lines, perPackage, PRICES)).toBe(750);
  });

  it("mixes a priced line and a per-unit line without either infecting the other", () => {
    const lines = [
      line({ packageTypeId: "1", quantity: 2, packagePrice: 250 }),
      line({ packageTypeId: "1", quantity: 2 }),
    ];
    // 36 units in total, so the per-unit line takes the up-to-100 rate.
    expect(jellyTotal(lines, perPackage, PRICES)).toBe(500 + 18 * 10);
  });
});

describe("repriceOrder", () => {
  const noneOverridden = new Set<never>();

  it("fills in every amount from the rates", () => {
    const order = anOrder({
      waitresses: 2,
      kosher: true,
      displays: [{ optionId: 1, quantity: 2 }],
      deliveryOptionId: 7,
      deliveryCost: 0,
    });
    const priced = repriceOrder(order, RATES, noneOverridden, 4000);
    expect(priced.totalAmount).toBe(4000);
    expect(priced.waitressCost).toBe(600);
    expect(priced.kosherCost).toBe(500);
    expect(priced.displayCost).toBe(300);
    expect(priced.deliveryCost).toBe(120);
  });

  it("leaves an agreed price alone", () => {
    const order = anOrder({ waitresses: 2, waitressCost: 450 });
    const priced = repriceOrder(order, RATES, new Set(["waitress"] as const), 4000);
    expect(priced.waitressCost).toBe(450);
  });

  it("does not price an extra the order does not have", () => {
    // Kosher was priced once and then turned off: the figure stays put
    // rather than being zeroed, and orderSubtotal is what leaves it out.
    const order = anOrder({ kosher: false, kosherCost: 500 });
    const priced = repriceOrder(order, RATES, noneOverridden, 1000);
    expect(priced.kosherCost).toBe(500);
    expect(orderSubtotal(priced)).toBe(1000);
  });
});
