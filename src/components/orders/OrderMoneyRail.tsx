"use client";

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
 * have to go and look at is a number nobody looks at.
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
    <aside className="flex w-full flex-col rounded-2xl bg-cream/60 px-4 pt-1 pb-4">
      {/*
        Coverage above the money, because it is the one thing on this rail
        that isn't a number the customer agreed to — it says whether the
        order is finished, and an unflavoured tray is the commonest way an
        order isn't.
      */}
      <GroupLabel>The order</GroupLabel>
      <button
        type="button"
        onClick={onOpenContent}
        title="Edit the packing on the Content tab"
        className="hover-line -mx-2 flex items-center gap-2 rounded-xl px-2 py-1.5 text-left"
      >
        <UnitsIcon size={15} className="shrink-0 text-ink-soft" />
        <span className="font-display text-[22px] leading-none font-extrabold tabular-nums text-ink">
          {nf.format(totalUnits)}
        </span>
        <span className="text-[11px] text-ink-soft">units</span>
        <span className="flex-1" />
        <Coverage
          totalUnits={totalUnits}
          unassignedUnits={unassignedUnits}
          overAssignedUnits={overAssignedUnits}
        />
      </button>

      <div className="mt-3">
        <GroupLabel>The money</GroupLabel>
      </div>
      <SheetRow label="Jelly">
        <PricedAmount
          label="Order amount"
          value={draft.totalAmount}
          onChange={(totalAmount) => set({ totalAmount: totalAmount ?? 0 })}
          // The tier the order's own size falls into, so the hint beside
          // the box names the rate actually being applied.
          rate={rates.prices[unitTierFor(totalUnits)]}
          manual={manual.has("jelly")}
          onRelease={() => setManual("jelly", false)}
          onTyped={() => setManual("jelly", true)}
        />
      </SheetRow>

      {/* One row per extra the order actually has, so the statement grows
          with the event rather than listing charges for things nobody
          asked for. */}
      {extras.map((extra) => (
        <SheetRow key={extra.id} label={extra.label}>
          <PricedAmount
            label={`${extra.label} cost`}
            value={draft[extra.cost]}
            onChange={(value) => set({ [extra.cost]: value } as Partial<OrderInput>)}
            // Display has no flat rate of its own — it prices itself from
            // the options the order carries — so it shows the standard
            // amount rather than a per-item figure.
            rate={extra.priceKey === null ? extra.standard(draft, rates) : rates.prices[extra.priceKey]}
            manual={manual.has(extra.id)}
            onRelease={() => setManual(extra.id, false)}
            onTyped={() => setManual(extra.id, true)}
          />
        </SheetRow>
      ))}

      {/* Always shown, unlike the extras above it: a discount is not
          something the order "has" until it is entered, so there has to be
          somewhere to enter it. The label carries what a percentage comes
          to, since the box beside it only says the rate. */}
      <SheetRow label={discount > 0 && draft.discountIsPercent ? `Discount −${money(discount)}` : "Discount"}>
        <DiscountInput
          value={draft.discount}
          isPercent={draft.discountIsPercent}
          onChange={(discount, discountIsPercent) => set({ discount, discountIsPercent })}
        />
      </SheetRow>

      <SheetRow label="Total">
        <span className="pr-2 text-sm font-bold tabular-nums text-ink">{money(total)}</span>
      </SheetRow>
      <SheetRow label="Deposit">
        <MoneyInput
          label="Deposit"
          value={draft.deposit}
          onChange={(deposit) => set({ deposit: deposit ?? 0 })}
        />
      </SheetRow>
      <SheetRow label={balance < 0 ? "Overpaid by" : "Balance due"} total>
        <span className="font-display text-[21px] leading-none font-extrabold tabular-nums text-ink">
          {money(Math.abs(balance))}
        </span>
      </SheetRow>
    </aside>
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
    return <span className="keeps-color text-[11px] font-semibold text-ink-soft">nothing packed</span>;
  }
  // Both say "and you can still save" rather than reading as a blocker:
  // orders are routinely booked before anyone has decided the mix, and
  // refusing the save would lose the booking to protect a total nobody is
  // reading yet.
  if (overAssignedUnits > 0) {
    return (
      <span
        title={`${nf.format(overAssignedUnits)} more units are assigned to flavours than the packaging holds. You can still save and come back to it.`}
        className="keeps-color text-[11px] font-bold text-amber-700"
      >
        {nf.format(overAssignedUnits)} over
      </span>
    );
  }
  if (unassignedUnits > 0) {
    return (
      <span
        title={`${nf.format(unassignedUnits)} units still need a flavour. You can still save and come back to it.`}
        className="keeps-color text-[11px] font-bold text-amber-700"
      >
        {nf.format(unassignedUnits)} unflavoured
      </span>
    );
  }
  return <span className="keeps-color text-[11px] font-bold text-accent">balanced</span>;
}
