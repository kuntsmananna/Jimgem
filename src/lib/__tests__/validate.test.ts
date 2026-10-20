import { describe, expect, it } from "vitest";
import {
  isIsoDate,
  parseExpenseInput,
  parseOrderInput,
  parseOrderPatch,
  parseRowId,
  parseTaskInput,
} from "../validate";

/**
 * What the order form actually sends — the shape every check below is
 * measured against, so a rule that would refuse a real save fails here
 * first rather than on the owner's phone.
 */
const ORDER = {
  date: "2026-10-23",
  customer: "Maya Levi",
  clientId: 12,
  customerType: "Wedding",
  location: "Tel Aviv",
  guests: 120,
  mirrors: null,
  displays: [{ optionId: 3, quantity: 2 }],
  waitresses: null,
  kosher: true,
  packageLines: [
    { packageTypeId: "2", quantity: 3, packagePrice: 320, flavors: [{ flavorId: "5", units: 27 }] },
  ],
  totalAmount: 1200,
  deliveryCost: 0,
  deliveryOptionId: null,
  mirrorsCost: null,
  displayCost: 150,
  waitressCost: null,
  kosherCost: 90,
  discount: 10,
  discountIsPercent: true,
  vatMode: "included",
  vatRate: 18,
  deposit: 300,
  paymentStatus: "deposit",
  paymentMethodId: 2,
  productionStatus: "queued",
  notes: "Gate code 1234",
  // Envelope fields the route reads itself — ignored here, not refused.
  mode: "replace",
  expectedUpdatedAt: "2026-10-20T10:00:00.000Z",
};

const errorOf = (result: { ok: boolean; error?: string }) => (result.ok ? null : result.error);

describe("parseOrderInput", () => {
  it("accepts what the form sends, and passes on only the order's own fields", () => {
    const parsed = parseOrderInput(ORDER);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.deliveryCost).toBe(0); // "we deliver, no charge" — not dropped to null
    expect(parsed.value.packageLines[0].flavors[0]).toEqual({ flavorId: "5", units: 27 });
    expect("mode" in parsed.value).toBe(false);
    expect("expectedUpdatedAt" in parsed.value).toBe(false);
  });

  it("reads a numeric string as a number and a blank as not given", () => {
    const parsed = parseOrderInput({ ...ORDER, guests: "80", waitresses: "" });
    expect(parsed.ok && parsed.value.guests).toBe(80);
    expect(parsed.ok && parsed.value.waitresses).toBeNull();
  });

  it("names the field it refuses", () => {
    expect(errorOf(parseOrderInput({ ...ORDER, guests: "abc" }))).toBe("Guests should be a number.");
    expect(errorOf(parseOrderInput({ ...ORDER, deposit: -5 }))).toBe("The deposit can't be below 0.");
    expect(errorOf(parseOrderInput({ ...ORDER, paymentStatus: "maybe" }))).toBe("Payment isn't one of the choices.");
    expect(errorOf(parseOrderInput({ ...ORDER, date: "23/10" }))).toBe("The date should be a date.");
  });

  it("caps a percentage discount at 100 but not a shekel one", () => {
    expect(parseOrderInput({ ...ORDER, discount: 150 }).ok).toBe(false);
    expect(parseOrderInput({ ...ORDER, discount: 150, discountIsPercent: false }).ok).toBe(true);
  });

  it("refuses a package with no size and a flavour off the list", () => {
    const line = ORDER.packageLines[0];
    expect(parseOrderInput({ ...ORDER, packageLines: [{ ...line, packageTypeId: "" }] }).ok).toBe(false);
    expect(
      parseOrderInput({ ...ORDER, packageLines: [{ ...line, flavors: [{ flavorId: "x", units: 1 }] }] }).ok,
    ).toBe(false);
  });

  it("allows a fractional flavour split, which a percentage can resolve to", () => {
    const line = { ...ORDER.packageLines[0], flavors: [{ flavorId: "5", units: 13.5 }] };
    expect(parseOrderInput({ ...ORDER, packageLines: [line] }).ok).toBe(true);
  });

  it("refuses a body that is not an object, and a note the size of a file", () => {
    expect(parseOrderInput(null).ok).toBe(false);
    expect(parseOrderInput([ORDER]).ok).toBe(false);
    expect(parseOrderInput({ ...ORDER, notes: "x".repeat(6000) }).ok).toBe(false);
  });
});

describe("parseOrderPatch", () => {
  it("keeps only editable fields, typed", () => {
    const parsed = parseOrderPatch({ mode: "patch", guests: "40", paymentStatus: "paid", id: 99, sql: "drop" });
    expect(parsed).toEqual({ ok: true, value: { guests: 40, paymentStatus: "paid" } });
  });

  it("refuses a value its column cannot hold", () => {
    expect(parseOrderPatch({ guests: "lots" }).ok).toBe(false);
    expect(parseOrderPatch({ productionStatus: "" }).ok).toBe(false);
  });
});

describe("parseExpenseInput", () => {
  const EXPENSE = {
    date: "2026-10-01",
    categoryId: 4,
    amount: 250,
    paymentMethodId: null,
    staffId: 1,
    business: "Shufersal",
    note: "Gelatin",
    vatMode: "included",
    vatRate: 18,
    recurring: false,
  };

  it("accepts a refund and a back-catalogue zero", () => {
    expect(parseExpenseInput({ ...EXPENSE, amount: -80 }).ok).toBe(true);
    expect(parseExpenseInput({ ...EXPENSE, amount: 0 }).ok).toBe(true);
  });

  it("refuses an expense with no category", () => {
    expect(errorOf(parseExpenseInput({ ...EXPENSE, categoryId: null }))).toBe("An expense needs a category.");
  });
});

describe("parseTaskInput", () => {
  it("refuses a blank task", () => {
    expect(errorOf(parseTaskInput({ title: "   ", staffId: null, done: false }))).toBe(
      "A task needs something to say.",
    );
  });
});

describe("parseRowId and isIsoDate", () => {
  it("reads only a positive whole id", () => {
    expect(parseRowId("42")).toBe(42);
    for (const bad of ["0", "-1", "4.2", "abc", "", "99999999999"]) expect(parseRowId(bad)).toBeNull();
  });

  it("refuses a day the calendar does not have", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
  });
});
