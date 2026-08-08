"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MonthlyFinancials } from "@/lib/financials";
import { LineChart } from "@/components/charts/LineChart";
import { DonutChart, type DonutSlice } from "@/components/charts/DonutChart";
import { EXPENSE_PALETTE } from "@/lib/chartPalette";

export interface FlavorLine {
  month: number;
  flavorId: string | null;
  units: number;
}

export interface OrderPreview {
  key: string;
  month: number;
  day: number | null;
  customer: string;
  totalAmount: number;
  paymentStatusLabel: string;
}

interface FlavorMeta {
  id: number;
  name: string;
  colorBase: string;
}

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currency = (n: number) => `₪${nf.format(n)}`;

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
      const key = line.flavorId ?? "mix";
      byFlavor.set(key, (byFlavor.get(key) ?? 0) + line.units);
    }
    return Array.from(byFlavor.entries()).map(([key, units]) => {
      if (key === "mix") return { label: "Mix", value: units, color: "#726A5E" };
      const flavor = flavors.find((f) => String(f.id) === key);
      return { label: flavor?.name ?? "Unknown", value: units, color: flavor?.colorBase ?? "#726A5E" };
    });
  }, [flavorLines, flavors, selectedMonth]);

  const previewOrders = (selectedMonth === "all" ? orders : orders.filter((o) => o.month === selectedMonth)).slice(
    0,
    8,
  );

  const highlightIndex = selectedMonth === "all" ? null : financials.findIndex((m) => m.month === selectedMonth);

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
        <KpiTile label="Revenue" value={currency(scoped.revenue)} tile="peach" />
        <KpiTile label="Profit" value={currency(scoped.profit)} tile="mint" />
        <KpiTile label="Orders" value={nf.format(scoped.orderCount)} tile="lavender" />
        <KpiTile label="Units sold" value={nf.format(scoped.unitsSold)} tile="sage" />
      </div>

      <div className="grid grid-cols-[1fr_1.4fr] gap-6">
        <section className="rounded-card border border-line bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-ink">Orders</h2>
            <Link href="/orders" className="text-sm font-semibold text-accent hover:underline">
              View all →
            </Link>
          </div>
          <ul className="mt-4 flex flex-col gap-2">
            {previewOrders.map((order) => (
              <li key={order.key} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm">
                <span className="font-medium text-ink">{order.customer}</span>
                <span className="text-ink-soft">{order.paymentStatusLabel}</span>
                <span className="font-semibold text-ink">{currency(order.totalAmount)}</span>
              </li>
            ))}
            {previewOrders.length === 0 && <p className="text-sm text-ink-soft">No orders in this period.</p>}
          </ul>
        </section>

        <div className="flex flex-col gap-6">
          <section className="rounded-card border border-line bg-card p-6">
            <h2 className="font-display text-base font-bold text-ink">Revenue & profit trend</h2>
            <div className="mt-4">
              <LineChart
                xLabels={financials.map((m) => m.monthLabel)}
                highlightIndex={highlightIndex}
                series={[
                  { label: "Revenue", color: "#4f6f52", values: financials.map((m) => m.revenue) },
                  { label: "Profit", color: "#201d19", values: financials.map((m) => m.profit) },
                ]}
              />
            </div>
          </section>

          <section className="rounded-card border border-line bg-card p-6">
            <h2 className="font-display text-base font-bold text-ink">Expense category split</h2>
            <div className="mt-4">
              <DonutChart slices={expenseSlices} />
            </div>
          </section>

          <section className="rounded-card border border-line bg-card p-6">
            <h2 className="font-display text-base font-bold text-ink">Flavor split</h2>
            <div className="mt-4">
              <DonutChart slices={flavorSlices} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function KpiTile({ label, value, tile }: { label: string; value: string; tile: "peach" | "mint" | "lavender" | "sage" }) {
  return (
    <div className={`rounded-card p-5`} style={{ background: `var(--color-tile-${tile})` }}>
      <p className="text-xs font-semibold text-ink/70">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold text-ink">{value}</p>
    </div>
  );
}
