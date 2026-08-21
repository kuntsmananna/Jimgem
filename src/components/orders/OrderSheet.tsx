"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { TextInput } from "@/components/Field";

/**
 * The order form's shared statement pieces.
 *
 * Extracted from what was one Details panel when the form went to three
 * tabs and a money rail: a group heading, a statement row and the money
 * fields are now used by four separate components, and keeping four
 * copies visually in step by hand is exactly the drift the single
 * `GroupLabel` rule was introduced to prevent.
 */

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
export const money = (amount: number) => `₪${nf.format(amount)}`;
export { nf };

/**
 * A group heading with the rule under it. That rule is what separates one
 * group from the next — vertical hairlines between columns read as a
 * table once every group already has a headed line of its own.
 *
 * It carries its own air above and below, and draws heavier than a
 * hairline: it is the only line in the panel, so it has to hold the
 * groups apart on its own.
 */
export function GroupLabel({ children }: { children: React.ReactNode }) {
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
 * columns back into the ledger the sheet layout was meant to replace.
 * `total` still draws the solid rule a sum sits under: that one is
 * arithmetic, not a divider.
 */
export function SheetRow({
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
 * A two-state switch for a field that is simply on or off. A checkbox
 * reads as "tick if true" and leaves "no" and "not answered yet" looking
 * identical, which matters here because kosher is a question someone is
 * asked rather than a default.
 */
export function YesNo({
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
export function PricedAmount({
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
    <span className="flex items-center gap-1">
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
export function MoneyInput({
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
      // Sized for the rail rather than for a full column: these sit in a
      // 20rem strip beside their labels, and the old 10.5rem box left the
      // label with nowhere to go.
      className="w-28 text-right text-sm tabular-nums"
    />
  );
}

/**
 * A discount, given either as a percentage of the order or as shekels
 * off it.
 *
 * The unit is a two-state toggle rather than a dropdown: there are only
 * two, and which one is in force changes what the number means — that is
 * worth seeing without opening anything.
 *
 * Switching the unit keeps the number typed. "10% off" and "₪10 off" are
 * different offers, and clearing the field on every toggle would make it
 * impossible to compare them.
 */
export function DiscountInput({
  value,
  isPercent,
  onChange,
}: {
  value: number;
  isPercent: boolean;
  onChange: (value: number, isPercent: boolean) => void;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span role="group" aria-label="Discount unit" className="flex items-center rounded-full bg-black/[0.05] p-0.5">
        {[
          { percent: false, text: "₪" },
          { percent: true, text: "%" },
        ].map((option) => (
          <button
            key={option.text}
            type="button"
            aria-pressed={isPercent === option.percent}
            onClick={() => onChange(value, option.percent)}
            className={`rounded-full px-2 py-0.5 text-[11px] font-bold transition ${
              isPercent === option.percent ? "bg-black text-cream" : "text-ink-soft hover:text-ink"
            }`}
          >
            {option.text}
          </button>
        ))}
      </span>
      <TextInput
        type="number"
        min={0}
        // Percentages stop at 100; shekels are capped against the order
        // total in `orderDiscount` instead, where the total is known.
        max={isPercent ? 100 : undefined}
        aria-label="Discount"
        value={value === 0 ? "" : String(value)}
        onChange={(e) => onChange(Number(e.target.value) || 0, isPercent)}
        className="w-16 text-right text-sm tabular-nums"
      />
    </span>
  );
}
