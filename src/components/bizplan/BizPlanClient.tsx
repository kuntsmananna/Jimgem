"use client";

import { useMemo, useState } from "react";
import type { MonthlyFinancials } from "@/lib/financials";
import { LineChart } from "@/components/charts/LineChart";
import { useVatView } from "@/components/VatViewContext";
import { SERIES_COLORS } from "@/lib/chartPalette";
import { useIsMobile } from "@/components/useMediaQuery";
import { MonthsMobileList } from "@/components/bizplan/MonthsMobileList";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currency = (n: number) => `₪${nf.format(n)}`;

export function BizPlanClient({ financials }: { financials: MonthlyFinancials[] }) {
  const [hideEmpty, setHideEmpty] = useState(true);
  /*
   * The year is a seven-column table at `min-w-[720px]`, which on a phone
   * is twice the screen's width of sideways drag to read one month. Below
   * the breakpoint it is a card per month instead — the shape the three
   * list pages already use.
   */
  const mobile = useIsMobile();

  const activeMonths = useMemo(
    () => financials.filter((m) => m.revenue > 0 || m.expenses > 0),
    [financials],
  );
  const tableRows = hideEmpty ? activeMonths : financials;

  const ytd = activeMonths.reduce(
    (acc, m) => ({
      revenue: acc.revenue + m.revenue,
      profit: acc.profit + m.profit,
      orders: acc.orders + m.orderCount,
      units: acc.units + m.unitsSold,
    }),
    { revenue: 0, profit: 0, orders: 0, units: 0 },
  );
  const avgOrderValue = ytd.orders > 0 ? ytd.revenue / ytd.orders : 0;
  const { label: vatLabel } = useVatView();

  return (
    <div className="flex flex-col gap-6">
      {/* Which convention the whole page is in. It moves with the nav's
          switch, and a report that doesn't say so invites the two readings
          to be compared with each other. */}
      <p className="text-xs font-semibold text-ink-soft">All figures {vatLabel}</p>
      {/* Two across on a phone. Five tiles come out 2 / 2 / 1, and the
          last one keeps its half — the owner's call, and it reads as a
          grid rather than as a tile that got special treatment. */}
      <div className="grid grid-cols-5 gap-4 max-md:grid-cols-2">
        <KpiTile label="YTD Revenue" value={currency(ytd.revenue)} tile="peach" />
        <KpiTile label="YTD Profit" value={currency(ytd.profit)} tile="mint" />
        <KpiTile label="YTD Orders" value={nf.format(ytd.orders)} tile="lavender" />
        <KpiTile label="YTD Units sold" value={nf.format(ytd.units)} tile="sage" />
        <KpiTile label="Avg order value" value={currency(avgOrderValue)} tile="peach" />
      </div>

      <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1">
        <section className="rounded-card border border-line bg-card p-6 max-md:p-4">
          <h2 className="font-display text-base font-bold text-ink">Revenue, expenses & profit</h2>
          <div className="mt-4">
            <LineChart
              xLabels={financials.map((m) => m.monthLabel)}
              series={[
                { label: "Revenue", color: SERIES_COLORS.sage, values: financials.map((m) => m.revenue) },
                { label: "Expenses", color: SERIES_COLORS.jasmine, values: financials.map((m) => m.expenses) },
                { label: "Profit", color: SERIES_COLORS.berry, values: financials.map((m) => m.profit) },
              ]}
            />
          </div>
        </section>

        <section className="rounded-card border border-line bg-card p-6 max-md:p-4">
          <h2 className="font-display text-base font-bold text-ink">Units sold & orders</h2>
          <div className="mt-4">
            <LineChart
              normalizePerSeries
              valueFormat={(v) => nf.format(v)}
              xLabels={financials.map((m) => m.monthLabel)}
              series={[
                { label: "Units sold", color: SERIES_COLORS.royale, values: financials.map((m) => m.unitsSold) },
                { label: "Orders", color: SERIES_COLORS.sage, values: financials.map((m) => m.orderCount) },
              ]}
            />
          </div>
        </section>
      </div>

      <section className="rounded-card border border-line bg-card p-6 max-md:p-4">
        {/* Wraps on a phone: the label is ~150px of 12px text beside a
            20px heading, which at 278px of content would crush "Year"
            rather than shortening itself. The checkbox is deliberately
            excluded from the unlayered 16px field rule in globals.css, so
            nothing here resizes on its own — the tappable target is the
            label, which is what gets the height. */}
        <div className="flex items-center justify-between max-md:flex-wrap max-md:gap-y-1">
          <h2 className="font-display text-lg font-bold text-ink">Year</h2>
          <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft max-md:min-h-9">
            <input
              type="checkbox"
              className="max-md:h-4 max-md:w-4"
              checked={hideEmpty}
              onChange={(e) => setHideEmpty(e.target.checked)}
            />
            Hide months with no data
          </label>
        </div>
        {mobile ? (
          <div className="mt-4">
            <MonthsMobileList months={tableRows} />
          </div>
        ) : (
        <div className="mt-4 overflow-x-auto max-md:hidden">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs font-semibold text-ink-soft">
                <th className="px-3 py-2">Month</th>
                <th className="px-3 py-2">Revenue</th>
                <th className="px-3 py-2">Expenses</th>
                <th className="px-3 py-2">Profit</th>
                <th className="px-3 py-2">Margin</th>
                <th className="px-3 py-2">Orders</th>
                <th className="px-3 py-2">Units sold</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((m) => {
                const margin = m.revenue > 0 ? (m.profit / m.revenue) * 100 : 0;
                return (
                  <tr key={m.month} className="border-b border-line/60">
                    <td className="px-3 py-2 font-semibold text-ink">{m.monthLabel}</td>
                    <td className="px-3 py-2">{currency(m.revenue)}</td>
                    <td className="px-3 py-2">{currency(m.expenses)}</td>
                    <td className="px-3 py-2">{currency(m.profit)}</td>
                    <td className="px-3 py-2">{margin.toFixed(0)}%</td>
                    <td className="px-3 py-2">{m.orderCount}</td>
                    <td className="px-3 py-2">{m.unitsSold}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {tableRows.length === 0 && <p className="p-4 text-sm text-ink-soft">No data yet.</p>}
        </div>
        )}
      </section>
    </div>
  );
}

function KpiTile({ label, value, tile }: { label: string; value: string; tile: "peach" | "mint" | "lavender" | "sage" }) {
  return (
    <div className="rounded-card p-5 max-md:p-4" style={{ background: `var(--color-tile-${tile})` }}>
      <p className="text-xs font-semibold text-ink/70">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold text-ink">{value}</p>
    </div>
  );
}
