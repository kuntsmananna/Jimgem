"use client";

import { Fragment } from "react";
import { UserRound } from "lucide-react";
import {
  formatOrderDate,
  isBooked,
  orderTotal,
  orderUnits,
  orderWeekday,
  stillDue,
  todayIso,
  PAYMENT_STATUS_LABEL,
  paymentBadgeClass,
  type Order,
  type PaymentStatus,
} from "@/lib/orderTypes";
import { paymentMethodIconElement } from "@/lib/icons";
import { count, currency } from "@/lib/money";
import { useCanSeeMoney } from "@/components/RoleContext";
import { useVatView } from "@/components/VatViewContext";
import { useStage, useStageMap } from "@/components/ProductionStagesContext";
import { Figure } from "@/components/Figure";
import { usePaymentMethods } from "./PaymentMethodsContext";
import { EventTypeChip } from "./EventTypeChip";
import { StageChip } from "./StageChip";
import { extraSlots } from "./OrdersTable";

/**
 * The Orders page on a phone: one card per order, under a heading per day.
 *
 * The table is eleven columns across a laptop, which on a 390px screen is
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
  // The table's own "today", so the two say Today on the same day.
  const today = todayIso();

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
            <h2
              className={`mt-3 flex items-baseline gap-1.5 px-1 text-[11px] font-extrabold tracking-[0.14em] uppercase first:mt-0 ${
                order.date === today ? "text-accent" : "text-ink-soft"
              }`}
            >
              {/* The weekday first, because "is that a Saturday" is most of
                  what a queue of dates is read for — or "Today", in the
                  accent, as the laptop's day column says it. See
                  `orderWeekday` for why an old imported order's could be
                  wrong. */}
              <span className={order.date === today ? "" : "text-ink"}>
                {order.date === today ? "Today" : orderWeekday(order.date)}
              </span>
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
  const money = useCanSeeMoney();
  const stage = useStage(order.productionStatus);
  const units = orderUnits(order.packageLines, unitsPerPackage);
  /* What the order *has*, in the table's slot order — the same list. */
  const extras = extraSlots(order).filter((slot) => slot.on > 0);
  const method = usePaymentMethods().find((m) => m.id === order.paymentMethodId);
  const total = orderTotal(order);
  const due = stillDue(order);
  // The table's rule for a quote, not a second reading of the flag.
  const booked = isBooked(order, useStageMap());

  return (
    <button
      onClick={() => onOpen(order.key)}
      /*
        The whole card is the target. `text-left` because it is a button
        wrapping a record rather than a label, and `is-offer` so a quote
        keeps the dashed edge it wears in the table — the one piece of the
        row's styling that carries meaning rather than emphasis.

        **A finished order sinks into the page.** Work still to do sits on
        white; a delivered one takes the cream the page is already made of,
        so a mixed list separates at a glance into what is left and what is
        done. That is the app's "selected is the fill" rule read the other
        way up, and it is the fill precisely because the alternative —
        fading the whole card — costs contrast: at 70% opacity the labels
        measure 2.97 against a 4.5 floor, so the cheapest-looking answer is
        the one that fails a reader in sunlight. Nothing here changes a
        text colour, so every ratio on the card is what it was.

        The Status filter shows every stage by default (v0.90.5), so a
        mixed list of open and finished orders is the usual case.
      */
      data-jiggle-item
      className={`tap w-full rounded-card border border-line px-4 py-3 text-left ${
        stage?.isFinal ? "bg-cream" : "bg-card"
      } ${booked ? "" : "is-offer"}`}
    >
      {/*
        The name leads and the chips sit at the end of its line, rather than
        the chips having a row of their own above it: the customer is what
        you are looking for down a list, and the stage is what qualifies it.
        `items-start` so a name that wraps to two lines keeps the chips on
        the first.

        **The name is as big as the line allows** (v0.81, the owner's
        call): 22px in the display face, where it was 17px body text — it
        is what a thumb is scrolling for. It wraps to a second line rather
        than truncating, since half a name is not a name, and the type chip
        gives back what it can (`short`, "Production company" → "Prod.").
      */}
      <div className="flex items-start gap-2">
        <p
          data-private
          className="line-clamp-2 min-w-0 flex-1 font-display text-[22px] leading-[1.15] font-extrabold break-words"
        >
          {order.customer}
        </p>
        <div className="mt-1 flex shrink-0 items-center gap-1.5">
          <StageChip stageKey={order.productionStatus} />
          {order.customerType && <EventTypeChip value={order.customerType} short />}
        </div>
      </div>

      <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {/* The full row: measured at 360px a half-width cell leaves a
            location 7px after its label, which truncates a venue name to a
            single character — a card that shows less than the table it
            replaced. Across both columns it gets ~270px. */}
        {order.location && <Figure label="Location" value={order.location} wide isPrivate />}
        {order.guests !== null && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="shrink-0 text-ink-soft">Guests</dt>
            {/* The person mark the table's Guests column wears. */}
            <dd className="flex items-center gap-1 font-semibold text-ink tabular-nums">
              <UserRound size={12} aria-hidden className="self-center opacity-55" />
              {count(order.guests)}
            </dd>
          </div>
        )}
        <Figure label="Units" value={count(units)} />
      </dl>

      {/*
        Display, waitressing, kosher and delivery as one wrapping row of
        chips rather than a labelled row each. They are flags — a yes or a
        small number — and a whole line apiece put four of them across two
        grid rows, which on a busy order was most of the card's height for
        the least of its meaning.

        Each wears the mark its slot has in the laptop's Extras column
        (v0.78), so the two read as one vocabulary — **and keeps its word**:
        the table explains a mark on hover, which a phone cannot do, so
        here the word is the explanation. Only the extras the order has: a
        faint "not kosher" slot is right in a column read down a list and
        wrong on a card, where it is one more thing to read past.
      */}
      {extras.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {extras.map(({ icon: Icon, short }) => (
            <span
              key={short}
              data-jiggle
              className="flex items-center gap-1 rounded-full bg-band px-2 py-0.5 text-[11px] font-semibold text-ink"
            >
              <Icon size={12} aria-hidden />
              {short}
            </span>
          ))}
        </div>
      )}

      {/*
        The money line, and the rule above it, on an account that is shown
        money. A staff account gets neither — not a rule with nothing under
        it, which would read as a card that failed to finish loading.
      */}
      {money && (
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
          className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${paymentBadgeClass(
            order.paymentStatus,
          )}`}
        >
          {/* How they paid rides inside the badge as its mark, as it does in
              the table (v0.78) — and is named in words after it, since a
              phone has no hover to say what the mark means. */}
          {method && paymentMethodIconElement(method.name)}
          {paymentLabel(order)}
          {method && <span className="font-medium opacity-75">· {method.name}</span>}
        </span>
        <span className="flex-1" />
        {/*
          What is still owed, in the table's amber, before the total —
          "Paid" in the accent once it is nothing. Gross, like the figures
          pane's Still due: it is money a customer hands over. Nothing at
          all on an unpriced order, which is not "paid" but unpriced.
        */}
        {total > 0 &&
          (due > 0 ? (
            // A quote owes nothing yet, so its balance is drawn quiet.
            <span
              className={`shrink-0 font-bold tabular-nums ${
                booked ? "text-due" : "text-ink-soft"
              }`}
            >
              {currency(due)} due
            </span>
          ) : (
            <span className="shrink-0 font-semibold text-accent">Paid</span>
          ))}
        {/* `tabular-nums` and no more: `font-mono` is the version string's
            treatment, and nothing else in the app spends it on money.
            `forOrder` is the whole VAT convention — gross or net by the
            nav's switch — so the card cannot disagree with the table. */}
        <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">
          {currency(forOrder(order))}
        </span>
      </div>
      )}
    </button>
  );
}
