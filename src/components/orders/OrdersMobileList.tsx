"use client";

import { Fragment } from "react";
import {
  displayCount,
  formatOrderDate,
  hasDelivery,
  orderUnits,
  orderWeekday,
  PAYMENT_STATUS_LABEL,
  paymentBadgeClass,
  type Order,
  type PaymentStatus,
} from "@/lib/orderTypes";
import { count, currency } from "@/lib/money";
import { useVatView } from "@/components/VatViewContext";
import { useStage } from "@/components/ProductionStagesContext";
import { Figure } from "@/components/Figure";
import { EventTypeChip } from "./EventTypeChip";
import { StageChip } from "./StageChip";

/**
 * The Orders page on a phone: one card per order, under a heading per day.
 *
 * The table is fifteen columns and 1100px wide, which on a 390px screen is
 * three screens of sideways scrolling to read one row. A card carries
 * **every column the table has** in a labelled grid instead.
 *
 * It briefly offered two shapes — this one and a folded "glance" card with
 * a switcher between them — and the owner chose to keep only this. The fold
 * was the better answer for working a queue, but an order is read far more
 * often than it is counted, and one shape beats a control that has to be
 * set before the page says anything.
 *
 * There is no inline editing. On the desktop ten cells in each row edit in
 * place, announced by a hover a phone cannot perform; rather than put a
 * dozen 20px targets on a card, the whole card opens the order and
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
            <h2 className="mt-3 flex items-baseline gap-1.5 px-1 text-[11px] font-extrabold tracking-[0.14em] text-ink-soft uppercase first:mt-0">
              {/* The weekday first, because "is that a Saturday" is most of
                  what a queue of dates is read for. See `orderWeekday` for
                  why an old imported order's could be wrong. */}
              <span className="text-ink">{orderWeekday(order.date)}</span>
              {formatOrderDate(order.date)}
            </h2>
          )}
          <OrderCard order={order} unitsPerPackage={unitsPerPackage} onOpen={onOpen} />
        </Fragment>
      ))}
    </div>
  );
}

/** The stored status, or the raw value when it names no known one. */
const paymentLabel = (order: Order) =>
  PAYMENT_STATUS_LABEL[order.paymentStatus as PaymentStatus] ?? order.paymentStatus;

/**
 * One order, with everything the desktop table would show.
 *
 * The customer leads with the stage and event type beside it, then the
 * table's columns as labelled figures, then the money under a rule — the
 * way the order sheet separates arithmetic from the fields above it.
 *
 * **Only the fields the order actually has are drawn.** A card of thirteen
 * rows, nine of them "—", is worse than the table it replaced: the table's
 * dashes sit in columns you read past, while on a card each one costs a
 * whole line. `hasDelivery` and `displayCount` are the same predicates the
 * table's own cells use, so the two cannot disagree about what "no
 * delivery" means.
 */
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
  const displays = displayCount(order.displays);

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
      {/*
        The name leads and the chips sit at the end of its line, rather than
        the chips having a row of their own above it: the customer is what
        you are looking for down a list, and the stage is what qualifies it.
        `items-start` so a name that wraps to two lines keeps the chips on
        the first.
      */}
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 truncate text-[17px] font-bold">{order.customer}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <StageChip stageKey={order.productionStatus} />
          {order.customerType && <EventTypeChip value={order.customerType} />}
        </div>
      </div>

      <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {/* The full row: measured at 360px a half-width cell leaves a
            location 7px after its label, which truncates a venue name to a
            single character — a card that shows less than the table it
            replaced. Across both columns it gets ~270px. */}
        {order.location && <Figure label="Location" value={order.location} wide />}
        {order.guests !== null && <Figure label="Guests" value={String(order.guests)} />}
        <Figure label="Units" value={count(units)} />
        {displays > 0 && <Figure label="Display" value={String(displays)} />}
        {order.waitresses !== null && order.waitresses > 0 && (
          <Figure label="Waitress" value={String(order.waitresses)} />
        )}
        {order.kosher && <Figure label="Kosher" value="Yes" />}
        {hasDelivery(order) && <Figure label="Delivery" value="Yes" />}
        {order.deposit > 0 && <Figure label="Deposit" value={currency(order.deposit)} />}
      </dl>

      <div className="mt-2.5 flex items-center gap-2 border-t border-line/60 pt-2 text-xs">
        {/*
          The badge the table wears, not the plain grey text this had.
          Measured on a phone, "Deposit paid" was 12px at the same weight
          and colour as the word "Location" beside it — the most actionable
          field on the card styled exactly like a field label. The colour
          is the status, so it comes from `paymentBadgeClass` rather than
          being decided here.
        */}
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${paymentBadgeClass(
            order.paymentStatus,
          )}`}
        >
          {paymentLabel(order)}
        </span>
        <span className="flex-1" />
        {/* `tabular-nums` and no more: `font-mono` is the version string's
            treatment, and nothing else in the app spends it on money.
            `forOrder` is the whole VAT convention — gross or net by the
            nav's switch — so the card cannot disagree with the table. */}
        <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">
          {currency(forOrder(order))}
        </span>
      </div>
    </button>
  );
}
