"use client";

import { useState } from "react";
import {
  ORDER_EXTRAS,
  orderBalance,
  orderDiscount,
  orderTotal,
  unitTierFor,
  type AmountKey,
  type OrderInput,
  type Rates,
} from "@/lib/orderTypes";
import { UnitsIcon } from "@/lib/icons";
import {
  DiscountInput,
  GroupLabel,
  MoneyInput,
  PricedAmount,
  SheetRow,
  money,
  nf,
} from "./OrderSheet";

/**
 * The order's money and its unit coverage, beside the form on every tab.
 *
 * This is the whole reason the form went to three tabs: with the money as
 * a third column of a Details sheet, checking what an order was worth
 * meant leaving whatever you were doing. Priced work — quoting, applying a
 * discount, taking a deposit — is a conversation with a customer that
 * moves between the event and its cost sentence by sentence, and a tab
 * switch in the middle of that is a switch too many.
 *
 * It is a rail rather than a fourth tab for the same reason: a number you
 * have to go and look at is a number nobody looks at. And it is drawn in
 * negative — see `.money-rail` in globals.css — because every other
 * surface here is cream on cream, and the one pane meant to be read from
 * across the form is the one that should stop matching.
 */
export function OrderMoneyRail({
  draft,
  onChange,
  totalUnits,
  unassignedUnits,
  overAssignedUnits,
  rates,
  manual,
  onManualChange,
  onOpenContent,
}: {
  draft: OrderInput;
  onChange: (draft: OrderInput) => void;
  totalUnits: number;
  /** Units packed but with no flavour yet — see OrderForm's `unbalanced`. */
  unassignedUnits: number;
  overAssignedUnits: number;
  rates: Rates;
  /** Amounts typed over the standard rate — see OrderForm's `manual`. */
  manual: ReadonlySet<AmountKey>;
  onManualChange: (manual: ReadonlySet<AmountKey>) => void;
  onOpenContent: () => void;
}) {
  const set = (patch: Partial<OrderInput>) => onChange({ ...draft, ...patch });

  /*
   * Whether the deposit row is on screen. Most orders are quoted before
   * anyone has paid anything, so a deposit box sitting at zero was one
   * more empty field between the total and the balance — and the balance
   * is the line this pane exists to show. An order that already has one
   * opens with the row out, because a number recorded but invisible is
   * worse than a field too many.
   */
  const [depositOpen, setDepositOpen] = useState(draft.deposit > 0);

  /**
   * Typing an amount takes it off the standard rate; the arrow beside it
   * hands it back. Both are one-line set operations on the parent's state
   * rather than anything stored, so an amount can move between the two as
   * often as someone changes their mind.
   */
  const setManual = (key: AmountKey, on: boolean) => {
    const next = new Set(manual);
    if (on) next.add(key);
    else next.delete(key);
    onManualChange(next);
  };

  // The jelly plus every extra that applies, less the discount and then
  // what has been paid.
  const discount = orderDiscount(draft);
  const total = orderTotal(draft);
  const balance = orderBalance(draft);
  // Only the extras this order actually has. A price for mirrors nobody
  // ordered is a charge waiting to be forgotten about.
  const extras = ORDER_EXTRAS.filter((extra) => extra.applies(draft));

  return (
    <div className="flex w-full flex-col">
      {/* The heading sits on the cream above the pane rather than inside
          it: the pane's first line is the count, and a caption in
          negative over it spent the brightest thing on screen on a word. */}
      <GroupLabel rule={false}>The order</GroupLabel>

      {/*
        `overflow-hidden` clips the notch's cut-outs to the pane's own box.
        They used to hang 8px past each edge, and since the rail's
        container scrolls vertically the CSS spec turns its horizontal
        `visible` into `auto` — so those 8px became a scrollbar under the
        money. Clipped, each circle draws as the half-moon bitten out of
        the edge, which is the shape it was always meant to be.
      */}
      <aside className="money-rail mt-1.5 flex w-full flex-col overflow-hidden rounded-2xl">
        {/*
          Coverage above the money, because it is the one thing on this
          rail that isn't a number the customer agreed to — it says whether
          the order is finished, and an unflavoured tray is the commonest
          way an order isn't.
        */}
        <button
          type="button"
          onClick={onOpenContent}
          title="Edit the packing on the Content tab"
          // Not `.hover-line`: that rule turns a row black, which is what
          // this pane already is. A light wash is the same gesture in
          // negative.
          className="flex items-center gap-2 rounded-t-2xl px-4 py-3.5 text-left transition hover:bg-cream/10"
        >
          <UnitsIcon size={20} className="shrink-0 text-cream/60" />
          <span className="font-display text-[26px] leading-none font-extrabold tabular-nums text-cream">
            {nf.format(totalUnits)}
          </span>
          {/* As big as the number and no heavier: the count is the figure,
              but "units" at 11px beside a 26px number read as a footnote
              on it rather than as part of the same phrase. */}
          <span className="text-[26px] leading-none font-normal text-cream/55">units</span>
          <span className="flex-1" />
          <Coverage
            totalUnits={totalUnits}
            unassignedUnits={unassignedUnits}
            overAssignedUnits={overAssignedUnits}
          />
        </button>

        <Notch />

        {/* No heading over this half. The pane's own shape says where the
            count stops and the money starts, and a caption saying "the
            money" over a column of amounts is a label on the obvious. */}
        <div className="px-4 pt-1 pb-4">
          <SheetRow label="Jelly">
            <PricedAmount
              label="Order amount"
              value={draft.totalAmount}
              onChange={(totalAmount) => set({ totalAmount: totalAmount ?? 0 })}
              // The tier the order's own size falls into, so the hint
              // beside the box names the rate actually being applied.
              rate={rates.prices[unitTierFor(totalUnits)]}
              manual={manual.has("jelly")}
              onRelease={() => setManual("jelly", false)}
              onTyped={() => setManual("jelly", true)}
            />
          </SheetRow>

          {/* One row per extra the order actually has, so the statement
              grows with the event rather than listing charges for things
              nobody asked for. */}
          {extras.map((extra) => (
            <SheetRow key={extra.id} label={extra.label}>
              <PricedAmount
                label={`${extra.label} cost`}
                value={draft[extra.cost]}
                onChange={(value) => set({ [extra.cost]: value } as Partial<OrderInput>)}
                // Display and Delivery have no flat rate of their own —
                // each prices itself from its own list — so they show the
                // standard amount rather than a per-item figure.
                rate={extra.priceKey === null ? extra.standard(draft, rates) : rates.prices[extra.priceKey]}
                manual={manual.has(extra.id)}
                onRelease={() => setManual(extra.id, false)}
                onTyped={() => setManual(extra.id, true)}
              />
            </SheetRow>
          ))}

          {/* Always shown, unlike the extras above it: a discount is not
              something the order "has" until it is entered, so there has
              to be somewhere to enter it. The label carries what a
              percentage comes to, since the box beside it only says the
              rate. */}
          <SheetRow label={discount > 0 && draft.discountIsPercent ? `Discount −${money(discount)}` : "Discount"}>
            <DiscountInput
              value={draft.discount}
              isPercent={draft.discountIsPercent}
              onChange={(discount, discountIsPercent) => set({ discount, discountIsPercent })}
            />
          </SheetRow>

          <SheetRow label="Total">
            <span className="pr-2 text-sm font-bold tabular-nums text-cream">{money(total)}</span>
          </SheetRow>

          {depositOpen ? (
            <SheetRow label="Deposit">
              <MoneyInput
                label="Deposit"
                value={draft.deposit}
                onChange={(deposit) => set({ deposit: deposit ?? 0 })}
              />
            </SheetRow>
          ) : (
            <div className="flex min-h-[34px] items-center py-1">
              <button
                type="button"
                onClick={() => setDepositOpen(true)}
                className="rounded-md text-[12.5px] underline decoration-cream/30 underline-offset-4 opacity-70 transition hover:opacity-100"
              >
                Add deposit
              </button>
            </div>
          )}

          <SheetRow label={balance < 0 ? "Overpaid by" : "Balance due"} total>
            <span className="font-display text-[21px] leading-none font-extrabold tabular-nums text-cream">
              {money(Math.abs(balance))}
            </span>
          </SheetRow>
        </div>
      </aside>
    </div>
  );
}

/**
 * The pinch in the pane's silhouette that separates what the order *is*
 * from what it costs.
 *
 * A heading would have done the same job, but this pane is read at a
 * glance from across the form and a caption is something you have to
 * actually read. Cutting the shape says "two parts" without spending a
 * line on saying so — the same thing a ticket stub does.
 *
 * The cut-outs are circles in the surrounding colour rather than a real
 * clip path, which keeps the pane an ordinary rounded box that the rows
 * inside it can lay out against normally.
 */
function Notch() {
  return (
    <div className="relative h-0" aria-hidden>
      <span className="absolute -top-2 -left-2 h-4 w-4 rounded-full bg-card" />
      <span className="absolute -top-2 -right-2 h-4 w-4 rounded-full bg-card" />
      <span className="absolute inset-x-4 top-0 border-t border-dashed border-cream/15" />
    </div>
  );
}

/**
 * Whether the packing adds up, in one chip.
 *
 * Three states rather than a warning that is either there or not: an
 * empty order is simply unstarted and shouldn't be scolded for it, a
 * balanced one earns the accent, and anything else names how far off it
 * is so the number is fixable without opening the tab.
 */
function Coverage({
  totalUnits,
  unassignedUnits,
  overAssignedUnits,
}: {
  totalUnits: number;
  unassignedUnits: number;
  overAssignedUnits: number;
}) {
  if (totalUnits === 0) {
    return <span className="keeps-color text-[11px] font-semibold text-cream/50">nothing packed</span>;
  }
  // Both say "and you can still save" rather than reading as a blocker:
  // orders are routinely booked before anyone has decided the mix, and
  // refusing the save would lose the booking to protect a total nobody is
  // reading yet.
  if (overAssignedUnits > 0) {
    return (
      <span
        title={`${nf.format(overAssignedUnits)} more units are assigned to flavours than the packaging holds. You can still save and come back to it.`}
        className="keeps-color text-[11px] font-bold text-amber-300"
      >
        {nf.format(overAssignedUnits)} over
      </span>
    );
  }
  if (unassignedUnits > 0) {
    return (
      <span
        title={`${nf.format(unassignedUnits)} units still need a flavour. You can still save and come back to it.`}
        className="keeps-color text-[11px] font-bold text-amber-300"
      >
        {nf.format(unassignedUnits)} unflavoured
      </span>
    );
  }
  return <span className="keeps-color text-[11px] font-bold text-lime-300">balanced</span>;
}
