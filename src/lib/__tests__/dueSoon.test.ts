import { describe, expect, it } from "vitest";
import { dueSoon } from "../dueSoon";
import type { Order, ProductionStage } from "../orderTypes";

const BASE = {
  key: "1", source: "db", date: "2026-10-30", customer: "Noa", clientId: null, customerType: "", location: "",
  details: "", guests: null, mirrors: null, displays: [], waitresses: null, kosher: false, packageLines: [],
  totalAmount: 1000, deliveryCost: null, deliveryOptionId: null, mirrorsCost: null, displayCost: null,
  waitressCost: null, kosherCost: null, discount: 0, discountIsPercent: false, vatMode: "exempt", vatRate: 0,
  deposit: 0, paymentStatus: "unpaid", paymentMethodId: null, productionStatus: "queue", notes: "",
  needsReview: false, updatedAt: "", updatedBy: "",
} satisfies Order;
const order = (over: Partial<Order>): Order => ({ ...BASE, ...over });
const stage = (key: string, over: Partial<ProductionStage> = {}): ProductionStage => ({
  id: 1, key, label: key, position: 0, countsAsIncome: true, isFinal: false, color: "", archivedAt: null, ...over,
});
const STAGES = new Map([
  ["queue", stage("queue")],
  ["offer", stage("offer", { countsAsIncome: false })],
  ["delivered", stage("delivered", { isFinal: true })],
]);
const TODAY = new Date(2026, 9, 30);

describe("dueSoon", () => {
  it("lists booked events in the coming week that still owe, soonest first", () => {
    const result = dueSoon(
      [
        order({ key: "a", date: "2026-11-02", deposit: 400 }),
        order({ key: "b", date: "2026-10-30" }),
        order({ key: "c", date: "2026-11-05" }),
        order({ key: "d", date: "2026-11-06" }),
        order({ key: "e", date: "2026-10-29" }),
      ],
      STAGES,
      TODAY,
    );
    expect(result.map((r) => [r.order.key, r.due])).toEqual([
      ["b", 1000],
      ["a", 600],
      ["c", 1000],
    ]);
  });

  it("does not chase quotes, finished orders, or anything paid", () => {
    const result = dueSoon(
      [
        order({ key: "a", productionStatus: "offer" }),
        order({ key: "b", productionStatus: "delivered" }),
        order({ key: "c", paymentStatus: "paid" }),
        order({ key: "d", paymentStatus: "comp" }),
        order({ key: "e", deposit: 1000 }),
        order({ key: "f", totalAmount: 0 }),
      ],
      STAGES,
      TODAY,
    );
    expect(result).toEqual([]);
  });
});
