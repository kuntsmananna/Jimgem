"use client";

import { Fragment } from "react";
import { Info } from "lucide-react";
import {
  formatOrderDate,
  orderUnits,
  PAYMENT_STATUS_LABEL,
  type Order,
  type PaymentStatus,
} from "@/lib/orderTypes";
import { UnitsIcon } from "@/lib/icons";
import { currency } from "@/lib/money";
import { useVatView } from "@/components/VatViewContext";
import { useStage } from "@/components/ProductionStagesContext";
import { EventTypeChip } from "./EventTypeChip";
import { StageChip } from "./StageChip";

/**
 * The Orders page on a phone: one card per order, under a heading per day.
 *
 * The table is fifteen columns and 1100px wide, which on a 390px screen is
 * three screens of sideways scrolling to read one row. A card is the same
 * order with the six things worth knowing at a glance on its face and the
 * rest behind a tap.
 *
 * **What is not here is the point.** Location, guests, waitresses, kosher,
 * delivery, the deposit and the flavour split are all inside the order —
 * this is the "fold a column into the record" move the desktop table's own
 * notes name as the next step for a narrow screen, taken to its end.
 *
 * There is also no inline editing. On the desktop ten cells in each row
 * edit in place, announced by a hover a phone cannot perform; rather than
 * put a dozen 20px targets on a card, the whole card opens the order and
 * everything is edited there. One rule, and nothing hidden.
 */
export function OrdersMobileList({
  orders,
  unitsPerPackage,
  onOpen,
  emptyNote,
}: {
  /** Already searched, filtered and scoped — the same array the table takes. */
  orders: Order[];
  unitsPerPackage: Map<number, number>;
  onOpen: (key: string) => void;
  emptyNote: string;
}) {
  if (orders.length === 0) {
    return (
      <p className="rounded-card border border-line bg-card px-4 py-8 text-center text-sm text-ink-soft">
        {emptyNote}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {orders.map((order, at) => (
        <Fragment key={order.key}>
          {/*
            A heading only where the day changes. The list arrives in date
            order, so this is a run boundary rather than a grouping pass —
            and it is what turns a scroll into "what is on Thursday".
          */}
          {order.date !== orders[at - 1]?.date && (
            <h2 className="mt-3 px-1 text-[11px] font-extrabold tracking-[0.14em] text-ink-soft uppercase first:mt-0">
              {formatOrderDate(order.date)}
            </h2>
          )}
          <OrderCard order={order} unitsPerPackage={unitsPerPackage} onOpen={onOpen} />
        </Fragment>
      ))}
    </div>
  );
}

function OrderCard({
  order,
  unitsPerPackage,
  onOpen,
}: {
  order: Order;
  unitsPerPackage: Map<number, number>;
  onOpen: (key: string) => void;
}) {
  const { forOrder } = useVatView();
  const stage = useStage(order.productionStatus);
  const units = orderUnits(order.packageLines, unitsPerPackage);

  return (
    <button
      onClick={() => onOpen(order.key)}
      /*
        The whole card is the target. `text-left` because it is a button
        wrapping a record rather than a label, and `is-offer` so a quote
        keeps the dashed edge it wears in the table — the one piece of the
        row's styling that carries meaning rather than emphasis.
      */
      className={`w-full rounded-card border border-line bg-card px-4 py-3 text-left ${
        stage?.countsAsIncome === false ? "is-offer" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <StageChip stageKey={order.productionStatus} />
        {order.customerType && <EventTypeChip value={order.customerType} />}
        <span className="flex-1" />
        {/* A note is worth knowing exists; reading it is what opening is for. */}
        {order.notes && <Info size={13} className="shrink-0 text-ink-soft" aria-label="Has a note" />}
      </div>

      <p className="mt-2 truncate text-[15px] font-bold">{order.customer}</p>

      <div className="mt-1.5 flex items-baseline gap-3 text-xs text-ink-soft">
        <span className="flex items-center gap-1">
          <UnitsIcon size={13} />
          {units.toLocaleString("en-US")}
        </span>
        <span className="truncate">{PAYMENT_STATUS_LABEL[order.paymentStatus as PaymentStatus] ?? order.paymentStatus}</span>
        <span className="flex-1" />
        {/* `tabular-nums` and no more: `font-mono` is the version string's
            treatment, and nothing else in the app spends it on money. */}
        <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">
          {/* `forOrder` is the whole VAT convention — gross or net by the
              nav's switch — so the card cannot disagree with the table. */}
          {currency(forOrder(order))}
        </span>
      </div>
    </button>
  );
}
