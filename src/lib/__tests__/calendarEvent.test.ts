import { describe, expect, it } from "vitest";
import {
  calendarEventId,
  deliveryEventId,
  eventsHash,
  laterOnClock,
  nextDay,
  orderEvents,
  type EventContext,
} from "../calendarEvent";
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
  deliveryNames: new Map([[3, "Tel Aviv"]]),
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
    eventTime: null,
    deliveryTime: null,
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

const main = (o: Order) => orderEvents(o, ctx)[0];

describe("event ids", () => {
  it("are fixed per order and only use Google's id alphabet (a-v, 0-9)", () => {
    expect(calendarEventId(42)).toBe("gemsorder42");
    expect(deliveryEventId(42)).toBe("gemsdlv42");
    for (const id of [calendarEventId("7"), deliveryEventId("7")]) expect(id).toMatch(/^[a-v0-9]{5,}$/);
  });
});

describe("clock arithmetic", () => {
  it("rolls days over months, years and leap days", () => {
    expect(nextDay("2026-11-23")).toBe("2026-11-24");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
    expect(nextDay("2028-02-28")).toBe("2028-02-29");
  });
  it("carries a late event past midnight", () => {
    expect(laterOnClock("2026-12-03", "19:30", 180)).toEqual({ date: "2026-12-03", time: "22:30" });
    expect(laterOnClock("2026-12-31", "22:00", 180)).toEqual({ date: "2027-01-01", time: "01:00" });
  });
});

describe("the order's own event", () => {
  it("with no time is all-day, as before, and shown as free", () => {
    const event = main(order());
    expect(event.start).toEqual({ date: "2026-12-03" });
    expect(event.end).toEqual({ date: "2026-12-04" });
    expect(event.transparency).toBe("transparent");
  });

  it("with a time sits at its hour for three hours, in Israel's time, and shows as busy", () => {
    const event = main(order({ eventTime: "19:30" }));
    expect(event.start).toEqual({ dateTime: "2026-12-03T19:30:00", timeZone: "Asia/Jerusalem" });
    expect(event.end).toEqual({ dateTime: "2026-12-03T22:30:00", timeZone: "Asia/Jerusalem" });
    expect(event.transparency).toBe("opaque");
  });

  it("is marked 🍸 and titled with who and how many", () => {
    expect(main(order()).summary).toBe("🍸 Maya Levi · 18 units");
  });

  it("says what to make, the extras with the delivery's time, and links back", () => {
    const { description } = main(order({ deliveryOptionId: 3, deliveryTime: "17:00" }));
    expect(description).toContain("Status: Queued");
    expect(description).toContain("2× 9 units — Lychee 10, Mango 8");
    expect(description).toContain("Mirror ×2");
    expect(description).toContain("Delivery to Tel Aviv at 17:00");
    expect(description).toContain("Gate code 1234");
    expect(description).toContain("https://jimgem.vercel.app/orders?order=42");
  });

  it("draws a quote as tentative and says so", () => {
    const event = main(order({ productionStatus: "offer" }));
    expect(event.status).toBe("tentative");
    expect(event.summary).toBe("🍸 Quote · Maya Levi · 18 units");
  });
});

describe("the delivery's event", () => {
  it("appears only for a delivered order with a delivery time", () => {
    expect(orderEvents(order(), ctx)).toHaveLength(1); // delivered, no time
    expect(orderEvents(order({ deliveryCost: null, deliveryTime: "17:00" }), ctx)).toHaveLength(1); // time, no delivery
    expect(orderEvents(order({ deliveryTime: "17:00" }), ctx)).toHaveLength(2);
  });

  it("is marked 🚚, an hour long at its own time, and says when the event starts", () => {
    const [, delivery] = orderEvents(order({ deliveryOptionId: 3, deliveryTime: "17:00", eventTime: "19:30" }), ctx);
    expect(delivery.id).toBe("gemsdlv42");
    expect(delivery.summary).toBe("🚚 Delivery · Maya Levi");
    expect(delivery.start).toEqual({ dateTime: "2026-12-03T17:00:00", timeZone: "Asia/Jerusalem" });
    expect(delivery.end).toEqual({ dateTime: "2026-12-03T18:00:00", timeZone: "Asia/Jerusalem" });
    expect(delivery.description).toContain("Delivery for Maya Levi — Tel Aviv");
    expect(delivery.description).toContain("The event starts at 19:30");
  });
});

describe("no money", () => {
  it("in either event", () => {
    const text = JSON.stringify(orderEvents(order({ deliveryTime: "17:00" }), ctx));
    expect(text).not.toContain("₪");
    // 300, 400 and 500 are this order's prices; none may reach Google.
    for (const figure of ["300", "400", "500"]) expect(text).not.toContain(figure);
  });
});

describe("eventsHash", () => {
  it("changes when what goes to the calendar does, and only then", () => {
    const a = eventsHash(orderEvents(order(), ctx));
    expect(eventsHash(orderEvents(order(), ctx))).toBe(a);
    expect(eventsHash(orderEvents(order({ eventTime: "20:00" }), ctx))).not.toBe(a);
    expect(eventsHash(orderEvents(order({ deliveryTime: "17:00" }), ctx))).not.toBe(a);
    // Money is in neither event, so repricing writes nothing to Google.
    expect(eventsHash(orderEvents(order({ totalAmount: 9999, deposit: 0 }), ctx))).toBe(a);
  });
});
