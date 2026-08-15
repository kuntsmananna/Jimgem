"use client";

import {
  PRODUCTION_STATUS_LABEL,
  formatOrderDate,
  orderTotal,
  orderUnits,
  unitsPerPackageMap,
  type Order,
  type ProductionStatus,
} from "@/lib/orderTypes";
import type { Flavor, PackageType } from "@/lib/settings";
import { UnitsIcon } from "@/lib/icons";
import { OrderHoverCard } from "./OrderHoverCard";
import { ProductionStatusSelect } from "./StatusSelects";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currency = (n: number) => `₪${nf.format(n)}`;

// Every order has a production status (the column is NOT NULL), so there
// is no "not tracked" bucket to show.
const COLUMNS = Object.keys(PRODUCTION_STATUS_LABEL) as ProductionStatus[];

export function OrdersKanban({
  orders,
  flavors,
  packageTypes,
  onChanged,
  onOpen,
}: {
  orders: Order[];
  flavors: Flavor[];
  packageTypes: PackageType[];
  onChanged: () => void;
  onOpen: (key: string) => void;
}) {
  const unitsPerPackage = unitsPerPackageMap(packageTypes);

  return (
    <div className="grid grid-cols-3 gap-4">
      {COLUMNS.map((status) => {
        const columnOrders = orders.filter((o) => o.productionStatus === status);
        return (
          <div key={status} className="rounded-card border border-line bg-card/60 p-3">
            <h3 className="px-1 text-sm font-bold text-ink">
              {PRODUCTION_STATUS_LABEL[status]}{" "}
              <span className="font-normal text-ink-soft">({columnOrders.length})</span>
            </h3>
            <div className="mt-3 flex flex-col gap-2">
              {/*
                The card stays a summary — location/guests/mirrors/notes
                used to expand it in place on hover, which reflowed the
                whole column. They live in the hover card now.
              */}
              {columnOrders.map((order) => {
                const units = orderUnits(order.packageLines, unitsPerPackage);
                return (
                <OrderHoverCard
                  key={order.key}
                  order={order}
                  flavors={flavors}
                  packageTypes={packageTypes}
                  className="hover-line rounded-xl border border-line bg-card p-3 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => onOpen(order.key)}
                      className="text-left text-sm font-semibold text-ink"
                    >
                      {order.customer || "(no name)"}
                    </button>
                    <p className="text-xs text-ink-soft">{formatOrderDate(order.date)}</p>
                  </div>
                  {/* Units, not flavour chips: a card is a summary, and the
                      chips wrapped to three lines on a mixed order. The
                      hover card this sits inside carries the breakdown. */}
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
                    <UnitsIcon size={12} />
                    {units > 0 ? `${nf.format(units)} units` : "No packages yet"}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    {/* What the order is worth, extras included — the same
                        figure the order sheet calls Total. */}
                    <p className="text-sm font-semibold text-ink">{currency(orderTotal(order))}</p>
                    <ProductionStatusSelect order={order} onChanged={onChanged} />
                  </div>
                </OrderHoverCard>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
