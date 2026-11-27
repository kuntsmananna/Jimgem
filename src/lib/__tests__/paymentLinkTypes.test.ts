import { describe, expect, it } from "vitest";
import { paymentMessage, suggestedAmount, whatsappNumber } from "../paymentLinkTypes";
import type { Order } from "../orderTypes";

const BASE = {
  key: "1", source: "db", date: "2026-12-04", customer: "Noa Levi", clientId: null, customerType: "", location: "", eventTime: null, deliveryTime: null,
  details: "", guests: null, mirrors: null, displays: [], waitresses: null, kosher: false, packageLines: [],
  totalAmount: 1235, deliveryCost: null, deliveryOptionId: null, mirrorsCost: null, displayCost: null,
  waitressCost: null, kosherCost: null, discount: 0, discountIsPercent: false, vatMode: "exempt", vatRate: 0,
  deposit: 0, paymentStatus: "unpaid", paymentMethodId: null, productionStatus: "queue", notes: "",
  needsReview: false, updatedAt: "", updatedBy: "",
} satisfies Order;
const order = (over: Partial<Order> = {}): Order => ({ ...BASE, ...over });

describe("suggestedAmount", () => {
  it("asks half as a deposit, in whole shekels", () => {
    expect(suggestedAmount(order(), "deposit")).toBe(618);
    expect(suggestedAmount(order(), "deposit", 30)).toBe(371);
  });

  it("asks what is still due as the balance, and the total as the whole order", () => {
    expect(suggestedAmount(order({ deposit: 600, paymentStatus: "deposit" }), "balance")).toBe(635);
    expect(suggestedAmount(order({ paymentStatus: "paid" }), "balance")).toBe(0);
    expect(suggestedAmount(order(), "full")).toBe(1235);
    expect(suggestedAmount(order(), "custom")).toBe(0);
  });

  it("asks the gross figure on an order with VAT added", () => {
    expect(suggestedAmount(order({ vatMode: "added", vatRate: 18, totalAmount: 1000 }), "full")).toBe(1180);
  });
});

describe("whatsappNumber", () => {
  it("writes an Israeli mobile with the country code", () => {
    expect(whatsappNumber("054-123 4567")).toBe("972541234567");
    expect(whatsappNumber("+972 54 123 4567")).toBe("972541234567");
    expect(whatsappNumber("00972541234567")).toBe("972541234567");
  });

  it("has nothing to dial for an empty or short number", () => {
    expect(whatsappNumber("")).toBeNull();
    expect(whatsappNumber("123")).toBeNull();
  });
});

describe("paymentMessage", () => {
  it("greets by first name and carries the link", () => {
    const text = paymentMessage({ customer: "Noa Levi", kind: "deposit", amount: 618, date: "4/12", url: "https://x/pay/abc" });
    expect(text).toContain("היי Noa");
    expect(text).toContain("מקדמה");
    expect(text).toContain("₪618");
    expect(text).toContain("https://x/pay/abc");
  });
});
