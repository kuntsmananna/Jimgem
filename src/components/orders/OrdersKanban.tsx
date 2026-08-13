"use client";

import { PRODUCTION_STATUS_LABEL, formatOrderDate, type Order, type ProductionStatus } from "@/lib/orderTypes";
import type { Flavor, PackageType } from "@/lib/settings";
import { ContentChips } from "./ContentChips";
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
              {columnOrders.map((order) => (
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
                  <div className="mt-2">
                    <ContentChips lines={order.contentLines} flavors={flavors} packageTypes={packageTypes} />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-ink">{currency(order.totalAmount)}</p>
                    <ProductionStatusSelect order={order} onChanged={onChanged} />
                  </div>
                </OrderHoverCard>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
