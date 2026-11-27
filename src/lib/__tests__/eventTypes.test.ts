import { describe, expect, it } from "vitest";
import { dealSaving, priceBasket, type BasketLine, type EventDeal } from "../eventTypes";
import { parseEventInput } from "../validate";

const mix = (qty: number): BasketLine => ({ presetId: 1, qty, unitPrice: 39 });
const lychee = (qty: number): BasketLine => ({ presetId: 2, qty, unitPrice: 42 });
const party = (qty: number): BasketLine => ({ presetId: 3, qty, unitPrice: 120 });
const deal = (over: Partial<EventDeal>): EventDeal => ({ kind: "bundle", minQty: 3, price: 100, percent: null, presetIds: [], ...over });

describe("dealSaving", () => {
  it("puts the dearest boxes into a bundle and repeats it", () => {
    expect(dealSaving([mix(2), lychee(1)], deal({}))).toBe(20); // 39+39+42 = 120 → 100
    expect(dealSaving([mix(6)], deal({}))).toBe(34); // two bundles
    expect(dealSaving([mix(2)], deal({}))).toBe(0);
  });

  it("only counts the products a deal names", () => {
    expect(dealSaving([mix(2), party(1)], deal({ presetIds: [1, 2] }))).toBe(0);
  });

  it("takes a percent once there are enough boxes", () => {
    expect(dealSaving([mix(5)], deal({ kind: "percent", minQty: 5, percent: 10, price: null }))).toBe(19.5);
    expect(dealSaving([mix(4)], deal({ kind: "percent", minQty: 5, percent: 10, price: null }))).toBe(0);
  });

  it("gives the cheapest box free for every minQty + 1", () => {
    expect(dealSaving([mix(4), lychee(1)], deal({ kind: "free", minQty: 4, price: null }))).toBe(39);
    expect(dealSaving([mix(3)], deal({ kind: "free", minQty: 4, price: null }))).toBe(0);
  });

  it("charges a special price per named box", () => {
    expect(dealSaving([lychee(2), mix(1)], deal({ kind: "price", price: 35, presetIds: [2] }))).toBe(14);
  });
});

describe("priceBasket", () => {
  it("applies the one deal that saves most, never two", () => {
    const deals = [deal({}), deal({ kind: "percent", minQty: 5, percent: 10, price: null })];
    expect(priceBasket([mix(5)], deals)).toEqual({ subtotal: 195, discount: 19.5, total: 175.5, deal: 1 });
    expect(priceBasket([mix(3)], deals)).toEqual({ subtotal: 117, discount: 17, total: 100, deal: 0 });
    expect(priceBasket([mix(1)], deals)).toEqual({ subtotal: 39, discount: 0, total: 39, deal: null });
  });
});

describe("parseEventInput", () => {
  const base = {
    name: "Market", date: "2026-12-04", startsAt: "16:00", endsAt: null, location: "", payMode: "both", qrMode: "product",
    countStock: true, sellerIds: [2], status: "draft", notes: "",
    products: [{ presetId: 1, price: 39, brought: 40 }], deals: [{ kind: "bundle", minQty: 3, price: 100, percent: null, presetIds: [1] }],
  };

  it("accepts what the form sends", () => {
    const parsed = parseEventInput(base);
    expect(parsed.ok).toBe(true);
  });

  it("refuses a product listed twice, a bundle with no price, and a nameless event", () => {
    expect(parseEventInput({ ...base, products: [base.products[0], base.products[0]] }).ok).toBe(false);
    expect(parseEventInput({ ...base, deals: [{ kind: "bundle", minQty: 3, price: null, presetIds: [] }] }).ok).toBe(false);
    expect(parseEventInput({ ...base, name: "  " }).ok).toBe(false);
  });
});
