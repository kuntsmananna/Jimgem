"use client";

import { useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import {
  ORDER_EXTRAS,
  PAYMENT_STATUS_LABEL,
  hasDelivery,
  withDelivery,
  orderBalance,
  orderTotal,
  unitTierFor,
  type DisplayOption,
  type OrderDisplay,
  type OrderInput,
  type PaymentStatus,
  type AmountKey,
  type Rates,
} from "@/lib/orderTypes";
import { TextInput, TextArea } from "@/components/Field";
import { useOrderTypes } from "@/components/OrderTypesContext";
import { orderTypeIconElement } from "@/lib/icons";
import { NumberStepper } from "./PackageLineEditor";
import { PAYMENT_BADGE_CLASS } from "./StatusSelects";
import { useStages } from "@/components/ProductionStagesContext";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const money = (amount: number) => `₪${nf.format(amount)}`;

/**
 * The Details tab, laid out as the order sheet rather than as a form.
 *
 * It replaced twelve identical label-and-box pairs in a flat 3x4 grid,
 * which spent a 976px panel saying every field was equally important and
 * left the bottom third empty. Here the customer is a headline, what the
 * event *is* sits under it, and the two things that get read — how big it
 * is and what is still owed — are two short statements side by side.
 *
 * Nothing here saves on its own; the whole draft goes up when OrderForm
 * submits.
 */
export function OrderDetailsPanel({
  draft,
  onChange,
  totalUnits,
  rates,
  manual,
  onManualChange,
  onOpenContent,
}: {
  draft: OrderInput;
  onChange: (draft: OrderInput) => void;
  /** Units the Content tab packs, shown here so the two tabs agree. */
  totalUnits: number;
  /** The owner's standard rates, for the "auto" hint and the way back to it. */
  rates: Rates;
  /** Amounts typed over the standard rate — see OrderForm's `manual`. */
  manual: ReadonlySet<AmountKey>;
  onManualChange: (manual: ReadonlySet<AmountKey>) => void;
  onOpenContent: () => void;
}) {
  const orderTypes = useOrderTypes();
  const stages = useStages();
  const stage = stages.find((s) => s.key === draft.productionStatus);
  const type = orderTypes.find((t) => t.name === draft.customerType);
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

  // The jelly plus every extra that applies, less what has been paid.
  const total = orderTotal(draft);
  const balance = orderBalance(draft);
  // Only the extras this order actually has. A price for mirrors nobody
  // ordered is a charge waiting to be forgotten about.
  const extras = ORDER_EXTRAS.filter((extra) => extra.applies(draft));

  return (
    <>
      {/*
        Three columns, each reading straight down: what the order *is*,
        how big the event is, and what it is worth. The customer used to
        head a full-width band above the other two, which spent a row on a
        name and left Notes a second row of its own at the bottom — both
        now live in the first column.

        No rules between the columns: with a headed rule under each title
        the grouping is already stated, and vertical hairlines through an
        already ruled panel read as a table.
      */}
      <div className="grid grid-cols-[1.15fr_0.85fr_1fr] gap-x-7">
        <section className="flex min-w-0 flex-col">
          <GroupLabel>Details</GroupLabel>
          {/*
            The name is the headline, not a field: it is how you know which
            order is open, and at 14px in a grid cell it never read that way.
          */}
          <input
            value={draft.customer}
            onChange={(e) => set({ customer: e.target.value })}
            placeholder="Customer name"
            aria-label="Customer"
            className="mt-1 w-full border-b border-transparent bg-transparent font-display text-[26px] leading-tight font-extrabold tracking-tight text-ink outline-none placeholder:text-ink-soft/35 placeholder-shown:border-line/70 hover:border-line focus:border-accent"
          />

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <PillSelect
              value={draft.customerType}
              onChange={(value) => set({ customerType: value })}
              label="Order type"
              className={type ? "text-ink" : "border border-line bg-black/[0.04] text-ink-soft"}
              style={type ? { background: type.color } : undefined}
              icon={type ? orderTypeIconElement(type.icon, 11) : undefined}
            >
              <option value="">No type</option>
              {/* Archived types are offered only while this order still
                  uses one, so retiring a type stops it being chosen again
                  without silently retyping the orders that have it. */}
              {orderTypes
                .filter((t) => !t.archivedAt || t.name === draft.customerType)
                .map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))}
              {/* An imported order can carry a type that isn't on the list.
                  It has to stay selectable, or saving would retype it. */}
              {draft.customerType && !type && (
                <option value={draft.customerType}>{draft.customerType} (not on the list)</option>
              )}
            </PillSelect>
            <PillSelect
              value={draft.paymentStatus}
              onChange={(value) => set({ paymentStatus: value as PaymentStatus })}
              label="Payment status"
              className={PAYMENT_BADGE_CLASS[draft.paymentStatus]}
            >
              {(Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[]).map((s) => (
                <option key={s} value={s}>
                  {PAYMENT_STATUS_LABEL[s]}
                </option>
              ))}
            </PillSelect>
            <PillSelect
              value={draft.productionStatus}
              onChange={(value) => set({ productionStatus: value })}
              label="Status"
              // The stage's own colour, like the table's Status cell — the
              // two are the same control in two places.
              className="keeps-color text-ink"
              style={stage ? { background: stage.color } : undefined}
            >
              {stages
                .filter((s) => !s.archivedAt || s.key === draft.productionStatus)
                .map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              {!stage && (
                <option value={draft.productionStatus}>{draft.productionStatus}</option>
              )}
            </PillSelect>
          </div>

          <div className="mt-1.5">
            <SheetRow label="Date">
              <TextInput
                type="date"
                value={draft.date}
                onChange={(e) => set({ date: e.target.value })}
                aria-label="Date"
                className="w-[8.5rem] text-sm tabular-nums"
              />
            </SheetRow>
            <SheetRow label="Location">
              <TextInput
                value={draft.location}
                onChange={(e) => set({ location: e.target.value })}
                placeholder="Location"
                aria-label="Location"
                className="w-40 text-sm"
              />
            </SheetRow>
          </div>

          <div className="mt-3">
            <GroupLabel>Notes</GroupLabel>
            {/* Keeps its box whether filled or not, unlike the single-line
                fields: an unbordered block of text has nothing to say where
                the writing area ends. */}
            <TextArea
              rows={3}
              value={draft.notes}
              onChange={(e) => set({ notes: e.target.value })}
              aria-label="Notes"
              placeholder="Anything worth remembering about this order"
              className="mt-1.5 w-full border-line bg-cream/40 px-2.5 py-2 text-sm"
            />
          </div>
        </section>

        <section className="flex min-w-0 flex-col">
          <GroupLabel>The event</GroupLabel>
          <SheetRow label="Guests">
            <NumberStepper
              label="guests"
              value={draft.guests}
              allowEmpty
              onChange={(guests) => set({ guests })}
            />
          </SheetRow>
          {/* Archived options appear only while this order still has some,
              so a retired one can be cleared but never added. */}
          <DisplayGroup
            options={rates.displayOptions.filter(
              (option) => !option.archivedAt || quantityOf(draft.displays, option.id) > 0,
            )}
            displays={draft.displays}
            onChange={(displays) => set({ displays })}
          />
          <SheetRow label="Waitresses">
            <NumberStepper
              label="waitresses"
              value={draft.waitresses}
              allowEmpty
              onChange={(waitresses) => set({ waitresses })}
            />
          </SheetRow>
          <SheetRow label="Kosher">
            <YesNo value={draft.kosher} onChange={(kosher) => set({ kosher })} label="Kosher" />
          </SheetRow>
          <SheetRow label="Delivery">
            {/* Turning it on opens the cost row at zero rather than
                guessing a price — an order can be booked for delivery
                before anyone has said what it costs. */}
            <YesNo value={hasDelivery(draft)} onChange={(on) => onChange(withDelivery(draft, on))} label="Delivery" />
          </SheetRow>
          <SheetRow label="Units ordered">
            {/* Packed on the Content tab, so this reads it rather than
                editing it — and offers the trip there instead. */}
            <button
              type="button"
              onClick={onOpenContent}
              className="rounded-md px-1.5 py-0.5 text-sm tabular-nums text-ink underline decoration-line underline-offset-4 hover:bg-black/[0.04] hover:decoration-accent"
              title="Edit the packing on the Content tab"
            >
              {totalUnits > 0 ? nf.format(totalUnits) : "None yet"}
            </button>
          </SheetRow>
        </section>

        <section className="flex min-w-0 flex-col">
          <GroupLabel>The money</GroupLabel>
          <SheetRow label="Order amount">
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
                // Display has no flat rate of its own — it prices itself
                // from the options the order carries — so it shows the
                // standard amount rather than a per-item figure.
                rate={extra.priceKey === null ? extra.standard(draft, rates) : rates.prices[extra.priceKey]}
                manual={manual.has(extra.id)}
                onRelease={() => setManual(extra.id, false)}
                onTyped={() => setManual(extra.id, true)}
              />
            </SheetRow>
          ))}

          <SheetRow label="Total">
            <span className="pr-2 text-sm font-bold tabular-nums text-ink">{money(total)}</span>
          </SheetRow>
          <SheetRow label="Deposit received">
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
        </section>
      </div>
    </>
  );
}

/**
 * A two-state switch for a field that is simply on or off. A checkbox
 * reads as "tick if true" and leaves "no" and "not answered yet" looking
 * identical, which matters here because kosher is a question someone is
 * asked rather than a default.
 */
function YesNo({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <span role="group" aria-label={label} className="flex items-center gap-1 rounded-full bg-black/[0.05] p-0.5">
      {[
        { on: false, text: "No" },
        { on: true, text: "Yes" },
      ].map((option) => (
        <button
          key={option.text}
          type="button"
          aria-pressed={value === option.on}
          onClick={() => onChange(option.on)}
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition ${
            value === option.on ? "bg-black text-cream" : "text-ink-soft hover:text-ink"
          }`}
        >
          {option.text}
        </button>
      ))}
    </span>
  );
}

/**
 * A column heading with the rule under it. That rule is what separates
 * the three columns now — vertical hairlines between them read as a table
 * once every group already has a headed line of its own.
 *
 * It carries its own air above and below, and draws heavier than a
 * hairline: with the per-row rules gone this is the only line in the
 * panel, so it has to hold three columns apart on its own.
 */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-1.5 mb-3 block border-b-[1.5px] border-ink/20 pb-2 text-[10px] font-bold tracking-[0.1em] text-ink-soft uppercase">
      {children}
    </span>
  );
}

/**
 * One line of a statement: what it is on the left, what it says on the
 * right.
 *
 * No rule between rows — the row rhythm and the label column already say
 * where one field ends, and a hairline under every one of them turned the
 * three columns back into the ledger the sheet layout was meant to
 * replace. `total` still draws the solid rule a sum sits under: that one
 * is arithmetic, not a divider.
 */
function SheetRow({
  label,
  total = false,
  indent = false,
  children,
}: {
  label: string;
  total?: boolean;
  /** Nudges the label right, for a row that belongs to the one above it. */
  indent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex min-h-[34px] items-center justify-between gap-4 ${
        total ? "mt-1.5 border-t-[1.5px] border-ink pt-2.5" : "py-1"
      }`}
    >
      <span
        className={`${total ? "text-xs font-bold text-ink" : "text-[12.5px] text-ink-soft"} ${
          indent ? "pl-4" : ""
        }`}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * The display types, gathered under one heading and folded away.
 *
 * They are kinds of the same thing, so listing Mirror, Stand and Tray flat
 * beside Guests and Waitresses read as three unrelated counts and pushed
 * the short column past everything else — and a new option would push it
 * further every time.
 *
 * Folded by default, because most orders have no display at all. The
 * summary carries the total, so the common case is answered without
 * opening it, and it opens on its own when the order already has one:
 * something set that you cannot see is worse than a row too many.
 */
function DisplayGroup({
  options,
  displays,
  onChange,
}: {
  options: DisplayOption[];
  displays: OrderDisplay[];
  onChange: (displays: OrderDisplay[]) => void;
}) {
  const total = displays.reduce((sum, entry) => sum + entry.quantity, 0);
  const [open, setOpen] = useState(total > 0);

  if (options.length === 0) return null;

  return (
    <>
      <SheetRow label="">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="-ml-2 flex w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-left text-[12.5px] text-ink-soft hover:bg-black/[0.04]"
        >
          <ChevronDown
            size={12}
            className={`shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
          />
          Display
          <span className="flex-1" />
          {/* The count only while folded: open, the steppers say it, and
              two numbers for one thing invite reading them as different. */}
          {!open && (
            <span className="text-sm tabular-nums text-ink">{total > 0 ? total : "—"}</span>
          )}
        </button>
      </SheetRow>

      {open &&
        options.map((option) => (
          <SheetRow key={option.id} label={option.name} indent>
            <NumberStepper
              label={option.name.toLowerCase()}
              value={quantityOf(displays, option.id)}
              onChange={(quantity) => onChange(withDisplay(displays, option.id, quantity))}
            />
          </SheetRow>
        ))}
    </>
  );
}

/** How many of one display option this order carries. */
function quantityOf(displays: OrderDisplay[], optionId: number): number {
  return displays.find((entry) => entry.optionId === optionId)?.quantity ?? 0;
}

/**
 * Sets one option's quantity, dropping the row at zero.
 *
 * Zero rows are not stored: "none of this" and "never asked about this"
 * are the same thing for a display, and keeping the row would put an
 * empty line in every order that ever touched the stepper.
 */
function withDisplay(displays: OrderDisplay[], optionId: number, quantity: number): OrderDisplay[] {
  const rest = displays.filter((entry) => entry.optionId !== optionId);
  return quantity > 0 ? [...rest, { optionId, quantity }] : rest;
}

/**
 * A money field that knows where its number came from.
 *
 * With a standard rate set, an untouched amount is filled in from it and
 * says "auto"; typing takes the amount off the rate, and the arrow hands
 * it back. Both states share one slot to the left of the box, so the
 * column keeps its alignment either way.
 *
 * The two only appear once there *is* a rate: with the rate at zero,
 * "auto" would be claiming a calculation nobody set up, and the way back
 * would just zero the amount.
 */
function PricedAmount({
  label,
  value,
  onChange,
  rate,
  manual,
  onTyped,
  onRelease,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  rate: number;
  manual: boolean;
  onTyped: () => void;
  onRelease: () => void;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {rate > 0 &&
        (manual ? (
          <button
            type="button"
            onClick={onRelease}
            title={`Back to the standard rate (${money(rate)})`}
            className="rounded-full p-0.5 text-ink-soft transition hover:bg-black/[0.06] hover:text-ink"
          >
            <RotateCcw size={12} />
          </button>
        ) : (
          <span
            title={`Calculated from the standard rate (${money(rate)})`}
            className="text-[10px] font-bold tracking-wide text-ink-soft/70 uppercase"
          >
            auto
          </span>
        ))}
      <MoneyInput
        label={label}
        value={value}
        onChange={(next) => {
          onTyped();
          onChange(next);
        }}
      />
    </span>
  );
}

/**
 * A shekel amount, right-aligned so a column of them lines up. Empty is
 * null rather than 0 — a delivery cost nobody has entered is not free.
 *
 * It reads as money at rest ("₪4,410") and as a bare number while being
 * typed into, which `type="number"` can't do: the browser rejects a value
 * carrying a currency mark or a thousands separator, so the field can
 * either be formatted or be editable, not both. Text plus `inputMode`
 * keeps the numeric keypad on touch without that restriction.
 */
function MoneyInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [typing, setTyping] = useState<string | null>(null);

  return (
    <TextInput
      type="text"
      inputMode="numeric"
      aria-label={label}
      // Zero shows as blank, not "₪0", so an amount nobody has filled in
      // keeps the empty-field outline that says it still wants a number.
      value={typing ?? (value ? money(value) : "")}
      onFocus={() => setTyping(value ? String(value) : "")}
      onChange={(e) => {
        setTyping(e.target.value);
        // Keep only what can be part of a number, so a pasted "₪4,410"
        // still lands as 4410 rather than as NaN.
        const digits = e.target.value.replace(/[^\d.-]/g, "");
        onChange(digits === "" ? null : Number(digits));
      }}
      onBlur={() => setTyping(null)}
      // Widened as one, not per row: these sit in a column and read as a
      // statement, so the delivery box being half again the size of the
      // order amount above it would look like a different kind of field.
      className="w-42 text-right text-sm tabular-nums"
    />
  );
}

/**
 * A `select` wearing a pill. `appearance-none` drops the platform arrow so
 * the chip keeps its shape at 11px; the chevron is drawn back on top,
 * because without it nothing says the colour is clickable.
 */
function PillSelect({
  value,
  onChange,
  label,
  className = "",
  style,
  icon,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
  style?: React.CSSProperties;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="relative inline-flex shrink-0 items-center">
      {icon && (
        <span className="pointer-events-none absolute left-2.5 flex items-center text-ink">{icon}</span>
      )}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={style}
        className={`appearance-none rounded-full py-1 text-[11px] font-bold whitespace-nowrap outline-none focus:ring-2 focus:ring-accent/40 ${
          icon ? "pl-7" : "pl-2.5"
        } pr-6 ${className}`}
      >
        {children}
      </select>
      <ChevronDown size={11} aria-hidden className="pointer-events-none absolute right-2 opacity-50" />
    </span>
  );
}
