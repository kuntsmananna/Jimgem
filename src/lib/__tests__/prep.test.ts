import { describe, expect, it } from "vitest";
import { prepDays, prepOrders, prepWindowEnd, summarizePrep } from "../prep";
import type { Order, ProductionStage } from "../orderTypes";

const BASE: Order = {
  key: "1",
  source: "db",
  date: "2026-10-30",
  customer: "Noa",
  clientId: null,
  customerType: "Wedding",
  location: "",
  details: "",
  guests: null,
  mirrors: null,
  displays: [],
  waitresses: null,
  kosher: false,
  packageLines: [],
  totalAmount: 0,
  deliveryCost: null,
  deliveryOptionId: null,
  mirrorsCost: null,
  displayCost: null,
  waitressCost: null,
  kosherCost: null,
  discount: 0,
  discountIsPercent: false,
  vatMode: "included",
  vatRate: 18,
  deposit: 0,
  paymentStatus: "unpaid",
  paymentMethodId: null,
  productionStatus: "queue",
  notes: "",
  needsReview: false,
  updatedAt: "2026-10-01T10:00:00.000Z",
  updatedBy: "",
};

const order = (over: Partial<Order>): Order => ({ ...BASE, ...over });

const stage = (key: string, over: Partial<ProductionStage> = {}): ProductionStage => ({
  id: 1,
  key,
  label: key,
  position: 0,
  countsAsIncome: true,
  isFinal: false,
  color: "#000",
  archivedAt: null,
  ...over,
});

const STAGES = new Map([
  ["queue", stage("queue")],
  ["offer", stage("offer", { countsAsIncome: false })],
  ["delivered", stage("delivered", { isFinal: true })],
]);

// 1 = one-unit (event totals), 2 = 9 units, 3 = 30 units.
const SIZES = new Map([
  [1, 1],
  [2, 9],
  [3, 30],
]);

describe("prepOrders", () => {
  const window = { from: "2026-10-30", to: "2026-11-05", includeQuotes: false };

  it("keeps booked orders in the window, earliest first", () => {
    const orders = [
      order({ key: "2", date: "2026-11-02" }),
      order({ key: "1", date: "2026-10-30" }),
      order({ key: "3", date: "2026-11-06" }),
      order({ key: "4", date: "2026-10-29" }),
    ];
    expect(prepOrders(orders, STAGES, window).map((o) => o.key)).toEqual(["1", "2"]);
  });

  it("leaves out finished orders, and quotes unless asked", () => {
    const orders = [
      order({ key: "1", productionStatus: "delivered" }),
      order({ key: "2", productionStatus: "offer" }),
      order({ key: "3", productionStatus: "gone-missing" }),
    ];
    expect(prepOrders(orders, STAGES, window).map((o) => o.key)).toEqual(["3"]);
    expect(prepOrders(orders, STAGES, { ...window, includeQuotes: true }).map((o) => o.key)).toEqual(["2", "3"]);
  });
});

describe("summarizePrep", () => {
  it("adds flavours across lines and orders, largest first", () => {
    const summary = summarizePrep(
      [
        order({
          packageLines: [
            { packageTypeId: "2", quantity: 2, flavors: [{ flavorId: "a", units: 18 }] },
            { packageTypeId: "3", quantity: 1, flavors: [{ flavorId: "b", units: 10 }, { flavorId: "a", units: 20 }] },
          ],
        }),
        order({
          key: "2",
          packageLines: [{ packageTypeId: "1", quantity: 50, flavors: [{ flavorId: "b", units: 50 }] }],
        }),
      ],
      SIZES,
    );
    expect(summary.units).toBe(18 + 30 + 50);
    expect(summary.flavors).toEqual([
      { flavorId: "b", units: 60 },
      { flavorId: "a", units: 38 },
    ]);
    expect(summary.packages).toEqual([
      { packageTypeId: "3", packages: 1 },
      { packageTypeId: "2", packages: 2 },
    ]);
    expect(summary.eventUnits).toBe(50);
    expect(summary.unassigned).toBe(0);
  });

  it("does not let an overfilled line cancel a short one", () => {
    const summary = summarizePrep(
      [
        order({
          packageLines: [
            { packageTypeId: "2", quantity: 1, flavors: [{ flavorId: "a", units: 4 }] },
            { packageTypeId: "2", quantity: 1, flavors: [{ flavorId: "a", units: 14 }] },
          ],
        }),
      ],
      SIZES,
    );
    expect(summary.unassigned).toBe(5);
  });

  it("counts the extras", () => {
    const summary = summarizePrep(
      [
        order({ displays: [{ optionId: 7, quantity: 2 }], waitresses: 2, kosher: true, deliveryCost: 0 }),
        order({ key: "2", displays: [{ optionId: 7, quantity: 1 }], waitresses: null, deliveryCost: null }),
      ],
      SIZES,
    );
    expect(summary.displays).toEqual([{ optionId: 7, quantity: 3 }]);
    expect(summary.waitresses).toBe(2);
    expect(summary.kosherOrders).toBe(1);
    // Free delivery is still a trip.
    expect(summary.deliveries).toBe(1);
  });
});

describe("prepDays and prepWindowEnd", () => {
  it("groups runs of the same date", () => {
    const days = prepDays([
      order({ key: "1", date: "2026-10-30" }),
      order({ key: "2", date: "2026-10-30" }),
      order({ key: "3", date: "2026-10-31" }),
    ]);
    expect(days.map((d) => [d.date, d.orders.length])).toEqual([
      ["2026-10-30", 2],
      ["2026-10-31", 1],
    ]);
  });

  it("ends a window inclusively, across a month", () => {
    expect(prepWindowEnd(new Date(2026, 9, 30), 1)).toBe("2026-10-30");
    expect(prepWindowEnd(new Date(2026, 9, 30), 7)).toBe("2026-11-05");
  });
});
