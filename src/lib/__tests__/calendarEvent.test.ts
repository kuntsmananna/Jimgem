import { describe, expect, it } from "vitest";
import { calendarEventId, eventHash, nextDay, orderEvent, type EventContext } from "../calendarEvent";
import type { Order, ProductionStage } from "../orderTypes";

const stage = (key: string, label: string, countsAsIncome = true, isFinal = false): ProductionStage =>
  ({ id: 1, key, label, position: 0, countsAsIncome, isFinal, color: "", archivedAt: null }) as unknown as ProductionStage;

const ctx: EventContext = {
  unitsPerPackage: new Map([
    [1, 1],
    [2, 9],
  ]),
  packageNames: new Map([
    [1, "1 unit"],
    [2, "9 units"],
  ]),
  flavorNames: new Map([
    [10, "Lychee"],
    [11, "Mango"],
  ]),
  displayNames: new Map([[5, "Mirror"]]),
  stages: new Map([
    ["queue", stage("queue", "Queued")],
    ["offer", stage("offer", "Quote", false)],
  ]),
  appUrl: "https://jimgem.vercel.app",
};

function order(overrides: Partial<Order> = {}): Order {
  return {
    key: "42",
    source: "db",
    date: "2026-12-03",
    customer: "Maya Levi",
    clientId: 1,
    customerType: "Wedding",
    location: "Tel Aviv",
    details: "",
    guests: 150,
    mirrors: null,
    displays: [{ optionId: 5, quantity: 2 }],
    waitresses: 2,
    kosher: true,
    packageLines: [
      { packageTypeId: "2", quantity: 2, flavors: [{ flavorId: "10", units: 10 }, { flavorId: "11", units: 8 }] },
    ],
    totalAmount: 1234,
    deliveryCost: 0,
    deliveryOptionId: null,
    mirrorsCost: null,
    displayCost: 300,
    waitressCost: 400,
    kosherCost: 100,
    discount: 0,
    discountIsPercent: false,
    vatMode: "included",
    vatRate: 18,
    deposit: 500,
    paymentStatus: "deposit",
    paymentMethodId: null,
    productionStatus: "queue",
    notes: "Gate code 1234",
    needsReview: false,
    updatedAt: "2026-11-01T10:00:00.000Z",
    updatedBy: "Anna",
    ...overrides,
  } as Order;
}

describe("calendarEventId", () => {
  it("is fixed per order and only uses Google's id alphabet (a-v, 0-9)", () => {
    expect(calendarEventId(42)).toBe("gemsorder42");
    expect(calendarEventId("7")).toMatch(/^[a-v0-9]{5,}$/);
  });
});

describe("nextDay", () => {
  it("rolls over months, years and leap days", () => {
    expect(nextDay("2026-11-23")).toBe("2026-11-24");
    expect(nextDay("2026-11-30")).toBe("2026-12-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
    expect(nextDay("2028-02-28")).toBe("2028-02-29");
  });
});

describe("orderEvent", () => {
  it("is an all-day event on the order's date", () => {
    const event = orderEvent(order(), ctx);
    expect(event.id).toBe("gemsorder42");
    expect(event.start).toEqual({ date: "2026-12-03" });
    expect(event.end).toEqual({ date: "2026-12-04" });
    expect(event.status).toBe("confirmed");
    expect(event.location).toBe("Tel Aviv");
  });

  it("titles with who and how many", () => {
    expect(orderEvent(order(), ctx).summary).toBe("Maya Levi · 18 units");
  });

  it("says what to make, the extras and the note, and links back to the order", () => {
    const { description } = orderEvent(order(), ctx);
    expect(description).toContain("Status: Queued");
    expect(description).toContain("Guests: 150");
    expect(description).toContain("2× 9 units — Lychee 10, Mango 8");
    expect(description).toContain("Mirror ×2");
    expect(description).toContain("Waitresses ×2");
    expect(description).toContain("Kosher");
    expect(description).toContain("Delivery");
    expect(description).toContain("Gate code 1234");
    expect(description).toContain("https://jimgem.vercel.app/orders?order=42");
  });

  it("carries no money at all", () => {
    const event = orderEvent(order(), ctx);
    const text = JSON.stringify(event);
    expect(text).not.toContain("₪");
    for (const figure of ["1234", "300", "400", "500"]) {
      // 1234 is in the note on purpose ("Gate code 1234"); the rest are only prices.
      if (figure === "1234") continue;
      expect(text).not.toContain(figure);
    }
  });

  it("draws a quote as tentative and says so in the title", () => {
    const event = orderEvent(order({ productionStatus: "offer" }), ctx);
    expect(event.status).toBe("tentative");
    expect(event.summary).toBe("Quote · Maya Levi · 18 units");
  });

  it("calls out a package with no flavours yet, and leaves out what an order lacks", () => {
    const event = orderEvent(
      order({
        packageLines: [{ packageTypeId: "1", quantity: 120, flavors: [] }],
        displays: [],
        waitresses: null,
        kosher: false,
        deliveryCost: null,
        notes: "",
        guests: null,
      }),
      ctx,
    );
    expect(event.summary).toBe("Maya Levi · 120 units");
    expect(event.description).toContain("120 units — no flavours yet");
    expect(event.description).not.toContain("Extras");
    expect(event.description).not.toContain("Guests");
  });
});

describe("eventHash", () => {
  it("changes when the event does, and only then", () => {
    const a = eventHash(orderEvent(order(), ctx));
    expect(eventHash(orderEvent(order(), ctx))).toBe(a);
    expect(eventHash(orderEvent(order({ location: "Haifa" }), ctx))).not.toBe(a);
    // Money is not in the event, so repricing writes nothing to Google.
    expect(eventHash(orderEvent(order({ totalAmount: 9999, deposit: 0 }), ctx))).toBe(a);
  });
});
