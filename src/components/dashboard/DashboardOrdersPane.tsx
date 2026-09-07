import Link from "next/link";
import { MapPin, Users } from "lucide-react";
import { UnitsIcon } from "@/lib/icons";
import { EventTypeChip } from "@/components/orders/EventTypeChip";
import { count, currency } from "@/lib/money";
import { MONTH_NAMES_EN } from "@/lib/financials";
import { orderDay, orderMonth, orderUnits, type Order } from "@/lib/orders";
import { orderNet, orderTotal } from "@/lib/orderTypes";
import type { VatView } from "@/lib/vatView";

/**
 * One order, flattened for the Dashboard's list — see `buildOrderPreviews`.
 */
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

/**
 * The Dashboard's list of the period's orders — **kept, and not currently
 * rendered.**
 *
 * The task list took this slot (v0.64.0), at the owner's request and with
 * the explicit note that they might want this back. So it is parked here
 * whole rather than deleted: the component, its `OrderPreview` shape and
 * the `buildOrderPreviews` that fills it from real orders, all in one file
 * with nothing else depending on them.
 *
 * Putting it back: in `src/app/(app)/page.tsx`, call
 * `buildOrderPreviews`, render `<DashboardOrdersPane orders={…} />` and
 * hand that element to `DashboardClient` as a prop, to sit in the 65fr
 * slot beside the charts where `TaskList` now is.
 *
 * **This file is deliberately not `"use client"`, and must not become
 * one.** `buildOrderPreviews` reaches `@/lib/orders`, which pulls
 * `@neondatabase/serverless` and `googleapis` with it, so importing this
 * from a Client Component would put both in the browser bundle — the trap
 * CLAUDE.md names about `src/lib/**`. The pane has no hooks and needs
 * none: it renders on the server and hands `EventTypeChip` (which is a
 * Client Component, and finds its context provider above it in the tree)
 * the values it needs. That is why revival goes through the page rather
 * than through `DashboardClient`.
 *
 * It is parked in a file of its own rather than left threaded through the
 * page and the client as unused props, which is how dead code stops
 * type-checking and quietly rots. Everything it needs is here, so it still
 * compiles with the rest of the app and cannot drift out of date silently.
 *
 * Why the pane is shaped the way it is, kept from when it was live: the
 * list is *every* order in the selected period, delivered ones included —
 * it used to be the latest few still needing work, which answers a
 * different question and gets "all orders in May" wrong. It fills the pane
 * and scrolls inside it, from a scroller absolutely positioned in a box
 * claiming only a minimum height, so the charts beside it set the height
 * and the list takes it; sized by its own content instead, all-time's rows
 * would drive the row and strand those charts at the top of a very long
 * page.
 */
export function DashboardOrdersPane({ orders: previewOrders }: { orders: OrderPreview[] }) {
  return (
    <section className="flex min-w-0 flex-col rounded-card border border-line bg-card p-6 max-md:hidden">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">
          Orders{" "}
          <span className="font-normal text-ink-soft">({count(previewOrders.length)})</span>
        </h2>
        <Link href="/orders" className="text-sm font-semibold text-accent hover:underline">
          View all →
        </Link>
      </div>
      {/*
        The list fills the pane and scrolls inside it, rather than
        being a fixed 32rem with cream below: the pane is as tall as
        the charts beside it, and a list that stopped short left a
        third of it empty.

        The scroller is absolutely positioned inside a box that only
        claims a minimum height, which is what stops it working the
        other way round — 79 rows would otherwise make this column
        drive the row's height and strand the charts at the top of a
        very long page. So the charts set the height and the list
        takes it.
      */}
      <div className="relative mt-4 min-h-[22rem] flex-1">
      <ul className="absolute inset-0 flex flex-col gap-2 overflow-y-auto pr-1">
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
                {order.units > 0 ? count(order.units) : "—"}
              </span>
              <span className="w-20 shrink-0 text-right font-semibold text-ink">
                {currency(order.totalAmount)}
              </span>
            </Link>
          </li>
        ))}
        {previewOrders.length === 0 && <p className="text-sm text-ink-soft">No orders in this period.</p>}
      </ul>
      </div>
    </section>
  );
}

/**
 * Flatten real orders into the shape above — the other half of putting
 * this pane back, lifted out of `src/app/(app)/page.tsx` with it.
 *
 * Server-side: it reaches `orders.ts` and `orderTypes.ts`, so it must not
 * be called from a Client Component. `totalAmount` is in the viewer's own
 * VAT convention, matching the KPI tiles the list sits under.
 */
export function buildOrderPreviews(
  orders: Order[],
  unitsByPackageType: Map<number, number>,
  vatView: VatView,
): OrderPreview[] {
  return orders
    .map((order) => {
      const month = orderMonth(order);
      const day = orderDay(order);
      return {
        key: order.key,
        month,
        day,
        dateLabel: month !== null ? `${MONTH_NAMES_EN[month - 1]}${day ? ` ${day}` : ""}` : order.date,
        customer: order.customer || "(no name)",
        customerType: order.customerType,
        location: order.location,
        guests: order.guests,
        totalAmount: vatView === "net" ? orderNet(order) : orderTotal(order),
        units: orderUnits(order.packageLines, unitsByPackageType),
      };
    })
    .filter((preview): preview is OrderPreview & { month: number } => preview.month !== null)
    .sort((a, b) => b.month - a.month || (b.day ?? 0) - (a.day ?? 0));
}
