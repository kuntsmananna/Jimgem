"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { TextInput } from "@/components/Field";

/**
 * The order form's shared statement pieces.
 *
 * Extracted from what was one Details panel when the form went to three
 * tabs and a money rail: a group heading, a statement row, a segmented
 * toggle and the money fields are shared by the three panels and the
 * rail, and keeping separate copies visually in step by hand is exactly
 * the drift these pieces were extracted to prevent.
 *
 * They state their tones as `currentColor` and opacity rather than as
 * `text-ink-soft`, which is what lets the same piece sit on a cream panel
 * and on the black rail without the call site saying which.
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
export function GroupLabel({
  children,
  rule = true,
  icon,
}: {
  children: React.ReactNode;
  /**
   * Drop the rule where the group is a single row and its control sits
   * on the same line — there is nothing below the heading for a line to
   * separate it from, and drawn anyway it reads as an empty section.
   */
  rule?: boolean;
  /**
   * A mark before the words, for a heading that names a *thing* rather
   * than a part of the form — Delivery is the one with a truck. Here
   * rather than at the call site so the icon sits on the text's own
   * baseline grid whatever the heading is.
   */
  icon?: React.ReactNode;
}) {
  /*
   * Full strength, where the rows under it are dimmed. It had this the
   * wrong way round — the heading sat at 60% opacity above labels at 70%,
   * so the thing organising the group was fainter than its contents and
   * "The event" read as one more field beside "Guests". Small caps,
   * letterspaced and at full weight against normal-case dimmed rows is
   * the whole distinction; the rule is only a boundary and draws as a
   * hairline, not as a second announcement.
   */
  return (
    <span
      className={`text-[10.5px] font-extrabold tracking-[0.14em] uppercase ${
        icon ? "inline-flex items-center gap-1.5" : ""
      } ${rule ? "mt-1.5 mb-2.5 block border-b border-current/12 pb-2" : ""}`}
    >
      {icon}
      {children}
    </span>
  );
}

/**
 * A caption sitting directly on top of its field, with no rule.
 *
 * `GroupLabel` heads a *group* and earns its line by having several rows
 * under it; a single field wants its name and nothing else, or the panel
 * fills up with rules separating one thing from one thing.
 */
export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-[10.5px] font-extrabold tracking-[0.14em] uppercase">
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
  children,
}: {
  label: string;
  total?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex min-h-[34px] items-center justify-between gap-4 ${
        total ? "mt-1.5 border-t-[1.5px] border-current pt-2.5" : "py-1"
      }`}
    >
      <span
        /*
          Tones stated as opacity rather than as an ink colour: these rows
          are drawn on cream in the form's panels and on black in the
          money rail, and a fixed `text-ink-soft` disappears on one of
          them. Inheriting and dimming works either way round.
        */
        className={total ? "text-xs font-bold" : "text-[12.5px] opacity-70"}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * A segmented two-or-three-state pill: the options side by side in a
 * tinted track, the chosen one filled.
 *
 * There were five hand-written copies of this shape in the order form —
 * Yes/No, the discount's ₪/%, units/percent on a package line,
 * Package/Event, and the tab strip — and they had already drifted across
 * four paddings and two type sizes. `ChipSpread` is the same extraction
 * one shape up, for a list too long to sit in a track.
 *
 * Tones come from the surface, like `SheetRow` and `GroupLabel`, so one
 * of these works on a cream panel and on the black money rail without the
 * call site saying which it is on. That is what the copies could not do:
 * each had baked in either `bg-black text-cream` or `bg-cream text-ink`
 * and so only worked on one surface.
 */
export function Segmented<T extends string | boolean>({
  label,
  value,
  options,
  onChange,
  size = "sm",
}: {
  label: string;
  value: T;
  options: { value: T; text: string; icon?: React.ReactNode }[];
  onChange: (value: T) => void;
  /** `md` where the control governs the row it opens, rather than trimming it. */
  size?: "sm" | "md";
}) {
  return (
    <span
      role="group"
      aria-label={label}
      className="segmented flex shrink-0 items-center gap-0.5 rounded-full bg-current/8 p-0.5"
    >
      {options.map((option) => (
        // Silent when the segment is already the answer, like ChipSpread:
        // re-announcing the current value pushes an empty undo step.
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => { if (value !== option.value) onChange(option.value); }}
          className={`flex items-center gap-1.5 rounded-full font-bold whitespace-nowrap transition ${
            size === "md"
              ? "px-3.5 py-1 text-xs max-md:px-4 max-md:py-2"
              : "px-2.5 py-0.5 text-[11px] max-md:px-3.5 max-md:py-2 max-md:text-xs"
          } ${
            value === option.value
              ? /*
                  Two tokens rather than `currentColor` for the fill: on one
                  element `background-color: currentColor` resolves against
                  that element's *own* `color`, so setting the text colour
                  here also set the background to the same thing and the
                  chosen segment came out an empty pill. See `.segmented`
                  in globals.css for the per-surface values.
                */
                "bg-(--segmented-fill) text-(--segmented-ink)"
              : "opacity-60 hover:opacity-100"
          }`}
        >
          {option.icon}
          {option.text}
        </button>
      ))}
    </span>
  );
}

/**
 * Yes or no, for a field that is asked rather than defaulted. A checkbox
 * reads as "tick if true" and leaves "no" and "not answered yet" looking
 * identical, which matters here because kosher is a question someone is
 * asked.
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
    <Segmented
      label={label}
      value={value}
      onChange={onChange}
      options={[
        { value: false, text: "No" },
        { value: true, text: "Yes" },
      ]}
    />
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
            className="rounded-full p-0.5 opacity-60 transition hover:bg-current/10 hover:opacity-100"
          >
            <RotateCcw size={12} />
          </button>
        ) : (
          <span
            title={`Calculated from the standard rate (${money(rate)})`}
            className="text-[10px] font-bold tracking-wide opacity-50 uppercase"
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
      <Segmented
        label="Discount unit"
        value={isPercent}
        onChange={(percent) => onChange(value, percent)}
        options={[
          { value: false, text: "₪" },
          { value: true, text: "%" },
        ]}
      />
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
