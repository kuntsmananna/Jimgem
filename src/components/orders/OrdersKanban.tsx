"use client";

import { PRODUCTION_STATUS_LABEL, formatOrderDate, type Order, type ProductionStatus } from "@/lib/orderTypes";
import type { Flavor, PackageType } from "@/lib/settings";
import { ContentChips } from "./ContentChips";
import { ProductionStatusSelect } from "./StatusSelects";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currency = (n: number) => `₪${nf.format(n)}`;

const COLUMNS: { key: ProductionStatus | "unset"; label: string }[] = [
  { key: "unset", label: "Not tracked" },
  { key: "queue", label: PRODUCTION_STATUS_LABEL.queue },
  { key: "preparing", label: PRODUCTION_STATUS_LABEL.preparing },
  { key: "delivered", label: PRODUCTION_STATUS_LABEL.delivered },
];

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
    <div className="grid grid-cols-4 gap-4">
      {COLUMNS.map((col) => {
        const columnOrders = orders.filter((o) => (o.productionStatus ?? "unset") === col.key);
        return (
          <div key={col.key} className="rounded-card border border-line bg-card/60 p-3">
            <h3 className="px-1 text-sm font-bold text-ink">
              {col.label} <span className="font-normal text-ink-soft">({columnOrders.length})</span>
            </h3>
            <div className="mt-3 flex flex-col gap-2">
              {columnOrders.map((order) => (
                <div key={order.key} className="group rounded-xl border border-line bg-card p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => onOpen(order.key)}
                      className="text-left text-sm font-semibold text-ink hover:underline"
                    >
                      {order.customer || "(no name)"}
                    </button>
                    <p className="text-xs text-ink-soft">{formatOrderDate(order.date)}</p>
                  </div>
                  <div className="mt-2">
                    <ContentChips lines={order.contentLines} flavors={flavors} packageTypes={packageTypes} />
                  </div>
                  <div className="mt-2 hidden text-xs text-ink-soft group-hover:block">
                    {order.location && <p>{order.location}</p>}
                    {order.guests !== null && <p>{order.guests} guests</p>}
                    {order.mirrors !== null && <p>{order.mirrors} mirrors</p>}
                    {order.notes && <p>{order.notes}</p>}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-ink">{currency(order.totalAmount)}</p>
                    <ProductionStatusSelect order={order} onChanged={onChanged} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
