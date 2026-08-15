"use client";

import { useMemo, useState } from "react";
import type { MonthlyFinancials } from "@/lib/financials";
import { LineChart } from "@/components/charts/LineChart";
import { SERIES_COLORS } from "@/lib/chartPalette";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currency = (n: number) => `₪${nf.format(n)}`;

export function BizPlanClient({ financials }: { financials: MonthlyFinancials[] }) {
  const [hideEmpty, setHideEmpty] = useState(true);

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

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-5 gap-4">
        <KpiTile label="YTD Revenue" value={currency(ytd.revenue)} tile="peach" />
        <KpiTile label="YTD Profit" value={currency(ytd.profit)} tile="mint" />
        <KpiTile label="YTD Orders" value={nf.format(ytd.orders)} tile="lavender" />
        <KpiTile label="YTD Units sold" value={nf.format(ytd.units)} tile="sage" />
        <KpiTile label="Avg order value" value={currency(avgOrderValue)} tile="peach" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <section className="rounded-card border border-line bg-card p-6">
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

        <section className="rounded-card border border-line bg-card p-6">
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

      <section className="rounded-card border border-line bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">Year</h2>
          <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
            <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} />
            Hide months with no data
          </label>
        </div>
        <div className="mt-4 overflow-x-auto">
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
      </section>
    </div>
  );
}

function KpiTile({ label, value, tile }: { label: string; value: string; tile: "peach" | "mint" | "lavender" | "sage" }) {
  return (
    <div className="rounded-card p-5" style={{ background: `var(--color-tile-${tile})` }}>
      <p className="text-xs font-semibold text-ink/70">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold text-ink">{value}</p>
    </div>
  );
}
