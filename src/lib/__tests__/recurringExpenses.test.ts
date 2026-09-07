import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The roll-forward, over a stubbed database.
 *
 * These tests are here for the reason the money tests are: a mistake in
 * this does not announce itself. A series that quietly stops repeating, or
 * one that books a month twice, looks exactly like a correct ledger until
 * somebody adds the year up — and the cases that get it wrong (a deleted
 * month, a 31st in February, a gap of several months) are the ones nobody
 * exercises by hand.
 *
 * The database is stubbed rather than real because what is under test is
 * the decision — which months are missing and what gets copied — not the
 * SQL, whose own guarantee (one row per series per month, deleted rows
 * included) is a unique index verified against Postgres when it was
 * written.
 */
const rows: Record<string, unknown>[] = [];
const inserts: { date: string; from: number }[] = [];

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      if (sql.includes("INSERT INTO expenses")) {
        inserts.push({ date: params[0] as string, from: params[1] as number });
        return { rows: [{ id: 900 + inserts.length }] };
      }
      return { rows };
    },
  }),
}));

const { rollForwardRecurring, getRecurringSummary } = await import("@/lib/recurringExpenses");

/** One row of a series, in the shape the query returns. */
function row(over: Partial<Record<string, unknown>> & { date: string; recurring_series: number }) {
  return {
    id: Number(over.id ?? 1),
    category_id: 3,
    amount: "5000",
    vat_mode: "included",
    vat_rate: "18",
    recurring: true,
    deleted_at: null,
    ...over,
  };
}

/** The query orders by series, then date DESC — so the fixtures must too. */
function given(...given: Record<string, unknown>[]) {
  rows.length = 0;
  rows.push(
    ...[...given].sort((a, b) =>
      a.recurring_series !== b.recurring_series
        ? Number(a.recurring_series) - Number(b.recurring_series)
        : String(b.date).localeCompare(String(a.date)) || Number(b.id) - Number(a.id),
    ),
  );
}

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

beforeEach(() => {
  inserts.length = 0;
});

describe("rollForwardRecurring", () => {
  it("books the months between the newest row and today", async () => {
    given(row({ id: 1, recurring_series: 1, date: "2026-09-05" }));
    const result = await rollForwardRecurring(at("2026-12-20"));
    expect(inserts.map((i) => i.date)).toEqual(["2026-10-05", "2026-11-05", "2026-12-05"]);
    expect(result.created).toBe(3);
    expect(result.series).toBe(1);
  });

  it("refuses a series that starts further back than the catch-up window", async () => {
    // The dangerous case, and the reason MAX_CATCH_UP is small: ticking
    // "repeats monthly" on last year's rent must not write a year of rents
    // into months that already have their own. Reported, never booked.
    given(row({ id: 1, recurring_series: 1, date: "2025-09-15" }));
    const result = await rollForwardRecurring(at("2026-09-30"));
    expect(inserts).toEqual([]);
    expect(result.created).toBe(0);
    expect(result.tooFarBack).toEqual(["2025-09"]);
    // Still counted as repeating — it just has nothing bookable.
    expect(result.series).toBe(1);
  });

  it("fills a gap the nightly run left, which is what catching up is for", async () => {
    given(row({ id: 1, recurring_series: 1, date: "2026-09-05" }));
    const result = await rollForwardRecurring(at("2026-11-02"));
    expect(inserts.map((i) => i.date)).toEqual(["2026-10-05", "2026-11-05"]);
    expect(result.tooFarBack).toEqual([]);
  });

  it("writes nothing when the month already has its row", async () => {
    given(
      row({ id: 1, recurring_series: 1, date: "2026-09-05" }),
      row({ id: 2, recurring_series: 1, date: "2026-10-05" }),
    );
    await rollForwardRecurring(at("2026-10-31"));
    expect(inserts).toEqual([]);
  });

  it("counts a row anywhere in the month, not just the same day", async () => {
    given(
      row({ id: 1, recurring_series: 1, date: "2026-09-05" }),
      row({ id: 2, recurring_series: 1, date: "2026-10-28" }),
    );
    await rollForwardRecurring(at("2026-10-31"));
    expect(inserts).toEqual([]);
  });

  it("stops the series when its newest row is no longer marked monthly", async () => {
    given(
      row({ id: 1, recurring_series: 1, date: "2026-09-05" }),
      row({ id: 2, recurring_series: 1, date: "2026-10-05", recurring: false }),
    );
    const result = await rollForwardRecurring(at("2026-11-20"));
    expect(inserts).toEqual([]);
    expect(result.series).toBe(0);
  });

  it("keeps going when a month was deleted, and does not refill it", async () => {
    // The case the whole deleted-rows-keep-their-month rule exists for:
    // October was booked and then deleted on purpose. November is still
    // owed, and October must not come back.
    given(
      row({ id: 1, recurring_series: 1, date: "2026-09-05" }),
      row({ id: 2, recurring_series: 1, date: "2026-10-05", deleted_at: "2026-10-06T09:00:00Z" }),
    );
    await rollForwardRecurring(at("2026-11-20"));
    expect(inserts.map((i) => i.date)).toEqual(["2026-11-05"]);
    // Copied from the newest *live* row, not from the deleted one.
    expect(inserts[0].from).toBe(1);
  });

  it("ends a series whose every row has been deleted", async () => {
    given(row({ id: 1, recurring_series: 1, date: "2026-09-05", deleted_at: "2026-09-06T09:00:00Z" }));
    const result = await rollForwardRecurring(at("2026-11-20"));
    expect(inserts).toEqual([]);
    expect(result.series).toBe(0);
  });

  it("copies the newest row, so a rise carries forward at the new figure", async () => {
    given(
      row({ id: 1, recurring_series: 1, date: "2026-09-05", amount: "5000" }),
      row({ id: 2, recurring_series: 1, date: "2026-10-05", amount: "5400" }),
    );
    await rollForwardRecurring(at("2026-11-20"));
    expect(inserts).toEqual([{ date: "2026-11-05", from: 2 }]);
  });

  it("clamps a day the month does not have", async () => {
    given(row({ id: 1, recurring_series: 1, date: "2027-01-31" }));
    await rollForwardRecurring(at("2027-03-15"));
    expect(inserts.map((i) => i.date)).toEqual(["2027-02-28", "2027-03-31"]);
  });

  it("crosses the year", async () => {
    given(row({ id: 1, recurring_series: 1, date: "2026-12-10" }));
    await rollForwardRecurring(at("2027-01-04"));
    expect(inserts.map((i) => i.date)).toEqual(["2027-01-10"]);
  });

  it("does not book the future", async () => {
    given(row({ id: 1, recurring_series: 1, date: "2026-09-05" }));
    await rollForwardRecurring(at("2026-09-30"));
    expect(inserts).toEqual([]);
  });

  it("writes nothing at all for a series years behind", async () => {
    given(row({ id: 1, recurring_series: 1, date: "2020-01-15" }));
    const result = await rollForwardRecurring(at("2026-09-30"));
    expect(result.created).toBe(0);
    expect(result.tooFarBack).toEqual(["2020-01"]);
  });

  it("handles several series at once", async () => {
    given(
      row({ id: 1, recurring_series: 1, date: "2026-09-05", amount: "5000" }),
      row({ id: 2, recurring_series: 2, date: "2026-09-20", amount: "300" }),
      row({ id: 3, recurring_series: 3, date: "2026-09-01", recurring: false }),
    );
    const result = await rollForwardRecurring(at("2026-10-10"));
    expect(inserts.map((i) => i.date).sort()).toEqual(["2026-10-05", "2026-10-20"]);
    expect(result.series).toBe(2);
    expect(result.months).toEqual(["2026-10"]);
    expect(result.tooFarBack).toEqual([]);
  });
});

describe("getRecurringSummary", () => {
  it("sums each series' newest row, in both conventions", async () => {
    given(
      row({ id: 1, recurring_series: 1, date: "2026-09-05", amount: "5000" }),
      // The rise: only this one counts, not both rows of the series.
      row({ id: 2, recurring_series: 1, date: "2026-10-05", amount: "5400" }),
      row({ id: 3, recurring_series: 2, date: "2026-10-01", amount: "1180" }),
      // Ended, so out of the figure entirely.
      row({ id: 4, recurring_series: 3, date: "2026-10-02", amount: "999", recurring: false }),
    );
    const summary = await getRecurringSummary();
    expect(summary.series).toBe(2);
    expect(summary.total).toBe(6580);
    // 18% inside the price: 5400 → 4576.27, 1180 → 1000.
    expect(Math.round(summary.netTotal)).toBe(5576);
  });

  it("is zero when nothing repeats", async () => {
    given();
    expect(await getRecurringSummary()).toEqual({ series: 0, total: 0, netTotal: 0 });
  });
});
