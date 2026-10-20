"use client";

import { useMemo, useState } from "react";
import { Banknote, Check, CalendarRange, Receipt, TrendingUp, type LucideIcon } from "lucide-react";
import { UnitsIcon } from "@/lib/icons";
import type { MonthlyFinancials } from "@/lib/financials";
import type { Task } from "@/lib/tasks";
import type { StaffAccount } from "@/lib/settings";
import { LineChart } from "@/components/charts/LineChart";
import { useVatView } from "@/components/VatViewContext";
import { BarBreakdown, type BreakdownSlice } from "@/components/charts/BarBreakdown";
import { CHART_COLORS, EXPENSE_PALETTE } from "@/lib/chartPalette";
import { TaskList } from "@/components/tasks/TaskList";
import { SelectDropdown } from "@/components/orders/Dropdown";
import { count, currency } from "@/lib/money";
import { YearSwitch } from "@/components/YearSwitch";
import Link from "next/link";

export interface FlavorLine {
  month: number;
  flavorId: string;
  units: number;
}

interface FlavorMeta {
  id: number;
  name: string;
  colorBase: string;
}


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
  year,
  years,
  setup,
  flavors,
  flavorLines,
  tasks,
  staff,
}: {
  financials: MonthlyFinancials[];
  /** The year `financials` is in, and the years there is anything for — see `YearSwitch`. */
  year: number;
  years: number[];
  /** Which of the three first steps are done — see `SetupChecklist`. */
  setup: SetupState;
  flavors: FlavorMeta[];
  flavorLines: FlavorLine[];
  /** The shared to-do list, in the slot the period's orders used to fill. */
  tasks: Task[];
  /** Who a task can be given to — see `TaskList`. */
  staff: StaffAccount[];
}) {
  const [selectedMonth, setSelectedMonth] = useState<number | "all">("all");
  const { label: vatLabel } = useVatView();
  /*
   * The phone gets this pane now, where it did not get the one before it.
   * That pane was a ~620px fixed row template inside an absolutely
   * positioned scroller, listing orders that have a whole tab of their
   * own; a list of one-line tasks is the opposite on both counts, and is
   * exactly the sort of thing worth having in a pocket.
   *
   * Nothing on this page branches on the viewport any more — the period
   * picker renders both its shapes and hides each at the other's width,
   * which is the `PageSearch` pattern and paints neither of them twice.
   */

  /** The phone's period chip. `SelectDropdown` is keyed by string, so the
   *  month number round-trips through one. */
  const monthOptions = useMemo(
    () => [
      { id: "all", label: "All time" },
      ...financials.map((m) => ({ id: String(m.month), label: m.monthLabel })),
    ],
    [financials],
  );

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

  const expenseSlices: BreakdownSlice[] = Object.entries(scoped.expensesByCategory).map(([label, value], i) => ({
    label,
    value,
    color: EXPENSE_PALETTE[i % EXPENSE_PALETTE.length],
  }));

  const flavorSlices: BreakdownSlice[] = useMemo(() => {
    const scopedLines =
      selectedMonth === "all" ? flavorLines : flavorLines.filter((l) => l.month === selectedMonth);
    const byFlavor = new Map<string, number>();
    for (const line of scopedLines) {
      byFlavor.set(line.flavorId, (byFlavor.get(line.flavorId) ?? 0) + line.units);
    }
    return Array.from(byFlavor.entries()).map(([flavorId, units]) => {
      const flavor = flavors.find((f) => String(f.id) === flavorId);
      return { label: flavor?.name ?? "Unknown", value: units, color: flavor?.colorBase ?? CHART_COLORS.slate.colorBase };
    });
  }, [flavorLines, flavors, selectedMonth]);

  const highlightIndex = selectedMonth === "all" ? null : financials.findIndex((m) => m.month === selectedMonth);
  const comparedTo = comparison ? `vs ${comparison.previous.monthLabel}` : null;

  return (
    /* A step tighter on a phone (`gap-4`), where 24px between every block
       was most of a screen of cream by the bottom of the page. */
    <div className="flex flex-col gap-6 max-md:gap-4">
      <SetupChecklist setup={setup} />
      <div className="flex items-center gap-2 max-md:flex-wrap">
        <YearSwitch year={year} years={years} path="/" />
        {/* A row of pills is the right control for a period on a laptop and
            the wrong one on a phone: `financials` carries a month per month
            with activity, so this is up to twelve of them plus All, in a row
            that cannot wrap. Both copies are rendered and each hidden at the
            other's width — the `PageSearch` pattern — rather than branching
            on `useIsMobile`, which would paint the pills for a frame first. */}
        <div className="flex items-center gap-2 max-md:hidden">
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
        {/* The same chip the Expenses page wears on a phone, down to the
            icon: below the breakpoint a `Dropdown` opens as a bottom sheet
            with 44px rows, so one tab over is not a second set of rules. */}
        <div className="md:hidden">
          <SelectDropdown
            label="When"
            icon={<CalendarRange size={14} />}
            options={monthOptions}
            value={selectedMonth === "all" ? "all" : String(selectedMonth)}
            onChange={(id) => setSelectedMonth(id === "all" ? "all" : Number(id))}
            active={selectedMonth !== "all"}
          />
        </div>
        {/* Which convention the money is in, at the top right of the page
            rather than on a line of its own above the tiles: it qualifies
            every figure below it, and a full-width row spent on six words
            pushed the tiles down for nothing. */}
        <p className="ml-auto shrink-0 text-xs font-semibold text-ink-soft">All figures {vatLabel}</p>
      </div>
      {/* Two across on a phone, not the three-in-a-row the Orders summary
          uses: there the tiles are a rail beside the list and the list is
          the subject, while here the figures *are* the page — which is what
          the owner asked for — so they get the second row of height. */}
      <div className="motion-stagger grid grid-cols-4 gap-4 max-md:grid-cols-2 max-md:gap-3">
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

      {/* One column on a phone. Both halves of this are needed together:
          with the orders pane gone but the template intact, the charts
          would sit in the 65fr slot with a third of the page empty. */}
      <div className="grid min-w-0 grid-cols-[65fr_35fr] gap-6 max-md:grid-cols-1 max-md:gap-4">
        {/*
          The task list, where the period's orders used to be.

          The owner's call, and the reasoning is that the orders had a
          whole tab of their own while the things the two of them owe each
          other had nowhere at all — they lived in WhatsApp, where they
          scroll away. The pane it replaced is parked whole in
          `DashboardOrdersPane.tsx` rather than deleted, because they said
          they might want it back.

          Rendered on a phone as well as a laptop, unlike the pane before
          it: this one is worth working from a phone, and it is short. The
          bottom bar carries `/tasks` for exactly that.

          **No pane around it on a phone** (v0.80): every task is a box of
          its own already, and a box of boxes cost 32px of width from each
          of them and drew two edges where one says it.
        */}
        <section className="flex min-w-0 flex-col rounded-card border border-line bg-card p-6 max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:p-0">
          <TaskList tasks={tasks} staff={staff} />
        </section>


        <div className="flex min-w-0 flex-col gap-6 max-md:gap-4">
          <section className="min-w-0 rounded-card border border-line bg-card p-6 max-md:p-4">
            <h2 className="font-display text-base font-bold text-ink">Revenue &amp; profit trend</h2>
            <div className="mt-4">
              <LineChart
                xLabels={financials.map((m) => m.monthLabel)}
                highlightIndex={highlightIndex}
                series={[
                  { label: "Revenue", color: CHART_COLORS.sage, values: financials.map((m) => m.revenue) },
                  { label: "Profit", color: CHART_COLORS.plum, values: financials.map((m) => m.profit) },
                ]}
              />
            </div>
          </section>

          <section className="min-w-0 rounded-card border border-line bg-card p-6 max-md:p-4">
            <h2 className="font-display text-base font-bold text-ink">Expense category split</h2>
            <div className="mt-4">
              <BarBreakdown slices={expenseSlices} />
            </div>
          </section>

          <section className="min-w-0 rounded-card border border-line bg-card p-6 max-md:p-4">
            <h2 className="font-display text-base font-bold text-ink">Flavor split</h2>
            <div className="mt-4">
              <BarBreakdown slices={flavorSlices} valueFormat={(v) => `${count(v)} units`} />
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
    <div data-jiggle className="rounded-card p-5 max-md:p-4" style={{ background: `var(--color-tile-${tile})` }}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold text-ink/70">{label}</p>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black text-cream">
          <Icon size={13} />
        </span>
      </div>
      <p className="mt-1 font-display text-2xl font-extrabold text-ink">{value}</p>
      <p className="mt-1 text-[11px] font-semibold" title={comparedTo ?? "No earlier month to compare against"}>
        <span className={deltaColor}>{deltaText}</span>{" "}
        <span className="font-medium text-ink-soft">{comparedTo ?? "no prior month"}</span>
      </p>
    </div>
  );
}

interface SetupState {
  prices: boolean;
  flavors: boolean;
  orders: boolean;
}

/**
 * What a brand-new dashboard says instead of a page of empty charts
 * (v0.87): the three things that have to exist before any figure here can
 * mean anything, each ticked once it does and linked to where it is done.
 * Gone for good once all three are — so on a dashboard already in use it
 * never draws at all.
 */
function SetupChecklist({ setup }: { setup: SetupState }) {
  if (setup.prices && setup.flavors && setup.orders) return null;
  const steps = [
    { done: setup.prices, text: "Set your prices", hint: "Settings → Lists & prices", href: "/settings?tab=lists" },
    { done: setup.flavors, text: "Add your flavours", hint: "Settings → Flavors", href: "/settings?tab=flavors" },
    { done: setup.orders, text: "Take the first order", hint: "Orders → Add order", href: "/orders" },
  ];
  return (
    <section className="rounded-card border border-line bg-card p-5">
      <h2 className="font-display text-lg font-bold text-ink">Getting set up</h2>
      <p className="mt-0.5 text-sm text-ink-soft">The figures on this page fill in once these three are done.</p>
      <ol className="mt-3 flex flex-col gap-2">
        {steps.map((step) => (
          <li key={step.text}>
            <Link href={step.href} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-ink/5">
              <span
                aria-hidden
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                  step.done ? "border-accent bg-accent text-cream" : "border-line"
                }`}
              >
                {step.done && <Check size={14} />}
              </span>
              <span className={`text-sm font-semibold ${step.done ? "text-ink-soft line-through" : "text-ink"}`}>
                {step.text}
                <span className="sr-only">{step.done ? " (done)" : ""}</span>
              </span>
              <span className="ml-auto text-xs text-ink-soft">{step.hint}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
