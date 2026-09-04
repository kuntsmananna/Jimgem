"use client";

import { Fragment, type ReactNode } from "react";
import {
  displayCount,
  formatOrderDate,
  hasDelivery,
  orderUnits,
  orderWeekday,
  PAYMENT_STATUS_LABEL,
  type Order,
  type PaymentStatus,
} from "@/lib/orderTypes";
import { UnitsIcon } from "@/lib/icons";
import { count, currency } from "@/lib/money";
import { useVatView } from "@/components/VatViewContext";
import { useStage } from "@/components/ProductionStagesContext";
import { EventTypeChip } from "./EventTypeChip";
import { StageChip } from "./StageChip";
import type { MobileView } from "./OrdersClient";
import { Figure } from "@/components/Figure";

/**
 * The Orders page on a phone: one card per order, under a heading per day.
 *
 * The table is fifteen columns and 1100px wide, which on a 390px screen is
 * three screens of sideways scrolling to read one row. A card is the same
 * order with the six things worth knowing at a glance on its face and the
 * rest behind a tap.
 *
 * **What is not on the `list` card is the point.** Location, guests,
 * waitresses, kosher, delivery, the deposit and the flavour split are all
 * inside the order — this is the "fold a column into the record" move the
 * desktop table's own notes name as the next step for a narrow screen,
 * taken to its end.
 *
 * The `cards` variant is the other answer to the same question, offered
 * beside it rather than instead of it: **every column the desktop table
 * has, on the card**, in a labelled grid. The fold is right for working a
 * queue — most days you want to know who, when and how much — and wrong
 * for the times you are actually reading an order's details and do not
 * want to open eleven of them one at a time. Both render from the same
 * array; only the body differs.
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
  variant,
}: {
  /** Already searched, filtered and scoped — the same array the table takes. */
  orders: Order[];
  unitsPerPackage: Map<number, number>;
  onOpen: (key: string) => void;
  emptyNote: string;
  /** `list` folds everything but the glance; `cards` carries every column.
   *  The type comes from the switcher's own option list, so the pills, the
   *  remembered value and this prop cannot disagree. */
  variant: MobileView;
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
          {variant === "cards" ? (
            <OrderDetailCard order={order} unitsPerPackage={unitsPerPackage} onOpen={onOpen} />
          ) : (
            <OrderCard order={order} unitsPerPackage={unitsPerPackage} onOpen={onOpen} />
          )}
        </Fragment>
      ))}
    </div>
  );
}

/**
 * The card both shapes are built on: the target, the offer treatment and
 * the face.
 *
 * The face has to be identical in both views — switching between them must
 * not move the thing you are looking for — and `is-offer` is the one piece
 * of a row's styling that carries meaning rather than emphasis. Neither is
 * left to a copy that could drift.
 */
function OrderCardShell({
  order,
  onOpen,
  children,
}: {
  order: Order;
  onOpen: (key: string) => void;
  children: ReactNode;
}) {
  const stage = useStage(order.productionStatus);

  return (
    <button
      onClick={() => onOpen(order.key)}
      /*
        The whole card is the target. `text-left` because it is a button
        wrapping a record rather than a label, and `is-offer` so a quote
        keeps the dashed edge it wears in the table.
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
      {children}
    </button>
  );
}

/** The stored status, or the raw value when it names no known one. */
const paymentLabel = (order: Order) =>
  PAYMENT_STATUS_LABEL[order.paymentStatus as PaymentStatus] ?? order.paymentStatus;

/** The glance: units, payment status and the total. */
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
  const units = orderUnits(order.packageLines, unitsPerPackage);

  return (
    <OrderCardShell order={order} onOpen={onOpen}>
      <div className="mt-2 flex items-baseline gap-3 text-xs text-ink-soft">
        <span className="flex items-center gap-1">
          <UnitsIcon size={13} />
          {count(units)}
        </span>
        <span className="truncate">{paymentLabel(order)}</span>
        <span className="flex-1" />
        {/* `tabular-nums` and no more: `font-mono` is the version string's
            treatment, and nothing else in the app spends it on money. */}
        <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">
          {/* `forOrder` is the whole VAT convention — gross or net by the
              nav's switch — so the card cannot disagree with the table. */}
          {currency(forOrder(order))}
        </span>
      </div>
    </OrderCardShell>
  );
}

/**
 * The other card: every column the desktop table carries.
 *
 * The face is the same as the compact card's — customer, stage, event type
 * — so switching between the two views does not move the thing you are
 * looking for. Under it, everything the table would show, as labelled
 * figures: location and guests, units, display, waitresses, kosher,
 * delivery, deposit, and the amount with its payment status.
 *
 * **Only the fields the order actually has are drawn.** A card of thirteen
 * rows, nine of them "—", is worse than the table it replaced: the table's
 * dashes sit in columns you read past, while on a card each one costs a
 * whole line. `hasDelivery` and `displayCount` are the same predicates the
 * table's own cells use, so the two cannot disagree about what "no
 * delivery" means.
 *
 * Still no inline editing here, for the reason the compact card gives:
 * the card opens the order, and everything is edited there.
 */
function OrderDetailCard({
  order,
  unitsPerPackage,
  onOpen,
}: {
  order: Order;
  unitsPerPackage: Map<number, number>;
  onOpen: (key: string) => void;
}) {
  const { forOrder } = useVatView();
  const units = orderUnits(order.packageLines, unitsPerPackage);
  const displays = displayCount(order.displays);

  return (
    <OrderCardShell order={order} onOpen={onOpen}>
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

      {/* The money on its own line under a rule, the way the order sheet
          separates arithmetic from the fields above it. */}
      <div className="mt-2.5 flex items-baseline gap-2 border-t border-line/60 pt-2 text-xs text-ink-soft">
        <span className="min-w-0 truncate">
          {paymentLabel(order)}
        </span>
        <span className="flex-1" />
        <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">
          {currency(forOrder(order))}
        </span>
      </div>
    </OrderCardShell>
  );
}
