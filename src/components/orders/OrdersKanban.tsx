"use client";

import {
  formatOrderDate,
  orderUnits,
  unitsPerPackageMap,
  type Order,
} from "@/lib/orderTypes";
import type { Flavor, PackageType } from "@/lib/settings";
import { UnitsIcon } from "@/lib/icons";
import { useStages } from "@/components/ProductionStagesContext";
import { useVatView } from "@/components/VatViewContext";
import { OrderHoverCard } from "./OrderHoverCard";
import { ProductionStatusSelect } from "./StatusSelects";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currency = (n: number) => `₪${nf.format(n)}`;

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
  const { forOrder } = useVatView();
  /*
   * One column per live stage, in the owner's order. Archived stages are
   * left out — the board is where work is moved *to*, and a retired stage
   * is not a destination. An order still sitting in one shows up nowhere
   * on the board, which is the signal that it needs moving.
   */
  const columns = useStages().filter((stage) => !stage.archivedAt);

  return (
    /* One column per stage, as an inline template rather than a
       `grid-cols-N` class: the count comes from PRODUCTION_STATUS_LABEL,
       and Tailwind only generates classes it can find as literal text —
       an interpolated one would produce no columns at all. */
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
    >
      {columns.map((stage) => {
        const columnOrders = orders.filter((o) => o.productionStatus === stage.key);
        return (
          <div key={stage.key} className="rounded-card border border-line bg-card/60 p-3">
            <h3 className="flex items-center gap-1.5 px-1 text-sm font-bold text-ink">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
              {stage.label}{" "}
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
                    <p className="text-sm font-semibold text-ink">{currency(forOrder(order))}</p>
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
