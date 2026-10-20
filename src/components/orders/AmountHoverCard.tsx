"use client";

import type { ReactNode } from "react";
import {
  ORDER_EXTRAS,
  orderDiscount,
  orderSubtotal,
  orderVatOn,
  type Order,
} from "@/lib/orderTypes";
import { HoverCard } from "@/components/HoverCard";
import { useVatView } from "@/components/VatViewContext";
import { currency } from "@/lib/money";

const CARD_WIDTH = 250;
/** Enough for every row at once, used only to keep the card on screen. */
const CARD_HEIGHT = 340;

/**
 * The Amount column, spelled out on hover: the jelly, every extra the
 * order carries — delivery, display, waitressing, kosher — the discount,
 * VAT, and what is still owed.
 *
 * The extras are read from `ORDER_EXTRAS`, the same list `orderSubtotal`
 * sums, so this card and the figure in the cell cannot disagree about
 * what counts: an extra added to that list shows up here with no edit.
 * Only the extras that apply are drawn — an order with no delivery has no
 * delivery row, rather than a "₪0" nobody needs to read.
 *
 * Drawn in negative, like the order form's money rail, which is the same
 * statement at full size.
 */
export function AmountHoverCard({ order, children }: { order: Order; children: ReactNode }) {
  const { view } = useVatView();
  return (
    <HoverCard
      width={CARD_WIDTH}
      height={CARD_HEIGHT}
      tone="ink"
      className="w-fit"
      render={() => {
        const extras = ORDER_EXTRAS.filter((extra) => extra.applies(order));
        const discount = orderDiscount(order);
        const { net, vat, gross } = orderVatOn(order);
        const balance = gross - order.deposit;
        return (
          <div className="flex flex-col gap-1 text-xs">
            <Row label="Jelly" value={order.totalAmount} />
            {extras.map((extra) => (
              <Row key={extra.id} label={extra.label} value={order[extra.cost] ?? 0} />
            ))}
            {discount > 0 && (
              <>
                <Rule />
                <Row label="Subtotal" value={orderSubtotal(order)} />
                <Row
                  label={order.discountIsPercent ? `Discount ${order.discount}%` : "Discount"}
                  value={-discount}
                />
              </>
            )}
            <Rule />
            {/* VAT stated the way the order states it: added on top of
                what was agreed, or already inside it. Nothing at all on an
                exempt order, where the row would be a zero. */}
            {vat > 0 && order.vatMode === "added" && (
              <>
                <Row label="Before VAT" value={net} />
                <Row label={`VAT ${order.vatRate}%`} value={vat} />
              </>
            )}
            <Row label="Total" value={gross} strong />
            {vat > 0 && order.vatMode !== "added" && (
              <Row label={`of which VAT ${order.vatRate}%`} value={vat} quiet />
            )}
            {/* The cell follows the nav's VAT switch, so on the net view
                the figure in the column is this one — say which it was. */}
            {view === "net" && vat > 0 && <Row label="Excl. VAT (shown)" value={net} quiet />}
            {order.deposit > 0 && (
              <>
                <Rule />
                <Row label="Deposit" value={-order.deposit} />
                <Row label={balance < 0 ? "Overpaid by" : "Still due"} value={Math.abs(balance)} strong />
              </>
            )}
          </div>
        );
      }}
    >
      {children}
    </HoverCard>
  );
}

function Row({
  label,
  value,
  strong = false,
  quiet = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
  quiet?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 ${
        strong ? "text-sm font-bold text-cream" : quiet ? "text-cream/50" : "text-cream/80"
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{currency(value)}</span>
    </div>
  );
}

function Rule() {
  return <div className="my-1 border-t border-cream/20" />;
}
