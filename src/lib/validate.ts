import type { OrderInput, PaymentStatus, VatMode } from "./orderTypes";
import type { ExpenseInput } from "./expenses";
import type { TaskInput } from "./tasks";
import type { EditableField } from "./orders";

/**
 * What a write route accepts, checked before any of it reaches SQL.
 *
 * The routes used to cast the parsed body (`as OrderInput`) and pass it
 * on, so the type was a promise nothing kept. Parameterised queries meant
 * that was never an injection — but a `guests` of "abc" or a `deposit` of
 * NaN reached Postgres and came back as a 500 that said nothing, and a
 * negative deposit or a 50,000-character note was stored without a word.
 * Now a malformed body is a 400 with a sentence naming the field.
 *
 * **Lenient about form, strict about meaning.** A numeric string is a
 * number and an empty one is "not given", because that is what a text
 * box produces; a value that cannot mean what the field means is refused.
 * Each parser returns only the fields it knows, so nothing a caller tacks
 * on rides through to a query. Pure functions, no database, so they are
 * tested beside the money math (`__tests__/validate.test.ts`).
 */
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Long enough for any real note, short enough that a pasted file is refused. */
const LONG_TEXT = 5000;
const SHORT_TEXT = 300;
/** Larger than any order or expense this business will see, by orders of magnitude. */
const MAX_MONEY = 10_000_000;
const MAX_COUNT = 100_000;

const PAYMENT_STATUSES: readonly PaymentStatus[] = ["unpaid", "deposit", "paid", "comp", "net40"];
const VAT_MODE_IDS: readonly VatMode[] = ["included", "added", "exempt"];

class Invalid extends Error {}

/** One body, read field by field; the first field that cannot be read throws. */
class Reader {
  constructor(private readonly body: Record<string, unknown>) {}

  has(key: string) {
    return key in this.body;
  }

  text(key: string, label: string, max = SHORT_TEXT): string {
    const value = this.body[key];
    if (value === undefined || value === null) return "";
    if (typeof value !== "string") throw new Invalid(`${label} should be text.`);
    if (value.length > max) throw new Invalid(`${label} is too long (${max} characters at most).`);
    return value;
  }

  number(key: string, label: string, opts: { min?: number; max?: number; int?: boolean } = {}): number {
    const value = this.optionalNumber(key, label, opts);
    if (value === null) throw new Invalid(`${label} is missing.`);
    return value;
  }

  /** Null for missing, null or an empty string — a box left blank. */
  optionalNumber(key: string, label: string, opts: { min?: number; max?: number; int?: boolean } = {}): number | null {
    const raw = this.body[key];
    if (raw === undefined || raw === null || raw === "") return null;
    const value = typeof raw === "string" ? Number(raw.trim()) : raw;
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Invalid(`${label} should be a number.`);
    if (opts.int && !Number.isInteger(value)) throw new Invalid(`${label} should be a whole number.`);
    if (opts.min !== undefined && value < opts.min) throw new Invalid(`${label} can't be below ${opts.min}.`);
    if (opts.max !== undefined && value > opts.max) throw new Invalid(`${label} is larger than this app allows.`);
    return value;
  }

  id(key: string, label: string): number | null {
    return this.optionalNumber(key, label, { min: 1, int: true });
  }

  bool(key: string, label: string): boolean {
    const value = this.body[key];
    if (value === undefined || value === null) return false;
    if (typeof value !== "boolean") throw new Invalid(`${label} should be yes or no.`);
    return value;
  }

  date(key: string, label: string): string {
    const value = this.text(key, label);
    if (!isIsoDate(value)) throw new Invalid(`${label} should be a date.`);
    return value;
  }

  oneOf<T extends string>(key: string, label: string, allowed: readonly T[]): T {
    const value = this.body[key];
    if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
      throw new Invalid(`${label} isn't one of the choices.`);
    }
    return value as T;
  }

  list(key: string, label: string, max: number): Record<string, unknown>[] {
    const value = this.body[key];
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new Invalid(`${label} should be a list.`);
    if (value.length > max) throw new Invalid(`${label} has too many entries.`);
    return value.map((item) => {
      if (!isObject(item)) throw new Invalid(`${label} has an entry that isn't one.`);
      return item;
    });
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A real calendar day in YYYY-MM-DD — "2026-02-30" is refused, not rolled into March. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value;
}

function run<T>(body: unknown, read: (r: Reader) => T): Parsed<T> {
  if (!isObject(body)) return { ok: false, error: "The request didn't carry what this needs." };
  try {
    return { ok: true, value: read(new Reader(body)) };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: error.message };
    throw error;
  }
}

/** A row id from the URL — `/api/orders/abc` is a 400, not a query for NaN. */
export function parseRowId(raw: string): number | null {
  return /^\d+$/.test(raw) && Number(raw) > 0 && Number(raw) <= 2_147_483_647 ? Number(raw) : null;
}

export function parseOrderInput(body: unknown): Parsed<OrderInput> {
  return run(body, (r) => {
    const money = (key: string, label: string) => r.number(key, label, { min: 0, max: MAX_MONEY });
    const optionalMoney = (key: string, label: string) => r.optionalNumber(key, label, { min: 0, max: MAX_MONEY });
    const optionalCount = (key: string, label: string) =>
      r.optionalNumber(key, label, { min: 0, max: MAX_COUNT, int: true });

    const discountIsPercent = r.bool("discountIsPercent", "Discount kind");
    const discount = r.optionalNumber("discount", "Discount", { min: 0, max: discountIsPercent ? 100 : MAX_MONEY }) ?? 0;

    return {
      date: r.date("date", "The date"),
      customer: r.text("customer", "The customer's name"),
      clientId: r.id("clientId", "The client"),
      customerType: r.text("customerType", "The order type"),
      location: r.text("location", "The location"),
      guests: optionalCount("guests", "Guests"),
      mirrors: optionalCount("mirrors", "Mirrors"),
      displays: r.list("displays", "Displays", 50).map((item) => {
        const line = new Reader(item);
        return {
          optionId: line.number("optionId", "A display", { min: 1, int: true }),
          quantity: line.number("quantity", "A display's count", { min: 0, max: MAX_COUNT, int: true }),
        };
      }),
      waitresses: optionalCount("waitresses", "Waitresses"),
      kosher: r.bool("kosher", "Kosher"),
      packageLines: r.list("packageLines", "Packages", 200).map((item) => {
        const line = new Reader(item);
        const packageTypeId = line.text("packageTypeId", "A package's size");
        if (!/^\d+$/.test(packageTypeId)) throw new Invalid("A package has no size.");
        return {
          packageTypeId,
          quantity: line.number("quantity", "A package count", { min: 0, max: MAX_COUNT, int: true }),
          packagePrice: line.optionalNumber("packagePrice", "A package price", { min: 0, max: MAX_MONEY }),
          flavors: line.list("flavors", "A package's flavours", 100).map((entry) => {
            const flavor = new Reader(entry);
            const flavorId = flavor.text("flavorId", "A flavour");
            if (!/^\d+$/.test(flavorId)) throw new Invalid("A package has a flavour that isn't on the list.");
            return {
              flavorId,
              // Not held to whole numbers: a split typed as a percentage is
              // resolved to units, and that need not land on an integer.
              units: flavor.number("units", "A flavour's units", { min: 0, max: MAX_COUNT * 100 }),
            };
          }),
        };
      }),
      totalAmount: money("totalAmount", "The jelly price"),
      deliveryCost: optionalMoney("deliveryCost", "Delivery"),
      deliveryOptionId: r.id("deliveryOptionId", "The delivery destination"),
      mirrorsCost: optionalMoney("mirrorsCost", "Mirrors cost"),
      displayCost: optionalMoney("displayCost", "Display cost"),
      waitressCost: optionalMoney("waitressCost", "Waitressing cost"),
      kosherCost: optionalMoney("kosherCost", "Kosher cost"),
      discount,
      discountIsPercent,
      vatMode: r.oneOf("vatMode", "VAT", VAT_MODE_IDS),
      vatRate: r.number("vatRate", "The VAT rate", { min: 0, max: 100 }),
      deposit: r.optionalNumber("deposit", "The deposit", { min: 0, max: MAX_MONEY }) ?? 0,
      paymentStatus: r.oneOf("paymentStatus", "Payment", PAYMENT_STATUSES),
      paymentMethodId: r.id("paymentMethodId", "How it was paid"),
      // A key into the owner's own list of stages, so any non-empty key.
      productionStatus: nonEmpty(r.text("productionStatus", "The status"), "The status"),
      notes: r.text("notes", "Notes", LONG_TEXT),
    };
  });
}

function nonEmpty(value: string, label: string): string {
  if (!value.trim()) throw new Invalid(`${label} is missing.`);
  return value;
}

/**
 * The table's inline edits: only the fields it can edit, each read as the
 * kind of value its column holds. A key outside the list is dropped, the
 * same as `updateOrderFields` already did — this adds the typing.
 */
export function parseOrderPatch(
  body: unknown,
): Parsed<Partial<Record<EditableField, string | number | boolean | null>>> {
  return run(body, (r) => {
    const out: Partial<Record<EditableField, string | number | boolean | null>> = {};
    const text: [EditableField, string, number][] = [
      ["customer", "The customer's name", SHORT_TEXT],
      ["customerType", "The order type", SHORT_TEXT],
      ["location", "The location", SHORT_TEXT],
      ["notes", "Notes", LONG_TEXT],
    ];
    for (const [key, label, max] of text) if (r.has(key)) out[key] = r.text(key, label, max);
    if (r.has("date")) out.date = r.date("date", "The date");
    const counts: [EditableField, string][] = [
      ["guests", "Guests"],
      ["mirrors", "Mirrors"],
      ["waitresses", "Waitresses"],
    ];
    for (const [key, label] of counts) {
      if (r.has(key)) out[key] = r.optionalNumber(key, label, { min: 0, max: MAX_COUNT, int: true });
    }
    const money: [EditableField, string][] = [
      ["deliveryCost", "Delivery"],
      ["mirrorsCost", "Mirrors cost"],
      ["waitressCost", "Waitressing cost"],
      ["kosherCost", "Kosher cost"],
    ];
    for (const [key, label] of money) {
      if (r.has(key)) out[key] = r.optionalNumber(key, label, { min: 0, max: MAX_MONEY });
    }
    if (r.has("totalAmount")) out.totalAmount = r.number("totalAmount", "The jelly price", { min: 0, max: MAX_MONEY });
    if (r.has("deposit")) out.deposit = r.optionalNumber("deposit", "The deposit", { min: 0, max: MAX_MONEY }) ?? 0;
    if (r.has("kosher")) out.kosher = r.bool("kosher", "Kosher");
    if (r.has("paymentStatus")) out.paymentStatus = r.oneOf("paymentStatus", "Payment", PAYMENT_STATUSES);
    if (r.has("paymentMethodId")) out.paymentMethodId = r.id("paymentMethodId", "How it was paid");
    if (r.has("productionStatus")) {
      out.productionStatus = nonEmpty(r.text("productionStatus", "The status"), "The status");
    }
    return out;
  });
}

/**
 * An expense. The amount may be negative — a refund nets against its
 * category (see `BarBreakdown`). Zero is allowed here although the form
 * refuses it: the Sheet's back catalogue holds zero rows, and an inline
 * edit sends the whole row, so refusing it would make those rows
 * uneditable rather than stop anyone typing a zero.
 */
export function parseExpenseInput(body: unknown): Parsed<ExpenseInput> {
  return run(body, (r) => {
    const categoryId = r.id("categoryId", "The category");
    if (categoryId === null) throw new Invalid("An expense needs a category.");
    const amount = r.number("amount", "The amount", { min: -MAX_MONEY, max: MAX_MONEY });
    return {
      date: r.date("date", "The date"),
      categoryId,
      amount,
      paymentMethodId: r.id("paymentMethodId", "How it was paid"),
      staffId: r.id("staffId", "Who spent it"),
      business: r.text("business", "The business"),
      note: r.text("note", "The description", LONG_TEXT),
      vatMode: r.oneOf("vatMode", "VAT", VAT_MODE_IDS),
      vatRate: r.number("vatRate", "The VAT rate", { min: 0, max: 100 }),
      recurring: r.bool("recurring", "Repeats"),
    };
  });
}

export function parseTaskInput(body: unknown): Parsed<TaskInput> {
  return run(body, (r) => {
    const title = r.text("title", "The task", 1000);
    if (!title.trim()) throw new Invalid("A task needs something to say.");
    return { title, staffId: r.id("staffId", "Who it's for"), done: r.bool("done", "Done") };
  });
}
