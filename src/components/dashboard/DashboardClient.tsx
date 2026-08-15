"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Banknote, MapPin, Receipt, TrendingUp, Users, type LucideIcon } from "lucide-react";
import { UnitsIcon } from "@/lib/icons";
import type { MonthlyFinancials } from "@/lib/financials";
import { LineChart } from "@/components/charts/LineChart";
import { DonutChart, type DonutSlice } from "@/components/charts/DonutChart";
import { EXPENSE_PALETTE, SERIES_COLORS } from "@/lib/chartPalette";
import { EventTypeChip } from "@/components/orders/EventTypeChip";

export interface FlavorLine {
  month: number;
  flavorId: string;
  units: number;
}

export interface OrderPreview {
  key: string;
  month: number;
  day: number | null;
  dateLabel: string;
  customer: string;
  customerType: string;
  location: string;
  guests: number | null;
  totalAmount: number;
  units: number;
}

interface FlavorMeta {
  id: number;
  name: string;
  colorBase: string;
}

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currency = (n: number) => `₪${nf.format(n)}`;
const count = (n: number) => nf.format(n);

/** The KPI metrics, named so a tile's value and its percentage can't be mismatched. */
type Metric = "revenue" | "profit" | "orderCount" | "unitsSold";

const KPI_TILES: {
  metric: Metric;
  label: string;
  tile: "peach" | "mint" | "lavender" | "sage";
  Icon: LucideIcon;
  format: (value: number) => string;
}[] = [
  { metric: "revenue", label: "Revenue", tile: "peach", Icon: Banknote, format: currency },
  { metric: "profit", label: "Profit", tile: "mint", Icon: TrendingUp, format: currency },
  { metric: "orderCount", label: "Orders", tile: "lavender", Icon: Receipt, format: count },
  { metric: "unitsSold", label: "Units sold", tile: "sage", Icon: UnitsIcon, format: count },
];

/**
 * Percentage change against the previous month. Null whenever there is no
 * honest number to show — no earlier month, or an earlier month of zero,
 * where a percentage would be infinite rather than large.
 */
function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function DashboardClient({
  financials,
  flavors,
  flavorLines,
  orders,
}: {
  financials: MonthlyFinancials[];
  flavors: FlavorMeta[];
  flavorLines: FlavorLine[];
  orders: OrderPreview[];
}) {
  const [selectedMonth, setSelectedMonth] = useState<number | "all">("all");

  const scoped = useMemo(() => {
    if (selectedMonth === "all") {
      return {
        revenue: financials.reduce((sum, m) => sum + m.revenue, 0),
        profit: financials.reduce((sum, m) => sum + m.profit, 0),
        orderCount: financials.reduce((sum, m) => sum + m.orderCount, 0),
        unitsSold: financials.reduce((sum, m) => sum + m.unitsSold, 0),
        expensesByCategory: financials.reduce<Record<string, number>>((acc, m) => {
          for (const [cat, amount] of Object.entries(m.expensesByCategory)) {
            acc[cat] = (acc[cat] ?? 0) + amount;
          }
          return acc;
        }, {}),
      };
    }
    const month = financials.find((m) => m.month === selectedMonth);
    return {
      revenue: month?.revenue ?? 0,
      profit: month?.profit ?? 0,
      orderCount: month?.orderCount ?? 0,
      unitsSold: month?.unitsSold ?? 0,
      expensesByCategory: month?.expensesByCategory ?? {},
    };
  }, [financials, selectedMonth]);

  /**
   * What the KPI percentages compare. On a specific month it's that month
   * against the one before it. On "All" the tiles show all-time totals,
   * which have nothing to compare against — so the percentages fall back
   * to the latest month vs. the month before it, which is the useful
   * reading of "how are we trending" for the default view.
   *
   * "The month before" means the previous month that has data: financials
   * only contains months with activity, matching the month pills above.
   */
  const comparison = useMemo(() => {
    const index =
      selectedMonth === "all"
        ? financials.length - 1
        : financials.findIndex((m) => m.month === selectedMonth);
    if (index < 1) return null;
    return { current: financials[index], previous: financials[index - 1] };
  }, [financials, selectedMonth]);

  const deltaFor = (metric: Metric): number | null =>
    comparison ? percentChange(comparison.current[metric], comparison.previous[metric]) : null;

  const expenseSlices: DonutSlice[] = Object.entries(scoped.expensesByCategory).map(([label, value], i) => ({
    label,
    value,
    color: EXPENSE_PALETTE[i % EXPENSE_PALETTE.length],
  }));

  const flavorSlices: DonutSlice[] = useMemo(() => {
    const scopedLines =
      selectedMonth === "all" ? flavorLines : flavorLines.filter((l) => l.month === selectedMonth);
    const byFlavor = new Map<string, number>();
    for (const line of scopedLines) {
      byFlavor.set(line.flavorId, (byFlavor.get(line.flavorId) ?? 0) + line.units);
    }
    return Array.from(byFlavor.entries()).map(([flavorId, units]) => {
      const flavor = flavors.find((f) => String(f.id) === flavorId);
      return { label: flavor?.name ?? "Unknown", value: units, color: flavor?.colorBase ?? "#726A5E" };
    });
  }, [flavorLines, flavors, selectedMonth]);

  const previewOrders = (selectedMonth === "all" ? orders : orders.filter((o) => o.month === selectedMonth)).slice(
    0,
    8,
  );

  const highlightIndex = selectedMonth === "all" ? null : financials.findIndex((m) => m.month === selectedMonth);
  const comparedTo = comparison ? `vs ${comparison.previous.monthLabel}` : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSelectedMonth("all")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            selectedMonth === "all" ? "bg-black text-cream" : "bg-card text-ink-soft hover:text-ink"
          }`}
        >
          All
        </button>
        {financials.map((m) => (
          <button
            key={m.month}
            onClick={() => setSelectedMonth(m.month)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              selectedMonth === m.month ? "bg-black text-cream" : "bg-card text-ink-soft hover:text-ink"
            }`}
          >
            {m.monthLabel}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-4">
        {KPI_TILES.map(({ metric, label, tile, Icon, format }) => (
          <KpiTile
            key={metric}
            label={label}
            value={format(scoped[metric])}
            tile={tile}
            Icon={Icon}
            delta={deltaFor(metric)}
            comparedTo={comparedTo}
          />
        ))}
      </div>

      <div className="grid min-w-0 grid-cols-[65fr_35fr] gap-6">
        <section className="min-w-0 rounded-card border border-line bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-ink">Latest orders</h2>
            <Link href="/orders" className="text-sm font-semibold text-accent hover:underline">
              View all →
            </Link>
          </div>
          <ul className="mt-4 flex flex-col gap-2">
            {previewOrders.map((order) => (
              <li key={order.key}>
                <Link
                  href={`/orders?order=${encodeURIComponent(order.key)}`}
                  className="hover-line flex items-center gap-3 rounded-xl border border-line px-3 py-2 text-sm"
                >
                  <span className="w-14 shrink-0 text-xs text-ink-soft">{order.dateLabel}</span>
                  <span className="w-40 shrink-0 truncate font-medium text-ink" title={order.customer}>
                    {order.customer}
                  </span>
                  <EventTypeChip value={order.customerType} className="w-28 shrink-0" />
                  <span className="flex min-w-0 flex-1 items-center gap-1 text-xs text-ink-soft">
                    <MapPin size={12} className="shrink-0" />
                    <span className="truncate" title={order.location}>
                      {order.location || "—"}
                    </span>
                  </span>
                  <span className="flex w-14 shrink-0 items-center gap-1 text-xs text-ink-soft">
                    <Users size={12} className="shrink-0" />
                    {order.guests ?? "—"}
                  </span>
                  <span className="flex w-16 shrink-0 items-center justify-end gap-1 text-xs text-ink-soft">
                    <UnitsIcon size={12} className="shrink-0" />
                    {order.units > 0 ? nf.format(order.units) : "—"}
                  </span>
                  <span className="w-20 shrink-0 text-right font-semibold text-ink">
                    {currency(order.totalAmount)}
                  </span>
                </Link>
              </li>
            ))}
            {previewOrders.length === 0 && <p className="text-sm text-ink-soft">No orders in this period.</p>}
          </ul>
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          <section className="min-w-0 rounded-card border border-line bg-card p-6">
            <h2 className="font-display text-base font-bold text-ink">Revenue &amp; profit trend</h2>
            <div className="mt-4">
              <LineChart
                xLabels={financials.map((m) => m.monthLabel)}
                highlightIndex={highlightIndex}
                series={[
                  { label: "Revenue", color: SERIES_COLORS.sage, values: financials.map((m) => m.revenue) },
                  { label: "Profit", color: SERIES_COLORS.berry, values: financials.map((m) => m.profit) },
                ]}
              />
            </div>
          </section>

          <section className="min-w-0 rounded-card border border-line bg-card p-6">
            <h2 className="font-display text-base font-bold text-ink">Expense category split</h2>
            <div className="mt-4">
              <DonutChart slices={expenseSlices} />
            </div>
          </section>

          <section className="min-w-0 rounded-card border border-line bg-card p-6">
            <h2 className="font-display text-base font-bold text-ink">Flavor split</h2>
            <div className="mt-4">
              <DonutChart slices={flavorSlices} valueFormat={(v) => `${nf.format(v)} units`} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}


function KpiTile({
  label,
  value,
  tile,
  Icon,
  delta,
  comparedTo,
}: {
  label: string;
  value: string;
  tile: "peach" | "mint" | "lavender" | "sage";
  Icon: LucideIcon;
  /** Percentage change vs the previous month, or null when there's nothing to compare against. */
  delta: number | null;
  comparedTo: string | null;
}) {
  // Higher is better on all four metrics, so one colour rule covers them.
  const deltaColor = delta === null ? "" : delta > 0 ? "text-accent" : delta < 0 ? "text-red-700" : "text-ink/60";
  const deltaText = delta === null ? "—" : `${delta > 0 ? "+" : ""}${Math.round(delta)}%`;

  return (
    <div className="rounded-card p-5" style={{ background: `var(--color-tile-${tile})` }}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold text-ink/70">{label}</p>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black text-cream">
          <Icon size={13} />
        </span>
      </div>
      <p className="mt-1 font-display text-2xl font-extrabold text-ink">{value}</p>
      <p className="mt-1 text-[11px] font-semibold" title={comparedTo ?? "No earlier month to compare against"}>
        <span className={deltaColor}>{deltaText}</span>{" "}
        <span className="font-medium text-ink/50">{comparedTo ?? "no prior month"}</span>
      </p>
    </div>
  );
}
